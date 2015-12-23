import { ensureHTMLStyleElement } from "./lib/dom";
import EventEmitterClass from "./lib/EventEmitterClass";
import { delayedCall, escapeRegExp } from "./lib/lang";
import comparePoints from "./comparePoints";
import Anchor from "./Anchor";
import HashHandler from "./keyboard/HashHandler";
import Tokenizer from "./Tokenizer";
import Editor from './Editor';
import Range from "./Range";
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
export class SnippetManager {
    constructor() {
        this.snippetMap = {};
        this.snippetNameMap = {};
        this.variables = {};
        this.eventBus = new EventEmitterClass(this);
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
        var session = editor.getSession();
        var line = session.getLine(cursor.row);
        var tabString = session.getTabString();
        var indentString = line.match(/^\s*/)[0];
        if (cursor.column < indentString.length)
            indentString = indentString.slice(0, cursor.column);
        var tokens = this.tokenizeTmSnippet(snippetText);
        tokens = this.resolveVariables(tokens, editor);
        tokens = tokens.map(function (x) {
            if (x == "\n") {
                return x + indentString;
            }
            if (typeof x === "string") {
                return x.replace(/\t/g, tabString);
            }
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
                if (typeof p === "object") {
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
            if (typeof p !== "object")
                continue;
            var id = p.tabstopId;
            var i1 = tokens.indexOf(p, i + 1);
            if (expanding[id]) {
                if (expanding[id] === p)
                    expanding[id] = null;
                continue;
            }
            var ts = tabstops[id];
            var arg = (typeof ts.value === "string") ? [ts.value] : copyValue(ts.value);
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
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
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
        this.eventBus._signal("registerSnippets", { scope: scope });
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
            var sel = this.editor.multiSelect;
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
ensureHTMLStyleElement("\
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzbmlwcGV0cy50cyJdLCJuYW1lcyI6WyJlc2NhcGUiLCJUYWJzdG9wVG9rZW4iLCJTbmlwcGV0TWFuYWdlciIsIlNuaXBwZXRNYW5hZ2VyLmNvbnN0cnVjdG9yIiwiU25pcHBldE1hbmFnZXIuZ2V0VG9rZW5pemVyIiwiU25pcHBldE1hbmFnZXIudG9rZW5pemVUbVNuaXBwZXQiLCJTbmlwcGV0TWFuYWdlci4kZ2V0RGVmYXVsdFZhbHVlIiwiU25pcHBldE1hbmFnZXIuZ2V0VmFyaWFibGVWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLnRtU3RyRm9ybWF0IiwiU25pcHBldE1hbmFnZXIucmVzb2x2ZVZhcmlhYmxlcyIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMuZ290b05leHQiLCJTbmlwcGV0TWFuYWdlci5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbi5jb3B5VmFsdWUiLCJTbmlwcGV0TWFuYWdlci5pbnNlcnRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldFNjb3BlIiwiU25pcHBldE1hbmFnZXIuZ2V0QWN0aXZlU2NvcGVzIiwiU25pcHBldE1hbmFnZXIuZXhwYW5kV2l0aFRhYiIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24iLCJTbmlwcGV0TWFuYWdlci5maW5kTWF0Y2hpbmdTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIub24iLCJTbmlwcGV0TWFuYWdlci5vZmYiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLndyYXBSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5ndWFyZGVkUmVnZXhwIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIuYWRkU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIiLCJTbmlwcGV0TWFuYWdlci51bnJlZ2lzdGVyLnJlbW92ZVNuaXBwZXQiLCJTbmlwcGV0TWFuYWdlci5wYXJzZVNuaXBwZXRGaWxlIiwiU25pcHBldE1hbmFnZXIuZ2V0U25pcHBldEJ5TmFtZSIsIlRhYnN0b3BNYW5hZ2VyIiwiVGFic3RvcE1hbmFnZXIuY29uc3RydWN0b3IiLCJUYWJzdG9wTWFuYWdlci5hdHRhY2giLCJUYWJzdG9wTWFuYWdlci5kZXRhY2giLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZSIsIlRhYnN0b3BNYW5hZ2VyLnVwZGF0ZUxpbmtlZEZpZWxkcyIsIlRhYnN0b3BNYW5hZ2VyLm9uQWZ0ZXJFeGVjIiwiVGFic3RvcE1hbmFnZXIub25DaGFuZ2VTZWxlY3Rpb24iLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlc3Npb24iLCJUYWJzdG9wTWFuYWdlci50YWJOZXh0IiwiVGFic3RvcE1hbmFnZXIuc2VsZWN0VGFic3RvcCJdLCJtYXBwaW5ncyI6Ik9BcURPLEVBQUMsc0JBQXNCLEVBQUMsTUFBTSxXQUFXO09BQ3pDLGlCQUFpQixNQUFNLHlCQUF5QjtPQUNoRCxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLGFBQWEsTUFBTSxpQkFBaUI7T0FDcEMsTUFBTSxNQUFNLFVBQVU7T0FDdEIsV0FBVyxNQUFNLHdCQUF3QjtPQUN6QyxTQUFTLE1BQU0sYUFBYTtPQUM1QixNQUFNLE1BQU0sVUFBVTtPQUd0QixLQUFLLE1BQU0sU0FBUztBQUczQixJQUFJLGVBQWUsR0FBRyxnQkFBZ0IsQ0FBQztBQUV2QyxnQkFBZ0IsRUFBRTtJQUNkQSxNQUFNQSxDQUFDQSxXQUFXQSxHQUFHQSxFQUFFQSxHQUFHQSxVQUFVQSxDQUFDQTtBQUN6Q0EsQ0FBQ0E7QUFFRCxzQkFBc0IsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLO0lBQy9CQyxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO0lBQzlDQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTtBQUMzQkEsQ0FBQ0E7QUFLRDtJQVVJQztRQVRPQyxlQUFVQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNmQSxtQkFBY0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDcEJBLGNBQVNBLEdBQUdBLEVBQUVBLENBQUNBO1FBUW5CQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxpQkFBaUJBLENBQWlCQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNoRUEsQ0FBQ0E7SUF1R09ELFlBQVlBO1FBQ2hCRSxjQUFjQSxDQUFDQSxTQUFTQSxDQUFDQSxZQUFZQSxHQUFHQTtZQUNwQyxNQUFNLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztRQUNyQyxDQUFDLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLFVBQVVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQUVPRixpQkFBaUJBLENBQUNBLEdBQUdBLEVBQUVBLFVBQVdBO1FBQ3RDRyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFTQSxDQUFDQTtZQUMzRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDeEIsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUVPSCxnQkFBZ0JBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBO1FBQ2pDSSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQ0RBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBRWhDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNSQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN2QkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsS0FBS0EsY0FBY0E7Z0JBQ2ZBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1lBRTdCQSxLQUFLQSxXQUFXQSxDQUFDQTtZQUNqQkEsS0FBS0EsZUFBZUE7Z0JBQ2hCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxD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QSxDQUFDQTtRQUNERCxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsSUFBSUEsQ0FBQ0EsR0FBUUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLFFBQVFBLENBQUNBO2dCQUN0QkEsUUFBUUEsQ0FBQ0E7WUFDYkEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDckJBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFaEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUNwQkEsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBRXpCQSxRQUFRQSxDQUFDQTtZQUNiQSxDQUFDQTtZQUVEQSxJQUFJQSxFQUFFQSxHQUFHQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsS0FBS0EsS0FBS0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDNUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENB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QSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxhQUFhQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ0pBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN6REEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN0REEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBO2dCQUN4QkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBO2dCQUN0QkEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFFekJBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNB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IEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7ZW5zdXJlSFRNTFN0eWxlRWxlbWVudH0gZnJvbSBcIi4vbGliL2RvbVwiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9FdmVudEVtaXR0ZXJDbGFzc1wiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgZXNjYXBlUmVnRXhwfSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IGNvbXBhcmVQb2ludHMgZnJvbSBcIi4vY29tcGFyZVBvaW50c1wiXG5pbXBvcnQgQW5jaG9yIGZyb20gXCIuL0FuY2hvclwiO1xuaW1wb3J0IEhhc2hIYW5kbGVyIGZyb20gXCIuL2tleWJvYXJkL0hhc2hIYW5kbGVyXCI7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gXCIuL1Rva2VuaXplclwiO1xuaW1wb3J0IEVkaXRvciBmcm9tICcuL0VkaXRvcic7XG5pbXBvcnQgRXZlbnRCdXMgZnJvbSAnLi9FdmVudEJ1cyc7XG5pbXBvcnQgQ2hhbmdlIGZyb20gXCIuL0NoYW5nZVwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgVG9rZW4gZnJvbSBcIi4vVG9rZW5cIjtcblxudmFyIFRBQlNUT1BfTUFOQUdFUiA9ICd0YWJzdG9wTWFuYWdlcic7XG5cbmZ1bmN0aW9uIGVzY2FwZShjaCkge1xuICAgIHJldHVybiBcIig/OlteXFxcXFxcXFxcIiArIGNoICsgXCJdfFxcXFxcXFxcLilcIjtcbn1cblxuZnVuY3Rpb24gVGFic3RvcFRva2VuKHN0ciwgXywgc3RhY2spOiBhbnlbXSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigxKTtcbiAgICBpZiAoL15cXGQrJC8udGVzdChzdHIpICYmICFzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICByZXR1cm4gW3sgdGFic3RvcElkOiBwYXJzZUludChzdHIsIDEwKSB9XTtcbiAgICB9XG4gICAgcmV0dXJuIFt7IHRleHQ6IHN0ciB9XTtcbn1cblxuLyoqXG4gKiBAY2xhc3MgU25pcHBldE1hbmFnZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFNuaXBwZXRNYW5hZ2VyIGltcGxlbWVudHMgRXZlbnRCdXM8U25pcHBldE1hbmFnZXI+IHtcbiAgICBwdWJsaWMgc25pcHBldE1hcCA9IHt9O1xuICAgIHByaXZhdGUgc25pcHBldE5hbWVNYXAgPSB7fTtcbiAgICBwcml2YXRlIHZhcmlhYmxlcyA9IHt9O1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPFNuaXBwZXRNYW5hZ2VyPjtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBTbmlwcGV0TWFuYWdlclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPFNuaXBwZXRNYW5hZ2VyPih0aGlzKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyAkdG9rZW5pemVyID0gbmV3IFRva2VuaXplcih7XG4gICAgICAgIHN0YXJ0OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC86LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjayk6IGFueSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggJiYgc3RhY2tbMF0uZXhwZWN0SWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5lbHNlQnJhbmNoID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCI6XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcXFwuLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIn1cIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFwiYCRcXFxcXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJuXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNoID09IFwidFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChcInVsVUxFXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB7IGNoYW5nZUNhc2U6IGNoLCBsb2NhbDogY2ggPiBcImFcIiB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFt2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC99LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrLmxlbmd0aCA/IHN0YWNrLnNoaWZ0KCkgOiB2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCQoPzpcXGQrfFxcdyspLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBUYWJzdG9wVG9rZW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCRcXHtbXFxkQS1aX2Etel0rLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbihzdHIsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdCA9IFRhYnN0b3BUb2tlbihzdHIuc3Vic3RyKDEpLCBzdGF0ZSwgc3RhY2spO1xuICAgICAgICAgICAgICAgICAgICBzdGFjay51bnNoaWZ0KHRbMF0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInNuaXBwZXRWYXJcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcbi8sXG4gICAgICAgICAgICAgICAgdG9rZW46IFwibmV3bGluZVwiLFxuICAgICAgICAgICAgICAgIG1lcmdlOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBzbmlwcGV0VmFyOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHxcIiArIGVzY2FwZShcIlxcXFx8XCIpICsgXCIqXFxcXHxcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY2hvaWNlcyA9IHZhbC5zbGljZSgxLCAtMSkuc3BsaXQoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvKD86KFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKikvKShcXFxcdyopOj9cIixcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdHMgPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10U3RyaW5nID0gdmFsO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHRoaXMuc3BsaXRSZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHRzLmd1YXJkID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXQgPSB2YWxbMl07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZsYWcgPSB2YWxbM107XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJgXCIgKyBlc2NhcGUoXCJgXCIpICsgXCIqYFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jb2RlID0gdmFsLnNwbGljZSgxLCAtMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcP1wiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2tbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyByZWdleDogXCIoW146fVxcXFxcXFxcXXxcXFxcXFxcXC4pKjo/XCIsIHRva2VuOiBcIlwiLCBuZXh0OiBcInN0YXJ0XCIgfVxuICAgICAgICBdLFxuICAgICAgICBmb3JtYXRTdHJpbmc6IFtcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispL1wiLCB0b2tlbjogXCJyZWdleFwiIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLmluRm9ybWF0U3RyaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgcHJpdmF0ZSBnZXRUb2tlbml6ZXIoKSB7XG4gICAgICAgIFNuaXBwZXRNYW5hZ2VyLnByb3RvdHlwZS5nZXRUb2tlbml6ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRva2VuaXplVG1TbmlwcGV0KHN0ciwgc3RhcnRTdGF0ZT8pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VG9rZW5pemVyKCkuZ2V0TGluZVRva2VucyhzdHIsIHN0YXJ0U3RhdGUpLnRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgcmV0dXJuIHgudmFsdWUgfHwgeDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgbmFtZSkge1xuICAgICAgICBpZiAoL15bQS1aXVxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICB2YXIgaSA9IG5hbWUuc3Vic3RyKDEpO1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1tuYW1lWzBdICsgXCJfX1wiXSB8fCB7fSlbaV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKC9eXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbJ19fJ10gfHwge30pW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoL15UTV8vLCBcIlwiKTtcblxuICAgICAgICBpZiAoIWVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHMgPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9XT1JEXCI6XG4gICAgICAgICAgICAgICAgdmFyIHIgPSBzLmdldFdvcmRSYW5nZSgpO1xuICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVElPTlwiOlxuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVEVEX1RFWFRcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUZXh0UmFuZ2Uocik7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9MSU5FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICAgICAgY2FzZSBcIlBSRVZfTElORVwiOiAvLyBub3QgcG9zc2libGUgaW4gdGV4dG1hdGVcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyAtIDEpO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfSU5ERVhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkuY29sdW1uO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfTlVNQkVSXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyArIDE7XG4gICAgICAgICAgICBjYXNlIFwiU09GVF9UQUJTXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VXNlU29mdFRhYnMoKSA/IFwiWUVTXCIgOiBcIk5PXCI7XG4gICAgICAgICAgICBjYXNlIFwiVEFCX1NJWkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IGJ1dCBjYW4ndCBmaWxsIDooXG4gICAgICAgICAgICBjYXNlIFwiRklMRU5BTUVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFUEFUSFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgY2FzZSBcIkZVTExOQU1FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiQWNlXCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgdmFyTmFtZSkge1xuICAgICAgICBpZiAodGhpcy52YXJpYWJsZXMuaGFzT3duUHJvcGVydHkodmFyTmFtZSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZXNbdmFyTmFtZV0oZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHN0cmluZyBmb3JtYXR0ZWQgYWNjb3JkaW5nIHRvIGh0dHA6Ly9tYW51YWwubWFjcm9tYXRlcy5jb20vZW4vcmVndWxhcl9leHByZXNzaW9ucyNyZXBsYWNlbWVudF9zdHJpbmdfc3ludGF4X2Zvcm1hdF9zdHJpbmdzXG4gICAgcHVibGljIHRtU3RyRm9ybWF0KHN0ciwgY2gsIGVkaXRvcj8pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBjaC5mbGFnIHx8IFwiXCI7XG4gICAgICAgIHZhciByZSA9IGNoLmd1YXJkO1xuICAgICAgICByZSA9IG5ldyBSZWdFeHAocmUsIGZsYWcucmVwbGFjZSgvW15naV0vLCBcIlwiKSk7XG4gICAgICAgIHZhciBmbXRUb2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KGNoLmZtdCwgXCJmb3JtYXRTdHJpbmdcIik7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBzdHIucmVwbGFjZShyZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi52YXJpYWJsZXNbJ19fJ10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICB2YXIgZm10UGFydHMgPSBfc2VsZi5yZXNvbHZlVmFyaWFibGVzKGZtdFRva2VucywgZWRpdG9yKTtcbiAgICAgICAgICAgIHZhciBnQ2hhbmdlQ2FzZSA9IFwiRVwiO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbXRQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGZtdFBhcnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlICYmIGNoLmxvY2FsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZtdFBhcnRzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0ICYmIHR5cGVvZiBuZXh0ID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSA9PSBcInVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpICsgMV0gPSBuZXh0LnN1YnN0cigxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnQ2hhbmdlQ2FzZSA9IGNoLmNoYW5nZUNhc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiVVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiTFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm10UGFydHMuam9pbihcIlwiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVWYXJpYWJsZXMoc25pcHBldCwgZWRpdG9yKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmlwcGV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzbmlwcGV0W2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2ggIT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5za2lwKSB7XG4gICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5wcm9jZXNzZWQgPCBpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCBjaC50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgY2guZm10U3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG1TdHJGb3JtYXQodmFsdWUsIGNoKTtcbiAgICAgICAgICAgICAgICBjaC5wcm9jZXNzZWQgPSBpO1xuICAgICAgICAgICAgICAgIGlmIChjaC5leHBlY3RJZiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaC5za2lwID0gY2guZWxzZUJyYW5jaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50YWJzdG9wSWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdvdG9OZXh0KGNoKSB7XG4gICAgICAgICAgICB2YXIgaTEgPSBzbmlwcGV0LmluZGV4T2YoY2gsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSAhPSAtMSlcbiAgICAgICAgICAgICAgICBpID0gaTE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGSVhNRTogVGhlIGNob2ljZSBvZiBzdHJpbmcgfCBUb2tlbiBtYWtlcyBpdCB2ZXJ5IGRpZmZpY3VsdCB0byBpbXBvc2UgdHlwZSBzYWZldHkuXG4gICAgICovXG4gICAgcHJpdmF0ZSBpbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvcjogRWRpdG9yLCBzbmlwcGV0VGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHRhYlN0cmluZyA9IHNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBsaW5lLm1hdGNoKC9eXFxzKi8pWzBdO1xuXG4gICAgICAgIGlmIChjdXJzb3IuY29sdW1uIDwgaW5kZW50U3RyaW5nLmxlbmd0aClcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IGluZGVudFN0cmluZy5zbGljZSgwLCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgdG9rZW5zID0gdGhpcy50b2tlbml6ZVRtU25pcHBldChzbmlwcGV0VGV4dCk7XG4gICAgICAgIHRva2VucyA9IHRoaXMucmVzb2x2ZVZhcmlhYmxlcyh0b2tlbnMsIGVkaXRvcik7XG4gICAgICAgIC8vIGluZGVudFxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMubWFwKGZ1bmN0aW9uKHg6IC8qIHN0cmluZyB8IFRva2VuKi9hbnkpIHtcbiAgICAgICAgICAgIGlmICh4ID09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geCArIGluZGVudFN0cmluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB4LnJlcGxhY2UoL1xcdC9nLCB0YWJTdHJpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0YWJzdG9wIHZhbHVlc1xuICAgICAgICB2YXIgdGFic3RvcHMvKjoge2luZGV4O3ZhbHVlfVtdW10qLyA9IFtdO1xuICAgICAgICB0b2tlbnMuZm9yRWFjaChmdW5jdGlvbihwOiBhbnksIGk6IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBwICE9IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgdHMgPSB0YWJzdG9wc1tpZF07XG4gICAgICAgICAgICBpZiAoIXRzKSB7XG4gICAgICAgICAgICAgICAgdHMgPSB0YWJzdG9wc1tpZF0gPSBbXTtcbiAgICAgICAgICAgICAgICB0cy5pbmRleCA9IGlkO1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApICE9PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGkxID09PSAtMSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2Vucy5zbGljZShpICsgMSwgaTEpO1xuICAgICAgICAgICAgdmFyIGlzTmVzdGVkID0gdmFsdWUuc29tZShmdW5jdGlvbih0KSB7IHJldHVybiB0eXBlb2YgdCA9PT0gXCJvYmplY3RcIiB9KTtcbiAgICAgICAgICAgIGlmIChpc05lc3RlZCAmJiAhdHMudmFsdWUpIHtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWx1ZS5sZW5ndGggJiYgKCF0cy52YWx1ZSB8fCB0eXBlb2YgdHMudmFsdWUgIT09IFwic3RyaW5nXCIpKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZS5qb2luKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBleHBhbmQgdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdGFic3RvcHMuZm9yRWFjaChmdW5jdGlvbih0cykgeyB0cy5sZW5ndGggPSAwIH0pO1xuICAgICAgICB2YXIgZXhwYW5kaW5nID0ge307XG4gICAgICAgIGZ1bmN0aW9uIGNvcHlWYWx1ZSh2YWw6IGFueVtdKSB7XG4gICAgICAgICAgICB2YXIgY29weSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHZhbFtpXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHAgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1twLnRhYnN0b3BJZF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGogPSB2YWwubGFzdEluZGV4T2YocCwgaSAtIDEpO1xuICAgICAgICAgICAgICAgICAgICBwID0gY29weVtqXSB8fCB7IHRhYnN0b3BJZDogcC50YWJzdG9wSWQgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29weVtpXSA9IHA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29weTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHA6IGFueSA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBpZCA9IHAudGFic3RvcElkO1xuICAgICAgICAgICAgdmFyIGkxID0gdG9rZW5zLmluZGV4T2YocCwgaSArIDEpO1xuICAgICAgICAgICAgaWYgKGV4cGFuZGluZ1tpZF0pIHtcbiAgICAgICAgICAgICAgICAvLyBpZiByZWFjaGVkIGNsb3NpbmcgYnJhY2tldCBjbGVhciBleHBhbmRpbmcgc3RhdGVcbiAgICAgICAgICAgICAgICBpZiAoZXhwYW5kaW5nW2lkXSA9PT0gcClcbiAgICAgICAgICAgICAgICAgICAgZXhwYW5kaW5nW2lkXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIGp1c3QgaWdub3JlIHJlY3Vyc2l2ZSB0YWJzdG9wXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0cyA9IHRhYnN0b3BzW2lkXTtcbiAgICAgICAgICAgIHZhciBhcmcgPSAodHlwZW9mIHRzLnZhbHVlID09PSBcInN0cmluZ1wiKSA/IFt0cy52YWx1ZV0gOiBjb3B5VmFsdWUodHMudmFsdWUpO1xuICAgICAgICAgICAgYXJnLnVuc2hpZnQoaSArIDEsIE1hdGgubWF4KDAsIGkxIC0gaSkpO1xuICAgICAgICAgICAgYXJnLnB1c2gocCk7XG4gICAgICAgICAgICBleHBhbmRpbmdbaWRdID0gcDtcbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2UuYXBwbHkodG9rZW5zLCBhcmcpO1xuXG4gICAgICAgICAgICBpZiAodHMuaW5kZXhPZihwKSA9PT0gLTEpXG4gICAgICAgICAgICAgICAgdHMucHVzaChwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNvbnZlcnQgdG8gcGxhaW4gdGV4dFxuICAgICAgICB2YXIgcm93ID0gMCwgY29sdW1uID0gMDtcbiAgICAgICAgdmFyIHRleHQgPSBcIlwiO1xuICAgICAgICAvLyBGSVhNRTogdCBzaG91bGQgYmUgc3RyaW5nIG9yIFRva2VuLCBidXQgYmVsb3cgd2UgdXNlIHN0YXJ0IGFuZCBlbmQuXG4gICAgICAgIC8vIFRoYXQgbG9va3MgbW9yZSBsaWtlIGEgUmFuZ2UhXG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHQ6IGFueSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRbMF0gPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uID0gdC5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgY29sdW1uICs9IHQubGVuZ3RoO1xuICAgICAgICAgICAgICAgIHRleHQgKz0gdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghdC5zdGFydClcbiAgICAgICAgICAgICAgICAgICAgdC5zdGFydCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0LmVuZCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIGVuZCA9IGVkaXRvci5nZXRTZXNzaW9uKCkucmVwbGFjZShyYW5nZSwgdGV4dCk7XG5cbiAgICAgICAgdmFyIHRzTWFuYWdlciA9IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID8gZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gOiBuZXcgVGFic3RvcE1hbmFnZXIoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNlbGVjdGlvbklkID0gZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUgJiYgZWRpdG9yLnNlbGVjdGlvblsnaW5kZXgnXTtcbiAgICAgICAgdHNNYW5hZ2VyLmFkZFRhYnN0b3BzKHRhYnN0b3BzLCByYW5nZS5zdGFydCwgZW5kLCBzZWxlY3Rpb25JZCk7XG4gICAgfVxuXG4gICAgcHVibGljIGluc2VydFNuaXBwZXQoZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0LCB1bnVzZWQ/KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgaWYgKGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKVxuICAgICAgICAgICAgcmV0dXJuIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcblxuICAgICAgICBlZGl0b3IuZm9yRWFjaFNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXRUZXh0KTtcbiAgICAgICAgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG5cbiAgICAgICAgaWYgKGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRTY29wZShlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgIHZhciBzY29wZSA9IHNlc3Npb24uJG1vZGUuJGlkIHx8IFwiXCI7XG4gICAgICAgIHNjb3BlID0gc2NvcGUuc3BsaXQoXCIvXCIpLnBvcCgpO1xuICAgICAgICBpZiAoc2NvcGUgPT09IFwiaHRtbFwiIHx8IHNjb3BlID09PSBcInBocFwiKSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogQ291cGxpbmcgdG8gUEhQP1xuICAgICAgICAgICAgLy8gUEhQIGlzIGFjdHVhbGx5IEhUTUxcbiAgICAgICAgICAgIGlmIChzY29wZSA9PT0gXCJwaHBcIiAmJiAhc2Vzc2lvbi4kbW9kZVsnaW5saW5lUGhwJ10pXG4gICAgICAgICAgICAgICAgc2NvcGUgPSBcImh0bWxcIjtcbiAgICAgICAgICAgIHZhciBjID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKGMucm93KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc3RhdGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZSA9IHN0YXRlWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHN0YXRlLnN1YnN0cmluZykge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5zdWJzdHJpbmcoMCwgMykgPT0gXCJqcy1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcImphdmFzY3JpcHRcIjtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5zdWJzdHJpbmcoMCwgNCkgPT0gXCJjc3MtXCIpXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlID0gXCJjc3NcIjtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5zdWJzdHJpbmcoMCwgNCkgPT0gXCJwaHAtXCIpXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlID0gXCJwaHBcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY29wZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzY29wZSA9IHRoaXMuJGdldFNjb3BlKGVkaXRvcik7XG4gICAgICAgIHZhciBzY29wZXMgPSBbc2NvcGVdO1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgaWYgKHNuaXBwZXRNYXBbc2NvcGVdICYmIHNuaXBwZXRNYXBbc2NvcGVdLmluY2x1ZGVTY29wZXMpIHtcbiAgICAgICAgICAgIHNjb3Blcy5wdXNoLmFwcGx5KHNjb3Blcywgc25pcHBldE1hcFtzY29wZV0uaW5jbHVkZVNjb3Blcyk7XG4gICAgICAgIH1cbiAgICAgICAgc2NvcGVzLnB1c2goXCJfXCIpO1xuICAgICAgICByZXR1cm4gc2NvcGVzO1xuICAgIH1cblxuICAgIHB1YmxpYyBleHBhbmRXaXRoVGFiKGVkaXRvcjogRWRpdG9yLCBvcHRpb25zPyk6IGJvb2xlYW4ge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciByZXN1bHQ6IGJvb2xlYW4gPSBlZGl0b3IuZm9yRWFjaFNlbGVjdGlvbihmdW5jdGlvbigpIHsgcmV0dXJuIHNlbGYuZXhwYW5kU25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIG9wdGlvbnMpOyB9LCBudWxsLCB7IGtlZXBPcmRlcjogdHJ1ZSB9KTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSkge1xuICAgICAgICAgICAgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBleHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvcjogRWRpdG9yLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGJlZm9yZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgYWZ0ZXIgPSBsaW5lLnN1YnN0cihjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHRoaXMuZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0cywgYmVmb3JlLCBhZnRlcik7XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKCFzbmlwcGV0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmRyeVJ1bilcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBzZXNzaW9uLmRvYy5yZW1vdmVJbkxpbmUoY3Vyc29yLnJvdyxcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gLSBzbmlwcGV0LnJlcGxhY2VCZWZvcmUubGVuZ3RoLFxuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiArIHNuaXBwZXQucmVwbGFjZUFmdGVyLmxlbmd0aFxuICAgICAgICApO1xuXG4gICAgICAgIHRoaXMudmFyaWFibGVzWydNX18nXSA9IHNuaXBwZXQubWF0Y2hCZWZvcmU7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydUX18nXSA9IHNuaXBwZXQubWF0Y2hBZnRlcjtcbiAgICAgICAgdGhpcy5pbnNlcnRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgc25pcHBldC5jb250ZW50KTtcblxuICAgICAgICB0aGlzLnZhcmlhYmxlc1snTV9fJ10gPSB0aGlzLnZhcmlhYmxlc1snVF9fJ10gPSBudWxsO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGZpbmRNYXRjaGluZ1NuaXBwZXQoc25pcHBldExpc3QsIGJlZm9yZSwgYWZ0ZXIpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHNuaXBwZXRMaXN0Lmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgdmFyIHMgPSBzbmlwcGV0TGlzdFtpXTtcbiAgICAgICAgICAgIGlmIChzLnN0YXJ0UmUgJiYgIXMuc3RhcnRSZS50ZXN0KGJlZm9yZSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBpZiAocy5lbmRSZSAmJiAhcy5lbmRSZS50ZXN0KGFmdGVyKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmICghcy5zdGFydFJlICYmICFzLmVuZFJlKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBzLm1hdGNoQmVmb3JlID0gcy5zdGFydFJlID8gcy5zdGFydFJlLmV4ZWMoYmVmb3JlKSA6IFtcIlwiXTtcbiAgICAgICAgICAgIHMubWF0Y2hBZnRlciA9IHMuZW5kUmUgPyBzLmVuZFJlLmV4ZWMoYWZ0ZXIpIDogW1wiXCJdO1xuICAgICAgICAgICAgcy5yZXBsYWNlQmVmb3JlID0gcy50cmlnZ2VyUmUgPyBzLnRyaWdnZXJSZS5leGVjKGJlZm9yZSlbMF0gOiBcIlwiO1xuICAgICAgICAgICAgcy5yZXBsYWNlQWZ0ZXIgPSBzLmVuZFRyaWdnZXJSZSA/IHMuZW5kVHJpZ2dlclJlLmV4ZWMoYWZ0ZXIpWzBdIDogXCJcIjtcbiAgICAgICAgICAgIHJldHVybiBzO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvblxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc291cmNlOiBTbmlwcGV0TWFuYWdlcikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb24oZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBTbmlwcGV0TWFuYWdlcikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzb3VyY2U6IFNuaXBwZXRNYW5hZ2VyKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc291cmNlOiBTbmlwcGV0TWFuYWdlcikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub2ZmKGV2ZW50TmFtZSwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHB1YmxpYyByZWdpc3RlcihzbmlwcGV0cywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gd3JhcFJlZ2V4cChzcmMpIHtcbiAgICAgICAgICAgIGlmIChzcmMgJiYgIS9eXFxeP1xcKC4qXFwpXFwkPyR8XlxcXFxiJC8udGVzdChzcmMpKVxuICAgICAgICAgICAgICAgIHNyYyA9IFwiKD86XCIgKyBzcmMgKyBcIilcIjtcblxuICAgICAgICAgICAgcmV0dXJuIHNyYyB8fCBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGd1YXJkZWRSZWdleHAocmUsIGd1YXJkLCBvcGVuaW5nKSB7XG4gICAgICAgICAgICByZSA9IHdyYXBSZWdleHAocmUpO1xuICAgICAgICAgICAgZ3VhcmQgPSB3cmFwUmVnZXhwKGd1YXJkKTtcbiAgICAgICAgICAgIGlmIChvcGVuaW5nKSB7XG4gICAgICAgICAgICAgICAgcmUgPSBndWFyZCArIHJlO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVtyZS5sZW5ndGggLSAxXSAhPSBcIiRcIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSByZSArIFwiJFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZSA9IHJlICsgZ3VhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlICYmIHJlWzBdICE9IFwiXlwiKVxuICAgICAgICAgICAgICAgICAgICByZSA9IFwiXlwiICsgcmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChyZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGRTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIGlmICghcy5zY29wZSlcbiAgICAgICAgICAgICAgICBzLnNjb3BlID0gc2NvcGUgfHwgXCJfXCI7XG4gICAgICAgICAgICBzY29wZSA9IHMuc2NvcGU7XG4gICAgICAgICAgICBpZiAoIXNuaXBwZXRNYXBbc2NvcGVdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0TmFtZU1hcFtzY29wZV0gPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXROYW1lTWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgb2xkID0gbWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKG9sZClcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51bnJlZ2lzdGVyKG9sZCk7XG4gICAgICAgICAgICAgICAgbWFwW3MubmFtZV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0ucHVzaChzKTtcblxuICAgICAgICAgICAgaWYgKHMudGFiVHJpZ2dlciAmJiAhcy50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzLmd1YXJkICYmIC9eXFx3Ly50ZXN0KHMudGFiVHJpZ2dlcikpXG4gICAgICAgICAgICAgICAgICAgIHMuZ3VhcmQgPSBcIlxcXFxiXCI7XG4gICAgICAgICAgICAgICAgcy50cmlnZ2VyID0gZXNjYXBlUmVnRXhwKHMudGFiVHJpZ2dlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHMuc3RhcnRSZSA9IGd1YXJkZWRSZWdleHAocy50cmlnZ2VyLCBzLmd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMudHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLnRyaWdnZXIsIFwiXCIpO1xuXG4gICAgICAgICAgICBzLmVuZFJlID0gZ3VhcmRlZFJlZ2V4cChzLmVuZFRyaWdnZXIsIHMuZW5kR3VhcmQsIHRydWUpO1xuICAgICAgICAgICAgcy5lbmRUcmlnZ2VyUmUgPSBuZXcgUmVnRXhwKHMuZW5kVHJpZ2dlciwgXCJcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIGFkZFNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2goYWRkU25pcHBldCk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCByZWdpc3RlclNuaXBwZXRzXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJyZWdpc3RlclNuaXBwZXRzXCIsIHsgc2NvcGU6IHNjb3BlIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdW5yZWdpc3RlcihzbmlwcGV0cywgc2NvcGU/KSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlbW92ZVNuaXBwZXQocykge1xuICAgICAgICAgICAgdmFyIG5hbWVNYXAgPSBzbmlwcGV0TmFtZU1hcFtzLnNjb3BlIHx8IHNjb3BlXTtcbiAgICAgICAgICAgIGlmIChuYW1lTWFwICYmIG5hbWVNYXBbcy5uYW1lXSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBuYW1lTWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXRNYXBbcy5zY29wZSB8fCBzY29wZV07XG4gICAgICAgICAgICAgICAgdmFyIGkgPSBtYXAgJiYgbWFwLmluZGV4T2Yocyk7XG4gICAgICAgICAgICAgICAgaWYgKGkgPj0gMClcbiAgICAgICAgICAgICAgICAgICAgbWFwLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIHJlbW92ZVNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2gocmVtb3ZlU25pcHBldCk7XG4gICAgfVxuXG4gICAgcHVibGljIHBhcnNlU25pcHBldEZpbGUoc3RyKSB7XG4gICAgICAgIHN0ciA9IHN0ci5yZXBsYWNlKC9cXHIvZywgXCJcIik7XG4gICAgICAgIHZhciBsaXN0ID0gW107XG4gICAgICAgIHZhciBzbmlwcGV0OiBhbnkgPSB7fTtcbiAgICAgICAgdmFyIHJlID0gL14jLip8Xih7W1xcc1xcU10qfSlcXHMqJHxeKFxcUyspICguKikkfF4oKD86XFxuKlxcdC4qKSspL2dtO1xuICAgICAgICB2YXIgbTtcbiAgICAgICAgd2hpbGUgKG0gPSByZS5leGVjKHN0cikpIHtcbiAgICAgICAgICAgIGlmIChtWzFdKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldCA9IEpTT04ucGFyc2UobVsxXSk7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QucHVzaChzbmlwcGV0KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH0gaWYgKG1bNF0pIHtcbiAgICAgICAgICAgICAgICBzbmlwcGV0LmNvbnRlbnQgPSBtWzRdLnJlcGxhY2UoL15cXHQvZ20sIFwiXCIpO1xuICAgICAgICAgICAgICAgIGxpc3QucHVzaChzbmlwcGV0KTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0ge307XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBtWzJdLCB2YWwgPSBtWzNdO1xuICAgICAgICAgICAgICAgIGlmIChrZXkgPT0gXCJyZWdleFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBndWFyZFJlID0gL1xcLygoPzpbXlxcL1xcXFxdfFxcXFwuKSopfCQvZztcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5ndWFyZCA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LnRyaWdnZXIgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5lbmRUcmlnZ2VyID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZW5kR3VhcmQgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleSA9PSBcInNuaXBwZXRcIikge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LnRhYlRyaWdnZXIgPSB2YWwubWF0Y2goL15cXFMqLylbMF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghc25pcHBldC5uYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgc25pcHBldC5uYW1lID0gdmFsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXRba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfVxuICAgIHByaXZhdGUgZ2V0U25pcHBldEJ5TmFtZShuYW1lLCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0O1xuICAgICAgICB0aGlzLmdldEFjdGl2ZVNjb3BlcyhlZGl0b3IpLnNvbWUoZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzbmlwcGV0cyA9IHNuaXBwZXRNYXBbc2NvcGVdO1xuICAgICAgICAgICAgaWYgKHNuaXBwZXRzKVxuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSBzbmlwcGV0c1tuYW1lXTtcbiAgICAgICAgICAgIHJldHVybiAhIXNuaXBwZXQ7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICByZXR1cm4gc25pcHBldDtcbiAgICB9XG59XG5cbmNsYXNzIFRhYnN0b3BNYW5hZ2VyIHtcbiAgICBwcml2YXRlIGluZGV4OiBudW1iZXI7XG4gICAgcHJpdmF0ZSByYW5nZXM7XG4gICAgcHJpdmF0ZSB0YWJzdG9wczogeyBmaXJzdE5vbkxpbmtlZDogUmFuZ2U7IGhhc0xpbmtlZFJhbmdlczogYm9vbGVhbjsgbGVuZ3RoOiBudW1iZXIgfVtdO1xuICAgIHByaXZhdGUgJG9wZW5UYWJzdG9wcztcbiAgICBwcml2YXRlIHNlbGVjdGVkVGFic3RvcDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUga2V5Ym9hcmRIYW5kbGVyID0gbmV3IEhhc2hIYW5kbGVyKCk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZXNzaW9uO1xuICAgIHByaXZhdGUgJG9uQWZ0ZXJFeGVjO1xuICAgIHByaXZhdGUgJGluQ2hhbmdlO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gdGhpcztcbiAgICAgICAgdGhpcy4kb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uID0gZGVsYXllZENhbGwodGhpcy5vbkNoYW5nZVNlbGVjdGlvbi5iaW5kKHRoaXMpKS5zY2hlZHVsZTtcbiAgICAgICAgdGhpcy4kb25DaGFuZ2VTZXNzaW9uID0gdGhpcy5vbkNoYW5nZVNlc3Npb24uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy4kb25BZnRlckV4ZWMgPSB0aGlzLm9uQWZ0ZXJFeGVjLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuYXR0YWNoKGVkaXRvcik7XG4gICAgICAgIHRoaXMua2V5Ym9hcmRIYW5kbGVyLmJpbmRLZXlzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNuaXBwZXRNYW5hZ2VyICYmIHNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIoZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiU2hpZnQtVGFiXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KC0xKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiRXNjXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwiUmV0dXJuXCI6IGZ1bmN0aW9uKGVkOiBFZGl0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9lZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgcHJpdmF0ZSBhdHRhY2goZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5pbmRleCA9IDA7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBbXTtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHByaXZhdGUgZGV0YWNoKCkge1xuICAgICAgICB0aGlzLnRhYnN0b3BzLmZvckVhY2godGhpcy5yZW1vdmVUYWJzdG9wTWFya2VycywgdGhpcyk7XG4gICAgICAgIHRoaXMucmFuZ2VzID0gbnVsbDtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5vZmYoXCJhZnRlckV4ZWNcIiwgdGhpcy4kb25BZnRlckV4ZWMpO1xuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLnJlbW92ZUtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZShlLyo6IENoYW5nZSovLCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgY2hhbmdlUmFuZ2UgPSBlLmRhdGEucmFuZ2U7XG4gICAgICAgIHZhciBpc1JlbW92ZSA9IGUuZGF0YS5hY3Rpb25bMF0gPT0gXCJyXCI7XG4gICAgICAgIHZhciBzdGFydCA9IGNoYW5nZVJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gY2hhbmdlUmFuZ2UuZW5kO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBzdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBlbmQucm93O1xuICAgICAgICB2YXIgbGluZURpZiA9IGVuZFJvdyAtIHN0YXJ0Um93O1xuICAgICAgICB2YXIgY29sRGlmZiA9IGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW47XG5cbiAgICAgICAgaWYgKGlzUmVtb3ZlKSB7XG4gICAgICAgICAgICBsaW5lRGlmID0gLWxpbmVEaWY7XG4gICAgICAgICAgICBjb2xEaWZmID0gLWNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLiRpbkNoYW5nZSAmJiBpc1JlbW92ZSkge1xuICAgICAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZE91dHNpZGUgPSB0cyAmJiAhdHMuc29tZShmdW5jdGlvbihyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVQb2ludHMoci5zdGFydCwgc3RhcnQpIDw9IDAgJiYgY29tcGFyZVBvaW50cyhyLmVuZCwgZW5kKSA+PSAwO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlZE91dHNpZGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMucmFuZ2VzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHIgPSByYW5nZXNbaV07XG4gICAgICAgICAgICBpZiAoci5lbmQucm93IDwgc3RhcnQucm93KVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAoaXNSZW1vdmUgJiYgY29tcGFyZVBvaW50cyhzdGFydCwgci5zdGFydCkgPCAwICYmIGNvbXBhcmVQb2ludHMoZW5kLCByLmVuZCkgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVSYW5nZShyKTtcbiAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA9PSBzdGFydFJvdyAmJiByLnN0YXJ0LmNvbHVtbiA+IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA9PSBzdGFydFJvdyAmJiByLmVuZC5jb2x1bW4gPj0gc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgIHIuZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuc3RhcnQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuc3RhcnQucm93ICs9IGxpbmVEaWY7XG4gICAgICAgICAgICBpZiAoci5lbmQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuZW5kLnJvdyArPSBsaW5lRGlmO1xuXG4gICAgICAgICAgICBpZiAoY29tcGFyZVBvaW50cyhyLnN0YXJ0LCByLmVuZCkgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUxpbmtlZEZpZWxkcygpIHtcbiAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmhhc0xpbmtlZFJhbmdlcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLmdldFNlc3Npb24oKTtcbiAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZSh0cy5maXJzdE5vbkxpbmtlZCk7XG4gICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRzW2ldO1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5saW5rZWQpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgZm10ID0gc25pcHBldE1hbmFnZXIudG1TdHJGb3JtYXQodGV4dCwgcmFuZ2Uub3JpZ2luYWwpO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBmbXQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkFmdGVyRXhlYyhlKSB7XG4gICAgICAgIGlmIChlLmNvbW1hbmQgJiYgIWUuY29tbWFuZC5yZWFkT25seSlcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGlua2VkRmllbGRzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlbGVjdGlvbihldmVudCwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24ubGVhZDtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5hbmNob3I7XG4gICAgICAgIHZhciBpc0VtcHR5ID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBjb250YWluc0xlYWQgPSB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zQW5jaG9yID0gaXNFbXB0eSB8fCB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjb250YWluc0xlYWQgJiYgY29udGFpbnNBbmNob3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlc3Npb24oZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0YWJOZXh0KGRpcikge1xuICAgICAgICB2YXIgbWF4ID0gdGhpcy50YWJzdG9wcy5sZW5ndGg7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuaW5kZXggKyAoZGlyIHx8IDEpO1xuICAgICAgICBpbmRleCA9IE1hdGgubWluKE1hdGgubWF4KGluZGV4LCAxKSwgbWF4KTtcbiAgICAgICAgaWYgKGluZGV4ID09IG1heClcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZWxlY3RUYWJzdG9wKGluZGV4KTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAwKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdFRhYnN0b3AoaW5kZXg6IG51bWJlcikge1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAodHMpXG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKHRzKTtcbiAgICAgICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgICAgICB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IHRzO1xuICAgICAgICBpZiAoIXRoaXMuZWRpdG9yLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzZWwgPSB0aGlzLmVkaXRvci5tdWx0aVNlbGVjdDtcbiAgICAgICAgICAgIHNlbC50b1NpbmdsZVJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkLmNsb25lKCkpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIGlmICh0cy5oYXNMaW5rZWRSYW5nZXMgJiYgdHNbaV0ubGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2UodHNbaV0uY2xvbmUoKSwgdHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB0b2RvIGludmVzdGlnYXRlIHdoeSBpcyB0aGlzIG5lZWRlZFxuICAgICAgICAgICAgaWYgKHNlbC5yYW5nZXNbMF0pXG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHNlbC5yYW5nZXNbMF0uY2xvbmUoKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5hZGRLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHB1YmxpYyBhZGRUYWJzdG9wcyA9IGZ1bmN0aW9uKHRhYnN0b3BzLCBzdGFydCwgZW5kLCB1bnVzZWQpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRvcGVuVGFic3RvcHMpXG4gICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBbXTtcbiAgICAgICAgLy8gYWRkIGZpbmFsIHRhYnN0b3AgaWYgbWlzc2luZ1xuICAgICAgICBpZiAoIXRhYnN0b3BzWzBdKSB7XG4gICAgICAgICAgICB2YXIgcCA9IFJhbmdlLmZyb21Qb2ludHMoZW5kLCBlbmQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0gPSBbcF07XG4gICAgICAgICAgICB0YWJzdG9wc1swXS5pbmRleCA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IHRoaXMuaW5kZXg7XG4gICAgICAgIHZhciBhcmcgPSBbaSArIDEsIDBdO1xuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgZGVzdCA9IHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gfHwgdHM7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHRzW2ldO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gUmFuZ2UuZnJvbVBvaW50cyhwLnN0YXJ0LCBwLmVuZCB8fCBwLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2Uuc3RhcnQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICBtb3ZlUG9pbnQocmFuZ2UuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICAgICAgcmFuZ2Uub3JpZ2luYWwgPSBwO1xuICAgICAgICAgICAgICAgIHJhbmdlLnRhYnN0b3AgPSBkZXN0O1xuICAgICAgICAgICAgICAgIHJhbmdlcy5wdXNoKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGVzdCAhPSB0cylcbiAgICAgICAgICAgICAgICAgICAgZGVzdC51bnNoaWZ0KHJhbmdlKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGRlc3RbaV0gPSByYW5nZTtcbiAgICAgICAgICAgICAgICBpZiAocC5mbXRTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UubGlua2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QuZmlyc3ROb25MaW5rZWQgPSByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGRlc3QgPT09IHRzKSB7XG4gICAgICAgICAgICAgICAgYXJnLnB1c2goZGVzdCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSA9IGRlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmFkZFRhYnN0b3BNYXJrZXJzKGRlc3QpO1xuICAgICAgICB9LCB0aGlzKTtcblxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDIpIHtcbiAgICAgICAgICAgIC8vIHdoZW4gYWRkaW5nIG5ldyBzbmlwcGV0IGluc2lkZSBleGlzdGluZyBvbmUsIG1ha2Ugc3VyZSAwIHRhYnN0b3AgaXMgYXQgdGhlIGVuZFxuICAgICAgICAgICAgaWYgKHRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGFyZy5zcGxpY2UoMiwgMSlbMF0pO1xuICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UuYXBwbHkodGhpcy50YWJzdG9wcywgYXJnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYWRkVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UvKjogcm0uUmFuZ2UqLykge1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5tYXJrZXJJZClcbiAgICAgICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zbmlwcGV0LW1hcmtlclwiLCBcInRleHRcIik7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlVGFic3RvcE1hcmtlcnMgPSBmdW5jdGlvbih0cykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHRzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gbnVsbDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVSYW5nZSA9IGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIHZhciBpID0gcmFuZ2UudGFic3RvcC5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgcmFuZ2UudGFic3RvcC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIGkgPSB0aGlzLnJhbmdlcy5pbmRleE9mKHJhbmdlKTtcbiAgICAgICAgdGhpcy5yYW5nZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICB0aGlzLmVkaXRvci5zZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgIGlmICghcmFuZ2UudGFic3RvcC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGkgPSB0aGlzLnRhYnN0b3BzLmluZGV4T2YocmFuZ2UudGFic3RvcCk7XG4gICAgICAgICAgICBpZiAoaSAhPSAtMSlcbiAgICAgICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIGlmICghdGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIGNoYW5nZVRyYWNrZXI6IGFueSA9IHt9O1xuY2hhbmdlVHJhY2tlci5vbkNoYW5nZSA9IEFuY2hvci5wcm90b3R5cGUub25DaGFuZ2U7XG5jaGFuZ2VUcmFja2VyLnNldFBvc2l0aW9uID0gZnVuY3Rpb24ocm93LCBjb2x1bW4pIHtcbiAgICB0aGlzLnBvcy5yb3cgPSByb3c7XG4gICAgdGhpcy5wb3MuY29sdW1uID0gY29sdW1uO1xufTtcbmNoYW5nZVRyYWNrZXIudXBkYXRlID0gZnVuY3Rpb24ocG9zLCBkZWx0YSwgJGluc2VydFJpZ2h0KSB7XG4gICAgdGhpcy4kaW5zZXJ0UmlnaHQgPSAkaW5zZXJ0UmlnaHQ7XG4gICAgdGhpcy5wb3MgPSBwb3M7XG4gICAgdGhpcy5vbkNoYW5nZShkZWx0YSk7XG59O1xuXG52YXIgbW92ZVBvaW50ID0gZnVuY3Rpb24ocG9pbnQsIGRpZmYpIHtcbiAgICBpZiAocG9pbnQucm93ID09IDApXG4gICAgICAgIHBvaW50LmNvbHVtbiArPSBkaWZmLmNvbHVtbjtcbiAgICBwb2ludC5yb3cgKz0gZGlmZi5yb3c7XG59O1xuXG52YXIgbW92ZVJlbGF0aXZlID0gZnVuY3Rpb24ocG9pbnQsIHN0YXJ0KSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSBzdGFydC5yb3cpXG4gICAgICAgIHBvaW50LmNvbHVtbiAtPSBzdGFydC5jb2x1bW47XG4gICAgcG9pbnQucm93IC09IHN0YXJ0LnJvdztcbn07XG5cblxuZW5zdXJlSFRNTFN0eWxlRWxlbWVudChcIlxcXG4uYWNlX3NuaXBwZXQtbWFya2VyIHtcXFxuICAgIC1tb3otYm94LXNpemluZzogYm9yZGVyLWJveDtcXFxuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBiYWNrZ3JvdW5kOiByZ2JhKDE5NCwgMTkzLCAyMDgsIDAuMDkpO1xcXG4gICAgYm9yZGVyOiAxcHggZG90dGVkIHJnYmEoMjExLCAyMDgsIDIzNSwgMC42Mik7XFxcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XFxcbn1cIik7XG5cbmV4cG9ydCB2YXIgc25pcHBldE1hbmFnZXIgPSBuZXcgU25pcHBldE1hbmFnZXIoKTtcblxuKGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5zZXJ0U25pcHBldCA9IGZ1bmN0aW9uKGNvbnRlbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXQodGhpcywgY29udGVudCwgb3B0aW9ucyk7XG4gICAgfTtcbiAgICB0aGlzLmV4cGFuZFNuaXBwZXQgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKHRoaXMsIG9wdGlvbnMpO1xuICAgIH07XG59KS5jYWxsKEVkaXRvci5wcm90b3R5cGUpO1xuIl19