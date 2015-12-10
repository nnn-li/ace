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
                return "DEUCE";
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
        var session = editor.getSession();
        var line = session.getLine(cursor.row);
        var tabString = session.getTabString();
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
        var end = editor.getSession().replace(range, text);
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
        var session = editor.getSession();
        var scope = session.$mode.$id || "";
        scope = scope.split("/").pop();
        if (scope === "html" || scope === "php") {
            if (scope === "php" && !session.$mode['inlinePhp'])
                scope = "html";
            var c = editor.getCursorPosition();
            var state = session.getState(c.row);
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
        var session = editor.getSession();
        var line = session.getLine(cursor.row);
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
        session.doc.removeInLine(cursor.row, cursor.column - snippet.replaceBefore.length, cursor.column + snippet.replaceAfter.length);
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
        this.editor.off("change", this.$onChange);
        this.editor.off("changeSelection", this.$onChangeSelection);
        this.editor.off("changeSession", this.$onChangeSession);
        this.editor.commands.off("afterExec", this.$onAfterExec);
        this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
        this.editor[TABSTOP_MANAGER] = null;
        this.editor = null;
    }
    onChange(e, editor) {
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
        var session = this.editor.getSession();
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
    onChangeSelection(event, editor) {
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
    onChangeSession(event, editor) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiT0E4Qk8sRUFBQyxlQUFlLEVBQUMsTUFBTSxXQUFXO09BQ2xDLGlCQUFpQixNQUFNLHFCQUFxQjtPQUM1QyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEtBQUssTUFBTSxTQUFTO09BQ3BCLGFBQWEsTUFBTSxpQkFBaUI7T0FDcEMsTUFBTSxNQUFNLFVBQVU7T0FDdEIsV0FBVyxNQUFNLHdCQUF3QjtPQUN6QyxTQUFTLE1BQU0sYUFBYTtPQUM1QixNQUFNLE1BQU0sVUFBVTtBQUc3QixJQUFJLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQztBQUV2QyxnQkFBZ0IsRUFBRTtJQUNkQSxNQUFNQSxDQUFDQSxXQUFXQSxHQUFHQSxFQUFFQSxHQUFHQSxVQUFVQSxDQUFDQTtBQUN6Q0EsQ0FBQ0E7QUFFRCxzQkFBc0IsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0lBQy9CQyxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FB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LEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0E7Z0JBQ3JCQSxRQUFRQSxDQUFDQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFFekJBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLElBQUlBLEVBQUVBLEdBQUdBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN6RUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLFNBQVNBLENBQUNBLEVBQUVBLENB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QSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDdENBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU9YLFNBQVNBLENBQUNBLE1BQWNBO1FBQzVCWSxJQUFJQSxPQUFPQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsS0FBS0EsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDcENBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxNQUFNQSxJQUFJQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUd0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9DQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtZQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEtBQUtBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUM1QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNs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RUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDbEJBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxzQkFBc0JBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RDQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUNyQ0EsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBO2dCQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZUFBZUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7b0JBQ25DQSxRQUFRQSxDQUFDQTtnQkFDYkEsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDdERBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7SUFDcEVBLENBQUNBO0FBcUZMVixDQUFDQTtBQUVELElBQUksYUFBYSxHQUFRLEVBQUUsQ0FBQztBQUM1QixhQUFhLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO0FBQ25ELGFBQWEsQ0FBQyxXQUFXLEdBQUcsVUFBUyxHQUFHLEVBQUUsTUFBTTtJQUM1QyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDbkIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0FBQzdCLENBQUMsQ0FBQztBQUNGLGFBQWEsQ0FBQyxNQUFNLEdBQUcsVUFBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLFlBQVk7SUFDcEQsSUFBSSxDQUFDLFlBQVksR0FBRyxZQUFZLENBQUM7SUFDakMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDZixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3pCLENBQUMsQ0FBQztBQUVGLElBQUksU0FBUyxHQUFHLFVBQVMsS0FBSyxFQUFFLElBQUk7SUFDaEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7UUFDZixLQUFLLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDaEMsS0FBSyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDO0FBQzFCLENBQUMsQ0FBQztBQUVGLElBQUksWUFBWSxHQUFHLFVBQVMsS0FBSyxFQUFFLEtBQUs7SUFDcEMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDO1FBQ3ZCLEtBQUssQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQztJQUNqQyxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUM7QUFDM0IsQ0FBQyxDQUFDO0FBR0YsZUFBZSxDQUFDOzs7Ozs7O0VBT2QsQ0FBQyxDQUFDO0FBRUosV0FBVyxjQUFjLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztBQUVqRCxDQUFDO0lBQ0csSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFTLE9BQU8sRUFBRSxPQUFPO1FBQzFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDaEUsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFTLE9BQU87UUFDakMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHtpbXBvcnRDc3NTdHJpbmd9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgZXNjYXBlUmVnRXhwfSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgY29tcGFyZVBvaW50cyBmcm9tIFwiLi9jb21wYXJlUG9pbnRzXCJcbmltcG9ydCBBbmNob3IgZnJvbSBcIi4vQW5jaG9yXCI7XG5pbXBvcnQgSGFzaEhhbmRsZXIgZnJvbSBcIi4va2V5Ym9hcmQvSGFzaEhhbmRsZXJcIjtcbmltcG9ydCBUb2tlbml6ZXIgZnJvbSBcIi4vVG9rZW5pemVyXCI7XG5pbXBvcnQgRWRpdG9yIGZyb20gJy4vRWRpdG9yJztcbmltcG9ydCBDaGFuZ2UgZnJvbSBcIi4vQ2hhbmdlXCI7XG5cbnZhciBUQUJTVE9QX01BTkFHRVIgPSAndGFic3RvcE1hbmFnZXInO1xuXG5mdW5jdGlvbiBlc2NhcGUoY2gpIHtcbiAgICByZXR1cm4gXCIoPzpbXlxcXFxcXFxcXCIgKyBjaCArIFwiXXxcXFxcXFxcXC4pXCI7XG59XG5cbmZ1bmN0aW9uIFRhYnN0b3BUb2tlbihzdHIsIF8sIHN0YWNrKTogYW55W10ge1xuICAgIHN0ciA9IHN0ci5zdWJzdHIoMSk7XG4gICAgaWYgKC9eXFxkKyQvLnRlc3Qoc3RyKSAmJiAhc3RhY2suaW5Gb3JtYXRTdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIFt7IHRhYnN0b3BJZDogcGFyc2VJbnQoc3RyLCAxMCkgfV07XG4gICAgfVxuICAgIHJldHVybiBbeyB0ZXh0OiBzdHIgfV07XG59XG5cbmV4cG9ydCBjbGFzcyBTbmlwcGV0TWFuYWdlciBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgc25pcHBldE1hcCA9IHt9O1xuICAgIHByaXZhdGUgc25pcHBldE5hbWVNYXAgPSB7fTtcbiAgICBwcml2YXRlIHZhcmlhYmxlcyA9IHt9O1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzdGF0aWMgJHRva2VuaXplciA9IG5ldyBUb2tlbml6ZXIoe1xuICAgICAgICBzdGFydDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvOi8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spOiBhbnkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2subGVuZ3RoICYmIHN0YWNrWzBdLmV4cGVjdElmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZWxzZUJyYW5jaCA9IHN0YWNrWzBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzdGFja1swXV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiOlwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXFxcLi8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNoID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJ9XCIgJiYgc3RhY2subGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBjaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChcImAkXFxcXFwiLmluZGV4T2YoY2gpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBjaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNoID09IFwiblwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjaCA9PSBcInRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoXCJ1bFVMRVwiLmluZGV4T2YoY2gpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0geyBjaGFuZ2VDYXNlOiBjaCwgbG9jYWw6IGNoID4gXCJhXCIgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbdmFsXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvfS8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtzdGFjay5sZW5ndGggPyBzdGFjay5zaGlmdCgpIDogdmFsXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwkKD86XFxkK3xcXHcrKS8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogVGFic3RvcFRva2VuXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwkXFx7W1xcZEEtWl9hLXpdKy8sXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24oc3RyLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHQgPSBUYWJzdG9wVG9rZW4oc3RyLnN1YnN0cigxKSwgc3RhdGUsIHN0YWNrKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2sudW5zaGlmdCh0WzBdKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHQ7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzbmlwcGV0VmFyXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXG4vLFxuICAgICAgICAgICAgICAgIHRva2VuOiBcIm5ld2xpbmVcIixcbiAgICAgICAgICAgICAgICBtZXJnZTogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgc25pcHBldFZhcjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFx8XCIgKyBlc2NhcGUoXCJcXFxcfFwiKSArIFwiKlxcXFx8XCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmNob2ljZXMgPSB2YWwuc2xpY2UoMSwgLTEpLnNwbGl0KFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispLyg/OihcIiArIGVzY2FwZShcIi9cIikgKyBcIiopLykoXFxcXHcqKTo/XCIsXG4gICAgICAgICAgICAgICAgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRzID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZtdFN0cmluZyA9IHZhbDtcblxuICAgICAgICAgICAgICAgICAgICB2YWwgPSB0aGlzLnNwbGl0UmVnZXguZXhlYyh2YWwpO1xuICAgICAgICAgICAgICAgICAgICB0cy5ndWFyZCA9IHZhbFsxXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10ID0gdmFsWzJdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbGFnID0gdmFsWzNdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiYFwiICsgZXNjYXBlKFwiYFwiKSArIFwiKmBcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY29kZSA9IHZhbC5zcGxpY2UoMSwgLTEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXD9cIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YWNrWzBdKVxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZXhwZWN0SWYgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiKFteOn1cXFxcXFxcXF18XFxcXFxcXFwuKSo6P1wiLCB0b2tlbjogXCJcIiwgbmV4dDogXCJzdGFydFwiIH1cbiAgICAgICAgXSxcbiAgICAgICAgZm9ybWF0U3RyaW5nOiBbXG4gICAgICAgICAgICB7IHJlZ2V4OiBcIi8oXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIrKS9cIiwgdG9rZW46IFwicmVnZXhcIiB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5pbkZvcm1hdFN0cmluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIHByaXZhdGUgZ2V0VG9rZW5pemVyKCkge1xuICAgICAgICBTbmlwcGV0TWFuYWdlci5wcm90b3R5cGUuZ2V0VG9rZW5pemVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIFNuaXBwZXRNYW5hZ2VyLiR0b2tlbml6ZXI7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0b2tlbml6ZVRtU25pcHBldChzdHIsIHN0YXJ0U3RhdGU/KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldFRva2VuaXplcigpLmdldExpbmVUb2tlbnMoc3RyLCBzdGFydFN0YXRlKS50b2tlbnMubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIHJldHVybiB4LnZhbHVlIHx8IHg7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldERlZmF1bHRWYWx1ZShlZGl0b3IsIG5hbWUpIHtcbiAgICAgICAgaWYgKC9eW0EtWl1cXGQrJC8udGVzdChuYW1lKSkge1xuICAgICAgICAgICAgdmFyIGkgPSBuYW1lLnN1YnN0cigxKTtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbbmFtZVswXSArIFwiX19cIl0gfHwge30pW2ldO1xuICAgICAgICB9XG4gICAgICAgIGlmICgvXlxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMudmFyaWFibGVzWydfXyddIHx8IHt9KVtuYW1lXTtcbiAgICAgICAgfVxuICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC9eVE1fLywgXCJcIik7XG5cbiAgICAgICAgaWYgKCFlZGl0b3IpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBzID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgICAgICAgY2FzZSBcIkNVUlJFTlRfV09SRFwiOlxuICAgICAgICAgICAgICAgIHZhciByID0gcy5nZXRXb3JkUmFuZ2UoKTtcbiAgICAgICAgICAgIC8qIGZhbGxzIHRocm91Z2ggKi9cbiAgICAgICAgICAgIGNhc2UgXCJTRUxFQ1RJT05cIjpcbiAgICAgICAgICAgIGNhc2UgXCJTRUxFQ1RFRF9URVhUXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VGV4dFJhbmdlKHIpO1xuICAgICAgICAgICAgY2FzZSBcIkNVUlJFTlRfTElORVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldExpbmUoZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93KTtcbiAgICAgICAgICAgIGNhc2UgXCJQUkVWX0xJTkVcIjogLy8gbm90IHBvc3NpYmxlIGluIHRleHRtYXRlXG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cgLSAxKTtcbiAgICAgICAgICAgIGNhc2UgXCJMSU5FX0lOREVYXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLmNvbHVtbjtcbiAgICAgICAgICAgIGNhc2UgXCJMSU5FX05VTUJFUlwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cgKyAxO1xuICAgICAgICAgICAgY2FzZSBcIlNPRlRfVEFCU1wiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFVzZVNvZnRUYWJzKCkgPyBcIllFU1wiIDogXCJOT1wiO1xuICAgICAgICAgICAgY2FzZSBcIlRBQl9TSVpFXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VGFiU2l6ZSgpO1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBidXQgY2FuJ3QgZmlsbCA6KFxuICAgICAgICAgICAgY2FzZSBcIkZJTEVOQU1FXCI6XG4gICAgICAgICAgICBjYXNlIFwiRklMRVBBVEhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIGNhc2UgXCJGVUxMTkFNRVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIkRFVUNFXCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgdmFyTmFtZSkge1xuICAgICAgICBpZiAodGhpcy52YXJpYWJsZXMuaGFzT3duUHJvcGVydHkodmFyTmFtZSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZXNbdmFyTmFtZV0oZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHN0cmluZyBmb3JtYXR0ZWQgYWNjb3JkaW5nIHRvIGh0dHA6Ly9tYW51YWwubWFjcm9tYXRlcy5jb20vZW4vcmVndWxhcl9leHByZXNzaW9ucyNyZXBsYWNlbWVudF9zdHJpbmdfc3ludGF4X2Zvcm1hdF9zdHJpbmdzXG4gICAgcHVibGljIHRtU3RyRm9ybWF0KHN0ciwgY2gsIGVkaXRvcj8pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBjaC5mbGFnIHx8IFwiXCI7XG4gICAgICAgIHZhciByZSA9IGNoLmd1YXJkO1xuICAgICAgICByZSA9IG5ldyBSZWdFeHAocmUsIGZsYWcucmVwbGFjZSgvW15naV0vLCBcIlwiKSk7XG4gICAgICAgIHZhciBmbXRUb2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KGNoLmZtdCwgXCJmb3JtYXRTdHJpbmdcIik7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBzdHIucmVwbGFjZShyZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi52YXJpYWJsZXNbJ19fJ10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICB2YXIgZm10UGFydHMgPSBfc2VsZi5yZXNvbHZlVmFyaWFibGVzKGZtdFRva2VucywgZWRpdG9yKTtcbiAgICAgICAgICAgIHZhciBnQ2hhbmdlQ2FzZSA9IFwiRVwiO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbXRQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGZtdFBhcnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlICYmIGNoLmxvY2FsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZtdFBhcnRzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0ICYmIHR5cGVvZiBuZXh0ID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSA9PSBcInVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpICsgMV0gPSBuZXh0LnN1YnN0cigxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnQ2hhbmdlQ2FzZSA9IGNoLmNoYW5nZUNhc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiVVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiTFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm10UGFydHMuam9pbihcIlwiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVWYXJpYWJsZXMoc25pcHBldCwgZWRpdG9yKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmlwcGV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzbmlwcGV0W2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2ggIT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5za2lwKSB7XG4gICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5wcm9jZXNzZWQgPCBpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCBjaC50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgY2guZm10U3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG1TdHJGb3JtYXQodmFsdWUsIGNoKTtcbiAgICAgICAgICAgICAgICBjaC5wcm9jZXNzZWQgPSBpO1xuICAgICAgICAgICAgICAgIGlmIChjaC5leHBlY3RJZiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaC5za2lwID0gY2guZWxzZUJyYW5jaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50YWJzdG9wSWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdvdG9OZXh0KGNoKSB7XG4gICAgICAgICAgICB2YXIgaTEgPSBzbmlwcGV0LmluZGV4T2YoY2gsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSAhPSAtMSlcbiAgICAgICAgICAgICAgICBpID0gaTE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgdGFiU3RyaW5nID0gc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcbiAgICAgICAgdmFyIGluZGVudFN0cmluZyA9IGxpbmUubWF0Y2goL15cXHMqLylbMF07XG5cbiAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPCBpbmRlbnRTdHJpbmcubGVuZ3RoKVxuICAgICAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnNsaWNlKDAsIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KHNuaXBwZXRUZXh0KTtcbiAgICAgICAgdG9rZW5zID0gdGhpcy5yZXNvbHZlVmFyaWFibGVzKHRva2VucywgZWRpdG9yKTtcbiAgICAgICAgLy8gaW5kZW50XG4gICAgICAgIHRva2VucyA9IHRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgaWYgKHggPT0gXCJcXG5cIilcbiAgICAgICAgICAgICAgICByZXR1cm4geCArIGluZGVudFN0cmluZztcbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHJldHVybiB4LnJlcGxhY2UoL1xcdC9nLCB0YWJTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0YWJzdG9wIHZhbHVlc1xuICAgICAgICB2YXIgdGFic3RvcHMgPSBbXTtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24ocCwgaSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICBpZiAoIXRzKSB7XG4gICAgICAgICAgICAgICAgdHMgPSB0YWJzdG9wc1tpZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB0cy5pbmRleCA9IGlkO1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApICE9PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxID09PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vucy5zbGljZShpICsgMSwgaTEpO1xuICAgICAgICAgICAgdmFyIGlzTmVzdGVkID0gdmFsdWUuc29tZShmdW5jdGlvbih0KSB7IHJldHVybiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiB9KTtcbiAgICAgICAgICAgIGlmIChpc05lc3RlZCAmJiAhdHMudmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZS5sZW5ndGggJiYgKCF0cy52YWx1ZSB8fCB0eXBlb2YgdHMudmFsdWUgIT09IFwic3RyaW5nXCIpKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZS5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBleHBhbmQgdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdGFic3RvcHMuZm9yRWFjaChmdW5jdGlvbih0cykgeyB0cy5sZW5ndGggPSAwIH0pO1xuICAgICAgICB2YXIgZXhwYW5kaW5nID0ge307XG4gICAgICAgIGZ1bmN0aW9uIGNvcHlWYWx1ZSh2YWwpIHtcbiAgICAgICAgICAgIHZhciBjb3B5ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBwID0gdmFsW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcCA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbcC50YWJzdG9wSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBqID0gdmFsLmxhc3RJbmRleE9mKHAsIGkgLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGNvcHlbal0gfHwgeyB0YWJzdG9wSWQ6IHAudGFic3RvcElkIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvcHlbaV0gPSBwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBwID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgaWQgPSBwLnRhYnN0b3BJZDtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgcmVhY2hlZCBjbG9zaW5nIGJyYWNrZXQgY2xlYXIgZXhwYW5kaW5nIHN0YXRlXG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1tpZF0gPT09IHApXG4gICAgICAgICAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBudWxsO1xuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGlnbm9yZSByZWN1cnNpdmUgdGFic3RvcFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICB2YXIgYXJnID0gdHlwZW9mIHRzLnZhbHVlID09IFwic3RyaW5nXCIgPyBbdHMudmFsdWVdIDogY29weVZhbHVlKHRzLnZhbHVlKTtcbiAgICAgICAgICAgIGFyZy51bnNoaWZ0KGkgKyAxLCBNYXRoLm1heCgwLCBpMSAtIGkpKTtcbiAgICAgICAgICAgIGFyZy5wdXNoKHApO1xuICAgICAgICAgICAgZXhwYW5kaW5nW2lkXSA9IHA7XG4gICAgICAgICAgICB0b2tlbnMuc3BsaWNlLmFwcGx5KHRva2VucywgYXJnKTtcblxuICAgICAgICAgICAgaWYgKHRzLmluZGV4T2YocCkgPT09IC0xKVxuICAgICAgICAgICAgICAgIHRzLnB1c2gocCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IHRvIHBsYWluIHRleHRcbiAgICAgICAgdmFyIHJvdyA9IDAsIGNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0ZXh0ID0gXCJcIjtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRbMF0gPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gdC5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uICs9IHQubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRleHQgKz0gdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0LnN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICB0LnN0YXJ0ID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHQuZW5kID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgZW5kID0gZWRpdG9yLmdldFNlc3Npb24oKS5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcblxuICAgICAgICB2YXIgdHNNYW5hZ2VyID0gZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPyBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA6IG5ldyBUYWJzdG9wTWFuYWdlcihlZGl0b3IpO1xuICAgICAgICB2YXIgc2VsZWN0aW9uSWQgPSBlZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSAmJiBlZGl0b3Iuc2VsZWN0aW9uWydpbmRleCddO1xuICAgICAgICB0c01hbmFnZXIuYWRkVGFic3RvcHModGFic3RvcHMsIHJhbmdlLnN0YXJ0LCBlbmQsIHNlbGVjdGlvbklkKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5zZXJ0U25pcHBldChlZGl0b3I6IEVkaXRvciwgc25pcHBldFRleHQsIHVudXNlZD8pIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICBpZiAoZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpXG4gICAgICAgICAgICByZXR1cm4gc2VsZi5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgc25pcHBldFRleHQpO1xuXG4gICAgICAgIGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgc25pcHBldFRleHQpO1xuICAgICAgICB9LCBudWxsLCB7IGtlZXBPcmRlcjogdHJ1ZSB9KTtcblxuICAgICAgICBpZiAoZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0pIHtcbiAgICAgICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFNjb3BlKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLmdldFNlc3Npb24oKTtcbiAgICAgICAgdmFyIHNjb3BlID0gc2Vzc2lvbi4kbW9kZS4kaWQgfHwgXCJcIjtcbiAgICAgICAgc2NvcGUgPSBzY29wZS5zcGxpdChcIi9cIikucG9wKCk7XG4gICAgICAgIGlmIChzY29wZSA9PT0gXCJodG1sXCIgfHwgc2NvcGUgPT09IFwicGhwXCIpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBDb3VwbGluZyB0byBQSFA/XG4gICAgICAgICAgICAvLyBQSFAgaXMgYWN0dWFsbHkgSFRNTFxuICAgICAgICAgICAgaWYgKHNjb3BlID09PSBcInBocFwiICYmICFzZXNzaW9uLiRtb2RlWydpbmxpbmVQaHAnXSlcbiAgICAgICAgICAgICAgICBzY29wZSA9IFwiaHRtbFwiO1xuICAgICAgICAgICAgdmFyIGMgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUoYy5yb3cpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIHN0YXRlID0gc3RhdGVbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN1YnN0cmluZygwLCAzKSA9PSBcImpzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiamF2YXNjcmlwdFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcImNzcy1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcImNzc1wiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcInBocC1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcInBocFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBY3RpdmVTY29wZXMoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gdGhpcy4kZ2V0U2NvcGUoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNjb3BlcyA9IFtzY29wZV07XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICBpZiAoc25pcHBldE1hcFtzY29wZV0gJiYgc25pcHBldE1hcFtzY29wZV0uaW5jbHVkZVNjb3Blcykge1xuICAgICAgICAgICAgc2NvcGVzLnB1c2guYXBwbHkoc2NvcGVzLCBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKTtcbiAgICAgICAgfVxuICAgICAgICBzY29wZXMucHVzaChcIl9cIik7XG4gICAgICAgIHJldHVybiBzY29wZXM7XG4gICAgfVxuXG4gICAgcHVibGljIGV4cGFuZFdpdGhUYWIoZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnM/KTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3VsdDogYm9vbGVhbiA9IGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkgeyByZXR1cm4gc2VsZi5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgb3B0aW9ucyk7IH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuICAgICAgICBpZiAocmVzdWx0ICYmIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgYmVmb3JlID0gbGluZS5zdWJzdHJpbmcoMCwgY3Vyc29yLmNvbHVtbik7XG4gICAgICAgIHZhciBhZnRlciA9IGxpbmUuc3Vic3RyKGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldDtcbiAgICAgICAgdGhpcy5nZXRBY3RpdmVTY29wZXMoZWRpdG9yKS5zb21lKGZ1bmN0aW9uKHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgc25pcHBldHMgPSBzbmlwcGV0TWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzbmlwcGV0cylcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0gdGhpcy5maW5kTWF0Y2hpbmdTbmlwcGV0KHNuaXBwZXRzLCBiZWZvcmUsIGFmdGVyKTtcbiAgICAgICAgICAgIHJldHVybiAhIXNuaXBwZXQ7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBpZiAoIXNuaXBwZXQpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMuZHJ5UnVuKVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIHNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LFxuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiAtIHNuaXBwZXQucmVwbGFjZUJlZm9yZS5sZW5ndGgsXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uICsgc25pcHBldC5yZXBsYWNlQWZ0ZXIubGVuZ3RoXG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gc25pcHBldC5tYXRjaEJlZm9yZTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gc25pcHBldC5tYXRjaEFmdGVyO1xuICAgICAgICB0aGlzLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0LmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMudmFyaWFibGVzWydNX18nXSA9IHRoaXMudmFyaWFibGVzWydUX18nXSA9IG51bGw7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0TGlzdCwgYmVmb3JlLCBhZnRlcikge1xuICAgICAgICBmb3IgKHZhciBpID0gc25pcHBldExpc3QubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICB2YXIgcyA9IHNuaXBwZXRMaXN0W2ldO1xuICAgICAgICAgICAgaWYgKHMuc3RhcnRSZSAmJiAhcy5zdGFydFJlLnRlc3QoYmVmb3JlKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChzLmVuZFJlICYmICFzLmVuZFJlLnRlc3QoYWZ0ZXIpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCFzLnN0YXJ0UmUgJiYgIXMuZW5kUmUpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHMubWF0Y2hCZWZvcmUgPSBzLnN0YXJ0UmUgPyBzLnN0YXJ0UmUuZXhlYyhiZWZvcmUpIDogW1wiXCJdO1xuICAgICAgICAgICAgcy5tYXRjaEFmdGVyID0gcy5lbmRSZSA/IHMuZW5kUmUuZXhlYyhhZnRlcikgOiBbXCJcIl07XG4gICAgICAgICAgICBzLnJlcGxhY2VCZWZvcmUgPSBzLnRyaWdnZXJSZSA/IHMudHJpZ2dlclJlLmV4ZWMoYmVmb3JlKVswXSA6IFwiXCI7XG4gICAgICAgICAgICBzLnJlcGxhY2VBZnRlciA9IHMuZW5kVHJpZ2dlclJlID8gcy5lbmRUcmlnZ2VyUmUuZXhlYyhhZnRlcilbMF0gOiBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgcmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIHdyYXBSZWdleHAoc3JjKSB7XG4gICAgICAgICAgICBpZiAoc3JjICYmICEvXlxcXj9cXCguKlxcKVxcJD8kfF5cXFxcYiQvLnRlc3Qoc3JjKSlcbiAgICAgICAgICAgICAgICBzcmMgPSBcIig/OlwiICsgc3JjICsgXCIpXCI7XG5cbiAgICAgICAgICAgIHJldHVybiBzcmMgfHwgXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBndWFyZGVkUmVnZXhwKHJlLCBndWFyZCwgb3BlbmluZykge1xuICAgICAgICAgICAgcmUgPSB3cmFwUmVnZXhwKHJlKTtcbiAgICAgICAgICAgIGd1YXJkID0gd3JhcFJlZ2V4cChndWFyZCk7XG4gICAgICAgICAgICBpZiAob3BlbmluZykge1xuICAgICAgICAgICAgICAgIHJlID0gZ3VhcmQgKyByZTtcbiAgICAgICAgICAgICAgICBpZiAocmUgJiYgcmVbcmUubGVuZ3RoIC0gMV0gIT0gXCIkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJlID0gcmUgKyBcIiRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmUgPSByZSArIGd1YXJkO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVswXSAhPSBcIl5cIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSBcIl5cIiArIHJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAocmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU25pcHBldChzKSB7XG4gICAgICAgICAgICBpZiAoIXMuc2NvcGUpXG4gICAgICAgICAgICAgICAgcy5zY29wZSA9IHNjb3BlIHx8IFwiX1wiO1xuICAgICAgICAgICAgc2NvcGUgPSBzLnNjb3BlO1xuICAgICAgICAgICAgaWYgKCFzbmlwcGV0TWFwW3Njb3BlXSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdID0gW107XG4gICAgICAgICAgICAgICAgc25pcHBldE5hbWVNYXBbc2NvcGVdID0ge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TmFtZU1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAocy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9sZCA9IG1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChvbGQpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYudW5yZWdpc3RlcihvbGQpO1xuICAgICAgICAgICAgICAgIG1hcFtzLm5hbWVdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdLnB1c2gocyk7XG5cbiAgICAgICAgICAgIGlmIChzLnRhYlRyaWdnZXIgJiYgIXMudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgIGlmICghcy5ndWFyZCAmJiAvXlxcdy8udGVzdChzLnRhYlRyaWdnZXIpKVxuICAgICAgICAgICAgICAgICAgICBzLmd1YXJkID0gXCJcXFxcYlwiO1xuICAgICAgICAgICAgICAgIHMudHJpZ2dlciA9IGVzY2FwZVJlZ0V4cChzLnRhYlRyaWdnZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzLnN0YXJ0UmUgPSBndWFyZGVkUmVnZXhwKHMudHJpZ2dlciwgcy5ndWFyZCwgdHJ1ZSk7XG4gICAgICAgICAgICBzLnRyaWdnZXJSZSA9IG5ldyBSZWdFeHAocy50cmlnZ2VyLCBcIlwiKTtcblxuICAgICAgICAgICAgcy5lbmRSZSA9IGd1YXJkZWRSZWdleHAocy5lbmRUcmlnZ2VyLCBzLmVuZEd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMuZW5kVHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLmVuZFRyaWdnZXIsIFwiXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICBhZGRTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKGFkZFNuaXBwZXQpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcInJlZ2lzdGVyU25pcHBldHNcIiwgeyBzY29wZTogc2NvcGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bnJlZ2lzdGVyKHNuaXBwZXRzLCBzY29wZT8pIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlU25pcHBldChzKSB7XG4gICAgICAgICAgICB2YXIgbmFtZU1hcCA9IHNuaXBwZXROYW1lTWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgaWYgKG5hbWVNYXAgJiYgbmFtZU1hcFtzLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIG5hbWVNYXBbcy5uYW1lXTtcbiAgICAgICAgICAgICAgICB2YXIgbWFwID0gc25pcHBldE1hcFtzLnNjb3BlIHx8IHNjb3BlXTtcbiAgICAgICAgICAgICAgICB2YXIgaSA9IG1hcCAmJiBtYXAuaW5kZXhPZihzKTtcbiAgICAgICAgICAgICAgICBpZiAoaSA+PSAwKVxuICAgICAgICAgICAgICAgICAgICBtYXAuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzbmlwcGV0cy5jb250ZW50KVxuICAgICAgICAgICAgcmVtb3ZlU25pcHBldChzbmlwcGV0cyk7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoc25pcHBldHMpKVxuICAgICAgICAgICAgc25pcHBldHMuZm9yRWFjaChyZW1vdmVTbmlwcGV0KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGFyc2VTbmlwcGV0RmlsZShzdHIpIHtcbiAgICAgICAgc3RyID0gc3RyLnJlcGxhY2UoL1xcci9nLCBcIlwiKTtcbiAgICAgICAgdmFyIGxpc3QgPSBbXTtcbiAgICAgICAgdmFyIHNuaXBwZXQ6IGFueSA9IHt9O1xuICAgICAgICB2YXIgcmUgPSAvXiMuKnxeKHtbXFxzXFxTXSp9KVxccyokfF4oXFxTKykgKC4qKSR8XigoPzpcXG4qXFx0LiopKykvZ207XG4gICAgICAgIHZhciBtO1xuICAgICAgICB3aGlsZSAobSA9IHJlLmV4ZWMoc3RyKSkge1xuICAgICAgICAgICAgaWYgKG1bMV0pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0ID0gSlNPTi5wYXJzZShtWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgICAgICAgfSBpZiAobVs0XSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXQuY29udGVudCA9IG1bNF0ucmVwbGFjZSgvXlxcdC9nbSwgXCJcIik7XG4gICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB7fTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IG1bMl0sIHZhbCA9IG1bM107XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PSBcInJlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGd1YXJkUmUgPSAvXFwvKCg/OlteXFwvXFxcXF18XFxcXC4pKil8JC9nO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lmd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZFRyaWdnZXIgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5lbmRHdWFyZCA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09IFwic25pcHBldFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudGFiVHJpZ2dlciA9IHZhbC5tYXRjaCgvXlxcUyovKVswXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzbmlwcGV0Lm5hbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lm5hbWUgPSB2YWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldFtrZXldID0gdmFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbGlzdDtcbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRTbmlwcGV0QnlOYW1lKG5hbWUsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHNuaXBwZXRzW25hbWVdO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIHJldHVybiBzbmlwcGV0O1xuICAgIH1cbn1cblxuY2xhc3MgVGFic3RvcE1hbmFnZXIge1xuICAgIHByaXZhdGUgaW5kZXg6IG51bWJlcjtcbiAgICBwcml2YXRlIHJhbmdlcztcbiAgICBwcml2YXRlIHRhYnN0b3BzO1xuICAgIHByaXZhdGUgJG9wZW5UYWJzdG9wcztcbiAgICBwcml2YXRlIHNlbGVjdGVkVGFic3RvcDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUga2V5Ym9hcmRIYW5kbGVyID0gbmV3IEhhc2hIYW5kbGVyKCk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZXNzaW9uO1xuICAgIHByaXZhdGUgJG9uQWZ0ZXJFeGVjO1xuICAgIHByaXZhdGUgJGluQ2hhbmdlO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gdGhpcztcbiAgICAgICAgdGhpcy4kb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uID0gZGVsYXllZENhbGwodGhpcy5vbkNoYW5nZVNlbGVjdGlvbi5iaW5kKHRoaXMpKS5zY2hlZHVsZTtcbiAgICAgICAgdGhpcy4kb25DaGFuZ2VTZXNzaW9uID0gdGhpcy5vbkNoYW5nZVNlc3Npb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy4kb25BZnRlckV4ZWMgPSB0aGlzLm9uQWZ0ZXJFeGVjLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoKGVkaXRvcik7XG4gICAgICAgIHRoaXMua2V5Ym9hcmRIYW5kbGVyLmJpbmRLZXlzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNuaXBwZXRNYW5hZ2VyICYmIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIoZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiU2hpZnQtVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KC0xKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiRXNjXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiUmV0dXJuXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9lZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBhdHRhY2goZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBbXTtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLnRhYnN0b3BzLmZvckVhY2godGhpcy5yZW1vdmVUYWJzdG9wTWFya2VycywgdGhpcyk7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5vZmYoXCJhZnRlckV4ZWNcIiwgdGhpcy4kb25BZnRlckV4ZWMpO1xuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLnJlbW92ZUtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZShlLyo6IENoYW5nZSovLCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgY2hhbmdlUmFuZ2UgPSBlLmRhdGEucmFuZ2U7XG4gICAgICAgIHZhciBpc1JlbW92ZSA9IGUuZGF0YS5hY3Rpb25bMF0gPT0gXCJyXCI7XG4gICAgICAgIHZhciBzdGFydCA9IGNoYW5nZVJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gY2hhbmdlUmFuZ2UuZW5kO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBzdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBlbmQucm93O1xuICAgICAgICB2YXIgbGluZURpZiA9IGVuZFJvdyAtIHN0YXJ0Um93O1xuICAgICAgICB2YXIgY29sRGlmZiA9IGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW47XG5cbiAgICAgICAgaWYgKGlzUmVtb3ZlKSB7XG4gICAgICAgICAgICBsaW5lRGlmID0gLWxpbmVEaWY7XG4gICAgICAgICAgICBjb2xEaWZmID0gLWNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLiRpbkNoYW5nZSAmJiBpc1JlbW92ZSkge1xuICAgICAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZE91dHNpZGUgPSB0cyAmJiAhdHMuc29tZShmdW5jdGlvbihyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVQb2ludHMoci5zdGFydCwgc3RhcnQpIDw9IDAgJiYgY29tcGFyZVBvaW50cyhyLmVuZCwgZW5kKSA+PSAwO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlZE91dHNpZGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMucmFuZ2VzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHIgPSByYW5nZXNbaV07XG4gICAgICAgICAgICBpZiAoci5lbmQucm93IDwgc3RhcnQucm93KVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAoaXNSZW1vdmUgJiYgY29tcGFyZVBvaW50cyhzdGFydCwgci5zdGFydCkgPCAwICYmIGNvbXBhcmVQb2ludHMoZW5kLCByLmVuZCkgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVSYW5nZShyKTtcbiAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA9PSBzdGFydFJvdyAmJiByLnN0YXJ0LmNvbHVtbiA+IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA9PSBzdGFydFJvdyAmJiByLmVuZC5jb2x1bW4gPj0gc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgIHIuZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuc3RhcnQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuc3RhcnQucm93ICs9IGxpbmVEaWY7XG4gICAgICAgICAgICBpZiAoci5lbmQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuZW5kLnJvdyArPSBsaW5lRGlmO1xuXG4gICAgICAgICAgICBpZiAoY29tcGFyZVBvaW50cyhyLnN0YXJ0LCByLmVuZCkgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUxpbmtlZEZpZWxkcygpIHtcbiAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmhhc0xpbmtlZFJhbmdlcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLmdldFNlc3Npb24oKTtcbiAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZSh0cy5maXJzdE5vbkxpbmtlZCk7XG4gICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRzW2ldO1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5saW5rZWQpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgZm10ID0gc25pcHBldE1hbmFnZXIudG1TdHJGb3JtYXQodGV4dCwgcmFuZ2Uub3JpZ2luYWwpO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBmbXQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkFmdGVyRXhlYyhlKSB7XG4gICAgICAgIGlmIChlLmNvbW1hbmQgJiYgIWUuY29tbWFuZC5yZWFkT25seSlcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGlua2VkRmllbGRzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlbGVjdGlvbihldmVudCwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24ubGVhZDtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5hbmNob3I7XG4gICAgICAgIHZhciBpc0VtcHR5ID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBjb250YWluc0xlYWQgPSB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zQW5jaG9yID0gaXNFbXB0eSB8fCB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjb250YWluc0xlYWQgJiYgY29udGFpbnNBbmNob3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlc3Npb24oZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0YWJOZXh0KGRpcikge1xuICAgICAgICB2YXIgbWF4ID0gdGhpcy50YWJzdG9wcy5sZW5ndGg7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuaW5kZXggKyAoZGlyIHx8IDEpO1xuICAgICAgICBpbmRleCA9IE1hdGgubWluKE1hdGgubWF4KGluZGV4LCAxKSwgbWF4KTtcbiAgICAgICAgaWYgKGluZGV4ID09IG1heClcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZWxlY3RUYWJzdG9wKGluZGV4KTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAwKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdFRhYnN0b3AoaW5kZXg6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAodHMpXG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKHRzKTtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IHRzO1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzZWwgPSB0aGlzLmVkaXRvclsnbXVsdGlTZWxlY3QnXTtcbiAgICAgICAgICAgIHNlbC50b1NpbmdsZVJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkLmNsb25lKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICh0cy5oYXNMaW5rZWRSYW5nZXMgJiYgdHNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2UodHNbaV0uY2xvbmUoKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0b2RvIGludmVzdGlnYXRlIHdoeSBpcyB0aGlzIG5lZWRlZFxuICAgICAgICAgICAgaWYgKHNlbC5yYW5nZXNbMF0pXG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHNlbC5yYW5nZXNbMF0uY2xvbmUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRUYWJzdG9wcyA9IGZ1bmN0aW9uKHRhYnN0b3BzLCBzdGFydCwgZW5kLCB1bnVzZWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRvcGVuVGFic3RvcHMpXG4gICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBbXTtcbiAgICAgICAgLy8gYWRkIGZpbmFsIHRhYnN0b3AgaWYgbWlzc2luZ1xuICAgICAgICBpZiAoIXRhYnN0b3BzWzBdKSB7XG4gICAgICAgICAgICB2YXIgcCA9IFJhbmdlLmZyb21Qb2ludHMoZW5kLCBlbmQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0gPSBbcF07XG4gICAgICAgICAgICB0YWJzdG9wc1swXS5pbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHZhciBhcmcgPSBbaSArIDEsIDBdO1xuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gfHwgdHM7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHRzW2ldO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhwLnN0YXJ0LCBwLmVuZCB8fCBwLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2Uuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2UuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgcmFuZ2Uub3JpZ2luYWwgPSBwO1xuICAgICAgICAgICAgICAgIHJhbmdlLnRhYnN0b3AgPSBkZXN0O1xuICAgICAgICAgICAgICAgIHJhbmdlcy5wdXNoKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVzdCAhPSB0cylcbiAgICAgICAgICAgICAgICAgICAgZGVzdC51bnNoaWZ0KHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlc3RbaV0gPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocC5mbXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UubGlua2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QuZmlyc3ROb25MaW5rZWQgPSByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGRlc3QgPT09IHRzKSB7XG4gICAgICAgICAgICAgICAgYXJnLnB1c2goZGVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSA9IGRlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKGRlc3QpO1xuICAgICAgICB9LCB0aGlzKTtcblxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gYWRkaW5nIG5ldyBzbmlwcGV0IGluc2lkZSBleGlzdGluZyBvbmUsIG1ha2Ugc3VyZSAwIHRhYnN0b3AgaXMgYXQgdGhlIGVuZFxuICAgICAgICAgICAgaWYgKHRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGFyZy5zcGxpY2UoMiwgMSlbMF0pO1xuICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UuYXBwbHkodGhpcy50YWJzdG9wcywgYXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UvKjogcm0uUmFuZ2UqLykge1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5tYXJrZXJJZClcbiAgICAgICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zbmlwcGV0LW1hcmtlclwiLCBcInRleHRcIik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVSYW5nZSA9IGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHZhciBpID0gcmFuZ2UudGFic3RvcC5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgcmFuZ2UudGFic3RvcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGkgPSB0aGlzLnJhbmdlcy5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgdGhpcy5yYW5nZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmVkaXRvci5zZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgIGlmICghcmFuZ2UudGFic3RvcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGkgPSB0aGlzLnRhYnN0b3BzLmluZGV4T2YocmFuZ2UudGFic3RvcCk7XG4gICAgICAgICAgICBpZiAoaSAhPSAtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGlmICghdGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIGNoYW5nZVRyYWNrZXI6IGFueSA9IHt9O1xuY2hhbmdlVHJhY2tlci5vbkNoYW5nZSA9IEFuY2hvci5wcm90b3R5cGUub25DaGFuZ2U7XG5jaGFuZ2VUcmFja2VyLnNldFBvc2l0aW9uID0gZnVuY3Rpb24ocm93LCBjb2x1bW4pIHtcbiAgICB0aGlzLnBvcy5yb3cgPSByb3c7XG4gICAgdGhpcy5wb3MuY29sdW1uID0gY29sdW1uO1xufTtcbmNoYW5nZVRyYWNrZXIudXBkYXRlID0gZnVuY3Rpb24ocG9zLCBkZWx0YSwgJGluc2VydFJpZ2h0KSB7XG4gICAgdGhpcy4kaW5zZXJ0UmlnaHQgPSAkaW5zZXJ0UmlnaHQ7XG4gICAgdGhpcy5wb3MgPSBwb3M7XG4gICAgdGhpcy5vbkNoYW5nZShkZWx0YSk7XG59O1xuXG52YXIgbW92ZVBvaW50ID0gZnVuY3Rpb24ocG9pbnQsIGRpZmYpIHtcbiAgICBpZiAocG9pbnQucm93ID09IDApXG4gICAgICAgIHBvaW50LmNvbHVtbiArPSBkaWZmLmNvbHVtbjtcbiAgICBwb2ludC5yb3cgKz0gZGlmZi5yb3c7XG59O1xuXG52YXIgbW92ZVJlbGF0aXZlID0gZnVuY3Rpb24ocG9pbnQsIHN0YXJ0KSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSBzdGFydC5yb3cpXG4gICAgICAgIHBvaW50LmNvbHVtbiAtPSBzdGFydC5jb2x1bW47XG4gICAgcG9pbnQucm93IC09IHN0YXJ0LnJvdztcbn07XG5cblxuaW1wb3J0Q3NzU3RyaW5nKFwiXFxcbi5hY2Vfc25pcHBldC1tYXJrZXIge1xcXG4gICAgLW1vei1ib3gtc2l6aW5nOiBib3JkZXItYm94O1xcXG4gICAgYm94LXNpemluZzogYm9yZGVyLWJveDtcXFxuICAgIGJhY2tncm91bmQ6IHJnYmEoMTk0LCAxOTMsIDIwOCwgMC4wOSk7XFxcbiAgICBib3JkZXI6IDFweCBkb3R0ZWQgcmdiYSgyMTEsIDIwOCwgMjM1LCAwLjYyKTtcXFxuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXFxufVwiKTtcblxuZXhwb3J0IHZhciBzbmlwcGV0TWFuYWdlciA9IG5ldyBTbmlwcGV0TWFuYWdlcigpO1xuXG4oZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5pbnNlcnRTbmlwcGV0ID0gZnVuY3Rpb24oY29udGVudCwgb3B0aW9ucykge1xuICAgICAgICByZXR1cm4gc25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCh0aGlzLCBjb250ZW50LCBvcHRpb25zKTtcbiAgICB9O1xuICAgIHRoaXMuZXhwYW5kU25pcHBldCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIodGhpcywgb3B0aW9ucyk7XG4gICAgfTtcbn0pLmNhbGwoRWRpdG9yLnByb3RvdHlwZSk7XG4iXX0=