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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uc2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmdldEFubm90YXRpb25zIiwiRWRpdFNlc3Npb24uY2xlYXJBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLiRkZXRlY3ROZXdMaW5lIiwiRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLnNldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uZ2V0TmV3TGluZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5vblJlbG9hZFRva2VuaXplciIsIkVkaXRTZXNzaW9uLnNldE1vZGUiLCJFZGl0U2Vzc2lvbi4kb25DaGFuZ2VNb2RlIiwiRWRpdFNlc3Npb24uJHN0b3BXb3JrZXIiLCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNb2RlIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmVXaWRnZXRNYXhXaWR0aCIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TGluZXMiLCJFZGl0U2Vzc2lvbi5nZXRMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRUZXh0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5pbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZW1vdmUiLCJFZGl0U2Vzc2lvbi51bmRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnJlZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24uc2V0VW5kb1NlbGVjdCIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24uaXNJbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZXBsYWNlIiwiRWRpdFNlc3Npb24ubW92ZVRleHQiLCJFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzIiwiRWRpdFNlc3Npb24ub3V0ZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi4kbW92ZUxpbmVzIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzVXAiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duIiwiRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXMiLCJFZGl0U2Vzc2lvbi4kY2xpcFJvd1RvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcENvbHVtblRvUm93IiwiRWRpdFNlc3Npb24uJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcFJhbmdlVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLnNldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uZ2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLmFkanVzdFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLiRjb25zdHJhaW5XcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVSb3dMZW5ndGhDYWNoZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVXcmFwRGF0YSIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cyIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cy5hZGRTcGxpdCIsIkVkaXRTZXNzaW9uLiRnZXREaXNwbGF5VG9rZW5zIiwiRWRpdFNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGluZUNvdW50IiwiRWRpdFNlc3Npb24uZ2V0Um93V3JhcEluZGVudCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmdldFJvd1NwbGl0RGF0YSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlblRhYlNpemUiLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93IiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudENvbHVtbiIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93IiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoIiwiRWRpdFNlc3Npb24uJHNldEZvbnRNZXRyaWNzIiwiRWRpdFNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEJyYWNrZXRSYW5nZSIsIkVkaXRTZXNzaW9uLiRmaW5kT3BlbmluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi4kZmluZENsb3NpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZEF0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlTGlzdCIsIkVkaXRTZXNzaW9uLmdldEFsbEZvbGRzIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRGb2xkZWRSb3dDb3VudCIsIkVkaXRTZXNzaW9uLiRhZGRGb2xkTGluZSIsIkVkaXRTZXNzaW9uLmFkZEZvbGQiLCJFZGl0U2Vzc2lvbi5zZXRNb2RpZmllZCIsIkVkaXRTZXNzaW9uLmFkZEZvbGRzIiwiRWRpdFNlc3Npb24ucmVtb3ZlRm9sZCIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGRzIiwiRWRpdFNlc3Npb24uZXhwYW5kRm9sZCIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGRzIiwiRWRpdFNlc3Npb24udW5mb2xkIiwiRWRpdFNlc3Npb24uaXNSb3dGb2xkZWQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dGb2xkRW5kIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uZ2V0RGlzcGxheUxpbmUiLCJFZGl0U2Vzc2lvbi4kY2xvbmVGb2xkRGF0YSIsIkVkaXRTZXNzaW9uLnRvZ2dsZUZvbGQiLCJFZGl0U2Vzc2lvbi5nZXRDb21tZW50Rm9sZFJhbmdlIiwiRWRpdFNlc3Npb24uZm9sZEFsbCIsIkVkaXRTZXNzaW9uLnNldEZvbGRTdHlsZSIsIkVkaXRTZXNzaW9uLiRzZXRGb2xkaW5nIiwiRWRpdFNlc3Npb24uZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSIsIkVkaXRTZXNzaW9uLm9uRm9sZFdpZGdldENsaWNrIiwiRWRpdFNlc3Npb24uJHRvZ2dsZUZvbGRXaWRnZXQiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udXBkYXRlRm9sZFdpZGdldHMiXSwibWFwcGluZ3MiOiJPQStCTyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFDLE1BQU0sVUFBVTtPQUVsRSxpQkFBaUIsTUFBTSxxQkFBcUI7T0FDNUMsUUFBUSxNQUFNLFlBQVk7T0FDMUIsSUFBSSxNQUFNLFFBQVE7T0FDbEIsU0FBUyxNQUFNLGFBQWE7T0FDNUIsSUFBSSxNQUFNLGFBQWE7T0FDdkIsS0FBSyxNQUFNLFNBQVM7T0FDcEIsY0FBYyxNQUFNLGtCQUFrQjtPQUN0QyxtQkFBbUIsTUFBTSx1QkFBdUI7T0FDaEQsZUFBZSxNQUFNLG1CQUFtQjtPQUN4QyxFQUFDLE1BQU0sRUFBQyxNQUFNLGVBQWU7T0FDN0IsWUFBWSxNQUFNLDZCQUE2QjtPQUUvQyxhQUFhLE1BQU0saUJBQWlCO0FBUTNDLElBQUksSUFBSSxHQUFHLENBQUMsRUFDUixRQUFRLEdBQUcsQ0FBQyxFQUNaLGlCQUFpQixHQUFHLENBQUMsRUFDckIsZ0JBQWdCLEdBQUcsQ0FBQyxFQUNwQixXQUFXLEdBQUcsQ0FBQyxFQUNmLEtBQUssR0FBRyxFQUFFLEVBQ1YsR0FBRyxHQUFHLEVBQUUsRUFDUixTQUFTLEdBQUcsRUFBRSxDQUFDO0FBSW5CLHFCQUFxQixDQUFTO0lBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNYQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDN0JBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENB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QTtRQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFNURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1RBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRXhEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNSQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2xCQSxJQUFJQTtZQUNBQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUU3QkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDbkJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLEdBQUdBLENBQUNBO2dCQUNBQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNaQSxDQUFDQSxRQUNNQSxLQUFLQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUNuREEsS0FBS0EsRUFBRUEsQ0FBQ0E7UUFDWkEsQ0FBQ0E7UUFFREEsSUFBSUEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDakJBLE9BQU9BLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3JEQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNWQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMzQ0EsQ0FBQ0E7SUFTTTlDLGFBQWFBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQzVDK0MsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBRTNDQSxPQUFPQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN0REEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQVNPL0MsY0FBY0EsQ0FBQ0EsV0FBbUJBO1FBQ3RDZ0QsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7SUFDekNBLENBQUNBO0lBUU9oRCxjQUFjQTtRQUNsQmlELE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQU9PakQsWUFBWUEsQ0FBQ0EsU0FBa0JBLElBQUlrRCxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUs1RWxELFlBQVlBLEtBQWNtRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUtuRG5ELGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDdkJvRCxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLENBQUNBO0lBU09wRCxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFjQTtRQUNoQ3FELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3BDQSxDQUFDQTtZQUNEQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLElBQUlBLGVBQWVBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLFVBQVVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEVBQUVBLFVBQVNBLENBQU1BO1lBQ3RDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDO2dCQUN0QixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDeEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUNYLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN0QixDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztnQkFDakIsQ0FBQztnQkFDRCxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUdkQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMzREEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT3JELGFBQWFBLENBQUNBLElBQVVBLEVBQUVBLGNBQXdCQTtRQUN0RHNELEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFdEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBR2xCQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUVuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQ3hCQSxDQUFDQTtRQUVEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUVwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5Q0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFEQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDL0RBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxtQkFBbUJBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNqQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsRUFBdUJBO2dCQUNqRSxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBO1FBRWpEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFHbENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUMxREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFHT3RELFdBQVdBO1FBQ2Z1RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBRU92RCxZQUFZQTtRQUNoQndELElBQUlBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2pEQSxDQUNBQTtRQUFBQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNTXhELE9BQU9BO1FBQ1Z5RCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFPTXpELFlBQVlBLENBQUNBLFNBQWlCQTtRQUVqQzBELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEtBQUtBLFNBQVNBLElBQUlBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUMvQ0EsQ0FBQ0E7SUFNTTFELFlBQVlBO1FBQ2YyRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFLTTNELGFBQWFBLENBQUNBLFVBQWtCQTtRQUVuQzRELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEtBQUtBLFVBQVVBLElBQUlBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUNqREEsQ0FBQ0E7SUFNTTVELGFBQWFBO1FBQ2hCNkQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBTU03RCxjQUFjQTtRQUNqQjhELElBQUlBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNwRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRU85RCxxQkFBcUJBO1FBQ3pCK0QsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxJQUFJQSxJQUFJQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBO1FBQ2hFQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxDQUFDQTtZQUMvQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7Z0JBQzNCLEtBQUssR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQzlCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBRU0vRCxhQUFhQSxDQUFDQSxLQUFlQTtRQUNoQ2dFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7WUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBO1lBQ2pDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUV2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEJBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO29CQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLENBQUNBO29CQUNWQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDdkNBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBO29CQUNqQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFdkRBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLGlCQUFpQkEsQ0FBQ0E7b0JBQzdCQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxpQkFBaUJBLENBQUNBO1FBQ3pDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQVVNaEUsT0FBT0EsQ0FBQ0EsR0FBV0E7UUFDdEJpRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFVTWpFLFFBQVFBLENBQUNBLFFBQWdCQSxFQUFFQSxPQUFlQTtRQUM3Q2tFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQU1NbEUsU0FBU0E7UUFDWm1FLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQVFNbkUsWUFBWUEsQ0FBQ0EsS0FBWUE7UUFDNUJvRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNyRUEsQ0FBQ0E7SUFVTXBFLE1BQU1BLENBQUNBLFFBQXlDQSxFQUFFQSxJQUFZQTtRQUNqRXFFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQVVNckUsTUFBTUEsQ0FBQ0EsS0FBWUE7UUFDdEJzRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFVTXRFLFdBQVdBLENBQUNBLE1BQU1BLEVBQUVBLFVBQW9CQTtRQUMzQ3VFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxJQUFJQSxhQUFhQSxHQUFVQSxJQUFJQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDM0NBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwQ0EsYUFBYUE7b0JBQ1RBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxTQUFTQTtvQkFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ25DLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDYkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDdkJBLGFBQWFBO1lBQ1RBLElBQUlBLENBQUNBLFdBQVdBO1lBQ2hCQSxDQUFDQSxVQUFVQTtZQUNYQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxpQkFBaUJBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3BEQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQTtJQUN6QkEsQ0FBQ0E7SUFVTXZFLFdBQVdBLENBQUNBLE1BQU1BLEVBQUVBLFVBQW9CQTtRQUMzQ3dFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxJQUFJQSxhQUFhQSxHQUFVQSxJQUFJQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNuQ0EsYUFBYUE7b0JBQ1RBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZCQSxhQUFhQTtZQUNUQSxJQUFJQSxDQUFDQSxXQUFXQTtZQUNoQkEsQ0FBQ0EsVUFBVUE7WUFDWEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNwREEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBT094RSxhQUFhQSxDQUFDQSxNQUFlQTtRQUNqQ3lFLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLE1BQU1BLENBQUNBO0lBQzlCQSxDQUFDQTtJQUVPekUsaUJBQWlCQSxDQUFDQSxNQUEwQ0EsRUFBRUEsTUFBZUEsRUFBRUEsYUFBb0JBO1FBQ3ZHMEUsa0JBQWtCQSxLQUF5QkE7WUFDdkNDLElBQUlBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLFlBQVlBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLGFBQWFBLENBQUNBO1lBQzdFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFFREQsSUFBSUEsS0FBS0EsR0FBcUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxLQUFZQSxDQUFDQTtRQUNqQkEsSUFBSUEsS0FBc0NBLENBQUNBO1FBQzNDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9EQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxH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Q0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQzlCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDOUIsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDO2dCQUM1QixDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDO2dCQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQyxDQUFDQSxDQUFDQSxDQUFDQTtRQUNSQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFZTTdFLFVBQVVBLENBQUNBLFFBQWdCQSxFQUFFQSxNQUFjQSxFQUFFQSxZQUFvQkE7UUFDcEU4RSxZQUFZQSxHQUFHQSxZQUFZQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNoRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsRUFBRUEsR0FBR0EsSUFBSUEsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUE7WUFDekNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO0lBQzNEQSxDQUFDQTtJQVFNOUUsV0FBV0EsQ0FBQ0EsS0FBWUE7UUFDM0IrRSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUNwQ0EsSUFBSUEsV0FBV0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBRTdCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUMxREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtvQkFDdEJBLEtBQUtBLENBQUNBO1lBQ2RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxN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LE1BQU1BO1FBQ2hDcUYsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDMURBLENBQUNBO0lBR09yRix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQ3ZEc0YsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQzlDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFB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QUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLElBQUlBLEdBQUdBLEdBQUdBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUFBO2dCQUM3REEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBSTVCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNYQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFBQTtvQkFFL0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNYQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDbkRBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO3dCQUN2QkEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FDbkJBLE9BQU9BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMvQ0EsQ0FBQ0E7b0JBQUNBLElBQUlBLENBRUZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNaQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDaEVBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7b0JBRUxBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMxQ0EsQ0FBQ0E7Z0JBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBO29CQUN0Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDakNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBR0pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1B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QUFFQSxNQUFlQTtRQUNsRHFHLElBQUlBLEdBQUdBLEdBQWFBLEVBQUVBLENBQUNBO1FBQ3ZCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUNwQkEsTUFBTUEsR0FBR0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFckJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQy9CQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDeEJBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hEQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM3QkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ25CQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNmQSxDQUFDQTtJQVlNckcscUJBQXFCQSxDQUFDQSxHQUFXQSxFQUFFQSxlQUF3QkEsRUFBRUEsWUFBcUJBO1FBQ3JGc0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxlQUFlQSxJQUFJQSxJQUFJQSxDQUFDQTtZQUN4QkEsZUFBZUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDL0JBLFlBQVlBLEdBQUdBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBO1FBRWpDQSxJQUFJQSxDQUFTQSxDQUFDQTtRQUNkQSxJQUFJQSxNQUFjQSxDQUFDQTtRQUNuQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBRTNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsWUFBWUEsSUFBSUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtZQUN4REEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxZQUFZQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBO1lBQ3RCQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakNBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLENBQUNBLFlBQVlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2xDQSxDQUFDQTtJQVFNdEcsWUFBWUEsQ0FBQ0EsR0FBV0E7UUFDM0J1RyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNqQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDekVBLElBQUlBO1lBQ0FBLENBQUNBLEdBQUdBLENBQUNBLENBQUFBO1FBQ1RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENB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QUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUN4QkEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDcEJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQy9CQSxJQUFJQSxVQUFVQSxHQUFXQSxFQUFFQSxDQUFDQTtRQUU1QkEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRWhCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN4Q0EsSUFBSUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdYQSxRQUFRQSxDQUFDQTtZQUNiQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFHakJBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBRURBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQy9CQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDcENBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWkEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbEJBLFFBQVFBLENBQUNBO2dCQUNiQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FFRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1pBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtnQkFDTEEsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBQ2xCQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVoQkEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBRUQ3SCxtQkFBbUJBLENBQUNBLE1BQU1BO1FBQ3RCOEgsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLEtBQUtBLEdBQVdBLEVBQUVBLENBQUNBO1lBQ3ZCQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxLQUFLQTtnQkFDekIsS0FBSyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3RELENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDYkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUtEOUgsV0FBV0E7UUFDUCtILElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRS9CQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUNyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUE7Z0JBQzlDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUxQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBbUJEL0gsZUFBZUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0EsRUFBRUEsSUFBWUEsRUFBRUEsUUFBbUJBO1FBQzFFZ0ksUUFBUUEsR0FBR0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO1lBQ1ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBRWhCQSxJQUFJQSxRQUFRQSxHQUFHQTtZQUNYQSxHQUFHQSxFQUFFQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtTQUNyQkEsQ0FBQ0E7UUFFRkEsSUFBSUEsR0FBV0EsQ0FBQ0E7UUFDaEJBLElBQUlBLElBQVVBLENBQUNBO1FBQ2ZBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzdDQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckZBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNMQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUV0RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQTtZQUNBQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFFRGhJLFdBQVdBLENBQUNBLE1BQWNBLEVBQUVBLGFBQXdCQTtRQUNoRGlJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxhQUFhQSxDQUFDQTtZQUNkQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLFFB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Q0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRWhCQSxJQUFJQSxZQUFZQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbkNBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO3dCQUVuREEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7d0JBQzdCQSxLQUFLQSxDQUFDQTtvQkFDVkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1BBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXZFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakVBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHdkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV4REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURySSxXQUFXQSxDQUFDQSxRQUFpQkE7SUFFN0JzSSxDQUFDQTtJQUVEdEksUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJ1SSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFFRHZJLFVBQVVBLENBQUNBLElBQVVBO1FBQ2pCd0ksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2xDQSxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUU5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1FBRzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNaQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNuREEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDN0RBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4Q0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbERBLENBQUNBO1FBQ0RBLElBQUlBLENBS0FBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNHQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdB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RUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN2QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDbkNBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzVFQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxDQUFDQTtZQUN2QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBO1lBQ0FBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXJCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFHckJBLE9BQU9BLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNyQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FB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QUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7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SUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFFT3RKLFdBQVdBLENBQUNBLFFBQVFBO1FBQ3hCdUosRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDM0JBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBO1FBRTFCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1FBRS9CQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxJQUFJQSxDQUFDQSxVQUFVQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3RCQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNsRkEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxRQUFRQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBRTVGQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdB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QUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNB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akIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUV4RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztZQUN4QixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFBLENBQUMsQ0FBQztRQUNwRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELElBQUksRUFBRTtRQUNGLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN4QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFDLENBQUM7S0FDMUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtfc2lnbmFsLCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IEFubm90YXRpb24gZnJvbSAnLi9Bbm5vdGF0aW9uJztcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IEZvbGRMaW5lIGZyb20gXCIuL0ZvbGRMaW5lXCI7XG5pbXBvcnQgRm9sZCBmcm9tIFwiLi9Gb2xkXCI7XG5pbXBvcnQgU2VsZWN0aW9uIGZyb20gXCIuL1NlbGVjdGlvblwiO1xuaW1wb3J0IE1vZGUgZnJvbSBcIi4vbW9kZS9Nb2RlXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4vUmFuZ2VcIjtcbmltcG9ydCBFZGl0b3JEb2N1bWVudCBmcm9tIFwiLi9FZGl0b3JEb2N1bWVudFwiO1xuaW1wb3J0IEJhY2tncm91bmRUb2tlbml6ZXIgZnJvbSBcIi4vQmFja2dyb3VuZFRva2VuaXplclwiO1xuaW1wb3J0IFNlYXJjaEhpZ2hsaWdodCBmcm9tIFwiLi9TZWFyY2hIaWdobGlnaHRcIjtcbmltcG9ydCB7YXNzZXJ0fSBmcm9tICcuL2xpYi9hc3NlcnRzJztcbmltcG9ydCBCcmFja2V0TWF0Y2ggZnJvbSBcIi4vZWRpdF9zZXNzaW9uL0JyYWNrZXRNYXRjaFwiO1xuaW1wb3J0IFVuZG9NYW5hZ2VyIGZyb20gJy4vVW5kb01hbmFnZXInXG5pbXBvcnQgVG9rZW5JdGVyYXRvciBmcm9tICcuL1Rva2VuSXRlcmF0b3InO1xuaW1wb3J0IEZvbnRNZXRyaWNzIGZyb20gXCIuL2xheWVyL0ZvbnRNZXRyaWNzXCI7XG5pbXBvcnQgV29ya2VyQ2xpZW50IGZyb20gXCIuL3dvcmtlci9Xb3JrZXJDbGllbnRcIjtcbmltcG9ydCBMaW5lV2lkZ2V0IGZyb20gJy4vTGluZVdpZGdldCc7XG5pbXBvcnQgTGluZVdpZGdldHMgZnJvbSAnLi9MaW5lV2lkZ2V0cyc7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSAnLi9Qb3NpdGlvbic7XG5cbi8vIFwiVG9rZW5zXCJcbnZhciBDSEFSID0gMSxcbiAgICBDSEFSX0VYVCA9IDIsXG4gICAgUExBQ0VIT0xERVJfU1RBUlQgPSAzLFxuICAgIFBMQUNFSE9MREVSX0JPRFkgPSA0LFxuICAgIFBVTkNUVUFUSU9OID0gOSxcbiAgICBTUEFDRSA9IDEwLFxuICAgIFRBQiA9IDExLFxuICAgIFRBQl9TUEFDRSA9IDEyO1xuXG4vLyBGb3IgZXZlcnkga2V5c3Ryb2tlIHRoaXMgZ2V0cyBjYWxsZWQgb25jZSBwZXIgY2hhciBpbiB0aGUgd2hvbGUgZG9jISFcbi8vIFdvdWxkbid0IGh1cnQgdG8gbWFrZSBpdCBhIGJpdCBmYXN0ZXIgZm9yIGMgPj0gMHgxMTAwXG5mdW5jdGlvbiBpc0Z1bGxXaWR0aChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAoYyA8IDB4MTEwMClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBjID49IDB4MTEwMCAmJiBjIDw9IDB4MTE1RiB8fFxuICAgICAgICBjID49IDB4MTFBMyAmJiBjIDw9IDB4MTFBNyB8fFxuICAgICAgICBjID49IDB4MTFGQSAmJiBjIDw9IDB4MTFGRiB8fFxuICAgICAgICBjID49IDB4MjMyOSAmJiBjIDw9IDB4MjMyQSB8fFxuICAgICAgICBjID49IDB4MkU4MCAmJiBjIDw9IDB4MkU5OSB8fFxuICAgICAgICBjID49IDB4MkU5QiAmJiBjIDw9IDB4MkVGMyB8fFxuICAgICAgICBjID49IDB4MkYwMCAmJiBjIDw9IDB4MkZENSB8fFxuICAgICAgICBjID49IDB4MkZGMCAmJiBjIDw9IDB4MkZGQiB8fFxuICAgICAgICBjID49IDB4MzAwMCAmJiBjIDw9IDB4MzAzRSB8fFxuICAgICAgICBjID49IDB4MzA0MSAmJiBjIDw9IDB4MzA5NiB8fFxuICAgICAgICBjID49IDB4MzA5OSAmJiBjIDw9IDB4MzBGRiB8fFxuICAgICAgICBjID49IDB4MzEwNSAmJiBjIDw9IDB4MzEyRCB8fFxuICAgICAgICBjID49IDB4MzEzMSAmJiBjIDw9IDB4MzE4RSB8fFxuICAgICAgICBjID49IDB4MzE5MCAmJiBjIDw9IDB4MzFCQSB8fFxuICAgICAgICBjID49IDB4MzFDMCAmJiBjIDw9IDB4MzFFMyB8fFxuICAgICAgICBjID49IDB4MzFGMCAmJiBjIDw9IDB4MzIxRSB8fFxuICAgICAgICBjID49IDB4MzIyMCAmJiBjIDw9IDB4MzI0NyB8fFxuICAgICAgICBjID49IDB4MzI1MCAmJiBjIDw9IDB4MzJGRSB8fFxuICAgICAgICBjID49IDB4MzMwMCAmJiBjIDw9IDB4NERCRiB8fFxuICAgICAgICBjID49IDB4NEUwMCAmJiBjIDw9IDB4QTQ4QyB8fFxuICAgICAgICBjID49IDB4QTQ5MCAmJiBjIDw9IDB4QTRDNiB8fFxuICAgICAgICBjID49IDB4QTk2MCAmJiBjIDw9IDB4QTk3QyB8fFxuICAgICAgICBjID49IDB4QUMwMCAmJiBjIDw9IDB4RDdBMyB8fFxuICAgICAgICBjID49IDB4RDdCMCAmJiBjIDw9IDB4RDdDNiB8fFxuICAgICAgICBjID49IDB4RDdDQiAmJiBjIDw9IDB4RDdGQiB8fFxuICAgICAgICBjID49IDB4RjkwMCAmJiBjIDw9IDB4RkFGRiB8fFxuICAgICAgICBjID49IDB4RkUxMCAmJiBjIDw9IDB4RkUxOSB8fFxuICAgICAgICBjID49IDB4RkUzMCAmJiBjIDw9IDB4RkU1MiB8fFxuICAgICAgICBjID49IDB4RkU1NCAmJiBjIDw9IDB4RkU2NiB8fFxuICAgICAgICBjID49IDB4RkU2OCAmJiBjIDw9IDB4RkU2QiB8fFxuICAgICAgICBjID49IDB4RkYwMSAmJiBjIDw9IDB4RkY2MCB8fFxuICAgICAgICBjID49IDB4RkZFMCAmJiBjIDw9IDB4RkZFNjtcbn1cblxuLyoqXG4gKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAqIEBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gICAgcHVibGljICRkZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlICRmcm9udE1hcmtlcnMgPSB7fTtcbiAgICBwdWJsaWMgJGJhY2tNYXJrZXJzID0ge307XG4gICAgcHJpdmF0ZSAkbWFya2VySWQgPSAxO1xuICAgIHByaXZhdGUgJHVuZG9TZWxlY3QgPSB0cnVlO1xuICAgIHByaXZhdGUgJGRlbHRhcztcbiAgICBwcml2YXRlICRkZWx0YXNEb2M7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRm9sZDtcbiAgICBwcml2YXRlICRmcm9tVW5kbztcblxuICAgIHB1YmxpYyB3aWRnZXRNYW5hZ2VyOiBMaW5lV2lkZ2V0cztcbiAgICBwcml2YXRlICR1cGRhdGVGb2xkV2lkZ2V0czogKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pID0+IGFueTtcbiAgICBwcml2YXRlICRmb2xkRGF0YTogRm9sZExpbmVbXTtcbiAgICBwdWJsaWMgZm9sZFdpZGdldHM6IGFueVtdO1xuICAgIHB1YmxpYyBnZXRGb2xkV2lkZ2V0OiAocm93OiBudW1iZXIpID0+IGFueTtcbiAgICBwdWJsaWMgZ2V0Rm9sZFdpZGdldFJhbmdlOiAocm93OiBudW1iZXIsIGZvcmNlTXVsdGlsaW5lPzogYm9vbGVhbikgPT4gUmFuZ2U7XG4gICAgcHVibGljIF9jaGFuZ2VkV2lkZ2V0czogTGluZVdpZGdldFtdO1xuXG4gICAgcHVibGljIGRvYzogRWRpdG9yRG9jdW1lbnQ7XG4gICAgcHJpdmF0ZSAkZGVmYXVsdFVuZG9NYW5hZ2VyID0geyB1bmRvOiBmdW5jdGlvbigpIHsgfSwgcmVkbzogZnVuY3Rpb24oKSB7IH0sIHJlc2V0OiBmdW5jdGlvbigpIHsgfSB9O1xuICAgIHByaXZhdGUgJHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcjtcbiAgICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gICAgcHVibGljIGJnVG9rZW5pemVyOiBCYWNrZ3JvdW5kVG9rZW5pemVyO1xuICAgIHB1YmxpYyAkbW9kaWZpZWQ7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb246IFNlbGVjdGlvbjtcbiAgICBwcml2YXRlICRkb2NSb3dDYWNoZTogbnVtYmVyW107XG4gICAgcHJpdmF0ZSAkd3JhcERhdGE6IG51bWJlcltdW107XG4gICAgcHJpdmF0ZSAkc2NyZWVuUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHJvd0xlbmd0aENhY2hlO1xuICAgIHByaXZhdGUgJG92ZXJ3cml0ZSA9IGZhbHNlO1xuICAgIHB1YmxpYyAkc2VhcmNoSGlnaGxpZ2h0OiBTZWFyY2hIaWdobGlnaHQ7XG4gICAgcHJpdmF0ZSAkYW5ub3RhdGlvbnM6IEFubm90YXRpb25bXTtcbiAgICBwcml2YXRlICRhdXRvTmV3TGluZTtcbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcbiAgICBwcml2YXRlICR1c2VXb3JrZXI7XG4gICAgLyoqXG4gICAgICpcbiAgICAgKi9cbiAgICBwcml2YXRlICRtb2RlczogeyBbcGF0aDogc3RyaW5nXTogTW9kZSB9ID0ge307XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHB1YmxpYyAkbW9kZTogTW9kZSA9IG51bGw7XG4gICAgcHJpdmF0ZSAkbW9kZUlkID0gbnVsbDtcbiAgICAvKipcbiAgICAgKiBUaGUgd29ya2VyIGNvcnJlc3BvbmRpbmcgdG8gdGhlIG1vZGUgKGkuZS4gTGFuZ3VhZ2UpLlxuICAgICAqL1xuICAgIHByaXZhdGUgJHdvcmtlcjogV29ya2VyQ2xpZW50O1xuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgbm9uVG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyAkc2Nyb2xsVG9wID0gMDtcbiAgICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgICAvLyBXUkFQTU9ERVxuICAgIHByaXZhdGUgJHdyYXBBc0NvZGU7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gICAgcHVibGljICR1c2VXcmFwTW9kZSA9IGZhbHNlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICBtaW46IG51bGwsXG4gICAgICAgIG1heDogbnVsbFxuICAgIH07XG4gICAgcHVibGljICR1cGRhdGluZztcbiAgICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgICBwcml2YXRlICRzeW5jSW5mb3JtVW5kb01hbmFnZXI6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIG1lcmdlVW5kb0RlbHRhczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR0YWJTaXplOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkd3JhcE1ldGhvZDtcbiAgICBwcml2YXRlIHNjcmVlbldpZHRoOiBudW1iZXI7XG4gICAgcHVibGljIGxpbmVXaWRnZXRzOiBMaW5lV2lkZ2V0W10gPSBudWxsO1xuICAgIHByaXZhdGUgbGluZVdpZGdldHNXaWR0aDogbnVtYmVyO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0V2lkdGg6IG51bWJlcjtcbiAgICBwdWJsaWMgJGdldFdpZGdldFNjcmVlbkxlbmd0aDtcbiAgICAvL1xuICAgIHB1YmxpYyAkdGFnSGlnaGxpZ2h0O1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgYSBtYXJrZXIgaWRlbnRpZmllci5cbiAgICAgKi9cbiAgICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBUaGlzIGlzIHJlYWxseSBhIFJhbmdlIHdpdGggYW4gYWRkZWQgbWFya2VyIGlkLlxuICAgICAqL1xuICAgIHB1YmxpYyAkaGlnaGxpZ2h0TGluZU1hcmtlcjogUmFuZ2U7XG4gICAgLyoqXG4gICAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgICAqL1xuICAgIHB1YmxpYyAkc2VsZWN0aW9uTWFya2VyOiBudW1iZXIgPSBudWxsO1xuICAgIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyID0gbmV3IEJyYWNrZXRNYXRjaCh0aGlzKTtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBkb2Mge0VkaXRvckRvY3VtZW50fVxuICAgICAqIEBwYXJhbSBbbW9kZV1cbiAgICAgKiBAcGFyYW0gW2NiXVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGRvYzogRWRpdG9yRG9jdW1lbnQsIG1vZGU/LCBjYj86ICgpID0+IGFueSkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zZXREb2N1bWVudChkb2MpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24odGhpcyk7XG5cbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGUobW9kZSwgY2IpO1xuICAgICAgICBfc2lnbmFsKFwic2Vzc2lvblwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBgRWRpdFNlc3Npb25gIHRvIHBvaW50IHRvIGEgbmV3IGBFZGl0b3JEb2N1bWVudGAuXG4gICAgICogSWYgYSBgQmFja2dyb3VuZFRva2VuaXplcmAgZXhpc3RzLCBpdCBhbHNvIHBvaW50cyB0byBgZG9jYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gZG9jIHtFZGl0b3JEb2N1bWVudH0gVGhlIG5ldyBgRWRpdG9yRG9jdW1lbnRgIHRvIHVzZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBFZGl0b3JEb2N1bWVudCk6IHZvaWQge1xuICAgICAgICBpZiAoIShkb2MgaW5zdGFuY2VvZiBFZGl0b3JEb2N1bWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImRvYyBtdXN0IGJlIGEgRWRpdG9yRG9jdW1lbnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZG9jKSB7XG4gICAgICAgICAgICB0aGlzLmRvYy5vZmYoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5kb2MgPSBkb2M7XG4gICAgICAgIGRvYy5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG5cbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmVzZXRDYWNoZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBgRWRpdG9yRG9jdW1lbnRgIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAgICogQHJldHVybiB7RWRpdG9yRG9jdW1lbnR9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50KCk6IEVkaXRvckRvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0gZG9jUm93IHtudW1iZXJ9IFRoZSByb3cgdG8gd29yayB3aXRoLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRyZXNldFJvd0NhY2hlKGRvY1JvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICghZG9jUm93KSB7XG4gICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbCA9IHRoaXMuJGRvY1Jvd0NhY2hlLmxlbmd0aDtcbiAgICAgICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHRoaXMuJGRvY1Jvd0NhY2hlLCBkb2NSb3cpICsgMTtcbiAgICAgICAgaWYgKGwgPiBpKSB7XG4gICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRSb3dDYWNoZUluZGV4KGNhY2hlQXJyYXk6IG51bWJlcltdLCB2YWw6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBsb3cgPSAwO1xuICAgICAgICB2YXIgaGkgPSBjYWNoZUFycmF5Lmxlbmd0aCAtIDE7XG5cbiAgICAgICAgd2hpbGUgKGxvdyA8PSBoaSkge1xuICAgICAgICAgICAgdmFyIG1pZCA9IChsb3cgKyBoaSkgPj4gMTtcbiAgICAgICAgICAgIHZhciBjID0gY2FjaGVBcnJheVttaWRdO1xuXG4gICAgICAgICAgICBpZiAodmFsID4gYykge1xuICAgICAgICAgICAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh2YWwgPCBjKSB7XG4gICAgICAgICAgICAgICAgaGkgPSBtaWQgLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1pZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsb3cgLSAxO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzZXRDYWNoZXMoKSB7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBbXTtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlRm9sZChlKSB7XG4gICAgICAgIHZhciBmb2xkID0gZS5kYXRhO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGZvbGQuc3RhcnQucm93KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGUsIGRvYzogRWRpdG9yRG9jdW1lbnQpIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG5cbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZShkZWx0YS5yYW5nZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSB0aGlzLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKTtcbiAgICAgICAgaWYgKCF0aGlzLiRmcm9tVW5kbyAmJiB0aGlzLiR1bmRvTWFuYWdlciAmJiAhZGVsdGEuaWdub3JlKSB7XG4gICAgICAgICAgICB0aGlzLiRkZWx0YXNEb2MucHVzaChkZWx0YSk7XG4gICAgICAgICAgICBpZiAocmVtb3ZlZEZvbGRzICYmIHJlbW92ZWRGb2xkcy5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJyZW1vdmVGb2xkc1wiLFxuICAgICAgICAgICAgICAgICAgICBmb2xkczogcmVtb3ZlZEZvbGRzXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLnNjaGVkdWxlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLiR1cGRhdGVPbkNoYW5nZShkZWx0YSk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVwiLCBlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzZXNzaW9uIHRleHQuXG4gICAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBwbGFjZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRWYWx1ZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0VmFsdWUodGV4dCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgdGhpcy5zZXRVbmRvTWFuYWdlcih0aGlzLiR1bmRvTWFuYWdlcik7XG4gICAgICAgIHRoaXMuZ2V0VW5kb01hbmFnZXIoKS5yZXNldCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRWRpdG9yRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICAqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRWRpdG9yRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFZhbHVlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAgICAqL1xuICAgIHB1YmxpYyBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0aW9uXG4gICAgICogQHJldHVybiB7U2VsZWN0aW9ufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25cbiAgICAgKiBAcGFyYW0gc2VsZWN0aW9uIHtTZWxlY3Rpb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0U3RhdGVcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuXG4gICAgICogVGhlIG9iamVjdCBoYXMgdHdvIHByb3BlcnRpZXM6IGBpbmRleGAgYW5kIGBzdGFydGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRva2VuQXRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb20uXG4gICAgICovXG4gICAgcHVibGljIGdldFRva2VuQXQocm93OiBudW1iZXIsIGNvbHVtbj86IG51bWJlcikge1xuICAgICAgICB2YXIgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgIGlmIChjb2x1bW4gPT0gbnVsbCkge1xuICAgICAgICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgdG9rZW4uaW5kZXggPSBpO1xuICAgICAgICB0b2tlbi5zdGFydCA9IGMgLSB0b2tlbi52YWx1ZS5sZW5ndGg7XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFVuZG9NYW5hZ2VyXG4gICAgICogQHBhcmFtIHVuZG9NYW5hZ2VyIHtVbmRvTWFuYWdlcn0gVGhlIG5ldyB1bmRvIG1hbmFnZXIuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0VW5kb01hbmFnZXIodW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHVuZG9NYW5hZ2VyID0gdW5kb01hbmFnZXI7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuXG4gICAgICAgIGlmICh0aGlzLiRpbmZvcm1VbmRvTWFuYWdlcilcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmICh1bmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBzZWxmLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNGb2xkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJmb2xkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0ZvbGRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRG9jLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJkb2NcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRG9jXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdW5kb01hbmFnZXIuZXhlY3V0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwiYWNldXBkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzOiBbc2VsZi4kZGVsdGFzLCBzZWxmXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lcmdlOiBzZWxmLm1lcmdlVW5kb0RlbHRhc1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2VsZi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlciA9IGRlbGF5ZWRDYWxsKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgYSBuZXcgZ3JvdXAgaW4gdW5kbyBoaXN0b3J5LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtYXJrVW5kb0dyb3VwXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgbWFya1VuZG9Hcm91cCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHVuZG8gbWFuYWdlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VW5kb01hbmFnZXJcbiAgICAgKiBAcmV0dXJuIHtVbmRvTWFuYWdlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VW5kb01hbmFnZXIoKTogVW5kb01hbmFnZXIge1xuICAgICAgICAvLyBGSVhNRTogV2FudCBzaW1wbGUgQVBJLCBkb24ndCB3YW50IHRvIGNhc3QuXG4gICAgICAgIHJldHVybiB0aGlzLiR1bmRvTWFuYWdlciB8fCA8VW5kb01hbmFnZXI+dGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuXG4gICAgICogSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRhYlN0cmluZ1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VGFiU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBgdHJ1ZWAgdG8gZW5hYmxlIHRoZSB1c2Ugb2Ygc29mdCB0YWJzLlxuICAgICAqIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRVc2VTb2Z0VGFic1xuICAgICAqIEBwYXJhbSB1c2VTb2Z0VGFicyB7Ym9vbGVhbn0gVmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0byB1c2Ugc29mdCB0YWJzLlxuICAgICAqIEByZXR1cm4ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFVzZVNvZnRUYWJzKHVzZVNvZnRUYWJzOiBib29sZWFuKTogRWRpdFNlc3Npb24ge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInVzZVNvZnRUYWJzXCIsIHVzZVNvZnRUYWJzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VXNlU29mdFRhYnNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpOiBib29sZWFuIHtcbiAgICAgICAgLy8gdG9kbyBtaWdodCBuZWVkIG1vcmUgZ2VuZXJhbCB3YXkgZm9yIGNoYW5naW5nIHNldHRpbmdzIGZyb20gbW9kZSwgYnV0IHRoaXMgaXMgb2sgZm9yIG5vd1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgIXRoaXMuJG1vZGUuJGluZGVudFdpdGhUYWJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICAgKiBGb3IgZXhhbXBsZSwgcGFzc2luZyBpbiBgNGAgdHJhbnNmb3JtcyB0aGUgc29mdCB0YWJzIHRvIGJlIGVxdWl2YWxlbnQgdG8gZm91ciBzcGFjZXMuXG4gICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB0YWJTaXplIFRoZSBuZXcgdGFiIHNpemVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidGFiU2l6ZVwiLCB0YWJTaXplKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGFiIHNpemUuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBjaGVja1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS5cbiAgICAqXG4gICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICpcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICAgKiovXG4gICAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPdmVyd3JpdGUoIXRoaXMuJG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBgY2xhc3NOYW1lYCB0byB0aGUgYHJvd2AsIHRvIGJlIHVzZWQgZm9yIENTUyBzdHlsaW5ncyBhbmQgd2hhdG5vdC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBgY2xhc3NOYW1lYCBmcm9tIHRoZSBgcm93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICogQHJldHVybiB7W051bWJlcl19XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRCcmVha3BvaW50cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyZWFrcG9pbnRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gZXZlcnkgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gcm93cyBBbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludHMocm93czogbnVtYmVyW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLiRicmVha3BvaW50c1tyb3dzW2ldXSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgYWxsIGJyZWFrcG9pbnRzIG9uIHRoZSByb3dzLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgQ2xhc3Mgb2YgdGhlIGJyZWFrcG9pbnRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludChyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkZHMgYSBuZXcgbWFya2VyIHRvIHRoZSBnaXZlbiBgUmFuZ2VgLiBJZiBgaW5Gcm9udGAgaXMgYHRydWVgLCBhIGZyb250IG1hcmtlciBpcyBkZWZpbmVkLCBhbmQgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBmaXJlczsgb3RoZXJ3aXNlLCB0aGUgYCdjaGFuZ2VCYWNrTWFya2VyJ2AgZXZlbnQgZmlyZXMuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGF6eiBTZXQgdGhlIENTUyBjbGFzcyBmb3IgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtGdW5jdGlvbiB8IFN0cmluZ30gdHlwZSBJZGVudGlmeSB0aGUgdHlwZSBvZiB0aGUgbWFya2VyLlxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogc3RyaW5nLCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgLy8gRklYTUU6IE5lZWQgbW9yZSB0eXBlIHNhZmV0eSBoZXJlLlxuICAgICAgICB2YXIgbWFya2VyID0ge1xuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgICAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICAgICAgICBjbGF6ejogY2xhenosXG4gICAgICAgICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICAgICAgICBpZDogaWRcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG1hcmtlciBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGFkZGVkIG1hcmtlclxuICAgICAqKi9cbiAgICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyLCBpbkZyb250Pykge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG4gICAgICAgIG1hcmtlci5pZCA9IGlkO1xuICAgICAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIHRoZSBtYXJrZXIgd2l0aCB0aGUgc3BlY2lmaWVkIElELiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC4gSWYgdGhlIG1hcmtlciB3YXMgaW4gdGhlIGJhY2ssIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgbWFya2VyID0gdGhpcy4kZnJvbnRNYXJrZXJzW21hcmtlcklkXSB8fCB0aGlzLiRiYWNrTWFya2Vyc1ttYXJrZXJJZF07XG4gICAgICAgIGlmICghbWFya2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICAgICAgaWYgKG1hcmtlcikge1xuICAgICAgICAgICAgZGVsZXRlIChtYXJrZXJzW21hcmtlcklkXSk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwobWFya2VyLmluRnJvbnQgPyBcImNoYW5nZUZyb250TWFya2VyXCIgOiBcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgSURzIG9mIGFsbCB0aGUgbWFya2VycywgZWl0aGVyIGZyb250IG9yIGJhY2suXG4gICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluRnJvbnQgSWYgYHRydWVgLCBpbmRpY2F0ZXMgeW91IG9ubHkgd2FudCBmcm9udCBtYXJrZXJzOyBgZmFsc2VgIGluZGljYXRlcyBvbmx5IGJhY2sgbWFya2Vyc1xuICAgICpcbiAgICAqIEByZXR1cm4ge0FycmF5fVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNYXJrZXJzKGluRnJvbnQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGlnaGxpZ2h0KHJlOiBSZWdFeHApIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzZWFyY2hIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciBoaWdobGlnaHQgPSBuZXcgU2VhcmNoSGlnaGxpZ2h0KG51bGwsIFwiYWNlX3NlbGVjdGVkLXdvcmRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0ID0gdGhpcy5hZGREeW5hbWljTWFya2VyKGhpZ2hsaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgY2xheno6IHN0cmluZyA9IFwiYWNlX3N0ZXBcIiwgaW5Gcm9udD86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRSb3csIDAsIGVuZFJvdywgSW5maW5pdHkpO1xuICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqIFRoaXMgZnVuY3Rpb25zIGVtaXRzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QW5ub3RhdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Fubm90YXRpb25bXX0gYW5ub3RhdGlvbnMgQSBsaXN0IG9mIGFubm90YXRpb25zLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zOiBBbm5vdGF0aW9uW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYW5ub3RhdGlvbnMgPSBhbm5vdGF0aW9ucztcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQW5ub3RhdGlvblwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRBbm5vdGF0aW9uc1xuICAgICAqIEByZXR1cm4ge0Fubm90YXRpb25bXX1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMoKTogQW5ub3RhdGlvbltdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFubm90YXRpb25zIHx8IFtdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFycyBhbGwgdGhlIGFubm90YXRpb25zIGZvciB0aGlzIHNlc3Npb24uXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIHRyaWdnZXJzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAgKiBUaGlzIGlzIGNhbGxlZCBieSB0aGUgbGFuZ3VhZ2UgbW9kZXMgd2hlbiB0aGUgd29ya2VyIHRlcm1pbmF0ZXMuXG4gICAgICovXG4gICAgcHVibGljIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IHRleHQubWF0Y2goL14uKj8oXFxyP1xcbikvbSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBtYXRjaFsxXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gXCJcXG5cIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdGFydGluZyByb3cgYW5kIGNvbHVtbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgYFJhbmdlYCBvZiB0aGUgZmlyc3Qgd29yZCBib3VuZGFyeSBpdCBmaW5kcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIGdldFdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciBsaW5lOiBzdHJpbmcgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgICAgICB2YXIgaW5Ub2tlbiA9IGZhbHNlO1xuICAgICAgICBpZiAoY29sdW1uID4gMClcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbiAtIDEpLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKCFpblRva2VuKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmIChpblRva2VuKVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy50b2tlblJlO1xuICAgICAgICBlbHNlIGlmICgvXlxccyskLy50ZXN0KGxpbmUuc2xpY2UoY29sdW1uIC0gMSwgY29sdW1uICsgMSkpKVxuICAgICAgICAgICAgdmFyIHJlID0gL1xccy87XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMubm9uVG9rZW5SZTtcblxuICAgICAgICB2YXIgc3RhcnQgPSBjb2x1bW47XG4gICAgICAgIGlmIChzdGFydCA+IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBzdGFydC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKHN0YXJ0ID49IDAgJiYgbGluZS5jaGFyQXQoc3RhcnQpLm1hdGNoKHJlKSk7XG4gICAgICAgICAgICBzdGFydCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVuZCA9IGNvbHVtbjtcbiAgICAgICAgd2hpbGUgKGVuZCA8IGxpbmUubGVuZ3RoICYmIGxpbmUuY2hhckF0KGVuZCkubWF0Y2gocmUpKSB7XG4gICAgICAgICAgICBlbmQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUmFuZ2Uocm93LCBzdGFydCwgcm93LCBlbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2V0cyB0aGUgcmFuZ2Ugb2YgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICpcbiAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRBV29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgdmFyIHdvcmRSYW5nZSA9IHRoaXMuZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUod29yZFJhbmdlLmVuZC5yb3cpO1xuXG4gICAgICAgIHdoaWxlIChsaW5lLmNoYXJBdCh3b3JkUmFuZ2UuZW5kLmNvbHVtbikubWF0Y2goL1sgXFx0XS8pKSB7XG4gICAgICAgICAgICB3b3JkUmFuZ2UuZW5kLmNvbHVtbiArPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHdvcmRSYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGUuZGVzY31cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBuZXdMaW5lTW9kZSB7OkVkaXRvckRvY3VtZW50LnNldE5ld0xpbmVNb2RlLnBhcmFtfVxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZVxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBuZXcgbGluZSBtb2RlLlxuICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIGdldE5ld0xpbmVNb2RlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyBpZiB5b3Ugd2FudCB0byB1c2UgYSB3b3JrZXIgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXJcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VXb3JrZXIodXNlV29ya2VyOiBib29sZWFuKSB7IHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7IH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd29ya2VycyBhcmUgYmVpbmcgdXNlZC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFVzZVdvcmtlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuJHVzZVdvcmtlcjsgfVxuXG4gICAgLyoqXG4gICAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIG9uUmVsb2FkVG9rZW5pemVyKGUpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQocm93cy5maXJzdCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBlKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICogU2V0cyBhIG5ldyB0ZXh0IG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZU1vZGUnYCBldmVudC4gSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICAgKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFNldCBhIG5ldyB0ZXh0IG1vZGVcbiAgICAqIEBwYXJhbSB7Y2J9IG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0TW9kZShtb2RlLCBjYj86ICgpID0+IGFueSk6IHZvaWQge1xuICAgICAgICBpZiAobW9kZSAmJiB0eXBlb2YgbW9kZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKG1vZGUuZ2V0VG9rZW5pemVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZShtb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gbW9kZTtcbiAgICAgICAgICAgIHZhciBwYXRoID0gb3B0aW9ucy5wYXRoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcGF0aCA9IG1vZGUgfHwgXCJhY2UvbW9kZS90ZXh0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzIGlzIG5lZWRlZCBpZiBhY2UgaXNuJ3Qgb24gcmVxdWlyZSBwYXRoIChlLmcgdGVzdHMgaW4gbm9kZSlcbiAgICAgICAgaWYgKCF0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0pIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSA9IG5ldyBNb2RlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIGxvYWQgb24gZGVtYW5kXG4gICAgICAgIHRoaXMuJG1vZGVJZCA9IHBhdGg7XG4gICAgICAgIGxvYWRNb2R1bGUoW1wibW9kZVwiLCBwYXRoXSwgZnVuY3Rpb24obTogYW55KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbW9kZUlkICE9PSBwYXRoKVxuICAgICAgICAgICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgICAgICAgaWYgKG0gJiYgbS5Nb2RlKSB7XG4gICAgICAgICAgICAgICAgbSA9IG5ldyBtLk1vZGUob3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1vZGVzW3BhdGhdID0gbTtcbiAgICAgICAgICAgICAgICAgICAgbS4kaWQgPSBwYXRoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUobSk7XG4gICAgICAgICAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBzZXQgbW9kZSB0byB0ZXh0IHVudGlsIGxvYWRpbmcgaXMgZmluaXNoZWRcbiAgICAgICAgaWYgKCF0aGlzLiRtb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZShtb2RlOiBNb2RlLCAkaXNQbGFjZWhvbGRlcj86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kbW9kZUlkID0gbW9kZS4kaWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJG1vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gZG8uIEJlIGlkZW1wb3RlbnQuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRtb2RlID0gbW9kZTtcblxuICAgICAgICAvLyBUT0RPOiBXb3VsZG4ndCBpdCBtYWtlIG1vcmUgc2Vuc2UgdG8gc3RvcCB0aGUgd29ya2VyLCB0aGVuIGNoYW5nZSB0aGUgbW9kZT9cbiAgICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXb3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHN0YXJ0V29ya2VyKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG9rZW5pemVyID0gbW9kZS5nZXRUb2tlbml6ZXIoKTtcblxuICAgICAgICBpZiAodG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdmFyIG9uUmVsb2FkVG9rZW5pemVyID0gdGhpcy5vblJlbG9hZFRva2VuaXplci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10oXCJ1cGRhdGVcIiwgb25SZWxvYWRUb2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyID0gbmV3IEJhY2tncm91bmRUb2tlbml6ZXIodG9rZW5pemVyKTtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLm9uKFwidXBkYXRlXCIsIGZ1bmN0aW9uKGV2ZW50LCBiZzogQmFja2dyb3VuZFRva2VuaXplcikge1xuICAgICAgICAgICAgICAgIF9zZWxmLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuXG4gICAgICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICAgICAgdGhpcy5ub25Ub2tlblJlID0gbW9kZS5ub25Ub2tlblJlO1xuXG5cbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kb3B0aW9ucy53cmFwTWV0aG9kLnNldC5jYWxsKHRoaXMsIHRoaXMuJHdyYXBNZXRob2QpO1xuICAgICAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlLmZvbGRpbmdSdWxlcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZU1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHN0b3BXb3JrZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLiR3b3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR3b3JrZXIgPSBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHN0YXJ0V29ya2VyKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gdGhpcy4kbW9kZS5jcmVhdGVXb3JrZXIodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGV4dCBtb2RlLlxuICAgICogQHJldHVybiB7VGV4dE1vZGV9IFRoZSBjdXJyZW50IHRleHQgbW9kZVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsVG9wID09PSBzY3JvbGxUb3AgfHwgaXNOYU4oc2Nyb2xsVG9wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgdG9wbW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcm9sbFRvcCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsVG9wO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1NldHMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5zZXRTY3JvbGxMZWZ0fVxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcikge1xuICAgICAgICAvLyBzY3JvbGxMZWZ0ID0gTWF0aC5yb3VuZChzY3JvbGxMZWZ0KTtcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbExlZnQgPT09IHNjcm9sbExlZnQgfHwgaXNOYU4oc2Nyb2xsTGVmdCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbExlZnRcIiwgc2Nyb2xsTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcm9sbExlZnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbExlZnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSB3aWR0aCBvZiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRjb21wdXRlV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGluZVdpZGdldE1heFdpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzV2lkdGggIT0gbnVsbCkgcmV0dXJuIHRoaXMubGluZVdpZGdldHNXaWR0aDtcbiAgICAgICAgdmFyIHdpZHRoID0gMDtcbiAgICAgICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5saW5lV2lkZ2V0V2lkdGggPSB3aWR0aDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy4kbW9kaWZpZWQgfHwgZm9yY2UpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoID0gdGhpcy4kd3JhcExpbWl0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICAgICAgdmFyIGNhY2hlID0gdGhpcy4kcm93TGVuZ3RoQ2FjaGU7XG4gICAgICAgICAgICB2YXIgbG9uZ2VzdFNjcmVlbkxpbmUgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRJbmRleCA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXhdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB2YXIgbGVuID0gbGluZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+PSBsZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID09IG51bGwpXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID4gbG9uZ2VzdFNjcmVlbkxpbmUpXG4gICAgICAgICAgICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgdmVyYmF0aW0gY29weSBvZiB0aGUgZ2l2ZW4gbGluZSBhcyBpdCBpcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGdldExpbmUocm93OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncyBvZiB0aGUgcm93cyBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC4gVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqXG4gICAgICogQHJldHVybiB7W1N0cmluZ119XG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIGdldExpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IHN0cmluZ1tdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBudW1iZXIgb2Ygcm93cyBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkVkaXRvckRvY3VtZW50LmdldFRleHRSYW5nZS5kZXNjfVxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSB0byB3b3JrIHdpdGhcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKiovXG4gICAgcHVibGljIGdldFRleHRSYW5nZShyYW5nZTogUmFuZ2UpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VGV4dFJhbmdlKHJhbmdlIHx8IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydHMgYSBibG9jayBvZiBgdGV4dGAgYW5kIHRoZSBpbmRpY2F0ZWQgYHBvc2l0aW9uYC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHtyb3csIGNvbHVtbn0gdG8gc3RhcnQgaW5zZXJ0aW5nIGF0XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBjaHVuayBvZiB0ZXh0IHRvIGluc2VydFxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IGxpbmUgb2YgYHRleHRgLiBJZiB0aGUgbGVuZ3RoIG9mIGB0ZXh0YCBpcyAwLCB0aGlzIGZ1bmN0aW9uIHNpbXBseSByZXR1cm5zIGBwb3NpdGlvbmAuXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBwdWJsaWMgaW5zZXJ0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmluc2VydChwb3NpdGlvbiwgdGV4dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgYHJhbmdlYCBmcm9tIHRoZSBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZW1vdmVcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQucmVtb3ZlXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIHJlbW92ZShyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3QgW0lmIGB0cnVlYCwgZG9lc24ndCBzZWxlY3QgdGhlIHJhbmdlIG9mIHdoZXJlIHRoZSBjaGFuZ2Ugb2NjdXJlZF17OiAjZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHVuZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IGRlbHRhcy5sZW5ndGggLSAxOyBpICE9IC0xOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb2MucmV2ZXJ0RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCB0cnVlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsdGEuZGVsdGFzLmZvckVhY2goZnVuY3Rpb24oZm9sZERlbHRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZHMoZm9sZERlbHRhLmZvbGRzKTtcbiAgICAgICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlLWltcGxlbWVudHMgYSBwcmV2aW91c2x5IHVuZG9uZSBjaGFuZ2UgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkZWx0YXMgQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCB7OmRvbnRTZWxlY3R9XG4gICAgICpcbiAgICAqXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHJlZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb2MuYXBwbHlEZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIGZhbHNlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuYWJsZXMgb3IgZGlzYWJsZXMgaGlnaGxpZ2h0aW5nIG9mIHRoZSByYW5nZSB3aGVyZSBhbiB1bmRvIG9jY3VycmVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlIElmIGB0cnVlYCwgc2VsZWN0cyB0aGUgcmFuZ2Ugb2YgdGhlIHJlaW5zZXJ0ZWQgY2hhbmdlXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VW5kb1NlbGVjdChlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCA9IGVuYWJsZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhczogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH1bXSwgaXNVbmRvOiBib29sZWFuLCBsYXN0VW5kb1JhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgZnVuY3Rpb24gaXNJbnNlcnQoZGVsdGE6IHsgYWN0aW9uOiBzdHJpbmcgfSkge1xuICAgICAgICAgICAgdmFyIGluc2VydCA9IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09PSBcImluc2VydExpbmVzXCI7XG4gICAgICAgICAgICByZXR1cm4gaXNVbmRvID8gIWluc2VydCA6IGluc2VydDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkZWx0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gPSBkZWx0YXNbMF07XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2U7XG4gICAgICAgIHZhciBwb2ludDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgdmFyIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgIGlmIChpc0luc2VydChkZWx0YSkpIHtcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2UuZW5kKTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChpc0luc2VydChkZWx0YSkpIHtcbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQoZGVsdGEucmFuZ2Uuc3RhcnQucm93LCBkZWx0YS5yYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGRlbHRhLnJhbmdlLmVuZC5yb3csIGRlbHRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGlzIHJhbmdlIGFuZCB0aGUgbGFzdCB1bmRvIHJhbmdlIGhhcyBzb21ldGhpbmcgaW4gY29tbW9uLlxuICAgICAgICAvLyBJZiB0cnVlLCBtZXJnZSB0aGUgcmFuZ2VzLlxuICAgICAgICBpZiAobGFzdFVuZG9SYW5nZSAhPSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoUmFuZ2UuY29tcGFyZVBvaW50cyhsYXN0VW5kb1JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydCkgPT09IDApIHtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UuZW5kLmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY21wID0gbGFzdFVuZG9SYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGxhc3RVbmRvUmFuZ2Uuc3RhcnQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGxhc3RVbmRvUmFuZ2UuZW5kLnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2VzIGEgcmFuZ2UgaW4gdGhlIGRvY3VtZW50IHdpdGggdGhlIG5ldyBgdGV4dGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlcGxhY2VcbiAgICAgKiBAcGFyYW0gcmFuZ2Uge1JhbmdlfSBBIHNwZWNpZmllZCBSYW5nZSB0byByZXBsYWNlLlxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byB1c2UgYXMgYSByZXBsYWNlbWVudC5cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKiBJZiB0aGUgdGV4dCBhbmQgcmFuZ2UgYXJlIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLnN0YXJ0YCB2YWx1ZS5cbiAgICAgKiBJZiB0aGUgdGV4dCBpcyB0aGUgZXhhY3Qgc2FtZSBhcyB3aGF0IGN1cnJlbnRseSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgY3VycmVudCBgcmFuZ2UuZW5kYCB2YWx1ZS5cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVwbGFjZShyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZyk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiAgYGBganNvblxuICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiAgYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICogQHJldHVybiB7UmFuZ2V9IFRoZSBuZXcgcmFuZ2Ugd2hlcmUgdGhlIHRleHQgd2FzIG1vdmVkIHRvLlxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBtb3ZlVGV4dChmcm9tUmFuZ2U6IFJhbmdlLCB0b1Bvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBjb3B5KSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRUZXh0UmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIHJvd0RpZmY6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbERpZmY6IG51bWJlcjtcblxuICAgICAgICB2YXIgdG9SYW5nZSA9IFJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgICAgIGlmICghY29weSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZnJvbVJhbmdlKTtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBmcm9tUmFuZ2Uuc3RhcnQucm93IC0gZnJvbVJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gcm93RGlmZiA/IC1mcm9tUmFuZ2UuZW5kLmNvbHVtbiA6IGZyb21SYW5nZS5zdGFydC5jb2x1bW4gLSBmcm9tUmFuZ2UuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIGlmIChjb2xEaWZmKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2UuZW5kLnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLmVuZC5jb2x1bW4gPiBmcm9tUmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93RGlmZiAmJiB0b1JhbmdlLnN0YXJ0LnJvdyA+PSBmcm9tUmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0b1JhbmdlLmVuZCA9IHRoaXMuaW5zZXJ0KHRvUmFuZ2Uuc3RhcnQsIHRleHQpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoeC5zdGFydC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB4LnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHguZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJbmRlbnRzIGFsbCB0aGUgcm93cywgZnJvbSBgc3RhcnRSb3dgIHRvIGBlbmRSb3dgIChpbmNsdXNpdmUpLCBieSBwcmVmaXhpbmcgZWFjaCByb3cgd2l0aCB0aGUgdG9rZW4gaW4gYGluZGVudFN0cmluZ2AuXG4gICAgKlxuICAgICogSWYgYGluZGVudFN0cmluZ2AgY29udGFpbnMgdGhlIGAnXFx0J2AgY2hhcmFjdGVyLCBpdCdzIHJlcGxhY2VkIGJ5IHdoYXRldmVyIGlzIGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmcgYGdldFRhYlN0cmluZygpYF1dLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0Um93IFN0YXJ0aW5nIHJvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGVuZFJvdyBFbmRpbmcgcm93XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBpbmRlbnRSb3dzKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBpbmRlbnRTdHJpbmc6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDw9IGVuZFJvdzsgcm93KyspXG4gICAgICAgICAgICB0aGlzLmluc2VydCh7IHJvdzogcm93LCBjb2x1bW46IDAgfSwgaW5kZW50U3RyaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE91dGRlbnRzIGFsbCB0aGUgcm93cyBkZWZpbmVkIGJ5IHRoZSBgc3RhcnRgIGFuZCBgZW5kYCBwcm9wZXJ0aWVzIG9mIGByYW5nZWAuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHJhbmdlIG9mIHJvd3NcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBvdXRkZW50Um93cyhyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgdmFyIHJvd1JhbmdlID0gcmFuZ2UuY29sbGFwc2VSb3dzKCk7XG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcm93UmFuZ2Uuc3RhcnQucm93OyBpIDw9IHJvd1JhbmdlLmVuZC5yb3c7ICsraSkge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUoaSk7XG5cbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2l6ZTsgKytqKVxuICAgICAgICAgICAgICAgIGlmIChsaW5lLmNoYXJBdChqKSAhPSAnICcpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgaWYgKGogPCBzaXplICYmIGxpbmUuY2hhckF0KGopID09ICdcXHQnKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQuY29sdW1uID0gajtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gaiArIDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbW92ZShkZWxldGVSYW5nZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRtb3ZlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBkaXI6IG51bWJlcikge1xuICAgICAgICBmaXJzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93KTtcbiAgICAgICAgbGFzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93KTtcbiAgICAgICAgaWYgKGRpciA8IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyArIGRpcik7XG4gICAgICAgICAgICBpZiAocm93IDwgMCkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9IGVsc2UgaWYgKGRpciA+IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyArIGRpcik7XG4gICAgICAgICAgICBpZiAocm93ID4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSByZXR1cm4gMDtcbiAgICAgICAgICAgIHZhciBkaWZmID0gcm93IC0gbGFzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQoZmlyc3RSb3cpO1xuICAgICAgICAgICAgbGFzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGxhc3RSb3cpO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSBsYXN0Um93IC0gZmlyc3RSb3cgKyAxO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKGZpcnN0Um93LCAwLCBsYXN0Um93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHguZW5kLnJvdyArPSBkaWZmO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBsaW5lczogc3RyaW5nW10gPSAoZGlyID09PSAwKSA/IHRoaXMuZG9jLmdldExpbmVzKGZpcnN0Um93LCBsYXN0Um93KSA6IHRoaXMuZG9jLnJlbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgdGhpcy5kb2MuaW5zZXJ0TGluZXMoZmlyc3RSb3cgKyBkaWZmLCBsaW5lcyk7XG4gICAgICAgIGZvbGRzLmxlbmd0aCAmJiB0aGlzLmFkZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgcmV0dXJuIGRpZmY7XG4gICAgfVxuICAgIC8qKlxuICAgICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IHVwIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSB1cFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIHVwXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBtb3ZlTGluZXNVcChmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgZG93biBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgZG93blxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEByZXR1cm4ge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAqXG4gICAgKiBAcmVsYXRlZCBFZGl0b3JEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAgICoqL1xuICAgIHByaXZhdGUgbW92ZUxpbmVzRG93bihmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIER1cGxpY2F0ZXMgYWxsIHRoZSB0ZXh0IGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHJldHVybiB7TnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIgb2YgbmV3IHJvd3MgYWRkZWQ7IGluIG90aGVyIHdvcmRzLCBgbGFzdFJvdyAtIGZpcnN0Um93ICsgMWAuXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZHVwbGljYXRlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUm93VG9Eb2N1bWVudChyb3cpIHtcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKHJvdywgdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY2xpcENvbHVtblRvUm93KHJvdywgY29sdW1uKSB7XG4gICAgICAgIGlmIChjb2x1bW4gPCAwKVxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIHJldHVybiBNYXRoLm1pbih0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoLCBjb2x1bW4pO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgY29sdW1uID0gTWF0aC5tYXgoMCwgY29sdW1uKTtcblxuICAgICAgICBpZiAocm93IDwgMCkge1xuICAgICAgICAgICAgcm93ID0gMDtcbiAgICAgICAgICAgIGNvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBpZiAocm93ID49IGxlbikge1xuICAgICAgICAgICAgICAgIHJvdyA9IGxlbiAtIDE7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4gLSAxKS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBNYXRoLm1pbih0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogcm93LFxuICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNsaXBSYW5nZVRvRG9jdW1lbnQocmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93IDwgMCkge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gMDtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93LFxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtblxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIGlmIChyYW5nZS5lbmQucm93ID4gbGVuKSB7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93ID0gbGVuO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuKS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtblxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB3aGV0aGVyIG9yIG5vdCBsaW5lIHdyYXBwaW5nIGlzIGVuYWJsZWQuIElmIGB1c2VXcmFwTW9kZWAgaXMgZGlmZmVyZW50IHRoYW4gdGhlIGN1cnJlbnQgdmFsdWUsIHRoZSBgJ2NoYW5nZVdyYXBNb2RlJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVdyYXBNb2RlIEVuYWJsZSAob3IgZGlzYWJsZSkgd3JhcCBtb2RlXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VXcmFwTW9kZSh1c2VXcmFwTW9kZTogYm9vbGVhbikge1xuICAgICAgICBpZiAodXNlV3JhcE1vZGUgIT0gdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHVzZVdyYXBNb2RlID0gdXNlV3JhcE1vZGU7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuXG4gICAgICAgICAgICAvLyBJZiB3cmFwTW9kZSBpcyBhY3RpdmFlZCwgdGhlIHdyYXBEYXRhIGFycmF5IGhhcyB0byBiZSBpbml0aWFsaXplZC5cbiAgICAgICAgICAgIGlmICh1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHdyYXBEYXRhID0gQXJyYXk8bnVtYmVyW10+KGxlbik7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgbGVuIC0gMSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3cmFwIG1vZGUgaXMgYmVpbmcgdXNlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICoqL1xuICAgIGdldFVzZVdyYXBNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgfVxuXG4gICAgLy8gQWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gbW92ZSBmcmVlbHkgYmV0d2VlbiBtaW4gYW5kIG1heC4gRWl0aGVyXG4gICAgLy8gcGFyYW1ldGVyIGNhbiBiZSBudWxsIHRvIGFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIGJlIHVuY29uc3RyYWluZWRcbiAgICAvLyBpbiB0aGF0IGRpcmVjdGlvbi4gT3Igc2V0IGJvdGggcGFyYW1ldGVycyB0byB0aGUgc2FtZSBudW1iZXIgdG8gcGluXG4gICAgLy8gdGhlIGxpbWl0IHRvIHRoYXQgdmFsdWUuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYm91bmRhcmllcyBvZiB3cmFwLiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0V3JhcExpbWl0UmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4gIT09IG1pbiB8fCB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXggIT09IG1heCkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgICAgICAgICAgbWluOiBtaW4sXG4gICAgICAgICAgICAgICAgbWF4OiBtYXhcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSByZWNhbGN1bGF0aW9uIG9mIHRoZSB3cmFwIGxpbWl0XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlc2lyZWRMaW1pdCBUaGUgbmV3IHdyYXAgbGltaXRcbiAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgKlxuICAgICogQHByaXZhdGVcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KGRlc2lyZWRMaW1pdDogbnVtYmVyLCAkcHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB2YXIgbGltaXRzID0gdGhpcy4kd3JhcExpbWl0UmFuZ2VcbiAgICAgICAgaWYgKGxpbWl0cy5tYXggPCAwKVxuICAgICAgICAgICAgbGltaXRzID0geyBtaW46ICRwcmludE1hcmdpbiwgbWF4OiAkcHJpbnRNYXJnaW4gfTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJGNvbnN0cmFpbldyYXBMaW1pdChkZXNpcmVkTGltaXQsIGxpbWl0cy5taW4sIGxpbWl0cy5tYXgpO1xuICAgICAgICBpZiAod3JhcExpbWl0ICE9IHRoaXMuJHdyYXBMaW1pdCAmJiB3cmFwTGltaXQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXQgPSB3cmFwTGltaXQ7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTGltaXRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29uc3RyYWluV3JhcExpbWl0KHdyYXBMaW1pdDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAobWluKVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5tYXgobWluLCB3cmFwTGltaXQpO1xuXG4gICAgICAgIGlmIChtYXgpXG4gICAgICAgICAgICB3cmFwTGltaXQgPSBNYXRoLm1pbihtYXgsIHdyYXBMaW1pdCk7XG5cbiAgICAgICAgcmV0dXJuIHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHdyYXAgbGltaXQuXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IFRoZSB3cmFwIGxpbWl0LlxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0V3JhcExpbWl0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kd3JhcExpbWl0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGxpbmUgbGVuZ3RoIGZvciBzb2Z0IHdyYXAgaW4gdGhlIGVkaXRvci4gTGluZXMgd2lsbCBicmVha1xuICAgICAqICBhdCBhIG1pbmltdW0gb2YgdGhlIGdpdmVuIGxlbmd0aCBtaW51cyAyMCBjaGFycyBhbmQgYXQgYSBtYXhpbXVtXG4gICAgICogIG9mIHRoZSBnaXZlbiBudW1iZXIgb2YgY2hhcnMuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IGxpbWl0IFRoZSBtYXhpbXVtIGxpbmUgbGVuZ3RoIGluIGNoYXJzLCBmb3Igc29mdCB3cmFwcGluZyBsaW5lcy5cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFdyYXBMaW1pdChsaW1pdCkge1xuICAgICAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGxpbWl0LCBsaW1pdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCB0aGF0IGRlZmluZXMgdGhlIG1pbmltdW0gYW5kIG1heGltdW0gb2YgdGhlIHdyYXAgbGltaXQ7IGl0IGxvb2tzIHNvbWV0aGluZyBsaWtlIHRoaXM6XG4gICAgKlxuICAgICogICAgIHsgbWluOiB3cmFwTGltaXRSYW5nZV9taW4sIG1heDogd3JhcExpbWl0UmFuZ2VfbWF4IH1cbiAgICAqXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAgICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgICAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICAgICAgdmFyIGxlbjtcbiAgICAgICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGVuID0gZS5kYXRhLmxpbmVzID8gZS5kYXRhLmxpbmVzLmxlbmd0aCA6IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbiA9IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgaWYgKGxlbiAhPSAwKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzW3VzZVdyYXBNb2RlID8gXCIkd3JhcERhdGFcIiA6IFwiJHJvd0xlbmd0aENhY2hlXCJdLnNwbGljZShmaXJzdFJvdywgbGVuKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGVuZC5yb3csIGVuZC5jb2x1bW4sIHN0YXJ0LmNvbHVtbiAtIGVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVCZWZvcmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lQmVmb3JlICYmIGZvbGRMaW5lQmVmb3JlICE9PSBmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmVCZWZvcmUubWVyZ2UoZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZUJlZm9yZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBlbmQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMCk7XG4gICAgICAgICAgICAgICAgdmFyIGFyciA9IHVzZVdyYXBNb2RlID8gdGhpcy4kd3JhcERhdGEgOiB0aGlzLiRyb3dMZW5ndGhDYWNoZVxuICAgICAgICAgICAgICAgIGFyci5zcGxpY2UuYXBwbHkoYXJyLCBhcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHNvbWUgbmV3IGxpbmUgaXMgYWRkZWQgaW5zaWRlIG9mIGEgZm9sZExpbmUsIHRoZW4gc3BsaXRcbiAgICAgICAgICAgICAgICAvLyB0aGUgZm9sZCBsaW5lIHVwLlxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lLnJhbmdlLmNvbXBhcmVJbnNpZGUoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIC8vIEluc2lkZSBvZiB0aGUgZm9sZExpbmUgcmFuZ2UuIE5lZWQgdG8gc3BsaXQgc3R1ZmYgdXAuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChzdGFydC5yb3csIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mcm9udCBvZiB0aGUgZm9sZExpbmUgYnV0IHNhbWUgcm93LiBOZWVkIHRvIHNoaWZ0IGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90aGluZyB0byBkbyBpZiB0aGUgaW5zZXJ0IGlzIGFmdGVyIHRoZSBmb2xkTGluZS5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWFsaWduIGZvbGRzLiBFLmcuIGlmIHlvdSBhZGQgc29tZSBuZXcgY2hhcnMgYmVmb3JlIGEgZm9sZCwgdGhlXG4gICAgICAgICAgICAvLyBmb2xkIHNob3VsZCBcIm1vdmVcIiB0byB0aGUgcmlnaHQuXG4gICAgICAgICAgICBsZW4gPSBNYXRoLmFicyhlLmRhdGEucmFuZ2Uuc3RhcnQuY29sdW1uIC0gZS5kYXRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgZm9sZHMgaW4gdGhlIGNoYW5nZSByYW5nZSBhbmQgcmVtb3ZlIHRoZW0uXG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICBsZW4gPSAtbGVuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgc3RhcnQuY29sdW1uLCBsZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICYmIHRoaXMuJHdyYXBEYXRhLmxlbmd0aCAhPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImRvYy5nZXRMZW5ndGgoKSBhbmQgJHdyYXBEYXRhLmxlbmd0aCBoYXZlIHRvIGJlIHRoZSBzYW1lIVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IGZhbHNlO1xuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3cpO1xuXG4gICAgICAgIHJldHVybiByZW1vdmVkRm9sZHM7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdywgYj8pIHtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbbGFzdFJvd10gPSBudWxsO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIHdyYXBEYXRhID0gdGhpcy4kd3JhcERhdGE7XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgICAgIHZhciB0b2tlbnM7XG4gICAgICAgIHZhciBmb2xkTGluZTtcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihsYXN0Um93LCBsaW5lcy5sZW5ndGggLSAxKTtcbiAgICAgICAgd2hpbGUgKHJvdyA8PSBsYXN0Um93KSB7XG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhsaW5lc1tyb3ddKTtcbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtyb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2Fsa1Rva2VuczogbnVtYmVyW107XG4gICAgICAgICAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlciwgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zWzBdID0gUExBQ0VIT0xERVJfU1RBUlQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHdhbGtUb2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zW2ldID0gUExBQ0VIT0xERVJfQk9EWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzW3Jvd10uc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gdG9rZW5zLmNvbmNhdCh3YWxrVG9rZW5zKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgICAgIGxpbmVzW2ZvbGRMaW5lLmVuZC5yb3ddLmxlbmd0aCArIDFcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgd3JhcERhdGFbZm9sZExpbmUuc3RhcnQucm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVXcmFwU3BsaXRzKHRva2VuczogbnVtYmVyW10sIHdyYXBMaW1pdDogbnVtYmVyLCB0YWJTaXplPzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0b2tlbnMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciBkaXNwbGF5TGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcbiAgICAgICAgdmFyIGxhc3RTcGxpdCA9IDAsIGxhc3REb2NTcGxpdCA9IDA7XG5cbiAgICAgICAgdmFyIGlzQ29kZSA9IHRoaXMuJHdyYXBBc0NvZGU7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU3BsaXQoc2NyZWVuUG9zOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBkaXNwbGF5ZWQgPSB0b2tlbnMuc2xpY2UobGFzdFNwbGl0LCBzY3JlZW5Qb3MpO1xuXG4gICAgICAgICAgICAvLyBUaGUgZG9jdW1lbnQgc2l6ZSBpcyB0aGUgY3VycmVudCBzaXplIC0gdGhlIGV4dHJhIHdpZHRoIGZvciB0YWJzXG4gICAgICAgICAgICAvLyBhbmQgbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgdmFyIGxlbiA9IGRpc3BsYXllZC5sZW5ndGg7XG4gICAgICAgICAgICBkaXNwbGF5ZWQuam9pbihcIlwiKS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBUQUJfU1BBQ0VzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzEyL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBDSEFSX0VYVC9tdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxhc3REb2NTcGxpdCArPSBsZW47XG4gICAgICAgICAgICBzcGxpdHMucHVzaChsYXN0RG9jU3BsaXQpO1xuICAgICAgICAgICAgbGFzdFNwbGl0ID0gc2NyZWVuUG9zO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGRpc3BsYXlMZW5ndGggLSBsYXN0U3BsaXQgPiB3cmFwTGltaXQpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMsIHdoZXJlIHRoZSBzcGxpdCBzaG91bGQgYmUuXG4gICAgICAgICAgICB2YXIgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgc3BhY2Ugb3IgdGFiIGF0IHRoaXMgc3BsaXQgcG9zaXRpb24sIHRoZW4gbWFraW5nXG4gICAgICAgICAgICAvLyBhIHNwbGl0IGlzIHNpbXBsZS5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXQgLSAxXSA+PSBTUEFDRSAmJiB0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgLyogZGlzYWJsZWQgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hamF4b3JnL2FjZS9pc3N1ZXMvMTE4NlxuICAgICAgICAgICAgICAgIC8vIEluY2x1ZGUgYWxsIGZvbGxvd2luZyBzcGFjZXMgKyB0YWJzIGluIHRoaXMgc3BsaXQgYXMgd2VsbC5cbiAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdCArKztcbiAgICAgICAgICAgICAgICB9ICovXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHNwbGl0IGlzIGluc2lkZSBvZiBhIHBsYWNlaG9sZGVyLiBQbGFjZWhvbGRlciBhcmVcbiAgICAgICAgICAgIC8vIG5vdCBzcGxpdGFibGUuIFRoZXJlZm9yZSwgc2VlayB0aGUgYmVnaW5uaW5nIG9mIHRoZSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgLy8gYW5kIHRyeSB0byBwbGFjZSB0aGUgc3BsaXQgYmVvZnJlIHRoZSBwbGFjZWhvbGRlcidzIHN0YXJ0LlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQgfHwgdG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VlayB0aGUgc3RhcnQgb2YgdGhlIHBsYWNlaG9sZGVyIGFuZCBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICAvLyBiZWZvcmUgdGhlIHBsYWNlaG9sZGVyLiBCeSBkZWZpbml0aW9uIHRoZXJlIGFsd2F5c1xuICAgICAgICAgICAgICAgIC8vIGEgUExBQ0VIT0xERVJfU1RBUlQgYmV0d2VlbiBzcGxpdCBhbmQgbGFzdFNwbGl0LlxuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0ICE9IGxhc3RTcGxpdCAtIDE7IHNwbGl0LS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwbGl0Kys7IDw8IE5vIGluY3JlbWVudGFsIGhlcmUgYXMgd2Ugd2FudCB0b1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gIGhhdmUgdGhlIHBvc2l0aW9uIGJlZm9yZSB0aGUgUGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBpcyBub3QgdGhlIGluZGV4IG9mIHRoZVxuICAgICAgICAgICAgICAgIC8vIGxhc3Qgc3BsaXQsIHRoZW4gd2UgY2FuIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA+IGxhc3RTcGxpdCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBJUyB0aGUgaW5kZXggb2YgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyBzcGxpdCwgdGhlbiB3ZSBoYXZlIHRvIHBsYWNlIHRoZSBzcGxpdCBhZnRlciB0aGVcbiAgICAgICAgICAgICAgICAvLyBwbGFjZWhvbGRlci4gU28sIGxldCdzIHNlZWsgZm9yIHRoZSBlbmQgb2YgdGhlIHBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0IDwgdG9rZW5zLmxlbmd0aDsgc3BsaXQrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSAhPSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHNwaWx0ID09IHRva2Vucy5sZW5ndGgsIHRoZW4gdGhlIHBsYWNlaG9sZGVyIGlzIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gdGhpbmcgaW4gdGhlIGxpbmUgYW5kIGFkZGluZyBhIG5ldyBzcGxpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UuXG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7ICAvLyBCcmVha3MgdGhlIHdoaWxlLWxvb3AuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRmluYWxseSwgYWRkIHRoZSBzcGxpdC4uLlxuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaXJzdCBub24gc3BhY2UvdGFiL3BsYWNlaG9sZGVyL3B1bmN0dWF0aW9uIHRva2VuIGJhY2t3YXJkcy5cbiAgICAgICAgICAgIHZhciBtaW5TcGxpdCA9IE1hdGgubWF4KHNwbGl0IC0gKGlzQ29kZSA/IDEwIDogd3JhcExpbWl0IC0gKHdyYXBMaW1pdCA+PiAyKSksIGxhc3RTcGxpdCAtIDEpO1xuICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA9PSBQVU5DVFVBVElPTikge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgd2UgZm91bmQgb25lLCB0aGVuIGFkZCB0aGUgc3BsaXQuXG4gICAgICAgICAgICBpZiAoc3BsaXQgPiBtaW5TcGxpdCkge1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KCsrc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgLy8gVGhlIHNwbGl0IGlzIGluc2lkZSBvZiBhIENIQVIgb3IgQ0hBUl9FWFQgdG9rZW4gYW5kIG5vIHNwYWNlXG4gICAgICAgICAgICAvLyBhcm91bmQgLT4gZm9yY2UgYSBzcGxpdC5cbiAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3BsaXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdHJpbmcsIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGRpc3BsYXkgY2hhcmFjdGVycywgaW5jbHVkaW5nIHRhYnMgYW5kIHNwYWNlcy5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBUaGUgdmFsdWUgdG8gc3RhcnQgYXRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGdldERpc3BsYXlUb2tlbnMoc3RyOiBzdHJpbmcsIG9mZnNldD86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGFycjogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIHRhYlNpemU6IG51bWJlcjtcbiAgICAgICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgICAgICAvLyBUYWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICB0YWJTaXplID0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKGFyci5sZW5ndGggKyBvZmZzZXQpO1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQik7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgbiA9IDE7IG4gPCB0YWJTaXplOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCX1NQQUNFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTcGFjZVxuICAgICAgICAgICAgZWxzZSBpZiAoYyA9PSAzMikge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFNQQUNFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChjID4gMzkgJiYgYyA8IDQ4KSB8fCAoYyA+IDU3ICYmIGMgPCA2NCkpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChQVU5DVFVBVElPTik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUiwgQ0hBUl9FWFQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSB3aWR0aCBvZiB0aGUgc3RyaW5nIGBzdHJgIG9uIHRoZSBzY3JlZW4gd2hpbGUgYXNzdW1pbmcgdGhhdCB0aGUgc3RyaW5nIHN0YXJ0cyBhdCB0aGUgZmlyc3QgY29sdW1uIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2FsY3VsYXRlIHRoZSBzY3JlZW4gd2lkdGggb2ZcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhTY3JlZW5Db2x1bW5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Db2x1bW5cbiAgICAqIEByZXR1cm4ge1tOdW1iZXJdfSBSZXR1cm5zIGFuIGBpbnRbXWAgYXJyYXkgd2l0aCB0d28gZWxlbWVudHM6PGJyLz5cbiAgICAqIFRoZSBmaXJzdCBwb3NpdGlvbiBpbmRpY2F0ZXMgdGhlIG51bWJlciBvZiBjb2x1bW5zIGZvciBgc3RyYCBvbiBzY3JlZW4uPGJyLz5cbiAgICAqIFRoZSBzZWNvbmQgdmFsdWUgY29udGFpbnMgdGhlIHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCBjb2x1bW4gdGhhdCB0aGlzIGZ1bmN0aW9uIHJlYWQgdW50aWwuXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyAkZ2V0U3RyaW5nU2NyZWVuV2lkdGgoc3RyOiBzdHJpbmcsIG1heFNjcmVlbkNvbHVtbj86IG51bWJlciwgc2NyZWVuQ29sdW1uPzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IDApXG4gICAgICAgICAgICByZXR1cm4gWzAsIDBdO1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBtYXhTY3JlZW5Db2x1bW4gPSBJbmZpbml0eTtcbiAgICAgICAgc2NyZWVuQ29sdW1uID0gc2NyZWVuQ29sdW1uIHx8IDA7XG5cbiAgICAgICAgdmFyIGM6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbHVtbjogbnVtYmVyO1xuICAgICAgICBmb3IgKGNvbHVtbiA9IDA7IGNvbHVtbiA8IHN0ci5sZW5ndGg7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICBjID0gc3RyLmNoYXJDb2RlQXQoY29sdW1uKTtcbiAgICAgICAgICAgIC8vIHRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSB0aGlzLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2NyZWVuQ29sdW1uID4gbWF4U2NyZWVuQ29sdW1uKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gW3NjcmVlbkNvbHVtbiwgY29sdW1uXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgbnVtYmVyIG9mIHNjcmVlbnJvd3MgaW4gYSB3cmFwcGVkIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIGNoZWNrXG4gICAgKlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRSb3dMZW5ndGgocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cylcbiAgICAgICAgICAgIHZhciBoID0gdGhpcy5saW5lV2lkZ2V0c1tyb3ddICYmIHRoaXMubGluZVdpZGdldHNbcm93XS5yb3dDb3VudCB8fCAwO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBoID0gMFxuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICAgICAgICByZXR1cm4gMSArIGg7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XS5sZW5ndGggKyAxICsgaDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRSb3dMaW5lQ291bnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Um93V3JhcEluZGVudChzY3JlZW5Sb3c6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Bvcy5yb3ddO1xuICAgICAgICAgICAgLy8gRklYTUU6IGluZGVudCBkb2VzIG5vdCBleGlzdHMgb24gbnVtYmVyW11cbiAgICAgICAgICAgIHJldHVybiBzcGxpdHMubGVuZ3RoICYmIHNwbGl0c1swXSA8IHBvcy5jb2x1bW4gPyBzcGxpdHNbJ2luZGVudCddIDogMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gKG9uIHNjcmVlbikgZm9yIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgcHJvdmlkZWQgc2NyZWVuIHJvdy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICpcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGRvY3VtZW50IHBvc2l0aW9uIG9mIHRoZSBsYXN0IHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gcm93LCB0aGlzIHJldHVybnMgdGhlIHNwbGl0IGRhdGEuXG4gICAgKiBAcmV0dXJuIHtTdHJpbmd9XG4gICAgKiovXG4gICAgcHVibGljIGdldFJvd1NwbGl0RGF0YShyb3c6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhlIGRpc3RhbmNlIHRvIHRoZSBuZXh0IHRhYiBzdG9wIGF0IHRoZSBzcGVjaWZpZWQgc2NyZWVuIGNvbHVtbi5cbiAgICAgKiBAbWV0aG9zIGdldFNjcmVlblRhYlNpemVcbiAgICAgKiBAcGFyYW0gc2NyZWVuQ29sdW1uIHtudW1iZXJ9IFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemUgLSBzY3JlZW5Db2x1bW4gJSB0aGlzLiR0YWJTaXplO1xuICAgIH1cblxuXG4gICAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRSb3coc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgc2NyZWVuQ29sdW1uKS5yb3c7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIHNjcmVlblRvRG9jdW1lbnRDb2x1bW4oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgc2NyZWVuQ29sdW1uKS5jb2x1bW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBDb252ZXJ0cyBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIG9uIHRoZSBzY3JlZW4gdG8gY2hhcmFjdGVycyBjb29yZGluYXRlcyB3aXRoaW4gdGhlIGRvY3VtZW50LiBbVGhpcyB0YWtlcyBpbnRvIGFjY291bnQgY29kZSBmb2xkaW5nLCB3b3JkIHdyYXAsIHRhYiBzaXplLCBhbmQgYW55IG90aGVyIHZpc3VhbCBtb2RpZmljYXRpb25zLl17OiAjY29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAgICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlblJvdyBUaGUgc2NyZWVuIHJvdyB0byBjaGVja1xuICAgICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlbkNvbHVtbiBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICoqL1xuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGlmIChzY3JlZW5Sb3cgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyByb3c6IDAsIGNvbHVtbjogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIHZhciBkb2NSb3cgPSAwO1xuICAgICAgICB2YXIgZG9jQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIGNvbHVtbjtcbiAgICAgICAgdmFyIHJvdyA9IDA7XG4gICAgICAgIHZhciByb3dMZW5ndGggPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJHNjcmVlblJvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIHNjcmVlblJvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb2NSb3cgPSB0aGlzLiRkb2NSb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gc2NyZWVuUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYXhSb3cgPSB0aGlzLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8PSBzY3JlZW5Sb3cpIHtcbiAgICAgICAgICAgIHJvd0xlbmd0aCA9IHRoaXMuZ2V0Um93TGVuZ3RoKGRvY1Jvdyk7XG4gICAgICAgICAgICBpZiAocm93ICsgcm93TGVuZ3RoID4gc2NyZWVuUm93IHx8IGRvY1JvdyA+PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93ICs9IHJvd0xlbmd0aDtcbiAgICAgICAgICAgICAgICBkb2NSb3crKztcbiAgICAgICAgICAgICAgICBpZiAoZG9jUm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKGRvY1Jvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cpIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSk7XG4gICAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH0gZWxzZSBpZiAocm93ICsgcm93TGVuZ3RoIDw9IHNjcmVlblJvdyB8fCBkb2NSb3cgPiBtYXhSb3cpIHtcbiAgICAgICAgICAgIC8vIGNsaXAgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcm93OiBtYXhSb3csXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldExpbmUobWF4Um93KS5sZW5ndGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KTtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW2RvY1Jvd107XG4gICAgICAgICAgICBpZiAoc3BsaXRzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0SW5kZXggPSBNYXRoLmZsb29yKHNjcmVlblJvdyAtIHJvdyk7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChzcGxpdEluZGV4ID4gMCAmJiBzcGxpdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY0NvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4IC0gMV0gfHwgc3BsaXRzW3NwbGl0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyaW5nKGRvY0NvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZG9jQ29sdW1uICs9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmUsIHNjcmVlbkNvbHVtbilbMV07XG5cbiAgICAgICAgLy8gV2UgcmVtb3ZlIG9uZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCBzbyB0aGF0IHRoZSBkb2NDb2x1bW5cbiAgICAgICAgLy8gcG9zaXRpb24gcmV0dXJuZWQgaXMgbm90IGFzc29jaWF0ZWQgdG8gdGhlIG5leHQgcm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSAmJiBkb2NDb2x1bW4gPj0gY29sdW1uKVxuICAgICAgICAgICAgZG9jQ29sdW1uID0gY29sdW1uIC0gMTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gZm9sZExpbmUuaWR4VG9Qb3NpdGlvbihkb2NDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogZG9jUm93LCBjb2x1bW46IGRvY0NvbHVtbiB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgZG9jdW1lbnQgY29vcmRpbmF0ZXMgdG8gc2NyZWVuIGNvb3JkaW5hdGVzLiB7OmNvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3cgVGhlIGRvY3VtZW50IHJvdyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHRvIGNoZWNrXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgICAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jUm93ID0gcG9zLnJvdztcbiAgICAgICAgZG9jQ29sdW1uID0gcG9zLmNvbHVtbjtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG5cbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IDA7XG4gICAgICAgIHZhciBmb2xkU3RhcnRSb3cgPSBudWxsO1xuICAgICAgICB2YXIgZm9sZCA9IG51bGw7XG5cbiAgICAgICAgLy8gQ2xhbXAgdGhlIGRvY1JvdyBwb3NpdGlvbiBpbiBjYXNlIGl0J3MgaW5zaWRlIG9mIGEgZm9sZGVkIGJsb2NrLlxuICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoZG9jUm93LCBkb2NDb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgZG9jUm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3dFbmQsIHJvdyA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kZG9jUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgZG9jUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuJHNjcmVlblJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBkb2NSb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8IGRvY1Jvdykge1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBpZiAocm93RW5kID4gZG9jUm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvd0VuZCwgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSByb3cgKyAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY3JlZW5Sb3cgKz0gdGhpcy5nZXRSb3dMZW5ndGgocm93KTtcbiAgICAgICAgICAgIHJvdyA9IHJvd0VuZDtcblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChzY3JlZW5Sb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSB0ZXh0IGxpbmUgdGhhdCBpcyBkaXNwbGF5ZWQgaW4gZG9jUm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaW5hbCByb3cgd2Ugd2FudCB0byByZWFjaCBpcyBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgcm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSwgZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICAgICAgZm9sZFN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KS5zdWJzdHJpbmcoMCwgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGRvY1JvdztcbiAgICAgICAgfVxuICAgICAgICAvLyBDbGFtcCB0ZXh0TGluZSBpZiBpbiB3cmFwTW9kZS5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgd3JhcFJvdyA9IHRoaXMuJHdyYXBEYXRhW2ZvbGRTdGFydFJvd107XG4gICAgICAgICAgICBpZiAod3JhcFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3dPZmZzZXQgPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICh0ZXh0TGluZS5sZW5ndGggPj0gd3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlblJvdysrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3dPZmZzZXQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgPSB0ZXh0TGluZS5zdWJzdHJpbmcod3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXQgLSAxXSB8fCAwLCB0ZXh0TGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogc2NyZWVuUm93LFxuICAgICAgICAgICAgY29sdW1uOiB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh0ZXh0TGluZSlbMF1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuQ29sdW1uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLnJvdztcbiAgICB9XG5cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJhbmdlKHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgdmFyIHNjcmVlblBvc1N0YXJ0ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB2YXIgc2NyZWVuUG9zRW5kID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocmFuZ2UuZW5kLnJvdywgcmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgIHJldHVybiBuZXcgUmFuZ2Uoc2NyZWVuUG9zU3RhcnQucm93LCBzY3JlZW5Qb3NTdGFydC5jb2x1bW4sIHNjcmVlblBvc0VuZC5yb3csIHNjcmVlblBvc0VuZC5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbkxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiR3cmFwRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgcm93ID0gMCwgaSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgICAgIHdoaWxlIChyb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kb1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JlZW5Sb3dzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhmbTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgLy8gVE9ETz9cbiAgICB9XG5cbiAgICBmaW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBjaHI/OiBzdHJpbmcpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb24sIGNocik7XG4gICAgfVxuXG4gICAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAkZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICAkZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG4gICAgcHJpdmF0ZSAkZm9sZE1vZGU7XG5cbiAgICAvLyBzdHJ1Y3R1cmVkIGZvbGRpbmdcbiAgICAkZm9sZFN0eWxlcyA9IHtcbiAgICAgICAgXCJtYW51YWxcIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICAgIH1cbiAgICAkZm9sZFN0eWxlID0gXCJtYXJrYmVnaW5cIjtcbiAgICAvKlxuICAgICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICAgKiAgIC0xOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuc3RhcnQgPSByb3cvY29sdW1uXG4gICAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICAgKi9cbiAgICBnZXRGb2xkQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBzaWRlPzogbnVtYmVyKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGQucmFuZ2UuY29udGFpbnMocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpZGUgPT09IDEgJiYgZm9sZC5yYW5nZS5pc0VuZChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzaWRlID09PSAtMSAmJiBmb2xkLnJhbmdlLmlzU3RhcnQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGdpdmVuIHJhbmdlLiBOb3RlLCB0aGF0IHRoaXMgd2lsbCByZXR1cm4gZm9sZHNcbiAgICAgKlxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZShyYW5nZTogUmFuZ2UpOiBGb2xkW10ge1xuICAgICAgICB2YXIgc3RhcnQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IHJhbmdlLmVuZDtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm91bmRGb2xkczogRm9sZFtdID0gW107XG5cbiAgICAgICAgc3RhcnQuY29sdW1uICs9IDE7XG4gICAgICAgIGVuZC5jb2x1bW4gLT0gMTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lc1tpXS5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYmVmb3JlIGZvbGRMaW5lLiBObyBpbnRlcnNlY3Rpb24uIFRoaXMgbWVhbnMsXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgbWlnaHQgYmUgb3RoZXIgZm9sZExpbmVzIHRoYXQgaW50ZXJzZWN0LlxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYWZ0ZXIgZm9sZExpbmUuIFRoZXJlIGNhbid0IGJlIGFueSBvdGhlciBmb2xkTGluZXMgdGhlbixcbiAgICAgICAgICAgICAgICAvLyBzbyBsZXQncyBnaXZlIHVwLlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZXNbaV0uZm9sZHM7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZvbGRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZvbGQgPSBmb2xkc1tqXTtcbiAgICAgICAgICAgICAgICBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXVEYtc3RhdGU6IENhbiBoYXBwZW4gZHVlIHRvIC0xLysxIHRvIHN0YXJ0L2VuZCBjb2x1bW4uXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gNDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm91bmRGb2xkcy5wdXNoKGZvbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YXJ0LmNvbHVtbiAtPSAxO1xuICAgICAgICBlbmQuY29sdW1uICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIGZvdW5kRm9sZHM7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZXMpOiBGb2xkW10ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXSA9IFtdO1xuICAgICAgICAgICAgcmFuZ2VzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBmb2xkcyA9IGZvbGRzLmNvbmNhdCh0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKi9cbiAgICBnZXRBbGxGb2xkcygpOiBGb2xkW10ge1xuICAgICAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgZm9sZHMucHVzaChmb2xkTGluZXNbaV0uZm9sZHNbal0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvfGxkPndvbHJkIC0+IDxudWxsPlxuICAgICAqXG4gICAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgICAqXG4gICAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAgICpcbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC10cmltPSsxPiBcInJsZFwiXG4gICAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgICAqL1xuICAgIGdldEZvbGRTdHJpbmdBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHRyaW06IG51bWJlciwgZm9sZExpbmU/OiBGb2xkTGluZSk6IHN0cmluZyB7XG4gICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUgfHwgdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGxhc3RGb2xkID0ge1xuICAgICAgICAgICAgZW5kOiB7IGNvbHVtbjogMCB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IFJlZmFjdG9yIHRvIHVzZSBnZXROZXh0Rm9sZFRvIGZ1bmN0aW9uLlxuICAgICAgICB2YXIgc3RyOiBzdHJpbmc7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lLmZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb2xkID0gZm9sZExpbmUuZm9sZHNbaV07XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlRW5kKHJvdywgY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uLCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RGb2xkID0gZm9sZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXN0cilcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0cmltID09IC0xKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2UgaWYgKHRyaW0gPT0gMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgIH1cblxuICAgIGdldEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93ICYmIGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkTGluZS5lbmQucm93ID4gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgZm9sZCB3aGljaCBzdGFydHMgYWZ0ZXIgb3IgY29udGFpbnMgZG9jUm93XG4gICAgZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXRGb2xkZWRSb3dDb3VudChmaXJzdDogbnVtYmVyLCBsYXN0OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIHJvd0NvdW50ID0gbGFzdCAtIGZpcnN0ICsgMTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV0sXG4gICAgICAgICAgICAgICAgZW5kID0gZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICBzdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGlmIChlbmQgPj0gbGFzdCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFydCA8IGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KVxuICAgICAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gbGFzdCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCA9IDA7Ly9pbiBvbmUgZm9sZFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kID49IGZpcnN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KSAvL2ZvbGQgaW5zaWRlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gZmlyc3QgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3dDb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlICRhZGRGb2xkTGluZShmb2xkTGluZTogRm9sZExpbmUpIHtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgICAqXG4gICAgICogQHJldHVyblxuICAgICAqICAgICAgVGhlIG5ldyBjcmVhdGVkIEZvbGQgb2JqZWN0IG9yIGFuIGV4aXN0aW5nIGZvbGQgb2JqZWN0IGluIGNhc2UgdGhlXG4gICAgICogICAgICBwYXNzZWQgaW4gcmFuZ2UgZml0cyBhbiBleGlzdGluZyBmb2xkIGV4YWN0bHkuXG4gICAgICovXG4gICAgYWRkRm9sZChwbGFjZWhvbGRlcjogc3RyaW5nIHwgRm9sZCwgcmFuZ2U6IFJhbmdlKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgYWRkZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG5cbiAgICAgICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgRm9sZClcbiAgICAgICAgICAgIGZvbGQgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHBsYWNlaG9sZGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZm9sZCA9IG5ldyBGb2xkKHJhbmdlLCBwbGFjZWhvbGRlcik7XG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSByYW5nZS5jb2xsYXBzZUNoaWxkcmVuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicGxhY2Vob2xkZXIgbXVzdCBiZSBhIHN0cmluZyBvciBhIEZvbGQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAgICAgLy8gZm9sZC5yYW5nZSA9IHRoaXMuY2xpcFJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBmb2xkLnJhbmdlID0gdGhpcy4kY2xpcFJhbmdlVG9Eb2N1bWVudChmb2xkLnJhbmdlKVxuXG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICB2YXIgc3RhcnRDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICAgICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgICAgICAvLyAtLS0gU29tZSBjaGVja2luZyAtLS1cbiAgICAgICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgICAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgICAgICB2YXIgZW5kRm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGVuZFJvdywgZW5kQ29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICAgICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgICAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvbGQgY2FuJ3QgaW50ZXJzZWN0IGFscmVhZHkgZXhpc3RpbmcgZm9sZFwiICsgZm9sZC5yYW5nZSArIHN0YXJ0Rm9sZC5yYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgICAgICBmb2xkLmFkZFN1YkZvbGQoc3ViRm9sZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXJ0Um93ID09IGZvbGRMaW5lLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBtaWdodCBoYXZlIHRvIG1lcmdlIHR3byBGb2xkTGluZXMuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZU5leHQgPSBmb2xkRGF0YVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZU5leHQgJiYgZm9sZExpbmVOZXh0LnN0YXJ0LnJvdyA9PSBlbmRSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWVyZ2UhXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5tZXJnZShmb2xkTGluZU5leHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChlbmRSb3cgPD0gZm9sZExpbmUuc3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWFkZGVkKVxuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRhZGRGb2xkTGluZShuZXcgRm9sZExpbmUodGhpcy4kZm9sZERhdGEsIFtmb2xkXSkpO1xuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwiYWRkXCIgfSk7XG5cbiAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgfVxuXG4gICAgc2V0TW9kaWZpZWQobW9kaWZpZWQ6IGJvb2xlYW4pIHtcblxuICAgIH1cblxuICAgIGFkZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGQoZm9sZDogRm9sZCk6IHZvaWQge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkLmZvbGRMaW5lO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuXG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIC8vIFNpbXBsZSBjYXNlIHdoZXJlIHRoZXJlIGlzIG9ubHkgb25lIGZvbGQgaW4gdGhlIEZvbGRMaW5lIHN1Y2ggdGhhdFxuICAgICAgICAvLyB0aGUgZW50aXJlIGZvbGQgbGluZSBjYW4gZ2V0IHJlbW92ZWQgZGlyZWN0bHkuXG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgZm9sZExpbmVzLnNwbGljZShmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSksIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBsYXN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc0VuZChmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBmb2xkcy5wb3AoKTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQucm93ID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLnJvdztcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQuY29sdW1uID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGVyZSBhcmUgbW9yZSB0aGVuIDIgZm9sZHMgYW5kIHRoZSBmb2xkIGlzIG5vdCBhdCB0aGUgZWRnZS5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZWFucywgdGhlIGZvbGQgaXMgc29tZXdoZXJlIGluIGJldHdlZW4uXG4gICAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIGluIG9uZSByb3csIHdlIGp1c3QgY2FuIHJlbW92ZSBpdC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc3BsaWNlKGZvbGRzLmluZGV4T2YoZm9sZCksIDEpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZvbGQgZ29lcyBvdmVyIG1vcmUgdGhlbiBvbmUgcm93LiBUaGlzIG1lYW5zIHJlbXZvaW5nIHRoaXMgZm9sZFxuICAgICAgICAgICAgICAgICAgICAvLyB3aWxsIGNhdXNlIHRoZSBmb2xkIGxpbmUgdG8gZ2V0IHNwbGl0dGVkIHVwLiBuZXdGb2xkTGluZSBpcyB0aGUgc2Vjb25kIHBhcnRcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ld0ZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzID0gbmV3Rm9sZExpbmUuZm9sZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiR1cGRhdGluZykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcInJlbW92ZVwiIH0pO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGRzKGZvbGRzOiBGb2xkW10pOiB2b2lkIHtcbiAgICAgICAgLy8gV2UgbmVlZCB0byBjbG9uZSB0aGUgZm9sZHMgYXJyYXkgcGFzc2VkIGluIGFzIGl0IG1pZ2h0IGJlIHRoZSBmb2xkc1xuICAgICAgICAvLyBhcnJheSBvZiBhIGZvbGQgbGluZSBhbmQgYXMgd2UgY2FsbCB0aGlzLnJlbW92ZUZvbGQoZm9sZCksIGZvbGRzXG4gICAgICAgIC8vIGFyZSByZW1vdmVkIGZyb20gZm9sZHMgYW5kIGNoYW5nZXMgdGhlIGN1cnJlbnQgaW5kZXguXG4gICAgICAgIHZhciBjbG9uZUZvbGRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNsb25lRm9sZHMucHVzaChmb2xkc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICBjbG9uZUZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkKGZvbGQ6IEZvbGQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICBmb2xkLnN1YkZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgZm9sZC5yZXN0b3JlUmFuZ2Uoc3ViRm9sZCk7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoc3ViRm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBpZiAoZm9sZC5jb2xsYXBzZUNoaWxkcmVuID4gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKGZvbGQuc3RhcnQucm93ICsgMSwgZm9sZC5lbmQucm93LCBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gLSAxKTtcbiAgICAgICAgfVxuICAgICAgICBmb2xkLnN1YkZvbGRzID0gW107XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgdW5mb2xkKGxvY2F0aW9uPzogYW55LCBleHBhbmRJbm5lcj86IGJvb2xlYW4pOiBGb2xkW10ge1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXTtcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHRoaXMuZ2V0TGVuZ3RoKCksIDApO1xuICAgICAgICAgICAgZXhwYW5kSW5uZXIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhdGlvbiA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UobG9jYXRpb24sIDAsIGxvY2F0aW9uLCB0aGlzLmdldExpbmUobG9jYXRpb24pLmxlbmd0aCk7XG4gICAgICAgIGVsc2UgaWYgKFwicm93XCIgaW4gbG9jYXRpb24pXG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMobG9jYXRpb24sIGxvY2F0aW9uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBsb2NhdGlvbjtcblxuICAgICAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgIGlmIChleHBhbmRJbm5lcikge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgICAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgICAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKHN1YkZvbGRzKTtcbiAgICAgICAgICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAgICogZm9sZGVkIHBhcnRzIHN1Y2ggdGhhdCBzb21lIHBhcnRzIG9mIHRoZSBsaW5lIGlzIHN0aWxsIHZpc2libGUuXG4gICAgICoqL1xuICAgIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRFbmQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93PzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIsIHN0YXJ0Um93PzogbnVtYmVyLCBzdGFydENvbHVtbj86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09IG51bGwpXG4gICAgICAgICAgICBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uIDwgc3RhcnRDb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsYXN0Q29sdW1uID0gTWF0aC5tYXgoc3RhcnRDb2x1bW4sIGxhc3RDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGV4dExpbmU7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBsaW5lOiBzdHJpbmc7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gfHwgMCwgZW5kQ29sdW1uIHx8IGxpbmUubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgICAgICAgICBmb2xkTGluZSwgcm93LCBlbmRDb2x1bW4sIHN0YXJ0Um93LCBzdGFydENvbHVtbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgZm9sZCA9IGZvbGRzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmb2xkKVxuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcblxuICAgICAgICBpZiAoZm9sZCAmJiBmb2xkLnJhbmdlLnRvU3RyaW5nKCkgPT0gcmFuZ2UudG9TdHJpbmcoKSkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBsYWNlaG9sZGVyID0gXCIuLi5cIjtcbiAgICAgICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHRoaXMuZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlci5sZW5ndGggPCA0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXIudHJpbSgpLnN1YnN0cmluZygwLCAyKSArIFwiLi5cIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkRm9sZChwbGFjZWhvbGRlciwgcmFuZ2UpO1xuICAgIH1cblxuICAgIGdldENvbW1lbnRGb2xkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBkaXI/OiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIGlmICh0b2tlbiAmJiAvXmNvbW1lbnR8c3RyaW5nLy50ZXN0KHRva2VuLnR5cGUpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHRva2VuLnR5cGUucmVwbGFjZSgvXFwuLiovLCBcIlxcXFwuXCIpKTtcbiAgICAgICAgICAgIGlmIChkaXIgIT0gMSkge1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMjtcblxuICAgICAgICAgICAgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChkaXIgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoIC0gMjtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvbGRBbGwoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGRlcHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKGRlcHRoID09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGRlcHRoID0gMTAwMDAwOyAvLyBKU09OLnN0cmluZ2lmeSBkb2Vzbid0IGhhbmxlIEluZmluaXR5XG4gICAgICAgIHZhciBmb2xkV2lkZ2V0cyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZm9sZFdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICAgICAgZW5kUm93ID0gZW5kUm93IHx8IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgIHN0YXJ0Um93ID0gc3RhcnRSb3cgfHwgMDtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8IGVuZFJvdzsgcm93KyspIHtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddID09IG51bGwpXG4gICAgICAgICAgICAgICAgZm9sZFdpZGdldHNbcm93XSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gIT0gXCJzdGFydFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3cpO1xuICAgICAgICAgICAgLy8gc29tZXRpbWVzIHJhbmdlIGNhbiBiZSBpbmNvbXBhdGlibGUgd2l0aCBleGlzdGluZyBmb2xkXG4gICAgICAgICAgICAvLyBUT0RPIGNoYW5nZSBhZGRGb2xkIHRvIHJldHVybiBudWxsIGlzdGVhZCBvZiB0aHJvd2luZ1xuICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzTXVsdGlMaW5lKClcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5lbmQucm93IDw9IGVuZFJvd1xuICAgICAgICAgICAgICAgICYmIHJhbmdlLnN0YXJ0LnJvdyA+PSBzdGFydFJvd1xuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGRGb2xkIGNhbiBjaGFuZ2UgdGhlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSBkZXB0aDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEZvbGRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIGlmICghdGhpcy4kZm9sZFN0eWxlc1tzdHlsZV0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGZvbGQgc3R5bGU6IFwiICsgc3R5bGUgKyBcIltcIiArIE9iamVjdC5rZXlzKHRoaXMuJGZvbGRTdHlsZXMpLmpvaW4oXCIsIFwiKSArIFwiXVwiKTtcblxuICAgICAgICBpZiAodGhpcy4kZm9sZFN0eWxlID09PSBzdHlsZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkU3R5bGUgPSBzdHlsZTtcblxuICAgICAgICBpZiAoc3R5bGUgPT09IFwibWFudWFsXCIpXG4gICAgICAgICAgICB0aGlzLnVuZm9sZCgpO1xuICAgICAgICBcbiAgICAgICAgLy8gcmVzZXQgZm9sZGluZ1xuICAgICAgICB2YXIgbW9kZSA9IHRoaXMuJGZvbGRNb2RlO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG51bGwpO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHNldEZvbGRpbmcoZm9sZE1vZGUpIHtcbiAgICAgICAgaWYgKHRoaXMuJGZvbGRNb2RlID09IGZvbGRNb2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRNb2RlID0gZm9sZE1vZGU7XG5cbiAgICAgICAgdGhpcy5vZmYoJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUFubm90YXRpb25cIik7XG5cbiAgICAgICAgaWYgKCFmb2xkTW9kZSB8fCB0aGlzLiRmb2xkU3R5bGUgPT0gXCJtYW51YWxcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gW107XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldCA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXQuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2UuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcblxuICAgICAgICB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyA9IHRoaXMudXBkYXRlRm9sZFdpZGdldHMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuXG4gICAgfVxuXG4gICAgZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3c6IG51bWJlciwgaWdub3JlQ3VycmVudD86IGJvb2xlYW4pOiB7IHJhbmdlPzogUmFuZ2U7IGZpcnN0UmFuZ2U/OiBSYW5nZSB9IHtcbiAgICAgICAgdmFyIGZ3ID0gdGhpcy5mb2xkV2lkZ2V0cztcbiAgICAgICAgaWYgKCFmdyB8fCAoaWdub3JlQ3VycmVudCAmJiBmd1tyb3ddKSkge1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSByb3cgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSYW5nZTogUmFuZ2U7XG4gICAgICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgICAgICAgIHZhciBjID0gZndbaV07XG4gICAgICAgICAgICBpZiAoYyA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGMgPSBmd1tpXSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChpKTtcblxuICAgICAgICAgICAgaWYgKGMgPT0gXCJzdGFydFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UoaSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaXJzdFJhbmdlKVxuICAgICAgICAgICAgICAgICAgICBmaXJzdFJhbmdlID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmVuZC5yb3cgPj0gcm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByYW5nZTogaSAhPT0gLTEgJiYgcmFuZ2UsXG4gICAgICAgICAgICBmaXJzdFJhbmdlOiBmaXJzdFJhbmdlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Gb2xkV2lkZ2V0Q2xpY2socm93OiBudW1iZXIsIGUpIHtcbiAgICAgICAgZSA9IGUuZG9tRXZlbnQ7XG4gICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgY2hpbGRyZW46IGUuc2hpZnRLZXksXG4gICAgICAgICAgICBhbGw6IGUuY3RybEtleSB8fCBlLm1ldGFLZXksXG4gICAgICAgICAgICBzaWJsaW5nczogZS5hbHRLZXlcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk7XG4gICAgICAgIGlmICghcmFuZ2UpIHtcbiAgICAgICAgICAgIHZhciBlbCA9IChlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQpXG4gICAgICAgICAgICBpZiAoZWwgJiYgL2FjZV9mb2xkLXdpZGdldC8udGVzdChlbC5jbGFzc05hbWUpKVxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTmFtZSArPSBcIiBhY2VfaW52YWxpZFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdG9nZ2xlRm9sZFdpZGdldChyb3c6IG51bWJlciwgb3B0aW9ucyk6IFJhbmdlIHtcbiAgICAgICAgaWYgKCF0aGlzLmdldEZvbGRXaWRnZXQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciB0eXBlID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGRpciA9IHR5cGUgPT09IFwiZW5kXCIgPyAtMSA6IDE7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCBkaXIgPT09IC0xID8gMCA6IGxpbmUubGVuZ3RoLCBkaXIpO1xuXG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZHJlbiB8fCBvcHRpb25zLmFsbClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93LCB0cnVlKTtcbiAgICAgICAgLy8gc29tZXRpbWVzIHNpbmdsZWxpbmUgZm9sZHMgY2FuIGJlIG1pc3NlZCBieSB0aGUgY29kZSBhYm92ZVxuICAgICAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCAmJiByYW5nZS5pc0VxdWFsKGZvbGQucmFuZ2UpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLnNpYmxpbmdzKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKGRhdGEucmFuZ2UpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSb3cgPSBkYXRhLnJhbmdlLnN0YXJ0LnJvdyArIDE7XG4gICAgICAgICAgICAgICAgdmFyIGVuZFJvdyA9IGRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChzdGFydFJvdywgZW5kUm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5jaGlsZHJlbikge1xuICAgICAgICAgICAgZW5kUm93ID0gcmFuZ2UgPyByYW5nZS5lbmQucm93IDogdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChyb3cgKyAxLCByYW5nZS5lbmQucm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmFsbCkge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBiaXQgdWdseSwgYnV0IGl0IGNvcnJlc3BvbmRzIHRvIHNvbWUgY29kZSBlbHNld2hlcmUuXG4gICAgICAgICAgICAgICAgcmFuZ2UuY29sbGFwc2VDaGlsZHJlbiA9IDEwMDAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cblxuXG4gICAgdG9nZ2xlRm9sZFdpZGdldCh0b2dnbGVQYXJlbnQpIHtcbiAgICAgICAgdmFyIHJvdzogbnVtYmVyID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkucm93O1xuICAgICAgICByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChyb3cpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiR0b2dnbGVGb2xkV2lkZ2V0KHJvdywge30pO1xuXG4gICAgICAgIGlmIChyYW5nZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgLy8gaGFuZGxlIHRvZ2dsZVBhcmVudFxuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3csIHRydWUpO1xuICAgICAgICByYW5nZSA9IGRhdGEucmFuZ2UgfHwgZGF0YS5maXJzdFJhbmdlO1xuXG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aCwgMSk7XG5cbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlRm9sZFdpZGdldHMoZTogeyBkYXRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSB9LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB2YXIgcmFuZ2UgPSBkZWx0YS5yYW5nZTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICB2YXIgbGVuID0gcmFuZ2UuZW5kLnJvdyAtIGZpcnN0Um93O1xuXG4gICAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHNbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlTGluZXNcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UoZmlyc3RSb3csIGxlbiArIDEsIG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4gKyAxKTtcbiAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMSk7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZS5hcHBseSh0aGlzLmZvbGRXaWRnZXRzLCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gRklYTUU6IFJlc3RvcmVcbi8vIEZvbGRpbmcuY2FsbChFZGl0U2Vzc2lvbi5wcm90b3R5cGUpO1xuXG5kZWZpbmVPcHRpb25zKEVkaXRTZXNzaW9uLnByb3RvdHlwZSwgXCJzZXNzaW9uXCIsIHtcbiAgICB3cmFwOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdmFsdWUgPT0gXCJvZmZcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGZhbHNlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJmcmVlXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0cnVlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJwcmludE1hcmdpblwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gLTE7XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IHZhbHVlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbCA9IHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiID8gdmFsdWUgOiBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UoY29sLCBjb2wpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiR3cmFwID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gLTEpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInByaW50TWFyZ2luXCI7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmdldFdyYXBMaW1pdFJhbmdlKCkubWluKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJmcmVlXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJvZmZcIjtcbiAgICAgICAgfSxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgd3JhcE1ldGhvZDoge1xuICAgICAgICAvLyBjb2RlfHRleHR8YXV0b1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdmFsID0gdmFsID09IFwiYXV0b1wiXG4gICAgICAgICAgICAgICAgPyB0aGlzLiRtb2RlLnR5cGUgIT0gXCJ0ZXh0XCJcbiAgICAgICAgICAgICAgICA6IHZhbCAhPSBcInRleHRcIjtcbiAgICAgICAgICAgIGlmICh2YWwgIT0gdGhpcy4kd3JhcEFzQ29kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHdyYXBBc0NvZGUgPSB2YWw7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImF1dG9cIlxuICAgIH0sXG4gICAgZmlyc3RMaW5lTnVtYmVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIik7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogMVxuICAgIH0sXG4gICAgdXNlV29ya2VyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXb3JrZXIgPSB1c2VXb3JrZXI7XG5cbiAgICAgICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcbiAgICAgICAgICAgIGlmICh1c2VXb3JrZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB0YWJTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA0LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBvdmVyd3JpdGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlT3ZlcndyaXRlXCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBuZXdMaW5lTW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJG1vZGVJZCB9XG4gICAgfVxufSk7XG4iXX0=