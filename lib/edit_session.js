var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var lang = require("./lib/lang");
var config = require("./config");
var eve = require("./lib/event_emitter");
var sem = require("./selection");
var txm = require("./mode/text");
var rng = require("./range");
var docm = require("./document");
var btm = require("./background_tokenizer");
var shm = require("./search_highlight");
var asserts = require('./lib/asserts');
var bkm = require("./edit_session/bracket_match");
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
var EditSession = (function (_super) {
    __extends(EditSession, _super);
    function EditSession(text, mode) {
        _super.call(this);
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
        this.$bracketMatcher = new bkm.BracketMatchService(this);
        this.getAnnotations = function () {
            return this.$annotations || [];
        };
        this.$foldData.toString = function () {
            return this.join("\n");
        };
        this.on("changeFold", this.onChangeFold.bind(this));
        if (typeof text !== "object" || !text.getLine) {
            this.setDocument(new docm.Document(text));
        }
        else {
            this.setDocument(text);
        }
        this.selection = new sem.Selection(this);
        config.resetOptions(this);
        this.setMode(mode);
        config._signal("session", this);
    }
    EditSession.prototype.setDocument = function (doc) {
        if (this.doc) {
            this.doc.removeListener("change", this.$onChange);
        }
        this.doc = doc;
        doc.on("change", this.$onChange);
        if (this.bgTokenizer) {
            this.bgTokenizer.setDocument(this.getDocument());
        }
        this.resetCaches();
    };
    EditSession.prototype.getDocument = function () {
        return this.doc;
    };
    EditSession.prototype.$resetRowCache = function (docRow) {
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
    };
    EditSession.prototype.$getRowCacheIndex = function (cacheArray, val) {
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
    };
    EditSession.prototype.resetCaches = function () {
        this.$modified = true;
        this.$wrapData = [];
        this.$rowLengthCache = [];
        this.$resetRowCache(0);
        if (this.bgTokenizer) {
            this.bgTokenizer.start(0);
        }
    };
    EditSession.prototype.onChangeFold = function (e) {
        var fold = e.data;
        this.$resetRowCache(fold.start.row);
    };
    EditSession.prototype.onChange = function (e) {
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
    };
    EditSession.prototype.setValue = function (text) {
        this.doc.setValue(text);
        this.selection.moveTo(0, 0);
        this.$resetRowCache(0);
        this.$deltas = [];
        this.$deltasDoc = [];
        this.$deltasFold = [];
        this.setUndoManager(this.$undoManager);
        this.getUndoManager().reset();
    };
    EditSession.prototype.toString = function () {
        return this.getValue();
    };
    EditSession.prototype.getValue = function () {
        return this.doc.getValue();
    };
    EditSession.prototype.getSelection = function () {
        return this.selection;
    };
    EditSession.prototype.getState = function (row) {
        return this.bgTokenizer.getState(row);
    };
    EditSession.prototype.getTokens = function (row) {
        return this.bgTokenizer.getTokens(row);
    };
    EditSession.prototype.getTokenAt = function (row, column) {
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
    };
    EditSession.prototype.setUndoManager = function (undoManager) {
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
            this.$informUndoManager = lang.delayedCall(this.$syncInformUndoManager);
        }
    };
    EditSession.prototype.markUndoGroup = function () {
        if (this.$syncInformUndoManager)
            this.$syncInformUndoManager();
    };
    EditSession.prototype.getUndoManager = function () {
        return this.$undoManager || this.$defaultUndoManager;
    };
    EditSession.prototype.getTabString = function () {
        if (this.getUseSoftTabs()) {
            return lang.stringRepeat(" ", this.getTabSize());
        }
        else {
            return "\t";
        }
    };
    EditSession.prototype.setUseSoftTabs = function (val) {
        this.setOption("useSoftTabs", val);
    };
    EditSession.prototype.getUseSoftTabs = function () {
        return this.$useSoftTabs && !this.$mode.$indentWithTabs;
    };
    EditSession.prototype.setTabSize = function (tabSize) {
        this.setOption("tabSize", tabSize);
    };
    EditSession.prototype.getTabSize = function () {
        return this.$tabSize;
    };
    EditSession.prototype.isTabStop = function (position) {
        return this.$useSoftTabs && (position.column % this.$tabSize === 0);
    };
    EditSession.prototype.setOverwrite = function (overwrite) {
        this.setOption("overwrite", overwrite);
    };
    EditSession.prototype.getOverwrite = function () {
        return this.$overwrite;
    };
    EditSession.prototype.toggleOverwrite = function () {
        this.setOverwrite(!this.$overwrite);
    };
    EditSession.prototype.addGutterDecoration = function (row, className) {
        if (!this.$decorations[row]) {
            this.$decorations[row] = "";
        }
        this.$decorations[row] += " " + className;
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.removeGutterDecoration = function (row, className) {
        this.$decorations[row] = (this.$decorations[row] || "").replace(" " + className, "");
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.getBreakpoints = function () {
        return this.$breakpoints;
    };
    EditSession.prototype.setBreakpoints = function (rows) {
        this.$breakpoints = [];
        for (var i = 0; i < rows.length; i++) {
            this.$breakpoints[rows[i]] = "ace_breakpoint";
        }
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.clearBreakpoints = function () {
        this.$breakpoints = [];
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.setBreakpoint = function (row, className) {
        if (className === undefined)
            className = "ace_breakpoint";
        if (className)
            this.$breakpoints[row] = className;
        else
            delete this.$breakpoints[row];
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.clearBreakpoint = function (row) {
        delete this.$breakpoints[row];
        this._signal("changeBreakpoint", {});
    };
    EditSession.prototype.addMarker = function (range, clazz, type, inFront) {
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
    };
    EditSession.prototype.addDynamicMarker = function (marker, inFront) {
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
    };
    EditSession.prototype.removeMarker = function (markerId) {
        var marker = this.$frontMarkers[markerId] || this.$backMarkers[markerId];
        if (!marker)
            return;
        var markers = marker.inFront ? this.$frontMarkers : this.$backMarkers;
        if (marker) {
            delete (markers[markerId]);
            this._signal(marker.inFront ? "changeFrontMarker" : "changeBackMarker");
        }
    };
    EditSession.prototype.getMarkers = function (inFront) {
        return inFront ? this.$frontMarkers : this.$backMarkers;
    };
    EditSession.prototype.highlight = function (re) {
        if (!this.$searchHighlight) {
            var highlight = new shm.SearchHighlight(null, "ace_selected-word", "text");
            this.$searchHighlight = this.addDynamicMarker(highlight);
        }
        this.$searchHighlight.setRegexp(re);
    };
    EditSession.prototype.highlightLines = function (startRow, endRow, clazz, inFront) {
        if (typeof endRow != "number") {
            clazz = endRow;
            endRow = startRow;
        }
        if (!clazz)
            clazz = "ace_step";
        var range = new rng.Range(startRow, 0, endRow, Infinity);
        range.id = this.addMarker(range, clazz, "fullLine", inFront);
        return range;
    };
    EditSession.prototype.setAnnotations = function (annotations) {
        this.$annotations = annotations;
        this._signal("changeAnnotation", {});
    };
    EditSession.prototype.clearAnnotations = function () {
        this.setAnnotations([]);
    };
    EditSession.prototype.$detectNewLine = function (text) {
        var match = text.match(/^.*?(\r?\n)/m);
        if (match) {
            this.$autoNewLine = match[1];
        }
        else {
            this.$autoNewLine = "\n";
        }
    };
    EditSession.prototype.getWordRange = function (row, column) {
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
        return new rng.Range(row, start, row, end);
    };
    EditSession.prototype.getAWordRange = function (row, column) {
        var wordRange = this.getWordRange(row, column);
        var line = this.getLine(wordRange.end.row);
        while (line.charAt(wordRange.end.column).match(/[ \t]/)) {
            wordRange.end.column += 1;
        }
        return wordRange;
    };
    EditSession.prototype.setNewLineMode = function (newLineMode) {
        this.doc.setNewLineMode(newLineMode);
    };
    EditSession.prototype.getNewLineMode = function () {
        return this.doc.getNewLineMode();
    };
    EditSession.prototype.setUseWorker = function (useWorker) { this.setOption("useWorker", useWorker); };
    EditSession.prototype.getUseWorker = function () { return this.$useWorker; };
    EditSession.prototype.onReloadTokenizer = function (e) {
        var rows = e.data;
        this.bgTokenizer.start(rows.first);
        this._signal("tokenizerUpdate", e);
    };
    EditSession.prototype.setMode = function (mode, cb) {
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
            this.$modes["ace/mode/text"] = new txm.Mode();
        if (this.$modes[path] && !options) {
            this.$onChangeMode(this.$modes[path]);
            cb && cb();
            return;
        }
        this.$modeId = path;
        config.loadModule(["mode", path], function (m) {
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
    };
    EditSession.prototype.$onChangeMode = function (mode, $isPlaceholder) {
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
            this.bgTokenizer = new btm.BackgroundTokenizer(tokenizer);
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
    };
    EditSession.prototype.$stopWorker = function () {
        if (this.$worker) {
            this.$worker.terminate();
        }
        this.$worker = null;
    };
    EditSession.prototype.$startWorker = function () {
        try {
            this.$worker = this.$mode.createWorker(this);
        }
        catch (e) {
            this.$worker = null;
        }
    };
    EditSession.prototype.getMode = function () {
        return this.$mode;
    };
    EditSession.prototype.setScrollTop = function (scrollTop) {
        if (this.$scrollTop === scrollTop || isNaN(scrollTop)) {
            return;
        }
        this.$scrollTop = scrollTop;
        this._signal("changeScrollTop", scrollTop);
    };
    EditSession.prototype.getScrollTop = function () {
        return this.$scrollTop;
    };
    EditSession.prototype.setScrollLeft = function (scrollLeft) {
        if (this.$scrollLeft === scrollLeft || isNaN(scrollLeft))
            return;
        this.$scrollLeft = scrollLeft;
        this._signal("changeScrollLeft", scrollLeft);
    };
    EditSession.prototype.getScrollLeft = function () {
        return this.$scrollLeft;
    };
    EditSession.prototype.getScreenWidth = function () {
        this.$computeWidth();
        if (this.lineWidgets)
            return Math.max(this.getLineWidgetMaxWidth(), this.screenWidth);
        return this.screenWidth;
    };
    EditSession.prototype.getLineWidgetMaxWidth = function () {
        if (this.lineWidgetsWidth != null)
            return this.lineWidgetsWidth;
        var width = 0;
        this.lineWidgets.forEach(function (w) {
            if (w && w.screenWidth > width)
                width = w.screenWidth;
        });
        return this.lineWidgetWidth = width;
    };
    EditSession.prototype.$computeWidth = function (force) {
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
    };
    EditSession.prototype.getLine = function (row) {
        return this.doc.getLine(row);
    };
    EditSession.prototype.getLines = function (firstRow, lastRow) {
        return this.doc.getLines(firstRow, lastRow);
    };
    EditSession.prototype.getLength = function () {
        return this.doc.getLength();
    };
    EditSession.prototype.getTextRange = function (range) {
        return this.doc.getTextRange(range || this.selection.getRange());
    };
    EditSession.prototype.insert = function (position, text) {
        return this.doc.insert(position, text);
    };
    EditSession.prototype.remove = function (range) {
        return this.doc.remove(range);
    };
    EditSession.prototype.undoChanges = function (deltas, dontSelect) {
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
    };
    EditSession.prototype.redoChanges = function (deltas, dontSelect) {
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
    };
    EditSession.prototype.setUndoSelect = function (enable) {
        this.$undoSelect = enable;
    };
    EditSession.prototype.$getUndoSelection = function (deltas, isUndo, lastUndoRange) {
        function isInsert(delta) {
            var insert = delta.action === "insertText" || delta.action === "insertLines";
            return isUndo ? !insert : insert;
        }
        var delta = deltas[0];
        var range;
        var point;
        var lastDeltaIsInsert = false;
        if (isInsert(delta)) {
            range = rng.Range.fromPoints(delta.range.start, delta.range.end);
            lastDeltaIsInsert = true;
        }
        else {
            range = rng.Range.fromPoints(delta.range.start, delta.range.start);
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
                    range = rng.Range.fromPoints(delta.range.start, delta.range.start);
                }
                lastDeltaIsInsert = false;
            }
        }
        if (lastUndoRange != null) {
            if (rng.Range.comparePoints(lastUndoRange.start, range.start) === 0) {
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
    };
    EditSession.prototype.replace = function (range, text) {
        return this.doc.replace(range, text);
    };
    EditSession.prototype.moveText = function (fromRange, toPosition, copy) {
        var text = this.getTextRange(fromRange);
        var folds = this.getFoldsInRange(fromRange);
        var rowDiff;
        var colDiff;
        var toRange = rng.Range.fromPoints(toPosition, toPosition);
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
    };
    EditSession.prototype.indentRows = function (startRow, endRow, indentString) {
        indentString = indentString.replace(/\t/g, this.getTabString());
        for (var row = startRow; row <= endRow; row++)
            this.insert({ row: row, column: 0 }, indentString);
    };
    EditSession.prototype.outdentRows = function (range) {
        var rowRange = range.collapseRows();
        var deleteRange = new rng.Range(0, 0, 0, 0);
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
    };
    EditSession.prototype.$moveLines = function (firstRow, lastRow, dir) {
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
        var range = new rng.Range(firstRow, 0, lastRow, Number.MAX_VALUE);
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
    };
    EditSession.prototype.moveLinesUp = function (firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, -1);
    };
    EditSession.prototype.moveLinesDown = function (firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, 1);
    };
    EditSession.prototype.duplicateLines = function (firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, 0);
    };
    EditSession.prototype.$clipRowToDocument = function (row) {
        return Math.max(0, Math.min(row, this.doc.getLength() - 1));
    };
    EditSession.prototype.$clipColumnToRow = function (row, column) {
        if (column < 0)
            return 0;
        return Math.min(this.doc.getLine(row).length, column);
    };
    EditSession.prototype.$clipPositionToDocument = function (row, column) {
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
    };
    EditSession.prototype.$clipRangeToDocument = function (range) {
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
    };
    EditSession.prototype.setUseWrapMode = function (useWrapMode) {
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
    };
    EditSession.prototype.getUseWrapMode = function () {
        return this.$useWrapMode;
    };
    EditSession.prototype.setWrapLimitRange = function (min, max) {
        if (this.$wrapLimitRange.min !== min || this.$wrapLimitRange.max !== max) {
            this.$wrapLimitRange = {
                min: min,
                max: max
            };
            this.$modified = true;
            this._signal("changeWrapMode");
        }
    };
    EditSession.prototype.adjustWrapLimit = function (desiredLimit, $printMargin) {
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
    };
    EditSession.prototype.$constrainWrapLimit = function (wrapLimit, min, max) {
        if (min)
            wrapLimit = Math.max(min, wrapLimit);
        if (max)
            wrapLimit = Math.min(max, wrapLimit);
        return wrapLimit;
    };
    EditSession.prototype.getWrapLimit = function () {
        return this.$wrapLimit;
    };
    EditSession.prototype.setWrapLimit = function (limit) {
        this.setWrapLimitRange(limit, limit);
    };
    EditSession.prototype.getWrapLimitRange = function () {
        return {
            min: this.$wrapLimitRange.min,
            max: this.$wrapLimitRange.max
        };
    };
    EditSession.prototype.$updateInternalDataOnChange = function (e) {
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
    };
    EditSession.prototype.$updateRowLengthCache = function (firstRow, lastRow, b) {
        this.$rowLengthCache[firstRow] = null;
        this.$rowLengthCache[lastRow] = null;
    };
    EditSession.prototype.$updateWrapData = function (firstRow, lastRow) {
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
    };
    EditSession.prototype.$computeWrapSplits = function (tokens, wrapLimit, tabSize) {
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
    };
    EditSession.prototype.$getDisplayTokens = function (str, offset) {
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
    };
    EditSession.prototype.$getStringScreenWidth = function (str, maxScreenColumn, screenColumn) {
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
    };
    EditSession.prototype.getRowLength = function (row) {
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
    };
    EditSession.prototype.getRowLineCount = function (row) {
        if (!this.$useWrapMode || !this.$wrapData[row]) {
            return 1;
        }
        else {
            return this.$wrapData[row].length + 1;
        }
    };
    EditSession.prototype.getRowWrapIndent = function (screenRow) {
        if (this.$useWrapMode) {
            var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
            var splits = this.$wrapData[pos.row];
            return splits.length && splits[0] < pos.column ? splits['indent'] : 0;
        }
        else {
            return 0;
        }
    };
    EditSession.prototype.getScreenLastRowColumn = function (screenRow) {
        var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
        return this.documentToScreenColumn(pos.row, pos.column);
    };
    EditSession.prototype.getDocumentLastRowColumn = function (docRow, docColumn) {
        var screenRow = this.documentToScreenRow(docRow, docColumn);
        return this.getScreenLastRowColumn(screenRow);
    };
    EditSession.prototype.getDocumentLastRowColumnPosition = function (docRow, docColumn) {
        var screenRow = this.documentToScreenRow(docRow, docColumn);
        return this.screenToDocumentPosition(screenRow, Number.MAX_VALUE / 10);
    };
    EditSession.prototype.getRowSplitData = function (row) {
        if (!this.$useWrapMode) {
            return undefined;
        }
        else {
            return this.$wrapData[row];
        }
    };
    EditSession.prototype.getScreenTabSize = function (screenColumn) {
        return this.$tabSize - screenColumn % this.$tabSize;
    };
    EditSession.prototype.screenToDocumentRow = function (screenRow, screenColumn) {
        return this.screenToDocumentPosition(screenRow, screenColumn).row;
    };
    EditSession.prototype.screenToDocumentColumn = function (screenRow, screenColumn) {
        return this.screenToDocumentPosition(screenRow, screenColumn).column;
    };
    EditSession.prototype.screenToDocumentPosition = function (screenRow, screenColumn) {
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
    };
    EditSession.prototype.documentToScreenPosition = function (docRow, docColumn) {
        var pos;
        if (typeof docColumn === "undefined") {
            pos = this.$clipPositionToDocument(docRow['row'], docRow['column']);
        }
        else {
            asserts.assert(typeof docRow === 'number', "docRow must be a number");
            asserts.assert(typeof docColumn === 'number', "docColumn must be a number");
            pos = this.$clipPositionToDocument(docRow, docColumn);
        }
        docRow = pos.row;
        docColumn = pos.column;
        asserts.assert(typeof docRow === 'number', "docRow must be a number");
        asserts.assert(typeof docColumn === 'number', "docColumn must be a number");
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
    };
    EditSession.prototype.documentToScreenColumn = function (docRow, docColumn) {
        return this.documentToScreenPosition(docRow, docColumn).column;
    };
    EditSession.prototype.documentToScreenRow = function (docRow, docColumn) {
        return this.documentToScreenPosition(docRow, docColumn).row;
    };
    EditSession.prototype.getScreenLength = function () {
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
    };
    EditSession.prototype.$setFontMetrics = function (fm) {
    };
    EditSession.prototype.findMatchingBracket = function (position, chr) {
        return this.$bracketMatcher.findMatchingBracket(position, chr);
    };
    EditSession.prototype.getBracketRange = function (position) {
        return this.$bracketMatcher.getBracketRange(position);
    };
    EditSession.prototype.$findOpeningBracket = function (bracket, position, typeRe) {
        return this.$bracketMatcher.$findOpeningBracket(bracket, position, typeRe);
    };
    EditSession.prototype.$findClosingBracket = function (bracket, position, typeRe) {
        return this.$bracketMatcher.$findClosingBracket(bracket, position, typeRe);
    };
    return EditSession;
})(eve.EventEmitterClass);
exports.EditSession = EditSession;
config.defineOptions(EditSession.prototype, "session", {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdF9zZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2VkaXRfc2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5zZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50IiwiRWRpdFNlc3Npb24uJHJlc2V0Um93Q2FjaGUiLCJFZGl0U2Vzc2lvbi4kZ2V0Um93Q2FjaGVJbmRleCIsIkVkaXRTZXNzaW9uLnJlc2V0Q2FjaGVzIiwiRWRpdFNlc3Npb24ub25DaGFuZ2VGb2xkIiwiRWRpdFNlc3Npb24ub25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLnRvU3RyaW5nIiwiRWRpdFNlc3Npb24uZ2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi5nZXRTZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi5nZXRTdGF0ZSIsIkVkaXRTZXNzaW9uLmdldFRva2VucyIsIkVkaXRTZXNzaW9uLmdldFRva2VuQXQiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLm1hcmtVbmRvR3JvdXAiLCJFZGl0U2Vzc2lvbi5nZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLmdldFRhYlN0cmluZyIsIkVkaXRTZXNzaW9uLnNldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uZ2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5zZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmlzVGFiU3RvcCIsIkVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmdldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmFkZEd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24uZ2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uYWRkTWFya2VyIiwiRWRpdFNlc3Npb24uYWRkRHluYW1pY01hcmtlciIsIkVkaXRTZXNzaW9uLnJlbW92ZU1hcmtlciIsIkVkaXRTZXNzaW9uLmdldE1hcmtlcnMiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHQiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHRMaW5lcyIsIkVkaXRTZXNzaW9uLnNldEFubm90YXRpb25zIiwiRWRpdFNlc3Npb24uY2xlYXJBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLiRkZXRlY3ROZXdMaW5lIiwiRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLnNldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uZ2V0TmV3TGluZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5vblJlbG9hZFRva2VuaXplciIsIkVkaXRTZXNzaW9uLnNldE1vZGUiLCJFZGl0U2Vzc2lvbi4kb25DaGFuZ2VNb2RlIiwiRWRpdFNlc3Npb24uJHN0b3BXb3JrZXIiLCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNb2RlIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmVXaWRnZXRNYXhXaWR0aCIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TGluZXMiLCJFZGl0U2Vzc2lvbi5nZXRMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRUZXh0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5pbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZW1vdmUiLCJFZGl0U2Vzc2lvbi51bmRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnJlZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24uc2V0VW5kb1NlbGVjdCIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24uaXNJbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZXBsYWNlIiwiRWRpdFNlc3Npb24ubW92ZVRleHQiLCJFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzIiwiRWRpdFNlc3Npb24ub3V0ZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi4kbW92ZUxpbmVzIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzVXAiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duIiwiRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXMiLCJFZGl0U2Vzc2lvbi4kY2xpcFJvd1RvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcENvbHVtblRvUm93IiwiRWRpdFNlc3Npb24uJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcFJhbmdlVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLnNldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uZ2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLmFkanVzdFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLiRjb25zdHJhaW5XcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVSb3dMZW5ndGhDYWNoZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVXcmFwRGF0YSIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cyIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cy5hZGRTcGxpdCIsIkVkaXRTZXNzaW9uLiRnZXREaXNwbGF5VG9rZW5zIiwiRWRpdFNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGluZUNvdW50IiwiRWRpdFNlc3Npb24uZ2V0Um93V3JhcEluZGVudCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmdldFJvd1NwbGl0RGF0YSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlblRhYlNpemUiLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93IiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudENvbHVtbiIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoIiwiRWRpdFNlc3Npb24uJHNldEZvbnRNZXRyaWNzIiwiRWRpdFNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEJyYWNrZXRSYW5nZSIsIkVkaXRTZXNzaW9uLiRmaW5kT3BlbmluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi4kZmluZENsb3NpbmdCcmFja2V0Il0sIm1hcHBpbmdzIjoiOzs7OztBQStCQSxJQUFPLElBQUksV0FBVyxZQUFZLENBQUMsQ0FBQztBQUNwQyxJQUFPLE1BQU0sV0FBVyxVQUFVLENBQUMsQ0FBQztBQUNwQyxJQUFPLEdBQUcsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0FBRTVDLElBQU8sR0FBRyxXQUFXLGFBQWEsQ0FBQyxDQUFDO0FBQ3BDLElBQU8sR0FBRyxXQUFXLGFBQWEsQ0FBQyxDQUFDO0FBQ3BDLElBQU8sR0FBRyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ2hDLElBQU8sSUFBSSxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ3BDLElBQU8sR0FBRyxXQUFXLHdCQUF3QixDQUFDLENBQUM7QUFDL0MsSUFBTyxHQUFHLFdBQVcsb0JBQW9CLENBQUMsQ0FBQztBQUMzQyxJQUFPLE9BQU8sV0FBVyxlQUFlLENBQUMsQ0FBQztBQUMxQyxJQUFPLEdBQUcsV0FBVyw4QkFBOEIsQ0FBQyxDQUFDO0FBSXJELElBQUksSUFBSSxHQUFHLENBQUMsRUFDUixRQUFRLEdBQUcsQ0FBQyxFQUNaLGlCQUFpQixHQUFHLENBQUMsRUFDckIsZ0JBQWdCLEdBQUcsQ0FBQyxFQUNwQixXQUFXLEdBQUcsQ0FBQyxFQUNmLEtBQUssR0FBRyxFQUFFLEVBQ1YsR0FBRyxHQUFHLEVBQUUsRUFDUixTQUFTLEdBQUcsRUFBRSxDQUFDO0FBSW5CLHFCQUFxQixDQUFTO0lBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNYQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDN0JBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFB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TUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLElBQUlBLEtBQWdCQSxDQUFDQTtRQUNyQkEsSUFBSUEsS0FBc0NBLENBQUNBO1FBQzNDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakVBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ25FQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDOURBLENBQUNBO2dCQUNEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN2RUEsQ0FBQ0E7Z0JBQ0RBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBSURBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEVBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNwRUEsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDdEVBLENBQUNBO1lBRURBLElBQUlBLEdBQUdBLEdBQUdBLGFBQWFBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQW9CTXhFLDZCQUFPQSxHQUFkQSxVQUFlQSxLQUFnQkEsRUFBRUEsSUFBWUE7UUFDekMwRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFjTTFFLDhCQUFRQSxHQUFmQSxVQUFnQkEsU0FBU0EsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUE7UUFDdkMyRSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFD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QSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUMxQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLElBQUlBLEdBQUdBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLElBQUlBLElBQUlBLEdBQUdB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Q0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDM0JBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3RDQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQzNCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEdBQUdBLEdBQUdB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LEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNoRUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFTEEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxDQUFDQTtnQkFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3RDQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNqQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFHSkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVqQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtnQkFFL0JBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2ZBLENBQUNBO1lBQ0RBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQy9EQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSwyREFBMkRBLENBQUNBLENBQUNBO1FBQy9FQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDWkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFbERBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVNOUYsMkNBQXFCQSxHQUE1QkEsVUFBNkJBLFFBQVFBLEVBQUVBLE9BQU9BLEVBQUVBLENBQUVBO1FBQzlDK0YsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdENBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQUVNL0YscUNBQWVBLEdBQXRCQSxVQUF1QkEsUUFBUUEsRUFBRUEsT0FBT0E7UUFDcENnRyxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNuQ0EsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDaENBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNoQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsUUFBUUEsQ0FBQ0E7UUFFYkEsSUFBSUEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbkJBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzlDQSxPQUFPQSxHQUFHQSxJQUFJQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUNwQkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM1Q0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtnQkFDcEVBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDWkEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBU0EsV0FBV0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUE7b0JBQ3ZELElBQUksVUFBb0IsQ0FBQztvQkFDekIsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQ3RCLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQy9CLFdBQVcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQ2hDLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxpQkFBaUIsQ0FBQzt3QkFDbEMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQzs0QkFDekMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO3dCQUNyQyxDQUFDO29CQUNMLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FDL0IsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEVBQ3hDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDdkIsQ0FBQztvQkFDRCxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDdkMsQ0FBQyxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUNSQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUNoQkEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FDckNBLENBQUNBO2dCQUVGQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO2dCQUNuRkEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9oRyx3Q0FBa0JBLEdBQTFCQSxVQUEyQkEsTUFBZ0JBLEVBQUVBLFNBQWlCQSxFQUFFQSxPQUFnQkE7UUFDNUVpRyxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFFREEsSUFBSUEsTUFBTUEsR0FBYUEsRUFBRUEsQ0FBQ0E7UUFDMUJBLElBQUlBLGFBQWFBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQ2xDQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxFQUFFQSxZQUFZQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVwQ0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7UUFFOUJBLGtCQUFrQkEsU0FBaUJBO1lBQy9CQyxJQUFJQSxTQUFTQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUluREEsSUFBSUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDM0JBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO2dCQUVkQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQTtnQkFDWCxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUNULE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixDQUFDLENBQUNBO2dCQUVGQSxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQTtnQkFDVixHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUNULE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsQixDQUFDLENBQUNBLENBQUNBO1lBRVBBLFlBQVlBLElBQUlBLEdBQUdBLENBQUNBO1lBQ3BCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtZQUMxQkEsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFDMUJBLENBQUNBO1FBRURELE9BQU9BLGFBQWFBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLEVBQUVBLENBQUNBO1lBRTNDQSxJQUFJQSxLQUFLQSxHQUFHQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtZQUlsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsSUFBSUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBTXZEQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDaEJBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBTURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLGlCQUFpQkEsSUFBSUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFJMUVBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBO29CQUMxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFHckNBLEtBQUtBLENBQUNBO29CQUNWQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBSURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO29CQUNwQkEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hCQSxRQUFRQSxDQUFDQTtnQkFDYkEsQ0FBQ0E7Z0JBS0RBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO2dCQUM5QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3pDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO3dCQUNwQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3pCQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBR0RBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFJREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsR0FBR0EsU0FBU0EsR0FBR0EsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0ZBLE9BQU9BLEtBQUtBLEdBQUdBLFFBQVFBLElBQUlBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7Z0JBQzNEQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNaQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsT0FBT0EsS0FBS0EsR0FBR0EsUUFBUUEsSUFBSUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtvQkFDM0RBLEtBQUtBLEVBQUVBLENBQUNBO2dCQUNaQSxDQUFDQTtnQkFDREEsT0FBT0EsS0FBS0EsR0FBR0EsUUFBUUEsSUFBSUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsV0FBV0EsRUFBRUEsQ0FBQ0E7b0JBQ3REQSxLQUFLQSxFQUFFQSxDQUFDQTtnQkFDWkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLE9BQU9BLEtBQUtBLEdBQUdBLFFBQVFBLElBQUlBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBO29CQUMvQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7Z0JBQ1pBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsUUFBUUEsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxRQUFRQSxDQUFDQTtZQUNiQSxDQUFDQTtZQUdEQSxLQUFLQSxHQUFHQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtZQUc5QkEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2xCQSxDQUFDQTtJQVNPakcsdUNBQWlCQSxHQUF6QkEsVUFBMEJBLEdBQVdBLEVBQUVBLE1BQWVBO1FBQ2xEbUcsSUFBSUEsR0FBR0EsR0FBYUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxNQUFNQSxHQUFHQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckRBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDL0JBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUN4QkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtZQUVEQSxJQUFJQSxD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LENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVPckcscUNBQWVBLEdBQXZCQSxVQUF3QkEsR0FBV0E7UUFDL0JzRyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU10RyxzQ0FBZ0JBLEdBQXZCQSxVQUF3QkEsU0FBaUJBO1FBQ3JDdUcsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBRXJDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0Es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QUNBO1FBRWxCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxHQUFHQSxJQUFJQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN0QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdB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LEtBQUtBLFFBQVFBLEVBQUVBLDRCQUE0QkEsQ0FBQ0EsQ0FBQ0E7WUFDNUVBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBO1FBRURBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2pCQSxTQUFTQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN2QkEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsTUFBTUEsS0FBS0EsUUFBUUEsRUFBRUEseUJBQXlCQSxDQUFDQSxDQUFDQTtRQUN0RUEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsU0FBU0EsS0FBS0EsUUFBUUEsRUFBRUEsNEJBQTRCQSxDQUFDQSxDQUFDQTtRQUU1RUEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3hCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUdoQkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hCQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFFREEsSUFBSUEsTUFBTUEsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFcEJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1FBQ2pDQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLFFBQVFBLEVBQUVB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QUFJLENBQUMsUUFBUSxLQUFLLE9BQU8sQ0FBQztnQkFBQyxNQUFNLENBQUM7WUFFeEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDdEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7WUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsWUFBWSxFQUFFLENBQUM7UUFDZixVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELFNBQVMsRUFBRTtRQUNQLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZELFlBQVksRUFBRSxLQUFLO0tBQ3RCO0lBQ0QsV0FBVyxFQUFFO1FBQ1QsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUNuRCxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQSxDQUFDLENBQUM7UUFDcEQsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxJQUFJLEVBQUU7UUFDRixHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDeEMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQyxDQUFDO0tBQzFDO0NBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBvb3AgPSByZXF1aXJlKFwiLi9saWIvb29wXCIpO1xuaW1wb3J0IGxhbmcgPSByZXF1aXJlKFwiLi9saWIvbGFuZ1wiKTtcbmltcG9ydCBjb25maWcgPSByZXF1aXJlKFwiLi9jb25maWdcIik7XG5pbXBvcnQgZXZlID0gcmVxdWlyZShcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIik7XG4vL2ltcG9ydCBmbGQgPSByZXF1aXJlKFwiLi9lZGl0X3Nlc3Npb24vZm9sZGluZ1wiKVxuaW1wb3J0IHNlbSA9IHJlcXVpcmUoXCIuL3NlbGVjdGlvblwiKTtcbmltcG9ydCB0eG0gPSByZXF1aXJlKFwiLi9tb2RlL3RleHRcIik7XG5pbXBvcnQgcm5nID0gcmVxdWlyZShcIi4vcmFuZ2VcIik7XG5pbXBvcnQgZG9jbSA9IHJlcXVpcmUoXCIuL2RvY3VtZW50XCIpO1xuaW1wb3J0IGJ0bSA9IHJlcXVpcmUoXCIuL2JhY2tncm91bmRfdG9rZW5pemVyXCIpO1xuaW1wb3J0IHNobSA9IHJlcXVpcmUoXCIuL3NlYXJjaF9oaWdobGlnaHRcIik7XG5pbXBvcnQgYXNzZXJ0cyA9IHJlcXVpcmUoJy4vbGliL2Fzc2VydHMnKTtcbmltcG9ydCBia20gPSByZXF1aXJlKFwiLi9lZGl0X3Nlc3Npb24vYnJhY2tldF9tYXRjaFwiKTtcbmltcG9ydCB1bmRvID0gcmVxdWlyZSgnLi91bmRvbWFuYWdlcicpXG5cbi8vIFwiVG9rZW5zXCJcbnZhciBDSEFSID0gMSxcbiAgICBDSEFSX0VYVCA9IDIsXG4gICAgUExBQ0VIT0xERVJfU1RBUlQgPSAzLFxuICAgIFBMQUNFSE9MREVSX0JPRFkgPSA0LFxuICAgIFBVTkNUVUFUSU9OID0gOSxcbiAgICBTUEFDRSA9IDEwLFxuICAgIFRBQiA9IDExLFxuICAgIFRBQl9TUEFDRSA9IDEyO1xuXG4vLyBGb3IgZXZlcnkga2V5c3Ryb2tlIHRoaXMgZ2V0cyBjYWxsZWQgb25jZSBwZXIgY2hhciBpbiB0aGUgd2hvbGUgZG9jISFcbi8vIFdvdWxkbid0IGh1cnQgdG8gbWFrZSBpdCBhIGJpdCBmYXN0ZXIgZm9yIGMgPj0gMHgxMTAwXG5mdW5jdGlvbiBpc0Z1bGxXaWR0aChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAoYyA8IDB4MTEwMClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBjID49IDB4MTEwMCAmJiBjIDw9IDB4MTE1RiB8fFxuICAgICAgICBjID49IDB4MTFBMyAmJiBjIDw9IDB4MTFBNyB8fFxuICAgICAgICBjID49IDB4MTFGQSAmJiBjIDw9IDB4MTFGRiB8fFxuICAgICAgICBjID49IDB4MjMyOSAmJiBjIDw9IDB4MjMyQSB8fFxuICAgICAgICBjID49IDB4MkU4MCAmJiBjIDw9IDB4MkU5OSB8fFxuICAgICAgICBjID49IDB4MkU5QiAmJiBjIDw9IDB4MkVGMyB8fFxuICAgICAgICBjID49IDB4MkYwMCAmJiBjIDw9IDB4MkZENSB8fFxuICAgICAgICBjID49IDB4MkZGMCAmJiBjIDw9IDB4MkZGQiB8fFxuICAgICAgICBjID49IDB4MzAwMCAmJiBjIDw9IDB4MzAzRSB8fFxuICAgICAgICBjID49IDB4MzA0MSAmJiBjIDw9IDB4MzA5NiB8fFxuICAgICAgICBjID49IDB4MzA5OSAmJiBjIDw9IDB4MzBGRiB8fFxuICAgICAgICBjID49IDB4MzEwNSAmJiBjIDw9IDB4MzEyRCB8fFxuICAgICAgICBjID49IDB4MzEzMSAmJiBjIDw9IDB4MzE4RSB8fFxuICAgICAgICBjID49IDB4MzE5MCAmJiBjIDw9IDB4MzFCQSB8fFxuICAgICAgICBjID49IDB4MzFDMCAmJiBjIDw9IDB4MzFFMyB8fFxuICAgICAgICBjID49IDB4MzFGMCAmJiBjIDw9IDB4MzIxRSB8fFxuICAgICAgICBjID49IDB4MzIyMCAmJiBjIDw9IDB4MzI0NyB8fFxuICAgICAgICBjID49IDB4MzI1MCAmJiBjIDw9IDB4MzJGRSB8fFxuICAgICAgICBjID49IDB4MzMwMCAmJiBjIDw9IDB4NERCRiB8fFxuICAgICAgICBjID49IDB4NEUwMCAmJiBjIDw9IDB4QTQ4QyB8fFxuICAgICAgICBjID49IDB4QTQ5MCAmJiBjIDw9IDB4QTRDNiB8fFxuICAgICAgICBjID49IDB4QTk2MCAmJiBjIDw9IDB4QTk3QyB8fFxuICAgICAgICBjID49IDB4QUMwMCAmJiBjIDw9IDB4RDdBMyB8fFxuICAgICAgICBjID49IDB4RDdCMCAmJiBjIDw9IDB4RDdDNiB8fFxuICAgICAgICBjID49IDB4RDdDQiAmJiBjIDw9IDB4RDdGQiB8fFxuICAgICAgICBjID49IDB4RjkwMCAmJiBjIDw9IDB4RkFGRiB8fFxuICAgICAgICBjID49IDB4RkUxMCAmJiBjIDw9IDB4RkUxOSB8fFxuICAgICAgICBjID49IDB4RkUzMCAmJiBjIDw9IDB4RkU1MiB8fFxuICAgICAgICBjID49IDB4RkU1NCAmJiBjIDw9IDB4RkU2NiB8fFxuICAgICAgICBjID49IDB4RkU2OCAmJiBjIDw9IDB4RkU2QiB8fFxuICAgICAgICBjID49IDB4RkYwMSAmJiBjIDw9IDB4RkY2MCB8fFxuICAgICAgICBjID49IDB4RkZFMCAmJiBjIDw9IDB4RkZFNjtcbn1cblxuLyoqXG4gKiBTdG9yZXMgYWxsIHRoZSBkYXRhIGFib3V0IFtbRWRpdG9yIGBFZGl0b3JgXV0gc3RhdGUgcHJvdmlkaW5nIGVhc3kgd2F5IHRvIGNoYW5nZSBlZGl0b3JzIHN0YXRlLlxuICpcbiAqIGBFZGl0U2Vzc2lvbmAgY2FuIGJlIGF0dGFjaGVkIHRvIG9ubHkgb25lIFtbRG9jdW1lbnQgYERvY3VtZW50YF1dLiBTYW1lIGBEb2N1bWVudGAgY2FuIGJlIGF0dGFjaGVkIHRvIHNldmVyYWwgYEVkaXRTZXNzaW9uYHMuXG4gKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAqKi9cblxuLy97IGV2ZW50c1xuLyoqXG4gKlxuICogRW1pdHRlZCB3aGVuIHRoZSBkb2N1bWVudCBjaGFuZ2VzLlxuICogQGV2ZW50IGNoYW5nZVxuICogQHBhcmFtIHtPYmplY3R9IGUgQW4gb2JqZWN0IGNvbnRhaW5pbmcgYSBgZGVsdGFgIG9mIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjaGFuZ2UuXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgdGFiIHNpemUgY2hhbmdlcywgdmlhIFtbRWRpdFNlc3Npb24uc2V0VGFiU2l6ZV1dLlxuICpcbiAqIEBldmVudCBjaGFuZ2VUYWJTaXplXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgYWJpbGl0eSB0byBvdmVyd3JpdGUgdGV4dCBjaGFuZ2VzLCB2aWEgW1tFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVdXS5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlT3ZlcndyaXRlXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgZ3V0dGVyIGNoYW5nZXMsIGVpdGhlciBieSBzZXR0aW5nIG9yIHJlbW92aW5nIGJyZWFrcG9pbnRzLCBvciB3aGVuIHRoZSBndXR0ZXIgZGVjb3JhdGlvbnMgY2hhbmdlLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIGZyb250IG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBiYWNrIG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCYWNrTWFya2VyXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhbiBhbm5vdGF0aW9uIGNoYW5nZXMsIGxpa2UgdGhyb3VnaCBbW0VkaXRTZXNzaW9uLnNldEFubm90YXRpb25zXV0uXG4gKlxuICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIGEgYmFja2dyb3VuZCB0b2tlbml6ZXIgYXN5bmNocm9ub3VzbHkgcHJvY2Vzc2VzIG5ldyByb3dzLlxuICogQGV2ZW50IHRva2VuaXplclVwZGF0ZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBlIEFuIG9iamVjdCBjb250YWluaW5nIG9uZSBwcm9wZXJ0eSwgYFwiZGF0YVwiYCwgdGhhdCBjb250YWlucyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY2hhbmdpbmcgcm93c1xuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJyZW50IG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlTW9kZVxuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSB3cmFwIG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcE1vZGVcbiAqXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgd3JhcHBpbmcgbGltaXQgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcExpbWl0XG4gKlxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBjb2RlIGZvbGQgaXMgYWRkZWQgb3IgcmVtb3ZlZC5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlRm9sZFxuICpcbiAqKi9cbi8qKlxuKiBFbWl0dGVkIHdoZW4gdGhlIHNjcm9sbCB0b3AgY2hhbmdlcy5cbiogQGV2ZW50IGNoYW5nZVNjcm9sbFRvcFxuKlxuKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgc2Nyb2xsIGxlZnQgY2hhbmdlcy5cbiAqIEBldmVudCBjaGFuZ2VTY3JvbGxMZWZ0XG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIG5ldyBzY3JvbGwgbGVmdCB2YWx1ZVxuICoqL1xuLy99XG5cbi8qKlxuICpcbiAqIFNldHMgdXAgYSBuZXcgYEVkaXRTZXNzaW9uYCBhbmQgYXNzb2NpYXRlcyBpdCB3aXRoIHRoZSBnaXZlbiBgRG9jdW1lbnRgIGFuZCBgVGV4dE1vZGVgLlxuICogQHBhcmFtIHtEb2N1bWVudCB8IFN0cmluZ30gdGV4dCBbSWYgYHRleHRgIGlzIGEgYERvY3VtZW50YCwgaXQgYXNzb2NpYXRlcyB0aGUgYEVkaXRTZXNzaW9uYCB3aXRoIGl0LiBPdGhlcndpc2UsIGEgbmV3IGBEb2N1bWVudGAgaXMgY3JlYXRlZCwgd2l0aCB0aGUgaW5pdGlhbCB0ZXh0XXs6ICN0ZXh0UGFyYW19XG4gKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFtUaGUgaW5pdGFsIGxhbmd1YWdlIG1vZGUgdG8gdXNlIGZvciB0aGUgZG9jdW1lbnRdezogI21vZGVQYXJhbX1cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqKi9cblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgZXZlLkV2ZW50RW1pdHRlckNsYXNzIGltcGxlbWVudHMgYmttLkJyYWNrZXRNYXRjaGVyIHtcbiAgICBwdWJsaWMgJGJyZWFrcG9pbnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIHB1YmxpYyAkZGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gICAgcHJpdmF0ZSAkZnJvbnRNYXJrZXJzID0ge307XG4gICAgcHVibGljICRiYWNrTWFya2VycyA9IHt9O1xuICAgIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgICBwcml2YXRlICR1bmRvU2VsZWN0ID0gdHJ1ZTtcbiAgICBwcml2YXRlICRkZWx0YXM7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICAgIHByaXZhdGUgJGRlbHRhc0ZvbGQ7XG4gICAgcHJpdmF0ZSAkZnJvbVVuZG87XG4gICAgcHJpdmF0ZSAkZm9sZERhdGEgPSBbXTtcbiAgICBwdWJsaWMgZG9jOiBkb2NtLkRvY3VtZW50O1xuICAgIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgICBwcml2YXRlICR1bmRvTWFuYWdlcjogdW5kby5VbmRvTWFuYWdlcjtcbiAgICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gICAgcHVibGljIGJnVG9rZW5pemVyOiBidG0uQmFja2dyb3VuZFRva2VuaXplcjtcbiAgICBwdWJsaWMgJG1vZGlmaWVkO1xuICAgIHB1YmxpYyBzZWxlY3Rpb246IHNlbS5TZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkZG9jUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICAgIHByaXZhdGUgJHNjcmVlblJvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICRyb3dMZW5ndGhDYWNoZTtcbiAgICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgJHNlYXJjaEhpZ2hsaWdodDtcbiAgICBwcml2YXRlICRhbm5vdGF0aW9ucztcbiAgICBwcml2YXRlICRhdXRvTmV3TGluZTtcbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcbiAgICBwcml2YXRlICR1c2VXb3JrZXI7XG4gICAgcHJpdmF0ZSAkbW9kZXMgPSB7fTtcbiAgICBwdWJsaWMgJG1vZGUgPSBudWxsO1xuICAgIHByaXZhdGUgJG1vZGVJZCA9IG51bGw7XG4gICAgcHJpdmF0ZSAkd29ya2VyO1xuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgbm9uVG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyAkc2Nyb2xsVG9wID0gMDtcbiAgICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgICAvLyBXUkFQTU9ERVxuICAgIHByaXZhdGUgJHdyYXBBc0NvZGU7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gICAgcHVibGljICR1c2VXcmFwTW9kZSA9IGZhbHNlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICBtaW46IG51bGwsXG4gICAgICAgIG1heDogbnVsbFxuICAgIH07XG4gICAgcHVibGljICR1cGRhdGluZztcbiAgICBwdWJsaWMgbGluZVdpZGdldHMgPSBudWxsO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgIHByaXZhdGUgJHN5bmNJbmZvcm1VbmRvTWFuYWdlcjogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgbWVyZ2VVbmRvRGVsdGFzOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHVzZVNvZnRUYWJzOiBib29sZWFuO1xuICAgIHByaXZhdGUgJHRhYlNpemU6IG51bWJlcjtcbiAgICBwcml2YXRlICR3cmFwTWV0aG9kO1xuICAgIHByaXZhdGUgc2NyZWVuV2lkdGg7XG4gICAgcHJpdmF0ZSBsaW5lV2lkZ2V0c1dpZHRoO1xuICAgIHByaXZhdGUgbGluZVdpZGdldFdpZHRoO1xuICAgIHByaXZhdGUgJGdldFdpZGdldFNjcmVlbkxlbmd0aDtcbiAgICAvLyBUT0RPOiBGT0xESU5HOiBUaGVzZSBjb21lIGZyb20gYSB1bmRlci10aGUtcmFkYXIgbWl4aW4uIFVzZSB0aGUgVHlwZVNjcmlwdCB3YXkgaW5zdGVhZC5cbiAgICBwdWJsaWMgZ2V0TmV4dEZvbGRMaW5lXG4gICAgcHJpdmF0ZSBhZGRGb2xkc1xuICAgIHByaXZhdGUgZ2V0Rm9sZHNJblJhbmdlO1xuICAgIHB1YmxpYyBnZXRSb3dGb2xkU3RhcnQ7XG4gICAgcHVibGljIGdldFJvd0ZvbGRFbmQ7XG4gICAgcHJpdmF0ZSAkc2V0Rm9sZGluZztcbiAgICBwcml2YXRlIHJlbW92ZUZvbGRzO1xuICAgIHB1YmxpYyBnZXRGb2xkTGluZTtcbiAgICBwcml2YXRlIGdldEZvbGREaXNwbGF5TGluZTtcbiAgICBwdWJsaWMgZ2V0Rm9sZEF0O1xuICAgIHB1YmxpYyByZW1vdmVGb2xkO1xuICAgIHB1YmxpYyBleHBhbmRGb2xkO1xuICAgIC8vXG4gICAgcHVibGljICR0YWdIaWdobGlnaHQ7XG4gICAgcHVibGljICRicmFja2V0SGlnaGxpZ2h0OiBudW1iZXI7ICAgLy8gYSBtYXJrZXIuXG4gICAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOyAgICAgICAgLy8gTm90IGEgbWFya2VyIVxuICAgIC8qKlxuICAgICAqIEEgbnVtYmVyIGlzIGEgbWFya2VyIGlkZW50aWZpZXIsIG51bGwgaW5kaWNhdGVzIHRoYXQgbm8gc3VjaCBtYXJrZXIgZXhpc3RzLiBcbiAgICAgKi9cbiAgICBwdWJsaWMgJHNlbGVjdGlvbk1hcmtlcjogbnVtYmVyID0gbnVsbDtcbiAgICBwcml2YXRlICRicmFja2V0TWF0Y2hlcjogYmttLkJyYWNrZXRNYXRjaFNlcnZpY2UgPSBuZXcgYmttLkJyYWNrZXRNYXRjaFNlcnZpY2UodGhpcyk7XG4gICAgLy8gRklYTUU6IEkgZG9uJ3Qgc2VlIHdoZXJlIHRoaXMgaXMgaW5pdGlhbGl6ZWQuXG4gICAgcHVibGljIHVuZm9sZDtcbiAgICAvKipcbiAgICAgKiBAcGFyYW0gW3RleHRdIHtzdHJpbmd8RG9jdW1lbnR9IFRoZSBkb2N1bWVudCBvciBzdHJpbmcgb3ZlciB3aGljaCB0aGlzIGVkaXQgc2Vzc2lvbiB3b3Jrcy5cbiAgICAgKiBAcGFyYW0gW21vZGVdXG4gICAgICovXG4gICAgY29uc3RydWN0b3IodGV4dDogYW55LCBtb2RlPykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBUaGUgZmlyc3QgYXJndW1lbnQgbWF5IGJlIGVpdGhlciBhIHN0cmluZyBvciBhIERvY3VtZW50LlxuICAgICAgICAvLyBJdCBtaWdodCBldmVuIGJlIGEgc3RyaW5nW10uXG4gICAgICAgIC8vIEZJWE1FOiBNYXkgYmUgYmV0dGVyIGZvciBjb25zdHJ1Y3RvcnMgdG8gbWFrZSBhIGNob2ljZS5cbiAgICAgICAgLy8gQ29udmVuaWVuY2UgZnVuY3Rpb24gY291bGQgYmUgYWRkZWQuXG4gICAgICAgIGlmICh0eXBlb2YgdGV4dCAhPT0gXCJvYmplY3RcIiB8fCAhdGV4dC5nZXRMaW5lKSB7XG4gICAgICAgICAgICB0aGlzLnNldERvY3VtZW50KG5ldyBkb2NtLkRvY3VtZW50KHRleHQpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0RG9jdW1lbnQodGV4dClcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gbmV3IHNlbS5TZWxlY3Rpb24odGhpcyk7XG5cbiAgICAgICAgY29uZmlnLnJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RlKG1vZGUpO1xuICAgICAgICBjb25maWcuX3NpZ25hbChcInNlc3Npb25cIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYEVkaXRTZXNzaW9uYCB0byBwb2ludCB0byBhIG5ldyBgRG9jdW1lbnRgLiBJZiBhIGBCYWNrZ3JvdW5kVG9rZW5pemVyYCBleGlzdHMsIGl0IGFsc28gcG9pbnRzIHRvIGBkb2NgLlxuICAgICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gZG9jIHtEb2N1bWVudH0gVGhlIG5ldyBgRG9jdW1lbnRgIHRvIHVzZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBkb2NtLkRvY3VtZW50KTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLmRvYykge1xuICAgICAgICAgICAgdGhpcy5kb2MucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5kb2MgPSBkb2M7XG4gICAgICAgIGRvYy5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG5cbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmVzZXRDYWNoZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBgRG9jdW1lbnRgIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24uXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudFxuICAgICAqIEByZXR1cm4ge0RvY3VtZW50fVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudCgpOiBkb2NtLkRvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgICAgICBpZiAobCA+IGkpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGxvdyA9IDA7XG4gICAgICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgICAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgICAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgICAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgICAgICAgICBoaSA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvdyAtIDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VGb2xkKGUpIHtcbiAgICAgICAgdmFyIGZvbGQgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGRlbHRhLnJhbmdlLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpO1xuICAgICAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgICAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgICAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZGVsdGFzRm9sZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRzOiByZW1vdmVkRm9sZHNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuJHVwZGF0ZU9uQ2hhbmdlKGRlbHRhKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB0ZXh0IHRvIHBsYWNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXRWYWx1ZSh0ZXh0KTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICB0aGlzLnNldFVuZG9NYW5hZ2VyKHRoaXMuJHVuZG9NYW5hZ2VyKTtcbiAgICAgICAgdGhpcy5nZXRVbmRvTWFuYWdlcigpLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRG9jdW1lbnQgYERvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICoqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBbW0RvY3VtZW50IGBEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgKiBAYWxpYXMgRWRpdFNlc3Npb24udG9TdHJpbmdcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogc2VtLlNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OkJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGV9XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBCYWNrZ3JvdW5kVG9rZW5pemVyLmdldFN0YXRlXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VG9rZW5zKHJvdzogbnVtYmVyKTogeyB0eXBlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuIFRoZSBvYmplY3QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgaW5kZXhgIGFuZCBgc3RhcnRgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byByZXRyaWV2ZSBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUb2tlbkF0KHJvdzogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpIHtcbiAgICAgICAgdmFyIHRva2VuczogeyB2YWx1ZTogc3RyaW5nIH1bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIHZhciB0b2tlbjogeyBpbmRleD86IG51bWJlcjsgc3RhcnQ/OiBudW1iZXI7IHZhbHVlOiBzdHJpbmcgfTtcbiAgICAgICAgdmFyIGMgPSAwO1xuICAgICAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgICAgICAgIGkgPSB0b2tlbnMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGMgKz0gdG9rZW5zW2ldLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBpZiAoYyA+PSBjb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIHRva2VuLmluZGV4ID0gaTtcbiAgICAgICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgKiBAcGFyYW0ge1VuZG9NYW5hZ2VyfSB1bmRvTWFuYWdlciBUaGUgbmV3IHVuZG8gbWFuYWdlclxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRVbmRvTWFuYWdlcih1bmRvTWFuYWdlcjogdW5kby5VbmRvTWFuYWdlcik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvTWFuYWdlciA9IHVuZG9NYW5hZ2VyO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy4kaW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICBpZiAodW5kb01hbmFnZXIpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2VsZi4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRm9sZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNGb2xkXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNGb2xkID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0RvYy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZG9jXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0RvY1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRG9jID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9NYW5hZ2VyLmV4ZWN1dGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImFjZXVwZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXJnczogW3NlbGYuJGRlbHRhcywgc2VsZl0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXJnZTogc2VsZi5tZXJnZVVuZG9EZWx0YXNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzID0gW107XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIgPSBsYW5nLmRlbGF5ZWRDYWxsKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBzdGFydHMgYSBuZXcgZ3JvdXAgaW4gdW5kbyBoaXN0b3J5XG4gICAgICoqL1xuICAgIHByaXZhdGUgbWFya1VuZG9Hcm91cCgpIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcilcbiAgICAgICAgICAgIHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB1bmRvIG1hbmFnZXIuXG4gICAgKiovXG4gICAgcHVibGljIGdldFVuZG9NYW5hZ2VyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdW5kb01hbmFnZXIgfHwgdGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBmb3IgdGFicy4gSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlN0cmluZygpIHtcbiAgICAgICAgaWYgKHRoaXMuZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGxhbmcuc3RyaW5nUmVwZWF0KFwiIFwiLCB0aGlzLmdldFRhYlNpemUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gXCJcXHRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgIC8qKlxuICAgICogUGFzcyBgdHJ1ZWAgdG8gZW5hYmxlIHRoZSB1c2Ugb2Ygc29mdCB0YWJzLiBTb2Z0IHRhYnMgbWVhbnMgeW91J3JlIHVzaW5nIHNwYWNlcyBpbnN0ZWFkIG9mIHRoZSB0YWIgY2hhcmFjdGVyIChgJ1xcdCdgKS5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlU29mdFRhYnMgVmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0byB1c2Ugc29mdCB0YWJzXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VTb2Z0VGFicyh2YWwpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ1c2VTb2Z0VGFic1wiLCB2YWwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpIHtcbiAgICAgICAgLy8gdG9kbyBtaWdodCBuZWVkIG1vcmUgZ2VuZXJhbCB3YXkgZm9yIGNoYW5naW5nIHNldHRpbmdzIGZyb20gbW9kZSwgYnV0IHRoaXMgaXMgb2sgZm9yIG5vd1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgIXRoaXMuJG1vZGUuJGluZGVudFdpdGhUYWJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICAgKiBGb3IgZXhhbXBsZSwgcGFzc2luZyBpbiBgNGAgdHJhbnNmb3JtcyB0aGUgc29mdCB0YWJzIHRvIGJlIGVxdWl2YWxlbnQgdG8gZm91ciBzcGFjZXMuXG4gICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB0YWJTaXplIFRoZSBuZXcgdGFiIHNpemVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidGFiU2l6ZVwiLCB0YWJTaXplKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGFiIHNpemUuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlNpemUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGNoYXJhY3RlciBhdCB0aGUgcG9zaXRpb24gaXMgYSBzb2Z0IHRhYi5cbiAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gdG8gY2hlY2tcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBpc1RhYlN0b3AocG9zaXRpb246IHsgY29sdW1uOiBudW1iZXIgfSkge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgKHBvc2l0aW9uLmNvbHVtbiAlIHRoaXMuJHRhYlNpemUgPT09IDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUGFzcyBpbiBgdHJ1ZWAgdG8gZW5hYmxlIG92ZXJ3cml0ZXMgaW4geW91ciBzZXNzaW9uLCBvciBgZmFsc2VgIHRvIGRpc2FibGUuXG4gICAgKlxuICAgICogSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgICAqXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IG92ZXJ3cml0ZSBEZWZpbmVzIHdoZXRoZXIgb3Igbm90IHRvIHNldCBvdmVyd3JpdGVzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcIm92ZXJ3cml0ZVwiLCBvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgb3ZlcndyaXRlcyBhcmUgZW5hYmxlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgKiovXG4gICAgcHVibGljIGdldE92ZXJ3cml0ZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG92ZXJ3cml0ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAgICoqL1xuICAgIHB1YmxpYyB0b2dnbGVPdmVyd3JpdGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3ZlcndyaXRlKCF0aGlzLiRvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYGNsYXNzTmFtZWAgdG8gdGhlIGByb3dgLCB0byBiZSB1c2VkIGZvciBDU1Mgc3R5bGluZ3MgYW5kIHdoYXRub3QuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgICAqL1xuICAgIHB1YmxpYyBhZGRHdXR0ZXJEZWNvcmF0aW9uKHJvdzogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuJGRlY29yYXRpb25zW3Jvd10pIHtcbiAgICAgICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gKz0gXCIgXCIgKyBjbGFzc05hbWU7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYGNsYXNzTmFtZWAgZnJvbSB0aGUgYHJvd2AuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgICAqL1xuICAgIHB1YmxpYyByZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHJvdzogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gKHRoaXMuJGRlY29yYXRpb25zW3Jvd10gfHwgXCJcIikucmVwbGFjZShcIiBcIiArIGNsYXNzTmFtZSwgXCJcIik7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBhcnJheSBvZiBudW1iZXJzLCBpbmRpY2F0aW5nIHdoaWNoIHJvd3MgaGF2ZSBicmVha3BvaW50cy5cbiAgICAqIEByZXR1cm5zIHtbTnVtYmVyXX1cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldEJyZWFrcG9pbnRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJlYWtwb2ludHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIGEgYnJlYWtwb2ludCBvbiBldmVyeSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge0FycmF5fSByb3dzIEFuIGFycmF5IG9mIHJvdyBpbmRpY2VzXG4gICAgKlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRCcmVha3BvaW50cyhyb3dzOiBudW1iZXJbXSk6IHZvaWQge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd3NbaV1dID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhbGwgYnJlYWtwb2ludHMgb24gdGhlIHJvd3MuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50cygpIHtcbiAgICAgICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXRzIGEgYnJlYWtwb2ludCBvbiB0aGUgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpbmRleFxuICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBDbGFzcyBvZiB0aGUgYnJlYWtwb2ludFxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRCcmVha3BvaW50KHJvdywgY2xhc3NOYW1lKSB7XG4gICAgICAgIGlmIChjbGFzc05hbWUgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGNsYXNzTmFtZSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd10gPSBjbGFzc05hbWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQnJlYWtwb2ludChyb3cpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQWRkcyBhIG5ldyBtYXJrZXIgdG8gdGhlIGdpdmVuIGBSYW5nZWAuIElmIGBpbkZyb250YCBpcyBgdHJ1ZWAsIGEgZnJvbnQgbWFya2VyIGlzIGRlZmluZWQsIGFuZCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGZpcmVzOyBvdGhlcndpc2UsIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBmaXJlcy5cbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIERlZmluZSB0aGUgcmFuZ2Ugb2YgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXp6IFNldCB0aGUgQ1NTIGNsYXNzIGZvciB0aGUgbWFya2VyXG4gICAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSB0eXBlIElkZW50aWZ5IHRoZSB0eXBlIG9mIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5Gcm9udCBTZXQgdG8gYHRydWVgIHRvIGVzdGFibGlzaCBhIGZyb250IG1hcmtlclxuICAgICpcbiAgICAqXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IFRoZSBuZXcgbWFya2VyIGlkXG4gICAgKiovXG4gICAgcHVibGljIGFkZE1hcmtlcihyYW5nZTogcm5nLlJhbmdlLCBjbGF6ejogc3RyaW5nLCB0eXBlLCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgdmFyIG1hcmtlciA9IHtcbiAgICAgICAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgICAgICAgIHR5cGU6IHR5cGUgfHwgXCJsaW5lXCIsXG4gICAgICAgICAgICByZW5kZXJlcjogdHlwZW9mIHR5cGUgPT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICAgICAgICBjbGF6ejogY2xhenosXG4gICAgICAgICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICAgICAgICBpZDogaWRcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG1hcmtlciBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGFkZGVkIG1hcmtlclxuICAgICAqKi9cbiAgICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyLCBpbkZyb250Pykge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG4gICAgICAgIG1hcmtlci5pZCA9IGlkO1xuICAgICAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIHRoZSBtYXJrZXIgd2l0aCB0aGUgc3BlY2lmaWVkIElELiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC4gSWYgdGhlIG1hcmtlciB3YXMgaW4gdGhlIGJhY2ssIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQpIHtcbiAgICAgICAgdmFyIG1hcmtlciA9IHRoaXMuJGZyb250TWFya2Vyc1ttYXJrZXJJZF0gfHwgdGhpcy4kYmFja01hcmtlcnNbbWFya2VySWRdO1xuICAgICAgICBpZiAoIW1hcmtlcilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgbWFya2VycyA9IG1hcmtlci5pbkZyb250ID8gdGhpcy4kZnJvbnRNYXJrZXJzIDogdGhpcy4kYmFja01hcmtlcnM7XG4gICAgICAgIGlmIChtYXJrZXIpIHtcbiAgICAgICAgICAgIGRlbGV0ZSAobWFya2Vyc1ttYXJrZXJJZF0pO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKG1hcmtlci5pbkZyb250ID8gXCJjaGFuZ2VGcm9udE1hcmtlclwiIDogXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIElEcyBvZiBhbGwgdGhlIG1hcmtlcnMsIGVpdGhlciBmcm9udCBvciBiYWNrLlxuICAgICogQHBhcmFtIHtib29sZWFufSBpbkZyb250IElmIGB0cnVlYCwgaW5kaWNhdGVzIHlvdSBvbmx5IHdhbnQgZnJvbnQgbWFya2VyczsgYGZhbHNlYCBpbmRpY2F0ZXMgb25seSBiYWNrIG1hcmtlcnNcbiAgICAqXG4gICAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICAgKiovXG4gICAgcHVibGljIGdldE1hcmtlcnMoaW5Gcm9udDogYm9vbGVhbikge1xuICAgICAgICByZXR1cm4gaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICAgIH1cblxuICAgIHB1YmxpYyBoaWdobGlnaHQocmUpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzZWFyY2hIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciBoaWdobGlnaHQgPSBuZXcgc2htLlNlYXJjaEhpZ2hsaWdodChudWxsLCBcImFjZV9zZWxlY3RlZC13b3JkXCIsIFwidGV4dFwiKTtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodCA9IHRoaXMuYWRkRHluYW1pY01hcmtlcihoaWdobGlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodC5zZXRSZWdleHAocmUpO1xuICAgIH1cblxuICAgIC8vIGV4cGVyaW1lbnRhbFxuICAgIHByaXZhdGUgaGlnaGxpZ2h0TGluZXMoc3RhcnRSb3csIGVuZFJvdywgY2xhenosIGluRnJvbnQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBlbmRSb3cgIT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgY2xhenogPSBlbmRSb3c7XG4gICAgICAgICAgICBlbmRSb3cgPSBzdGFydFJvdztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNsYXp6KVxuICAgICAgICAgICAgY2xhenogPSBcImFjZV9zdGVwXCI7XG5cbiAgICAgICAgdmFyIHJhbmdlOiBhbnkgPSBuZXcgcm5nLlJhbmdlKHN0YXJ0Um93LCAwLCBlbmRSb3csIEluZmluaXR5KTtcbiAgICAgICAgcmFuZ2UuaWQgPSB0aGlzLmFkZE1hcmtlcihyYW5nZSwgY2xhenosIFwiZnVsbExpbmVcIiwgaW5Gcm9udCk7XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEVycm9yOlxuICAgICAqICB7XG4gICAgICogICAgcm93OiAxMixcbiAgICAgKiAgICBjb2x1bW46IDIsIC8vY2FuIGJlIHVuZGVmaW5lZFxuICAgICAqICAgIHRleHQ6IFwiTWlzc2luZyBhcmd1bWVudFwiLFxuICAgICAqICAgIHR5cGU6IFwiZXJyb3JcIiAvLyBvciBcIndhcm5pbmdcIiBvciBcImluZm9cIlxuICAgICAqICB9XG4gICAgICovXG4gICAgLyoqXG4gICAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBmdW5jdGlvbnMgZW1pdHMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gYW5ub3RhdGlvbnMgQSBsaXN0IG9mIGFubm90YXRpb25zXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRBbm5vdGF0aW9ucyhhbm5vdGF0aW9ucykge1xuICAgICAgICB0aGlzLiRhbm5vdGF0aW9ucyA9IGFubm90YXRpb25zO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGFubm90YXRpb25zIHx8IFtdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ2xlYXJzIGFsbCB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbi4gVGhpcyBmdW5jdGlvbiBhbHNvIHRyaWdnZXJzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IHRleHQubWF0Y2goL14uKj8oXFxyP1xcbikvbSk7XG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBtYXRjaFsxXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gXCJcXG5cIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogR2l2ZW4gYSBzdGFydGluZyByb3cgYW5kIGNvbHVtbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgYFJhbmdlYCBvZiB0aGUgZmlyc3Qgd29yZCBib3VuZGFyeSBpdCBmaW5kcy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHZhciBsaW5lOiBzdHJpbmcgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgICAgICB2YXIgaW5Ub2tlbiA9IGZhbHNlO1xuICAgICAgICBpZiAoY29sdW1uID4gMClcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbiAtIDEpLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKCFpblRva2VuKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmIChpblRva2VuKVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy50b2tlblJlO1xuICAgICAgICBlbHNlIGlmICgvXlxccyskLy50ZXN0KGxpbmUuc2xpY2UoY29sdW1uIC0gMSwgY29sdW1uICsgMSkpKVxuICAgICAgICAgICAgdmFyIHJlID0gL1xccy87XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMubm9uVG9rZW5SZTtcblxuICAgICAgICB2YXIgc3RhcnQgPSBjb2x1bW47XG4gICAgICAgIGlmIChzdGFydCA+IDApIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBzdGFydC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKHN0YXJ0ID49IDAgJiYgbGluZS5jaGFyQXQoc3RhcnQpLm1hdGNoKHJlKSk7XG4gICAgICAgICAgICBzdGFydCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVuZCA9IGNvbHVtbjtcbiAgICAgICAgd2hpbGUgKGVuZCA8IGxpbmUubGVuZ3RoICYmIGxpbmUuY2hhckF0KGVuZCkubWF0Y2gocmUpKSB7XG4gICAgICAgICAgICBlbmQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBuZXcgcm5nLlJhbmdlKHJvdywgc3RhcnQsIHJvdywgZW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdldHMgdGhlIHJhbmdlIG9mIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBzdGFydCBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAqXG4gICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QVdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIHdvcmRSYW5nZSA9IHRoaXMuZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUod29yZFJhbmdlLmVuZC5yb3cpO1xuXG4gICAgICAgIHdoaWxlIChsaW5lLmNoYXJBdCh3b3JkUmFuZ2UuZW5kLmNvbHVtbikubWF0Y2goL1sgXFx0XS8pKSB7XG4gICAgICAgICAgICB3b3JkUmFuZ2UuZW5kLmNvbHVtbiArPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHdvcmRSYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIHs6RG9jdW1lbnQuc2V0TmV3TGluZU1vZGUuZGVzY31cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBuZXdMaW5lTW9kZSB7OkRvY3VtZW50LnNldE5ld0xpbmVNb2RlLnBhcmFtfVxuICAgICpcbiAgICAqXG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5zZXROZXdMaW5lTW9kZVxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBuZXcgbGluZSBtb2RlLlxuICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAqIEByZWxhdGVkIERvY3VtZW50LmdldE5ld0xpbmVNb2RlXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXROZXdMaW5lTW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZGVudGlmaWVzIGlmIHlvdSB3YW50IHRvIHVzZSBhIHdvcmtlciBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVdvcmtlciBTZXQgdG8gYHRydWVgIHRvIHVzZSBhIHdvcmtlclxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdvcmtlcih1c2VXb3JrZXIpIHsgdGhpcy5zZXRPcHRpb24oXCJ1c2VXb3JrZXJcIiwgdXNlV29ya2VyKTsgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3b3JrZXJzIGFyZSBiZWluZyB1c2VkLlxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0VXNlV29ya2VyKCkgeyByZXR1cm4gdGhpcy4kdXNlV29ya2VyOyB9XG5cbiAgICAvKipcbiAgICAqIFJlbG9hZHMgYWxsIHRoZSB0b2tlbnMgb24gdGhlIGN1cnJlbnQgc2Vzc2lvbi4gVGhpcyBmdW5jdGlvbiBjYWxscyBbW0JhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgYEJhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgKClgXV0gdG8gYWxsIHRoZSByb3dzOyBpdCBhbHNvIGVtaXRzIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50LlxuICAgICoqL1xuICAgIHByaXZhdGUgb25SZWxvYWRUb2tlbml6ZXIoZSkge1xuICAgICAgICB2YXIgcm93cyA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydChyb3dzLmZpcnN0KTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgKiBTZXRzIGEgbmV3IHRleHQgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LiBJZiBhIFtbQmFja2dyb3VuZFRva2VuaXplciBgQmFja2dyb3VuZFRva2VuaXplcmBdXSBpcyBzZXQsIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50IGlzIGFsc28gZW1pdHRlZC5cbiAgICAqIEBwYXJhbSB7VGV4dE1vZGV9IG1vZGUgU2V0IGEgbmV3IHRleHQgbW9kZVxuICAgICogQHBhcmFtIHtjYn0gb3B0aW9uYWwgY2FsbGJhY2tcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRNb2RlKG1vZGUsIGNiPykge1xuICAgICAgICBpZiAobW9kZSAmJiB0eXBlb2YgbW9kZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKG1vZGUuZ2V0VG9rZW5pemVyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZShtb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBvcHRpb25zID0gbW9kZTtcbiAgICAgICAgICAgIHZhciBwYXRoID0gb3B0aW9ucy5wYXRoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcGF0aCA9IG1vZGUgfHwgXCJhY2UvbW9kZS90ZXh0XCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGlzIGlzIG5lZWRlZCBpZiBhY2UgaXNuJ3Qgb24gcmVxdWlyZSBwYXRoIChlLmcgdGVzdHMgaW4gbm9kZSlcbiAgICAgICAgaWYgKCF0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0pXG4gICAgICAgICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgdHhtLk1vZGUoKTtcblxuICAgICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIGxvYWQgb24gZGVtYW5kXG4gICAgICAgIHRoaXMuJG1vZGVJZCA9IHBhdGg7XG4gICAgICAgIGNvbmZpZy5sb2FkTW9kdWxlKFtcIm1vZGVcIiwgcGF0aF0sIGZ1bmN0aW9uKG0pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiRtb2RlSWQgIT09IHBhdGgpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiICYmIGNiKCk7XG4gICAgICAgICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1twYXRoXSk7XG4gICAgICAgICAgICBpZiAobSAmJiBtLk1vZGUpIHtcbiAgICAgICAgICAgICAgICBtID0gbmV3IG0uTW9kZShvcHRpb25zKTtcbiAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbW9kZXNbcGF0aF0gPSBtO1xuICAgICAgICAgICAgICAgICAgICBtLiRpZCA9IHBhdGg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZShtKTtcbiAgICAgICAgICAgICAgICBjYiAmJiBjYigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIHNldCBtb2RlIHRvIHRleHQgdW50aWwgbG9hZGluZyBpcyBmaW5pc2hlZFxuICAgICAgICBpZiAoIXRoaXMuJG1vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSh0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0sIHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlKG1vZGUsICRpc1BsYWNlaG9sZGVyPykge1xuICAgICAgICBpZiAoISRpc1BsYWNlaG9sZGVyKVxuICAgICAgICAgICAgdGhpcy4kbW9kZUlkID0gbW9kZS4kaWQ7XG4gICAgICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJG1vZGUgPSBtb2RlO1xuXG4gICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV29ya2VyKVxuICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcblxuICAgICAgICB2YXIgdG9rZW5pemVyID0gbW9kZS5nZXRUb2tlbml6ZXIoKTtcblxuICAgICAgICBpZiAodG9rZW5pemVyLmFkZEV2ZW50TGlzdGVuZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdmFyIG9uUmVsb2FkVG9rZW5pemVyID0gdGhpcy5vblJlbG9hZFRva2VuaXplci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdG9rZW5pemVyLmFkZEV2ZW50TGlzdGVuZXIoXCJ1cGRhdGVcIiwgb25SZWxvYWRUb2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyID0gbmV3IGJ0bS5CYWNrZ3JvdW5kVG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5hZGRFdmVudExpc3RlbmVyKFwidXBkYXRlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuXG4gICAgICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICAgICAgdGhpcy5ub25Ub2tlblJlID0gbW9kZS5ub25Ub2tlblJlO1xuXG5cbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kb3B0aW9ucy53cmFwTWV0aG9kLnNldC5jYWxsKHRoaXMsIHRoaXMuJHdyYXBNZXRob2QpO1xuICAgICAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlLmZvbGRpbmdSdWxlcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZU1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHN0b3BXb3JrZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLiR3b3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICAgKiBAcmV0dXJucyB7VGV4dE1vZGV9IFRoZSBjdXJyZW50IHRleHQgbW9kZVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsVG9wID09PSBzY3JvbGxUb3AgfHwgaXNOYU4oc2Nyb2xsVG9wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgdG9wbW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxUb3A7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbU2V0cyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLnNldFNjcm9sbExlZnR9XG4gICAgKiovXG4gICAgcHVibGljIHNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG4gICAgICAgIC8vIHNjcm9sbExlZnQgPSBNYXRoLnJvdW5kKHNjcm9sbExlZnQpO1xuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsTGVmdCA9PT0gc2Nyb2xsTGVmdCB8fCBpc05hTihzY3JvbGxMZWZ0KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRzY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCBzY3JvbGxMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcm9sbExlZnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbldpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVXaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cylcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLmdldExpbmVXaWRnZXRNYXhXaWR0aCgpLCB0aGlzLnNjcmVlbldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGg7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzV2lkdGggIT0gbnVsbCkgcmV0dXJuIHRoaXMubGluZVdpZGdldHNXaWR0aDtcbiAgICAgICAgdmFyIHdpZHRoID0gMDtcbiAgICAgICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5saW5lV2lkZ2V0V2lkdGggPSB3aWR0aDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT8pIHtcbiAgICAgICAgaWYgKHRoaXMuJG1vZGlmaWVkIHx8IGZvcmNlKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGggPSB0aGlzLiR3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICAgICAgICB2YXIgY2FjaGUgPSB0aGlzLiRyb3dMZW5ndGhDYWNoZTtcbiAgICAgICAgICAgIHZhciBsb25nZXN0U2NyZWVuTGluZSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZEluZGV4ID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleF07XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIHZhciBsZW4gPSBsaW5lcy5sZW5ndGg7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICBpID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpID49IGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleCsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVbaV0gPSB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aChsaW5lc1tpXSlbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPiBsb25nZXN0U2NyZWVuTGluZSlcbiAgICAgICAgICAgICAgICAgICAgbG9uZ2VzdFNjcmVlbkxpbmUgPSBjYWNoZVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2NyZWVuV2lkdGggPSBsb25nZXN0U2NyZWVuTGluZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSB2ZXJiYXRpbSBjb3B5IG9mIHRoZSBnaXZlbiBsaW5lIGFzIGl0IGlzIGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byByZXRyaWV2ZSBmcm9tXG4gICAgICpcbiAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGdldExpbmUocm93OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncyBvZiB0aGUgcm93cyBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC4gVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqXG4gICAgICogQHJldHVybnMge1tTdHJpbmddfVxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6RG9jdW1lbnQuZ2V0VGV4dFJhbmdlLmRlc2N9XG4gICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIHRvIHdvcmsgd2l0aFxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKiovXG4gICAgcHVibGljIGdldFRleHRSYW5nZShyYW5nZTogeyBzdGFydDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgZW5kOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB7cm93LCBjb2x1bW59IHRvIHN0YXJ0IGluc2VydGluZyBhdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBpbnNlcnQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlbW92ZVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQucmVtb3ZlXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIHJlbW92ZShyYW5nZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MucmVtb3ZlKHJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXZlcnRzIHByZXZpb3VzIGNoYW5nZXMgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkZWx0YXMgQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCBbSWYgYHRydWVgLCBkb2Vzbid0IHNlbGVjdCB0aGUgcmFuZ2Ugb2Ygd2hlcmUgdGhlIGNoYW5nZSBvY2N1cmVkXXs6ICNkb250U2VsZWN0fVxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHVuZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2UgPSBudWxsO1xuICAgICAgICBmb3IgKHZhciBpID0gZGVsdGFzLmxlbmd0aCAtIDE7IGkgIT0gLTE7IGktLSkge1xuICAgICAgICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvYy5yZXZlcnREZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIHRydWUsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWx0YS5kZWx0YXMuZm9yRWFjaChmdW5jdGlvbihmb2xkRGVsdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkRGVsdGEuZm9sZHMpO1xuICAgICAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgcmV0dXJuIGxhc3RVbmRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmUtaW1wbGVtZW50cyBhIHByZXZpb3VzbHkgdW5kb25lIGNoYW5nZSB0byB5b3VyIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRlbHRhcyBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IHs6ZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHJlZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IHJuZy5SYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLmFwcGx5RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCBmYWxzZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cmVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlIElmIGB0cnVlYCwgc2VsZWN0cyB0aGUgcmFuZ2Ugb2YgdGhlIHJlaW5zZXJ0ZWQgY2hhbmdlXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VW5kb1NlbGVjdChlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCA9IGVuYWJsZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhczogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IHJuZy5SYW5nZSB9W10sIGlzVW5kbzogYm9vbGVhbiwgbGFzdFVuZG9SYW5nZTogcm5nLlJhbmdlKTogcm5nLlJhbmdlIHtcbiAgICAgICAgZnVuY3Rpb24gaXNJbnNlcnQoZGVsdGE6IHsgYWN0aW9uOiBzdHJpbmcgfSkge1xuICAgICAgICAgICAgdmFyIGluc2VydCA9IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09PSBcImluc2VydExpbmVzXCI7XG4gICAgICAgICAgICByZXR1cm4gaXNVbmRvID8gIWluc2VydCA6IGluc2VydDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkZWx0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IHJuZy5SYW5nZSB9ID0gZGVsdGFzWzBdO1xuICAgICAgICB2YXIgcmFuZ2U6IHJuZy5SYW5nZTtcbiAgICAgICAgdmFyIHBvaW50OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgcmFuZ2UgPSBybmcuUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2UuZW5kKTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gcm5nLlJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGRlbHRhLnJhbmdlLnN0YXJ0LnJvdywgZGVsdGEucmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5lbmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChkZWx0YS5yYW5nZS5lbmQucm93LCBkZWx0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlID0gcm5nLlJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgICAgIC8vIElmIHRydWUsIG1lcmdlIHRoZSByYW5nZXMuXG4gICAgICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChybmcuUmFuZ2UuY29tcGFyZVBvaW50cyhsYXN0VW5kb1JhbmdlLnN0YXJ0LCByYW5nZS5zdGFydCkgPT09IDApIHtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UuZW5kLmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY21wID0gbGFzdFVuZG9SYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGxhc3RVbmRvUmFuZ2Uuc3RhcnQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGxhc3RVbmRvUmFuZ2UuZW5kLnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVwbGFjZXMgYSByYW5nZSBpbiB0aGUgZG9jdW1lbnQgd2l0aCB0aGUgbmV3IGB0ZXh0YC5cbiAgICAqXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZXBsYWNlXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgbmV3IHRleHQgdG8gdXNlIGFzIGEgcmVwbGFjZW1lbnRcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IEFuIG9iamVjdCBjb250YWluaW5nIHRoZSBmaW5hbCByb3cgYW5kIGNvbHVtbiwgbGlrZSB0aGlzOlxuICAgICogYGBgXG4gICAgKiB7cm93OiBlbmRSb3csIGNvbHVtbjogMH1cbiAgICAqIGBgYFxuICAgICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICAgKiBJZiB0aGUgdGV4dCBpcyB0aGUgZXhhY3Qgc2FtZSBhcyB3aGF0IGN1cnJlbnRseSBleGlzdHMsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgY3VycmVudCBgcmFuZ2UuZW5kYCB2YWx1ZS5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqIEByZWxhdGVkIERvY3VtZW50LnJlcGxhY2VcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZXBsYWNlKHJhbmdlOiBybmcuUmFuZ2UsIHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MucmVwbGFjZShyYW5nZSwgdGV4dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBNb3ZlcyBhIHJhbmdlIG9mIHRleHQgZnJvbSB0aGUgZ2l2ZW4gcmFuZ2UgdG8gdGhlIGdpdmVuIHBvc2l0aW9uLiBgdG9Qb3NpdGlvbmAgaXMgYW4gb2JqZWN0IHRoYXQgbG9va3MgbGlrZSB0aGlzOlxuICAgICAqICBgYGBqc29uXG4gICAgKiAgICB7IHJvdzogbmV3Um93TG9jYXRpb24sIGNvbHVtbjogbmV3Q29sdW1uTG9jYXRpb24gfVxuICAgICAqICBgYGBcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSBmcm9tUmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9IFRoZSBuZXcgcmFuZ2Ugd2hlcmUgdGhlIHRleHQgd2FzIG1vdmVkIHRvLlxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBtb3ZlVGV4dChmcm9tUmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLmdldFRleHRSYW5nZShmcm9tUmFuZ2UpO1xuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmcm9tUmFuZ2UpO1xuICAgICAgICB2YXIgcm93RGlmZjogbnVtYmVyO1xuICAgICAgICB2YXIgY29sRGlmZjogbnVtYmVyO1xuXG4gICAgICAgIHZhciB0b1JhbmdlID0gcm5nLlJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgICAgIGlmICghY29weSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZnJvbVJhbmdlKTtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBmcm9tUmFuZ2Uuc3RhcnQucm93IC0gZnJvbVJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gcm93RGlmZiA/IC1mcm9tUmFuZ2UuZW5kLmNvbHVtbiA6IGZyb21SYW5nZS5zdGFydC5jb2x1bW4gLSBmcm9tUmFuZ2UuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIGlmIChjb2xEaWZmKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2UuZW5kLnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLmVuZC5jb2x1bW4gPiBmcm9tUmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93RGlmZiAmJiB0b1JhbmdlLnN0YXJ0LnJvdyA+PSBmcm9tUmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0b1JhbmdlLmVuZCA9IHRoaXMuaW5zZXJ0KHRvUmFuZ2Uuc3RhcnQsIHRleHQpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoeC5zdGFydC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB4LnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHguZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJbmRlbnRzIGFsbCB0aGUgcm93cywgZnJvbSBgc3RhcnRSb3dgIHRvIGBlbmRSb3dgIChpbmNsdXNpdmUpLCBieSBwcmVmaXhpbmcgZWFjaCByb3cgd2l0aCB0aGUgdG9rZW4gaW4gYGluZGVudFN0cmluZ2AuXG4gICAgKlxuICAgICogSWYgYGluZGVudFN0cmluZ2AgY29udGFpbnMgdGhlIGAnXFx0J2AgY2hhcmFjdGVyLCBpdCdzIHJlcGxhY2VkIGJ5IHdoYXRldmVyIGlzIGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmcgYGdldFRhYlN0cmluZygpYF1dLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0Um93IFN0YXJ0aW5nIHJvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGVuZFJvdyBFbmRpbmcgcm93XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBpbmRlbnRSb3dzKHN0YXJ0Um93LCBlbmRSb3csIGluZGVudFN0cmluZykge1xuICAgICAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDw9IGVuZFJvdzsgcm93KyspXG4gICAgICAgICAgICB0aGlzLmluc2VydCh7IHJvdzogcm93LCBjb2x1bW46IDAgfSwgaW5kZW50U3RyaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE91dGRlbnRzIGFsbCB0aGUgcm93cyBkZWZpbmVkIGJ5IHRoZSBgc3RhcnRgIGFuZCBgZW5kYCBwcm9wZXJ0aWVzIG9mIGByYW5nZWAuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHJhbmdlIG9mIHJvd3NcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBvdXRkZW50Um93cyhyYW5nZTogcm5nLlJhbmdlKSB7XG4gICAgICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgcm5nLlJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSByb3dSYW5nZS5zdGFydC5yb3c7IGkgPD0gcm93UmFuZ2UuZW5kLnJvdzsgKytpKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShpKTtcblxuICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5yb3cgPSBpO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaXplOyArK2opXG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuY2hhckF0KGopICE9ICcgJylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBpZiAoaiA8IHNpemUgJiYgbGluZS5jaGFyQXQoaikgPT0gJ1xcdCcpIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqICsgMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGRlbGV0ZVJhbmdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJG1vdmVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGRpcjogbnVtYmVyKSB7XG4gICAgICAgIGZpcnN0Um93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cpO1xuICAgICAgICBsYXN0Um93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cpO1xuICAgICAgICBpZiAoZGlyIDwgMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93ICsgZGlyKTtcbiAgICAgICAgICAgIGlmIChyb3cgPCAwKSByZXR1cm4gMDtcbiAgICAgICAgICAgIHZhciBkaWZmID0gcm93IC0gZmlyc3RSb3c7XG4gICAgICAgIH0gZWxzZSBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93ICsgZGlyKTtcbiAgICAgICAgICAgIGlmIChyb3cgPiB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBsYXN0Um93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmlyc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChmaXJzdFJvdyk7XG4gICAgICAgICAgICBsYXN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQobGFzdFJvdyk7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IGxhc3RSb3cgLSBmaXJzdFJvdyArIDE7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKGZpcnN0Um93LCAwLCBsYXN0Um93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHguZW5kLnJvdyArPSBkaWZmO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBsaW5lcyA9IGRpciA9PSAwXG4gICAgICAgICAgICA/IHRoaXMuZG9jLmdldExpbmVzKGZpcnN0Um93LCBsYXN0Um93KVxuICAgICAgICAgICAgOiB0aGlzLmRvYy5yZW1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgICAgICBmb2xkcy5sZW5ndGggJiYgdGhpcy5hZGRGb2xkcyhmb2xkcyk7XG4gICAgICAgIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCB1cCBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgdXBcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAgICogQHJldHVybnMge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAqXG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc1VwKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCBkb3duIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSBkb3duXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgZG93blxuICAgICogQHJldHVybnMge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAqXG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAgICoqL1xuICAgIHByaXZhdGUgbW92ZUxpbmVzRG93bihmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIER1cGxpY2F0ZXMgYWxsIHRoZSB0ZXh0IGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHJldHVybnMge051bWJlcn0gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDApO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkY2xpcFJvd1RvRG9jdW1lbnQocm93KSB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNsaXBDb2x1bW5Ub1Jvdyhyb3csIGNvbHVtbikge1xuICAgICAgICBpZiAoY29sdW1uIDwgMClcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGNvbHVtbiA9IE1hdGgubWF4KDAsIGNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvdyA8IDApIHtcbiAgICAgICAgICAgIHJvdyA9IDA7XG4gICAgICAgICAgICBjb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBsZW4pIHtcbiAgICAgICAgICAgICAgICByb3cgPSBsZW4gLSAxO1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuIC0gMSkubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljICRjbGlwUmFuZ2VUb0RvY3VtZW50KHJhbmdlOiBybmcuUmFuZ2UpIHtcbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IDApIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IDA7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyA+IGxlbikge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGxlbjtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbikubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgd2hldGhlciBvciBub3QgbGluZSB3cmFwcGluZyBpcyBlbmFibGVkLiBJZiBgdXNlV3JhcE1vZGVgIGlzIGRpZmZlcmVudCB0aGFuIHRoZSBjdXJyZW50IHZhbHVlLCB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXcmFwTW9kZSBFbmFibGUgKG9yIGRpc2FibGUpIHdyYXAgbW9kZVxuICAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlV3JhcE1vZGUodXNlV3JhcE1vZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICE9IHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXcmFwTW9kZSA9IHVzZVdyYXBNb2RlO1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcblxuICAgICAgICAgICAgLy8gSWYgd3JhcE1vZGUgaXMgYWN0aXZhZWQsIHRoZSB3cmFwRGF0YSBhcnJheSBoYXMgdG8gYmUgaW5pdGlhbGl6ZWQuXG4gICAgICAgICAgICBpZiAodXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGVuID0gdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IEFycmF5PG51bWJlcltdPihsZW4pO1xuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIGxlbiAtIDEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd3JhcCBtb2RlIGlzIGJlaW5nIHVzZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgZ2V0VXNlV3JhcE1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICB9XG5cbiAgICAvLyBBbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBtb3ZlIGZyZWVseSBiZXR3ZWVuIG1pbiBhbmQgbWF4LiBFaXRoZXJcbiAgICAvLyBwYXJhbWV0ZXIgY2FuIGJlIG51bGwgdG8gYWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gYmUgdW5jb25zdHJhaW5lZFxuICAgIC8vIGluIHRoYXQgZGlyZWN0aW9uLiBPciBzZXQgYm90aCBwYXJhbWV0ZXJzIHRvIHRoZSBzYW1lIG51bWJlciB0byBwaW5cbiAgICAvLyB0aGUgbGltaXQgdG8gdGhhdCB2YWx1ZS5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBib3VuZGFyaWVzIG9mIHdyYXAuIEVpdGhlciB2YWx1ZSBjYW4gYmUgYG51bGxgIHRvIGhhdmUgYW4gdW5jb25zdHJhaW5lZCB3cmFwLCBvciwgdGhleSBjYW4gYmUgdGhlIHNhbWUgbnVtYmVyIHRvIHBpbiB0aGUgbGltaXQuIElmIHRoZSB3cmFwIGxpbWl0cyBmb3IgYG1pbmAgb3IgYG1heGAgYXJlIGRpZmZlcmVudCwgdGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gd3JhcCB2YWx1ZSAodGhlIGxlZnQgc2lkZSB3cmFwKVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXggVGhlIG1heGltdW0gd3JhcCB2YWx1ZSAodGhlIHJpZ2h0IHNpZGUgd3JhcClcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZXRXcmFwTGltaXRSYW5nZShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbiAhPT0gbWluIHx8IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heCAhPT0gbWF4KSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgICAgICAgICBtaW46IG1pbixcbiAgICAgICAgICAgICAgICBtYXg6IG1heFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFRoaXMgd2lsbCBmb3JjZSBhIHJlY2FsY3VsYXRpb24gb2YgdGhlIHdyYXAgbGltaXRcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUaGlzIHNob3VsZCBnZW5lcmFsbHkgb25seSBiZSBjYWxsZWQgYnkgdGhlIHJlbmRlcmVyIHdoZW4gYSByZXNpemUgaXMgZGV0ZWN0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVzaXJlZExpbWl0IFRoZSBuZXcgd3JhcCBsaW1pdFxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKlxuICAgICogQHByaXZhdGVcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KGRlc2lyZWRMaW1pdDogbnVtYmVyLCAkcHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB2YXIgbGltaXRzID0gdGhpcy4kd3JhcExpbWl0UmFuZ2VcbiAgICAgICAgaWYgKGxpbWl0cy5tYXggPCAwKVxuICAgICAgICAgICAgbGltaXRzID0geyBtaW46ICRwcmludE1hcmdpbiwgbWF4OiAkcHJpbnRNYXJnaW4gfTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJGNvbnN0cmFpbldyYXBMaW1pdChkZXNpcmVkTGltaXQsIGxpbWl0cy5taW4sIGxpbWl0cy5tYXgpO1xuICAgICAgICBpZiAod3JhcExpbWl0ICE9IHRoaXMuJHdyYXBMaW1pdCAmJiB3cmFwTGltaXQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXQgPSB3cmFwTGltaXQ7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTGltaXRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29uc3RyYWluV3JhcExpbWl0KHdyYXBMaW1pdDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAobWluKVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5tYXgobWluLCB3cmFwTGltaXQpO1xuXG4gICAgICAgIGlmIChtYXgpXG4gICAgICAgICAgICB3cmFwTGltaXQgPSBNYXRoLm1pbihtYXgsIHdyYXBMaW1pdCk7XG5cbiAgICAgICAgcmV0dXJuIHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHdyYXAgbGltaXQuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgd3JhcCBsaW1pdC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFdyYXBMaW1pdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBsaW5lIGxlbmd0aCBmb3Igc29mdCB3cmFwIGluIHRoZSBlZGl0b3IuIExpbmVzIHdpbGwgYnJlYWtcbiAgICAgKiAgYXQgYSBtaW5pbXVtIG9mIHRoZSBnaXZlbiBsZW5ndGggbWludXMgMjAgY2hhcnMgYW5kIGF0IGEgbWF4aW11bVxuICAgICAqICBvZiB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNoYXJzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW1pdCBUaGUgbWF4aW11bSBsaW5lIGxlbmd0aCBpbiBjaGFycywgZm9yIHNvZnQgd3JhcHBpbmcgbGluZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRXcmFwTGltaXQobGltaXQpIHtcbiAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShsaW1pdCwgbGltaXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgdGhhdCBkZWZpbmVzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIG9mIHRoZSB3cmFwIGxpbWl0OyBpdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgICpcbiAgICAqICAgICB7IG1pbjogd3JhcExpbWl0UmFuZ2VfbWluLCBtYXg6IHdyYXBMaW1pdFJhbmdlX21heCB9XG4gICAgKlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFdyYXBMaW1pdFJhbmdlKCkge1xuICAgICAgICAvLyBBdm9pZCB1bmV4cGVjdGVkIG11dGF0aW9uIGJ5IHJldHVybmluZyBhIGNvcHlcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG1pbjogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWluLFxuICAgICAgICAgICAgbWF4OiB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXhcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKSB7XG4gICAgICAgIHZhciB1c2VXcmFwTW9kZSA9IHRoaXMuJHVzZVdyYXBNb2RlO1xuICAgICAgICB2YXIgbGVuO1xuICAgICAgICB2YXIgYWN0aW9uID0gZS5kYXRhLmFjdGlvbjtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gZS5kYXRhLnJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBlLmRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgdmFyIHN0YXJ0ID0gZS5kYXRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gZS5kYXRhLnJhbmdlLmVuZDtcbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IG51bGw7XG5cbiAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwiTGluZXNcIikgIT0gLTEpIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT0gXCJpbnNlcnRMaW5lc1wiKSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93ICsgKGUuZGF0YS5saW5lcy5sZW5ndGgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZW4gPSBlLmRhdGEubGluZXMgPyBlLmRhdGEubGluZXMubGVuZ3RoIDogbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGVuID0gbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kdXBkYXRpbmcgPSB0cnVlO1xuICAgICAgICBpZiAobGVuICE9IDApIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXNbdXNlV3JhcE1vZGUgPyBcIiR3cmFwRGF0YVwiIDogXCIkcm93TGVuZ3RoQ2FjaGVcIl0uc3BsaWNlKGZpcnN0Um93LCBsZW4pO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShlbmQucm93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZW5kLnJvdywgZW5kLmNvbHVtbiwgc3RhcnQuY29sdW1uIC0gZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZUJlZm9yZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmVCZWZvcmUgJiYgZm9sZExpbmVCZWZvcmUgIT09IGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZUJlZm9yZS5tZXJnZShmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lQmVmb3JlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbik7XG4gICAgICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAwKTtcbiAgICAgICAgICAgICAgICB2YXIgYXJyID0gdXNlV3JhcE1vZGUgPyB0aGlzLiR3cmFwRGF0YSA6IHRoaXMuJHJvd0xlbmd0aENhY2hlXG4gICAgICAgICAgICAgICAgYXJyLnNwbGljZS5hcHBseShhcnIsIGFyZ3MpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgc29tZSBuZXcgbGluZSBpcyBhZGRlZCBpbnNpZGUgb2YgYSBmb2xkTGluZSwgdGhlbiBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIHRoZSBmb2xkIGxpbmUgdXAuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmUucmFuZ2UuY29tcGFyZUluc2lkZShzdGFydC5yb3csIHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgLy8gSW5zaWRlIG9mIHRoZSBmb2xkTGluZSByYW5nZS4gTmVlZCB0byBzcGxpdCBzdHVmZiB1cC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJbmZyb250IG9mIHRoZSBmb2xkTGluZSBidXQgc2FtZSByb3cuIE5lZWQgdG8gc2hpZnQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvIGlmIHRoZSBpbnNlcnQgaXMgYWZ0ZXIgdGhlIGZvbGRMaW5lLlxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFJlYWxpZ24gZm9sZHMuIEUuZy4gaWYgeW91IGFkZCBzb21lIG5ldyBjaGFycyBiZWZvcmUgYSBmb2xkLCB0aGVcbiAgICAgICAgICAgIC8vIGZvbGQgc2hvdWxkIFwibW92ZVwiIHRvIHRoZSByaWdodC5cbiAgICAgICAgICAgIGxlbiA9IE1hdGguYWJzKGUuZGF0YS5yYW5nZS5zdGFydC5jb2x1bW4gLSBlLmRhdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBmb2xkcyBpbiB0aGUgY2hhbmdlIHJhbmdlIGFuZCByZW1vdmUgdGhlbS5cbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIGxlbiA9IC1sZW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCBzdGFydC5jb2x1bW4sIGxlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodXNlV3JhcE1vZGUgJiYgdGhpcy4kd3JhcERhdGEubGVuZ3RoICE9IHRoaXMuZG9jLmdldExlbmd0aCgpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZG9jLmdldExlbmd0aCgpIGFuZCAkd3JhcERhdGEubGVuZ3RoIGhhdmUgdG8gYmUgdGhlIHNhbWUhXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdyk7XG5cbiAgICAgICAgcmV0dXJuIHJlbW92ZWRGb2xkcztcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93LCBiPykge1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtsYXN0Um93XSA9IG51bGw7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgd3JhcERhdGEgPSB0aGlzLiR3cmFwRGF0YTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICAgICAgdmFyIHRva2VucztcbiAgICAgICAgdmFyIGZvbGRMaW5lO1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKGxhc3RSb3csIGxpbmVzLmxlbmd0aCAtIDEpO1xuICAgICAgICB3aGlsZSAocm93IDw9IGxhc3RSb3cpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKGxpbmVzW3Jvd10pO1xuICAgICAgICAgICAgICAgIHdyYXBEYXRhW3Jvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB3YWxrVG9rZW5zOiBudW1iZXJbXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyLCB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbMF0gPSBQTEFDRUhPTERFUl9TVEFSVDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgd2Fsa1Rva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbaV0gPSBQTEFDRUhPTERFUl9CT0RZO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZXNbcm93XS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMgPSB0b2tlbnMuY29uY2F0KHdhbGtUb2tlbnMpO1xuICAgICAgICAgICAgICAgIH0uYmluZCh0aGlzKSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICAgICAgbGluZXNbZm9sZExpbmUuZW5kLnJvd10ubGVuZ3RoICsgMVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtmb2xkTGluZS5zdGFydC5yb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zOiBudW1iZXJbXSwgd3JhcExpbWl0OiBudW1iZXIsIHRhYlNpemU/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIGRpc3BsYXlMZW5ndGggPSB0b2tlbnMubGVuZ3RoO1xuICAgICAgICB2YXIgbGFzdFNwbGl0ID0gMCwgbGFzdERvY1NwbGl0ID0gMDtcblxuICAgICAgICB2YXIgaXNDb2RlID0gdGhpcy4kd3JhcEFzQ29kZTtcblxuICAgICAgICBmdW5jdGlvbiBhZGRTcGxpdChzY3JlZW5Qb3M6IG51bWJlcikge1xuICAgICAgICAgICAgdmFyIGRpc3BsYXllZCA9IHRva2Vucy5zbGljZShsYXN0U3BsaXQsIHNjcmVlblBvcyk7XG5cbiAgICAgICAgICAgIC8vIFRoZSBkb2N1bWVudCBzaXplIGlzIHRoZSBjdXJyZW50IHNpemUgLSB0aGUgZXh0cmEgd2lkdGggZm9yIHRhYnNcbiAgICAgICAgICAgIC8vIGFuZCBtdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICB2YXIgbGVuID0gZGlzcGxheWVkLmxlbmd0aDtcbiAgICAgICAgICAgIGRpc3BsYXllZC5qb2luKFwiXCIpLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIFRBQl9TUEFDRXMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMTIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICAgICAgICAgIH0pLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIENIQVJfRVhUL211bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgICAgICAgICByZXBsYWNlKC8yL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGFzdERvY1NwbGl0ICs9IGxlbjtcbiAgICAgICAgICAgIHNwbGl0cy5wdXNoKGxhc3REb2NTcGxpdCk7XG4gICAgICAgICAgICBsYXN0U3BsaXQgPSBzY3JlZW5Qb3M7XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoZGlzcGxheUxlbmd0aCAtIGxhc3RTcGxpdCA+IHdyYXBMaW1pdCkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcywgd2hlcmUgdGhlIHNwbGl0IHNob3VsZCBiZS5cbiAgICAgICAgICAgIHZhciBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcblxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzcGFjZSBvciB0YWIgYXQgdGhpcyBzcGxpdCBwb3NpdGlvbiwgdGhlbiBtYWtpbmdcbiAgICAgICAgICAgIC8vIGEgc3BsaXQgaXMgc2ltcGxlLlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdCAtIDFdID49IFNQQUNFICYmIHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAvKiBkaXNhYmxlZCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FqYXhvcmcvYWNlL2lzc3Vlcy8xMTg2XG4gICAgICAgICAgICAgICAgLy8gSW5jbHVkZSBhbGwgZm9sbG93aW5nIHNwYWNlcyArIHRhYnMgaW4gdGhpcyBzcGxpdCBhcyB3ZWxsLlxuICAgICAgICAgICAgICAgIHdoaWxlICh0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0ICsrO1xuICAgICAgICAgICAgICAgIH0gKi9cbiAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgc3BsaXQgaXMgaW5zaWRlIG9mIGEgcGxhY2Vob2xkZXIuIFBsYWNlaG9sZGVyIGFyZVxuICAgICAgICAgICAgLy8gbm90IHNwbGl0YWJsZS4gVGhlcmVmb3JlLCBzZWVrIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAvLyBhbmQgdHJ5IHRvIHBsYWNlIHRoZSBzcGxpdCBiZW9mcmUgdGhlIHBsYWNlaG9sZGVyJ3Mgc3RhcnQuXG4gICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCB8fCB0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWVrIHRoZSBzdGFydCBvZiB0aGUgcGxhY2Vob2xkZXIgYW5kIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIGJlZm9yZSB0aGUgcGxhY2Vob2xkZXIuIEJ5IGRlZmluaXRpb24gdGhlcmUgYWx3YXlzXG4gICAgICAgICAgICAgICAgLy8gYSBQTEFDRUhPTERFUl9TVEFSVCBiZXR3ZWVuIHNwbGl0IGFuZCBsYXN0U3BsaXQuXG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgIT0gbGFzdFNwbGl0IC0gMTsgc3BsaXQtLSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3BsaXQrKzsgPDwgTm8gaW5jcmVtZW50YWwgaGVyZSBhcyB3ZSB3YW50IHRvXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgaGF2ZSB0aGUgcG9zaXRpb24gYmVmb3JlIHRoZSBQbGFjZWhvbGRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIGlzIG5vdCB0aGUgaW5kZXggb2YgdGhlXG4gICAgICAgICAgICAgICAgLy8gbGFzdCBzcGxpdCwgdGhlbiB3ZSBjYW4gZG8gdGhlIHNwbGl0XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID4gbGFzdFNwbGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIElTIHRoZSBpbmRleCBvZiB0aGUgbGFzdFxuICAgICAgICAgICAgICAgIC8vIHNwbGl0LCB0aGVuIHdlIGhhdmUgdG8gcGxhY2UgdGhlIHNwbGl0IGFmdGVyIHRoZVxuICAgICAgICAgICAgICAgIC8vIHBsYWNlaG9sZGVyLiBTbywgbGV0J3Mgc2VlayBmb3IgdGhlIGVuZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgPCB0b2tlbnMubGVuZ3RoOyBzcGxpdCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdICE9IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgc3BpbHQgPT0gdG9rZW5zLmxlbmd0aCwgdGhlbiB0aGUgcGxhY2Vob2xkZXIgaXMgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyB0aGluZyBpbiB0aGUgbGluZSBhbmQgYWRkaW5nIGEgbmV3IHNwbGl0IGRvZXNuJ3QgbWFrZSBzZW5zZS5cbiAgICAgICAgICAgICAgICBpZiAoc3BsaXQgPT0gdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhazsgIC8vIEJyZWFrcyB0aGUgd2hpbGUtbG9vcC5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBGaW5hbGx5LCBhZGQgdGhlIHNwbGl0Li4uXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIFNlYXJjaCBmb3IgdGhlIGZpcnN0IG5vbiBzcGFjZS90YWIvcGxhY2Vob2xkZXIvcHVuY3R1YXRpb24gdG9rZW4gYmFja3dhcmRzLlxuICAgICAgICAgICAgdmFyIG1pblNwbGl0ID0gTWF0aC5tYXgoc3BsaXQgLSAoaXNDb2RlID8gMTAgOiB3cmFwTGltaXQgLSAod3JhcExpbWl0ID4+IDIpKSwgbGFzdFNwbGl0IC0gMSk7XG4gICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzQ29kZSkge1xuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdID09IFBVTkNUVUFUSU9OKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB3ZSBmb3VuZCBvbmUsIHRoZW4gYWRkIHRoZSBzcGxpdC5cbiAgICAgICAgICAgIGlmIChzcGxpdCA+IG1pblNwbGl0KSB7XG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoKytzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAvLyBUaGUgc3BsaXQgaXMgaW5zaWRlIG9mIGEgQ0hBUiBvciBDSEFSX0VYVCB0b2tlbiBhbmQgbm8gc3BhY2VcbiAgICAgICAgICAgIC8vIGFyb3VuZCAtPiBmb3JjZSBhIHNwbGl0LlxuICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzcGxpdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHaXZlbiBhIHN0cmluZywgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgZGlzcGxheSBjaGFyYWN0ZXJzLCBpbmNsdWRpbmcgdGFicyBhbmQgc3BhY2VzLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IFRoZSB2YWx1ZSB0byBzdGFydCBhdFxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0RGlzcGxheVRva2VucyhzdHI6IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgYXJyOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICB2YXIgdGFiU2l6ZTogbnVtYmVyO1xuICAgICAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgICAgIC8vIFRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHRhYlNpemUgPSB0aGlzLmdldFNjcmVlblRhYlNpemUoYXJyLmxlbmd0aCArIG9mZnNldCk7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBuID0gMTsgbiA8IHRhYlNpemU7IG4rKykge1xuICAgICAgICAgICAgICAgICAgICBhcnIucHVzaChUQUJfU1BBQ0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFNwYWNlXG4gICAgICAgICAgICBlbHNlIGlmIChjID09IDMyKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goU1BBQ0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoKGMgPiAzOSAmJiBjIDwgNDgpIHx8IChjID4gNTcgJiYgYyA8IDY0KSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFBVTkNUVUFUSU9OKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSLCBDSEFSX0VYVCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGN1bGF0ZXMgdGhlIHdpZHRoIG9mIHRoZSBzdHJpbmcgYHN0cmAgb24gdGhlIHNjcmVlbiB3aGlsZSBhc3N1bWluZyB0aGF0IHRoZSBzdHJpbmcgc3RhcnRzIGF0IHRoZSBmaXJzdCBjb2x1bW4gb24gdGhlIHNjcmVlbi5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjYWxjdWxhdGUgdGhlIHNjcmVlbiB3aWR0aCBvZlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1heFNjcmVlbkNvbHVtblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlbkNvbHVtblxuICAgICogQHJldHVybnMge1tOdW1iZXJdfSBSZXR1cm5zIGFuIGBpbnRbXWAgYXJyYXkgd2l0aCB0d28gZWxlbWVudHM6PGJyLz5cbiAgICAqIFRoZSBmaXJzdCBwb3NpdGlvbiBpbmRpY2F0ZXMgdGhlIG51bWJlciBvZiBjb2x1bW5zIGZvciBgc3RyYCBvbiBzY3JlZW4uPGJyLz5cbiAgICAqIFRoZSBzZWNvbmQgdmFsdWUgY29udGFpbnMgdGhlIHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCBjb2x1bW4gdGhhdCB0aGlzIGZ1bmN0aW9uIHJlYWQgdW50aWwuXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyAkZ2V0U3RyaW5nU2NyZWVuV2lkdGgoc3RyOiBzdHJpbmcsIG1heFNjcmVlbkNvbHVtbj86IG51bWJlciwgc2NyZWVuQ29sdW1uPzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IDApXG4gICAgICAgICAgICByZXR1cm4gWzAsIDBdO1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBtYXhTY3JlZW5Db2x1bW4gPSBJbmZpbml0eTtcbiAgICAgICAgc2NyZWVuQ29sdW1uID0gc2NyZWVuQ29sdW1uIHx8IDA7XG5cbiAgICAgICAgdmFyIGM6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbHVtbjogbnVtYmVyO1xuICAgICAgICBmb3IgKGNvbHVtbiA9IDA7IGNvbHVtbiA8IHN0ci5sZW5ndGg7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICBjID0gc3RyLmNoYXJDb2RlQXQoY29sdW1uKTtcbiAgICAgICAgICAgIC8vIHRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSB0aGlzLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2NyZWVuQ29sdW1uID4gbWF4U2NyZWVuQ29sdW1uKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gW3NjcmVlbkNvbHVtbiwgY29sdW1uXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgbnVtYmVyIG9mIHNjcmVlbnJvd3MgaW4gYSB3cmFwcGVkIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIGNoZWNrXG4gICAgKlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0Um93TGVuZ3RoKHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICB2YXIgaCA9IHRoaXMubGluZVdpZGdldHNbcm93XSAmJiB0aGlzLmxpbmVXaWRnZXRzW3Jvd10ucm93Q291bnQgfHwgMDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaCA9IDBcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgICAgICAgcmV0dXJuIDEgKyBoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMSArIGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFJvd0xpbmVDb3VudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRSb3dXcmFwSW5kZW50KHNjcmVlblJvdzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcG9zLnJvd107XG4gICAgICAgICAgICAvLyBGSVhNRTogaW5kZW50IGRvZXMgbm90IGV4aXN0cyBvbiBudW1iZXJbXVxuICAgICAgICAgICAgcmV0dXJuIHNwbGl0cy5sZW5ndGggJiYgc3BsaXRzWzBdIDwgcG9zLmNvbHVtbiA/IHNwbGl0c1snaW5kZW50J10gOiAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwb3NpdGlvbiAob24gc2NyZWVuKSBmb3IgdGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSBwcm92aWRlZCBzY3JlZW4gcm93LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICpcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGRvY3VtZW50IHBvc2l0aW9uIG9mIHRoZSBsYXN0IHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gcm93LCB0aGlzIHJldHVybnMgdGhlIHNwbGl0IGRhdGEuXG4gICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAgICogQG1ldGhvcyBnZXRTY3JlZW5UYWJTaXplXG4gICAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cblxuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgY2hhcmFjdGVycyBjb29yZGluYXRlcyBvbiB0aGUgc2NyZWVuIHRvIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgd2l0aGluIHRoZSBkb2N1bWVudC4gW1RoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5dezogI2NvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKiovXG4gICAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgaWYgKHNjcmVlblJvdyA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHJvdzogMCwgY29sdW1uOiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgdmFyIGRvY1JvdyA9IDA7XG4gICAgICAgIHZhciBkb2NDb2x1bW4gPSAwO1xuICAgICAgICB2YXIgY29sdW1uO1xuICAgICAgICB2YXIgcm93ID0gMDtcbiAgICAgICAgdmFyIHJvd0xlbmd0aCA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kc2NyZWVuUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgc2NyZWVuUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvY1JvdyA9IHRoaXMuJGRvY1Jvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBzY3JlZW5Sb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFJvdyA9IHRoaXMuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAocm93IDw9IHNjcmVlblJvdykge1xuICAgICAgICAgICAgcm93TGVuZ3RoID0gdGhpcy5nZXRSb3dMZW5ndGgoZG9jUm93KTtcbiAgICAgICAgICAgIGlmIChyb3cgKyByb3dMZW5ndGggPiBzY3JlZW5Sb3cgfHwgZG9jUm93ID49IG1heFJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3cgKz0gcm93TGVuZ3RoO1xuICAgICAgICAgICAgICAgIGRvY1JvdysrO1xuICAgICAgICAgICAgICAgIGlmIChkb2NSb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2goZG9jUm93KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1Jvdykge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIGlmIChyb3cgKyByb3dMZW5ndGggPD0gc2NyZWVuUm93IHx8IGRvY1JvdyA+IG1heFJvdykge1xuICAgICAgICAgICAgLy8gY2xpcCBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByb3c6IG1heFJvdyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0TGluZShtYXhSb3cpLmxlbmd0aFxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpO1xuICAgICAgICAgICAgZm9sZExpbmUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbZG9jUm93XTtcbiAgICAgICAgICAgIGlmIChzcGxpdHMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BsaXRJbmRleCA9IE1hdGguZmxvb3Ioc2NyZWVuUm93IC0gcm93KTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0SW5kZXggPiAwICYmIHNwbGl0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jQ29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXggLSAxXSB8fCBzcGxpdHNbc3BsaXRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoZG9jQ29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkb2NDb2x1bW4gKz0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZSwgc2NyZWVuQ29sdW1uKVsxXTtcblxuICAgICAgICAvLyBXZSByZW1vdmUgb25lIGNoYXJhY3RlciBhdCB0aGUgZW5kIHNvIHRoYXQgdGhlIGRvY0NvbHVtblxuICAgICAgICAvLyBwb3NpdGlvbiByZXR1cm5lZCBpcyBub3QgYXNzb2NpYXRlZCB0byB0aGUgbmV4dCByb3cgb24gdGhlIHNjcmVlbi5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlICYmIGRvY0NvbHVtbiA+PSBjb2x1bW4pXG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBjb2x1bW4gLSAxO1xuXG4gICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBmb2xkTGluZS5pZHhUb1Bvc2l0aW9uKGRvY0NvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiBkb2NSb3csIGNvbHVtbjogZG9jQ29sdW1uIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBDb252ZXJ0cyBkb2N1bWVudCBjb29yZGluYXRlcyB0byBzY3JlZW4gY29vcmRpbmF0ZXMuIHs6Y29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1JvdyBUaGUgZG9jdW1lbnQgcm93IHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgICAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICAgICAgYXNzZXJ0cy5hc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICBhc3NlcnRzLmFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcblxuICAgICAgICB2YXIgc2NyZWVuUm93ID0gMDtcbiAgICAgICAgdmFyIGZvbGRTdGFydFJvdyA9IG51bGw7XG4gICAgICAgIHZhciBmb2xkID0gbnVsbDtcblxuICAgICAgICAvLyBDbGFtcCB0aGUgZG9jUm93IHBvc2l0aW9uIGluIGNhc2UgaXQncyBpbnNpZGUgb2YgYSBmb2xkZWQgYmxvY2suXG4gICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChkb2NSb3csIGRvY0NvbHVtbiwgMSk7XG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICBkb2NSb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGRvY0NvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJvd0VuZCwgcm93ID0gMDtcblxuICAgICAgICB2YXIgcm93Q2FjaGUgPSB0aGlzLiRkb2NSb3dDYWNoZTtcbiAgICAgICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHJvd0NhY2hlLCBkb2NSb3cpO1xuICAgICAgICB2YXIgbCA9IHJvd0NhY2hlLmxlbmd0aDtcbiAgICAgICAgaWYgKGwgJiYgaSA+PSAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcm93Q2FjaGVbaV07XG4gICAgICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy4kc2NyZWVuUm93Q2FjaGVbaV07XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9IGRvY1JvdyA+IHJvd0NhY2hlW2wgLSAxXTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gIWw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAocm93IDwgZG9jUm93KSB7XG4gICAgICAgICAgICBpZiAocm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgIHJvd0VuZCA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIGlmIChyb3dFbmQgPiBkb2NSb3cpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93RW5kLCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJvd0VuZCA9IHJvdyArIDE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNjcmVlblJvdyArPSB0aGlzLmdldFJvd0xlbmd0aChyb3cpO1xuICAgICAgICAgICAgcm93ID0gcm93RW5kO1xuXG4gICAgICAgICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2gocm93KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHNjcmVlblJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIHRleHQgbGluZSB0aGF0IGlzIGRpc3BsYXllZCBpbiBkb2NSb3cgb24gdGhlIHNjcmVlbi5cbiAgICAgICAgdmFyIHRleHRMaW5lID0gXCJcIjtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpbmFsIHJvdyB3ZSB3YW50IHRvIHJlYWNoIGlzIGluc2lkZSBvZiBhIGZvbGQuXG4gICAgICAgIGlmIChmb2xkTGluZSAmJiByb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICB0ZXh0TGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lLCBkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICAgICAgICBmb2xkU3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0ZXh0TGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpLnN1YnN0cmluZygwLCBkb2NDb2x1bW4pO1xuICAgICAgICAgICAgZm9sZFN0YXJ0Um93ID0gZG9jUm93O1xuICAgICAgICB9XG4gICAgICAgIC8vIENsYW1wIHRleHRMaW5lIGlmIGluIHdyYXBNb2RlLlxuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciB3cmFwUm93ID0gdGhpcy4kd3JhcERhdGFbZm9sZFN0YXJ0Um93XTtcbiAgICAgICAgICAgIGlmICh3cmFwUm93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNjcmVlblJvd09mZnNldCA9IDA7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHRleHRMaW5lLmxlbmd0aCA+PSB3cmFwUm93W3NjcmVlblJvd09mZnNldF0pIHtcbiAgICAgICAgICAgICAgICAgICAgc2NyZWVuUm93Kys7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlblJvd09mZnNldCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ZXh0TGluZSA9IHRleHRMaW5lLnN1YnN0cmluZyh3cmFwUm93W3NjcmVlblJvd09mZnNldCAtIDFdIHx8IDAsIHRleHRMaW5lLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm93OiBzY3JlZW5Sb3csXG4gICAgICAgICAgICBjb2x1bW46IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKHRleHRMaW5lKVswXVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIGNvbHVtbi5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuQ29sdW1uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLnJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuTGVuZ3RoKCk6IG51bWJlciB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3dzID0gMDtcbiAgICAgICAgdmFyIGZvbGQgPSBudWxsO1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICBzY3JlZW5Sb3dzID0gdGhpcy5nZXRMZW5ndGgoKTtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkZWQgbGluZXMgYWdhaW4uXG4gICAgICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb2xkID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyAtPSBmb2xkLmVuZC5yb3cgLSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kd3JhcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgdmFyIHJvdyA9IDAsIGkgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgICAgICB3aGlsZSAocm93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtyb3ddO1xuICAgICAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gc3BsaXRzID8gc3BsaXRzLmxlbmd0aCArIDEgOiAxO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZC5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRvZG9cbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gdGhpcy4kZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NyZWVuUm93cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MoZm0pIHtcbiAgICAgICAgLy8gdG9kb1xuICAgIH1cblxuICAgIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIGNocj86IHN0cmluZyk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbiwgY2hyKTtcbiAgICB9XG5cbiAgICBnZXRCcmFja2V0UmFuZ2UocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pOiBybmcuUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAkZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICAkZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG59XG5cbi8vIEZJWE1FOiBSZXN0b3JlXG4vLyBmbGQuRm9sZGluZy5jYWxsKEVkaXRTZXNzaW9uLnByb3RvdHlwZSk7XG5cbmNvbmZpZy5kZWZpbmVPcHRpb25zKEVkaXRTZXNzaW9uLnByb3RvdHlwZSwgXCJzZXNzaW9uXCIsIHtcbiAgICB3cmFwOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIGlmICghdmFsdWUgfHwgdmFsdWUgPT0gXCJvZmZcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGZhbHNlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJmcmVlXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0cnVlO1xuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJwcmludE1hcmdpblwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gLTE7XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHBhcnNlSW50KHZhbHVlLCAxMCkgfHwgZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IHZhbHVlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbCA9IHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiID8gdmFsdWUgOiBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UoY29sLCBjb2wpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiR3cmFwID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5nZXRVc2VXcmFwTW9kZSgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gLTEpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInByaW50TWFyZ2luXCI7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmdldFdyYXBMaW1pdFJhbmdlKCkubWluKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJmcmVlXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJvZmZcIjtcbiAgICAgICAgfSxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgd3JhcE1ldGhvZDoge1xuICAgICAgICAvLyBjb2RlfHRleHR8YXV0b1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgdmFsID0gdmFsID09IFwiYXV0b1wiXG4gICAgICAgICAgICAgICAgPyB0aGlzLiRtb2RlLnR5cGUgIT0gXCJ0ZXh0XCJcbiAgICAgICAgICAgICAgICA6IHZhbCAhPSBcInRleHRcIjtcbiAgICAgICAgICAgIGlmICh2YWwgIT0gdGhpcy4kd3JhcEFzQ29kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHdyYXBBc0NvZGUgPSB2YWw7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImF1dG9cIlxuICAgIH0sXG4gICAgZmlyc3RMaW5lTnVtYmVyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIik7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogMVxuICAgIH0sXG4gICAgdXNlV29ya2VyOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXb3JrZXIgPSB1c2VXb3JrZXI7XG5cbiAgICAgICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcbiAgICAgICAgICAgIGlmICh1c2VXb3JrZXIpXG4gICAgICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB0YWJTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA0LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBvdmVyd3JpdGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlT3ZlcndyaXRlXCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBuZXdMaW5lTW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJG1vZGVJZCB9XG4gICAgfVxufSk7XG4iXX0=