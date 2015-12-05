var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var dom = require("./lib/dom");
var eve = require("./lib/event_emitter");
var lang = require("./lib/lang");
var rm = require("./range");
var am = require("./anchor");
var hhm = require("./keyboard/hash_handler");
var Tokenizer = require("./Tokenizer");
var Editor = require('./Editor');
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
var SnippetManager = (function (_super) {
    __extends(SnippetManager, _super);
    function SnippetManager() {
        _super.call(this);
        this.snippetMap = {};
        this.snippetNameMap = {};
        this.variables = {};
    }
    SnippetManager.prototype.getTokenizer = function () {
        SnippetManager.prototype.getTokenizer = function () {
            return SnippetManager.$tokenizer;
        };
        return SnippetManager.$tokenizer;
    };
    SnippetManager.prototype.tokenizeTmSnippet = function (str, startState) {
        return this.getTokenizer().getLineTokens(str, startState).tokens.map(function (x) {
            return x.value || x;
        });
    };
    SnippetManager.prototype.$getDefaultValue = function (editor, name) {
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
    };
    SnippetManager.prototype.getVariableValue = function (editor, varName) {
        if (this.variables.hasOwnProperty(varName))
            return this.variables[varName](editor, varName) || "";
        return this.$getDefaultValue(editor, varName) || "";
    };
    SnippetManager.prototype.tmStrFormat = function (str, ch, editor) {
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
    };
    SnippetManager.prototype.resolveVariables = function (snippet, editor) {
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
    };
    SnippetManager.prototype.insertSnippetForSelection = function (editor, snippetText) {
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
    };
    SnippetManager.prototype.insertSnippet = function (editor, snippetText, unused) {
        var self = this;
        if (editor.inVirtualSelectionMode)
            return self.insertSnippetForSelection(editor, snippetText);
        editor.forEachSelection(function () {
            self.insertSnippetForSelection(editor, snippetText);
        }, null, { keepOrder: true });
        if (editor[TABSTOP_MANAGER]) {
            editor[TABSTOP_MANAGER].tabNext();
        }
    };
    SnippetManager.prototype.$getScope = function (editor) {
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
    };
    SnippetManager.prototype.getActiveScopes = function (editor) {
        var scope = this.$getScope(editor);
        var scopes = [scope];
        var snippetMap = this.snippetMap;
        if (snippetMap[scope] && snippetMap[scope].includeScopes) {
            scopes.push.apply(scopes, snippetMap[scope].includeScopes);
        }
        scopes.push("_");
        return scopes;
    };
    SnippetManager.prototype.expandWithTab = function (editor, options) {
        var self = this;
        var result = editor.forEachSelection(function () { return self.expandSnippetForSelection(editor, options); }, null, { keepOrder: true });
        if (result && editor[TABSTOP_MANAGER]) {
            editor[TABSTOP_MANAGER].tabNext();
        }
        return result;
    };
    SnippetManager.prototype.expandSnippetForSelection = function (editor, options) {
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
    };
    SnippetManager.prototype.findMatchingSnippet = function (snippetList, before, after) {
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
    };
    SnippetManager.prototype.register = function (snippets, scope) {
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
    };
    SnippetManager.prototype.unregister = function (snippets, scope) {
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
    };
    SnippetManager.prototype.parseSnippetFile = function (str) {
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
    };
    SnippetManager.prototype.getSnippetByName = function (name, editor) {
        var snippetMap = this.snippetNameMap;
        var snippet;
        this.getActiveScopes(editor).some(function (scope) {
            var snippets = snippetMap[scope];
            if (snippets)
                snippet = snippets[name];
            return !!snippet;
        }, this);
        return snippet;
    };
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
    return SnippetManager;
})(eve.EventEmitterClass);
exports.SnippetManager = SnippetManager;
var TabstopManager = (function () {
    function TabstopManager(editor) {
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
                if (exports.snippetManager && exports.snippetManager.expandWithTab(ed)) {
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
    TabstopManager.prototype.attach = function (editor) {
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
    };
    TabstopManager.prototype.detach = function () {
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
    };
    TabstopManager.prototype.onChange = function (e) {
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
    };
    TabstopManager.prototype.updateLinkedFields = function () {
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
            var fmt = exports.snippetManager.tmStrFormat(text, range.original);
            session.replace(range, fmt);
        }
        this.$inChange = false;
    };
    TabstopManager.prototype.onAfterExec = function (e) {
        if (e.command && !e.command.readOnly)
            this.updateLinkedFields();
    };
    TabstopManager.prototype.onChangeSelection = function () {
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
    };
    TabstopManager.prototype.onChangeSession = function () {
        this.detach();
    };
    TabstopManager.prototype.tabNext = function (dir) {
        var max = this.tabstops.length;
        var index = this.index + (dir || 1);
        index = Math.min(Math.max(index, 1), max);
        if (index == max)
            index = 0;
        this.selectTabstop(index);
        if (index === 0)
            this.detach();
    };
    TabstopManager.prototype.selectTabstop = function (index) {
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
    };
    return TabstopManager;
})();
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
exports.snippetManager = new SnippetManager();
(function () {
    this.insertSnippet = function (content, options) {
        return exports.snippetManager.insertSnippet(this, content, options);
    };
    this.expandSnippet = function (options) {
        return exports.snippetManager.expandWithTab(this, options);
    };
}).call(Editor.prototype);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvc25pcHBldHMudHMiXSwibmFtZXMiOlsiZXNjYXBlIiwiVGFic3RvcFRva2VuIiwiU25pcHBldE1hbmFnZXIiLCJTbmlwcGV0TWFuYWdlci5jb25zdHJ1Y3RvciIsIlNuaXBwZXRNYW5hZ2VyLmdldFRva2VuaXplciIsIlNuaXBwZXRNYW5hZ2VyLnRva2VuaXplVG1TbmlwcGV0IiwiU25pcHBldE1hbmFnZXIuJGdldERlZmF1bHRWYWx1ZSIsIlNuaXBwZXRNYW5hZ2VyLmdldFZhcmlhYmxlVmFsdWUiLCJTbmlwcGV0TWFuYWdlci50bVN0ckZvcm1hdCIsIlNuaXBwZXRNYW5hZ2VyLnJlc29sdmVWYXJpYWJsZXMiLCJTbmlwcGV0TWFuYWdlci5yZXNvbHZlVmFyaWFibGVzLmdvdG9OZXh0IiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbiIsIlNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24uY29weVZhbHVlIiwiU25pcHBldE1hbmFnZXIuaW5zZXJ0U25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLiRnZXRTY29wZSIsIlNuaXBwZXRNYW5hZ2VyLmdldEFjdGl2ZVNjb3BlcyIsIlNuaXBwZXRNYW5hZ2VyLmV4cGFuZFdpdGhUYWIiLCJTbmlwcGV0TWFuYWdlci5leHBhbmRTbmlwcGV0Rm9yU2VsZWN0aW9uIiwiU25pcHBldE1hbmFnZXIuZmluZE1hdGNoaW5nU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyIiwiU25pcHBldE1hbmFnZXIucmVnaXN0ZXIud3JhcFJlZ2V4cCIsIlNuaXBwZXRNYW5hZ2VyLnJlZ2lzdGVyLmd1YXJkZWRSZWdleHAiLCJTbmlwcGV0TWFuYWdlci5yZWdpc3Rlci5hZGRTbmlwcGV0IiwiU25pcHBldE1hbmFnZXIudW5yZWdpc3RlciIsIlNuaXBwZXRNYW5hZ2VyLnVucmVnaXN0ZXIucmVtb3ZlU25pcHBldCIsIlNuaXBwZXRNYW5hZ2VyLnBhcnNlU25pcHBldEZpbGUiLCJTbmlwcGV0TWFuYWdlci5nZXRTbmlwcGV0QnlOYW1lIiwiVGFic3RvcE1hbmFnZXIiLCJUYWJzdG9wTWFuYWdlci5jb25zdHJ1Y3RvciIsIlRhYnN0b3BNYW5hZ2VyLmF0dGFjaCIsIlRhYnN0b3BNYW5hZ2VyLmRldGFjaCIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlIiwiVGFic3RvcE1hbmFnZXIudXBkYXRlTGlua2VkRmllbGRzIiwiVGFic3RvcE1hbmFnZXIub25BZnRlckV4ZWMiLCJUYWJzdG9wTWFuYWdlci5vbkNoYW5nZVNlbGVjdGlvbiIsIlRhYnN0b3BNYW5hZ2VyLm9uQ2hhbmdlU2Vzc2lvbiIsIlRhYnN0b3BNYW5hZ2VyLnRhYk5leHQiLCJUYWJzdG9wTWFuYWdlci5zZWxlY3RUYWJzdG9wIl0sIm1hcHBpbmdzIjoiOzs7OztBQThCQSxJQUFPLEdBQUcsV0FBVyxXQUFXLENBQUMsQ0FBQztBQUVsQyxJQUFPLEdBQUcsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0FBQzVDLElBQU8sSUFBSSxXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQ3BDLElBQU8sRUFBRSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQy9CLElBQU8sRUFBRSxXQUFXLFVBQVUsQ0FBQyxDQUFDO0FBQ2hDLElBQU8sR0FBRyxXQUFXLHlCQUF5QixDQUFDLENBQUM7QUFDaEQsSUFBTyxTQUFTLFdBQVcsYUFBYSxDQUFDLENBQUM7QUFDMUMsSUFBTyxNQUFNLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFFcEMsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7QUFFM0MsSUFBSSxlQUFlLEdBQUcsZ0JBQWdCLENBQUM7QUFFdkMsZ0JBQWdCLEVBQUU7SUFDZEEsTUFBTUEsQ0FBQ0EsV0FBV0EsR0FBR0EsRUFBRUEsR0FBR0EsVUFBVUEsQ0FBQ0E7QUFDekNBLENBQUNBO0FBQ0Qsc0JBQXNCLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FB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REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQ0RELEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0E7Z0JBQ3JCQSxRQUFRQSxDQUFDQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFFekJBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLElBQUlBLEVBQUVBLEdBQUdBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN6RUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEs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QUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2pCQSxJQUFJQSxPQUFPQSxHQUFHQSx5QkFBeUJBLENBQUNBO29CQUN4Q0EsT0FBT0EsQ0FBQ0EsS0FBS0EsR0FBR0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3JDQSxPQUFPQSxDQUFDQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkNBLE9BQU9BLENBQUNBLFVBQVVBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUMxQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxPQUFPQSxDQUFDQSxVQUFVQSxHQUFHQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDMUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBO3dCQUNkQSxPQUFPQSxDQUFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQTtnQkFDM0JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0E7Z0JBQ3ZCQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFD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QU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDdEJBLFFBQVFBLENBQUNBO1lBRWJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLGFBQWFBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLGFBQWFBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqRkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDSkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3pEQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3REQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxPQUFPQSxDQUFDQTtZQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0E7Z0JBQ3hCQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFD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RUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDaEUsQ0FBQyxDQUFDO0lBQ0YsSUFBSSxDQUFDLGFBQWEsR0FBRyxVQUFTLE9BQU87UUFDakMsTUFBTSxDQUFDLHNCQUFjLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUM7QUFDTixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBkb20gPSByZXF1aXJlKFwiLi9saWIvZG9tXCIpO1xuaW1wb3J0IG9vcCA9IHJlcXVpcmUoXCIuL2xpYi9vb3BcIik7XG5pbXBvcnQgZXZlID0gcmVxdWlyZShcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIik7XG5pbXBvcnQgbGFuZyA9IHJlcXVpcmUoXCIuL2xpYi9sYW5nXCIpO1xuaW1wb3J0IHJtID0gcmVxdWlyZShcIi4vcmFuZ2VcIik7XG5pbXBvcnQgYW0gPSByZXF1aXJlKFwiLi9hbmNob3JcIik7XG5pbXBvcnQgaGhtID0gcmVxdWlyZShcIi4va2V5Ym9hcmQvaGFzaF9oYW5kbGVyXCIpO1xuaW1wb3J0IFRva2VuaXplciA9IHJlcXVpcmUoXCIuL1Rva2VuaXplclwiKTtcbmltcG9ydCBFZGl0b3IgPSByZXF1aXJlKCcuL0VkaXRvcicpO1xuXG52YXIgY29tcGFyZVBvaW50cyA9IHJtLlJhbmdlLmNvbXBhcmVQb2ludHM7XG5cbnZhciBUQUJTVE9QX01BTkFHRVIgPSAndGFic3RvcE1hbmFnZXInO1xuXG5mdW5jdGlvbiBlc2NhcGUoY2gpIHtcbiAgICByZXR1cm4gXCIoPzpbXlxcXFxcXFxcXCIgKyBjaCArIFwiXXxcXFxcXFxcXC4pXCI7XG59XG5mdW5jdGlvbiBUYWJzdG9wVG9rZW4oc3RyLCBfLCBzdGFjayk6IGFueVtdIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDEpO1xuICAgIGlmICgvXlxcZCskLy50ZXN0KHN0cikgJiYgIXN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgIHJldHVybiBbeyB0YWJzdG9wSWQ6IHBhcnNlSW50KHN0ciwgMTApIH1dO1xuICAgIH1cbiAgICByZXR1cm4gW3sgdGV4dDogc3RyIH1dO1xufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldE1hbmFnZXIgZXh0ZW5kcyBldmUuRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyBzbmlwcGV0TWFwID0ge307XG4gICAgcHJpdmF0ZSBzbmlwcGV0TmFtZU1hcCA9IHt9O1xuICAgIHByaXZhdGUgdmFyaWFibGVzID0ge307XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHN0YXRpYyAkdG9rZW5pemVyID0gbmV3IFRva2VuaXplcih7XG4gICAgICAgIHN0YXJ0OiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC86LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjayk6IGFueSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFjay5sZW5ndGggJiYgc3RhY2tbMF0uZXhwZWN0SWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YWNrWzBdLmV4cGVjdElmID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5lbHNlQnJhbmNoID0gc3RhY2tbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrWzBdXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCI6XCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcXFwuLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2ggPSB2YWxbMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaCA9PSBcIn1cIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFwiYCRcXFxcXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGNoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YWNrLmluRm9ybWF0U3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2ggPT0gXCJuXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gXCJcXG5cIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNoID09IFwidFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IFwiXFxuXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChcInVsVUxFXCIuaW5kZXhPZihjaCkgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSB7IGNoYW5nZUNhc2U6IGNoLCBsb2NhbDogY2ggPiBcImFcIiB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFt2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC99LyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW3N0YWNrLmxlbmd0aCA/IHN0YWNrLnNoaWZ0KCkgOiB2YWxdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCQoPzpcXGQrfFxcdyspLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBUYWJzdG9wVG9rZW5cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXCRcXHtbXFxkQS1aX2Etel0rLyxcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbihzdHIsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdCA9IFRhYnN0b3BUb2tlbihzdHIuc3Vic3RyKDEpLCBzdGF0ZSwgc3RhY2spO1xuICAgICAgICAgICAgICAgICAgICBzdGFjay51bnNoaWZ0KHRbMF0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdDtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInNuaXBwZXRWYXJcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogL1xcbi8sXG4gICAgICAgICAgICAgICAgdG9rZW46IFwibmV3bGluZVwiLFxuICAgICAgICAgICAgICAgIG1lcmdlOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBzbmlwcGV0VmFyOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHxcIiArIGVzY2FwZShcIlxcXFx8XCIpICsgXCIqXFxcXHxcIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2tbMF0uY2hvaWNlcyA9IHZhbC5zbGljZSgxLCAtMSkuc3BsaXQoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCIvKFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKykvKD86KFwiICsgZXNjYXBlKFwiL1wiKSArIFwiKikvKShcXFxcdyopOj9cIixcbiAgICAgICAgICAgICAgICBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdHMgPSBzdGFja1swXTtcbiAgICAgICAgICAgICAgICAgICAgdHMuZm10U3RyaW5nID0gdmFsO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IHRoaXMuc3BsaXRSZWdleC5leGVjKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIHRzLmd1YXJkID0gdmFsWzFdO1xuICAgICAgICAgICAgICAgICAgICB0cy5mbXQgPSB2YWxbMl07XG4gICAgICAgICAgICAgICAgICAgIHRzLmZsYWcgPSB2YWxbM107XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJgXCIgKyBlc2NhcGUoXCJgXCIpICsgXCIqYFwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5jb2RlID0gdmFsLnNwbGljZSgxLCAtMSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH0sIG5leHQ6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcP1wiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhY2tbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFja1swXS5leHBlY3RJZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSwgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyByZWdleDogXCIoW146fVxcXFxcXFxcXXxcXFxcXFxcXC4pKjo/XCIsIHRva2VuOiBcIlwiLCBuZXh0OiBcInN0YXJ0XCIgfVxuICAgICAgICBdLFxuICAgICAgICBmb3JtYXRTdHJpbmc6IFtcbiAgICAgICAgICAgIHsgcmVnZXg6IFwiLyhcIiArIGVzY2FwZShcIi9cIikgKyBcIispL1wiLCB0b2tlbjogXCJyZWdleFwiIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLmluRm9ybWF0U3RyaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9LCBuZXh0OiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0pO1xuXG4gICAgcHJpdmF0ZSBnZXRUb2tlbml6ZXIoKSB7XG4gICAgICAgIFNuaXBwZXRNYW5hZ2VyLnByb3RvdHlwZS5nZXRUb2tlbml6ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiBTbmlwcGV0TWFuYWdlci4kdG9rZW5pemVyO1xuICAgICAgICB9O1xuICAgICAgICByZXR1cm4gU25pcHBldE1hbmFnZXIuJHRva2VuaXplcjtcbiAgICB9XG5cbiAgICBwcml2YXRlIHRva2VuaXplVG1TbmlwcGV0KHN0ciwgc3RhcnRTdGF0ZT8pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VG9rZW5pemVyKCkuZ2V0TGluZVRva2VucyhzdHIsIHN0YXJ0U3RhdGUpLnRva2Vucy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgcmV0dXJuIHgudmFsdWUgfHwgeDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgbmFtZSkge1xuICAgICAgICBpZiAoL15bQS1aXVxcZCskLy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICB2YXIgaSA9IG5hbWUuc3Vic3RyKDEpO1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLnZhcmlhYmxlc1tuYW1lWzBdICsgXCJfX1wiXSB8fCB7fSlbaV07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKC9eXFxkKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgICAgICAgIHJldHVybiAodGhpcy52YXJpYWJsZXNbJ19fJ10gfHwge30pW25hbWVdO1xuICAgICAgICB9XG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoL15UTV8vLCBcIlwiKTtcblxuICAgICAgICBpZiAoIWVkaXRvcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHMgPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgc3dpdGNoIChuYW1lKSB7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9XT1JEXCI6XG4gICAgICAgICAgICAgICAgdmFyIHIgPSBzLmdldFdvcmRSYW5nZSgpO1xuICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVElPTlwiOlxuICAgICAgICAgICAgY2FzZSBcIlNFTEVDVEVEX1RFWFRcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUZXh0UmFuZ2Uocik7XG4gICAgICAgICAgICBjYXNlIFwiQ1VSUkVOVF9MSU5FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0TGluZShlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICAgICAgY2FzZSBcIlBSRVZfTElORVwiOiAvLyBub3QgcG9zc2libGUgaW4gdGV4dG1hdGVcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRMaW5lKGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyAtIDEpO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfSU5ERVhcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCkuY29sdW1uO1xuICAgICAgICAgICAgY2FzZSBcIkxJTkVfTlVNQkVSXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyArIDE7XG4gICAgICAgICAgICBjYXNlIFwiU09GVF9UQUJTXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHMuZ2V0VXNlU29mdFRhYnMoKSA/IFwiWUVTXCIgOiBcIk5PXCI7XG4gICAgICAgICAgICBjYXNlIFwiVEFCX1NJWkVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gcy5nZXRUYWJTaXplKCk7XG4gICAgICAgICAgICAvLyBkZWZhdWx0IGJ1dCBjYW4ndCBmaWxsIDooXG4gICAgICAgICAgICBjYXNlIFwiRklMRU5BTUVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJGSUxFUEFUSFwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgY2FzZSBcIkZVTExOQU1FXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiQWNlXCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSBnZXRWYXJpYWJsZVZhbHVlKGVkaXRvciwgdmFyTmFtZSkge1xuICAgICAgICBpZiAodGhpcy52YXJpYWJsZXMuaGFzT3duUHJvcGVydHkodmFyTmFtZSkpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YXJpYWJsZXNbdmFyTmFtZV0oZWRpdG9yLCB2YXJOYW1lKSB8fCBcIlwiO1xuICAgICAgICByZXR1cm4gdGhpcy4kZ2V0RGVmYXVsdFZhbHVlKGVkaXRvciwgdmFyTmFtZSkgfHwgXCJcIjtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHN0cmluZyBmb3JtYXR0ZWQgYWNjb3JkaW5nIHRvIGh0dHA6Ly9tYW51YWwubWFjcm9tYXRlcy5jb20vZW4vcmVndWxhcl9leHByZXNzaW9ucyNyZXBsYWNlbWVudF9zdHJpbmdfc3ludGF4X2Zvcm1hdF9zdHJpbmdzXG4gICAgcHVibGljIHRtU3RyRm9ybWF0KHN0ciwgY2gsIGVkaXRvcj8pIHtcbiAgICAgICAgdmFyIGZsYWcgPSBjaC5mbGFnIHx8IFwiXCI7XG4gICAgICAgIHZhciByZSA9IGNoLmd1YXJkO1xuICAgICAgICByZSA9IG5ldyBSZWdFeHAocmUsIGZsYWcucmVwbGFjZSgvW15naV0vLCBcIlwiKSk7XG4gICAgICAgIHZhciBmbXRUb2tlbnMgPSB0aGlzLnRva2VuaXplVG1TbmlwcGV0KGNoLmZtdCwgXCJmb3JtYXRTdHJpbmdcIik7XG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBmb3JtYXR0ZWQgPSBzdHIucmVwbGFjZShyZSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi52YXJpYWJsZXNbJ19fJ10gPSBhcmd1bWVudHM7XG4gICAgICAgICAgICB2YXIgZm10UGFydHMgPSBfc2VsZi5yZXNvbHZlVmFyaWFibGVzKGZtdFRva2VucywgZWRpdG9yKTtcbiAgICAgICAgICAgIHZhciBnQ2hhbmdlQ2FzZSA9IFwiRVwiO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmbXRQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IGZtdFBhcnRzW2ldO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY2ggPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaC5jaGFuZ2VDYXNlICYmIGNoLmxvY2FsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV4dCA9IGZtdFBhcnRzW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChuZXh0ICYmIHR5cGVvZiBuZXh0ID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2guY2hhbmdlQ2FzZSA9PSBcInVcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm10UGFydHNbaV0gPSBuZXh0WzBdLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpXSA9IG5leHRbMF0udG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmbXRQYXJ0c1tpICsgMV0gPSBuZXh0LnN1YnN0cigxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5jaGFuZ2VDYXNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBnQ2hhbmdlQ2FzZSA9IGNoLmNoYW5nZUNhc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiVVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGdDaGFuZ2VDYXNlID09IFwiTFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGZtdFBhcnRzW2ldID0gY2gudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZm10UGFydHMuam9pbihcIlwiKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudmFyaWFibGVzWydfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc29sdmVWYXJpYWJsZXMoc25pcHBldCwgZWRpdG9yKSB7XG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbmlwcGV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBzbmlwcGV0W2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjaCA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2ggIT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5za2lwKSB7XG4gICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC5wcm9jZXNzZWQgPCBpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoLnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB0aGlzLmdldFZhcmlhYmxlVmFsdWUoZWRpdG9yLCBjaC50ZXh0KTtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUgJiYgY2guZm10U3RyaW5nKVxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMudG1TdHJGb3JtYXQodmFsdWUsIGNoKTtcbiAgICAgICAgICAgICAgICBjaC5wcm9jZXNzZWQgPSBpO1xuICAgICAgICAgICAgICAgIGlmIChjaC5leHBlY3RJZiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZ290b05leHQoY2gpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaC5za2lwID0gY2guZWxzZUJyYW5jaDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBnb3RvTmV4dChjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaC50YWJzdG9wSWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2guY2hhbmdlQ2FzZSAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goY2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGdvdG9OZXh0KGNoKSB7XG4gICAgICAgICAgICB2YXIgaTEgPSBzbmlwcGV0LmluZGV4T2YoY2gsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSAhPSAtMSlcbiAgICAgICAgICAgICAgICBpID0gaTE7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yOiBFZGl0b3IsIHNuaXBwZXRUZXh0KSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGxpbmUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgdGFiU3RyaW5nID0gZWRpdG9yLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBsaW5lLm1hdGNoKC9eXFxzKi8pWzBdO1xuXG4gICAgICAgIGlmIChjdXJzb3IuY29sdW1uIDwgaW5kZW50U3RyaW5nLmxlbmd0aClcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IGluZGVudFN0cmluZy5zbGljZSgwLCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgdG9rZW5zID0gdGhpcy50b2tlbml6ZVRtU25pcHBldChzbmlwcGV0VGV4dCk7XG4gICAgICAgIHRva2VucyA9IHRoaXMucmVzb2x2ZVZhcmlhYmxlcyh0b2tlbnMsIGVkaXRvcik7XG4gICAgICAgIC8vIGluZGVudFxuICAgICAgICB0b2tlbnMgPSB0b2tlbnMubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIGlmICh4ID09IFwiXFxuXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHggKyBpbmRlbnRTdHJpbmc7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHggPT0gXCJzdHJpbmdcIilcbiAgICAgICAgICAgICAgICByZXR1cm4geC5yZXBsYWNlKC9cXHQvZywgdGFiU3RyaW5nKTtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gdGFic3RvcCB2YWx1ZXNcbiAgICAgICAgdmFyIHRhYnN0b3BzID0gW107XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHAsIGkpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHZhciBpZCA9IHAudGFic3RvcElkO1xuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgaWYgKCF0cykge1xuICAgICAgICAgICAgICAgIHRzID0gdGFic3RvcHNbaWRdID0gW107XG4gICAgICAgICAgICAgICAgdHMuaW5kZXggPSBpZDtcbiAgICAgICAgICAgICAgICB0cy52YWx1ZSA9IFwiXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHMuaW5kZXhPZihwKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdHMucHVzaChwKTtcbiAgICAgICAgICAgIHZhciBpMSA9IHRva2Vucy5pbmRleE9mKHAsIGkgKyAxKTtcbiAgICAgICAgICAgIGlmIChpMSA9PT0gLTEpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB0b2tlbnMuc2xpY2UoaSArIDEsIGkxKTtcbiAgICAgICAgICAgIHZhciBpc05lc3RlZCA9IHZhbHVlLnNvbWUoZnVuY3Rpb24odCkgeyByZXR1cm4gdHlwZW9mIHQgPT09IFwib2JqZWN0XCIgfSk7XG4gICAgICAgICAgICBpZiAoaXNOZXN0ZWQgJiYgIXRzLnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdHMudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodmFsdWUubGVuZ3RoICYmICghdHMudmFsdWUgfHwgdHlwZW9mIHRzLnZhbHVlICE9PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgICAgIHRzLnZhbHVlID0gdmFsdWUuam9pbihcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gZXhwYW5kIHRhYnN0b3AgdmFsdWVzXG4gICAgICAgIHRhYnN0b3BzLmZvckVhY2goZnVuY3Rpb24odHMpIHsgdHMubGVuZ3RoID0gMCB9KTtcbiAgICAgICAgdmFyIGV4cGFuZGluZyA9IHt9O1xuICAgICAgICBmdW5jdGlvbiBjb3B5VmFsdWUodmFsKSB7XG4gICAgICAgICAgICB2YXIgY29weSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgcCA9IHZhbFtpXTtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHAgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwYW5kaW5nW3AudGFic3RvcElkXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaiA9IHZhbC5sYXN0SW5kZXhPZihwLCBpIC0gMSk7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBjb3B5W2pdIHx8IHsgdGFic3RvcElkOiBwLnRhYnN0b3BJZCB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb3B5W2ldID0gcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb3B5O1xuICAgICAgICB9XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgcCA9IHRva2Vuc1tpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcCAhPSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGlkID0gcC50YWJzdG9wSWQ7XG4gICAgICAgICAgICB2YXIgaTEgPSB0b2tlbnMuaW5kZXhPZihwLCBpICsgMSk7XG4gICAgICAgICAgICBpZiAoZXhwYW5kaW5nW2lkXSkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHJlYWNoZWQgY2xvc2luZyBicmFja2V0IGNsZWFyIGV4cGFuZGluZyBzdGF0ZVxuICAgICAgICAgICAgICAgIGlmIChleHBhbmRpbmdbaWRdID09PSBwKVxuICAgICAgICAgICAgICAgICAgICBleHBhbmRpbmdbaWRdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UganVzdCBpZ25vcmUgcmVjdXJzaXZlIHRhYnN0b3BcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRzID0gdGFic3RvcHNbaWRdO1xuICAgICAgICAgICAgdmFyIGFyZyA9IHR5cGVvZiB0cy52YWx1ZSA9PSBcInN0cmluZ1wiID8gW3RzLnZhbHVlXSA6IGNvcHlWYWx1ZSh0cy52YWx1ZSk7XG4gICAgICAgICAgICBhcmcudW5zaGlmdChpICsgMSwgTWF0aC5tYXgoMCwgaTEgLSBpKSk7XG4gICAgICAgICAgICBhcmcucHVzaChwKTtcbiAgICAgICAgICAgIGV4cGFuZGluZ1tpZF0gPSBwO1xuICAgICAgICAgICAgdG9rZW5zLnNwbGljZS5hcHBseSh0b2tlbnMsIGFyZyk7XG5cbiAgICAgICAgICAgIGlmICh0cy5pbmRleE9mKHApID09PSAtMSlcbiAgICAgICAgICAgICAgICB0cy5wdXNoKHApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCB0byBwbGFpbiB0ZXh0XG4gICAgICAgIHZhciByb3cgPSAwLCBjb2x1bW4gPSAwO1xuICAgICAgICB2YXIgdGV4dCA9IFwiXCI7XG4gICAgICAgIHRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHQpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGlmICh0WzBdID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiA9IHQubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGNvbHVtbiArPSB0Lmxlbmd0aDtcbiAgICAgICAgICAgICAgICB0ZXh0ICs9IHQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghdC5zdGFydClcbiAgICAgICAgICAgICAgICAgICAgdC5zdGFydCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0LmVuZCA9IHsgcm93OiByb3csIGNvbHVtbjogY29sdW1uIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIGVuZCA9IGVkaXRvci5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuXG4gICAgICAgIHZhciB0c01hbmFnZXIgPSBlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSA/IGVkaXRvcltUQUJTVE9QX01BTkFHRVJdIDogbmV3IFRhYnN0b3BNYW5hZ2VyKGVkaXRvcik7XG4gICAgICAgIHZhciBzZWxlY3Rpb25JZCA9IGVkaXRvci5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlICYmIGVkaXRvci5zZWxlY3Rpb25bJ2luZGV4J107XG4gICAgICAgIHRzTWFuYWdlci5hZGRUYWJzdG9wcyh0YWJzdG9wcywgcmFuZ2Uuc3RhcnQsIGVuZCwgc2VsZWN0aW9uSWQpO1xuICAgIH1cblxuICAgIHB1YmxpYyBpbnNlcnRTbmlwcGV0KGVkaXRvcjogRWRpdG9yLCBzbmlwcGV0VGV4dCwgdW51c2VkPykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIGlmIChlZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSlcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG5cbiAgICAgICAgZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLmluc2VydFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBzbmlwcGV0VGV4dCk7XG4gICAgICAgIH0sIG51bGwsIHsga2VlcE9yZGVyOiB0cnVlIH0pO1xuXG4gICAgICAgIGlmIChlZGl0b3JbVEFCU1RPUF9NQU5BR0VSXSkge1xuICAgICAgICAgICAgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0U2NvcGUoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdmFyIHNjb3BlID0gZWRpdG9yLnNlc3Npb24uJG1vZGUuJGlkIHx8IFwiXCI7XG4gICAgICAgIHNjb3BlID0gc2NvcGUuc3BsaXQoXCIvXCIpLnBvcCgpO1xuICAgICAgICBpZiAoc2NvcGUgPT09IFwiaHRtbFwiIHx8IHNjb3BlID09PSBcInBocFwiKSB7XG4gICAgICAgICAgICAvLyBQSFAgaXMgYWN0dWFsbHkgSFRNTFxuICAgICAgICAgICAgaWYgKHNjb3BlID09PSBcInBocFwiICYmICFlZGl0b3Iuc2Vzc2lvbi4kbW9kZS5pbmxpbmVQaHApXG4gICAgICAgICAgICAgICAgc2NvcGUgPSBcImh0bWxcIjtcbiAgICAgICAgICAgIHZhciBjID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRTdGF0ZShjLnJvdyk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHN0YXRlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUgPSBzdGF0ZVswXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS5zdWJzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDMpID09IFwianMtXCIpXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlID0gXCJqYXZhc2NyaXB0XCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwiY3NzLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwiY3NzXCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuc3Vic3RyaW5nKDAsIDQpID09IFwicGhwLVwiKVxuICAgICAgICAgICAgICAgICAgICBzY29wZSA9IFwicGhwXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NvcGU7XG4gICAgfVxuXG4gICAgcHVibGljIGdldEFjdGl2ZVNjb3BlcyhlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc2NvcGUgPSB0aGlzLiRnZXRTY29wZShlZGl0b3IpO1xuICAgICAgICB2YXIgc2NvcGVzID0gW3Njb3BlXTtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIGlmIChzbmlwcGV0TWFwW3Njb3BlXSAmJiBzbmlwcGV0TWFwW3Njb3BlXS5pbmNsdWRlU2NvcGVzKSB7XG4gICAgICAgICAgICBzY29wZXMucHVzaC5hcHBseShzY29wZXMsIHNuaXBwZXRNYXBbc2NvcGVdLmluY2x1ZGVTY29wZXMpO1xuICAgICAgICB9XG4gICAgICAgIHNjb3Blcy5wdXNoKFwiX1wiKTtcbiAgICAgICAgcmV0dXJuIHNjb3BlcztcbiAgICB9XG5cbiAgICBwdWJsaWMgZXhwYW5kV2l0aFRhYihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucz8pOiBib29sZWFuIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgcmVzdWx0OiBib29sZWFuID0gZWRpdG9yLmZvckVhY2hTZWxlY3Rpb24oZnVuY3Rpb24oKSB7IHJldHVybiBzZWxmLmV4cGFuZFNuaXBwZXRGb3JTZWxlY3Rpb24oZWRpdG9yLCBvcHRpb25zKTsgfSwgbnVsbCwgeyBrZWVwT3JkZXI6IHRydWUgfSk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgZWRpdG9yW1RBQlNUT1BfTUFOQUdFUl0pIHtcbiAgICAgICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHByaXZhdGUgZXhwYW5kU25pcHBldEZvclNlbGVjdGlvbihlZGl0b3I6IEVkaXRvciwgb3B0aW9ucykge1xuICAgICAgICB2YXIgY3Vyc29yID0gZWRpdG9yLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBsaW5lID0gZWRpdG9yLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGJlZm9yZSA9IGxpbmUuc3Vic3RyaW5nKDAsIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgYWZ0ZXIgPSBsaW5lLnN1YnN0cihjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE1hcDtcbiAgICAgICAgdmFyIHNuaXBwZXQ7XG4gICAgICAgIHRoaXMuZ2V0QWN0aXZlU2NvcGVzKGVkaXRvcikuc29tZShmdW5jdGlvbihzY29wZSkge1xuICAgICAgICAgICAgdmFyIHNuaXBwZXRzID0gc25pcHBldE1hcFtzY29wZV07XG4gICAgICAgICAgICBpZiAoc25pcHBldHMpXG4gICAgICAgICAgICAgICAgc25pcHBldCA9IHRoaXMuZmluZE1hdGNoaW5nU25pcHBldChzbmlwcGV0cywgYmVmb3JlLCBhZnRlcik7XG4gICAgICAgICAgICByZXR1cm4gISFzbmlwcGV0O1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKCFzbmlwcGV0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmRyeVJ1bilcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBlZGl0b3Iuc2Vzc2lvbi5kb2MucmVtb3ZlSW5MaW5lKGN1cnNvci5yb3csXG4gICAgICAgICAgICBjdXJzb3IuY29sdW1uIC0gc25pcHBldC5yZXBsYWNlQmVmb3JlLmxlbmd0aCxcbiAgICAgICAgICAgIGN1cnNvci5jb2x1bW4gKyBzbmlwcGV0LnJlcGxhY2VBZnRlci5sZW5ndGhcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLnZhcmlhYmxlc1snTV9fJ10gPSBzbmlwcGV0Lm1hdGNoQmVmb3JlO1xuICAgICAgICB0aGlzLnZhcmlhYmxlc1snVF9fJ10gPSBzbmlwcGV0Lm1hdGNoQWZ0ZXI7XG4gICAgICAgIHRoaXMuaW5zZXJ0U25pcHBldEZvclNlbGVjdGlvbihlZGl0b3IsIHNuaXBwZXQuY29udGVudCk7XG5cbiAgICAgICAgdGhpcy52YXJpYWJsZXNbJ01fXyddID0gdGhpcy52YXJpYWJsZXNbJ1RfXyddID0gbnVsbDtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBmaW5kTWF0Y2hpbmdTbmlwcGV0KHNuaXBwZXRMaXN0LCBiZWZvcmUsIGFmdGVyKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSBzbmlwcGV0TGlzdC5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIHZhciBzID0gc25pcHBldExpc3RbaV07XG4gICAgICAgICAgICBpZiAocy5zdGFydFJlICYmICFzLnN0YXJ0UmUudGVzdChiZWZvcmUpKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKHMuZW5kUmUgJiYgIXMuZW5kUmUudGVzdChhZnRlcikpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBpZiAoIXMuc3RhcnRSZSAmJiAhcy5lbmRSZSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgcy5tYXRjaEJlZm9yZSA9IHMuc3RhcnRSZSA/IHMuc3RhcnRSZS5leGVjKGJlZm9yZSkgOiBbXCJcIl07XG4gICAgICAgICAgICBzLm1hdGNoQWZ0ZXIgPSBzLmVuZFJlID8gcy5lbmRSZS5leGVjKGFmdGVyKSA6IFtcIlwiXTtcbiAgICAgICAgICAgIHMucmVwbGFjZUJlZm9yZSA9IHMudHJpZ2dlclJlID8gcy50cmlnZ2VyUmUuZXhlYyhiZWZvcmUpWzBdIDogXCJcIjtcbiAgICAgICAgICAgIHMucmVwbGFjZUFmdGVyID0gcy5lbmRUcmlnZ2VyUmUgPyBzLmVuZFRyaWdnZXJSZS5leGVjKGFmdGVyKVswXSA6IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyByZWdpc3RlcihzbmlwcGV0cywgc2NvcGUpIHtcbiAgICAgICAgdmFyIHNuaXBwZXRNYXAgPSB0aGlzLnNuaXBwZXRNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0TmFtZU1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgZnVuY3Rpb24gd3JhcFJlZ2V4cChzcmMpIHtcbiAgICAgICAgICAgIGlmIChzcmMgJiYgIS9eXFxeP1xcKC4qXFwpXFwkPyR8XlxcXFxiJC8udGVzdChzcmMpKVxuICAgICAgICAgICAgICAgIHNyYyA9IFwiKD86XCIgKyBzcmMgKyBcIilcIjtcblxuICAgICAgICAgICAgcmV0dXJuIHNyYyB8fCBcIlwiO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGd1YXJkZWRSZWdleHAocmUsIGd1YXJkLCBvcGVuaW5nKSB7XG4gICAgICAgICAgICByZSA9IHdyYXBSZWdleHAocmUpO1xuICAgICAgICAgICAgZ3VhcmQgPSB3cmFwUmVnZXhwKGd1YXJkKTtcbiAgICAgICAgICAgIGlmIChvcGVuaW5nKSB7XG4gICAgICAgICAgICAgICAgcmUgPSBndWFyZCArIHJlO1xuICAgICAgICAgICAgICAgIGlmIChyZSAmJiByZVtyZS5sZW5ndGggLSAxXSAhPSBcIiRcIilcbiAgICAgICAgICAgICAgICAgICAgcmUgPSByZSArIFwiJFwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZSA9IHJlICsgZ3VhcmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJlICYmIHJlWzBdICE9IFwiXlwiKVxuICAgICAgICAgICAgICAgICAgICByZSA9IFwiXlwiICsgcmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbmV3IFJlZ0V4cChyZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhZGRTbmlwcGV0KHMpIHtcbiAgICAgICAgICAgIGlmICghcy5zY29wZSlcbiAgICAgICAgICAgICAgICBzLnNjb3BlID0gc2NvcGUgfHwgXCJfXCI7XG4gICAgICAgICAgICBzY29wZSA9IHMuc2NvcGU7XG4gICAgICAgICAgICBpZiAoIXNuaXBwZXRNYXBbc2NvcGVdKSB7XG4gICAgICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0gPSBbXTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0TmFtZU1hcFtzY29wZV0gPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXROYW1lTWFwW3Njb3BlXTtcbiAgICAgICAgICAgIGlmIChzLm5hbWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgb2xkID0gbWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgaWYgKG9sZClcbiAgICAgICAgICAgICAgICAgICAgc2VsZi51bnJlZ2lzdGVyKG9sZCk7XG4gICAgICAgICAgICAgICAgbWFwW3MubmFtZV0gPSBzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc25pcHBldE1hcFtzY29wZV0ucHVzaChzKTtcblxuICAgICAgICAgICAgaWYgKHMudGFiVHJpZ2dlciAmJiAhcy50cmlnZ2VyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzLmd1YXJkICYmIC9eXFx3Ly50ZXN0KHMudGFiVHJpZ2dlcikpXG4gICAgICAgICAgICAgICAgICAgIHMuZ3VhcmQgPSBcIlxcXFxiXCI7XG4gICAgICAgICAgICAgICAgcy50cmlnZ2VyID0gbGFuZy5lc2NhcGVSZWdFeHAocy50YWJUcmlnZ2VyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcy5zdGFydFJlID0gZ3VhcmRlZFJlZ2V4cChzLnRyaWdnZXIsIHMuZ3VhcmQsIHRydWUpO1xuICAgICAgICAgICAgcy50cmlnZ2VyUmUgPSBuZXcgUmVnRXhwKHMudHJpZ2dlciwgXCJcIik7XG5cbiAgICAgICAgICAgIHMuZW5kUmUgPSBndWFyZGVkUmVnZXhwKHMuZW5kVHJpZ2dlciwgcy5lbmRHdWFyZCwgdHJ1ZSk7XG4gICAgICAgICAgICBzLmVuZFRyaWdnZXJSZSA9IG5ldyBSZWdFeHAocy5lbmRUcmlnZ2VyLCBcIlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzbmlwcGV0cy5jb250ZW50KVxuICAgICAgICAgICAgYWRkU25pcHBldChzbmlwcGV0cyk7XG4gICAgICAgIGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoc25pcHBldHMpKVxuICAgICAgICAgICAgc25pcHBldHMuZm9yRWFjaChhZGRTbmlwcGV0KTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJyZWdpc3RlclNuaXBwZXRzXCIsIHsgc2NvcGU6IHNjb3BlIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgdW5yZWdpc3RlcihzbmlwcGV0cywgc2NvcGU/KSB7XG4gICAgICAgIHZhciBzbmlwcGV0TWFwID0gdGhpcy5zbmlwcGV0TWFwO1xuICAgICAgICB2YXIgc25pcHBldE5hbWVNYXAgPSB0aGlzLnNuaXBwZXROYW1lTWFwO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlbW92ZVNuaXBwZXQocykge1xuICAgICAgICAgICAgdmFyIG5hbWVNYXAgPSBzbmlwcGV0TmFtZU1hcFtzLnNjb3BlIHx8IHNjb3BlXTtcbiAgICAgICAgICAgIGlmIChuYW1lTWFwICYmIG5hbWVNYXBbcy5uYW1lXSkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBuYW1lTWFwW3MubmFtZV07XG4gICAgICAgICAgICAgICAgdmFyIG1hcCA9IHNuaXBwZXRNYXBbcy5zY29wZSB8fCBzY29wZV07XG4gICAgICAgICAgICAgICAgdmFyIGkgPSBtYXAgJiYgbWFwLmluZGV4T2Yocyk7XG4gICAgICAgICAgICAgICAgaWYgKGkgPj0gMClcbiAgICAgICAgICAgICAgICAgICAgbWFwLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoc25pcHBldHMuY29udGVudClcbiAgICAgICAgICAgIHJlbW92ZVNuaXBwZXQoc25pcHBldHMpO1xuICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXRzKSlcbiAgICAgICAgICAgIHNuaXBwZXRzLmZvckVhY2gocmVtb3ZlU25pcHBldCk7XG4gICAgfVxuXG4gICAgcHVibGljIHBhcnNlU25pcHBldEZpbGUoc3RyKSB7XG4gICAgICAgIHN0ciA9IHN0ci5yZXBsYWNlKC9cXHIvZywgXCJcIik7XG4gICAgICAgIHZhciBsaXN0ID0gW107XG4gICAgICAgIHZhciBzbmlwcGV0OiBhbnkgPSB7fTtcbiAgICAgICAgdmFyIHJlID0gL14jLip8Xih7W1xcc1xcU10qfSlcXHMqJHxeKFxcUyspICguKikkfF4oKD86XFxuKlxcdC4qKSspL2dtO1xuICAgICAgICB2YXIgbTtcbiAgICAgICAgd2hpbGUgKG0gPSByZS5leGVjKHN0cikpIHtcbiAgICAgICAgICAgIGlmIChtWzFdKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldCA9IEpTT04ucGFyc2UobVsxXSk7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QucHVzaChzbmlwcGV0KTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7IH1cbiAgICAgICAgICAgIH0gaWYgKG1bNF0pIHtcbiAgICAgICAgICAgICAgICBzbmlwcGV0LmNvbnRlbnQgPSBtWzRdLnJlcGxhY2UoL15cXHQvZ20sIFwiXCIpO1xuICAgICAgICAgICAgICAgIGxpc3QucHVzaChzbmlwcGV0KTtcbiAgICAgICAgICAgICAgICBzbmlwcGV0ID0ge307XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSBtWzJdLCB2YWwgPSBtWzNdO1xuICAgICAgICAgICAgICAgIGlmIChrZXkgPT0gXCJyZWdleFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBndWFyZFJlID0gL1xcLygoPzpbXlxcL1xcXFxdfFxcXFwuKSopfCQvZztcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5ndWFyZCA9IGd1YXJkUmUuZXhlYyh2YWwpWzFdO1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LnRyaWdnZXIgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICAgICAgc25pcHBldC5lbmRUcmlnZ2VyID0gZ3VhcmRSZS5leGVjKHZhbClbMV07XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXQuZW5kR3VhcmQgPSBndWFyZFJlLmV4ZWModmFsKVsxXTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleSA9PSBcInNuaXBwZXRcIikge1xuICAgICAgICAgICAgICAgICAgICBzbmlwcGV0LnRhYlRyaWdnZXIgPSB2YWwubWF0Y2goL15cXFMqLylbMF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghc25pcHBldC5uYW1lKVxuICAgICAgICAgICAgICAgICAgICAgICAgc25pcHBldC5uYW1lID0gdmFsO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNuaXBwZXRba2V5XSA9IHZhbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGxpc3Q7XG4gICAgfVxuICAgIHByaXZhdGUgZ2V0U25pcHBldEJ5TmFtZShuYW1lLCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB2YXIgc25pcHBldE1hcCA9IHRoaXMuc25pcHBldE5hbWVNYXA7XG4gICAgICAgIHZhciBzbmlwcGV0O1xuICAgICAgICB0aGlzLmdldEFjdGl2ZVNjb3BlcyhlZGl0b3IpLnNvbWUoZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgIHZhciBzbmlwcGV0cyA9IHNuaXBwZXRNYXBbc2NvcGVdO1xuICAgICAgICAgICAgaWYgKHNuaXBwZXRzKVxuICAgICAgICAgICAgICAgIHNuaXBwZXQgPSBzbmlwcGV0c1tuYW1lXTtcbiAgICAgICAgICAgIHJldHVybiAhIXNuaXBwZXQ7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICByZXR1cm4gc25pcHBldDtcbiAgICB9XG59XG5cbmNsYXNzIFRhYnN0b3BNYW5hZ2VyIHtcbiAgICBwcml2YXRlIGluZGV4O1xuICAgIHByaXZhdGUgcmFuZ2VzO1xuICAgIHByaXZhdGUgdGFic3RvcHM7XG4gICAgcHJpdmF0ZSAkb3BlblRhYnN0b3BzO1xuICAgIHByaXZhdGUgc2VsZWN0ZWRUYWJzdG9wO1xuICAgIHByaXZhdGUgZWRpdG9yOiBFZGl0b3I7XG4gICAgcHJpdmF0ZSBrZXlib2FyZEhhbmRsZXIgPSBuZXcgaGhtLkhhc2hIYW5kbGVyKCk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VTZXNzaW9uO1xuICAgIHByaXZhdGUgJG9uQWZ0ZXJFeGVjO1xuICAgIHByaXZhdGUgJGluQ2hhbmdlO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIGVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gdGhpcztcbiAgICAgICAgdGhpcy4kb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uID0gbGFuZy5kZWxheWVkQ2FsbCh0aGlzLm9uQ2hhbmdlU2VsZWN0aW9uLmJpbmQodGhpcykpLnNjaGVkdWxlO1xuICAgICAgICB0aGlzLiRvbkNoYW5nZVNlc3Npb24gPSB0aGlzLm9uQ2hhbmdlU2Vzc2lvbi5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLiRvbkFmdGVyRXhlYyA9IHRoaXMub25BZnRlckV4ZWMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5hdHRhY2goZWRpdG9yKTtcbiAgICAgICAgdGhpcy5rZXlib2FyZEhhbmRsZXIuYmluZEtleXMoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCJUYWJcIjogZnVuY3Rpb24oZWQ6IEVkaXRvcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc25pcHBldE1hbmFnZXIgJiYgc25pcHBldE1hbmFnZXIuZXhwYW5kV2l0aFRhYihlZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVkW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgxKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJTaGlmdC1UYWJcIjogZnVuY3Rpb24oZWQ6IEVkaXRvcikge1xuICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLnRhYk5leHQoLTEpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJFc2NcIjogZnVuY3Rpb24oZWQ6IEVkaXRvcikge1xuICAgICAgICAgICAgICAgICAgICBlZFtUQUJTVE9QX01BTkFHRVJdLmRldGFjaCgpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJSZXR1cm5cIjogZnVuY3Rpb24oZWQ6IEVkaXRvcikge1xuICAgICAgICAgICAgICAgICAgICAvL2VkW1RBQlNUT1BfTUFOQUdFUl0udGFiTmV4dCgxKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgIH1cbiAgICBwcml2YXRlIGF0dGFjaChlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB0aGlzLmluZGV4ID0gMDtcbiAgICAgICAgdGhpcy5yYW5nZXMgPSBbXTtcbiAgICAgICAgdGhpcy50YWJzdG9wcyA9IFtdO1xuICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHMgPSBudWxsO1xuICAgICAgICB0aGlzLnNlbGVjdGVkVGFic3RvcCA9IG51bGw7XG5cbiAgICAgICAgdGhpcy5lZGl0b3IgPSBlZGl0b3I7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgdGhpcy4kb25DaGFuZ2VTZXNzaW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3IuY29tbWFuZHMub24oXCJhZnRlckV4ZWNcIiwgdGhpcy4kb25BZnRlckV4ZWMpO1xuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLmFkZEtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBkZXRhY2goKSB7XG4gICAgICAgIHRoaXMudGFic3RvcHMuZm9yRWFjaCh0aGlzLnJlbW92ZVRhYnN0b3BNYXJrZXJzLCB0aGlzKTtcbiAgICAgICAgdGhpcy5yYW5nZXMgPSBudWxsO1xuICAgICAgICB0aGlzLnRhYnN0b3BzID0gbnVsbDtcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRhYnN0b3AgPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvci5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5lZGl0b3IucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VTZXNzaW9uXCIsIHRoaXMuJG9uQ2hhbmdlU2Vzc2lvbik7XG4gICAgICAgIHRoaXMuZWRpdG9yLmNvbW1hbmRzLnJlbW92ZUxpc3RlbmVyKFwiYWZ0ZXJFeGVjXCIsIHRoaXMuJG9uQWZ0ZXJFeGVjKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iua2V5QmluZGluZy5yZW1vdmVLZXlib2FyZEhhbmRsZXIodGhpcy5rZXlib2FyZEhhbmRsZXIpO1xuICAgICAgICB0aGlzLmVkaXRvcltUQUJTVE9QX01BTkFHRVJdID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IgPSBudWxsO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgY2hhbmdlUmFuZ2UgPSBlLmRhdGEucmFuZ2U7XG4gICAgICAgIHZhciBpc1JlbW92ZSA9IGUuZGF0YS5hY3Rpb25bMF0gPT0gXCJyXCI7XG4gICAgICAgIHZhciBzdGFydCA9IGNoYW5nZVJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gY2hhbmdlUmFuZ2UuZW5kO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBzdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBlbmQucm93O1xuICAgICAgICB2YXIgbGluZURpZiA9IGVuZFJvdyAtIHN0YXJ0Um93O1xuICAgICAgICB2YXIgY29sRGlmZiA9IGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW47XG5cbiAgICAgICAgaWYgKGlzUmVtb3ZlKSB7XG4gICAgICAgICAgICBsaW5lRGlmID0gLWxpbmVEaWY7XG4gICAgICAgICAgICBjb2xEaWZmID0gLWNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLiRpbkNoYW5nZSAmJiBpc1JlbW92ZSkge1xuICAgICAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgICAgICB2YXIgY2hhbmdlZE91dHNpZGUgPSB0cyAmJiAhdHMuc29tZShmdW5jdGlvbihyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVQb2ludHMoci5zdGFydCwgc3RhcnQpIDw9IDAgJiYgY29tcGFyZVBvaW50cyhyLmVuZCwgZW5kKSA+PSAwO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoY2hhbmdlZE91dHNpZGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMucmFuZ2VzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIHIgPSByYW5nZXNbaV07XG4gICAgICAgICAgICBpZiAoci5lbmQucm93IDwgc3RhcnQucm93KVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBpZiAoaXNSZW1vdmUgJiYgY29tcGFyZVBvaW50cyhzdGFydCwgci5zdGFydCkgPCAwICYmIGNvbXBhcmVQb2ludHMoZW5kLCByLmVuZCkgPiAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVSYW5nZShyKTtcbiAgICAgICAgICAgICAgICBpLS07XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyLnN0YXJ0LnJvdyA9PSBzdGFydFJvdyAmJiByLnN0YXJ0LmNvbHVtbiA+IHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICByLnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuZW5kLnJvdyA9PSBzdGFydFJvdyAmJiByLmVuZC5jb2x1bW4gPj0gc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgIHIuZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgaWYgKHIuc3RhcnQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuc3RhcnQucm93ICs9IGxpbmVEaWY7XG4gICAgICAgICAgICBpZiAoci5lbmQucm93ID49IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHIuZW5kLnJvdyArPSBsaW5lRGlmO1xuXG4gICAgICAgICAgICBpZiAoY29tcGFyZVBvaW50cyhyLnN0YXJ0LCByLmVuZCkgPiAwKVxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlUmFuZ2Uocik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHVwZGF0ZUxpbmtlZEZpZWxkcygpIHtcbiAgICAgICAgdmFyIHRzID0gdGhpcy5zZWxlY3RlZFRhYnN0b3A7XG4gICAgICAgIGlmICghdHMgfHwgIXRzLmhhc0xpbmtlZFJhbmdlcylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdGhpcy4kaW5DaGFuZ2UgPSB0cnVlO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZWRpdG9yLnNlc3Npb247XG4gICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UodHMuZmlyc3ROb25MaW5rZWQpO1xuICAgICAgICBmb3IgKHZhciBpID0gdHMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0c1tpXTtcbiAgICAgICAgICAgIGlmICghcmFuZ2UubGlua2VkKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgdmFyIGZtdCA9IHNuaXBwZXRNYW5hZ2VyLnRtU3RyRm9ybWF0KHRleHQsIHJhbmdlLm9yaWdpbmFsKTtcbiAgICAgICAgICAgIHNlc3Npb24ucmVwbGFjZShyYW5nZSwgZm10KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpbkNoYW5nZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25BZnRlckV4ZWMoZSkge1xuICAgICAgICBpZiAoZS5jb21tYW5kICYmICFlLmNvbW1hbmQucmVhZE9ubHkpXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUxpbmtlZEZpZWxkcygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VTZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICghdGhpcy5lZGl0b3IpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBsZWFkID0gdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLmxlYWQ7XG4gICAgICAgIHZhciBhbmNob3IgPSB0aGlzLmVkaXRvci5zZWxlY3Rpb24uYW5jaG9yO1xuICAgICAgICB2YXIgaXNFbXB0eSA9IHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5pc0VtcHR5KCk7XG4gICAgICAgIGZvciAodmFyIGkgPSB0aGlzLnJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnJhbmdlc1tpXS5saW5rZWQpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB2YXIgY29udGFpbnNMZWFkID0gdGhpcy5yYW5nZXNbaV0uY29udGFpbnMobGVhZC5yb3csIGxlYWQuY29sdW1uKTtcbiAgICAgICAgICAgIHZhciBjb250YWluc0FuY2hvciA9IGlzRW1wdHkgfHwgdGhpcy5yYW5nZXNbaV0uY29udGFpbnMoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgICAgICBpZiAoY29udGFpbnNMZWFkICYmIGNvbnRhaW5zQW5jaG9yKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VTZXNzaW9uKCkge1xuICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgdGFiTmV4dChkaXIpIHtcbiAgICAgICAgdmFyIG1heCA9IHRoaXMudGFic3RvcHMubGVuZ3RoO1xuICAgICAgICB2YXIgaW5kZXggPSB0aGlzLmluZGV4ICsgKGRpciB8fCAxKTtcbiAgICAgICAgaW5kZXggPSBNYXRoLm1pbihNYXRoLm1heChpbmRleCwgMSksIG1heCk7XG4gICAgICAgIGlmIChpbmRleCA9PSBtYXgpXG4gICAgICAgICAgICBpbmRleCA9IDA7XG4gICAgICAgIHRoaXMuc2VsZWN0VGFic3RvcChpbmRleCk7XG4gICAgICAgIGlmIChpbmRleCA9PT0gMClcbiAgICAgICAgICAgIHRoaXMuZGV0YWNoKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBzZWxlY3RUYWJzdG9wKGluZGV4KSB7XG4gICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wcyA9IG51bGw7XG4gICAgICAgIHZhciB0cyA9IHRoaXMudGFic3RvcHNbdGhpcy5pbmRleF07XG4gICAgICAgIGlmICh0cylcbiAgICAgICAgICAgIHRoaXMuYWRkVGFic3RvcE1hcmtlcnModHMpO1xuICAgICAgICB0aGlzLmluZGV4ID0gaW5kZXg7XG4gICAgICAgIHRzID0gdGhpcy50YWJzdG9wc1t0aGlzLmluZGV4XTtcbiAgICAgICAgaWYgKCF0cyB8fCAhdHMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUYWJzdG9wID0gdHM7XG4gICAgICAgIGlmICghdGhpcy5lZGl0b3IuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSkge1xuICAgICAgICAgICAgdmFyIHNlbCA9IHRoaXMuZWRpdG9yWydtdWx0aVNlbGVjdCddO1xuICAgICAgICAgICAgc2VsLnRvU2luZ2xlUmFuZ2UodHMuZmlyc3ROb25MaW5rZWQuY2xvbmUoKSk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gdHMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgaWYgKHRzLmhhc0xpbmtlZFJhbmdlcyAmJiB0c1tpXS5saW5rZWQpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIHNlbC5hZGRSYW5nZSh0c1tpXS5jbG9uZSgpLCB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHRvZG8gaW52ZXN0aWdhdGUgd2h5IGlzIHRoaXMgbmVlZGVkXG4gICAgICAgICAgICBpZiAoc2VsLnJhbmdlc1swXSlcbiAgICAgICAgICAgICAgICBzZWwuYWRkUmFuZ2Uoc2VsLnJhbmdlc1swXS5jbG9uZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZXRSYW5nZSh0cy5maXJzdE5vbkxpbmtlZCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmVkaXRvci5rZXlCaW5kaW5nLmFkZEtleWJvYXJkSGFuZGxlcih0aGlzLmtleWJvYXJkSGFuZGxlcik7XG4gICAgfVxuXG4gICAgcHVibGljIGFkZFRhYnN0b3BzID0gZnVuY3Rpb24odGFic3RvcHMsIHN0YXJ0LCBlbmQsIHVudXNlZCkge1xuICAgICAgICBpZiAoIXRoaXMuJG9wZW5UYWJzdG9wcylcbiAgICAgICAgICAgIHRoaXMuJG9wZW5UYWJzdG9wcyA9IFtdO1xuICAgICAgICAvLyBhZGQgZmluYWwgdGFic3RvcCBpZiBtaXNzaW5nXG4gICAgICAgIGlmICghdGFic3RvcHNbMF0pIHtcbiAgICAgICAgICAgIHZhciBwID0gcm0uUmFuZ2UuZnJvbVBvaW50cyhlbmQsIGVuZCk7XG4gICAgICAgICAgICBtb3ZlUmVsYXRpdmUocC5zdGFydCwgc3RhcnQpO1xuICAgICAgICAgICAgbW92ZVJlbGF0aXZlKHAuZW5kLCBzdGFydCk7XG4gICAgICAgICAgICB0YWJzdG9wc1swXSA9IFtwXTtcbiAgICAgICAgICAgIHRhYnN0b3BzWzBdLmluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gdGhpcy5pbmRleDtcbiAgICAgICAgdmFyIGFyZyA9IFtpICsgMSwgMF07XG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLnJhbmdlcztcbiAgICAgICAgdGFic3RvcHMuZm9yRWFjaChmdW5jdGlvbih0cywgaW5kZXgpIHtcbiAgICAgICAgICAgIHZhciBkZXN0ID0gdGhpcy4kb3BlblRhYnN0b3BzW2luZGV4XSB8fCB0cztcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHRzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIHZhciBwID0gdHNbaV07XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlOiBhbnkgPSBybS5SYW5nZS5mcm9tUG9pbnRzKHAuc3RhcnQsIHAuZW5kIHx8IHAuc3RhcnQpO1xuICAgICAgICAgICAgICAgIG1vdmVQb2ludChyYW5nZS5zdGFydCwgc3RhcnQpO1xuICAgICAgICAgICAgICAgIG1vdmVQb2ludChyYW5nZS5lbmQsIHN0YXJ0KTtcbiAgICAgICAgICAgICAgICByYW5nZS5vcmlnaW5hbCA9IHA7XG4gICAgICAgICAgICAgICAgcmFuZ2UudGFic3RvcCA9IGRlc3Q7XG4gICAgICAgICAgICAgICAgcmFuZ2VzLnB1c2gocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmIChkZXN0ICE9IHRzKVxuICAgICAgICAgICAgICAgICAgICBkZXN0LnVuc2hpZnQocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgZGVzdFtpXSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgIGlmIChwLmZtdFN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5saW5rZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBkZXN0Lmhhc0xpbmtlZFJhbmdlcyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghZGVzdC5maXJzdE5vbkxpbmtlZClcbiAgICAgICAgICAgICAgICAgICAgZGVzdC5maXJzdE5vbkxpbmtlZCA9IHJhbmdlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFkZXN0LmZpcnN0Tm9uTGlua2VkKVxuICAgICAgICAgICAgICAgIGRlc3QuaGFzTGlua2VkUmFuZ2VzID0gZmFsc2U7XG4gICAgICAgICAgICBpZiAoZGVzdCA9PT0gdHMpIHtcbiAgICAgICAgICAgICAgICBhcmcucHVzaChkZXN0KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRvcGVuVGFic3RvcHNbaW5kZXhdID0gZGVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWRkVGFic3RvcE1hcmtlcnMoZGVzdCk7XG4gICAgICAgIH0sIHRoaXMpO1xuXG4gICAgICAgIGlmIChhcmcubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgLy8gd2hlbiBhZGRpbmcgbmV3IHNuaXBwZXQgaW5zaWRlIGV4aXN0aW5nIG9uZSwgbWFrZSBzdXJlIDAgdGFic3RvcCBpcyBhdCB0aGUgZW5kXG4gICAgICAgICAgICBpZiAodGhpcy50YWJzdG9wcy5sZW5ndGgpXG4gICAgICAgICAgICAgICAgYXJnLnB1c2goYXJnLnNwbGljZSgyLCAxKVswXSk7XG4gICAgICAgICAgICB0aGlzLnRhYnN0b3BzLnNwbGljZS5hcHBseSh0aGlzLnRhYnN0b3BzLCBhcmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBhZGRUYWJzdG9wTWFya2VycyA9IGZ1bmN0aW9uKHRzKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5lZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgdHMuZm9yRWFjaChmdW5jdGlvbihyYW5nZS8qOiBybS5SYW5nZSovKSB7XG4gICAgICAgICAgICBpZiAoIXJhbmdlLm1hcmtlcklkKVxuICAgICAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX3NuaXBwZXQtbWFya2VyXCIsIFwidGV4dFwiKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZW1vdmVUYWJzdG9wTWFya2VycyA9IGZ1bmN0aW9uKHRzKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5lZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgdHMuZm9yRWFjaChmdW5jdGlvbihyYW5nZSkge1xuICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIocmFuZ2UubWFya2VySWQpO1xuICAgICAgICAgICAgcmFuZ2UubWFya2VySWQgPSBudWxsO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlbW92ZVJhbmdlID0gZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgdmFyIGkgPSByYW5nZS50YWJzdG9wLmluZGV4T2YocmFuZ2UpO1xuICAgICAgICByYW5nZS50YWJzdG9wLnNwbGljZShpLCAxKTtcbiAgICAgICAgaSA9IHRoaXMucmFuZ2VzLmluZGV4T2YocmFuZ2UpO1xuICAgICAgICB0aGlzLnJhbmdlcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIHRoaXMuZWRpdG9yLnNlc3Npb24ucmVtb3ZlTWFya2VyKHJhbmdlLm1hcmtlcklkKTtcbiAgICAgICAgaWYgKCFyYW5nZS50YWJzdG9wLmxlbmd0aCkge1xuICAgICAgICAgICAgaSA9IHRoaXMudGFic3RvcHMuaW5kZXhPZihyYW5nZS50YWJzdG9wKTtcbiAgICAgICAgICAgIGlmIChpICE9IC0xKVxuICAgICAgICAgICAgICAgIHRoaXMudGFic3RvcHMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgaWYgKCF0aGlzLnRhYnN0b3BzLmxlbmd0aClcbiAgICAgICAgICAgICAgICB0aGlzLmRldGFjaCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5cblxudmFyIGNoYW5nZVRyYWNrZXI6IGFueSA9IHt9O1xuY2hhbmdlVHJhY2tlci5vbkNoYW5nZSA9IGFtLkFuY2hvci5wcm90b3R5cGUub25DaGFuZ2U7XG5jaGFuZ2VUcmFja2VyLnNldFBvc2l0aW9uID0gZnVuY3Rpb24ocm93LCBjb2x1bW4pIHtcbiAgICB0aGlzLnBvcy5yb3cgPSByb3c7XG4gICAgdGhpcy5wb3MuY29sdW1uID0gY29sdW1uO1xufTtcbmNoYW5nZVRyYWNrZXIudXBkYXRlID0gZnVuY3Rpb24ocG9zLCBkZWx0YSwgJGluc2VydFJpZ2h0KSB7XG4gICAgdGhpcy4kaW5zZXJ0UmlnaHQgPSAkaW5zZXJ0UmlnaHQ7XG4gICAgdGhpcy5wb3MgPSBwb3M7XG4gICAgdGhpcy5vbkNoYW5nZShkZWx0YSk7XG59O1xuXG52YXIgbW92ZVBvaW50ID0gZnVuY3Rpb24ocG9pbnQsIGRpZmYpIHtcbiAgICBpZiAocG9pbnQucm93ID09IDApXG4gICAgICAgIHBvaW50LmNvbHVtbiArPSBkaWZmLmNvbHVtbjtcbiAgICBwb2ludC5yb3cgKz0gZGlmZi5yb3c7XG59O1xuXG52YXIgbW92ZVJlbGF0aXZlID0gZnVuY3Rpb24ocG9pbnQsIHN0YXJ0KSB7XG4gICAgaWYgKHBvaW50LnJvdyA9PSBzdGFydC5yb3cpXG4gICAgICAgIHBvaW50LmNvbHVtbiAtPSBzdGFydC5jb2x1bW47XG4gICAgcG9pbnQucm93IC09IHN0YXJ0LnJvdztcbn07XG5cblxuZG9tLmltcG9ydENzc1N0cmluZyhcIlxcXG4uYWNlX3NuaXBwZXQtbWFya2VyIHtcXFxuICAgIC1tb3otYm94LXNpemluZzogYm9yZGVyLWJveDtcXFxuICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxcbiAgICBiYWNrZ3JvdW5kOiByZ2JhKDE5NCwgMTkzLCAyMDgsIDAuMDkpO1xcXG4gICAgYm9yZGVyOiAxcHggZG90dGVkIHJnYmEoMjExLCAyMDgsIDIzNSwgMC42Mik7XFxcbiAgICBwb3NpdGlvbjogYWJzb2x1dGU7XFxcbn1cIik7XG5cbmV4cG9ydCB2YXIgc25pcHBldE1hbmFnZXIgPSBuZXcgU25pcHBldE1hbmFnZXIoKTtcblxuKGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuaW5zZXJ0U25pcHBldCA9IGZ1bmN0aW9uKGNvbnRlbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHNuaXBwZXRNYW5hZ2VyLmluc2VydFNuaXBwZXQodGhpcywgY29udGVudCwgb3B0aW9ucyk7XG4gICAgfTtcbiAgICB0aGlzLmV4cGFuZFNuaXBwZXQgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBzbmlwcGV0TWFuYWdlci5leHBhbmRXaXRoVGFiKHRoaXMsIG9wdGlvbnMpO1xuICAgIH07XG59KS5jYWxsKEVkaXRvci5wcm90b3R5cGUpO1xuIl19