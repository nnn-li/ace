import { importCssString } from "./lib/dom";
import { EventEmitterClass } from "./lib/event_emitter";
import { delayedCall, escapeRegExp } from "./lib/lang";
import Range from "./Range";
import comparePoints from "./comparePoints";
import Anchor from "./Anchor";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiT0E4Qk8sRUFBQyxlQUFlLEVBQUMsTUFBTSxXQUFXO09BQ2xDLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxxQkFBcUI7T0FDOUMsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxLQUFLLE1BQU0sU0FBUztPQUNwQixhQUFhLE1BQU0saUJBQWlCO09BQ3BDLE1BQU0sTUFBTSxVQUFVO09BQ3RCLEVBQUMsV0FBVyxFQUFDLE1BQU0seUJBQXlCO09BQzVDLFNBQVMsTUFBTSxhQUFhO09BQzVCLE1BQU0sTUFBTSxVQUFVO0FBRTdCLElBQUksZUFBZSxHQUFHLGdCQUFnQixDQUFDO0FBRXZDLGdCQUFnQixFQUFFO0lBQ2RBLE1BQU1BLENBQUNBLFdBQVdBLEdBQUdBLEVBQUVBLEdBQUdBLFVBQVVBLENBQUNBO0FBQ3pDQSxDQUFDQTtBQUNELHNCQUFzQixHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUs7SUFDL0JDLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM3Q0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsU0FBU0EsRUFBRUEsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDOUNBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBO0FBQzNCQSxDQUFDQTtBQUVELG9DQUFvQyxpQkFBaUI7SUFLakRDO1FBQ0lDLE9BQU9BLENBQUNBO1FBTExBLGVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLG1CQUFjQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNwQkEsY0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFJdkJBLENBQUNBO0lBdUdPRCxZQUFZQTtRQUNoQkUsY0FBY0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsWUFBWUEsR0FBR0E7WUFDcEMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUM7UUFDckMsQ0FBQyxDQUFDQTtRQUNGQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFFT0YsaUJBQWlCQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFXQTtRQUN0Q0csTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsR0FBR0EsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7WUFDM0UsTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO1FBQ3hCLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFT0gsZ0JBQWdCQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQTtRQUNqQ0ksRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxNQUFNQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUNEQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDUkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLEtBQUtBLGNBQWNBO2dCQUNmQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtZQUU3QkEsS0FBS0EsV0FBV0EsQ0FBQ0E7WUFDakJBLEtBQUtBLGVBQWVBO2dCQUNoQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLEtBQUtBLGNBQWNBO2dCQUNmQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFD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O1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0E7Z0JBQ3JCQSxRQUFRQSxDQUFDQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFFekJBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLElBQUlBLEVBQUVBLEdBQUdBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN6RUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENB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LEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztBQUVqRCxDQUFDO0lBQ0csSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFTLE9BQU8sRUFBRSxPQUFPO1FBQzFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDaEUsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFTLE9BQU87UUFDakMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHtpbXBvcnRDc3NTdHJpbmd9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7RXZlbnRFbWl0dGVyQ2xhc3N9IGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQge2RlbGF5ZWRDYWxsLCBlc2NhcGVSZWdFeHB9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4vUmFuZ2VcIjtcbmltcG9ydCBjb21wYXJlUG9pbnRzIGZyb20gXCIuL2NvbXBhcmVQb2ludHNcIlxuaW1wb3J0IEFuY2hvciBmcm9tIFwiLi9BbmNob3JcIjtcbmltcG9ydCB7SGFzaEhhbmRsZXJ9IGZyb20gXCIuL2tleWJvYXJkL2hhc2hfaGFuZGxlclwiO1xuaW1wb3J0IFRva2VuaXplciBmcm9tIFwiLi9Ub2tlbml6ZXJcIjtcbmltcG9ydCBFZGl0b3IgZnJvbSAnLi9FZGl0b3InO1xuXG52YXIgVEFCU1RPUF9NQU5BR0VSID0gJ3RhYnN0b3BNYW5hZ2VyJztcblxuZnVuY3Rpb24gZXNjYXBlKGNoKSB7XG4gICAgcmV0dXJuIFwiKD86W15cXFxcXFxcXFwiICsgY2ggKyBcIl18XFxcXFxcXFwuKVwiO1xufVxuZnVuY3Rpb24gVGFic3RvcFRva2VuKHN0ciwgXywgc3RhY2spOiBhbnlbXSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigxKTtcbiAgICBpZiAoL15cXGQrJC8udGVzdChzdHIpICYmICFzdGFjay5pbkZvcm1hdFN0cmluZykge1xuICAgICAgICByZXR1cm4gW3sgdGFic3RvcElkOiBwYXJzZUludChzdHIsIDEwKSB9XTtcbiAgICB9XG4gICAgcmV0dXJuIFt7IHRleHQ6IHN0ciB9XTtcbn1cblxuZXhwb3J0IGNsYXNzIFNuaXBwZXRNYW5hZ2VyIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyBzbmlwcGV0TWFwID0ge307XG4gICAgcHJpdmF0ZSBzbmlwcGV0TmFtZU1hcCA9IHt9O1xuICAgIHByaXZhdGUgdmFyaWFibGVzID0ge307XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyAkdG9rZW5pemVyID0gbmV3IFRva2VuaXplcih7XG4gICAgICAgIHN0YXJ0OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC86LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjayk6IGFueSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggJiYgc3RhY2tbMF0uZXhwZWN0SWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5lbHNlQnJhbmNoID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCI6XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcXFwuLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIn1cIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFwiYCRcXFxcXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJuXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNoID09IFwidFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChcInVsVUxFXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB7IGNoYW5nZUNhc2U6IGNoLCBsb2NhbDogY2ggPiBcImFcIiB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFt2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC99LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrLmxlbmd0aCA/IHN0YWNrLnNoaWZ0KCkgOiB2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCQoPzpcXGQrfFxcdyspLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBUYWJzdG9wVG9rZW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCRcXHtbXFxkQS1aX2Etel0rLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbihzdHIsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdCA9IFRhYnN0b3BUb2tlbihzdHIuc3Vic3RyKDEpLCBzdGF0ZSwgc3RhY2spO1xuICAgICAgICAgICAgICAgICAgICBzdGFjay51bnNoaWZ0KHRbMF0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInNuaXBwZXRWYXJcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcbi8sXG4gICAgICAgICAgICAgICAgdG9rZW46IFwibmV3bGluZVwiLFxuICAgICAgICAgICAgICAgIG1lcmdlOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBzbmlwcGV0VmFyOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHxcIiArIGVzY2FwZShcIlxcXFx8XCIpICsgXCIqXFxcXHxcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY2hvaWNlcyA9IHZhbC5zbGljZSgxLCAtMSkuc3BsaXQoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvKD86KFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKikvKShcXFxcdyopOj9cIixcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdHMgPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10U3RyaW5nID0gdmFsO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHRoaXMuc3BsaXRSZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHRzLmd1YXJkID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXQgPSB2YWxbMl07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZsYWcgPSB2YWxbM107XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJgXCIgKyBlc2NhcGUoXCJgXCIpICsgXCIqYFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jb2RlID0gdmFsLnNwbGljZSgxLCAtMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcP1wiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2tbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyByZWdleDogXCIoW146fVxcXFxcXFxcXXxcXFxcXFxcXC4pKjo/XCIsIHRva2VuOiBcIlwiLCBuZXh0OiBcInN0YXJ0XCIgfVxuICAgICAgICBdLFxuICAgICAgICBmb3JtYXRTdHJpbmc6IFtcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispL1wiLCB0b2tlbjogXCJyZWdleFwiIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLmluRm9ybWF0U3RyaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgcHJpdmF0ZSBnZXRUb2tlbml6ZXIoKSB7XG4gICAgICAgIFNuaXBwZXRNYW5hZ2VyLnByb3RvdHlwZS5nZXRUb2tlbml6ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRva2VuaXplVG1TbmlwcGV0KHN0ciwgc3RhcnRTdGF0ZT8pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VG9rZW5pemVyKCkuZ2V0TGluZVRva2VucyhzdHIsIHN0YXJ0U3RhdGUpLnRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgcmV0dXJuIHgudmFsdWUgfHwgeDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgbmFtZSkge1xuICAgICAgICBpZiAoL15bQS1aXVxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICB2YXIgaSA9IG5hbWUuc3Vic3RyKDEpO1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1tuYW1lWzBdICsgXCJfX1wiXSB8fCB7fSlbaV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKC9eXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbJ19fJ10gfHwge30pW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoL15UTV8vLCBcIlwiKTtcblxuICAgICAgICBpZiAoIWVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHMgPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9XT1JEXCI6XG4gICAgICAgICAgICAgICAgdmFyIHIgPSBzLmdldFdvcmRSYW5nZSgpO1xuICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVElPTlwiOlxuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVEVEX1RFWFRcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUZXh0UmFuZ2Uocik7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9MSU5FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICAgICAgY2FzZSBcIlBSRVZfTElORVwiOiAvLyBub3QgcG9zc2libGUgaW4gdGV4dG1hdGVcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyAtIDEpO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfSU5ERVhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkuY29sdW1uO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfTlVNQkVSXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyArIDE7XG4gICAgICAgICAgICBjYXNlIFwiU09GVF9UQUJTXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VXNlU29mdFRhYnMoKSA/IFwiWUVTXCIgOiBcIk5PXCI7XG4gICAgICAgICAgICBjYXNlIFwiVEFCX1NJWkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IGJ1dCBjYW4ndCBmaWxsIDooXG4gICAgICAgICAgICBjYXNlIFwiRklMRU5BTUVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFUEFUSFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgY2FzZSBcIkZVTExOQU1FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiQWNlXCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgdmFyTmFtZSkge1xuICAgICAgICBpZiAodGhpcy52YXJpYWJsZXMuaGFzT3duUHJvcGVydHkodmFyTmFtZSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZXNbdmFyTmFtZV0oZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHN0cmluZyBmb3JtYXR0ZWQgYWNjb3JkaW5nIHRvIGh0dHA6Ly9tYW51YWwubWFjcm9tYXRlcy5jb20vZW4vcmVndWxhcl9leHByZXNzaW9ucyNyZXBsYWNlbWVudF9zdHJpbmdfc3ludGF4X2Zvcm1hdF9zdHJpbmdzXG4gICAgcHVibGljIHRtU3RyRm9ybWF0KHN0ciwgY2gsIGVkaXRvcj8pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBjaC5mbGFnIHx8IFwiXCI7XG4gICAgICAgIHZhciByZSA9IGNoLmd1YXJkO1xuICAgICAgICByZSA9IG5ldyBSZWdFeHAocmUsIGZsYWcucmVwbGFjZSgvW15naV0vLCBcIlwiKSk7XG4gICAgICAgIHZhciBmbXRUb2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KGNoLmZtdCwgXCJmb3JtYXRTdHJpbmdcIik7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBzdHIucmVwbGFjZShyZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi52YXJpYWJsZXNbJ19fJ10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICB2YXIgZm10UGFydHMgPSBfc2VsZi5yZXNvbHZlVmFyaWFibGVzKGZtdFRva2VucywgZWRpdG9yKTtcbiAgICAgICAgICAgIHZhciBnQ2hhbmdlQ2FzZSA9IFwiRVwiO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbXRQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGZtdFBhcnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlICYmIGNoLmxvY2FsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZtdFBhcnRzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0ICYmIHR5cGVvZiBuZXh0ID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSA9PSBcInVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpICsgMV0gPSBuZXh0LnN1YnN0cigxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnQ2hhbmdlQ2FzZSA9IGNoLmNoYW5nZUNhc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiVVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiTFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm10UGFydHMuam9pbihcIlwiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVWYXJpYWJsZXMoc25pcHBldCwgZWRpdG9yKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmlwcGV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzbmlwcGV0W2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2ggIT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5za2lwKSB7XG4gICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5wcm9jZXNzZWQgPCBpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCBjaC50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgY2guZm10U3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG1TdHJGb3JtYXQodmFsdWUsIGNoKTtcbiAgICAgICAgICAgICAgICBjaC5wcm9jZXNzZWQgPSBpO1xuICAgICAgICAgICAgICAgIGlmIChjaC5leHBlY3RJZiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaC5za2lwID0gY2guZWxzZUJyYW5jaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50YWJzdG9wSWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdvdG9OZXh0KGNoKSB7XG4gICAgICAgICAgICB2YXIgaTEgPSBzbmlwcGV0LmluZGV4T2YoY2gsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSAhPSAtMSlcbiAgICAgICAgICAgICAgICBpID0gaTE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0KSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGxpbmUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgdGFiU3RyaW5nID0gZWRpdG9yLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBsaW5lLm1hdGNoKC9eXFxzKi8pWzBdO1xuXG4gICAgICAgIGlmIChjdXJzb3IuY29sdW1uIDwgaW5kZW50U3RyaW5nLmxlbmd0aClcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IGluZGVudFN0cmluZy5zbGljZSgwLCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgdG9rZW5zID0gdGhpcy50b2tlbml6ZVRtU25pcHBldChzbmlwcGV0VGV4dCk7XG4gICAgICAgIHRva2VucyA9IHRoaXMucmVzb2x2ZVZhcmlhYmxlcyh0b2tlbnMsIGVkaXRvcik7XG4gICAgICAgIC8vIGluZGVudFxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIGlmICh4ID09IFwiXFxuXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHggKyBpbmRlbnRTdHJpbmc7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHggPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICByZXR1cm4geC5yZXBsYWNlKC9cXHQvZywgdGFiU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdmFyIHRhYnN0b3BzID0gW107XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHAsIGkpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHZhciBpZCA9IHAudGFic3RvcElkO1xuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgaWYgKCF0cykge1xuICAgICAgICAgICAgICAgIHRzID0gdGFic3RvcHNbaWRdID0gW107XG4gICAgICAgICAgICAgICAgdHMuaW5kZXggPSBpZDtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IFwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHMuaW5kZXhPZihwKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdHMucHVzaChwKTtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSA9PT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnMuc2xpY2UoaSArIDEsIGkxKTtcbiAgICAgICAgICAgIHZhciBpc05lc3RlZCA9IHZhbHVlLnNvbWUoZnVuY3Rpb24odCkgeyByZXR1cm4gdHlwZW9mIHQgPT09IFwib2JqZWN0XCIgfSk7XG4gICAgICAgICAgICBpZiAoaXNOZXN0ZWQgJiYgIXRzLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUubGVuZ3RoICYmICghdHMudmFsdWUgfHwgdHlwZW9mIHRzLnZhbHVlICE9PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gdmFsdWUuam9pbihcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZXhwYW5kIHRhYnN0b3AgdmFsdWVzXG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMpIHsgdHMubGVuZ3RoID0gMCB9KTtcbiAgICAgICAgdmFyIGV4cGFuZGluZyA9IHt9O1xuICAgICAgICBmdW5jdGlvbiBjb3B5VmFsdWUodmFsKSB7XG4gICAgICAgICAgICB2YXIgY29weSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHZhbFtpXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHAgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwYW5kaW5nW3AudGFic3RvcElkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaiA9IHZhbC5sYXN0SW5kZXhPZihwLCBpIC0gMSk7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBjb3B5W2pdIHx8IHsgdGFic3RvcElkOiBwLnRhYnN0b3BJZCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3B5W2ldID0gcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb3B5O1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgcCA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgaTEgPSB0b2tlbnMuaW5kZXhPZihwLCBpICsgMSk7XG4gICAgICAgICAgICBpZiAoZXhwYW5kaW5nW2lkXSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHJlYWNoZWQgY2xvc2luZyBicmFja2V0IGNsZWFyIGV4cGFuZGluZyBzdGF0ZVxuICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdID09PSBwKVxuICAgICAgICAgICAgICAgICAgICBleHBhbmRpbmdbaWRdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UganVzdCBpZ25vcmUgcmVjdXJzaXZlIHRhYnN0b3BcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgdmFyIGFyZyA9IHR5cGVvZiB0cy52YWx1ZSA9PSBcInN0cmluZ1wiID8gW3RzLnZhbHVlXSA6IGNvcHlWYWx1ZSh0cy52YWx1ZSk7XG4gICAgICAgICAgICBhcmcudW5zaGlmdChpICsgMSwgTWF0aC5tYXgoMCwgaTEgLSBpKSk7XG4gICAgICAgICAgICBhcmcucHVzaChwKTtcbiAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBwO1xuICAgICAgICAgICAgdG9rZW5zLnNwbGljZS5hcHBseSh0b2tlbnMsIGFyZyk7XG5cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApID09PSAtMSlcbiAgICAgICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCB0byBwbGFpbiB0ZXh0XG4gICAgICAgIHZhciByb3cgPSAwLCBjb2x1bW4gPSAwO1xuICAgICAgICB2YXIgdGV4dCA9IFwiXCI7XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHQpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGlmICh0WzBdID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiA9IHQubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiArPSB0Lmxlbmd0aDtcbiAgICAgICAgICAgICAgICB0ZXh0ICs9IHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghdC5zdGFydClcbiAgICAgICAgICAgICAgICAgICAgdC5zdGFydCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0LmVuZCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIGVuZCA9IGVkaXRvci5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuXG4gICAgICAgIHZhciB0c01hbmFnZXIgPSBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA/IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdIDogbmV3IFRhYnN0b3BNYW5hZ2VyKGVkaXRvcik7XG4gICAgICAgIHZhciBzZWxlY3Rpb25JZCA9IGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlICYmIGVkaXRvci5zZWxlY3Rpb25bJ2luZGV4J107XG4gICAgICAgIHRzTWFuYWdlci5hZGRUYWJzdG9wcyh0YWJzdG9wcywgcmFuZ2Uuc3RhcnQsIGVuZCwgc2VsZWN0aW9uSWQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRTbmlwcGV0KGVkaXRvcjogRWRpdG9yLCBzbmlwcGV0VGV4dCwgdW51c2VkPykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmIChlZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSlcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG5cbiAgICAgICAgZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG4gICAgICAgIH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuXG4gICAgICAgIGlmIChlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSkge1xuICAgICAgICAgICAgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0U2NvcGUoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gZWRpdG9yLnNlc3Npb24uJG1vZGUuJGlkIHx8IFwiXCI7XG4gICAgICAgIHNjb3BlID0gc2NvcGUuc3BsaXQoXCIvXCIpLnBvcCgpO1xuICAgICAgICBpZiAoc2NvcGUgPT09IFwiaHRtbFwiIHx8IHNjb3BlID09PSBcInBocFwiKSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogQ291cGxpbmcgdG8gUEhQP1xuICAgICAgICAgICAgLy8gUEhQIGlzIGFjdHVhbGx5IEhUTUxcbiAgICAgICAgICAgIGlmIChzY29wZSA9PT0gXCJwaHBcIiAmJiAhZWRpdG9yLnNlc3Npb24uJG1vZGVbJ2lubGluZVBocCddKVxuICAgICAgICAgICAgICAgIHNjb3BlID0gXCJodG1sXCI7XG4gICAgICAgICAgICB2YXIgYyA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gZWRpdG9yLnNlc3Npb24uZ2V0U3RhdGUoYy5yb3cpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzdGF0ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIHN0YXRlID0gc3RhdGVbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN1YnN0cmluZygwLCAzKSA9PSBcImpzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiamF2YXNjcmlwdFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcImNzcy1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcImNzc1wiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnN1YnN0cmluZygwLCA0KSA9PSBcInBocC1cIilcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUgPSBcInBocFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRBY3RpdmVTY29wZXMoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gdGhpcy4kZ2V0U2NvcGUoZWRpdG9yKTtcbiAgICAgICAgdmFyIHNjb3BlcyA9IFtzY29wZV07XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICBpZiAoc25pcHBldE1hcFtzY29wZV0gJiYgc25pcHBldE1hcFtzY29wZV0uaW5jbHVkZVNjb3Blcykge1xuICAgICAgICAgICAgc2NvcGVzLnB1c2guYXBwbHkoc2NvcGVzLCBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKTtcbiAgICAgICAgfVxuICAgICAgICBzY29wZXMucHVzaChcIl9cIik7XG4gICAgICAgIHJldHVybiBzY29wZXM7XG4gICAgfVxuXG4gICAgcHVibGljIGV4cGFuZFdpdGhUYWIoZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnM/KTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlc3VsdDogYm9vbGVhbiA9IGVkaXRvci5mb3JFYWNoU2VsZWN0aW9uKGZ1bmN0aW9uKCkgeyByZXR1cm4gc2VsZi5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uKGVkaXRvciwgb3B0aW9ucyk7IH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuICAgICAgICBpZiAocmVzdWx0ICYmIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdKSB7XG4gICAgICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgbGluZSA9IGVkaXRvci5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBiZWZvcmUgPSBsaW5lLnN1YnN0cmluZygwLCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIGFmdGVyID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0O1xuICAgICAgICB0aGlzLmdldEFjdGl2ZVNjb3BlcyhlZGl0b3IpLnNvbWUoZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzbmlwcGV0cyA9IHNuaXBwZXRNYXBbc2NvcGVdO1xuICAgICAgICAgICAgaWYgKHNuaXBwZXRzKVxuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB0aGlzLmZpbmRNYXRjaGluZ1NuaXBwZXQoc25pcHBldHMsIGJlZm9yZSwgYWZ0ZXIpO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmICghc25pcHBldClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5kcnlSdW4pXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgZWRpdG9yLnNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LFxuICAgICAgICAgICAgY3Vyc29yLmNvbHVtbiAtIHNuaXBwZXQucmVwbGFjZUJlZm9yZS5sZW5ndGgsXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uICsgc25pcHBldC5yZXBsYWNlQWZ0ZXIubGVuZ3RoXG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gc25pcHBldC5tYXRjaEJlZm9yZTtcbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gc25pcHBldC5tYXRjaEFmdGVyO1xuICAgICAgICB0aGlzLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0LmNvbnRlbnQpO1xuXG4gICAgICAgIHRoaXMudmFyaWFibGVzWydNX18nXSA9IHRoaXMudmFyaWFibGVzWydUX18nXSA9IG51bGw7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByaXZhdGUgZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0TGlzdCwgYmVmb3JlLCBhZnRlcikge1xuICAgICAgICBmb3IgKHZhciBpID0gc25pcHBldExpc3QubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICB2YXIgcyA9IHNuaXBwZXRMaXN0W2ldO1xuICAgICAgICAgICAgaWYgKHMuc3RhcnRSZSAmJiAhcy5zdGFydFJlLnRlc3QoYmVmb3JlKSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGlmIChzLmVuZFJlICYmICFzLmVuZFJlLnRlc3QoYWZ0ZXIpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCFzLnN0YXJ0UmUgJiYgIXMuZW5kUmUpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHMubWF0Y2hCZWZvcmUgPSBzLnN0YXJ0UmUgPyBzLnN0YXJ0UmUuZXhlYyhiZWZvcmUpIDogW1wiXCJdO1xuICAgICAgICAgICAgcy5tYXRjaEFmdGVyID0gcy5lbmRSZSA/IHMuZW5kUmUuZXhlYyhhZnRlcikgOiBbXCJcIl07XG4gICAgICAgICAgICBzLnJlcGxhY2VCZWZvcmUgPSBzLnRyaWdnZXJSZSA/IHMudHJpZ2dlclJlLmV4ZWMoYmVmb3JlKVswXSA6IFwiXCI7XG4gICAgICAgICAgICBzLnJlcGxhY2VBZnRlciA9IHMuZW5kVHJpZ2dlclJlID8gcy5lbmRUcmlnZ2VyUmUuZXhlYyhhZnRlcilbMF0gOiBcIlwiO1xuICAgICAgICAgICAgcmV0dXJuIHM7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgcmVnaXN0ZXIoc25pcHBldHMsIHNjb3BlKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGZ1bmN0aW9uIHdyYXBSZWdleHAoc3JjKSB7XG4gICAgICAgICAgICBpZiAoc3JjICYmICEvXlxcXj9cXCguKlxcKVxcJD8kfF5cXFxcYiQvLnRlc3Qoc3JjKSlcbiAgICAgICAgICAgICAgICBzcmMgPSBcIig/OlwiICsgc3JjICsgXCIpXCI7XG5cbiAgICAgICAgICAgIHJldHVybiBzcmMgfHwgXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiBndWFyZGVkUmVnZXhwKHJlLCBndWFyZCwgb3BlbmluZykge1xuICAgICAgICAgICAgcmUgPSB3cmFwUmVnZXhwKHJlKTtcbiAgICAgICAgICAgIGd1YXJkID0gd3JhcFJlZ2V4cChndWFyZCk7XG4gICAgICAgICAgICBpZiAob3BlbmluZykge1xuICAgICAgICAgICAgICAgIHJlID0gZ3VhcmQgKyByZTtcbiAgICAgICAgICAgICAgICBpZiAocmUgJiYgcmVbcmUubGVuZ3RoIC0gMV0gIT0gXCIkXCIpXG4gICAgICAgICAgICAgICAgICAgIHJlID0gcmUgKyBcIiRcIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmUgPSByZSArIGd1YXJkO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVswXSAhPSBcIl5cIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSBcIl5cIiArIHJlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAocmUpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkU25pcHBldChzKSB7XG4gICAgICAgICAgICBpZiAoIXMuc2NvcGUpXG4gICAgICAgICAgICAgICAgcy5zY29wZSA9IHNjb3BlIHx8IFwiX1wiO1xuICAgICAgICAgICAgc2NvcGUgPSBzLnNjb3BlO1xuICAgICAgICAgICAgaWYgKCFzbmlwcGV0TWFwW3Njb3BlXSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdID0gW107XG4gICAgICAgICAgICAgICAgc25pcHBldE5hbWVNYXBbc2NvcGVdID0ge307XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXAgPSBzbmlwcGV0TmFtZU1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAocy5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9sZCA9IG1hcFtzLm5hbWVdO1xuICAgICAgICAgICAgICAgIGlmIChvbGQpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYudW5yZWdpc3RlcihvbGQpO1xuICAgICAgICAgICAgICAgIG1hcFtzLm5hbWVdID0gcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNuaXBwZXRNYXBbc2NvcGVdLnB1c2gocyk7XG5cbiAgICAgICAgICAgIGlmIChzLnRhYlRyaWdnZXIgJiYgIXMudHJpZ2dlcikge1xuICAgICAgICAgICAgICAgIGlmICghcy5ndWFyZCAmJiAvXlxcdy8udGVzdChzLnRhYlRyaWdnZXIpKVxuICAgICAgICAgICAgICAgICAgICBzLmd1YXJkID0gXCJcXFxcYlwiO1xuICAgICAgICAgICAgICAgIHMudHJpZ2dlciA9IGVzY2FwZVJlZ0V4cChzLnRhYlRyaWdnZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzLnN0YXJ0UmUgPSBndWFyZGVkUmVnZXhwKHMudHJpZ2dlciwgcy5ndWFyZCwgdHJ1ZSk7XG4gICAgICAgICAgICBzLnRyaWdnZXJSZSA9IG5ldyBSZWdFeHAocy50cmlnZ2VyLCBcIlwiKTtcblxuICAgICAgICAgICAgcy5lbmRSZSA9IGd1YXJkZWRSZWdleHAocy5lbmRUcmlnZ2VyLCBzLmVuZEd1YXJkLCB0cnVlKTtcbiAgICAgICAgICAgIHMuZW5kVHJpZ2dlclJlID0gbmV3IFJlZ0V4cChzLmVuZFRyaWdnZXIsIFwiXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNuaXBwZXRzLmNvbnRlbnQpXG4gICAgICAgICAgICBhZGRTbmlwcGV0KHNuaXBwZXRzKTtcbiAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0cykpXG4gICAgICAgICAgICBzbmlwcGV0cy5mb3JFYWNoKGFkZFNuaXBwZXQpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcInJlZ2lzdGVyU25pcHBldHNcIiwgeyBzY29wZTogc2NvcGUgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB1bnJlZ2lzdGVyKHNuaXBwZXRzLCBzY29wZT8pIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlU25pcHBldChzKSB7XG4gICAgICAgICAgICB2YXIgbmFtZU1hcCA9IHNuaXBwZXROYW1lTWFwW3Muc2NvcGUgfHwgc2NvcGVdO1xuICAgICAgICAgICAgaWYgKG5hbWVNYXAgJiYgbmFtZU1hcFtzLm5hbWVdKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIG5hbWVNYXBbcy5uYW1lXTtcbiAgICAgICAgICAgICAgICB2YXIgbWFwID0gc25pcHBldE1hcFtzLnNjb3BlIHx8IHNjb3BlXTtcbiAgICAgICAgICAgICAgICB2YXIgaSA9IG1hcCAmJiBtYXAuaW5kZXhPZihzKTtcbiAgICAgICAgICAgICAgICBpZiAoaSA+PSAwKVxuICAgICAgICAgICAgICAgICAgICBtYXAuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzbmlwcGV0cy5jb250ZW50KVxuICAgICAgICAgICAgcmVtb3ZlU25pcHBldChzbmlwcGV0cyk7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoc25pcHBldHMpKVxuICAgICAgICAgICAgc25pcHBldHMuZm9yRWFjaChyZW1vdmVTbmlwcGV0KTtcbiAgICB9XG5cbiAgICBwdWJsaWMgcGFyc2VTbmlwcGV0RmlsZShzdHIpIHtcbiAgICAgICAgc3RyID0gc3RyLnJlcGxhY2UoL1xcci9nLCBcIlwiKTtcbiAgICAgICAgdmFyIGxpc3QgPSBbXTtcbiAgICAgICAgdmFyIHNuaXBwZXQ6IGFueSA9IHt9O1xuICAgICAgICB2YXIgcmUgPSAvXiMuKnxeKHtbXFxzXFxTXSp9KVxccyokfF4oXFxTKykgKC4qKSR8XigoPzpcXG4qXFx0LiopKykvZ207XG4gICAgICAgIHZhciBtO1xuICAgICAgICB3aGlsZSAobSA9IHJlLmV4ZWMoc3RyKSkge1xuICAgICAgICAgICAgaWYgKG1bMV0pIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0ID0gSlNPTi5wYXJzZShtWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgICAgICAgfSBpZiAobVs0XSkge1xuICAgICAgICAgICAgICAgIHNuaXBwZXQuY29udGVudCA9IG1bNF0ucmVwbGFjZSgvXlxcdC9nbSwgXCJcIik7XG4gICAgICAgICAgICAgICAgbGlzdC5wdXNoKHNuaXBwZXQpO1xuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSB7fTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IG1bMl0sIHZhbCA9IG1bM107XG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PSBcInJlZ2V4XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGd1YXJkUmUgPSAvXFwvKCg/OlteXFwvXFxcXF18XFxcXC4pKil8JC9nO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lmd1YXJkID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudHJpZ2dlciA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LmVuZFRyaWdnZXIgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5lbmRHdWFyZCA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09IFwic25pcHBldFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQudGFiVHJpZ2dlciA9IHZhbC5tYXRjaCgvXlxcUyovKVswXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzbmlwcGV0Lm5hbWUpXG4gICAgICAgICAgICAgICAgICAgICAgICBzbmlwcGV0Lm5hbWUgPSB2YWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldFtrZXldID0gdmFsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbGlzdDtcbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRTbmlwcGV0QnlOYW1lKG5hbWUsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TmFtZU1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHNuaXBwZXRzW25hbWVdO1xuICAgICAgICAgICAgcmV0dXJuICEhc25pcHBldDtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIHJldHVybiBzbmlwcGV0O1xuICAgIH1cbn1cblxuY2xhc3MgVGFic3RvcE1hbmFnZXIge1xuICAgIHByaXZhdGUgaW5kZXg7XG4gICAgcHJpdmF0ZSByYW5nZXM7XG4gICAgcHJpdmF0ZSB0YWJzdG9wcztcbiAgICBwcml2YXRlICRvcGVuVGFic3RvcHM7XG4gICAgcHJpdmF0ZSBzZWxlY3RlZFRhYnN0b3A7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlIGtleWJvYXJkSGFuZGxlciA9IG5ldyBIYXNoSGFuZGxlcigpO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlU2Vzc2lvbjtcbiAgICBwcml2YXRlICRvbkFmdGVyRXhlYztcbiAgICBwcml2YXRlICRpbkNoYW5nZTtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA9IHRoaXM7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlID0gdGhpcy5vbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbiA9IGRlbGF5ZWRDYWxsKHRoaXMub25DaGFuZ2VTZWxlY3Rpb24uYmluZCh0aGlzKSkuc2NoZWR1bGU7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbiA9IHRoaXMub25DaGFuZ2VTZXNzaW9uLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQWZ0ZXJFeGVjID0gdGhpcy5vbkFmdGVyRXhlYy5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmF0dGFjaChlZGl0b3IpO1xuICAgICAgICB0aGlzLmtleWJvYXJkSGFuZGxlci5iaW5kS2V5cyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIlRhYlwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzbmlwcGV0TWFuYWdlciAmJiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKGVkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIlNoaWZ0LVRhYlwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgtMSk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIkVzY1wiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkW1RBQlNUT1BfTUFOQUdFUl0uZGV0YWNoKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcIlJldHVyblwiOiBmdW5jdGlvbihlZDogRWRpdG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vZWRbVEFCU1RPUF9NQU5BR0VSXS50YWJOZXh0KDEpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgfVxuICAgIHByaXZhdGUgYXR0YWNoKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHRoaXMuaW5kZXggPSAwO1xuICAgICAgICB0aGlzLnJhbmdlcyA9IFtdO1xuICAgICAgICB0aGlzLnRhYnN0b3BzID0gW107XG4gICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gbnVsbDtcblxuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlU2Vzc2lvblwiLCB0aGlzLiRvbkNoYW5nZVNlc3Npb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5jb21tYW5kcy5vbihcImFmdGVyRXhlY1wiLCB0aGlzLiRvbkFmdGVyRXhlYyk7XG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcuYWRkS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGRldGFjaCgpIHtcbiAgICAgICAgdGhpcy50YWJzdG9wcy5mb3JFYWNoKHRoaXMucmVtb3ZlVGFic3RvcE1hcmtlcnMsIHRoaXMpO1xuICAgICAgICB0aGlzLnJhbmdlcyA9IG51bGw7XG4gICAgICAgIHRoaXMudGFic3RvcHMgPSBudWxsO1xuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVNlc3Npb25cIiwgdGhpcy4kb25DaGFuZ2VTZXNzaW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3IuY29tbWFuZHMucmVtb3ZlTGlzdGVuZXIoXCJhZnRlckV4ZWNcIiwgdGhpcy4kb25BZnRlckV4ZWMpO1xuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLnJlbW92ZUtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZShlKSB7XG4gICAgICAgIHZhciBjaGFuZ2VSYW5nZSA9IGUuZGF0YS5yYW5nZTtcbiAgICAgICAgdmFyIGlzUmVtb3ZlID0gZS5kYXRhLmFjdGlvblswXSA9PSBcInJcIjtcbiAgICAgICAgdmFyIHN0YXJ0ID0gY2hhbmdlUmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSBjaGFuZ2VSYW5nZS5lbmQ7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IHN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGVuZFJvdyA9IGVuZC5yb3c7XG4gICAgICAgIHZhciBsaW5lRGlmID0gZW5kUm93IC0gc3RhcnRSb3c7XG4gICAgICAgIHZhciBjb2xEaWZmID0gZW5kLmNvbHVtbiAtIHN0YXJ0LmNvbHVtbjtcblxuICAgICAgICBpZiAoaXNSZW1vdmUpIHtcbiAgICAgICAgICAgIGxpbmVEaWYgPSAtbGluZURpZjtcbiAgICAgICAgICAgIGNvbERpZmYgPSAtY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuJGluQ2hhbmdlICYmIGlzUmVtb3ZlKSB7XG4gICAgICAgICAgICB2YXIgdHMgPSB0aGlzLnNlbGVjdGVkVGFic3RvcDtcbiAgICAgICAgICAgIHZhciBjaGFuZ2VkT3V0c2lkZSA9IHRzICYmICF0cy5zb21lKGZ1bmN0aW9uKHIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY29tcGFyZVBvaW50cyhyLnN0YXJ0LCBzdGFydCkgPD0gMCAmJiBjb21wYXJlUG9pbnRzKHIuZW5kLCBlbmQpID49IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VkT3V0c2lkZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5kZXRhY2goKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy5yYW5nZXM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgciA9IHJhbmdlc1tpXTtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPCBzdGFydC5yb3cpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIGlmIChpc1JlbW92ZSAmJiBjb21wYXJlUG9pbnRzKHN0YXJ0LCByLnN0YXJ0KSA8IDAgJiYgY29tcGFyZVBvaW50cyhlbmQsIHIuZW5kKSA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZVJhbmdlKHIpO1xuICAgICAgICAgICAgICAgIGktLTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHIuc3RhcnQucm93ID09IHN0YXJ0Um93ICYmIHIuc3RhcnQuY29sdW1uID4gc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgIHIuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICBpZiAoci5lbmQucm93ID09IHN0YXJ0Um93ICYmIHIuZW5kLmNvbHVtbiA+PSBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgICAgICAgci5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICBpZiAoci5zdGFydC5yb3cgPj0gc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgci5zdGFydC5yb3cgKz0gbGluZURpZjtcbiAgICAgICAgICAgIGlmIChyLmVuZC5yb3cgPj0gc3RhcnRSb3cpXG4gICAgICAgICAgICAgICAgci5lbmQucm93ICs9IGxpbmVEaWY7XG5cbiAgICAgICAgICAgIGlmIChjb21wYXJlUG9pbnRzKHIuc3RhcnQsIHIuZW5kKSA+IDApXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVSYW5nZShyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXJhbmdlcy5sZW5ndGgpXG4gICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdXBkYXRlTGlua2VkRmllbGRzKCkge1xuICAgICAgICB2YXIgdHMgPSB0aGlzLnNlbGVjdGVkVGFic3RvcDtcbiAgICAgICAgaWYgKCF0cyB8fCAhdHMuaGFzTGlua2VkUmFuZ2VzKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB0aGlzLiRpbkNoYW5nZSA9IHRydWU7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5lZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZSh0cy5maXJzdE5vbkxpbmtlZCk7XG4gICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRzW2ldO1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5saW5rZWQpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgZm10ID0gc25pcHBldE1hbmFnZXIudG1TdHJGb3JtYXQodGV4dCwgcmFuZ2Uub3JpZ2luYWwpO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBmbXQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGluQ2hhbmdlID0gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkFmdGVyRXhlYyhlKSB7XG4gICAgICAgIGlmIChlLmNvbW1hbmQgJiYgIWUuY29tbWFuZC5yZWFkT25seSlcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGlua2VkRmllbGRzKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlbGVjdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGxlYWQgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24ubGVhZDtcbiAgICAgICAgdmFyIGFuY2hvciA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5hbmNob3I7XG4gICAgICAgIHZhciBpc0VtcHR5ID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmlzRW1wdHkoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHRoaXMucmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgaWYgKHRoaXMucmFuZ2VzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIHZhciBjb250YWluc0xlYWQgPSB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhsZWFkLnJvdywgbGVhZC5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIGNvbnRhaW5zQW5jaG9yID0gaXNFbXB0eSB8fCB0aGlzLnJhbmdlc1tpXS5jb250YWlucyhhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjb250YWluc0xlYWQgJiYgY29udGFpbnNBbmNob3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVNlc3Npb24oKSB7XG4gICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSB0YWJOZXh0KGRpcikge1xuICAgICAgICB2YXIgbWF4ID0gdGhpcy50YWJzdG9wcy5sZW5ndGg7XG4gICAgICAgIHZhciBpbmRleCA9IHRoaXMuaW5kZXggKyAoZGlyIHx8IDEpO1xuICAgICAgICBpbmRleCA9IE1hdGgubWluKE1hdGgubWF4KGluZGV4LCAxKSwgbWF4KTtcbiAgICAgICAgaWYgKGluZGV4ID09IG1heClcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5zZWxlY3RUYWJzdG9wKGluZGV4KTtcbiAgICAgICAgaWYgKGluZGV4ID09PSAwKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHNlbGVjdFRhYnN0b3AoaW5kZXgpIHtcbiAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdmFyIHRzID0gdGhpcy50YWJzdG9wc1t0aGlzLmluZGV4XTtcbiAgICAgICAgaWYgKHRzKVxuICAgICAgICAgICAgdGhpcy5hZGRUYWJzdG9wTWFya2Vycyh0cyk7XG4gICAgICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICAgICAgdHMgPSB0aGlzLnRhYnN0b3BzW3RoaXMuaW5kZXhdO1xuICAgICAgICBpZiAoIXRzIHx8ICF0cy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSB0cztcbiAgICAgICAgaWYgKCF0aGlzLmVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgICAgICB2YXIgc2VsID0gdGhpcy5lZGl0b3JbJ211bHRpU2VsZWN0J107XG4gICAgICAgICAgICBzZWwudG9TaW5nbGVSYW5nZSh0cy5maXJzdE5vbkxpbmtlZC5jbG9uZSgpKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSB0cy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICBpZiAodHMuaGFzTGlua2VkUmFuZ2VzICYmIHRzW2ldLmxpbmtlZClcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgc2VsLmFkZFJhbmdlKHRzW2ldLmNsb25lKCksIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdG9kbyBpbnZlc3RpZ2F0ZSB3aHkgaXMgdGhpcyBuZWVkZWRcbiAgICAgICAgICAgIGlmIChzZWwucmFuZ2VzWzBdKVxuICAgICAgICAgICAgICAgIHNlbC5hZGRSYW5nZShzZWwucmFuZ2VzWzBdLmNsb25lKCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNldFJhbmdlKHRzLmZpcnN0Tm9uTGlua2VkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZWRpdG9yLmtleUJpbmRpbmcuYWRkS2V5Ym9hcmRIYW5kbGVyKHRoaXMua2V5Ym9hcmRIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgYWRkVGFic3RvcHMgPSBmdW5jdGlvbih0YWJzdG9wcywgc3RhcnQsIGVuZCwgdW51c2VkKSB7XG4gICAgICAgIGlmICghdGhpcy4kb3BlblRhYnN0b3BzKVxuICAgICAgICAgICAgdGhpcy4kb3BlblRhYnN0b3BzID0gW107XG4gICAgICAgIC8vIGFkZCBmaW5hbCB0YWJzdG9wIGlmIG1pc3NpbmdcbiAgICAgICAgaWYgKCF0YWJzdG9wc1swXSkge1xuICAgICAgICAgICAgdmFyIHAgPSBSYW5nZS5mcm9tUG9pbnRzKGVuZCwgZW5kKTtcbiAgICAgICAgICAgIG1vdmVSZWxhdGl2ZShwLnN0YXJ0LCBzdGFydCk7XG4gICAgICAgICAgICBtb3ZlUmVsYXRpdmUocC5lbmQsIHN0YXJ0KTtcbiAgICAgICAgICAgIHRhYnN0b3BzWzBdID0gW3BdO1xuICAgICAgICAgICAgdGFic3RvcHNbMF0uaW5kZXggPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSB0aGlzLmluZGV4O1xuICAgICAgICB2YXIgYXJnID0gW2kgKyAxLCAwXTtcbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMucmFuZ2VzO1xuICAgICAgICB0YWJzdG9wcy5mb3JFYWNoKGZ1bmN0aW9uKHRzLCBpbmRleCkge1xuICAgICAgICAgICAgdmFyIGRlc3QgPSB0aGlzLiRvcGVuVGFic3RvcHNbaW5kZXhdIHx8IHRzO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gdHMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgdmFyIHAgPSB0c1tpXTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2U6IGFueSA9IFJhbmdlLmZyb21Qb2ludHMocC5zdGFydCwgcC5lbmQgfHwgcC5zdGFydCk7XG4gICAgICAgICAgICAgICAgbW92ZVBvaW50KHJhbmdlLnN0YXJ0LCBzdGFydCk7XG4gICAgICAgICAgICAgICAgbW92ZVBvaW50KHJhbmdlLmVuZCwgc3RhcnQpO1xuICAgICAgICAgICAgICAgIHJhbmdlLm9yaWdpbmFsID0gcDtcbiAgICAgICAgICAgICAgICByYW5nZS50YWJzdG9wID0gZGVzdDtcbiAgICAgICAgICAgICAgICByYW5nZXMucHVzaChyYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKGRlc3QgIT0gdHMpXG4gICAgICAgICAgICAgICAgICAgIGRlc3QudW5zaGlmdChyYW5nZSk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBkZXN0W2ldID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHAuZm10U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmxpbmtlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGRlc3QuaGFzTGlua2VkUmFuZ2VzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFkZXN0LmZpcnN0Tm9uTGlua2VkKVxuICAgICAgICAgICAgICAgICAgICBkZXN0LmZpcnN0Tm9uTGlua2VkID0gcmFuZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWRlc3QuZmlyc3ROb25MaW5rZWQpXG4gICAgICAgICAgICAgICAgZGVzdC5oYXNMaW5rZWRSYW5nZXMgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmIChkZXN0ID09PSB0cykge1xuICAgICAgICAgICAgICAgIGFyZy5wdXNoKGRlc3QpO1xuICAgICAgICAgICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wc1tpbmRleF0gPSBkZXN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hZGRUYWJzdG9wTWFya2VycyhkZXN0KTtcbiAgICAgICAgfSwgdGhpcyk7XG5cbiAgICAgICAgaWYgKGFyZy5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICAvLyB3aGVuIGFkZGluZyBuZXcgc25pcHBldCBpbnNpZGUgZXhpc3Rpbmcgb25lLCBtYWtlIHN1cmUgMCB0YWJzdG9wIGlzIGF0IHRoZSBlbmRcbiAgICAgICAgICAgIGlmICh0aGlzLnRhYnN0b3BzLmxlbmd0aClcbiAgICAgICAgICAgICAgICBhcmcucHVzaChhcmcuc3BsaWNlKDIsIDEpWzBdKTtcbiAgICAgICAgICAgIHRoaXMudGFic3RvcHMuc3BsaWNlLmFwcGx5KHRoaXMudGFic3RvcHMsIGFyZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGFkZFRhYnN0b3BNYXJrZXJzID0gZnVuY3Rpb24odHMpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB0cy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlLyo6IHJtLlJhbmdlKi8pIHtcbiAgICAgICAgICAgIGlmICghcmFuZ2UubWFya2VySWQpXG4gICAgICAgICAgICAgICAgcmFuZ2UubWFya2VySWQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc25pcHBldC1tYXJrZXJcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVRhYnN0b3BNYXJrZXJzID0gZnVuY3Rpb24odHMpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmVkaXRvci5zZXNzaW9uO1xuICAgICAgICB0cy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihyYW5nZS5tYXJrZXJJZCk7XG4gICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IG51bGw7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVtb3ZlUmFuZ2UgPSBmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICB2YXIgaSA9IHJhbmdlLnRhYnN0b3AuaW5kZXhPZihyYW5nZSk7XG4gICAgICAgIHJhbmdlLnRhYnN0b3Auc3BsaWNlKGksIDEpO1xuICAgICAgICBpID0gdGhpcy5yYW5nZXMuaW5kZXhPZihyYW5nZSk7XG4gICAgICAgIHRoaXMucmFuZ2VzLnNwbGljZShpLCAxKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iuc2Vzc2lvbi5yZW1vdmVNYXJrZXIocmFuZ2UubWFya2VySWQpO1xuICAgICAgICBpZiAoIXJhbmdlLnRhYnN0b3AubGVuZ3RoKSB7XG4gICAgICAgICAgICBpID0gdGhpcy50YWJzdG9wcy5pbmRleE9mKHJhbmdlLnRhYnN0b3ApO1xuICAgICAgICAgICAgaWYgKGkgIT0gLTEpXG4gICAgICAgICAgICAgICAgdGhpcy50YWJzdG9wcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICBpZiAoIXRoaXMudGFic3RvcHMubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cblxuXG52YXIgY2hhbmdlVHJhY2tlcjogYW55ID0ge307XG5jaGFuZ2VUcmFja2VyLm9uQ2hhbmdlID0gQW5jaG9yLnByb3RvdHlwZS5vbkNoYW5nZTtcbmNoYW5nZVRyYWNrZXIuc2V0UG9zaXRpb24gPSBmdW5jdGlvbihyb3csIGNvbHVtbikge1xuICAgIHRoaXMucG9zLnJvdyA9IHJvdztcbiAgICB0aGlzLnBvcy5jb2x1bW4gPSBjb2x1bW47XG59O1xuY2hhbmdlVHJhY2tlci51cGRhdGUgPSBmdW5jdGlvbihwb3MsIGRlbHRhLCAkaW5zZXJ0UmlnaHQpIHtcbiAgICB0aGlzLiRpbnNlcnRSaWdodCA9ICRpbnNlcnRSaWdodDtcbiAgICB0aGlzLnBvcyA9IHBvcztcbiAgICB0aGlzLm9uQ2hhbmdlKGRlbHRhKTtcbn07XG5cbnZhciBtb3ZlUG9pbnQgPSBmdW5jdGlvbihwb2ludCwgZGlmZikge1xuICAgIGlmIChwb2ludC5yb3cgPT0gMClcbiAgICAgICAgcG9pbnQuY29sdW1uICs9IGRpZmYuY29sdW1uO1xuICAgIHBvaW50LnJvdyArPSBkaWZmLnJvdztcbn07XG5cbnZhciBtb3ZlUmVsYXRpdmUgPSBmdW5jdGlvbihwb2ludCwgc3RhcnQpIHtcbiAgICBpZiAocG9pbnQucm93ID09IHN0YXJ0LnJvdylcbiAgICAgICAgcG9pbnQuY29sdW1uIC09IHN0YXJ0LmNvbHVtbjtcbiAgICBwb2ludC5yb3cgLT0gc3RhcnQucm93O1xufTtcblxuXG5pbXBvcnRDc3NTdHJpbmcoXCJcXFxuLmFjZV9zbmlwcGV0LW1hcmtlciB7XFxcbiAgICAtbW96LWJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcXG4gICAgYmFja2dyb3VuZDogcmdiYSgxOTQsIDE5MywgMjA4LCAwLjA5KTtcXFxuICAgIGJvcmRlcjogMXB4IGRvdHRlZCByZ2JhKDIxMSwgMjA4LCAyMzUsIDAuNjIpO1xcXG4gICAgcG9zaXRpb246IGFic29sdXRlO1xcXG59XCIpO1xuXG5leHBvcnQgdmFyIHNuaXBwZXRNYW5hZ2VyID0gbmV3IFNuaXBwZXRNYW5hZ2VyKCk7XG5cbihmdW5jdGlvbigpIHtcbiAgICB0aGlzLmluc2VydFNuaXBwZXQgPSBmdW5jdGlvbihjb250ZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5pbnNlcnRTbmlwcGV0KHRoaXMsIGNvbnRlbnQsIG9wdGlvbnMpO1xuICAgIH07XG4gICAgdGhpcy5leHBhbmRTbmlwcGV0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICByZXR1cm4gc25pcHBldE1hbmFnZXIuZXhwYW5kV2l0aFRhYih0aGlzLCBvcHRpb25zKTtcbiAgICB9O1xufSkuY2FsbChFZGl0b3IucHJvdG90eXBlKTtcbiJdfQ==