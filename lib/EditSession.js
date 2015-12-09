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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uc2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlTW9kZSIsIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyIiwiRWRpdFNlc3Npb24uJHN0YXJ0V29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0TW9kZSIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZSIsIkVkaXRTZXNzaW9uLmdldExpbmVzIiwiRWRpdFNlc3Npb24uZ2V0TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0VGV4dFJhbmdlIiwiRWRpdFNlc3Npb24uaW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVtb3ZlIiwiRWRpdFNlc3Npb24udW5kb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5yZWRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnNldFVuZG9TZWxlY3QiLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uLmlzSW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVwbGFjZSIsIkVkaXRTZXNzaW9uLm1vdmVUZXh0IiwiRWRpdFNlc3Npb24uaW5kZW50Um93cyIsIkVkaXRTZXNzaW9uLm91dGRlbnRSb3dzIiwiRWRpdFNlc3Npb24uJG1vdmVMaW5lcyIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93biIsIkVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzIiwiRWRpdFNlc3Npb24uJGNsaXBSb3dUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBDb2x1bW5Ub1JvdyIsIkVkaXRTZXNzaW9uLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBSYW5nZVRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLmdldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi4kY29uc3RyYWluV3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlV3JhcERhdGEiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMuYWRkU3BsaXQiLCJFZGl0U2Vzc2lvbi4kZ2V0RGlzcGxheVRva2VucyIsIkVkaXRTZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xpbmVDb3VudCIsIkVkaXRTZXNzaW9uLmdldFJvd1dyYXBJbmRlbnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRDb2x1bW4iLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxlbmd0aCIsIkVkaXRTZXNzaW9uLiRzZXRGb250TWV0cmljcyIsIkVkaXRTZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uJGZpbmRDbG9zaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEZvbGRBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJFZGl0U2Vzc2lvbi5nZXRBbGxGb2xkcyIsIkVkaXRTZXNzaW9uLmdldEZvbGRTdHJpbmdBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZGVkUm93Q291bnQiLCJFZGl0U2Vzc2lvbi4kYWRkRm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkIiwiRWRpdFNlc3Npb24uc2V0TW9kaWZpZWQiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkcyIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGQiLCJFZGl0U2Vzc2lvbi5yZW1vdmVGb2xkcyIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGQiLCJFZGl0U2Vzc2lvbi5leHBhbmRGb2xkcyIsIkVkaXRTZXNzaW9uLnVuZm9sZCIsIkVkaXRTZXNzaW9uLmlzUm93Rm9sZGVkIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZEVuZCIsIkVkaXRTZXNzaW9uLmdldFJvd0ZvbGRTdGFydCIsIkVkaXRTZXNzaW9uLmdldEZvbGREaXNwbGF5TGluZSIsIkVkaXRTZXNzaW9uLmdldERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uJGNsb25lRm9sZERhdGEiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkIiwiRWRpdFNlc3Npb24uZ2V0Q29tbWVudEZvbGRSYW5nZSIsIkVkaXRTZXNzaW9uLmZvbGRBbGwiLCJFZGl0U2Vzc2lvbi5zZXRGb2xkU3R5bGUiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9sZGluZyIsIkVkaXRTZXNzaW9uLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJFZGl0U2Vzc2lvbi5vbkZvbGRXaWRnZXRDbGljayIsIkVkaXRTZXNzaW9uLiR0b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCIsIkVkaXRTZXNzaW9uLnVwZGF0ZUZvbGRXaWRnZXRzIl0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsaUJBQWlCLE1BQU0scUJBQXFCO09BQzVDLFFBQVEsTUFBTSxZQUFZO09BQzFCLElBQUksTUFBTSxRQUFRO09BQ2xCLFNBQVMsTUFBTSxhQUFhO09BQzVCLElBQUksTUFBTSxhQUFhO09BQ3ZCLEtBQUssTUFBTSxTQUFTO09BQ3BCLGNBQWMsTUFBTSxrQkFBa0I7T0FDdEMsbUJBQW1CLE1BQU0sdUJBQXVCO09BQ2hELGVBQWUsTUFBTSxtQkFBbUI7T0FDeEMsRUFBQyxNQUFNLEVBQUMsTUFBTSxlQUFlO09BQzdCLFlBQVksTUFBTSw2QkFBNkI7T0FFL0MsYUFBYSxNQUFNLGlCQUFpQjtBQU8zQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0Es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QU9BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRTVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNUQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDUkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUE7WUFDQUEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFN0JBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxHQUFHQSxDQUFDQTtnQkFDQUEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDWkEsQ0FBQ0EsUUFDTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUE7WUFDbkRBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1pBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2pCQSxPQUFPQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNyREEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDVkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDM0NBLENBQUNBO0lBU003QyxhQUFhQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQTtRQUM1QzhDLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDdERBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtJQUNyQkEsQ0FBQ0E7SUFTTzlDLGNBQWNBLENBQUNBLFdBQW1CQTtRQUN0QytDLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQVFPL0MsY0FBY0E7UUFDbEJnRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFPT2hELFlBQVlBLENBQUNBLFNBQWtCQSxJQUFJaUQsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFLNUVqRCxZQUFZQSxLQUFja0QsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFLbkRsRCxpQkFBaUJBLENBQUNBLENBQUNBO1FBQ3ZCbUQsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQVNPbkQsT0FBT0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBY0E7UUFDaENvRCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxPQUFPQSxJQUFJQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDbkJBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBO1FBQzVCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxHQUFHQSxJQUFJQSxJQUFJQSxlQUFlQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLEVBQUVBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ1hBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BCQSxVQUFVQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxVQUFTQSxDQUFNQTtZQUN0QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUksQ0FBQztnQkFDdEIsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUN0QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO2dCQUM5QixNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDakQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNkLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztvQkFDWCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDdEIsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7Z0JBQ2pCLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ2YsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFHZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9wRCxhQUFhQSxDQUFDQSxJQUFVQSxFQUFFQSxjQUF3QkE7UUFDdERxRCxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBRXRCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUdsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFFbkJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUN4QkEsQ0FBQ0E7UUFFREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFFcENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxREEsU0FBU0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBQy9EQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsbUJBQW1CQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDakJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLFVBQVNBLEtBQUtBLEVBQUVBLEVBQXVCQTtnQkFDakUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM1QyxDQUFDLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQzdDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVqREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBR2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDMURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO0lBQ0xBLENBQUNBO0lBR09yRCxXQUFXQTtRQUNmc0QsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVPdEQsWUFBWUE7UUFDaEJ1RCxJQUFJQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FDQUE7UUFBQUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDeEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBTU12RCxPQUFPQTtRQUNWd0QsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBT014RCxZQUFZQSxDQUFDQSxTQUFpQkE7UUFFakN5RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxLQUFLQSxTQUFTQSxJQUFJQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDL0NBLENBQUNBO0lBTU16RCxZQUFZQTtRQUNmMEQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDM0JBLENBQUNBO0lBS00xRCxhQUFhQSxDQUFDQSxVQUFrQkE7UUFFbkMyRCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxLQUFLQSxVQUFVQSxJQUFJQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsVUFBVUEsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDakRBLENBQUNBO0lBTU0zRCxhQUFhQTtRQUNoQjRELE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO0lBQzVCQSxDQUFDQTtJQU1NNUQsY0FBY0E7UUFDakI2RCxJQUFJQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDakJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDcEVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVPN0QscUJBQXFCQTtRQUN6QjhELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsSUFBSUEsQ0FBQ0E7WUFBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtRQUNoRUEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7WUFDL0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO2dCQUMzQixLQUFLLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUM5QixDQUFDLENBQUNBLENBQUNBO1FBQ0hBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQUVNOUQsYUFBYUEsQ0FBQ0EsS0FBZUE7UUFDaEMrRCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFFdkJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7WUFDOUNBLENBQUNBO1lBRURBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ25DQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtZQUNqQ0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN6REEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFFdkJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hCQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDekJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO3dCQUNUQSxLQUFLQSxDQUFDQTtvQkFDVkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3ZDQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtnQkFDekRBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQTtvQkFDakJBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRXZEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxpQkFBaUJBLENBQUNBO29CQUM3QkEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsaUJBQWlCQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFVTS9ELE9BQU9BLENBQUNBLEdBQVdBO1FBQ3RCZ0UsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDakNBLENBQUNBO0lBVU1oRSxRQUFRQSxDQUFDQSxRQUFnQkEsRUFBRUEsT0FBZUE7UUFDN0NpRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFNTWpFLFNBQVNBO1FBQ1prRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFRTWxFLFlBQVlBLENBQUNBLEtBQVlBO1FBQzVCbUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDckVBLENBQUNBO0lBVU1uRSxNQUFNQSxDQUFDQSxRQUF5Q0EsRUFBRUEsSUFBWUE7UUFDakVvRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMzQ0EsQ0FBQ0E7SUFVTXBFLE1BQU1BLENBQUNBLEtBQVlBO1FBQ3RCcUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBVU1yRSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFvQkE7UUFDM0NzRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsSUFBSUEsYUFBYUEsR0FBVUEsSUFBSUEsQ0FBQ0E7UUFDaENBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzNDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcENBLGFBQWFBO29CQUNUQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1lBQ2xFQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsU0FBU0E7b0JBQ25DLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNuQyxDQUFDLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ2JBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZCQSxhQUFhQTtZQUNUQSxJQUFJQSxDQUFDQSxXQUFXQTtZQUNoQkEsQ0FBQ0EsVUFBVUE7WUFDWEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNwREEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBVU10RSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFvQkE7UUFDM0N1RSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsSUFBSUEsYUFBYUEsR0FBVUEsSUFBSUEsQ0FBQ0E7UUFDaENBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbkNBLGFBQWFBO29CQUNUQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1lBQ25FQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN2QkEsYUFBYUE7WUFDVEEsSUFBSUEsQ0FBQ0EsV0FBV0E7WUFDaEJBLENBQUNBLFVBQVVBO1lBQ1hBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDcERBLE1BQU1BLENBQUNBLGFBQWFBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQU9PdkUsYUFBYUEsQ0FBQ0EsTUFBZUE7UUFDakN3RSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxNQUFNQSxDQUFDQTtJQUM5QkEsQ0FBQ0E7SUFFT3hFLGlCQUFpQkEsQ0FBQ0EsTUFBMENBLEVBQUVBLE1BQWVBLEVBQUVBLGFBQW9CQTtRQUN2R3lFLGtCQUFrQkEsS0FBeUJBO1lBQ3ZDQyxJQUFJQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxZQUFZQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxhQUFhQSxDQUFDQTtZQUM3RUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDckNBLENBQUNBO1FBRURELElBQUlBLEtBQUtBLEdBQXFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4REEsSUFBSUEsS0FBWUEsQ0FBQ0E7UUFDakJBLElBQUlBLEtBQXNDQSxDQUFDQTtRQUMzQ0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzdEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUMvREEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hEQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEVBLENBQUNBO2dCQUNEQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Es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QSxJQUFJQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFVQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUN2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE9BQU9BLEdBQUdBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2xEQSxPQUFPQSxHQUFHQSxPQUFPQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMxRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUN4RkEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ3BDQSxDQUFDQTtnQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BG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QUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFFN0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFEQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUzQkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDekJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO29CQUN0QkEsS0FBS0EsQ0FBQ0E7WUFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0JBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ25DQSxDQUFDQTtZQUFDQSxJQUFJ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Q0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDMURBLENBQUNBO0lBR09wRix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQ3ZEcUYsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQzlDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNB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Q3RCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLElBQUlBLEdBQUdBLEdBQUdBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUFBO2dCQUM3REEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBSTVCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNYQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFBQTtvQkFFL0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNYQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDbkRBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO3dCQUN2QkEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FDbkJBLE9BQU9BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMvQ0EsQ0FBQ0E7b0JBQUNBLElBQUlBLENBRUZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNaQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDaEVBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7b0JBRUxBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMxQ0EsQ0FBQ0E7Z0JBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBO29CQUN0Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDakNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBR0pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BFQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxD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QUFDQTtRQUNwQkEsTUFBTUEsR0FBR0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFckJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQy9CQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDeEJBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FB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QSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU10RyxlQUFlQSxDQUFDQSxHQUFXQTtRQUM5QnVHLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFTXZHLGdCQUFnQkEsQ0FBQ0EsU0FBaUJBO1FBQ3JDd0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBRXJDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFTTXhHLHNCQUFzQkEsQ0FBQ0EsU0FBaUJBO1FBQzNDeUcsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNyRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUM1REEsQ0FBQ0E7SUFRTXpHLHdCQUF3QkEsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0E7UUFDN0MwRyxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzVEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQ2xEQSxDQUFDQTtJQVNNMUcsZ0NBQWdDQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQTtRQUNyRDJHLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDM0VBLENBQUNBO0lBTU0zRyxlQUFlQSxDQUFDQSxHQUFXQTtRQUM5QjRHLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO0lBQ0xBLENBQUNBO0lBUU01RyxnQkFBZ0JBLENBQUNBLFlBQW9CQTtRQUN4QzZHLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO0lBQ3hEQSxDQUFDQTtJQUdNN0csbUJBQW1CQSxDQUFDQSxTQUFpQkEsRUFBRUEsWUFBb0JBO1FBQzlEOEcsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxTQUFTQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUN0RUEsQ0FBQ0E7SUFHTzlHLHNCQUFzQkEsQ0FBQ0EsU0FBaUJBLEVBQUVBLFlBQW9CQTtRQUNsRStHLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDekVBLENBQUNBO0lBUU0vRyx3QkFBd0JBLENBQUNBLFNBQWlCQSxFQUFFQSxZQUFvQkE7UUFDbkVnSCxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDakNBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLElBQUlBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xCQSxJQUFJQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNaQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVsQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0E7UUFDcENBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDcERBLElBQUlBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLElBQUlBLE9BQU9BLEdBQUdBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFFREEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUV6REEsT0FBT0EsR0FBR0EsSUFBSUEsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDdEJBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxH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SUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUtEN0gsV0FBV0E7UUFDUDhILElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRS9CQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUNyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUE7Z0JBQzlDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUxQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBbUJEOUgsZUFBZUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0EsRUFBRUEsSUFBWUEsRUFBRUEsUUFBbUJBO1FBQzFFK0gsUUFBUUEsR0FBR0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO1lBQ1ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBRWhCQSxJQUFJQSxRQUFRQSxHQUFHQTtZQUNYQSxHQUFHQSxFQUFFQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtTQUNyQkEsQ0FBQ0E7UUFFRkEsSUFBSUEsR0FBV0EsQ0FBQ0E7UUFDaEJBLElBQUlBLElBQVVBLENBQUNBO1FBQ2ZBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzdDQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckZBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNMQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFH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QUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0Q0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRWhCQSxJQUFJQSxZQUFZQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbkNBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO3dCQUVuREEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7d0JBQzdCQSxLQUFLQSxDQUFDQTtvQkFDVkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1BBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRXJFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakVBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHdkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV4REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURwSSxXQUFXQSxDQUFDQSxRQUFpQkE7SUFFN0JxSSxDQUFDQTtJQUVEckksUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJzSSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFFRHRJLFVBQVVBLENBQUNBLElBQVVBO1FBQ2pCdUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2xDQSxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUU5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1FBRzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNaQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNuREEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDN0RBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4Q0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbERBLENBQUNBO1FBQ0RBLElBQUlBLENBS0FBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNHQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzNDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFD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QUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN2QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDbkNBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzVFQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxDQUFDQTtZQUN2QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBO1lBQ0FBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXJCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFHckJBLE9BQU9BLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNyQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9DQSxD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QUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxNQUFNQSxDQUFDQTtZQUNYQSxXQUFXQSxHQUFHQSxXQUFXQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxD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QSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxNQUFNQSxHQUFHQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUVkQSxLQUFLQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLEtBQUtBLENBQUNBO1lBQ25DQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBSUR6SixnQkFBZ0JBLENBQUNBLFlBQVlBO1FBQ3pCMEosSUFBSUEsR0FBR0EsR0FBV0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDakRBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hDQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBRTVDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNOQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ2xEQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDdEJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBRTVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDUEEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUMvQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRDFKLGlCQUFpQkEsQ0FBQ0EsQ0FBNkNBLEVBQUVBLFdBQXdCQTtRQUNyRjJKLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBQ25CQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUN4QkEsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRW5DQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMM0osQ0FBQ0E7QUFLRCxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUU7SUFDNUMsSUFBSSxFQUFFO1FBQ0YsR0FBRyxFQUFFLFVBQVMsS0FBSztZQUNmLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUM7Z0JBQ3pCLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDbEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUM7Z0JBQ3JCLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDakIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxhQUFhLENBQUM7Z0JBQzVCLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxRQUFRLENBQUM7Z0JBQzlCLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQztZQUV6QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQztnQkFDcEIsTUFBTSxDQUFDO1lBQ1gsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNULElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLElBQUksR0FBRyxHQUFHLE9BQU8sS0FBSyxJQUFJLFFBQVEsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDO2dCQUNsRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlCLENBQUM7WUFDRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUN2QixDQUFDO1FBQ0QsR0FBRyxFQUFFO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDeEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDakIsTUFBTSxDQUFDLGFBQWEsQ0FBQztnQkFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2xCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ3RCLENBQUM7WUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELFVBQVUsRUFBRTtRQUVSLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixHQUFHLEdBQUcsR0FBRyxJQUFJLE1BQU07a0JBQ2IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksTUFBTTtrQkFDekIsR0FBRyxJQUFJLE1BQU0sQ0FBQztZQUNwQixFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO2dCQUN2QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQ0QsWUFBWSxFQUFFLE1BQU07S0FDdkI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsY0FBYSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JELFlBQVksRUFBRSxDQUFDO0tBQ2xCO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsU0FBUztZQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUU1QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUNWLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM1QixDQUFDO1FBQ0QsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxXQUFXLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFO0lBQ25DLE9BQU8sRUFBRTtRQUNMLEdBQUcsRUFBRSxVQUFTLE9BQU87WUFDakIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUV4RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztZQUN4QixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFBLENBQUMsQ0FBQztRQUNwRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELElBQUksRUFBRTtRQUNGLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN4QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFDLENBQUM7S0FDMUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtfc2lnbmFsLCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgRm9sZExpbmUgZnJvbSBcIi4vRm9sZExpbmVcIjtcbmltcG9ydCBGb2xkIGZyb20gXCIuL0ZvbGRcIjtcbmltcG9ydCBTZWxlY3Rpb24gZnJvbSBcIi4vU2VsZWN0aW9uXCI7XG5pbXBvcnQgTW9kZSBmcm9tIFwiLi9tb2RlL01vZGVcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IEVkaXRvckRvY3VtZW50IGZyb20gXCIuL0VkaXRvckRvY3VtZW50XCI7XG5pbXBvcnQgQmFja2dyb3VuZFRva2VuaXplciBmcm9tIFwiLi9CYWNrZ3JvdW5kVG9rZW5pemVyXCI7XG5pbXBvcnQgU2VhcmNoSGlnaGxpZ2h0IGZyb20gXCIuL1NlYXJjaEhpZ2hsaWdodFwiO1xuaW1wb3J0IHthc3NlcnR9IGZyb20gJy4vbGliL2Fzc2VydHMnO1xuaW1wb3J0IEJyYWNrZXRNYXRjaCBmcm9tIFwiLi9lZGl0X3Nlc3Npb24vQnJhY2tldE1hdGNoXCI7XG5pbXBvcnQgVW5kb01hbmFnZXIgZnJvbSAnLi9VbmRvTWFuYWdlcidcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gJy4vVG9rZW5JdGVyYXRvcic7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBXb3JrZXJDbGllbnQgZnJvbSBcIi4vd29ya2VyL1dvcmtlckNsaWVudFwiO1xuaW1wb3J0IExpbmVXaWRnZXQgZnJvbSAnLi9MaW5lV2lkZ2V0JztcbmltcG9ydCBMaW5lV2lkZ2V0cyBmcm9tICcuL0xpbmVXaWRnZXRzJztcblxuLy8gXCJUb2tlbnNcIlxudmFyIENIQVIgPSAxLFxuICAgIENIQVJfRVhUID0gMixcbiAgICBQTEFDRUhPTERFUl9TVEFSVCA9IDMsXG4gICAgUExBQ0VIT0xERVJfQk9EWSA9IDQsXG4gICAgUFVOQ1RVQVRJT04gPSA5LFxuICAgIFNQQUNFID0gMTAsXG4gICAgVEFCID0gMTEsXG4gICAgVEFCX1NQQUNFID0gMTI7XG5cbi8vIEZvciBldmVyeSBrZXlzdHJva2UgdGhpcyBnZXRzIGNhbGxlZCBvbmNlIHBlciBjaGFyIGluIHRoZSB3aG9sZSBkb2MhIVxuLy8gV291bGRuJ3QgaHVydCB0byBtYWtlIGl0IGEgYml0IGZhc3RlciBmb3IgYyA+PSAweDExMDBcbmZ1bmN0aW9uIGlzRnVsbFdpZHRoKGM6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmIChjIDwgMHgxMTAwKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGMgPj0gMHgxMTAwICYmIGMgPD0gMHgxMTVGIHx8XG4gICAgICAgIGMgPj0gMHgxMUEzICYmIGMgPD0gMHgxMUE3IHx8XG4gICAgICAgIGMgPj0gMHgxMUZBICYmIGMgPD0gMHgxMUZGIHx8XG4gICAgICAgIGMgPj0gMHgyMzI5ICYmIGMgPD0gMHgyMzJBIHx8XG4gICAgICAgIGMgPj0gMHgyRTgwICYmIGMgPD0gMHgyRTk5IHx8XG4gICAgICAgIGMgPj0gMHgyRTlCICYmIGMgPD0gMHgyRUYzIHx8XG4gICAgICAgIGMgPj0gMHgyRjAwICYmIGMgPD0gMHgyRkQ1IHx8XG4gICAgICAgIGMgPj0gMHgyRkYwICYmIGMgPD0gMHgyRkZCIHx8XG4gICAgICAgIGMgPj0gMHgzMDAwICYmIGMgPD0gMHgzMDNFIHx8XG4gICAgICAgIGMgPj0gMHgzMDQxICYmIGMgPD0gMHgzMDk2IHx8XG4gICAgICAgIGMgPj0gMHgzMDk5ICYmIGMgPD0gMHgzMEZGIHx8XG4gICAgICAgIGMgPj0gMHgzMTA1ICYmIGMgPD0gMHgzMTJEIHx8XG4gICAgICAgIGMgPj0gMHgzMTMxICYmIGMgPD0gMHgzMThFIHx8XG4gICAgICAgIGMgPj0gMHgzMTkwICYmIGMgPD0gMHgzMUJBIHx8XG4gICAgICAgIGMgPj0gMHgzMUMwICYmIGMgPD0gMHgzMUUzIHx8XG4gICAgICAgIGMgPj0gMHgzMUYwICYmIGMgPD0gMHgzMjFFIHx8XG4gICAgICAgIGMgPj0gMHgzMjIwICYmIGMgPD0gMHgzMjQ3IHx8XG4gICAgICAgIGMgPj0gMHgzMjUwICYmIGMgPD0gMHgzMkZFIHx8XG4gICAgICAgIGMgPj0gMHgzMzAwICYmIGMgPD0gMHg0REJGIHx8XG4gICAgICAgIGMgPj0gMHg0RTAwICYmIGMgPD0gMHhBNDhDIHx8XG4gICAgICAgIGMgPj0gMHhBNDkwICYmIGMgPD0gMHhBNEM2IHx8XG4gICAgICAgIGMgPj0gMHhBOTYwICYmIGMgPD0gMHhBOTdDIHx8XG4gICAgICAgIGMgPj0gMHhBQzAwICYmIGMgPD0gMHhEN0EzIHx8XG4gICAgICAgIGMgPj0gMHhEN0IwICYmIGMgPD0gMHhEN0M2IHx8XG4gICAgICAgIGMgPj0gMHhEN0NCICYmIGMgPD0gMHhEN0ZCIHx8XG4gICAgICAgIGMgPj0gMHhGOTAwICYmIGMgPD0gMHhGQUZGIHx8XG4gICAgICAgIGMgPj0gMHhGRTEwICYmIGMgPD0gMHhGRTE5IHx8XG4gICAgICAgIGMgPj0gMHhGRTMwICYmIGMgPD0gMHhGRTUyIHx8XG4gICAgICAgIGMgPj0gMHhGRTU0ICYmIGMgPD0gMHhGRTY2IHx8XG4gICAgICAgIGMgPj0gMHhGRTY4ICYmIGMgPD0gMHhGRTZCIHx8XG4gICAgICAgIGMgPj0gMHhGRjAxICYmIGMgPD0gMHhGRjYwIHx8XG4gICAgICAgIGMgPj0gMHhGRkUwICYmIGMgPD0gMHhGRkU2O1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFZGl0U2Vzc2lvbiBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgJGJyZWFrcG9pbnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHB1YmxpYyAkZGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSAkZnJvbnRNYXJrZXJzID0ge307XG4gICAgcHVibGljICRiYWNrTWFya2VycyA9IHt9O1xuICAgIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgICBwcml2YXRlICR1bmRvU2VsZWN0ID0gdHJ1ZTtcbiAgICBwcml2YXRlICRkZWx0YXM7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICAgIHByaXZhdGUgJGRlbHRhc0ZvbGQ7XG4gICAgcHJpdmF0ZSAkZnJvbVVuZG87XG5cbiAgICBwdWJsaWMgd2lkZ2V0TWFuYWdlcjogTGluZVdpZGdldHM7XG4gICAgcHJpdmF0ZSAkdXBkYXRlRm9sZFdpZGdldHM6IChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkZm9sZERhdGE6IEZvbGRMaW5lW107XG4gICAgcHVibGljIGZvbGRXaWRnZXRzOiBhbnlbXTtcbiAgICBwdWJsaWMgZ2V0Rm9sZFdpZGdldDogKHJvdzogbnVtYmVyKSA9PiBhbnk7XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXRSYW5nZTogKHJvdzogbnVtYmVyLCBmb3JjZU11bHRpbGluZT86IGJvb2xlYW4pID0+IFJhbmdlO1xuICAgIHB1YmxpYyBfY2hhbmdlZFdpZGdldHM6IExpbmVXaWRnZXRbXTtcblxuICAgIHB1YmxpYyBkb2M6IEVkaXRvckRvY3VtZW50O1xuICAgIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgICBwcml2YXRlICR1bmRvTWFuYWdlcjogVW5kb01hbmFnZXI7XG4gICAgcHJpdmF0ZSAkaW5mb3JtVW5kb01hbmFnZXI6IHsgY2FuY2VsOiAoKSA9PiB2b2lkOyBzY2hlZHVsZTogKCkgPT4gdm9pZCB9O1xuICAgIHB1YmxpYyBiZ1Rva2VuaXplcjogQmFja2dyb3VuZFRva2VuaXplcjtcbiAgICBwdWJsaWMgJG1vZGlmaWVkO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uOiBTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkZG9jUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICAgIHByaXZhdGUgJHNjcmVlblJvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICRyb3dMZW5ndGhDYWNoZTtcbiAgICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgJHNlYXJjaEhpZ2hsaWdodDogU2VhcmNoSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgJGFubm90YXRpb25zO1xuICAgIHByaXZhdGUgJGF1dG9OZXdMaW5lO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuICAgIHByaXZhdGUgJHVzZVdvcmtlcjtcbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vZGVzOiB7IFtwYXRoOiBzdHJpbmddOiBNb2RlIH0gPSB7fTtcblxuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgcHVibGljICRtb2RlOiBNb2RlID0gbnVsbDtcbiAgICBwcml2YXRlICRtb2RlSWQgPSBudWxsO1xuICAgIC8qKlxuICAgICAqIFRoZSB3b3JrZXIgY29ycmVzcG9uZGluZyB0byB0aGUgbW9kZSAoaS5lLiBMYW5ndWFnZSkuXG4gICAgICovXG4gICAgcHJpdmF0ZSAkd29ya2VyOiBXb3JrZXJDbGllbnQ7XG4gICAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgICBwdWJsaWMgdG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyBub25Ub2tlblJlOiBSZWdFeHA7XG4gICAgcHVibGljICRzY3JvbGxUb3AgPSAwO1xuICAgIHByaXZhdGUgJHNjcm9sbExlZnQgPSAwO1xuICAgIC8vIFdSQVBNT0RFXG4gICAgcHJpdmF0ZSAkd3JhcEFzQ29kZTtcbiAgICBwcml2YXRlICR3cmFwTGltaXQgPSA4MDtcbiAgICBwdWJsaWMgJHVzZVdyYXBNb2RlID0gZmFsc2U7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgIG1pbjogbnVsbCxcbiAgICAgICAgbWF4OiBudWxsXG4gICAgfTtcbiAgICBwdWJsaWMgJHVwZGF0aW5nO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgIHByaXZhdGUgJHN5bmNJbmZvcm1VbmRvTWFuYWdlcjogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgbWVyZ2VVbmRvRGVsdGFzOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHVzZVNvZnRUYWJzOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHRhYlNpemU6IG51bWJlcjtcbiAgICBwcml2YXRlICR3cmFwTWV0aG9kO1xuICAgIHByaXZhdGUgc2NyZWVuV2lkdGg6IG51bWJlcjtcbiAgICBwdWJsaWMgbGluZVdpZGdldHM6IExpbmVXaWRnZXRbXSA9IG51bGw7XG4gICAgcHJpdmF0ZSBsaW5lV2lkZ2V0c1dpZHRoOiBudW1iZXI7XG4gICAgcHVibGljIGxpbmVXaWRnZXRXaWR0aDogbnVtYmVyO1xuICAgIHB1YmxpYyAkZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoO1xuICAgIC8vXG4gICAgcHVibGljICR0YWdIaWdobGlnaHQ7XG4gICAgLyoqXG4gICAgICogVGhpcyBpcyBhIG1hcmtlciBpZGVudGlmaWVyLlxuICAgICAqL1xuICAgIHB1YmxpYyAkYnJhY2tldEhpZ2hsaWdodDogbnVtYmVyO1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgcmVhbGx5IGEgUmFuZ2Ugd2l0aCBhbiBhZGRlZCBtYXJrZXIgaWQuXG4gICAgICovXG4gICAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOiBSYW5nZTtcbiAgICAvKipcbiAgICAgKiBBIG51bWJlciBpcyBhIG1hcmtlciBpZGVudGlmaWVyLCBudWxsIGluZGljYXRlcyB0aGF0IG5vIHN1Y2ggbWFya2VyIGV4aXN0cy4gXG4gICAgICovXG4gICAgcHVibGljICRzZWxlY3Rpb25NYXJrZXI6IG51bWJlciA9IG51bGw7XG4gICAgcHJpdmF0ZSAkYnJhY2tldE1hdGNoZXIgPSBuZXcgQnJhY2tldE1hdGNoKHRoaXMpO1xuXG4gICAgY29uc3RydWN0b3IoZG9jOiBFZGl0b3JEb2N1bWVudCwgbW9kZT8sIGNiPzogKCkgPT4gYW55KSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhID0gW107XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5qb2luKFwiXFxuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMub24oXCJjaGFuZ2VGb2xkXCIsIHRoaXMub25DaGFuZ2VGb2xkLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLnNldERvY3VtZW50KGRvYyk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbih0aGlzKTtcblxuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIHRoaXMuc2V0TW9kZShtb2RlLCBjYik7XG4gICAgICAgIF9zaWduYWwoXCJzZXNzaW9uXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGBFZGl0U2Vzc2lvbmAgdG8gcG9pbnQgdG8gYSBuZXcgYEVkaXRvckRvY3VtZW50YC4gSWYgYSBgQmFja2dyb3VuZFRva2VuaXplcmAgZXhpc3RzLCBpdCBhbHNvIHBvaW50cyB0byBgZG9jYC5cbiAgICAgKiBAbWV0aG9kIHNldERvY3VtZW50XG4gICAgICogQHBhcmFtIGRvYyB7RWRpdG9yRG9jdW1lbnR9IFRoZSBuZXcgYEVkaXRvckRvY3VtZW50YCB0byB1c2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldERvY3VtZW50KGRvYzogRWRpdG9yRG9jdW1lbnQpOiB2b2lkIHtcbiAgICAgICAgaWYgKCEoZG9jIGluc3RhbmNlb2YgRWRpdG9yRG9jdW1lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkb2MgbXVzdCBiZSBhIEVkaXRvckRvY3VtZW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRvYykge1xuICAgICAgICAgICAgdGhpcy5kb2Mub2ZmKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZG9jID0gZG9jO1xuICAgICAgICBkb2Mub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuXG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldERvY3VtZW50KHRoaXMuZ2V0RG9jdW1lbnQoKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJlc2V0Q2FjaGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgYEVkaXRvckRvY3VtZW50YCBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuICAgICAqIEBtZXRob2QgZ2V0RG9jdW1lbnRcbiAgICAgKiBAcmV0dXJuIHtFZGl0b3JEb2N1bWVudH1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnQoKTogRWRpdG9yRG9jdW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkcmVzZXRSb3dDYWNoZVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIHJvdyB0byB3b3JrIHdpdGhcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkcmVzZXRSb3dDYWNoZShkb2NSb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWRvY1Jvdykge1xuICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlID0gW107XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGwgPSB0aGlzLiRkb2NSb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleCh0aGlzLiRkb2NSb3dDYWNoZSwgZG9jUm93KSArIDE7XG4gICAgICAgIGlmIChsID4gaSkge1xuICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0Um93Q2FjaGVJbmRleChjYWNoZUFycmF5OiBudW1iZXJbXSwgdmFsOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgbG93ID0gMDtcbiAgICAgICAgdmFyIGhpID0gY2FjaGVBcnJheS5sZW5ndGggLSAxO1xuXG4gICAgICAgIHdoaWxlIChsb3cgPD0gaGkpIHtcbiAgICAgICAgICAgIHZhciBtaWQgPSAobG93ICsgaGkpID4+IDE7XG4gICAgICAgICAgICB2YXIgYyA9IGNhY2hlQXJyYXlbbWlkXTtcblxuICAgICAgICAgICAgaWYgKHZhbCA+IGMpIHtcbiAgICAgICAgICAgICAgICBsb3cgPSBtaWQgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodmFsIDwgYykge1xuICAgICAgICAgICAgICAgIGhpID0gbWlkIC0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBtaWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbG93IC0gMTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc2V0Q2FjaGVzKCkge1xuICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgIHRoaXMuJHdyYXBEYXRhID0gW107XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUZvbGQoZSkge1xuICAgICAgICB2YXIgZm9sZCA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZShmb2xkLnN0YXJ0LnJvdyk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZShlLCBkb2M6IEVkaXRvckRvY3VtZW50KSB7XG4gICAgICAgIHZhciBkZWx0YSA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuXG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZGVsdGEucmFuZ2Uuc3RhcnQucm93KTtcblxuICAgICAgICB2YXIgcmVtb3ZlZEZvbGRzID0gdGhpcy4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSk7XG4gICAgICAgIGlmICghdGhpcy4kZnJvbVVuZG8gJiYgdGhpcy4kdW5kb01hbmFnZXIgJiYgIWRlbHRhLmlnbm9yZSkge1xuICAgICAgICAgICAgdGhpcy4kZGVsdGFzRG9jLnB1c2goZGVsdGEpO1xuICAgICAgICAgICAgaWYgKHJlbW92ZWRGb2xkcyAmJiByZW1vdmVkRm9sZHMubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkZWx0YXNGb2xkLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwicmVtb3ZlRm9sZHNcIixcbiAgICAgICAgICAgICAgICAgICAgZm9sZHM6IHJlbW92ZWRGb2xkc1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5zY2hlZHVsZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci4kdXBkYXRlT25DaGFuZ2UoZGVsdGEpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VcIiwgZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc2Vzc2lvbiB0ZXh0LlxuICAgICAqIEBtZXRob2Qgc2V0VmFsdWVcbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gcGxhY2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0VmFsdWUodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZG9jLnNldFZhbHVlKHRleHQpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8oMCwgMCk7XG5cbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG4gICAgICAgIHRoaXMuc2V0VW5kb01hbmFnZXIodGhpcy4kdW5kb01hbmFnZXIpO1xuICAgICAgICB0aGlzLmdldFVuZG9NYW5hZ2VyKCkucmVzZXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgW1tFZGl0b3JEb2N1bWVudCBgRWRpdG9yRG9jdW1lbnRgXV0gYXMgYSBzdHJpbmcuXG4gICAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICogQGFsaWFzIEVkaXRTZXNzaW9uLmdldFZhbHVlXG4gICAgKiovXG4gICAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRWRpdG9yRG9jdW1lbnQgYEVkaXRvckRvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAgICogQG1ldGhvZCBnZXRWYWx1ZVxuICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAgICoqL1xuICAgIHB1YmxpYyBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cbiAgICBwdWJsaWMgc2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6QmFja2dyb3VuZFRva2VuaXplci5nZXRTdGF0ZX1cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc3RhcnQgYXRcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGVcbiAgICAgKiovXG4gICAgcHVibGljIGdldFN0YXRlKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0U3RhdGUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgdG9rZW5pemluZyBhdCB0aGUgcm93IGluZGljYXRlZC4gUmV0dXJucyBhIGxpc3Qgb2Ygb2JqZWN0cyBvZiB0aGUgdG9rZW5pemVkIHJvd3MuXG4gICAgICogQG1ldGhvZCBnZXRUb2tlbnNcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGluZGljYXRpbmcgdGhlIHRva2VuIGF0IHRoZSBjdXJyZW50IHJvdy4gVGhlIG9iamVjdCBoYXMgdHdvIHByb3BlcnRpZXM6IGBpbmRleGAgYW5kIGBzdGFydGAuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gcmV0cmlldmUgZnJvbVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGdldFRva2VuQXQocm93OiBudW1iZXIsIGNvbHVtbj86IG51bWJlcikge1xuICAgICAgICB2YXIgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgIGlmIChjb2x1bW4gPT0gbnVsbCkge1xuICAgICAgICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgdG9rZW4uaW5kZXggPSBpO1xuICAgICAgICB0b2tlbi5zdGFydCA9IGMgLSB0b2tlbi52YWx1ZS5sZW5ndGg7XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHVuZG8gbWFuYWdlci5cbiAgICAqIEBwYXJhbSB7VW5kb01hbmFnZXJ9IHVuZG9NYW5hZ2VyIFRoZSBuZXcgdW5kbyBtYW5hZ2VyXG4gICAgKiovXG4gICAgcHVibGljIHNldFVuZG9NYW5hZ2VyKHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvTWFuYWdlciA9IHVuZG9NYW5hZ2VyO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy4kaW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICBpZiAodW5kb01hbmFnZXIpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2VsZi4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRm9sZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNGb2xkXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNGb2xkID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0RvYy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZG9jXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0RvY1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRG9jID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9NYW5hZ2VyLmV4ZWN1dGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImFjZXVwZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXJnczogW3NlbGYuJGRlbHRhcywgc2VsZl0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXJnZTogc2VsZi5tZXJnZVVuZG9EZWx0YXNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzID0gW107XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIgPSBkZWxheWVkQ2FsbCh0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogc3RhcnRzIGEgbmV3IGdyb3VwIGluIHVuZG8gaGlzdG9yeVxuICAgICAqL1xuICAgIHB1YmxpYyBtYXJrVW5kb0dyb3VwKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB1bmRvIG1hbmFnZXIuXG4gICAgKiovXG4gICAgcHVibGljIGdldFVuZG9NYW5hZ2VyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdW5kb01hbmFnZXIgfHwgdGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBmb3IgdGFicy4gSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlN0cmluZygpIHtcbiAgICAgICAgaWYgKHRoaXMuZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHN0cmluZ1JlcGVhdChcIiBcIiwgdGhpcy5nZXRUYWJTaXplKCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFwiXFx0XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAvKipcbiAgICAqIFBhc3MgYHRydWVgIHRvIGVuYWJsZSB0aGUgdXNlIG9mIHNvZnQgdGFicy4gU29mdCB0YWJzIG1lYW5zIHlvdSdyZSB1c2luZyBzcGFjZXMgaW5zdGVhZCBvZiB0aGUgdGFiIGNoYXJhY3RlciAoYCdcXHQnYCkuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVNvZnRUYWJzIFZhbHVlIGluZGljYXRpbmcgd2hldGhlciBvciBub3QgdG8gdXNlIHNvZnQgdGFic1xuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlU29mdFRhYnModXNlU29mdFRhYnM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ1c2VTb2Z0VGFic1wiLCB1c2VTb2Z0VGFicyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBzb2Z0IHRhYnMgYXJlIGJlaW5nIHVzZWQsIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgcHVibGljIGdldFVzZVNvZnRUYWJzKCk6IGJvb2xlYW4ge1xuICAgICAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAhdGhpcy4kbW9kZS4kaW5kZW50V2l0aFRhYnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXQgdGhlIG51bWJlciBvZiBzcGFjZXMgdGhhdCBkZWZpbmUgYSBzb2Z0IHRhYi5cbiAgICAqIEZvciBleGFtcGxlLCBwYXNzaW5nIGluIGA0YCB0cmFuc2Zvcm1zIHRoZSBzb2Z0IHRhYnMgdG8gYmUgZXF1aXZhbGVudCB0byBmb3VyIHNwYWNlcy5cbiAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYGNoYW5nZVRhYlNpemVgIGV2ZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHRhYlNpemUgVGhlIG5ldyB0YWIgc2l6ZVxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VGFiU2l6ZSh0YWJTaXplOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ0YWJTaXplXCIsIHRhYlNpemUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VGFiU2l6ZSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBjaGFyYWN0ZXIgYXQgdGhlIHBvc2l0aW9uIGlzIGEgc29mdCB0YWIuXG4gICAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHRvIGNoZWNrXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgaXNUYWJTdG9wKHBvc2l0aW9uOiB7IGNvbHVtbjogbnVtYmVyIH0pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmIChwb3NpdGlvbi5jb2x1bW4gJSB0aGlzLiR0YWJTaXplID09PSAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLlxuICAgICpcbiAgICAqIElmIG92ZXJ3cml0ZXMgaXMgZW5hYmxlZCwgYW55IHRleHQgeW91IGVudGVyIHdpbGwgdHlwZSBvdmVyIGFueSB0ZXh0IGFmdGVyIGl0LiBJZiB0aGUgdmFsdWUgb2YgYG92ZXJ3cml0ZWAgY2hhbmdlcywgdGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYGNoYW5nZU92ZXJ3cml0ZWAgZXZlbnQuXG4gICAgKlxuICAgICogQHBhcmFtIHtCb29sZWFufSBvdmVyd3JpdGUgRGVmaW5lcyB3aGV0aGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlc1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJvdmVyd3JpdGVcIiwgb3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIG92ZXJ3cml0ZXMgYXJlIGVuYWJsZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRPdmVyd3JpdGUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRvdmVyd3JpdGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAqKi9cbiAgICBwdWJsaWMgdG9nZ2xlT3ZlcndyaXRlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE92ZXJ3cml0ZSghdGhpcy4kb3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGBjbGFzc05hbWVgIHRvIHRoZSBgcm93YCwgdG8gYmUgdXNlZCBmb3IgQ1NTIHN0eWxpbmdzIGFuZCB3aGF0bm90LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIFRoZSBjbGFzcyB0byBhZGRcbiAgICAgKi9cbiAgICBwdWJsaWMgYWRkR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLiRkZWNvcmF0aW9uc1tyb3ddKSB7XG4gICAgICAgICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddICs9IFwiIFwiICsgY2xhc3NOYW1lO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGBjbGFzc05hbWVgIGZyb20gdGhlIGByb3dgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIFRoZSBjbGFzcyB0byBhZGRcbiAgICAgKi9cbiAgICBwdWJsaWMgcmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9ICh0aGlzLiRkZWNvcmF0aW9uc1tyb3ddIHx8IFwiXCIpLnJlcGxhY2UoXCIgXCIgKyBjbGFzc05hbWUsIFwiXCIpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gYXJyYXkgb2YgbnVtYmVycywgaW5kaWNhdGluZyB3aGljaCByb3dzIGhhdmUgYnJlYWtwb2ludHMuXG4gICAgKiBAcmV0dXJucyB7W051bWJlcl19XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRCcmVha3BvaW50cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyZWFrcG9pbnRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gZXZlcnkgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gcm93cyBBbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludHMocm93czogbnVtYmVyW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLiRicmVha3BvaW50c1tyb3dzW2ldXSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgYWxsIGJyZWFrcG9pbnRzIG9uIHRoZSByb3dzLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgQ2xhc3Mgb2YgdGhlIGJyZWFrcG9pbnRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludChyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkZHMgYSBuZXcgbWFya2VyIHRvIHRoZSBnaXZlbiBgUmFuZ2VgLiBJZiBgaW5Gcm9udGAgaXMgYHRydWVgLCBhIGZyb250IG1hcmtlciBpcyBkZWZpbmVkLCBhbmQgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBmaXJlczsgb3RoZXJ3aXNlLCB0aGUgYCdjaGFuZ2VCYWNrTWFya2VyJ2AgZXZlbnQgZmlyZXMuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGF6eiBTZXQgdGhlIENTUyBjbGFzcyBmb3IgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtGdW5jdGlvbiB8IFN0cmluZ30gdHlwZSBJZGVudGlmeSB0aGUgdHlwZSBvZiB0aGUgbWFya2VyLlxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogc3RyaW5nLCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgLy8gRklYTUU6IE5lZWQgbW9yZSB0eXBlIHNhZmV0eSBoZXJlLlxuICAgICAgICB2YXIgbWFya2VyID0ge1xuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgICAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICAgICAgICBjbGF6ejogY2xhenosXG4gICAgICAgICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICAgICAgICBpZDogaWRcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG1hcmtlciBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGFkZGVkIG1hcmtlclxuICAgICAqKi9cbiAgICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyLCBpbkZyb250Pykge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG4gICAgICAgIG1hcmtlci5pZCA9IGlkO1xuICAgICAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIHRoZSBtYXJrZXIgd2l0aCB0aGUgc3BlY2lmaWVkIElELiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC4gSWYgdGhlIG1hcmtlciB3YXMgaW4gdGhlIGJhY2ssIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgbWFya2VyID0gdGhpcy4kZnJvbnRNYXJrZXJzW21hcmtlcklkXSB8fCB0aGlzLiRiYWNrTWFya2Vyc1ttYXJrZXJJZF07XG4gICAgICAgIGlmICghbWFya2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICAgICAgaWYgKG1hcmtlcikge1xuICAgICAgICAgICAgZGVsZXRlIChtYXJrZXJzW21hcmtlcklkXSk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwobWFya2VyLmluRnJvbnQgPyBcImNoYW5nZUZyb250TWFya2VyXCIgOiBcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgSURzIG9mIGFsbCB0aGUgbWFya2VycywgZWl0aGVyIGZyb250IG9yIGJhY2suXG4gICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluRnJvbnQgSWYgYHRydWVgLCBpbmRpY2F0ZXMgeW91IG9ubHkgd2FudCBmcm9udCBtYXJrZXJzOyBgZmFsc2VgIGluZGljYXRlcyBvbmx5IGJhY2sgbWFya2Vyc1xuICAgICpcbiAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TWFya2VycyhpbkZyb250OiBib29sZWFuKSB7XG4gICAgICAgIHJldHVybiBpbkZyb250ID8gdGhpcy4kZnJvbnRNYXJrZXJzIDogdGhpcy4kYmFja01hcmtlcnM7XG4gICAgfVxuXG4gICAgcHVibGljIGhpZ2hsaWdodChyZTogUmVnRXhwKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2VhcmNoSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgaGlnaGxpZ2h0ID0gbmV3IFNlYXJjaEhpZ2hsaWdodChudWxsLCBcImFjZV9zZWxlY3RlZC13b3JkXCIsIFwidGV4dFwiKTtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodCA9IHRoaXMuYWRkRHluYW1pY01hcmtlcihoaWdobGlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodC5zZXRSZWdleHAocmUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgaGlnaGxpZ2h0TGluZXMoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGNsYXp6OiBzdHJpbmcgPSBcImFjZV9zdGVwXCIsIGluRnJvbnQ/OiBib29sZWFuKTogUmFuZ2Uge1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0Um93LCAwLCBlbmRSb3csIEluZmluaXR5KTtcbiAgICAgICAgcmFuZ2UubWFya2VySWQgPSB0aGlzLmFkZE1hcmtlcihyYW5nZSwgY2xhenosIFwiZnVsbExpbmVcIiwgaW5Gcm9udCk7XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEVycm9yOlxuICAgICAqICB7XG4gICAgICogICAgcm93OiAxMixcbiAgICAgKiAgICBjb2x1bW46IDIsIC8vY2FuIGJlIHVuZGVmaW5lZFxuICAgICAqICAgIHRleHQ6IFwiTWlzc2luZyBhcmd1bWVudFwiLFxuICAgICAqICAgIHR5cGU6IFwiZXJyb3JcIiAvLyBvciBcIndhcm5pbmdcIiBvciBcImluZm9cIlxuICAgICAqICB9XG4gICAgICovXG4gICAgLyoqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBmdW5jdGlvbnMgZW1pdHMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQSBsaXN0IG9mIGFubm90YXRpb25zXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucykge1xuICAgICAgICB0aGlzLiRhbm5vdGF0aW9ucyA9IGFubm90YXRpb25zO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFubm90YXRpb25zIHx8IFtdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFycyBhbGwgdGhlIGFubm90YXRpb25zIGZvciB0aGlzIHNlc3Npb24uXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIHRyaWdnZXJzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAgKiBUaGlzIGlzIGNhbGxlZCBieSB0aGUgbGFuZ3VhZ2UgbW9kZXMgd2hlbiB0aGUgd29ya2VyIHRlcm1pbmF0ZXMuXG4gICAgICovXG4gICAgcHVibGljIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IHRleHQubWF0Y2goL14uKj8oXFxyP1xcbikvbSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBtYXRjaFsxXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gXCJcXG5cIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdGFydGluZyByb3cgYW5kIGNvbHVtbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgYFJhbmdlYCBvZiB0aGUgZmlyc3Qgd29yZCBib3VuZGFyeSBpdCBmaW5kcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgbGluZTogc3RyaW5nID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGluVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKGNvbHVtbiA+IDApXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4gLSAxKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmICghaW5Ub2tlbilcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbikubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoaW5Ub2tlbilcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMudG9rZW5SZTtcbiAgICAgICAgZWxzZSBpZiAoL15cXHMrJC8udGVzdChsaW5lLnNsaWNlKGNvbHVtbiAtIDEsIGNvbHVtbiArIDEpKSlcbiAgICAgICAgICAgIHZhciByZSA9IC9cXHMvO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLm5vblRva2VuUmU7XG5cbiAgICAgICAgdmFyIHN0YXJ0ID0gY29sdW1uO1xuICAgICAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgc3RhcnQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdoaWxlIChzdGFydCA+PSAwICYmIGxpbmUuY2hhckF0KHN0YXJ0KS5tYXRjaChyZSkpO1xuICAgICAgICAgICAgc3RhcnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbmQgPSBjb2x1bW47XG4gICAgICAgIHdoaWxlIChlbmQgPCBsaW5lLmxlbmd0aCAmJiBsaW5lLmNoYXJBdChlbmQpLm1hdGNoKHJlKSkge1xuICAgICAgICAgICAgZW5kKys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvdywgc3RhcnQsIHJvdywgZW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdldHMgdGhlIHJhbmdlIG9mIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBzdGFydCBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAqXG4gICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QVdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHdvcmRSYW5nZS5lbmQucm93KTtcblxuICAgICAgICB3aGlsZSAobGluZS5jaGFyQXQod29yZFJhbmdlLmVuZC5jb2x1bW4pLm1hdGNoKC9bIFxcdF0vKSkge1xuICAgICAgICAgICAgd29yZFJhbmdlLmVuZC5jb2x1bW4gKz0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB3b3JkUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRvckRvY3VtZW50LnNldE5ld0xpbmVNb2RlLmRlc2N9XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gbmV3TGluZU1vZGUgezpFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5wYXJhbX1cbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbmV3IGxpbmUgbW9kZS5cbiAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgKiBAcmVsYXRlZCBFZGl0b3JEb2N1bWVudC5nZXROZXdMaW5lTW9kZVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0TmV3TGluZU1vZGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIGlmIHlvdSB3YW50IHRvIHVzZSBhIHdvcmtlciBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVdvcmtlciBTZXQgdG8gYHRydWVgIHRvIHVzZSBhIHdvcmtlclxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdvcmtlcih1c2VXb3JrZXI6IGJvb2xlYW4pIHsgdGhpcy5zZXRPcHRpb24oXCJ1c2VXb3JrZXJcIiwgdXNlV29ya2VyKTsgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3b3JrZXJzIGFyZSBiZWluZyB1c2VkLlxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0VXNlV29ya2VyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy4kdXNlV29ya2VyOyB9XG5cbiAgICAvKipcbiAgICAqIFJlbG9hZHMgYWxsIHRoZSB0b2tlbnMgb24gdGhlIGN1cnJlbnQgc2Vzc2lvbi4gVGhpcyBmdW5jdGlvbiBjYWxscyBbW0JhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgYEJhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgKClgXV0gdG8gYWxsIHRoZSByb3dzOyBpdCBhbHNvIGVtaXRzIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50LlxuICAgICoqL1xuICAgIHByaXZhdGUgb25SZWxvYWRUb2tlbml6ZXIoZSkge1xuICAgICAgICB2YXIgcm93cyA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydChyb3dzLmZpcnN0KTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgKiBTZXRzIGEgbmV3IHRleHQgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LiBJZiBhIFtbQmFja2dyb3VuZFRva2VuaXplciBgQmFja2dyb3VuZFRva2VuaXplcmBdXSBpcyBzZXQsIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50IGlzIGFsc28gZW1pdHRlZC5cbiAgICAqIEBwYXJhbSB7VGV4dE1vZGV9IG1vZGUgU2V0IGEgbmV3IHRleHQgbW9kZVxuICAgICogQHBhcmFtIHtjYn0gb3B0aW9uYWwgY2FsbGJhY2tcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRNb2RlKG1vZGUsIGNiPzogKCkgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIGlmIChtb2RlICYmIHR5cGVvZiBtb2RlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBpZiAobW9kZS5nZXRUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKG1vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBtb2RlO1xuICAgICAgICAgICAgdmFyIHBhdGggPSBvcHRpb25zLnBhdGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBwYXRoID0gbW9kZSB8fCBcImFjZS9tb2RlL3RleHRcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoaXMgaXMgbmVlZGVkIGlmIGFjZSBpc24ndCBvbiByZXF1aXJlIHBhdGggKGUuZyB0ZXN0cyBpbiBub2RlKVxuICAgICAgICBpZiAoIXRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSkge1xuICAgICAgICAgICAgdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdID0gbmV3IE1vZGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRtb2Rlc1twYXRoXSAmJiAhb3B0aW9ucykge1xuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gbG9hZCBvbiBkZW1hbmRcbiAgICAgICAgdGhpcy4kbW9kZUlkID0gcGF0aDtcbiAgICAgICAgbG9hZE1vZHVsZShbXCJtb2RlXCIsIHBhdGhdLCBmdW5jdGlvbihtOiBhbnkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRtb2RlSWQgIT09IHBhdGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiICYmIGNiKCk7XG4gICAgICAgICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICAgICAgICBpZiAobSAmJiBtLk1vZGUpIHtcbiAgICAgICAgICAgICAgICBtID0gbmV3IG0uTW9kZShvcHRpb25zKTtcbiAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbW9kZXNbcGF0aF0gPSBtO1xuICAgICAgICAgICAgICAgICAgICBtLiRpZCA9IHBhdGg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZShtKTtcbiAgICAgICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIHNldCBtb2RlIHRvIHRleHQgdW50aWwgbG9hZGluZyBpcyBmaW5pc2hlZFxuICAgICAgICBpZiAoIXRoaXMuJG1vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0sIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlKG1vZGU6IE1vZGUsICRpc1BsYWNlaG9sZGVyPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAoISRpc1BsYWNlaG9sZGVyKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RlSWQgPSBtb2RlLiRpZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4kbW9kZSA9PT0gbW9kZSkge1xuICAgICAgICAgICAgLy8gTm90aGluZyB0byBkby4gQmUgaWRlbXBvdGVudC5cbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG1vZGUgPSBtb2RlO1xuXG4gICAgICAgIC8vIFRPRE86IFdvdWxkbid0IGl0IG1ha2UgbW9yZSBzZW5zZSB0byBzdG9wIHRoZSB3b3JrZXIsIHRoZW4gY2hhbmdlIHRoZSBtb2RlP1xuICAgICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbml6ZXIgPSBtb2RlLmdldFRva2VuaXplcigpO1xuXG4gICAgICAgIGlmICh0b2tlbml6ZXJbJ2FkZEV2ZW50TGlzdGVuZXInXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YXIgb25SZWxvYWRUb2tlbml6ZXIgPSB0aGlzLm9uUmVsb2FkVG9rZW5pemVyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0b2tlbml6ZXJbJ2FkZEV2ZW50TGlzdGVuZXInXShcInVwZGF0ZVwiLCBvblJlbG9hZFRva2VuaXplcik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIgPSBuZXcgQmFja2dyb3VuZFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIub24oXCJ1cGRhdGVcIiwgZnVuY3Rpb24oZXZlbnQsIGJnOiBCYWNrZ3JvdW5kVG9rZW5pemVyKSB7XG4gICAgICAgICAgICAgICAgX3NlbGYuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBldmVudCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0VG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldERvY3VtZW50KHRoaXMuZ2V0RG9jdW1lbnQoKSk7XG5cbiAgICAgICAgdGhpcy50b2tlblJlID0gbW9kZS50b2tlblJlO1xuICAgICAgICB0aGlzLm5vblRva2VuUmUgPSBtb2RlLm5vblRva2VuUmU7XG5cblxuICAgICAgICBpZiAoISRpc1BsYWNlaG9sZGVyKSB7XG4gICAgICAgICAgICB0aGlzLiRvcHRpb25zLndyYXBNZXRob2Quc2V0LmNhbGwodGhpcywgdGhpcy4kd3JhcE1ldGhvZCk7XG4gICAgICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUuZm9sZGluZ1J1bGVzKTtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpIHtcbiAgICAgICAgaWYgKHRoaXMuJHdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyLnRlcm1pbmF0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICAgKiBAcmV0dXJucyB7VGV4dE1vZGV9IFRoZSBjdXJyZW50IHRleHQgbW9kZVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsVG9wID09PSBzY3JvbGxUb3AgfHwgaXNOYU4oc2Nyb2xsVG9wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgdG9wbW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbFRvcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtTZXRzIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdH1cbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAgICAgLy8gc2Nyb2xsTGVmdCA9IE1hdGgucm91bmQoc2Nyb2xsTGVmdCk7XG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxMZWZ0ID09PSBzY3JvbGxMZWZ0IHx8IGlzTmFOKHNjcm9sbExlZnQpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJHNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHNjcm9sbExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsTGVmdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRjb21wdXRlV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGluZVdpZGdldE1heFdpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzV2lkdGggIT0gbnVsbCkgcmV0dXJuIHRoaXMubGluZVdpZGdldHNXaWR0aDtcbiAgICAgICAgdmFyIHdpZHRoID0gMDtcbiAgICAgICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5saW5lV2lkZ2V0V2lkdGggPSB3aWR0aDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy4kbW9kaWZpZWQgfHwgZm9yY2UpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoID0gdGhpcy4kd3JhcExpbWl0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICAgICAgdmFyIGNhY2hlID0gdGhpcy4kcm93TGVuZ3RoQ2FjaGU7XG4gICAgICAgICAgICB2YXIgbG9uZ2VzdFNjcmVlbkxpbmUgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRJbmRleCA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXhdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB2YXIgbGVuID0gbGluZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+PSBsZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID09IG51bGwpXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID4gbG9uZ2VzdFNjcmVlbkxpbmUpXG4gICAgICAgICAgICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgdmVyYmF0aW0gY29weSBvZiB0aGUgZ2l2ZW4gbGluZSBhcyBpdCBpcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtbU3RyaW5nXX1cbiAgICAgKlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiByb3dzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkVkaXRvckRvY3VtZW50LmdldFRleHRSYW5nZS5kZXNjfVxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSB0byB3b3JrIHdpdGhcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IFJhbmdlKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB7cm93LCBjb2x1bW59IHRvIHN0YXJ0IGluc2VydGluZyBhdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBpbnNlcnQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlbW92ZVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQucmVtb3ZlXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIHJlbW92ZShyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3QgW0lmIGB0cnVlYCwgZG9lc24ndCBzZWxlY3QgdGhlIHJhbmdlIG9mIHdoZXJlIHRoZSBjaGFuZ2Ugb2NjdXJlZF17OiAjZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSBkZWx0YXMubGVuZ3RoIC0gMTsgaSAhPSAtMTsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLnJldmVydERlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgdHJ1ZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbHRhLmRlbHRhcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGREZWx0YSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGREZWx0YS5mb2xkcyk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZS1pbXBsZW1lbnRzIGEgcHJldmlvdXNseSB1bmRvbmUgY2hhbmdlIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3Qgezpkb250U2VsZWN0fVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgcmVkb0NoYW5nZXMoZGVsdGFzLCBkb250U2VsZWN0PzogYm9vbGVhbikge1xuICAgICAgICBpZiAoIWRlbHRhcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSB0cnVlO1xuICAgICAgICB2YXIgbGFzdFVuZG9SYW5nZTogUmFuZ2UgPSBudWxsO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvYy5hcHBseURlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgZmFsc2UsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgcmV0dXJuIGxhc3RVbmRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlcyBvciBkaXNhYmxlcyBoaWdobGlnaHRpbmcgb2YgdGhlIHJhbmdlIHdoZXJlIGFuIHVuZG8gb2NjdXJyZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgSWYgYHRydWVgLCBzZWxlY3RzIHRoZSByYW5nZSBvZiB0aGUgcmVpbnNlcnRlZCBjaGFuZ2VcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVbmRvU2VsZWN0KGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ID0gZW5hYmxlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBmdW5jdGlvbiBpc0luc2VydChkZWx0YTogeyBhY3Rpb246IHN0cmluZyB9KSB7XG4gICAgICAgICAgICB2YXIgaW5zZXJ0ID0gZGVsdGEuYWN0aW9uID09PSBcImluc2VydFRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0TGluZXNcIjtcbiAgICAgICAgICAgIHJldHVybiBpc1VuZG8gPyAhaW5zZXJ0IDogaW5zZXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgdmFyIHBvaW50OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5lbmQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoZGVsdGEucmFuZ2UuZW5kLnJvdywgZGVsdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgICAgIC8vIElmIHRydWUsIG1lcmdlIHRoZSByYW5nZXMuXG4gICAgICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5lbmQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbXAgPSBsYXN0VW5kb1JhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQobGFzdFVuZG9SYW5nZS5lbmQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAgICpcbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlcGxhY2VcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byB1c2UgYXMgYSByZXBsYWNlbWVudFxuICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbmFsIHJvdyBhbmQgY29sdW1uLCBsaWtlIHRoaXM6XG4gICAgKiBgYGBcbiAgICAqIHtyb3c6IGVuZFJvdywgY29sdW1uOiAwfVxuICAgICogYGBgXG4gICAgKiBJZiB0aGUgdGV4dCBhbmQgcmFuZ2UgYXJlIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLnN0YXJ0YCB2YWx1ZS5cbiAgICAqIElmIHRoZSB0ZXh0IGlzIHRoZSBleGFjdCBzYW1lIGFzIHdoYXQgY3VycmVudGx5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5lbmRgIHZhbHVlLlxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQucmVwbGFjZVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiAgYGBganNvblxuICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiAgYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICogQHJldHVybnMge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlOiBSYW5nZSwgdG9Qb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgY29weSkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciByb3dEaWZmOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICAgICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgICAgICBpZiAoIWNvcHkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZyb21SYW5nZSk7XG4gICAgICAgICAgICByb3dEaWZmID0gZnJvbVJhbmdlLnN0YXJ0LnJvdyAtIGZyb21SYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgY29sRGlmZiA9IHJvd0RpZmYgPyAtZnJvbVJhbmdlLmVuZC5jb2x1bW4gOiBmcm9tUmFuZ2Uuc3RhcnQuY29sdW1uIC0gZnJvbVJhbmdlLmVuZC5jb2x1bW47XG4gICAgICAgICAgICBpZiAoY29sRGlmZikge1xuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICB0b1JhbmdlLnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKHguc3RhcnQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICB4LmVuZC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0b1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAgICpcbiAgICAqIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBlbmRSb3cgRW5kaW5nIHJvd1xuICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgaW5kZW50U3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8PSBlbmRSb3c7IHJvdysrKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnQoeyByb3c6IHJvdywgY29sdW1uOiAwIH0sIGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBPdXRkZW50cyBhbGwgdGhlIHJvd3MgZGVmaW5lZCBieSB0aGUgYHN0YXJ0YCBhbmQgYGVuZGAgcHJvcGVydGllcyBvZiBgcmFuZ2VgLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSByYW5nZSBvZiByb3dzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd1JhbmdlLnN0YXJ0LnJvdzsgaSA8PSByb3dSYW5nZS5lbmQucm93OyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKGkpO1xuXG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNpemU7ICsrailcbiAgICAgICAgICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGlmIChqIDwgc2l6ZSAmJiBsaW5lLmNoYXJBdChqKSA9PSAnXFx0Jykge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGogKyAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkbW92ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZGlyOiBudW1iZXIpIHtcbiAgICAgICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IDApIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgICAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGluZXMgPSBkaXIgPT0gMFxuICAgICAgICAgICAgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdylcbiAgICAgICAgICAgIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB0aGlzLmRvYy5pbnNlcnRMaW5lcyhmaXJzdFJvdyArIGRpZmYsIGxpbmVzKTtcbiAgICAgICAgZm9sZHMubGVuZ3RoICYmIHRoaXMuYWRkRm9sZHMoZm9sZHMpO1xuICAgICAgICByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIHVwXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgdXBcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBtb3ZlTGluZXNVcChmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgZG93biBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgZG93blxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEdXBsaWNhdGVzIGFsbCB0aGUgdGV4dCBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IFJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBkdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAwKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBSb3dUb0RvY3VtZW50KHJvdykge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4ocm93LCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRjbGlwQ29sdW1uVG9Sb3cocm93LCBjb2x1bW4pIHtcbiAgICAgICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgcmV0dXJuIE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3cgPCAwKSB7XG4gICAgICAgICAgICByb3cgPSAwO1xuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gbGVuIC0gMTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbiAtIDEpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm93OiByb3csXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkY2xpcFJhbmdlVG9Eb2N1bWVudChyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCAwKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSAwO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgPiBsZW4pIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBsZW47XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4pLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHdoZXRoZXIgb3Igbm90IGxpbmUgd3JhcHBpbmcgaXMgZW5hYmxlZC4gSWYgYHVzZVdyYXBNb2RlYCBpcyBkaWZmZXJlbnQgdGhhbiB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV3JhcE1vZGUgRW5hYmxlIChvciBkaXNhYmxlKSB3cmFwIG1vZGVcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdyYXBNb2RlKHVzZVdyYXBNb2RlOiBib29sZWFuKSB7XG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAhPSB0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kdXNlV3JhcE1vZGUgPSB1c2VXcmFwTW9kZTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG5cbiAgICAgICAgICAgIC8vIElmIHdyYXBNb2RlIGlzIGFjdGl2YWVkLCB0aGUgd3JhcERhdGEgYXJyYXkgaGFzIHRvIGJlIGluaXRpYWxpemVkLlxuICAgICAgICAgICAgaWYgKHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBBcnJheTxudW1iZXJbXT4obGVuKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCBsZW4gLSAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHdyYXAgbW9kZSBpcyBiZWluZyB1c2VkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGdldFVzZVdyYXBNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgfVxuXG4gICAgLy8gQWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gbW92ZSBmcmVlbHkgYmV0d2VlbiBtaW4gYW5kIG1heC4gRWl0aGVyXG4gICAgLy8gcGFyYW1ldGVyIGNhbiBiZSBudWxsIHRvIGFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIGJlIHVuY29uc3RyYWluZWRcbiAgICAvLyBpbiB0aGF0IGRpcmVjdGlvbi4gT3Igc2V0IGJvdGggcGFyYW1ldGVycyB0byB0aGUgc2FtZSBudW1iZXIgdG8gcGluXG4gICAgLy8gdGhlIGxpbWl0IHRvIHRoYXQgdmFsdWUuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYm91bmRhcmllcyBvZiB3cmFwLiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0V3JhcExpbWl0UmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4gIT09IG1pbiB8fCB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXggIT09IG1heCkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgICAgICAgICAgbWluOiBtaW4sXG4gICAgICAgICAgICAgICAgbWF4OiBtYXhcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSByZWNhbGN1bGF0aW9uIG9mIHRoZSB3cmFwIGxpbWl0XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlc2lyZWRMaW1pdCBUaGUgbmV3IHdyYXAgbGltaXRcbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICpcbiAgICAqIEBwcml2YXRlXG4gICAgKiovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgICAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICAgICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcExpbWl0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbnN0cmFpbldyYXBMaW1pdCh3cmFwTGltaXQ6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG1pbilcbiAgICAgICAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWF4KG1pbiwgd3JhcExpbWl0KTtcblxuICAgICAgICBpZiAobWF4KVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5taW4obWF4LCB3cmFwTGltaXQpO1xuXG4gICAgICAgIHJldHVybiB3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB3cmFwIGxpbWl0LlxuICAgICogQHJldHVybnMge051bWJlcn0gVGhlIHdyYXAgbGltaXQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbGluZSBsZW5ndGggZm9yIHNvZnQgd3JhcCBpbiB0aGUgZWRpdG9yLiBMaW5lcyB3aWxsIGJyZWFrXG4gICAgICogIGF0IGEgbWluaW11bSBvZiB0aGUgZ2l2ZW4gbGVuZ3RoIG1pbnVzIDIwIGNoYXJzIGFuZCBhdCBhIG1heGltdW1cbiAgICAgKiAgb2YgdGhlIGdpdmVuIG51bWJlciBvZiBjaGFycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGltaXQgVGhlIG1heGltdW0gbGluZSBsZW5ndGggaW4gY2hhcnMsIGZvciBzb2Z0IHdyYXBwaW5nIGxpbmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0V3JhcExpbWl0KGxpbWl0KSB7XG4gICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UobGltaXQsIGxpbWl0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IHRoYXQgZGVmaW5lcyB0aGUgbWluaW11bSBhbmQgbWF4aW11bSBvZiB0aGUgd3JhcCBsaW1pdDsgaXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAqXG4gICAgKiAgICAgeyBtaW46IHdyYXBMaW1pdFJhbmdlX21pbiwgbWF4OiB3cmFwTGltaXRSYW5nZV9tYXggfVxuICAgICpcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAgICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgICAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICAgICAgdmFyIGxlbjtcbiAgICAgICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGVuID0gZS5kYXRhLmxpbmVzID8gZS5kYXRhLmxpbmVzLmxlbmd0aCA6IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbiA9IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgaWYgKGxlbiAhPSAwKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzW3VzZVdyYXBNb2RlID8gXCIkd3JhcERhdGFcIiA6IFwiJHJvd0xlbmd0aENhY2hlXCJdLnNwbGljZShmaXJzdFJvdywgbGVuKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGVuZC5yb3csIGVuZC5jb2x1bW4sIHN0YXJ0LmNvbHVtbiAtIGVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVCZWZvcmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lQmVmb3JlICYmIGZvbGRMaW5lQmVmb3JlICE9PSBmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmVCZWZvcmUubWVyZ2UoZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZUJlZm9yZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBlbmQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMCk7XG4gICAgICAgICAgICAgICAgdmFyIGFyciA9IHVzZVdyYXBNb2RlID8gdGhpcy4kd3JhcERhdGEgOiB0aGlzLiRyb3dMZW5ndGhDYWNoZVxuICAgICAgICAgICAgICAgIGFyci5zcGxpY2UuYXBwbHkoYXJyLCBhcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHNvbWUgbmV3IGxpbmUgaXMgYWRkZWQgaW5zaWRlIG9mIGEgZm9sZExpbmUsIHRoZW4gc3BsaXRcbiAgICAgICAgICAgICAgICAvLyB0aGUgZm9sZCBsaW5lIHVwLlxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lLnJhbmdlLmNvbXBhcmVJbnNpZGUoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIC8vIEluc2lkZSBvZiB0aGUgZm9sZExpbmUgcmFuZ2UuIE5lZWQgdG8gc3BsaXQgc3R1ZmYgdXAuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChzdGFydC5yb3csIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mcm9udCBvZiB0aGUgZm9sZExpbmUgYnV0IHNhbWUgcm93LiBOZWVkIHRvIHNoaWZ0IGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90aGluZyB0byBkbyBpZiB0aGUgaW5zZXJ0IGlzIGFmdGVyIHRoZSBmb2xkTGluZS5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWFsaWduIGZvbGRzLiBFLmcuIGlmIHlvdSBhZGQgc29tZSBuZXcgY2hhcnMgYmVmb3JlIGEgZm9sZCwgdGhlXG4gICAgICAgICAgICAvLyBmb2xkIHNob3VsZCBcIm1vdmVcIiB0byB0aGUgcmlnaHQuXG4gICAgICAgICAgICBsZW4gPSBNYXRoLmFicyhlLmRhdGEucmFuZ2Uuc3RhcnQuY29sdW1uIC0gZS5kYXRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgZm9sZHMgaW4gdGhlIGNoYW5nZSByYW5nZSBhbmQgcmVtb3ZlIHRoZW0uXG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICBsZW4gPSAtbGVuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgc3RhcnQuY29sdW1uLCBsZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICYmIHRoaXMuJHdyYXBEYXRhLmxlbmd0aCAhPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImRvYy5nZXRMZW5ndGgoKSBhbmQgJHdyYXBEYXRhLmxlbmd0aCBoYXZlIHRvIGJlIHRoZSBzYW1lIVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IGZhbHNlO1xuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3cpO1xuXG4gICAgICAgIHJldHVybiByZW1vdmVkRm9sZHM7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdywgYj8pIHtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbbGFzdFJvd10gPSBudWxsO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIHdyYXBEYXRhID0gdGhpcy4kd3JhcERhdGE7XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgICAgIHZhciB0b2tlbnM7XG4gICAgICAgIHZhciBmb2xkTGluZTtcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihsYXN0Um93LCBsaW5lcy5sZW5ndGggLSAxKTtcbiAgICAgICAgd2hpbGUgKHJvdyA8PSBsYXN0Um93KSB7XG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhsaW5lc1tyb3ddKTtcbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtyb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2Fsa1Rva2VuczogbnVtYmVyW107XG4gICAgICAgICAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlciwgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zWzBdID0gUExBQ0VIT0xERVJfU1RBUlQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHdhbGtUb2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zW2ldID0gUExBQ0VIT0xERVJfQk9EWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzW3Jvd10uc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gdG9rZW5zLmNvbmNhdCh3YWxrVG9rZW5zKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgICAgIGxpbmVzW2ZvbGRMaW5lLmVuZC5yb3ddLmxlbmd0aCArIDFcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgd3JhcERhdGFbZm9sZExpbmUuc3RhcnQucm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVXcmFwU3BsaXRzKHRva2VuczogbnVtYmVyW10sIHdyYXBMaW1pdDogbnVtYmVyLCB0YWJTaXplPzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0b2tlbnMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciBkaXNwbGF5TGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcbiAgICAgICAgdmFyIGxhc3RTcGxpdCA9IDAsIGxhc3REb2NTcGxpdCA9IDA7XG5cbiAgICAgICAgdmFyIGlzQ29kZSA9IHRoaXMuJHdyYXBBc0NvZGU7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU3BsaXQoc2NyZWVuUG9zOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBkaXNwbGF5ZWQgPSB0b2tlbnMuc2xpY2UobGFzdFNwbGl0LCBzY3JlZW5Qb3MpO1xuXG4gICAgICAgICAgICAvLyBUaGUgZG9jdW1lbnQgc2l6ZSBpcyB0aGUgY3VycmVudCBzaXplIC0gdGhlIGV4dHJhIHdpZHRoIGZvciB0YWJzXG4gICAgICAgICAgICAvLyBhbmQgbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgdmFyIGxlbiA9IGRpc3BsYXllZC5sZW5ndGg7XG4gICAgICAgICAgICBkaXNwbGF5ZWQuam9pbihcIlwiKS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBUQUJfU1BBQ0VzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzEyL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBDSEFSX0VYVC9tdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxhc3REb2NTcGxpdCArPSBsZW47XG4gICAgICAgICAgICBzcGxpdHMucHVzaChsYXN0RG9jU3BsaXQpO1xuICAgICAgICAgICAgbGFzdFNwbGl0ID0gc2NyZWVuUG9zO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGRpc3BsYXlMZW5ndGggLSBsYXN0U3BsaXQgPiB3cmFwTGltaXQpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMsIHdoZXJlIHRoZSBzcGxpdCBzaG91bGQgYmUuXG4gICAgICAgICAgICB2YXIgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgc3BhY2Ugb3IgdGFiIGF0IHRoaXMgc3BsaXQgcG9zaXRpb24sIHRoZW4gbWFraW5nXG4gICAgICAgICAgICAvLyBhIHNwbGl0IGlzIHNpbXBsZS5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXQgLSAxXSA+PSBTUEFDRSAmJiB0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgLyogZGlzYWJsZWQgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hamF4b3JnL2FjZS9pc3N1ZXMvMTE4NlxuICAgICAgICAgICAgICAgIC8vIEluY2x1ZGUgYWxsIGZvbGxvd2luZyBzcGFjZXMgKyB0YWJzIGluIHRoaXMgc3BsaXQgYXMgd2VsbC5cbiAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdCArKztcbiAgICAgICAgICAgICAgICB9ICovXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHNwbGl0IGlzIGluc2lkZSBvZiBhIHBsYWNlaG9sZGVyLiBQbGFjZWhvbGRlciBhcmVcbiAgICAgICAgICAgIC8vIG5vdCBzcGxpdGFibGUuIFRoZXJlZm9yZSwgc2VlayB0aGUgYmVnaW5uaW5nIG9mIHRoZSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgLy8gYW5kIHRyeSB0byBwbGFjZSB0aGUgc3BsaXQgYmVvZnJlIHRoZSBwbGFjZWhvbGRlcidzIHN0YXJ0LlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQgfHwgdG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VlayB0aGUgc3RhcnQgb2YgdGhlIHBsYWNlaG9sZGVyIGFuZCBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICAvLyBiZWZvcmUgdGhlIHBsYWNlaG9sZGVyLiBCeSBkZWZpbml0aW9uIHRoZXJlIGFsd2F5c1xuICAgICAgICAgICAgICAgIC8vIGEgUExBQ0VIT0xERVJfU1RBUlQgYmV0d2VlbiBzcGxpdCBhbmQgbGFzdFNwbGl0LlxuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0ICE9IGxhc3RTcGxpdCAtIDE7IHNwbGl0LS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwbGl0Kys7IDw8IE5vIGluY3JlbWVudGFsIGhlcmUgYXMgd2Ugd2FudCB0b1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gIGhhdmUgdGhlIHBvc2l0aW9uIGJlZm9yZSB0aGUgUGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBpcyBub3QgdGhlIGluZGV4IG9mIHRoZVxuICAgICAgICAgICAgICAgIC8vIGxhc3Qgc3BsaXQsIHRoZW4gd2UgY2FuIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA+IGxhc3RTcGxpdCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBJUyB0aGUgaW5kZXggb2YgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyBzcGxpdCwgdGhlbiB3ZSBoYXZlIHRvIHBsYWNlIHRoZSBzcGxpdCBhZnRlciB0aGVcbiAgICAgICAgICAgICAgICAvLyBwbGFjZWhvbGRlci4gU28sIGxldCdzIHNlZWsgZm9yIHRoZSBlbmQgb2YgdGhlIHBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0IDwgdG9rZW5zLmxlbmd0aDsgc3BsaXQrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSAhPSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHNwaWx0ID09IHRva2Vucy5sZW5ndGgsIHRoZW4gdGhlIHBsYWNlaG9sZGVyIGlzIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gdGhpbmcgaW4gdGhlIGxpbmUgYW5kIGFkZGluZyBhIG5ldyBzcGxpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UuXG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7ICAvLyBCcmVha3MgdGhlIHdoaWxlLWxvb3AuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRmluYWxseSwgYWRkIHRoZSBzcGxpdC4uLlxuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaXJzdCBub24gc3BhY2UvdGFiL3BsYWNlaG9sZGVyL3B1bmN0dWF0aW9uIHRva2VuIGJhY2t3YXJkcy5cbiAgICAgICAgICAgIHZhciBtaW5TcGxpdCA9IE1hdGgubWF4KHNwbGl0IC0gKGlzQ29kZSA/IDEwIDogd3JhcExpbWl0IC0gKHdyYXBMaW1pdCA+PiAyKSksIGxhc3RTcGxpdCAtIDEpO1xuICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA9PSBQVU5DVFVBVElPTikge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgd2UgZm91bmQgb25lLCB0aGVuIGFkZCB0aGUgc3BsaXQuXG4gICAgICAgICAgICBpZiAoc3BsaXQgPiBtaW5TcGxpdCkge1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KCsrc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgLy8gVGhlIHNwbGl0IGlzIGluc2lkZSBvZiBhIENIQVIgb3IgQ0hBUl9FWFQgdG9rZW4gYW5kIG5vIHNwYWNlXG4gICAgICAgICAgICAvLyBhcm91bmQgLT4gZm9yY2UgYSBzcGxpdC5cbiAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3BsaXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdHJpbmcsIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGRpc3BsYXkgY2hhcmFjdGVycywgaW5jbHVkaW5nIHRhYnMgYW5kIHNwYWNlcy5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBUaGUgdmFsdWUgdG8gc3RhcnQgYXRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGdldERpc3BsYXlUb2tlbnMoc3RyOiBzdHJpbmcsIG9mZnNldD86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGFycjogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIHRhYlNpemU6IG51bWJlcjtcbiAgICAgICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgICAgICAvLyBUYWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICB0YWJTaXplID0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKGFyci5sZW5ndGggKyBvZmZzZXQpO1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQik7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgbiA9IDE7IG4gPCB0YWJTaXplOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCX1NQQUNFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTcGFjZVxuICAgICAgICAgICAgZWxzZSBpZiAoYyA9PSAzMikge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFNQQUNFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChjID4gMzkgJiYgYyA8IDQ4KSB8fCAoYyA+IDU3ICYmIGMgPCA2NCkpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChQVU5DVFVBVElPTik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUiwgQ0hBUl9FWFQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSB3aWR0aCBvZiB0aGUgc3RyaW5nIGBzdHJgIG9uIHRoZSBzY3JlZW4gd2hpbGUgYXNzdW1pbmcgdGhhdCB0aGUgc3RyaW5nIHN0YXJ0cyBhdCB0aGUgZmlyc3QgY29sdW1uIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2FsY3VsYXRlIHRoZSBzY3JlZW4gd2lkdGggb2ZcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhTY3JlZW5Db2x1bW5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Db2x1bW5cbiAgICAqIEByZXR1cm5zIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgICAgIHZhciBjOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICAgICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAgICAgICAvLyB0YWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIG51bWJlciBvZiBzY3JlZW5yb3dzIGluIGEgd3JhcHBlZCBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAgICpcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFJvd0xlbmd0aChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVXaWRnZXRzW3Jvd10gJiYgdGhpcy5saW5lV2lkZ2V0c1tyb3ddLnJvd0NvdW50IHx8IDA7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGggPSAwXG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxICsgaDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDEgKyBoO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFJvd0xpbmVDb3VudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRSb3dXcmFwSW5kZW50KHNjcmVlblJvdzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcG9zLnJvd107XG4gICAgICAgICAgICAvLyBGSVhNRTogaW5kZW50IGRvZXMgbm90IGV4aXN0cyBvbiBudW1iZXJbXVxuICAgICAgICAgICAgcmV0dXJuIHNwbGl0cy5sZW5ndGggJiYgc3BsaXRzWzBdIDwgcG9zLmNvbHVtbiA/IHNwbGl0c1snaW5kZW50J10gOiAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwb3NpdGlvbiAob24gc2NyZWVuKSBmb3IgdGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSBwcm92aWRlZCBzY3JlZW4gcm93LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICpcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGRvY3VtZW50IHBvc2l0aW9uIG9mIHRoZSBsYXN0IHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gcm93LCB0aGlzIHJldHVybnMgdGhlIHNwbGl0IGRhdGEuXG4gICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAgICogQG1ldGhvcyBnZXRTY3JlZW5UYWJTaXplXG4gICAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cblxuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgY2hhcmFjdGVycyBjb29yZGluYXRlcyBvbiB0aGUgc2NyZWVuIHRvIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgd2l0aGluIHRoZSBkb2N1bWVudC4gW1RoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5dezogI2NvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKiovXG4gICAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgaWYgKHNjcmVlblJvdyA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHJvdzogMCwgY29sdW1uOiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgdmFyIGRvY1JvdyA9IDA7XG4gICAgICAgIHZhciBkb2NDb2x1bW4gPSAwO1xuICAgICAgICB2YXIgY29sdW1uO1xuICAgICAgICB2YXIgcm93ID0gMDtcbiAgICAgICAgdmFyIHJvd0xlbmd0aCA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kc2NyZWVuUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgc2NyZWVuUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvY1JvdyA9IHRoaXMuJGRvY1Jvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBzY3JlZW5Sb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFJvdyA9IHRoaXMuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAocm93IDw9IHNjcmVlblJvdykge1xuICAgICAgICAgICAgcm93TGVuZ3RoID0gdGhpcy5nZXRSb3dMZW5ndGgoZG9jUm93KTtcbiAgICAgICAgICAgIGlmIChyb3cgKyByb3dMZW5ndGggPiBzY3JlZW5Sb3cgfHwgZG9jUm93ID49IG1heFJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3cgKz0gcm93TGVuZ3RoO1xuICAgICAgICAgICAgICAgIGRvY1JvdysrO1xuICAgICAgICAgICAgICAgIGlmIChkb2NSb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2goZG9jUm93KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1Jvdykge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIGlmIChyb3cgKyByb3dMZW5ndGggPD0gc2NyZWVuUm93IHx8IGRvY1JvdyA+IG1heFJvdykge1xuICAgICAgICAgICAgLy8gY2xpcCBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByb3c6IG1heFJvdyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0TGluZShtYXhSb3cpLmxlbmd0aFxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpO1xuICAgICAgICAgICAgZm9sZExpbmUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbZG9jUm93XTtcbiAgICAgICAgICAgIGlmIChzcGxpdHMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BsaXRJbmRleCA9IE1hdGguZmxvb3Ioc2NyZWVuUm93IC0gcm93KTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0SW5kZXggPiAwICYmIHNwbGl0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jQ29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXggLSAxXSB8fCBzcGxpdHNbc3BsaXRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoZG9jQ29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkb2NDb2x1bW4gKz0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZSwgc2NyZWVuQ29sdW1uKVsxXTtcblxuICAgICAgICAvLyBXZSByZW1vdmUgb25lIGNoYXJhY3RlciBhdCB0aGUgZW5kIHNvIHRoYXQgdGhlIGRvY0NvbHVtblxuICAgICAgICAvLyBwb3NpdGlvbiByZXR1cm5lZCBpcyBub3QgYXNzb2NpYXRlZCB0byB0aGUgbmV4dCByb3cgb24gdGhlIHNjcmVlbi5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlICYmIGRvY0NvbHVtbiA+PSBjb2x1bW4pXG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBjb2x1bW4gLSAxO1xuXG4gICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBmb2xkTGluZS5pZHhUb1Bvc2l0aW9uKGRvY0NvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiBkb2NSb3csIGNvbHVtbjogZG9jQ29sdW1uIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBDb252ZXJ0cyBkb2N1bWVudCBjb29yZGluYXRlcyB0byBzY3JlZW4gY29vcmRpbmF0ZXMuIHs6Y29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1JvdyBUaGUgZG9jdW1lbnQgcm93IHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgICAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jUm93ID0gcG9zLnJvdztcbiAgICAgICAgZG9jQ29sdW1uID0gcG9zLmNvbHVtbjtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG5cbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IDA7XG4gICAgICAgIHZhciBmb2xkU3RhcnRSb3cgPSBudWxsO1xuICAgICAgICB2YXIgZm9sZCA9IG51bGw7XG5cbiAgICAgICAgLy8gQ2xhbXAgdGhlIGRvY1JvdyBwb3NpdGlvbiBpbiBjYXNlIGl0J3MgaW5zaWRlIG9mIGEgZm9sZGVkIGJsb2NrLlxuICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoZG9jUm93LCBkb2NDb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgZG9jUm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3dFbmQsIHJvdyA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kZG9jUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgZG9jUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuJHNjcmVlblJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBkb2NSb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8IGRvY1Jvdykge1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBpZiAocm93RW5kID4gZG9jUm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvd0VuZCwgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSByb3cgKyAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY3JlZW5Sb3cgKz0gdGhpcy5nZXRSb3dMZW5ndGgocm93KTtcbiAgICAgICAgICAgIHJvdyA9IHJvd0VuZDtcblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChzY3JlZW5Sb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSB0ZXh0IGxpbmUgdGhhdCBpcyBkaXNwbGF5ZWQgaW4gZG9jUm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaW5hbCByb3cgd2Ugd2FudCB0byByZWFjaCBpcyBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgcm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSwgZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICAgICAgZm9sZFN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KS5zdWJzdHJpbmcoMCwgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGRvY1JvdztcbiAgICAgICAgfVxuICAgICAgICAvLyBDbGFtcCB0ZXh0TGluZSBpZiBpbiB3cmFwTW9kZS5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgd3JhcFJvdyA9IHRoaXMuJHdyYXBEYXRhW2ZvbGRTdGFydFJvd107XG4gICAgICAgICAgICBpZiAod3JhcFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3dPZmZzZXQgPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICh0ZXh0TGluZS5sZW5ndGggPj0gd3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlblJvdysrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3dPZmZzZXQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgPSB0ZXh0TGluZS5zdWJzdHJpbmcod3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXQgLSAxXSB8fCAwLCB0ZXh0TGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogc2NyZWVuUm93LFxuICAgICAgICAgICAgY29sdW1uOiB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh0ZXh0TGluZSlbMF1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5yb3c7XG4gICAgfVxuXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5SYW5nZShyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIHZhciBzY3JlZW5Qb3NTdGFydCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgdmFyIHNjcmVlblBvc0VuZCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHNjcmVlblBvc1N0YXJ0LnJvdywgc2NyZWVuUG9zU3RhcnQuY29sdW1uLCBzY3JlZW5Qb3NFbmQucm93LCBzY3JlZW5Qb3NFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuTGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3dzID0gMDtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGRMaW5lID0gbnVsbDtcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgc2NyZWVuUm93cyA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZGVkIGxpbmVzIGFnYWluLlxuICAgICAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZm9sZCA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgICAgIHNjcmVlblJvd3MgLT0gZm9sZC5lbmQucm93IC0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuJHdyYXBEYXRhLmxlbmd0aDtcbiAgICAgICAgICAgIHZhciByb3cgPSAwLCBpID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkID8gZm9sZC5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICAgICAgd2hpbGUgKHJvdyA8IGxhc3RSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzICs9IHNwbGl0cyA/IHNwbGl0cy5sZW5ndGggKyAxIDogMTtcbiAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IGZvbGQuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkID8gZm9sZC5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0b2RvXG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKSB7XG4gICAgICAgICAgICBzY3JlZW5Sb3dzICs9IHRoaXMuJGdldFdpZGdldFNjcmVlbkxlbmd0aCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjcmVlblJvd3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwdWJsaWMgJHNldEZvbnRNZXRyaWNzKGZtOiBGb250TWV0cmljcykge1xuICAgICAgICAvLyBUT0RPP1xuICAgIH1cblxuICAgIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIGNocj86IHN0cmluZyk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbiwgY2hyKTtcbiAgICB9XG5cbiAgICBnZXRCcmFja2V0UmFuZ2UocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pOiBSYW5nZSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5nZXRCcmFja2V0UmFuZ2UocG9zaXRpb24pO1xuICAgIH1cblxuICAgICRmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdHlwZVJlPzogUmVnRXhwKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci4kZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQsIHBvc2l0aW9uLCB0eXBlUmUpO1xuICAgIH1cblxuICAgICRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdHlwZVJlPzogUmVnRXhwKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci4kZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQsIHBvc2l0aW9uLCB0eXBlUmUpO1xuICAgIH1cbiAgICBwcml2YXRlICRmb2xkTW9kZTtcblxuICAgIC8vIHN0cnVjdHVyZWQgZm9sZGluZ1xuICAgICRmb2xkU3R5bGVzID0ge1xuICAgICAgICBcIm1hbnVhbFwiOiAxLFxuICAgICAgICBcIm1hcmtiZWdpblwiOiAxLFxuICAgICAgICBcIm1hcmtiZWdpbmVuZFwiOiAxXG4gICAgfVxuICAgICRmb2xkU3R5bGUgPSBcIm1hcmtiZWdpblwiO1xuICAgIC8qXG4gICAgICogTG9va3MgdXAgYSBmb2xkIGF0IGEgZ2l2ZW4gcm93L2NvbHVtbi4gUG9zc2libGUgdmFsdWVzIGZvciBzaWRlOlxuICAgICAqICAgLTE6IGlnbm9yZSBhIGZvbGQgaWYgZm9sZC5zdGFydCA9IHJvdy9jb2x1bW5cbiAgICAgKiAgICsxOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuZW5kID0gcm93L2NvbHVtblxuICAgICAqL1xuICAgIGdldEZvbGRBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHNpZGU/OiBudW1iZXIpOiBGb2xkIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbaV07XG4gICAgICAgICAgICBpZiAoZm9sZC5yYW5nZS5jb250YWlucyhyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2lkZSA9PT0gMSAmJiBmb2xkLnJhbmdlLmlzRW5kKHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT09IC0xICYmIGZvbGQucmFuZ2UuaXNTdGFydChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZ2l2ZW4gcmFuZ2UuIE5vdGUsIHRoYXQgdGhpcyB3aWxsIHJldHVybiBmb2xkc1xuICAgICAqXG4gICAgICovXG4gICAgZ2V0Rm9sZHNJblJhbmdlKHJhbmdlOiBSYW5nZSk6IEZvbGRbXSB7XG4gICAgICAgIHZhciBzdGFydCA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gcmFuZ2UuZW5kO1xuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb3VuZEZvbGRzOiBGb2xkW10gPSBbXTtcblxuICAgICAgICBzdGFydC5jb2x1bW4gKz0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiAtPSAxO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmVzW2ldLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09IDIpIHtcbiAgICAgICAgICAgICAgICAvLyBSYW5nZSBpcyBiZWZvcmUgZm9sZExpbmUuIE5vIGludGVyc2VjdGlvbi4gVGhpcyBtZWFucyxcbiAgICAgICAgICAgICAgICAvLyB0aGVyZSBtaWdodCBiZSBvdGhlciBmb2xkTGluZXMgdGhhdCBpbnRlcnNlY3QuXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAvLyBSYW5nZSBpcyBhZnRlciBmb2xkTGluZS4gVGhlcmUgY2FuJ3QgYmUgYW55IG90aGVyIGZvbGRMaW5lcyB0aGVuLFxuICAgICAgICAgICAgICAgIC8vIHNvIGxldCdzIGdpdmUgdXAuXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lc1tpXS5mb2xkcztcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2pdO1xuICAgICAgICAgICAgICAgIGNtcCA9IGZvbGQucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY21wID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFdURi1zdGF0ZTogQ2FuIGhhcHBlbiBkdWUgdG8gLTEvKzEgdG8gc3RhcnQvZW5kIGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSA0Mikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3VuZEZvbGRzLnB1c2goZm9sZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3RhcnQuY29sdW1uIC09IDE7XG4gICAgICAgIGVuZC5jb2x1bW4gKz0gMTtcblxuICAgICAgICByZXR1cm4gZm91bmRGb2xkcztcbiAgICB9XG5cbiAgICBnZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlcyk6IEZvbGRbXSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJhbmdlcykpIHtcbiAgICAgICAgICAgIHZhciBmb2xkczogRm9sZFtdID0gW107XG4gICAgICAgICAgICByYW5nZXMuZm9yRWFjaChmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICAgICAgICAgIGZvbGRzID0gZm9sZHMuY29uY2F0KHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBkb2N1bWVudFxuICAgICAqL1xuICAgIGdldEFsbEZvbGRzKCk6IEZvbGRbXSB7XG4gICAgICAgIHZhciBmb2xkcyA9IFtdO1xuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZvbGRMaW5lc1tpXS5mb2xkcy5sZW5ndGg7IGorKylcbiAgICAgICAgICAgICAgICBmb2xkcy5wdXNoKGZvbGRMaW5lc1tpXS5mb2xkc1tqXSk7XG5cbiAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIGJldHdlZW4gZm9sZHMgYXQgdGhlIGdpdmVuIHBvc2l0aW9uLlxuICAgICAqIEUuZy5cbiAgICAgKiAgZm9vPGZvbGQ+Ynxhcjxmb2xkPndvbHJkIC0+IFwiYmFyXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC0+IFwid29ybGRcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm98bGQ+d29scmQgLT4gPG51bGw+XG4gICAgICpcbiAgICAgKiB3aGVyZSB8IG1lYW5zIHRoZSBwb3NpdGlvbiBvZiByb3cvY29sdW1uXG4gICAgICpcbiAgICAgKiBUaGUgdHJpbSBvcHRpb24gZGV0ZXJtcyBpZiB0aGUgcmV0dXJuIHN0cmluZyBzaG91bGQgYmUgdHJpbWVkIGFjY29yZGluZ1xuICAgICAqIHRvIHRoZSBcInNpZGVcIiBwYXNzZWQgd2l0aCB0aGUgdHJpbSB2YWx1ZTpcbiAgICAgKlxuICAgICAqIEUuZy5cbiAgICAgKiAgZm9vPGZvbGQ+Ynxhcjxmb2xkPndvbHJkIC10cmltPS0xPiBcImJcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLXRyaW09KzE+IFwicmxkXCJcbiAgICAgKiAgZm98bzxmb2xkPmJhcjxmb2xkPndvbHJkIC10cmltPTAwPiBcImZvb1wiXG4gICAgICovXG4gICAgZ2V0Rm9sZFN0cmluZ0F0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdHJpbTogbnVtYmVyLCBmb2xkTGluZT86IEZvbGRMaW5lKTogc3RyaW5nIHtcbiAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZSB8fCB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIGlmICghZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICB2YXIgbGFzdEZvbGQgPSB7XG4gICAgICAgICAgICBlbmQ6IHsgY29sdW1uOiAwIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gVE9ETzogUmVmYWN0b3IgdG8gdXNlIGdldE5leHRGb2xkVG8gZnVuY3Rpb24uXG4gICAgICAgIHZhciBzdHI6IHN0cmluZztcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmUuZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvbGQgPSBmb2xkTGluZS5mb2xkc1tpXTtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVFbmQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4sIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFzdEZvbGQgPSBmb2xkO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc3RyKVxuICAgICAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRyaW0gPT0gLTEpXG4gICAgICAgICAgICByZXR1cm4gc3RyLnN1YnN0cmluZygwLCBjb2x1bW4gLSBsYXN0Rm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgZWxzZSBpZiAodHJpbSA9PSAxKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cgJiYgZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPiBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHRoZSBmb2xkIHdoaWNoIHN0YXJ0cyBhZnRlciBvciBjb250YWlucyBkb2NSb3dcbiAgICBnZXROZXh0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldEZvbGRlZFJvd0NvdW50KGZpcnN0OiBudW1iZXIsIGxhc3Q6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgcm93Q291bnQgPSBsYXN0IC0gZmlyc3QgKyAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXSxcbiAgICAgICAgICAgICAgICBlbmQgPSBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgaWYgKGVuZCA+PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0IDwgbGFzdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBsYXN0IC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50ID0gMDsvL2luIG9uZSBmb2xkXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmQgPj0gZmlyc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpIC8vZm9sZCBpbnNpZGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBmaXJzdCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvd0NvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgJGFkZEZvbGRMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSkge1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS5wdXNoKGZvbGRMaW5lKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5zdGFydC5yb3cgLSBiLnN0YXJ0LnJvdztcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IGZvbGQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuc1xuICAgICAqICAgICAgVGhlIG5ldyBjcmVhdGVkIEZvbGQgb2JqZWN0IG9yIGFuIGV4aXN0aW5nIGZvbGQgb2JqZWN0IGluIGNhc2UgdGhlXG4gICAgICogICAgICBwYXNzZWQgaW4gcmFuZ2UgZml0cyBhbiBleGlzdGluZyBmb2xkIGV4YWN0bHkuXG4gICAgICovXG4gICAgYWRkRm9sZChwbGFjZWhvbGRlcjogc3RyaW5nIHwgRm9sZCwgcmFuZ2U6IFJhbmdlKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgYWRkZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG5cbiAgICAgICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgRm9sZClcbiAgICAgICAgICAgIGZvbGQgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHBsYWNlaG9sZGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZm9sZCA9IG5ldyBGb2xkKHJhbmdlLCBwbGFjZWhvbGRlcik7XG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSByYW5nZS5jb2xsYXBzZUNoaWxkcmVuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicGxhY2Vob2xkZXIgbXVzdCBiZSBhIHN0cmluZyBvciBhIEZvbGQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAgICAgLy8gZm9sZC5yYW5nZSA9IHRoaXMuY2xpcFJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBmb2xkLnJhbmdlID0gdGhpcy4kY2xpcFJhbmdlVG9Eb2N1bWVudChmb2xkLnJhbmdlKVxuXG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICB2YXIgc3RhcnRDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICAgICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgICAgICAvLyAtLS0gU29tZSBjaGVja2luZyAtLS1cbiAgICAgICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgICAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgICAgICB2YXIgZW5kRm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGVuZFJvdywgZW5kQ29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICAgICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgICAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvbGQgY2FuJ3QgaW50ZXJzZWN0IGFscmVhZHkgZXhpc3RpbmcgZm9sZFwiICsgZm9sZC5yYW5nZSArIHN0YXJ0Rm9sZC5yYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgICAgICBmb2xkLmFkZFN1YkZvbGQoc3ViRm9sZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhcnRSb3cgPT0gZm9sZExpbmUuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmICghZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIG1pZ2h0IGhhdmUgdG8gbWVyZ2UgdHdvIEZvbGRMaW5lcy5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lTmV4dCA9IGZvbGREYXRhW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lTmV4dCAmJiBmb2xkTGluZU5leHQuc3RhcnQucm93ID09IGVuZFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtZXJnZSFcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLm1lcmdlKGZvbGRMaW5lTmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kUm93IDw9IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhZGRlZClcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kYWRkRm9sZExpbmUobmV3IEZvbGRMaW5lKHRoaXMuJGZvbGREYXRhLCBmb2xkKSk7XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJhZGRcIiB9KTtcblxuICAgICAgICByZXR1cm4gZm9sZDtcbiAgICB9XG5cbiAgICBzZXRNb2RpZmllZChtb2RpZmllZDogYm9vbGVhbikge1xuXG4gICAgfVxuXG4gICAgYWRkRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZChmb2xkOiBGb2xkKTogdm9pZCB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGQuZm9sZExpbmU7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcztcbiAgICAgICAgLy8gU2ltcGxlIGNhc2Ugd2hlcmUgdGhlcmUgaXMgb25seSBvbmUgZm9sZCBpbiB0aGUgRm9sZExpbmUgc3VjaCB0aGF0XG4gICAgICAgIC8vIHRoZSBlbnRpcmUgZm9sZCBsaW5lIGNhbiBnZXQgcmVtb3ZlZCBkaXJlY3RseS5cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICBmb2xkTGluZXMuc3BsaWNlKGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGxhc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzRW5kKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIGZvbGRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3cgPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQucm93O1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5jb2x1bW4gPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQuY29sdW1uO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBmaXJzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzU3RhcnQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnN0YXJ0LmNvbHVtbiA9IGZvbGRzWzBdLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBrbm93IHRoZXJlIGFyZSBtb3JlIHRoZW4gMiBmb2xkcyBhbmQgdGhlIGZvbGQgaXMgbm90IGF0IHRoZSBlZGdlLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1lYW5zLCB0aGUgZm9sZCBpcyBzb21ld2hlcmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgaW4gb25lIHJvdywgd2UganVzdCBjYW4gcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zcGxpY2UoZm9sZHMuaW5kZXhPZihmb2xkKSwgMSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZm9sZCBnb2VzIG92ZXIgbW9yZSB0aGVuIG9uZSByb3cuIFRoaXMgbWVhbnMgcmVtdm9pbmcgdGhpcyBmb2xkXG4gICAgICAgICAgICAgICAgICAgIC8vIHdpbGwgY2F1c2UgdGhlIGZvbGQgbGluZSB0byBnZXQgc3BsaXR0ZWQgdXAuIG5ld0ZvbGRMaW5lIGlzIHRoZSBzZWNvbmQgcGFydFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV3Rm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMgPSBuZXdGb2xkTGluZS5mb2xkcztcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJHVwZGF0aW5nKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwicmVtb3ZlXCIgfSk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZHMoZm9sZHM6IEZvbGRbXSk6IHZvaWQge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIGNsb25lIHRoZSBmb2xkcyBhcnJheSBwYXNzZWQgaW4gYXMgaXQgbWlnaHQgYmUgdGhlIGZvbGRzXG4gICAgICAgIC8vIGFycmF5IG9mIGEgZm9sZCBsaW5lIGFuZCBhcyB3ZSBjYWxsIHRoaXMucmVtb3ZlRm9sZChmb2xkKSwgZm9sZHNcbiAgICAgICAgLy8gYXJlIHJlbW92ZWQgZnJvbSBmb2xkcyBhbmQgY2hhbmdlcyB0aGUgY3VycmVudCBpbmRleC5cbiAgICAgICAgdmFyIGNsb25lRm9sZHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY2xvbmVGb2xkcy5wdXNoKGZvbGRzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNsb25lRm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgIH1cblxuICAgIGV4cGFuZEZvbGQoZm9sZDogRm9sZCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIGZvbGQuc3ViRm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgICAgICBmb2xkLnJlc3RvcmVSYW5nZShzdWJGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChzdWJGb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmIChmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoZm9sZC5zdGFydC5yb3cgKyAxLCBmb2xkLmVuZC5yb3csIGZvbGQuY29sbGFwc2VDaGlsZHJlbiAtIDEpO1xuICAgICAgICB9XG4gICAgICAgIGZvbGQuc3ViRm9sZHMgPSBbXTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICB1bmZvbGQobG9jYXRpb24/OiBhbnksIGV4cGFuZElubmVyPzogYm9vbGVhbik6IEZvbGRbXSB7XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2U7XG4gICAgICAgIHZhciBmb2xkczogRm9sZFtdO1xuICAgICAgICBpZiAobG9jYXRpb24gPT0gbnVsbCkge1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgdGhpcy5nZXRMZW5ndGgoKSwgMCk7XG4gICAgICAgICAgICBleHBhbmRJbm5lciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGxvY2F0aW9uID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShsb2NhdGlvbiwgMCwgbG9jYXRpb24sIHRoaXMuZ2V0TGluZShsb2NhdGlvbikubGVuZ3RoKTtcbiAgICAgICAgZWxzZSBpZiAoXCJyb3dcIiBpbiBsb2NhdGlvbilcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhsb2NhdGlvbiwgbG9jYXRpb24pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZSA9IGxvY2F0aW9uO1xuXG4gICAgICAgIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICAgICAgaWYgKGV4cGFuZElubmVyKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdWJGb2xkcyA9IGZvbGRzO1xuICAgICAgICAgICAgLy8gVE9ETzogbWlnaHQgYmUgYmV0dGVyIHRvIHJlbW92ZSBhbmQgYWRkIGZvbGRzIGluIG9uZSBnbyBpbnN0ZWFkIG9mIHVzaW5nXG4gICAgICAgICAgICAvLyBleHBhbmRGb2xkcyBzZXZlcmFsIHRpbWVzLlxuICAgICAgICAgICAgd2hpbGUgKHN1YkZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZHMoc3ViRm9sZHMpO1xuICAgICAgICAgICAgICAgIHN1YkZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogQ2hlY2tzIGlmIGEgZ2l2ZW4gZG9jdW1lbnRSb3cgaXMgZm9sZGVkLiBUaGlzIGlzIHRydWUgaWYgdGhlcmUgYXJlIHNvbWVcbiAgICAgKiBmb2xkZWQgcGFydHMgc3VjaCB0aGF0IHNvbWUgcGFydHMgb2YgdGhlIGxpbmUgaXMgc3RpbGwgdmlzaWJsZS5cbiAgICAgKiovXG4gICAgaXNSb3dGb2xkZWQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdzogRm9sZExpbmUpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZEVuZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93PzogRm9sZExpbmUpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICAgICAgcmV0dXJuIGZvbGRMaW5lID8gZm9sZExpbmUuZW5kLnJvdyA6IGRvY1JvdztcbiAgICB9XG5cbiAgICBnZXRSb3dGb2xkU3RhcnQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IGRvY1JvdztcbiAgICB9XG5cbiAgICBnZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmU6IEZvbGRMaW5lLCBlbmRSb3c/OiBudW1iZXIsIGVuZENvbHVtbj86IG51bWJlciwgc3RhcnRSb3c/OiBudW1iZXIsIHN0YXJ0Q29sdW1uPzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHN0YXJ0Um93ID09IG51bGwpXG4gICAgICAgICAgICBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgaWYgKHN0YXJ0Q29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBzdGFydENvbHVtbiA9IDA7XG4gICAgICAgIGlmIChlbmRSb3cgPT0gbnVsbClcbiAgICAgICAgICAgIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgICAgIGlmIChlbmRDb2x1bW4gPT0gbnVsbClcbiAgICAgICAgICAgIGVuZENvbHVtbiA9IHRoaXMuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIHRleHRsaW5lIHVzaW5nIHRoZSBGb2xkTGluZSB3YWxrZXIuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHRleHRMaW5lID0gXCJcIjtcblxuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgbGFzdENvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocm93IDwgc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBzdGFydFJvdykge1xuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4gPCBzdGFydENvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxhc3RDb2x1bW4gPSBNYXRoLm1heChzdGFydENvbHVtbiwgbGFzdENvbHVtbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgKz0gcGxhY2Vob2xkZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHNlbGYuZ2V0TGluZShyb3cpLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBlbmRSb3csIGVuZENvbHVtbik7XG4gICAgICAgIHJldHVybiB0ZXh0TGluZTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5TGluZShyb3c6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHN0YXJ0Um93OiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICAgICAgdmFyIGxpbmU6IHN0cmluZztcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLnN1YnN0cmluZyhzdGFydENvbHVtbiB8fCAwLCBlbmRDb2x1bW4gfHwgbGluZS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKFxuICAgICAgICAgICAgICAgIGZvbGRMaW5lLCByb3csIGVuZENvbHVtbiwgc3RhcnRSb3csIHN0YXJ0Q29sdW1uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNsb25lRm9sZERhdGEoKSB7XG4gICAgICAgIHZhciBmZCA9IFtdO1xuICAgICAgICBmZCA9IHRoaXMuJGZvbGREYXRhLm1hcChmdW5jdGlvbihmb2xkTGluZSkge1xuICAgICAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHMubWFwKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZC5jbG9uZSgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEZvbGRMaW5lKGZkLCBmb2xkcyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBmZDtcbiAgICB9XG5cbiAgICB0b2dnbGVGb2xkKHRyeVRvVW5mb2xkOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZSA9IHNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICB2YXIgZm9sZDogRm9sZDtcbiAgICAgICAgdmFyIGJyYWNrZXRQb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG5cbiAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIGN1cnNvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJyYWNrZXRQb3MgPSB0aGlzLmZpbmRNYXRjaGluZ0JyYWNrZXQoY3Vyc29yKSkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlUG9pbnQoYnJhY2tldFBvcykgPT0gMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQgPSBicmFja2V0UG9zO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uKys7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJyYWNrZXRQb3MgPSB0aGlzLmZpbmRNYXRjaGluZ0JyYWNrZXQoeyByb3c6IGN1cnNvci5yb3csIGNvbHVtbjogY3Vyc29yLmNvbHVtbiArIDEgfSkpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09PSAxKVxuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQgPSBicmFja2V0UG9zO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQgPSBicmFja2V0UG9zO1xuXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gdGhpcy5nZXRDb21tZW50Rm9sZFJhbmdlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pIHx8IHJhbmdlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKHRyeVRvVW5mb2xkICYmIGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZHMoZm9sZHMpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgICAgICBmb2xkID0gZm9sZHNbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWZvbGQpXG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChmb2xkICYmIGZvbGQucmFuZ2UudG9TdHJpbmcoKSA9PSByYW5nZS50b1N0cmluZygpKSB7XG4gICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcGxhY2Vob2xkZXIgPSBcIi4uLlwiO1xuICAgICAgICBpZiAoIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gdGhpcy5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyLmxlbmd0aCA8IDQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlci50cmltKCkuc3Vic3RyaW5nKDAsIDIpICsgXCIuLlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hZGRGb2xkKHBsYWNlaG9sZGVyLCByYW5nZSk7XG4gICAgfVxuXG4gICAgZ2V0Q29tbWVudEZvbGRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGRpcj86IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgaWYgKHRva2VuICYmIC9eY29tbWVudHxzdHJpbmcvLnRlc3QodG9rZW4udHlwZSkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgICAgIHZhciByZSA9IG5ldyBSZWdFeHAodG9rZW4udHlwZS5yZXBsYWNlKC9cXC4uKi8sIFwiXFxcXC5cIikpO1xuICAgICAgICAgICAgaWYgKGRpciAhPSAxKSB7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIHJlLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyAyO1xuXG4gICAgICAgICAgICBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGRpciAhPSAtMSkge1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIHJlLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuXG4gICAgICAgICAgICByYW5nZS5lbmQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyB0b2tlbi52YWx1ZS5sZW5ndGggLSAyO1xuICAgICAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9sZEFsbChzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgZGVwdGg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoZGVwdGggPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgZGVwdGggPSAxMDAwMDA7IC8vIEpTT04uc3RyaW5naWZ5IGRvZXNuJ3QgaGFubGUgSW5maW5pdHlcbiAgICAgICAgdmFyIGZvbGRXaWRnZXRzID0gdGhpcy5mb2xkV2lkZ2V0cztcbiAgICAgICAgaWYgKCFmb2xkV2lkZ2V0cylcbiAgICAgICAgICAgIHJldHVybjsgLy8gbW9kZSBkb2Vzbid0IHN1cHBvcnQgZm9sZGluZ1xuICAgICAgICBlbmRSb3cgPSBlbmRSb3cgfHwgdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgc3RhcnRSb3cgPSBzdGFydFJvdyB8fCAwO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDwgZW5kUm93OyByb3crKykge1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gPT0gbnVsbClcbiAgICAgICAgICAgICAgICBmb2xkV2lkZ2V0c1tyb3ddID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSAhPSBcInN0YXJ0XCIpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdyk7XG4gICAgICAgICAgICAvLyBzb21ldGltZXMgcmFuZ2UgY2FuIGJlIGluY29tcGF0aWJsZSB3aXRoIGV4aXN0aW5nIGZvbGRcbiAgICAgICAgICAgIC8vIFRPRE8gY2hhbmdlIGFkZEZvbGQgdG8gcmV0dXJuIG51bGwgaXN0ZWFkIG9mIHRocm93aW5nXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuaXNNdWx0aUxpbmUoKVxuICAgICAgICAgICAgICAgICYmIHJhbmdlLmVuZC5yb3cgPD0gZW5kUm93XG4gICAgICAgICAgICAgICAgJiYgcmFuZ2Uuc3RhcnQucm93ID49IHN0YXJ0Um93XG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZEZvbGQgY2FuIGNoYW5nZSB0aGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZClcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGQuY29sbGFwc2VDaGlsZHJlbiA9IGRlcHRoO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0Rm9sZFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRmb2xkU3R5bGVzW3N0eWxlXSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZm9sZCBzdHlsZTogXCIgKyBzdHlsZSArIFwiW1wiICsgT2JqZWN0LmtleXModGhpcy4kZm9sZFN0eWxlcykuam9pbihcIiwgXCIpICsgXCJdXCIpO1xuXG4gICAgICAgIGlmICh0aGlzLiRmb2xkU3R5bGUgPT09IHN0eWxlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRTdHlsZSA9IHN0eWxlO1xuXG4gICAgICAgIGlmIChzdHlsZSA9PT0gXCJtYW51YWxcIilcbiAgICAgICAgICAgIHRoaXMudW5mb2xkKCk7XG4gICAgICAgIFxuICAgICAgICAvLyByZXNldCBmb2xkaW5nXG4gICAgICAgIHZhciBtb2RlID0gdGhpcy4kZm9sZE1vZGU7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobnVsbCk7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc2V0Rm9sZGluZyhmb2xkTW9kZSkge1xuICAgICAgICBpZiAodGhpcy4kZm9sZE1vZGUgPT0gZm9sZE1vZGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZE1vZGUgPSBmb2xkTW9kZTtcblxuICAgICAgICB0aGlzLm9mZignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiKTtcblxuICAgICAgICBpZiAoIWZvbGRNb2RlIHx8IHRoaXMuJGZvbGRTdHlsZSA9PSBcIm1hbnVhbFwiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gbnVsbDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0ID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldC5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZSA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXRSYW5nZS5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzID0gdGhpcy51cGRhdGVGb2xkV2lkZ2V0cy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9uKCdjaGFuZ2UnLCB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyk7XG5cbiAgICB9XG5cbiAgICBnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdzogbnVtYmVyLCBpZ25vcmVDdXJyZW50PzogYm9vbGVhbik6IHsgcmFuZ2U/OiBSYW5nZTsgZmlyc3RSYW5nZT86IFJhbmdlIH0ge1xuICAgICAgICB2YXIgZncgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZ3IHx8IChpZ25vcmVDdXJyZW50ICYmIGZ3W3Jvd10pKSB7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHJvdyAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJhbmdlOiBSYW5nZTtcbiAgICAgICAgd2hpbGUgKGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIGMgPSBmd1tpXTtcbiAgICAgICAgICAgIGlmIChjID09IG51bGwpXG4gICAgICAgICAgICAgICAgYyA9IGZ3W2ldID0gdGhpcy5nZXRGb2xkV2lkZ2V0KGkpO1xuXG4gICAgICAgICAgICBpZiAoYyA9PSBcInN0YXJ0XCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShpKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpcnN0UmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0UmFuZ2UgPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuZW5kLnJvdyA+PSByb3cpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaS0tO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJhbmdlOiBpICE9PSAtMSAmJiByYW5nZSxcbiAgICAgICAgICAgIGZpcnN0UmFuZ2U6IGZpcnN0UmFuZ2VcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBvbkZvbGRXaWRnZXRDbGljayhyb3c6IG51bWJlciwgZSkge1xuICAgICAgICBlID0gZS5kb21FdmVudDtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjaGlsZHJlbjogZS5zaGlmdEtleSxcbiAgICAgICAgICAgIGFsbDogZS5jdHJsS2V5IHx8IGUubWV0YUtleSxcbiAgICAgICAgICAgIHNpYmxpbmdzOiBlLmFsdEtleVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCBvcHRpb25zKTtcbiAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgdmFyIGVsID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudClcbiAgICAgICAgICAgIGlmIChlbCAmJiAvYWNlX2ZvbGQtd2lkZ2V0Ly50ZXN0KGVsLmNsYXNzTmFtZSkpXG4gICAgICAgICAgICAgICAgZWwuY2xhc3NOYW1lICs9IFwiIGFjZV9pbnZhbGlkXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICR0b2dnbGVGb2xkV2lkZ2V0KHJvdzogbnVtYmVyLCBvcHRpb25zKTogUmFuZ2Uge1xuICAgICAgICBpZiAoIXRoaXMuZ2V0Rm9sZFdpZGdldClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHR5cGUgPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgICAgICB2YXIgZGlyID0gdHlwZSA9PT0gXCJlbmRcIiA/IC0xIDogMTtcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIGRpciA9PT0gLTEgPyAwIDogbGluZS5sZW5ndGgsIGRpcik7XG5cbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoaWxkcmVuIHx8IG9wdGlvbnMuYWxsKVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3csIHRydWUpO1xuICAgICAgICAvLyBzb21ldGltZXMgc2luZ2xlbGluZSBmb2xkcyBjYW4gYmUgbWlzc2VkIGJ5IHRoZSBjb2RlIGFib3ZlXG4gICAgICAgIGlmIChyYW5nZSAmJiAhcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkICYmIHJhbmdlLmlzRXF1YWwoZm9sZC5yYW5nZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuc2libGluZ3MpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdyk7XG4gICAgICAgICAgICBpZiAoZGF0YS5yYW5nZSkge1xuICAgICAgICAgICAgICAgIHZhciBzdGFydFJvdyA9IGRhdGEucmFuZ2Uuc3RhcnQucm93ICsgMTtcbiAgICAgICAgICAgICAgICB2YXIgZW5kUm93ID0gZGF0YS5yYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKHN0YXJ0Um93LCBlbmRSb3csIG9wdGlvbnMuYWxsID8gMTAwMDAgOiAwKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvcHRpb25zLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBlbmRSb3cgPSByYW5nZSA/IHJhbmdlLmVuZC5yb3cgOiB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKHJvdyArIDEsIHJhbmdlLmVuZC5yb3csIG9wdGlvbnMuYWxsID8gMTAwMDAgOiAwKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuYWxsKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIGJpdCB1Z2x5LCBidXQgaXQgY29ycmVzcG9uZHMgdG8gc29tZSBjb2RlIGVsc2V3aGVyZS5cbiAgICAgICAgICAgICAgICByYW5nZS5jb2xsYXBzZUNoaWxkcmVuID0gMTAwMDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuXG5cbiAgICB0b2dnbGVGb2xkV2lkZ2V0KHRvZ2dsZVBhcmVudCkge1xuICAgICAgICB2YXIgcm93OiBudW1iZXIgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBoYW5kbGUgdG9nZ2xlUGFyZW50XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgdHJ1ZSk7XG4gICAgICAgIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgdGhpcy5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVGb2xkV2lkZ2V0cyhlOiB7IGRhdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IH0sIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsZW4gPSByYW5nZS5lbmQucm93IC0gZmlyc3RSb3c7XG5cbiAgICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0c1tmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZVRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVMaW5lc1wiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZShmaXJzdFJvdywgbGVuICsgMSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbiArIDEpO1xuICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAxKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlLmFwcGx5KHRoaXMuZm9sZFdpZGdldHMsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBGSVhNRTogUmVzdG9yZVxuLy8gRm9sZGluZy5jYWxsKEVkaXRTZXNzaW9uLnByb3RvdHlwZSk7XG5cbmRlZmluZU9wdGlvbnMoRWRpdFNlc3Npb24ucHJvdG90eXBlLCBcInNlc3Npb25cIiwge1xuICAgIHdyYXA6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZSA9PSBcIm9mZlwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcImZyZWVcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRydWU7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcInByaW50TWFyZ2luXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSAtMTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKSB8fCBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUoZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY29sID0gdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgPyB2YWx1ZSA6IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShjb2wsIGNvbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZSh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJHdyYXAgPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSAtMSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicHJpbnRNYXJnaW5cIjtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZ2V0V3JhcExpbWl0UmFuZ2UoKS5taW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcImZyZWVcIjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBcIm9mZlwiO1xuICAgICAgICB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICB3cmFwTWV0aG9kOiB7XG4gICAgICAgIC8vIGNvZGV8dGV4dHxhdXRvXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSB2YWwgPT0gXCJhdXRvXCJcbiAgICAgICAgICAgICAgICA/IHRoaXMuJG1vZGUudHlwZSAhPSBcInRleHRcIlxuICAgICAgICAgICAgICAgIDogdmFsICE9IFwidGV4dFwiO1xuICAgICAgICAgICAgaWYgKHZhbCAhPSB0aGlzLiR3cmFwQXNDb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcEFzQ29kZSA9IHZhbDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiYXV0b1wiXG4gICAgfSxcbiAgICBmaXJzdExpbmVOdW1iZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAxXG4gICAgfSxcbiAgICB1c2VXb3JrZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih1c2VXb3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHVzZVdvcmtlciA9IHVzZVdvcmtlcjtcblxuICAgICAgICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuICAgICAgICAgICAgaWYgKHVzZVdvcmtlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHVzZVNvZnRUYWJzOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHRhYlNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih0YWJTaXplKSB7XG4gICAgICAgICAgICBpZiAoaXNOYU4odGFiU2l6ZSkgfHwgdGhpcy4kdGFiU2l6ZSA9PT0gdGFiU2l6ZSkgcmV0dXJuO1xuXG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICAgICAgdGhpcy4kdGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VUYWJTaXplXCIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDQsXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG92ZXJ3cml0ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VPdmVyd3JpdGVcIik7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIG5ld0xpbmVNb2RlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCkgfSxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgbW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldE1vZGUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kbW9kZUlkIH1cbiAgICB9XG59KTtcbiJdfQ==