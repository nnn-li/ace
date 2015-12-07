import { importCssString } from "./lib/dom";
import { EventEmitterClass } from "./lib/event_emitter";
import { delayedCall, escapeRegExp } from "./lib/lang";
import { comparePoints, Range } from "./range";
import { Anchor } from "./anchor";
import { HashHandler } from "./keyboard/hash_handler";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiT0E4Qk8sRUFBQyxlQUFlLEVBQUMsTUFBTSxXQUFXO09BQ2xDLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxxQkFBcUI7T0FDOUMsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLGFBQWEsRUFBRSxLQUFLLEVBQUMsTUFBTSxTQUFTO09BQ3JDLEVBQUMsTUFBTSxFQUFDLE1BQU0sVUFBVTtPQUN4QixFQUFDLFdBQVcsRUFBQyxNQUFNLHlCQUF5QjtPQUM1QyxTQUFTLE1BQU0sYUFBYTtPQUM1QixNQUFNLE1BQU0sVUFBVTtBQUU3QixJQUFJLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQztBQUV2QyxnQkFBZ0IsRUFBRTtJQUNkQSxNQUFNQSxDQUFDQSxXQUFXQSxHQUFHQSxFQUFFQSxHQUFHQSxVQUFVQSxDQUFDQTtBQUN6Q0EsQ0FBQ0E7QUFDRCxzQkFBc0IsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0lBQy9CQyxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0Es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Q0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ3RDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVPWCxTQUFTQSxDQUFDQSxNQUFjQTtRQUM1QlksSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDM0NBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxNQUFNQSxJQUFJQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUd0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3REQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtZQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM1QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FB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Q0FBQ0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbkJBLElBQUlBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUN2RUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtRQUNuRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDcEVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDbkVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BDQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFFT0gsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDZEksSUFBSUEsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElB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QVcsY0FBYyxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7QUFFakQsQ0FBQztJQUNHLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBUyxPQUFPLEVBQUUsT0FBTztRQUMxQyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hFLENBQUMsQ0FBQztJQUNGLElBQUksQ0FBQyxhQUFhLEdBQUcsVUFBUyxPQUFPO1FBQ2pDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7aW1wb3J0Q3NzU3RyaW5nfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge0V2ZW50RW1pdHRlckNsYXNzfSBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgZXNjYXBlUmVnRXhwfSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtjb21wYXJlUG9pbnRzLCBSYW5nZX0gZnJvbSBcIi4vcmFuZ2VcIjtcbmltcG9ydCB7QW5jaG9yfSBmcm9tIFwiLi9hbmNob3JcIjtcbmltcG9ydCB7SGFzaEhhbmRsZXJ9IGZyb20gXCIuL2tleWJvYXJkL2hhc2hfaGFuZGxlclwiO1xuaW1wb3J0IFRva2VuaXplciBmcm9tIFwiLi9Ub2tlbml6ZXJcIjtcbmltcG9ydCBFZGl0b3IgZnJvbSAnLi9FZGl0b3InO1xuXG52YXIgVEFCU1RPUF9NQU5BR0VSID0gJ3RhYnN0b3BNYW5hZ2VyJztcblxuZnVuY3Rpb24gZXNjYXBlKGNoKSB7XG4gICAgcmV0dXJuIFwiKD86W15cXFxcXFxcXFwiICsgY2ggKyBcIl18XFxcXFxcXFwuKVwiO1xufVxuZnVuY3Rpb24gVGFic3RvcFRva2VuKHN0ciwgXywgc3RhY2spOiBhbnlbXSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigxKTtcbiAgICBpZiAoL15cXGQrJC8udGVzdChzdHIpICYmICFzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICByZXR1cm4gW3sgdGFic3RvcElkOiBwYXJzZUludChzdHIsIDEwKSB9XTtcbiAgICB9XG4gICAgcmV0dXJuIFt7IHRleHQ6IHN0ciB9XTtcbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRNYW5hZ2VyIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyBzbmlwcGV0TWFwID0ge307XG4gICAgcHJpdmF0ZSBzbmlwcGV0TmFtZU1hcCA9IHt9O1xuICAgIHByaXZhdGUgdmFyaWFibGVzID0ge307XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyAkdG9rZW5pemVyID0gbmV3IFRva2VuaXplcih7XG4gICAgICAgIHN0YXJ0OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC86LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjayk6IGFueSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggJiYgc3RhY2tbMF0uZXhwZWN0SWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5lbHNlQnJhbmNoID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCI6XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcXFwuLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIn1cIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFwiYCRcXFxcXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJuXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNoID09IFwidFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChcInVsVUxFXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB7IGNoYW5nZUNhc2U6IGNoLCBsb2NhbDogY2ggPiBcImFcIiB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFt2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC99LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrLmxlbmd0aCA/IHN0YWNrLnNoaWZ0KCkgOiB2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCQoPzpcXGQrfFxcdyspLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBUYWJzdG9wVG9rZW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCRcXHtbXFxkQS1aX2Etel0rLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbihzdHIsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdCA9IFRhYnN0b3BUb2tlbihzdHIuc3Vic3RyKDEpLCBzdGF0ZSwgc3RhY2spO1xuICAgICAgICAgICAgICAgICAgICBzdGFjay51bnNoaWZ0KHRbMF0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInNuaXBwZXRWYXJcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcbi8sXG4gICAgICAgICAgICAgICAgdG9rZW46IFwibmV3bGluZVwiLFxuICAgICAgICAgICAgICAgIG1lcmdlOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBzbmlwcGV0VmFyOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHxcIiArIGVzY2FwZShcIlxcXFx8XCIpICsgXCIqXFxcXHxcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY2hvaWNlcyA9IHZhbC5zbGljZSgxLCAtMSkuc3BsaXQoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvKD86KFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKikvKShcXFxcdyopOj9cIixcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdHMgPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10U3RyaW5nID0gdmFsO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHRoaXMuc3BsaXRSZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHRzLmd1YXJkID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXQgPSB2YWxbMl07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZsYWcgPSB2YWxbM107XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJgXCIgKyBlc2NhcGUoXCJgXCIpICsgXCIqYFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jb2RlID0gdmFsLnNwbGljZSgxLCAtMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcP1wiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2tbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyByZWdleDogXCIoW146fVxcXFxcXFxcXXxcXFxcXFxcXC4pKjo/XCIsIHRva2VuOiBcIlwiLCBuZXh0OiBcInN0YXJ0XCIgfVxuICAgICAgICBdLFxuICAgICAgICBmb3JtYXRTdHJpbmc6IFtcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispL1wiLCB0b2tlbjogXCJyZWdleFwiIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLmluRm9ybWF0U3RyaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgcHJpdmF0ZSBnZXRUb2tlbml6ZXIoKSB7XG4gICAgICAgIFNuaXBwZXRNYW5hZ2VyLnByb3RvdHlwZS5nZXRUb2tlbml6ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRva2VuaXplVG1TbmlwcGV0KHN0ciwgc3RhcnRTdGF0ZT8pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VG9rZW5pemVyKCkuZ2V0TGluZVRva2VucyhzdHIsIHN0YXJ0U3RhdGUpLnRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgcmV0dXJuIHgudmFsdWUgfHwgeDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgbmFtZSkge1xuICAgICAgICBpZiAoL15bQS1aXVxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICB2YXIgaSA9IG5hbWUuc3Vic3RyKDEpO1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1tuYW1lWzBdICsgXCJfX1wiXSB8fCB7fSlbaV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKC9eXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbJ19fJ10gfHwge30pW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoL15UTV8vLCBcIlwiKTtcblxuICAgICAgICBpZiAoIWVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHMgPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9XT1JEXCI6XG4gICAgICAgICAgICAgICAgdmFyIHIgPSBzLmdldFdvcmRSYW5nZSgpO1xuICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVElPTlwiOlxuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVEVEX1RFWFRcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUZXh0UmFuZ2Uocik7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9MSU5FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICAgICAgY2FzZSBcIlBSRVZfTElORVwiOiAvLyBub3QgcG9zc2libGUgaW4gdGV4dG1hdGVcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyAtIDEpO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfSU5ERVhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkuY29sdW1uO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfTlVNQkVSXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyArIDE7XG4gICAgICAgICAgICBjYXNlIFwiU09GVF9UQUJTXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VXNlU29mdFRhYnMoKSA/IFwiWUVTXCIgOiBcIk5PXCI7XG4gICAgICAgICAgICBjYXNlIFwiVEFCX1NJWkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IGJ1dCBjYW4ndCBmaWxsIDooXG4gICAgICAgICAgICBjYXNlIFwiRklMRU5BTUVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFUEFUSFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgY2FzZSBcIkZVTExOQU1FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiQWNlXCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgdmFyTmFtZSkge1xuICAgICAgICBpZiAodGhpcy52YXJpYWJsZXMuaGFzT3duUHJvcGVydHkodmFyTmFtZSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZXNbdmFyTmFtZV0oZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHN0cmluZyBmb3JtYXR0ZWQgYWNjb3JkaW5nIHRvIGh0dHA6Ly9tYW51YWwubWFjcm9tYXRlcy5jb20vZW4vcmVndWxhcl9leHByZXNzaW9ucyNyZXBsYWNlbWVudF9zdHJpbmdfc3ludGF4X2Zvcm1hdF9zdHJpbmdzXG4gICAgcHVibGljIHRtU3RyRm9ybWF0KHN0ciwgY2gsIGVkaXRvcj8pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBjaC5mbGFnIHx8IFwiXCI7XG4gICAgICAgIHZhciByZSA9IGNoLmd1YXJkO1xuICAgICAgICByZSA9IG5ldyBSZWdFeHAocmUsIGZsYWcucmVwbGFjZSgvW15naV0vLCBcIlwiKSk7XG4gICAgICAgIHZhciBmbXRUb2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KGNoLmZtdCwgXCJmb3JtYXRTdHJpbmdcIik7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBzdHIucmVwbGFjZShyZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi52YXJpYWJsZXNbJ19fJ10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICB2YXIgZm10UGFydHMgPSBfc2VsZi5yZXNvbHZlVmFyaWFibGVzKGZtdFRva2VucywgZWRpdG9yKTtcbiAgICAgICAgICAgIHZhciBnQ2hhbmdlQ2FzZSA9IFwiRVwiO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbXRQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGZtdFBhcnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlICYmIGNoLmxvY2FsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZtdFBhcnRzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0ICYmIHR5cGVvZiBuZXh0ID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSA9PSBcInVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpICsgMV0gPSBuZXh0LnN1YnN0cigxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnQ2hhbmdlQ2FzZSA9IGNoLmNoYW5nZUNhc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiVVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiTFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm10UGFydHMuam9pbihcIlwiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVWYXJpYWJsZXMoc25pcHBldCwgZWRpdG9yKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmlwcGV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzbmlwcGV0W2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2ggIT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5za2lwKSB7XG4gICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5wcm9jZXNzZWQgPCBpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCBjaC50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgY2guZm10U3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG1TdHJGb3JtYXQodmFsdWUsIGNoKTtcbiAgICAgICAgICAgICAgICBjaC5wcm9jZXNzZWQgPSBpO1xuICAgICAgICAgICAgICAgIGlmIChjaC5leHBlY3RJZiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaC5za2lwID0gY2guZWxzZUJyYW5jaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50YWJzdG9wSWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdvdG9OZXh0KGNoKSB7XG4gICAgICAgICAgICB2YXIgaTEgPSBzbmlwcGV0LmluZGV4T2YoY2gsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSAhPSAtMSlcbiAgICAgICAgICAgICAgICBpID0gaTE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0KSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGxpbmUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgdGFiU3RyaW5nID0gZWRpdG9yLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBsaW5lLm1hdGNoKC9eXFxzKi8pWzBdO1xuXG4gICAgICAgIGlmIChjdXJzb3IuY29sdW1uIDwgaW5kZW50U3RyaW5nLmxlbmd0aClcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IGluZGVudFN0cmluZy5zbGljZSgwLCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgdG9rZW5zID0gdGhpcy50b2tlbml6ZVRtU25pcHBldChzbmlwcGV0VGV4dCk7XG4gICAgICAgIHRva2VucyA9IHRoaXMucmVzb2x2ZVZhcmlhYmxlcyh0b2tlbnMsIGVkaXRvcik7XG4gICAgICAgIC8vIGluZGVudFxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIGlmICh4ID09IFwiXFxuXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHggKyBpbmRlbnRTdHJpbmc7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHggPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICByZXR1cm4geC5yZXBsYWNlKC9cXHQvZywgdGFiU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdmFyIHRhYnN0b3BzID0gW107XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHAsIGkpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHZhciBpZCA9IHAudGFic3RvcElkO1xuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgaWYgKCF0cykge1xuICAgICAgICAgICAgICAgIHRzID0gdGFic3RvcHNbaWRdID0gW107XG4gICAgICAgICAgICAgICAgdHMuaW5kZXggPSBpZDtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IFwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHMuaW5kZXhPZihwKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdHMucHVzaChwKTtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSA9PT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnMuc2xpY2UoaSArIDEsIGkxKTtcbiAgICAgICAgICAgIHZhciBpc05lc3RlZCA9IHZhbHVlLnNvbWUoZnVuY3Rpb24odCkgeyByZXR1cm4gdHlwZW9mIHQgPT09IFwib2JqZWN0XCIgfSk7XG4gICAgICAgICAgICBpZiAoaXNOZXN0ZWQgJiYgIXRzLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUubGVuZ3RoICYmICghdHMudmFsdWUgfHwgdHlwZW9mIHRzLnZhbHVlICE9PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gdmFsdWUuam9pbihcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZXhwYW5kIHRhYnN0b3AgdmFsdWVzXG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMpIHsgdHMubGVuZ3RoID0gMCB9KTtcbiAgICAgICAgdmFyIGV4cGFuZGluZyA9IHt9O1xuICAgICAgICBmdW5jdGlvbiBjb3B5VmFsdWUodmFsKSB7XG4gICAgICAgICAgICB2YXIgY29weSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHZhbFtpXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHAgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwYW5kaW5nW3AudGFic3RvcElkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaiA9IHZhbC5sYXN0SW5kZXhPZihwLCBpIC0gMSk7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBjb3B5W2pdIHx8IHsgdGFic3RvcElkOiBwLnRhYnN0b3BJZCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3B5W2ldID0gcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb3B5O1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgcCA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgaTEgPSB0b2tlbnMuaW5kZXhPZihwLCBpICsgMSk7XG4gICAgICAgICAgICBpZiAoZXhwYW5kaW5nW2lkXSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHJlYWNoZWQgY2xvc2luZyBicmFja2V0IGNsZWFyIGV4cGFuZGluZyBzdGF0ZVxuICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdID09PSBwKVxuICAgICAgICAgICAgICAgICAgICBleHBhbmRpbmdbaWRdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UganVzdCBpZ25vcmUgcmVjdXJzaXZlIHRhYnN0b3BcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgdmFyIGFyZyA9IHR5cGVvZiB0cy52YWx1ZSA9PSBcInN0cmluZ1wiID8gW3RzLnZhbHVlXSA6IGNvcHlWYWx1ZSh0cy52YWx1ZSk7XG4gICAgICAgICAgICBhcmcudW5zaGlmdChpICsgMSwgTWF0aC5tYXgoMCwgaTEgLSBpKSk7XG4gICAgICAgICAgICBhcmcucHVzaChwKTtcbiAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBwO1xuICAgICAgICAgICAgdG9rZW5zLnNwbGljZS5hcHBseSh0b2tlbnMsIGFyZyk7XG5cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApID09PSAtMSlcbiAgICAgICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCB0byBwbGFpbiB0ZXh0XG4gICAgICAgIHZhciByb3cgPSAwLCBjb2x1bW4gPSAwO1xuICAgICAgICB2YXIgdGV4dCA9IFwiXCI7XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHQpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGlmICh0WzBdID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiA9IHQubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiArPSB0Lmxlbmd0aDtcbiAgICAgICAgICAgICAgICB0ZXh0ICs9IHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghdC5zdGFydClcbiAgICAgICAgICAgICAgICAgICAgdC5zdGFydCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0LmVuZCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIGVuZCA9IGVkaXRvci5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuXG4gICAgICAgIHZhciB0c01hbmFnZXIgPSBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA/IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdIDogbmV3IFRhYnN0b3BNYW5hZ2VyKGVkaXRvcik7XG4gICAgICAgIHZhciBzZWxlY3Rpb25JZCA9IGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlICYmIGVkaXRvci5zZWxlY3Rpb25bJ2luZGV4J107XG4gICAgICAgIHRzTWFuYWdlci5hZGRUYWJzdG9wcyh0YWJzdG9wcywgcmFuZ2Uuc3RhcnQsIGVuZCwgc2VsZWN0aW9uSWQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRTbmlwcGV0KGVkaXRvcjogRWRpdG9yLCBzbmlwcGV0VGV4dCwgdW51c2VkPykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmIChlZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSlcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG5cbiAgICAgICAgZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG4gICAgICAgIH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuXG4gICAgICAgIGlmIChlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSkge1xuICAgICAgICAgICAgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0U2NvcGUoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gZWRpdG9yLnNlc3Npb24uJG1vZGUuJGlkIHx8IFwiXCI7XG4gICAgICAgIHNjb3BlID0gc2NvcGUuc3BsaXQoXCIvXCIpLnBvcCgpO1xuICAgICAgICBpZiAoc2NvcGUgPT09IFwiaHRtbFwiIHx8IHNjb3BlID09PSBcInBocFwiKSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogQ291cGxpbmcgdG8gUEhQP1xuICAgICAgICAgICAgLy8gUEhQIGlzIGFjdHVhbGx5IEhUTUxcbiAgICAgICAgICAgIGlmIChzY29wZSA9PT0gXCJwaHBcIiAmJiAhZWRpdG9yLnNlc3Npb24uJG1vZGVbJ2lubGluZVBocCddKVxuICAgICAgICAgICAgICAgIHNjb3BlID0gXCJodG1sXCI7XG4gICAgICAgICAgICB2YXIgYyA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gZWRpdG9yLnNlc3Npb24uZ2V0U3RhdGUoYy5yb3cpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIHN0YXRlID0gc3RhdGVbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN1YnN0cmluZygwLCAzKSA9PSBcImpzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiamF2YXNjcmlwdFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcImNzcy1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcImNzc1wiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcInBocC1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcInBocFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBY3RpdmVTY29wZXMoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gdGhpcy4kZ2V0U2NvcGUoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNjb3BlcyA9IFtzY29wZV07XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICBpZiAoc25pcHBldE1hcFtzY29wZV0gJiYgc25pcHBldE1hcFtzY29wZV0uaW5jbHVkZVNjb3Blcykge1xuICAgICAgICAgICAgc2NvcGVzLnB1c2guYXBwbHkoc2NvcGVzLCBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKTtcbiAgICAgICAgfVxuICAgICAgICBzY29wZXMucHVzaChcIl9cIik7XG4gICAgICAgIHJldHVybiBzY29wZXM7XG4gICAgfVxuXG4gICAgcHVibGljIGV4cGFuZFdpdGhUYWIoZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnM/KTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3VsdDogYm9vbGVhbiA9IGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkgeyByZXR1cm4gc2VsZi5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgb3B0aW9ucyk7IH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuICAgICAgICBpZiAocmVzdWx0ICYmIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgbGluZSA9IGVkaXRvci5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBiZWZvcmUgPSBsaW5lLnN1YnN0cmluZygwLCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIGFmdGVyID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0O1xuICAgICAgICB0aGlzLmdldEFjdGl2ZVNjb3BlcyhlZGl0b3IpLnNvbWUoZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzbmlwcGV0cyA9IHNuaXBwZXRNYXBbc2NvcGVdO1xuICAgICAgICAgICAgaWYgKHNuaXBwZXRzKVxuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB0aGlzLmZpbmRNYXRjaGluZ1NuaXBwZXQoc25pcHBldHMsIGJlZm9yZSwgYWZ0ZXIpO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmICghc25pcHBldClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5kcnlSdW4pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LFxuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiAtIHNuaXBwZXQucmVwbGFjZUJlZm9yZS5sZW5ndGgsXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uICsgc25pcHBldC5yZXBsYWNlQWZ0ZXIubGVuZ3RoXG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gc25pcHBldC5tYXRjaEJlZm9yZTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gc25pcHBldC5tYXRjaEFmdGVyO1xuICAgICAgICB0aGlzLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0LmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMudmFyaWFibGVzWydNX18nXSA9IHRoaXMudmFyaWFibGVzWydUX18nXSA9IG51bGw7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0TGlzdCwgYmVmb3JlLCBhZnRlcikge1xuICAgICAgICBmb3IgKHZhciBpID0gc25pcHBldExpc3QubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICB2YXIgcyA9IHNuaXBwZXRMaXN0W2ldO1xuICAgICAgICAgICAgaWYgKHMuc3RhcnRSZSAmJiAhcy5zdGFydFJlLnRlc3QoYmVmb3JlKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChzLmVuZFJlICYmICFzLmVuZFJlLnRlc3QoYWZ0ZXIpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCFzLnN0YXJ0UmUgJiYgIXMuZW5kUmUpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHMubWF0Y2hCZWZvcmUgPSBzLnN0YXJ0UmUgPyBzLnN0YXJ0UmUuZXhlYyhiZWZvcmUpIDogW1wiXCJdO1xuICAgICAgICAgICAgcy5tYXRjaEFmdGVyID0gcy5lbmRSZSA/IHMuZW5kUmUuZXhlYyhhZnRlcikgOiBbXCJcIl07XG4gICAgICAgICAgICBzLnJlcGxhY2VCZWZvcmUgPSBzLnRyaWdnZXJSZSA/IHMudHJpZ2dlclJlLmV4ZWMoYmVmb3JlKVswXSA6IFwiXCI7XG4gICAgICAgICAgICBzLnJlcGxhY2VBZnRlciA9IHMuZW5kVHJpZ2dlclJlID8gcy5lbmRUcmlnZ2VyUmUuZXhlYyhhZnRlcilbMF0gOiBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgcmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIHdyYXBSZWdleHAoc3JjKSB7XG4gICAgICAgICAgICBpZiAoc3JjICYmICEvXlxcXj9cXCguKlxcKVxcJD8kfF5cXFxcYiQvLnRlc3Qoc3JjKSlcbiAgICAgICAgICAgICAgICBzcmMgPSBcIig/OlwiICsgc3JjICsgXCIpXCI7XG5cbiAgICAgICAgICAgIHJldHVybiBzcmMgfHwgXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBndWFyZGVkUmVnZXhwKHJlLCBndWFyZCwgb3BlbmluZykge1xuICAgICAgICAgICAgcmUgPSB3cmFwUmVnZXhwKHJlKTtcbiAgICAgICAgICAgIGd1YXJkID0gd3JhcFJlZ2V4cChndWFyZCk7XG4gICAgICAgICAgICBpZiAob3BlbmluZykge1xuICAgICAgICAgICAgICAgIHJlID0gZ3VhcmQgKyByZTtcbiAgICAgICAgICAgICAgICBpZiAocmUgJiYgcmVbcmUubGVuZ3RoIC0gMV0gIT0gXCIkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJlID0gcmUgKyBcIiRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmUgPSByZSArIGd1YXJkO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVswXSAhPSBcIl5cIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSBcIl5cIiArIHJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAocmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU25pcHBldChzKSB7XG4gICAgICAgICAgICBpZiAoIXMuc2NvcGUpXG4gICAgICAgICAgICAgICAgcy5zY29wZSA9IHNjb3BlIHx8IFwiX1wiO1xuICAgICAgICAgICAgc2NvcGUgPSBzLnNjb3BlO1xuICAgICAgICAgICAgaWYgKCFzbmlwcGV0TWFwW3Njb3BlXSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdID0gW107XG4gICAgICAgICAgICAgICAgc25pcHBldE5hbWVNYXBbc2NvcGVdID0ge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TmFtZU1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAocy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9sZCA9IG1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChvbGQpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYudW5yZWdpc3RlcihvbGQpO1xuICAgICAgICAgICAgICAgIG1hcFtzLm5hbWVdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdLnB1c2gocyk7XG5cbiAgICAgICAgICAgIGlmIChzLnRhYlRyaWdnZXIgJiYgIXMudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgIGlmICghcy5ndWFyZCAmJiAvXlxcdy8udGVzdChzLnRhYlRyaWdnZXIpKVxuICAgICAgICAgICAgICAgICAgICBzLmd1YXJkID0gXCJcXFxcYlwiO1xuICAgICAgICAgICAgICAgIHMudHJpZ2dlciA9IGVzY2FwZVJlZ0V4cChzLnRhYlRyaWdnZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzLnN0YXJ0UmUgPSBndWFyZGVkUmVnZXhwKHMudHJpZ2dlciwgcy5ndWFyZCwgdHJ1ZSk7XG4gICAgICAgICAgICBzLnRyaWdnZXJSZSA9IG5ldyBSZWdFeHAocy50cmlnZ2VyLCBcIlwiKTtcblxuICAgICAgICAgICAgcy5lbmRSZSA9IGd1YXJkZWRSZWdleHAocy5lbmRUcmlnZ2VyLCBzLmVuZEd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMuZW5kVHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLmVuZFRyaWdnZXIsIFwiXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICBhZGRTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKGFkZFNuaXBwZXQpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcInJlZ2lzdGVyU25pcHBldHNcIiwgeyBzY29wZTogc2NvcGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bnJlZ2lzdGVyKHNuaXBwZXRzLCBzY29wZT8pIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlU25pcHBldChzKSB7XG4gICAgICAgICAgICB2YXIgbmFtZU1hcCA9IHNuaXBwZXROYW1lTWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgaWYgKG5hbWVNYXAgJiYgbmFtZU1hcFtzLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIG5hbWVNYXBbcy5uYW1lXTtcbiAgICAgICAgICAgICAgICB2YXIgbWFwID0gc25pcHBldE1hcFtzLnNjb3BlIHx8IHNjb3BlXTtcbiAgICAgICAgICAgICAgICB2YXIgaSA9IG1hcCAmJiBtYXAuaW5kZXhPZihzKTtcbiAgICAgICAgICAgICAgICBpZiAoaSA+PSAwKVxuICAgICAgICAgICAgICAgICAgICBtYXAuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzbmlwcGV0cy5jb250ZW50KVxuICAgICAgICAgICAgcmVtb3ZlU25pcHBldChzbmlwcGV0cyk7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoc25pcHBldHMpKVxuICAgICAgICAgICAgc25pcHBldHMuZm9yRWFjaChyZW1vdmVTbmlwcGV0KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGFyc2VTbmlwcGV0RmlsZShzdHIpIHtcbiAgICAgICAgc3RyID0gc3RyLnJlcGxhY2UoL1xcci9nLCBcIlwiKTtcbiAgICAgICAgdmFyIGxpc3QgPSBbXTtcbiAgICAgICAgdmFyIHNuaXBwZXQ6IGFueSA9IHt9O1xuICAgICAgICB2YXIgcmUgPSAvXiMuKnxeKHtbXFxzXFxTXSp9KVxccyokfF4oXFxTKykgKC4qKSR8XigoPzpcXG4qXFx0LiopKykvZ207XG4gICAgICAgIHZhciBtO1xuICAgICAgICB3aGlsZSAobSA9IHJlLmV4ZWMoc3RyKSkge1xuICAgICAgICAgICAgaWYgKG1bMV0pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0ID0gSlNPTi5wYXJzZShtWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgICAgICAgfSBpZiAobVs0XSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXQuY29udGVudCA9IG1bNF0ucmVwbGFjZSgvXlxcdC9nbSwgXCJcIik7XG4gICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB7fTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IG1bMl0sIHZhbCA9IG1bM107XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PSBcInJlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGd1YXJkUmUgPSAvXFwvKCg/OlteXFwvXFxcXF18XFxcXC4pKil8JC9nO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lmd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZFRyaWdnZXIgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5lbmRHdWFyZCA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09IFwic25pcHBldFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudGFiVHJpZ2dlciA9IHZhbC5tYXRjaCgvXlxcUyovKVswXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzbmlwcGV0Lm5hbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lm5hbWUgPSB2YWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldFtrZXldID0gdmFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbGlzdDtcbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRTbmlwcGV0QnlOYW1lKG5hbWUsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHNuaXBwZXRzW25hbWVdO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIHJldHVybiBzbmlwcGV0O1xuICAgIH1cbn1cblxuY2xhc3MgVGFic3RvcE1hbmFnZXIge1xuICAgIHByaXZhdGUgaW5kZXg7XG4gICAgcHJpdmF0ZSByYW5nZXM7XG4gICAgcHJpdmF0ZSB0YWJzdG9wcztcbiAgICBwcml2YXRlICRvcGVuVGFic3RvcHM7XG4gICAgcHJpdmF0ZSBzZWxlY3RlZFRhYnN0b3A7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlIGtleWJvYXJkSGFuZGxlciA9IG5ldyBIYXNoSGFuZGxlcigpO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2Vzc2lvbjtcbiAgICBwcml2YXRlICRvbkFmdGVyRXhlYztcbiAgICBwcml2YXRlICRpbkNoYW5nZTtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IHRoaXM7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbiA9IGRlbGF5ZWRDYWxsKHRoaXMub25DaGFuZ2VTZWxlY3Rpb24uYmluZCh0aGlzKSkuc2NoZWR1bGU7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbiA9IHRoaXMub25DaGFuZ2VTZXNzaW9uLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQWZ0ZXJFeGVjID0gdGhpcy5vbkFmdGVyRXhlYy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmF0dGFjaChlZGl0b3IpO1xuICAgICAgICB0aGlzLmtleWJvYXJkSGFuZGxlci5iaW5kS2V5cyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIlRhYlwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzbmlwcGV0TWFuYWdlciAmJiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKGVkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIlNoaWZ0LVRhYlwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgtMSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIkVzY1wiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkW1RBQlNUT1BfTUFOQUdFUl0uZGV0YWNoKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIlJldHVyblwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KDEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgfVxuICAgIHByaXZhdGUgYXR0YWNoKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHRoaXMuaW5kZXggPSAwO1xuICAgICAgICB0aGlzLnJhbmdlcyA9IFtdO1xuICAgICAgICB0aGlzLnRhYnN0b3BzID0gW107XG4gICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcblxuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5vbihcImFmdGVyRXhlY1wiLCB0aGlzLiRvbkFmdGVyRXhlYyk7XG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcuYWRkS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRldGFjaCgpIHtcbiAgICAgICAgdGhpcy50YWJzdG9wcy5mb3JFYWNoKHRoaXMucmVtb3ZlVGFic3RvcE1hcmtlcnMsIHRoaXMpO1xuICAgICAgICB0aGlzLnJhbmdlcyA9IG51bGw7XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBudWxsO1xuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVNlc3Npb25cIiwgdGhpcy4kb25DaGFuZ2VTZXNzaW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3IuY29tbWFuZHMucmVtb3ZlTGlzdGVuZXIoXCJhZnRlckV4ZWNcIiwgdGhpcy4kb25BZnRlckV4ZWMpO1xuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLnJlbW92ZUtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZShlKSB7XG4gICAgICAgIHZhciBjaGFuZ2VSYW5nZSA9IGUuZGF0YS5yYW5nZTtcbiAgICAgICAgdmFyIGlzUmVtb3ZlID0gZS5kYXRhLmFjdGlvblswXSA9PSBcInJcIjtcbiAgICAgICAgdmFyIHN0YXJ0ID0gY2hhbmdlUmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSBjaGFuZ2VSYW5nZS5lbmQ7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IHN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGVuZFJvdyA9IGVuZC5yb3c7XG4gICAgICAgIHZhciBsaW5lRGlmID0gZW5kUm93IC0gc3RhcnRSb3c7XG4gICAgICAgIHZhciBjb2xEaWZmID0gZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbjtcblxuICAgICAgICBpZiAoaXNSZW1vdmUpIHtcbiAgICAgICAgICAgIGxpbmVEaWYgPSAtbGluZURpZjtcbiAgICAgICAgICAgIGNvbERpZmYgPSAtY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuJGluQ2hhbmdlICYmIGlzUmVtb3ZlKSB7XG4gICAgICAgICAgICB2YXIgdHMgPSB0aGlzLnNlbGVjdGVkVGFic3RvcDtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkT3V0c2lkZSA9IHRzICYmICF0cy5zb21lKGZ1bmN0aW9uKHIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29tcGFyZVBvaW50cyhyLnN0YXJ0LCBzdGFydCkgPD0gMCAmJiBjb21wYXJlUG9pbnRzKHIuZW5kLCBlbmQpID49IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VkT3V0c2lkZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgciA9IHJhbmdlc1tpXTtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPCBzdGFydC5yb3cpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGlmIChpc1JlbW92ZSAmJiBjb21wYXJlUG9pbnRzKHN0YXJ0LCByLnN0YXJ0KSA8IDAgJiYgY29tcGFyZVBvaW50cyhlbmQsIHIuZW5kKSA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVJhbmdlKHIpO1xuICAgICAgICAgICAgICAgIGktLTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHIuc3RhcnQucm93ID09IHN0YXJ0Um93ICYmIHIuc3RhcnQuY29sdW1uID4gc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgIHIuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICBpZiAoci5lbmQucm93ID09IHN0YXJ0Um93ICYmIHIuZW5kLmNvbHVtbiA+PSBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgci5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICBpZiAoci5zdGFydC5yb3cgPj0gc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgci5zdGFydC5yb3cgKz0gbGluZURpZjtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPj0gc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgci5lbmQucm93ICs9IGxpbmVEaWY7XG5cbiAgICAgICAgICAgIGlmIChjb21wYXJlUG9pbnRzKHIuc3RhcnQsIHIuZW5kKSA+IDApXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVSYW5nZShyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXJhbmdlcy5sZW5ndGgpXG4gICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlTGlua2VkRmllbGRzKCkge1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnNlbGVjdGVkVGFic3RvcDtcbiAgICAgICAgaWYgKCF0cyB8fCAhdHMuaGFzTGlua2VkUmFuZ2VzKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB0aGlzLiRpbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5lZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZSh0cy5maXJzdE5vbkxpbmtlZCk7XG4gICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRzW2ldO1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5saW5rZWQpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgZm10ID0gc25pcHBldE1hbmFnZXIudG1TdHJGb3JtYXQodGV4dCwgcmFuZ2Uub3JpZ2luYWwpO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBmbXQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkFmdGVyRXhlYyhlKSB7XG4gICAgICAgIGlmIChlLmNvbW1hbmQgJiYgIWUuY29tbWFuZC5yZWFkT25seSlcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGlua2VkRmllbGRzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlbGVjdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24ubGVhZDtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5hbmNob3I7XG4gICAgICAgIHZhciBpc0VtcHR5ID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBjb250YWluc0xlYWQgPSB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zQW5jaG9yID0gaXNFbXB0eSB8fCB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjb250YWluc0xlYWQgJiYgY29udGFpbnNBbmNob3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlc3Npb24oKSB7XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0YWJOZXh0KGRpcikge1xuICAgICAgICB2YXIgbWF4ID0gdGhpcy50YWJzdG9wcy5sZW5ndGg7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuaW5kZXggKyAoZGlyIHx8IDEpO1xuICAgICAgICBpbmRleCA9IE1hdGgubWluKE1hdGgubWF4KGluZGV4LCAxKSwgbWF4KTtcbiAgICAgICAgaWYgKGluZGV4ID09IG1heClcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZWxlY3RUYWJzdG9wKGluZGV4KTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAwKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdFRhYnN0b3AoaW5kZXgpIHtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdmFyIHRzID0gdGhpcy50YWJzdG9wc1t0aGlzLmluZGV4XTtcbiAgICAgICAgaWYgKHRzKVxuICAgICAgICAgICAgdGhpcy5hZGRUYWJzdG9wTWFya2Vycyh0cyk7XG4gICAgICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICAgICAgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAoIXRzIHx8ICF0cy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSB0cztcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgICAgICB2YXIgc2VsID0gdGhpcy5lZGl0b3JbJ211bHRpU2VsZWN0J107XG4gICAgICAgICAgICBzZWwudG9TaW5nbGVSYW5nZSh0cy5maXJzdE5vbkxpbmtlZC5jbG9uZSgpKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICBpZiAodHMuaGFzTGlua2VkUmFuZ2VzICYmIHRzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHRzW2ldLmNsb25lKCksIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdG9kbyBpbnZlc3RpZ2F0ZSB3aHkgaXMgdGhpcyBuZWVkZWRcbiAgICAgICAgICAgIGlmIChzZWwucmFuZ2VzWzBdKVxuICAgICAgICAgICAgICAgIHNlbC5hZGRSYW5nZShzZWwucmFuZ2VzWzBdLmNsb25lKCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNldFJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcuYWRkS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkVGFic3RvcHMgPSBmdW5jdGlvbih0YWJzdG9wcywgc3RhcnQsIGVuZCwgdW51c2VkKSB7XG4gICAgICAgIGlmICghdGhpcy4kb3BlblRhYnN0b3BzKVxuICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gW107XG4gICAgICAgIC8vIGFkZCBmaW5hbCB0YWJzdG9wIGlmIG1pc3NpbmdcbiAgICAgICAgaWYgKCF0YWJzdG9wc1swXSkge1xuICAgICAgICAgICAgdmFyIHAgPSBSYW5nZS5mcm9tUG9pbnRzKGVuZCwgZW5kKTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLnN0YXJ0LCBzdGFydCk7XG4gICAgICAgICAgICBtb3ZlUmVsYXRpdmUocC5lbmQsIHN0YXJ0KTtcbiAgICAgICAgICAgIHRhYnN0b3BzWzBdID0gW3BdO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0uaW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSB0aGlzLmluZGV4O1xuICAgICAgICB2YXIgYXJnID0gW2kgKyAxLCAwXTtcbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMucmFuZ2VzO1xuICAgICAgICB0YWJzdG9wcy5mb3JFYWNoKGZ1bmN0aW9uKHRzLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIGRlc3QgPSB0aGlzLiRvcGVuVGFic3RvcHNbaW5kZXhdIHx8IHRzO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gdHMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgdmFyIHAgPSB0c1tpXTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2U6IGFueSA9IFJhbmdlLmZyb21Qb2ludHMocC5zdGFydCwgcC5lbmQgfHwgcC5zdGFydCk7XG4gICAgICAgICAgICAgICAgbW92ZVBvaW50KHJhbmdlLnN0YXJ0LCBzdGFydCk7XG4gICAgICAgICAgICAgICAgbW92ZVBvaW50KHJhbmdlLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgICAgIHJhbmdlLm9yaWdpbmFsID0gcDtcbiAgICAgICAgICAgICAgICByYW5nZS50YWJzdG9wID0gZGVzdDtcbiAgICAgICAgICAgICAgICByYW5nZXMucHVzaChyYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKGRlc3QgIT0gdHMpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QudW5zaGlmdChyYW5nZSk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBkZXN0W2ldID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHAuZm10U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmxpbmtlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGRlc3QuaGFzTGlua2VkUmFuZ2VzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFkZXN0LmZpcnN0Tm9uTGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBkZXN0LmZpcnN0Tm9uTGlua2VkID0gcmFuZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmIChkZXN0ID09PSB0cykge1xuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGRlc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gPSBkZXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hZGRUYWJzdG9wTWFya2VycyhkZXN0KTtcbiAgICAgICAgfSwgdGhpcyk7XG5cbiAgICAgICAgaWYgKGFyZy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICAvLyB3aGVuIGFkZGluZyBuZXcgc25pcHBldCBpbnNpZGUgZXhpc3Rpbmcgb25lLCBtYWtlIHN1cmUgMCB0YWJzdG9wIGlzIGF0IHRoZSBlbmRcbiAgICAgICAgICAgIGlmICh0aGlzLnRhYnN0b3BzLmxlbmd0aClcbiAgICAgICAgICAgICAgICBhcmcucHVzaChhcmcuc3BsaWNlKDIsIDEpWzBdKTtcbiAgICAgICAgICAgIHRoaXMudGFic3RvcHMuc3BsaWNlLmFwcGx5KHRoaXMudGFic3RvcHMsIGFyZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZFRhYnN0b3BNYXJrZXJzID0gZnVuY3Rpb24odHMpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB0cy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlLyo6IHJtLlJhbmdlKi8pIHtcbiAgICAgICAgICAgIGlmICghcmFuZ2UubWFya2VySWQpXG4gICAgICAgICAgICAgICAgcmFuZ2UubWFya2VySWQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc25pcHBldC1tYXJrZXJcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVRhYnN0b3BNYXJrZXJzID0gZnVuY3Rpb24odHMpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB0cy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IG51bGw7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlUmFuZ2UgPSBmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICB2YXIgaSA9IHJhbmdlLnRhYnN0b3AuaW5kZXhPZihyYW5nZSk7XG4gICAgICAgIHJhbmdlLnRhYnN0b3Auc3BsaWNlKGksIDEpO1xuICAgICAgICBpID0gdGhpcy5yYW5nZXMuaW5kZXhPZihyYW5nZSk7XG4gICAgICAgIHRoaXMucmFuZ2VzLnNwbGljZShpLCAxKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iuc2Vzc2lvbi5yZW1vdmVNYXJrZXIocmFuZ2UubWFya2VySWQpO1xuICAgICAgICBpZiAoIXJhbmdlLnRhYnN0b3AubGVuZ3RoKSB7XG4gICAgICAgICAgICBpID0gdGhpcy50YWJzdG9wcy5pbmRleE9mKHJhbmdlLnRhYnN0b3ApO1xuICAgICAgICAgICAgaWYgKGkgIT0gLTEpXG4gICAgICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG52YXIgY2hhbmdlVHJhY2tlcjogYW55ID0ge307XG5jaGFuZ2VUcmFja2VyLm9uQ2hhbmdlID0gQW5jaG9yLnByb3RvdHlwZS5vbkNoYW5nZTtcbmNoYW5nZVRyYWNrZXIuc2V0UG9zaXRpb24gPSBmdW5jdGlvbihyb3csIGNvbHVtbikge1xuICAgIHRoaXMucG9zLnJvdyA9IHJvdztcbiAgICB0aGlzLnBvcy5jb2x1bW4gPSBjb2x1bW47XG59O1xuY2hhbmdlVHJhY2tlci51cGRhdGUgPSBmdW5jdGlvbihwb3MsIGRlbHRhLCAkaW5zZXJ0UmlnaHQpIHtcbiAgICB0aGlzLiRpbnNlcnRSaWdodCA9ICRpbnNlcnRSaWdodDtcbiAgICB0aGlzLnBvcyA9IHBvcztcbiAgICB0aGlzLm9uQ2hhbmdlKGRlbHRhKTtcbn07XG5cbnZhciBtb3ZlUG9pbnQgPSBmdW5jdGlvbihwb2ludCwgZGlmZikge1xuICAgIGlmIChwb2ludC5yb3cgPT0gMClcbiAgICAgICAgcG9pbnQuY29sdW1uICs9IGRpZmYuY29sdW1uO1xuICAgIHBvaW50LnJvdyArPSBkaWZmLnJvdztcbn07XG5cbnZhciBtb3ZlUmVsYXRpdmUgPSBmdW5jdGlvbihwb2ludCwgc3RhcnQpIHtcbiAgICBpZiAocG9pbnQucm93ID09IHN0YXJ0LnJvdylcbiAgICAgICAgcG9pbnQuY29sdW1uIC09IHN0YXJ0LmNvbHVtbjtcbiAgICBwb2ludC5yb3cgLT0gc3RhcnQucm93O1xufTtcblxuXG5pbXBvcnRDc3NTdHJpbmcoXCJcXFxuLmFjZV9zbmlwcGV0LW1hcmtlciB7XFxcbiAgICAtbW96LWJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcXG4gICAgYmFja2dyb3VuZDogcmdiYSgxOTQsIDE5MywgMjA4LCAwLjA5KTtcXFxuICAgIGJvcmRlcjogMXB4IGRvdHRlZCByZ2JhKDIxMSwgMjA4LCAyMzUsIDAuNjIpO1xcXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xcXG59XCIpO1xuXG5leHBvcnQgdmFyIHNuaXBwZXRNYW5hZ2VyID0gbmV3IFNuaXBwZXRNYW5hZ2VyKCk7XG5cbihmdW5jdGlvbigpIHtcbiAgICB0aGlzLmluc2VydFNuaXBwZXQgPSBmdW5jdGlvbihjb250ZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5pbnNlcnRTbmlwcGV0KHRoaXMsIGNvbnRlbnQsIG9wdGlvbnMpO1xuICAgIH07XG4gICAgdGhpcy5leHBhbmRTbmlwcGV0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gc25pcHBldE1hbmFnZXIuZXhwYW5kV2l0aFRhYih0aGlzLCBvcHRpb25zKTtcbiAgICB9O1xufSkuY2FsbChFZGl0b3IucHJvdG90eXBlKTtcbiJdfQ==