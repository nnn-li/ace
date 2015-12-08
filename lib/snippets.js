import { importCssString } from "./lib/dom";
import { EventEmitterClass } from "./lib/event_emitter";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiT0E4Qk8sRUFBQyxlQUFlLEVBQUMsTUFBTSxXQUFXO09BQ2xDLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxxQkFBcUI7T0FDOUMsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxLQUFLLE1BQU0sU0FBUztPQUNwQixhQUFhLE1BQU0saUJBQWlCO09BQ3BDLE1BQU0sTUFBTSxVQUFVO09BQ3RCLFdBQVcsTUFBTSx3QkFBd0I7T0FDekMsU0FBUyxNQUFNLGFBQWE7T0FDNUIsTUFBTSxNQUFNLFVBQVU7QUFFN0IsSUFBSSxlQUFlLEdBQUcsZ0JBQWdCLENBQUM7QUFFdkMsZ0JBQWdCLEVBQUU7SUFDZEEsTUFBTUEsQ0FBQ0EsV0FBV0EsR0FBR0EsRUFBRUEsR0FBR0EsVUFBVUEsQ0FBQ0E7QUFDekNBLENBQUNBO0FBQ0Qsc0JBQXNCLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSztJQUMvQkMsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxTQUFTQSxFQUFFQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUM5Q0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7QUFDM0JBLENBQUNBO0FBRUQsb0NBQW9DLGlCQUFpQjtJQUtqREM7UUFDSUMsT0FBT0EsQ0FBQ0E7UUFMTEEsZUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsbUJBQWNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3BCQSxjQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUl2QkEsQ0FBQ0E7SUF1R09ELFlBQVlBO1FBQ2hCRSxjQUFjQSxDQUFDQSxTQUFTQSxDQUFDQSxZQUFZQSxHQUFHQTtZQUNwQyxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztRQUNyQyxDQUFDLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLFVBQVVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVPRixpQkFBaUJBLENBQUNBLEdBQUdBLEVBQUVBLFVBQVdBO1FBQ3RDRyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFTQSxDQUFDQTtZQUMzRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDeEIsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUVPSCxnQkFBZ0JBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBO1FBQ2pDSSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQ0RBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBRWhDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN2QkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsS0FBS0EsY0FBY0E7Z0JBQ2ZBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1lBRTdCQSxLQUFLQSxXQUFXQSxDQUFDQTtZQUNqQkEsS0FBS0EsZUFBZUE7Z0JBQ2hCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3QkEsS0FBS0EsY0FBY0E7Z0JBQ2ZBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDckRBLEtBQUtBLFdBQVdBO2dCQUNaQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxLQUFLQSxZQUFZQTtnQkFDYkEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM3Q0EsS0FBS0EsYUFBYUE7Z0JBQ2RBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLEtBQUtBLFdBQVdBO2dCQUNaQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxFQUFFQSxHQUFHQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUM3Q0EsS0FBS0EsVUFBVUE7Z0JBQ1hBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1lBRTFCQSxLQUFLQSxVQUFVQSxDQUFDQTtZQUNoQkEsS0FBS0EsVUFBVUE7Z0JBQ1hBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1lBQ2RBLEtBQUtBLFVBQVVBO2dCQUNYQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDT0osZ0JBQWdCQSxDQUFDQSxNQUFNQSxFQUFFQSxPQUFPQTtRQUNwQ0ssRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBQzFEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO0lBQ3hEQSxDQUFDQTtJQUdNTCxXQUFXQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxFQUFFQSxNQUFPQTtRQUMvQk0sSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDekJBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBO1FBQ2xCQSxFQUFFQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMvQ0EsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUMvREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDakJBLElBQUlBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLEVBQUVBO1lBQzVCLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsU0FBUyxDQUFDO1lBQ2xDLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDekQsSUFBSSxXQUFXLEdBQUcsR0FBRyxDQUFDO1lBQ3RCLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3ZDLElBQUksRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckIsRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFFLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDeEIsUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztvQkFDakIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQzt3QkFDNUIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDM0IsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUM7NEJBQ2xDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLElBQUksR0FBRyxDQUFDO2dDQUNyQixRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDOzRCQUN4QyxJQUFJO2dDQUNBLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7NEJBQ3hDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDckMsQ0FBQztvQkFDTCxDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQzt3QkFDdkIsV0FBVyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUM7b0JBQ2hDLENBQUM7Z0JBQ0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzVCLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ25DLENBQUM7Z0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUM1QixRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNuQyxDQUFDO1lBQ0wsQ0FBQztZQUNELE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDNUJBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQUVPTixnQkFBZ0JBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BO1FBQ3BDTyxJQUFJQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNoQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdENBLElBQUlBLEVBQUVBLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDakJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNuREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7b0JBQ3RCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDeENBLEVBQUVBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNqQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDUkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBQ25CQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDakJBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO3dCQUNSQSxFQUFFQSxDQUFDQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQSxVQUFVQSxDQUFDQTtvQkFDNUJBLENBQUNBO29CQUFDQSxJQUFJQTt3QkFDRkEsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxrQkFBa0JBLEVBQUVBO1lBQ2hCQyxJQUFJQSxFQUFFQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RELE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUVPUCx5QkFBeUJBLENBQUNBLE1BQWNBLEVBQUVBLFdBQVdBO1FBQ3pEUyxJQUFJQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQ3hDQSxJQUFJQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM5Q0EsSUFBSUEsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDOUNBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXpDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNwQ0EsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFeERBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0NBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFVBQVNBLENBQUNBO1lBQzFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUM7Z0JBQ1YsTUFBTSxDQUFDLENBQUMsR0FBRyxZQUFZLENBQUM7WUFDNUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksUUFBUSxDQUFDO2dCQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDbEJBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3hCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQztnQkFDckIsTUFBTSxDQUFDO1lBQ1gsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNyQixJQUFJLEVBQUUsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNOLEVBQUUsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUN2QixFQUFFLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDZCxFQUFFLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQztZQUNsQixDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDckIsTUFBTSxDQUFDO1lBQ1gsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNYLElBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNsQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1YsTUFBTSxDQUFDO1lBRVgsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BDLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBUyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFFBQVEsQ0FBQSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hFLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixFQUFFLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNyQixDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLElBQUksT0FBTyxFQUFFLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckUsRUFBRSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzlCLENBQUM7UUFDTCxDQUFDLENBQUNBLENBQUNBO1FBR0hBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLEVBQUVBLElBQUksRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNuQkEsbUJBQW1CQSxHQUFHQTtZQUNsQkMsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ2xDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTt3QkFDdkJBLFFBQVFBLENBQUNBO29CQUNiQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbENBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO2dCQUM5Q0EsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2hCQSxDQUFDQTtZQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFDREQsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQTtnQkFDckJBLFFBQVFBLENBQUNBO1lBQ2JBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBO1lBQ3JCQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWhCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDcEJBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO2dCQUV6QkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFFREEsSUFBSUEsRUFBRUEsR0FBR0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLEdBQUdBLEdBQUdBLE9BQU9BLEVBQUVBLENBQUNBLEtBQUtBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3pFQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4Q0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7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QVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3JEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFT2YsbUJBQW1CQSxDQUFDQSxXQUFXQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQTtRQUNsRGdCLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLFdBQVdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxHQUFHQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxRQUFRQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDaENBLFFBQVFBLENBQUNBO1lBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO2dCQUN2QkEsUUFBUUEsQ0FBQ0E7WUFFYkEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDMURBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNB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Q0FBQ0E7UUFDREEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDekJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3RCQSxRQUFRQSxDQUFDQTtZQUViQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ0pBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN6REEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN0REEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBO2dCQUN4QkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBO2dCQUN0QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFFekJBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNsQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUVPSixrQkFBa0JBO1FBQ3RCSyxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZUFBZUEsQ0FBQ0E7WUFDM0JBLE1BQU1BLENBQUNBO1FBQ1hBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNsQ0EsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBO1lBQzNCQSxJQUFJQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ2RBLFFBQVFBLENBQUNBO1lBQ2JBLElBQUlBLEdBQUdBLEdBQUdBLGNBQWNBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzNEQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDM0JBLENBQUNBO0lBRU9MLFdBQVdBLENBQUNBLENBQUNBO1FBQ2pCTSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFFT04saUJBQWlCQTtRQUNyQk8sRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDYkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDdENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBO1FBQzFDQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtRQUM5Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN0QkEsUUFBUUEsQ0FBQ0E7WUFDYkEsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLElBQUlBLGNBQWNBLEdBQUdBLE9BQU9BLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ25GQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxJQUFJQSxjQUFjQSxDQUFDQTtnQkFDL0JBLE1BQU1BLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUVPUCxlQUFlQTtRQUNuQlEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7SUFDbEJBLENBQUNBO0lBRU9SLE9BQU9BLENBQUNBLEdBQUdBO1FBQ2ZTLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1FBQy9CQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDMUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEdBQUdBLENBQUNBO1lBQ2JBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNaQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFFT1QsYUFBYUEsQ0FBQ0EsS0FBS0E7UUFDdkJVLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBO1FBQzFCQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDSEEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMvQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDbkJBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1B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LGNBQWMsRUFBRSxDQUFDO0FBRWpELENBQUM7SUFDRyxJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVMsT0FBTyxFQUFFLE9BQU87UUFDMUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRSxDQUFDLENBQUM7SUFDRixJQUFJLENBQUMsYUFBYSxHQUFHLFVBQVMsT0FBTztRQUNqQyxNQUFNLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkQsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge2ltcG9ydENzc1N0cmluZ30gZnJvbSBcIi4vbGliL2RvbVwiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIGVzY2FwZVJlZ0V4cH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IGNvbXBhcmVQb2ludHMgZnJvbSBcIi4vY29tcGFyZVBvaW50c1wiXG5pbXBvcnQgQW5jaG9yIGZyb20gXCIuL0FuY2hvclwiO1xuaW1wb3J0IEhhc2hIYW5kbGVyIGZyb20gXCIuL2tleWJvYXJkL0hhc2hIYW5kbGVyXCI7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gXCIuL1Rva2VuaXplclwiO1xuaW1wb3J0IEVkaXRvciBmcm9tICcuL0VkaXRvcic7XG5cbnZhciBUQUJTVE9QX01BTkFHRVIgPSAndGFic3RvcE1hbmFnZXInO1xuXG5mdW5jdGlvbiBlc2NhcGUoY2gpIHtcbiAgICByZXR1cm4gXCIoPzpbXlxcXFxcXFxcXCIgKyBjaCArIFwiXXxcXFxcXFxcXC4pXCI7XG59XG5mdW5jdGlvbiBUYWJzdG9wVG9rZW4oc3RyLCBfLCBzdGFjayk6IGFueVtdIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDEpO1xuICAgIGlmICgvXlxcZCskLy50ZXN0KHN0cikgJiYgIXN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBbeyB0YWJzdG9wSWQ6IHBhcnNlSW50KHN0ciwgMTApIH1dO1xuICAgIH1cbiAgICByZXR1cm4gW3sgdGV4dDogc3RyIH1dO1xufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldE1hbmFnZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIHNuaXBwZXRNYXAgPSB7fTtcbiAgICBwcml2YXRlIHNuaXBwZXROYW1lTWFwID0ge307XG4gICAgcHJpdmF0ZSB2YXJpYWJsZXMgPSB7fTtcblxuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcigpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc3RhdGljICR0b2tlbml6ZXIgPSBuZXcgVG9rZW5pemVyKHtcbiAgICAgICAgc3RhcnQ6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogLzovLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKTogYW55IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YWNrLmxlbmd0aCAmJiBzdGFja1swXS5leHBlY3RJZikge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uZXhwZWN0SWYgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmVsc2VCcmFuY2ggPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbc3RhY2tbMF1dO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIjpcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFxcXC4vLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaCA9IHZhbFsxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoID09IFwifVwiICYmIHN0YWNrLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gY2g7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoXCJgJFxcXFxcIi5pbmRleE9mKGNoKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gY2g7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhY2suaW5Gb3JtYXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIm5cIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoY2ggPT0gXCJ0XCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKFwidWxVTEVcIi5pbmRleE9mKGNoKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHsgY2hhbmdlQ2FzZTogY2gsIGxvY2FsOiBjaCA+IFwiYVwiIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3ZhbF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL30vLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbc3RhY2subGVuZ3RoID8gc3RhY2suc2hpZnQoKSA6IHZhbF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcJCg/OlxcZCt8XFx3KykvLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IFRhYnN0b3BUb2tlblxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcJFxce1tcXGRBLVpfYS16XSsvLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHN0ciwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ID0gVGFic3RvcFRva2VuKHN0ci5zdWJzdHIoMSksIHN0YXRlLCBzdGFjayk7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnVuc2hpZnQodFswXSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0O1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic25pcHBldFZhclwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFxuLyxcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJuZXdsaW5lXCIsXG4gICAgICAgICAgICAgICAgbWVyZ2U6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIHNuaXBwZXRWYXI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcfFwiICsgZXNjYXBlKFwiXFxcXHxcIikgKyBcIipcXFxcfFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jaG9pY2VzID0gdmFsLnNsaWNlKDEsIC0xKS5zcGxpdChcIixcIik7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIi8oXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIrKS8oPzooXCIgKyBlc2NhcGUoXCIvXCIpICsgXCIqKS8pKFxcXFx3Kik6P1wiLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0cyA9IHN0YWNrWzBdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXRTdHJpbmcgPSB2YWw7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFsID0gdGhpcy5zcGxpdFJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZ3VhcmQgPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZtdCA9IHZhbFsyXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZmxhZyA9IHZhbFszXTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcImBcIiArIGVzY2FwZShcImBcIikgKyBcIipgXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmNvZGUgPSB2YWwuc3BsaWNlKDEsIC0xKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFw/XCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFja1swXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IHJlZ2V4OiBcIihbXjp9XFxcXFxcXFxdfFxcXFxcXFxcLikqOj9cIiwgdG9rZW46IFwiXCIsIG5leHQ6IFwic3RhcnRcIiB9XG4gICAgICAgIF0sXG4gICAgICAgIGZvcm1hdFN0cmluZzogW1xuICAgICAgICAgICAgeyByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvXCIsIHRva2VuOiBcInJlZ2V4XCIgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2suaW5Gb3JtYXRTdHJpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICBwcml2YXRlIGdldFRva2VuaXplcigpIHtcbiAgICAgICAgU25pcHBldE1hbmFnZXIucHJvdG90eXBlLmdldFRva2VuaXplciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIFNuaXBwZXRNYW5hZ2VyLiR0b2tlbml6ZXI7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgIH1cblxuICAgIHByaXZhdGUgdG9rZW5pemVUbVNuaXBwZXQoc3RyLCBzdGFydFN0YXRlPykge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRUb2tlbml6ZXIoKS5nZXRMaW5lVG9rZW5zKHN0ciwgc3RhcnRTdGF0ZSkudG9rZW5zLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICByZXR1cm4geC52YWx1ZSB8fCB4O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXREZWZhdWx0VmFsdWUoZWRpdG9yLCBuYW1lKSB7XG4gICAgICAgIGlmICgvXltBLVpdXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHZhciBpID0gbmFtZS5zdWJzdHIoMSk7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMudmFyaWFibGVzW25hbWVbMF0gKyBcIl9fXCJdIHx8IHt9KVtpXTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoL15cXGQrJC8udGVzdChuYW1lKSkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1snX18nXSB8fCB7fSlbbmFtZV07XG4gICAgICAgIH1cbiAgICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvXlRNXy8sIFwiXCIpO1xuXG4gICAgICAgIGlmICghZWRpdG9yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgcyA9IGVkaXRvci5zZXNzaW9uO1xuICAgICAgICBzd2l0Y2ggKG5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJDVVJSRU5UX1dPUkRcIjpcbiAgICAgICAgICAgICAgICB2YXIgciA9IHMuZ2V0V29yZFJhbmdlKCk7XG4gICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICBjYXNlIFwiU0VMRUNUSU9OXCI6XG4gICAgICAgICAgICBjYXNlIFwiU0VMRUNURURfVEVYVFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFRleHRSYW5nZShyKTtcbiAgICAgICAgICAgIGNhc2UgXCJDVVJSRU5UX0xJTkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyk7XG4gICAgICAgICAgICBjYXNlIFwiUFJFVl9MSU5FXCI6IC8vIG5vdCBwb3NzaWJsZSBpbiB0ZXh0bWF0ZVxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldExpbmUoZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93IC0gMSk7XG4gICAgICAgICAgICBjYXNlIFwiTElORV9JTkRFWFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5jb2x1bW47XG4gICAgICAgICAgICBjYXNlIFwiTElORV9OVU1CRVJcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkucm93ICsgMTtcbiAgICAgICAgICAgIGNhc2UgXCJTT0ZUX1RBQlNcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRVc2VTb2Z0VGFicygpID8gXCJZRVNcIiA6IFwiTk9cIjtcbiAgICAgICAgICAgIGNhc2UgXCJUQUJfU0laRVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBzLmdldFRhYlNpemUoKTtcbiAgICAgICAgICAgIC8vIGRlZmF1bHQgYnV0IGNhbid0IGZpbGwgOihcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFTkFNRVwiOlxuICAgICAgICAgICAgY2FzZSBcIkZJTEVQQVRIXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICBjYXNlIFwiRlVMTE5BTUVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJBY2VcIjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBwcml2YXRlIGdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCB2YXJOYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLnZhcmlhYmxlcy5oYXNPd25Qcm9wZXJ0eSh2YXJOYW1lKSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnZhcmlhYmxlc1t2YXJOYW1lXShlZGl0b3IsIHZhck5hbWUpIHx8IFwiXCI7XG4gICAgICAgIHJldHVybiB0aGlzLiRnZXREZWZhdWx0VmFsdWUoZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgc3RyaW5nIGZvcm1hdHRlZCBhY2NvcmRpbmcgdG8gaHR0cDovL21hbnVhbC5tYWNyb21hdGVzLmNvbS9lbi9yZWd1bGFyX2V4cHJlc3Npb25zI3JlcGxhY2VtZW50X3N0cmluZ19zeW50YXhfZm9ybWF0X3N0cmluZ3NcbiAgICBwdWJsaWMgdG1TdHJGb3JtYXQoc3RyLCBjaCwgZWRpdG9yPykge1xuICAgICAgICB2YXIgZmxhZyA9IGNoLmZsYWcgfHwgXCJcIjtcbiAgICAgICAgdmFyIHJlID0gY2guZ3VhcmQ7XG4gICAgICAgIHJlID0gbmV3IFJlZ0V4cChyZSwgZmxhZy5yZXBsYWNlKC9bXmdpXS8sIFwiXCIpKTtcbiAgICAgICAgdmFyIGZtdFRva2VucyA9IHRoaXMudG9rZW5pemVUbVNuaXBwZXQoY2guZm10LCBcImZvcm1hdFN0cmluZ1wiKTtcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdmFyIGZvcm1hdHRlZCA9IHN0ci5yZXBsYWNlKHJlLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnZhcmlhYmxlc1snX18nXSA9IGFyZ3VtZW50cztcbiAgICAgICAgICAgIHZhciBmbXRQYXJ0cyA9IF9zZWxmLnJlc29sdmVWYXJpYWJsZXMoZm10VG9rZW5zLCBlZGl0b3IpO1xuICAgICAgICAgICAgdmFyIGdDaGFuZ2VDYXNlID0gXCJFXCI7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZtdFBhcnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNoID0gZm10UGFydHNbaV07XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoLmNoYW5nZUNhc2UgJiYgY2gubG9jYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXh0ID0gZm10UGFydHNbaSArIDFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5leHQgJiYgdHlwZW9mIG5leHQgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlID09IFwidVwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gbmV4dFswXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2kgKyAxXSA9IG5leHQuc3Vic3RyKDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNoLmNoYW5nZUNhc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdDaGFuZ2VDYXNlID0gY2guY2hhbmdlQ2FzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZ0NoYW5nZUNhc2UgPT0gXCJVXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBjaC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZ0NoYW5nZUNhc2UgPT0gXCJMXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBjaC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmbXRQYXJ0cy5qb2luKFwiXCIpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ19fJ10gPSBudWxsO1xuICAgICAgICByZXR1cm4gZm9ybWF0dGVkO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzb2x2ZVZhcmlhYmxlcyhzbmlwcGV0LCBlZGl0b3IpIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNuaXBwZXQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjaCA9IHNuaXBwZXRbaV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNoID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjaCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjaCAhPSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnNraXApIHtcbiAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnByb2Nlc3NlZCA8IGkpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2gudGV4dCkge1xuICAgICAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRoaXMuZ2V0VmFyaWFibGVWYWx1ZShlZGl0b3IsIGNoLnRleHQpO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiBjaC5mbXRTdHJpbmcpXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy50bVN0ckZvcm1hdCh2YWx1ZSwgY2gpO1xuICAgICAgICAgICAgICAgIGNoLnByb2Nlc3NlZCA9IGk7XG4gICAgICAgICAgICAgICAgaWYgKGNoLmV4cGVjdElmID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoLnNraXAgPSBjaC5lbHNlQnJhbmNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGdvdG9OZXh0KGNoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRhYnN0b3BJZCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaChjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZ290b05leHQoY2gpIHtcbiAgICAgICAgICAgIHZhciBpMSA9IHNuaXBwZXQuaW5kZXhPZihjaCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxICE9IC0xKVxuICAgICAgICAgICAgICAgIGkgPSBpMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3I6IEVkaXRvciwgc25pcHBldFRleHQpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgbGluZSA9IGVkaXRvci5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciB0YWJTdHJpbmcgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcbiAgICAgICAgdmFyIGluZGVudFN0cmluZyA9IGxpbmUubWF0Y2goL15cXHMqLylbMF07XG5cbiAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPCBpbmRlbnRTdHJpbmcubGVuZ3RoKVxuICAgICAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnNsaWNlKDAsIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIHZhciB0b2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KHNuaXBwZXRUZXh0KTtcbiAgICAgICAgdG9rZW5zID0gdGhpcy5yZXNvbHZlVmFyaWFibGVzKHRva2VucywgZWRpdG9yKTtcbiAgICAgICAgLy8gaW5kZW50XG4gICAgICAgIHRva2VucyA9IHRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgaWYgKHggPT0gXCJcXG5cIilcbiAgICAgICAgICAgICAgICByZXR1cm4geCArIGluZGVudFN0cmluZztcbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHJldHVybiB4LnJlcGxhY2UoL1xcdC9nLCB0YWJTdHJpbmcpO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0YWJzdG9wIHZhbHVlc1xuICAgICAgICB2YXIgdGFic3RvcHMgPSBbXTtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24ocCwgaSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICBpZiAoIXRzKSB7XG4gICAgICAgICAgICAgICAgdHMgPSB0YWJzdG9wc1tpZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB0cy5pbmRleCA9IGlkO1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApICE9PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxID09PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vucy5zbGljZShpICsgMSwgaTEpO1xuICAgICAgICAgICAgdmFyIGlzTmVzdGVkID0gdmFsdWUuc29tZShmdW5jdGlvbih0KSB7IHJldHVybiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiB9KTtcbiAgICAgICAgICAgIGlmIChpc05lc3RlZCAmJiAhdHMudmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZS5sZW5ndGggJiYgKCF0cy52YWx1ZSB8fCB0eXBlb2YgdHMudmFsdWUgIT09IFwic3RyaW5nXCIpKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZS5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBleHBhbmQgdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdGFic3RvcHMuZm9yRWFjaChmdW5jdGlvbih0cykgeyB0cy5sZW5ndGggPSAwIH0pO1xuICAgICAgICB2YXIgZXhwYW5kaW5nID0ge307XG4gICAgICAgIGZ1bmN0aW9uIGNvcHlWYWx1ZSh2YWwpIHtcbiAgICAgICAgICAgIHZhciBjb3B5ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZhbC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBwID0gdmFsW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcCA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbcC50YWJzdG9wSWRdKVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIHZhciBqID0gdmFsLmxhc3RJbmRleE9mKHAsIGkgLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGNvcHlbal0gfHwgeyB0YWJzdG9wSWQ6IHAudGFic3RvcElkIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvcHlbaV0gPSBwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvcHk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBwID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgaWQgPSBwLnRhYnN0b3BJZDtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgcmVhY2hlZCBjbG9zaW5nIGJyYWNrZXQgY2xlYXIgZXhwYW5kaW5nIHN0YXRlXG4gICAgICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1tpZF0gPT09IHApXG4gICAgICAgICAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBudWxsO1xuICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSBqdXN0IGlnbm9yZSByZWN1cnNpdmUgdGFic3RvcFxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICB2YXIgYXJnID0gdHlwZW9mIHRzLnZhbHVlID09IFwic3RyaW5nXCIgPyBbdHMudmFsdWVdIDogY29weVZhbHVlKHRzLnZhbHVlKTtcbiAgICAgICAgICAgIGFyZy51bnNoaWZ0KGkgKyAxLCBNYXRoLm1heCgwLCBpMSAtIGkpKTtcbiAgICAgICAgICAgIGFyZy5wdXNoKHApO1xuICAgICAgICAgICAgZXhwYW5kaW5nW2lkXSA9IHA7XG4gICAgICAgICAgICB0b2tlbnMuc3BsaWNlLmFwcGx5KHRva2VucywgYXJnKTtcblxuICAgICAgICAgICAgaWYgKHRzLmluZGV4T2YocCkgPT09IC0xKVxuICAgICAgICAgICAgICAgIHRzLnB1c2gocCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IHRvIHBsYWluIHRleHRcbiAgICAgICAgdmFyIHJvdyA9IDAsIGNvbHVtbiA9IDA7XG4gICAgICAgIHZhciB0ZXh0ID0gXCJcIjtcbiAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRbMF0gPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gdC5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uICs9IHQubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRleHQgKz0gdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCF0LnN0YXJ0KVxuICAgICAgICAgICAgICAgICAgICB0LnN0YXJ0ID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHQuZW5kID0geyByb3c6IHJvdywgY29sdW1uOiBjb2x1bW4gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgZW5kID0gZWRpdG9yLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dCk7XG5cbiAgICAgICAgdmFyIHRzTWFuYWdlciA9IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID8gZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gOiBuZXcgVGFic3RvcE1hbmFnZXIoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNlbGVjdGlvbklkID0gZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUgJiYgZWRpdG9yLnNlbGVjdGlvblsnaW5kZXgnXTtcbiAgICAgICAgdHNNYW5hZ2VyLmFkZFRhYnN0b3BzKHRhYnN0b3BzLCByYW5nZS5zdGFydCwgZW5kLCBzZWxlY3Rpb25JZCk7XG4gICAgfVxuXG4gICAgcHVibGljIGluc2VydFNuaXBwZXQoZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0LCB1bnVzZWQ/KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcblxuICAgICAgICBlZGl0b3IuZm9yRWFjaFNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcbiAgICAgICAgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG5cbiAgICAgICAgaWYgKGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRTY29wZShlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2NvcGUgPSBlZGl0b3Iuc2Vzc2lvbi4kbW9kZS4kaWQgfHwgXCJcIjtcbiAgICAgICAgc2NvcGUgPSBzY29wZS5zcGxpdChcIi9cIikucG9wKCk7XG4gICAgICAgIGlmIChzY29wZSA9PT0gXCJodG1sXCIgfHwgc2NvcGUgPT09IFwicGhwXCIpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBDb3VwbGluZyB0byBQSFA/XG4gICAgICAgICAgICAvLyBQSFAgaXMgYWN0dWFsbHkgSFRNTFxuICAgICAgICAgICAgaWYgKHNjb3BlID09PSBcInBocFwiICYmICFlZGl0b3Iuc2Vzc2lvbi4kbW9kZVsnaW5saW5lUGhwJ10pXG4gICAgICAgICAgICAgICAgc2NvcGUgPSBcImh0bWxcIjtcbiAgICAgICAgICAgIHZhciBjID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRTdGF0ZShjLnJvdyk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHN0YXRlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUgPSBzdGF0ZVswXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS5zdWJzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDMpID09IFwianMtXCIpXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlID0gXCJqYXZhc2NyaXB0XCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwiY3NzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiY3NzXCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwicGhwLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwicGhwXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHVibGljIGdldEFjdGl2ZVNjb3BlcyhlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2NvcGUgPSB0aGlzLiRnZXRTY29wZShlZGl0b3IpO1xuICAgICAgICB2YXIgc2NvcGVzID0gW3Njb3BlXTtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIGlmIChzbmlwcGV0TWFwW3Njb3BlXSAmJiBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKSB7XG4gICAgICAgICAgICBzY29wZXMucHVzaC5hcHBseShzY29wZXMsIHNuaXBwZXRNYXBbc2NvcGVdLmluY2x1ZGVTY29wZXMpO1xuICAgICAgICB9XG4gICAgICAgIHNjb3Blcy5wdXNoKFwiX1wiKTtcbiAgICAgICAgcmV0dXJuIHNjb3BlcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZXhwYW5kV2l0aFRhYihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucz8pOiBib29sZWFuIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzdWx0OiBib29sZWFuID0gZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7IHJldHVybiBzZWxmLmV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBvcHRpb25zKTsgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0pIHtcbiAgICAgICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhwYW5kU25pcHBldEZvclNlbGVjdGlvbihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucykge1xuICAgICAgICB2YXIgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gZWRpdG9yLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGJlZm9yZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgYWZ0ZXIgPSBsaW5lLnN1YnN0cihjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHRoaXMuZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0cywgYmVmb3JlLCBhZnRlcik7XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKCFzbmlwcGV0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmRyeVJ1bilcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5kb2MucmVtb3ZlSW5MaW5lKGN1cnNvci5yb3csXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uIC0gc25pcHBldC5yZXBsYWNlQmVmb3JlLmxlbmd0aCxcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gKyBzbmlwcGV0LnJlcGxhY2VBZnRlci5sZW5ndGhcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLnZhcmlhYmxlc1snTV9fJ10gPSBzbmlwcGV0Lm1hdGNoQmVmb3JlO1xuICAgICAgICB0aGlzLnZhcmlhYmxlc1snVF9fJ10gPSBzbmlwcGV0Lm1hdGNoQWZ0ZXI7XG4gICAgICAgIHRoaXMuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXQuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmaW5kTWF0Y2hpbmdTbmlwcGV0KHNuaXBwZXRMaXN0LCBiZWZvcmUsIGFmdGVyKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzbmlwcGV0TGlzdC5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciBzID0gc25pcHBldExpc3RbaV07XG4gICAgICAgICAgICBpZiAocy5zdGFydFJlICYmICFzLnN0YXJ0UmUudGVzdChiZWZvcmUpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKHMuZW5kUmUgJiYgIXMuZW5kUmUudGVzdChhZnRlcikpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBpZiAoIXMuc3RhcnRSZSAmJiAhcy5lbmRSZSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgcy5tYXRjaEJlZm9yZSA9IHMuc3RhcnRSZSA/IHMuc3RhcnRSZS5leGVjKGJlZm9yZSkgOiBbXCJcIl07XG4gICAgICAgICAgICBzLm1hdGNoQWZ0ZXIgPSBzLmVuZFJlID8gcy5lbmRSZS5leGVjKGFmdGVyKSA6IFtcIlwiXTtcbiAgICAgICAgICAgIHMucmVwbGFjZUJlZm9yZSA9IHMudHJpZ2dlclJlID8gcy50cmlnZ2VyUmUuZXhlYyhiZWZvcmUpWzBdIDogXCJcIjtcbiAgICAgICAgICAgIHMucmVwbGFjZUFmdGVyID0gcy5lbmRUcmlnZ2VyUmUgPyBzLmVuZFRyaWdnZXJSZS5leGVjKGFmdGVyKVswXSA6IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyByZWdpc3RlcihzbmlwcGV0cywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gd3JhcFJlZ2V4cChzcmMpIHtcbiAgICAgICAgICAgIGlmIChzcmMgJiYgIS9eXFxeP1xcKC4qXFwpXFwkPyR8XlxcXFxiJC8udGVzdChzcmMpKVxuICAgICAgICAgICAgICAgIHNyYyA9IFwiKD86XCIgKyBzcmMgKyBcIilcIjtcblxuICAgICAgICAgICAgcmV0dXJuIHNyYyB8fCBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGd1YXJkZWRSZWdleHAocmUsIGd1YXJkLCBvcGVuaW5nKSB7XG4gICAgICAgICAgICByZSA9IHdyYXBSZWdleHAocmUpO1xuICAgICAgICAgICAgZ3VhcmQgPSB3cmFwUmVnZXhwKGd1YXJkKTtcbiAgICAgICAgICAgIGlmIChvcGVuaW5nKSB7XG4gICAgICAgICAgICAgICAgcmUgPSBndWFyZCArIHJlO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVtyZS5sZW5ndGggLSAxXSAhPSBcIiRcIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSByZSArIFwiJFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZSA9IHJlICsgZ3VhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlICYmIHJlWzBdICE9IFwiXlwiKVxuICAgICAgICAgICAgICAgICAgICByZSA9IFwiXlwiICsgcmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChyZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGRTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIGlmICghcy5zY29wZSlcbiAgICAgICAgICAgICAgICBzLnNjb3BlID0gc2NvcGUgfHwgXCJfXCI7XG4gICAgICAgICAgICBzY29wZSA9IHMuc2NvcGU7XG4gICAgICAgICAgICBpZiAoIXNuaXBwZXRNYXBbc2NvcGVdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0TmFtZU1hcFtzY29wZV0gPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXROYW1lTWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgb2xkID0gbWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKG9sZClcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51bnJlZ2lzdGVyKG9sZCk7XG4gICAgICAgICAgICAgICAgbWFwW3MubmFtZV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0ucHVzaChzKTtcblxuICAgICAgICAgICAgaWYgKHMudGFiVHJpZ2dlciAmJiAhcy50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzLmd1YXJkICYmIC9eXFx3Ly50ZXN0KHMudGFiVHJpZ2dlcikpXG4gICAgICAgICAgICAgICAgICAgIHMuZ3VhcmQgPSBcIlxcXFxiXCI7XG4gICAgICAgICAgICAgICAgcy50cmlnZ2VyID0gZXNjYXBlUmVnRXhwKHMudGFiVHJpZ2dlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHMuc3RhcnRSZSA9IGd1YXJkZWRSZWdleHAocy50cmlnZ2VyLCBzLmd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMudHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLnRyaWdnZXIsIFwiXCIpO1xuXG4gICAgICAgICAgICBzLmVuZFJlID0gZ3VhcmRlZFJlZ2V4cChzLmVuZFRyaWdnZXIsIHMuZW5kR3VhcmQsIHRydWUpO1xuICAgICAgICAgICAgcy5lbmRUcmlnZ2VyUmUgPSBuZXcgUmVnRXhwKHMuZW5kVHJpZ2dlciwgXCJcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIGFkZFNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2goYWRkU25pcHBldCk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwicmVnaXN0ZXJTbmlwcGV0c1wiLCB7IHNjb3BlOiBzY29wZSB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVucmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlPykge1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXROYW1lTWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcblxuICAgICAgICBmdW5jdGlvbiByZW1vdmVTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIHZhciBuYW1lTWFwID0gc25pcHBldE5hbWVNYXBbcy5zY29wZSB8fCBzY29wZV07XG4gICAgICAgICAgICBpZiAobmFtZU1hcCAmJiBuYW1lTWFwW3MubmFtZV0pIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgbmFtZU1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgICAgIHZhciBpID0gbWFwICYmIG1hcC5pbmRleE9mKHMpO1xuICAgICAgICAgICAgICAgIGlmIChpID49IDApXG4gICAgICAgICAgICAgICAgICAgIG1hcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICByZW1vdmVTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKHJlbW92ZVNuaXBwZXQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBwYXJzZVNuaXBwZXRGaWxlKHN0cikge1xuICAgICAgICBzdHIgPSBzdHIucmVwbGFjZSgvXFxyL2csIFwiXCIpO1xuICAgICAgICB2YXIgbGlzdCA9IFtdO1xuICAgICAgICB2YXIgc25pcHBldDogYW55ID0ge307XG4gICAgICAgIHZhciByZSA9IC9eIy4qfF4oe1tcXHNcXFNdKn0pXFxzKiR8XihcXFMrKSAoLiopJHxeKCg/OlxcbipcXHQuKikrKS9nbTtcbiAgICAgICAgdmFyIG07XG4gICAgICAgIHdoaWxlIChtID0gcmUuZXhlYyhzdHIpKSB7XG4gICAgICAgICAgICBpZiAobVsxXSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQgPSBKU09OLnBhcnNlKG1bMV0pO1xuICAgICAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9IGlmIChtWzRdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldC5jb250ZW50ID0gbVs0XS5yZXBsYWNlKC9eXFx0L2dtLCBcIlwiKTtcbiAgICAgICAgICAgICAgICBsaXN0LnB1c2goc25pcHBldCk7XG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHt9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0gbVsyXSwgdmFsID0gbVszXTtcbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09IFwicmVnZXhcIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZ3VhcmRSZSA9IC9cXC8oKD86W15cXC9cXFxcXXxcXFxcLikqKXwkL2c7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZ3VhcmQgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50cmlnZ2VyID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZW5kVHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZEd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXkgPT0gXCJzbmlwcGV0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC50YWJUcmlnZ2VyID0gdmFsLm1hdGNoKC9eXFxTKi8pWzBdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXNuaXBwZXQubmFtZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNuaXBwZXQubmFtZSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0W2tleV0gPSB2YWw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBsaXN0O1xuICAgIH1cbiAgICBwcml2YXRlIGdldFNuaXBwZXRCeU5hbWUobmFtZSwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc25pcHBldDtcbiAgICAgICAgdGhpcy5nZXRBY3RpdmVTY29wZXMoZWRpdG9yKS5zb21lKGZ1bmN0aW9uKHNjb3BlKSB7XG4gICAgICAgICAgICB2YXIgc25pcHBldHMgPSBzbmlwcGV0TWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzbmlwcGV0cylcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0gc25pcHBldHNbbmFtZV07XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXQ7XG4gICAgfVxufVxuXG5jbGFzcyBUYWJzdG9wTWFuYWdlciB7XG4gICAgcHJpdmF0ZSBpbmRleDtcbiAgICBwcml2YXRlIHJhbmdlcztcbiAgICBwcml2YXRlIHRhYnN0b3BzO1xuICAgIHByaXZhdGUgJG9wZW5UYWJzdG9wcztcbiAgICBwcml2YXRlIHNlbGVjdGVkVGFic3RvcDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUga2V5Ym9hcmRIYW5kbGVyID0gbmV3IEhhc2hIYW5kbGVyKCk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZXNzaW9uO1xuICAgIHByaXZhdGUgJG9uQWZ0ZXJFeGVjO1xuICAgIHByaXZhdGUgJGluQ2hhbmdlO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gdGhpcztcbiAgICAgICAgdGhpcy4kb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uID0gZGVsYXllZENhbGwodGhpcy5vbkNoYW5nZVNlbGVjdGlvbi5iaW5kKHRoaXMpKS5zY2hlZHVsZTtcbiAgICAgICAgdGhpcy4kb25DaGFuZ2VTZXNzaW9uID0gdGhpcy5vbkNoYW5nZVNlc3Npb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy4kb25BZnRlckV4ZWMgPSB0aGlzLm9uQWZ0ZXJFeGVjLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoKGVkaXRvcik7XG4gICAgICAgIHRoaXMua2V5Ym9hcmRIYW5kbGVyLmJpbmRLZXlzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNuaXBwZXRNYW5hZ2VyICYmIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIoZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiU2hpZnQtVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KC0xKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiRXNjXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiUmV0dXJuXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9lZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBhdHRhY2goZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBbXTtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLnRhYnN0b3BzLmZvckVhY2godGhpcy5yZW1vdmVUYWJzdG9wTWFya2VycywgdGhpcyk7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5yZW1vdmVMaXN0ZW5lcihcImFmdGVyRXhlY1wiLCB0aGlzLiRvbkFmdGVyRXhlYyk7XG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcucmVtb3ZlS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5lZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGUpIHtcbiAgICAgICAgdmFyIGNoYW5nZVJhbmdlID0gZS5kYXRhLnJhbmdlO1xuICAgICAgICB2YXIgaXNSZW1vdmUgPSBlLmRhdGEuYWN0aW9uWzBdID09IFwiclwiO1xuICAgICAgICB2YXIgc3RhcnQgPSBjaGFuZ2VSYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGNoYW5nZVJhbmdlLmVuZDtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZW5kLnJvdztcbiAgICAgICAgdmFyIGxpbmVEaWYgPSBlbmRSb3cgLSBzdGFydFJvdztcbiAgICAgICAgdmFyIGNvbERpZmYgPSBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uO1xuXG4gICAgICAgIGlmIChpc1JlbW92ZSkge1xuICAgICAgICAgICAgbGluZURpZiA9IC1saW5lRGlmO1xuICAgICAgICAgICAgY29sRGlmZiA9IC1jb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICghdGhpcy4kaW5DaGFuZ2UgJiYgaXNSZW1vdmUpIHtcbiAgICAgICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICAgICAgdmFyIGNoYW5nZWRPdXRzaWRlID0gdHMgJiYgIXRzLnNvbWUoZnVuY3Rpb24ocikge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb21wYXJlUG9pbnRzKHIuc3RhcnQsIHN0YXJ0KSA8PSAwICYmIGNvbXBhcmVQb2ludHMoci5lbmQsIGVuZCkgPj0gMDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKGNoYW5nZWRPdXRzaWRlKVxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmRldGFjaCgpO1xuICAgICAgICB9XG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLnJhbmdlcztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciByID0gcmFuZ2VzW2ldO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA8IHN0YXJ0LnJvdylcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgaWYgKGlzUmVtb3ZlICYmIGNvbXBhcmVQb2ludHMoc3RhcnQsIHIuc3RhcnQpIDwgMCAmJiBjb21wYXJlUG9pbnRzKGVuZCwgci5lbmQpID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoci5zdGFydC5yb3cgPT0gc3RhcnRSb3cgJiYgci5zdGFydC5jb2x1bW4gPiBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgci5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPT0gc3RhcnRSb3cgJiYgci5lbmQuY29sdW1uID49IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLnN0YXJ0LnJvdyArPSBsaW5lRGlmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA+PSBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByLmVuZC5yb3cgKz0gbGluZURpZjtcblxuICAgICAgICAgICAgaWYgKGNvbXBhcmVQb2ludHMoci5zdGFydCwgci5lbmQpID4gMClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVJhbmdlKHIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1cGRhdGVMaW5rZWRGaWVsZHMoKSB7XG4gICAgICAgIHZhciB0cyA9IHRoaXMuc2VsZWN0ZWRUYWJzdG9wO1xuICAgICAgICBpZiAoIXRzIHx8ICF0cy5oYXNMaW5rZWRSYW5nZXMpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gdHJ1ZTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdHNbaV07XG4gICAgICAgICAgICBpZiAoIXJhbmdlLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBmbXQgPSBzbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCh0ZXh0LCByYW5nZS5vcmlnaW5hbCk7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UocmFuZ2UsIGZtdCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQWZ0ZXJFeGVjKGUpIHtcbiAgICAgICAgaWYgKGUuY29tbWFuZCAmJiAhZS5jb21tYW5kLnJlYWRPbmx5KVxuICAgICAgICAgICAgdGhpcy51cGRhdGVMaW5rZWRGaWVsZHMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgbGVhZCA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5sZWFkO1xuICAgICAgICB2YXIgYW5jaG9yID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmFuY2hvcjtcbiAgICAgICAgdmFyIGlzRW1wdHkgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24uaXNFbXB0eSgpO1xuICAgICAgICBmb3IgKHZhciBpID0gdGhpcy5yYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICBpZiAodGhpcy5yYW5nZXNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zTGVhZCA9IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGxlYWQucm93LCBsZWFkLmNvbHVtbik7XG4gICAgICAgICAgICB2YXIgY29udGFpbnNBbmNob3IgPSBpc0VtcHR5IHx8IHRoaXMucmFuZ2VzW2ldLmNvbnRhaW5zKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5zTGVhZCAmJiBjb250YWluc0FuY2hvcilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlU2Vzc2lvbigpIHtcbiAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRhYk5leHQoZGlyKSB7XG4gICAgICAgIHZhciBtYXggPSB0aGlzLnRhYnN0b3BzLmxlbmd0aDtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5pbmRleCArIChkaXIgfHwgMSk7XG4gICAgICAgIGluZGV4ID0gTWF0aC5taW4oTWF0aC5tYXgoaW5kZXgsIDEpLCBtYXgpO1xuICAgICAgICBpZiAoaW5kZXggPT0gbWF4KVxuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICB0aGlzLnNlbGVjdFRhYnN0b3AoaW5kZXgpO1xuICAgICAgICBpZiAoaW5kZXggPT09IDApXG4gICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgc2VsZWN0VGFic3RvcChpbmRleCkge1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAodHMpXG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKHRzKTtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IHRzO1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzZWwgPSB0aGlzLmVkaXRvclsnbXVsdGlTZWxlY3QnXTtcbiAgICAgICAgICAgIHNlbC50b1NpbmdsZVJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkLmNsb25lKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICh0cy5oYXNMaW5rZWRSYW5nZXMgJiYgdHNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2UodHNbaV0uY2xvbmUoKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0b2RvIGludmVzdGlnYXRlIHdoeSBpcyB0aGlzIG5lZWRlZFxuICAgICAgICAgICAgaWYgKHNlbC5yYW5nZXNbMF0pXG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHNlbC5yYW5nZXNbMF0uY2xvbmUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRUYWJzdG9wcyA9IGZ1bmN0aW9uKHRhYnN0b3BzLCBzdGFydCwgZW5kLCB1bnVzZWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRvcGVuVGFic3RvcHMpXG4gICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBbXTtcbiAgICAgICAgLy8gYWRkIGZpbmFsIHRhYnN0b3AgaWYgbWlzc2luZ1xuICAgICAgICBpZiAoIXRhYnN0b3BzWzBdKSB7XG4gICAgICAgICAgICB2YXIgcCA9IFJhbmdlLmZyb21Qb2ludHMoZW5kLCBlbmQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0gPSBbcF07XG4gICAgICAgICAgICB0YWJzdG9wc1swXS5pbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHZhciBhcmcgPSBbaSArIDEsIDBdO1xuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gfHwgdHM7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHRzW2ldO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhwLnN0YXJ0LCBwLmVuZCB8fCBwLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2Uuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2UuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgcmFuZ2Uub3JpZ2luYWwgPSBwO1xuICAgICAgICAgICAgICAgIHJhbmdlLnRhYnN0b3AgPSBkZXN0O1xuICAgICAgICAgICAgICAgIHJhbmdlcy5wdXNoKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVzdCAhPSB0cylcbiAgICAgICAgICAgICAgICAgICAgZGVzdC51bnNoaWZ0KHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlc3RbaV0gPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocC5mbXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UubGlua2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QuZmlyc3ROb25MaW5rZWQgPSByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGRlc3QgPT09IHRzKSB7XG4gICAgICAgICAgICAgICAgYXJnLnB1c2goZGVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSA9IGRlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKGRlc3QpO1xuICAgICAgICB9LCB0aGlzKTtcblxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gYWRkaW5nIG5ldyBzbmlwcGV0IGluc2lkZSBleGlzdGluZyBvbmUsIG1ha2Ugc3VyZSAwIHRhYnN0b3AgaXMgYXQgdGhlIGVuZFxuICAgICAgICAgICAgaWYgKHRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGFyZy5zcGxpY2UoMiwgMSlbMF0pO1xuICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UuYXBwbHkodGhpcy50YWJzdG9wcywgYXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UvKjogcm0uUmFuZ2UqLykge1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5tYXJrZXJJZClcbiAgICAgICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zbmlwcGV0LW1hcmtlclwiLCBcInRleHRcIik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVSYW5nZSA9IGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHZhciBpID0gcmFuZ2UudGFic3RvcC5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgcmFuZ2UudGFic3RvcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGkgPSB0aGlzLnJhbmdlcy5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgdGhpcy5yYW5nZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmVkaXRvci5zZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgIGlmICghcmFuZ2UudGFic3RvcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGkgPSB0aGlzLnRhYnN0b3BzLmluZGV4T2YocmFuZ2UudGFic3RvcCk7XG4gICAgICAgICAgICBpZiAoaSAhPSAtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGlmICghdGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuXG5cbnZhciBjaGFuZ2VUcmFja2VyOiBhbnkgPSB7fTtcbmNoYW5nZVRyYWNrZXIub25DaGFuZ2UgPSBBbmNob3IucHJvdG90eXBlLm9uQ2hhbmdlO1xuY2hhbmdlVHJhY2tlci5zZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKHJvdywgY29sdW1uKSB7XG4gICAgdGhpcy5wb3Mucm93ID0gcm93O1xuICAgIHRoaXMucG9zLmNvbHVtbiA9IGNvbHVtbjtcbn07XG5jaGFuZ2VUcmFja2VyLnVwZGF0ZSA9IGZ1bmN0aW9uKHBvcywgZGVsdGEsICRpbnNlcnRSaWdodCkge1xuICAgIHRoaXMuJGluc2VydFJpZ2h0ID0gJGluc2VydFJpZ2h0O1xuICAgIHRoaXMucG9zID0gcG9zO1xuICAgIHRoaXMub25DaGFuZ2UoZGVsdGEpO1xufTtcblxudmFyIG1vdmVQb2ludCA9IGZ1bmN0aW9uKHBvaW50LCBkaWZmKSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSAwKVxuICAgICAgICBwb2ludC5jb2x1bW4gKz0gZGlmZi5jb2x1bW47XG4gICAgcG9pbnQucm93ICs9IGRpZmYucm93O1xufTtcblxudmFyIG1vdmVSZWxhdGl2ZSA9IGZ1bmN0aW9uKHBvaW50LCBzdGFydCkge1xuICAgIGlmIChwb2ludC5yb3cgPT0gc3RhcnQucm93KVxuICAgICAgICBwb2ludC5jb2x1bW4gLT0gc3RhcnQuY29sdW1uO1xuICAgIHBvaW50LnJvdyAtPSBzdGFydC5yb3c7XG59O1xuXG5cbmltcG9ydENzc1N0cmluZyhcIlxcXG4uYWNlX3NuaXBwZXQtbWFya2VyIHtcXFxuICAgIC1tb3otYm94LXNpemluZzogYm9yZGVyLWJveDtcXFxuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBiYWNrZ3JvdW5kOiByZ2JhKDE5NCwgMTkzLCAyMDgsIDAuMDkpO1xcXG4gICAgYm9yZGVyOiAxcHggZG90dGVkIHJnYmEoMjExLCAyMDgsIDIzNSwgMC42Mik7XFxcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XFxcbn1cIik7XG5cbmV4cG9ydCB2YXIgc25pcHBldE1hbmFnZXIgPSBuZXcgU25pcHBldE1hbmFnZXIoKTtcblxuKGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5zZXJ0U25pcHBldCA9IGZ1bmN0aW9uKGNvbnRlbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXQodGhpcywgY29udGVudCwgb3B0aW9ucyk7XG4gICAgfTtcbiAgICB0aGlzLmV4cGFuZFNuaXBwZXQgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKHRoaXMsIG9wdGlvbnMpO1xuICAgIH07XG59KS5jYWxsKEVkaXRvci5wcm90b3R5cGUpO1xuIl19