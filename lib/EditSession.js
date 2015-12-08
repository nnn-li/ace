import { delayedCall, stringRepeat } from "./lib/lang";
import { _signal, defineOptions, loadModule, resetOptions } from "./config";
import { EventEmitterClass } from "./lib/event_emitter";
import FoldLine from "./fold_line";
import Fold from "./fold";
import { Selection } from "./selection";
import Mode from "./mode/Mode";
import Range from "./Range";
import EditorDocument from "./EditorDocument";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uc2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlTW9kZSIsIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyIiwiRWRpdFNlc3Npb24uJHN0YXJ0V29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0TW9kZSIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZSIsIkVkaXRTZXNzaW9uLmdldExpbmVzIiwiRWRpdFNlc3Npb24uZ2V0TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0VGV4dFJhbmdlIiwiRWRpdFNlc3Npb24uaW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVtb3ZlIiwiRWRpdFNlc3Npb24udW5kb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5yZWRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnNldFVuZG9TZWxlY3QiLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uLmlzSW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVwbGFjZSIsIkVkaXRTZXNzaW9uLm1vdmVUZXh0IiwiRWRpdFNlc3Npb24uaW5kZW50Um93cyIsIkVkaXRTZXNzaW9uLm91dGRlbnRSb3dzIiwiRWRpdFNlc3Npb24uJG1vdmVMaW5lcyIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93biIsIkVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzIiwiRWRpdFNlc3Npb24uJGNsaXBSb3dUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBDb2x1bW5Ub1JvdyIsIkVkaXRTZXNzaW9uLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBSYW5nZVRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLmdldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi4kY29uc3RyYWluV3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlV3JhcERhdGEiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMuYWRkU3BsaXQiLCJFZGl0U2Vzc2lvbi4kZ2V0RGlzcGxheVRva2VucyIsIkVkaXRTZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xpbmVDb3VudCIsIkVkaXRTZXNzaW9uLmdldFJvd1dyYXBJbmRlbnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRDb2x1bW4iLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxlbmd0aCIsIkVkaXRTZXNzaW9uLiRzZXRGb250TWV0cmljcyIsIkVkaXRTZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uJGZpbmRDbG9zaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEZvbGRBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJFZGl0U2Vzc2lvbi5nZXRBbGxGb2xkcyIsIkVkaXRTZXNzaW9uLmdldEZvbGRTdHJpbmdBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZGVkUm93Q291bnQiLCJFZGl0U2Vzc2lvbi4kYWRkRm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkIiwiRWRpdFNlc3Npb24uc2V0TW9kaWZpZWQiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkcyIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGQiLCJFZGl0U2Vzc2lvbi5yZW1vdmVGb2xkcyIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGQiLCJFZGl0U2Vzc2lvbi5leHBhbmRGb2xkcyIsIkVkaXRTZXNzaW9uLnVuZm9sZCIsIkVkaXRTZXNzaW9uLmlzUm93Rm9sZGVkIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZEVuZCIsIkVkaXRTZXNzaW9uLmdldFJvd0ZvbGRTdGFydCIsIkVkaXRTZXNzaW9uLmdldEZvbGREaXNwbGF5TGluZSIsIkVkaXRTZXNzaW9uLmdldERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uJGNsb25lRm9sZERhdGEiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkIiwiRWRpdFNlc3Npb24uZ2V0Q29tbWVudEZvbGRSYW5nZSIsIkVkaXRTZXNzaW9uLmZvbGRBbGwiLCJFZGl0U2Vzc2lvbi5zZXRGb2xkU3R5bGUiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9sZGluZyIsIkVkaXRTZXNzaW9uLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJFZGl0U2Vzc2lvbi5vbkZvbGRXaWRnZXRDbGljayIsIkVkaXRTZXNzaW9uLiR0b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCIsIkVkaXRTZXNzaW9uLnVwZGF0ZUZvbGRXaWRnZXRzIl0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsRUFBQyxpQkFBaUIsRUFBQyxNQUFNLHFCQUFxQjtPQUM5QyxRQUFRLE1BQU0sYUFBYTtPQUMzQixJQUFJLE1BQU0sUUFBUTtPQUNsQixFQUFDLFNBQVMsRUFBQyxNQUFNLGFBQWE7T0FDOUIsSUFBSSxNQUFNLGFBQWE7T0FDdkIsS0FBSyxNQUFNLFNBQVM7T0FDcEIsY0FBYyxNQUFNLGtCQUFrQjtPQUN0QyxFQUFDLG1CQUFtQixFQUFDLE1BQU0sd0JBQXdCO09BQ25ELEVBQUMsZUFBZSxFQUFDLE1BQU0sb0JBQW9CO09BQzNDLEVBQUMsTUFBTSxFQUFDLE1BQU0sZUFBZTtPQUM3QixZQUFZLE1BQU0sOEJBQThCO09BRWhELGFBQWEsTUFBTSxpQkFBaUI7QUFJM0MsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUNSLFFBQVEsR0FBRyxDQUFDLEVBQ1osaUJBQWlCLEdBQUcsQ0FBQyxFQUNyQixnQkFBZ0IsR0FBRyxDQUFDLEVBQ3BCLFdBQVcsR0FBRyxDQUFDLEVBQ2YsS0FBSyxHQUFHLEVBQUUsRUFDVixHQUFHLEdBQUcsRUFBRSxFQUNSLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFJbkIscUJBQXFCLENBQVM7SUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ1hBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxNQUFNQSxDQUFDQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUM3QkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFB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QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFTTTVDLFlBQVlBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQzNDNkMsSUFBSUEsSUFBSUEsR0FBV0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFckNBLElBQUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNYQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUU1REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDVEEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBO1lBQ0FBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRTdCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FB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QUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQzlCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDOUIsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDO2dCQUM1QixDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDO2dCQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQyxDQUFDQSxDQUFDQSxDQUFDQTtRQUNSQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFZTTVFLFVBQVVBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLFlBQVlBO1FBQzVDNkUsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLEVBQUVBLEdBQUdBLElBQUlBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBO1lBQ3pDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUMzREEsQ0FBQ0E7SUFRTTdFLFdBQVdBLENBQUNBLEtBQVlBO1FBQzNCOEUsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDcENBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUU3QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDMURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7b0JBQ3RCQSxLQUFLQSxDQUFDQTtZQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFD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QUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNoRUEsQ0FBQ0E7SUFFT25GLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUE7UUFDaENvRixFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFHT3BGLHVCQUF1QkEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDdkRxRixNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNiQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDOUNBLENBQUNBO1lBQ0RBLElBQUlBLENB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Q0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEdBQUdBLEdBQUdBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxXQUFXQSxHQUFHQSxpQkFBaUJBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUUxRUEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQy9CQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDbERBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO2dCQUUvQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUN4RUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBRXhCQSxJQUFJQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDaERBLEVBQUVBLENBQUNBLENBQUNBLGNBQWNBLElBQUlBLGNBQWNBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNoREEsY0FBY0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7d0JBQy9CQSxRQUFRQSxHQUFHQSxjQUFjQSxDQUFDQTtvQkFDOUJBLENBQUNBO29CQUNEQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDMUNBLENBQUNBO2dCQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDdENBLElBQUlBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDNUJBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDdkJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsSUFBSUEsR0FBR0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQUE7Z0JBQzdEQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFJNUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO2dCQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUFBO29CQUUvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1hBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNuREEsUUFBUUEsQ0FBQ0EsUUFB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WUFDL0JDLElBQUlBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBSW5EQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMzQkEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBRWRBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBO2dCQUNYLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0E7Z0JBRUZBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBO2dCQUNWLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFUEEsWUFBWUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzFCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREQsT0FBT0EsYUFBYUEsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFFM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBSWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFNdkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFL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SUFBSUEsQ0FBQ0E7UUFDVEEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLElBQUlBLE1BQU1BLENBQUNBO1FBQ1hBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1pBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBRWxCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxHQUFHQSxJQUFJQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN0QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLElBQUlBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNsREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBO2dCQUNqQkEsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDbERBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFB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QUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdkNBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDaERBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3BDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBRWpEQSxPQUFPQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDbkJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNqQ0EsVUFBVUEsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDdkJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO29CQUMzQkEsU0FBU0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7Z0JBQ2pEQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsVUFBVUEsSUFBSUEsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxFQUFFQSxDQUFDQTtRQUNoREEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBS01ySCxlQUFlQSxDQUFDQSxFQUFlQTtJQUV0Q3NILENBQUNBO0lBRUR0SCxtQkFBbUJBLENBQUNBLFFBQXlDQSxFQUFFQSxHQUFZQTtRQUN2RXVILE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDbkVBLENBQUNBO0lBRUR2SCxlQUFlQSxDQUFDQSxRQUF5Q0E7UUFDckR3SCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFFRHhILG1CQUFtQkEsQ0FBQ0EsT0FBZUEsRUFBRUEsUUFBeUNBLEVBQUVBLE1BQWVBO1FBQzNGeUgsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMvRUEsQ0FBQ0E7SUFFRHpILG1CQUFtQkEsQ0FBQ0EsT0FBZUEsRUFBRUEsUUFBeUNBLEVBQUVBLE1BQWVBO1FBQzNGMEgsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMvRUEsQ0FBQ0E7SUFlRDFILFNBQVNBLENBQUNBLEdBQVdBLEVBQUVBLE1BQU1BLEVBQUVBLElBQUtBO1FBQ2hDMkgsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDckNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO1lBQ1ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBRWhCQSxJQUFJQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUMzQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDcENBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM3Q0EsUUFBUUEsQ0FBQ0E7Z0JBQ2JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkRBLFFBQVFBLENBQUNBO2dCQUNiQSxDQUFDQTtnQkFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUQzSCxlQUFlQSxDQUFDQSxLQUFZQTtRQUN4QjRILElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNwQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLFVBQVVBLEdBQVdBLEVBQUVBLENBQUNBO1FBRTVCQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNsQkEsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdqQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdB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QUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFaEJBLElBQUlBLFFBQVFBLEdBQUdBO1lBQ1hBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1NBQ3JCQSxDQUFDQTtRQUVGQSxJQUFJQSxHQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ0xBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXRFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUVEL0gsV0FBV0EsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ2hEZ0ksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3REEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUdEaEksZUFBZUEsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ3BEaUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEakksaUJBQWlCQSxDQUFDQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUN6Q2tJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUN0QkEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7d0JBQ2ZBLFFBQVFBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBO29CQUM3QkEs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QUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNiQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUVoQkEsSUFBSUEsWUFBWUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxJQUFJQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFFbkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO3dCQUM3QkEsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFDREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVyRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDbEJBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBR3ZFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFeERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEcEksV0FBV0EsQ0FBQ0EsUUFBaUJBO0lBRTdCcUksQ0FBQ0E7SUFFRHJJLFFBQVFBLENBQUNBLEtBQWFBO1FBQ2xCc0ksS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsSUFBSUE7WUFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixDQUFDLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ2JBLENBQUNBO0lBRUR0SSxVQUFVQSxDQUFDQSxJQUFVQTtRQUNqQnVJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1FBQzdCQSxJQUFJQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNsQ0EsSUFBSUEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFFOUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQy9CQSxJQUFJQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUczQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDWkEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDbkRBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1FBQzdEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDZEEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDeENBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2xEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUtGQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FHTkEsQ0FBQ0E7WUFDR0EsSUFBSUEsV0FBV0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEtBQUtBLEdBQUdBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBO1lBQzFCQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUMzQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFB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Q0E7Z0JBQzlCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDeEJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ05BLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9EQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUN2QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsV0FBV0EsR0FBR0EsV0FBV0EsQ0FBQ0EsSUFBSUEsRUFBRUEs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S0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN4Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDcENBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzVEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsTUFBTUEsR0FBR0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0Es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QUFDLE1BQU0sQ0FBQztZQUV4RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztZQUN4QixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFBLENBQUMsQ0FBQztRQUNwRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELElBQUksRUFBRTtRQUNGLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN4QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFDLENBQUM7S0FDMUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtfc2lnbmFsLCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCBGb2xkTGluZSBmcm9tIFwiLi9mb2xkX2xpbmVcIjtcbmltcG9ydCBGb2xkIGZyb20gXCIuL2ZvbGRcIjtcbmltcG9ydCB7U2VsZWN0aW9ufSBmcm9tIFwiLi9zZWxlY3Rpb25cIjtcbmltcG9ydCBNb2RlIGZyb20gXCIuL21vZGUvTW9kZVwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgRWRpdG9yRG9jdW1lbnQgZnJvbSBcIi4vRWRpdG9yRG9jdW1lbnRcIjtcbmltcG9ydCB7QmFja2dyb3VuZFRva2VuaXplcn0gZnJvbSBcIi4vYmFja2dyb3VuZF90b2tlbml6ZXJcIjtcbmltcG9ydCB7U2VhcmNoSGlnaGxpZ2h0fSBmcm9tIFwiLi9zZWFyY2hfaGlnaGxpZ2h0XCI7XG5pbXBvcnQge2Fzc2VydH0gZnJvbSAnLi9saWIvYXNzZXJ0cyc7XG5pbXBvcnQgQnJhY2tldE1hdGNoIGZyb20gXCIuL2VkaXRfc2Vzc2lvbi9icmFja2V0X21hdGNoXCI7XG5pbXBvcnQge1VuZG9NYW5hZ2VyfSBmcm9tICcuL3VuZG9tYW5hZ2VyJ1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSAnLi9Ub2tlbkl0ZXJhdG9yJztcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi9sYXllci9Gb250TWV0cmljc1wiO1xuXG4vLyBcIlRva2Vuc1wiXG52YXIgQ0hBUiA9IDEsXG4gICAgQ0hBUl9FWFQgPSAyLFxuICAgIFBMQUNFSE9MREVSX1NUQVJUID0gMyxcbiAgICBQTEFDRUhPTERFUl9CT0RZID0gNCxcbiAgICBQVU5DVFVBVElPTiA9IDksXG4gICAgU1BBQ0UgPSAxMCxcbiAgICBUQUIgPSAxMSxcbiAgICBUQUJfU1BBQ0UgPSAxMjtcblxuLy8gRm9yIGV2ZXJ5IGtleXN0cm9rZSB0aGlzIGdldHMgY2FsbGVkIG9uY2UgcGVyIGNoYXIgaW4gdGhlIHdob2xlIGRvYyEhXG4vLyBXb3VsZG4ndCBodXJ0IHRvIG1ha2UgaXQgYSBiaXQgZmFzdGVyIGZvciBjID49IDB4MTEwMFxuZnVuY3Rpb24gaXNGdWxsV2lkdGgoYzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgaWYgKGMgPCAweDExMDApXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYyA+PSAweDExMDAgJiYgYyA8PSAweDExNUYgfHxcbiAgICAgICAgYyA+PSAweDExQTMgJiYgYyA8PSAweDExQTcgfHxcbiAgICAgICAgYyA+PSAweDExRkEgJiYgYyA8PSAweDExRkYgfHxcbiAgICAgICAgYyA+PSAweDIzMjkgJiYgYyA8PSAweDIzMkEgfHxcbiAgICAgICAgYyA+PSAweDJFODAgJiYgYyA8PSAweDJFOTkgfHxcbiAgICAgICAgYyA+PSAweDJFOUIgJiYgYyA8PSAweDJFRjMgfHxcbiAgICAgICAgYyA+PSAweDJGMDAgJiYgYyA8PSAweDJGRDUgfHxcbiAgICAgICAgYyA+PSAweDJGRjAgJiYgYyA8PSAweDJGRkIgfHxcbiAgICAgICAgYyA+PSAweDMwMDAgJiYgYyA8PSAweDMwM0UgfHxcbiAgICAgICAgYyA+PSAweDMwNDEgJiYgYyA8PSAweDMwOTYgfHxcbiAgICAgICAgYyA+PSAweDMwOTkgJiYgYyA8PSAweDMwRkYgfHxcbiAgICAgICAgYyA+PSAweDMxMDUgJiYgYyA8PSAweDMxMkQgfHxcbiAgICAgICAgYyA+PSAweDMxMzEgJiYgYyA8PSAweDMxOEUgfHxcbiAgICAgICAgYyA+PSAweDMxOTAgJiYgYyA8PSAweDMxQkEgfHxcbiAgICAgICAgYyA+PSAweDMxQzAgJiYgYyA8PSAweDMxRTMgfHxcbiAgICAgICAgYyA+PSAweDMxRjAgJiYgYyA8PSAweDMyMUUgfHxcbiAgICAgICAgYyA+PSAweDMyMjAgJiYgYyA8PSAweDMyNDcgfHxcbiAgICAgICAgYyA+PSAweDMyNTAgJiYgYyA8PSAweDMyRkUgfHxcbiAgICAgICAgYyA+PSAweDMzMDAgJiYgYyA8PSAweDREQkYgfHxcbiAgICAgICAgYyA+PSAweDRFMDAgJiYgYyA8PSAweEE0OEMgfHxcbiAgICAgICAgYyA+PSAweEE0OTAgJiYgYyA8PSAweEE0QzYgfHxcbiAgICAgICAgYyA+PSAweEE5NjAgJiYgYyA8PSAweEE5N0MgfHxcbiAgICAgICAgYyA+PSAweEFDMDAgJiYgYyA8PSAweEQ3QTMgfHxcbiAgICAgICAgYyA+PSAweEQ3QjAgJiYgYyA8PSAweEQ3QzYgfHxcbiAgICAgICAgYyA+PSAweEQ3Q0IgJiYgYyA8PSAweEQ3RkIgfHxcbiAgICAgICAgYyA+PSAweEY5MDAgJiYgYyA8PSAweEZBRkYgfHxcbiAgICAgICAgYyA+PSAweEZFMTAgJiYgYyA8PSAweEZFMTkgfHxcbiAgICAgICAgYyA+PSAweEZFMzAgJiYgYyA8PSAweEZFNTIgfHxcbiAgICAgICAgYyA+PSAweEZFNTQgJiYgYyA8PSAweEZFNjYgfHxcbiAgICAgICAgYyA+PSAweEZFNjggJiYgYyA8PSAweEZFNkIgfHxcbiAgICAgICAgYyA+PSAweEZGMDEgJiYgYyA8PSAweEZGNjAgfHxcbiAgICAgICAgYyA+PSAweEZGRTAgJiYgYyA8PSAweEZGRTY7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gICAgcHVibGljICRkZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlICRmcm9udE1hcmtlcnMgPSB7fTtcbiAgICBwdWJsaWMgJGJhY2tNYXJrZXJzID0ge307XG4gICAgcHJpdmF0ZSAkbWFya2VySWQgPSAxO1xuICAgIHByaXZhdGUgJHVuZG9TZWxlY3QgPSB0cnVlO1xuICAgIHByaXZhdGUgJGRlbHRhcztcbiAgICBwcml2YXRlICRkZWx0YXNEb2M7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRm9sZDtcbiAgICBwcml2YXRlICRmcm9tVW5kbztcblxuICAgIHByaXZhdGUgJHVwZGF0ZUZvbGRXaWRnZXRzOiAoKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkZm9sZERhdGE6IEZvbGRMaW5lW107XG4gICAgcHVibGljIGZvbGRXaWRnZXRzOiBhbnlbXTtcbiAgICBwdWJsaWMgZ2V0Rm9sZFdpZGdldDogKHJvdzogbnVtYmVyKSA9PiBhbnk7XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXRSYW5nZTogKHJvdzogbnVtYmVyLCBmb3JjZU11bHRpbGluZT86IGJvb2xlYW4pID0+IFJhbmdlO1xuXG4gICAgcHVibGljIGRvYzogRWRpdG9yRG9jdW1lbnQ7XG4gICAgcHJpdmF0ZSAkZGVmYXVsdFVuZG9NYW5hZ2VyID0geyB1bmRvOiBmdW5jdGlvbigpIHsgfSwgcmVkbzogZnVuY3Rpb24oKSB7IH0sIHJlc2V0OiBmdW5jdGlvbigpIHsgfSB9O1xuICAgIHByaXZhdGUgJHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcjtcbiAgICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gICAgcHVibGljIGJnVG9rZW5pemVyOiBCYWNrZ3JvdW5kVG9rZW5pemVyO1xuICAgIHB1YmxpYyAkbW9kaWZpZWQ7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb246IFNlbGVjdGlvbjtcbiAgICBwcml2YXRlICRkb2NSb3dDYWNoZTogbnVtYmVyW107XG4gICAgcHJpdmF0ZSAkd3JhcERhdGE6IG51bWJlcltdW107XG4gICAgcHJpdmF0ZSAkc2NyZWVuUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHJvd0xlbmd0aENhY2hlO1xuICAgIHByaXZhdGUgJG92ZXJ3cml0ZSA9IGZhbHNlO1xuICAgIHB1YmxpYyAkc2VhcmNoSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgJGFubm90YXRpb25zO1xuICAgIHByaXZhdGUgJGF1dG9OZXdMaW5lO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuICAgIHByaXZhdGUgJHVzZVdvcmtlcjtcbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vZGVzOiB7IFtwYXRoOiBzdHJpbmddOiBNb2RlIH0gPSB7fTtcbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHB1YmxpYyAkbW9kZTogTW9kZSA9IG51bGw7XG4gICAgcHJpdmF0ZSAkbW9kZUlkID0gbnVsbDtcbiAgICBwcml2YXRlICR3b3JrZXI7XG4gICAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgICBwdWJsaWMgdG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyBub25Ub2tlblJlOiBSZWdFeHA7XG4gICAgcHVibGljICRzY3JvbGxUb3AgPSAwO1xuICAgIHByaXZhdGUgJHNjcm9sbExlZnQgPSAwO1xuICAgIC8vIFdSQVBNT0RFXG4gICAgcHJpdmF0ZSAkd3JhcEFzQ29kZTtcbiAgICBwcml2YXRlICR3cmFwTGltaXQgPSA4MDtcbiAgICBwdWJsaWMgJHVzZVdyYXBNb2RlID0gZmFsc2U7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgIG1pbjogbnVsbCxcbiAgICAgICAgbWF4OiBudWxsXG4gICAgfTtcbiAgICBwdWJsaWMgJHVwZGF0aW5nO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0cyA9IG51bGw7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgcHJpdmF0ZSAkc3luY0luZm9ybVVuZG9NYW5hZ2VyOiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBtZXJnZVVuZG9EZWx0YXM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdXNlU29mdFRhYnM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdGFiU2l6ZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJHdyYXBNZXRob2Q7XG4gICAgcHJpdmF0ZSBzY3JlZW5XaWR0aDtcbiAgICBwcml2YXRlIGxpbmVXaWRnZXRzV2lkdGg7XG4gICAgcHJpdmF0ZSBsaW5lV2lkZ2V0V2lkdGg7XG4gICAgcHJpdmF0ZSAkZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoO1xuICAgIC8vXG4gICAgcHVibGljICR0YWdIaWdobGlnaHQ7XG4gICAgcHVibGljICRicmFja2V0SGlnaGxpZ2h0OiBudW1iZXI7ICAgLy8gYSBtYXJrZXIuXG4gICAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOyAgICAgICAgLy8gTm90IGEgbWFya2VyIVxuICAgIC8qKlxuICAgICAqIEEgbnVtYmVyIGlzIGEgbWFya2VyIGlkZW50aWZpZXIsIG51bGwgaW5kaWNhdGVzIHRoYXQgbm8gc3VjaCBtYXJrZXIgZXhpc3RzLiBcbiAgICAgKi9cbiAgICBwdWJsaWMgJHNlbGVjdGlvbk1hcmtlcjogbnVtYmVyID0gbnVsbDtcbiAgICBwcml2YXRlICRicmFja2V0TWF0Y2hlciA9IG5ldyBCcmFja2V0TWF0Y2godGhpcyk7XG5cbiAgICBjb25zdHJ1Y3Rvcihkb2M6IEVkaXRvckRvY3VtZW50LCBtb2RlPywgY2I/OiAoKSA9PiBhbnkpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEgPSBbXTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmpvaW4oXCJcXG5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZUZvbGRcIiwgdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2V0RG9jdW1lbnQoZG9jKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHRoaXMpO1xuXG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RlKG1vZGUsIGNiKTtcbiAgICAgICAgX3NpZ25hbChcInNlc3Npb25cIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYEVkaXRTZXNzaW9uYCB0byBwb2ludCB0byBhIG5ldyBgRWRpdG9yRG9jdW1lbnRgLiBJZiBhIGBCYWNrZ3JvdW5kVG9rZW5pemVyYCBleGlzdHMsIGl0IGFsc28gcG9pbnRzIHRvIGBkb2NgLlxuICAgICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gZG9jIHtFZGl0b3JEb2N1bWVudH0gVGhlIG5ldyBgRWRpdG9yRG9jdW1lbnRgIHRvIHVzZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBFZGl0b3JEb2N1bWVudCk6IHZvaWQge1xuICAgICAgICBpZiAoIShkb2MgaW5zdGFuY2VvZiBFZGl0b3JEb2N1bWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImRvYyBtdXN0IGJlIGEgRWRpdG9yRG9jdW1lbnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZG9jKSB7XG4gICAgICAgICAgICB0aGlzLmRvYy5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRvYyA9IGRvYztcbiAgICAgICAgZG9jLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcblxuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXNldENhY2hlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGBFZGl0b3JEb2N1bWVudGAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAgICogQHJldHVybiB7RWRpdG9yRG9jdW1lbnR9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50KCk6IEVkaXRvckRvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgICAgICBpZiAobCA+IGkpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGxvdyA9IDA7XG4gICAgICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgICAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgICAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgICAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgICAgICAgICBoaSA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvdyAtIDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VGb2xkKGUpIHtcbiAgICAgICAgdmFyIGZvbGQgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGRlbHRhLnJhbmdlLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpO1xuICAgICAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgICAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgICAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZGVsdGFzRm9sZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRzOiByZW1vdmVkRm9sZHNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuJHVwZGF0ZU9uQ2hhbmdlKGRlbHRhKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB0ZXh0IHRvIHBsYWNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXRWYWx1ZSh0ZXh0KTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICB0aGlzLnNldFVuZG9NYW5hZ2VyKHRoaXMuJHVuZG9NYW5hZ2VyKTtcbiAgICAgICAgdGhpcy5nZXRVbmRvTWFuYWdlcigpLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRWRpdG9yRG9jdW1lbnQgYEVkaXRvckRvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICoqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBbW0VkaXRvckRvY3VtZW50IGBFZGl0b3JEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgKiBAYWxpYXMgRWRpdFNlc3Npb24udG9TdHJpbmdcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG4gICAgcHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGV9XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBCYWNrZ3JvdW5kVG9rZW5pemVyLmdldFN0YXRlXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VG9rZW5zKHJvdzogbnVtYmVyKTogeyBzdGFydDogbnVtYmVyOyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuIFRoZSBvYmplY3QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgaW5kZXhgIGFuZCBgc3RhcnRgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byByZXRyaWV2ZSBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUb2tlbkF0KHJvdzogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIHRva2VuczogeyB2YWx1ZTogc3RyaW5nIH1bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIHZhciB0b2tlbjogeyBpbmRleD86IG51bWJlcjsgc3RhcnQ/OiBudW1iZXI7IHZhbHVlOiBzdHJpbmcgfTtcbiAgICAgICAgdmFyIGMgPSAwO1xuICAgICAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgICAgICAgIGkgPSB0b2tlbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGMgKz0gdG9rZW5zW2ldLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZiAoYyA+PSBjb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIHRva2VuLmluZGV4ID0gaTtcbiAgICAgICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgKiBAcGFyYW0ge1VuZG9NYW5hZ2VyfSB1bmRvTWFuYWdlciBUaGUgbmV3IHVuZG8gbWFuYWdlclxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRVbmRvTWFuYWdlcih1bmRvTWFuYWdlcjogVW5kb01hbmFnZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb01hbmFnZXIgPSB1bmRvTWFuYWdlcjtcbiAgICAgICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG5cbiAgICAgICAgaWYgKHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgaWYgKHVuZG9NYW5hZ2VyKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHNlbGYuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0ZvbGQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImZvbGRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRm9sZFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImRvY1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNEb2NcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB1bmRvTWFuYWdlci5leGVjdXRlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJhY2V1cGRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtzZWxmLiRkZWx0YXMsIHNlbGZdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVyZ2U6IHNlbGYubWVyZ2VVbmRvRGVsdGFzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxmLm1lcmdlVW5kb0RlbHRhcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcyA9IFtdO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyID0gZGVsYXllZENhbGwodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHN0YXJ0cyBhIG5ldyBncm91cCBpbiB1bmRvIGhpc3RvcnlcbiAgICAgKi9cbiAgICBwdWJsaWMgbWFya1VuZG9Hcm91cCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdW5kbyBtYW5hZ2VyLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVuZG9NYW5hZ2VyIHx8IHRoaXMuJGRlZmF1bHRVbmRvTWFuYWdlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuIElmIHRoZSB1c2VyIGlzIHVzaW5nIHNvZnQgdGFicywgdGhpcyB3aWxsIGJlIGEgc2VyaWVzIG9mIHNwYWNlcyAoZGVmaW5lZCBieSBbW0VkaXRTZXNzaW9uLmdldFRhYlNpemUgYGdldFRhYlNpemUoKWBdXSk7IG90aGVyd2lzZSBpdCdzIHNpbXBseSBgJ1xcdCdgLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUYWJTdHJpbmcoKSB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgLyoqXG4gICAgKiBQYXNzIGB0cnVlYCB0byBlbmFibGUgdGhlIHVzZSBvZiBzb2Z0IHRhYnMuIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VTb2Z0VGFicyBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnNcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVNvZnRUYWJzKHZhbCkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInVzZVNvZnRUYWJzXCIsIHZhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBzb2Z0IHRhYnMgYXJlIGJlaW5nIHVzZWQsIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgcHVibGljIGdldFVzZVNvZnRUYWJzKCkge1xuICAgICAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAhdGhpcy4kbW9kZS4kaW5kZW50V2l0aFRhYnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXQgdGhlIG51bWJlciBvZiBzcGFjZXMgdGhhdCBkZWZpbmUgYSBzb2Z0IHRhYi5cbiAgICAqIEZvciBleGFtcGxlLCBwYXNzaW5nIGluIGA0YCB0cmFuc2Zvcm1zIHRoZSBzb2Z0IHRhYnMgdG8gYmUgZXF1aXZhbGVudCB0byBmb3VyIHNwYWNlcy5cbiAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYGNoYW5nZVRhYlNpemVgIGV2ZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHRhYlNpemUgVGhlIG5ldyB0YWIgc2l6ZVxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VGFiU2l6ZSh0YWJTaXplOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ0YWJTaXplXCIsIHRhYlNpemUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VGFiU2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBjaGVja1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS5cbiAgICAqXG4gICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICpcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICAgKiovXG4gICAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPdmVyd3JpdGUoIXRoaXMuJG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBgY2xhc3NOYW1lYCB0byB0aGUgYHJvd2AsIHRvIGJlIHVzZWQgZm9yIENTUyBzdHlsaW5ncyBhbmQgd2hhdG5vdC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBgY2xhc3NOYW1lYCBmcm9tIHRoZSBgcm93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICogQHJldHVybnMge1tOdW1iZXJdfVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0QnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIGV2ZXJ5IHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7QXJyYXl9IHJvd3MgQW4gYXJyYXkgb2Ygcm93IGluZGljZXNcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93c1tpXV0gPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIGFsbCBicmVha3BvaW50cyBvbiB0aGUgcm93cy4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIENsYXNzIG9mIHRoZSBicmVha3BvaW50XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnQocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdykge1xuICAgICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBBZGRzIGEgbmV3IG1hcmtlciB0byB0aGUgZ2l2ZW4gYFJhbmdlYC4gSWYgYGluRnJvbnRgIGlzIGB0cnVlYCwgYSBmcm9udCBtYXJrZXIgaXMgZGVmaW5lZCwgYW5kIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgZmlyZXM7IG90aGVyd2lzZSwgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGZpcmVzLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgRGVmaW5lIHRoZSByYW5nZSBvZiB0aGUgbWFya2VyXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHR5cGUgSWRlbnRpZnkgdGhlIHR5cGUgb2YgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogYW55LCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgLy8gRklYTUU6IE5lZWQgbW9yZSB0eXBlIHNhZmV0eSBoZXJlLlxuICAgICAgICB2YXIgbWFya2VyID0ge1xuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgICAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PSBcImZ1bmN0aW9uXCIgPyB0eXBlIDogbnVsbCxcbiAgICAgICAgICAgIGNsYXp6OiBjbGF6eixcbiAgICAgICAgICAgIGluRnJvbnQ6ICEhaW5Gcm9udCxcbiAgICAgICAgICAgIGlkOiBpZFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpbkZyb250KSB7XG4gICAgICAgICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBkeW5hbWljIG1hcmtlciB0byB0aGUgc2Vzc2lvbi5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gbWFya2VyIG9iamVjdCB3aXRoIHVwZGF0ZSBtZXRob2RcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgYWRkZWQgbWFya2VyXG4gICAgICoqL1xuICAgIHByaXZhdGUgYWRkRHluYW1pY01hcmtlcihtYXJrZXIsIGluRnJvbnQ/KSB7XG4gICAgICAgIGlmICghbWFya2VyLnVwZGF0ZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGlkID0gdGhpcy4kbWFya2VySWQrKztcbiAgICAgICAgbWFya2VyLmlkID0gaWQ7XG4gICAgICAgIG1hcmtlci5pbkZyb250ID0gISFpbkZyb250O1xuXG4gICAgICAgIGlmIChpbkZyb250KSB7XG4gICAgICAgICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1hcmtlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgdGhlIG1hcmtlciB3aXRoIHRoZSBzcGVjaWZpZWQgSUQuIElmIHRoaXMgbWFya2VyIHdhcyBpbiBmcm9udCwgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbWFya2VySWQgQSBudW1iZXIgcmVwcmVzZW50aW5nIGEgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHJlbW92ZU1hcmtlcihtYXJrZXJJZCkge1xuICAgICAgICB2YXIgbWFya2VyID0gdGhpcy4kZnJvbnRNYXJrZXJzW21hcmtlcklkXSB8fCB0aGlzLiRiYWNrTWFya2Vyc1ttYXJrZXJJZF07XG4gICAgICAgIGlmICghbWFya2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICAgICAgaWYgKG1hcmtlcikge1xuICAgICAgICAgICAgZGVsZXRlIChtYXJrZXJzW21hcmtlcklkXSk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwobWFya2VyLmluRnJvbnQgPyBcImNoYW5nZUZyb250TWFya2VyXCIgOiBcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgSURzIG9mIGFsbCB0aGUgbWFya2VycywgZWl0aGVyIGZyb250IG9yIGJhY2suXG4gICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluRnJvbnQgSWYgYHRydWVgLCBpbmRpY2F0ZXMgeW91IG9ubHkgd2FudCBmcm9udCBtYXJrZXJzOyBgZmFsc2VgIGluZGljYXRlcyBvbmx5IGJhY2sgbWFya2Vyc1xuICAgICpcbiAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TWFya2VycyhpbkZyb250OiBib29sZWFuKSB7XG4gICAgICAgIHJldHVybiBpbkZyb250ID8gdGhpcy4kZnJvbnRNYXJrZXJzIDogdGhpcy4kYmFja01hcmtlcnM7XG4gICAgfVxuXG4gICAgcHVibGljIGhpZ2hsaWdodChyZSkge1xuICAgICAgICBpZiAoIXRoaXMuJHNlYXJjaEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIGhpZ2hsaWdodCA9IG5ldyBTZWFyY2hIaWdobGlnaHQobnVsbCwgXCJhY2Vfc2VsZWN0ZWQtd29yZFwiLCBcInRleHRcIik7XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQgPSB0aGlzLmFkZER5bmFtaWNNYXJrZXIoaGlnaGxpZ2h0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQuc2V0UmVnZXhwKHJlKTtcbiAgICB9XG5cbiAgICAvLyBleHBlcmltZW50YWxcbiAgICBwcml2YXRlIGhpZ2hsaWdodExpbmVzKHN0YXJ0Um93LCBlbmRSb3csIGNsYXp6LCBpbkZyb250KSB7XG4gICAgICAgIGlmICh0eXBlb2YgZW5kUm93ICE9IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgIGNsYXp6ID0gZW5kUm93O1xuICAgICAgICAgICAgZW5kUm93ID0gc3RhcnRSb3c7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjbGF6eilcbiAgICAgICAgICAgIGNsYXp6ID0gXCJhY2Vfc3RlcFwiO1xuXG4gICAgICAgIHZhciByYW5nZTogYW55ID0gbmV3IFJhbmdlKHN0YXJ0Um93LCAwLCBlbmRSb3csIEluZmluaXR5KTtcbiAgICAgICAgcmFuZ2UuaWQgPSB0aGlzLmFkZE1hcmtlcihyYW5nZSwgY2xhenosIFwiZnVsbExpbmVcIiwgaW5Gcm9udCk7XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEVycm9yOlxuICAgICAqICB7XG4gICAgICogICAgcm93OiAxMixcbiAgICAgKiAgICBjb2x1bW46IDIsIC8vY2FuIGJlIHVuZGVmaW5lZFxuICAgICAqICAgIHRleHQ6IFwiTWlzc2luZyBhcmd1bWVudFwiLFxuICAgICAqICAgIHR5cGU6IFwiZXJyb3JcIiAvLyBvciBcIndhcm5pbmdcIiBvciBcImluZm9cIlxuICAgICAqICB9XG4gICAgICovXG4gICAgLyoqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBmdW5jdGlvbnMgZW1pdHMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQSBsaXN0IG9mIGFubm90YXRpb25zXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucykge1xuICAgICAgICB0aGlzLiRhbm5vdGF0aW9ucyA9IGFubm90YXRpb25zO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFubm90YXRpb25zIHx8IFtdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFycyBhbGwgdGhlIGFubm90YXRpb25zIGZvciB0aGlzIHNlc3Npb24uXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIHRyaWdnZXJzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAgKiBUaGlzIGlzIGNhbGxlZCBieSB0aGUgbGFuZ3VhZ2UgbW9kZXMgd2hlbiB0aGUgd29ya2VyIHRlcm1pbmF0ZXMuXG4gICAgICovXG4gICAgcHVibGljIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IHRleHQubWF0Y2goL14uKj8oXFxyP1xcbikvbSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBtYXRjaFsxXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gXCJcXG5cIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdGFydGluZyByb3cgYW5kIGNvbHVtbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgYFJhbmdlYCBvZiB0aGUgZmlyc3Qgd29yZCBib3VuZGFyeSBpdCBmaW5kcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHZhciBsaW5lOiBzdHJpbmcgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgICAgICB2YXIgaW5Ub2tlbiA9IGZhbHNlO1xuICAgICAgICBpZiAoY29sdW1uID4gMClcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbiAtIDEpLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKCFpblRva2VuKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmIChpblRva2VuKVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy50b2tlblJlO1xuICAgICAgICBlbHNlIGlmICgvXlxccyskLy50ZXN0KGxpbmUuc2xpY2UoY29sdW1uIC0gMSwgY29sdW1uICsgMSkpKVxuICAgICAgICAgICAgdmFyIHJlID0gL1xccy87XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMubm9uVG9rZW5SZTtcblxuICAgICAgICB2YXIgc3RhcnQgPSBjb2x1bW47XG4gICAgICAgIGlmIChzdGFydCA+IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBzdGFydC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKHN0YXJ0ID49IDAgJiYgbGluZS5jaGFyQXQoc3RhcnQpLm1hdGNoKHJlKSk7XG4gICAgICAgICAgICBzdGFydCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVuZCA9IGNvbHVtbjtcbiAgICAgICAgd2hpbGUgKGVuZCA8IGxpbmUubGVuZ3RoICYmIGxpbmUuY2hhckF0KGVuZCkubWF0Y2gocmUpKSB7XG4gICAgICAgICAgICBlbmQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgUmFuZ2Uocm93LCBzdGFydCwgcm93LCBlbmQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2V0cyB0aGUgcmFuZ2Ugb2YgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICpcbiAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRBV29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgICAgICB2YXIgd29yZFJhbmdlID0gdGhpcy5nZXRXb3JkUmFuZ2Uocm93LCBjb2x1bW4pO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZSh3b3JkUmFuZ2UuZW5kLnJvdyk7XG5cbiAgICAgICAgd2hpbGUgKGxpbmUuY2hhckF0KHdvcmRSYW5nZS5lbmQuY29sdW1uKS5tYXRjaCgvWyBcXHRdLykpIHtcbiAgICAgICAgICAgIHdvcmRSYW5nZS5lbmQuY29sdW1uICs9IDE7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gd29yZFJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogezpFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5kZXNjfVxuICAgICogQHBhcmFtIHtTdHJpbmd9IG5ld0xpbmVNb2RlIHs6RWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGUucGFyYW19XG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnNldE5ld0xpbmVNb2RlXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IG5ldyBsaW5lIG1vZGUuXG4gICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIGdldE5ld0xpbmVNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TmV3TGluZU1vZGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElkZW50aWZpZXMgaWYgeW91IHdhbnQgdG8gdXNlIGEgd29ya2VyIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV29ya2VyIFNldCB0byBgdHJ1ZWAgdG8gdXNlIGEgd29ya2VyXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlV29ya2VyKHVzZVdvcmtlcikgeyB0aGlzLnNldE9wdGlvbihcInVzZVdvcmtlclwiLCB1c2VXb3JrZXIpOyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHdvcmtlcnMgYXJlIGJlaW5nIHVzZWQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRVc2VXb3JrZXIoKSB7IHJldHVybiB0aGlzLiR1c2VXb3JrZXI7IH1cblxuICAgIC8qKlxuICAgICogUmVsb2FkcyBhbGwgdGhlIHRva2VucyBvbiB0aGUgY3VycmVudCBzZXNzaW9uLiBUaGlzIGZ1bmN0aW9uIGNhbGxzIFtbQmFja2dyb3VuZFRva2VuaXplci5zdGFydCBgQmFja2dyb3VuZFRva2VuaXplci5zdGFydCAoKWBdXSB0byBhbGwgdGhlIHJvd3M7IGl0IGFsc28gZW1pdHMgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBvblJlbG9hZFRva2VuaXplcihlKSB7XG4gICAgICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KHJvd3MuZmlyc3QpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBuZXcgdGV4dCBtb2RlIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VNb2RlJ2AgZXZlbnQuIElmIGEgW1tCYWNrZ3JvdW5kVG9rZW5pemVyIGBCYWNrZ3JvdW5kVG9rZW5pemVyYF1dIGlzIHNldCwgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQgaXMgYWxzbyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtUZXh0TW9kZX0gbW9kZSBTZXQgYSBuZXcgdGV4dCBtb2RlXG4gICAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldE1vZGUobW9kZSwgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgaWYgKG1vZGUgJiYgdHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChtb2RlLmdldFRva2VuaXplcikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUobW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IG1vZGU7XG4gICAgICAgICAgICB2YXIgcGF0aCA9IG9wdGlvbnMucGF0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHBhdGggPSBtb2RlIHx8IFwiYWNlL21vZGUvdGV4dFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcyBpcyBuZWVkZWQgaWYgYWNlIGlzbid0IG9uIHJlcXVpcmUgcGF0aCAoZS5nIHRlc3RzIGluIG5vZGUpXG4gICAgICAgIGlmICghdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgTW9kZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBsb2FkIG9uIGRlbWFuZFxuICAgICAgICB0aGlzLiRtb2RlSWQgPSBwYXRoO1xuICAgICAgICBsb2FkTW9kdWxlKFtcIm1vZGVcIiwgcGF0aF0sIGZ1bmN0aW9uKG06IGFueSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJG1vZGVJZCAhPT0gcGF0aClcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRtb2Rlc1twYXRoXSAmJiAhb3B0aW9ucylcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgICAgICAgIGlmIChtICYmIG0uTW9kZSkge1xuICAgICAgICAgICAgICAgIG0gPSBuZXcgbS5Nb2RlKG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2Rlc1twYXRoXSA9IG07XG4gICAgICAgICAgICAgICAgICAgIG0uJGlkID0gcGF0aDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKG0pO1xuICAgICAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gc2V0IG1vZGUgdG8gdGV4dCB1bnRpbCBsb2FkaW5nIGlzIGZpbmlzaGVkXG4gICAgICAgIGlmICghdGhpcy4kbW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGUobW9kZTogTW9kZSwgJGlzUGxhY2Vob2xkZXI/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVJZCA9IG1vZGUuJGlkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvLiBCZSBpZGVtcG90ZW50LlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICAgICAgLy8gVE9ETzogV291bGRuJ3QgaXQgbWFrZSBtb3JlIHNlbnNlIHRvIHN0b3AgdGhlIHdvcmtlciwgdGhlbiBjaGFuZ2UgdGhlIG1vZGU/XG4gICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VuaXplciA9IG1vZGUuZ2V0VG9rZW5pemVyKCk7XG5cbiAgICAgICAgaWYgKHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplciA9IG5ldyBCYWNrZ3JvdW5kVG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5hZGRFdmVudExpc3RlbmVyKFwidXBkYXRlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuXG4gICAgICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICAgICAgdGhpcy5ub25Ub2tlblJlID0gbW9kZS5ub25Ub2tlblJlO1xuXG5cbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kb3B0aW9ucy53cmFwTWV0aG9kLnNldC5jYWxsKHRoaXMsIHRoaXMuJHdyYXBNZXRob2QpO1xuICAgICAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlLmZvbGRpbmdSdWxlcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZU1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHN0b3BXb3JrZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLiR3b3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR3b3JrZXIgPSBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHN0YXJ0V29ya2VyKCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gdGhpcy4kbW9kZS5jcmVhdGVXb3JrZXIodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGV4dCBtb2RlLlxuICAgICogQHJldHVybnMge1RleHRNb2RlfSBUaGUgY3VycmVudCB0ZXh0IG1vZGVcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vZGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUaGlzIGZ1bmN0aW9uIHNldHMgdGhlIHNjcm9sbCB0b3AgdmFsdWUuIEl0IGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Nyb2xsVG9wJ2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG4gICAgICAgIC8vIFRPRE86IHNob3VsZCB3ZSBmb3JjZSBpbnRlZ2VyIGxpbmVoZWlnaHQgaW5zdGVhZD8gc2Nyb2xsVG9wID0gTWF0aC5yb3VuZChzY3JvbGxUb3ApOyBcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbFRvcCA9PT0gc2Nyb2xsVG9wIHx8IGlzTmFOKHNjcm9sbFRvcCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRzY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbFRvcFwiLCBzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBhbmQgdGhlIHRvcG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2Nyb2xsVG9wKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsVG9wO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1NldHMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5zZXRTY3JvbGxMZWZ0fVxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcikge1xuICAgICAgICAvLyBzY3JvbGxMZWZ0ID0gTWF0aC5yb3VuZChzY3JvbGxMZWZ0KTtcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbExlZnQgPT09IHNjcm9sbExlZnQgfHwgaXNOYU4oc2Nyb2xsTGVmdCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbExlZnRcIiwgc2Nyb2xsTGVmdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsTGVmdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSBzY3JlZW4uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRjb21wdXRlV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICAgIH1cblxuICAgIHByaXZhdGUgZ2V0TGluZVdpZGdldE1heFdpZHRoKCkge1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0c1dpZHRoICE9IG51bGwpIHJldHVybiB0aGlzLmxpbmVXaWRnZXRzV2lkdGg7XG4gICAgICAgIHZhciB3aWR0aCA9IDA7XG4gICAgICAgIHRoaXMubGluZVdpZGdldHMuZm9yRWFjaChmdW5jdGlvbih3KSB7XG4gICAgICAgICAgICBpZiAodyAmJiB3LnNjcmVlbldpZHRoID4gd2lkdGgpXG4gICAgICAgICAgICAgICAgd2lkdGggPSB3LnNjcmVlbldpZHRoO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGluZVdpZGdldFdpZHRoID0gd2lkdGg7XG4gICAgfVxuXG4gICAgcHVibGljICRjb21wdXRlV2lkdGgoZm9yY2U/KSB7XG4gICAgICAgIGlmICh0aGlzLiRtb2RpZmllZCB8fCBmb3JjZSkge1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoID0gdGhpcy4kd3JhcExpbWl0O1xuXG4gICAgICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICAgICAgdmFyIGNhY2hlID0gdGhpcy4kcm93TGVuZ3RoQ2FjaGU7XG4gICAgICAgICAgICB2YXIgbG9uZ2VzdFNjcmVlbkxpbmUgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRJbmRleCA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXhdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB2YXIgbGVuID0gbGluZXMubGVuZ3RoO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaSA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSA+PSBsZW4pXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID09IG51bGwpXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlW2ldID4gbG9uZ2VzdFNjcmVlbkxpbmUpXG4gICAgICAgICAgICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgdmVyYmF0aW0gY29weSBvZiB0aGUgZ2l2ZW4gbGluZSBhcyBpdCBpcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtbU3RyaW5nXX1cbiAgICAgKlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiByb3dzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkVkaXRvckRvY3VtZW50LmdldFRleHRSYW5nZS5kZXNjfVxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSB0byB3b3JrIHdpdGhcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UgfHwgdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBhIGJsb2NrIG9mIGB0ZXh0YCBhbmQgdGhlIGluZGljYXRlZCBgcG9zaXRpb25gLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24ge3JvdywgY29sdW1ufSB0byBzdGFydCBpbnNlcnRpbmcgYXRcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIGNodW5rIG9mIHRleHQgdG8gaW5zZXJ0XG4gICAgICogQHJldHVybnMge09iamVjdH0gVGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IGxpbmUgb2YgYHRleHRgLiBJZiB0aGUgbGVuZ3RoIG9mIGB0ZXh0YCBpcyAwLCB0aGlzIGZ1bmN0aW9uIHNpbXBseSByZXR1cm5zIGBwb3NpdGlvbmAuXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBwdWJsaWMgaW5zZXJ0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmluc2VydChwb3NpdGlvbiwgdGV4dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgYHJhbmdlYCBmcm9tIHRoZSBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZW1vdmVcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgbmV3IGBzdGFydGAgcHJvcGVydHkgb2YgdGhlIHJhbmdlLCB3aGljaCBjb250YWlucyBgc3RhcnRSb3dgIGFuZCBgc3RhcnRDb2x1bW5gLiBJZiBgcmFuZ2VgIGlzIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIHVubW9kaWZpZWQgdmFsdWUgb2YgYHJhbmdlLnN0YXJ0YC5cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnJlbW92ZVxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmUocmFuZ2UpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3QgW0lmIGB0cnVlYCwgZG9lc24ndCBzZWxlY3QgdGhlIHJhbmdlIG9mIHdoZXJlIHRoZSBjaGFuZ2Ugb2NjdXJlZF17OiAjZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IGRlbHRhcy5sZW5ndGggLSAxOyBpICE9IC0xOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb2MucmV2ZXJ0RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCB0cnVlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsdGEuZGVsdGFzLmZvckVhY2goZnVuY3Rpb24oZm9sZERlbHRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZHMoZm9sZERlbHRhLmZvbGRzKTtcbiAgICAgICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlLWltcGxlbWVudHMgYSBwcmV2aW91c2x5IHVuZG9uZSBjaGFuZ2UgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkZWx0YXMgQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCB7OmRvbnRTZWxlY3R9XG4gICAgICpcbiAgICAqXG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyByZWRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLmFwcGx5RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCBmYWxzZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cmVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlIElmIGB0cnVlYCwgc2VsZWN0cyB0aGUgcmFuZ2Ugb2YgdGhlIHJlaW5zZXJ0ZWQgY2hhbmdlXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VW5kb1NlbGVjdChlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCA9IGVuYWJsZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhczogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH1bXSwgaXNVbmRvOiBib29sZWFuLCBsYXN0VW5kb1JhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgZnVuY3Rpb24gaXNJbnNlcnQoZGVsdGE6IHsgYWN0aW9uOiBzdHJpbmcgfSkge1xuICAgICAgICAgICAgdmFyIGluc2VydCA9IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09PSBcImluc2VydExpbmVzXCI7XG4gICAgICAgICAgICByZXR1cm4gaXNVbmRvID8gIWluc2VydCA6IGluc2VydDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkZWx0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gPSBkZWx0YXNbMF07XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2U7XG4gICAgICAgIHZhciBwb2ludDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgdmFyIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgIGlmIChpc0luc2VydChkZWx0YSkpIHtcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2UuZW5kKTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChpc0luc2VydChkZWx0YSkpIHtcbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQoZGVsdGEucmFuZ2Uuc3RhcnQucm93LCBkZWx0YS5yYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGRlbHRhLnJhbmdlLmVuZC5yb3csIGRlbHRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGlzIHJhbmdlIGFuZCB0aGUgbGFzdCB1bmRvIHJhbmdlIGhhcyBzb21ldGhpbmcgaW4gY29tbW9uLlxuICAgICAgICAvLyBJZiB0cnVlLCBtZXJnZSB0aGUgcmFuZ2VzLlxuICAgICAgICBpZiAobGFzdFVuZG9SYW5nZSAhPSBudWxsKSB7XG4gICAgICAgICAgICBpZiAoUmFuZ2UuY29tcGFyZVBvaW50cyhsYXN0VW5kb1JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydCkgPT09IDApIHtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UuZW5kLmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY21wID0gbGFzdFVuZG9SYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGxhc3RVbmRvUmFuZ2Uuc3RhcnQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGxhc3RVbmRvUmFuZ2UuZW5kLnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVwbGFjZXMgYSByYW5nZSBpbiB0aGUgZG9jdW1lbnQgd2l0aCB0aGUgbmV3IGB0ZXh0YC5cbiAgICAqXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZXBsYWNlXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgbmV3IHRleHQgdG8gdXNlIGFzIGEgcmVwbGFjZW1lbnRcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IEFuIG9iamVjdCBjb250YWluaW5nIHRoZSBmaW5hbCByb3cgYW5kIGNvbHVtbiwgbGlrZSB0aGlzOlxuICAgICogYGBgXG4gICAgKiB7cm93OiBlbmRSb3csIGNvbHVtbjogMH1cbiAgICAqIGBgYFxuICAgICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICAgKiBJZiB0aGUgdGV4dCBpcyB0aGUgZXhhY3Qgc2FtZSBhcyB3aGF0IGN1cnJlbnRseSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgY3VycmVudCBgcmFuZ2UuZW5kYCB2YWx1ZS5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnJlcGxhY2VcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZXBsYWNlKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogIGBgYGpzb25cbiAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogIGBgYFxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IGZyb21SYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRvUG9zaXRpb24gVGhlIGxvY2F0aW9uIChyb3cgYW5kIGNvbHVtbikgd2hlcmUgeW91IHdhbnQgdG8gbW92ZSB0aGUgdGV4dCB0b1xuICAgICAqIEByZXR1cm5zIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIG1vdmVUZXh0KGZyb21SYW5nZSwgdG9Qb3NpdGlvbiwgY29weSkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciByb3dEaWZmOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICAgICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgICAgICBpZiAoIWNvcHkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZyb21SYW5nZSk7XG4gICAgICAgICAgICByb3dEaWZmID0gZnJvbVJhbmdlLnN0YXJ0LnJvdyAtIGZyb21SYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgY29sRGlmZiA9IHJvd0RpZmYgPyAtZnJvbVJhbmdlLmVuZC5jb2x1bW4gOiBmcm9tUmFuZ2Uuc3RhcnQuY29sdW1uIC0gZnJvbVJhbmdlLmVuZC5jb2x1bW47XG4gICAgICAgICAgICBpZiAoY29sRGlmZikge1xuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICB0b1JhbmdlLnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKHguc3RhcnQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICB4LmVuZC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0b1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAgICpcbiAgICAqIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBlbmRSb3cgRW5kaW5nIHJvd1xuICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdywgZW5kUm93LCBpbmRlbnRTdHJpbmcpIHtcbiAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8PSBlbmRSb3c7IHJvdysrKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnQoeyByb3c6IHJvdywgY29sdW1uOiAwIH0sIGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBPdXRkZW50cyBhbGwgdGhlIHJvd3MgZGVmaW5lZCBieSB0aGUgYHN0YXJ0YCBhbmQgYGVuZGAgcHJvcGVydGllcyBvZiBgcmFuZ2VgLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSByYW5nZSBvZiByb3dzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd1JhbmdlLnN0YXJ0LnJvdzsgaSA8PSByb3dSYW5nZS5lbmQucm93OyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKGkpO1xuXG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNpemU7ICsrailcbiAgICAgICAgICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGlmIChqIDwgc2l6ZSAmJiBsaW5lLmNoYXJBdChqKSA9PSAnXFx0Jykge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGogKyAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkbW92ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZGlyOiBudW1iZXIpIHtcbiAgICAgICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IDApIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgICAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGluZXMgPSBkaXIgPT0gMFxuICAgICAgICAgICAgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdylcbiAgICAgICAgICAgIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB0aGlzLmRvYy5pbnNlcnRMaW5lcyhmaXJzdFJvdyArIGRpZmYsIGxpbmVzKTtcbiAgICAgICAgZm9sZHMubGVuZ3RoICYmIHRoaXMuYWRkRm9sZHMoZm9sZHMpO1xuICAgICAgICByZXR1cm4gZGlmZjtcbiAgICB9XG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIHVwXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgdXBcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBtb3ZlTGluZXNVcChmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgZG93biBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgZG93blxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEdXBsaWNhdGVzIGFsbCB0aGUgdGV4dCBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IFJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBkdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAwKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBSb3dUb0RvY3VtZW50KHJvdykge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4ocm93LCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRjbGlwQ29sdW1uVG9Sb3cocm93LCBjb2x1bW4pIHtcbiAgICAgICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgcmV0dXJuIE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3cgPCAwKSB7XG4gICAgICAgICAgICByb3cgPSAwO1xuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gbGVuIC0gMTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbiAtIDEpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm93OiByb3csXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkY2xpcFJhbmdlVG9Eb2N1bWVudChyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCAwKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSAwO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgPiBsZW4pIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBsZW47XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4pLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHdoZXRoZXIgb3Igbm90IGxpbmUgd3JhcHBpbmcgaXMgZW5hYmxlZC4gSWYgYHVzZVdyYXBNb2RlYCBpcyBkaWZmZXJlbnQgdGhhbiB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV3JhcE1vZGUgRW5hYmxlIChvciBkaXNhYmxlKSB3cmFwIG1vZGVcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdyYXBNb2RlKHVzZVdyYXBNb2RlOiBib29sZWFuKSB7XG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAhPSB0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kdXNlV3JhcE1vZGUgPSB1c2VXcmFwTW9kZTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG5cbiAgICAgICAgICAgIC8vIElmIHdyYXBNb2RlIGlzIGFjdGl2YWVkLCB0aGUgd3JhcERhdGEgYXJyYXkgaGFzIHRvIGJlIGluaXRpYWxpemVkLlxuICAgICAgICAgICAgaWYgKHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBBcnJheTxudW1iZXJbXT4obGVuKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCBsZW4gLSAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHdyYXAgbW9kZSBpcyBiZWluZyB1c2VkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIGdldFVzZVdyYXBNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgfVxuXG4gICAgLy8gQWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gbW92ZSBmcmVlbHkgYmV0d2VlbiBtaW4gYW5kIG1heC4gRWl0aGVyXG4gICAgLy8gcGFyYW1ldGVyIGNhbiBiZSBudWxsIHRvIGFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIGJlIHVuY29uc3RyYWluZWRcbiAgICAvLyBpbiB0aGF0IGRpcmVjdGlvbi4gT3Igc2V0IGJvdGggcGFyYW1ldGVycyB0byB0aGUgc2FtZSBudW1iZXIgdG8gcGluXG4gICAgLy8gdGhlIGxpbWl0IHRvIHRoYXQgdmFsdWUuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYm91bmRhcmllcyBvZiB3cmFwLiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgc2V0V3JhcExpbWl0UmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4gIT09IG1pbiB8fCB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXggIT09IG1heCkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgICAgICAgICAgbWluOiBtaW4sXG4gICAgICAgICAgICAgICAgbWF4OiBtYXhcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSByZWNhbGN1bGF0aW9uIG9mIHRoZSB3cmFwIGxpbWl0XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlc2lyZWRMaW1pdCBUaGUgbmV3IHdyYXAgbGltaXRcbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICpcbiAgICAqIEBwcml2YXRlXG4gICAgKiovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgICAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICAgICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcExpbWl0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbnN0cmFpbldyYXBMaW1pdCh3cmFwTGltaXQ6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG1pbilcbiAgICAgICAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWF4KG1pbiwgd3JhcExpbWl0KTtcblxuICAgICAgICBpZiAobWF4KVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5taW4obWF4LCB3cmFwTGltaXQpO1xuXG4gICAgICAgIHJldHVybiB3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB3cmFwIGxpbWl0LlxuICAgICogQHJldHVybnMge051bWJlcn0gVGhlIHdyYXAgbGltaXQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbGluZSBsZW5ndGggZm9yIHNvZnQgd3JhcCBpbiB0aGUgZWRpdG9yLiBMaW5lcyB3aWxsIGJyZWFrXG4gICAgICogIGF0IGEgbWluaW11bSBvZiB0aGUgZ2l2ZW4gbGVuZ3RoIG1pbnVzIDIwIGNoYXJzIGFuZCBhdCBhIG1heGltdW1cbiAgICAgKiAgb2YgdGhlIGdpdmVuIG51bWJlciBvZiBjaGFycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGltaXQgVGhlIG1heGltdW0gbGluZSBsZW5ndGggaW4gY2hhcnMsIGZvciBzb2Z0IHdyYXBwaW5nIGxpbmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0V3JhcExpbWl0KGxpbWl0KSB7XG4gICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UobGltaXQsIGxpbWl0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IHRoYXQgZGVmaW5lcyB0aGUgbWluaW11bSBhbmQgbWF4aW11bSBvZiB0aGUgd3JhcCBsaW1pdDsgaXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAqXG4gICAgKiAgICAgeyBtaW46IHdyYXBMaW1pdFJhbmdlX21pbiwgbWF4OiB3cmFwTGltaXRSYW5nZV9tYXggfVxuICAgICpcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAgICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgICAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICAgICAgdmFyIGxlbjtcbiAgICAgICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGVuID0gZS5kYXRhLmxpbmVzID8gZS5kYXRhLmxpbmVzLmxlbmd0aCA6IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbiA9IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gdHJ1ZTtcbiAgICAgICAgaWYgKGxlbiAhPSAwKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICB0aGlzW3VzZVdyYXBNb2RlID8gXCIkd3JhcERhdGFcIiA6IFwiJHJvd0xlbmd0aENhY2hlXCJdLnNwbGljZShmaXJzdFJvdywgbGVuKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGVuZC5yb3csIGVuZC5jb2x1bW4sIHN0YXJ0LmNvbHVtbiAtIGVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVCZWZvcmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lQmVmb3JlICYmIGZvbGRMaW5lQmVmb3JlICE9PSBmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmVCZWZvcmUubWVyZ2UoZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZUJlZm9yZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBlbmQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICAgICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMCk7XG4gICAgICAgICAgICAgICAgdmFyIGFyciA9IHVzZVdyYXBNb2RlID8gdGhpcy4kd3JhcERhdGEgOiB0aGlzLiRyb3dMZW5ndGhDYWNoZVxuICAgICAgICAgICAgICAgIGFyci5zcGxpY2UuYXBwbHkoYXJyLCBhcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHNvbWUgbmV3IGxpbmUgaXMgYWRkZWQgaW5zaWRlIG9mIGEgZm9sZExpbmUsIHRoZW4gc3BsaXRcbiAgICAgICAgICAgICAgICAvLyB0aGUgZm9sZCBsaW5lIHVwLlxuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lLnJhbmdlLmNvbXBhcmVJbnNpZGUoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIC8vIEluc2lkZSBvZiB0aGUgZm9sZExpbmUgcmFuZ2UuIE5lZWQgdG8gc3BsaXQgc3R1ZmYgdXAuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChzdGFydC5yb3csIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5mcm9udCBvZiB0aGUgZm9sZExpbmUgYnV0IHNhbWUgcm93LiBOZWVkIHRvIHNoaWZ0IGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90aGluZyB0byBkbyBpZiB0aGUgaW5zZXJ0IGlzIGFmdGVyIHRoZSBmb2xkTGluZS5cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWFsaWduIGZvbGRzLiBFLmcuIGlmIHlvdSBhZGQgc29tZSBuZXcgY2hhcnMgYmVmb3JlIGEgZm9sZCwgdGhlXG4gICAgICAgICAgICAvLyBmb2xkIHNob3VsZCBcIm1vdmVcIiB0byB0aGUgcmlnaHQuXG4gICAgICAgICAgICBsZW4gPSBNYXRoLmFicyhlLmRhdGEucmFuZ2Uuc3RhcnQuY29sdW1uIC0gZS5kYXRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgZm9sZHMgaW4gdGhlIGNoYW5nZSByYW5nZSBhbmQgcmVtb3ZlIHRoZW0uXG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICBsZW4gPSAtbGVuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgc3RhcnQuY29sdW1uLCBsZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICYmIHRoaXMuJHdyYXBEYXRhLmxlbmd0aCAhPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSkge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcImRvYy5nZXRMZW5ndGgoKSBhbmQgJHdyYXBEYXRhLmxlbmd0aCBoYXZlIHRvIGJlIHRoZSBzYW1lIVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IGZhbHNlO1xuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3cpO1xuXG4gICAgICAgIHJldHVybiByZW1vdmVkRm9sZHM7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdywgYj8pIHtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbZmlyc3RSb3ddID0gbnVsbDtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbbGFzdFJvd10gPSBudWxsO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgdmFyIHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIHdyYXBEYXRhID0gdGhpcy4kd3JhcERhdGE7XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgICAgIHZhciB0b2tlbnM7XG4gICAgICAgIHZhciBmb2xkTGluZTtcblxuICAgICAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgICAgIGxhc3RSb3cgPSBNYXRoLm1pbihsYXN0Um93LCBsaW5lcy5sZW5ndGggLSAxKTtcbiAgICAgICAgd2hpbGUgKHJvdyA8PSBsYXN0Um93KSB7XG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhsaW5lc1tyb3ddKTtcbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtyb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBbXTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgd2Fsa1Rva2VuczogbnVtYmVyW107XG4gICAgICAgICAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlciwgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zWzBdID0gUExBQ0VIT0xERVJfU1RBUlQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHdhbGtUb2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zW2ldID0gUExBQ0VIT0xERVJfQk9EWTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzW3Jvd10uc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zID0gdG9rZW5zLmNvbmNhdCh3YWxrVG9rZW5zKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgICAgIGxpbmVzW2ZvbGRMaW5lLmVuZC5yb3ddLmxlbmd0aCArIDFcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgd3JhcERhdGFbZm9sZExpbmUuc3RhcnQucm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbXB1dGVXcmFwU3BsaXRzKHRva2VuczogbnVtYmVyW10sIHdyYXBMaW1pdDogbnVtYmVyLCB0YWJTaXplPzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0b2tlbnMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciBkaXNwbGF5TGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcbiAgICAgICAgdmFyIGxhc3RTcGxpdCA9IDAsIGxhc3REb2NTcGxpdCA9IDA7XG5cbiAgICAgICAgdmFyIGlzQ29kZSA9IHRoaXMuJHdyYXBBc0NvZGU7XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU3BsaXQoc2NyZWVuUG9zOiBudW1iZXIpIHtcbiAgICAgICAgICAgIHZhciBkaXNwbGF5ZWQgPSB0b2tlbnMuc2xpY2UobGFzdFNwbGl0LCBzY3JlZW5Qb3MpO1xuXG4gICAgICAgICAgICAvLyBUaGUgZG9jdW1lbnQgc2l6ZSBpcyB0aGUgY3VycmVudCBzaXplIC0gdGhlIGV4dHJhIHdpZHRoIGZvciB0YWJzXG4gICAgICAgICAgICAvLyBhbmQgbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgdmFyIGxlbiA9IGRpc3BsYXllZC5sZW5ndGg7XG4gICAgICAgICAgICBkaXNwbGF5ZWQuam9pbihcIlwiKS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBUQUJfU1BBQ0VzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzEyL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KS5cbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBDSEFSX0VYVC9tdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxhc3REb2NTcGxpdCArPSBsZW47XG4gICAgICAgICAgICBzcGxpdHMucHVzaChsYXN0RG9jU3BsaXQpO1xuICAgICAgICAgICAgbGFzdFNwbGl0ID0gc2NyZWVuUG9zO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGRpc3BsYXlMZW5ndGggLSBsYXN0U3BsaXQgPiB3cmFwTGltaXQpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMsIHdoZXJlIHRoZSBzcGxpdCBzaG91bGQgYmUuXG4gICAgICAgICAgICB2YXIgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgc3BhY2Ugb3IgdGFiIGF0IHRoaXMgc3BsaXQgcG9zaXRpb24sIHRoZW4gbWFraW5nXG4gICAgICAgICAgICAvLyBhIHNwbGl0IGlzIHNpbXBsZS5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXQgLSAxXSA+PSBTUEFDRSAmJiB0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgLyogZGlzYWJsZWQgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hamF4b3JnL2FjZS9pc3N1ZXMvMTE4NlxuICAgICAgICAgICAgICAgIC8vIEluY2x1ZGUgYWxsIGZvbGxvd2luZyBzcGFjZXMgKyB0YWJzIGluIHRoaXMgc3BsaXQgYXMgd2VsbC5cbiAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdCArKztcbiAgICAgICAgICAgICAgICB9ICovXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHNwbGl0IGlzIGluc2lkZSBvZiBhIHBsYWNlaG9sZGVyLiBQbGFjZWhvbGRlciBhcmVcbiAgICAgICAgICAgIC8vIG5vdCBzcGxpdGFibGUuIFRoZXJlZm9yZSwgc2VlayB0aGUgYmVnaW5uaW5nIG9mIHRoZSBwbGFjZWhvbGRlclxuICAgICAgICAgICAgLy8gYW5kIHRyeSB0byBwbGFjZSB0aGUgc3BsaXQgYmVvZnJlIHRoZSBwbGFjZWhvbGRlcidzIHN0YXJ0LlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQgfHwgdG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgLy8gU2VlayB0aGUgc3RhcnQgb2YgdGhlIHBsYWNlaG9sZGVyIGFuZCBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICAvLyBiZWZvcmUgdGhlIHBsYWNlaG9sZGVyLiBCeSBkZWZpbml0aW9uIHRoZXJlIGFsd2F5c1xuICAgICAgICAgICAgICAgIC8vIGEgUExBQ0VIT0xERVJfU1RBUlQgYmV0d2VlbiBzcGxpdCBhbmQgbGFzdFNwbGl0LlxuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0ICE9IGxhc3RTcGxpdCAtIDE7IHNwbGl0LS0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNwbGl0Kys7IDw8IE5vIGluY3JlbWVudGFsIGhlcmUgYXMgd2Ugd2FudCB0b1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gIGhhdmUgdGhlIHBvc2l0aW9uIGJlZm9yZSB0aGUgUGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBpcyBub3QgdGhlIGluZGV4IG9mIHRoZVxuICAgICAgICAgICAgICAgIC8vIGxhc3Qgc3BsaXQsIHRoZW4gd2UgY2FuIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA+IGxhc3RTcGxpdCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBJUyB0aGUgaW5kZXggb2YgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyBzcGxpdCwgdGhlbiB3ZSBoYXZlIHRvIHBsYWNlIHRoZSBzcGxpdCBhZnRlciB0aGVcbiAgICAgICAgICAgICAgICAvLyBwbGFjZWhvbGRlci4gU28sIGxldCdzIHNlZWsgZm9yIHRoZSBlbmQgb2YgdGhlIHBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0IDwgdG9rZW5zLmxlbmd0aDsgc3BsaXQrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSAhPSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIHNwaWx0ID09IHRva2Vucy5sZW5ndGgsIHRoZW4gdGhlIHBsYWNlaG9sZGVyIGlzIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gdGhpbmcgaW4gdGhlIGxpbmUgYW5kIGFkZGluZyBhIG5ldyBzcGxpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UuXG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7ICAvLyBCcmVha3MgdGhlIHdoaWxlLWxvb3AuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRmluYWxseSwgYWRkIHRoZSBzcGxpdC4uLlxuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaXJzdCBub24gc3BhY2UvdGFiL3BsYWNlaG9sZGVyL3B1bmN0dWF0aW9uIHRva2VuIGJhY2t3YXJkcy5cbiAgICAgICAgICAgIHZhciBtaW5TcGxpdCA9IE1hdGgubWF4KHNwbGl0IC0gKGlzQ29kZSA/IDEwIDogd3JhcExpbWl0IC0gKHdyYXBMaW1pdCA+PiAyKSksIGxhc3RTcGxpdCAtIDEpO1xuICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA9PSBQVU5DVFVBVElPTikge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gSWYgd2UgZm91bmQgb25lLCB0aGVuIGFkZCB0aGUgc3BsaXQuXG4gICAgICAgICAgICBpZiAoc3BsaXQgPiBtaW5TcGxpdCkge1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KCsrc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICAgICAgLy8gVGhlIHNwbGl0IGlzIGluc2lkZSBvZiBhIENIQVIgb3IgQ0hBUl9FWFQgdG9rZW4gYW5kIG5vIHNwYWNlXG4gICAgICAgICAgICAvLyBhcm91bmQgLT4gZm9yY2UgYSBzcGxpdC5cbiAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3BsaXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdHJpbmcsIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGRpc3BsYXkgY2hhcmFjdGVycywgaW5jbHVkaW5nIHRhYnMgYW5kIHNwYWNlcy5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBUaGUgdmFsdWUgdG8gc3RhcnQgYXRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGdldERpc3BsYXlUb2tlbnMoc3RyOiBzdHJpbmcsIG9mZnNldD86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgdmFyIGFycjogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIHRhYlNpemU6IG51bWJlcjtcbiAgICAgICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgICAgICAvLyBUYWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICB0YWJTaXplID0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKGFyci5sZW5ndGggKyBvZmZzZXQpO1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQik7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgbiA9IDE7IG4gPCB0YWJTaXplOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCX1NQQUNFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBTcGFjZVxuICAgICAgICAgICAgZWxzZSBpZiAoYyA9PSAzMikge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFNQQUNFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKChjID4gMzkgJiYgYyA8IDQ4KSB8fCAoYyA+IDU3ICYmIGMgPCA2NCkpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChQVU5DVFVBVElPTik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUiwgQ0hBUl9FWFQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goQ0hBUik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFycjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxjdWxhdGVzIHRoZSB3aWR0aCBvZiB0aGUgc3RyaW5nIGBzdHJgIG9uIHRoZSBzY3JlZW4gd2hpbGUgYXNzdW1pbmcgdGhhdCB0aGUgc3RyaW5nIHN0YXJ0cyBhdCB0aGUgZmlyc3QgY29sdW1uIG9uIHRoZSBzY3JlZW4uXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2FsY3VsYXRlIHRoZSBzY3JlZW4gd2lkdGggb2ZcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhTY3JlZW5Db2x1bW5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Db2x1bW5cbiAgICAqIEByZXR1cm5zIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgICAgIHZhciBjOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICAgICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAgICAgICAvLyB0YWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIG51bWJlciBvZiBzY3JlZW5yb3dzIGluIGEgd3JhcHBlZCBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAgICpcbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFJvd0xlbmd0aChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVXaWRnZXRzW3Jvd10gJiYgdGhpcy5saW5lV2lkZ2V0c1tyb3ddLnJvd0NvdW50IHx8IDA7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGggPSAwXG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxICsgaDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDEgKyBoO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRSb3dMaW5lQ291bnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Um93V3JhcEluZGVudChzY3JlZW5Sb3c6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Bvcy5yb3ddO1xuICAgICAgICAgICAgLy8gRklYTUU6IGluZGVudCBkb2VzIG5vdCBleGlzdHMgb24gbnVtYmVyW11cbiAgICAgICAgICAgIHJldHVybiBzcGxpdHMubGVuZ3RoICYmIHNwbGl0c1swXSA8IHBvcy5jb2x1bW4gPyBzcGxpdHNbJ2luZGVudCddIDogMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gKG9uIHNjcmVlbikgZm9yIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgcHJvdmlkZWQgc2NyZWVuIHJvdy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGxhc3Qgc2NyZWVuIHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBkb2N1bWVudCBwb3NpdGlvbiBvZiB0aGUgbGFzdCByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pIHtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUgLyAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIHJvdywgdGhpcyByZXR1cm5zIHRoZSBzcGxpdCBkYXRhLlxuICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0Um93U3BsaXREYXRhKHJvdzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgdG8gdGhlIG5leHQgdGFiIHN0b3AgYXQgdGhlIHNwZWNpZmllZCBzY3JlZW4gY29sdW1uLlxuICAgICAqIEBtZXRob3MgZ2V0U2NyZWVuVGFiU2l6ZVxuICAgICAqIEBwYXJhbSBzY3JlZW5Db2x1bW4ge251bWJlcn0gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZSAtIHNjcmVlbkNvbHVtbiAlIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG5cbiAgICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFJvdyhzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLnJvdztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgc2NyZWVuVG9Eb2N1bWVudENvbHVtbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIENvbnZlcnRzIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgb24gdGhlIHNjcmVlbiB0byBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIHdpdGhpbiB0aGUgZG9jdW1lbnQuIFtUaGlzIHRha2VzIGludG8gYWNjb3VudCBjb2RlIGZvbGRpbmcsIHdvcmQgd3JhcCwgdGFiIHNpemUsIGFuZCBhbnkgb3RoZXIgdmlzdWFsIG1vZGlmaWNhdGlvbnMuXXs6ICNjb252ZXJzaW9uQ29uc2lkZXJhdGlvbnN9XG4gICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuQ29sdW1uIFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICoqL1xuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGlmIChzY3JlZW5Sb3cgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyByb3c6IDAsIGNvbHVtbjogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIHZhciBkb2NSb3cgPSAwO1xuICAgICAgICB2YXIgZG9jQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIGNvbHVtbjtcbiAgICAgICAgdmFyIHJvdyA9IDA7XG4gICAgICAgIHZhciByb3dMZW5ndGggPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJHNjcmVlblJvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIHNjcmVlblJvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb2NSb3cgPSB0aGlzLiRkb2NSb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gc2NyZWVuUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYXhSb3cgPSB0aGlzLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8PSBzY3JlZW5Sb3cpIHtcbiAgICAgICAgICAgIHJvd0xlbmd0aCA9IHRoaXMuZ2V0Um93TGVuZ3RoKGRvY1Jvdyk7XG4gICAgICAgICAgICBpZiAocm93ICsgcm93TGVuZ3RoID4gc2NyZWVuUm93IHx8IGRvY1JvdyA+PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93ICs9IHJvd0xlbmd0aDtcbiAgICAgICAgICAgICAgICBkb2NSb3crKztcbiAgICAgICAgICAgICAgICBpZiAoZG9jUm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKGRvY1Jvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cpIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSk7XG4gICAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH0gZWxzZSBpZiAocm93ICsgcm93TGVuZ3RoIDw9IHNjcmVlblJvdyB8fCBkb2NSb3cgPiBtYXhSb3cpIHtcbiAgICAgICAgICAgIC8vIGNsaXAgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcm93OiBtYXhSb3csXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldExpbmUobWF4Um93KS5sZW5ndGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KTtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW2RvY1Jvd107XG4gICAgICAgICAgICBpZiAoc3BsaXRzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0SW5kZXggPSBNYXRoLmZsb29yKHNjcmVlblJvdyAtIHJvdyk7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChzcGxpdEluZGV4ID4gMCAmJiBzcGxpdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY0NvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4IC0gMV0gfHwgc3BsaXRzW3NwbGl0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyaW5nKGRvY0NvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZG9jQ29sdW1uICs9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmUsIHNjcmVlbkNvbHVtbilbMV07XG5cbiAgICAgICAgLy8gV2UgcmVtb3ZlIG9uZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCBzbyB0aGF0IHRoZSBkb2NDb2x1bW5cbiAgICAgICAgLy8gcG9zaXRpb24gcmV0dXJuZWQgaXMgbm90IGFzc29jaWF0ZWQgdG8gdGhlIG5leHQgcm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSAmJiBkb2NDb2x1bW4gPj0gY29sdW1uKVxuICAgICAgICAgICAgZG9jQ29sdW1uID0gY29sdW1uIC0gMTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gZm9sZExpbmUuaWR4VG9Qb3NpdGlvbihkb2NDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogZG9jUm93LCBjb2x1bW46IGRvY0NvbHVtbiB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgZG9jdW1lbnQgY29vcmRpbmF0ZXMgdG8gc2NyZWVuIGNvb3JkaW5hdGVzLiB7OmNvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3cgVGhlIGRvY3VtZW50IHJvdyB0byBjaGVja1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHRvIGNoZWNrXG4gICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGJ5IHRoaXMgbWV0aG9kIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvblxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cy5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2NDb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93Wydyb3cnXSwgZG9jUm93Wydjb2x1bW4nXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuXG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSAwO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0Um93ID0gbnVsbDtcbiAgICAgICAgdmFyIGZvbGQgPSBudWxsO1xuXG4gICAgICAgIC8vIENsYW1wIHRoZSBkb2NSb3cgcG9zaXRpb24gaW4gY2FzZSBpdCdzIGluc2lkZSBvZiBhIGZvbGRlZCBibG9jay5cbiAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGRvY1JvdywgZG9jQ29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jQ29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcm93RW5kLCByb3cgPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJGRvY1Jvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIGRvY1Jvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gZG9jUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlIChyb3cgPCBkb2NSb3cpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgaWYgKHJvd0VuZCA+IGRvY1JvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3dFbmQsIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gcm93ICsgMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2NyZWVuUm93ICs9IHRoaXMuZ2V0Um93TGVuZ3RoKHJvdyk7XG4gICAgICAgICAgICByb3cgPSByb3dFbmQ7XG5cbiAgICAgICAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2goc2NyZWVuUm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgdGV4dCBsaW5lIHRoYXQgaXMgZGlzcGxheWVkIGluIGRvY1JvdyBvbiB0aGUgc2NyZWVuLlxuICAgICAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmluYWwgcm93IHdlIHdhbnQgdG8gcmVhY2ggaXMgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUsIGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdykuc3Vic3RyaW5nKDAsIGRvY0NvbHVtbik7XG4gICAgICAgICAgICBmb2xkU3RhcnRSb3cgPSBkb2NSb3c7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2xhbXAgdGV4dExpbmUgaWYgaW4gd3JhcE1vZGUuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHdyYXBSb3cgPSB0aGlzLiR3cmFwRGF0YVtmb2xkU3RhcnRSb3ddO1xuICAgICAgICAgICAgaWYgKHdyYXBSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAodGV4dExpbmUubGVuZ3RoID49IHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0XSkge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3crKztcbiAgICAgICAgICAgICAgICAgICAgc2NyZWVuUm93T2Zmc2V0Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHRMaW5lID0gdGV4dExpbmUuc3Vic3RyaW5nKHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0IC0gMV0gfHwgMCwgdGV4dExpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHNjcmVlblJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodGV4dExpbmUpWzBdXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Db2x1bW4oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5jb2x1bW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikucm93O1xuICAgIH1cblxuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUmFuZ2UocmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICB2YXIgc2NyZWVuUG9zU3RhcnQgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIHZhciBzY3JlZW5Qb3NFbmQgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyYW5nZS5lbmQucm93LCByYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShzY3JlZW5Qb3NTdGFydC5yb3csIHNjcmVlblBvc1N0YXJ0LmNvbHVtbiwgc2NyZWVuUG9zRW5kLnJvdywgc2NyZWVuUG9zRW5kLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbkxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiR3cmFwRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgcm93ID0gMCwgaSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgICAgIHdoaWxlIChyb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kb1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JlZW5Sb3dzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhmbTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgLy8gVE9ETz9cbiAgICB9XG5cbiAgICBmaW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBjaHI/OiBzdHJpbmcpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb24sIGNocik7XG4gICAgfVxuXG4gICAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAkZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICAkZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG4gICAgcHJpdmF0ZSAkZm9sZE1vZGU7XG5cbiAgICAvLyBzdHJ1Y3R1cmVkIGZvbGRpbmdcbiAgICAkZm9sZFN0eWxlcyA9IHtcbiAgICAgICAgXCJtYW51YWxcIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICAgIH1cbiAgICAkZm9sZFN0eWxlID0gXCJtYXJrYmVnaW5cIjtcbiAgICAvKlxuICAgICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICAgKiAgIC0xOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuc3RhcnQgPSByb3cvY29sdW1uXG4gICAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICAgKi9cbiAgICBnZXRGb2xkQXQocm93OiBudW1iZXIsIGNvbHVtbiwgc2lkZT8pIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbaV07XG4gICAgICAgICAgICBpZiAoZm9sZC5yYW5nZS5jb250YWlucyhyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2lkZSA9PSAxICYmIGZvbGQucmFuZ2UuaXNFbmQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PSAtMSAmJiBmb2xkLnJhbmdlLmlzU3RhcnQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGdpdmVuIHJhbmdlLiBOb3RlLCB0aGF0IHRoaXMgd2lsbCByZXR1cm4gZm9sZHNcbiAgICAgKlxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZShyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSByYW5nZS5lbmQ7XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvdW5kRm9sZHM6IEZvbGRbXSA9IFtdO1xuXG4gICAgICAgIHN0YXJ0LmNvbHVtbiArPSAxO1xuICAgICAgICBlbmQuY29sdW1uIC09IDE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZXNbaV0ucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGJlZm9yZSBmb2xkTGluZS4gTm8gaW50ZXJzZWN0aW9uLiBUaGlzIG1lYW5zLFxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIG90aGVyIGZvbGRMaW5lcyB0aGF0IGludGVyc2VjdC5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGFmdGVyIGZvbGRMaW5lLiBUaGVyZSBjYW4ndCBiZSBhbnkgb3RoZXIgZm9sZExpbmVzIHRoZW4sXG4gICAgICAgICAgICAgICAgLy8gc28gbGV0J3MgZ2l2ZSB1cC5cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmVzW2ldLmZvbGRzO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbal07XG4gICAgICAgICAgICAgICAgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV1RGLXN0YXRlOiBDYW4gaGFwcGVuIGR1ZSB0byAtMS8rMSB0byBzdGFydC9lbmQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDQyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvdW5kRm9sZHMucHVzaChmb2xkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGFydC5jb2x1bW4gLT0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiArPSAxO1xuXG4gICAgICAgIHJldHVybiBmb3VuZEZvbGRzO1xuICAgIH1cblxuICAgIGdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2VzKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHJhbmdlcykpIHtcbiAgICAgICAgICAgIHZhciBmb2xkczogRm9sZFtdID0gW107XG4gICAgICAgICAgICByYW5nZXMuZm9yRWFjaChmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICAgICAgICAgIGZvbGRzID0gZm9sZHMuY29uY2F0KHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBkb2N1bWVudFxuICAgICAqL1xuICAgIGdldEFsbEZvbGRzKCkge1xuICAgICAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgZm9sZHMucHVzaChmb2xkTGluZXNbaV0uZm9sZHNbal0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvfGxkPndvbHJkIC0+IDxudWxsPlxuICAgICAqXG4gICAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgICAqXG4gICAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAgICpcbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC10cmltPSsxPiBcInJsZFwiXG4gICAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgICAqL1xuICAgIGdldEZvbGRTdHJpbmdBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHRyaW06IG51bWJlciwgZm9sZExpbmU/OiBGb2xkTGluZSkge1xuICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lIHx8IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBsYXN0Rm9sZCA9IHtcbiAgICAgICAgICAgIGVuZDogeyBjb2x1bW46IDAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBUT0RPOiBSZWZhY3RvciB0byB1c2UgZ2V0TmV4dEZvbGRUbyBmdW5jdGlvbi5cbiAgICAgICAgdmFyIHN0cjogc3RyaW5nO1xuICAgICAgICB2YXIgZm9sZDogRm9sZDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZS5mb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9sZCA9IGZvbGRMaW5lLmZvbGRzW2ldO1xuICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGQucmFuZ2UuY29tcGFyZUVuZChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbiwgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0Rm9sZCA9IGZvbGQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzdHIpXG4gICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uKTtcblxuICAgICAgICBpZiAodHJpbSA9PSAtMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKDAsIGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlIGlmICh0cmltID09IDEpXG4gICAgICAgICAgICByZXR1cm4gc3RyLnN1YnN0cmluZyhjb2x1bW4gLSBsYXN0Rm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG5cbiAgICBnZXRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgICAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgICAgICBpZiAoaSA9PSAtMSlcbiAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICBmb3IgKGk7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1JvdyAmJiBmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZm9sZExpbmUuZW5kLnJvdyA+IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgdGhlIGZvbGQgd2hpY2ggc3RhcnRzIGFmdGVyIG9yIGNvbnRhaW5zIGRvY1Jvd1xuICAgIGdldE5leHRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgICAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgICAgICBpZiAoaSA9PSAtMSlcbiAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICBmb3IgKGk7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZGVkUm93Q291bnQoZmlyc3Q6IG51bWJlciwgbGFzdDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciByb3dDb3VudCA9IGxhc3QgLSBmaXJzdCArIDE7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldLFxuICAgICAgICAgICAgICAgIGVuZCA9IGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgc3RhcnQgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgICAgICBpZiAoZW5kID49IGxhc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPCBsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFydCA+PSBmaXJzdClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGxhc3QgLSBzdGFydDtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgPSAwOy8vaW4gb25lIGZvbGRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVuZCA+PSBmaXJzdCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFydCA+PSBmaXJzdCkgLy9mb2xkIGluc2lkZSByYW5nZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBzdGFydDtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIGZpcnN0ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcm93Q291bnQ7XG4gICAgfVxuXG4gICAgJGFkZEZvbGRMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSkge1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS5wdXNoKGZvbGRMaW5lKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5zdGFydC5yb3cgLSBiLnN0YXJ0LnJvdztcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IGZvbGQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuc1xuICAgICAqICAgICAgVGhlIG5ldyBjcmVhdGVkIEZvbGQgb2JqZWN0IG9yIGFuIGV4aXN0aW5nIGZvbGQgb2JqZWN0IGluIGNhc2UgdGhlXG4gICAgICogICAgICBwYXNzZWQgaW4gcmFuZ2UgZml0cyBhbiBleGlzdGluZyBmb2xkIGV4YWN0bHkuXG4gICAgICovXG4gICAgYWRkRm9sZChwbGFjZWhvbGRlcjogc3RyaW5nIHwgRm9sZCwgcmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgYWRkZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG5cbiAgICAgICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgRm9sZClcbiAgICAgICAgICAgIGZvbGQgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb2xkID0gbmV3IEZvbGQocmFuZ2UsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgICAgIGZvbGQuY29sbGFwc2VDaGlsZHJlbiA9IHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW47XG4gICAgICAgIH1cbiAgICAgICAgLy8gRklYTUU6ICRjbGlwUmFuZ2VUb0RvY3VtZW50P1xuICAgICAgICAvLyBmb2xkLnJhbmdlID0gdGhpcy5jbGlwUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgICAgIGZvbGQucmFuZ2UgPSB0aGlzLiRjbGlwUmFuZ2VUb0RvY3VtZW50KGZvbGQucmFuZ2UpXG5cbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgIHZhciBzdGFydENvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB2YXIgZW5kUm93ID0gZm9sZC5lbmQucm93O1xuICAgICAgICB2YXIgZW5kQ29sdW1uID0gZm9sZC5lbmQuY29sdW1uO1xuXG4gICAgICAgIC8vIC0tLSBTb21lIGNoZWNraW5nIC0tLVxuICAgICAgICBpZiAoIShzdGFydFJvdyA8IGVuZFJvdyB8fFxuICAgICAgICAgICAgc3RhcnRSb3cgPT0gZW5kUm93ICYmIHN0YXJ0Q29sdW1uIDw9IGVuZENvbHVtbiAtIDIpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHJhbmdlIGhhcyB0byBiZSBhdCBsZWFzdCAyIGNoYXJhY3RlcnMgd2lkdGhcIik7XG5cbiAgICAgICAgdmFyIHN0YXJ0Rm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHN0YXJ0Um93LCBzdGFydENvbHVtbiwgMSk7XG4gICAgICAgIHZhciBlbmRGb2xkID0gdGhpcy5nZXRGb2xkQXQoZW5kUm93LCBlbmRDb2x1bW4sIC0xKTtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZCAmJiBlbmRGb2xkID09IHN0YXJ0Rm9sZClcbiAgICAgICAgICAgIHJldHVybiBzdGFydEZvbGQuYWRkU3ViRm9sZChmb2xkKTtcblxuICAgICAgICBpZiAoXG4gICAgICAgICAgICAoc3RhcnRGb2xkICYmICFzdGFydEZvbGQucmFuZ2UuaXNTdGFydChzdGFydFJvdywgc3RhcnRDb2x1bW4pKVxuICAgICAgICAgICAgfHwgKGVuZEZvbGQgJiYgIWVuZEZvbGQucmFuZ2UuaXNFbmQoZW5kUm93LCBlbmRDb2x1bW4pKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkEgZm9sZCBjYW4ndCBpbnRlcnNlY3QgYWxyZWFkeSBleGlzdGluZyBmb2xkXCIgKyBmb2xkLnJhbmdlICsgc3RhcnRGb2xkLnJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBmb2xkcyBpbiB0aGUgcmFuZ2Ugd2UgY3JlYXRlIHRoZSBuZXcgZm9sZCBmb3IuXG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkcyBmcm9tIGZvbGQgZGF0YS5cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMoZm9sZHMpO1xuICAgICAgICAgICAgLy8gQWRkIHRoZSByZW1vdmVkIGZvbGRzIGFzIHN1YmZvbGRzIG9uIHRoZSBuZXcgZm9sZC5cbiAgICAgICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgICAgIGZvbGQuYWRkU3ViRm9sZChzdWJGb2xkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZW5kUm93ID09IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGFydFJvdyA9PSBmb2xkTGluZS5lbmQucm93KSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKCFmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgd2UgbWlnaHQgaGF2ZSB0byBtZXJnZSB0d28gRm9sZExpbmVzLlxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVOZXh0ID0gZm9sZERhdGFbaSArIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmVOZXh0ICYmIGZvbGRMaW5lTmV4dC5zdGFydC5yb3cgPT0gZW5kUm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1lcmdlIVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUubWVyZ2UoZm9sZExpbmVOZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmRSb3cgPD0gZm9sZExpbmUuc3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWFkZGVkKVxuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRhZGRGb2xkTGluZShuZXcgRm9sZExpbmUodGhpcy4kZm9sZERhdGEsIGZvbGQpKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcblxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcImFkZFwiIH0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkO1xuICAgIH1cblxuICAgIHNldE1vZGlmaWVkKG1vZGlmaWVkOiBib29sZWFuKSB7XG5cbiAgICB9XG5cbiAgICBhZGRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICByZW1vdmVGb2xkKGZvbGQ6IEZvbGQpIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZC5mb2xkTGluZTtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZm9sZExpbmUuZW5kLnJvdztcblxuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAvLyBTaW1wbGUgY2FzZSB3aGVyZSB0aGVyZSBpcyBvbmx5IG9uZSBmb2xkIGluIHRoZSBGb2xkTGluZSBzdWNoIHRoYXRcbiAgICAgICAgLy8gdGhlIGVudGlyZSBmb2xkIGxpbmUgY2FuIGdldCByZW1vdmVkIGRpcmVjdGx5LlxuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lcy5zcGxpY2UoZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpLCAxKTtcbiAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgbGFzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNFbmQoZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgZm9sZHMucG9wKCk7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLmNvbHVtbiA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5jb2x1bW47XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGtub3cgdGhlcmUgYXJlIG1vcmUgdGhlbiAyIGZvbGRzIGFuZCB0aGUgZm9sZCBpcyBub3QgYXQgdGhlIGVkZ2UuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWVhbnMsIHRoZSBmb2xkIGlzIHNvbWV3aGVyZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyBpbiBvbmUgcm93LCB3ZSBqdXN0IGNhbiByZW1vdmUgaXQuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNwbGljZShmb2xkcy5pbmRleE9mKGZvbGQpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBmb2xkIGdvZXMgb3ZlciBtb3JlIHRoZW4gb25lIHJvdy4gVGhpcyBtZWFucyByZW12b2luZyB0aGlzIGZvbGRcbiAgICAgICAgICAgICAgICAgICAgLy8gd2lsbCBjYXVzZSB0aGUgZm9sZCBsaW5lIHRvIGdldCBzcGxpdHRlZCB1cC4gbmV3Rm9sZExpbmUgaXMgdGhlIHNlY29uZCBwYXJ0XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdGb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcyA9IG5ld0ZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LmNvbHVtbiA9IGZvbGRzWzBdLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kdXBkYXRpbmcpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJyZW1vdmVcIiB9KTtcbiAgICB9XG5cbiAgICByZW1vdmVGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIC8vIFdlIG5lZWQgdG8gY2xvbmUgdGhlIGZvbGRzIGFycmF5IHBhc3NlZCBpbiBhcyBpdCBtaWdodCBiZSB0aGUgZm9sZHNcbiAgICAgICAgLy8gYXJyYXkgb2YgYSBmb2xkIGxpbmUgYW5kIGFzIHdlIGNhbGwgdGhpcy5yZW1vdmVGb2xkKGZvbGQpLCBmb2xkc1xuICAgICAgICAvLyBhcmUgcmVtb3ZlZCBmcm9tIGZvbGRzIGFuZCBjaGFuZ2VzIHRoZSBjdXJyZW50IGluZGV4LlxuICAgICAgICB2YXIgY2xvbmVGb2xkcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjbG9uZUZvbGRzLnB1c2goZm9sZHNbaV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY2xvbmVGb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZChmb2xkOiBGb2xkKSB7XG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgZm9sZC5zdWJGb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgIGZvbGQucmVzdG9yZVJhbmdlKHN1YkZvbGQpO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKHN1YkZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKGZvbGQuY29sbGFwc2VDaGlsZHJlbiA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChmb2xkLnN0YXJ0LnJvdyArIDEsIGZvbGQuZW5kLnJvdywgZm9sZC5jb2xsYXBzZUNoaWxkcmVuIC0gMSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9sZC5zdWJGb2xkcyA9IFtdO1xuICAgIH1cblxuICAgIGV4cGFuZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cblxuICAgIHVuZm9sZChsb2NhdGlvbj8sIGV4cGFuZElubmVyPykge1xuICAgICAgICB2YXIgcmFuZ2UsIGZvbGRzO1xuICAgICAgICBpZiAobG9jYXRpb24gPT0gbnVsbCkge1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgdGhpcy5nZXRMZW5ndGgoKSwgMCk7XG4gICAgICAgICAgICBleHBhbmRJbm5lciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGxvY2F0aW9uID09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShsb2NhdGlvbiwgMCwgbG9jYXRpb24sIHRoaXMuZ2V0TGluZShsb2NhdGlvbikubGVuZ3RoKTtcbiAgICAgICAgZWxzZSBpZiAoXCJyb3dcIiBpbiBsb2NhdGlvbilcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhsb2NhdGlvbiwgbG9jYXRpb24pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZSA9IGxvY2F0aW9uO1xuXG4gICAgICAgIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICAgICAgaWYgKGV4cGFuZElubmVyKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBzdWJGb2xkcyA9IGZvbGRzO1xuICAgICAgICAgICAgLy8gVE9ETzogbWlnaHQgYmUgYmV0dGVyIHRvIHJlbW92ZSBhbmQgYWRkIGZvbGRzIGluIG9uZSBnbyBpbnN0ZWFkIG9mIHVzaW5nXG4gICAgICAgICAgICAvLyBleHBhbmRGb2xkcyBzZXZlcmFsIHRpbWVzLlxuICAgICAgICAgICAgd2hpbGUgKHN1YkZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZHMoc3ViRm9sZHMpO1xuICAgICAgICAgICAgICAgIHN1YkZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogQ2hlY2tzIGlmIGEgZ2l2ZW4gZG9jdW1lbnRSb3cgaXMgZm9sZGVkLiBUaGlzIGlzIHRydWUgaWYgdGhlcmUgYXJlIHNvbWVcbiAgICAgKiBmb2xkZWQgcGFydHMgc3VjaCB0aGF0IHNvbWUgcGFydHMgb2YgdGhlIGxpbmUgaXMgc3RpbGwgdmlzaWJsZS5cbiAgICAgKiovXG4gICAgaXNSb3dGb2xkZWQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdzogRm9sZExpbmUpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZEVuZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93PzogRm9sZExpbmUpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICAgICAgcmV0dXJuIGZvbGRMaW5lID8gZm9sZExpbmUuZW5kLnJvdyA6IGRvY1JvdztcbiAgICB9XG5cbiAgICBnZXRSb3dGb2xkU3RhcnQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IGRvY1JvdztcbiAgICB9XG5cbiAgICBnZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmU6IEZvbGRMaW5lLCBlbmRSb3c/OiBudW1iZXIsIGVuZENvbHVtbj86IG51bWJlciwgc3RhcnRSb3c/OiBudW1iZXIsIHN0YXJ0Q29sdW1uPzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHN0YXJ0Um93ID09IG51bGwpXG4gICAgICAgICAgICBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgaWYgKHN0YXJ0Q29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBzdGFydENvbHVtbiA9IDA7XG4gICAgICAgIGlmIChlbmRSb3cgPT0gbnVsbClcbiAgICAgICAgICAgIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgICAgIGlmIChlbmRDb2x1bW4gPT0gbnVsbClcbiAgICAgICAgICAgIGVuZENvbHVtbiA9IHRoaXMuZ2V0TGluZShlbmRSb3cpLmxlbmd0aDtcbiAgICAgICAgXG5cbiAgICAgICAgLy8gQnVpbGQgdGhlIHRleHRsaW5lIHVzaW5nIHRoZSBGb2xkTGluZSB3YWxrZXIuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHRleHRMaW5lID0gXCJcIjtcblxuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgbGFzdENvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgICAgICBpZiAocm93IDwgc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBzdGFydFJvdykge1xuICAgICAgICAgICAgICAgIGlmIChjb2x1bW4gPCBzdGFydENvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGxhc3RDb2x1bW4gPSBNYXRoLm1heChzdGFydENvbHVtbiwgbGFzdENvbHVtbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgKz0gcGxhY2Vob2xkZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHNlbGYuZ2V0TGluZShyb3cpLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBlbmRSb3csIGVuZENvbHVtbik7XG4gICAgICAgIHJldHVybiB0ZXh0TGluZTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5TGluZShyb3c6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHN0YXJ0Um93OiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICAgICAgdmFyIGxpbmU6IHN0cmluZztcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcbiAgICAgICAgICAgIHJldHVybiBsaW5lLnN1YnN0cmluZyhzdGFydENvbHVtbiB8fCAwLCBlbmRDb2x1bW4gfHwgbGluZS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKFxuICAgICAgICAgICAgICAgIGZvbGRMaW5lLCByb3csIGVuZENvbHVtbiwgc3RhcnRSb3csIHN0YXJ0Q29sdW1uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zO1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgZm9sZCA9IGZvbGRzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFmb2xkKVxuICAgICAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcblxuICAgICAgICBpZiAoZm9sZCAmJiBmb2xkLnJhbmdlLnRvU3RyaW5nKCkgPT0gcmFuZ2UudG9TdHJpbmcoKSkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBsYWNlaG9sZGVyID0gXCIuLi5cIjtcbiAgICAgICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHRoaXMuZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChwbGFjZWhvbGRlci5sZW5ndGggPCA0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXIudHJpbSgpLnN1YnN0cmluZygwLCAyKSArIFwiLi5cIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYWRkRm9sZChwbGFjZWhvbGRlciwgcmFuZ2UpO1xuICAgIH1cblxuICAgIGdldENvbW1lbnRGb2xkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBkaXI/OiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIGlmICh0b2tlbiAmJiAvXmNvbW1lbnR8c3RyaW5nLy50ZXN0KHRva2VuLnR5cGUpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHRva2VuLnR5cGUucmVwbGFjZSgvXFwuLiovLCBcIlxcXFwuXCIpKTtcbiAgICAgICAgICAgIGlmIChkaXIgIT0gMSkge1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMjtcblxuICAgICAgICAgICAgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChkaXIgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoIC0gMjtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvbGRBbGwoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGRlcHRoOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGRlcHRoID09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGRlcHRoID0gMTAwMDAwOyAvLyBKU09OLnN0cmluZ2lmeSBkb2Vzbid0IGhhbmxlIEluZmluaXR5XG4gICAgICAgIHZhciBmb2xkV2lkZ2V0cyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZm9sZFdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICAgICAgZW5kUm93ID0gZW5kUm93IHx8IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgIHN0YXJ0Um93ID0gc3RhcnRSb3cgfHwgMDtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8IGVuZFJvdzsgcm93KyspIHtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddID09IG51bGwpXG4gICAgICAgICAgICAgICAgZm9sZFdpZGdldHNbcm93XSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gIT0gXCJzdGFydFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3cpO1xuICAgICAgICAgICAgLy8gc29tZXRpbWVzIHJhbmdlIGNhbiBiZSBpbmNvbXBhdGlibGUgd2l0aCBleGlzdGluZyBmb2xkXG4gICAgICAgICAgICAvLyBUT0RPIGNoYW5nZSBhZGRGb2xkIHRvIHJldHVybiBudWxsIGlzdGVhZCBvZiB0aHJvd2luZ1xuICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzTXVsdGlMaW5lKClcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5lbmQucm93IDw9IGVuZFJvd1xuICAgICAgICAgICAgICAgICYmIHJhbmdlLnN0YXJ0LnJvdyA+PSBzdGFydFJvd1xuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAvLyBhZGRGb2xkIGNhbiBjaGFuZ2UgdGhlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSBkZXB0aDtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNldEZvbGRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIGlmICghdGhpcy4kZm9sZFN0eWxlc1tzdHlsZV0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGZvbGQgc3R5bGU6IFwiICsgc3R5bGUgKyBcIltcIiArIE9iamVjdC5rZXlzKHRoaXMuJGZvbGRTdHlsZXMpLmpvaW4oXCIsIFwiKSArIFwiXVwiKTtcblxuICAgICAgICBpZiAodGhpcy4kZm9sZFN0eWxlID09PSBzdHlsZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkU3R5bGUgPSBzdHlsZTtcblxuICAgICAgICBpZiAoc3R5bGUgPT09IFwibWFudWFsXCIpXG4gICAgICAgICAgICB0aGlzLnVuZm9sZCgpO1xuICAgICAgICBcbiAgICAgICAgLy8gcmVzZXQgZm9sZGluZ1xuICAgICAgICB2YXIgbW9kZSA9IHRoaXMuJGZvbGRNb2RlO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG51bGwpO1xuICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUpO1xuICAgIH1cblxuICAgICRzZXRGb2xkaW5nKGZvbGRNb2RlKSB7XG4gICAgICAgIGlmICh0aGlzLiRmb2xkTW9kZSA9PSBmb2xkTW9kZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkTW9kZSA9IGZvbGRNb2RlO1xuXG4gICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUFubm90YXRpb25cIik7XG5cbiAgICAgICAgaWYgKCFmb2xkTW9kZSB8fCB0aGlzLiRmb2xkU3R5bGUgPT0gXCJtYW51YWxcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gW107XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldCA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXQuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2UuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcblxuICAgICAgICB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyA9IHRoaXMudXBkYXRlRm9sZFdpZGdldHMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5vbignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuXG4gICAgfVxuXG4gICAgZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3c6IG51bWJlciwgaWdub3JlQ3VycmVudD86IGJvb2xlYW4pOiB7IHJhbmdlPzogUmFuZ2U7IGZpcnN0UmFuZ2U/OiBSYW5nZSB9IHtcbiAgICAgICAgdmFyIGZ3ID0gdGhpcy5mb2xkV2lkZ2V0cztcbiAgICAgICAgaWYgKCFmdyB8fCAoaWdub3JlQ3VycmVudCAmJiBmd1tyb3ddKSkge1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSByb3cgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSYW5nZTogUmFuZ2U7XG4gICAgICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgICAgICAgIHZhciBjID0gZndbaV07XG4gICAgICAgICAgICBpZiAoYyA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGMgPSBmd1tpXSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChpKTtcblxuICAgICAgICAgICAgaWYgKGMgPT0gXCJzdGFydFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UoaSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaXJzdFJhbmdlKVxuICAgICAgICAgICAgICAgICAgICBmaXJzdFJhbmdlID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmVuZC5yb3cgPj0gcm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByYW5nZTogaSAhPT0gLTEgJiYgcmFuZ2UsXG4gICAgICAgICAgICBmaXJzdFJhbmdlOiBmaXJzdFJhbmdlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Gb2xkV2lkZ2V0Q2xpY2socm93LCBlKSB7XG4gICAgICAgIGUgPSBlLmRvbUV2ZW50O1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBlLnNoaWZ0S2V5LFxuICAgICAgICAgICAgYWxsOiBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5LFxuICAgICAgICAgICAgc2libGluZ3M6IGUuYWx0S2V5XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpO1xuICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICB2YXIgZWwgPSAoZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50KVxuICAgICAgICAgICAgaWYgKGVsICYmIC9hY2VfZm9sZC13aWRnZXQvLnRlc3QoZWwuY2xhc3NOYW1lKSlcbiAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgKz0gXCIgYWNlX2ludmFsaWRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk6IFJhbmdlIHtcbiAgICAgICAgaWYgKCF0aGlzLmdldEZvbGRXaWRnZXQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciB0eXBlID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGRpciA9IHR5cGUgPT09IFwiZW5kXCIgPyAtMSA6IDE7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCBkaXIgPT09IC0xID8gMCA6IGxpbmUubGVuZ3RoLCBkaXIpO1xuXG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZHJlbiB8fCBvcHRpb25zLmFsbClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93LCB0cnVlKTtcbiAgICAgICAgLy8gc29tZXRpbWVzIHNpbmdsZWxpbmUgZm9sZHMgY2FuIGJlIG1pc3NlZCBieSB0aGUgY29kZSBhYm92ZVxuICAgICAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCAmJiByYW5nZS5pc0VxdWFsKGZvbGQucmFuZ2UpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLnNpYmxpbmdzKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKGRhdGEucmFuZ2UpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSb3cgPSBkYXRhLnJhbmdlLnN0YXJ0LnJvdyArIDE7XG4gICAgICAgICAgICAgICAgdmFyIGVuZFJvdyA9IGRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChzdGFydFJvdywgZW5kUm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5jaGlsZHJlbikge1xuICAgICAgICAgICAgZW5kUm93ID0gcmFuZ2UgPyByYW5nZS5lbmQucm93IDogdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChyb3cgKyAxLCByYW5nZS5lbmQucm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmFsbCkge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBiaXQgdWdseSwgYnV0IGl0IGNvcnJlc3BvbmRzIHRvIHNvbWUgY29kZSBlbHNld2hlcmUuXG4gICAgICAgICAgICAgICAgcmFuZ2UuY29sbGFwc2VDaGlsZHJlbiA9IDEwMDAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cblxuXG4gICAgdG9nZ2xlRm9sZFdpZGdldCh0b2dnbGVQYXJlbnQpIHtcbiAgICAgICAgdmFyIHJvdzogbnVtYmVyID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkucm93O1xuICAgICAgICByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChyb3cpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiR0b2dnbGVGb2xkV2lkZ2V0KHJvdywge30pO1xuXG4gICAgICAgIGlmIChyYW5nZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgLy8gaGFuZGxlIHRvZ2dsZVBhcmVudFxuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3csIHRydWUpO1xuICAgICAgICByYW5nZSA9IGRhdGEucmFuZ2UgfHwgZGF0YS5maXJzdFJhbmdlO1xuXG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aCwgMSk7XG5cbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlRm9sZFdpZGdldHMoZTogeyBkYXRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSB9KTogdm9pZCB7XG4gICAgICAgIHZhciBkZWx0YSA9IGUuZGF0YTtcbiAgICAgICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGxlbiA9IHJhbmdlLmVuZC5yb3cgLSBmaXJzdFJvdztcblxuICAgICAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlVGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZUxpbmVzXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlKGZpcnN0Um93LCBsZW4gKyAxLCBudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuICsgMSk7XG4gICAgICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDEpO1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UuYXBwbHkodGhpcy5mb2xkV2lkZ2V0cywgYXJncyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIEZJWE1FOiBSZXN0b3JlXG4vLyBGb2xkaW5nLmNhbGwoRWRpdFNlc3Npb24ucHJvdG90eXBlKTtcblxuZGVmaW5lT3B0aW9ucyhFZGl0U2Vzc2lvbi5wcm90b3R5cGUsIFwic2Vzc2lvblwiLCB7XG4gICAgd3JhcDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlID09IFwib2ZmXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBmYWxzZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwiZnJlZVwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gdHJ1ZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwicHJpbnRNYXJnaW5cIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApIHx8IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZShmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb2wgPSB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiA/IHZhbHVlIDogbnVsbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGNvbCwgY29sKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kd3JhcCA9IHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IC0xKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJwcmludE1hcmdpblwiO1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5nZXRXcmFwTGltaXRSYW5nZSgpLm1pbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiZnJlZVwiO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFwib2ZmXCI7XG4gICAgICAgIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIHdyYXBNZXRob2Q6IHtcbiAgICAgICAgLy8gY29kZXx0ZXh0fGF1dG9cbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhbCA9IHZhbCA9PSBcImF1dG9cIlxuICAgICAgICAgICAgICAgID8gdGhpcy4kbW9kZS50eXBlICE9IFwidGV4dFwiXG4gICAgICAgICAgICAgICAgOiB2YWwgIT0gXCJ0ZXh0XCI7XG4gICAgICAgICAgICBpZiAodmFsICE9IHRoaXMuJHdyYXBBc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwQXNDb2RlID0gdmFsO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJhdXRvXCJcbiAgICB9LFxuICAgIGZpcnN0TGluZU51bWJlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDFcbiAgICB9LFxuICAgIHVzZVdvcmtlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHVzZVdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kdXNlV29ya2VyID0gdXNlV29ya2VyO1xuXG4gICAgICAgICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG4gICAgICAgICAgICBpZiAodXNlV29ya2VyKVxuICAgICAgICAgICAgICAgIHRoaXMuJHN0YXJ0V29ya2VyKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgdXNlU29mdFRhYnM6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgdGFiU2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHRhYlNpemUpIHtcbiAgICAgICAgICAgIGlmIChpc05hTih0YWJTaXplKSB8fCB0aGlzLiR0YWJTaXplID09PSB0YWJTaXplKSByZXR1cm47XG5cbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiR0YWJTaXplID0gdGFiU2l6ZTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVRhYlNpemVcIik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogNCxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgb3ZlcndyaXRlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZU92ZXJ3cml0ZVwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgbmV3TGluZU1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb2MuZ2V0TmV3TGluZU1vZGUoKSB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBtb2RlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0TW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLiRtb2RlSWQgfVxuICAgIH1cbn0pO1xuIl19