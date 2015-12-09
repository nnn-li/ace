import { importCssString } from "./lib/dom";
import EventEmitterClass from "./lib/event_emitter";
import { delayedCall, escapeRegExp } from "./lib/lang";
import Range from "./Range";
import comparePoints from "./comparePoints";
import Anchor from "./Anchor";
import HashHandler from "./keyboard/HashHandler";
import Tokenizer from "./Tokenizer";
import Editor from './Editor';
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
export class SnippetManager extends EventEmitterClass {
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
            if (scope === "php" && !editor.session.$mode['inlinePhp'])
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
                s.trigger = escapeRegExp(s.tabTrigger);
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
        this.keyboardHandler = new HashHandler();
        this.addTabstops = function (tabstops, start, end, unused) {
            if (!this.$openTabstops)
                this.$openTabstops = [];
            if (!tabstops[0]) {
                var p = Range.fromPoints(end, end);
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
                    var range = Range.fromPoints(p.start, p.end || p.start);
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
        this.$onChangeSelection = delayedCall(this.onChangeSelection.bind(this)).schedule;
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
changeTracker.onChange = Anchor.prototype.onChange;
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
importCssString("\
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiT0E4Qk8sRUFBQyxlQUFlLEVBQUMsTUFBTSxXQUFXO09BQ2xDLGlCQUFpQixNQUFNLHFCQUFxQjtPQUM1QyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEtBQUssTUFBTSxTQUFTO09BQ3BCLGFBQWEsTUFBTSxpQkFBaUI7T0FDcEMsTUFBTSxNQUFNLFVBQVU7T0FDdEIsV0FBVyxNQUFNLHdCQUF3QjtPQUN6QyxTQUFTLE1BQU0sYUFBYTtPQUM1QixNQUFNLE1BQU0sVUFBVTtBQUU3QixJQUFJLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQztBQUV2QyxnQkFBZ0IsRUFBRTtJQUNkQSxNQUFNQSxDQUFDQSxXQUFXQSxHQUFHQSxFQUFFQSxHQUFHQSxVQUFVQSxDQUFDQTtBQUN6Q0EsQ0FBQ0E7QUFDRCxzQkFBc0IsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0lBQy9CQyxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FB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Q0FBQ0E7WUFDMUJBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ3RDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVPWCxTQUFTQSxDQUFDQSxNQUFjQTtRQUM1QlksSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDM0NBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxNQUFNQSxJQUFJQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUd0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3REQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtZQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM1QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEs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QUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbkJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUN2RUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtRQUNuRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDcEVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDbkVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFFT0gsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDZEksSUFBSUEsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO1FBQ3ZDQSxJQUFJQSxLQUFLQSxHQUFHQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUM5QkEsSUFBSUEsR0FBR0EsR0FBR0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDMUJBLElBQUlBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3pCQSxJQUFJQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNyQkEsSUFBSUEsT0FBT0EsR0FBR0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDaENBLElBQUlBLE9BQU9BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBRXhDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxPQUFPQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNuQkEsT0FBT0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQzlCQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtZQUM5QkEsSUFBSUEsY0FBY0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQzFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksYUFBYSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hGLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFDSEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQ2ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN6QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDdEJBLFFBQVFBLENBQUNBO1lBRWJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLGFBQWFBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLGFBQWFBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqRkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDSkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3pEQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFB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LENBQUM7QUFFakQsQ0FBQztJQUNHLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBUyxPQUFPLEVBQUUsT0FBTztRQUMxQyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBUyxPQUFPO1FBQ2pDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7aW1wb3J0Q3NzU3RyaW5nfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIGVzY2FwZVJlZ0V4cH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IGNvbXBhcmVQb2ludHMgZnJvbSBcIi4vY29tcGFyZVBvaW50c1wiXG5pbXBvcnQgQW5jaG9yIGZyb20gXCIuL0FuY2hvclwiO1xuaW1wb3J0IEhhc2hIYW5kbGVyIGZyb20gXCIuL2tleWJvYXJkL0hhc2hIYW5kbGVyXCI7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gXCIuL1Rva2VuaXplclwiO1xuaW1wb3J0IEVkaXRvciBmcm9tICcuL0VkaXRvcic7XG5cbnZhciBUQUJTVE9QX01BTkFHRVIgPSAndGFic3RvcE1hbmFnZXInO1xuXG5mdW5jdGlvbiBlc2NhcGUoY2gpIHtcbiAgICByZXR1cm4gXCIoPzpbXlxcXFxcXFxcXCIgKyBjaCArIFwiXXxcXFxcXFxcXC4pXCI7XG59XG5mdW5jdGlvbiBUYWJzdG9wVG9rZW4oc3RyLCBfLCBzdGFjayk6IGFueVtdIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDEpO1xuICAgIGlmICgvXlxcZCskLy50ZXN0KHN0cikgJiYgIXN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBbeyB0YWJzdG9wSWQ6IHBhcnNlSW50KHN0ciwgMTApIH1dO1xuICAgIH1cbiAgICByZXR1cm4gW3sgdGV4dDogc3RyIH1dO1xufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldE1hbmFnZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIHNuaXBwZXRNYXAgPSB7fTtcbiAgICBwcml2YXRlIHNuaXBwZXROYW1lTWFwID0ge307XG4gICAgcHJpdmF0ZSB2YXJpYWJsZXMgPSB7fTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcigpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RhdGljICR0b2tlbml6ZXIgPSBuZXcgVG9rZW5pemVyKHtcbiAgICAgICAgc3RhcnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogLzovLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKTogYW55IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCAmJiBzdGFja1swXS5leHBlY3RJZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZXhwZWN0SWYgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmVsc2VCcmFuY2ggPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbc3RhY2tbMF1dO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIjpcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFxcXC4vLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaCA9IHZhbFsxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoID09IFwifVwiICYmIHN0YWNrLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gY2g7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoXCJgJFxcXFxcIi5pbmRleE9mKGNoKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gY2g7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhY2suaW5Gb3JtYXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIm5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoY2ggPT0gXCJ0XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKFwidWxVTEVcIi5pbmRleE9mKGNoKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHsgY2hhbmdlQ2FzZTogY2gsIGxvY2FsOiBjaCA+IFwiYVwiIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3ZhbF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL30vLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbc3RhY2subGVuZ3RoID8gc3RhY2suc2hpZnQoKSA6IHZhbF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcJCg/OlxcZCt8XFx3KykvLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IFRhYnN0b3BUb2tlblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcJFxce1tcXGRBLVpfYS16XSsvLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHN0ciwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ID0gVGFic3RvcFRva2VuKHN0ci5zdWJzdHIoMSksIHN0YXRlLCBzdGFjayk7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnVuc2hpZnQodFswXSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0O1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic25pcHBldFZhclwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFxuLyxcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJuZXdsaW5lXCIsXG4gICAgICAgICAgICAgICAgbWVyZ2U6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIHNuaXBwZXRWYXI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcfFwiICsgZXNjYXBlKFwiXFxcXHxcIikgKyBcIipcXFxcfFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jaG9pY2VzID0gdmFsLnNsaWNlKDEsIC0xKS5zcGxpdChcIixcIik7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIi8oXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIrKS8oPzooXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIqKS8pKFxcXFx3Kik6P1wiLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0cyA9IHN0YWNrWzBdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXRTdHJpbmcgPSB2YWw7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFsID0gdGhpcy5zcGxpdFJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZ3VhcmQgPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZtdCA9IHZhbFsyXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZmxhZyA9IHZhbFszXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcImBcIiArIGVzY2FwZShcImBcIikgKyBcIipgXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmNvZGUgPSB2YWwuc3BsaWNlKDEsIC0xKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFw/XCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFja1swXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IHJlZ2V4OiBcIihbXjp9XFxcXFxcXFxdfFxcXFxcXFxcLikqOj9cIiwgdG9rZW46IFwiXCIsIG5leHQ6IFwic3RhcnRcIiB9XG4gICAgICAgIF0sXG4gICAgICAgIGZvcm1hdFN0cmluZzogW1xuICAgICAgICAgICAgeyByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvXCIsIHRva2VuOiBcInJlZ2V4XCIgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2suaW5Gb3JtYXRTdHJpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICBwcml2YXRlIGdldFRva2VuaXplcigpIHtcbiAgICAgICAgU25pcHBldE1hbmFnZXIucHJvdG90eXBlLmdldFRva2VuaXplciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIFNuaXBwZXRNYW5hZ2VyLiR0b2tlbml6ZXI7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgdG9rZW5pemVUbVNuaXBwZXQoc3RyLCBzdGFydFN0YXRlPykge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRUb2tlbml6ZXIoKS5nZXRMaW5lVG9rZW5zKHN0ciwgc3RhcnRTdGF0ZSkudG9rZW5zLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICByZXR1cm4geC52YWx1ZSB8fCB4O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXREZWZhdWx0VmFsdWUoZWRpdG9yLCBuYW1lKSB7XG4gICAgICAgIGlmICgvXltBLVpdXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHZhciBpID0gbmFtZS5zdWJzdHIoMSk7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMudmFyaWFibGVzW25hbWVbMF0gKyBcIl9fXCJdIHx8IHt9KVtpXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoL15cXGQrJC8udGVzdChuYW1lKSkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1snX18nXSB8fCB7fSlbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvXlRNXy8sIFwiXCIpO1xuXG4gICAgICAgIGlmICghZWRpdG9yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgcyA9IGVkaXRvci5zZXNzaW9uO1xuICAgICAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJDVVJSRU5UX1dPUkRcIjpcbiAgICAgICAgICAgICAgICB2YXIgciA9IHMuZ2V0V29yZFJhbmdlKCk7XG4gICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICBjYXNlIFwiU0VMRUNUSU9OXCI6XG4gICAgICAgICAgICBjYXNlIFwiU0VMRUNURURfVEVYVFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFRleHRSYW5nZShyKTtcbiAgICAgICAgICAgIGNhc2UgXCJDVVJSRU5UX0xJTkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyk7XG4gICAgICAgICAgICBjYXNlIFwiUFJFVl9MSU5FXCI6IC8vIG5vdCBwb3NzaWJsZSBpbiB0ZXh0bWF0ZVxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldExpbmUoZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93IC0gMSk7XG4gICAgICAgICAgICBjYXNlIFwiTElORV9JTkRFWFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5jb2x1bW47XG4gICAgICAgICAgICBjYXNlIFwiTElORV9OVU1CRVJcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93ICsgMTtcbiAgICAgICAgICAgIGNhc2UgXCJTT0ZUX1RBQlNcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRVc2VTb2Z0VGFicygpID8gXCJZRVNcIiA6IFwiTk9cIjtcbiAgICAgICAgICAgIGNhc2UgXCJUQUJfU0laRVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIC8vIGRlZmF1bHQgYnV0IGNhbid0IGZpbGwgOihcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFTkFNRVwiOlxuICAgICAgICAgICAgY2FzZSBcIkZJTEVQQVRIXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICBjYXNlIFwiRlVMTE5BTUVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJBY2VcIjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBwcml2YXRlIGdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCB2YXJOYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLnZhcmlhYmxlcy5oYXNPd25Qcm9wZXJ0eSh2YXJOYW1lKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZhcmlhYmxlc1t2YXJOYW1lXShlZGl0b3IsIHZhck5hbWUpIHx8IFwiXCI7XG4gICAgICAgIHJldHVybiB0aGlzLiRnZXREZWZhdWx0VmFsdWUoZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgc3RyaW5nIGZvcm1hdHRlZCBhY2NvcmRpbmcgdG8gaHR0cDovL21hbnVhbC5tYWNyb21hdGVzLmNvbS9lbi9yZWd1bGFyX2V4cHJlc3Npb25zI3JlcGxhY2VtZW50X3N0cmluZ19zeW50YXhfZm9ybWF0X3N0cmluZ3NcbiAgICBwdWJsaWMgdG1TdHJGb3JtYXQoc3RyLCBjaCwgZWRpdG9yPykge1xuICAgICAgICB2YXIgZmxhZyA9IGNoLmZsYWcgfHwgXCJcIjtcbiAgICAgICAgdmFyIHJlID0gY2guZ3VhcmQ7XG4gICAgICAgIHJlID0gbmV3IFJlZ0V4cChyZSwgZmxhZy5yZXBsYWNlKC9bXmdpXS8sIFwiXCIpKTtcbiAgICAgICAgdmFyIGZtdFRva2VucyA9IHRoaXMudG9rZW5pemVUbVNuaXBwZXQoY2guZm10LCBcImZvcm1hdFN0cmluZ1wiKTtcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGZvcm1hdHRlZCA9IHN0ci5yZXBsYWNlKHJlLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnZhcmlhYmxlc1snX18nXSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgIHZhciBmbXRQYXJ0cyA9IF9zZWxmLnJlc29sdmVWYXJpYWJsZXMoZm10VG9rZW5zLCBlZGl0b3IpO1xuICAgICAgICAgICAgdmFyIGdDaGFuZ2VDYXNlID0gXCJFXCI7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZtdFBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNoID0gZm10UGFydHNbaV07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoLmNoYW5nZUNhc2UgJiYgY2gubG9jYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZm10UGFydHNbaSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5leHQgJiYgdHlwZW9mIG5leHQgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlID09IFwidVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gbmV4dFswXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2kgKyAxXSA9IG5leHQuc3Vic3RyKDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNoLmNoYW5nZUNhc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdDaGFuZ2VDYXNlID0gY2guY2hhbmdlQ2FzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZ0NoYW5nZUNhc2UgPT0gXCJVXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBjaC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZ0NoYW5nZUNhc2UgPT0gXCJMXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmbXRQYXJ0cy5qb2luKFwiXCIpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ19fJ10gPSBudWxsO1xuICAgICAgICByZXR1cm4gZm9ybWF0dGVkO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVZhcmlhYmxlcyhzbmlwcGV0LCBlZGl0b3IpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNuaXBwZXQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHNuaXBwZXRbaV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNoID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjaCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjaCAhPSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnNraXApIHtcbiAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnByb2Nlc3NlZCA8IGkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2gudGV4dCkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRoaXMuZ2V0VmFyaWFibGVWYWx1ZShlZGl0b3IsIGNoLnRleHQpO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiBjaC5mbXRTdHJpbmcpXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy50bVN0ckZvcm1hdCh2YWx1ZSwgY2gpO1xuICAgICAgICAgICAgICAgIGNoLnByb2Nlc3NlZCA9IGk7XG4gICAgICAgICAgICAgICAgaWYgKGNoLmV4cGVjdElmID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoLnNraXAgPSBjaC5lbHNlQnJhbmNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGdvdG9OZXh0KGNoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRhYnN0b3BJZCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ290b05leHQoY2gpIHtcbiAgICAgICAgICAgIHZhciBpMSA9IHNuaXBwZXQuaW5kZXhPZihjaCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxICE9IC0xKVxuICAgICAgICAgICAgICAgIGkgPSBpMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3I6IEVkaXRvciwgc25pcHBldFRleHQpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgbGluZSA9IGVkaXRvci5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciB0YWJTdHJpbmcgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcbiAgICAgICAgdmFyIGluZGVudFN0cmluZyA9IGxpbmUubWF0Y2goL15cXHMqLylbMF07XG5cbiAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPCBpbmRlbnRTdHJpbmcubGVuZ3RoKVxuICAgICAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnNsaWNlKDAsIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KHNuaXBwZXRUZXh0KTtcbiAgICAgICAgdG9rZW5zID0gdGhpcy5yZXNvbHZlVmFyaWFibGVzKHRva2VucywgZWRpdG9yKTtcbiAgICAgICAgLy8gaW5kZW50XG4gICAgICAgIHRva2VucyA9IHRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgaWYgKHggPT0gXCJcXG5cIilcbiAgICAgICAgICAgICAgICByZXR1cm4geCArIGluZGVudFN0cmluZztcbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHJldHVybiB4LnJlcGxhY2UoL1xcdC9nLCB0YWJTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0YWJzdG9wIHZhbHVlc1xuICAgICAgICB2YXIgdGFic3RvcHMgPSBbXTtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24ocCwgaSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICBpZiAoIXRzKSB7XG4gICAgICAgICAgICAgICAgdHMgPSB0YWJzdG9wc1tpZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB0cy5pbmRleCA9IGlkO1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApICE9PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxID09PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vucy5zbGljZShpICsgMSwgaTEpO1xuICAgICAgICAgICAgdmFyIGlzTmVzdGVkID0gdmFsdWUuc29tZShmdW5jdGlvbih0KSB7IHJldHVybiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiB9KTtcbiAgICAgICAgICAgIGlmIChpc05lc3RlZCAmJiAhdHMudmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZS5sZW5ndGggJiYgKCF0cy52YWx1ZSB8fCB0eXBlb2YgdHMudmFsdWUgIT09IFwic3RyaW5nXCIpKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZS5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBleHBhbmQgdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdGFic3RvcHMuZm9yRWFjaChmdW5jdGlvbih0cykgeyB0cy5sZW5ndGggPSAwIH0pO1xuICAgICAgICB2YXIgZXhwYW5kaW5nID0ge307XG4gICAgICAgIGZ1bmN0aW9uIGNvcHlWYWx1ZSh2YWwpIHtcbiAgICAgICAgICAgIHZhciBjb3B5ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBwID0gdmFsW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcCA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbcC50YWJzdG9wSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBqID0gdmFsLmxhc3RJbmRleE9mKHAsIGkgLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGNvcHlbal0gfHwgeyB0YWJzdG9wSWQ6IHAudGFic3RvcElkIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvcHlbaV0gPSBwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBwID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgaWQgPSBwLnRhYnN0b3BJZDtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgcmVhY2hlZCBjbG9zaW5nIGJyYWNrZXQgY2xlYXIgZXhwYW5kaW5nIHN0YXRlXG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1tpZF0gPT09IHApXG4gICAgICAgICAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBudWxsO1xuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGlnbm9yZSByZWN1cnNpdmUgdGFic3RvcFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICB2YXIgYXJnID0gdHlwZW9mIHRzLnZhbHVlID09IFwic3RyaW5nXCIgPyBbdHMudmFsdWVdIDogY29weVZhbHVlKHRzLnZhbHVlKTtcbiAgICAgICAgICAgIGFyZy51bnNoaWZ0KGkgKyAxLCBNYXRoLm1heCgwLCBpMSAtIGkpKTtcbiAgICAgICAgICAgIGFyZy5wdXNoKHApO1xuICAgICAgICAgICAgZXhwYW5kaW5nW2lkXSA9IHA7XG4gICAgICAgICAgICB0b2tlbnMuc3BsaWNlLmFwcGx5KHRva2VucywgYXJnKTtcblxuICAgICAgICAgICAgaWYgKHRzLmluZGV4T2YocCkgPT09IC0xKVxuICAgICAgICAgICAgICAgIHRzLnB1c2gocCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IHRvIHBsYWluIHRleHRcbiAgICAgICAgdmFyIHJvdyA9IDAsIGNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0ZXh0ID0gXCJcIjtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRbMF0gPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gdC5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uICs9IHQubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRleHQgKz0gdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0LnN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICB0LnN0YXJ0ID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHQuZW5kID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgZW5kID0gZWRpdG9yLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dCk7XG5cbiAgICAgICAgdmFyIHRzTWFuYWdlciA9IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID8gZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gOiBuZXcgVGFic3RvcE1hbmFnZXIoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNlbGVjdGlvbklkID0gZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUgJiYgZWRpdG9yLnNlbGVjdGlvblsnaW5kZXgnXTtcbiAgICAgICAgdHNNYW5hZ2VyLmFkZFRhYnN0b3BzKHRhYnN0b3BzLCByYW5nZS5zdGFydCwgZW5kLCBzZWxlY3Rpb25JZCk7XG4gICAgfVxuXG4gICAgcHVibGljIGluc2VydFNuaXBwZXQoZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0LCB1bnVzZWQ/KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcblxuICAgICAgICBlZGl0b3IuZm9yRWFjaFNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcbiAgICAgICAgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG5cbiAgICAgICAgaWYgKGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRTY29wZShlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2NvcGUgPSBlZGl0b3Iuc2Vzc2lvbi4kbW9kZS4kaWQgfHwgXCJcIjtcbiAgICAgICAgc2NvcGUgPSBzY29wZS5zcGxpdChcIi9cIikucG9wKCk7XG4gICAgICAgIGlmIChzY29wZSA9PT0gXCJodG1sXCIgfHwgc2NvcGUgPT09IFwicGhwXCIpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBDb3VwbGluZyB0byBQSFA/XG4gICAgICAgICAgICAvLyBQSFAgaXMgYWN0dWFsbHkgSFRNTFxuICAgICAgICAgICAgaWYgKHNjb3BlID09PSBcInBocFwiICYmICFlZGl0b3Iuc2Vzc2lvbi4kbW9kZVsnaW5saW5lUGhwJ10pXG4gICAgICAgICAgICAgICAgc2NvcGUgPSBcImh0bWxcIjtcbiAgICAgICAgICAgIHZhciBjID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRTdGF0ZShjLnJvdyk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHN0YXRlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUgPSBzdGF0ZVswXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS5zdWJzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDMpID09IFwianMtXCIpXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlID0gXCJqYXZhc2NyaXB0XCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwiY3NzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiY3NzXCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwicGhwLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwicGhwXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHVibGljIGdldEFjdGl2ZVNjb3BlcyhlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2NvcGUgPSB0aGlzLiRnZXRTY29wZShlZGl0b3IpO1xuICAgICAgICB2YXIgc2NvcGVzID0gW3Njb3BlXTtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIGlmIChzbmlwcGV0TWFwW3Njb3BlXSAmJiBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKSB7XG4gICAgICAgICAgICBzY29wZXMucHVzaC5hcHBseShzY29wZXMsIHNuaXBwZXRNYXBbc2NvcGVdLmluY2x1ZGVTY29wZXMpO1xuICAgICAgICB9XG4gICAgICAgIHNjb3Blcy5wdXNoKFwiX1wiKTtcbiAgICAgICAgcmV0dXJuIHNjb3BlcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZXhwYW5kV2l0aFRhYihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucz8pOiBib29sZWFuIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzdWx0OiBib29sZWFuID0gZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7IHJldHVybiBzZWxmLmV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBvcHRpb25zKTsgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0pIHtcbiAgICAgICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhwYW5kU25pcHBldEZvclNlbGVjdGlvbihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucykge1xuICAgICAgICB2YXIgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gZWRpdG9yLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGJlZm9yZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgYWZ0ZXIgPSBsaW5lLnN1YnN0cihjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHRoaXMuZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0cywgYmVmb3JlLCBhZnRlcik7XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKCFzbmlwcGV0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmRyeVJ1bilcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5kb2MucmVtb3ZlSW5MaW5lKGN1cnNvci5yb3csXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uIC0gc25pcHBldC5yZXBsYWNlQmVmb3JlLmxlbmd0aCxcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gKyBzbmlwcGV0LnJlcGxhY2VBZnRlci5sZW5ndGhcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLnZhcmlhYmxlc1snTV9fJ10gPSBzbmlwcGV0Lm1hdGNoQmVmb3JlO1xuICAgICAgICB0aGlzLnZhcmlhYmxlc1snVF9fJ10gPSBzbmlwcGV0Lm1hdGNoQWZ0ZXI7XG4gICAgICAgIHRoaXMuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXQuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmaW5kTWF0Y2hpbmdTbmlwcGV0KHNuaXBwZXRMaXN0LCBiZWZvcmUsIGFmdGVyKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzbmlwcGV0TGlzdC5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciBzID0gc25pcHBldExpc3RbaV07XG4gICAgICAgICAgICBpZiAocy5zdGFydFJlICYmICFzLnN0YXJ0UmUudGVzdChiZWZvcmUpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKHMuZW5kUmUgJiYgIXMuZW5kUmUudGVzdChhZnRlcikpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBpZiAoIXMuc3RhcnRSZSAmJiAhcy5lbmRSZSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgcy5tYXRjaEJlZm9yZSA9IHMuc3RhcnRSZSA/IHMuc3RhcnRSZS5leGVjKGJlZm9yZSkgOiBbXCJcIl07XG4gICAgICAgICAgICBzLm1hdGNoQWZ0ZXIgPSBzLmVuZFJlID8gcy5lbmRSZS5leGVjKGFmdGVyKSA6IFtcIlwiXTtcbiAgICAgICAgICAgIHMucmVwbGFjZUJlZm9yZSA9IHMudHJpZ2dlclJlID8gcy50cmlnZ2VyUmUuZXhlYyhiZWZvcmUpWzBdIDogXCJcIjtcbiAgICAgICAgICAgIHMucmVwbGFjZUFmdGVyID0gcy5lbmRUcmlnZ2VyUmUgPyBzLmVuZFRyaWdnZXJSZS5leGVjKGFmdGVyKVswXSA6IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyByZWdpc3RlcihzbmlwcGV0cywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gd3JhcFJlZ2V4cChzcmMpIHtcbiAgICAgICAgICAgIGlmIChzcmMgJiYgIS9eXFxeP1xcKC4qXFwpXFwkPyR8XlxcXFxiJC8udGVzdChzcmMpKVxuICAgICAgICAgICAgICAgIHNyYyA9IFwiKD86XCIgKyBzcmMgKyBcIilcIjtcblxuICAgICAgICAgICAgcmV0dXJuIHNyYyB8fCBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGd1YXJkZWRSZWdleHAocmUsIGd1YXJkLCBvcGVuaW5nKSB7XG4gICAgICAgICAgICByZSA9IHdyYXBSZWdleHAocmUpO1xuICAgICAgICAgICAgZ3VhcmQgPSB3cmFwUmVnZXhwKGd1YXJkKTtcbiAgICAgICAgICAgIGlmIChvcGVuaW5nKSB7XG4gICAgICAgICAgICAgICAgcmUgPSBndWFyZCArIHJlO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVtyZS5sZW5ndGggLSAxXSAhPSBcIiRcIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSByZSArIFwiJFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZSA9IHJlICsgZ3VhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlICYmIHJlWzBdICE9IFwiXlwiKVxuICAgICAgICAgICAgICAgICAgICByZSA9IFwiXlwiICsgcmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChyZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGRTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIGlmICghcy5zY29wZSlcbiAgICAgICAgICAgICAgICBzLnNjb3BlID0gc2NvcGUgfHwgXCJfXCI7XG4gICAgICAgICAgICBzY29wZSA9IHMuc2NvcGU7XG4gICAgICAgICAgICBpZiAoIXNuaXBwZXRNYXBbc2NvcGVdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0TmFtZU1hcFtzY29wZV0gPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXROYW1lTWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgb2xkID0gbWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKG9sZClcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51bnJlZ2lzdGVyKG9sZCk7XG4gICAgICAgICAgICAgICAgbWFwW3MubmFtZV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0ucHVzaChzKTtcblxuICAgICAgICAgICAgaWYgKHMudGFiVHJpZ2dlciAmJiAhcy50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzLmd1YXJkICYmIC9eXFx3Ly50ZXN0KHMudGFiVHJpZ2dlcikpXG4gICAgICAgICAgICAgICAgICAgIHMuZ3VhcmQgPSBcIlxcXFxiXCI7XG4gICAgICAgICAgICAgICAgcy50cmlnZ2VyID0gZXNjYXBlUmVnRXhwKHMudGFiVHJpZ2dlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHMuc3RhcnRSZSA9IGd1YXJkZWRSZWdleHAocy50cmlnZ2VyLCBzLmd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMudHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLnRyaWdnZXIsIFwiXCIpO1xuXG4gICAgICAgICAgICBzLmVuZFJlID0gZ3VhcmRlZFJlZ2V4cChzLmVuZFRyaWdnZXIsIHMuZW5kR3VhcmQsIHRydWUpO1xuICAgICAgICAgICAgcy5lbmRUcmlnZ2VyUmUgPSBuZXcgUmVnRXhwKHMuZW5kVHJpZ2dlciwgXCJcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIGFkZFNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2goYWRkU25pcHBldCk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwicmVnaXN0ZXJTbmlwcGV0c1wiLCB7IHNjb3BlOiBzY29wZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVucmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlPykge1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXROYW1lTWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcblxuICAgICAgICBmdW5jdGlvbiByZW1vdmVTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIHZhciBuYW1lTWFwID0gc25pcHBldE5hbWVNYXBbcy5zY29wZSB8fCBzY29wZV07XG4gICAgICAgICAgICBpZiAobmFtZU1hcCAmJiBuYW1lTWFwW3MubmFtZV0pIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgbmFtZU1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgICAgIHZhciBpID0gbWFwICYmIG1hcC5pbmRleE9mKHMpO1xuICAgICAgICAgICAgICAgIGlmIChpID49IDApXG4gICAgICAgICAgICAgICAgICAgIG1hcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICByZW1vdmVTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKHJlbW92ZVNuaXBwZXQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBwYXJzZVNuaXBwZXRGaWxlKHN0cikge1xuICAgICAgICBzdHIgPSBzdHIucmVwbGFjZSgvXFxyL2csIFwiXCIpO1xuICAgICAgICB2YXIgbGlzdCA9IFtdO1xuICAgICAgICB2YXIgc25pcHBldDogYW55ID0ge307XG4gICAgICAgIHZhciByZSA9IC9eIy4qfF4oe1tcXHNcXFNdKn0pXFxzKiR8XihcXFMrKSAoLiopJHxeKCg/OlxcbipcXHQuKikrKS9nbTtcbiAgICAgICAgdmFyIG07XG4gICAgICAgIHdoaWxlIChtID0gcmUuZXhlYyhzdHIpKSB7XG4gICAgICAgICAgICBpZiAobVsxXSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQgPSBKU09OLnBhcnNlKG1bMV0pO1xuICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9IGlmIChtWzRdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldC5jb250ZW50ID0gbVs0XS5yZXBsYWNlKC9eXFx0L2dtLCBcIlwiKTtcbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHt9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gbVsyXSwgdmFsID0gbVszXTtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09IFwicmVnZXhcIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZ3VhcmRSZSA9IC9cXC8oKD86W15cXC9cXFxcXXxcXFxcLikqKXwkL2c7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZ3VhcmQgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50cmlnZ2VyID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZW5kVHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZEd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXkgPT0gXCJzbmlwcGV0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50YWJUcmlnZ2VyID0gdmFsLm1hdGNoKC9eXFxTKi8pWzBdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNuaXBwZXQubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNuaXBwZXQubmFtZSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0W2tleV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBsaXN0O1xuICAgIH1cbiAgICBwcml2YXRlIGdldFNuaXBwZXRCeU5hbWUobmFtZSwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc25pcHBldDtcbiAgICAgICAgdGhpcy5nZXRBY3RpdmVTY29wZXMoZWRpdG9yKS5zb21lKGZ1bmN0aW9uKHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgc25pcHBldHMgPSBzbmlwcGV0TWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzbmlwcGV0cylcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0gc25pcHBldHNbbmFtZV07XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXQ7XG4gICAgfVxufVxuXG5jbGFzcyBUYWJzdG9wTWFuYWdlciB7XG4gICAgcHJpdmF0ZSBpbmRleDtcbiAgICBwcml2YXRlIHJhbmdlcztcbiAgICBwcml2YXRlIHRhYnN0b3BzO1xuICAgIHByaXZhdGUgJG9wZW5UYWJzdG9wcztcbiAgICBwcml2YXRlIHNlbGVjdGVkVGFic3RvcDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUga2V5Ym9hcmRIYW5kbGVyID0gbmV3IEhhc2hIYW5kbGVyKCk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZXNzaW9uO1xuICAgIHByaXZhdGUgJG9uQWZ0ZXJFeGVjO1xuICAgIHByaXZhdGUgJGluQ2hhbmdlO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gdGhpcztcbiAgICAgICAgdGhpcy4kb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uID0gZGVsYXllZENhbGwodGhpcy5vbkNoYW5nZVNlbGVjdGlvbi5iaW5kKHRoaXMpKS5zY2hlZHVsZTtcbiAgICAgICAgdGhpcy4kb25DaGFuZ2VTZXNzaW9uID0gdGhpcy5vbkNoYW5nZVNlc3Npb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy4kb25BZnRlckV4ZWMgPSB0aGlzLm9uQWZ0ZXJFeGVjLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoKGVkaXRvcik7XG4gICAgICAgIHRoaXMua2V5Ym9hcmRIYW5kbGVyLmJpbmRLZXlzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNuaXBwZXRNYW5hZ2VyICYmIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIoZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiU2hpZnQtVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KC0xKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiRXNjXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiUmV0dXJuXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9lZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBhdHRhY2goZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBbXTtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLnRhYnN0b3BzLmZvckVhY2godGhpcy5yZW1vdmVUYWJzdG9wTWFya2VycywgdGhpcyk7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5yZW1vdmVMaXN0ZW5lcihcImFmdGVyRXhlY1wiLCB0aGlzLiRvbkFmdGVyRXhlYyk7XG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcucmVtb3ZlS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5lZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGUpIHtcbiAgICAgICAgdmFyIGNoYW5nZVJhbmdlID0gZS5kYXRhLnJhbmdlO1xuICAgICAgICB2YXIgaXNSZW1vdmUgPSBlLmRhdGEuYWN0aW9uWzBdID09IFwiclwiO1xuICAgICAgICB2YXIgc3RhcnQgPSBjaGFuZ2VSYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGNoYW5nZVJhbmdlLmVuZDtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZW5kLnJvdztcbiAgICAgICAgdmFyIGxpbmVEaWYgPSBlbmRSb3cgLSBzdGFydFJvdztcbiAgICAgICAgdmFyIGNvbERpZmYgPSBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uO1xuXG4gICAgICAgIGlmIChpc1JlbW92ZSkge1xuICAgICAgICAgICAgbGluZURpZiA9IC1saW5lRGlmO1xuICAgICAgICAgICAgY29sRGlmZiA9IC1jb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy4kaW5DaGFuZ2UgJiYgaXNSZW1vdmUpIHtcbiAgICAgICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICAgICAgdmFyIGNoYW5nZWRPdXRzaWRlID0gdHMgJiYgIXRzLnNvbWUoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlUG9pbnRzKHIuc3RhcnQsIHN0YXJ0KSA8PSAwICYmIGNvbXBhcmVQb2ludHMoci5lbmQsIGVuZCkgPj0gMDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNoYW5nZWRPdXRzaWRlKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRldGFjaCgpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLnJhbmdlcztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciByID0gcmFuZ2VzW2ldO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA8IHN0YXJ0LnJvdylcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGlzUmVtb3ZlICYmIGNvbXBhcmVQb2ludHMoc3RhcnQsIHIuc3RhcnQpIDwgMCAmJiBjb21wYXJlUG9pbnRzKGVuZCwgci5lbmQpID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoci5zdGFydC5yb3cgPT0gc3RhcnRSb3cgJiYgci5zdGFydC5jb2x1bW4gPiBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgci5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPT0gc3RhcnRSb3cgJiYgci5lbmQuY29sdW1uID49IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLnN0YXJ0LnJvdyArPSBsaW5lRGlmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLmVuZC5yb3cgKz0gbGluZURpZjtcblxuICAgICAgICAgICAgaWYgKGNvbXBhcmVQb2ludHMoci5zdGFydCwgci5lbmQpID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVJhbmdlKHIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVMaW5rZWRGaWVsZHMoKSB7XG4gICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICBpZiAoIXRzIHx8ICF0cy5oYXNMaW5rZWRSYW5nZXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gdHJ1ZTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdHNbaV07XG4gICAgICAgICAgICBpZiAoIXJhbmdlLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBmbXQgPSBzbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCh0ZXh0LCByYW5nZS5vcmlnaW5hbCk7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UocmFuZ2UsIGZtdCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQWZ0ZXJFeGVjKGUpIHtcbiAgICAgICAgaWYgKGUuY29tbWFuZCAmJiAhZS5jb21tYW5kLnJlYWRPbmx5KVxuICAgICAgICAgICAgdGhpcy51cGRhdGVMaW5rZWRGaWVsZHMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5sZWFkO1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmFuY2hvcjtcbiAgICAgICAgdmFyIGlzRW1wdHkgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpO1xuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYW5nZXNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zTGVhZCA9IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG4gICAgICAgICAgICB2YXIgY29udGFpbnNBbmNob3IgPSBpc0VtcHR5IHx8IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5zTGVhZCAmJiBjb250YWluc0FuY2hvcilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2Vzc2lvbigpIHtcbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRhYk5leHQoZGlyKSB7XG4gICAgICAgIHZhciBtYXggPSB0aGlzLnRhYnN0b3BzLmxlbmd0aDtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5pbmRleCArIChkaXIgfHwgMSk7XG4gICAgICAgIGluZGV4ID0gTWF0aC5taW4oTWF0aC5tYXgoaW5kZXgsIDEpLCBtYXgpO1xuICAgICAgICBpZiAoaW5kZXggPT0gbWF4KVxuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlbGVjdFRhYnN0b3AoaW5kZXgpO1xuICAgICAgICBpZiAoaW5kZXggPT09IDApXG4gICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0VGFic3RvcChpbmRleCkge1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAodHMpXG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKHRzKTtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IHRzO1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzZWwgPSB0aGlzLmVkaXRvclsnbXVsdGlTZWxlY3QnXTtcbiAgICAgICAgICAgIHNlbC50b1NpbmdsZVJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkLmNsb25lKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICh0cy5oYXNMaW5rZWRSYW5nZXMgJiYgdHNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2UodHNbaV0uY2xvbmUoKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0b2RvIGludmVzdGlnYXRlIHdoeSBpcyB0aGlzIG5lZWRlZFxuICAgICAgICAgICAgaWYgKHNlbC5yYW5nZXNbMF0pXG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHNlbC5yYW5nZXNbMF0uY2xvbmUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRUYWJzdG9wcyA9IGZ1bmN0aW9uKHRhYnN0b3BzLCBzdGFydCwgZW5kLCB1bnVzZWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRvcGVuVGFic3RvcHMpXG4gICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBbXTtcbiAgICAgICAgLy8gYWRkIGZpbmFsIHRhYnN0b3AgaWYgbWlzc2luZ1xuICAgICAgICBpZiAoIXRhYnN0b3BzWzBdKSB7XG4gICAgICAgICAgICB2YXIgcCA9IFJhbmdlLmZyb21Qb2ludHMoZW5kLCBlbmQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0gPSBbcF07XG4gICAgICAgICAgICB0YWJzdG9wc1swXS5pbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHZhciBhcmcgPSBbaSArIDEsIDBdO1xuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gfHwgdHM7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHRzW2ldO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhwLnN0YXJ0LCBwLmVuZCB8fCBwLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2Uuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2UuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgcmFuZ2Uub3JpZ2luYWwgPSBwO1xuICAgICAgICAgICAgICAgIHJhbmdlLnRhYnN0b3AgPSBkZXN0O1xuICAgICAgICAgICAgICAgIHJhbmdlcy5wdXNoKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVzdCAhPSB0cylcbiAgICAgICAgICAgICAgICAgICAgZGVzdC51bnNoaWZ0KHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlc3RbaV0gPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocC5mbXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UubGlua2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QuZmlyc3ROb25MaW5rZWQgPSByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGRlc3QgPT09IHRzKSB7XG4gICAgICAgICAgICAgICAgYXJnLnB1c2goZGVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSA9IGRlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKGRlc3QpO1xuICAgICAgICB9LCB0aGlzKTtcblxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gYWRkaW5nIG5ldyBzbmlwcGV0IGluc2lkZSBleGlzdGluZyBvbmUsIG1ha2Ugc3VyZSAwIHRhYnN0b3AgaXMgYXQgdGhlIGVuZFxuICAgICAgICAgICAgaWYgKHRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGFyZy5zcGxpY2UoMiwgMSlbMF0pO1xuICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UuYXBwbHkodGhpcy50YWJzdG9wcywgYXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UvKjogcm0uUmFuZ2UqLykge1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5tYXJrZXJJZClcbiAgICAgICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zbmlwcGV0LW1hcmtlclwiLCBcInRleHRcIik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVSYW5nZSA9IGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHZhciBpID0gcmFuZ2UudGFic3RvcC5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgcmFuZ2UudGFic3RvcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGkgPSB0aGlzLnJhbmdlcy5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgdGhpcy5yYW5nZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmVkaXRvci5zZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgIGlmICghcmFuZ2UudGFic3RvcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGkgPSB0aGlzLnRhYnN0b3BzLmluZGV4T2YocmFuZ2UudGFic3RvcCk7XG4gICAgICAgICAgICBpZiAoaSAhPSAtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGlmICghdGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbnZhciBjaGFuZ2VUcmFja2VyOiBhbnkgPSB7fTtcbmNoYW5nZVRyYWNrZXIub25DaGFuZ2UgPSBBbmNob3IucHJvdG90eXBlLm9uQ2hhbmdlO1xuY2hhbmdlVHJhY2tlci5zZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKHJvdywgY29sdW1uKSB7XG4gICAgdGhpcy5wb3Mucm93ID0gcm93O1xuICAgIHRoaXMucG9zLmNvbHVtbiA9IGNvbHVtbjtcbn07XG5jaGFuZ2VUcmFja2VyLnVwZGF0ZSA9IGZ1bmN0aW9uKHBvcywgZGVsdGEsICRpbnNlcnRSaWdodCkge1xuICAgIHRoaXMuJGluc2VydFJpZ2h0ID0gJGluc2VydFJpZ2h0O1xuICAgIHRoaXMucG9zID0gcG9zO1xuICAgIHRoaXMub25DaGFuZ2UoZGVsdGEpO1xufTtcblxudmFyIG1vdmVQb2ludCA9IGZ1bmN0aW9uKHBvaW50LCBkaWZmKSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSAwKVxuICAgICAgICBwb2ludC5jb2x1bW4gKz0gZGlmZi5jb2x1bW47XG4gICAgcG9pbnQucm93ICs9IGRpZmYucm93O1xufTtcblxudmFyIG1vdmVSZWxhdGl2ZSA9IGZ1bmN0aW9uKHBvaW50LCBzdGFydCkge1xuICAgIGlmIChwb2ludC5yb3cgPT0gc3RhcnQucm93KVxuICAgICAgICBwb2ludC5jb2x1bW4gLT0gc3RhcnQuY29sdW1uO1xuICAgIHBvaW50LnJvdyAtPSBzdGFydC5yb3c7XG59O1xuXG5cbmltcG9ydENzc1N0cmluZyhcIlxcXG4uYWNlX3NuaXBwZXQtbWFya2VyIHtcXFxuICAgIC1tb3otYm94LXNpemluZzogYm9yZGVyLWJveDtcXFxuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBiYWNrZ3JvdW5kOiByZ2JhKDE5NCwgMTkzLCAyMDgsIDAuMDkpO1xcXG4gICAgYm9yZGVyOiAxcHggZG90dGVkIHJnYmEoMjExLCAyMDgsIDIzNSwgMC42Mik7XFxcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XFxcbn1cIik7XG5cbmV4cG9ydCB2YXIgc25pcHBldE1hbmFnZXIgPSBuZXcgU25pcHBldE1hbmFnZXIoKTtcblxuKGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5zZXJ0U25pcHBldCA9IGZ1bmN0aW9uKGNvbnRlbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXQodGhpcywgY29udGVudCwgb3B0aW9ucyk7XG4gICAgfTtcbiAgICB0aGlzLmV4cGFuZFNuaXBwZXQgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKHRoaXMsIG9wdGlvbnMpO1xuICAgIH07XG59KS5jYWxsKEVkaXRvci5wcm90b3R5cGUpO1xuIl19