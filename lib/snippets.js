var comparePoints = rm.Range.comparePoints;
var TABSTOP_MANAGER = 'tabstopManager';
function escape(ch) {
    return "(?:[^\\\\" + ch + "]|\\\\.)";
}
function TabstopToken(str, _, stack) {
    str = str.substr(1);
    if (/^\d+$/.test(str) && !stack.inFormatString) {
        return [{ tabstopId: parseInt(str, 10) }];
    }
    return [{ text: str }];
}
export class SnippetManager extends eve.EventEmitterClass {
    constructor() {
        super();
        this.snippetMap = {};
        this.snippetNameMap = {};
        this.variables = {};
    }
    getTokenizer() {
        SnippetManager.prototype.getTokenizer = function () {
            return SnippetManager.$tokenizer;
        };
        return SnippetManager.$tokenizer;
    }
    tokenizeTmSnippet(str, startState) {
        return this.getTokenizer().getLineTokens(str, startState).tokens.map(function (x) {
            return x.value || x;
        });
    }
    $getDefaultValue(editor, name) {
        if (/^[A-Z]\d+$/.test(name)) {
            var i = name.substr(1);
            return (this.variables[name[0] + "__"] || {})[i];
        }
        if (/^\d+$/.test(name)) {
            return (this.variables['__'] || {})[name];
        }
        name = name.replace(/^TM_/, "");
        if (!editor)
            return;
        var s = editor.session;
        switch (name) {
            case "CURRENT_WORD":
                var r = s.getWordRange();
            case "SELECTION":
            case "SELECTED_TEXT":
                return s.getTextRange(r);
            case "CURRENT_LINE":
                return s.getLine(editor.getCursorPosition().row);
            case "PREV_LINE":
                return s.getLine(editor.getCursorPosition().row - 1);
            case "LINE_INDEX":
                return editor.getCursorPosition().column;
            case "LINE_NUMBER":
                return editor.getCursorPosition().row + 1;
            case "SOFT_TABS":
                return s.getUseSoftTabs() ? "YES" : "NO";
            case "TAB_SIZE":
                return s.getTabSize();
            case "FILENAME":
            case "FILEPATH":
                return "";
            case "FULLNAME":
                return "Ace";
        }
    }
    getVariableValue(editor, varName) {
        if (this.variables.hasOwnProperty(varName))
            return this.variables[varName](editor, varName) || "";
        return this.$getDefaultValue(editor, varName) || "";
    }
    tmStrFormat(str, ch, editor) {
        var flag = ch.flag || "";
        var re = ch.guard;
        re = new RegExp(re, flag.replace(/[^gi]/, ""));
        var fmtTokens = this.tokenizeTmSnippet(ch.fmt, "formatString");
        var _self = this;
        var formatted = str.replace(re, function () {
            _self.variables['__'] = arguments;
            var fmtParts = _self.resolveVariables(fmtTokens, editor);
            var gChangeCase = "E";
            for (var i = 0; i < fmtParts.length; i++) {
                var ch = fmtParts[i];
                if (typeof ch == "object") {
                    fmtParts[i] = "";
                    if (ch.changeCase && ch.local) {
                        var next = fmtParts[i + 1];
                        if (next && typeof next == "string") {
                            if (ch.changeCase == "u")
                                fmtParts[i] = next[0].toUpperCase();
                            else
                                fmtParts[i] = next[0].toLowerCase();
                            fmtParts[i + 1] = next.substr(1);
                        }
                    }
                    else if (ch.changeCase) {
                        gChangeCase = ch.changeCase;
                    }
                }
                else if (gChangeCase == "U") {
                    fmtParts[i] = ch.toUpperCase();
                }
                else if (gChangeCase == "L") {
                    fmtParts[i] = ch.toLowerCase();
                }
            }
            return fmtParts.join("");
        });
        this.variables['__'] = null;
        return formatted;
    }
    resolveVariables(snippet, editor) {
        var result = [];
        for (var i = 0; i < snippet.length; i++) {
            var ch = snippet[i];
            if (typeof ch == "string") {
                result.push(ch);
            }
            else if (typeof ch != "object") {
                continue;
            }
            else if (ch.skip) {
                gotoNext(ch);
            }
            else if (ch.processed < i) {
                continue;
            }
            else if (ch.text) {
                var value = this.getVariableValue(editor, ch.text);
                if (value && ch.fmtString)
                    value = this.tmStrFormat(value, ch);
                ch.processed = i;
                if (ch.expectIf == null) {
                    if (value) {
                        result.push(value);
                        gotoNext(ch);
                    }
                }
                else {
                    if (value) {
                        ch.skip = ch.elseBranch;
                    }
                    else
                        gotoNext(ch);
                }
            }
            else if (ch.tabstopId != null) {
                result.push(ch);
            }
            else if (ch.changeCase != null) {
                result.push(ch);
            }
        }
        function gotoNext(ch) {
            var i1 = snippet.indexOf(ch, i + 1);
            if (i1 != -1)
                i = i1;
        }
        return result;
    }
    insertSnippetForSelection(editor, snippetText) {
        var cursor = editor.getCursorPosition();
        var line = editor.session.getLine(cursor.row);
        var tabString = editor.session.getTabString();
        var indentString = line.match(/^\s*/)[0];
        if (cursor.column < indentString.length)
            indentString = indentString.slice(0, cursor.column);
        var tokens = this.tokenizeTmSnippet(snippetText);
        tokens = this.resolveVariables(tokens, editor);
        tokens = tokens.map(function (x) {
            if (x == "\n")
                return x + indentString;
            if (typeof x == "string")
                return x.replace(/\t/g, tabString);
            return x;
        });
        var tabstops = [];
        tokens.forEach(function (p, i) {
            if (typeof p != "object")
                return;
            var id = p.tabstopId;
            var ts = tabstops[id];
            if (!ts) {
                ts = tabstops[id] = [];
                ts.index = id;
                ts.value = "";
            }
            if (ts.indexOf(p) !== -1)
                return;
            ts.push(p);
            var i1 = tokens.indexOf(p, i + 1);
            if (i1 === -1)
                return;
            var value = tokens.slice(i + 1, i1);
            var isNested = value.some(function (t) { return typeof t === "object"; });
            if (isNested && !ts.value) {
                ts.value = value;
            }
            else if (value.length && (!ts.value || typeof ts.value !== "string")) {
                ts.value = value.join("");
            }
        });
        tabstops.forEach(function (ts) { ts.length = 0; });
        var expanding = {};
        function copyValue(val) {
            var copy = [];
            for (var i = 0; i < val.length; i++) {
                var p = val[i];
                if (typeof p == "object") {
                    if (expanding[p.tabstopId])
                        continue;
                    var j = val.lastIndexOf(p, i - 1);
                    p = copy[j] || { tabstopId: p.tabstopId };
                }
                copy[i] = p;
            }
            return copy;
        }
        for (var i = 0; i < tokens.length; i++) {
            var p = tokens[i];
            if (typeof p != "object")
                continue;
            var id = p.tabstopId;
            var i1 = tokens.indexOf(p, i + 1);
            if (expanding[id]) {
                if (expanding[id] === p)
                    expanding[id] = null;
                continue;
            }
            var ts = tabstops[id];
            var arg = typeof ts.value == "string" ? [ts.value] : copyValue(ts.value);
            arg.unshift(i + 1, Math.max(0, i1 - i));
            arg.push(p);
            expanding[id] = p;
            tokens.splice.apply(tokens, arg);
            if (ts.indexOf(p) === -1)
                ts.push(p);
        }
        var row = 0, column = 0;
        var text = "";
        tokens.forEach(function (t) {
            if (typeof t === "string") {
                if (t[0] === "\n") {
                    column = t.length - 1;
                    row++;
                }
                else
                    column += t.length;
                text += t;
            }
            else {
                if (!t.start)
                    t.start = { row: row, column: column };
                else
                    t.end = { row: row, column: column };
            }
        });
        var range = editor.getSelectionRange();
        var end = editor.session.replace(range, text);
        var tsManager = editor[TABSTOP_MANAGER] ? editor[TABSTOP_MANAGER] : new TabstopManager(editor);
        var selectionId = editor.inVirtualSelectionMode && editor.selection['index'];
        tsManager.addTabstops(tabstops, range.start, end, selectionId);
    }
    insertSnippet(editor, snippetText, unused) {
        var self = this;
        if (editor.inVirtualSelectionMode)
            return self.insertSnippetForSelection(editor, snippetText);
        editor.forEachSelection(function () {
            self.insertSnippetForSelection(editor, snippetText);
        }, null, { keepOrder: true });
        if (editor[TABSTOP_MANAGER]) {
            editor[TABSTOP_MANAGER].tabNext();
        }
    }
    $getScope(editor) {
        var scope = editor.session.$mode.$id || "";
        scope = scope.split("/").pop();
        if (scope === "html" || scope === "php") {
            if (scope === "php" && !editor.session.$mode.inlinePhp)
                scope = "html";
            var c = editor.getCursorPosition();
            var state = editor.session.getState(c.row);
            if (typeof state === "object") {
                state = state[0];
            }
            if (state.substring) {
                if (state.substring(0, 3) == "js-")
                    scope = "javascript";
                else if (state.substring(0, 4) == "css-")
                    scope = "css";
                else if (state.substring(0, 4) == "php-")
                    scope = "php";
            }
        }
        return scope;
    }
    getActiveScopes(editor) {
        var scope = this.$getScope(editor);
        var scopes = [scope];
        var snippetMap = this.snippetMap;
        if (snippetMap[scope] && snippetMap[scope].includeScopes) {
            scopes.push.apply(scopes, snippetMap[scope].includeScopes);
        }
        scopes.push("_");
        return scopes;
    }
    expandWithTab(editor, options) {
        var self = this;
        var result = editor.forEachSelection(function () { return self.expandSnippetForSelection(editor, options); }, null, { keepOrder: true });
        if (result && editor[TABSTOP_MANAGER]) {
            editor[TABSTOP_MANAGER].tabNext();
        }
        return result;
    }
    expandSnippetForSelection(editor, options) {
        var cursor = editor.getCursorPosition();
        var line = editor.session.getLine(cursor.row);
        var before = line.substring(0, cursor.column);
        var after = line.substr(cursor.column);
        var snippetMap = this.snippetMap;
        var snippet;
        this.getActiveScopes(editor).some(function (scope) {
            var snippets = snippetMap[scope];
            if (snippets)
                snippet = this.findMatchingSnippet(snippets, before, after);
            return !!snippet;
        }, this);
        if (!snippet)
            return false;
        if (options && options.dryRun)
            return true;
        editor.session.doc.removeInLine(cursor.row, cursor.column - snippet.replaceBefore.length, cursor.column + snippet.replaceAfter.length);
        this.variables['M__'] = snippet.matchBefore;
        this.variables['T__'] = snippet.matchAfter;
        this.insertSnippetForSelection(editor, snippet.content);
        this.variables['M__'] = this.variables['T__'] = null;
        return true;
    }
    findMatchingSnippet(snippetList, before, after) {
        for (var i = snippetList.length; i--;) {
            var s = snippetList[i];
            if (s.startRe && !s.startRe.test(before))
                continue;
            if (s.endRe && !s.endRe.test(after))
                continue;
            if (!s.startRe && !s.endRe)
                continue;
            s.matchBefore = s.startRe ? s.startRe.exec(before) : [""];
            s.matchAfter = s.endRe ? s.endRe.exec(after) : [""];
            s.replaceBefore = s.triggerRe ? s.triggerRe.exec(before)[0] : "";
            s.replaceAfter = s.endTriggerRe ? s.endTriggerRe.exec(after)[0] : "";
            return s;
        }
    }
    register(snippets, scope) {
        var snippetMap = this.snippetMap;
        var snippetNameMap = this.snippetNameMap;
        var self = this;
        function wrapRegexp(src) {
            if (src && !/^\^?\(.*\)\$?$|^\\b$/.test(src))
                src = "(?:" + src + ")";
            return src || "";
        }
        function guardedRegexp(re, guard, opening) {
            re = wrapRegexp(re);
            guard = wrapRegexp(guard);
            if (opening) {
                re = guard + re;
                if (re && re[re.length - 1] != "$")
                    re = re + "$";
            }
            else {
                re = re + guard;
                if (re && re[0] != "^")
                    re = "^" + re;
            }
            return new RegExp(re);
        }
        function addSnippet(s) {
            if (!s.scope)
                s.scope = scope || "_";
            scope = s.scope;
            if (!snippetMap[scope]) {
                snippetMap[scope] = [];
                snippetNameMap[scope] = {};
            }
            var map = snippetNameMap[scope];
            if (s.name) {
                var old = map[s.name];
                if (old)
                    self.unregister(old);
                map[s.name] = s;
            }
            snippetMap[scope].push(s);
            if (s.tabTrigger && !s.trigger) {
                if (!s.guard && /^\w/.test(s.tabTrigger))
                    s.guard = "\\b";
                s.trigger = lang.escapeRegExp(s.tabTrigger);
            }
            s.startRe = guardedRegexp(s.trigger, s.guard, true);
            s.triggerRe = new RegExp(s.trigger, "");
            s.endRe = guardedRegexp(s.endTrigger, s.endGuard, true);
            s.endTriggerRe = new RegExp(s.endTrigger, "");
        }
        if (snippets.content)
            addSnippet(snippets);
        else if (Array.isArray(snippets))
            snippets.forEach(addSnippet);
        this._signal("registerSnippets", { scope: scope });
    }
    unregister(snippets, scope) {
        var snippetMap = this.snippetMap;
        var snippetNameMap = this.snippetNameMap;
        function removeSnippet(s) {
            var nameMap = snippetNameMap[s.scope || scope];
            if (nameMap && nameMap[s.name]) {
                delete nameMap[s.name];
                var map = snippetMap[s.scope || scope];
                var i = map && map.indexOf(s);
                if (i >= 0)
                    map.splice(i, 1);
            }
        }
        if (snippets.content)
            removeSnippet(snippets);
        else if (Array.isArray(snippets))
            snippets.forEach(removeSnippet);
    }
    parseSnippetFile(str) {
        str = str.replace(/\r/g, "");
        var list = [];
        var snippet = {};
        var re = /^#.*|^({[\s\S]*})\s*$|^(\S+) (.*)$|^((?:\n*\t.*)+)/gm;
        var m;
        while (m = re.exec(str)) {
            if (m[1]) {
                try {
                    snippet = JSON.parse(m[1]);
                    list.push(snippet);
                }
                catch (e) { }
            }
            if (m[4]) {
                snippet.content = m[4].replace(/^\t/gm, "");
                list.push(snippet);
                snippet = {};
            }
            else {
                var key = m[2], val = m[3];
                if (key == "regex") {
                    var guardRe = /\/((?:[^\/\\]|\\.)*)|$/g;
                    snippet.guard = guardRe.exec(val)[1];
                    snippet.trigger = guardRe.exec(val)[1];
                    snippet.endTrigger = guardRe.exec(val)[1];
                    snippet.endGuard = guardRe.exec(val)[1];
                }
                else if (key == "snippet") {
                    snippet.tabTrigger = val.match(/^\S*/)[0];
                    if (!snippet.name)
                        snippet.name = val;
                }
                else {
                    snippet[key] = val;
                }
            }
        }
        return list;
    }
    getSnippetByName(name, editor) {
        var snippetMap = this.snippetNameMap;
        var snippet;
        this.getActiveScopes(editor).some(function (scope) {
            var snippets = snippetMap[scope];
            if (snippets)
                snippet = snippets[name];
            return !!snippet;
        }, this);
        return snippet;
    }
}
SnippetManager.$tokenizer = new Tokenizer({
    start: [
        {
            regex: /:/,
            onMatch: function (val, state, stack) {
                if (stack.length && stack[0].expectIf) {
                    stack[0].expectIf = false;
                    stack[0].elseBranch = stack[0];
                    return [stack[0]];
                }
                return ":";
            }
        },
        {
            regex: /\\./,
            onMatch: function (val, state, stack) {
                var ch = val[1];
                if (ch == "}" && stack.length) {
                    val = ch;
                }
                else if ("`$\\".indexOf(ch) != -1) {
                    val = ch;
                }
                else if (stack.inFormatString) {
                    if (ch == "n")
                        val = "\n";
                    else if (ch == "t")
                        val = "\n";
                    else if ("ulULE".indexOf(ch) != -1) {
                        val = { changeCase: ch, local: ch > "a" };
                    }
                }
                return [val];
            }
        },
        {
            regex: /}/,
            onMatch: function (val, state, stack) {
                return [stack.length ? stack.shift() : val];
            }
        },
        {
            regex: /\$(?:\d+|\w+)/,
            onMatch: TabstopToken
        },
        {
            regex: /\$\{[\dA-Z_a-z]+/,
            onMatch: function (str, state, stack) {
                var t = TabstopToken(str.substr(1), state, stack);
                stack.unshift(t[0]);
                return t;
            }, next: "snippetVar"
        },
        {
            regex: /\n/,
            token: "newline",
            merge: false
        }
    ],
    snippetVar: [
        {
            regex: "\\|" + escape("\\|") + "*\\|", onMatch: function (val, state, stack) {
                stack[0].choices = val.slice(1, -1).split(",");
            }, next: "start"
        },
        {
            regex: "/(" + escape("/") + "+)/(?:(" + escape("/") + "*)/)(\\w*):?",
            onMatch: function (val, state, stack) {
                var ts = stack[0];
                ts.fmtString = val;
                val = this.splitRegex.exec(val);
                ts.guard = val[1];
                ts.fmt = val[2];
                ts.flag = val[3];
                return "";
            }, next: "start"
        },
        {
            regex: "`" + escape("`") + "*`", onMatch: function (val, state, stack) {
                stack[0].code = val.splice(1, -1);
                return "";
            }, next: "start"
        },
        {
            regex: "\\?", onMatch: function (val, state, stack) {
                if (stack[0])
                    stack[0].expectIf = true;
            }, next: "start"
        },
        { regex: "([^:}\\\\]|\\\\.)*:?", token: "", next: "start" }
    ],
    formatString: [
        { regex: "/(" + escape("/") + "+)/", token: "regex" },
        {
            regex: "", onMatch: function (val, state, stack) {
                stack.inFormatString = true;
            }, next: "start"
        }
    ]
});
class TabstopManager {
    constructor(editor) {
        this.keyboardHandler = new hhm.HashHandler();
        this.addTabstops = function (tabstops, start, end, unused) {
            if (!this.$openTabstops)
                this.$openTabstops = [];
            if (!tabstops[0]) {
                var p = rm.Range.fromPoints(end, end);
                moveRelative(p.start, start);
                moveRelative(p.end, start);
                tabstops[0] = [p];
                tabstops[0].index = 0;
            }
            var i = this.index;
            var arg = [i + 1, 0];
            var ranges = this.ranges;
            tabstops.forEach(function (ts, index) {
                var dest = this.$openTabstops[index] || ts;
                for (var i = ts.length; i--;) {
                    var p = ts[i];
                    var range = rm.Range.fromPoints(p.start, p.end || p.start);
                    movePoint(range.start, start);
                    movePoint(range.end, start);
                    range.original = p;
                    range.tabstop = dest;
                    ranges.push(range);
                    if (dest != ts)
                        dest.unshift(range);
                    else
                        dest[i] = range;
                    if (p.fmtString) {
                        range.linked = true;
                        dest.hasLinkedRanges = true;
                    }
                    else if (!dest.firstNonLinked)
                        dest.firstNonLinked = range;
                }
                if (!dest.firstNonLinked)
                    dest.hasLinkedRanges = false;
                if (dest === ts) {
                    arg.push(dest);
                    this.$openTabstops[index] = dest;
                }
                this.addTabstopMarkers(dest);
            }, this);
            if (arg.length > 2) {
                if (this.tabstops.length)
                    arg.push(arg.splice(2, 1)[0]);
                this.tabstops.splice.apply(this.tabstops, arg);
            }
        };
        this.addTabstopMarkers = function (ts) {
            var session = this.editor.session;
            ts.forEach(function (range) {
                if (!range.markerId)
                    range.markerId = session.addMarker(range, "ace_snippet-marker", "text");
            });
        };
        this.removeTabstopMarkers = function (ts) {
            var session = this.editor.session;
            ts.forEach(function (range) {
                session.removeMarker(range.markerId);
                range.markerId = null;
            });
        };
        this.removeRange = function (range) {
            var i = range.tabstop.indexOf(range);
            range.tabstop.splice(i, 1);
            i = this.ranges.indexOf(range);
            this.ranges.splice(i, 1);
            this.editor.session.removeMarker(range.markerId);
            if (!range.tabstop.length) {
                i = this.tabstops.indexOf(range.tabstop);
                if (i != -1)
                    this.tabstops.splice(i, 1);
                if (!this.tabstops.length)
                    this.detach();
            }
        };
        editor[TABSTOP_MANAGER] = this;
        this.$onChange = this.onChange.bind(this);
        this.$onChangeSelection = lang.delayedCall(this.onChangeSelection.bind(this)).schedule;
        this.$onChangeSession = this.onChangeSession.bind(this);
        this.$onAfterExec = this.onAfterExec.bind(this);
        this.attach(editor);
        this.keyboardHandler.bindKeys({
            "Tab": function (ed) {
                if (snippetManager && snippetManager.expandWithTab(ed)) {
                    return;
                }
                else {
                    ed[TABSTOP_MANAGER].tabNext(1);
                }
            },
            "Shift-Tab": function (ed) {
                ed[TABSTOP_MANAGER].tabNext(-1);
            },
            "Esc": function (ed) {
                ed[TABSTOP_MANAGER].detach();
            },
            "Return": function (ed) {
                return false;
            }
        });
    }
    attach(editor) {
        this.index = 0;
        this.ranges = [];
        this.tabstops = [];
        this.$openTabstops = null;
        this.selectedTabstop = null;
        this.editor = editor;
        this.editor.on("change", this.$onChange);
        this.editor.on("changeSelection", this.$onChangeSelection);
        this.editor.on("changeSession", this.$onChangeSession);
        this.editor.commands.on("afterExec", this.$onAfterExec);
        this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
    }
    detach() {
        this.tabstops.forEach(this.removeTabstopMarkers, this);
        this.ranges = null;
        this.tabstops = null;
        this.selectedTabstop = null;
        this.editor.removeListener("change", this.$onChange);
        this.editor.removeListener("changeSelection", this.$onChangeSelection);
        this.editor.removeListener("changeSession", this.$onChangeSession);
        this.editor.commands.removeListener("afterExec", this.$onAfterExec);
        this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
        this.editor[TABSTOP_MANAGER] = null;
        this.editor = null;
    }
    onChange(e) {
        var changeRange = e.data.range;
        var isRemove = e.data.action[0] == "r";
        var start = changeRange.start;
        var end = changeRange.end;
        var startRow = start.row;
        var endRow = end.row;
        var lineDif = endRow - startRow;
        var colDiff = end.column - start.column;
        if (isRemove) {
            lineDif = -lineDif;
            colDiff = -colDiff;
        }
        if (!this.$inChange && isRemove) {
            var ts = this.selectedTabstop;
            var changedOutside = ts && !ts.some(function (r) {
                return comparePoints(r.start, start) <= 0 && comparePoints(r.end, end) >= 0;
            });
            if (changedOutside)
                return this.detach();
        }
        var ranges = this.ranges;
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            if (r.end.row < start.row)
                continue;
            if (isRemove && comparePoints(start, r.start) < 0 && comparePoints(end, r.end) > 0) {
                this.removeRange(r);
                i--;
                continue;
            }
            if (r.start.row == startRow && r.start.column > start.column)
                r.start.column += colDiff;
            if (r.end.row == startRow && r.end.column >= start.column)
                r.end.column += colDiff;
            if (r.start.row >= startRow)
                r.start.row += lineDif;
            if (r.end.row >= startRow)
                r.end.row += lineDif;
            if (comparePoints(r.start, r.end) > 0)
                this.removeRange(r);
        }
        if (!ranges.length)
            this.detach();
    }
    updateLinkedFields() {
        var ts = this.selectedTabstop;
        if (!ts || !ts.hasLinkedRanges)
            return;
        this.$inChange = true;
        var session = this.editor.session;
        var text = session.getTextRange(ts.firstNonLinked);
        for (var i = ts.length; i--;) {
            var range = ts[i];
            if (!range.linked)
                continue;
            var fmt = snippetManager.tmStrFormat(text, range.original);
            session.replace(range, fmt);
        }
        this.$inChange = false;
    }
    onAfterExec(e) {
        if (e.command && !e.command.readOnly)
            this.updateLinkedFields();
    }
    onChangeSelection() {
        if (!this.editor)
            return;
        var lead = this.editor.selection.lead;
        var anchor = this.editor.selection.anchor;
        var isEmpty = this.editor.selection.isEmpty();
        for (var i = this.ranges.length; i--;) {
            if (this.ranges[i].linked)
                continue;
            var containsLead = this.ranges[i].contains(lead.row, lead.column);
            var containsAnchor = isEmpty || this.ranges[i].contains(anchor.row, anchor.column);
            if (containsLead && containsAnchor)
                return;
        }
        this.detach();
    }
    onChangeSession() {
        this.detach();
    }
    tabNext(dir) {
        var max = this.tabstops.length;
        var index = this.index + (dir || 1);
        index = Math.min(Math.max(index, 1), max);
        if (index == max)
            index = 0;
        this.selectTabstop(index);
        if (index === 0)
            this.detach();
    }
    selectTabstop(index) {
        this.$openTabstops = null;
        var ts = this.tabstops[this.index];
        if (ts)
            this.addTabstopMarkers(ts);
        this.index = index;
        ts = this.tabstops[this.index];
        if (!ts || !ts.length)
            return;
        this.selectedTabstop = ts;
        if (!this.editor.inVirtualSelectionMode) {
            var sel = this.editor['multiSelect'];
            sel.toSingleRange(ts.firstNonLinked.clone());
            for (var i = ts.length; i--;) {
                if (ts.hasLinkedRanges && ts[i].linked)
                    continue;
                sel.addRange(ts[i].clone(), true);
            }
            if (sel.ranges[0])
                sel.addRange(sel.ranges[0].clone());
        }
        else {
            this.editor.selection.setRange(ts.firstNonLinked);
        }
        this.editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
    }
}
var changeTracker = {};
changeTracker.onChange = am.Anchor.prototype.onChange;
changeTracker.setPosition = function (row, column) {
    this.pos.row = row;
    this.pos.column = column;
};
changeTracker.update = function (pos, delta, $insertRight) {
    this.$insertRight = $insertRight;
    this.pos = pos;
    this.onChange(delta);
};
var movePoint = function (point, diff) {
    if (point.row == 0)
        point.column += diff.column;
    point.row += diff.row;
};
var moveRelative = function (point, start) {
    if (point.row == start.row)
        point.column -= start.column;
    point.row -= start.row;
};
dom.importCssString("\
.ace_snippet-marker {\
    -moz-box-sizing: border-box;\
    box-sizing: border-box;\
    background: rgba(194, 193, 208, 0.09);\
    border: 1px dotted rgba(211, 208, 235, 0.62);\
    position: absolute;\
}");
export var snippetManager = new SnippetManager();
(function () {
    this.insertSnippet = function (content, options) {
        return snippetManager.insertSnippet(this, content, options);
    };
    this.expandSnippet = function (options) {
        return snippetManager.expandWithTab(this, options);
    };
}).call(Editor.prototype);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiQUF3Q0EsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7QUFFM0MsSUFBSSxlQUFlLEdBQUcsZ0JBQWdCLENBQUM7QUFFdkMsZ0JBQWdCLEVBQUU7SUFDZEEsTUFBTUEsQ0FBQ0EsV0FBV0EsR0FBR0EsRUFBRUEsR0FBR0EsVUFBVUEsQ0FBQ0E7QUFDekNBLENBQUNBO0FBQ0Qsc0JBQXNCLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSztJQUMvQkMsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxFQUFFQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUM5Q0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FB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QUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUNsQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZCQSxRQUFRQSxDQUFDQTtvQkFDYkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxFQUFFQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtnQkFDOUNBLENBQUNBO2dCQUNEQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQ0RELEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0E7Z0JBQ3JCQSxRQUFRQSxDQUFDQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFFekJBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLElBQUlBLEVBQUVBLEdBQUdBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN6RUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUVqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuQkEsQ0FBQ0E7UUFHREEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeEJBLElBQUlBLElBQUlBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2RBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLENBQUNBO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNoQixNQUFNLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7b0JBQ3RCLEdBQUcsRUFBRSxDQUFDO2dCQUNWLENBQUM7Z0JBQUMsSUFBSTtvQkFDRixNQUFNLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFDdkIsSUFBSSxJQUFJLENBQUMsQ0FBQztZQUNkLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7b0JBQ1QsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO2dCQUMzQyxJQUFJO29CQUNBLENBQUMsQ0FBQyxHQUFHLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUM3QyxDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUNIQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQ3ZDQSxJQUFJQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUU5Q0EsSUFBSUEsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsSUFBSUEsY0FBY0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDL0ZBLElBQUlBLFdBQVdBLEdBQUdBLE1BQU1BLENBQUNBLHNCQUFzQkEsSUFBSUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDN0VBLFNBQVNBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO0lBQ25FQSxDQUFDQTtJQUVNVCxhQUFhQSxDQUFDQSxNQUFjQSxFQUFFQSxXQUFXQSxFQUFFQSxNQUFPQTtRQUNyRFcsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLHNCQUFzQkEsQ0FBQ0E7WUFDOUJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsTUFBTUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFFL0RBLE1BQU1BLENBQUNBLGdCQUFnQkEsQ0FBQ0E7WUFDcEIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN4RCxDQUFDLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO1FBRTlCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDdENBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9YLFNBQVNBLENBQUNBLE1BQWNBO1FBQzVCWSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUMzQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLE1BQU1BLElBQUlBLEtBQUtBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBRXRDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDbkRBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1lBQ25CQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1lBQ25DQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQTtvQkFDL0JBLEtBQUtBLEdBQUdBLFlBQVlBLENBQUNBO2dCQUN6QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7b0JBQ3JDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDbEJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBO29CQUNyQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDdEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUVNWixlQUFlQSxDQUFDQSxNQUFjQTtRQUNqQ2EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLE1BQU1BLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3JCQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQy9EQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDbEJBLENBQUNBO0lBRU1iLGFBQWFBLENBQUNBLE1BQWNBLEVBQUVBLE9BQVFBO1FBQ3pDYyxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNoQkEsSUFBSUEsTUFBTUEsR0FBWUEsTUFBTUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFQSxJQUFJQSxFQUFFQSxFQUFFQSxTQUFTQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNqSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtJQUNsQkEsQ0FBQ0E7SUFFT2QseUJBQXlCQSxDQUFDQSxNQUFjQSxFQUFFQSxPQUFPQTtRQUNyRGUsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUN4Q0EsSUFBSUEsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzlDQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUV2Q0EsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDakNBLElBQUlBLE9BQU9BLENBQUNBO1FBQ1pBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVNBLEtBQUtBO1lBQzVDLElBQUksUUFBUSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNqQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBQ1QsT0FBTyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ3JCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDVEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBO1lBQzFCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFDdENBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLE1BQU1BLEVBQzVDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUM5Q0EsQ0FBQ0E7UUFFRkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBO1FBQzNDQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRXhEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRU9mLG1CQUFtQkEsQ0FBQ0EsV0FBV0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0E7UUFDbERnQixHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQTtZQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyQ0EsUUFBUUEsQ0FBQ0E7WUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hDQSxRQUFRQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDdkJBLFFBQVFBLENBQUNBO1lBRWJBLENBQUNBLENBQUNBLFdBQVdBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQSxDQUFDQSxVQUFVQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNwREEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0Es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LE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3RCQSxRQUFRQSxDQUFDQTtZQUViQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ0pBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN6REEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN0REEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLENB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QUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRSxDQUFDLENBQUM7SUFDRixJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVMsT0FBTztRQUNqQyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkQsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQgZG9tID0gcmVxdWlyZShcIi4vbGliL2RvbVwiKTtcbmltcG9ydCBvb3AgPSByZXF1aXJlKFwiLi9saWIvb29wXCIpO1xuaW1wb3J0IGV2ZSA9IHJlcXVpcmUoXCIuL2xpYi9ldmVudF9lbWl0dGVyXCIpO1xuaW1wb3J0IGxhbmcgPSByZXF1aXJlKFwiLi9saWIvbGFuZ1wiKTtcbmltcG9ydCBybSA9IHJlcXVpcmUoXCIuL3JhbmdlXCIpO1xuaW1wb3J0IGFtID0gcmVxdWlyZShcIi4vYW5jaG9yXCIpO1xuaW1wb3J0IGhobSA9IHJlcXVpcmUoXCIuL2tleWJvYXJkL2hhc2hfaGFuZGxlclwiKTtcbmltcG9ydCBUb2tlbml6ZXIgPSByZXF1aXJlKFwiLi9Ub2tlbml6ZXJcIik7XG5pbXBvcnQgRWRpdG9yID0gcmVxdWlyZSgnLi9FZGl0b3InKTtcblxudmFyIGNvbXBhcmVQb2ludHMgPSBybS5SYW5nZS5jb21wYXJlUG9pbnRzO1xuXG52YXIgVEFCU1RPUF9NQU5BR0VSID0gJ3RhYnN0b3BNYW5hZ2VyJztcblxuZnVuY3Rpb24gZXNjYXBlKGNoKSB7XG4gICAgcmV0dXJuIFwiKD86W15cXFxcXFxcXFwiICsgY2ggKyBcIl18XFxcXFxcXFwuKVwiO1xufVxuZnVuY3Rpb24gVGFic3RvcFRva2VuKHN0ciwgXywgc3RhY2spOiBhbnlbXSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigxKTtcbiAgICBpZiAoL15cXGQrJC8udGVzdChzdHIpICYmICFzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICByZXR1cm4gW3sgdGFic3RvcElkOiBwYXJzZUludChzdHIsIDEwKSB9XTtcbiAgICB9XG4gICAgcmV0dXJuIFt7IHRleHQ6IHN0ciB9XTtcbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRNYW5hZ2VyIGV4dGVuZHMgZXZlLkV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgc25pcHBldE1hcCA9IHt9O1xuICAgIHByaXZhdGUgc25pcHBldE5hbWVNYXAgPSB7fTtcbiAgICBwcml2YXRlIHZhcmlhYmxlcyA9IHt9O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdGF0aWMgJHRva2VuaXplciA9IG5ldyBUb2tlbml6ZXIoe1xuICAgICAgICBzdGFydDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvOi8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spOiBhbnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2subGVuZ3RoICYmIHN0YWNrWzBdLmV4cGVjdElmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZWxzZUJyYW5jaCA9IHN0YWNrWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzdGFja1swXV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiOlwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXFxcLi8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNoID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJ9XCIgJiYgc3RhY2subGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBjaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChcImAkXFxcXFwiLmluZGV4T2YoY2gpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBjaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNoID09IFwiblwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjaCA9PSBcInRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJ1bFVMRVwiLmluZGV4T2YoY2gpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0geyBjaGFuZ2VDYXNlOiBjaCwgbG9jYWw6IGNoID4gXCJhXCIgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbdmFsXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvfS8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzdGFjay5sZW5ndGggPyBzdGFjay5zaGlmdCgpIDogdmFsXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwkKD86XFxkK3xcXHcrKS8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogVGFic3RvcFRva2VuXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwkXFx7W1xcZEEtWl9hLXpdKy8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24oc3RyLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHQgPSBUYWJzdG9wVG9rZW4oc3RyLnN1YnN0cigxKSwgc3RhdGUsIHN0YWNrKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2sudW5zaGlmdCh0WzBdKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHQ7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzbmlwcGV0VmFyXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXG4vLFxuICAgICAgICAgICAgICAgIHRva2VuOiBcIm5ld2xpbmVcIixcbiAgICAgICAgICAgICAgICBtZXJnZTogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgc25pcHBldFZhcjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFx8XCIgKyBlc2NhcGUoXCJcXFxcfFwiKSArIFwiKlxcXFx8XCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmNob2ljZXMgPSB2YWwuc2xpY2UoMSwgLTEpLnNwbGl0KFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispLyg/OihcIiArIGVzY2FwZShcIi9cIikgKyBcIiopLykoXFxcXHcqKTo/XCIsXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRzID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZtdFN0cmluZyA9IHZhbDtcblxuICAgICAgICAgICAgICAgICAgICB2YWwgPSB0aGlzLnNwbGl0UmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICB0cy5ndWFyZCA9IHZhbFsxXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10ID0gdmFsWzJdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbGFnID0gdmFsWzNdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiYFwiICsgZXNjYXBlKFwiYFwiKSArIFwiKmBcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY29kZSA9IHZhbC5zcGxpY2UoMSwgLTEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXD9cIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YWNrWzBdKVxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZXhwZWN0SWYgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiKFteOn1cXFxcXFxcXF18XFxcXFxcXFwuKSo6P1wiLCB0b2tlbjogXCJcIiwgbmV4dDogXCJzdGFydFwiIH1cbiAgICAgICAgXSxcbiAgICAgICAgZm9ybWF0U3RyaW5nOiBbXG4gICAgICAgICAgICB7IHJlZ2V4OiBcIi8oXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIrKS9cIiwgdG9rZW46IFwicmVnZXhcIiB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5pbkZvcm1hdFN0cmluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIHByaXZhdGUgZ2V0VG9rZW5pemVyKCkge1xuICAgICAgICBTbmlwcGV0TWFuYWdlci5wcm90b3R5cGUuZ2V0VG9rZW5pemVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIFNuaXBwZXRNYW5hZ2VyLiR0b2tlbml6ZXI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0b2tlbml6ZVRtU25pcHBldChzdHIsIHN0YXJ0U3RhdGU/KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFRva2VuaXplcigpLmdldExpbmVUb2tlbnMoc3RyLCBzdGFydFN0YXRlKS50b2tlbnMubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIHJldHVybiB4LnZhbHVlIHx8IHg7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldERlZmF1bHRWYWx1ZShlZGl0b3IsIG5hbWUpIHtcbiAgICAgICAgaWYgKC9eW0EtWl1cXGQrJC8udGVzdChuYW1lKSkge1xuICAgICAgICAgICAgdmFyIGkgPSBuYW1lLnN1YnN0cigxKTtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbbmFtZVswXSArIFwiX19cIl0gfHwge30pW2ldO1xuICAgICAgICB9XG4gICAgICAgIGlmICgvXlxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMudmFyaWFibGVzWydfXyddIHx8IHt9KVtuYW1lXTtcbiAgICAgICAgfVxuICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC9eVE1fLywgXCJcIik7XG5cbiAgICAgICAgaWYgKCFlZGl0b3IpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBzID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgICAgICAgY2FzZSBcIkNVUlJFTlRfV09SRFwiOlxuICAgICAgICAgICAgICAgIHZhciByID0gcy5nZXRXb3JkUmFuZ2UoKTtcbiAgICAgICAgICAgIC8qIGZhbGxzIHRocm91Z2ggKi9cbiAgICAgICAgICAgIGNhc2UgXCJTRUxFQ1RJT05cIjpcbiAgICAgICAgICAgIGNhc2UgXCJTRUxFQ1RFRF9URVhUXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VGV4dFJhbmdlKHIpO1xuICAgICAgICAgICAgY2FzZSBcIkNVUlJFTlRfTElORVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldExpbmUoZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93KTtcbiAgICAgICAgICAgIGNhc2UgXCJQUkVWX0xJTkVcIjogLy8gbm90IHBvc3NpYmxlIGluIHRleHRtYXRlXG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cgLSAxKTtcbiAgICAgICAgICAgIGNhc2UgXCJMSU5FX0lOREVYXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLmNvbHVtbjtcbiAgICAgICAgICAgIGNhc2UgXCJMSU5FX05VTUJFUlwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cgKyAxO1xuICAgICAgICAgICAgY2FzZSBcIlNPRlRfVEFCU1wiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFVzZVNvZnRUYWJzKCkgPyBcIllFU1wiIDogXCJOT1wiO1xuICAgICAgICAgICAgY2FzZSBcIlRBQl9TSVpFXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBidXQgY2FuJ3QgZmlsbCA6KFxuICAgICAgICAgICAgY2FzZSBcIkZJTEVOQU1FXCI6XG4gICAgICAgICAgICBjYXNlIFwiRklMRVBBVEhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIGNhc2UgXCJGVUxMTkFNRVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIkFjZVwiO1xuICAgICAgICB9XG4gICAgfVxuICAgIHByaXZhdGUgZ2V0VmFyaWFibGVWYWx1ZShlZGl0b3IsIHZhck5hbWUpIHtcbiAgICAgICAgaWYgKHRoaXMudmFyaWFibGVzLmhhc093blByb3BlcnR5KHZhck5hbWUpKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFyaWFibGVzW3Zhck5hbWVdKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGdldERlZmF1bHRWYWx1ZShlZGl0b3IsIHZhck5hbWUpIHx8IFwiXCI7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyBzdHJpbmcgZm9ybWF0dGVkIGFjY29yZGluZyB0byBodHRwOi8vbWFudWFsLm1hY3JvbWF0ZXMuY29tL2VuL3JlZ3VsYXJfZXhwcmVzc2lvbnMjcmVwbGFjZW1lbnRfc3RyaW5nX3N5bnRheF9mb3JtYXRfc3RyaW5nc1xuICAgIHB1YmxpYyB0bVN0ckZvcm1hdChzdHIsIGNoLCBlZGl0b3I/KSB7XG4gICAgICAgIHZhciBmbGFnID0gY2guZmxhZyB8fCBcIlwiO1xuICAgICAgICB2YXIgcmUgPSBjaC5ndWFyZDtcbiAgICAgICAgcmUgPSBuZXcgUmVnRXhwKHJlLCBmbGFnLnJlcGxhY2UoL1teZ2ldLywgXCJcIikpO1xuICAgICAgICB2YXIgZm10VG9rZW5zID0gdGhpcy50b2tlbml6ZVRtU25pcHBldChjaC5mbXQsIFwiZm9ybWF0U3RyaW5nXCIpO1xuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgZm9ybWF0dGVkID0gc3RyLnJlcGxhY2UocmUsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgX3NlbGYudmFyaWFibGVzWydfXyddID0gYXJndW1lbnRzO1xuICAgICAgICAgICAgdmFyIGZtdFBhcnRzID0gX3NlbGYucmVzb2x2ZVZhcmlhYmxlcyhmbXRUb2tlbnMsIGVkaXRvcik7XG4gICAgICAgICAgICB2YXIgZ0NoYW5nZUNhc2UgPSBcIkVcIjtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm10UGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2ggPSBmbXRQYXJ0c1tpXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNoID09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSAmJiBjaC5sb2NhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5leHQgPSBmbXRQYXJ0c1tpICsgMV07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV4dCAmJiB0eXBlb2YgbmV4dCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNoLmNoYW5nZUNhc2UgPT0gXCJ1XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gbmV4dFswXS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaSArIDFdID0gbmV4dC5zdWJzdHIoMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ0NoYW5nZUNhc2UgPSBjaC5jaGFuZ2VDYXNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChnQ2hhbmdlQ2FzZSA9PSBcIlVcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IGNoLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChnQ2hhbmdlQ2FzZSA9PSBcIkxcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IGNoLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZtdFBhcnRzLmpvaW4oXCJcIik7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnZhcmlhYmxlc1snX18nXSA9IG51bGw7XG4gICAgICAgIHJldHVybiBmb3JtYXR0ZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNvbHZlVmFyaWFibGVzKHNuaXBwZXQsIGVkaXRvcikge1xuICAgICAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc25pcHBldC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNoID0gc25pcHBldFtpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNoICE9IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guc2tpcCkge1xuICAgICAgICAgICAgICAgIGdvdG9OZXh0KGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2gucHJvY2Vzc2VkIDwgaSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50ZXh0KSB7XG4gICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gdGhpcy5nZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgY2gudGV4dCk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIGNoLmZtdFN0cmluZylcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLnRtU3RyRm9ybWF0KHZhbHVlLCBjaCk7XG4gICAgICAgICAgICAgICAgY2gucHJvY2Vzc2VkID0gaTtcbiAgICAgICAgICAgICAgICBpZiAoY2guZXhwZWN0SWYgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdvdG9OZXh0KGNoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2guc2tpcCA9IGNoLmVsc2VCcmFuY2g7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2gudGFic3RvcElkICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjaCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLmNoYW5nZUNhc2UgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBnb3RvTmV4dChjaCkge1xuICAgICAgICAgICAgdmFyIGkxID0gc25pcHBldC5pbmRleE9mKGNoLCBpICsgMSk7XG4gICAgICAgICAgICBpZiAoaTEgIT0gLTEpXG4gICAgICAgICAgICAgICAgaSA9IGkxO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBpbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvcjogRWRpdG9yLCBzbmlwcGV0VGV4dCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gZWRpdG9yLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHRhYlN0cmluZyA9IGVkaXRvci5zZXNzaW9uLmdldFRhYlN0cmluZygpO1xuICAgICAgICB2YXIgaW5kZW50U3RyaW5nID0gbGluZS5tYXRjaCgvXlxccyovKVswXTtcblxuICAgICAgICBpZiAoY3Vyc29yLmNvbHVtbiA8IGluZGVudFN0cmluZy5sZW5ndGgpXG4gICAgICAgICAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcuc2xpY2UoMCwgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgdmFyIHRva2VucyA9IHRoaXMudG9rZW5pemVUbVNuaXBwZXQoc25pcHBldFRleHQpO1xuICAgICAgICB0b2tlbnMgPSB0aGlzLnJlc29sdmVWYXJpYWJsZXModG9rZW5zLCBlZGl0b3IpO1xuICAgICAgICAvLyBpbmRlbnRcbiAgICAgICAgdG9rZW5zID0gdG9rZW5zLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICBpZiAoeCA9PSBcIlxcblwiKVxuICAgICAgICAgICAgICAgIHJldHVybiB4ICsgaW5kZW50U3RyaW5nO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB4ID09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHgucmVwbGFjZSgvXFx0L2csIHRhYlN0cmluZyk7XG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHRhYnN0b3AgdmFsdWVzXG4gICAgICAgIHZhciB0YWJzdG9wcyA9IFtdO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaChmdW5jdGlvbihwLCBpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHAgIT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB2YXIgaWQgPSBwLnRhYnN0b3BJZDtcbiAgICAgICAgICAgIHZhciB0cyA9IHRhYnN0b3BzW2lkXTtcbiAgICAgICAgICAgIGlmICghdHMpIHtcbiAgICAgICAgICAgICAgICB0cyA9IHRhYnN0b3BzW2lkXSA9IFtdO1xuICAgICAgICAgICAgICAgIHRzLmluZGV4ID0gaWQ7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRzLmluZGV4T2YocCkgIT09IC0xKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRzLnB1c2gocCk7XG4gICAgICAgICAgICB2YXIgaTEgPSB0b2tlbnMuaW5kZXhPZihwLCBpICsgMSk7XG4gICAgICAgICAgICBpZiAoaTEgPT09IC0xKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHZhbHVlID0gdG9rZW5zLnNsaWNlKGkgKyAxLCBpMSk7XG4gICAgICAgICAgICB2YXIgaXNOZXN0ZWQgPSB2YWx1ZS5zb21lKGZ1bmN0aW9uKHQpIHsgcmV0dXJuIHR5cGVvZiB0ID09PSBcIm9iamVjdFwiIH0pO1xuICAgICAgICAgICAgaWYgKGlzTmVzdGVkICYmICF0cy52YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlLmxlbmd0aCAmJiAoIXRzLnZhbHVlIHx8IHR5cGVvZiB0cy52YWx1ZSAhPT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IHZhbHVlLmpvaW4oXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIGV4cGFuZCB0YWJzdG9wIHZhbHVlc1xuICAgICAgICB0YWJzdG9wcy5mb3JFYWNoKGZ1bmN0aW9uKHRzKSB7IHRzLmxlbmd0aCA9IDAgfSk7XG4gICAgICAgIHZhciBleHBhbmRpbmcgPSB7fTtcbiAgICAgICAgZnVuY3Rpb24gY29weVZhbHVlKHZhbCkge1xuICAgICAgICAgICAgdmFyIGNvcHkgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmFsLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHAgPSB2YWxbaV07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwID09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1twLnRhYnN0b3BJZF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGogPSB2YWwubGFzdEluZGV4T2YocCwgaSAtIDEpO1xuICAgICAgICAgICAgICAgICAgICBwID0gY29weVtqXSB8fCB7IHRhYnN0b3BJZDogcC50YWJzdG9wSWQgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29weVtpXSA9IHA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29weTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHAgPSB0b2tlbnNbaV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIHAgIT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBpZCA9IHAudGFic3RvcElkO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1tpZF0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiByZWFjaGVkIGNsb3NpbmcgYnJhY2tldCBjbGVhciBleHBhbmRpbmcgc3RhdGVcbiAgICAgICAgICAgICAgICBpZiAoZXhwYW5kaW5nW2lkXSA9PT0gcClcbiAgICAgICAgICAgICAgICAgICAgZXhwYW5kaW5nW2lkXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgaWdub3JlIHJlY3Vyc2l2ZSB0YWJzdG9wXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0cyA9IHRhYnN0b3BzW2lkXTtcbiAgICAgICAgICAgIHZhciBhcmcgPSB0eXBlb2YgdHMudmFsdWUgPT0gXCJzdHJpbmdcIiA/IFt0cy52YWx1ZV0gOiBjb3B5VmFsdWUodHMudmFsdWUpO1xuICAgICAgICAgICAgYXJnLnVuc2hpZnQoaSArIDEsIE1hdGgubWF4KDAsIGkxIC0gaSkpO1xuICAgICAgICAgICAgYXJnLnB1c2gocCk7XG4gICAgICAgICAgICBleHBhbmRpbmdbaWRdID0gcDtcbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2UuYXBwbHkodG9rZW5zLCBhcmcpO1xuXG4gICAgICAgICAgICBpZiAodHMuaW5kZXhPZihwKSA9PT0gLTEpXG4gICAgICAgICAgICAgICAgdHMucHVzaChwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNvbnZlcnQgdG8gcGxhaW4gdGV4dFxuICAgICAgICB2YXIgcm93ID0gMCwgY29sdW1uID0gMDtcbiAgICAgICAgdmFyIHRleHQgPSBcIlwiO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaChmdW5jdGlvbih0KSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodFswXSA9PT0gXCJcXG5cIikge1xuICAgICAgICAgICAgICAgICAgICBjb2x1bW4gPSB0Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICBjb2x1bW4gKz0gdC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgdGV4dCArPSB0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoIXQuc3RhcnQpXG4gICAgICAgICAgICAgICAgICAgIHQuc3RhcnQgPSB7IHJvdzogcm93LCBjb2x1bW46IGNvbHVtbiB9O1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdC5lbmQgPSB7IHJvdzogcm93LCBjb2x1bW46IGNvbHVtbiB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciBlbmQgPSBlZGl0b3Iuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcblxuICAgICAgICB2YXIgdHNNYW5hZ2VyID0gZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPyBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA6IG5ldyBUYWJzdG9wTWFuYWdlcihlZGl0b3IpO1xuICAgICAgICB2YXIgc2VsZWN0aW9uSWQgPSBlZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSAmJiBlZGl0b3Iuc2VsZWN0aW9uWydpbmRleCddO1xuICAgICAgICB0c01hbmFnZXIuYWRkVGFic3RvcHModGFic3RvcHMsIHJhbmdlLnN0YXJ0LCBlbmQsIHNlbGVjdGlvbklkKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5zZXJ0U25pcHBldChlZGl0b3I6IEVkaXRvciwgc25pcHBldFRleHQsIHVudXNlZD8pIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpXG4gICAgICAgICAgICByZXR1cm4gc2VsZi5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgc25pcHBldFRleHQpO1xuXG4gICAgICAgIGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgc25pcHBldFRleHQpO1xuICAgICAgICB9LCBudWxsLCB7IGtlZXBPcmRlcjogdHJ1ZSB9KTtcblxuICAgICAgICBpZiAoZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0pIHtcbiAgICAgICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFNjb3BlKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzY29wZSA9IGVkaXRvci5zZXNzaW9uLiRtb2RlLiRpZCB8fCBcIlwiO1xuICAgICAgICBzY29wZSA9IHNjb3BlLnNwbGl0KFwiL1wiKS5wb3AoKTtcbiAgICAgICAgaWYgKHNjb3BlID09PSBcImh0bWxcIiB8fCBzY29wZSA9PT0gXCJwaHBcIikge1xuICAgICAgICAgICAgLy8gUEhQIGlzIGFjdHVhbGx5IEhUTUxcbiAgICAgICAgICAgIGlmIChzY29wZSA9PT0gXCJwaHBcIiAmJiAhZWRpdG9yLnNlc3Npb24uJG1vZGUuaW5saW5lUGhwKVxuICAgICAgICAgICAgICAgIHNjb3BlID0gXCJodG1sXCI7XG4gICAgICAgICAgICB2YXIgYyA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gZWRpdG9yLnNlc3Npb24uZ2V0U3RhdGUoYy5yb3cpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIHN0YXRlID0gc3RhdGVbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN1YnN0cmluZygwLCAzKSA9PSBcImpzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiamF2YXNjcmlwdFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcImNzcy1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcImNzc1wiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcInBocC1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcInBocFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBY3RpdmVTY29wZXMoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gdGhpcy4kZ2V0U2NvcGUoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNjb3BlcyA9IFtzY29wZV07XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICBpZiAoc25pcHBldE1hcFtzY29wZV0gJiYgc25pcHBldE1hcFtzY29wZV0uaW5jbHVkZVNjb3Blcykge1xuICAgICAgICAgICAgc2NvcGVzLnB1c2guYXBwbHkoc2NvcGVzLCBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKTtcbiAgICAgICAgfVxuICAgICAgICBzY29wZXMucHVzaChcIl9cIik7XG4gICAgICAgIHJldHVybiBzY29wZXM7XG4gICAgfVxuXG4gICAgcHVibGljIGV4cGFuZFdpdGhUYWIoZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnM/KTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3VsdDogYm9vbGVhbiA9IGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkgeyByZXR1cm4gc2VsZi5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgb3B0aW9ucyk7IH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuICAgICAgICBpZiAocmVzdWx0ICYmIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgbGluZSA9IGVkaXRvci5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBiZWZvcmUgPSBsaW5lLnN1YnN0cmluZygwLCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIGFmdGVyID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0O1xuICAgICAgICB0aGlzLmdldEFjdGl2ZVNjb3BlcyhlZGl0b3IpLnNvbWUoZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzbmlwcGV0cyA9IHNuaXBwZXRNYXBbc2NvcGVdO1xuICAgICAgICAgICAgaWYgKHNuaXBwZXRzKVxuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB0aGlzLmZpbmRNYXRjaGluZ1NuaXBwZXQoc25pcHBldHMsIGJlZm9yZSwgYWZ0ZXIpO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmICghc25pcHBldClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5kcnlSdW4pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LFxuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiAtIHNuaXBwZXQucmVwbGFjZUJlZm9yZS5sZW5ndGgsXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uICsgc25pcHBldC5yZXBsYWNlQWZ0ZXIubGVuZ3RoXG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gc25pcHBldC5tYXRjaEJlZm9yZTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gc25pcHBldC5tYXRjaEFmdGVyO1xuICAgICAgICB0aGlzLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0LmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMudmFyaWFibGVzWydNX18nXSA9IHRoaXMudmFyaWFibGVzWydUX18nXSA9IG51bGw7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0TGlzdCwgYmVmb3JlLCBhZnRlcikge1xuICAgICAgICBmb3IgKHZhciBpID0gc25pcHBldExpc3QubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICB2YXIgcyA9IHNuaXBwZXRMaXN0W2ldO1xuICAgICAgICAgICAgaWYgKHMuc3RhcnRSZSAmJiAhcy5zdGFydFJlLnRlc3QoYmVmb3JlKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChzLmVuZFJlICYmICFzLmVuZFJlLnRlc3QoYWZ0ZXIpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCFzLnN0YXJ0UmUgJiYgIXMuZW5kUmUpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHMubWF0Y2hCZWZvcmUgPSBzLnN0YXJ0UmUgPyBzLnN0YXJ0UmUuZXhlYyhiZWZvcmUpIDogW1wiXCJdO1xuICAgICAgICAgICAgcy5tYXRjaEFmdGVyID0gcy5lbmRSZSA/IHMuZW5kUmUuZXhlYyhhZnRlcikgOiBbXCJcIl07XG4gICAgICAgICAgICBzLnJlcGxhY2VCZWZvcmUgPSBzLnRyaWdnZXJSZSA/IHMudHJpZ2dlclJlLmV4ZWMoYmVmb3JlKVswXSA6IFwiXCI7XG4gICAgICAgICAgICBzLnJlcGxhY2VBZnRlciA9IHMuZW5kVHJpZ2dlclJlID8gcy5lbmRUcmlnZ2VyUmUuZXhlYyhhZnRlcilbMF0gOiBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgcmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIHdyYXBSZWdleHAoc3JjKSB7XG4gICAgICAgICAgICBpZiAoc3JjICYmICEvXlxcXj9cXCguKlxcKVxcJD8kfF5cXFxcYiQvLnRlc3Qoc3JjKSlcbiAgICAgICAgICAgICAgICBzcmMgPSBcIig/OlwiICsgc3JjICsgXCIpXCI7XG5cbiAgICAgICAgICAgIHJldHVybiBzcmMgfHwgXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBndWFyZGVkUmVnZXhwKHJlLCBndWFyZCwgb3BlbmluZykge1xuICAgICAgICAgICAgcmUgPSB3cmFwUmVnZXhwKHJlKTtcbiAgICAgICAgICAgIGd1YXJkID0gd3JhcFJlZ2V4cChndWFyZCk7XG4gICAgICAgICAgICBpZiAob3BlbmluZykge1xuICAgICAgICAgICAgICAgIHJlID0gZ3VhcmQgKyByZTtcbiAgICAgICAgICAgICAgICBpZiAocmUgJiYgcmVbcmUubGVuZ3RoIC0gMV0gIT0gXCIkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJlID0gcmUgKyBcIiRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmUgPSByZSArIGd1YXJkO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVswXSAhPSBcIl5cIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSBcIl5cIiArIHJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAocmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU25pcHBldChzKSB7XG4gICAgICAgICAgICBpZiAoIXMuc2NvcGUpXG4gICAgICAgICAgICAgICAgcy5zY29wZSA9IHNjb3BlIHx8IFwiX1wiO1xuICAgICAgICAgICAgc2NvcGUgPSBzLnNjb3BlO1xuICAgICAgICAgICAgaWYgKCFzbmlwcGV0TWFwW3Njb3BlXSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdID0gW107XG4gICAgICAgICAgICAgICAgc25pcHBldE5hbWVNYXBbc2NvcGVdID0ge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TmFtZU1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAocy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9sZCA9IG1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChvbGQpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYudW5yZWdpc3RlcihvbGQpO1xuICAgICAgICAgICAgICAgIG1hcFtzLm5hbWVdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdLnB1c2gocyk7XG5cbiAgICAgICAgICAgIGlmIChzLnRhYlRyaWdnZXIgJiYgIXMudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgIGlmICghcy5ndWFyZCAmJiAvXlxcdy8udGVzdChzLnRhYlRyaWdnZXIpKVxuICAgICAgICAgICAgICAgICAgICBzLmd1YXJkID0gXCJcXFxcYlwiO1xuICAgICAgICAgICAgICAgIHMudHJpZ2dlciA9IGxhbmcuZXNjYXBlUmVnRXhwKHMudGFiVHJpZ2dlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHMuc3RhcnRSZSA9IGd1YXJkZWRSZWdleHAocy50cmlnZ2VyLCBzLmd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMudHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLnRyaWdnZXIsIFwiXCIpO1xuXG4gICAgICAgICAgICBzLmVuZFJlID0gZ3VhcmRlZFJlZ2V4cChzLmVuZFRyaWdnZXIsIHMuZW5kR3VhcmQsIHRydWUpO1xuICAgICAgICAgICAgcy5lbmRUcmlnZ2VyUmUgPSBuZXcgUmVnRXhwKHMuZW5kVHJpZ2dlciwgXCJcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIGFkZFNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2goYWRkU25pcHBldCk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwicmVnaXN0ZXJTbmlwcGV0c1wiLCB7IHNjb3BlOiBzY29wZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVucmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlPykge1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXROYW1lTWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcblxuICAgICAgICBmdW5jdGlvbiByZW1vdmVTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIHZhciBuYW1lTWFwID0gc25pcHBldE5hbWVNYXBbcy5zY29wZSB8fCBzY29wZV07XG4gICAgICAgICAgICBpZiAobmFtZU1hcCAmJiBuYW1lTWFwW3MubmFtZV0pIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgbmFtZU1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgICAgIHZhciBpID0gbWFwICYmIG1hcC5pbmRleE9mKHMpO1xuICAgICAgICAgICAgICAgIGlmIChpID49IDApXG4gICAgICAgICAgICAgICAgICAgIG1hcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICByZW1vdmVTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKHJlbW92ZVNuaXBwZXQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBwYXJzZVNuaXBwZXRGaWxlKHN0cikge1xuICAgICAgICBzdHIgPSBzdHIucmVwbGFjZSgvXFxyL2csIFwiXCIpO1xuICAgICAgICB2YXIgbGlzdCA9IFtdO1xuICAgICAgICB2YXIgc25pcHBldDogYW55ID0ge307XG4gICAgICAgIHZhciByZSA9IC9eIy4qfF4oe1tcXHNcXFNdKn0pXFxzKiR8XihcXFMrKSAoLiopJHxeKCg/OlxcbipcXHQuKikrKS9nbTtcbiAgICAgICAgdmFyIG07XG4gICAgICAgIHdoaWxlIChtID0gcmUuZXhlYyhzdHIpKSB7XG4gICAgICAgICAgICBpZiAobVsxXSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQgPSBKU09OLnBhcnNlKG1bMV0pO1xuICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9IGlmIChtWzRdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldC5jb250ZW50ID0gbVs0XS5yZXBsYWNlKC9eXFx0L2dtLCBcIlwiKTtcbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHt9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gbVsyXSwgdmFsID0gbVszXTtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09IFwicmVnZXhcIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZ3VhcmRSZSA9IC9cXC8oKD86W15cXC9cXFxcXXxcXFxcLikqKXwkL2c7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZ3VhcmQgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50cmlnZ2VyID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZW5kVHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZEd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXkgPT0gXCJzbmlwcGV0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50YWJUcmlnZ2VyID0gdmFsLm1hdGNoKC9eXFxTKi8pWzBdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNuaXBwZXQubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNuaXBwZXQubmFtZSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0W2tleV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBsaXN0O1xuICAgIH1cbiAgICBwcml2YXRlIGdldFNuaXBwZXRCeU5hbWUobmFtZSwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc25pcHBldDtcbiAgICAgICAgdGhpcy5nZXRBY3RpdmVTY29wZXMoZWRpdG9yKS5zb21lKGZ1bmN0aW9uKHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgc25pcHBldHMgPSBzbmlwcGV0TWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzbmlwcGV0cylcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0gc25pcHBldHNbbmFtZV07XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXQ7XG4gICAgfVxufVxuXG5jbGFzcyBUYWJzdG9wTWFuYWdlciB7XG4gICAgcHJpdmF0ZSBpbmRleDtcbiAgICBwcml2YXRlIHJhbmdlcztcbiAgICBwcml2YXRlIHRhYnN0b3BzO1xuICAgIHByaXZhdGUgJG9wZW5UYWJzdG9wcztcbiAgICBwcml2YXRlIHNlbGVjdGVkVGFic3RvcDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUga2V5Ym9hcmRIYW5kbGVyID0gbmV3IGhobS5IYXNoSGFuZGxlcigpO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2Vzc2lvbjtcbiAgICBwcml2YXRlICRvbkFmdGVyRXhlYztcbiAgICBwcml2YXRlICRpbkNoYW5nZTtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IHRoaXM7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbiA9IGxhbmcuZGVsYXllZENhbGwodGhpcy5vbkNoYW5nZVNlbGVjdGlvbi5iaW5kKHRoaXMpKS5zY2hlZHVsZTtcbiAgICAgICAgdGhpcy4kb25DaGFuZ2VTZXNzaW9uID0gdGhpcy5vbkNoYW5nZVNlc3Npb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy4kb25BZnRlckV4ZWMgPSB0aGlzLm9uQWZ0ZXJFeGVjLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoKGVkaXRvcik7XG4gICAgICAgIHRoaXMua2V5Ym9hcmRIYW5kbGVyLmJpbmRLZXlzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNuaXBwZXRNYW5hZ2VyICYmIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIoZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiU2hpZnQtVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KC0xKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiRXNjXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiUmV0dXJuXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9lZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBhdHRhY2goZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBbXTtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLnRhYnN0b3BzLmZvckVhY2godGhpcy5yZW1vdmVUYWJzdG9wTWFya2VycywgdGhpcyk7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5yZW1vdmVMaXN0ZW5lcihcImFmdGVyRXhlY1wiLCB0aGlzLiRvbkFmdGVyRXhlYyk7XG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcucmVtb3ZlS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5lZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGUpIHtcbiAgICAgICAgdmFyIGNoYW5nZVJhbmdlID0gZS5kYXRhLnJhbmdlO1xuICAgICAgICB2YXIgaXNSZW1vdmUgPSBlLmRhdGEuYWN0aW9uWzBdID09IFwiclwiO1xuICAgICAgICB2YXIgc3RhcnQgPSBjaGFuZ2VSYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGNoYW5nZVJhbmdlLmVuZDtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZW5kLnJvdztcbiAgICAgICAgdmFyIGxpbmVEaWYgPSBlbmRSb3cgLSBzdGFydFJvdztcbiAgICAgICAgdmFyIGNvbERpZmYgPSBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uO1xuXG4gICAgICAgIGlmIChpc1JlbW92ZSkge1xuICAgICAgICAgICAgbGluZURpZiA9IC1saW5lRGlmO1xuICAgICAgICAgICAgY29sRGlmZiA9IC1jb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy4kaW5DaGFuZ2UgJiYgaXNSZW1vdmUpIHtcbiAgICAgICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICAgICAgdmFyIGNoYW5nZWRPdXRzaWRlID0gdHMgJiYgIXRzLnNvbWUoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlUG9pbnRzKHIuc3RhcnQsIHN0YXJ0KSA8PSAwICYmIGNvbXBhcmVQb2ludHMoci5lbmQsIGVuZCkgPj0gMDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNoYW5nZWRPdXRzaWRlKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRldGFjaCgpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLnJhbmdlcztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciByID0gcmFuZ2VzW2ldO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA8IHN0YXJ0LnJvdylcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGlzUmVtb3ZlICYmIGNvbXBhcmVQb2ludHMoc3RhcnQsIHIuc3RhcnQpIDwgMCAmJiBjb21wYXJlUG9pbnRzKGVuZCwgci5lbmQpID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoci5zdGFydC5yb3cgPT0gc3RhcnRSb3cgJiYgci5zdGFydC5jb2x1bW4gPiBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgci5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPT0gc3RhcnRSb3cgJiYgci5lbmQuY29sdW1uID49IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLnN0YXJ0LnJvdyArPSBsaW5lRGlmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLmVuZC5yb3cgKz0gbGluZURpZjtcblxuICAgICAgICAgICAgaWYgKGNvbXBhcmVQb2ludHMoci5zdGFydCwgci5lbmQpID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVJhbmdlKHIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVMaW5rZWRGaWVsZHMoKSB7XG4gICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICBpZiAoIXRzIHx8ICF0cy5oYXNMaW5rZWRSYW5nZXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gdHJ1ZTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdHNbaV07XG4gICAgICAgICAgICBpZiAoIXJhbmdlLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBmbXQgPSBzbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCh0ZXh0LCByYW5nZS5vcmlnaW5hbCk7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UocmFuZ2UsIGZtdCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQWZ0ZXJFeGVjKGUpIHtcbiAgICAgICAgaWYgKGUuY29tbWFuZCAmJiAhZS5jb21tYW5kLnJlYWRPbmx5KVxuICAgICAgICAgICAgdGhpcy51cGRhdGVMaW5rZWRGaWVsZHMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5sZWFkO1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmFuY2hvcjtcbiAgICAgICAgdmFyIGlzRW1wdHkgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpO1xuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYW5nZXNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zTGVhZCA9IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG4gICAgICAgICAgICB2YXIgY29udGFpbnNBbmNob3IgPSBpc0VtcHR5IHx8IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5zTGVhZCAmJiBjb250YWluc0FuY2hvcilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2Vzc2lvbigpIHtcbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRhYk5leHQoZGlyKSB7XG4gICAgICAgIHZhciBtYXggPSB0aGlzLnRhYnN0b3BzLmxlbmd0aDtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5pbmRleCArIChkaXIgfHwgMSk7XG4gICAgICAgIGluZGV4ID0gTWF0aC5taW4oTWF0aC5tYXgoaW5kZXgsIDEpLCBtYXgpO1xuICAgICAgICBpZiAoaW5kZXggPT0gbWF4KVxuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlbGVjdFRhYnN0b3AoaW5kZXgpO1xuICAgICAgICBpZiAoaW5kZXggPT09IDApXG4gICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0VGFic3RvcChpbmRleCkge1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAodHMpXG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKHRzKTtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IHRzO1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzZWwgPSB0aGlzLmVkaXRvclsnbXVsdGlTZWxlY3QnXTtcbiAgICAgICAgICAgIHNlbC50b1NpbmdsZVJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkLmNsb25lKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICh0cy5oYXNMaW5rZWRSYW5nZXMgJiYgdHNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2UodHNbaV0uY2xvbmUoKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0b2RvIGludmVzdGlnYXRlIHdoeSBpcyB0aGlzIG5lZWRlZFxuICAgICAgICAgICAgaWYgKHNlbC5yYW5nZXNbMF0pXG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHNlbC5yYW5nZXNbMF0uY2xvbmUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRUYWJzdG9wcyA9IGZ1bmN0aW9uKHRhYnN0b3BzLCBzdGFydCwgZW5kLCB1bnVzZWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRvcGVuVGFic3RvcHMpXG4gICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBbXTtcbiAgICAgICAgLy8gYWRkIGZpbmFsIHRhYnN0b3AgaWYgbWlzc2luZ1xuICAgICAgICBpZiAoIXRhYnN0b3BzWzBdKSB7XG4gICAgICAgICAgICB2YXIgcCA9IHJtLlJhbmdlLmZyb21Qb2ludHMoZW5kLCBlbmQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0gPSBbcF07XG4gICAgICAgICAgICB0YWJzdG9wc1swXS5pbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHZhciBhcmcgPSBbaSArIDEsIDBdO1xuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gfHwgdHM7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHRzW2ldO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gcm0uUmFuZ2UuZnJvbVBvaW50cyhwLnN0YXJ0LCBwLmVuZCB8fCBwLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2Uuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2UuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgcmFuZ2Uub3JpZ2luYWwgPSBwO1xuICAgICAgICAgICAgICAgIHJhbmdlLnRhYnN0b3AgPSBkZXN0O1xuICAgICAgICAgICAgICAgIHJhbmdlcy5wdXNoKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVzdCAhPSB0cylcbiAgICAgICAgICAgICAgICAgICAgZGVzdC51bnNoaWZ0KHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlc3RbaV0gPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocC5mbXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UubGlua2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QuZmlyc3ROb25MaW5rZWQgPSByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGRlc3QgPT09IHRzKSB7XG4gICAgICAgICAgICAgICAgYXJnLnB1c2goZGVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSA9IGRlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKGRlc3QpO1xuICAgICAgICB9LCB0aGlzKTtcblxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gYWRkaW5nIG5ldyBzbmlwcGV0IGluc2lkZSBleGlzdGluZyBvbmUsIG1ha2Ugc3VyZSAwIHRhYnN0b3AgaXMgYXQgdGhlIGVuZFxuICAgICAgICAgICAgaWYgKHRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGFyZy5zcGxpY2UoMiwgMSlbMF0pO1xuICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UuYXBwbHkodGhpcy50YWJzdG9wcywgYXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UvKjogcm0uUmFuZ2UqLykge1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5tYXJrZXJJZClcbiAgICAgICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zbmlwcGV0LW1hcmtlclwiLCBcInRleHRcIik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVSYW5nZSA9IGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHZhciBpID0gcmFuZ2UudGFic3RvcC5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgcmFuZ2UudGFic3RvcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGkgPSB0aGlzLnJhbmdlcy5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgdGhpcy5yYW5nZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmVkaXRvci5zZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgIGlmICghcmFuZ2UudGFic3RvcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGkgPSB0aGlzLnRhYnN0b3BzLmluZGV4T2YocmFuZ2UudGFic3RvcCk7XG4gICAgICAgICAgICBpZiAoaSAhPSAtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGlmICghdGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbnZhciBjaGFuZ2VUcmFja2VyOiBhbnkgPSB7fTtcbmNoYW5nZVRyYWNrZXIub25DaGFuZ2UgPSBhbS5BbmNob3IucHJvdG90eXBlLm9uQ2hhbmdlO1xuY2hhbmdlVHJhY2tlci5zZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKHJvdywgY29sdW1uKSB7XG4gICAgdGhpcy5wb3Mucm93ID0gcm93O1xuICAgIHRoaXMucG9zLmNvbHVtbiA9IGNvbHVtbjtcbn07XG5jaGFuZ2VUcmFja2VyLnVwZGF0ZSA9IGZ1bmN0aW9uKHBvcywgZGVsdGEsICRpbnNlcnRSaWdodCkge1xuICAgIHRoaXMuJGluc2VydFJpZ2h0ID0gJGluc2VydFJpZ2h0O1xuICAgIHRoaXMucG9zID0gcG9zO1xuICAgIHRoaXMub25DaGFuZ2UoZGVsdGEpO1xufTtcblxudmFyIG1vdmVQb2ludCA9IGZ1bmN0aW9uKHBvaW50LCBkaWZmKSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSAwKVxuICAgICAgICBwb2ludC5jb2x1bW4gKz0gZGlmZi5jb2x1bW47XG4gICAgcG9pbnQucm93ICs9IGRpZmYucm93O1xufTtcblxudmFyIG1vdmVSZWxhdGl2ZSA9IGZ1bmN0aW9uKHBvaW50LCBzdGFydCkge1xuICAgIGlmIChwb2ludC5yb3cgPT0gc3RhcnQucm93KVxuICAgICAgICBwb2ludC5jb2x1bW4gLT0gc3RhcnQuY29sdW1uO1xuICAgIHBvaW50LnJvdyAtPSBzdGFydC5yb3c7XG59O1xuXG5cbmRvbS5pbXBvcnRDc3NTdHJpbmcoXCJcXFxuLmFjZV9zbmlwcGV0LW1hcmtlciB7XFxcbiAgICAtbW96LWJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcXG4gICAgYmFja2dyb3VuZDogcmdiYSgxOTQsIDE5MywgMjA4LCAwLjA5KTtcXFxuICAgIGJvcmRlcjogMXB4IGRvdHRlZCByZ2JhKDIxMSwgMjA4LCAyMzUsIDAuNjIpO1xcXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xcXG59XCIpO1xuXG5leHBvcnQgdmFyIHNuaXBwZXRNYW5hZ2VyID0gbmV3IFNuaXBwZXRNYW5hZ2VyKCk7XG5cbihmdW5jdGlvbigpIHtcbiAgICB0aGlzLmluc2VydFNuaXBwZXQgPSBmdW5jdGlvbihjb250ZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5pbnNlcnRTbmlwcGV0KHRoaXMsIGNvbnRlbnQsIG9wdGlvbnMpO1xuICAgIH07XG4gICAgdGhpcy5leHBhbmRTbmlwcGV0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gc25pcHBldE1hbmFnZXIuZXhwYW5kV2l0aFRhYih0aGlzLCBvcHRpb25zKTtcbiAgICB9O1xufSkuY2FsbChFZGl0b3IucHJvdG90eXBlKTtcbiJdfQ==