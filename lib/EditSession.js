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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uc2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlTW9kZSIsIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyIiwiRWRpdFNlc3Npb24uJHN0YXJ0V29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0TW9kZSIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZSIsIkVkaXRTZXNzaW9uLmdldExpbmVzIiwiRWRpdFNlc3Npb24uZ2V0TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0VGV4dFJhbmdlIiwiRWRpdFNlc3Npb24uaW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVtb3ZlIiwiRWRpdFNlc3Npb24udW5kb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5yZWRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnNldFVuZG9TZWxlY3QiLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uLmlzSW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVwbGFjZSIsIkVkaXRTZXNzaW9uLm1vdmVUZXh0IiwiRWRpdFNlc3Npb24uaW5kZW50Um93cyIsIkVkaXRTZXNzaW9uLm91dGRlbnRSb3dzIiwiRWRpdFNlc3Npb24uJG1vdmVMaW5lcyIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93biIsIkVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzIiwiRWRpdFNlc3Npb24uJGNsaXBSb3dUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBDb2x1bW5Ub1JvdyIsIkVkaXRTZXNzaW9uLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBSYW5nZVRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLmdldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi4kY29uc3RyYWluV3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlV3JhcERhdGEiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMuYWRkU3BsaXQiLCJFZGl0U2Vzc2lvbi4kZ2V0RGlzcGxheVRva2VucyIsIkVkaXRTZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xpbmVDb3VudCIsIkVkaXRTZXNzaW9uLmdldFJvd1dyYXBJbmRlbnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRDb2x1bW4iLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxlbmd0aCIsIkVkaXRTZXNzaW9uLiRzZXRGb250TWV0cmljcyIsIkVkaXRTZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uJGZpbmRDbG9zaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEZvbGRBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJFZGl0U2Vzc2lvbi5nZXRBbGxGb2xkcyIsIkVkaXRTZXNzaW9uLmdldEZvbGRTdHJpbmdBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZGVkUm93Q291bnQiLCJFZGl0U2Vzc2lvbi4kYWRkRm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkIiwiRWRpdFNlc3Npb24uc2V0TW9kaWZpZWQiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkcyIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGQiLCJFZGl0U2Vzc2lvbi5yZW1vdmVGb2xkcyIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGQiLCJFZGl0U2Vzc2lvbi5leHBhbmRGb2xkcyIsIkVkaXRTZXNzaW9uLnVuZm9sZCIsIkVkaXRTZXNzaW9uLmlzUm93Rm9sZGVkIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZEVuZCIsIkVkaXRTZXNzaW9uLmdldFJvd0ZvbGRTdGFydCIsIkVkaXRTZXNzaW9uLmdldEZvbGREaXNwbGF5TGluZSIsIkVkaXRTZXNzaW9uLmdldERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uJGNsb25lRm9sZERhdGEiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkIiwiRWRpdFNlc3Npb24uZ2V0Q29tbWVudEZvbGRSYW5nZSIsIkVkaXRTZXNzaW9uLmZvbGRBbGwiLCJFZGl0U2Vzc2lvbi5zZXRGb2xkU3R5bGUiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9sZGluZyIsIkVkaXRTZXNzaW9uLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJFZGl0U2Vzc2lvbi5vbkZvbGRXaWRnZXRDbGljayIsIkVkaXRTZXNzaW9uLiR0b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCIsIkVkaXRTZXNzaW9uLnVwZGF0ZUZvbGRXaWRnZXRzIl0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsaUJBQWlCLE1BQU0scUJBQXFCO09BQzVDLFFBQVEsTUFBTSxZQUFZO09BQzFCLElBQUksTUFBTSxRQUFRO09BQ2xCLFNBQVMsTUFBTSxhQUFhO09BQzVCLElBQUksTUFBTSxhQUFhO09BQ3ZCLEtBQUssTUFBTSxTQUFTO09BQ3BCLGNBQWMsTUFBTSxrQkFBa0I7T0FDdEMsbUJBQW1CLE1BQU0sdUJBQXVCO09BQ2hELGVBQWUsTUFBTSxtQkFBbUI7T0FDeEMsRUFBQyxNQUFNLEVBQUMsTUFBTSxlQUFlO09BQzdCLFlBQVksTUFBTSw2QkFBNkI7T0FFL0MsYUFBYSxNQUFNLGlCQUFpQjtBQUszQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0Es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QUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQzNDNkMsSUFBSUEsSUFBSUEsR0FBV0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFckNBLElBQUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNYQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUU1REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDVEEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBO1lBQ0FBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRTdCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsR0FBR0EsQ0FB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LElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBO1lBQ2pDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUV2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEJBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO29CQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLENBQUNBO29CQUNWQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDdkNBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBO29CQUNqQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEs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N0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9EQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFB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SUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUNwQkEsSUFBSUEsT0FBZUEsQ0FBQ0E7UUFFcEJBLElBQUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3ZEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUN2QkEsT0FBT0EsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDbERBLE9BQU9BLEdBQUdBLE9BQU9BLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1lBQzFGQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3hGQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxPQUFPQSxDQUFDQTtnQkFDcENBLENBQUNBO2dCQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDcEZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BEQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQTtnQkFDN0JBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO1lBQy9CQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBO1lBQzdCQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN0Q0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDNUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLFVBQVNBLENBQUNBO2dCQUM5QixDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNkLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUM5QixDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUM7Z0JBQzlCLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzVCLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDNUIsQ0FBQztnQkFDRCxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDckIsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNiLENBQUMsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDbkJBLENBQUNBO0lBWU01RSxVQUFVQSxDQUFDQSxRQUFnQkEsRUFBRUEsTUFBY0EsRUFBRUEsWUFBb0JBO1FBQ3BFNkUsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLEVBQUVBLEdBQUdBLElBQUlBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBO1lBQ3pDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUMzREEsQ0FBQ0E7SUFRTTdFLFdBQVdBLENBQUNBLEtBQVlBO1FBQzNCOEUsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDcENBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUU3QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDMURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7b0JBQ3RCQSxLQUFLQSxDQUFDQTtZQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJ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QUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNoRUEsQ0FBQ0E7SUFFT25GLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUE7UUFDaENvRixFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFHT3BGLHVCQUF1QkEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDdkRxRixNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNiQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDOUNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENB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SUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEdBQUdBLEdBQUdBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxHQUFHQSxpQkFBaUJBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUUxRUEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQy9CQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDbERBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO2dCQUUvQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUN4RUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBRXhCQSxJQUFJQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDaERBLEVBQUVBLENBQUNBLENBQUNBLGNBQWNBLElBQUlBLGNBQWNBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNoREEsY0FBY0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7d0JBQy9CQSxRQUFRQSxHQUFHQSxjQUFjQSxDQUFDQTtvQkFDOUJBLENBQUNBO29CQUNEQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDMUNBLENBQUNBO2dCQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDdENBLElBQUlBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDNUJBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDdkJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsSUFBSUEsR0FBR0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQUE7Z0JBQzdEQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFJNUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO2dCQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUFBO29CQUUvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1hBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNuREEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FB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LElBQUlBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBSW5EQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMzQkEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBRWRBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBO2dCQUNYLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0E7Z0JBRUZBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBO2dCQUNWLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFUEEsWUFBWUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzFCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREQsT0FBT0EsYUFBYUEsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFFM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBSWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFNdkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFD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Q0FBQ0E7UUFDVEEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLElBQUlBLE1BQU1BLENBQUNBO1FBQ1hBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1pBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBRWxCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxHQUFHQSxJQUFJQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN0QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLElBQUlBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNsREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBO2dCQUNqQkEsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDbERBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENB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QUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdkNBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDaERBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3BDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBRWpEQSxPQUFPQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDbkJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNqQ0EsVUFBVUEsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDdkJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNB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REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUQzSCxlQUFlQSxDQUFDQSxLQUFZQTtRQUN4QjRILElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNwQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLFVBQVVBLEdBQVdBLEVBQUVBLENBQUNBO1FBRTVCQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNsQkEsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdqQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNB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RUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFaEJBLElBQUlBLFFBQVFBLEdBQUdBO1lBQ1hBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1NBQ3JCQSxDQUFDQTtRQUVGQSxJQUFJQSxHQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ0xBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXRFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUVEL0gsV0FBV0EsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ2hEZ0ksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3REEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUdEaEksZUFBZUEsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ3BEaUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEakksaUJBQWlCQSxDQUFDQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUN6Q2tJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUN0QkEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7d0JBQ2ZBLFFBQVFBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBO29CQUM3QkEsSUFBSUE7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QSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFaEJBLElBQUlBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsSUFBSUEsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBRW5EQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTt3QkFDN0JBLEtBQUtBLENBQUNBO29CQUNWQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0Q0EsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFckVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqRUEsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUd2RUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBO1FBRXhEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFRHBJLFdBQVdBLENBQUNBLFFBQWlCQTtJQUU3QnFJLENBQUNBO0lBRURySSxRQUFRQSxDQUFDQSxLQUFhQTtRQUNsQnNJLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLElBQUlBO1lBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkIsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNiQSxDQUFDQTtJQUVEdEksVUFBVUEsQ0FBQ0EsSUFBVUE7UUFDakJ1SSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUM3QkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDbENBLElBQUlBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1FBRTlCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUMvQkEsSUFBSUEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFHM0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FFQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ1pBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ25EQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUM3REEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FFQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNURBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNsREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FLQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQUNBLElBQUlBLENBR05BLENBQUNBO1lBQ0dBLElBQUlBLFdBQVdBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BFQSxLQUFLQSxHQUFHQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMxQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDZEEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDM0NBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUViQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMzQ0EsSUFBSUE7Z0JBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBR0RBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFFRHZJLFdBQVdBLENBQUNBLEtBQWFBO1FBSXJCd0ksSUFBSUEsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDcEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3BDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtR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SUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hCQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0JBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNOQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcERBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxXQUFXQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNB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QUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzlEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN0QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNiQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDeENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3BDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFD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SU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIHN0cmluZ1JlcGVhdH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCB7X3NpZ25hbCwgZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IEZvbGRMaW5lIGZyb20gXCIuL0ZvbGRMaW5lXCI7XG5pbXBvcnQgRm9sZCBmcm9tIFwiLi9Gb2xkXCI7XG5pbXBvcnQgU2VsZWN0aW9uIGZyb20gXCIuL1NlbGVjdGlvblwiO1xuaW1wb3J0IE1vZGUgZnJvbSBcIi4vbW9kZS9Nb2RlXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4vUmFuZ2VcIjtcbmltcG9ydCBFZGl0b3JEb2N1bWVudCBmcm9tIFwiLi9FZGl0b3JEb2N1bWVudFwiO1xuaW1wb3J0IEJhY2tncm91bmRUb2tlbml6ZXIgZnJvbSBcIi4vQmFja2dyb3VuZFRva2VuaXplclwiO1xuaW1wb3J0IFNlYXJjaEhpZ2hsaWdodCBmcm9tIFwiLi9TZWFyY2hIaWdobGlnaHRcIjtcbmltcG9ydCB7YXNzZXJ0fSBmcm9tICcuL2xpYi9hc3NlcnRzJztcbmltcG9ydCBCcmFja2V0TWF0Y2ggZnJvbSBcIi4vZWRpdF9zZXNzaW9uL0JyYWNrZXRNYXRjaFwiO1xuaW1wb3J0IFVuZG9NYW5hZ2VyIGZyb20gJy4vVW5kb01hbmFnZXInXG5pbXBvcnQgVG9rZW5JdGVyYXRvciBmcm9tICcuL1Rva2VuSXRlcmF0b3InO1xuaW1wb3J0IEZvbnRNZXRyaWNzIGZyb20gXCIuL2xheWVyL0ZvbnRNZXRyaWNzXCI7XG5pbXBvcnQgV29ya2VyQ2xpZW50IGZyb20gXCIuL3dvcmtlci9Xb3JrZXJDbGllbnRcIjtcblxuLy8gXCJUb2tlbnNcIlxudmFyIENIQVIgPSAxLFxuICAgIENIQVJfRVhUID0gMixcbiAgICBQTEFDRUhPTERFUl9TVEFSVCA9IDMsXG4gICAgUExBQ0VIT0xERVJfQk9EWSA9IDQsXG4gICAgUFVOQ1RVQVRJT04gPSA5LFxuICAgIFNQQUNFID0gMTAsXG4gICAgVEFCID0gMTEsXG4gICAgVEFCX1NQQUNFID0gMTI7XG5cbi8vIEZvciBldmVyeSBrZXlzdHJva2UgdGhpcyBnZXRzIGNhbGxlZCBvbmNlIHBlciBjaGFyIGluIHRoZSB3aG9sZSBkb2MhIVxuLy8gV291bGRuJ3QgaHVydCB0byBtYWtlIGl0IGEgYml0IGZhc3RlciBmb3IgYyA+PSAweDExMDBcbmZ1bmN0aW9uIGlzRnVsbFdpZHRoKGM6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmIChjIDwgMHgxMTAwKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGMgPj0gMHgxMTAwICYmIGMgPD0gMHgxMTVGIHx8XG4gICAgICAgIGMgPj0gMHgxMUEzICYmIGMgPD0gMHgxMUE3IHx8XG4gICAgICAgIGMgPj0gMHgxMUZBICYmIGMgPD0gMHgxMUZGIHx8XG4gICAgICAgIGMgPj0gMHgyMzI5ICYmIGMgPD0gMHgyMzJBIHx8XG4gICAgICAgIGMgPj0gMHgyRTgwICYmIGMgPD0gMHgyRTk5IHx8XG4gICAgICAgIGMgPj0gMHgyRTlCICYmIGMgPD0gMHgyRUYzIHx8XG4gICAgICAgIGMgPj0gMHgyRjAwICYmIGMgPD0gMHgyRkQ1IHx8XG4gICAgICAgIGMgPj0gMHgyRkYwICYmIGMgPD0gMHgyRkZCIHx8XG4gICAgICAgIGMgPj0gMHgzMDAwICYmIGMgPD0gMHgzMDNFIHx8XG4gICAgICAgIGMgPj0gMHgzMDQxICYmIGMgPD0gMHgzMDk2IHx8XG4gICAgICAgIGMgPj0gMHgzMDk5ICYmIGMgPD0gMHgzMEZGIHx8XG4gICAgICAgIGMgPj0gMHgzMTA1ICYmIGMgPD0gMHgzMTJEIHx8XG4gICAgICAgIGMgPj0gMHgzMTMxICYmIGMgPD0gMHgzMThFIHx8XG4gICAgICAgIGMgPj0gMHgzMTkwICYmIGMgPD0gMHgzMUJBIHx8XG4gICAgICAgIGMgPj0gMHgzMUMwICYmIGMgPD0gMHgzMUUzIHx8XG4gICAgICAgIGMgPj0gMHgzMUYwICYmIGMgPD0gMHgzMjFFIHx8XG4gICAgICAgIGMgPj0gMHgzMjIwICYmIGMgPD0gMHgzMjQ3IHx8XG4gICAgICAgIGMgPj0gMHgzMjUwICYmIGMgPD0gMHgzMkZFIHx8XG4gICAgICAgIGMgPj0gMHgzMzAwICYmIGMgPD0gMHg0REJGIHx8XG4gICAgICAgIGMgPj0gMHg0RTAwICYmIGMgPD0gMHhBNDhDIHx8XG4gICAgICAgIGMgPj0gMHhBNDkwICYmIGMgPD0gMHhBNEM2IHx8XG4gICAgICAgIGMgPj0gMHhBOTYwICYmIGMgPD0gMHhBOTdDIHx8XG4gICAgICAgIGMgPj0gMHhBQzAwICYmIGMgPD0gMHhEN0EzIHx8XG4gICAgICAgIGMgPj0gMHhEN0IwICYmIGMgPD0gMHhEN0M2IHx8XG4gICAgICAgIGMgPj0gMHhEN0NCICYmIGMgPD0gMHhEN0ZCIHx8XG4gICAgICAgIGMgPj0gMHhGOTAwICYmIGMgPD0gMHhGQUZGIHx8XG4gICAgICAgIGMgPj0gMHhGRTEwICYmIGMgPD0gMHhGRTE5IHx8XG4gICAgICAgIGMgPj0gMHhGRTMwICYmIGMgPD0gMHhGRTUyIHx8XG4gICAgICAgIGMgPj0gMHhGRTU0ICYmIGMgPD0gMHhGRTY2IHx8XG4gICAgICAgIGMgPj0gMHhGRTY4ICYmIGMgPD0gMHhGRTZCIHx8XG4gICAgICAgIGMgPj0gMHhGRjAxICYmIGMgPD0gMHhGRjYwIHx8XG4gICAgICAgIGMgPj0gMHhGRkUwICYmIGMgPD0gMHhGRkU2O1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFZGl0U2Vzc2lvbiBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgJGJyZWFrcG9pbnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHB1YmxpYyAkZGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSAkZnJvbnRNYXJrZXJzID0ge307XG4gICAgcHVibGljICRiYWNrTWFya2VycyA9IHt9O1xuICAgIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgICBwcml2YXRlICR1bmRvU2VsZWN0ID0gdHJ1ZTtcbiAgICBwcml2YXRlICRkZWx0YXM7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICAgIHByaXZhdGUgJGRlbHRhc0ZvbGQ7XG4gICAgcHJpdmF0ZSAkZnJvbVVuZG87XG5cbiAgICBwcml2YXRlICR1cGRhdGVGb2xkV2lkZ2V0czogKCkgPT4gYW55O1xuICAgIHByaXZhdGUgJGZvbGREYXRhOiBGb2xkTGluZVtdO1xuICAgIHB1YmxpYyBmb2xkV2lkZ2V0czogYW55W107XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXQ6IChyb3c6IG51bWJlcikgPT4gYW55O1xuICAgIHB1YmxpYyBnZXRGb2xkV2lkZ2V0UmFuZ2U6IChyb3c6IG51bWJlciwgZm9yY2VNdWx0aWxpbmU/OiBib29sZWFuKSA9PiBSYW5nZTtcblxuICAgIHB1YmxpYyBkb2M6IEVkaXRvckRvY3VtZW50O1xuICAgIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgICBwcml2YXRlICR1bmRvTWFuYWdlcjogVW5kb01hbmFnZXI7XG4gICAgcHJpdmF0ZSAkaW5mb3JtVW5kb01hbmFnZXI6IHsgY2FuY2VsOiAoKSA9PiB2b2lkOyBzY2hlZHVsZTogKCkgPT4gdm9pZCB9O1xuICAgIHB1YmxpYyBiZ1Rva2VuaXplcjogQmFja2dyb3VuZFRva2VuaXplcjtcbiAgICBwdWJsaWMgJG1vZGlmaWVkO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uOiBTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkZG9jUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICAgIHByaXZhdGUgJHNjcmVlblJvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICRyb3dMZW5ndGhDYWNoZTtcbiAgICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgJHNlYXJjaEhpZ2hsaWdodDogU2VhcmNoSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgJGFubm90YXRpb25zO1xuICAgIHByaXZhdGUgJGF1dG9OZXdMaW5lO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuICAgIHByaXZhdGUgJHVzZVdvcmtlcjtcbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vZGVzOiB7IFtwYXRoOiBzdHJpbmddOiBNb2RlIH0gPSB7fTtcblxuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgcHVibGljICRtb2RlOiBNb2RlID0gbnVsbDtcbiAgICBwcml2YXRlICRtb2RlSWQgPSBudWxsO1xuICAgIC8qKlxuICAgICAqIFRoZSB3b3JrZXIgY29ycmVzcG9uZGluZyB0byB0aGUgbW9kZSAoaS5lLiBMYW5ndWFnZSkuXG4gICAgICovXG4gICAgcHJpdmF0ZSAkd29ya2VyOiBXb3JrZXJDbGllbnQ7XG4gICAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgICBwdWJsaWMgdG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyBub25Ub2tlblJlOiBSZWdFeHA7XG4gICAgcHVibGljICRzY3JvbGxUb3AgPSAwO1xuICAgIHByaXZhdGUgJHNjcm9sbExlZnQgPSAwO1xuICAgIC8vIFdSQVBNT0RFXG4gICAgcHJpdmF0ZSAkd3JhcEFzQ29kZTtcbiAgICBwcml2YXRlICR3cmFwTGltaXQgPSA4MDtcbiAgICBwdWJsaWMgJHVzZVdyYXBNb2RlID0gZmFsc2U7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgIG1pbjogbnVsbCxcbiAgICAgICAgbWF4OiBudWxsXG4gICAgfTtcbiAgICBwdWJsaWMgJHVwZGF0aW5nO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0cyA9IG51bGw7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgcHJpdmF0ZSAkc3luY0luZm9ybVVuZG9NYW5hZ2VyOiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBtZXJnZVVuZG9EZWx0YXM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdXNlU29mdFRhYnM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdGFiU2l6ZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJHdyYXBNZXRob2Q7XG4gICAgcHJpdmF0ZSBzY3JlZW5XaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgbGluZVdpZGdldHNXaWR0aDogbnVtYmVyO1xuICAgIHByaXZhdGUgbGluZVdpZGdldFdpZHRoOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoO1xuICAgIC8vXG4gICAgcHVibGljICR0YWdIaWdobGlnaHQ7XG4gICAgcHVibGljICRicmFja2V0SGlnaGxpZ2h0OiBudW1iZXI7ICAgLy8gYSBtYXJrZXIuXG4gICAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOyAgICAgICAgLy8gTm90IGEgbWFya2VyIVxuICAgIC8qKlxuICAgICAqIEEgbnVtYmVyIGlzIGEgbWFya2VyIGlkZW50aWZpZXIsIG51bGwgaW5kaWNhdGVzIHRoYXQgbm8gc3VjaCBtYXJrZXIgZXhpc3RzLiBcbiAgICAgKi9cbiAgICBwdWJsaWMgJHNlbGVjdGlvbk1hcmtlcjogbnVtYmVyID0gbnVsbDtcbiAgICBwcml2YXRlICRicmFja2V0TWF0Y2hlciA9IG5ldyBCcmFja2V0TWF0Y2godGhpcyk7XG5cbiAgICBjb25zdHJ1Y3Rvcihkb2M6IEVkaXRvckRvY3VtZW50LCBtb2RlPywgY2I/OiAoKSA9PiBhbnkpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEgPSBbXTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmpvaW4oXCJcXG5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZUZvbGRcIiwgdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2V0RG9jdW1lbnQoZG9jKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHRoaXMpO1xuXG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RlKG1vZGUsIGNiKTtcbiAgICAgICAgX3NpZ25hbChcInNlc3Npb25cIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYEVkaXRTZXNzaW9uYCB0byBwb2ludCB0byBhIG5ldyBgRWRpdG9yRG9jdW1lbnRgLiBJZiBhIGBCYWNrZ3JvdW5kVG9rZW5pemVyYCBleGlzdHMsIGl0IGFsc28gcG9pbnRzIHRvIGBkb2NgLlxuICAgICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gZG9jIHtFZGl0b3JEb2N1bWVudH0gVGhlIG5ldyBgRWRpdG9yRG9jdW1lbnRgIHRvIHVzZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBFZGl0b3JEb2N1bWVudCk6IHZvaWQge1xuICAgICAgICBpZiAoIShkb2MgaW5zdGFuY2VvZiBFZGl0b3JEb2N1bWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImRvYyBtdXN0IGJlIGEgRWRpdG9yRG9jdW1lbnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZG9jKSB7XG4gICAgICAgICAgICB0aGlzLmRvYy5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRvYyA9IGRvYztcbiAgICAgICAgZG9jLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcblxuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXNldENhY2hlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGBFZGl0b3JEb2N1bWVudGAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAgICogQHJldHVybiB7RWRpdG9yRG9jdW1lbnR9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50KCk6IEVkaXRvckRvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgICAgICBpZiAobCA+IGkpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGxvdyA9IDA7XG4gICAgICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgICAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgICAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgICAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgICAgICAgICBoaSA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvdyAtIDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VGb2xkKGUpIHtcbiAgICAgICAgdmFyIGZvbGQgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGRlbHRhLnJhbmdlLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpO1xuICAgICAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgICAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgICAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZGVsdGFzRm9sZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRzOiByZW1vdmVkRm9sZHNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuJHVwZGF0ZU9uQ2hhbmdlKGRlbHRhKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB0ZXh0IHRvIHBsYWNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXRWYWx1ZSh0ZXh0KTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICB0aGlzLnNldFVuZG9NYW5hZ2VyKHRoaXMuJHVuZG9NYW5hZ2VyKTtcbiAgICAgICAgdGhpcy5nZXRVbmRvTWFuYWdlcigpLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRWRpdG9yRG9jdW1lbnQgYEVkaXRvckRvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICoqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBbW0VkaXRvckRvY3VtZW50IGBFZGl0b3JEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgKiBAYWxpYXMgRWRpdFNlc3Npb24udG9TdHJpbmdcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG4gICAgcHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGV9XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBCYWNrZ3JvdW5kVG9rZW5pemVyLmdldFN0YXRlXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VG9rZW5zKHJvdzogbnVtYmVyKTogeyBzdGFydDogbnVtYmVyOyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuIFRoZSBvYmplY3QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgaW5kZXhgIGFuZCBgc3RhcnRgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byByZXRyaWV2ZSBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUb2tlbkF0KHJvdzogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIHRva2VuczogeyB2YWx1ZTogc3RyaW5nIH1bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIHZhciB0b2tlbjogeyBpbmRleD86IG51bWJlcjsgc3RhcnQ/OiBudW1iZXI7IHZhbHVlOiBzdHJpbmcgfTtcbiAgICAgICAgdmFyIGMgPSAwO1xuICAgICAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgICAgICAgIGkgPSB0b2tlbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGMgKz0gdG9rZW5zW2ldLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZiAoYyA+PSBjb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIHRva2VuLmluZGV4ID0gaTtcbiAgICAgICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgKiBAcGFyYW0ge1VuZG9NYW5hZ2VyfSB1bmRvTWFuYWdlciBUaGUgbmV3IHVuZG8gbWFuYWdlclxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRVbmRvTWFuYWdlcih1bmRvTWFuYWdlcjogVW5kb01hbmFnZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb01hbmFnZXIgPSB1bmRvTWFuYWdlcjtcbiAgICAgICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG5cbiAgICAgICAgaWYgKHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgaWYgKHVuZG9NYW5hZ2VyKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHNlbGYuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0ZvbGQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImZvbGRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRm9sZFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImRvY1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNEb2NcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB1bmRvTWFuYWdlci5leGVjdXRlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJhY2V1cGRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtzZWxmLiRkZWx0YXMsIHNlbGZdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVyZ2U6IHNlbGYubWVyZ2VVbmRvRGVsdGFzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxmLm1lcmdlVW5kb0RlbHRhcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcyA9IFtdO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyID0gZGVsYXllZENhbGwodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHN0YXJ0cyBhIG5ldyBncm91cCBpbiB1bmRvIGhpc3RvcnlcbiAgICAgKi9cbiAgICBwdWJsaWMgbWFya1VuZG9Hcm91cCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdW5kbyBtYW5hZ2VyLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVuZG9NYW5hZ2VyIHx8IHRoaXMuJGRlZmF1bHRVbmRvTWFuYWdlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuIElmIHRoZSB1c2VyIGlzIHVzaW5nIHNvZnQgdGFicywgdGhpcyB3aWxsIGJlIGEgc2VyaWVzIG9mIHNwYWNlcyAoZGVmaW5lZCBieSBbW0VkaXRTZXNzaW9uLmdldFRhYlNpemUgYGdldFRhYlNpemUoKWBdXSk7IG90aGVyd2lzZSBpdCdzIHNpbXBseSBgJ1xcdCdgLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUYWJTdHJpbmcoKSB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgLyoqXG4gICAgKiBQYXNzIGB0cnVlYCB0byBlbmFibGUgdGhlIHVzZSBvZiBzb2Z0IHRhYnMuIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VTb2Z0VGFicyBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnNcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVNvZnRUYWJzKHVzZVNvZnRUYWJzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidXNlU29mdFRhYnNcIiwgdXNlU29mdFRhYnMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpOiBib29sZWFuIHtcbiAgICAgICAgLy8gdG9kbyBtaWdodCBuZWVkIG1vcmUgZ2VuZXJhbCB3YXkgZm9yIGNoYW5naW5nIHNldHRpbmdzIGZyb20gbW9kZSwgYnV0IHRoaXMgaXMgb2sgZm9yIG5vd1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgIXRoaXMuJG1vZGUuJGluZGVudFdpdGhUYWJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICAgKiBGb3IgZXhhbXBsZSwgcGFzc2luZyBpbiBgNGAgdHJhbnNmb3JtcyB0aGUgc29mdCB0YWJzIHRvIGJlIGVxdWl2YWxlbnQgdG8gZm91ciBzcGFjZXMuXG4gICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB0YWJTaXplIFRoZSBuZXcgdGFiIHNpemVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidGFiU2l6ZVwiLCB0YWJTaXplKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGFiIHNpemUuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBjaGVja1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS5cbiAgICAqXG4gICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICpcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICAgKiovXG4gICAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPdmVyd3JpdGUoIXRoaXMuJG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBgY2xhc3NOYW1lYCB0byB0aGUgYHJvd2AsIHRvIGJlIHVzZWQgZm9yIENTUyBzdHlsaW5ncyBhbmQgd2hhdG5vdC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBgY2xhc3NOYW1lYCBmcm9tIHRoZSBgcm93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICogQHJldHVybnMge1tOdW1iZXJdfVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0QnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIGV2ZXJ5IHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7QXJyYXl9IHJvd3MgQW4gYXJyYXkgb2Ygcm93IGluZGljZXNcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93c1tpXV0gPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIGFsbCBicmVha3BvaW50cyBvbiB0aGUgcm93cy4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIENsYXNzIG9mIHRoZSBicmVha3BvaW50XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnQocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmIChjbGFzc05hbWUgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGNsYXNzTmFtZSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd10gPSBjbGFzc05hbWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQnJlYWtwb2ludChyb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBBZGRzIGEgbmV3IG1hcmtlciB0byB0aGUgZ2l2ZW4gYFJhbmdlYC4gSWYgYGluRnJvbnRgIGlzIGB0cnVlYCwgYSBmcm9udCBtYXJrZXIgaXMgZGVmaW5lZCwgYW5kIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgZmlyZXM7IG90aGVyd2lzZSwgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGZpcmVzLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgRGVmaW5lIHRoZSByYW5nZSBvZiB0aGUgbWFya2VyXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHR5cGUgSWRlbnRpZnkgdGhlIHR5cGUgb2YgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogYW55LCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgLy8gRklYTUU6IE5lZWQgbW9yZSB0eXBlIHNhZmV0eSBoZXJlLlxuICAgICAgICB2YXIgbWFya2VyID0ge1xuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgICAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PSBcImZ1bmN0aW9uXCIgPyB0eXBlIDogbnVsbCxcbiAgICAgICAgICAgIGNsYXp6OiBjbGF6eixcbiAgICAgICAgICAgIGluRnJvbnQ6ICEhaW5Gcm9udCxcbiAgICAgICAgICAgIGlkOiBpZFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpbkZyb250KSB7XG4gICAgICAgICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBkeW5hbWljIG1hcmtlciB0byB0aGUgc2Vzc2lvbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gbWFya2VyIG9iamVjdCB3aXRoIHVwZGF0ZSBtZXRob2RcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgYWRkZWQgbWFya2VyXG4gICAgICoqL1xuICAgIHByaXZhdGUgYWRkRHluYW1pY01hcmtlcihtYXJrZXIsIGluRnJvbnQ/KSB7XG4gICAgICAgIGlmICghbWFya2VyLnVwZGF0ZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGlkID0gdGhpcy4kbWFya2VySWQrKztcbiAgICAgICAgbWFya2VyLmlkID0gaWQ7XG4gICAgICAgIG1hcmtlci5pbkZyb250ID0gISFpbkZyb250O1xuXG4gICAgICAgIGlmIChpbkZyb250KSB7XG4gICAgICAgICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgdGhlIG1hcmtlciB3aXRoIHRoZSBzcGVjaWZpZWQgSUQuIElmIHRoaXMgbWFya2VyIHdhcyBpbiBmcm9udCwgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbWFya2VySWQgQSBudW1iZXIgcmVwcmVzZW50aW5nIGEgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHJlbW92ZU1hcmtlcihtYXJrZXJJZDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHZhciBtYXJrZXIgPSB0aGlzLiRmcm9udE1hcmtlcnNbbWFya2VySWRdIHx8IHRoaXMuJGJhY2tNYXJrZXJzW21hcmtlcklkXTtcbiAgICAgICAgaWYgKCFtYXJrZXIpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIG1hcmtlcnMgPSBtYXJrZXIuaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICAgICAgICBpZiAobWFya2VyKSB7XG4gICAgICAgICAgICBkZWxldGUgKG1hcmtlcnNbbWFya2VySWRdKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChtYXJrZXIuaW5Gcm9udCA/IFwiY2hhbmdlRnJvbnRNYXJrZXJcIiA6IFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBJRHMgb2YgYWxsIHRoZSBtYXJrZXJzLCBlaXRoZXIgZnJvbnQgb3IgYmFjay5cbiAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5Gcm9udCBJZiBgdHJ1ZWAsIGluZGljYXRlcyB5b3Ugb25seSB3YW50IGZyb250IG1hcmtlcnM7IGBmYWxzZWAgaW5kaWNhdGVzIG9ubHkgYmFjayBtYXJrZXJzXG4gICAgKlxuICAgICogQHJldHVybnMge0FycmF5fVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNYXJrZXJzKGluRnJvbnQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGlnaGxpZ2h0KHJlOiBSZWdFeHApIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzZWFyY2hIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciBoaWdobGlnaHQgPSBuZXcgU2VhcmNoSGlnaGxpZ2h0KG51bGwsIFwiYWNlX3NlbGVjdGVkLXdvcmRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0ID0gdGhpcy5hZGREeW5hbWljTWFya2VyKGhpZ2hsaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gICAgfVxuXG4gICAgLy8gZXhwZXJpbWVudGFsXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdywgZW5kUm93LCBjbGF6eiwgaW5Gcm9udCkge1xuICAgICAgICBpZiAodHlwZW9mIGVuZFJvdyAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICBjbGF6eiA9IGVuZFJvdztcbiAgICAgICAgICAgIGVuZFJvdyA9IHN0YXJ0Um93O1xuICAgICAgICB9XG4gICAgICAgIGlmICghY2xhenopXG4gICAgICAgICAgICBjbGF6eiA9IFwiYWNlX3N0ZXBcIjtcblxuICAgICAgICB2YXIgcmFuZ2U6IGFueSA9IG5ldyBSYW5nZShzdGFydFJvdywgMCwgZW5kUm93LCBJbmZpbml0eSk7XG4gICAgICAgIHJhbmdlLmlkID0gdGhpcy5hZGRNYXJrZXIocmFuZ2UsIGNsYXp6LCBcImZ1bGxMaW5lXCIsIGluRnJvbnQpO1xuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBFcnJvcjpcbiAgICAgKiAge1xuICAgICAqICAgIHJvdzogMTIsXG4gICAgICogICAgY29sdW1uOiAyLCAvL2NhbiBiZSB1bmRlZmluZWRcbiAgICAgKiAgICB0ZXh0OiBcIk1pc3NpbmcgYXJndW1lbnRcIixcbiAgICAgKiAgICB0eXBlOiBcImVycm9yXCIgLy8gb3IgXCJ3YXJuaW5nXCIgb3IgXCJpbmZvXCJcbiAgICAgKiAgfVxuICAgICAqL1xuICAgIC8qKlxuICAgICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgZnVuY3Rpb25zIGVtaXRzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAqIEBwYXJhbSB7QXJyYXl9IGFubm90YXRpb25zIEEgbGlzdCBvZiBhbm5vdGF0aW9uc1xuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpIHtcbiAgICAgICAgdGhpcy4kYW5ub3RhdGlvbnMgPSBhbm5vdGF0aW9ucztcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQW5ub3RhdGlvblwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgKiovXG4gICAgcHVibGljIGdldEFubm90YXRpb25zID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbm5vdGF0aW9ucyB8fCBbXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGVhcnMgYWxsIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhpcyBzZXNzaW9uLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyB0cmlnZ2VycyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICAgICogVGhpcyBpcyBjYWxsZWQgYnkgdGhlIGxhbmd1YWdlIG1vZGVzIHdoZW4gdGhlIHdvcmtlciB0ZXJtaW5hdGVzLlxuICAgICAqL1xuICAgIHB1YmxpYyBjbGVhckFubm90YXRpb25zKCkge1xuICAgICAgICB0aGlzLnNldEFubm90YXRpb25zKFtdKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElmIGB0ZXh0YCBjb250YWlucyBlaXRoZXIgdGhlIG5ld2xpbmUgKGBcXG5gKSBvciBjYXJyaWFnZS1yZXR1cm4gKCdcXHInKSBjaGFyYWN0ZXJzLCBgJGF1dG9OZXdMaW5lYCBzdG9yZXMgdGhhdCB2YWx1ZS5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgYmxvY2sgb2YgdGV4dFxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlICRkZXRlY3ROZXdMaW5lKHRleHQ6IHN0cmluZykge1xuICAgICAgICB2YXIgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9eLio/KFxccj9cXG4pL20pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gbWF0Y2hbMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IFwiXFxuXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdpdmVuIGEgc3RhcnRpbmcgcm93IGFuZCBjb2x1bW4sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGBSYW5nZWAgb2YgdGhlIGZpcnN0IHdvcmQgYm91bmRhcnkgaXQgZmluZHMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc3RhcnQgYXRcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzdGFydCBhdFxuICAgICpcbiAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0V29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgdmFyIGxpbmU6IHN0cmluZyA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBpblRva2VuID0gZmFsc2U7XG4gICAgICAgIGlmIChjb2x1bW4gPiAwKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uIC0gMSkubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoIWluVG9rZW4pXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4pLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKGluVG9rZW4pXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLnRva2VuUmU7XG4gICAgICAgIGVsc2UgaWYgKC9eXFxzKyQvLnRlc3QobGluZS5zbGljZShjb2x1bW4gLSAxLCBjb2x1bW4gKyAxKSkpXG4gICAgICAgICAgICB2YXIgcmUgPSAvXFxzLztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy5ub25Ub2tlblJlO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGNvbHVtbjtcbiAgICAgICAgaWYgKHN0YXJ0ID4gMCkge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHN0YXJ0LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsZSAoc3RhcnQgPj0gMCAmJiBsaW5lLmNoYXJBdChzdGFydCkubWF0Y2gocmUpKTtcbiAgICAgICAgICAgIHN0YXJ0Kys7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZW5kID0gY29sdW1uO1xuICAgICAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgbGluZS5jaGFyQXQoZW5kKS5tYXRjaChyZSkpIHtcbiAgICAgICAgICAgIGVuZCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3csIHN0YXJ0LCByb3csIGVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHZXRzIHRoZSByYW5nZSBvZiBhIHdvcmQsIGluY2x1ZGluZyBpdHMgcmlnaHQgd2hpdGVzcGFjZS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIG51bWJlciB0byBzdGFydCBmcm9tXG4gICAgKlxuICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIGdldEFXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgd29yZFJhbmdlID0gdGhpcy5nZXRXb3JkUmFuZ2Uocm93LCBjb2x1bW4pO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZSh3b3JkUmFuZ2UuZW5kLnJvdyk7XG5cbiAgICAgICAgd2hpbGUgKGxpbmUuY2hhckF0KHdvcmRSYW5nZS5lbmQuY29sdW1uKS5tYXRjaCgvWyBcXHRdLykpIHtcbiAgICAgICAgICAgIHdvcmRSYW5nZS5lbmQuY29sdW1uICs9IDE7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gd29yZFJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5kZXNjfVxuICAgICogQHBhcmFtIHtTdHJpbmd9IG5ld0xpbmVNb2RlIHs6RWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGUucGFyYW19XG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnNldE5ld0xpbmVNb2RlXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IG5ldyBsaW5lIG1vZGUuXG4gICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIGdldE5ld0xpbmVNb2RlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyBpZiB5b3Ugd2FudCB0byB1c2UgYSB3b3JrZXIgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXJcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VXb3JrZXIodXNlV29ya2VyOiBib29sZWFuKSB7IHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7IH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd29ya2VycyBhcmUgYmVpbmcgdXNlZC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFVzZVdvcmtlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuJHVzZVdvcmtlcjsgfVxuXG4gICAgLyoqXG4gICAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIG9uUmVsb2FkVG9rZW5pemVyKGUpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQocm93cy5maXJzdCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBlKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICogU2V0cyBhIG5ldyB0ZXh0IG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZU1vZGUnYCBldmVudC4gSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICAgKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFNldCBhIG5ldyB0ZXh0IG1vZGVcbiAgICAqIEBwYXJhbSB7Y2J9IG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0TW9kZShtb2RlLCBjYj86ICgpID0+IGFueSk6IHZvaWQge1xuICAgICAgICBpZiAobW9kZSAmJiB0eXBlb2YgbW9kZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKG1vZGUuZ2V0VG9rZW5pemVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZShtb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gbW9kZTtcbiAgICAgICAgICAgIHZhciBwYXRoID0gb3B0aW9ucy5wYXRoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcGF0aCA9IG1vZGUgfHwgXCJhY2UvbW9kZS90ZXh0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzIGlzIG5lZWRlZCBpZiBhY2UgaXNuJ3Qgb24gcmVxdWlyZSBwYXRoIChlLmcgdGVzdHMgaW4gbm9kZSlcbiAgICAgICAgaWYgKCF0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0pIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSA9IG5ldyBNb2RlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIGxvYWQgb24gZGVtYW5kXG4gICAgICAgIHRoaXMuJG1vZGVJZCA9IHBhdGg7XG4gICAgICAgIGxvYWRNb2R1bGUoW1wibW9kZVwiLCBwYXRoXSwgZnVuY3Rpb24obTogYW55KSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kbW9kZUlkICE9PSBwYXRoKVxuICAgICAgICAgICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgICAgICAgaWYgKG0gJiYgbS5Nb2RlKSB7XG4gICAgICAgICAgICAgICAgbSA9IG5ldyBtLk1vZGUob3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1vZGVzW3BhdGhdID0gbTtcbiAgICAgICAgICAgICAgICAgICAgbS4kaWQgPSBwYXRoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUobSk7XG4gICAgICAgICAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBzZXQgbW9kZSB0byB0ZXh0IHVudGlsIGxvYWRpbmcgaXMgZmluaXNoZWRcbiAgICAgICAgaWYgKCF0aGlzLiRtb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdLCB0cnVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZShtb2RlOiBNb2RlLCAkaXNQbGFjZWhvbGRlcj86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kbW9kZUlkID0gbW9kZS4kaWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuJG1vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gZG8uIEJlIGlkZW1wb3RlbnQuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRtb2RlID0gbW9kZTtcblxuICAgICAgICAvLyBUT0RPOiBXb3VsZG4ndCBpdCBtYWtlIG1vcmUgc2Vuc2UgdG8gc3RvcCB0aGUgd29ya2VyLCB0aGVuIGNoYW5nZSB0aGUgbW9kZT9cbiAgICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXb3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHN0YXJ0V29ya2VyKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG9rZW5pemVyID0gbW9kZS5nZXRUb2tlbml6ZXIoKTtcblxuICAgICAgICBpZiAodG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdmFyIG9uUmVsb2FkVG9rZW5pemVyID0gdGhpcy5vblJlbG9hZFRva2VuaXplci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10oXCJ1cGRhdGVcIiwgb25SZWxvYWRUb2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyID0gbmV3IEJhY2tncm91bmRUb2tlbml6ZXIodG9rZW5pemVyKTtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLmFkZEV2ZW50TGlzdGVuZXIoXCJ1cGRhdGVcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIF9zZWxmLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0VG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldERvY3VtZW50KHRoaXMuZ2V0RG9jdW1lbnQoKSk7XG5cbiAgICAgICAgdGhpcy50b2tlblJlID0gbW9kZS50b2tlblJlO1xuICAgICAgICB0aGlzLm5vblRva2VuUmUgPSBtb2RlLm5vblRva2VuUmU7XG5cblxuICAgICAgICBpZiAoISRpc1BsYWNlaG9sZGVyKSB7XG4gICAgICAgICAgICB0aGlzLiRvcHRpb25zLndyYXBNZXRob2Quc2V0LmNhbGwodGhpcywgdGhpcy4kd3JhcE1ldGhvZCk7XG4gICAgICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUuZm9sZGluZ1J1bGVzKTtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpIHtcbiAgICAgICAgaWYgKHRoaXMuJHdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyLnRlcm1pbmF0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICAgKiBAcmV0dXJucyB7VGV4dE1vZGV9IFRoZSBjdXJyZW50IHRleHQgbW9kZVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsVG9wID09PSBzY3JvbGxUb3AgfHwgaXNOYU4oc2Nyb2xsVG9wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgdG9wbW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbFRvcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtTZXRzIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdH1cbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAgICAgLy8gc2Nyb2xsTGVmdCA9IE1hdGgucm91bmQoc2Nyb2xsTGVmdCk7XG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxMZWZ0ID09PSBzY3JvbGxMZWZ0IHx8IGlzTmFOKHNjcm9sbExlZnQpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJHNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHNjcm9sbExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsTGVmdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRjb21wdXRlV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGluZVdpZGdldE1heFdpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzV2lkdGggIT0gbnVsbCkgcmV0dXJuIHRoaXMubGluZVdpZGdldHNXaWR0aDtcbiAgICAgICAgdmFyIHdpZHRoID0gMDtcbiAgICAgICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5saW5lV2lkZ2V0V2lkdGggPSB3aWR0aDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy4kbW9kaWZpZWQgfHwgZm9yY2UpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoID0gdGhpcy4kd3JhcExpbWl0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICAgICAgdmFyIGNhY2hlID0gdGhpcy4kcm93TGVuZ3RoQ2FjaGU7XG4gICAgICAgICAgICB2YXIgbG9uZ2VzdFNjcmVlbkxpbmUgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRJbmRleCA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXhdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB2YXIgbGVuID0gbGluZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+PSBsZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID09IG51bGwpXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID4gbG9uZ2VzdFNjcmVlbkxpbmUpXG4gICAgICAgICAgICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgdmVyYmF0aW0gY29weSBvZiB0aGUgZ2l2ZW4gbGluZSBhcyBpdCBpcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtbU3RyaW5nXX1cbiAgICAgKlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiByb3dzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkVkaXRvckRvY3VtZW50LmdldFRleHRSYW5nZS5kZXNjfVxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSB0byB3b3JrIHdpdGhcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IFJhbmdlKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB7cm93LCBjb2x1bW59IHRvIHN0YXJ0IGluc2VydGluZyBhdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBpbnNlcnQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlbW92ZVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQucmVtb3ZlXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIHJlbW92ZShyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3QgW0lmIGB0cnVlYCwgZG9lc24ndCBzZWxlY3QgdGhlIHJhbmdlIG9mIHdoZXJlIHRoZSBjaGFuZ2Ugb2NjdXJlZF17OiAjZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSBkZWx0YXMubGVuZ3RoIC0gMTsgaSAhPSAtMTsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLnJldmVydERlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgdHJ1ZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbHRhLmRlbHRhcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGREZWx0YSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGREZWx0YS5mb2xkcyk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZS1pbXBsZW1lbnRzIGEgcHJldmlvdXNseSB1bmRvbmUgY2hhbmdlIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3Qgezpkb250U2VsZWN0fVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgcmVkb0NoYW5nZXMoZGVsdGFzLCBkb250U2VsZWN0PzogYm9vbGVhbikge1xuICAgICAgICBpZiAoIWRlbHRhcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSB0cnVlO1xuICAgICAgICB2YXIgbGFzdFVuZG9SYW5nZTogUmFuZ2UgPSBudWxsO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvYy5hcHBseURlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgZmFsc2UsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgcmV0dXJuIGxhc3RVbmRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlcyBvciBkaXNhYmxlcyBoaWdobGlnaHRpbmcgb2YgdGhlIHJhbmdlIHdoZXJlIGFuIHVuZG8gb2NjdXJyZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgSWYgYHRydWVgLCBzZWxlY3RzIHRoZSByYW5nZSBvZiB0aGUgcmVpbnNlcnRlZCBjaGFuZ2VcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVbmRvU2VsZWN0KGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ID0gZW5hYmxlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBmdW5jdGlvbiBpc0luc2VydChkZWx0YTogeyBhY3Rpb246IHN0cmluZyB9KSB7XG4gICAgICAgICAgICB2YXIgaW5zZXJ0ID0gZGVsdGEuYWN0aW9uID09PSBcImluc2VydFRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0TGluZXNcIjtcbiAgICAgICAgICAgIHJldHVybiBpc1VuZG8gPyAhaW5zZXJ0IDogaW5zZXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgdmFyIHBvaW50OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5lbmQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoZGVsdGEucmFuZ2UuZW5kLnJvdywgZGVsdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgICAgIC8vIElmIHRydWUsIG1lcmdlIHRoZSByYW5nZXMuXG4gICAgICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5lbmQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbXAgPSBsYXN0VW5kb1JhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQobGFzdFVuZG9SYW5nZS5lbmQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAgICpcbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlcGxhY2VcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byB1c2UgYXMgYSByZXBsYWNlbWVudFxuICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbmFsIHJvdyBhbmQgY29sdW1uLCBsaWtlIHRoaXM6XG4gICAgKiBgYGBcbiAgICAqIHtyb3c6IGVuZFJvdywgY29sdW1uOiAwfVxuICAgICogYGBgXG4gICAgKiBJZiB0aGUgdGV4dCBhbmQgcmFuZ2UgYXJlIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLnN0YXJ0YCB2YWx1ZS5cbiAgICAqIElmIHRoZSB0ZXh0IGlzIHRoZSBleGFjdCBzYW1lIGFzIHdoYXQgY3VycmVudGx5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5lbmRgIHZhbHVlLlxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQucmVwbGFjZVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiAgYGBganNvblxuICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiAgYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICogQHJldHVybnMge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlOiBSYW5nZSwgdG9Qb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgY29weSkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciByb3dEaWZmOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICAgICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgICAgICBpZiAoIWNvcHkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZyb21SYW5nZSk7XG4gICAgICAgICAgICByb3dEaWZmID0gZnJvbVJhbmdlLnN0YXJ0LnJvdyAtIGZyb21SYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgY29sRGlmZiA9IHJvd0RpZmYgPyAtZnJvbVJhbmdlLmVuZC5jb2x1bW4gOiBmcm9tUmFuZ2Uuc3RhcnQuY29sdW1uIC0gZnJvbVJhbmdlLmVuZC5jb2x1bW47XG4gICAgICAgICAgICBpZiAoY29sRGlmZikge1xuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICB0b1JhbmdlLnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKHguc3RhcnQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICB4LmVuZC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0b1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAgICpcbiAgICAqIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBlbmRSb3cgRW5kaW5nIHJvd1xuICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgaW5kZW50U3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8PSBlbmRSb3c7IHJvdysrKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnQoeyByb3c6IHJvdywgY29sdW1uOiAwIH0sIGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBPdXRkZW50cyBhbGwgdGhlIHJvd3MgZGVmaW5lZCBieSB0aGUgYHN0YXJ0YCBhbmQgYGVuZGAgcHJvcGVydGllcyBvZiBgcmFuZ2VgLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSByYW5nZSBvZiByb3dzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd1JhbmdlLnN0YXJ0LnJvdzsgaSA8PSByb3dSYW5nZS5lbmQucm93OyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKGkpO1xuXG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNpemU7ICsrailcbiAgICAgICAgICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGlmIChqIDwgc2l6ZSAmJiBsaW5lLmNoYXJBdChqKSA9PSAnXFx0Jykge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGogKyAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkbW92ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZGlyOiBudW1iZXIpIHtcbiAgICAgICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IDApIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgICAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGluZXMgPSBkaXIgPT0gMFxuICAgICAgICAgICAgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdylcbiAgICAgICAgICAgIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB0aGlzLmRvYy5pbnNlcnRMaW5lcyhmaXJzdFJvdyArIGRpZmYsIGxpbmVzKTtcbiAgICAgICAgZm9sZHMubGVuZ3RoICYmIHRoaXMuYWRkRm9sZHMoZm9sZHMpO1xuICAgICAgICByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIHVwXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgdXBcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBtb3ZlTGluZXNVcChmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgZG93biBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgZG93blxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEdXBsaWNhdGVzIGFsbCB0aGUgdGV4dCBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IFJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBkdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAwKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBSb3dUb0RvY3VtZW50KHJvdykge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4ocm93LCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRjbGlwQ29sdW1uVG9Sb3cocm93LCBjb2x1bW4pIHtcbiAgICAgICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgcmV0dXJuIE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3cgPCAwKSB7XG4gICAgICAgICAgICByb3cgPSAwO1xuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gbGVuIC0gMTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbiAtIDEpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm93OiByb3csXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkY2xpcFJhbmdlVG9Eb2N1bWVudChyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCAwKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSAwO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgPiBsZW4pIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBsZW47XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4pLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHdoZXRoZXIgb3Igbm90IGxpbmUgd3JhcHBpbmcgaXMgZW5hYmxlZC4gSWYgYHVzZVdyYXBNb2RlYCBpcyBkaWZmZXJlbnQgdGhhbiB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV3JhcE1vZGUgRW5hYmxlIChvciBkaXNhYmxlKSB3cmFwIG1vZGVcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdyYXBNb2RlKHVzZVdyYXBNb2RlOiBib29sZWFuKSB7XG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAhPSB0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kdXNlV3JhcE1vZGUgPSB1c2VXcmFwTW9kZTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG5cbiAgICAgICAgICAgIC8vIElmIHdyYXBNb2RlIGlzIGFjdGl2YWVkLCB0aGUgd3JhcERhdGEgYXJyYXkgaGFzIHRvIGJlIGluaXRpYWxpemVkLlxuICAgICAgICAgICAgaWYgKHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBBcnJheTxudW1iZXJbXT4obGVuKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCBsZW4gLSAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHdyYXAgbW9kZSBpcyBiZWluZyB1c2VkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGdldFVzZVdyYXBNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgfVxuXG4gICAgLy8gQWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gbW92ZSBmcmVlbHkgYmV0d2VlbiBtaW4gYW5kIG1heC4gRWl0aGVyXG4gICAgLy8gcGFyYW1ldGVyIGNhbiBiZSBudWxsIHRvIGFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIGJlIHVuY29uc3RyYWluZWRcbiAgICAvLyBpbiB0aGF0IGRpcmVjdGlvbi4gT3Igc2V0IGJvdGggcGFyYW1ldGVycyB0byB0aGUgc2FtZSBudW1iZXIgdG8gcGluXG4gICAgLy8gdGhlIGxpbWl0IHRvIHRoYXQgdmFsdWUuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYm91bmRhcmllcyBvZiB3cmFwLiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0V3JhcExpbWl0UmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4gIT09IG1pbiB8fCB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXggIT09IG1heCkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgICAgICAgICAgbWluOiBtaW4sXG4gICAgICAgICAgICAgICAgbWF4OiBtYXhcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSByZWNhbGN1bGF0aW9uIG9mIHRoZSB3cmFwIGxpbWl0XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlc2lyZWRMaW1pdCBUaGUgbmV3IHdyYXAgbGltaXRcbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICpcbiAgICAqIEBwcml2YXRlXG4gICAgKiovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgICAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICAgICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcExpbWl0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbnN0cmFpbldyYXBMaW1pdCh3cmFwTGltaXQ6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG1pbilcbiAgICAgICAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWF4KG1pbiwgd3JhcExpbWl0KTtcblxuICAgICAgICBpZiAobWF4KVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5taW4obWF4LCB3cmFwTGltaXQpO1xuXG4gICAgICAgIHJldHVybiB3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB3cmFwIGxpbWl0LlxuICAgICogQHJldHVybnMge051bWJlcn0gVGhlIHdyYXAgbGltaXQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbGluZSBsZW5ndGggZm9yIHNvZnQgd3JhcCBpbiB0aGUgZWRpdG9yLiBMaW5lcyB3aWxsIGJyZWFrXG4gICAgICogIGF0IGEgbWluaW11bSBvZiB0aGUgZ2l2ZW4gbGVuZ3RoIG1pbnVzIDIwIGNoYXJzIGFuZCBhdCBhIG1heGltdW1cbiAgICAgKiAgb2YgdGhlIGdpdmVuIG51bWJlciBvZiBjaGFycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGltaXQgVGhlIG1heGltdW0gbGluZSBsZW5ndGggaW4gY2hhcnMsIGZvciBzb2Z0IHdyYXBwaW5nIGxpbmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0V3JhcExpbWl0KGxpbWl0KSB7XG4gICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UobGltaXQsIGxpbWl0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IHRoYXQgZGVmaW5lcyB0aGUgbWluaW11bSBhbmQgbWF4aW11bSBvZiB0aGUgd3JhcCBsaW1pdDsgaXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAqXG4gICAgKiAgICAgeyBtaW46IHdyYXBMaW1pdFJhbmdlX21pbiwgbWF4OiB3cmFwTGltaXRSYW5nZV9tYXggfVxuICAgICpcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAgICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgICAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICAgICAgdmFyIGxlbjtcbiAgICAgICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGVuID0gZS5kYXRhLmxpbmVzID8gZS5kYXRhLmxpbmVzLmxlbmd0aCA6IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbiA9IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgaWYgKGxlbiAhPSAwKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzW3VzZVdyYXBNb2RlID8gXCIkd3JhcERhdGFcIiA6IFwiJHJvd0xlbmd0aENhY2hlXCJdLnNwbGljZShmaXJzdFJvdywgbGVuKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGVuZC5yb3csIGVuZC5jb2x1bW4sIHN0YXJ0LmNvbHVtbiAtIGVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVCZWZvcmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lQmVmb3JlICYmIGZvbGRMaW5lQmVmb3JlICE9PSBmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmVCZWZvcmUubWVyZ2UoZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZUJlZm9yZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBlbmQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMCk7XG4gICAgICAgICAgICAgICAgdmFyIGFyciA9IHVzZVdyYXBNb2RlID8gdGhpcy4kd3JhcERhdGEgOiB0aGlzLiRyb3dMZW5ndGhDYWNoZVxuICAgICAgICAgICAgICAgIGFyci5zcGxpY2UuYXBwbHkoYXJyLCBhcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHNvbWUgbmV3IGxpbmUgaXMgYWRkZWQgaW5zaWRlIG9mIGEgZm9sZExpbmUsIHRoZW4gc3BsaXRcbiAgICAgICAgICAgICAgICAvLyB0aGUgZm9sZCBsaW5lIHVwLlxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lLnJhbmdlLmNvbXBhcmVJbnNpZGUoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIC8vIEluc2lkZSBvZiB0aGUgZm9sZExpbmUgcmFuZ2UuIE5lZWQgdG8gc3BsaXQgc3R1ZmYgdXAuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChzdGFydC5yb3csIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mcm9udCBvZiB0aGUgZm9sZExpbmUgYnV0IHNhbWUgcm93LiBOZWVkIHRvIHNoaWZ0IGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90aGluZyB0byBkbyBpZiB0aGUgaW5zZXJ0IGlzIGFmdGVyIHRoZSBmb2xkTGluZS5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWFsaWduIGZvbGRzLiBFLmcuIGlmIHlvdSBhZGQgc29tZSBuZXcgY2hhcnMgYmVmb3JlIGEgZm9sZCwgdGhlXG4gICAgICAgICAgICAvLyBmb2xkIHNob3VsZCBcIm1vdmVcIiB0byB0aGUgcmlnaHQuXG4gICAgICAgICAgICBsZW4gPSBNYXRoLmFicyhlLmRhdGEucmFuZ2Uuc3RhcnQuY29sdW1uIC0gZS5kYXRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgZm9sZHMgaW4gdGhlIGNoYW5nZSByYW5nZSBhbmQgcmVtb3ZlIHRoZW0uXG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICBsZW4gPSAtbGVuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgc3RhcnQuY29sdW1uLCBsZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICYmIHRoaXMuJHdyYXBEYXRhLmxlbmd0aCAhPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImRvYy5nZXRMZW5ndGgoKSBhbmQgJHdyYXBEYXRhLmxlbmd0aCBoYXZlIHRvIGJlIHRoZSBzYW1lIVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IGZhbHNlO1xuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3cpO1xuXG4gICAgICAgIHJldHVybiByZW1vdmVkRm9sZHM7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdywgYj8pIHtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbbGFzdFJvd10gPSBudWxsO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIHdyYXBEYXRhID0gdGhpcy4kd3JhcERhdGE7XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgICAgIHZhciB0b2tlbnM7XG4gICAgICAgIHZhciBmb2xkTGluZTtcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihsYXN0Um93LCBsaW5lcy5sZW5ndGggLSAxKTtcbiAgICAgICAgd2hpbGUgKHJvdyA8PSBsYXN0Um93KSB7XG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhsaW5lc1tyb3ddKTtcbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtyb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2Fsa1Rva2VuczogbnVtYmVyW107XG4gICAgICAgICAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlciwgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zWzBdID0gUExBQ0VIT0xERVJfU1RBUlQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHdhbGtUb2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zW2ldID0gUExBQ0VIT0xERVJfQk9EWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzW3Jvd10uc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gdG9rZW5zLmNvbmNhdCh3YWxrVG9rZW5zKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgICAgIGxpbmVzW2ZvbGRMaW5lLmVuZC5yb3ddLmxlbmd0aCArIDFcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgd3JhcERhdGFbZm9sZExpbmUuc3RhcnQucm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVXcmFwU3BsaXRzKHRva2VuczogbnVtYmVyW10sIHdyYXBMaW1pdDogbnVtYmVyLCB0YWJTaXplPzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0b2tlbnMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciBkaXNwbGF5TGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcbiAgICAgICAgdmFyIGxhc3RTcGxpdCA9IDAsIGxhc3REb2NTcGxpdCA9IDA7XG5cbiAgICAgICAgdmFyIGlzQ29kZSA9IHRoaXMuJHdyYXBBc0NvZGU7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU3BsaXQoc2NyZWVuUG9zOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBkaXNwbGF5ZWQgPSB0b2tlbnMuc2xpY2UobGFzdFNwbGl0LCBzY3JlZW5Qb3MpO1xuXG4gICAgICAgICAgICAvLyBUaGUgZG9jdW1lbnQgc2l6ZSBpcyB0aGUgY3VycmVudCBzaXplIC0gdGhlIGV4dHJhIHdpZHRoIGZvciB0YWJzXG4gICAgICAgICAgICAvLyBhbmQgbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgdmFyIGxlbiA9IGRpc3BsYXllZC5sZW5ndGg7XG4gICAgICAgICAgICBkaXNwbGF5ZWQuam9pbihcIlwiKS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBUQUJfU1BBQ0VzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzEyL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBDSEFSX0VYVC9tdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxhc3REb2NTcGxpdCArPSBsZW47XG4gICAgICAgICAgICBzcGxpdHMucHVzaChsYXN0RG9jU3BsaXQpO1xuICAgICAgICAgICAgbGFzdFNwbGl0ID0gc2NyZWVuUG9zO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGRpc3BsYXlMZW5ndGggLSBsYXN0U3BsaXQgPiB3cmFwTGltaXQpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMsIHdoZXJlIHRoZSBzcGxpdCBzaG91bGQgYmUuXG4gICAgICAgICAgICB2YXIgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgc3BhY2Ugb3IgdGFiIGF0IHRoaXMgc3BsaXQgcG9zaXRpb24sIHRoZW4gbWFraW5nXG4gICAgICAgICAgICAvLyBhIHNwbGl0IGlzIHNpbXBsZS5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXQgLSAxXSA+PSBTUEFDRSAmJiB0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgLyogZGlzYWJsZWQgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hamF4b3JnL2FjZS9pc3N1ZXMvMTE4NlxuICAgICAgICAgICAgICAgIC8vIEluY2x1ZGUgYWxsIGZvbGxvd2luZyBzcGFjZXMgKyB0YWJzIGluIHRoaXMgc3BsaXQgYXMgd2VsbC5cbiAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdCArKztcbiAgICAgICAgICAgICAgICB9ICovXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHNwbGl0IGlzIGluc2lkZSBvZiBhIHBsYWNlaG9sZGVyLiBQbGFjZWhvbGRlciBhcmVcbiAgICAgICAgICAgIC8vIG5vdCBzcGxpdGFibGUuIFRoZXJlZm9yZSwgc2VlayB0aGUgYmVnaW5uaW5nIG9mIHRoZSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgLy8gYW5kIHRyeSB0byBwbGFjZSB0aGUgc3BsaXQgYmVvZnJlIHRoZSBwbGFjZWhvbGRlcidzIHN0YXJ0LlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQgfHwgdG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VlayB0aGUgc3RhcnQgb2YgdGhlIHBsYWNlaG9sZGVyIGFuZCBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICAvLyBiZWZvcmUgdGhlIHBsYWNlaG9sZGVyLiBCeSBkZWZpbml0aW9uIHRoZXJlIGFsd2F5c1xuICAgICAgICAgICAgICAgIC8vIGEgUExBQ0VIT0xERVJfU1RBUlQgYmV0d2VlbiBzcGxpdCBhbmQgbGFzdFNwbGl0LlxuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0ICE9IGxhc3RTcGxpdCAtIDE7IHNwbGl0LS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwbGl0Kys7IDw8IE5vIGluY3JlbWVudGFsIGhlcmUgYXMgd2Ugd2FudCB0b1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gIGhhdmUgdGhlIHBvc2l0aW9uIGJlZm9yZSB0aGUgUGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBpcyBub3QgdGhlIGluZGV4IG9mIHRoZVxuICAgICAgICAgICAgICAgIC8vIGxhc3Qgc3BsaXQsIHRoZW4gd2UgY2FuIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA+IGxhc3RTcGxpdCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBJUyB0aGUgaW5kZXggb2YgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyBzcGxpdCwgdGhlbiB3ZSBoYXZlIHRvIHBsYWNlIHRoZSBzcGxpdCBhZnRlciB0aGVcbiAgICAgICAgICAgICAgICAvLyBwbGFjZWhvbGRlci4gU28sIGxldCdzIHNlZWsgZm9yIHRoZSBlbmQgb2YgdGhlIHBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0IDwgdG9rZW5zLmxlbmd0aDsgc3BsaXQrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSAhPSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHNwaWx0ID09IHRva2Vucy5sZW5ndGgsIHRoZW4gdGhlIHBsYWNlaG9sZGVyIGlzIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gdGhpbmcgaW4gdGhlIGxpbmUgYW5kIGFkZGluZyBhIG5ldyBzcGxpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UuXG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7ICAvLyBCcmVha3MgdGhlIHdoaWxlLWxvb3AuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRmluYWxseSwgYWRkIHRoZSBzcGxpdC4uLlxuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaXJzdCBub24gc3BhY2UvdGFiL3BsYWNlaG9sZGVyL3B1bmN0dWF0aW9uIHRva2VuIGJhY2t3YXJkcy5cbiAgICAgICAgICAgIHZhciBtaW5TcGxpdCA9IE1hdGgubWF4KHNwbGl0IC0gKGlzQ29kZSA/IDEwIDogd3JhcExpbWl0IC0gKHdyYXBMaW1pdCA+PiAyKSksIGxhc3RTcGxpdCAtIDEpO1xuICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA9PSBQVU5DVFVBVElPTikge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgd2UgZm91bmQgb25lLCB0aGVuIGFkZCB0aGUgc3BsaXQuXG4gICAgICAgICAgICBpZiAoc3BsaXQgPiBtaW5TcGxpdCkge1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KCsrc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgLy8gVGhlIHNwbGl0IGlzIGluc2lkZSBvZiBhIENIQVIgb3IgQ0hBUl9FWFQgdG9rZW4gYW5kIG5vIHNwYWNlXG4gICAgICAgICAgICAvLyBhcm91bmQgLT4gZm9yY2UgYSBzcGxpdC5cbiAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3BsaXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdHJpbmcsIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGRpc3BsYXkgY2hhcmFjdGVycywgaW5jbHVkaW5nIHRhYnMgYW5kIHNwYWNlcy5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBUaGUgdmFsdWUgdG8gc3RhcnQgYXRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGdldERpc3BsYXlUb2tlbnMoc3RyOiBzdHJpbmcsIG9mZnNldD86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGFycjogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIHRhYlNpemU6IG51bWJlcjtcbiAgICAgICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgICAgICAvLyBUYWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICB0YWJTaXplID0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKGFyci5sZW5ndGggKyBvZmZzZXQpO1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQik7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgbiA9IDE7IG4gPCB0YWJTaXplOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCX1NQQUNFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTcGFjZVxuICAgICAgICAgICAgZWxzZSBpZiAoYyA9PSAzMikge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFNQQUNFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChjID4gMzkgJiYgYyA8IDQ4KSB8fCAoYyA+IDU3ICYmIGMgPCA2NCkpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChQVU5DVFVBVElPTik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUiwgQ0hBUl9FWFQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSB3aWR0aCBvZiB0aGUgc3RyaW5nIGBzdHJgIG9uIHRoZSBzY3JlZW4gd2hpbGUgYXNzdW1pbmcgdGhhdCB0aGUgc3RyaW5nIHN0YXJ0cyBhdCB0aGUgZmlyc3QgY29sdW1uIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2FsY3VsYXRlIHRoZSBzY3JlZW4gd2lkdGggb2ZcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhTY3JlZW5Db2x1bW5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Db2x1bW5cbiAgICAqIEByZXR1cm5zIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgICAgIHZhciBjOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICAgICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAgICAgICAvLyB0YWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIG51bWJlciBvZiBzY3JlZW5yb3dzIGluIGEgd3JhcHBlZCBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAgICpcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFJvd0xlbmd0aChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVXaWRnZXRzW3Jvd10gJiYgdGhpcy5saW5lV2lkZ2V0c1tyb3ddLnJvd0NvdW50IHx8IDA7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGggPSAwXG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxICsgaDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDEgKyBoO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRSb3dMaW5lQ291bnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Um93V3JhcEluZGVudChzY3JlZW5Sb3c6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Bvcy5yb3ddO1xuICAgICAgICAgICAgLy8gRklYTUU6IGluZGVudCBkb2VzIG5vdCBleGlzdHMgb24gbnVtYmVyW11cbiAgICAgICAgICAgIHJldHVybiBzcGxpdHMubGVuZ3RoICYmIHNwbGl0c1swXSA8IHBvcy5jb2x1bW4gPyBzcGxpdHNbJ2luZGVudCddIDogMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gKG9uIHNjcmVlbikgZm9yIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgcHJvdmlkZWQgc2NyZWVuIHJvdy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGxhc3Qgc2NyZWVuIHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBkb2N1bWVudCBwb3NpdGlvbiBvZiB0aGUgbGFzdCByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pIHtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUgLyAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIHJvdywgdGhpcyByZXR1cm5zIHRoZSBzcGxpdCBkYXRhLlxuICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0Um93U3BsaXREYXRhKHJvdzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgdG8gdGhlIG5leHQgdGFiIHN0b3AgYXQgdGhlIHNwZWNpZmllZCBzY3JlZW4gY29sdW1uLlxuICAgICAqIEBtZXRob3MgZ2V0U2NyZWVuVGFiU2l6ZVxuICAgICAqIEBwYXJhbSBzY3JlZW5Db2x1bW4ge251bWJlcn0gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZSAtIHNjcmVlbkNvbHVtbiAlIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG5cbiAgICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFJvdyhzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLnJvdztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgc2NyZWVuVG9Eb2N1bWVudENvbHVtbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIENvbnZlcnRzIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgb24gdGhlIHNjcmVlbiB0byBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIHdpdGhpbiB0aGUgZG9jdW1lbnQuIFtUaGlzIHRha2VzIGludG8gYWNjb3VudCBjb2RlIGZvbGRpbmcsIHdvcmQgd3JhcCwgdGFiIHNpemUsIGFuZCBhbnkgb3RoZXIgdmlzdWFsIG1vZGlmaWNhdGlvbnMuXXs6ICNjb252ZXJzaW9uQ29uc2lkZXJhdGlvbnN9XG4gICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuQ29sdW1uIFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICoqL1xuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGlmIChzY3JlZW5Sb3cgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyByb3c6IDAsIGNvbHVtbjogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIHZhciBkb2NSb3cgPSAwO1xuICAgICAgICB2YXIgZG9jQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIGNvbHVtbjtcbiAgICAgICAgdmFyIHJvdyA9IDA7XG4gICAgICAgIHZhciByb3dMZW5ndGggPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJHNjcmVlblJvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIHNjcmVlblJvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb2NSb3cgPSB0aGlzLiRkb2NSb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gc2NyZWVuUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYXhSb3cgPSB0aGlzLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8PSBzY3JlZW5Sb3cpIHtcbiAgICAgICAgICAgIHJvd0xlbmd0aCA9IHRoaXMuZ2V0Um93TGVuZ3RoKGRvY1Jvdyk7XG4gICAgICAgICAgICBpZiAocm93ICsgcm93TGVuZ3RoID4gc2NyZWVuUm93IHx8IGRvY1JvdyA+PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93ICs9IHJvd0xlbmd0aDtcbiAgICAgICAgICAgICAgICBkb2NSb3crKztcbiAgICAgICAgICAgICAgICBpZiAoZG9jUm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKGRvY1Jvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cpIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSk7XG4gICAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH0gZWxzZSBpZiAocm93ICsgcm93TGVuZ3RoIDw9IHNjcmVlblJvdyB8fCBkb2NSb3cgPiBtYXhSb3cpIHtcbiAgICAgICAgICAgIC8vIGNsaXAgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcm93OiBtYXhSb3csXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldExpbmUobWF4Um93KS5sZW5ndGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KTtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW2RvY1Jvd107XG4gICAgICAgICAgICBpZiAoc3BsaXRzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0SW5kZXggPSBNYXRoLmZsb29yKHNjcmVlblJvdyAtIHJvdyk7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChzcGxpdEluZGV4ID4gMCAmJiBzcGxpdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY0NvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4IC0gMV0gfHwgc3BsaXRzW3NwbGl0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyaW5nKGRvY0NvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZG9jQ29sdW1uICs9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmUsIHNjcmVlbkNvbHVtbilbMV07XG5cbiAgICAgICAgLy8gV2UgcmVtb3ZlIG9uZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCBzbyB0aGF0IHRoZSBkb2NDb2x1bW5cbiAgICAgICAgLy8gcG9zaXRpb24gcmV0dXJuZWQgaXMgbm90IGFzc29jaWF0ZWQgdG8gdGhlIG5leHQgcm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSAmJiBkb2NDb2x1bW4gPj0gY29sdW1uKVxuICAgICAgICAgICAgZG9jQ29sdW1uID0gY29sdW1uIC0gMTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gZm9sZExpbmUuaWR4VG9Qb3NpdGlvbihkb2NDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogZG9jUm93LCBjb2x1bW46IGRvY0NvbHVtbiB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgZG9jdW1lbnQgY29vcmRpbmF0ZXMgdG8gc2NyZWVuIGNvb3JkaW5hdGVzLiB7OmNvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3cgVGhlIGRvY3VtZW50IHJvdyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHRvIGNoZWNrXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGJ5IHRoaXMgbWV0aG9kIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvblxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cy5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2NDb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93Wydyb3cnXSwgZG9jUm93Wydjb2x1bW4nXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuXG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSAwO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0Um93ID0gbnVsbDtcbiAgICAgICAgdmFyIGZvbGQgPSBudWxsO1xuXG4gICAgICAgIC8vIENsYW1wIHRoZSBkb2NSb3cgcG9zaXRpb24gaW4gY2FzZSBpdCdzIGluc2lkZSBvZiBhIGZvbGRlZCBibG9jay5cbiAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGRvY1JvdywgZG9jQ29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jQ29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcm93RW5kLCByb3cgPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJGRvY1Jvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIGRvY1Jvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gZG9jUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlIChyb3cgPCBkb2NSb3cpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgaWYgKHJvd0VuZCA+IGRvY1JvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3dFbmQsIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gcm93ICsgMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2NyZWVuUm93ICs9IHRoaXMuZ2V0Um93TGVuZ3RoKHJvdyk7XG4gICAgICAgICAgICByb3cgPSByb3dFbmQ7XG5cbiAgICAgICAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2goc2NyZWVuUm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgdGV4dCBsaW5lIHRoYXQgaXMgZGlzcGxheWVkIGluIGRvY1JvdyBvbiB0aGUgc2NyZWVuLlxuICAgICAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmluYWwgcm93IHdlIHdhbnQgdG8gcmVhY2ggaXMgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUsIGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdykuc3Vic3RyaW5nKDAsIGRvY0NvbHVtbik7XG4gICAgICAgICAgICBmb2xkU3RhcnRSb3cgPSBkb2NSb3c7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2xhbXAgdGV4dExpbmUgaWYgaW4gd3JhcE1vZGUuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHdyYXBSb3cgPSB0aGlzLiR3cmFwRGF0YVtmb2xkU3RhcnRSb3ddO1xuICAgICAgICAgICAgaWYgKHdyYXBSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAodGV4dExpbmUubGVuZ3RoID49IHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0XSkge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3crKztcbiAgICAgICAgICAgICAgICAgICAgc2NyZWVuUm93T2Zmc2V0Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHRMaW5lID0gdGV4dExpbmUuc3Vic3RyaW5nKHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0IC0gMV0gfHwgMCwgdGV4dExpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHNjcmVlblJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodGV4dExpbmUpWzBdXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Db2x1bW4oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5jb2x1bW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikucm93O1xuICAgIH1cblxuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUmFuZ2UocmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICB2YXIgc2NyZWVuUG9zU3RhcnQgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIHZhciBzY3JlZW5Qb3NFbmQgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShzY3JlZW5Qb3NTdGFydC5yb3csIHNjcmVlblBvc1N0YXJ0LmNvbHVtbiwgc2NyZWVuUG9zRW5kLnJvdywgc2NyZWVuUG9zRW5kLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbkxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiR3cmFwRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgcm93ID0gMCwgaSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgICAgIHdoaWxlIChyb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kb1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JlZW5Sb3dzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhmbTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgLy8gVE9ETz9cbiAgICB9XG5cbiAgICBmaW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBjaHI/OiBzdHJpbmcpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb24sIGNocik7XG4gICAgfVxuXG4gICAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAkZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICAkZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG4gICAgcHJpdmF0ZSAkZm9sZE1vZGU7XG5cbiAgICAvLyBzdHJ1Y3R1cmVkIGZvbGRpbmdcbiAgICAkZm9sZFN0eWxlcyA9IHtcbiAgICAgICAgXCJtYW51YWxcIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICAgIH1cbiAgICAkZm9sZFN0eWxlID0gXCJtYXJrYmVnaW5cIjtcbiAgICAvKlxuICAgICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICAgKiAgIC0xOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuc3RhcnQgPSByb3cvY29sdW1uXG4gICAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICAgKi9cbiAgICBnZXRGb2xkQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBzaWRlPzogbnVtYmVyKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGQucmFuZ2UuY29udGFpbnMocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpZGUgPT09IDEgJiYgZm9sZC5yYW5nZS5pc0VuZChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzaWRlID09PSAtMSAmJiBmb2xkLnJhbmdlLmlzU3RhcnQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGdpdmVuIHJhbmdlLiBOb3RlLCB0aGF0IHRoaXMgd2lsbCByZXR1cm4gZm9sZHNcbiAgICAgKlxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZShyYW5nZTogUmFuZ2UpOiBGb2xkW10ge1xuICAgICAgICB2YXIgc3RhcnQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IHJhbmdlLmVuZDtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm91bmRGb2xkczogRm9sZFtdID0gW107XG5cbiAgICAgICAgc3RhcnQuY29sdW1uICs9IDE7XG4gICAgICAgIGVuZC5jb2x1bW4gLT0gMTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lc1tpXS5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYmVmb3JlIGZvbGRMaW5lLiBObyBpbnRlcnNlY3Rpb24uIFRoaXMgbWVhbnMsXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgbWlnaHQgYmUgb3RoZXIgZm9sZExpbmVzIHRoYXQgaW50ZXJzZWN0LlxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYWZ0ZXIgZm9sZExpbmUuIFRoZXJlIGNhbid0IGJlIGFueSBvdGhlciBmb2xkTGluZXMgdGhlbixcbiAgICAgICAgICAgICAgICAvLyBzbyBsZXQncyBnaXZlIHVwLlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZXNbaV0uZm9sZHM7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZvbGRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZvbGQgPSBmb2xkc1tqXTtcbiAgICAgICAgICAgICAgICBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXVEYtc3RhdGU6IENhbiBoYXBwZW4gZHVlIHRvIC0xLysxIHRvIHN0YXJ0L2VuZCBjb2x1bW4uXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gNDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm91bmRGb2xkcy5wdXNoKGZvbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YXJ0LmNvbHVtbiAtPSAxO1xuICAgICAgICBlbmQuY29sdW1uICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIGZvdW5kRm9sZHM7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZXMpOiBGb2xkW10ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXSA9IFtdO1xuICAgICAgICAgICAgcmFuZ2VzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBmb2xkcyA9IGZvbGRzLmNvbmNhdCh0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKi9cbiAgICBnZXRBbGxGb2xkcygpOiBGb2xkW10ge1xuICAgICAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgZm9sZHMucHVzaChmb2xkTGluZXNbaV0uZm9sZHNbal0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvfGxkPndvbHJkIC0+IDxudWxsPlxuICAgICAqXG4gICAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgICAqXG4gICAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAgICpcbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC10cmltPSsxPiBcInJsZFwiXG4gICAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgICAqL1xuICAgIGdldEZvbGRTdHJpbmdBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHRyaW06IG51bWJlciwgZm9sZExpbmU/OiBGb2xkTGluZSk6IHN0cmluZyB7XG4gICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUgfHwgdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGxhc3RGb2xkID0ge1xuICAgICAgICAgICAgZW5kOiB7IGNvbHVtbjogMCB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IFJlZmFjdG9yIHRvIHVzZSBnZXROZXh0Rm9sZFRvIGZ1bmN0aW9uLlxuICAgICAgICB2YXIgc3RyOiBzdHJpbmc7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lLmZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb2xkID0gZm9sZExpbmUuZm9sZHNbaV07XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlRW5kKHJvdywgY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uLCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RGb2xkID0gZm9sZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXN0cilcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0cmltID09IC0xKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2UgaWYgKHRyaW0gPT0gMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgIH1cblxuICAgIGdldEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93ICYmIGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkTGluZS5lbmQucm93ID4gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgZm9sZCB3aGljaCBzdGFydHMgYWZ0ZXIgb3IgY29udGFpbnMgZG9jUm93XG4gICAgZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXRGb2xkZWRSb3dDb3VudChmaXJzdDogbnVtYmVyLCBsYXN0OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIHJvd0NvdW50ID0gbGFzdCAtIGZpcnN0ICsgMTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV0sXG4gICAgICAgICAgICAgICAgZW5kID0gZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICBzdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGlmIChlbmQgPj0gbGFzdCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFydCA8IGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KVxuICAgICAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gbGFzdCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCA9IDA7Ly9pbiBvbmUgZm9sZFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kID49IGZpcnN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KSAvL2ZvbGQgaW5zaWRlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gZmlyc3QgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3dDb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlICRhZGRGb2xkTGluZShmb2xkTGluZTogRm9sZExpbmUpIHtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgICAqXG4gICAgICogQHJldHVybnNcbiAgICAgKiAgICAgIFRoZSBuZXcgY3JlYXRlZCBGb2xkIG9iamVjdCBvciBhbiBleGlzdGluZyBmb2xkIG9iamVjdCBpbiBjYXNlIHRoZVxuICAgICAqICAgICAgcGFzc2VkIGluIHJhbmdlIGZpdHMgYW4gZXhpc3RpbmcgZm9sZCBleGFjdGx5LlxuICAgICAqL1xuICAgIGFkZEZvbGQocGxhY2Vob2xkZXI6IHN0cmluZyB8IEZvbGQsIHJhbmdlOiBSYW5nZSk6IEZvbGQge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGFkZGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuXG4gICAgICAgIGlmIChwbGFjZWhvbGRlciBpbnN0YW5jZW9mIEZvbGQpXG4gICAgICAgICAgICBmb2xkID0gcGxhY2Vob2xkZXI7XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBwbGFjZWhvbGRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZvbGQgPSBuZXcgRm9sZChyYW5nZSwgcGxhY2Vob2xkZXIpO1xuICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gcmFuZ2UuY29sbGFwc2VDaGlsZHJlbjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInBsYWNlaG9sZGVyIG11c3QgYmUgYSBzdHJpbmcgb3IgYSBGb2xkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGSVhNRTogJGNsaXBSYW5nZVRvRG9jdW1lbnQ/XG4gICAgICAgIC8vIGZvbGQucmFuZ2UgPSB0aGlzLmNsaXBSYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgZm9sZC5yYW5nZSA9IHRoaXMuJGNsaXBSYW5nZVRvRG9jdW1lbnQoZm9sZC5yYW5nZSlcblxuICAgICAgICB2YXIgc3RhcnRSb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIHN0YXJ0Q29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIHZhciBlbmRSb3cgPSBmb2xkLmVuZC5yb3c7XG4gICAgICAgIHZhciBlbmRDb2x1bW4gPSBmb2xkLmVuZC5jb2x1bW47XG5cbiAgICAgICAgLy8gLS0tIFNvbWUgY2hlY2tpbmcgLS0tXG4gICAgICAgIGlmICghKHN0YXJ0Um93IDwgZW5kUm93IHx8XG4gICAgICAgICAgICBzdGFydFJvdyA9PSBlbmRSb3cgJiYgc3RhcnRDb2x1bW4gPD0gZW5kQ29sdW1uIC0gMikpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcmFuZ2UgaGFzIHRvIGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVycyB3aWR0aFwiKTtcblxuICAgICAgICB2YXIgc3RhcnRGb2xkID0gdGhpcy5nZXRGb2xkQXQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uLCAxKTtcbiAgICAgICAgdmFyIGVuZEZvbGQgPSB0aGlzLmdldEZvbGRBdChlbmRSb3csIGVuZENvbHVtbiwgLTEpO1xuICAgICAgICBpZiAoc3RhcnRGb2xkICYmIGVuZEZvbGQgPT0gc3RhcnRGb2xkKVxuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0Rm9sZC5hZGRTdWJGb2xkKGZvbGQpO1xuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIChzdGFydEZvbGQgJiYgIXN0YXJ0Rm9sZC5yYW5nZS5pc1N0YXJ0KHN0YXJ0Um93LCBzdGFydENvbHVtbikpXG4gICAgICAgICAgICB8fCAoZW5kRm9sZCAmJiAhZW5kRm9sZC5yYW5nZS5pc0VuZChlbmRSb3csIGVuZENvbHVtbikpXG4gICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQSBmb2xkIGNhbid0IGludGVyc2VjdCBhbHJlYWR5IGV4aXN0aW5nIGZvbGRcIiArIGZvbGQucmFuZ2UgKyBzdGFydEZvbGQucmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGZvbGRzIGluIHRoZSByYW5nZSB3ZSBjcmVhdGUgdGhlIG5ldyBmb2xkIGZvci5cbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRzIGZyb20gZm9sZCBkYXRhLlxuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgICAgICAvLyBBZGQgdGhlIHJlbW92ZWQgZm9sZHMgYXMgc3ViZm9sZHMgb24gdGhlIG5ldyBmb2xkLlxuICAgICAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgICAgICAgICAgZm9sZC5hZGRTdWJGb2xkKHN1YkZvbGQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChlbmRSb3cgPT0gZm9sZExpbmUuc3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0Um93ID09IGZvbGRMaW5lLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBtaWdodCBoYXZlIHRvIG1lcmdlIHR3byBGb2xkTGluZXMuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZU5leHQgPSBmb2xkRGF0YVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZU5leHQgJiYgZm9sZExpbmVOZXh0LnN0YXJ0LnJvdyA9PSBlbmRSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWVyZ2UhXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5tZXJnZShmb2xkTGluZU5leHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVuZFJvdyA8PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghYWRkZWQpXG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuJGFkZEZvbGRMaW5lKG5ldyBGb2xkTGluZSh0aGlzLiRmb2xkRGF0YSwgZm9sZCkpO1xuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwiYWRkXCIgfSk7XG5cbiAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgfVxuXG4gICAgc2V0TW9kaWZpZWQobW9kaWZpZWQ6IGJvb2xlYW4pIHtcblxuICAgIH1cblxuICAgIGFkZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGQoZm9sZDogRm9sZCk6IHZvaWQge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkLmZvbGRMaW5lO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuXG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIC8vIFNpbXBsZSBjYXNlIHdoZXJlIHRoZXJlIGlzIG9ubHkgb25lIGZvbGQgaW4gdGhlIEZvbGRMaW5lIHN1Y2ggdGhhdFxuICAgICAgICAvLyB0aGUgZW50aXJlIGZvbGQgbGluZSBjYW4gZ2V0IHJlbW92ZWQgZGlyZWN0bHkuXG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgZm9sZExpbmVzLnNwbGljZShmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSksIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBsYXN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc0VuZChmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBmb2xkcy5wb3AoKTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQucm93ID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLnJvdztcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQuY29sdW1uID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGVyZSBhcmUgbW9yZSB0aGVuIDIgZm9sZHMgYW5kIHRoZSBmb2xkIGlzIG5vdCBhdCB0aGUgZWRnZS5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZWFucywgdGhlIGZvbGQgaXMgc29tZXdoZXJlIGluIGJldHdlZW4uXG4gICAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIGluIG9uZSByb3csIHdlIGp1c3QgY2FuIHJlbW92ZSBpdC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc3BsaWNlKGZvbGRzLmluZGV4T2YoZm9sZCksIDEpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZvbGQgZ29lcyBvdmVyIG1vcmUgdGhlbiBvbmUgcm93LiBUaGlzIG1lYW5zIHJlbXZvaW5nIHRoaXMgZm9sZFxuICAgICAgICAgICAgICAgICAgICAvLyB3aWxsIGNhdXNlIHRoZSBmb2xkIGxpbmUgdG8gZ2V0IHNwbGl0dGVkIHVwLiBuZXdGb2xkTGluZSBpcyB0aGUgc2Vjb25kIHBhcnRcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ld0ZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzID0gbmV3Rm9sZExpbmUuZm9sZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiR1cGRhdGluZykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcInJlbW92ZVwiIH0pO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGRzKGZvbGRzOiBGb2xkW10pOiB2b2lkIHtcbiAgICAgICAgLy8gV2UgbmVlZCB0byBjbG9uZSB0aGUgZm9sZHMgYXJyYXkgcGFzc2VkIGluIGFzIGl0IG1pZ2h0IGJlIHRoZSBmb2xkc1xuICAgICAgICAvLyBhcnJheSBvZiBhIGZvbGQgbGluZSBhbmQgYXMgd2UgY2FsbCB0aGlzLnJlbW92ZUZvbGQoZm9sZCksIGZvbGRzXG4gICAgICAgIC8vIGFyZSByZW1vdmVkIGZyb20gZm9sZHMgYW5kIGNoYW5nZXMgdGhlIGN1cnJlbnQgaW5kZXguXG4gICAgICAgIHZhciBjbG9uZUZvbGRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNsb25lRm9sZHMucHVzaChmb2xkc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICBjbG9uZUZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkKGZvbGQ6IEZvbGQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICBmb2xkLnN1YkZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgZm9sZC5yZXN0b3JlUmFuZ2Uoc3ViRm9sZCk7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoc3ViRm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBpZiAoZm9sZC5jb2xsYXBzZUNoaWxkcmVuID4gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKGZvbGQuc3RhcnQucm93ICsgMSwgZm9sZC5lbmQucm93LCBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gLSAxKTtcbiAgICAgICAgfVxuICAgICAgICBmb2xkLnN1YkZvbGRzID0gW107XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgdW5mb2xkKGxvY2F0aW9uPzogYW55LCBleHBhbmRJbm5lcj86IGJvb2xlYW4pOiBGb2xkW10ge1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXTtcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHRoaXMuZ2V0TGVuZ3RoKCksIDApO1xuICAgICAgICAgICAgZXhwYW5kSW5uZXIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhdGlvbiA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UobG9jYXRpb24sIDAsIGxvY2F0aW9uLCB0aGlzLmdldExpbmUobG9jYXRpb24pLmxlbmd0aCk7XG4gICAgICAgIGVsc2UgaWYgKFwicm93XCIgaW4gbG9jYXRpb24pXG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMobG9jYXRpb24sIGxvY2F0aW9uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBsb2NhdGlvbjtcblxuICAgICAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgIGlmIChleHBhbmRJbm5lcikge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgICAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgICAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKHN1YkZvbGRzKTtcbiAgICAgICAgICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAgICogZm9sZGVkIHBhcnRzIHN1Y2ggdGhhdCBzb21lIHBhcnRzIG9mIHRoZSBsaW5lIGlzIHN0aWxsIHZpc2libGUuXG4gICAgICoqL1xuICAgIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRFbmQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93PzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIsIHN0YXJ0Um93PzogbnVtYmVyLCBzdGFydENvbHVtbj86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09IG51bGwpXG4gICAgICAgICAgICBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uIDwgc3RhcnRDb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsYXN0Q29sdW1uID0gTWF0aC5tYXgoc3RhcnRDb2x1bW4sIGxhc3RDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGV4dExpbmU7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBsaW5lOiBzdHJpbmc7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gfHwgMCwgZW5kQ29sdW1uIHx8IGxpbmUubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgICAgICAgICBmb2xkTGluZSwgcm93LCBlbmRDb2x1bW4sIHN0YXJ0Um93LCBzdGFydENvbHVtbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgZm9sZCA9IGZvbGRzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmb2xkKVxuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcblxuICAgICAgICBpZiAoZm9sZCAmJiBmb2xkLnJhbmdlLnRvU3RyaW5nKCkgPT0gcmFuZ2UudG9TdHJpbmcoKSkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBsYWNlaG9sZGVyID0gXCIuLi5cIjtcbiAgICAgICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHRoaXMuZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlci5sZW5ndGggPCA0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXIudHJpbSgpLnN1YnN0cmluZygwLCAyKSArIFwiLi5cIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkRm9sZChwbGFjZWhvbGRlciwgcmFuZ2UpO1xuICAgIH1cblxuICAgIGdldENvbW1lbnRGb2xkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBkaXI/OiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIGlmICh0b2tlbiAmJiAvXmNvbW1lbnR8c3RyaW5nLy50ZXN0KHRva2VuLnR5cGUpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHRva2VuLnR5cGUucmVwbGFjZSgvXFwuLiovLCBcIlxcXFwuXCIpKTtcbiAgICAgICAgICAgIGlmIChkaXIgIT0gMSkge1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMjtcblxuICAgICAgICAgICAgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChkaXIgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoIC0gMjtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvbGRBbGwoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGRlcHRoOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKGRlcHRoID09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGRlcHRoID0gMTAwMDAwOyAvLyBKU09OLnN0cmluZ2lmeSBkb2Vzbid0IGhhbmxlIEluZmluaXR5XG4gICAgICAgIHZhciBmb2xkV2lkZ2V0cyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZm9sZFdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICAgICAgZW5kUm93ID0gZW5kUm93IHx8IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgIHN0YXJ0Um93ID0gc3RhcnRSb3cgfHwgMDtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8IGVuZFJvdzsgcm93KyspIHtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddID09IG51bGwpXG4gICAgICAgICAgICAgICAgZm9sZFdpZGdldHNbcm93XSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gIT0gXCJzdGFydFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3cpO1xuICAgICAgICAgICAgLy8gc29tZXRpbWVzIHJhbmdlIGNhbiBiZSBpbmNvbXBhdGlibGUgd2l0aCBleGlzdGluZyBmb2xkXG4gICAgICAgICAgICAvLyBUT0RPIGNoYW5nZSBhZGRGb2xkIHRvIHJldHVybiBudWxsIGlzdGVhZCBvZiB0aHJvd2luZ1xuICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzTXVsdGlMaW5lKClcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5lbmQucm93IDw9IGVuZFJvd1xuICAgICAgICAgICAgICAgICYmIHJhbmdlLnN0YXJ0LnJvdyA+PSBzdGFydFJvd1xuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGRGb2xkIGNhbiBjaGFuZ2UgdGhlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSBkZXB0aDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEZvbGRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIGlmICghdGhpcy4kZm9sZFN0eWxlc1tzdHlsZV0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGZvbGQgc3R5bGU6IFwiICsgc3R5bGUgKyBcIltcIiArIE9iamVjdC5rZXlzKHRoaXMuJGZvbGRTdHlsZXMpLmpvaW4oXCIsIFwiKSArIFwiXVwiKTtcblxuICAgICAgICBpZiAodGhpcy4kZm9sZFN0eWxlID09PSBzdHlsZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkU3R5bGUgPSBzdHlsZTtcblxuICAgICAgICBpZiAoc3R5bGUgPT09IFwibWFudWFsXCIpXG4gICAgICAgICAgICB0aGlzLnVuZm9sZCgpO1xuICAgICAgICBcbiAgICAgICAgLy8gcmVzZXQgZm9sZGluZ1xuICAgICAgICB2YXIgbW9kZSA9IHRoaXMuJGZvbGRNb2RlO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG51bGwpO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHNldEZvbGRpbmcoZm9sZE1vZGUpIHtcbiAgICAgICAgaWYgKHRoaXMuJGZvbGRNb2RlID09IGZvbGRNb2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRNb2RlID0gZm9sZE1vZGU7XG5cbiAgICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiKTtcblxuICAgICAgICBpZiAoIWZvbGRNb2RlIHx8IHRoaXMuJGZvbGRTdHlsZSA9PSBcIm1hbnVhbFwiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gbnVsbDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBbXTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0ID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldC5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZSA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXRSYW5nZS5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzID0gdGhpcy51cGRhdGVGb2xkV2lkZ2V0cy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm9uKCdjaGFuZ2UnLCB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyk7XG5cbiAgICB9XG5cbiAgICBnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdzogbnVtYmVyLCBpZ25vcmVDdXJyZW50PzogYm9vbGVhbik6IHsgcmFuZ2U/OiBSYW5nZTsgZmlyc3RSYW5nZT86IFJhbmdlIH0ge1xuICAgICAgICB2YXIgZncgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZ3IHx8IChpZ25vcmVDdXJyZW50ICYmIGZ3W3Jvd10pKSB7XG4gICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHJvdyAtIDE7XG4gICAgICAgIHZhciBmaXJzdFJhbmdlOiBSYW5nZTtcbiAgICAgICAgd2hpbGUgKGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIGMgPSBmd1tpXTtcbiAgICAgICAgICAgIGlmIChjID09IG51bGwpXG4gICAgICAgICAgICAgICAgYyA9IGZ3W2ldID0gdGhpcy5nZXRGb2xkV2lkZ2V0KGkpO1xuXG4gICAgICAgICAgICBpZiAoYyA9PSBcInN0YXJ0XCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShpKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpcnN0UmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIGZpcnN0UmFuZ2UgPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuZW5kLnJvdyA+PSByb3cpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaS0tO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJhbmdlOiBpICE9PSAtMSAmJiByYW5nZSxcbiAgICAgICAgICAgIGZpcnN0UmFuZ2U6IGZpcnN0UmFuZ2VcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBvbkZvbGRXaWRnZXRDbGljayhyb3c6IG51bWJlciwgZSkge1xuICAgICAgICBlID0gZS5kb21FdmVudDtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjaGlsZHJlbjogZS5zaGlmdEtleSxcbiAgICAgICAgICAgIGFsbDogZS5jdHJsS2V5IHx8IGUubWV0YUtleSxcbiAgICAgICAgICAgIHNpYmxpbmdzOiBlLmFsdEtleVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCBvcHRpb25zKTtcbiAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgdmFyIGVsID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudClcbiAgICAgICAgICAgIGlmIChlbCAmJiAvYWNlX2ZvbGQtd2lkZ2V0Ly50ZXN0KGVsLmNsYXNzTmFtZSkpXG4gICAgICAgICAgICAgICAgZWwuY2xhc3NOYW1lICs9IFwiIGFjZV9pbnZhbGlkXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICR0b2dnbGVGb2xkV2lkZ2V0KHJvdzogbnVtYmVyLCBvcHRpb25zKTogUmFuZ2Uge1xuICAgICAgICBpZiAoIXRoaXMuZ2V0Rm9sZFdpZGdldClcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHR5cGUgPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgICAgICB2YXIgZGlyID0gdHlwZSA9PT0gXCJlbmRcIiA/IC0xIDogMTtcbiAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIGRpciA9PT0gLTEgPyAwIDogbGluZS5sZW5ndGgsIGRpcik7XG5cbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNoaWxkcmVuIHx8IG9wdGlvbnMuYWxsKVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3csIHRydWUpO1xuICAgICAgICAvLyBzb21ldGltZXMgc2luZ2xlbGluZSBmb2xkcyBjYW4gYmUgbWlzc2VkIGJ5IHRoZSBjb2RlIGFib3ZlXG4gICAgICAgIGlmIChyYW5nZSAmJiAhcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkICYmIHJhbmdlLmlzRXF1YWwoZm9sZC5yYW5nZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbnMuc2libGluZ3MpIHtcbiAgICAgICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdyk7XG4gICAgICAgICAgICBpZiAoZGF0YS5yYW5nZSkge1xuICAgICAgICAgICAgICAgIHZhciBzdGFydFJvdyA9IGRhdGEucmFuZ2Uuc3RhcnQucm93ICsgMTtcbiAgICAgICAgICAgICAgICB2YXIgZW5kUm93ID0gZGF0YS5yYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKHN0YXJ0Um93LCBlbmRSb3csIG9wdGlvbnMuYWxsID8gMTAwMDAgOiAwKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvcHRpb25zLmNoaWxkcmVuKSB7XG4gICAgICAgICAgICBlbmRSb3cgPSByYW5nZSA/IHJhbmdlLmVuZC5yb3cgOiB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKHJvdyArIDEsIHJhbmdlLmVuZC5yb3csIG9wdGlvbnMuYWxsID8gMTAwMDAgOiAwKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuYWxsKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIGJpdCB1Z2x5LCBidXQgaXQgY29ycmVzcG9uZHMgdG8gc29tZSBjb2RlIGVsc2V3aGVyZS5cbiAgICAgICAgICAgICAgICByYW5nZS5jb2xsYXBzZUNoaWxkcmVuID0gMTAwMDA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuXG5cbiAgICB0b2dnbGVGb2xkV2lkZ2V0KHRvZ2dsZVBhcmVudCkge1xuICAgICAgICB2YXIgcm93OiBudW1iZXIgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBoYW5kbGUgdG9nZ2xlUGFyZW50XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgdHJ1ZSk7XG4gICAgICAgIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgdGhpcy5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVGb2xkV2lkZ2V0cyhlOiB7IGRhdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IH0pOiB2b2lkIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB2YXIgcmFuZ2UgPSBkZWx0YS5yYW5nZTtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICB2YXIgbGVuID0gcmFuZ2UuZW5kLnJvdyAtIGZpcnN0Um93O1xuXG4gICAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHNbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlTGluZXNcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UoZmlyc3RSb3csIGxlbiArIDEsIG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4gKyAxKTtcbiAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMSk7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZS5hcHBseSh0aGlzLmZvbGRXaWRnZXRzLCBhcmdzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gRklYTUU6IFJlc3RvcmVcbi8vIEZvbGRpbmcuY2FsbChFZGl0U2Vzc2lvbi5wcm90b3R5cGUpO1xuXG5kZWZpbmVPcHRpb25zKEVkaXRTZXNzaW9uLnByb3RvdHlwZSwgXCJzZXNzaW9uXCIsIHtcbiAgICB3cmFwOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdmFsdWUgPT0gXCJvZmZcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGZhbHNlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJmcmVlXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0cnVlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJwcmludE1hcmdpblwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gLTE7XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IHZhbHVlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbCA9IHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiID8gdmFsdWUgOiBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UoY29sLCBjb2wpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiR3cmFwID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gLTEpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInByaW50TWFyZ2luXCI7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmdldFdyYXBMaW1pdFJhbmdlKCkubWluKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJmcmVlXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJvZmZcIjtcbiAgICAgICAgfSxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgd3JhcE1ldGhvZDoge1xuICAgICAgICAvLyBjb2RlfHRleHR8YXV0b1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdmFsID0gdmFsID09IFwiYXV0b1wiXG4gICAgICAgICAgICAgICAgPyB0aGlzLiRtb2RlLnR5cGUgIT0gXCJ0ZXh0XCJcbiAgICAgICAgICAgICAgICA6IHZhbCAhPSBcInRleHRcIjtcbiAgICAgICAgICAgIGlmICh2YWwgIT0gdGhpcy4kd3JhcEFzQ29kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHdyYXBBc0NvZGUgPSB2YWw7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImF1dG9cIlxuICAgIH0sXG4gICAgZmlyc3RMaW5lTnVtYmVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIik7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogMVxuICAgIH0sXG4gICAgdXNlV29ya2VyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXb3JrZXIgPSB1c2VXb3JrZXI7XG5cbiAgICAgICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcbiAgICAgICAgICAgIGlmICh1c2VXb3JrZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB0YWJTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA0LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBvdmVyd3JpdGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlT3ZlcndyaXRlXCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBuZXdMaW5lTW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJG1vZGVJZCB9XG4gICAgfVxufSk7XG4iXX0=