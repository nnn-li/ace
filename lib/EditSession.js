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
        console.log("EditSession constructor()");
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
                console.log("EditSession.setMode() calling onChangeMode");
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
        console.log("EditSession.$onChangerMode");
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
        console.log("EditSession.$stopWorker");
        if (this.$worker) {
            this.$worker.terminate();
        }
        this.$worker = null;
    }
    $startWorker() {
        console.log("EditSession.$startWorker");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlTW9kZSIsIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyIiwiRWRpdFNlc3Npb24uJHN0YXJ0V29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0TW9kZSIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZSIsIkVkaXRTZXNzaW9uLmdldExpbmVzIiwiRWRpdFNlc3Npb24uZ2V0TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0VGV4dFJhbmdlIiwiRWRpdFNlc3Npb24uaW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVtb3ZlIiwiRWRpdFNlc3Npb24udW5kb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5yZWRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnNldFVuZG9TZWxlY3QiLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uLmlzSW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVwbGFjZSIsIkVkaXRTZXNzaW9uLm1vdmVUZXh0IiwiRWRpdFNlc3Npb24uaW5kZW50Um93cyIsIkVkaXRTZXNzaW9uLm91dGRlbnRSb3dzIiwiRWRpdFNlc3Npb24uJG1vdmVMaW5lcyIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93biIsIkVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzIiwiRWRpdFNlc3Npb24uJGNsaXBSb3dUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBDb2x1bW5Ub1JvdyIsIkVkaXRTZXNzaW9uLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBSYW5nZVRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLmdldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi4kY29uc3RyYWluV3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlV3JhcERhdGEiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMuYWRkU3BsaXQiLCJFZGl0U2Vzc2lvbi4kZ2V0RGlzcGxheVRva2VucyIsIkVkaXRTZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xpbmVDb3VudCIsIkVkaXRTZXNzaW9uLmdldFJvd1dyYXBJbmRlbnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRDb2x1bW4iLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxlbmd0aCIsIkVkaXRTZXNzaW9uLiRzZXRGb250TWV0cmljcyIsIkVkaXRTZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uJGZpbmRDbG9zaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEZvbGRBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJFZGl0U2Vzc2lvbi5nZXRBbGxGb2xkcyIsIkVkaXRTZXNzaW9uLmdldEZvbGRTdHJpbmdBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZGVkUm93Q291bnQiLCJFZGl0U2Vzc2lvbi4kYWRkRm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkIiwiRWRpdFNlc3Npb24uc2V0TW9kaWZpZWQiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkcyIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGQiLCJFZGl0U2Vzc2lvbi5yZW1vdmVGb2xkcyIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGQiLCJFZGl0U2Vzc2lvbi5leHBhbmRGb2xkcyIsIkVkaXRTZXNzaW9uLnVuZm9sZCIsIkVkaXRTZXNzaW9uLmlzUm93Rm9sZGVkIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZEVuZCIsIkVkaXRTZXNzaW9uLmdldFJvd0ZvbGRTdGFydCIsIkVkaXRTZXNzaW9uLmdldEZvbGREaXNwbGF5TGluZSIsIkVkaXRTZXNzaW9uLmdldERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uJGNsb25lRm9sZERhdGEiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkIiwiRWRpdFNlc3Npb24uZ2V0Q29tbWVudEZvbGRSYW5nZSIsIkVkaXRTZXNzaW9uLmZvbGRBbGwiLCJFZGl0U2Vzc2lvbi5zZXRGb2xkU3R5bGUiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9sZGluZyIsIkVkaXRTZXNzaW9uLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJFZGl0U2Vzc2lvbi5vbkZvbGRXaWRnZXRDbGljayIsIkVkaXRTZXNzaW9uLiR0b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCIsIkVkaXRTZXNzaW9uLnVwZGF0ZUZvbGRXaWRnZXRzIl0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsRUFBQyxpQkFBaUIsRUFBQyxNQUFNLHFCQUFxQjtPQUM5QyxRQUFRLE1BQU0sYUFBYTtPQUMzQixJQUFJLE1BQU0sUUFBUTtPQUNsQixFQUFDLFNBQVMsRUFBQyxNQUFNLGFBQWE7T0FDOUIsSUFBSSxNQUFNLGFBQWE7T0FDdkIsS0FBSyxNQUFNLFNBQVM7T0FDcEIsY0FBYyxNQUFNLGtCQUFrQjtPQUN0QyxFQUFDLG1CQUFtQixFQUFDLE1BQU0sd0JBQXdCO09BQ25ELEVBQUMsZUFBZSxFQUFDLE1BQU0sb0JBQW9CO09BQzNDLEVBQUMsTUFBTSxFQUFDLE1BQU0sZUFBZTtPQUM3QixZQUFZLE1BQU0sOEJBQThCO09BRWhELGFBQWEsTUFBTSxpQkFBaUI7QUFHM0MsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUNWLFFBQVEsR0FBRyxDQUFDLEVBQ1osaUJBQWlCLEdBQUcsQ0FBQyxFQUNyQixnQkFBZ0IsR0FBRyxDQUFDLEVBQ3BCLFdBQVcsR0FBRyxDQUFDLEVBQ2YsS0FBSyxHQUFHLEVBQUUsRUFDVixHQUFHLEdBQUcsRUFBRSxFQUNSLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFJakIscUJBQXFCLENBQVM7SUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2JBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQy9CQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtBQUMvQkEsQ0FBQ0E7QUFFRCx5Q0FBeUMsaUJBQWlCO0lBaUZ4REMsWUFBWUEsR0FBbUJBLEVBQUVBLElBQUtBLEVBQUVBLEVBQWNBO1FBQ3BEQyxPQUFPQSxDQUFDQTtRQWpGSEEsaUJBQVlBLEdBQWFBLEVBQUVBLENBQUNBO1FBQzVCQSxpQkFBWUEsR0FBYUEsRUFBRUEsQ0FBQ0E7UUFDM0JBLGtCQUFhQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNwQkEsaUJBQVlBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pCQSxjQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxnQkFBV0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFhbkJBLHdCQUFtQkEsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsY0FBYSxDQUFDLEVBQUVBLElBQUlBLEVBQUVBLGNBQWEsQ0FBQyxFQUFFQSxLQUFLQSxFQUFFQSxjQUFhLENBQUMsRUFBRUEsQ0FBQ0E7UUFVNUZBLGVBQVVBLEdBQUdBLEtBQUtBLENBQUNBO1FBVW5CQSxXQUFNQSxHQUE2QkEsRUFBRUEsQ0FBQ0E7UUFJdkNBLFVBQUtBLEdBQVNBLElBQUlBLENBQUNBO1FBQ2xCQSxZQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUtoQkEsZUFBVUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZEEsZ0JBQVdBLEdBQUdBLENBQUNBLENBQUNBO1FBR2hCQSxlQUFVQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNqQkEsaUJBQVlBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxvQkFBZUEsR0FBR0E7WUFDeEJBLEdBQUdBLEVBQUVBLElBQUlBO1lBQ1RBLEdBQUdBLEVBQUVBLElBQUlBO1NBQ1ZBLENBQUNBO1FBRUtBLGdCQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsY0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFpQnRDQSxxQkFBZ0JBLEdBQVdBLElBQUlBLENBQUNBO1FBQy9CQSxvQkFBZUEsR0FBR0EsSUFBSUEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUE4a0IxQ0EsbUJBQWNBLEdBQUdBO1lBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxJQUFJLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUFBO1FBd3FEREEsZ0JBQVdBLEdBQUdBO1lBQ1pBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ1hBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ2RBLGNBQWNBLEVBQUVBLENBQUNBO1NBQ2xCQSxDQUFBQTtRQUNEQSxlQUFVQSxHQUFHQSxXQUFXQSxDQUFDQTtRQXp2RXZCQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSwyQkFBMkJBLENBQUNBLENBQUFBO1FBQ3hDQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNwQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsR0FBR0E7WUFDeEIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekIsQ0FBQyxDQUFBQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRXJDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNuQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzNCQSxDQUFDQTtJQVFPRCxXQUFXQSxDQUFDQSxHQUFtQkE7UUFDckNFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLFlBQVlBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSw4QkFBOEJBLENBQUNBLENBQUNBO1FBQ2xEQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFFakNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNuREEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7SUFDckJBLENBQUNBO0lBT01GLFdBQVdBO1FBQ2hCRyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNsQkEsQ0FBQ0E7SUFRT0gsY0FBY0EsQ0FBQ0EsTUFBY0E7UUFDbkNJLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ3ZCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0E7UUFDVEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwQ0EsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFT0osaUJBQWlCQSxDQUFDQSxVQUFvQkEsRUFBRUEsR0FBV0E7UUFDekRLLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1pBLElBQUlBLEVBQUVBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBRS9CQSxPQUFPQSxHQUFHQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNqQkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBRXhCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsRUFBRUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO1lBQ2JBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUVPTCxXQUFXQTtRQUNqQk0sSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3BCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFT04sWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDcEJPLElBQUlBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBQ2xCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFFT1AsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDaEJRLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBQ25CQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV0QkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLDJCQUEyQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQzFEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsSUFBSUEsWUFBWUEsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQTtvQkFDcEJBLE1BQU1BLEVBQUVBLGFBQWFBO29CQUNyQkEsS0FBS0EsRUFBRUEsWUFBWUE7aUJBQ3BCQSxDQUFDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUVEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBU09SLFFBQVFBLENBQUNBLElBQVlBO1FBQzNCUyxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN4QkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUJBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDckJBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3RCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUN2Q0EsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7SUFDaENBLENBQUNBO0lBUU1ULFFBQVFBO1FBQ2JVLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQVFNVixRQUFRQTtRQUNiVyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFLTVgsWUFBWUE7UUFDakJZLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQVFNWixRQUFRQSxDQUFDQSxHQUFXQTtRQUN6QmEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBT01iLFNBQVNBLENBQUNBLEdBQVdBO1FBQzFCYyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFTTWQsVUFBVUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBZUE7UUFDNUNlLElBQUlBLE1BQU1BLEdBQXdCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsRUEsSUFBSUEsS0FBd0RBLENBQUNBO1FBQzdEQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdkNBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7b0JBQ2RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0hBLENBQUNBO1FBQ0RBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNUQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNkQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDckNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLENBQUNBO0lBTU1mLGNBQWNBLENBQUNBLFdBQXdCQTtRQUM1Q2dCLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDckJBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLEVBQUVBLENBQUNBO1FBRXRCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBRW5DQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFaEJBLElBQUlBLENBQUNBLHNCQUFzQkEsR0FBR0E7Z0JBQzVCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFFakMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUM1QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt3QkFDaEIsS0FBSyxFQUFFLE1BQU07d0JBQ2IsTUFBTSxFQUFFLElBQUksQ0FBQyxXQUFXO3FCQUN6QixDQUFDLENBQUM7b0JBQ0gsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUM7Z0JBQ3hCLENBQUM7Z0JBRUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUMzQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt3QkFDaEIsS0FBSyxFQUFFLEtBQUs7d0JBQ1osTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVO3FCQUN4QixDQUFDLENBQUM7b0JBQ0gsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7Z0JBQ3ZCLENBQUM7Z0JBRUQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsV0FBVyxDQUFDLE9BQU8sQ0FBQzt3QkFDbEIsTUFBTSxFQUFFLFdBQVc7d0JBQ25CLElBQUksRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDO3dCQUMxQixLQUFLLEVBQUUsSUFBSSxDQUFDLGVBQWU7cUJBQzVCLENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUNELElBQUksQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO2dCQUM3QixJQUFJLENBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNwQixDQUFDLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxDQUFDQTtRQUNyRUEsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFLT2hCLGFBQWFBO1FBQ25CaUIsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQTtZQUM5QkEsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxFQUFFQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFLTWpCLGNBQWNBO1FBQ25Ca0IsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQTtJQUN2REEsQ0FBQ0E7SUFLTWxCLFlBQVlBO1FBQ2pCbUIsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNkQSxDQUFDQTtJQUNIQSxDQUFDQTtJQU9PbkIsY0FBY0EsQ0FBQ0EsR0FBR0E7UUFDeEJvQixJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxhQUFhQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFNTXBCLGNBQWNBO1FBRW5CcUIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsZUFBZUEsQ0FBQ0E7SUFDMURBLENBQUNBO0lBUU9yQixVQUFVQSxDQUFDQSxPQUFlQTtRQUNoQ3NCLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUtNdEIsVUFBVUE7UUFDZnVCLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO0lBQ3ZCQSxDQUFDQTtJQVFNdkIsU0FBU0EsQ0FBQ0EsUUFBNEJBO1FBQzNDd0IsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdEVBLENBQUNBO0lBV014QixZQUFZQSxDQUFDQSxTQUFrQkE7UUFDcEN5QixJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFLTXpCLFlBQVlBO1FBQ2pCMEIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBS00xQixlQUFlQTtRQUNwQjJCLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQU9NM0IsbUJBQW1CQSxDQUFDQSxHQUFXQSxFQUFFQSxTQUFpQkE7UUFDdkQ0QixFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBO1FBQzFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQU9NNUIsc0JBQXNCQSxDQUFDQSxHQUFXQSxFQUFFQSxTQUFpQkE7UUFDMUQ2QixJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNyRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFNTzdCLGNBQWNBO1FBQ3BCOEIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7SUFDM0JBLENBQUNBO0lBU085QixjQUFjQSxDQUFDQSxJQUFjQTtRQUNuQytCLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3ZCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZ0JBQWdCQSxDQUFDQTtRQUNoREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFLTy9CLGdCQUFnQkE7UUFDdEJnQyxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFTT2hDLGFBQWFBLENBQUNBLEdBQUdBLEVBQUVBLFNBQVNBO1FBQ2xDaUMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0E7WUFDMUJBLFNBQVNBLEdBQUdBLGdCQUFnQkEsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBO1FBQ3JDQSxJQUFJQTtZQUNGQSxPQUFPQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFRT2pDLGVBQWVBLENBQUNBLEdBQUdBO1FBQ3pCa0MsT0FBT0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLENBQUNBO0lBWU1sQyxTQUFTQSxDQUFDQSxLQUFZQSxFQUFFQSxLQUFhQSxFQUFFQSxJQUFTQSxFQUFFQSxPQUFpQkE7UUFDeEVtQyxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtRQUcxQkEsSUFBSUEsTUFBTUEsR0FBR0E7WUFDWEEsS0FBS0EsRUFBRUEsS0FBS0E7WUFDWkEsSUFBSUEsRUFBRUEsSUFBSUEsSUFBSUEsTUFBTUE7WUFDcEJBLFFBQVFBLEVBQUVBLE9BQU9BLElBQUlBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBO1lBQ2pEQSxLQUFLQSxFQUFFQSxLQUFLQTtZQUNaQSxPQUFPQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQTtZQUNsQkEsRUFBRUEsRUFBRUEsRUFBRUE7U0FDUEEsQ0FBQ0E7UUFFRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFDaENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7UUFDcENBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1lBQy9CQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNaQSxDQUFDQTtJQVVPbkMsZ0JBQWdCQSxDQUFDQSxNQUFNQSxFQUFFQSxPQUFRQTtRQUN2Q29DLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2pCQSxNQUFNQSxDQUFDQTtRQUNUQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtRQUMxQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFM0JBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1lBQ2hDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1FBQ3BDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUMvQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBU01wQyxZQUFZQSxDQUFDQSxRQUFRQTtRQUMxQnFDLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ3pFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNWQSxNQUFNQSxDQUFDQTtRQUVUQSxJQUFJQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtRQUN0RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLG1CQUFtQkEsR0FBR0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUMxRUEsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFRTXJDLFVBQVVBLENBQUNBLE9BQWdCQTtRQUNoQ3NDLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO0lBQzFEQSxDQUFDQTtJQUVNdEMsU0FBU0EsQ0FBQ0EsRUFBRUE7UUFDakJ1QyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxlQUFlQSxDQUFDQSxJQUFJQSxFQUFFQSxtQkFBbUJBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3ZFQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBR092QyxjQUFjQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxPQUFPQTtRQUNyRHdDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNmQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUNwQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDVEEsS0FBS0EsR0FBR0EsVUFBVUEsQ0FBQ0E7UUFFckJBLElBQUlBLEtBQUtBLEdBQVFBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQzFEQSxLQUFLQSxDQUFDQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxVQUFVQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM3REEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFnQk14QyxjQUFjQSxDQUFDQSxXQUFXQTtRQUMvQnlDLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQWVNekMsZ0JBQWdCQTtRQUNyQjBDLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO0lBQzFCQSxDQUFDQTtJQU9PMUMsY0FBY0EsQ0FBQ0EsSUFBWUE7UUFDakMyQyxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBO1FBQzNCQSxDQUFDQTtJQUNIQSxDQUFDQTtJQVNNM0MsWUFBWUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDN0M0QyxJQUFJQSxJQUFJQSxHQUFXQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVyQ0EsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1lBQ2JBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRTFEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNYQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV0REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDVkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDeEJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hEQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNoQkEsSUFBSUE7WUFDRkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFM0JBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxHQUFHQSxDQUFDQTtnQkFDRkEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDVkEsQ0FBQ0EsUUFDTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUE7WUFDbkRBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2pCQSxPQUFPQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN2REEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDUkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDekNBLENBQUNBO0lBU001QyxhQUFhQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQTtRQUM5QzZDLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDeERBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBQzVCQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFTTzdDLGNBQWNBLENBQUNBLFdBQW1CQTtRQUN4QzhDLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQVFPOUMsY0FBY0E7UUFDcEIrQyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUNuQ0EsQ0FBQ0E7SUFPTy9DLFlBQVlBLENBQUNBLFNBQVNBLElBQUlnRCxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUtuRWhELFlBQVlBLEtBQUtpRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUsxQ2pELGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDekJrRCxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLENBQUNBO0lBU09sRCxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFjQTtRQUNsQ21ELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLDRDQUE0Q0EsQ0FBQ0EsQ0FBQUE7Z0JBQ3pEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDbkJBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxJQUFJQSxHQUFHQSxJQUFJQSxJQUFJQSxlQUFlQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLEVBQUVBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ1hBLE1BQU1BLENBQUNBO1FBQ1RBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BCQSxVQUFVQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxVQUFTQSxDQUFNQTtZQUN4QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxLQUFLLElBQUksQ0FBQztnQkFDeEIsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNwQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO2dCQUNoQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDL0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ2IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3RCLENBQUMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDO2dCQUNmLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ2IsQ0FBQztRQUNILENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFHZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3pEQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVPbkQsYUFBYUEsQ0FBQ0EsSUFBVUEsRUFBRUEsY0FBd0JBO1FBQ3hEb0QsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsNEJBQTRCQSxDQUFDQSxDQUFBQTtRQUN6Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUV4QkEsTUFBTUEsQ0FBQ0E7UUFDVEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFHbEJBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1FBRW5CQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDdEJBLENBQUNBO1FBRURBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBRXBDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hEQSxJQUFJQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMURBLFNBQVNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsRUFBRUEsaUJBQWlCQSxDQUFDQSxDQUFDQTtRQUM3REEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLElBQUlBLG1CQUFtQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1lBQ2pCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxnQkFBZ0JBLENBQUNBLFFBQVFBLEVBQUVBLFVBQVNBLENBQUNBO2dCQUNwRCxLQUFLLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3RDLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDM0NBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBO1FBRWpEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFHbENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUMxREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUMzQkEsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFHT3BELFdBQVdBO1FBQ2pCcUQsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EseUJBQXlCQSxDQUFDQSxDQUFBQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQzNCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFFT3JELFlBQVlBO1FBQ2xCc0QsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsMEJBQTBCQSxDQUFDQSxDQUFBQTtRQUN2Q0EsSUFBSUEsQ0FBQ0E7WUFDSEEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLENBQ0FBO1FBQUFBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1RBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxDQUFDQTtJQUNIQSxDQUFDQTtJQU1NdEQsT0FBT0E7UUFDWnVELE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQU9NdkQsWUFBWUEsQ0FBQ0EsU0FBaUJBO1FBRW5Dd0QsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsS0FBS0EsU0FBU0EsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE1BQU1BLENBQUNBO1FBQ1RBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLFNBQVNBLENBQUNBO1FBQzVCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO0lBQzdDQSxDQUFDQTtJQU1NeEQsWUFBWUE7UUFDakJ5RCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN6QkEsQ0FBQ0E7SUFLTXpELGFBQWFBLENBQUNBLFVBQWtCQTtRQUVyQzBELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEtBQUtBLFVBQVVBLElBQUlBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ3ZEQSxNQUFNQSxDQUFDQTtRQUVUQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUMvQ0EsQ0FBQ0E7SUFNTTFELGFBQWFBO1FBQ2xCMkQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBTU0zRCxjQUFjQTtRQUNuQjRELElBQUlBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNuQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNsRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBRU81RCxxQkFBcUJBO1FBQzNCNkQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxJQUFJQSxJQUFJQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBO1FBQ2hFQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxDQUFDQTtZQUNqQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7Z0JBQzdCLEtBQUssR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQzFCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBRU03RCxhQUFhQSxDQUFDQSxLQUFNQTtRQUN6QjhELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7Z0JBQ3BCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUU1Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7WUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBO1lBQ2pDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUV2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQzdCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbEJBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO29CQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7d0JBQ1hBLEtBQUtBLENBQUNBO29CQUNSQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDdkNBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN2REEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBO29CQUNuQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFckRBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLGlCQUFpQkEsQ0FBQ0E7b0JBQy9CQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxpQkFBaUJBLENBQUNBO1FBQ3ZDQSxDQUFDQTtJQUNIQSxDQUFDQTtJQVVNOUQsT0FBT0EsQ0FBQ0EsR0FBV0E7UUFDeEIrRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFVTS9ELFFBQVFBLENBQUNBLFFBQWdCQSxFQUFFQSxPQUFlQTtRQUMvQ2dFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQzlDQSxDQUFDQTtJQU1NaEUsU0FBU0E7UUFDZGlFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO0lBQzlCQSxDQUFDQTtJQVFNakUsWUFBWUEsQ0FBQ0EsS0FBWUE7UUFDOUJrRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNuRUEsQ0FBQ0E7SUFVTWxFLE1BQU1BLENBQUNBLFFBQXlDQSxFQUFFQSxJQUFZQTtRQUNuRW1FLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQVVNbkUsTUFBTUEsQ0FBQ0EsS0FBS0E7UUFDakJvRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFVTXBFLFdBQVdBLENBQUNBLE1BQU1BLEVBQUVBLFVBQW9CQTtRQUM3Q3FFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2pCQSxNQUFNQSxDQUFDQTtRQUVUQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsSUFBSUEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDekJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzdDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcENBLGFBQWFBO29CQUNYQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1lBQzlEQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDTkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsU0FBU0E7b0JBQ3JDLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNqQyxDQUFDLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0hBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZCQSxhQUFhQTtZQUNYQSxJQUFJQSxDQUFDQSxXQUFXQTtZQUNoQkEsQ0FBQ0EsVUFBVUE7WUFDWEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNsREEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7SUFDdkJBLENBQUNBO0lBVU1yRSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFvQkE7UUFDN0NzRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNqQkEsTUFBTUEsQ0FBQ0E7UUFFVEEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLElBQUlBLGFBQWFBLEdBQVVBLElBQUlBLENBQUNBO1FBQ2hDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUN6QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxhQUFhQTtvQkFDWEEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUMvREEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDdkJBLGFBQWFBO1lBQ1hBLElBQUlBLENBQUNBLFdBQVdBO1lBQ2hCQSxDQUFDQSxVQUFVQTtZQUNYQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxpQkFBaUJBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ2xEQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFPT3RFLGFBQWFBLENBQUNBLE1BQWVBO1FBQ25DdUUsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsTUFBTUEsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRU92RSxpQkFBaUJBLENBQUNBLE1BQTBDQSxFQUFFQSxNQUFlQSxFQUFFQSxhQUFvQkE7UUFDekd3RSxrQkFBa0JBLEtBQXlCQTtZQUN6Q0MsSUFBSUEsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBS0EsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsS0FBS0EsYUFBYUEsQ0FBQ0E7WUFDN0VBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBQ25DQSxDQUFDQTtRQUVERCxJQUFJQSxLQUFLQSxHQUFxQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeERBLElBQUlBLEtBQVlBLENBQUNBO1FBQ2pCQSxJQUFJQSxLQUFzQ0EsQ0FBQ0E7UUFDM0NBLElBQUlBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM3REEsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUMzQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDTkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3ZDQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsREEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xFQSxDQUFDQTtnQkFDREEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakRBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1REEsQ0FBQ0E7Z0JBQ0RBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDM0JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsREEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pFQSxDQUFDQTtnQkFDREEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUM1QkEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNoRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3BFQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNwRUEsQ0FBQ0E7WUFFREEsSUFBSUEsR0FBR0EsR0FBR0EsYUFBYUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN0RUEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNsRUEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFvQk14RSxPQUFPQSxDQUFDQSxLQUFZQSxFQUFFQSxJQUFZQTtRQUN2QzBFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQWNNMUUsUUFBUUEsQ0FBQ0EsU0FBU0EsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUE7UUFDekMyRSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDMUZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUN0RkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2hDQSxDQUFDQTtZQUNIQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDN0JBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBO1lBQzdCQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN0Q0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDNUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLFVBQVNBLENBQUNBO2dCQUNoQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNkLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNoQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUM7Z0JBQzVCLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDMUIsQ0FBQztnQkFDRCxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDckIsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNYLENBQUMsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBWU0zRSxVQUFVQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxZQUFZQTtRQUM5QzRFLFlBQVlBLEdBQUdBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2hFQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxFQUFFQSxHQUFHQSxJQUFJQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQTtZQUMzQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDdkRBLENBQUNBO0lBUU01RSxXQUFXQSxDQUFDQSxLQUFZQTtRQUM3QjZFLElBQUlBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQ3BDQSxJQUFJQSxXQUFXQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFFN0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzVEQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUzQkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDM0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENB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QUNBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtvQkFDbEJBLEtBQUtBLENBQUNBO2dCQUNSQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDbERBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3ZEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLENBQUNBO1lBRURBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3BDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUViQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUN2Q0EsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFHREEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFFbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLFNBQVNB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QSxTQUFTQSxFQUFFQSxDQUFDQTtZQUc5QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDOUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6Q0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMvQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFFakRBLE9BQU9BLEdBQUdBLEdBQUdBLE9BQU9BLEVBQUVBLENBQUNBO2dCQUNyQkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxVQUFVQSxJQUFJQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0NBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNOQSxFQUFFQSxDQUFDQSxDQUFD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QSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMzREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FFSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOURBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FLSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNDQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzNDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNuREEsQ0FBQ0E7UUFFUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO2dCQUNwQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDekNBLElBQUlBO2dCQUNGQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2pEQSxDQUFDQTtRQUdEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDN0RBLENBQUNBO0lBRUR0SSxXQUFXQSxDQUFDQSxLQUFhQTtRQUl2QnVJLElBQUlBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3BCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN0Q0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFD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O1lBQ05BLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDVEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDUkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDVEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFL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Q0FBQ0E7UUFFL0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE1BQU1BLENBQUNBO1lBQ1RBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENB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KioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIHN0cmluZ1JlcGVhdH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCB7X3NpZ25hbCwgZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB7RXZlbnRFbWl0dGVyQ2xhc3N9IGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgRm9sZExpbmUgZnJvbSBcIi4vZm9sZF9saW5lXCI7XG5pbXBvcnQgRm9sZCBmcm9tIFwiLi9mb2xkXCI7XG5pbXBvcnQge1NlbGVjdGlvbn0gZnJvbSBcIi4vc2VsZWN0aW9uXCI7XG5pbXBvcnQgTW9kZSBmcm9tIFwiLi9tb2RlL01vZGVcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IEVkaXRvckRvY3VtZW50IGZyb20gXCIuL0VkaXRvckRvY3VtZW50XCI7XG5pbXBvcnQge0JhY2tncm91bmRUb2tlbml6ZXJ9IGZyb20gXCIuL2JhY2tncm91bmRfdG9rZW5pemVyXCI7XG5pbXBvcnQge1NlYXJjaEhpZ2hsaWdodH0gZnJvbSBcIi4vc2VhcmNoX2hpZ2hsaWdodFwiO1xuaW1wb3J0IHthc3NlcnR9IGZyb20gJy4vbGliL2Fzc2VydHMnO1xuaW1wb3J0IEJyYWNrZXRNYXRjaCBmcm9tIFwiLi9lZGl0X3Nlc3Npb24vYnJhY2tldF9tYXRjaFwiO1xuaW1wb3J0IHtVbmRvTWFuYWdlcn0gZnJvbSAnLi91bmRvbWFuYWdlcidcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gJy4vVG9rZW5JdGVyYXRvcic7XG5cbi8vIFwiVG9rZW5zXCJcbnZhciBDSEFSID0gMSxcbiAgQ0hBUl9FWFQgPSAyLFxuICBQTEFDRUhPTERFUl9TVEFSVCA9IDMsXG4gIFBMQUNFSE9MREVSX0JPRFkgPSA0LFxuICBQVU5DVFVBVElPTiA9IDksXG4gIFNQQUNFID0gMTAsXG4gIFRBQiA9IDExLFxuICBUQUJfU1BBQ0UgPSAxMjtcblxuLy8gRm9yIGV2ZXJ5IGtleXN0cm9rZSB0aGlzIGdldHMgY2FsbGVkIG9uY2UgcGVyIGNoYXIgaW4gdGhlIHdob2xlIGRvYyEhXG4vLyBXb3VsZG4ndCBodXJ0IHRvIG1ha2UgaXQgYSBiaXQgZmFzdGVyIGZvciBjID49IDB4MTEwMFxuZnVuY3Rpb24gaXNGdWxsV2lkdGgoYzogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGlmIChjIDwgMHgxMTAwKVxuICAgIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGMgPj0gMHgxMTAwICYmIGMgPD0gMHgxMTVGIHx8XG4gICAgYyA+PSAweDExQTMgJiYgYyA8PSAweDExQTcgfHxcbiAgICBjID49IDB4MTFGQSAmJiBjIDw9IDB4MTFGRiB8fFxuICAgIGMgPj0gMHgyMzI5ICYmIGMgPD0gMHgyMzJBIHx8XG4gICAgYyA+PSAweDJFODAgJiYgYyA8PSAweDJFOTkgfHxcbiAgICBjID49IDB4MkU5QiAmJiBjIDw9IDB4MkVGMyB8fFxuICAgIGMgPj0gMHgyRjAwICYmIGMgPD0gMHgyRkQ1IHx8XG4gICAgYyA+PSAweDJGRjAgJiYgYyA8PSAweDJGRkIgfHxcbiAgICBjID49IDB4MzAwMCAmJiBjIDw9IDB4MzAzRSB8fFxuICAgIGMgPj0gMHgzMDQxICYmIGMgPD0gMHgzMDk2IHx8XG4gICAgYyA+PSAweDMwOTkgJiYgYyA8PSAweDMwRkYgfHxcbiAgICBjID49IDB4MzEwNSAmJiBjIDw9IDB4MzEyRCB8fFxuICAgIGMgPj0gMHgzMTMxICYmIGMgPD0gMHgzMThFIHx8XG4gICAgYyA+PSAweDMxOTAgJiYgYyA8PSAweDMxQkEgfHxcbiAgICBjID49IDB4MzFDMCAmJiBjIDw9IDB4MzFFMyB8fFxuICAgIGMgPj0gMHgzMUYwICYmIGMgPD0gMHgzMjFFIHx8XG4gICAgYyA+PSAweDMyMjAgJiYgYyA8PSAweDMyNDcgfHxcbiAgICBjID49IDB4MzI1MCAmJiBjIDw9IDB4MzJGRSB8fFxuICAgIGMgPj0gMHgzMzAwICYmIGMgPD0gMHg0REJGIHx8XG4gICAgYyA+PSAweDRFMDAgJiYgYyA8PSAweEE0OEMgfHxcbiAgICBjID49IDB4QTQ5MCAmJiBjIDw9IDB4QTRDNiB8fFxuICAgIGMgPj0gMHhBOTYwICYmIGMgPD0gMHhBOTdDIHx8XG4gICAgYyA+PSAweEFDMDAgJiYgYyA8PSAweEQ3QTMgfHxcbiAgICBjID49IDB4RDdCMCAmJiBjIDw9IDB4RDdDNiB8fFxuICAgIGMgPj0gMHhEN0NCICYmIGMgPD0gMHhEN0ZCIHx8XG4gICAgYyA+PSAweEY5MDAgJiYgYyA8PSAweEZBRkYgfHxcbiAgICBjID49IDB4RkUxMCAmJiBjIDw9IDB4RkUxOSB8fFxuICAgIGMgPj0gMHhGRTMwICYmIGMgPD0gMHhGRTUyIHx8XG4gICAgYyA+PSAweEZFNTQgJiYgYyA8PSAweEZFNjYgfHxcbiAgICBjID49IDB4RkU2OCAmJiBjIDw9IDB4RkU2QiB8fFxuICAgIGMgPj0gMHhGRjAxICYmIGMgPD0gMHhGRjYwIHx8XG4gICAgYyA+PSAweEZGRTAgJiYgYyA8PSAweEZGRTY7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICBwdWJsaWMgJGJyZWFrcG9pbnRzOiBzdHJpbmdbXSA9IFtdO1xuICBwdWJsaWMgJGRlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuICBwcml2YXRlICRmcm9udE1hcmtlcnMgPSB7fTtcbiAgcHVibGljICRiYWNrTWFya2VycyA9IHt9O1xuICBwcml2YXRlICRtYXJrZXJJZCA9IDE7XG4gIHByaXZhdGUgJHVuZG9TZWxlY3QgPSB0cnVlO1xuICBwcml2YXRlICRkZWx0YXM7XG4gIHByaXZhdGUgJGRlbHRhc0RvYztcbiAgcHJpdmF0ZSAkZGVsdGFzRm9sZDtcbiAgcHJpdmF0ZSAkZnJvbVVuZG87XG5cbiAgcHJpdmF0ZSAkdXBkYXRlRm9sZFdpZGdldHM6ICgpID0+IGFueTtcbiAgcHJpdmF0ZSAkZm9sZERhdGE6IEZvbGRMaW5lW107XG4gIHB1YmxpYyBmb2xkV2lkZ2V0czogYW55W107XG4gIHB1YmxpYyBnZXRGb2xkV2lkZ2V0OiAocm93OiBudW1iZXIpID0+IGFueTtcbiAgcHVibGljIGdldEZvbGRXaWRnZXRSYW5nZTogKHJvdzogbnVtYmVyLCBmb3JjZU11bHRpbGluZT86IGJvb2xlYW4pID0+IFJhbmdlO1xuXG4gIHB1YmxpYyBkb2M6IEVkaXRvckRvY3VtZW50O1xuICBwcml2YXRlICRkZWZhdWx0VW5kb01hbmFnZXIgPSB7IHVuZG86IGZ1bmN0aW9uKCkgeyB9LCByZWRvOiBmdW5jdGlvbigpIHsgfSwgcmVzZXQ6IGZ1bmN0aW9uKCkgeyB9IH07XG4gIHByaXZhdGUgJHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcjtcbiAgcHJpdmF0ZSAkaW5mb3JtVW5kb01hbmFnZXI6IHsgY2FuY2VsOiAoKSA9PiB2b2lkOyBzY2hlZHVsZTogKCkgPT4gdm9pZCB9O1xuICBwdWJsaWMgYmdUb2tlbml6ZXI6IEJhY2tncm91bmRUb2tlbml6ZXI7XG4gIHB1YmxpYyAkbW9kaWZpZWQ7XG4gIHB1YmxpYyBzZWxlY3Rpb246IFNlbGVjdGlvbjtcbiAgcHJpdmF0ZSAkZG9jUm93Q2FjaGU6IG51bWJlcltdO1xuICBwcml2YXRlICR3cmFwRGF0YTogbnVtYmVyW11bXTtcbiAgcHJpdmF0ZSAkc2NyZWVuUm93Q2FjaGU6IG51bWJlcltdO1xuICBwcml2YXRlICRyb3dMZW5ndGhDYWNoZTtcbiAgcHJpdmF0ZSAkb3ZlcndyaXRlID0gZmFsc2U7XG4gIHB1YmxpYyAkc2VhcmNoSGlnaGxpZ2h0O1xuICBwcml2YXRlICRhbm5vdGF0aW9ucztcbiAgcHJpdmF0ZSAkYXV0b05ld0xpbmU7XG4gIHByaXZhdGUgZ2V0T3B0aW9uO1xuICBwcml2YXRlIHNldE9wdGlvbjtcbiAgcHJpdmF0ZSAkdXNlV29ya2VyO1xuICAvKipcbiAgICpcbiAgICovXG4gIHByaXZhdGUgJG1vZGVzOiB7IFtwYXRoOiBzdHJpbmddOiBNb2RlIH0gPSB7fTtcbiAgLyoqXG4gICAqXG4gICAqL1xuICBwdWJsaWMgJG1vZGU6IE1vZGUgPSBudWxsO1xuICBwcml2YXRlICRtb2RlSWQgPSBudWxsO1xuICBwcml2YXRlICR3b3JrZXI7XG4gIHByaXZhdGUgJG9wdGlvbnM7XG4gIHB1YmxpYyB0b2tlblJlOiBSZWdFeHA7XG4gIHB1YmxpYyBub25Ub2tlblJlOiBSZWdFeHA7XG4gIHB1YmxpYyAkc2Nyb2xsVG9wID0gMDtcbiAgcHJpdmF0ZSAkc2Nyb2xsTGVmdCA9IDA7XG4gIC8vIFdSQVBNT0RFXG4gIHByaXZhdGUgJHdyYXBBc0NvZGU7XG4gIHByaXZhdGUgJHdyYXBMaW1pdCA9IDgwO1xuICBwdWJsaWMgJHVzZVdyYXBNb2RlID0gZmFsc2U7XG4gIHByaXZhdGUgJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgIG1pbjogbnVsbCxcbiAgICBtYXg6IG51bGxcbiAgfTtcbiAgcHVibGljICR1cGRhdGluZztcbiAgcHVibGljIGxpbmVXaWRnZXRzID0gbnVsbDtcbiAgcHJpdmF0ZSAkb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gIHByaXZhdGUgJHN5bmNJbmZvcm1VbmRvTWFuYWdlcjogKCkgPT4gdm9pZDtcbiAgcHVibGljIG1lcmdlVW5kb0RlbHRhczogYm9vbGVhbjtcbiAgcHJpdmF0ZSAkdXNlU29mdFRhYnM6IGJvb2xlYW47XG4gIHByaXZhdGUgJHRhYlNpemU6IG51bWJlcjtcbiAgcHJpdmF0ZSAkd3JhcE1ldGhvZDtcbiAgcHJpdmF0ZSBzY3JlZW5XaWR0aDtcbiAgcHJpdmF0ZSBsaW5lV2lkZ2V0c1dpZHRoO1xuICBwcml2YXRlIGxpbmVXaWRnZXRXaWR0aDtcbiAgcHJpdmF0ZSAkZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoO1xuICAvL1xuICBwdWJsaWMgJHRhZ0hpZ2hsaWdodDtcbiAgcHVibGljICRicmFja2V0SGlnaGxpZ2h0OiBudW1iZXI7ICAgLy8gYSBtYXJrZXIuXG4gIHB1YmxpYyAkaGlnaGxpZ2h0TGluZU1hcmtlcjsgICAgICAgIC8vIE5vdCBhIG1hcmtlciFcbiAgLyoqXG4gICAqIEEgbnVtYmVyIGlzIGEgbWFya2VyIGlkZW50aWZpZXIsIG51bGwgaW5kaWNhdGVzIHRoYXQgbm8gc3VjaCBtYXJrZXIgZXhpc3RzLiBcbiAgICovXG4gIHB1YmxpYyAkc2VsZWN0aW9uTWFya2VyOiBudW1iZXIgPSBudWxsO1xuICBwcml2YXRlICRicmFja2V0TWF0Y2hlciA9IG5ldyBCcmFja2V0TWF0Y2godGhpcyk7XG5cbiAgY29uc3RydWN0b3IoZG9jOiBFZGl0b3JEb2N1bWVudCwgbW9kZT8sIGNiPzogKCkgPT4gYW55KSB7XG4gICAgc3VwZXIoKTtcbiAgICBjb25zb2xlLmxvZyhcIkVkaXRTZXNzaW9uIGNvbnN0cnVjdG9yKClcIilcbiAgICB0aGlzLiRmb2xkRGF0YSA9IFtdO1xuICAgIHRoaXMuJGZvbGREYXRhLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cbiAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLnNldERvY3VtZW50KGRvYyk7XG4gICAgdGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHRoaXMpO1xuXG4gICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgIHRoaXMuc2V0TW9kZShtb2RlLCBjYik7XG4gICAgX3NpZ25hbChcInNlc3Npb25cIiwgdGhpcyk7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgYEVkaXRTZXNzaW9uYCB0byBwb2ludCB0byBhIG5ldyBgRWRpdG9yRG9jdW1lbnRgLiBJZiBhIGBCYWNrZ3JvdW5kVG9rZW5pemVyYCBleGlzdHMsIGl0IGFsc28gcG9pbnRzIHRvIGBkb2NgLlxuICAgKiBAbWV0aG9kIHNldERvY3VtZW50XG4gICAqIEBwYXJhbSBkb2Mge0VkaXRvckRvY3VtZW50fSBUaGUgbmV3IGBFZGl0b3JEb2N1bWVudGAgdG8gdXNlLlxuICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgKi9cbiAgcHJpdmF0ZSBzZXREb2N1bWVudChkb2M6IEVkaXRvckRvY3VtZW50KTogdm9pZCB7XG4gICAgaWYgKCEoZG9jIGluc3RhbmNlb2YgRWRpdG9yRG9jdW1lbnQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkb2MgbXVzdCBiZSBhIEVkaXRvckRvY3VtZW50XCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5kb2MpIHtcbiAgICAgIHRoaXMuZG9jLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICB9XG5cbiAgICB0aGlzLmRvYyA9IGRvYztcbiAgICBkb2Mub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuXG4gICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlc2V0Q2FjaGVzKCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgYEVkaXRvckRvY3VtZW50YCBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAqIEByZXR1cm4ge0VkaXRvckRvY3VtZW50fVxuICAgKi9cbiAgcHVibGljIGdldERvY3VtZW50KCk6IEVkaXRvckRvY3VtZW50IHtcbiAgICByZXR1cm4gdGhpcy5kb2M7XG4gIH1cblxuICAvKipcbiAgICogQG1ldGhvZCAkcmVzZXRSb3dDYWNoZVxuICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlICRyZXNldFJvd0NhY2hlKGRvY1JvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgbCA9IHRoaXMuJGRvY1Jvd0NhY2hlLmxlbmd0aDtcbiAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgIGlmIChsID4gaSkge1xuICAgICAgdGhpcy4kZG9jUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICB2YXIgbG93ID0gMDtcbiAgICB2YXIgaGkgPSBjYWNoZUFycmF5Lmxlbmd0aCAtIDE7XG5cbiAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgICB9XG4gICAgICBlbHNlIGlmICh2YWwgPCBjKSB7XG4gICAgICAgIGhpID0gbWlkIC0gMTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBsb3cgLSAxO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgdGhpcy4kd3JhcERhdGEgPSBbXTtcbiAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBvbkNoYW5nZUZvbGQoZSkge1xuICAgIHZhciBmb2xkID0gZS5kYXRhO1xuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICB9XG5cbiAgcHJpdmF0ZSBvbkNoYW5nZShlKSB7XG4gICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZGVsdGEucmFuZ2Uuc3RhcnQucm93KTtcblxuICAgIHZhciByZW1vdmVkRm9sZHMgPSB0aGlzLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKTtcbiAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQucHVzaCh7XG4gICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgZm9sZHM6IHJlbW92ZWRGb2xkc1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICB9XG5cbiAgICB0aGlzLmJnVG9rZW5pemVyLiR1cGRhdGVPbkNoYW5nZShkZWx0YSk7XG4gICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gcGxhY2UuXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuZG9jLnNldFZhbHVlKHRleHQpO1xuICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgIHRoaXMuc2V0VW5kb01hbmFnZXIodGhpcy4kdW5kb01hbmFnZXIpO1xuICAgIHRoaXMuZ2V0VW5kb01hbmFnZXIoKS5yZXNldCgpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCBbW0VkaXRvckRvY3VtZW50IGBFZGl0b3JEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICogQHJldHVybnMge3N0cmluZ31cbiAgKiBAYWxpYXMgRWRpdFNlc3Npb24uZ2V0VmFsdWVcbiAgKiovXG4gIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmdldFZhbHVlKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRWRpdG9yRG9jdW1lbnQgYEVkaXRvckRvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAqKi9cbiAgcHVibGljIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAqKi9cbiAgcHVibGljIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiB7OkJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGV9XG4gICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgKlxuICAgKiBAcmVsYXRlZCBCYWNrZ3JvdW5kVG9rZW5pemVyLmdldFN0YXRlXG4gICAqKi9cbiAgcHVibGljIGdldFN0YXRlKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRTdGF0ZShyb3cpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyB0b2tlbml6aW5nIGF0IHRoZSByb3cgaW5kaWNhdGVkLiBSZXR1cm5zIGEgbGlzdCBvZiBvYmplY3RzIG9mIHRoZSB0b2tlbml6ZWQgcm93cy5cbiAgICogQG1ldGhvZCBnZXRUb2tlbnNcbiAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgKiovXG4gIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFRva2Vucyhyb3cpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgdG9rZW4gYXQgdGhlIGN1cnJlbnQgcm93LiBUaGUgb2JqZWN0IGhhcyB0d28gcHJvcGVydGllczogYGluZGV4YCBhbmQgYHN0YXJ0YC5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgZ2V0VG9rZW5BdChyb3c6IG51bWJlciwgY29sdW1uPzogbnVtYmVyKSB7XG4gICAgdmFyIHRva2VuczogeyB2YWx1ZTogc3RyaW5nIH1bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgIHZhciBjID0gMDtcbiAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgIGkgPSB0b2tlbnMubGVuZ3RoIC0gMTtcbiAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICBpZiAoYyA+PSBjb2x1bW4pXG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgIGlmICghdG9rZW4pXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB0b2tlbi5pbmRleCA9IGk7XG4gICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgIHJldHVybiB0b2tlbjtcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgdGhlIHVuZG8gbWFuYWdlci5cbiAgKiBAcGFyYW0ge1VuZG9NYW5hZ2VyfSB1bmRvTWFuYWdlciBUaGUgbmV3IHVuZG8gbWFuYWdlclxuICAqKi9cbiAgcHVibGljIHNldFVuZG9NYW5hZ2VyKHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcik6IHZvaWQge1xuICAgIHRoaXMuJHVuZG9NYW5hZ2VyID0gdW5kb01hbmFnZXI7XG4gICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuXG4gICAgaWYgKHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICBpZiAodW5kb01hbmFnZXIpIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmIChzZWxmLiRkZWx0YXNGb2xkLmxlbmd0aCkge1xuICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgIGdyb3VwOiBcImZvbGRcIixcbiAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRm9sZFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbGYuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZWxmLiRkZWx0YXNEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgZ3JvdXA6IFwiZG9jXCIsXG4gICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0RvY1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbGYuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlbGYuJGRlbHRhcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdW5kb01hbmFnZXIuZXhlY3V0ZSh7XG4gICAgICAgICAgICBhY3Rpb246IFwiYWNldXBkYXRlXCIsXG4gICAgICAgICAgICBhcmdzOiBbc2VsZi4kZGVsdGFzLCBzZWxmXSxcbiAgICAgICAgICAgIG1lcmdlOiBzZWxmLm1lcmdlVW5kb0RlbHRhc1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgIHNlbGYuJGRlbHRhcyA9IFtdO1xuICAgICAgfTtcbiAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyID0gZGVsYXllZENhbGwodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIGEgbmV3IGdyb3VwIGluIHVuZG8gaGlzdG9yeVxuICAgKiovXG4gIHByaXZhdGUgbWFya1VuZG9Hcm91cCgpIHtcbiAgICBpZiAodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHVuZG8gbWFuYWdlci5cbiAgKiovXG4gIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpIHtcbiAgICByZXR1cm4gdGhpcy4kdW5kb01hbmFnZXIgfHwgdGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBmb3IgdGFicy4gSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICoqL1xuICBwdWJsaWMgZ2V0VGFiU3RyaW5nKCkge1xuICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFwiXFx0XCI7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gIC8qKlxuICAqIFBhc3MgYHRydWVgIHRvIGVuYWJsZSB0aGUgdXNlIG9mIHNvZnQgdGFicy4gU29mdCB0YWJzIG1lYW5zIHlvdSdyZSB1c2luZyBzcGFjZXMgaW5zdGVhZCBvZiB0aGUgdGFiIGNoYXJhY3RlciAoYCdcXHQnYCkuXG4gICogQHBhcmFtIHtCb29sZWFufSB1c2VTb2Z0VGFicyBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnNcbiAgKiovXG4gIHByaXZhdGUgc2V0VXNlU29mdFRhYnModmFsKSB7XG4gICAgdGhpcy5zZXRPcHRpb24oXCJ1c2VTb2Z0VGFic1wiLCB2YWwpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgKiovXG4gIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpIHtcbiAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmICF0aGlzLiRtb2RlLiRpbmRlbnRXaXRoVGFicztcbiAgfVxuXG4gIC8qKlxuICAqIFNldCB0aGUgbnVtYmVyIG9mIHNwYWNlcyB0aGF0IGRlZmluZSBhIHNvZnQgdGFiLlxuICAqIEZvciBleGFtcGxlLCBwYXNzaW5nIGluIGA0YCB0cmFuc2Zvcm1zIHRoZSBzb2Z0IHRhYnMgdG8gYmUgZXF1aXZhbGVudCB0byBmb3VyIHNwYWNlcy5cbiAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gdGFiU2l6ZSBUaGUgbmV3IHRhYiBzaXplXG4gICoqL1xuICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgdGhpcy5zZXRPcHRpb24oXCJ0YWJTaXplXCIsIHRhYlNpemUpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgKiovXG4gIHB1YmxpYyBnZXRUYWJTaXplKCkge1xuICAgIHJldHVybiB0aGlzLiR0YWJTaXplO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGNoYXJhY3RlciBhdCB0aGUgcG9zaXRpb24gaXMgYSBzb2Z0IHRhYi5cbiAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHRvIGNoZWNrXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmIChwb3NpdGlvbi5jb2x1bW4gJSB0aGlzLiR0YWJTaXplID09PSAwKTtcbiAgfVxuXG4gIC8qKlxuICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLlxuICAqXG4gICogSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgKlxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgKiovXG4gIHB1YmxpYyBnZXRPdmVyd3JpdGUoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuJG92ZXJ3cml0ZTtcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAqKi9cbiAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICB0aGlzLnNldE92ZXJ3cml0ZSghdGhpcy4kb3ZlcndyaXRlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIGBjbGFzc05hbWVgIHRvIHRoZSBgcm93YCwgdG8gYmUgdXNlZCBmb3IgQ1NTIHN0eWxpbmdzIGFuZCB3aGF0bm90LlxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgKi9cbiAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLiRkZWNvcmF0aW9uc1tyb3ddKSB7XG4gICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gXCJcIjtcbiAgICB9XG4gICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGBjbGFzc05hbWVgIGZyb20gdGhlIGByb3dgLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgKi9cbiAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9ICh0aGlzLiRkZWNvcmF0aW9uc1tyb3ddIHx8IFwiXCIpLnJlcGxhY2UoXCIgXCIgKyBjbGFzc05hbWUsIFwiXCIpO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBhbiBhcnJheSBvZiBudW1iZXJzLCBpbmRpY2F0aW5nIHdoaWNoIHJvd3MgaGF2ZSBicmVha3BvaW50cy5cbiAgKiBAcmV0dXJucyB7W051bWJlcl19XG4gICoqL1xuICBwcml2YXRlIGdldEJyZWFrcG9pbnRzKCkge1xuICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgYSBicmVha3BvaW50IG9uIGV2ZXJ5IHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiBAcGFyYW0ge0FycmF5fSByb3dzIEFuIGFycmF5IG9mIHJvdyBpbmRpY2VzXG4gICpcbiAgKlxuICAqXG4gICoqL1xuICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd3NbaV1dID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgIH1cbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgYWxsIGJyZWFrcG9pbnRzIG9uIHRoZSByb3dzLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiovXG4gIHByaXZhdGUgY2xlYXJCcmVha3BvaW50cygpIHtcbiAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogU2V0cyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBDbGFzcyBvZiB0aGUgYnJlYWtwb2ludFxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgc2V0QnJlYWtwb2ludChyb3csIGNsYXNzTmFtZSkge1xuICAgIGlmIChjbGFzc05hbWUgPT09IHVuZGVmaW5lZClcbiAgICAgIGNsYXNzTmFtZSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICBlbHNlXG4gICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpbmRleFxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdykge1xuICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogQWRkcyBhIG5ldyBtYXJrZXIgdG8gdGhlIGdpdmVuIGBSYW5nZWAuIElmIGBpbkZyb250YCBpcyBgdHJ1ZWAsIGEgZnJvbnQgbWFya2VyIGlzIGRlZmluZWQsIGFuZCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGZpcmVzOyBvdGhlcndpc2UsIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBmaXJlcy5cbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSB0eXBlIElkZW50aWZ5IHRoZSB0eXBlIG9mIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgKlxuICAqXG4gICogQHJldHVybiB7TnVtYmVyfSBUaGUgbmV3IG1hcmtlciBpZFxuICAqKi9cbiAgcHVibGljIGFkZE1hcmtlcihyYW5nZTogUmFuZ2UsIGNsYXp6OiBzdHJpbmcsIHR5cGU6IGFueSwgaW5Gcm9udD86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAvLyBGSVhNRTogTmVlZCBtb3JlIHR5cGUgc2FmZXR5IGhlcmUuXG4gICAgdmFyIG1hcmtlciA9IHtcbiAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgIHR5cGU6IHR5cGUgfHwgXCJsaW5lXCIsXG4gICAgICByZW5kZXJlcjogdHlwZW9mIHR5cGUgPT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICBjbGF6ejogY2xhenosXG4gICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICBpZDogaWRcbiAgICB9O1xuXG4gICAgaWYgKGluRnJvbnQpIHtcbiAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgIH1cblxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtYXJrZXIgb2JqZWN0IHdpdGggdXBkYXRlIG1ldGhvZFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgICpcbiAgICpcbiAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgYWRkZWQgbWFya2VyXG4gICAqKi9cbiAgcHJpdmF0ZSBhZGREeW5hbWljTWFya2VyKG1hcmtlciwgaW5Gcm9udD8pIHtcbiAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICByZXR1cm47XG4gICAgdmFyIGlkID0gdGhpcy4kbWFya2VySWQrKztcbiAgICBtYXJrZXIuaWQgPSBpZDtcbiAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgIGlmIChpbkZyb250KSB7XG4gICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hcmtlcjtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgdGhlIG1hcmtlciB3aXRoIHRoZSBzcGVjaWZpZWQgSUQuIElmIHRoaXMgbWFya2VyIHdhcyBpbiBmcm9udCwgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAqXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIHJlbW92ZU1hcmtlcihtYXJrZXJJZCkge1xuICAgIHZhciBtYXJrZXIgPSB0aGlzLiRmcm9udE1hcmtlcnNbbWFya2VySWRdIHx8IHRoaXMuJGJhY2tNYXJrZXJzW21hcmtlcklkXTtcbiAgICBpZiAoIW1hcmtlcilcbiAgICAgIHJldHVybjtcblxuICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICBpZiAobWFya2VyKSB7XG4gICAgICBkZWxldGUgKG1hcmtlcnNbbWFya2VySWRdKTtcbiAgICAgIHRoaXMuX3NpZ25hbChtYXJrZXIuaW5Gcm9udCA/IFwiY2hhbmdlRnJvbnRNYXJrZXJcIiA6IFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIElEcyBvZiBhbGwgdGhlIG1hcmtlcnMsIGVpdGhlciBmcm9udCBvciBiYWNrLlxuICAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5Gcm9udCBJZiBgdHJ1ZWAsIGluZGljYXRlcyB5b3Ugb25seSB3YW50IGZyb250IG1hcmtlcnM7IGBmYWxzZWAgaW5kaWNhdGVzIG9ubHkgYmFjayBtYXJrZXJzXG4gICpcbiAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICoqL1xuICBwdWJsaWMgZ2V0TWFya2VycyhpbkZyb250OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgfVxuXG4gIHB1YmxpYyBoaWdobGlnaHQocmUpIHtcbiAgICBpZiAoIXRoaXMuJHNlYXJjaEhpZ2hsaWdodCkge1xuICAgICAgdmFyIGhpZ2hsaWdodCA9IG5ldyBTZWFyY2hIaWdobGlnaHQobnVsbCwgXCJhY2Vfc2VsZWN0ZWQtd29yZFwiLCBcInRleHRcIik7XG4gICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQgPSB0aGlzLmFkZER5bmFtaWNNYXJrZXIoaGlnaGxpZ2h0KTtcbiAgICB9XG4gICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gIH1cblxuICAvLyBleHBlcmltZW50YWxcbiAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdywgZW5kUm93LCBjbGF6eiwgaW5Gcm9udCkge1xuICAgIGlmICh0eXBlb2YgZW5kUm93ICE9IFwibnVtYmVyXCIpIHtcbiAgICAgIGNsYXp6ID0gZW5kUm93O1xuICAgICAgZW5kUm93ID0gc3RhcnRSb3c7XG4gICAgfVxuICAgIGlmICghY2xhenopXG4gICAgICBjbGF6eiA9IFwiYWNlX3N0ZXBcIjtcblxuICAgIHZhciByYW5nZTogYW55ID0gbmV3IFJhbmdlKHN0YXJ0Um93LCAwLCBlbmRSb3csIEluZmluaXR5KTtcbiAgICByYW5nZS5pZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICByZXR1cm4gcmFuZ2U7XG4gIH1cblxuICAvKlxuICAgKiBFcnJvcjpcbiAgICogIHtcbiAgICogICAgcm93OiAxMixcbiAgICogICAgY29sdW1uOiAyLCAvL2NhbiBiZSB1bmRlZmluZWRcbiAgICogICAgdGV4dDogXCJNaXNzaW5nIGFyZ3VtZW50XCIsXG4gICAqICAgIHR5cGU6IFwiZXJyb3JcIiAvLyBvciBcIndhcm5pbmdcIiBvciBcImluZm9cIlxuICAgKiAgfVxuICAgKi9cbiAgLyoqXG4gICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgZnVuY3Rpb25zIGVtaXRzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBIGxpc3Qgb2YgYW5ub3RhdGlvbnNcbiAgKlxuICAqKi9cbiAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgdGhpcy4kYW5ub3RhdGlvbnMgPSBhbm5vdGF0aW9ucztcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICoqL1xuICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy4kYW5ub3RhdGlvbnMgfHwgW107XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIGFsbCB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbi5cbiAgICogVGhpcyBmdW5jdGlvbiBhbHNvIHRyaWdnZXJzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICogVGhpcyBpcyBjYWxsZWQgYnkgdGhlIGxhbmd1YWdlIG1vZGVzIHdoZW4gdGhlIHdvcmtlciB0ZXJtaW5hdGVzLlxuICAgKi9cbiAgcHVibGljIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgdGhpcy5zZXRBbm5vdGF0aW9ucyhbXSk7XG4gIH1cblxuICAvKipcbiAgKiBJZiBgdGV4dGAgY29udGFpbnMgZWl0aGVyIHRoZSBuZXdsaW5lIChgXFxuYCkgb3IgY2FycmlhZ2UtcmV0dXJuICgnXFxyJykgY2hhcmFjdGVycywgYCRhdXRvTmV3TGluZWAgc3RvcmVzIHRoYXQgdmFsdWUuXG4gICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICpcbiAgKiovXG4gIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgdmFyIG1hdGNoID0gdGV4dC5tYXRjaCgvXi4qPyhcXHI/XFxuKS9tKTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gbWF0Y2hbMV07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBcIlxcblwiO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIEdpdmVuIGEgc3RhcnRpbmcgcm93IGFuZCBjb2x1bW4sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGBSYW5nZWAgb2YgdGhlIGZpcnN0IHdvcmQgYm91bmRhcnkgaXQgZmluZHMuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICpcbiAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgZ2V0V29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgIHZhciBsaW5lOiBzdHJpbmcgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgIHZhciBpblRva2VuID0gZmFsc2U7XG4gICAgaWYgKGNvbHVtbiA+IDApXG4gICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4gLSAxKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgaWYgKCFpblRva2VuKVxuICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgaWYgKGluVG9rZW4pXG4gICAgICB2YXIgcmUgPSB0aGlzLnRva2VuUmU7XG4gICAgZWxzZSBpZiAoL15cXHMrJC8udGVzdChsaW5lLnNsaWNlKGNvbHVtbiAtIDEsIGNvbHVtbiArIDEpKSlcbiAgICAgIHZhciByZSA9IC9cXHMvO1xuICAgIGVsc2VcbiAgICAgIHZhciByZSA9IHRoaXMubm9uVG9rZW5SZTtcblxuICAgIHZhciBzdGFydCA9IGNvbHVtbjtcbiAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICBkbyB7XG4gICAgICAgIHN0YXJ0LS07XG4gICAgICB9XG4gICAgICB3aGlsZSAoc3RhcnQgPj0gMCAmJiBsaW5lLmNoYXJBdChzdGFydCkubWF0Y2gocmUpKTtcbiAgICAgIHN0YXJ0Kys7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGNvbHVtbjtcbiAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgbGluZS5jaGFyQXQoZW5kKS5tYXRjaChyZSkpIHtcbiAgICAgIGVuZCsrO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgUmFuZ2Uocm93LCBzdGFydCwgcm93LCBlbmQpO1xuICB9XG5cbiAgLyoqXG4gICogR2V0cyB0aGUgcmFuZ2Ugb2YgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBzdGFydCBmcm9tXG4gICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIG51bWJlciB0byBzdGFydCBmcm9tXG4gICpcbiAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgKiovXG4gIHB1YmxpYyBnZXRBV29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUod29yZFJhbmdlLmVuZC5yb3cpO1xuXG4gICAgd2hpbGUgKGxpbmUuY2hhckF0KHdvcmRSYW5nZS5lbmQuY29sdW1uKS5tYXRjaCgvWyBcXHRdLykpIHtcbiAgICAgIHdvcmRSYW5nZS5lbmQuY29sdW1uICs9IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHdvcmRSYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAqIHs6RWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGUuZGVzY31cbiAgKiBAcGFyYW0ge1N0cmluZ30gbmV3TGluZU1vZGUgezpFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5wYXJhbX1cbiAgKlxuICAqXG4gICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGVcbiAgKiovXG4gIHByaXZhdGUgc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGU6IHN0cmluZykge1xuICAgIHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlKTtcbiAgfVxuXG4gIC8qKlxuICAqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCBuZXcgbGluZSBtb2RlLlxuICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgKiovXG4gIHByaXZhdGUgZ2V0TmV3TGluZU1vZGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCk7XG4gIH1cblxuICAvKipcbiAgKiBJZGVudGlmaWVzIGlmIHlvdSB3YW50IHRvIHVzZSBhIHdvcmtlciBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICogQHBhcmFtIHtCb29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXJcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRVc2VXb3JrZXIodXNlV29ya2VyKSB7IHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7IH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3b3JrZXJzIGFyZSBiZWluZyB1c2VkLlxuICAqKi9cbiAgcHJpdmF0ZSBnZXRVc2VXb3JrZXIoKSB7IHJldHVybiB0aGlzLiR1c2VXb3JrZXI7IH1cblxuICAvKipcbiAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgKiovXG4gIHByaXZhdGUgb25SZWxvYWRUb2tlbml6ZXIoZSkge1xuICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQocm93cy5maXJzdCk7XG4gICAgdGhpcy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICB9XG5cblxuICAvKipcbiAgKiBTZXRzIGEgbmV3IHRleHQgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LiBJZiBhIFtbQmFja2dyb3VuZFRva2VuaXplciBgQmFja2dyb3VuZFRva2VuaXplcmBdXSBpcyBzZXQsIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50IGlzIGFsc28gZW1pdHRlZC5cbiAgKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFNldCBhIG5ldyB0ZXh0IG1vZGVcbiAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAqXG4gICoqL1xuICBwcml2YXRlIHNldE1vZGUobW9kZSwgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICBpZiAobW9kZSAmJiB0eXBlb2YgbW9kZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgaWYgKG1vZGUuZ2V0VG9rZW5pemVyKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiRWRpdFNlc3Npb24uc2V0TW9kZSgpIGNhbGxpbmcgb25DaGFuZ2VNb2RlXCIpXG4gICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUobW9kZSk7XG4gICAgICB9XG4gICAgICB2YXIgb3B0aW9ucyA9IG1vZGU7XG4gICAgICB2YXIgcGF0aCA9IG9wdGlvbnMucGF0aDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBwYXRoID0gbW9kZSB8fCBcImFjZS9tb2RlL3RleHRcIjtcbiAgICB9XG5cbiAgICAvLyB0aGlzIGlzIG5lZWRlZCBpZiBhY2UgaXNuJ3Qgb24gcmVxdWlyZSBwYXRoIChlLmcgdGVzdHMgaW4gbm9kZSlcbiAgICBpZiAoIXRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSkge1xuICAgICAgdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdID0gbmV3IE1vZGUoKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpIHtcbiAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICBjYiAmJiBjYigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBsb2FkIG9uIGRlbWFuZFxuICAgIHRoaXMuJG1vZGVJZCA9IHBhdGg7XG4gICAgbG9hZE1vZHVsZShbXCJtb2RlXCIsIHBhdGhdLCBmdW5jdGlvbihtOiBhbnkpIHtcbiAgICAgIGlmICh0aGlzLiRtb2RlSWQgIT09IHBhdGgpXG4gICAgICAgIHJldHVybiBjYiAmJiBjYigpO1xuICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKVxuICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgIGlmIChtICYmIG0uTW9kZSkge1xuICAgICAgICBtID0gbmV3IG0uTW9kZShvcHRpb25zKTtcbiAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgdGhpcy4kbW9kZXNbcGF0aF0gPSBtO1xuICAgICAgICAgIG0uJGlkID0gcGF0aDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUobSk7XG4gICAgICAgIGNiICYmIGNiKCk7XG4gICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKTtcblxuICAgIC8vIHNldCBtb2RlIHRvIHRleHQgdW50aWwgbG9hZGluZyBpcyBmaW5pc2hlZFxuICAgIGlmICghdGhpcy4kbW9kZSkge1xuICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSwgdHJ1ZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlKG1vZGU6IE1vZGUsICRpc1BsYWNlaG9sZGVyPzogYm9vbGVhbik6IHZvaWQge1xuICAgIGNvbnNvbGUubG9nKFwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlck1vZGVcIilcbiAgICBpZiAoISRpc1BsYWNlaG9sZGVyKSB7XG4gICAgICB0aGlzLiRtb2RlSWQgPSBtb2RlLiRpZDtcbiAgICB9XG4gICAgaWYgKHRoaXMuJG1vZGUgPT09IG1vZGUpIHtcbiAgICAgIC8vIE5vdGhpbmcgdG8gZG8uIEJlIGlkZW1wb3RlbnQuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICAvLyBUT0RPOiBXb3VsZG4ndCBpdCBtYWtlIG1vcmUgc2Vuc2UgdG8gc3RvcCB0aGUgd29ya2VyLCB0aGVuIGNoYW5nZSB0aGUgbW9kZT9cbiAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG5cbiAgICBpZiAodGhpcy4kdXNlV29ya2VyKSB7XG4gICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgIH1cblxuICAgIHZhciB0b2tlbml6ZXIgPSBtb2RlLmdldFRva2VuaXplcigpO1xuXG4gICAgaWYgKHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgIHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIgPSBuZXcgQmFja2dyb3VuZFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuYWRkRXZlbnRMaXN0ZW5lcihcInVwZGF0ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIF9zZWxmLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgIH1cblxuICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcblxuICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICB0aGlzLm5vblRva2VuUmUgPSBtb2RlLm5vblRva2VuUmU7XG5cblxuICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgIHRoaXMuJG9wdGlvbnMud3JhcE1ldGhvZC5zZXQuY2FsbCh0aGlzLCB0aGlzLiR3cmFwTWV0aG9kKTtcbiAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZS5mb2xkaW5nUnVsZXMpO1xuICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpIHtcbiAgICBjb25zb2xlLmxvZyhcIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyXCIpXG4gICAgaWYgKHRoaXMuJHdvcmtlcikge1xuICAgICAgdGhpcy4kd29ya2VyLnRlcm1pbmF0ZSgpO1xuICAgIH1cbiAgICB0aGlzLiR3b3JrZXIgPSBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKSB7XG4gICAgY29uc29sZS5sb2coXCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXJcIilcbiAgICB0cnkge1xuICAgICAgdGhpcy4kd29ya2VyID0gdGhpcy4kbW9kZS5jcmVhdGVXb3JrZXIodGhpcyk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICB0aGlzLiR3b3JrZXIgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGV4dCBtb2RlLlxuICAqIEByZXR1cm5zIHtUZXh0TW9kZX0gVGhlIGN1cnJlbnQgdGV4dCBtb2RlXG4gICoqL1xuICBwdWJsaWMgZ2V0TW9kZSgpIHtcbiAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgfVxuXG4gIC8qKlxuICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuICAqXG4gICoqL1xuICBwdWJsaWMgc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG4gICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgIGlmICh0aGlzLiRzY3JvbGxUb3AgPT09IHNjcm9sbFRvcCB8fCBpc05hTihzY3JvbGxUb3ApKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgc2Nyb2xsVG9wKTtcbiAgfVxuXG4gIC8qKlxuICAqIFtSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgdG9wIG9mIHRoZSBlZGl0b3IgYW5kIHRoZSB0b3Btb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLmdldFNjcm9sbFRvcH1cbiAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAqKi9cbiAgcHVibGljIGdldFNjcm9sbFRvcCgpIHtcbiAgICByZXR1cm4gdGhpcy4kc2Nyb2xsVG9wO1xuICB9XG5cbiAgLyoqXG4gICogW1NldHMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5zZXRTY3JvbGxMZWZ0fVxuICAqKi9cbiAgcHVibGljIHNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG4gICAgLy8gc2Nyb2xsTGVmdCA9IE1hdGgucm91bmQoc2Nyb2xsTGVmdCk7XG4gICAgaWYgKHRoaXMuJHNjcm9sbExlZnQgPT09IHNjcm9sbExlZnQgfHwgaXNOYU4oc2Nyb2xsTGVmdCkpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLiRzY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHNjcm9sbExlZnQpO1xuICB9XG5cbiAgLyoqXG4gICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICoqL1xuICBwdWJsaWMgZ2V0U2Nyb2xsTGVmdCgpIHtcbiAgICByZXR1cm4gdGhpcy4kc2Nyb2xsTGVmdDtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSBzY3JlZW4uXG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgIHRoaXMuJGNvbXB1dGVXaWR0aCgpO1xuICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuZ2V0TGluZVdpZGdldE1heFdpZHRoKCksIHRoaXMuc2NyZWVuV2lkdGgpO1xuICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSB7XG4gICAgaWYgKHRoaXMubGluZVdpZGdldHNXaWR0aCAhPSBudWxsKSByZXR1cm4gdGhpcy5saW5lV2lkZ2V0c1dpZHRoO1xuICAgIHZhciB3aWR0aCA9IDA7XG4gICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgd2lkdGggPSB3LnNjcmVlbldpZHRoO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLmxpbmVXaWRnZXRXaWR0aCA9IHdpZHRoO1xuICB9XG5cbiAgcHVibGljICRjb21wdXRlV2lkdGgoZm9yY2U/KSB7XG4gICAgaWYgKHRoaXMuJG1vZGlmaWVkIHx8IGZvcmNlKSB7XG4gICAgICB0aGlzLiRtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoID0gdGhpcy4kd3JhcExpbWl0O1xuXG4gICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgdmFyIGNhY2hlID0gdGhpcy4kcm93TGVuZ3RoQ2FjaGU7XG4gICAgICB2YXIgbG9uZ2VzdFNjcmVlbkxpbmUgPSAwO1xuICAgICAgdmFyIGZvbGRJbmRleCA9IDA7XG4gICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXhdO1xuICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICB2YXIgbGVuID0gbGluZXMubGVuZ3RoO1xuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGlmIChpID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgaSA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgIGlmIChpID49IGxlbilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kZm9sZERhdGFbZm9sZEluZGV4KytdO1xuICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2FjaGVbaV0gPT0gbnVsbClcbiAgICAgICAgICBjYWNoZVtpXSA9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmVzW2ldKVswXTtcblxuICAgICAgICBpZiAoY2FjaGVbaV0gPiBsb25nZXN0U2NyZWVuTGluZSlcbiAgICAgICAgICBsb25nZXN0U2NyZWVuTGluZSA9IGNhY2hlW2ldO1xuICAgICAgfVxuICAgICAgdGhpcy5zY3JlZW5XaWR0aCA9IGxvbmdlc3RTY3JlZW5MaW5lO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgdmVyYmF0aW0gY29weSBvZiB0aGUgZ2l2ZW4gbGluZSBhcyBpdCBpcyBpbiB0aGUgZG9jdW1lbnRcbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHJldHJpZXZlIGZyb21cbiAgICpcbiAgKlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAqXG4gICoqL1xuICBwdWJsaWMgZ2V0TGluZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBmaXJzdCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgKlxuICAgKiBAcmV0dXJucyB7W1N0cmluZ119XG4gICAqXG4gICAqKi9cbiAgcHVibGljIGdldExpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIG51bWJlciBvZiByb3dzIGluIHRoZSBkb2N1bWVudC5cbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICoqL1xuICBwdWJsaWMgZ2V0TGVuZ3RoKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIHs6RWRpdG9yRG9jdW1lbnQuZ2V0VGV4dFJhbmdlLmRlc2N9XG4gICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIFRoZSByYW5nZSB0byB3b3JrIHdpdGhcbiAgICpcbiAgICogQHJldHVybnMge3N0cmluZ31cbiAgICoqL1xuICBwdWJsaWMgZ2V0VGV4dFJhbmdlKHJhbmdlOiBSYW5nZSkge1xuICAgIHJldHVybiB0aGlzLmRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UgfHwgdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gIH1cblxuICAvKipcbiAgICogSW5zZXJ0cyBhIGJsb2NrIG9mIGB0ZXh0YCBhbmQgdGhlIGluZGljYXRlZCBgcG9zaXRpb25gLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHtyb3csIGNvbHVtbn0gdG8gc3RhcnQgaW5zZXJ0aW5nIGF0XG4gICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IGxpbmUgb2YgYHRleHRgLiBJZiB0aGUgbGVuZ3RoIG9mIGB0ZXh0YCBpcyAwLCB0aGlzIGZ1bmN0aW9uIHNpbXBseSByZXR1cm5zIGBwb3NpdGlvbmAuXG4gICAqXG4gICAqXG4gICAqKi9cbiAgcHVibGljIGluc2VydChwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdGV4dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmluc2VydChwb3NpdGlvbiwgdGV4dCk7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyB0aGUgYHJhbmdlYCBmcm9tIHRoZSBkb2N1bWVudC5cbiAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVtb3ZlXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgKlxuICAgKiBAcmVsYXRlZCBFZGl0b3JEb2N1bWVudC5yZW1vdmVcbiAgICpcbiAgICoqL1xuICBwdWJsaWMgcmVtb3ZlKHJhbmdlKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gIH1cblxuICAvKipcbiAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGRlbHRhcyBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCBbSWYgYHRydWVgLCBkb2Vzbid0IHNlbGVjdCB0aGUgcmFuZ2Ugb2Ygd2hlcmUgdGhlIGNoYW5nZSBvY2N1cmVkXXs6ICNkb250U2VsZWN0fVxuICAgKlxuICAgKlxuICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgdW5kb0NoYW5nZXMoZGVsdGFzLCBkb250U2VsZWN0PzogYm9vbGVhbikge1xuICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICB2YXIgbGFzdFVuZG9SYW5nZSA9IG51bGw7XG4gICAgZm9yICh2YXIgaSA9IGRlbHRhcy5sZW5ndGggLSAxOyBpICE9IC0xOyBpLS0pIHtcbiAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgIHRoaXMuZG9jLnJldmVydERlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgdHJ1ZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWx0YS5kZWx0YXMuZm9yRWFjaChmdW5jdGlvbihmb2xkRGVsdGEpIHtcbiAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGREZWx0YS5mb2xkcyk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZS1pbXBsZW1lbnRzIGEgcHJldmlvdXNseSB1bmRvbmUgY2hhbmdlIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAqIEBwYXJhbSB7QXJyYXl9IGRlbHRhcyBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCB7OmRvbnRTZWxlY3R9XG4gICAqXG4gICpcbiAgICogQHJldHVybnMge1JhbmdlfVxuICAqKi9cbiAgcHVibGljIHJlZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICBpZiAoIWRlbHRhcy5sZW5ndGgpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgdGhpcy5kb2MuYXBwbHlEZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIGZhbHNlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgcmV0dXJuIGxhc3RVbmRvUmFuZ2U7XG4gIH1cblxuICAvKipcbiAgICogRW5hYmxlcyBvciBkaXNhYmxlcyBoaWdobGlnaHRpbmcgb2YgdGhlIHJhbmdlIHdoZXJlIGFuIHVuZG8gb2NjdXJlZC5cbiAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgSWYgYHRydWVgLCBzZWxlY3RzIHRoZSByYW5nZSBvZiB0aGUgcmVpbnNlcnRlZCBjaGFuZ2VcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRVbmRvU2VsZWN0KGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuJHVuZG9TZWxlY3QgPSBlbmFibGU7XG4gIH1cblxuICBwcml2YXRlICRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhczogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH1bXSwgaXNVbmRvOiBib29sZWFuLCBsYXN0VW5kb1JhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICBmdW5jdGlvbiBpc0luc2VydChkZWx0YTogeyBhY3Rpb246IHN0cmluZyB9KSB7XG4gICAgICB2YXIgaW5zZXJ0ID0gZGVsdGEuYWN0aW9uID09PSBcImluc2VydFRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0TGluZXNcIjtcbiAgICAgIHJldHVybiBpc1VuZG8gPyAhaW5zZXJ0IDogaW5zZXJ0O1xuICAgIH1cblxuICAgIHZhciBkZWx0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gPSBkZWx0YXNbMF07XG4gICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICB2YXIgcG9pbnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgdmFyIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5lbmQpO1xuICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICBwb2ludCA9IGRlbHRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQoZGVsdGEucmFuZ2Uuc3RhcnQucm93LCBkZWx0YS5yYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2UuZW5kO1xuICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IDEpIHtcbiAgICAgICAgICByYW5nZS5zZXRFbmQoZGVsdGEucmFuZ2UuZW5kLnJvdywgZGVsdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgLy8gSWYgdHJ1ZSwgbWVyZ2UgdGhlIHJhbmdlcy5cbiAgICBpZiAobGFzdFVuZG9SYW5nZSAhPSBudWxsKSB7XG4gICAgICBpZiAoUmFuZ2UuY29tcGFyZVBvaW50cyhsYXN0VW5kb1JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydCkgPT09IDApIHtcbiAgICAgICAgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgbGFzdFVuZG9SYW5nZS5lbmQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICB9XG5cbiAgICAgIHZhciBjbXAgPSBsYXN0VW5kb1JhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICBpZiAoY21wID09PSAxKSB7XG4gICAgICAgIHJhbmdlLnNldFN0YXJ0KGxhc3RVbmRvUmFuZ2Uuc3RhcnQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChjbXAgPT09IC0xKSB7XG4gICAgICAgIHJhbmdlLnNldEVuZChsYXN0VW5kb1JhbmdlLmVuZC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH1cblxuICAvKipcbiAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAqXG4gICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVwbGFjZVxuICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byB1c2UgYXMgYSByZXBsYWNlbWVudFxuICAqIEByZXR1cm5zIHtPYmplY3R9IEFuIG9iamVjdCBjb250YWluaW5nIHRoZSBmaW5hbCByb3cgYW5kIGNvbHVtbiwgbGlrZSB0aGlzOlxuICAqIGBgYFxuICAqIHtyb3c6IGVuZFJvdywgY29sdW1uOiAwfVxuICAqIGBgYFxuICAqIElmIHRoZSB0ZXh0IGFuZCByYW5nZSBhcmUgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgY3VycmVudCBgcmFuZ2Uuc3RhcnRgIHZhbHVlLlxuICAqIElmIHRoZSB0ZXh0IGlzIHRoZSBleGFjdCBzYW1lIGFzIHdoYXQgY3VycmVudGx5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5lbmRgIHZhbHVlLlxuICAqXG4gICpcbiAgKlxuICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnJlcGxhY2VcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgcmVwbGFjZShyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLmRvYy5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcbiAgfVxuXG4gIC8qKlxuICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAqICBgYGBqc29uXG4gICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICogIGBgYFxuICAgKiBAcGFyYW0ge1JhbmdlfSBmcm9tUmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAqIEByZXR1cm5zIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICpcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KSB7XG4gICAgdmFyIHRleHQgPSB0aGlzLmdldFRleHRSYW5nZShmcm9tUmFuZ2UpO1xuICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgdmFyIHJvd0RpZmY6IG51bWJlcjtcbiAgICB2YXIgY29sRGlmZjogbnVtYmVyO1xuXG4gICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgIGlmICghY29weSkge1xuICAgICAgdGhpcy5yZW1vdmUoZnJvbVJhbmdlKTtcbiAgICAgIHJvd0RpZmYgPSBmcm9tUmFuZ2Uuc3RhcnQucm93IC0gZnJvbVJhbmdlLmVuZC5yb3c7XG4gICAgICBjb2xEaWZmID0gcm93RGlmZiA/IC1mcm9tUmFuZ2UuZW5kLmNvbHVtbiA6IGZyb21SYW5nZS5zdGFydC5jb2x1bW4gLSBmcm9tUmFuZ2UuZW5kLmNvbHVtbjtcbiAgICAgIGlmIChjb2xEaWZmKSB7XG4gICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgdG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodG9SYW5nZS5lbmQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2UuZW5kLmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChyb3dEaWZmICYmIHRvUmFuZ2Uuc3RhcnQucm93ID49IGZyb21SYW5nZS5lbmQucm93KSB7XG4gICAgICAgIHRvUmFuZ2Uuc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRvUmFuZ2UuZW5kID0gdGhpcy5pbnNlcnQodG9SYW5nZS5zdGFydCwgdGV4dCk7XG4gICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgICBpZiAoeC5zdGFydC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgeC5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgIHguZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIHguc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgIHguZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICByZXR1cm4geDtcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdG9SYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAqIEluZGVudHMgYWxsIHRoZSByb3dzLCBmcm9tIGBzdGFydFJvd2AgdG8gYGVuZFJvd2AgKGluY2x1c2l2ZSksIGJ5IHByZWZpeGluZyBlYWNoIHJvdyB3aXRoIHRoZSB0b2tlbiBpbiBgaW5kZW50U3RyaW5nYC5cbiAgKlxuICAqIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgKiBAcGFyYW0ge051bWJlcn0gc3RhcnRSb3cgU3RhcnRpbmcgcm93XG4gICogQHBhcmFtIHtOdW1iZXJ9IGVuZFJvdyBFbmRpbmcgcm93XG4gICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGluZGVudFJvd3Moc3RhcnRSb3csIGVuZFJvdywgaW5kZW50U3RyaW5nKSB7XG4gICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDw9IGVuZFJvdzsgcm93KyspXG4gICAgICB0aGlzLmluc2VydCh7IHJvdzogcm93LCBjb2x1bW46IDAgfSwgaW5kZW50U3RyaW5nKTtcbiAgfVxuXG4gIC8qKlxuICAqIE91dGRlbnRzIGFsbCB0aGUgcm93cyBkZWZpbmVkIGJ5IHRoZSBgc3RhcnRgIGFuZCBgZW5kYCBwcm9wZXJ0aWVzIG9mIGByYW5nZWAuXG4gICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSByYW5nZSBvZiByb3dzXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIG91dGRlbnRSb3dzKHJhbmdlOiBSYW5nZSkge1xuICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICB2YXIgc2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuXG4gICAgZm9yICh2YXIgaSA9IHJvd1JhbmdlLnN0YXJ0LnJvdzsgaSA8PSByb3dSYW5nZS5lbmQucm93OyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKGkpO1xuXG4gICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNpemU7ICsrailcbiAgICAgICAgaWYgKGxpbmUuY2hhckF0KGopICE9ICcgJylcbiAgICAgICAgICBicmVhaztcbiAgICAgIGlmIChqIDwgc2l6ZSAmJiBsaW5lLmNoYXJBdChqKSA9PSAnXFx0Jykge1xuICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSBqO1xuICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gaiArIDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gajtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVtb3ZlKGRlbGV0ZVJhbmdlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlICRtb3ZlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBkaXI6IG51bWJlcikge1xuICAgIGZpcnN0Um93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cpO1xuICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgaWYgKGRpciA8IDApIHtcbiAgICAgIHZhciByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyArIGRpcik7XG4gICAgICBpZiAocm93IDwgMCkgcmV0dXJuIDA7XG4gICAgICB2YXIgZGlmZiA9IHJvdyAtIGZpcnN0Um93O1xuICAgIH0gZWxzZSBpZiAoZGlyID4gMCkge1xuICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93ICsgZGlyKTtcbiAgICAgIGlmIChyb3cgPiB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpIHJldHVybiAwO1xuICAgICAgdmFyIGRpZmYgPSByb3cgLSBsYXN0Um93O1xuICAgIH0gZWxzZSB7XG4gICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICB9XG5cbiAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoZmlyc3RSb3csIDAsIGxhc3RSb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgIHJldHVybiB4O1xuICAgIH0pO1xuXG4gICAgdmFyIGxpbmVzID0gZGlyID09IDBcbiAgICAgID8gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpXG4gICAgICA6IHRoaXMuZG9jLnJlbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICB0aGlzLmRvYy5pbnNlcnRMaW5lcyhmaXJzdFJvdyArIGRpZmYsIGxpbmVzKTtcbiAgICBmb2xkcy5sZW5ndGggJiYgdGhpcy5hZGRGb2xkcyhmb2xkcyk7XG4gICAgcmV0dXJuIGRpZmY7XG4gIH1cbiAgLyoqXG4gICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IHVwIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgdXBcbiAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgdXBcbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAqXG4gICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBtb3ZlTGluZXNVcChmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIC0xKTtcbiAgfVxuXG4gIC8qKlxuICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCBkb3duIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgZG93blxuICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSBkb3duXG4gICogQHJldHVybnMge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgKlxuICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50Lmluc2VydExpbmVzXG4gICoqL1xuICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAxKTtcbiAgfVxuXG4gIC8qKlxuICAqIER1cGxpY2F0ZXMgYWxsIHRoZSB0ZXh0IGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gZHVwbGljYXRlXG4gICogQHJldHVybnMge051bWJlcn0gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBkdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykge1xuICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDApO1xuICB9XG5cblxuICBwcml2YXRlICRjbGlwUm93VG9Eb2N1bWVudChyb3cpIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4ocm93LCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpKTtcbiAgfVxuXG4gIHByaXZhdGUgJGNsaXBDb2x1bW5Ub1Jvdyhyb3csIGNvbHVtbikge1xuICAgIGlmIChjb2x1bW4gPCAwKVxuICAgICAgcmV0dXJuIDA7XG4gICAgcmV0dXJuIE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gIH1cblxuXG4gIHByaXZhdGUgJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgY29sdW1uID0gTWF0aC5tYXgoMCwgY29sdW1uKTtcblxuICAgIGlmIChyb3cgPCAwKSB7XG4gICAgICByb3cgPSAwO1xuICAgICAgY29sdW1uID0gMDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICBpZiAocm93ID49IGxlbikge1xuICAgICAgICByb3cgPSBsZW4gLSAxO1xuICAgICAgICBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbiAtIDEpLmxlbmd0aDtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBjb2x1bW4gPSBNYXRoLm1pbih0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoLCBjb2x1bW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByb3c6IHJvdyxcbiAgICAgIGNvbHVtbjogY29sdW1uXG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyAkY2xpcFJhbmdlVG9Eb2N1bWVudChyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IDApIHtcbiAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IDA7XG4gICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgcmFuZ2Uuc3RhcnQucm93LFxuICAgICAgICByYW5nZS5zdGFydC5jb2x1bW5cbiAgICAgICk7XG4gICAgfVxuXG4gICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICBpZiAocmFuZ2UuZW5kLnJvdyA+IGxlbikge1xuICAgICAgcmFuZ2UuZW5kLnJvdyA9IGxlbjtcbiAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbikubGVuZ3RoO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgIHJhbmdlLmVuZC5yb3csXG4gICAgICAgIHJhbmdlLmVuZC5jb2x1bW5cbiAgICAgICk7XG4gICAgfVxuICAgIHJldHVybiByYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHdoZXRoZXIgb3Igbm90IGxpbmUgd3JhcHBpbmcgaXMgZW5hYmxlZC4gSWYgYHVzZVdyYXBNb2RlYCBpcyBkaWZmZXJlbnQgdGhhbiB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudCBpcyBlbWl0dGVkLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVdyYXBNb2RlIEVuYWJsZSAob3IgZGlzYWJsZSkgd3JhcCBtb2RlXG4gICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgc2V0VXNlV3JhcE1vZGUodXNlV3JhcE1vZGU6IGJvb2xlYW4pIHtcbiAgICBpZiAodXNlV3JhcE1vZGUgIT0gdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHRoaXMuJHVzZVdyYXBNb2RlID0gdXNlV3JhcE1vZGU7XG4gICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuXG4gICAgICAvLyBJZiB3cmFwTW9kZSBpcyBhY3RpdmFlZCwgdGhlIHdyYXBEYXRhIGFycmF5IGhhcyB0byBiZSBpbml0aWFsaXplZC5cbiAgICAgIGlmICh1c2VXcmFwTW9kZSkge1xuICAgICAgICB2YXIgbGVuID0gdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBBcnJheTxudW1iZXJbXT4obGVuKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgbGVuIC0gMSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgYHRydWVgIGlmIHdyYXAgbW9kZSBpcyBiZWluZyB1c2VkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgKiovXG4gIGdldFVzZVdyYXBNb2RlKCkge1xuICAgIHJldHVybiB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgfVxuXG4gIC8vIEFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIG1vdmUgZnJlZWx5IGJldHdlZW4gbWluIGFuZCBtYXguIEVpdGhlclxuICAvLyBwYXJhbWV0ZXIgY2FuIGJlIG51bGwgdG8gYWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gYmUgdW5jb25zdHJhaW5lZFxuICAvLyBpbiB0aGF0IGRpcmVjdGlvbi4gT3Igc2V0IGJvdGggcGFyYW1ldGVycyB0byB0aGUgc2FtZSBudW1iZXIgdG8gcGluXG4gIC8vIHRoZSBsaW1pdCB0byB0aGF0IHZhbHVlLlxuICAvKipcbiAgICogU2V0cyB0aGUgYm91bmRhcmllcyBvZiB3cmFwLiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IG1pbiBUaGUgbWluaW11bSB3cmFwIHZhbHVlICh0aGUgbGVmdCBzaWRlIHdyYXApXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBtYXggVGhlIG1heGltdW0gd3JhcCB2YWx1ZSAodGhlIHJpZ2h0IHNpZGUgd3JhcClcbiAgICpcbiAgKlxuICAqKi9cbiAgc2V0V3JhcExpbWl0UmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbiAhPT0gbWluIHx8IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heCAhPT0gbWF4KSB7XG4gICAgICB0aGlzLiR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgbWluOiBtaW4sXG4gICAgICAgIG1heDogbWF4XG4gICAgICB9O1xuICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgLy8gVGhpcyB3aWxsIGZvcmNlIGEgcmVjYWxjdWxhdGlvbiBvZiB0aGUgd3JhcCBsaW1pdFxuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkZXNpcmVkTGltaXQgVGhlIG5ldyB3cmFwIGxpbWl0XG4gICogQHJldHVybnMge0Jvb2xlYW59XG4gICpcbiAgKiBAcHJpdmF0ZVxuICAqKi9cbiAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICB2YXIgbGltaXRzID0gdGhpcy4kd3JhcExpbWl0UmFuZ2VcbiAgICBpZiAobGltaXRzLm1heCA8IDApXG4gICAgICBsaW1pdHMgPSB7IG1pbjogJHByaW50TWFyZ2luLCBtYXg6ICRwcmludE1hcmdpbiB9O1xuICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICBpZiAod3JhcExpbWl0ICE9IHRoaXMuJHdyYXBMaW1pdCAmJiB3cmFwTGltaXQgPiAxKSB7XG4gICAgICB0aGlzLiR3cmFwTGltaXQgPSB3cmFwTGltaXQ7XG4gICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTGltaXRcIik7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSAkY29uc3RyYWluV3JhcExpbWl0KHdyYXBMaW1pdDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChtaW4pXG4gICAgICB3cmFwTGltaXQgPSBNYXRoLm1heChtaW4sIHdyYXBMaW1pdCk7XG5cbiAgICBpZiAobWF4KVxuICAgICAgd3JhcExpbWl0ID0gTWF0aC5taW4obWF4LCB3cmFwTGltaXQpO1xuXG4gICAgcmV0dXJuIHdyYXBMaW1pdDtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHdyYXAgbGltaXQuXG4gICogQHJldHVybnMge051bWJlcn0gVGhlIHdyYXAgbGltaXQuXG4gICoqL1xuICBwcml2YXRlIGdldFdyYXBMaW1pdCgpIHtcbiAgICByZXR1cm4gdGhpcy4kd3JhcExpbWl0O1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGxpbmUgbGVuZ3RoIGZvciBzb2Z0IHdyYXAgaW4gdGhlIGVkaXRvci4gTGluZXMgd2lsbCBicmVha1xuICAgKiAgYXQgYSBtaW5pbXVtIG9mIHRoZSBnaXZlbiBsZW5ndGggbWludXMgMjAgY2hhcnMgYW5kIGF0IGEgbWF4aW11bVxuICAgKiAgb2YgdGhlIGdpdmVuIG51bWJlciBvZiBjaGFycy5cbiAgICogQHBhcmFtIHtudW1iZXJ9IGxpbWl0IFRoZSBtYXhpbXVtIGxpbmUgbGVuZ3RoIGluIGNoYXJzLCBmb3Igc29mdCB3cmFwcGluZyBsaW5lcy5cbiAgICovXG4gIHByaXZhdGUgc2V0V3JhcExpbWl0KGxpbWl0KSB7XG4gICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShsaW1pdCwgbGltaXQpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBhbiBvYmplY3QgdGhhdCBkZWZpbmVzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIG9mIHRoZSB3cmFwIGxpbWl0OyBpdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAqXG4gICogICAgIHsgbWluOiB3cmFwTGltaXRSYW5nZV9taW4sIG1heDogd3JhcExpbWl0UmFuZ2VfbWF4IH1cbiAgKlxuICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICoqL1xuICBwcml2YXRlIGdldFdyYXBMaW1pdFJhbmdlKCkge1xuICAgIC8vIEF2b2lkIHVuZXhwZWN0ZWQgbXV0YXRpb24gYnkgcmV0dXJuaW5nIGEgY29weVxuICAgIHJldHVybiB7XG4gICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpIHtcbiAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICB2YXIgbGVuO1xuICAgIHZhciBhY3Rpb24gPSBlLmRhdGEuYWN0aW9uO1xuICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgdmFyIGxhc3RSb3cgPSBlLmRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICB2YXIgc3RhcnQgPSBlLmRhdGEucmFuZ2Uuc3RhcnQ7XG4gICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgdmFyIHJlbW92ZWRGb2xkcyA9IG51bGw7XG5cbiAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJMaW5lc1wiKSAhPSAtMSkge1xuICAgICAgaWYgKGFjdGlvbiA9PSBcImluc2VydExpbmVzXCIpIHtcbiAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93ICsgKGUuZGF0YS5saW5lcy5sZW5ndGgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgfVxuICAgICAgbGVuID0gZS5kYXRhLmxpbmVzID8gZS5kYXRhLmxpbmVzLmxlbmd0aCA6IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICB9IGVsc2Uge1xuICAgICAgbGVuID0gbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgIH1cblxuICAgIHRoaXMuJHVwZGF0aW5nID0gdHJ1ZTtcbiAgICBpZiAobGVuICE9IDApIHtcbiAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICB0aGlzW3VzZVdyYXBNb2RlID8gXCIkd3JhcERhdGFcIiA6IFwiJHJvd0xlbmd0aENhY2hlXCJdLnNwbGljZShmaXJzdFJvdywgbGVuKTtcblxuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGVuZC5yb3cpO1xuICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZW5kLnJvdywgZW5kLmNvbHVtbiwgc3RhcnQuY29sdW1uIC0gZW5kLmNvbHVtbik7XG4gICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG5cbiAgICAgICAgICB2YXIgZm9sZExpbmVCZWZvcmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICBpZiAoZm9sZExpbmVCZWZvcmUgJiYgZm9sZExpbmVCZWZvcmUgIT09IGZvbGRMaW5lKSB7XG4gICAgICAgICAgICBmb2xkTGluZUJlZm9yZS5tZXJnZShmb2xkTGluZSk7XG4gICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lQmVmb3JlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBlbmQucm93KSB7XG4gICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbik7XG4gICAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMCk7XG4gICAgICAgIHZhciBhcnIgPSB1c2VXcmFwTW9kZSA/IHRoaXMuJHdyYXBEYXRhIDogdGhpcy4kcm93TGVuZ3RoQ2FjaGVcbiAgICAgICAgYXJyLnNwbGljZS5hcHBseShhcnIsIGFyZ3MpO1xuXG4gICAgICAgIC8vIElmIHNvbWUgbmV3IGxpbmUgaXMgYWRkZWQgaW5zaWRlIG9mIGEgZm9sZExpbmUsIHRoZW4gc3BsaXRcbiAgICAgICAgLy8gdGhlIGZvbGQgbGluZSB1cC5cbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZS5yYW5nZS5jb21wYXJlSW5zaWRlKHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKVxuICAgICAgICAgIC8vIEluc2lkZSBvZiB0aGUgZm9sZExpbmUgcmFuZ2UuIE5lZWQgdG8gc3BsaXQgc3R1ZmYgdXAuXG4gICAgICAgICAgaWYgKGNtcCA9PSAwKSB7XG4gICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhcbiAgICAgICAgICAgICAgbGFzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAvLyBJbmZyb250IG9mIHRoZSBmb2xkTGluZSBidXQgc2FtZSByb3cuIE5lZWQgdG8gc2hpZnQgY29sdW1uLlxuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgMCwgZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgLy8gTm90aGluZyB0byBkbyBpZiB0aGUgaW5zZXJ0IGlzIGFmdGVyIHRoZSBmb2xkTGluZS5cbiAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBmaXJzdFJvdykge1xuICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUmVhbGlnbiBmb2xkcy4gRS5nLiBpZiB5b3UgYWRkIHNvbWUgbmV3IGNoYXJzIGJlZm9yZSBhIGZvbGQsIHRoZVxuICAgICAgLy8gZm9sZCBzaG91bGQgXCJtb3ZlXCIgdG8gdGhlIHJpZ2h0LlxuICAgICAgbGVuID0gTWF0aC5hYnMoZS5kYXRhLnJhbmdlLnN0YXJ0LmNvbHVtbiAtIGUuZGF0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAvLyBHZXQgYWxsIHRoZSBmb2xkcyBpbiB0aGUgY2hhbmdlIHJhbmdlIGFuZCByZW1vdmUgdGhlbS5cbiAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgIGxlbiA9IC1sZW47XG4gICAgICB9XG4gICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhmaXJzdFJvdywgc3RhcnQuY29sdW1uLCBsZW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh1c2VXcmFwTW9kZSAmJiB0aGlzLiR3cmFwRGF0YS5sZW5ndGggIT0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJkb2MuZ2V0TGVuZ3RoKCkgYW5kICR3cmFwRGF0YS5sZW5ndGggaGF2ZSB0byBiZSB0aGUgc2FtZSFcIik7XG4gICAgfVxuICAgIHRoaXMuJHVwZGF0aW5nID0gZmFsc2U7XG5cbiAgICBpZiAodXNlV3JhcE1vZGUpXG4gICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgZWxzZVxuICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3cpO1xuXG4gICAgcmV0dXJuIHJlbW92ZWRGb2xkcztcbiAgfVxuXG4gIHB1YmxpYyAkdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3csIGI/KSB7XG4gICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbZmlyc3RSb3ddID0gbnVsbDtcbiAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtsYXN0Um93XSA9IG51bGw7XG4gIH1cblxuICBwdWJsaWMgJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuICAgIHZhciB3cmFwRGF0YSA9IHRoaXMuJHdyYXBEYXRhO1xuICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgdmFyIHRva2VucztcbiAgICB2YXIgZm9sZExpbmU7XG5cbiAgICB2YXIgcm93ID0gZmlyc3RSb3c7XG4gICAgbGFzdFJvdyA9IE1hdGgubWluKGxhc3RSb3csIGxpbmVzLmxlbmd0aCAtIDEpO1xuICAgIHdoaWxlIChyb3cgPD0gbGFzdFJvdykge1xuICAgICAgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICB0b2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKGxpbmVzW3Jvd10pO1xuICAgICAgICB3cmFwRGF0YVtyb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICByb3crKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRva2VucyA9IFtdO1xuICAgICAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyLCByb3csIGNvbHVtbiwgbGFzdENvbHVtbikge1xuICAgICAgICAgIHZhciB3YWxrVG9rZW5zOiBudW1iZXJbXTtcbiAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgIHBsYWNlaG9sZGVyLCB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgIHdhbGtUb2tlbnNbMF0gPSBQTEFDRUhPTERFUl9TVEFSVDtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgd2Fsa1Rva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICB3YWxrVG9rZW5zW2ldID0gUExBQ0VIT0xERVJfQk9EWTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgIGxpbmVzW3Jvd10uc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbiksXG4gICAgICAgICAgICAgIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0b2tlbnMgPSB0b2tlbnMuY29uY2F0KHdhbGtUb2tlbnMpO1xuICAgICAgICB9LmJpbmQodGhpcyksXG4gICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICBsaW5lc1tmb2xkTGluZS5lbmQucm93XS5sZW5ndGggKyAxXG4gICAgICAgICk7XG5cbiAgICAgICAgd3JhcERhdGFbZm9sZExpbmUuc3RhcnQucm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSAkY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zOiBudW1iZXJbXSwgd3JhcExpbWl0OiBudW1iZXIsIHRhYlNpemU/OiBudW1iZXIpIHtcbiAgICBpZiAodG9rZW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSBbXTtcbiAgICB2YXIgZGlzcGxheUxlbmd0aCA9IHRva2Vucy5sZW5ndGg7XG4gICAgdmFyIGxhc3RTcGxpdCA9IDAsIGxhc3REb2NTcGxpdCA9IDA7XG5cbiAgICB2YXIgaXNDb2RlID0gdGhpcy4kd3JhcEFzQ29kZTtcblxuICAgIGZ1bmN0aW9uIGFkZFNwbGl0KHNjcmVlblBvczogbnVtYmVyKSB7XG4gICAgICB2YXIgZGlzcGxheWVkID0gdG9rZW5zLnNsaWNlKGxhc3RTcGxpdCwgc2NyZWVuUG9zKTtcblxuICAgICAgLy8gVGhlIGRvY3VtZW50IHNpemUgaXMgdGhlIGN1cnJlbnQgc2l6ZSAtIHRoZSBleHRyYSB3aWR0aCBmb3IgdGFic1xuICAgICAgLy8gYW5kIG11bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgIHZhciBsZW4gPSBkaXNwbGF5ZWQubGVuZ3RoO1xuICAgICAgZGlzcGxheWVkLmpvaW4oXCJcIikuXG4gICAgICAgIC8vIEdldCBhbGwgdGhlIFRBQl9TUEFDRXMuXG4gICAgICAgIHJlcGxhY2UoLzEyL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgIH0pLlxuICAgICAgICAvLyBHZXQgYWxsIHRoZSBDSEFSX0VYVC9tdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgIHJlcGxhY2UoLzIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgfSk7XG5cbiAgICAgIGxhc3REb2NTcGxpdCArPSBsZW47XG4gICAgICBzcGxpdHMucHVzaChsYXN0RG9jU3BsaXQpO1xuICAgICAgbGFzdFNwbGl0ID0gc2NyZWVuUG9zO1xuICAgIH1cblxuICAgIHdoaWxlIChkaXNwbGF5TGVuZ3RoIC0gbGFzdFNwbGl0ID4gd3JhcExpbWl0KSB7XG4gICAgICAvLyBUaGlzIGlzLCB3aGVyZSB0aGUgc3BsaXQgc2hvdWxkIGJlLlxuICAgICAgdmFyIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuXG4gICAgICAvLyBJZiB0aGVyZSBpcyBhIHNwYWNlIG9yIHRhYiBhdCB0aGlzIHNwbGl0IHBvc2l0aW9uLCB0aGVuIG1ha2luZ1xuICAgICAgLy8gYSBzcGxpdCBpcyBzaW1wbGUuXG4gICAgICBpZiAodG9rZW5zW3NwbGl0IC0gMV0gPj0gU1BBQ0UgJiYgdG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAvKiBkaXNhYmxlZCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FqYXhvcmcvYWNlL2lzc3Vlcy8xMTg2XG4gICAgICAgIC8vIEluY2x1ZGUgYWxsIGZvbGxvd2luZyBzcGFjZXMgKyB0YWJzIGluIHRoaXMgc3BsaXQgYXMgd2VsbC5cbiAgICAgICAgd2hpbGUgKHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgIHNwbGl0ICsrO1xuICAgICAgICB9ICovXG4gICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgLy8gQ2hlY2sgaWYgc3BsaXQgaXMgaW5zaWRlIG9mIGEgcGxhY2Vob2xkZXIuIFBsYWNlaG9sZGVyIGFyZVxuICAgICAgLy8gbm90IHNwbGl0YWJsZS4gVGhlcmVmb3JlLCBzZWVrIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHBsYWNlaG9sZGVyXG4gICAgICAvLyBhbmQgdHJ5IHRvIHBsYWNlIHRoZSBzcGxpdCBiZW9mcmUgdGhlIHBsYWNlaG9sZGVyJ3Mgc3RhcnQuXG4gICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCB8fCB0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgLy8gU2VlayB0aGUgc3RhcnQgb2YgdGhlIHBsYWNlaG9sZGVyIGFuZCBkbyB0aGUgc3BsaXRcbiAgICAgICAgLy8gYmVmb3JlIHRoZSBwbGFjZWhvbGRlci4gQnkgZGVmaW5pdGlvbiB0aGVyZSBhbHdheXNcbiAgICAgICAgLy8gYSBQTEFDRUhPTERFUl9TVEFSVCBiZXR3ZWVuIHNwbGl0IGFuZCBsYXN0U3BsaXQuXG4gICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0ICE9IGxhc3RTcGxpdCAtIDE7IHNwbGl0LS0pIHtcbiAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgLy8gc3BsaXQrKzsgPDwgTm8gaW5jcmVtZW50YWwgaGVyZSBhcyB3ZSB3YW50IHRvXG4gICAgICAgICAgICAvLyAgaGF2ZSB0aGUgcG9zaXRpb24gYmVmb3JlIHRoZSBQbGFjZWhvbGRlci5cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBpcyBub3QgdGhlIGluZGV4IG9mIHRoZVxuICAgICAgICAvLyBsYXN0IHNwbGl0LCB0aGVuIHdlIGNhbiBkbyB0aGUgc3BsaXRcbiAgICAgICAgaWYgKHNwbGl0ID4gbGFzdFNwbGl0KSB7XG4gICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIElTIHRoZSBpbmRleCBvZiB0aGUgbGFzdFxuICAgICAgICAvLyBzcGxpdCwgdGhlbiB3ZSBoYXZlIHRvIHBsYWNlIHRoZSBzcGxpdCBhZnRlciB0aGVcbiAgICAgICAgLy8gcGxhY2Vob2xkZXIuIFNvLCBsZXQncyBzZWVrIGZvciB0aGUgZW5kIG9mIHRoZSBwbGFjZWhvbGRlci5cbiAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgIGZvciAoc3BsaXQ7IHNwbGl0IDwgdG9rZW5zLmxlbmd0aDsgc3BsaXQrKykge1xuICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdICE9IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHNwaWx0ID09IHRva2Vucy5sZW5ndGgsIHRoZW4gdGhlIHBsYWNlaG9sZGVyIGlzIHRoZSBsYXN0XG4gICAgICAgIC8vIHRoaW5nIGluIHRoZSBsaW5lIGFuZCBhZGRpbmcgYSBuZXcgc3BsaXQgZG9lc24ndCBtYWtlIHNlbnNlLlxuICAgICAgICBpZiAoc3BsaXQgPT0gdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgIGJyZWFrOyAgLy8gQnJlYWtzIHRoZSB3aGlsZS1sb29wLlxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSwgYWRkIHRoZSBzcGxpdC4uLlxuICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgIC8vIFNlYXJjaCBmb3IgdGhlIGZpcnN0IG5vbiBzcGFjZS90YWIvcGxhY2Vob2xkZXIvcHVuY3R1YXRpb24gdG9rZW4gYmFja3dhcmRzLlxuICAgICAgdmFyIG1pblNwbGl0ID0gTWF0aC5tYXgoc3BsaXQgLSAoaXNDb2RlID8gMTAgOiB3cmFwTGltaXQgLSAod3JhcExpbWl0ID4+IDIpKSwgbGFzdFNwbGl0IC0gMSk7XG4gICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgc3BsaXQtLTtcbiAgICAgIH1cbiAgICAgIGlmIChpc0NvZGUpIHtcbiAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdID09IFBVTkNUVUFUSU9OKSB7XG4gICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFNQQUNFKSB7XG4gICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gSWYgd2UgZm91bmQgb25lLCB0aGVuIGFkZCB0aGUgc3BsaXQuXG4gICAgICBpZiAoc3BsaXQgPiBtaW5TcGxpdCkge1xuICAgICAgICBhZGRTcGxpdCgrK3NwbGl0KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAvLyBUaGUgc3BsaXQgaXMgaW5zaWRlIG9mIGEgQ0hBUiBvciBDSEFSX0VYVCB0b2tlbiBhbmQgbm8gc3BhY2VcbiAgICAgIC8vIGFyb3VuZCAtPiBmb3JjZSBhIHNwbGl0LlxuICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgIH1cbiAgICByZXR1cm4gc3BsaXRzO1xuICB9XG5cbiAgLyoqXG4gICogR2l2ZW4gYSBzdHJpbmcsIHJldHVybnMgYW4gYXJyYXkgb2YgdGhlIGRpc3BsYXkgY2hhcmFjdGVycywgaW5jbHVkaW5nIHRhYnMgYW5kIHNwYWNlcy5cbiAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2hlY2tcbiAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IFRoZSB2YWx1ZSB0byBzdGFydCBhdFxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgJGdldERpc3BsYXlUb2tlbnMoc3RyOiBzdHJpbmcsIG9mZnNldD86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICB2YXIgYXJyOiBudW1iZXJbXSA9IFtdO1xuICAgIHZhciB0YWJTaXplOiBudW1iZXI7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0IHx8IDA7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgIC8vIFRhYlxuICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICB0YWJTaXplID0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKGFyci5sZW5ndGggKyBvZmZzZXQpO1xuICAgICAgICBhcnIucHVzaChUQUIpO1xuICAgICAgICBmb3IgKHZhciBuID0gMTsgbiA8IHRhYlNpemU7IG4rKykge1xuICAgICAgICAgIGFyci5wdXNoKFRBQl9TUEFDRSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIFNwYWNlXG4gICAgICBlbHNlIGlmIChjID09IDMyKSB7XG4gICAgICAgIGFyci5wdXNoKFNQQUNFKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKChjID4gMzkgJiYgYyA8IDQ4KSB8fCAoYyA+IDU3ICYmIGMgPCA2NCkpIHtcbiAgICAgICAgYXJyLnB1c2goUFVOQ1RVQVRJT04pO1xuICAgICAgfVxuICAgICAgLy8gZnVsbCB3aWR0aCBjaGFyYWN0ZXJzXG4gICAgICBlbHNlIGlmIChjID49IDB4MTEwMCAmJiBpc0Z1bGxXaWR0aChjKSkge1xuICAgICAgICBhcnIucHVzaChDSEFSLCBDSEFSX0VYVCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgYXJyLnB1c2goQ0hBUik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhcnI7XG4gIH1cblxuICAvKipcbiAgICogQ2FsY3VsYXRlcyB0aGUgd2lkdGggb2YgdGhlIHN0cmluZyBgc3RyYCBvbiB0aGUgc2NyZWVuIHdoaWxlIGFzc3VtaW5nIHRoYXQgdGhlIHN0cmluZyBzdGFydHMgYXQgdGhlIGZpcnN0IGNvbHVtbiBvbiB0aGUgc2NyZWVuLlxuICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjYWxjdWxhdGUgdGhlIHNjcmVlbiB3aWR0aCBvZlxuICAqIEBwYXJhbSB7TnVtYmVyfSBtYXhTY3JlZW5Db2x1bW5cbiAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuQ29sdW1uXG4gICogQHJldHVybnMge1tOdW1iZXJdfSBSZXR1cm5zIGFuIGBpbnRbXWAgYXJyYXkgd2l0aCB0d28gZWxlbWVudHM6PGJyLz5cbiAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICogVGhlIHNlY29uZCB2YWx1ZSBjb250YWlucyB0aGUgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IGNvbHVtbiB0aGF0IHRoaXMgZnVuY3Rpb24gcmVhZCB1bnRpbC5cbiAgKlxuICAqKi9cbiAgcHVibGljICRnZXRTdHJpbmdTY3JlZW5XaWR0aChzdHI6IHN0cmluZywgbWF4U2NyZWVuQ29sdW1uPzogbnVtYmVyLCBzY3JlZW5Db2x1bW4/OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IG51bGwpXG4gICAgICBtYXhTY3JlZW5Db2x1bW4gPSBJbmZpbml0eTtcbiAgICBzY3JlZW5Db2x1bW4gPSBzY3JlZW5Db2x1bW4gfHwgMDtcblxuICAgIHZhciBjOiBudW1iZXI7XG4gICAgdmFyIGNvbHVtbjogbnVtYmVyO1xuICAgIGZvciAoY29sdW1uID0gMDsgY29sdW1uIDwgc3RyLmxlbmd0aDsgY29sdW1uKyspIHtcbiAgICAgIGMgPSBzdHIuY2hhckNvZGVBdChjb2x1bW4pO1xuICAgICAgLy8gdGFiXG4gICAgICBpZiAoYyA9PSA5KSB7XG4gICAgICAgIHNjcmVlbkNvbHVtbiArPSB0aGlzLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uKTtcbiAgICAgIH1cbiAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzY3JlZW5Db2x1bW4gPiBtYXhTY3JlZW5Db2x1bW4pIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIG51bWJlciBvZiBzY3JlZW5yb3dzIGluIGEgd3JhcHBlZCBsaW5lLlxuICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gY2hlY2tcbiAgKlxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICoqL1xuICBwdWJsaWMgZ2V0Um93TGVuZ3RoKHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5saW5lV2lkZ2V0cylcbiAgICAgIHZhciBoID0gdGhpcy5saW5lV2lkZ2V0c1tyb3ddICYmIHRoaXMubGluZVdpZGdldHNbcm93XS5yb3dDb3VudCB8fCAwO1xuICAgIGVsc2VcbiAgICAgIGggPSAwXG4gICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgcmV0dXJuIDEgKyBoO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XS5sZW5ndGggKyAxICsgaDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldFJvd0xpbmVDb3VudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgZ2V0Um93V3JhcEluZGVudChzY3JlZW5Sb3c6IG51bWJlcikge1xuICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcG9zLnJvd107XG4gICAgICAvLyBGSVhNRTogaW5kZW50IGRvZXMgbm90IGV4aXN0cyBvbiBudW1iZXJbXVxuICAgICAgcmV0dXJuIHNwbGl0cy5sZW5ndGggJiYgc3BsaXRzWzBdIDwgcG9zLmNvbHVtbiA/IHNwbGl0c1snaW5kZW50J10gOiAwO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBwb3NpdGlvbiAob24gc2NyZWVuKSBmb3IgdGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSBwcm92aWRlZCBzY3JlZW4gcm93LlxuICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAqXG4gICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW5cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICB2YXIgcG9zID0gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICB9XG5cbiAgLyoqXG4gICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGxhc3Qgc2NyZWVuIHJvdy5cbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICpcbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICoqL1xuICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgcmV0dXJuIHRoaXMuZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3cpO1xuICB9XG5cbiAgLyoqXG4gICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBkb2N1bWVudCBwb3NpdGlvbiBvZiB0aGUgbGFzdCByb3cuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pIHtcbiAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBOdW1iZXIuTUFYX1ZBTFVFIC8gMTApO1xuICB9XG5cbiAgLyoqXG4gICogRm9yIHRoZSBnaXZlbiByb3csIHRoaXMgcmV0dXJucyB0aGUgc3BsaXQgZGF0YS5cbiAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAqKi9cbiAgcHVibGljIGdldFJvd1NwbGl0RGF0YShyb3c6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVGhlIGRpc3RhbmNlIHRvIHRoZSBuZXh0IHRhYiBzdG9wIGF0IHRoZSBzcGVjaWZpZWQgc2NyZWVuIGNvbHVtbi5cbiAgICogQG1ldGhvcyBnZXRTY3JlZW5UYWJTaXplXG4gICAqIEBwYXJhbSBzY3JlZW5Db2x1bW4ge251bWJlcn0gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICogQHJldHVybiB7bnVtYmVyfVxuICAgKi9cbiAgcHVibGljIGdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgfVxuXG5cbiAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRSb3coc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLnJvdztcbiAgfVxuXG5cbiAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgc2NyZWVuQ29sdW1uKS5jb2x1bW47XG4gIH1cblxuICAvKipcbiAgKiBDb252ZXJ0cyBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIG9uIHRoZSBzY3JlZW4gdG8gY2hhcmFjdGVycyBjb29yZGluYXRlcyB3aXRoaW4gdGhlIGRvY3VtZW50LiBbVGhpcyB0YWtlcyBpbnRvIGFjY291bnQgY29kZSBmb2xkaW5nLCB3b3JkIHdyYXAsIHRhYiBzaXplLCBhbmQgYW55IG90aGVyIHZpc3VhbCBtb2RpZmljYXRpb25zLl17OiAjY29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuQ29sdW1uIFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrXG4gICogQHJldHVybnMge09iamVjdH0gVGhlIG9iamVjdCByZXR1cm5lZCBoYXMgdHdvIHByb3BlcnRpZXM6IGByb3dgIGFuZCBgY29sdW1uYC5cbiAgKiovXG4gIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgaWYgKHNjcmVlblJvdyA8IDApIHtcbiAgICAgIHJldHVybiB7IHJvdzogMCwgY29sdW1uOiAwIH07XG4gICAgfVxuXG4gICAgdmFyIGxpbmU7XG4gICAgdmFyIGRvY1JvdyA9IDA7XG4gICAgdmFyIGRvY0NvbHVtbiA9IDA7XG4gICAgdmFyIGNvbHVtbjtcbiAgICB2YXIgcm93ID0gMDtcbiAgICB2YXIgcm93TGVuZ3RoID0gMDtcblxuICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJHNjcmVlblJvd0NhY2hlO1xuICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgc2NyZWVuUm93KTtcbiAgICB2YXIgbCA9IHJvd0NhY2hlLmxlbmd0aDtcbiAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgIHZhciBkb2NSb3cgPSB0aGlzLiRkb2NSb3dDYWNoZVtpXTtcbiAgICAgIHZhciBkb0NhY2hlID0gc2NyZWVuUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgIH1cblxuICAgIHZhciBtYXhSb3cgPSB0aGlzLmdldExlbmd0aCgpIC0gMTtcbiAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3cpO1xuICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgd2hpbGUgKHJvdyA8PSBzY3JlZW5Sb3cpIHtcbiAgICAgIHJvd0xlbmd0aCA9IHRoaXMuZ2V0Um93TGVuZ3RoKGRvY1Jvdyk7XG4gICAgICBpZiAocm93ICsgcm93TGVuZ3RoID4gc2NyZWVuUm93IHx8IGRvY1JvdyA+PSBtYXhSb3cpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByb3cgKz0gcm93TGVuZ3RoO1xuICAgICAgICBkb2NSb3crKztcbiAgICAgICAgaWYgKGRvY1JvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKGRvY1Jvdyk7XG4gICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2gocm93KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZm9sZExpbmUgJiYgZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1Jvdykge1xuICAgICAgbGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lKTtcbiAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICB9IGVsc2UgaWYgKHJvdyArIHJvd0xlbmd0aCA8PSBzY3JlZW5Sb3cgfHwgZG9jUm93ID4gbWF4Um93KSB7XG4gICAgICAvLyBjbGlwIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50XG4gICAgICByZXR1cm4ge1xuICAgICAgICByb3c6IG1heFJvdyxcbiAgICAgICAgY29sdW1uOiB0aGlzLmdldExpbmUobWF4Um93KS5sZW5ndGhcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpO1xuICAgICAgZm9sZExpbmUgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW2RvY1Jvd107XG4gICAgICBpZiAoc3BsaXRzKSB7XG4gICAgICAgIHZhciBzcGxpdEluZGV4ID0gTWF0aC5mbG9vcihzY3JlZW5Sb3cgLSByb3cpO1xuICAgICAgICBjb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleF07XG4gICAgICAgIGlmIChzcGxpdEluZGV4ID4gMCAmJiBzcGxpdHMubGVuZ3RoKSB7XG4gICAgICAgICAgZG9jQ29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXggLSAxXSB8fCBzcGxpdHNbc3BsaXRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgIGxpbmUgPSBsaW5lLnN1YnN0cmluZyhkb2NDb2x1bW4pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZG9jQ29sdW1uICs9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmUsIHNjcmVlbkNvbHVtbilbMV07XG5cbiAgICAvLyBXZSByZW1vdmUgb25lIGNoYXJhY3RlciBhdCB0aGUgZW5kIHNvIHRoYXQgdGhlIGRvY0NvbHVtblxuICAgIC8vIHBvc2l0aW9uIHJldHVybmVkIGlzIG5vdCBhc3NvY2lhdGVkIHRvIHRoZSBuZXh0IHJvdyBvbiB0aGUgc2NyZWVuLlxuICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSAmJiBkb2NDb2x1bW4gPj0gY29sdW1uKVxuICAgICAgZG9jQ29sdW1uID0gY29sdW1uIC0gMTtcblxuICAgIGlmIChmb2xkTGluZSlcbiAgICAgIHJldHVybiBmb2xkTGluZS5pZHhUb1Bvc2l0aW9uKGRvY0NvbHVtbik7XG5cbiAgICByZXR1cm4geyByb3c6IGRvY1JvdywgY29sdW1uOiBkb2NDb2x1bW4gfTtcbiAgfVxuXG4gIC8qKlxuICAqIENvbnZlcnRzIGRvY3VtZW50IGNvb3JkaW5hdGVzIHRvIHNjcmVlbiBjb29yZGluYXRlcy4gezpjb252ZXJzaW9uQ29uc2lkZXJhdGlvbnN9XG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY1JvdyBUaGUgZG9jdW1lbnQgcm93IHRvIGNoZWNrXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHRvIGNoZWNrXG4gICogQHJldHVybnMge09iamVjdH0gVGhlIG9iamVjdCByZXR1cm5lZCBieSB0aGlzIG1ldGhvZCBoYXMgdHdvIHByb3BlcnRpZXM6IGByb3dgIGFuZCBgY29sdW1uYC5cbiAgKlxuICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvblxuICAqKi9cbiAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICB2YXIgcG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgIC8vIE5vcm1hbGl6ZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cy5cbiAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICB9XG5cbiAgICBkb2NSb3cgPSBwb3Mucm93O1xuICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcblxuICAgIHZhciBzY3JlZW5Sb3cgPSAwO1xuICAgIHZhciBmb2xkU3RhcnRSb3cgPSBudWxsO1xuICAgIHZhciBmb2xkID0gbnVsbDtcblxuICAgIC8vIENsYW1wIHRoZSBkb2NSb3cgcG9zaXRpb24gaW4gY2FzZSBpdCdzIGluc2lkZSBvZiBhIGZvbGRlZCBibG9jay5cbiAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoZG9jUm93LCBkb2NDb2x1bW4sIDEpO1xuICAgIGlmIChmb2xkKSB7XG4gICAgICBkb2NSb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgIGRvY0NvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgIH1cblxuICAgIHZhciByb3dFbmQsIHJvdyA9IDA7XG5cbiAgICB2YXIgcm93Q2FjaGUgPSB0aGlzLiRkb2NSb3dDYWNoZTtcbiAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIGRvY1Jvdyk7XG4gICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgaWYgKGwgJiYgaSA+PSAwKSB7XG4gICAgICB2YXIgcm93ID0gcm93Q2FjaGVbaV07XG4gICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy4kc2NyZWVuUm93Q2FjaGVbaV07XG4gICAgICB2YXIgZG9DYWNoZSA9IGRvY1JvdyA+IHJvd0NhY2hlW2wgLSAxXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgIH1cblxuICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICB3aGlsZSAocm93IDwgZG9jUm93KSB7XG4gICAgICBpZiAocm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgaWYgKHJvd0VuZCA+IGRvY1JvdylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3dFbmQsIGZvbGRMaW5lKTtcbiAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICByb3dFbmQgPSByb3cgKyAxO1xuICAgICAgfVxuXG4gICAgICBzY3JlZW5Sb3cgKz0gdGhpcy5nZXRSb3dMZW5ndGgocm93KTtcbiAgICAgIHJvdyA9IHJvd0VuZDtcblxuICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHNjcmVlblJvdyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSB0ZXh0IGxpbmUgdGhhdCBpcyBkaXNwbGF5ZWQgaW4gZG9jUm93IG9uIHRoZSBzY3JlZW4uXG4gICAgdmFyIHRleHRMaW5lID0gXCJcIjtcbiAgICAvLyBDaGVjayBpZiB0aGUgZmluYWwgcm93IHdlIHdhbnQgdG8gcmVhY2ggaXMgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICBpZiAoZm9sZExpbmUgJiYgcm93ID49IGZvbGRTdGFydCkge1xuICAgICAgdGV4dExpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSwgZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgZm9sZFN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXh0TGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpLnN1YnN0cmluZygwLCBkb2NDb2x1bW4pO1xuICAgICAgZm9sZFN0YXJ0Um93ID0gZG9jUm93O1xuICAgIH1cbiAgICAvLyBDbGFtcCB0ZXh0TGluZSBpZiBpbiB3cmFwTW9kZS5cbiAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHZhciB3cmFwUm93ID0gdGhpcy4kd3JhcERhdGFbZm9sZFN0YXJ0Um93XTtcbiAgICAgIGlmICh3cmFwUm93KSB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3dPZmZzZXQgPSAwO1xuICAgICAgICB3aGlsZSAodGV4dExpbmUubGVuZ3RoID49IHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0XSkge1xuICAgICAgICAgIHNjcmVlblJvdysrO1xuICAgICAgICAgIHNjcmVlblJvd09mZnNldCsrO1xuICAgICAgICB9XG4gICAgICAgIHRleHRMaW5lID0gdGV4dExpbmUuc3Vic3RyaW5nKHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0IC0gMV0gfHwgMCwgdGV4dExpbmUubGVuZ3RoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgcm93OiBzY3JlZW5Sb3csXG4gICAgICBjb2x1bW46IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKHRleHRMaW5lKVswXVxuICAgIH07XG4gIH1cblxuICAvKipcbiAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gY29sdW1uLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICogQHJldHVybnMge051bWJlcn1cbiAgKlxuICAqKi9cbiAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Db2x1bW4oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLmNvbHVtbjtcbiAgfVxuXG4gIC8qKlxuICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiByb3cuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgKiovXG4gIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5yb3c7XG4gIH1cblxuICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJhbmdlKHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICB2YXIgc2NyZWVuUG9zU3RhcnQgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgdmFyIHNjcmVlblBvc0VuZCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgIHJldHVybiBuZXcgUmFuZ2Uoc2NyZWVuUG9zU3RhcnQucm93LCBzY3JlZW5Qb3NTdGFydC5jb2x1bW4sIHNjcmVlblBvc0VuZC5yb3csIHNjcmVlblBvc0VuZC5jb2x1bW4pO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBzY3JlZW4uXG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JlZW5MZW5ndGgoKTogbnVtYmVyIHtcbiAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgdmFyIGZvbGQ6IEZvbGRMaW5lID0gbnVsbDtcbiAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICBzY3JlZW5Sb3dzID0gdGhpcy5nZXRMZW5ndGgoKTtcblxuICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkZWQgbGluZXMgYWdhaW4uXG4gICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZm9sZCA9IGZvbGREYXRhW2ldO1xuICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kd3JhcERhdGEubGVuZ3RoO1xuICAgICAgdmFyIHJvdyA9IDAsIGkgPSAwO1xuICAgICAgdmFyIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICB3aGlsZSAocm93IDwgbGFzdFJvdykge1xuICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgIHJvdysrO1xuICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgcm93ID0gZm9sZC5lbmQucm93ICsgMTtcbiAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkID8gZm9sZC5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHRvZG9cbiAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2NyZWVuUm93cztcbiAgfVxuXG4gIC8qKlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHVibGljICRzZXRGb250TWV0cmljcyhmbSkge1xuICAgIC8vIHRvZG9cbiAgfVxuXG4gIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIGNocj86IHN0cmluZyk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uLCBjaHIpO1xuICB9XG5cbiAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogUmFuZ2Uge1xuICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5nZXRCcmFja2V0UmFuZ2UocG9zaXRpb24pO1xuICB9XG5cbiAgJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgfVxuXG4gICRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdHlwZVJlPzogUmVnRXhwKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gIH1cbiAgcHJpdmF0ZSAkZm9sZE1vZGU7XG5cbiAgLy8gc3RydWN0dXJlZCBmb2xkaW5nXG4gICRmb2xkU3R5bGVzID0ge1xuICAgIFwibWFudWFsXCI6IDEsXG4gICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICBcIm1hcmtiZWdpbmVuZFwiOiAxXG4gIH1cbiAgJGZvbGRTdHlsZSA9IFwibWFya2JlZ2luXCI7XG4gIC8qXG4gICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICogICAtMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLnN0YXJ0ID0gcm93L2NvbHVtblxuICAgKiAgICsxOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuZW5kID0gcm93L2NvbHVtblxuICAgKi9cbiAgZ2V0Rm9sZEF0KHJvdzogbnVtYmVyLCBjb2x1bW4sIHNpZGU/KSB7XG4gICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgIGlmICghZm9sZExpbmUpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBmb2xkID0gZm9sZHNbaV07XG4gICAgICBpZiAoZm9sZC5yYW5nZS5jb250YWlucyhyb3csIGNvbHVtbikpIHtcbiAgICAgICAgaWYgKHNpZGUgPT0gMSAmJiBmb2xkLnJhbmdlLmlzRW5kKHJvdywgY29sdW1uKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT0gLTEgJiYgZm9sZC5yYW5nZS5pc1N0YXJ0KHJvdywgY29sdW1uKSkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb2xkO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qXG4gICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBnaXZlbiByYW5nZS4gTm90ZSwgdGhhdCB0aGlzIHdpbGwgcmV0dXJuIGZvbGRzXG4gICAqXG4gICAqL1xuICBnZXRGb2xkc0luUmFuZ2UocmFuZ2U6IFJhbmdlKSB7XG4gICAgdmFyIHN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgdmFyIGVuZCA9IHJhbmdlLmVuZDtcbiAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgdmFyIGZvdW5kRm9sZHM6IEZvbGRbXSA9IFtdO1xuXG4gICAgc3RhcnQuY29sdW1uICs9IDE7XG4gICAgZW5kLmNvbHVtbiAtPSAxO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjbXAgPSBmb2xkTGluZXNbaV0ucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgIGlmIChjbXAgPT0gMikge1xuICAgICAgICAvLyBSYW5nZSBpcyBiZWZvcmUgZm9sZExpbmUuIE5vIGludGVyc2VjdGlvbi4gVGhpcyBtZWFucyxcbiAgICAgICAgLy8gdGhlcmUgbWlnaHQgYmUgb3RoZXIgZm9sZExpbmVzIHRoYXQgaW50ZXJzZWN0LlxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAvLyBSYW5nZSBpcyBhZnRlciBmb2xkTGluZS4gVGhlcmUgY2FuJ3QgYmUgYW55IG90aGVyIGZvbGRMaW5lcyB0aGVuLFxuICAgICAgICAvLyBzbyBsZXQncyBnaXZlIHVwLlxuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmVzW2ldLmZvbGRzO1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkcy5sZW5ndGg7IGorKykge1xuICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2pdO1xuICAgICAgICBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2VcbiAgICAgICAgICAvLyBXVEYtc3RhdGU6IENhbiBoYXBwZW4gZHVlIHRvIC0xLysxIHRvIHN0YXJ0L2VuZCBjb2x1bW4uXG4gICAgICAgICAgaWYgKGNtcCA9PSA0Mikge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICBmb3VuZEZvbGRzLnB1c2goZm9sZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHN0YXJ0LmNvbHVtbiAtPSAxO1xuICAgIGVuZC5jb2x1bW4gKz0gMTtcblxuICAgIHJldHVybiBmb3VuZEZvbGRzO1xuICB9XG5cbiAgZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZXMpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG4gICAgICB2YXIgZm9sZHM6IEZvbGRbXSA9IFtdO1xuICAgICAgcmFuZ2VzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgZm9sZHMgPSBmb2xkcy5jb25jYXQodGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpKTtcbiAgICAgIH0sIHRoaXMpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlcyk7XG4gICAgfVxuICAgIHJldHVybiBmb2xkcztcbiAgfVxuICAgIFxuICAvKlxuICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZG9jdW1lbnRcbiAgICovXG4gIGdldEFsbEZvbGRzKCkge1xuICAgIHZhciBmb2xkcyA9IFtdO1xuICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgIGZvbGRzLnB1c2goZm9sZExpbmVzW2ldLmZvbGRzW2pdKTtcblxuICAgIHJldHVybiBmb2xkcztcbiAgfVxuXG4gIC8qXG4gICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICogRS5nLlxuICAgKiAgZm9vPGZvbGQ+Ynxhcjxmb2xkPndvbHJkIC0+IFwiYmFyXCJcbiAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICogIGZvbzxmb2xkPmJhcjxmb3xsZD53b2xyZCAtPiA8bnVsbD5cbiAgICpcbiAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgKlxuICAgKiBUaGUgdHJpbSBvcHRpb24gZGV0ZXJtcyBpZiB0aGUgcmV0dXJuIHN0cmluZyBzaG91bGQgYmUgdHJpbWVkIGFjY29yZGluZ1xuICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAqXG4gICAqIEUuZy5cbiAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtdHJpbT0rMT4gXCJybGRcIlxuICAgKiAgZm98bzxmb2xkPmJhcjxmb2xkPndvbHJkIC10cmltPTAwPiBcImZvb1wiXG4gICAqL1xuICBnZXRGb2xkU3RyaW5nQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCB0cmltOiBudW1iZXIsIGZvbGRMaW5lPzogRm9sZExpbmUpIHtcbiAgICBmb2xkTGluZSA9IGZvbGRMaW5lIHx8IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICB2YXIgbGFzdEZvbGQgPSB7XG4gICAgICBlbmQ6IHsgY29sdW1uOiAwIH1cbiAgICB9O1xuICAgIC8vIFRPRE86IFJlZmFjdG9yIHRvIHVzZSBnZXROZXh0Rm9sZFRvIGZ1bmN0aW9uLlxuICAgIHZhciBzdHI6IHN0cmluZztcbiAgICB2YXIgZm9sZDogRm9sZDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lLmZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBmb2xkID0gZm9sZExpbmUuZm9sZHNbaV07XG4gICAgICB2YXIgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlRW5kKHJvdywgY29sdW1uKTtcbiAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbiwgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKGNtcCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGxhc3RGb2xkID0gZm9sZDtcbiAgICB9XG4gICAgaWYgKCFzdHIpXG4gICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uKTtcblxuICAgIGlmICh0cmltID09IC0xKVxuICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgZWxzZSBpZiAodHJpbSA9PSAxKVxuICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgZWxzZVxuICAgICAgcmV0dXJuIHN0cjtcbiAgfVxuXG4gIGdldEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgdmFyIGkgPSAwO1xuICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgaWYgKGkgPT0gLTEpXG4gICAgICBpID0gMDtcbiAgICBmb3IgKGk7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1JvdyAmJiBmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICB9IGVsc2UgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPiBkb2NSb3cpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gcmV0dXJucyB0aGUgZm9sZCB3aGljaCBzdGFydHMgYWZ0ZXIgb3IgY29udGFpbnMgZG9jUm93XG4gIGdldE5leHRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciBpID0gMDtcbiAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgIGlmIChpID09IC0xKVxuICAgICAgaSA9IDA7XG4gICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBnZXRGb2xkZWRSb3dDb3VudChmaXJzdDogbnVtYmVyLCBsYXN0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciByb3dDb3VudCA9IGxhc3QgLSBmaXJzdCArIDE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV0sXG4gICAgICAgIGVuZCA9IGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgIHN0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgaWYgKGVuZCA+PSBsYXN0KSB7XG4gICAgICAgIGlmIChzdGFydCA8IGxhc3QpIHtcbiAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpXG4gICAgICAgICAgICByb3dDb3VudCAtPSBsYXN0IC0gc3RhcnQ7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgcm93Q291bnQgPSAwOy8vaW4gb25lIGZvbGRcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoZW5kID49IGZpcnN0KSB7XG4gICAgICAgIGlmIChzdGFydCA+PSBmaXJzdCkgLy9mb2xkIGluc2lkZSByYW5nZVxuICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIHN0YXJ0O1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gZmlyc3QgKyAxO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcm93Q291bnQ7XG4gIH1cblxuICAkYWRkRm9sZExpbmUoZm9sZExpbmU6IEZvbGRMaW5lKSB7XG4gICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgdGhpcy4kZm9sZERhdGEuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICByZXR1cm4gYS5zdGFydC5yb3cgLSBiLnN0YXJ0LnJvdztcbiAgICB9KTtcbiAgICByZXR1cm4gZm9sZExpbmU7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgKlxuICAgKiBAcmV0dXJuc1xuICAgKiAgICAgIFRoZSBuZXcgY3JlYXRlZCBGb2xkIG9iamVjdCBvciBhbiBleGlzdGluZyBmb2xkIG9iamVjdCBpbiBjYXNlIHRoZVxuICAgKiAgICAgIHBhc3NlZCBpbiByYW5nZSBmaXRzIGFuIGV4aXN0aW5nIGZvbGQgZXhhY3RseS5cbiAgICovXG4gIGFkZEZvbGQocGxhY2Vob2xkZXI6IHN0cmluZyB8IEZvbGQsIHJhbmdlOiBSYW5nZSkge1xuICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciBhZGRlZCA9IGZhbHNlO1xuICAgIHZhciBmb2xkOiBGb2xkO1xuXG4gICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgRm9sZClcbiAgICAgIGZvbGQgPSBwbGFjZWhvbGRlcjtcbiAgICBlbHNlIHtcbiAgICAgIGZvbGQgPSBuZXcgRm9sZChyYW5nZSwgcGxhY2Vob2xkZXIpO1xuICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gcmFuZ2UuY29sbGFwc2VDaGlsZHJlbjtcbiAgICB9XG4gICAgLy8gRklYTUU6ICRjbGlwUmFuZ2VUb0RvY3VtZW50P1xuICAgIC8vIGZvbGQucmFuZ2UgPSB0aGlzLmNsaXBSYW5nZShmb2xkLnJhbmdlKTtcbiAgICBmb2xkLnJhbmdlID0gdGhpcy4kY2xpcFJhbmdlVG9Eb2N1bWVudChmb2xkLnJhbmdlKVxuXG4gICAgdmFyIHN0YXJ0Um93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgdmFyIHN0YXJ0Q29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICB2YXIgZW5kQ29sdW1uID0gZm9sZC5lbmQuY29sdW1uO1xuXG4gICAgLy8gLS0tIFNvbWUgY2hlY2tpbmcgLS0tXG4gICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgdmFyIHN0YXJ0Rm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHN0YXJ0Um93LCBzdGFydENvbHVtbiwgMSk7XG4gICAgdmFyIGVuZEZvbGQgPSB0aGlzLmdldEZvbGRBdChlbmRSb3csIGVuZENvbHVtbiwgLTEpO1xuICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICBpZiAoXG4gICAgICAoc3RhcnRGb2xkICYmICFzdGFydEZvbGQucmFuZ2UuaXNTdGFydChzdGFydFJvdywgc3RhcnRDb2x1bW4pKVxuICAgICAgfHwgKGVuZEZvbGQgJiYgIWVuZEZvbGQucmFuZ2UuaXNFbmQoZW5kUm93LCBlbmRDb2x1bW4pKVxuICAgICkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQSBmb2xkIGNhbid0IGludGVyc2VjdCBhbHJlYWR5IGV4aXN0aW5nIGZvbGRcIiArIGZvbGQucmFuZ2UgKyBzdGFydEZvbGQucmFuZ2UpO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBmb2xkcyBpbiB0aGUgcmFuZ2Ugd2UgY3JlYXRlIHRoZSBuZXcgZm9sZCBmb3IuXG4gICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgZm9sZC5hZGRTdWJGb2xkKHN1YkZvbGQpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICBpZiAoZW5kUm93ID09IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBlbHNlIGlmIChzdGFydFJvdyA9PSBmb2xkTGluZS5lbmQucm93KSB7XG4gICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKCFmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBtaWdodCBoYXZlIHRvIG1lcmdlIHR3byBGb2xkTGluZXMuXG4gICAgICAgICAgdmFyIGZvbGRMaW5lTmV4dCA9IGZvbGREYXRhW2kgKyAxXTtcbiAgICAgICAgICBpZiAoZm9sZExpbmVOZXh0ICYmIGZvbGRMaW5lTmV4dC5zdGFydC5yb3cgPT0gZW5kUm93KSB7XG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1lcmdlIVxuICAgICAgICAgICAgZm9sZExpbmUubWVyZ2UoZm9sZExpbmVOZXh0KTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoZW5kUm93IDw9IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWFkZGVkKVxuICAgICAgZm9sZExpbmUgPSB0aGlzLiRhZGRGb2xkTGluZShuZXcgRm9sZExpbmUodGhpcy4kZm9sZERhdGEsIGZvbGQpKTtcblxuICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcbiAgICBlbHNlXG4gICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG5cbiAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJhZGRcIiB9KTtcblxuICAgIHJldHVybiBmb2xkO1xuICB9XG5cbiAgc2V0TW9kaWZpZWQobW9kaWZpZWQ6IGJvb2xlYW4pIHtcblxuICB9XG5cbiAgYWRkRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgdGhpcy5hZGRGb2xkKGZvbGQpO1xuICAgIH0sIHRoaXMpO1xuICB9XG5cbiAgcmVtb3ZlRm9sZChmb2xkOiBGb2xkKSB7XG4gICAgdmFyIGZvbGRMaW5lID0gZm9sZC5mb2xkTGluZTtcbiAgICB2YXIgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgdmFyIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG5cbiAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgLy8gU2ltcGxlIGNhc2Ugd2hlcmUgdGhlcmUgaXMgb25seSBvbmUgZm9sZCBpbiB0aGUgRm9sZExpbmUgc3VjaCB0aGF0XG4gICAgLy8gdGhlIGVudGlyZSBmb2xkIGxpbmUgY2FuIGdldCByZW1vdmVkIGRpcmVjdGx5LlxuICAgIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgZm9sZExpbmVzLnNwbGljZShmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSksIDEpO1xuICAgIH0gZWxzZVxuICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGxhc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzRW5kKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKSkge1xuICAgICAgICBmb2xkcy5wb3AoKTtcbiAgICAgICAgZm9sZExpbmUuZW5kLnJvdyA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5yb3c7XG4gICAgICAgIGZvbGRMaW5lLmVuZC5jb2x1bW4gPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQuY29sdW1uO1xuICAgICAgfSBlbHNlXG4gICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBmaXJzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgIGZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgIH0gZWxzZVxuICAgICAgICAgIC8vIFdlIGtub3cgdGhlcmUgYXJlIG1vcmUgdGhlbiAyIGZvbGRzIGFuZCB0aGUgZm9sZCBpcyBub3QgYXQgdGhlIGVkZ2UuXG4gICAgICAgICAgLy8gVGhpcyBtZWFucywgdGhlIGZvbGQgaXMgc29tZXdoZXJlIGluIGJldHdlZW4uXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyBpbiBvbmUgcm93LCB3ZSBqdXN0IGNhbiByZW1vdmUgaXQuXG4gICAgICAgICAgaWYgKGZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgZm9sZHMuc3BsaWNlKGZvbGRzLmluZGV4T2YoZm9sZCksIDEpO1xuICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgIC8vIFRoZSBmb2xkIGdvZXMgb3ZlciBtb3JlIHRoZW4gb25lIHJvdy4gVGhpcyBtZWFucyByZW12b2luZyB0aGlzIGZvbGRcbiAgICAgICAgICAvLyB3aWxsIGNhdXNlIHRoZSBmb2xkIGxpbmUgdG8gZ2V0IHNwbGl0dGVkIHVwLiBuZXdGb2xkTGluZSBpcyB0aGUgc2Vjb25kIHBhcnRcbiAgICAgICAgICB7XG4gICAgICAgICAgICB2YXIgbmV3Rm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgZm9sZHMgPSBuZXdGb2xkTGluZS5mb2xkcztcbiAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgfVxuXG4gICAgaWYgKCF0aGlzLiR1cGRhdGluZykge1xuICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgIGVsc2VcbiAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgfVxuICAgICAgICBcbiAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJyZW1vdmVcIiB9KTtcbiAgfVxuXG4gIHJlbW92ZUZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAvLyBXZSBuZWVkIHRvIGNsb25lIHRoZSBmb2xkcyBhcnJheSBwYXNzZWQgaW4gYXMgaXQgbWlnaHQgYmUgdGhlIGZvbGRzXG4gICAgLy8gYXJyYXkgb2YgYSBmb2xkIGxpbmUgYW5kIGFzIHdlIGNhbGwgdGhpcy5yZW1vdmVGb2xkKGZvbGQpLCBmb2xkc1xuICAgIC8vIGFyZSByZW1vdmVkIGZyb20gZm9sZHMgYW5kIGNoYW5nZXMgdGhlIGN1cnJlbnQgaW5kZXguXG4gICAgdmFyIGNsb25lRm9sZHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjbG9uZUZvbGRzLnB1c2goZm9sZHNbaV0pO1xuICAgIH1cblxuICAgIGNsb25lRm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgfSwgdGhpcyk7XG4gICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgfVxuXG4gIGV4cGFuZEZvbGQoZm9sZDogRm9sZCkge1xuICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICBmb2xkLnN1YkZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgZm9sZC5yZXN0b3JlUmFuZ2Uoc3ViRm9sZCk7XG4gICAgICB0aGlzLmFkZEZvbGQoc3ViRm9sZCk7XG4gICAgfSwgdGhpcyk7XG4gICAgaWYgKGZvbGQuY29sbGFwc2VDaGlsZHJlbiA+IDApIHtcbiAgICAgIHRoaXMuZm9sZEFsbChmb2xkLnN0YXJ0LnJvdyArIDEsIGZvbGQuZW5kLnJvdywgZm9sZC5jb2xsYXBzZUNoaWxkcmVuIC0gMSk7XG4gICAgfVxuICAgIGZvbGQuc3ViRm9sZHMgPSBbXTtcbiAgfVxuXG4gIGV4cGFuZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICB9LCB0aGlzKTtcbiAgfVxuXG4gIHVuZm9sZChsb2NhdGlvbj8sIGV4cGFuZElubmVyPykge1xuICAgIHZhciByYW5nZSwgZm9sZHM7XG4gICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHRoaXMuZ2V0TGVuZ3RoKCksIDApO1xuICAgICAgZXhwYW5kSW5uZXIgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGxvY2F0aW9uID09IFwibnVtYmVyXCIpXG4gICAgICByYW5nZSA9IG5ldyBSYW5nZShsb2NhdGlvbiwgMCwgbG9jYXRpb24sIHRoaXMuZ2V0TGluZShsb2NhdGlvbikubGVuZ3RoKTtcbiAgICBlbHNlIGlmIChcInJvd1wiIGluIGxvY2F0aW9uKVxuICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGxvY2F0aW9uLCBsb2NhdGlvbik7XG4gICAgZWxzZVxuICAgICAgcmFuZ2UgPSBsb2NhdGlvbjtcblxuICAgIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICBpZiAoZXhwYW5kSW5uZXIpIHtcbiAgICAgIHRoaXMucmVtb3ZlRm9sZHMoZm9sZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhzdWJGb2xkcyk7XG4gICAgICAgIHN1YkZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgIHJldHVybiBmb2xkcztcbiAgfVxuXG4gIC8qXG4gICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAqIGZvbGRlZCBwYXJ0cyBzdWNoIHRoYXQgc29tZSBwYXJ0cyBvZiB0aGUgbGluZSBpcyBzdGlsbCB2aXNpYmxlLlxuICAgKiovXG4gIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gIH1cblxuICBnZXRSb3dGb2xkRW5kKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgcmV0dXJuIGZvbGRMaW5lID8gZm9sZExpbmUuZW5kLnJvdyA6IGRvY1JvdztcbiAgfVxuXG4gIGdldFJvd0ZvbGRTdGFydChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93PzogRm9sZExpbmUpOiBudW1iZXIge1xuICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IGRvY1JvdztcbiAgfVxuXG4gIGdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZTogRm9sZExpbmUsIGVuZFJvdz86IG51bWJlciwgZW5kQ29sdW1uPzogbnVtYmVyLCBzdGFydFJvdz86IG51bWJlciwgc3RhcnRDb2x1bW4/OiBudW1iZXIpOiBzdHJpbmcge1xuICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgaWYgKHN0YXJ0Q29sdW1uID09IG51bGwpXG4gICAgICBzdGFydENvbHVtbiA9IDA7XG4gICAgaWYgKGVuZFJvdyA9PSBudWxsKVxuICAgICAgZW5kUm93ID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgLy8gQnVpbGQgdGhlIHRleHRsaW5lIHVzaW5nIHRoZSBGb2xkTGluZSB3YWxrZXIuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICBmb2xkTGluZS53YWxrKGZ1bmN0aW9uKHBsYWNlaG9sZGVyOiBzdHJpbmcsIHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgbGFzdENvbHVtbjogbnVtYmVyKSB7XG4gICAgICBpZiAocm93IDwgc3RhcnRSb3cpXG4gICAgICAgIHJldHVybjtcbiAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgaWYgKGNvbHVtbiA8IHN0YXJ0Q29sdW1uKVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgbGFzdENvbHVtbiA9IE1hdGgubWF4KHN0YXJ0Q29sdW1uLCBsYXN0Q29sdW1uKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgdGV4dExpbmUgKz0gcGxhY2Vob2xkZXI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgIH1cbiAgICB9LCBlbmRSb3csIGVuZENvbHVtbik7XG4gICAgcmV0dXJuIHRleHRMaW5lO1xuICB9XG5cbiAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG5cbiAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICB2YXIgbGluZTogc3RyaW5nO1xuICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuICAgICAgcmV0dXJuIGxpbmUuc3Vic3RyaW5nKHN0YXJ0Q29sdW1uIHx8IDAsIGVuZENvbHVtbiB8fCBsaW5lLmxlbmd0aCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgZm9sZExpbmUsIHJvdywgZW5kQ29sdW1uLCBzdGFydFJvdywgc3RhcnRDb2x1bW4pO1xuICAgIH1cbiAgfVxuXG4gICRjbG9uZUZvbGREYXRhKCkge1xuICAgIHZhciBmZCA9IFtdO1xuICAgIGZkID0gdGhpcy4kZm9sZERhdGEubWFwKGZ1bmN0aW9uKGZvbGRMaW5lKSB7XG4gICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcy5tYXAoZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICByZXR1cm4gZm9sZC5jbG9uZSgpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gbmV3IEZvbGRMaW5lKGZkLCBmb2xkcyk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gZmQ7XG4gIH1cblxuICB0b2dnbGVGb2xkKHRyeVRvVW5mb2xkKSB7XG4gICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICB2YXIgZm9sZDtcbiAgICB2YXIgYnJhY2tldFBvcztcblxuICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2UgaWYgKGJyYWNrZXRQb3MgPSB0aGlzLmZpbmRNYXRjaGluZ0JyYWNrZXQoY3Vyc29yKSkge1xuICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICByYW5nZS5lbmQgPSBicmFja2V0UG9zO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcbiAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4rKztcbiAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYnJhY2tldFBvcyA9IHRoaXMuZmluZE1hdGNoaW5nQnJhY2tldCh7IHJvdzogY3Vyc29yLnJvdywgY29sdW1uOiBjdXJzb3IuY29sdW1uICsgMSB9KSkge1xuICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09PSAxKVxuICAgICAgICAgIHJhbmdlLmVuZCA9IGJyYWNrZXRQb3M7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG5cbiAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpO1xuICAgICAgaWYgKHRyeVRvVW5mb2xkICYmIGZvbGRzLmxlbmd0aCkge1xuICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICBmb2xkID0gZm9sZHNbMF07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFmb2xkKVxuICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcblxuICAgIGlmIChmb2xkICYmIGZvbGQucmFuZ2UudG9TdHJpbmcoKSA9PSByYW5nZS50b1N0cmluZygpKSB7XG4gICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHBsYWNlaG9sZGVyID0gXCIuLi5cIjtcbiAgICBpZiAoIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgIHBsYWNlaG9sZGVyID0gdGhpcy5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgaWYgKHBsYWNlaG9sZGVyLmxlbmd0aCA8IDQpXG4gICAgICAgIHJldHVybjtcbiAgICAgIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXIudHJpbSgpLnN1YnN0cmluZygwLCAyKSArIFwiLi5cIjtcbiAgICB9XG5cbiAgICB0aGlzLmFkZEZvbGQocGxhY2Vob2xkZXIsIHJhbmdlKTtcbiAgfVxuXG4gIGdldENvbW1lbnRGb2xkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBkaXI/OiBudW1iZXIpOiBSYW5nZSB7XG4gICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgIGlmICh0b2tlbiAmJiAvXmNvbW1lbnR8c3RyaW5nLy50ZXN0KHRva2VuLnR5cGUpKSB7XG4gICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICB2YXIgcmUgPSBuZXcgUmVnRXhwKHRva2VuLnR5cGUucmVwbGFjZSgvXFwuLiovLCBcIlxcXFwuXCIpKTtcbiAgICAgIGlmIChkaXIgIT0gMSkge1xuICAgICAgICBkbyB7XG4gICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgIGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICB9XG5cbiAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyAyO1xuXG4gICAgICBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcblxuICAgICAgaWYgKGRpciAhPSAtMSkge1xuICAgICAgICBkbyB7XG4gICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiByZS50ZXN0KHRva2VuLnR5cGUpKTtcbiAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgIH0gZWxzZVxuICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuXG4gICAgICByYW5nZS5lbmQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICByYW5nZS5lbmQuY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyB0b2tlbi52YWx1ZS5sZW5ndGggLSAyO1xuICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cbiAgfVxuXG4gIGZvbGRBbGwoc3RhcnRSb3c6IG51bWJlciwgZW5kUm93OiBudW1iZXIsIGRlcHRoOiBudW1iZXIpIHtcbiAgICBpZiAoZGVwdGggPT0gdW5kZWZpbmVkKVxuICAgICAgZGVwdGggPSAxMDAwMDA7IC8vIEpTT04uc3RyaW5naWZ5IGRvZXNuJ3QgaGFubGUgSW5maW5pdHlcbiAgICB2YXIgZm9sZFdpZGdldHMgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgIGlmICghZm9sZFdpZGdldHMpXG4gICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICBlbmRSb3cgPSBlbmRSb3cgfHwgdGhpcy5nZXRMZW5ndGgoKTtcbiAgICBzdGFydFJvdyA9IHN0YXJ0Um93IHx8IDA7XG4gICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8IGVuZFJvdzsgcm93KyspIHtcbiAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddID09IG51bGwpXG4gICAgICAgIGZvbGRXaWRnZXRzW3Jvd10gPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddICE9IFwic3RhcnRcIilcbiAgICAgICAgY29udGludWU7XG5cbiAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdyk7XG4gICAgICAvLyBzb21ldGltZXMgcmFuZ2UgY2FuIGJlIGluY29tcGF0aWJsZSB3aXRoIGV4aXN0aW5nIGZvbGRcbiAgICAgIC8vIFRPRE8gY2hhbmdlIGFkZEZvbGQgdG8gcmV0dXJuIG51bGwgaXN0ZWFkIG9mIHRocm93aW5nXG4gICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuaXNNdWx0aUxpbmUoKVxuICAgICAgICAmJiByYW5nZS5lbmQucm93IDw9IGVuZFJvd1xuICAgICAgICAmJiByYW5nZS5zdGFydC5yb3cgPj0gc3RhcnRSb3dcbiAgICAgICkge1xuICAgICAgICByb3cgPSByYW5nZS5lbmQucm93O1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIGFkZEZvbGQgY2FuIGNoYW5nZSB0aGUgcmFuZ2VcbiAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgaWYgKGZvbGQpXG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSBkZXB0aDtcbiAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc2V0Rm9sZFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRoaXMuJGZvbGRTdHlsZXNbc3R5bGVdKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmb2xkIHN0eWxlOiBcIiArIHN0eWxlICsgXCJbXCIgKyBPYmplY3Qua2V5cyh0aGlzLiRmb2xkU3R5bGVzKS5qb2luKFwiLCBcIikgKyBcIl1cIik7XG5cbiAgICBpZiAodGhpcy4kZm9sZFN0eWxlID09PSBzdHlsZSlcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJGZvbGRTdHlsZSA9IHN0eWxlO1xuXG4gICAgaWYgKHN0eWxlID09PSBcIm1hbnVhbFwiKVxuICAgICAgdGhpcy51bmZvbGQoKTtcbiAgICAgICAgXG4gICAgLy8gcmVzZXQgZm9sZGluZ1xuICAgIHZhciBtb2RlID0gdGhpcy4kZm9sZE1vZGU7XG4gICAgdGhpcy4kc2V0Rm9sZGluZyhudWxsKTtcbiAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUpO1xuICB9XG5cbiAgJHNldEZvbGRpbmcoZm9sZE1vZGUpIHtcbiAgICBpZiAodGhpcy4kZm9sZE1vZGUgPT0gZm9sZE1vZGUpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLiRmb2xkTW9kZSA9IGZvbGRNb2RlO1xuXG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VBbm5vdGF0aW9uXCIpO1xuXG4gICAgaWYgKCFmb2xkTW9kZSB8fCB0aGlzLiRmb2xkU3R5bGUgPT0gXCJtYW51YWxcIikge1xuICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5mb2xkV2lkZ2V0cyA9IFtdO1xuICAgIHRoaXMuZ2V0Rm9sZFdpZGdldCA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXQuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcbiAgICB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZSA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXRSYW5nZS5iaW5kKGZvbGRNb2RlLCB0aGlzLCB0aGlzLiRmb2xkU3R5bGUpO1xuXG4gICAgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMgPSB0aGlzLnVwZGF0ZUZvbGRXaWRnZXRzLmJpbmQodGhpcyk7XG4gICAgdGhpcy5vbignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuXG4gIH1cblxuICBnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdzogbnVtYmVyLCBpZ25vcmVDdXJyZW50PzogYm9vbGVhbik6IHsgcmFuZ2U/OiBSYW5nZTsgZmlyc3RSYW5nZT86IFJhbmdlIH0ge1xuICAgIHZhciBmdyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgaWYgKCFmdyB8fCAoaWdub3JlQ3VycmVudCAmJiBmd1tyb3ddKSkge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cblxuICAgIHZhciBpID0gcm93IC0gMTtcbiAgICB2YXIgZmlyc3RSYW5nZTogUmFuZ2U7XG4gICAgd2hpbGUgKGkgPj0gMCkge1xuICAgICAgdmFyIGMgPSBmd1tpXTtcbiAgICAgIGlmIChjID09IG51bGwpXG4gICAgICAgIGMgPSBmd1tpXSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChpKTtcblxuICAgICAgaWYgKGMgPT0gXCJzdGFydFwiKSB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKGkpO1xuICAgICAgICBpZiAoIWZpcnN0UmFuZ2UpXG4gICAgICAgICAgZmlyc3RSYW5nZSA9IHJhbmdlO1xuICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuZW5kLnJvdyA+PSByb3cpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpLS07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJhbmdlOiBpICE9PSAtMSAmJiByYW5nZSxcbiAgICAgIGZpcnN0UmFuZ2U6IGZpcnN0UmFuZ2VcbiAgICB9O1xuICB9XG5cbiAgb25Gb2xkV2lkZ2V0Q2xpY2socm93LCBlKSB7XG4gICAgZSA9IGUuZG9tRXZlbnQ7XG4gICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICBjaGlsZHJlbjogZS5zaGlmdEtleSxcbiAgICAgIGFsbDogZS5jdHJsS2V5IHx8IGUubWV0YUtleSxcbiAgICAgIHNpYmxpbmdzOiBlLmFsdEtleVxuICAgIH07XG5cbiAgICB2YXIgcmFuZ2UgPSB0aGlzLiR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk7XG4gICAgaWYgKCFyYW5nZSkge1xuICAgICAgdmFyIGVsID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudClcbiAgICAgIGlmIChlbCAmJiAvYWNlX2ZvbGQtd2lkZ2V0Ly50ZXN0KGVsLmNsYXNzTmFtZSkpXG4gICAgICAgIGVsLmNsYXNzTmFtZSArPSBcIiBhY2VfaW52YWxpZFwiO1xuICAgIH1cbiAgfVxuXG4gICR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk6IFJhbmdlIHtcbiAgICBpZiAoIXRoaXMuZ2V0Rm9sZFdpZGdldClcbiAgICAgIHJldHVybjtcbiAgICB2YXIgdHlwZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICB2YXIgZGlyID0gdHlwZSA9PT0gXCJlbmRcIiA/IC0xIDogMTtcbiAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgZGlyID09PSAtMSA/IDAgOiBsaW5lLmxlbmd0aCwgZGlyKTtcblxuICAgIGlmIChmb2xkKSB7XG4gICAgICBpZiAob3B0aW9ucy5jaGlsZHJlbiB8fCBvcHRpb25zLmFsbClcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgZWxzZVxuICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93LCB0cnVlKTtcbiAgICAvLyBzb21ldGltZXMgc2luZ2xlbGluZSBmb2xkcyBjYW4gYmUgbWlzc2VkIGJ5IHRoZSBjb2RlIGFib3ZlXG4gICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4sIDEpO1xuICAgICAgaWYgKGZvbGQgJiYgcmFuZ2UuaXNFcXVhbChmb2xkLnJhbmdlKSkge1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob3B0aW9ucy5zaWJsaW5ncykge1xuICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93KTtcbiAgICAgIGlmIChkYXRhLnJhbmdlKSB7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IGRhdGEucmFuZ2Uuc3RhcnQucm93ICsgMTtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgIH1cbiAgICAgIHRoaXMuZm9sZEFsbChzdGFydFJvdywgZW5kUm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdGlvbnMuY2hpbGRyZW4pIHtcbiAgICAgIGVuZFJvdyA9IHJhbmdlID8gcmFuZ2UuZW5kLnJvdyA6IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICB0aGlzLmZvbGRBbGwocm93ICsgMSwgcmFuZ2UuZW5kLnJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgIH1cbiAgICBlbHNlIGlmIChyYW5nZSkge1xuICAgICAgaWYgKG9wdGlvbnMuYWxsKSB7XG4gICAgICAgIC8vIFRoaXMgaXMgYSBiaXQgdWdseSwgYnV0IGl0IGNvcnJlc3BvbmRzIHRvIHNvbWUgY29kZSBlbHNld2hlcmUuXG4gICAgICAgIHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW4gPSAxMDAwMDtcbiAgICAgIH1cbiAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9XG5cblxuXG4gIHRvZ2dsZUZvbGRXaWRnZXQodG9nZ2xlUGFyZW50KSB7XG4gICAgdmFyIHJvdzogbnVtYmVyID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkucm93O1xuICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIHt9KTtcblxuICAgIGlmIChyYW5nZSlcbiAgICAgIHJldHVybjtcbiAgICAvLyBoYW5kbGUgdG9nZ2xlUGFyZW50XG4gICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93LCB0cnVlKTtcbiAgICByYW5nZSA9IGRhdGEucmFuZ2UgfHwgZGF0YS5maXJzdFJhbmdlO1xuXG4gICAgaWYgKHJhbmdlKSB7XG4gICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgdGhpcy5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVGb2xkV2lkZ2V0cyhlOiB7IGRhdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IH0pOiB2b2lkIHtcbiAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgdmFyIGZpcnN0Um93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgIHZhciBsZW4gPSByYW5nZS5lbmQucm93IC0gZmlyc3RSb3c7XG5cbiAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICB0aGlzLmZvbGRXaWRnZXRzW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgfVxuICAgIGVsc2UgaWYgKGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZVRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVMaW5lc1wiKSB7XG4gICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZShmaXJzdFJvdywgbGVuICsgMSwgbnVsbCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4gKyAxKTtcbiAgICAgIGFyZ3MudW5zaGlmdChmaXJzdFJvdywgMSk7XG4gICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZS5hcHBseSh0aGlzLmZvbGRXaWRnZXRzLCBhcmdzKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gRklYTUU6IFJlc3RvcmVcbi8vIEZvbGRpbmcuY2FsbChFZGl0U2Vzc2lvbi5wcm90b3R5cGUpO1xuXG5kZWZpbmVPcHRpb25zKEVkaXRTZXNzaW9uLnByb3RvdHlwZSwgXCJzZXNzaW9uXCIsIHtcbiAgd3JhcDoge1xuICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmICghdmFsdWUgfHwgdmFsdWUgPT0gXCJvZmZcIilcbiAgICAgICAgdmFsdWUgPSBmYWxzZTtcbiAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwiZnJlZVwiKVxuICAgICAgICB2YWx1ZSA9IHRydWU7XG4gICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcInByaW50TWFyZ2luXCIpXG4gICAgICAgIHZhbHVlID0gLTE7XG4gICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIilcbiAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApIHx8IGZhbHNlO1xuXG4gICAgICBpZiAodGhpcy4kd3JhcCA9PSB2YWx1ZSlcbiAgICAgICAgcmV0dXJuO1xuICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKGZhbHNlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBjb2wgPSB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiA/IHZhbHVlIDogbnVsbDtcbiAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShjb2wsIGNvbCk7XG4gICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUodHJ1ZSk7XG4gICAgICB9XG4gICAgICB0aGlzLiR3cmFwID0gdmFsdWU7XG4gICAgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHRoaXMuZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSAtMSlcbiAgICAgICAgICByZXR1cm4gXCJwcmludE1hcmdpblwiO1xuICAgICAgICBpZiAoIXRoaXMuZ2V0V3JhcExpbWl0UmFuZ2UoKS5taW4pXG4gICAgICAgICAgcmV0dXJuIFwiZnJlZVwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kd3JhcDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBcIm9mZlwiO1xuICAgIH0sXG4gICAgaGFuZGxlc1NldDogdHJ1ZVxuICB9LFxuICB3cmFwTWV0aG9kOiB7XG4gICAgLy8gY29kZXx0ZXh0fGF1dG9cbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgdmFsID0gdmFsID09IFwiYXV0b1wiXG4gICAgICAgID8gdGhpcy4kbW9kZS50eXBlICE9IFwidGV4dFwiXG4gICAgICAgIDogdmFsICE9IFwidGV4dFwiO1xuICAgICAgaWYgKHZhbCAhPSB0aGlzLiR3cmFwQXNDb2RlKSB7XG4gICAgICAgIHRoaXMuJHdyYXBBc0NvZGUgPSB2YWw7XG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgaW5pdGlhbFZhbHVlOiBcImF1dG9cIlxuICB9LFxuICBmaXJzdExpbmVOdW1iZXI6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIpOyB9LFxuICAgIGluaXRpYWxWYWx1ZTogMVxuICB9LFxuICB1c2VXb3JrZXI6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHVzZVdvcmtlcikge1xuICAgICAgdGhpcy4kdXNlV29ya2VyID0gdXNlV29ya2VyO1xuXG4gICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG4gICAgICBpZiAodXNlV29ya2VyKVxuICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgIH0sXG4gICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gIH0sXG4gIHVzZVNvZnRUYWJzOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICB0YWJTaXplOiB7XG4gICAgc2V0OiBmdW5jdGlvbih0YWJTaXplKSB7XG4gICAgICBpZiAoaXNOYU4odGFiU2l6ZSkgfHwgdGhpcy4kdGFiU2l6ZSA9PT0gdGFiU2l6ZSkgcmV0dXJuO1xuXG4gICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgdGhpcy4kdGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VUYWJTaXplXCIpO1xuICAgIH0sXG4gICAgaW5pdGlhbFZhbHVlOiA0LFxuICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgfSxcbiAgb3ZlcndyaXRlOiB7XG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlT3ZlcndyaXRlXCIpOyB9LFxuICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgfSxcbiAgbmV3TGluZU1vZGU6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZSh2YWwpIH0sXG4gICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCkgfSxcbiAgICBoYW5kbGVzU2V0OiB0cnVlXG4gIH0sXG4gIG1vZGU6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldE1vZGUodmFsKSB9LFxuICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLiRtb2RlSWQgfVxuICB9XG59KTtcbiJdfQ==