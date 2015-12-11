/*!
 * JSHint, by JSHint Community.
 *
 * This file (and this file only) is licensed under the same slightly modified
 * MIT license that JSLint is. It stops evil-doers everywhere:
 *
 *   Copyright (c) 2002 Douglas Crockford  (www.JSLint.com)
 *
 *   Permission is hereby granted, free of charge, to any person obtaining
 *   a copy of this software and associated documentation files (the "Software"),
 *   to deal in the Software without restriction, including without limitation
 *   the rights to use, copy, modify, merge, publish, distribute, sublicense,
 *   and/or sell copies of the Software, and to permit persons to whom
 *   the Software is furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included
 *   in all copies or substantial portions of the Software.
 *
 *   The Software shall be used for Good, not Evil.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 *   FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 *   DEALINGS IN THE SOFTWARE.
 *
 */
import EventEmitter from "./EventEmitter";
import { browser, browserify, couch, devel, dojo, ecmaIdentifiers, jasmine, jquery, mocha, mootools, node, nonstandard, phantom, prototypejs, qunit, reservedVars, rhino, shelljs, typed, worker, wsh, yui } from "./vars";
import { errors, info, warnings } from "./messages";
import Lexer from "./lex";
import { identifierRegExp, javascriptURL } from "./reg";
import { state } from "./state";
import { register } from "./style";
import { bool, inverted, noenforceall, removed, renamed, validNames } from "./options";
import { scopeManager } from "./scope-manager";
export var JSHINT = (function () {
    "use strict";
    var api, bang = {
        "<": true,
        "<=": true,
        "==": true,
        "===": true,
        "!==": true,
        "!=": true,
        ">": true,
        ">=": true,
        "+": true,
        "-": true,
        "*": true,
        "/": true,
        "%": true
    }, declared, functionicity = [
        "closure", "exception", "global", "label",
        "outer", "unused", "var"
    ], functions, inblock, indent, lookahead, lex, member, membersOnly, predefined, stack, urls, extraModules = [], emitter = new EventEmitter();
    function checkOption(name, t) {
        name = name.trim();
        if (/^[+-]W\d{3}$/g.test(name)) {
            return true;
        }
        if (validNames.indexOf(name) === -1) {
            if (t.type !== "jslint" && !_.has(removed, name)) {
                error("E001", t, name);
                return false;
            }
        }
        return true;
    }
    function isString(obj) {
        return Object.prototype.toString.call(obj) === "[object String]";
    }
    function isIdentifier(tkn, value) {
        if (!tkn)
            return false;
        if (!tkn.identifier || tkn.value !== value)
            return false;
        return true;
    }
    function isReserved(token) {
        if (!token.reserved) {
            return false;
        }
        var meta = token.meta;
        if (meta && meta.isFutureReservedWord && state.inES5()) {
            if (!meta.es5) {
                return false;
            }
            if (meta.strictOnly) {
                if (!state.option.strict && !state.isStrict()) {
                    return false;
                }
            }
            if (token.isProperty) {
                return false;
            }
        }
        return true;
    }
    function supplant(str, data) {
        return str.replace(/\{([^{}]*)\}/g, function (a, b) {
            var r = data[b];
            return typeof r === "string" || typeof r === "number" ? r : a;
        });
    }
    function combine(dest, src) {
        Object.keys(src).forEach(function (name) {
            if (_.has(JSHINT.blacklist, name))
                return;
            dest[name] = src[name];
        });
    }
    function processenforceall() {
        if (state.option.enforceall) {
            for (var enforceopt in bool.enforcing) {
                if (state.option[enforceopt] === void 0 &&
                    !noenforceall[enforceopt]) {
                    state.option[enforceopt] = true;
                }
            }
            for (var relaxopt in bool.relaxing) {
                if (state.option[relaxopt] === void 0) {
                    state.option[relaxopt] = false;
                }
            }
        }
    }
    function assume() {
        processenforceall();
        if (!state.option.esversion && !state.option.moz) {
            if (state.option.es3) {
                state.option.esversion = 3;
            }
            else if (state.option.esnext) {
                state.option.esversion = 6;
            }
            else {
                state.option.esversion = 5;
            }
        }
        if (state.inES5()) {
            combine(predefined, ecmaIdentifiers[5]);
        }
        if (state.inES6()) {
            combine(predefined, ecmaIdentifiers[6]);
        }
        if (state.option.strict === "global" && "globalstrict" in state.option) {
            quit("E059", state.tokens.next, "strict", "globalstrict");
        }
        if (state.option.module) {
            if (state.option.strict === true) {
                state.option.strict = "global";
            }
            if (!state.inES6()) {
                warning("W134", state.tokens.next, "module", 6);
            }
        }
        if (state.option.couch) {
            combine(predefined, couch);
        }
        if (state.option.qunit) {
            combine(predefined, qunit);
        }
        if (state.option.rhino) {
            combine(predefined, rhino);
        }
        if (state.option.shelljs) {
            combine(predefined, shelljs);
            combine(predefined, node);
        }
        if (state.option.typed) {
            combine(predefined, typed);
        }
        if (state.option.phantom) {
            combine(predefined, phantom);
            if (state.option.strict === true) {
                state.option.strict = "global";
            }
        }
        if (state.option.prototypejs) {
            combine(predefined, prototypejs);
        }
        if (state.option.node) {
            combine(predefined, node);
            combine(predefined, typed);
            if (state.option.strict === true) {
                state.option.strict = "global";
            }
        }
        if (state.option.devel) {
            combine(predefined, devel);
        }
        if (state.option.dojo) {
            combine(predefined, dojo);
        }
        if (state.option.browser) {
            combine(predefined, browser);
            combine(predefined, typed);
        }
        if (state.option.browserify) {
            combine(predefined, browser);
            combine(predefined, typed);
            combine(predefined, browserify);
            if (state.option.strict === true) {
                state.option.strict = "global";
            }
        }
        if (state.option.nonstandard) {
            combine(predefined, nonstandard);
        }
        if (state.option.jasmine) {
            combine(predefined, jasmine);
        }
        if (state.option.jquery) {
            combine(predefined, jquery);
        }
        if (state.option.mootools) {
            combine(predefined, mootools);
        }
        if (state.option.worker) {
            combine(predefined, worker);
        }
        if (state.option.wsh) {
            combine(predefined, wsh);
        }
        if (state.option.globalstrict && state.option.strict !== false) {
            state.option.strict = "global";
        }
        if (state.option.yui) {
            combine(predefined, yui);
        }
        if (state.option.mocha) {
            combine(predefined, mocha);
        }
    }
    function quit(code, token, a, b) {
        var percentage = Math.floor((token.line / state.lines.length) * 100);
        var message = errors[code].desc;
        var exception = {
            name: "JSHintError",
            line: token.line,
            character: token.from,
            message: message + " (" + percentage + "% scanned).",
            raw: message,
            code: code,
            a: a,
            b: b,
            reason: void 0
        };
        exception.reason = supplant(message, exception) + " (" + percentage +
            "% scanned).";
        throw exception;
    }
    function removeIgnoredMessages() {
        var ignored = state.ignoredLines;
        if (_.isEmpty(ignored))
            return;
        JSHINT.errors = _.reject(JSHINT.errors, function (err) { return ignored[err.line]; });
    }
    function warning(code, t, a, b, c, d) {
        var ch, l, w, msg;
        if (/^W\d{3}$/.test(code)) {
            if (state.ignored[code])
                return;
            msg = warnings[code];
        }
        else if (/E\d{3}/.test(code)) {
            msg = errors[code];
        }
        else if (/I\d{3}/.test(code)) {
            msg = info[code];
        }
        t = t || state.tokens.next || {};
        if (t.id === "(end)") {
            t = state.tokens.curr;
        }
        l = t.line;
        ch = t.from;
        w = {
            id: "(error)",
            raw: msg.desc,
            code: msg.code,
            evidence: state.lines[l - 1] || "",
            line: l,
            character: ch,
            scope: JSHINT.scope,
            a: a,
            b: b,
            c: c,
            d: d
        };
        w.reason = supplant(msg.desc, w);
        JSHINT.errors.push(w);
        removeIgnoredMessages();
        if (JSHINT.errors.length >= state.option.maxerr)
            quit("E043", t);
        return w;
    }
    function warningAt(m, l, ch, a, b, c, d) {
        return warning(m, {
            line: l,
            from: ch
        }, a, b, c, d);
    }
    function error(m, t, a, b, c, d) {
        warning(m, t, a, b, c, d);
    }
    function errorAt(m, l, ch, a, b, c, d) {
        return error(m, {
            line: l,
            from: ch
        }, a, b, c, d);
    }
    function addInternalSrc(elem, src) {
        var i;
        i = {
            id: "(internal)",
            elem: elem,
            value: src
        };
        JSHINT.internals.push(i);
        return i;
    }
    function doOption() {
        var nt = state.tokens.next;
        var body = nt.body.split(",").map(function (s) { return s.trim(); });
        var predef = {};
        if (nt.type === "globals") {
            body.forEach(function (g, idx) {
                g = g.split(":");
                var key = (g[0] || "").trim();
                var val = (g[1] || "").trim();
                if (key === "-" || !key.length) {
                    if (idx > 0 && idx === body.length - 1) {
                        return;
                    }
                    error("E002", nt);
                    return;
                }
                if (key.charAt(0) === "-") {
                    key = key.slice(1);
                    val = false;
                    JSHINT.blacklist[key] = key;
                    delete predefined[key];
                }
                else {
                    predef[key] = (val === "true");
                }
            });
            combine(predefined, predef);
            for (var key in predef) {
                if (_.has(predef, key)) {
                    declared[key] = nt;
                }
            }
        }
        if (nt.type === "exported") {
            body.forEach(function (e, idx) {
                if (!e.length) {
                    if (idx > 0 && idx === body.length - 1) {
                        return;
                    }
                    error("E002", nt);
                    return;
                }
                state.funct["(scope)"].addExported(e);
            });
        }
        if (nt.type === "members") {
            membersOnly = membersOnly || {};
            body.forEach(function (m) {
                var ch1 = m.charAt(0);
                var ch2 = m.charAt(m.length - 1);
                if (ch1 === ch2 && (ch1 === "\"" || ch1 === "'")) {
                    m = m
                        .substr(1, m.length - 2)
                        .replace("\\\"", "\"");
                }
                membersOnly[m] = false;
            });
        }
        var numvals = [
            "maxstatements",
            "maxparams",
            "maxdepth",
            "maxcomplexity",
            "maxerr",
            "maxlen",
            "indent"
        ];
        if (nt.type === "jshint" || nt.type === "jslint") {
            body.forEach(function (g) {
                g = g.split(":");
                var key = (g[0] || "").trim();
                var val = (g[1] || "").trim();
                if (!checkOption(key, nt)) {
                    return;
                }
                if (numvals.indexOf(key) >= 0) {
                    if (val !== "false") {
                        val = +val;
                        if (typeof val !== "number" || !isFinite(val) || val <= 0 || Math.floor(val) !== val) {
                            error("E032", nt, g[1].trim());
                            return;
                        }
                        state.option[key] = val;
                    }
                    else {
                        state.option[key] = key === "indent" ? 4 : false;
                    }
                    return;
                }
                if (key === "es5") {
                    if (val === "true" && state.option.es5) {
                        warning("I003");
                    }
                }
                if (key === "validthis") {
                    if (state.funct["(global)"])
                        return void error("E009");
                    if (val !== "true" && val !== "false")
                        return void error("E002", nt);
                    state.option.validthis = (val === "true");
                    return;
                }
                if (key === "quotmark") {
                    switch (val) {
                        case "true":
                        case "false":
                            state.option.quotmark = (val === "true");
                            break;
                        case "double":
                        case "single":
                            state.option.quotmark = val;
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "shadow") {
                    switch (val) {
                        case "true":
                            state.option.shadow = true;
                            break;
                        case "outer":
                            state.option.shadow = "outer";
                            break;
                        case "false":
                        case "inner":
                            state.option.shadow = "inner";
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "unused") {
                    switch (val) {
                        case "true":
                            state.option.unused = true;
                            break;
                        case "false":
                            state.option.unused = false;
                            break;
                        case "vars":
                        case "strict":
                            state.option.unused = val;
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "latedef") {
                    switch (val) {
                        case "true":
                            state.option.latedef = true;
                            break;
                        case "false":
                            state.option.latedef = false;
                            break;
                        case "nofunc":
                            state.option.latedef = "nofunc";
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "ignore") {
                    switch (val) {
                        case "line":
                            state.ignoredLines[nt.line] = true;
                            removeIgnoredMessages();
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "strict") {
                    switch (val) {
                        case "true":
                            state.option.strict = true;
                            break;
                        case "false":
                            state.option.strict = false;
                            break;
                        case "func":
                        case "global":
                        case "implied":
                            state.option.strict = val;
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "module") {
                    if (!hasParsedCode(state.funct)) {
                        error("E055", state.tokens.next, "module");
                    }
                }
                var esversions = {
                    es3: 3,
                    es5: 5,
                    esnext: 6
                };
                if (_.has(esversions, key)) {
                    switch (val) {
                        case "true":
                            state.option.moz = false;
                            state.option.esversion = esversions[key];
                            break;
                        case "false":
                            if (!state.option.moz) {
                                state.option.esversion = 5;
                            }
                            break;
                        default:
                            error("E002", nt);
                    }
                    return;
                }
                if (key === "esversion") {
                    switch (val) {
                        case "5":
                            if (state.inES5(true)) {
                                warning("I003");
                            }
                        case "3":
                        case "6":
                            state.option.moz = false;
                            state.option.esversion = +val;
                            break;
                        case "2015":
                            state.option.moz = false;
                            state.option.esversion = 6;
                            break;
                        default:
                            error("E002", nt);
                    }
                    if (!hasParsedCode(state.funct)) {
                        error("E055", state.tokens.next, "esversion");
                    }
                    return;
                }
                var match = /^([+-])(W\d{3})$/g.exec(key);
                if (match) {
                    state.ignored[match[2]] = (match[1] === "-");
                    return;
                }
                var tn;
                if (val === "true" || val === "false") {
                    if (nt.type === "jslint") {
                        tn = renamed[key] || key;
                        state.option[tn] = (val === "true");
                        if (inverted[tn] !== void 0) {
                            state.option[tn] = !state.option[tn];
                        }
                    }
                    else {
                        state.option[key] = (val === "true");
                    }
                    return;
                }
                error("E002", nt);
            });
            assume();
        }
    }
    function peek(p) {
        var i = p || 0, j = lookahead.length, t;
        if (i < j) {
            return lookahead[i];
        }
        while (j <= i) {
            t = lookahead[j];
            if (!t) {
                t = lookahead[j] = lex.token();
            }
            j += 1;
        }
        if (!t && state.tokens.next.id === "(end)") {
            return state.tokens.next;
        }
        return t;
    }
    function peekIgnoreEOL() {
        var i = 0;
        var t;
        do {
            t = peek(i++);
        } while (t.id === "(endline)");
        return t;
    }
    function advance(id, t) {
        switch (state.tokens.curr.id) {
            case "(number)":
                if (state.tokens.next.id === ".") {
                    warning("W005", state.tokens.curr);
                }
                break;
            case "-":
                if (state.tokens.next.id === "-" || state.tokens.next.id === "--") {
                    warning("W006");
                }
                break;
            case "+":
                if (state.tokens.next.id === "+" || state.tokens.next.id === "++") {
                    warning("W007");
                }
                break;
        }
        if (id && state.tokens.next.id !== id) {
            if (t) {
                if (state.tokens.next.id === "(end)") {
                    error("E019", t, t.id);
                }
                else {
                    error("E020", state.tokens.next, id, t.id, t.line, state.tokens.next.value);
                }
            }
            else if (state.tokens.next.type !== "(identifier)" || state.tokens.next.value !== id) {
                warning("W116", state.tokens.next, id, state.tokens.next.value);
            }
        }
        state.tokens.prev = state.tokens.curr;
        state.tokens.curr = state.tokens.next;
        for (;;) {
            state.tokens.next = lookahead.shift() || lex.token();
            if (!state.tokens.next) {
                quit("E041", state.tokens.curr);
            }
            if (state.tokens.next.id === "(end)" || state.tokens.next.id === "(error)") {
                return;
            }
            if (state.tokens.next.check) {
                state.tokens.next.check();
            }
            if (state.tokens.next.isSpecial) {
                if (state.tokens.next.type === "falls through") {
                    state.tokens.curr.caseFallsThrough = true;
                }
                else {
                    doOption();
                }
            }
            else {
                if (state.tokens.next.id !== "(endline)") {
                    break;
                }
            }
        }
    }
    function isInfix(token) {
        return token.infix || (!token.identifier && !token.template && !!token.led);
    }
    function isEndOfExpr() {
        var curr = state.tokens.curr;
        var next = state.tokens.next;
        if (next.id === ";" || next.id === "}" || next.id === ":") {
            return true;
        }
        if (isInfix(next) === isInfix(curr) || (curr.id === "yield" && state.inMoz())) {
            return curr.line !== startLine(next);
        }
        return false;
    }
    function isBeginOfExpr(prev) {
        return !prev.left && prev.arity !== "unary";
    }
    function expression(rbp, initial) {
        var left, isArray = false, isObject = false, isLetExpr = false;
        state.nameStack.push();
        if (!initial && state.tokens.next.value === "let" && peek(0).value === "(") {
            if (!state.inMoz()) {
                warning("W118", state.tokens.next, "let expressions");
            }
            isLetExpr = true;
            state.funct["(scope)"].stack();
            advance("let");
            advance("(");
            state.tokens.prev.fud();
            advance(")");
        }
        if (state.tokens.next.id === "(end)")
            error("E006", state.tokens.curr);
        var isDangerous = state.option.asi &&
            state.tokens.prev.line !== startLine(state.tokens.curr) &&
            _.contains(["]", ")"], state.tokens.prev.id) &&
            _.contains(["[", "("], state.tokens.curr.id);
        if (isDangerous)
            warning("W014", state.tokens.curr, state.tokens.curr.id);
        advance();
        if (initial) {
            state.funct["(verb)"] = state.tokens.curr.value;
            state.tokens.curr.beginsStmt = true;
        }
        if (initial === true && state.tokens.curr.fud) {
            left = state.tokens.curr.fud();
        }
        else {
            if (state.tokens.curr.nud) {
                left = state.tokens.curr.nud();
            }
            else {
                error("E030", state.tokens.curr, state.tokens.curr.id);
            }
            while ((rbp < state.tokens.next.lbp || state.tokens.next.type === "(template)") &&
                !isEndOfExpr()) {
                isArray = state.tokens.curr.value === "Array";
                isObject = state.tokens.curr.value === "Object";
                if (left && (left.value || (left.first && left.first.value))) {
                    if (left.value !== "new" ||
                        (left.first && left.first.value && left.first.value === ".")) {
                        isArray = false;
                        if (left.value !== state.tokens.curr.value) {
                            isObject = false;
                        }
                    }
                }
                advance();
                if (isArray && state.tokens.curr.id === "(" && state.tokens.next.id === ")") {
                    warning("W009", state.tokens.curr);
                }
                if (isObject && state.tokens.curr.id === "(" && state.tokens.next.id === ")") {
                    warning("W010", state.tokens.curr);
                }
                if (left && state.tokens.curr.led) {
                    left = state.tokens.curr.led(left);
                }
                else {
                    error("E033", state.tokens.curr, state.tokens.curr.id);
                }
            }
        }
        if (isLetExpr) {
            state.funct["(scope)"].unstack();
        }
        state.nameStack.pop();
        return left;
    }
    function startLine(token) {
        return token.startLine || token.line;
    }
    function nobreaknonadjacent(left, right) {
        left = left || state.tokens.curr;
        right = right || state.tokens.next;
        if (!state.option.laxbreak && left.line !== startLine(right)) {
            warning("W014", right, right.value);
        }
    }
    function nolinebreak(t) {
        t = t || state.tokens.curr;
        if (t.line !== startLine(state.tokens.next)) {
            warning("E022", t, t.value);
        }
    }
    function nobreakcomma(left, right) {
        if (left.line !== startLine(right)) {
            if (!state.option.laxcomma) {
                if (comma['first']) {
                    warning("I001");
                    comma['first'] = false;
                }
                warning("W014", left, right.value);
            }
        }
    }
    function comma(opts) {
        opts = opts || {};
        if (!opts.peek) {
            nobreakcomma(state.tokens.curr, state.tokens.next);
            advance(",");
        }
        else {
            nobreakcomma(state.tokens.prev, state.tokens.curr);
        }
        if (state.tokens.next.identifier && !(opts.property && state.inES5())) {
            switch (state.tokens.next.value) {
                case "break":
                case "case":
                case "catch":
                case "continue":
                case "default":
                case "do":
                case "else":
                case "finally":
                case "for":
                case "if":
                case "in":
                case "instanceof":
                case "return":
                case "switch":
                case "throw":
                case "try":
                case "var":
                case "let":
                case "while":
                case "with":
                    error("E024", state.tokens.next, state.tokens.next.value);
                    return false;
            }
        }
        if (state.tokens.next.type === "(punctuator)") {
            switch (state.tokens.next.value) {
                case "}":
                case "]":
                case ",":
                    if (opts.allowTrailing) {
                        return true;
                    }
                case ")":
                    error("E024", state.tokens.next, state.tokens.next.value);
                    return false;
            }
        }
        return true;
    }
    function symbol(s, p) {
        var x = state.syntax[s];
        if (!x || typeof x !== "object") {
            state.syntax[s] = x = {
                id: s,
                lbp: p,
                value: s
            };
        }
        return x;
    }
    function delim(s) {
        var x = symbol(s, 0);
        x.delim = true;
        return x;
    }
    function stmt(s, f) {
        var x = delim(s);
        x.identifier = x.reserved = true;
        x.fud = f;
        return x;
    }
    function blockstmt(s, f) {
        var x = stmt(s, f);
        x.block = true;
        return x;
    }
    function reserveName(x) {
        var c = x.id.charAt(0);
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
            x.identifier = x.reserved = true;
        }
        return x;
    }
    function prefix(s, f) {
        var x = symbol(s, 150);
        reserveName(x);
        x.nud = (typeof f === "function") ? f : function () {
            this.arity = "unary";
            this.right = expression(150);
            if (this.id === "++" || this.id === "--") {
                if (state.option.plusplus) {
                    warning("W016", this, this.id);
                }
                else if (this.right && (!this.right.identifier || isReserved(this.right)) &&
                    this.right.id !== "." && this.right.id !== "[") {
                    warning("W017", this);
                }
                if (this.right && this.right.isMetaProperty) {
                    error("E031", this);
                }
                else if (this.right && this.right.identifier) {
                    state.funct["(scope)"].block.modify(this.right.value, this);
                }
            }
            return this;
        };
        return x;
    }
    function type(s, func) {
        var x = delim(s);
        x.type = s;
        x.nud = func;
        return x;
    }
    function reserve(name, func) {
        var x = type(name, func);
        x.identifier = true;
        x.reserved = true;
        return x;
    }
    function FutureReservedWord(name, meta) {
        var x = type(name, (meta && meta.nud) || function () {
            return this;
        });
        meta = meta || {};
        meta.isFutureReservedWord = true;
        x.value = name;
        x.identifier = true;
        x.reserved = true;
        x.meta = meta;
        return x;
    }
    function reservevar(s, v) {
        return reserve(s, function () {
            if (typeof v === "function") {
                v(this);
            }
            return this;
        });
    }
    function infix(s, f, p, w) {
        var x = symbol(s, p);
        reserveName(x);
        x.infix = true;
        x.led = function (left) {
            if (!w) {
                nobreaknonadjacent(state.tokens.prev, state.tokens.curr);
            }
            if ((s === "in" || s === "instanceof") && left.id === "!") {
                warning("W018", left, "!");
            }
            if (typeof f === "function") {
                return f(left, this);
            }
            else {
                this.left = left;
                this.right = expression(p);
                return this;
            }
        };
        return x;
    }
    function application(s) {
        var x = symbol(s, 42);
        x.led = function (left) {
            nobreaknonadjacent(state.tokens.prev, state.tokens.curr);
            this.left = left;
            this.right = doFunction({ type: "arrow", loneArg: left });
            return this;
        };
        return x;
    }
    function relation(s, f) {
        var x = symbol(s, 100);
        x.led = function (left) {
            nobreaknonadjacent(state.tokens.prev, state.tokens.curr);
            this.left = left;
            var right = this.right = expression(100);
            if (isIdentifier(left, "NaN") || isIdentifier(right, "NaN")) {
                warning("W019", this);
            }
            else if (f) {
                f.apply(this, [left, right]);
            }
            if (!left || !right) {
                quit("E041", state.tokens.curr);
            }
            if (left.id === "!") {
                warning("W018", left, "!");
            }
            if (right.id === "!") {
                warning("W018", right, "!");
            }
            return this;
        };
        return x;
    }
    function isPoorRelation(node) {
        return node &&
            ((node.type === "(number)" && +node.value === 0) ||
                (node.type === "(string)" && node.value === "") ||
                (node.type === "null" && !state.option.eqnull) ||
                node.type === "true" ||
                node.type === "false" ||
                node.type === "undefined");
    }
    var typeofValues = {};
    typeofValues.legacy = [
        "xml",
        "unknown"
    ];
    typeofValues.es3 = [
        "undefined", "boolean", "number", "string", "function", "object",
    ];
    typeofValues.es3 = typeofValues.es3.concat(typeofValues.legacy);
    typeofValues.es6 = typeofValues.es3.concat("symbol");
    function isTypoTypeof(left, right, state) {
        var values;
        if (state.option.notypeof)
            return false;
        if (!left || !right)
            return false;
        values = state.inES6() ? typeofValues.es6 : typeofValues.es3;
        if (right.type === "(identifier)" && right.value === "typeof" && left.type === "(string)")
            return !_.contains(values, left.value);
        return false;
    }
    function isGlobalEval(left, state) {
        var isGlobal = false;
        if (left.type === "this" && state.funct["(context)"] === null) {
            isGlobal = true;
        }
        else if (left.type === "(identifier)") {
            if (state.option.node && left.value === "global") {
                isGlobal = true;
            }
            else if (state.option.browser && (left.value === "window" || left.value === "document")) {
                isGlobal = true;
            }
        }
        return isGlobal;
    }
    function findNativePrototype(left) {
        var natives = [
            "Array", "ArrayBuffer", "Boolean", "Collator", "DataView", "Date",
            "DateTimeFormat", "Error", "EvalError", "Float32Array", "Float64Array",
            "Function", "Infinity", "Intl", "Int16Array", "Int32Array", "Int8Array",
            "Iterator", "Number", "NumberFormat", "Object", "RangeError",
            "ReferenceError", "RegExp", "StopIteration", "String", "SyntaxError",
            "TypeError", "Uint16Array", "Uint32Array", "Uint8Array", "Uint8ClampedArray",
            "URIError"
        ];
        function walkPrototype(obj) {
            if (typeof obj !== "object")
                return;
            return obj.right === "prototype" ? obj : walkPrototype(obj.left);
        }
        function walkNative(obj) {
            while (!obj.identifier && typeof obj.left === "object")
                obj = obj.left;
            if (obj.identifier && natives.indexOf(obj.value) >= 0)
                return obj.value;
        }
        var prototype = walkPrototype(left);
        if (prototype)
            return walkNative(prototype);
    }
    function checkLeftSideAssign(left, assignToken, options) {
        var allowDestructuring = options && options.allowDestructuring;
        assignToken = assignToken || left;
        if (state.option.freeze) {
            var nativeObject = findNativePrototype(left);
            if (nativeObject)
                warning("W121", left, nativeObject);
        }
        if (left.identifier && !left.isMetaProperty) {
            state.funct["(scope)"].block.reassign(left.value, left);
        }
        if (left.id === ".") {
            if (!left.left || left.left.value === "arguments" && !state.isStrict()) {
                warning("E031", assignToken);
            }
            state.nameStack.set(state.tokens.prev);
            return true;
        }
        else if (left.id === "{" || left.id === "[") {
            if (allowDestructuring && state.tokens.curr.left.destructAssign) {
                state.tokens.curr.left.destructAssign.forEach(function (t) {
                    if (t.id) {
                        state.funct["(scope)"].block.modify(t.id, t.token);
                    }
                });
            }
            else {
                if (left.id === "{" || !left.left) {
                    warning("E031", assignToken);
                }
                else if (left.left.value === "arguments" && !state.isStrict()) {
                    warning("E031", assignToken);
                }
            }
            if (left.id === "[") {
                state.nameStack.set(left.right);
            }
            return true;
        }
        else if (left.isMetaProperty) {
            error("E031", assignToken);
            return true;
        }
        else if (left.identifier && !isReserved(left)) {
            if (state.funct["(scope)"].labeltype(left.value) === "exception") {
                warning("W022", left);
            }
            state.nameStack.set(left);
            return true;
        }
        if (left === state.syntax["function"]) {
            warning("W023", state.tokens.curr);
        }
        return false;
    }
    function assignop(s, f, p) {
        var x = infix(s, typeof f === "function" ? f : function (left, that) {
            that.left = left;
            if (left && checkLeftSideAssign(left, that, { allowDestructuring: true })) {
                that.right = expression(10);
                return that;
            }
            error("E031", that);
        }, p);
        x.exps = true;
        x.assign = true;
        return x;
    }
    function bitwise(s, f, p) {
        var x = symbol(s, p);
        reserveName(x);
        x.led = (typeof f === "function") ? f : function (left) {
            if (state.option.bitwise) {
                warning("W016", this, this.id);
            }
            this.left = left;
            this.right = expression(p);
            return this;
        };
        return x;
    }
    function bitwiseassignop(s) {
        return assignop(s, function (left, that) {
            if (state.option.bitwise) {
                warning("W016", that, that.id);
            }
            if (left && checkLeftSideAssign(left, that)) {
                that.right = expression(10);
                return that;
            }
            error("E031", that);
        }, 20);
    }
    function suffix(s) {
        var x = symbol(s, 150);
        x.led = function (left) {
            if (state.option.plusplus) {
                warning("W016", this, this.id);
            }
            else if ((!left.identifier || isReserved(left)) && left.id !== "." && left.id !== "[") {
                warning("W017", this);
            }
            if (left.isMetaProperty) {
                error("E031", this);
            }
            else if (left && left.identifier) {
                state.funct["(scope)"].block.modify(left.value, left);
            }
            this.left = left;
            return this;
        };
        return x;
    }
    function optionalidentifier(fnparam, prop, preserve) {
        if (!state.tokens.next.identifier) {
            return;
        }
        if (!preserve) {
            advance();
        }
        var curr = state.tokens.curr;
        var val = state.tokens.curr.value;
        if (!isReserved(curr)) {
            return val;
        }
        if (prop) {
            if (state.inES5()) {
                return val;
            }
        }
        if (fnparam && val === "undefined") {
            return val;
        }
        warning("W024", state.tokens.curr, state.tokens.curr.id);
        return val;
    }
    function identifier(fnparam, prop) {
        var i = optionalidentifier(fnparam, prop, false);
        if (i) {
            return i;
        }
        if (state.tokens.next.value === "...") {
            if (!state.inES6(true)) {
                warning("W119", state.tokens.next, "spread/rest operator", "6");
            }
            advance();
            if (checkPunctuator(state.tokens.next, "...")) {
                warning("E024", state.tokens.next, "...");
                while (checkPunctuator(state.tokens.next, "...")) {
                    advance();
                }
            }
            if (!state.tokens.next.identifier) {
                warning("E024", state.tokens.curr, "...");
                return;
            }
            return identifier(fnparam, prop);
        }
        else {
            error("E030", state.tokens.next, state.tokens.next.value);
            if (state.tokens.next.id !== ";") {
                advance();
            }
        }
    }
    function reachable(controlToken) {
        var i = 0, t;
        if (state.tokens.next.id !== ";" || controlToken.inBracelessBlock) {
            return;
        }
        for (;;) {
            do {
                t = peek(i);
                i += 1;
            } while (t.id !== "(end)" && t.id === "(comment)");
            if (t.reach) {
                return;
            }
            if (t.id !== "(endline)") {
                if (t.id === "function") {
                    if (state.option.latedef === true) {
                        warning("W026", t);
                    }
                    break;
                }
                warning("W027", t, t.value, controlToken.value);
                break;
            }
        }
    }
    function parseFinalSemicolon() {
        if (state.tokens.next.id !== ";") {
            if (state.tokens.next.isUnclosed)
                return advance();
            var sameLine = startLine(state.tokens.next) === state.tokens.curr.line &&
                state.tokens.next.id !== "(end)";
            var blockEnd = checkPunctuator(state.tokens.next, "}");
            if (sameLine && !blockEnd) {
                errorAt("E058", state.tokens.curr.line, state.tokens.curr.character);
            }
            else if (!state.option.asi) {
                if ((blockEnd && !state.option.lastsemic) || !sameLine) {
                    warningAt("W033", state.tokens.curr.line, state.tokens.curr.character);
                }
            }
        }
        else {
            advance(";");
        }
    }
    function statement() {
        var i = indent, r, t = state.tokens.next, hasOwnScope = false;
        if (t.id === ";") {
            advance(";");
            return;
        }
        var res = isReserved(t);
        if (res && t.meta && t.meta.isFutureReservedWord && peek().id === ":") {
            warning("W024", t, t.id);
            res = false;
        }
        if (t.identifier && !res && peek().id === ":") {
            advance();
            advance(":");
            hasOwnScope = true;
            state.funct["(scope)"].stack();
            state.funct["(scope)"].block.addBreakLabel(t.value, { token: state.tokens.curr });
            if (!state.tokens.next.labelled && state.tokens.next.value !== "{") {
                warning("W028", state.tokens.next, t.value, state.tokens.next.value);
            }
            state.tokens.next.label = t.value;
            t = state.tokens.next;
        }
        if (t.id === "{") {
            var iscase = (state.funct["(verb)"] === "case" && state.tokens.curr.value === ":");
            block(true, true, false, false, iscase);
            return;
        }
        r = expression(0, true);
        if (r && !(r.identifier && r.value === "function") &&
            !(r.type === "(punctuator)" && r.left &&
                r.left.identifier && r.left.value === "function")) {
            if (!state.isStrict() &&
                state.option.strict === "global") {
                warning("E007");
            }
        }
        if (!t.block) {
            if (!state.option.expr && (!r || !r.exps)) {
                warning("W030", state.tokens.curr);
            }
            else if (state.option.nonew && r && r.left && r.id === "(" && r.left.id === "new") {
                warning("W031", t);
            }
            parseFinalSemicolon();
        }
        indent = i;
        if (hasOwnScope) {
            state.funct["(scope)"].unstack();
        }
        return r;
    }
    function statements() {
        var a = [], p;
        while (!state.tokens.next.reach && state.tokens.next.id !== "(end)") {
            if (state.tokens.next.id === ";") {
                p = peek();
                if (!p || (p.id !== "(" && p.id !== "[")) {
                    warning("W032");
                }
                advance(";");
            }
            else {
                a.push(statement());
            }
        }
        return a;
    }
    function directives() {
        var i, p, pn;
        while (state.tokens.next.id === "(string)") {
            p = peek(0);
            if (p.id === "(endline)") {
                i = 1;
                do {
                    pn = peek(i++);
                } while (pn.id === "(endline)");
                if (pn.id === ";") {
                    p = pn;
                }
                else if (pn.value === "[" || pn.value === ".") {
                    break;
                }
                else if (!state.option.asi || pn.value === "(") {
                    warning("W033", state.tokens.next);
                }
            }
            else if (p.id === "." || p.id === "[") {
                break;
            }
            else if (p.id !== ";") {
                warning("W033", p);
            }
            advance();
            var directive = state.tokens.curr.value;
            if (state.directive[directive] ||
                (directive === "use strict" && state.option.strict === "implied")) {
                warning("W034", state.tokens.curr, directive);
            }
            state.directive[directive] = true;
            if (p.id === ";") {
                advance(";");
            }
        }
        if (state.isStrict()) {
            state.option.undef = true;
        }
    }
    function block(ordinary, stmt, isfunc, isfatarrow, iscase) {
        var a, b = inblock, old_indent = indent, m, t, line, d;
        inblock = ordinary;
        t = state.tokens.next;
        var metrics = state.funct["(metrics)"];
        metrics.nestedBlockDepth += 1;
        metrics.verifyMaxNestedBlockDepthPerFunction();
        if (state.tokens.next.id === "{") {
            advance("{");
            state.funct["(scope)"].stack();
            state.funct["(noblockscopedvar)"] = false;
            line = state.tokens.curr.line;
            if (state.tokens.next.id !== "}") {
                indent += state.option.indent;
                while (!ordinary && state.tokens.next.from > indent) {
                    indent += state.option.indent;
                }
                if (isfunc) {
                    m = {};
                    for (d in state.directive) {
                        if (_.has(state.directive, d)) {
                            m[d] = state.directive[d];
                        }
                    }
                    directives();
                    if (state.option.strict && state.funct["(context)"]["(global)"]) {
                        if (!m["use strict"] && !state.isStrict()) {
                            warning("E007");
                        }
                    }
                }
                a = statements();
                metrics.statementCount += a.length;
                indent -= state.option.indent;
            }
            advance("}", t);
            if (isfunc) {
                state.funct["(scope)"].validateParams();
                if (m) {
                    state.directive = m;
                }
            }
            state.funct["(scope)"].unstack();
            indent = old_indent;
        }
        else if (!ordinary) {
            if (isfunc) {
                state.funct["(scope)"].stack();
                m = {};
                if (stmt && !isfatarrow && !state.inMoz()) {
                    error("W118", state.tokens.curr, "function closure expressions");
                }
                if (!stmt) {
                    for (d in state.directive) {
                        if (_.has(state.directive, d)) {
                            m[d] = state.directive[d];
                        }
                    }
                }
                expression(10);
                if (state.option.strict && state.funct["(context)"]["(global)"]) {
                    if (!m["use strict"] && !state.isStrict()) {
                        warning("E007");
                    }
                }
                state.funct["(scope)"].unstack();
            }
            else {
                error("E021", state.tokens.next, "{", state.tokens.next.value);
            }
        }
        else {
            state.funct["(noblockscopedvar)"] = state.tokens.next.id !== "for";
            state.funct["(scope)"].stack();
            if (!stmt || state.option.curly) {
                warning("W116", state.tokens.next, "{", state.tokens.next.value);
            }
            state.tokens.next.inBracelessBlock = true;
            indent += state.option.indent;
            a = [statement()];
            indent -= state.option.indent;
            state.funct["(scope)"].unstack();
            delete state.funct["(noblockscopedvar)"];
        }
        switch (state.funct["(verb)"]) {
            case "break":
            case "continue":
            case "return":
            case "throw":
                if (iscase) {
                    break;
                }
            default:
                state.funct["(verb)"] = null;
        }
        inblock = b;
        if (ordinary && state.option.noempty && (!a || a.length === 0)) {
            warning("W035", state.tokens.prev);
        }
        metrics.nestedBlockDepth -= 1;
        return a;
    }
    function countMember(m) {
        if (membersOnly && typeof membersOnly[m] !== "boolean") {
            warning("W036", state.tokens.curr, m);
        }
        if (typeof member[m] === "number") {
            member[m] += 1;
        }
        else {
            member[m] = 1;
        }
    }
    type("(number)", function () {
        return this;
    });
    type("(string)", function () {
        return this;
    });
    state.syntax["(identifier)"] = {
        type: "(identifier)",
        lbp: 0,
        identifier: true,
        nud: function () {
            var v = this.value;
            if (state.tokens.next.id === "=>") {
                return this;
            }
            if (!state.funct["(comparray)"].check(v)) {
                state.funct["(scope)"].block.use(v, state.tokens.curr);
            }
            return this;
        },
        led: function () {
            error("E033", state.tokens.next, state.tokens.next.value);
        }
    };
    var baseTemplateSyntax = {
        lbp: 0,
        identifier: false,
        template: true,
    };
    state.syntax["(template)"] = _.extend({
        type: "(template)",
        nud: doTemplateLiteral,
        led: doTemplateLiteral,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(template middle)"] = _.extend({
        type: "(template middle)",
        middle: true,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(template tail)"] = _.extend({
        type: "(template tail)",
        tail: true,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(no subst template)"] = _.extend({
        type: "(template)",
        nud: doTemplateLiteral,
        led: doTemplateLiteral,
        noSubst: true,
        tail: true
    }, baseTemplateSyntax);
    type("(regexp)", function () {
        return this;
    });
    delim("(endline)");
    (function (x) {
        x.line = x.from = 0;
    })(delim("(begin)"));
    delim("(end)").reach = true;
    delim("(error)").reach = true;
    delim("}").reach = true;
    delim(")");
    delim("]");
    delim("\"").reach = true;
    delim("'").reach = true;
    delim(";");
    delim(":").reach = true;
    delim("#");
    reserve("else");
    reserve("case").reach = true;
    reserve("catch");
    reserve("default").reach = true;
    reserve("finally");
    reservevar("arguments", function (x) {
        if (state.isStrict() && state.funct["(global)"]) {
            warning("E008", x);
        }
    });
    reservevar("eval");
    reservevar("false");
    reservevar("Infinity");
    reservevar("null");
    reservevar("this", function (x) {
        if (state.isStrict() && !isMethod() &&
            !state.option.validthis && ((state.funct["(statement)"] &&
            state.funct["(name)"].charAt(0) > "Z") || state.funct["(global)"])) {
            warning("W040", x);
        }
    });
    reservevar("true");
    reservevar("undefined");
    assignop("=", "assign", 20);
    assignop("+=", "assignadd", 20);
    assignop("-=", "assignsub", 20);
    assignop("*=", "assignmult", 20);
    assignop("/=", "assigndiv", 20).nud = function () {
        error("E014");
    };
    assignop("%=", "assignmod", 20);
    bitwiseassignop("&=");
    bitwiseassignop("|=");
    bitwiseassignop("^=");
    bitwiseassignop("<<=");
    bitwiseassignop(">>=");
    bitwiseassignop(">>>=");
    infix(",", function (left, that) {
        var expr;
        that.exprs = [left];
        if (state.option.nocomma) {
            warning("W127");
        }
        if (!comma({ peek: true })) {
            return that;
        }
        while (true) {
            if (!(expr = expression(10))) {
                break;
            }
            that.exprs.push(expr);
            if (state.tokens.next.value !== "," || !comma()) {
                break;
            }
        }
        return that;
    }, 10, true);
    infix("?", function (left, that) {
        increaseComplexityCount();
        that.left = left;
        that.right = expression(10);
        advance(":");
        that["else"] = expression(10);
        return that;
    }, 30);
    var orPrecendence = 40;
    infix("||", function (left, that) {
        increaseComplexityCount();
        that.left = left;
        that.right = expression(orPrecendence);
        return that;
    }, orPrecendence);
    infix("&&", "and", 50);
    bitwise("|", "bitor", 70);
    bitwise("^", "bitxor", 80);
    bitwise("&", "bitand", 90);
    relation("==", function (left, right) {
        var eqnull = state.option.eqnull &&
            ((left && left.value) === "null" || (right && right.value) === "null");
        switch (true) {
            case !eqnull && state.option.eqeqeq:
                this.from = this.character;
                warning("W116", this, "===", "==");
                break;
            case isPoorRelation(left):
                warning("W041", this, "===", left.value);
                break;
            case isPoorRelation(right):
                warning("W041", this, "===", right.value);
                break;
            case isTypoTypeof(right, left, state):
                warning("W122", this, right.value);
                break;
            case isTypoTypeof(left, right, state):
                warning("W122", this, left.value);
                break;
        }
        return this;
    });
    relation("===", function (left, right) {
        if (isTypoTypeof(right, left, state)) {
            warning("W122", this, right.value);
        }
        else if (isTypoTypeof(left, right, state)) {
            warning("W122", this, left.value);
        }
        return this;
    });
    relation("!=", function (left, right) {
        var eqnull = state.option.eqnull &&
            ((left && left.value) === "null" || (right && right.value) === "null");
        if (!eqnull && state.option.eqeqeq) {
            this.from = this.character;
            warning("W116", this, "!==", "!=");
        }
        else if (isPoorRelation(left)) {
            warning("W041", this, "!==", left.value);
        }
        else if (isPoorRelation(right)) {
            warning("W041", this, "!==", right.value);
        }
        else if (isTypoTypeof(right, left, state)) {
            warning("W122", this, right.value);
        }
        else if (isTypoTypeof(left, right, state)) {
            warning("W122", this, left.value);
        }
        return this;
    });
    relation("!==", function (left, right) {
        if (isTypoTypeof(right, left, state)) {
            warning("W122", this, right.value);
        }
        else if (isTypoTypeof(left, right, state)) {
            warning("W122", this, left.value);
        }
        return this;
    });
    relation("<");
    relation(">");
    relation("<=");
    relation(">=");
    bitwise("<<", "shiftleft", 120);
    bitwise(">>", "shiftright", 120);
    bitwise(">>>", "shiftrightunsigned", 120);
    infix("in", "in", 120);
    infix("instanceof", "instanceof", 120);
    infix("+", function (left, that) {
        var right;
        that.left = left;
        that.right = right = expression(130);
        if (left && right && left.id === "(string)" && right.id === "(string)") {
            left.value += right.value;
            left.character = right.character;
            if (!state.option.scripturl && javascriptURL.test(left.value)) {
                warning("W050", left);
            }
            return left;
        }
        return that;
    }, 130);
    prefix("+", "num");
    prefix("+++", function () {
        warning("W007");
        this.arity = "unary";
        this.right = expression(150);
        return this;
    });
    infix("+++", function (left) {
        warning("W007");
        this.left = left;
        this.right = expression(130);
        return this;
    }, 130);
    infix("-", "sub", 130);
    prefix("-", "neg");
    prefix("---", function () {
        warning("W006");
        this.arity = "unary";
        this.right = expression(150);
        return this;
    });
    infix("---", function (left) {
        warning("W006");
        this.left = left;
        this.right = expression(130);
        return this;
    }, 130);
    infix("*", "mult", 140);
    infix("/", "div", 140);
    infix("%", "mod", 140);
    suffix("++");
    prefix("++", "preinc");
    state.syntax["++"].exps = true;
    suffix("--");
    prefix("--", "predec");
    state.syntax["--"].exps = true;
    prefix("delete", function () {
        var p = expression(10);
        if (!p) {
            return this;
        }
        if (p.id !== "." && p.id !== "[") {
            warning("W051");
        }
        this.first = p;
        if (p.identifier && !state.isStrict()) {
            p.forgiveUndef = true;
        }
        return this;
    }).exps = true;
    prefix("~", function () {
        if (state.option.bitwise) {
            warning("W016", this, "~");
        }
        this.arity = "unary";
        this.right = expression(150);
        return this;
    });
    prefix("...", function () {
        if (!state.inES6(true)) {
            warning("W119", this, "spread/rest operator", "6");
        }
        if (!state.tokens.next.identifier &&
            state.tokens.next.type !== "(string)" &&
            !checkPunctuators(state.tokens.next, ["[", "("])) {
            error("E030", state.tokens.next, state.tokens.next.value);
        }
        expression(150);
        return this;
    });
    prefix("!", function () {
        this.arity = "unary";
        this.right = expression(150);
        if (!this.right) {
            quit("E041", this);
        }
        if (bang[this.right.id] === true) {
            warning("W018", this, "!");
        }
        return this;
    });
    prefix("typeof", (function () {
        var p = expression(150);
        this.first = this.right = p;
        if (!p) {
            quit("E041", this);
        }
        if (p.identifier) {
            p.forgiveUndef = true;
        }
        return this;
    }));
    prefix("new", function () {
        var mp = metaProperty("target", function () {
            if (!state.inES6(true)) {
                warning("W119", state.tokens.prev, "new.target", "6");
            }
            var inFunction, c = state.funct;
            while (c) {
                inFunction = !c["(global)"];
                if (!c["(arrow)"]) {
                    break;
                }
                c = c["(context)"];
            }
            if (!inFunction) {
                warning("W136", state.tokens.prev, "new.target");
            }
        });
        if (mp) {
            return mp;
        }
        var c = expression(155), i;
        if (c && c.id !== "function") {
            if (c.identifier) {
                c["new"] = true;
                switch (c.value) {
                    case "Number":
                    case "String":
                    case "Boolean":
                    case "Math":
                    case "JSON":
                        warning("W053", state.tokens.prev, c.value);
                        break;
                    case "Symbol":
                        if (state.inES6()) {
                            warning("W053", state.tokens.prev, c.value);
                        }
                        break;
                    case "Function":
                        if (!state.option.evil) {
                            warning("W054");
                        }
                        break;
                    case "Date":
                    case "RegExp":
                    case "this":
                        break;
                    default:
                        if (c.id !== "function") {
                            i = c.value.substr(0, 1);
                            if (state.option.newcap && (i < "A" || i > "Z") &&
                                !state.funct["(scope)"].isPredefined(c.value)) {
                                warning("W055", state.tokens.curr);
                            }
                        }
                }
            }
            else {
                if (c.id !== "." && c.id !== "[" && c.id !== "(") {
                    warning("W056", state.tokens.curr);
                }
            }
        }
        else {
            if (!state.option.supernew)
                warning("W057", this);
        }
        if (state.tokens.next.id !== "(" && !state.option.supernew) {
            warning("W058", state.tokens.curr, state.tokens.curr.value);
        }
        this.first = this.right = c;
        return this;
    });
    state.syntax["new"].exps = true;
    prefix("void").exps = true;
    infix(".", function (left, that) {
        var m = identifier(false, true);
        if (typeof m === "string") {
            countMember(m);
        }
        that.left = left;
        that.right = m;
        if (m && m === "hasOwnProperty" && state.tokens.next.value === "=") {
            warning("W001");
        }
        if (left && left.value === "arguments" && (m === "callee" || m === "caller")) {
            if (state.option.noarg)
                warning("W059", left, m);
            else if (state.isStrict())
                error("E008");
        }
        else if (!state.option.evil && left && left.value === "document" &&
            (m === "write" || m === "writeln")) {
            warning("W060", left);
        }
        if (!state.option.evil && (m === "eval" || m === "execScript")) {
            if (isGlobalEval(left, state)) {
                warning("W061");
            }
        }
        return that;
    }, 160, true);
    infix("(", function (left, that) {
        if (state.option.immed && left && !left.immed && left.id === "function") {
            warning("W062");
        }
        var n = 0;
        var p = [];
        if (left) {
            if (left.type === "(identifier)") {
                if (left.value.match(/^[A-Z]([A-Z0-9_$]*[a-z][A-Za-z0-9_$]*)?$/)) {
                    if ("Array Number String Boolean Date Object Error Symbol".indexOf(left.value) === -1) {
                        if (left.value === "Math") {
                            warning("W063", left);
                        }
                        else if (state.option.newcap) {
                            warning("W064", left);
                        }
                    }
                }
            }
        }
        if (state.tokens.next.id !== ")") {
            for (;;) {
                p[p.length] = expression(10);
                n += 1;
                if (state.tokens.next.id !== ",") {
                    break;
                }
                comma();
            }
        }
        advance(")");
        if (typeof left === "object") {
            if (!state.inES5() && left.value === "parseInt" && n === 1) {
                warning("W065", state.tokens.curr);
            }
            if (!state.option.evil) {
                if (left.value === "eval" || left.value === "Function" ||
                    left.value === "execScript") {
                    warning("W061", left);
                    if (p[0] && p[0].id === "(string)") {
                        addInternalSrc(left, p[0].value);
                    }
                }
                else if (p[0] && p[0].id === "(string)" &&
                    (left.value === "setTimeout" ||
                        left.value === "setInterval")) {
                    warning("W066", left);
                    addInternalSrc(left, p[0].value);
                }
                else if (p[0] && p[0].id === "(string)" &&
                    left.value === "." &&
                    left.left.value === "window" &&
                    (left.right === "setTimeout" ||
                        left.right === "setInterval")) {
                    warning("W066", left);
                    addInternalSrc(left, p[0].value);
                }
            }
            if (!left.identifier && left.id !== "." && left.id !== "[" && left.id !== "=>" &&
                left.id !== "(" && left.id !== "&&" && left.id !== "||" && left.id !== "?" &&
                !(state.inES6() && left["(name)"])) {
                warning("W067", that);
            }
        }
        that.left = left;
        return that;
    }, 155, true).exps = true;
    prefix("(", function () {
        var pn = state.tokens.next, pn1, i = -1;
        var ret, triggerFnExpr, first, last;
        var parens = 1;
        var opening = state.tokens.curr;
        var preceeding = state.tokens.prev;
        var isNecessary = !state.option.singleGroups;
        do {
            if (pn.value === "(") {
                parens += 1;
            }
            else if (pn.value === ")") {
                parens -= 1;
            }
            i += 1;
            pn1 = pn;
            pn = peek(i);
        } while (!(parens === 0 && pn1.value === ")") && pn.value !== ";" && pn.type !== "(end)");
        if (state.tokens.next.id === "function") {
            triggerFnExpr = state.tokens.next.immed = true;
        }
        if (pn.value === "=>") {
            return doFunction({ type: "arrow", parsedOpening: true });
        }
        var exprs = [];
        if (state.tokens.next.id !== ")") {
            for (;;) {
                exprs.push(expression(10));
                if (state.tokens.next.id !== ",") {
                    break;
                }
                if (state.option.nocomma) {
                    warning("W127");
                }
                comma();
            }
        }
        advance(")", this);
        if (state.option.immed && exprs[0] && exprs[0].id === "function") {
            if (state.tokens.next.id !== "(" &&
                state.tokens.next.id !== "." && state.tokens.next.id !== "[") {
                warning("W068", this);
            }
        }
        if (!exprs.length) {
            return;
        }
        if (exprs.length > 1) {
            ret = Object.create(state.syntax[","]);
            ret.exprs = exprs;
            first = exprs[0];
            last = exprs[exprs.length - 1];
            if (!isNecessary) {
                isNecessary = preceeding.assign || preceeding.delim;
            }
        }
        else {
            ret = first = last = exprs[0];
            if (!isNecessary) {
                isNecessary =
                    (opening.beginsStmt && (ret.id === "{" || triggerFnExpr || isFunctor(ret))) ||
                        (triggerFnExpr &&
                            (!isEndOfExpr() || state.tokens.prev.id !== "}")) ||
                        (isFunctor(ret) && !isEndOfExpr()) ||
                        (ret.id === "{" && preceeding.id === "=>") ||
                        (ret.type === "(number)" &&
                            checkPunctuator(pn, ".") && /^\d+$/.test(ret.value));
            }
        }
        if (ret) {
            if (!isNecessary && (first.left || first.right || ret.exprs)) {
                isNecessary =
                    (!isBeginOfExpr(preceeding) && first.lbp <= preceeding.lbp) ||
                        (!isEndOfExpr() && last.lbp < state.tokens.next.lbp);
            }
            if (!isNecessary) {
                warning("W126", opening);
            }
            ret.paren = true;
        }
        return ret;
    });
    application("=>");
    infix("[", function (left, that) {
        var e = expression(10), s;
        if (e && e.type === "(string)") {
            if (!state.option.evil && (e.value === "eval" || e.value === "execScript")) {
                if (isGlobalEval(left, state)) {
                    warning("W061");
                }
            }
            countMember(e.value);
            if (!state.option.sub && identifierRegExp.test(e.value)) {
                s = state.syntax[e.value];
                if (!s || !isReserved(s)) {
                    warning("W069", state.tokens.prev, e.value);
                }
            }
        }
        advance("]", that);
        if (e && e.value === "hasOwnProperty" && state.tokens.next.value === "=") {
            warning("W001");
        }
        that.left = left;
        that.right = e;
        return that;
    }, 160, true);
    function comprehensiveArrayExpression() {
        var res = {};
        res.exps = true;
        state.funct["(comparray)"].stack();
        var reversed = false;
        if (state.tokens.next.value !== "for") {
            reversed = true;
            if (!state.inMoz()) {
                warning("W116", state.tokens.next, "for", state.tokens.next.value);
            }
            state.funct["(comparray)"].setState("use");
            res.right = expression(10);
        }
        advance("for");
        if (state.tokens.next.value === "each") {
            advance("each");
            if (!state.inMoz()) {
                warning("W118", state.tokens.curr, "for each");
            }
        }
        advance("(");
        state.funct["(comparray)"].setState("define");
        res.left = expression(130);
        if (_.contains(["in", "of"], state.tokens.next.value)) {
            advance();
        }
        else {
            error("E045", state.tokens.curr);
        }
        state.funct["(comparray)"].setState("generate");
        expression(10);
        advance(")");
        if (state.tokens.next.value === "if") {
            advance("if");
            advance("(");
            state.funct["(comparray)"].setState("filter");
            res.filter = expression(10);
            advance(")");
        }
        if (!reversed) {
            state.funct["(comparray)"].setState("use");
            res.right = expression(10);
        }
        advance("]");
        state.funct["(comparray)"].unstack();
        return res;
    }
    prefix("[", function () {
        var blocktype = lookupBlockType();
        if (blocktype.isCompArray) {
            if (!state.option.esnext && !state.inMoz()) {
                warning("W118", state.tokens.curr, "array comprehension");
            }
            return comprehensiveArrayExpression();
        }
        else if (blocktype.isDestAssign) {
            this.destructAssign = destructuringPattern({ openingParsed: true, assignment: true });
            return this;
        }
        var b = state.tokens.curr.line !== startLine(state.tokens.next);
        this.first = [];
        if (b) {
            indent += state.option.indent;
            if (state.tokens.next.from === indent + state.option.indent) {
                indent += state.option.indent;
            }
        }
        while (state.tokens.next.id !== "(end)") {
            while (state.tokens.next.id === ",") {
                if (!state.option.elision) {
                    if (!state.inES5()) {
                        warning("W070");
                    }
                    else {
                        warning("W128");
                        do {
                            advance(",");
                        } while (state.tokens.next.id === ",");
                        continue;
                    }
                }
                advance(",");
            }
            if (state.tokens.next.id === "]") {
                break;
            }
            this.first.push(expression(10));
            if (state.tokens.next.id === ",") {
                comma({ allowTrailing: true });
                if (state.tokens.next.id === "]" && !state.inES5()) {
                    warning("W070", state.tokens.curr);
                    break;
                }
            }
            else {
                break;
            }
        }
        if (b) {
            indent -= state.option.indent;
        }
        advance("]", this);
        return this;
    });
    function isMethod() {
        return state.funct["(statement)"] && state.funct["(statement)"].type === "class" ||
            state.funct["(context)"] && state.funct["(context)"]["(verb)"] === "class";
    }
    function isPropertyName(token) {
        return token.identifier || token.id === "(string)" || token.id === "(number)";
    }
    function propertyName(preserveOrToken) {
        var id;
        var preserve = true;
        if (typeof preserveOrToken === "object") {
            id = preserveOrToken;
        }
        else {
            preserve = preserveOrToken;
            id = optionalidentifier(false, true, preserve);
        }
        if (!id) {
            if (state.tokens.next.id === "(string)") {
                id = state.tokens.next.value;
                if (!preserve) {
                    advance();
                }
            }
            else if (state.tokens.next.id === "(number)") {
                id = state.tokens.next.value.toString();
                if (!preserve) {
                    advance();
                }
            }
        }
        else if (typeof id === "object") {
            if (id.id === "(string)" || id.id === "(identifier)")
                id = id.value;
            else if (id.id === "(number)")
                id = id.value.toString();
        }
        if (id === "hasOwnProperty") {
            warning("W001");
        }
        return id;
    }
    function functionparams(options) {
        var next;
        var paramsIds = [];
        var ident;
        var tokens = [];
        var t;
        var pastDefault = false;
        var pastRest = false;
        var arity = 0;
        var loneArg = options && options.loneArg;
        if (loneArg && loneArg.identifier === true) {
            state.funct["(scope)"].addParam(loneArg.value, loneArg);
            return { arity: 1, params: [loneArg.value] };
        }
        next = state.tokens.next;
        if (!options || !options.parsedOpening) {
            advance("(");
        }
        if (state.tokens.next.id === ")") {
            advance(")");
            return;
        }
        function addParam(addParamArgs) {
            state.funct["(scope)"].addParam.apply(state.funct["(scope)"], addParamArgs);
        }
        for (;;) {
            arity++;
            var currentParams = [];
            if (_.contains(["{", "["], state.tokens.next.id)) {
                tokens = destructuringPattern();
                for (t in tokens) {
                    t = tokens[t];
                    if (t.id) {
                        paramsIds.push(t.id);
                        currentParams.push([t.id, t.token]);
                    }
                }
            }
            else {
                if (checkPunctuator(state.tokens.next, "..."))
                    pastRest = true;
                ident = identifier(true);
                if (ident) {
                    paramsIds.push(ident);
                    currentParams.push([ident, state.tokens.curr]);
                }
                else {
                    while (!checkPunctuators(state.tokens.next, [",", ")"]))
                        advance();
                }
            }
            if (pastDefault) {
                if (state.tokens.next.id !== "=") {
                    error("W138", state.tokens.curr);
                }
            }
            if (state.tokens.next.id === "=") {
                if (!state.inES6()) {
                    warning("W119", state.tokens.next, "default parameters", "6");
                }
                advance("=");
                pastDefault = true;
                expression(10);
            }
            currentParams.forEach(addParam);
            if (state.tokens.next.id === ",") {
                if (pastRest) {
                    warning("W131", state.tokens.next);
                }
                comma();
            }
            else {
                advance(")", next);
                return { arity: arity, params: paramsIds };
            }
        }
    }
    function functor(name, token, overwrites) {
        var funct = {
            "(name)": name,
            "(breakage)": 0,
            "(loopage)": 0,
            "(tokens)": {},
            "(properties)": {},
            "(catch)": false,
            "(global)": false,
            "(line)": null,
            "(character)": null,
            "(metrics)": null,
            "(statement)": null,
            "(context)": null,
            "(scope)": null,
            "(comparray)": null,
            "(generator)": null,
            "(arrow)": null,
            "(params)": null
        };
        if (token) {
            _.extend(funct, {
                "(line)": token.line,
                "(character)": token.character,
                "(metrics)": createMetrics(token)
            });
        }
        _.extend(funct, overwrites);
        if (funct["(context)"]) {
            funct["(scope)"] = funct["(context)"]["(scope)"];
            funct["(comparray)"] = funct["(context)"]["(comparray)"];
        }
        return funct;
    }
    function isFunctor(token) {
        return "(scope)" in token;
    }
    function hasParsedCode(funct) {
        return funct["(global)"] && !funct["(verb)"];
    }
    function doTemplateLiteral(left) {
        var ctx = this.context;
        var noSubst = this.noSubst;
        var depth = this.depth;
        if (!noSubst) {
            while (!end()) {
                if (!state.tokens.next.template || state.tokens.next.depth > depth) {
                    expression(0);
                }
                else {
                    advance();
                }
            }
        }
        return {
            id: "(template)",
            type: "(template)",
            tag: left
        };
        function end() {
            if (state.tokens.curr.template && state.tokens.curr.tail &&
                state.tokens.curr.context === ctx)
                return true;
            var complete = (state.tokens.next.template && state.tokens.next.tail &&
                state.tokens.next.context === ctx);
            if (complete)
                advance();
            return complete || state.tokens.next.isUnclosed;
        }
    }
    function doFunction(options) {
        var f, token, name, statement, classExprBinding, isGenerator, isArrow, ignoreLoopFunc;
        var oldOption = state.option;
        var oldIgnored = state.ignored;
        if (options) {
            name = options.name;
            statement = options.statement;
            classExprBinding = options.classExprBinding;
            isGenerator = options.type === "generator";
            isArrow = options.type === "arrow";
            ignoreLoopFunc = options.ignoreLoopFunc;
        }
        state.option = Object.create(state.option);
        state.ignored = Object.create(state.ignored);
        state.funct = functor(name || state.nameStack.infer(), state.tokens.next, {
            "(statement)": statement,
            "(context)": state.funct,
            "(arrow)": isArrow,
            "(generator)": isGenerator
        });
        f = state.funct;
        token = state.tokens.curr;
        token.funct = state.funct;
        functions.push(state.funct);
        state.funct["(scope)"].stack("functionouter");
        var internallyAccessibleName = name || classExprBinding;
        if (internallyAccessibleName) {
            state.funct["(scope)"].block.add(internallyAccessibleName, classExprBinding ? "class" : "function", state.tokens.curr, false);
        }
        state.funct["(scope)"].stack("functionparams");
        var paramsInfo = functionparams(options);
        if (paramsInfo) {
            state.funct["(params)"] = paramsInfo.params;
            state.funct["(metrics)"].arity = paramsInfo.arity;
            state.funct["(metrics)"].verifyMaxParametersPerFunction();
        }
        else {
            state.funct["(metrics)"].arity = 0;
        }
        if (isArrow) {
            if (!state.inES6(true)) {
                warning("W119", state.tokens.curr, "arrow function syntax (=>)", "6");
            }
            if (!options.loneArg) {
                advance("=>");
            }
        }
        block(false, true, true, isArrow);
        if (!state.option.noyield && isGenerator &&
            state.funct["(generator)"] !== "yielded") {
            warning("W124", state.tokens.curr);
        }
        state.funct["(metrics)"].verifyMaxStatementsPerFunction();
        state.funct["(metrics)"].verifyMaxComplexityPerFunction();
        state.funct["(unusedOption)"] = state.option.unused;
        state.option = oldOption;
        state.ignored = oldIgnored;
        state.funct["(last)"] = state.tokens.curr.line;
        state.funct["(lastcharacter)"] = state.tokens.curr.character;
        state.funct["(scope)"].unstack();
        state.funct["(scope)"].unstack();
        state.funct = state.funct["(context)"];
        if (!ignoreLoopFunc && !state.option.loopfunc && state.funct["(loopage)"]) {
            if (f["(isCapturing)"]) {
                warning("W083", token);
            }
        }
        return f;
    }
    function createMetrics(functionStartToken) {
        return {
            statementCount: 0,
            nestedBlockDepth: -1,
            ComplexityCount: 1,
            arity: 0,
            verifyMaxStatementsPerFunction: function () {
                if (state.option.maxstatements &&
                    this.statementCount > state.option.maxstatements) {
                    warning("W071", functionStartToken, this.statementCount);
                }
            },
            verifyMaxParametersPerFunction: function () {
                if (_.isNumber(state.option.maxparams) &&
                    this.arity > state.option.maxparams) {
                    warning("W072", functionStartToken, this.arity);
                }
            },
            verifyMaxNestedBlockDepthPerFunction: function () {
                if (state.option.maxdepth &&
                    this.nestedBlockDepth > 0 &&
                    this.nestedBlockDepth === state.option.maxdepth + 1) {
                    warning("W073", null, this.nestedBlockDepth);
                }
            },
            verifyMaxComplexityPerFunction: function () {
                var max = state.option.maxcomplexity;
                var cc = this.ComplexityCount;
                if (max && cc > max) {
                    warning("W074", functionStartToken, cc);
                }
            }
        };
    }
    function increaseComplexityCount() {
        state.funct["(metrics)"].ComplexityCount += 1;
    }
    function checkCondAssignment(expr) {
        var id, paren;
        if (expr) {
            id = expr.id;
            paren = expr.paren;
            if (id === "," && (expr = expr.exprs[expr.exprs.length - 1])) {
                id = expr.id;
                paren = paren || expr.paren;
            }
        }
        switch (id) {
            case "=":
            case "+=":
            case "-=":
            case "*=":
            case "%=":
            case "&=":
            case "|=":
            case "^=":
            case "/=":
                if (!paren && !state.option.boss) {
                    warning("W084");
                }
        }
    }
    function checkProperties(props) {
        if (state.inES5()) {
            for (var name in props) {
                if (props[name] && props[name].setterToken && !props[name].getterToken) {
                    warning("W078", props[name].setterToken);
                }
            }
        }
    }
    function metaProperty(name, c) {
        if (checkPunctuator(state.tokens.next, ".")) {
            var left = state.tokens.curr.id;
            advance(".");
            var id = identifier();
            state.tokens.curr.isMetaProperty = true;
            if (name !== id) {
                error("E057", state.tokens.prev, left, id);
            }
            else {
                c();
            }
            return state.tokens.curr;
        }
    }
    (function (x) {
        x.nud = function () {
            var b, f, i, p, t, isGeneratorMethod = false, nextVal;
            var props = Object.create(null);
            b = state.tokens.curr.line !== startLine(state.tokens.next);
            if (b) {
                indent += state.option.indent;
                if (state.tokens.next.from === indent + state.option.indent) {
                    indent += state.option.indent;
                }
            }
            var blocktype = lookupBlockType();
            if (blocktype.isDestAssign) {
                this.destructAssign = destructuringPattern({ openingParsed: true, assignment: true });
                return this;
            }
            for (;;) {
                if (state.tokens.next.id === "}") {
                    break;
                }
                nextVal = state.tokens.next.value;
                if (state.tokens.next.identifier &&
                    (peekIgnoreEOL().id === "," || peekIgnoreEOL().id === "}")) {
                    if (!state.inES6()) {
                        warning("W104", state.tokens.next, "object short notation", "6");
                    }
                    i = propertyName(true);
                    saveProperty(props, i, state.tokens.next);
                    expression(10);
                }
                else if (peek().id !== ":" && (nextVal === "get" || nextVal === "set")) {
                    advance(nextVal);
                    if (!state.inES5()) {
                        error("E034");
                    }
                    i = propertyName();
                    if (!i && !state.inES6()) {
                        error("E035");
                    }
                    if (i) {
                        saveAccessor(nextVal, props, i, state.tokens.curr);
                    }
                    t = state.tokens.next;
                    f = doFunction();
                    p = f["(params)"];
                    if (nextVal === "get" && i && p) {
                        warning("W076", t, p[0], i);
                    }
                    else if (nextVal === "set" && i && (!p || p.length !== 1)) {
                        warning("W077", t, i);
                    }
                }
                else {
                    if (state.tokens.next.value === "*" && state.tokens.next.type === "(punctuator)") {
                        if (!state.inES6()) {
                            warning("W104", state.tokens.next, "generator functions", "6");
                        }
                        advance("*");
                        isGeneratorMethod = true;
                    }
                    else {
                        isGeneratorMethod = false;
                    }
                    if (state.tokens.next.id === "[") {
                        i = computedPropertyName();
                        state.nameStack.set(i);
                    }
                    else {
                        state.nameStack.set(state.tokens.next);
                        i = propertyName();
                        saveProperty(props, i, state.tokens.next);
                        if (typeof i !== "string") {
                            break;
                        }
                    }
                    if (state.tokens.next.value === "(") {
                        if (!state.inES6()) {
                            warning("W104", state.tokens.curr, "concise methods", "6");
                        }
                        doFunction({ type: isGeneratorMethod ? "generator" : null });
                    }
                    else {
                        advance(":");
                        expression(10);
                    }
                }
                countMember(i);
                if (state.tokens.next.id === ",") {
                    comma({ allowTrailing: true, property: true });
                    if (state.tokens.next.id === ",") {
                        warning("W070", state.tokens.curr);
                    }
                    else if (state.tokens.next.id === "}" && !state.inES5()) {
                        warning("W070", state.tokens.curr);
                    }
                }
                else {
                    break;
                }
            }
            if (b) {
                indent -= state.option.indent;
            }
            advance("}", this);
            checkProperties(props);
            return this;
        };
        x.fud = function () {
            error("E036", state.tokens.curr);
        };
    }(delim("{")));
    function destructuringPattern(options) {
        var isAssignment = options && options.assignment;
        if (!state.inES6()) {
            warning("W104", state.tokens.curr, isAssignment ? "destructuring assignment" : "destructuring binding", "6");
        }
        return destructuringPatternRecursive(options);
    }
    function destructuringPatternRecursive(options) {
        var ids;
        var identifiers = [];
        var openingParsed = options && options.openingParsed;
        var isAssignment = options && options.assignment;
        var recursiveOptions = isAssignment ? { assignment: isAssignment } : null;
        var firstToken = openingParsed ? state.tokens.curr : state.tokens.next;
        var nextInnerDE = function () {
            var ident;
            if (checkPunctuators(state.tokens.next, ["[", "{"])) {
                ids = destructuringPatternRecursive(recursiveOptions);
                for (var id in ids) {
                    id = ids[id];
                    identifiers.push({ id: id.id, token: id.token });
                }
            }
            else if (checkPunctuator(state.tokens.next, ",")) {
                identifiers.push({ id: null, token: state.tokens.curr });
            }
            else if (checkPunctuator(state.tokens.next, "(")) {
                advance("(");
                nextInnerDE();
                advance(")");
            }
            else {
                var is_rest = checkPunctuator(state.tokens.next, "...");
                if (isAssignment) {
                    var identifierToken = is_rest ? peek(0) : state.tokens.next;
                    if (!identifierToken.identifier) {
                        warning("E030", identifierToken, identifierToken.value);
                    }
                    var assignTarget = expression(155);
                    if (assignTarget) {
                        checkLeftSideAssign(assignTarget);
                        if (assignTarget.identifier) {
                            ident = assignTarget.value;
                        }
                    }
                }
                else {
                    ident = identifier();
                }
                if (ident) {
                    identifiers.push({ id: ident, token: state.tokens.curr });
                }
                return is_rest;
            }
            return false;
        };
        var assignmentProperty = function () {
            var id;
            if (checkPunctuator(state.tokens.next, "[")) {
                advance("[");
                expression(10);
                advance("]");
                advance(":");
                nextInnerDE();
            }
            else if (state.tokens.next.id === "(string)" ||
                state.tokens.next.id === "(number)") {
                advance();
                advance(":");
                nextInnerDE();
            }
            else {
                id = identifier();
                if (checkPunctuator(state.tokens.next, ":")) {
                    advance(":");
                    nextInnerDE();
                }
                else if (id) {
                    if (isAssignment) {
                        checkLeftSideAssign(state.tokens.curr);
                    }
                    identifiers.push({ id: id, token: state.tokens.curr });
                }
            }
        };
        var id, value;
        if (checkPunctuator(firstToken, "[")) {
            if (!openingParsed) {
                advance("[");
            }
            if (checkPunctuator(state.tokens.next, "]")) {
                warning("W137", state.tokens.curr);
            }
            var element_after_rest = false;
            while (!checkPunctuator(state.tokens.next, "]")) {
                if (nextInnerDE() && !element_after_rest &&
                    checkPunctuator(state.tokens.next, ",")) {
                    warning("W130", state.tokens.next);
                    element_after_rest = true;
                }
                if (checkPunctuator(state.tokens.next, "=")) {
                    if (checkPunctuator(state.tokens.prev, "...")) {
                        advance("]");
                    }
                    else {
                        advance("=");
                    }
                    id = state.tokens.prev;
                    value = expression(10);
                    if (value && value.type === "undefined") {
                        warning("W080", id, id.value);
                    }
                }
                if (!checkPunctuator(state.tokens.next, "]")) {
                    advance(",");
                }
            }
            advance("]");
        }
        else if (checkPunctuator(firstToken, "{")) {
            if (!openingParsed) {
                advance("{");
            }
            if (checkPunctuator(state.tokens.next, "}")) {
                warning("W137", state.tokens.curr);
            }
            while (!checkPunctuator(state.tokens.next, "}")) {
                assignmentProperty();
                if (checkPunctuator(state.tokens.next, "=")) {
                    advance("=");
                    id = state.tokens.prev;
                    value = expression(10);
                    if (value && value.type === "undefined") {
                        warning("W080", id, id.value);
                    }
                }
                if (!checkPunctuator(state.tokens.next, "}")) {
                    advance(",");
                    if (checkPunctuator(state.tokens.next, "}")) {
                        break;
                    }
                }
            }
            advance("}");
        }
        return identifiers;
    }
    function destructuringPatternMatch(tokens, value) {
        var first = value.first;
        if (!first)
            return;
        _.zip(tokens, Array.isArray(first) ? first : [first]).forEach(function (val) {
            var token = val[0];
            var value = val[1];
            if (token && value)
                token.first = value;
            else if (token && token.first && !value)
                warning("W080", token.first, token.first.value);
        });
    }
    function blockVariableStatement(type, statement, context) {
        var prefix = context && context.prefix;
        var inexport = context && context.inexport;
        var isLet = type === "let";
        var isConst = type === "const";
        var tokens, lone, value, letblock;
        if (!state.inES6()) {
            warning("W104", state.tokens.curr, type, "6");
        }
        if (isLet && state.tokens.next.value === "(") {
            if (!state.inMoz()) {
                warning("W118", state.tokens.next, "let block");
            }
            advance("(");
            state.funct["(scope)"].stack();
            letblock = true;
        }
        else if (state.funct["(noblockscopedvar)"]) {
            error("E048", state.tokens.curr, isConst ? "Const" : "Let");
        }
        statement.first = [];
        for (;;) {
            var names = [];
            if (_.contains(["{", "["], state.tokens.next.value)) {
                tokens = destructuringPattern();
                lone = false;
            }
            else {
                tokens = [{ id: identifier(), token: state.tokens.curr }];
                lone = true;
            }
            if (!prefix && isConst && state.tokens.next.id !== "=") {
                warning("E012", state.tokens.curr, state.tokens.curr.value);
            }
            for (var t in tokens) {
                if (tokens.hasOwnProperty(t)) {
                    t = tokens[t];
                    if (state.funct["(scope)"].block.isGlobal()) {
                        if (predefined[t.id] === false) {
                            warning("W079", t.token, t.id);
                        }
                    }
                    if (t.id && !state.funct["(noblockscopedvar)"]) {
                        state.funct["(scope)"].addlabel(t.id, {
                            type: type,
                            token: t.token
                        });
                        names.push(t.token);
                        if (lone && inexport) {
                            state.funct["(scope)"].setExported(t.token.value, t.token);
                        }
                    }
                }
            }
            if (state.tokens.next.id === "=") {
                advance("=");
                if (!prefix && peek(0).id === "=" && state.tokens.next.identifier) {
                    warning("W120", state.tokens.next, state.tokens.next.value);
                }
                var id = state.tokens.prev;
                value = expression(prefix ? 120 : 10);
                if (!prefix && value && value.type === "undefined") {
                    warning("W080", id, id.value);
                }
                if (lone) {
                    tokens[0].first = value;
                }
                else {
                    destructuringPatternMatch(names, value);
                }
            }
            statement.first = statement.first.concat(names);
            if (state.tokens.next.id !== ",") {
                break;
            }
            comma();
        }
        if (letblock) {
            advance(")");
            block(true, true);
            statement.block = true;
            state.funct["(scope)"].unstack();
        }
        return statement;
    }
    var conststatement = stmt("const", function (context) {
        return blockVariableStatement("const", this, context);
    });
    conststatement.exps = true;
    var letstatement = stmt("let", function (context) {
        return blockVariableStatement("let", this, context);
    });
    letstatement.exps = true;
    var varstatement = stmt("var", function (context) {
        var prefix = context && context.prefix;
        var inexport = context && context.inexport;
        var tokens, lone, value;
        var implied = context && context.implied;
        var report = !(context && context.ignore);
        this.first = [];
        for (;;) {
            var names = [];
            if (_.contains(["{", "["], state.tokens.next.value)) {
                tokens = destructuringPattern();
                lone = false;
            }
            else {
                tokens = [{ id: identifier(), token: state.tokens.curr }];
                lone = true;
            }
            if (!(prefix && implied) && report && state.option.varstmt) {
                warning("W132", this);
            }
            this.first = this.first.concat(names);
            for (var t in tokens) {
                if (tokens.hasOwnProperty(t)) {
                    t = tokens[t];
                    if (!implied && state.funct["(global)"]) {
                        if (predefined[t.id] === false) {
                            warning("W079", t.token, t.id);
                        }
                        else if (state.option.futurehostile === false) {
                            if ((!state.inES5() && ecmaIdentifiers[5][t.id] === false) ||
                                (!state.inES6() && ecmaIdentifiers[6][t.id] === false)) {
                                warning("W129", t.token, t.id);
                            }
                        }
                    }
                    if (t.id) {
                        if (implied === "for") {
                            if (!state.funct["(scope)"].has(t.id)) {
                                if (report)
                                    warning("W088", t.token, t.id);
                            }
                            state.funct["(scope)"].block.use(t.id, t.token);
                        }
                        else {
                            state.funct["(scope)"].addlabel(t.id, {
                                type: "var",
                                token: t.token
                            });
                            if (lone && inexport) {
                                state.funct["(scope)"].setExported(t.id, t.token);
                            }
                        }
                        names.push(t.token);
                    }
                }
            }
            if (state.tokens.next.id === "=") {
                state.nameStack.set(state.tokens.curr);
                advance("=");
                if (peek(0).id === "=" && state.tokens.next.identifier) {
                    if (!prefix && report &&
                        !state.funct["(params)"] ||
                        state.funct["(params)"].indexOf(state.tokens.next.value) === -1) {
                        warning("W120", state.tokens.next, state.tokens.next.value);
                    }
                }
                var id = state.tokens.prev;
                value = expression(prefix ? 120 : 10);
                if (value && !prefix && report && !state.funct["(loopage)"] && value.type === "undefined") {
                    warning("W080", id, id.value);
                }
                if (lone) {
                    tokens[0].first = value;
                }
                else {
                    destructuringPatternMatch(names, value);
                }
            }
            if (state.tokens.next.id !== ",") {
                break;
            }
            comma();
        }
        return this;
    });
    varstatement.exps = true;
    blockstmt("class", function () {
        return classdef.call(this, true);
    });
    function classdef(isStatement) {
        if (!state.inES6()) {
            warning("W104", state.tokens.curr, "class", "6");
        }
        if (isStatement) {
            this.name = identifier();
            state.funct["(scope)"].addlabel(this.name, {
                type: "class",
                token: state.tokens.curr
            });
        }
        else if (state.tokens.next.identifier && state.tokens.next.value !== "extends") {
            this.name = identifier();
            this.namedExpr = true;
        }
        else {
            this.name = state.nameStack.infer();
        }
        classtail(this);
        return this;
    }
    function classtail(c) {
        var wasInClassBody = state.inClassBody;
        if (state.tokens.next.value === "extends") {
            advance("extends");
            c.heritage = expression(10);
        }
        state.inClassBody = true;
        advance("{");
        c.body = classbody(c);
        advance("}");
        state.inClassBody = wasInClassBody;
    }
    function classbody(c) {
        var name;
        var isStatic;
        var isGenerator;
        var getset;
        var props = Object.create(null);
        var staticProps = Object.create(null);
        var computed;
        for (var i = 0; state.tokens.next.id !== "}"; ++i) {
            name = state.tokens.next;
            isStatic = false;
            isGenerator = false;
            getset = null;
            if (name.id === ";") {
                warning("W032");
                advance(";");
                continue;
            }
            if (name.id === "*") {
                isGenerator = true;
                advance("*");
                name = state.tokens.next;
            }
            if (name.id === "[") {
                name = computedPropertyName();
                computed = true;
            }
            else if (isPropertyName(name)) {
                advance();
                computed = false;
                if (name.identifier && name.value === "static") {
                    if (checkPunctuator(state.tokens.next, "*")) {
                        isGenerator = true;
                        advance("*");
                    }
                    if (isPropertyName(state.tokens.next) || state.tokens.next.id === "[") {
                        computed = state.tokens.next.id === "[";
                        isStatic = true;
                        name = state.tokens.next;
                        if (state.tokens.next.id === "[") {
                            name = computedPropertyName();
                        }
                        else
                            advance();
                    }
                }
                if (name.identifier && (name.value === "get" || name.value === "set")) {
                    if (isPropertyName(state.tokens.next) || state.tokens.next.id === "[") {
                        computed = state.tokens.next.id === "[";
                        getset = name;
                        name = state.tokens.next;
                        if (state.tokens.next.id === "[") {
                            name = computedPropertyName();
                        }
                        else
                            advance();
                    }
                }
            }
            else {
                warning("W052", state.tokens.next, state.tokens.next.value || state.tokens.next.type);
                advance();
                continue;
            }
            if (!checkPunctuator(state.tokens.next, "(")) {
                error("E054", state.tokens.next, state.tokens.next.value);
                while (state.tokens.next.id !== "}" &&
                    !checkPunctuator(state.tokens.next, "(")) {
                    advance();
                }
                if (state.tokens.next.value !== "(") {
                    doFunction({ statement: c });
                }
            }
            if (!computed) {
                if (getset) {
                    saveAccessor(getset.value, isStatic ? staticProps : props, name.value, name, true, isStatic);
                }
                else {
                    if (name.value === "constructor") {
                        state.nameStack.set(c);
                    }
                    else {
                        state.nameStack.set(name);
                    }
                    saveProperty(isStatic ? staticProps : props, name.value, name, true, isStatic);
                }
            }
            if (getset && name.value === "constructor") {
                var propDesc = getset.value === "get" ? "class getter method" : "class setter method";
                error("E049", name, propDesc, "constructor");
            }
            else if (name.value === "prototype") {
                error("E049", name, "class method", "prototype");
            }
            propertyName(name);
            doFunction({
                statement: c,
                type: isGenerator ? "generator" : null,
                classExprBinding: c.namedExpr ? c.name : null
            });
        }
        checkProperties(props);
    }
    blockstmt("function", function (context) {
        var inexport = context && context.inexport;
        var generator = false;
        if (state.tokens.next.value === "*") {
            advance("*");
            if (state.inES6(true)) {
                generator = true;
            }
            else {
                warning("W119", state.tokens.curr, "function*", "6");
            }
        }
        if (inblock) {
            warning("W082", state.tokens.curr);
        }
        var i = optionalidentifier();
        state.funct["(scope)"].addlabel(i, {
            type: "function",
            token: state.tokens.curr
        });
        if (i === void 0) {
            warning("W025");
        }
        else if (inexport) {
            state.funct["(scope)"].setExported(i, state.tokens.prev);
        }
        doFunction({
            name: i,
            statement: this,
            type: generator ? "generator" : null,
            ignoreLoopFunc: inblock
        });
        if (state.tokens.next.id === "(" && state.tokens.next.line === state.tokens.curr.line) {
            error("E039");
        }
        return this;
    });
    prefix("function", function () {
        var generator = false;
        if (state.tokens.next.value === "*") {
            if (!state.inES6()) {
                warning("W119", state.tokens.curr, "function*", "6");
            }
            advance("*");
            generator = true;
        }
        var i = optionalidentifier();
        doFunction({ name: i, type: generator ? "generator" : null });
        return this;
    });
    blockstmt("if", function () {
        var t = state.tokens.next;
        increaseComplexityCount();
        state.condition = true;
        advance("(");
        var expr = expression(0);
        checkCondAssignment(expr);
        var forinifcheck = null;
        if (state.option.forin && state.forinifcheckneeded) {
            state.forinifcheckneeded = false;
            forinifcheck = state.forinifchecks[state.forinifchecks.length - 1];
            if (expr.type === "(punctuator)" && expr.value === "!") {
                forinifcheck.type = "(negative)";
            }
            else {
                forinifcheck.type = "(positive)";
            }
        }
        advance(")", t);
        state.condition = false;
        var s = block(true, true);
        if (forinifcheck && forinifcheck.type === "(negative)") {
            if (s && s[0] && s[0].type === "(identifier)" && s[0].value === "continue") {
                forinifcheck.type = "(negative-with-continue)";
            }
        }
        if (state.tokens.next.id === "else") {
            advance("else");
            if (state.tokens.next.id === "if" || state.tokens.next.id === "switch") {
                statement();
            }
            else {
                block(true, true);
            }
        }
        return this;
    });
    blockstmt("try", function () {
        var b;
        function doCatch() {
            advance("catch");
            advance("(");
            state.funct["(scope)"].stack("catchparams");
            if (checkPunctuators(state.tokens.next, ["[", "{"])) {
                var tokens = destructuringPattern();
                _.each(tokens, function (token) {
                    if (token.id) {
                        state.funct["(scope)"].addParam(token.id, token, "exception");
                    }
                });
            }
            else if (state.tokens.next.type !== "(identifier)") {
                warning("E030", state.tokens.next, state.tokens.next.value);
            }
            else {
                state.funct["(scope)"].addParam(identifier(), state.tokens.curr, "exception");
            }
            if (state.tokens.next.value === "if") {
                if (!state.inMoz()) {
                    warning("W118", state.tokens.curr, "catch filter");
                }
                advance("if");
                expression(0);
            }
            advance(")");
            block(false);
            state.funct["(scope)"].unstack();
        }
        block(true);
        while (state.tokens.next.id === "catch") {
            increaseComplexityCount();
            if (b && (!state.inMoz())) {
                warning("W118", state.tokens.next, "multiple catch blocks");
            }
            doCatch();
            b = true;
        }
        if (state.tokens.next.id === "finally") {
            advance("finally");
            block(true);
            return;
        }
        if (!b) {
            error("E021", state.tokens.next, "catch", state.tokens.next.value);
        }
        return this;
    });
    blockstmt("while", function () {
        var t = state.tokens.next;
        state.funct["(breakage)"] += 1;
        state.funct["(loopage)"] += 1;
        increaseComplexityCount();
        advance("(");
        checkCondAssignment(expression(0));
        advance(")", t);
        block(true, true);
        state.funct["(breakage)"] -= 1;
        state.funct["(loopage)"] -= 1;
        return this;
    }).labelled = true;
    blockstmt("with", function () {
        var t = state.tokens.next;
        if (state.isStrict()) {
            error("E010", state.tokens.curr);
        }
        else if (!state.option.withstmt) {
            warning("W085", state.tokens.curr);
        }
        advance("(");
        expression(0);
        advance(")", t);
        block(true, true);
        return this;
    });
    blockstmt("switch", function () {
        var t = state.tokens.next;
        var g = false;
        var noindent = false;
        state.funct["(breakage)"] += 1;
        advance("(");
        checkCondAssignment(expression(0));
        advance(")", t);
        t = state.tokens.next;
        advance("{");
        if (state.tokens.next.from === indent)
            noindent = true;
        if (!noindent)
            indent += state.option.indent;
        this.cases = [];
        for (;;) {
            switch (state.tokens.next.id) {
                case "case":
                    switch (state.funct["(verb)"]) {
                        case "yield":
                        case "break":
                        case "case":
                        case "continue":
                        case "return":
                        case "switch":
                        case "throw":
                            break;
                        default:
                            if (!state.tokens.curr.caseFallsThrough) {
                                warning("W086", state.tokens.curr, "case");
                            }
                    }
                    advance("case");
                    this.cases.push(expression(0));
                    increaseComplexityCount();
                    g = true;
                    advance(":");
                    state.funct["(verb)"] = "case";
                    break;
                case "default":
                    switch (state.funct["(verb)"]) {
                        case "yield":
                        case "break":
                        case "continue":
                        case "return":
                        case "throw":
                            break;
                        default:
                            if (this.cases.length) {
                                if (!state.tokens.curr.caseFallsThrough) {
                                    warning("W086", state.tokens.curr, "default");
                                }
                            }
                    }
                    advance("default");
                    g = true;
                    advance(":");
                    break;
                case "}":
                    if (!noindent)
                        indent -= state.option.indent;
                    advance("}", t);
                    state.funct["(breakage)"] -= 1;
                    state.funct["(verb)"] = void 0;
                    return;
                case "(end)":
                    error("E023", state.tokens.next, "}");
                    return;
                default:
                    indent += state.option.indent;
                    if (g) {
                        switch (state.tokens.curr.id) {
                            case ",":
                                error("E040");
                                return;
                            case ":":
                                g = false;
                                statements();
                                break;
                            default:
                                error("E025", state.tokens.curr);
                                return;
                        }
                    }
                    else {
                        if (state.tokens.curr.id === ":") {
                            advance(":");
                            error("E024", state.tokens.curr, ":");
                            statements();
                        }
                        else {
                            error("E021", state.tokens.next, "case", state.tokens.next.value);
                            return;
                        }
                    }
                    indent -= state.option.indent;
            }
        }
        return this;
    }).labelled = true;
    stmt("debugger", function () {
        if (!state.option.debug) {
            warning("W087", this);
        }
        return this;
    }).exps = true;
    (function () {
        var x = stmt("do", function () {
            state.funct["(breakage)"] += 1;
            state.funct["(loopage)"] += 1;
            increaseComplexityCount();
            this.first = block(true, true);
            advance("while");
            var t = state.tokens.next;
            advance("(");
            checkCondAssignment(expression(0));
            advance(")", t);
            state.funct["(breakage)"] -= 1;
            state.funct["(loopage)"] -= 1;
            return this;
        });
        x.labelled = true;
        x.exps = true;
    }());
    blockstmt("for", function () {
        var s, t = state.tokens.next;
        var letscope = false;
        var foreachtok = null;
        if (t.value === "each") {
            foreachtok = t;
            advance("each");
            if (!state.inMoz()) {
                warning("W118", state.tokens.curr, "for each");
            }
        }
        increaseComplexityCount();
        advance("(");
        var nextop;
        var i = 0;
        var inof = ["in", "of"];
        var level = 0;
        var comma;
        var initializer;
        if (checkPunctuators(state.tokens.next, ["{", "["]))
            ++level;
        do {
            nextop = peek(i);
            ++i;
            if (checkPunctuators(nextop, ["{", "["]))
                ++level;
            else if (checkPunctuators(nextop, ["}", "]"]))
                --level;
            if (level < 0)
                break;
            if (level === 0) {
                if (!comma && checkPunctuator(nextop, ","))
                    comma = nextop;
                else if (!initializer && checkPunctuator(nextop, "="))
                    initializer = nextop;
            }
        } while (level > 0 || !_.contains(inof, nextop.value) && nextop.value !== ";" &&
            nextop.type !== "(end)");
        if (_.contains(inof, nextop.value)) {
            if (!state.inES6() && nextop.value === "of") {
                warning("W104", nextop, "for of", "6");
            }
            var ok = !(initializer || comma);
            if (initializer) {
                error("W133", comma, nextop.value, "initializer is forbidden");
            }
            if (comma) {
                error("W133", comma, nextop.value, "more than one ForBinding");
            }
            if (state.tokens.next.id === "var") {
                advance("var");
                state.tokens.curr.fud({ prefix: true });
            }
            else if (state.tokens.next.id === "let" || state.tokens.next.id === "const") {
                advance(state.tokens.next.id);
                letscope = true;
                state.funct["(scope)"].stack();
                state.tokens.curr.fud({ prefix: true });
            }
            else {
                Object.create(varstatement).fud({ prefix: true, implied: "for", ignore: !ok });
            }
            advance(nextop.value);
            expression(20);
            advance(")", t);
            if (nextop.value === "in" && state.option.forin) {
                state.forinifcheckneeded = true;
                if (state.forinifchecks === void 0) {
                    state.forinifchecks = [];
                }
                state.forinifchecks.push({
                    type: "(none)"
                });
            }
            state.funct["(breakage)"] += 1;
            state.funct["(loopage)"] += 1;
            s = block(true, true);
            if (nextop.value === "in" && state.option.forin) {
                if (state.forinifchecks && state.forinifchecks.length > 0) {
                    var check = state.forinifchecks.pop();
                    if (s && s.length > 0 && (typeof s[0] !== "object" || s[0].value !== "if") ||
                        check.type === "(positive)" && s.length > 1 ||
                        check.type === "(negative)") {
                        warning("W089", this);
                    }
                }
                state.forinifcheckneeded = false;
            }
            state.funct["(breakage)"] -= 1;
            state.funct["(loopage)"] -= 1;
        }
        else {
            if (foreachtok) {
                error("E045", foreachtok);
            }
            if (state.tokens.next.id !== ";") {
                if (state.tokens.next.id === "var") {
                    advance("var");
                    state.tokens.curr.fud();
                }
                else if (state.tokens.next.id === "let") {
                    advance("let");
                    letscope = true;
                    state.funct["(scope)"].stack();
                    state.tokens.curr.fud();
                }
                else {
                    for (;;) {
                        expression(0, "for");
                        if (state.tokens.next.id !== ",") {
                            break;
                        }
                        comma();
                    }
                }
            }
            nolinebreak(state.tokens.curr);
            advance(";");
            state.funct["(loopage)"] += 1;
            if (state.tokens.next.id !== ";") {
                checkCondAssignment(expression(0));
            }
            nolinebreak(state.tokens.curr);
            advance(";");
            if (state.tokens.next.id === ";") {
                error("E021", state.tokens.next, ")", ";");
            }
            if (state.tokens.next.id !== ")") {
                for (;;) {
                    expression(0, "for");
                    if (state.tokens.next.id !== ",") {
                        break;
                    }
                    comma();
                }
            }
            advance(")", t);
            state.funct["(breakage)"] += 1;
            block(true, true);
            state.funct["(breakage)"] -= 1;
            state.funct["(loopage)"] -= 1;
        }
        if (letscope) {
            state.funct["(scope)"].unstack();
        }
        return this;
    }).labelled = true;
    stmt("break", function () {
        var v = state.tokens.next.value;
        if (!state.option.asi)
            nolinebreak(this);
        if (state.tokens.next.id !== ";" && !state.tokens.next.reach &&
            state.tokens.curr.line === startLine(state.tokens.next)) {
            if (!state.funct["(scope)"].funct.hasBreakLabel(v)) {
                warning("W090", state.tokens.next, v);
            }
            this.first = state.tokens.next;
            advance();
        }
        else {
            if (state.funct["(breakage)"] === 0)
                warning("W052", state.tokens.next, this.value);
        }
        reachable(this);
        return this;
    }).exps = true;
    stmt("continue", function () {
        var v = state.tokens.next.value;
        if (state.funct["(breakage)"] === 0)
            warning("W052", state.tokens.next, this.value);
        if (!state.funct["(loopage)"])
            warning("W052", state.tokens.next, this.value);
        if (!state.option.asi)
            nolinebreak(this);
        if (state.tokens.next.id !== ";" && !state.tokens.next.reach) {
            if (state.tokens.curr.line === startLine(state.tokens.next)) {
                if (!state.funct["(scope)"].funct.hasBreakLabel(v)) {
                    warning("W090", state.tokens.next, v);
                }
                this.first = state.tokens.next;
                advance();
            }
        }
        reachable(this);
        return this;
    }).exps = true;
    stmt("return", function () {
        if (this.line === startLine(state.tokens.next)) {
            if (state.tokens.next.id !== ";" && !state.tokens.next.reach) {
                this.first = expression(0);
                if (this.first &&
                    this.first.type === "(punctuator)" && this.first.value === "=" &&
                    !this.first.paren && !state.option.boss) {
                    warningAt("W093", this.first.line, this.first.character);
                }
            }
        }
        else {
            if (state.tokens.next.type === "(punctuator)" &&
                ["[", "{", "+", "-"].indexOf(state.tokens.next.value) > -1) {
                nolinebreak(this);
            }
        }
        reachable(this);
        return this;
    }).exps = true;
    (function (x) {
        x.exps = true;
        x.lbp = 25;
    }(prefix("yield", function () {
        var prev = state.tokens.prev;
        if (state.inES6(true) && !state.funct["(generator)"]) {
            if (!("(catch)" === state.funct["(name)"] && state.funct["(context)"]["(generator)"])) {
                error("E046", state.tokens.curr, "yield");
            }
        }
        else if (!state.inES6()) {
            warning("W104", state.tokens.curr, "yield", "6");
        }
        state.funct["(generator)"] = "yielded";
        var delegatingYield = false;
        if (state.tokens.next.value === "*") {
            delegatingYield = true;
            advance("*");
        }
        if (this.line === startLine(state.tokens.next) || !state.inMoz()) {
            if (delegatingYield ||
                (state.tokens.next.id !== ";" && !state.option.asi &&
                    !state.tokens.next.reach && state.tokens.next.nud)) {
                nobreaknonadjacent(state.tokens.curr, state.tokens.next);
                this.first = expression(10);
                if (this.first.type === "(punctuator)" && this.first.value === "=" &&
                    !this.first.paren && !state.option.boss) {
                    warningAt("W093", this.first.line, this.first.character);
                }
            }
            if (state.inMoz() && state.tokens.next.id !== ")" &&
                (prev.lbp > 30 || (!prev.assign && !isEndOfExpr()) || prev.id === "yield")) {
                error("E050", this);
            }
        }
        else if (!state.option.asi) {
            nolinebreak(this);
        }
        return this;
    })));
    stmt("throw", function () {
        nolinebreak(this);
        this.first = expression(20);
        reachable(this);
        return this;
    }).exps = true;
    stmt("import", function () {
        if (!state.inES6()) {
            warning("W119", state.tokens.curr, "import", "6");
        }
        if (state.tokens.next.type === "(string)") {
            advance("(string)");
            return this;
        }
        if (state.tokens.next.identifier) {
            this.name = identifier();
            state.funct["(scope)"].addlabel(this.name, {
                type: "const",
                token: state.tokens.curr
            });
            if (state.tokens.next.value === ",") {
                advance(",");
            }
            else {
                advance("from");
                advance("(string)");
                return this;
            }
        }
        if (state.tokens.next.id === "*") {
            advance("*");
            advance("as");
            if (state.tokens.next.identifier) {
                this.name = identifier();
                state.funct["(scope)"].addlabel(this.name, {
                    type: "const",
                    token: state.tokens.curr
                });
            }
        }
        else {
            advance("{");
            for (;;) {
                if (state.tokens.next.value === "}") {
                    advance("}");
                    break;
                }
                var importName;
                if (state.tokens.next.type === "default") {
                    importName = "default";
                    advance("default");
                }
                else {
                    importName = identifier();
                }
                if (state.tokens.next.value === "as") {
                    advance("as");
                    importName = identifier();
                }
                state.funct["(scope)"].addlabel(importName, {
                    type: "const",
                    token: state.tokens.curr
                });
                if (state.tokens.next.value === ",") {
                    advance(",");
                }
                else if (state.tokens.next.value === "}") {
                    advance("}");
                    break;
                }
                else {
                    error("E024", state.tokens.next, state.tokens.next.value);
                    break;
                }
            }
        }
        advance("from");
        advance("(string)");
        return this;
    }).exps = true;
    stmt("export", function () {
        var ok = true;
        var token;
        var identifier;
        if (!state.inES6()) {
            warning("W119", state.tokens.curr, "export", "6");
            ok = false;
        }
        if (!state.funct["(scope)"].block.isGlobal()) {
            error("E053", state.tokens.curr);
            ok = false;
        }
        if (state.tokens.next.value === "*") {
            advance("*");
            advance("from");
            advance("(string)");
            return this;
        }
        if (state.tokens.next.type === "default") {
            state.nameStack.set(state.tokens.next);
            advance("default");
            var exportType = state.tokens.next.id;
            if (exportType === "function" || exportType === "class") {
                this.block = true;
            }
            token = peek();
            expression(10);
            identifier = token.value;
            if (this.block) {
                state.funct["(scope)"].addlabel(identifier, {
                    type: exportType,
                    token: token
                });
                state.funct["(scope)"].setExported(identifier, token);
            }
            return this;
        }
        if (state.tokens.next.value === "{") {
            advance("{");
            var exportedTokens = [];
            for (;;) {
                if (!state.tokens.next.identifier) {
                    error("E030", state.tokens.next, state.tokens.next.value);
                }
                advance();
                exportedTokens.push(state.tokens.curr);
                if (state.tokens.next.value === "as") {
                    advance("as");
                    if (!state.tokens.next.identifier) {
                        error("E030", state.tokens.next, state.tokens.next.value);
                    }
                    advance();
                }
                if (state.tokens.next.value === ",") {
                    advance(",");
                }
                else if (state.tokens.next.value === "}") {
                    advance("}");
                    break;
                }
                else {
                    error("E024", state.tokens.next, state.tokens.next.value);
                    break;
                }
            }
            if (state.tokens.next.value === "from") {
                advance("from");
                advance("(string)");
            }
            else if (ok) {
                exportedTokens.forEach(function (token) {
                    state.funct["(scope)"].setExported(token.value, token);
                });
            }
            return this;
        }
        if (state.tokens.next.id === "var") {
            advance("var");
            state.tokens.curr.fud({ inexport: true });
        }
        else if (state.tokens.next.id === "let") {
            advance("let");
            state.tokens.curr.fud({ inexport: true });
        }
        else if (state.tokens.next.id === "const") {
            advance("const");
            state.tokens.curr.fud({ inexport: true });
        }
        else if (state.tokens.next.id === "function") {
            this.block = true;
            advance("function");
            state.syntax["function"].fud({ inexport: true });
        }
        else if (state.tokens.next.id === "class") {
            this.block = true;
            advance("class");
            var classNameToken = state.tokens.next;
            state.syntax["class"].fud();
            state.funct["(scope)"].setExported(classNameToken.value, classNameToken);
        }
        else {
            error("E024", state.tokens.next, state.tokens.next.value);
        }
        return this;
    }).exps = true;
    FutureReservedWord("abstract");
    FutureReservedWord("boolean");
    FutureReservedWord("byte");
    FutureReservedWord("char");
    FutureReservedWord("class", { es5: true, nud: classdef });
    FutureReservedWord("double");
    FutureReservedWord("enum", { es5: true });
    FutureReservedWord("export", { es5: true });
    FutureReservedWord("extends", { es5: true });
    FutureReservedWord("final");
    FutureReservedWord("float");
    FutureReservedWord("goto");
    FutureReservedWord("implements", { es5: true, strictOnly: true });
    FutureReservedWord("import", { es5: true });
    FutureReservedWord("int");
    FutureReservedWord("interface", { es5: true, strictOnly: true });
    FutureReservedWord("long");
    FutureReservedWord("native");
    FutureReservedWord("package", { es5: true, strictOnly: true });
    FutureReservedWord("private", { es5: true, strictOnly: true });
    FutureReservedWord("protected", { es5: true, strictOnly: true });
    FutureReservedWord("public", { es5: true, strictOnly: true });
    FutureReservedWord("short");
    FutureReservedWord("static", { es5: true, strictOnly: true });
    FutureReservedWord("super", { es5: true });
    FutureReservedWord("synchronized");
    FutureReservedWord("transient");
    FutureReservedWord("volatile");
    var lookupBlockType = function () {
        var pn, pn1, prev;
        var i = -1;
        var bracketStack = 0;
        var ret = {};
        if (checkPunctuators(state.tokens.curr, ["[", "{"])) {
            bracketStack += 1;
        }
        do {
            prev = i === -1 ? state.tokens.curr : pn;
            pn = i === -1 ? state.tokens.next : peek(i);
            pn1 = peek(i + 1);
            i = i + 1;
            if (checkPunctuators(pn, ["[", "{"])) {
                bracketStack += 1;
            }
            else if (checkPunctuators(pn, ["]", "}"])) {
                bracketStack -= 1;
            }
            if (bracketStack === 1 && pn.identifier && pn.value === "for" &&
                !checkPunctuator(prev, ".")) {
                ret.isCompArray = true;
                ret.notJson = true;
                break;
            }
            if (bracketStack === 0 && checkPunctuators(pn, ["}", "]"])) {
                if (pn1.value === "=") {
                    ret.isDestAssign = true;
                    ret.notJson = true;
                    break;
                }
                else if (pn1.value === ".") {
                    ret.notJson = true;
                    break;
                }
            }
            if (checkPunctuator(pn, ";")) {
                ret.isBlock = true;
                ret.notJson = true;
            }
        } while (bracketStack > 0 && pn.id !== "(end)");
        return ret;
    };
    function saveProperty(props, name, tkn, isClass, isStatic) {
        var msgs = ["key", "class method", "static class method"];
        var msg = msgs[(isClass || false) + (isStatic || false)];
        if (tkn.identifier) {
            name = tkn.value;
        }
        if (props[name] && name !== "__proto__") {
            warning("W075", state.tokens.next, msg, name);
        }
        else {
            props[name] = Object.create(null);
        }
        props[name].basic = true;
        props[name].basictkn = tkn;
    }
    function saveAccessor(accessorType, props, name, tkn, isClass, isStatic) {
        var flagName = accessorType === "get" ? "getterToken" : "setterToken";
        var msg = "";
        if (isClass) {
            if (isStatic) {
                msg += "static ";
            }
            msg += accessorType + "ter method";
        }
        else {
            msg = "key";
        }
        state.tokens.curr.accessorType = accessorType;
        state.nameStack.set(tkn);
        if (props[name]) {
            if ((props[name].basic || props[name][flagName]) && name !== "__proto__") {
                warning("W075", state.tokens.next, msg, name);
            }
        }
        else {
            props[name] = Object.create(null);
        }
        props[name][flagName] = tkn;
    }
    function computedPropertyName() {
        advance("[");
        if (!state.inES6()) {
            warning("W119", state.tokens.curr, "computed property names", "6");
        }
        var value = expression(10);
        advance("]");
        return value;
    }
    function checkPunctuators(token, values) {
        if (token.type === "(punctuator)") {
            return _.contains(values, token.value);
        }
        return false;
    }
    function checkPunctuator(token, value) {
        return token.type === "(punctuator)" && token.value === value;
    }
    function destructuringAssignOrJsonValue() {
        var block = lookupBlockType();
        if (block.notJson) {
            if (!state.inES6() && block.isDestAssign) {
                warning("W104", state.tokens.curr, "destructuring assignment", "6");
            }
            statements();
        }
        else {
            state.option.laxbreak = true;
            state.jsonMode = true;
            jsonValue();
        }
    }
    var arrayComprehension = function () {
        var CompArray = function () {
            this.mode = "use";
            this.variables = [];
        };
        var _carrays = [];
        var _current;
        function declare(v) {
            var l = _current.variables.filter(function (elt) {
                if (elt.value === v) {
                    elt.undef = false;
                    return v;
                }
            }).length;
            return l !== 0;
        }
        function use(v) {
            var l = _current.variables.filter(function (elt) {
                if (elt.value === v && !elt.undef) {
                    if (elt.unused === true) {
                        elt.unused = false;
                    }
                    return v;
                }
            }).length;
            return (l === 0);
        }
        return {
            stack: function () {
                _current = new CompArray();
                _carrays.push(_current);
            },
            unstack: function () {
                _current.variables.filter(function (v) {
                    if (v.unused)
                        warning("W098", v.token, v.raw_text || v.value);
                    if (v.undef)
                        state.funct["(scope)"].block.use(v.value, v.token);
                });
                _carrays.splice(-1, 1);
                _current = _carrays[_carrays.length - 1];
            },
            setState: function (s) {
                if (_.contains(["use", "define", "generate", "filter"], s))
                    _current.mode = s;
            },
            check: function (v) {
                if (!_current) {
                    return;
                }
                if (_current && _current.mode === "use") {
                    if (use(v)) {
                        _current.variables.push({
                            funct: state.funct,
                            token: state.tokens.curr,
                            value: v,
                            undef: true,
                            unused: false
                        });
                    }
                    return true;
                }
                else if (_current && _current.mode === "define") {
                    if (!declare(v)) {
                        _current.variables.push({
                            funct: state.funct,
                            token: state.tokens.curr,
                            value: v,
                            undef: false,
                            unused: true
                        });
                    }
                    return true;
                }
                else if (_current && _current.mode === "generate") {
                    state.funct["(scope)"].block.use(v, state.tokens.curr);
                    return true;
                }
                else if (_current && _current.mode === "filter") {
                    if (use(v)) {
                        state.funct["(scope)"].block.use(v, state.tokens.curr);
                    }
                    return true;
                }
                return false;
            }
        };
    };
    function jsonValue() {
        function jsonObject() {
            var o = {}, t = state.tokens.next;
            advance("{");
            if (state.tokens.next.id !== "}") {
                for (;;) {
                    if (state.tokens.next.id === "(end)") {
                        error("E026", state.tokens.next, t.line);
                    }
                    else if (state.tokens.next.id === "}") {
                        warning("W094", state.tokens.curr);
                        break;
                    }
                    else if (state.tokens.next.id === ",") {
                        error("E028", state.tokens.next);
                    }
                    else if (state.tokens.next.id !== "(string)") {
                        warning("W095", state.tokens.next, state.tokens.next.value);
                    }
                    if (o[state.tokens.next.value] === true) {
                        warning("W075", state.tokens.next, "key", state.tokens.next.value);
                    }
                    else if ((state.tokens.next.value === "__proto__" &&
                        !state.option.proto) || (state.tokens.next.value === "__iterator__" &&
                        !state.option.iterator)) {
                        warning("W096", state.tokens.next, state.tokens.next.value);
                    }
                    else {
                        o[state.tokens.next.value] = true;
                    }
                    advance();
                    advance(":");
                    jsonValue();
                    if (state.tokens.next.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("}");
        }
        function jsonArray() {
            var t = state.tokens.next;
            advance("[");
            if (state.tokens.next.id !== "]") {
                for (;;) {
                    if (state.tokens.next.id === "(end)") {
                        error("E027", state.tokens.next, t.line);
                    }
                    else if (state.tokens.next.id === "]") {
                        warning("W094", state.tokens.curr);
                        break;
                    }
                    else if (state.tokens.next.id === ",") {
                        error("E028", state.tokens.next);
                    }
                    jsonValue();
                    if (state.tokens.next.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("]");
        }
        switch (state.tokens.next.id) {
            case "{":
                jsonObject();
                break;
            case "[":
                jsonArray();
                break;
            case "true":
            case "false":
            case "null":
            case "(number)":
            case "(string)":
                advance();
                break;
            case "-":
                advance("-");
                advance("(number)");
                break;
            default:
                error("E003", state.tokens.next);
        }
    }
    var escapeRegex = function (str) {
        return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    };
    var itself = function (s, o, g) {
        var i, k, x, reIgnoreStr, reIgnore;
        var optionKeys;
        var newOptionObj = {};
        var newIgnoredObj = {};
        o = _.clone(o);
        state.reset();
        if (o && o.scope) {
            JSHINT.scope = o.scope;
        }
        else {
            JSHINT.errors = [];
            JSHINT.undefs = [];
            JSHINT.internals = [];
            JSHINT.blacklist = {};
            JSHINT.scope = "(main)";
        }
        predefined = Object.create(null);
        combine(predefined, ecmaIdentifiers[3]);
        combine(predefined, reservedVars);
        combine(predefined, g || {});
        declared = Object.create(null);
        var exported = Object.create(null);
        function each(obj, cb) {
            if (!obj)
                return;
            if (!Array.isArray(obj) && typeof obj === "object")
                obj = Object.keys(obj);
            obj.forEach(cb);
        }
        if (o) {
            each(o.predef || null, function (item) {
                var slice, prop;
                if (item[0] === "-") {
                    slice = item.slice(1);
                    JSHINT.blacklist[slice] = slice;
                    delete predefined[slice];
                }
                else {
                    prop = Object.getOwnPropertyDescriptor(o.predef, item);
                    predefined[item] = prop ? prop.value : false;
                }
            });
            each(o.exported || null, function (item) {
                exported[item] = true;
            });
            delete o.predef;
            delete o.exported;
            optionKeys = Object.keys(o);
            for (x = 0; x < optionKeys.length; x++) {
                if (/^-W\d{3}$/g.test(optionKeys[x])) {
                    newIgnoredObj[optionKeys[x].slice(1)] = true;
                }
                else {
                    var optionKey = optionKeys[x];
                    newOptionObj[optionKey] = o[optionKey];
                    if ((optionKey === "esversion" && o[optionKey] === 5) ||
                        (optionKey === "es5" && o[optionKey])) {
                        warningAt("I003", 0, 0);
                    }
                }
            }
        }
        state.option = newOptionObj;
        state.ignored = newIgnoredObj;
        state.option.indent = state.option.indent || 4;
        state.option.maxerr = state.option.maxerr || 50;
        indent = 1;
        var scopeManagerInst = scopeManager(state, predefined, exported, declared);
        scopeManagerInst.on("warning", function (ev) {
            warning.apply(null, [ev.code, ev.token].concat(ev.data));
        });
        scopeManagerInst.on("error", function (ev) {
            error.apply(null, [ev.code, ev.token].concat(ev.data));
        });
        state.funct = functor("(global)", null, {
            "(global)": true,
            "(scope)": scopeManagerInst,
            "(comparray)": arrayComprehension(),
            "(metrics)": createMetrics(state.tokens.next)
        });
        functions = [state.funct];
        urls = [];
        stack = null;
        member = {};
        membersOnly = null;
        inblock = false;
        lookahead = [];
        if (!isString(s) && !Array.isArray(s)) {
            errorAt("E004", 0);
            return false;
        }
        api = {
            get isJSON() {
                return state.jsonMode;
            },
            getOption: function (name) {
                return state.option[name] || null;
            },
            getCache: function (name) {
                return state.cache[name];
            },
            setCache: function (name, value) {
                state.cache[name] = value;
            },
            warn: function (code, data) {
                warningAt.apply(null, [code, data.line, data.char].concat(data.data));
            },
            on: function (names, listener) {
                names.split(" ").forEach(function (name) {
                    emitter.on(name, listener);
                }.bind(this));
            }
        };
        emitter.removeAllListeners();
        (extraModules || []).forEach(function (func) {
            func(api);
        });
        state.tokens.prev = state.tokens.curr = state.tokens.next = state.syntax["(begin)"];
        if (o && o.ignoreDelimiters) {
            if (!Array.isArray(o.ignoreDelimiters)) {
                o.ignoreDelimiters = [o.ignoreDelimiters];
            }
            o.ignoreDelimiters.forEach(function (delimiterPair) {
                if (!delimiterPair.start || !delimiterPair.end)
                    return;
                reIgnoreStr = escapeRegex(delimiterPair.start) +
                    "[\\s\\S]*?" +
                    escapeRegex(delimiterPair.end);
                reIgnore = new RegExp(reIgnoreStr, "ig");
                s = s.replace(reIgnore, function (match) {
                    return match.replace(/./g, " ");
                });
            });
        }
        lex = new Lexer(s);
        lex.on("warning", function (ev) {
            warningAt.apply(null, [ev.code, ev.line, ev.character].concat(ev.data));
        });
        lex.on("error", function (ev) {
            errorAt.apply(null, [ev.code, ev.line, ev.character].concat(ev.data));
        });
        lex.on("fatal", function (ev) {
            quit("E041", ev);
        });
        lex.on("Identifier", function (ev) {
            emitter.emit("Identifier", ev);
        });
        lex.on("String", function (ev) {
            emitter.emit("String", ev);
        });
        lex.on("Number", function (ev) {
            emitter.emit("Number", ev);
        });
        lex.start();
        for (var name in o) {
            if (_.has(o, name)) {
                checkOption(name, state.tokens.curr);
            }
        }
        try {
            assume();
            combine(predefined, g || {});
            comma['first'] = true;
            advance();
            switch (state.tokens.next.id) {
                case "{":
                case "[":
                    destructuringAssignOrJsonValue();
                    break;
                default:
                    directives();
                    if (state.directive["use strict"]) {
                        if (state.option.strict !== "global" &&
                            !((state.option.strict === true || !state.option.strict) &&
                                (state.option.globalstrict || state.option.module || state.option.node ||
                                    state.option.phantom || state.option.browserify))) {
                            warning("W097", state.tokens.prev);
                        }
                    }
                    statements();
            }
            if (state.tokens.next.id !== "(end)") {
                quit("E041", state.tokens.curr);
            }
            state.funct["(scope)"].unstack();
        }
        catch (err) {
            if (err && err.name === "JSHintError") {
                var nt = state.tokens.next || {};
                JSHINT.errors.push({
                    scope: "(main)",
                    raw: err.raw,
                    code: err.code,
                    reason: err.reason,
                    line: err.line || nt.line,
                    character: err.character || nt.from
                }, null);
            }
            else {
                throw err;
            }
        }
        if (JSHINT.scope === "(main)") {
            o = o || {};
            for (i = 0; i < JSHINT.internals.length; i += 1) {
                k = JSHINT.internals[i];
                o.scope = k.elem;
                itself(k.value, o, g);
            }
        }
        return JSHINT.errors.length === 0;
    };
    itself.addModule = function (func) {
        extraModules.push(func);
    };
    itself.addModule(register);
    itself.data = function () {
        var data = {
            functions: [],
            options: state.option
        };
        var fu, f, i, j, n, globals;
        if (itself.errors.length) {
            data.errors = itself.errors;
        }
        if (state.jsonMode) {
            data.json = true;
        }
        var impliedGlobals = state.funct["(scope)"].getImpliedGlobals();
        if (impliedGlobals.length > 0) {
            data.implieds = impliedGlobals;
        }
        if (urls.length > 0) {
            data.urls = urls;
        }
        globals = state.funct["(scope)"].getUsedOrDefinedGlobals();
        if (globals.length > 0) {
            data.globals = globals;
        }
        for (i = 1; i < functions.length; i += 1) {
            f = functions[i];
            fu = {};
            for (j = 0; j < functionicity.length; j += 1) {
                fu[functionicity[j]] = [];
            }
            for (j = 0; j < functionicity.length; j += 1) {
                if (fu[functionicity[j]].length === 0) {
                    delete fu[functionicity[j]];
                }
            }
            fu.name = f["(name)"];
            fu.param = f["(params)"];
            fu.line = f["(line)"];
            fu.character = f["(character)"];
            fu.last = f["(last)"];
            fu.lastcharacter = f["(lastcharacter)"];
            fu.metrics = {
                complexity: f["(metrics)"].ComplexityCount,
                parameters: f["(metrics)"].arity,
                statements: f["(metrics)"].statementCount
            };
            data.functions.push(fu);
        }
        var unuseds = state.funct["(scope)"].getUnuseds();
        if (unuseds.length > 0) {
            data.unused = unuseds;
        }
        for (n in member) {
            if (typeof member[n] === "number") {
                data.member = member;
                break;
            }
        }
        return data;
    };
    itself.jshint = itself;
    return itself;
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNoaW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21vZGUvamF2YXNjcmlwdC9qc2hpbnQudHMiXSwibmFtZXMiOlsiY2hlY2tPcHRpb24iLCJpc1N0cmluZyIsImlzSWRlbnRpZmllciIsImlzUmVzZXJ2ZWQiLCJzdXBwbGFudCIsImNvbWJpbmUiLCJwcm9jZXNzZW5mb3JjZWFsbCIsImFzc3VtZSIsInF1aXQiLCJyZW1vdmVJZ25vcmVkTWVzc2FnZXMiLCJ3YXJuaW5nIiwid2FybmluZ0F0IiwiZXJyb3IiLCJlcnJvckF0IiwiYWRkSW50ZXJuYWxTcmMiLCJkb09wdGlvbiIsInBlZWsiLCJwZWVrSWdub3JlRU9MIiwiYWR2YW5jZSIsImlzSW5maXgiLCJpc0VuZE9mRXhwciIsImlzQmVnaW5PZkV4cHIiLCJleHByZXNzaW9uIiwic3RhcnRMaW5lIiwibm9icmVha25vbmFkamFjZW50Iiwibm9saW5lYnJlYWsiLCJub2JyZWFrY29tbWEiLCJjb21tYSIsInN5bWJvbCIsImRlbGltIiwic3RtdCIsImJsb2Nrc3RtdCIsInJlc2VydmVOYW1lIiwicHJlZml4IiwidHlwZSIsInJlc2VydmUiLCJGdXR1cmVSZXNlcnZlZFdvcmQiLCJyZXNlcnZldmFyIiwiaW5maXgiLCJhcHBsaWNhdGlvbiIsInJlbGF0aW9uIiwiaXNQb29yUmVsYXRpb24iLCJpc1R5cG9UeXBlb2YiLCJpc0dsb2JhbEV2YWwiLCJmaW5kTmF0aXZlUHJvdG90eXBlIiwiZmluZE5hdGl2ZVByb3RvdHlwZS53YWxrUHJvdG90eXBlIiwiZmluZE5hdGl2ZVByb3RvdHlwZS53YWxrTmF0aXZlIiwiY2hlY2tMZWZ0U2lkZUFzc2lnbiIsImFzc2lnbm9wIiwiYml0d2lzZSIsImJpdHdpc2Vhc3NpZ25vcCIsInN1ZmZpeCIsIm9wdGlvbmFsaWRlbnRpZmllciIsImlkZW50aWZpZXIiLCJyZWFjaGFibGUiLCJwYXJzZUZpbmFsU2VtaWNvbG9uIiwic3RhdGVtZW50Iiwic3RhdGVtZW50cyIsImRpcmVjdGl2ZXMiLCJibG9jayIsImNvdW50TWVtYmVyIiwiY29tcHJlaGVuc2l2ZUFycmF5RXhwcmVzc2lvbiIsImlzTWV0aG9kIiwiaXNQcm9wZXJ0eU5hbWUiLCJwcm9wZXJ0eU5hbWUiLCJmdW5jdGlvbnBhcmFtcyIsImZ1bmN0aW9ucGFyYW1zLmFkZFBhcmFtIiwiZnVuY3RvciIsImlzRnVuY3RvciIsImhhc1BhcnNlZENvZGUiLCJkb1RlbXBsYXRlTGl0ZXJhbCIsImRvVGVtcGxhdGVMaXRlcmFsLmVuZCIsImRvRnVuY3Rpb24iLCJjcmVhdGVNZXRyaWNzIiwiaW5jcmVhc2VDb21wbGV4aXR5Q291bnQiLCJjaGVja0NvbmRBc3NpZ25tZW50IiwiY2hlY2tQcm9wZXJ0aWVzIiwibWV0YVByb3BlcnR5IiwiZGVzdHJ1Y3R1cmluZ1BhdHRlcm4iLCJkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZSIsImRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2giLCJibG9ja1ZhcmlhYmxlU3RhdGVtZW50IiwiY2xhc3NkZWYiLCJjbGFzc3RhaWwiLCJjbGFzc2JvZHkiLCJkb0NhdGNoIiwic2F2ZVByb3BlcnR5Iiwic2F2ZUFjY2Vzc29yIiwiY29tcHV0ZWRQcm9wZXJ0eU5hbWUiLCJjaGVja1B1bmN0dWF0b3JzIiwiY2hlY2tQdW5jdHVhdG9yIiwiZGVzdHJ1Y3R1cmluZ0Fzc2lnbk9ySnNvblZhbHVlIiwiZGVjbGFyZSIsInVzZSIsImpzb25WYWx1ZSIsImpzb25WYWx1ZS5qc29uT2JqZWN0IiwianNvblZhbHVlLmpzb25BcnJheSIsImVhY2giLCJpc0pTT04iXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBNEJHO09BS0ksWUFBWSxNQUFNLGdCQUFnQjtPQUNsQyxFQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFFBQVEs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QUFHQSxDQUFDQTtZQUNMQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUVqQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsS0FBS0EsS0FBS0EsQ0FBQ0E7WUFDdkNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBRWpCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFRCxvQkFBb0IsS0FBSztRQUNyQkMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQTtRQUNEQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUV0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVyREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1lBQ2pCQSxDQUFDQTtZQUlEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUM1Q0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ2pCQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkJBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1lBQ2pCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFFRCxrQkFBa0IsR0FBRyxFQUFFLElBQUk7UUFDdkJDLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLEVBQUVBLFVBQVNBLENBQUNBLEVBQUVBLENBQUNBO1lBQzdDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNoQixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssUUFBUSxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xFLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFRCxpQkFBaUIsSUFBSSxFQUFFLEdBQUc7UUFDdEJDLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLElBQUlBO1lBQ2xDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFBQyxNQUFNLENBQUM7WUFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUNBLENBQUNBO0lBQ1BBLENBQUNBO0lBRUQ7UUFDSUMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsS0FBS0EsQ0FBQ0E7b0JBQ25DQSxDQUFDQSxZQUFZQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDNUJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFDREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDcENBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBO2dCQUNuQ0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRDtRQUNJQyxpQkFBaUJBLEVBQUVBLENBQUNBO1FBS3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMvQkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMvQkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1lBQy9CQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7UUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsUUFBUUEsSUFBSUEsY0FBY0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLFFBQVFBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1FBQzlEQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7WUFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1lBQzdCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDbkNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM3QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM3QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO1lBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBO1lBQ25DQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2hDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDbENBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxZQUFZQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3REEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbkNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUdELGNBQWMsSUFBWSxFQUFFLEtBQUssRUFBRSxDQUFFLEVBQUUsQ0FBRTtRQUNyQ0MsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDckVBLElBQUlBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBRWhDQSxJQUFJQSxTQUFTQSxHQUFHQTtZQUNaQSxJQUFJQSxFQUFFQSxhQUFhQTtZQUNuQkEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUE7WUFDaEJBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLElBQUlBO1lBQ3JCQSxPQUFPQSxFQUFFQSxPQUFPQSxHQUFHQSxJQUFJQSxHQUFHQSxVQUFVQSxHQUFHQSxhQUFhQTtZQUNwREEsR0FBR0EsRUFBRUEsT0FBT0E7WUFDWkEsSUFBSUEsRUFBRUEsSUFBSUE7WUFDVkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDSkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDSkEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0E7U0FDakJBLENBQUNBO1FBRUZBLFNBQVNBLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLFVBQVVBO1lBQy9EQSxhQUFhQSxDQUFDQTtRQUVsQkEsTUFBTUEsU0FBU0EsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBRUQ7UUFDSUMsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFFakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQUNBLE1BQU1BLENBQUNBO1FBQy9CQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFTQSxHQUFHQSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUMsQ0FBQyxDQUFDQSxDQUFDQTtJQUN4RkEsQ0FBQ0E7SUFFRCxpQkFBaUIsSUFBWSxFQUFFLENBQUUsRUFBRSxDQUFFLEVBQUUsQ0FBRSxFQUFFLENBQUUsRUFBRSxDQUFFO1FBQzdDQyxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQTtRQUVsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNwQkEsTUFBTUEsQ0FBQ0E7WUFFWEEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDekJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUVEQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNYQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUVaQSxDQUFDQSxHQUFHQTtZQUNBQSxFQUFFQSxFQUFFQSxTQUFTQTtZQUNiQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxJQUFJQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxJQUFJQTtZQUNkQSxRQUFRQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxFQUFFQTtZQUNsQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDUEEsU0FBU0EsRUFBRUEsRUFBRUE7WUFDYkEsS0FBS0EsRUFBRUEsTUFBTUEsQ0FBQ0EsS0FBS0E7WUFDbkJBLENBQUNBLEVBQUVBLENBQUNBO1lBQ0pBLENBQUNBLEVBQUVBLENBQUNBO1lBQ0pBLENBQUNBLEVBQUVBLENBQUNBO1lBQ0pBLENBQUNBLEVBQUVBLENBQUNBO1NBQ1BBLENBQUNBO1FBRUZBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2pDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV0QkEscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUV4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0Es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QTtZQUNWQSxLQUFLQSxHQUFHQTtnQkFDSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxHQUFHQTtnQkFDSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtRQUNkQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUNuQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoRkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsS0FBS0EsY0FBY0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JGQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDdENBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ3RDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUVyREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pFQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQzlCQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO29CQUM3Q0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDOUNBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ2ZBLENBQUNBO1lBQ0xBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkNBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVELGlCQUFpQixLQUFLO1FBQ2xCQyxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxJQUFJQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNoRkEsQ0FBQ0E7SUFFRDtRQUNJQyxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUM3QkEsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFFRCx1QkFBdUIsSUFBSTtRQUN2QkMsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsT0FBT0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBZ0JELG9CQUFvQixHQUFHLEVBQUUsT0FBUTtRQUM3QkMsSUFBSUEsSUFBSUEsRUFBRUEsT0FBT0EsR0FBR0EsS0FBS0EsRUFBRUEsUUFBUUEsR0FBR0EsS0FBS0EsRUFBRUEsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFFL0RBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBR3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQTtZQUNEQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUVqQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ2ZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ3hCQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsQ0FBQ0E7WUFDakNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRXJDQSxJQUFJQSxXQUFXQSxHQUNYQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQTtZQUNoQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsS0FBS0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDdkRBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO1lBQzVDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDWkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFN0RBLE9BQU9BLEVBQUVBLENBQUNBO1FBRVZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ2hEQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ25DQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDM0RBLENBQUNBO1lBR0RBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLFlBQVlBLENBQUNBO2dCQUMzRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxPQUFPQSxDQUFDQTtnQkFDOUNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLFFBQVFBLENBQUNBO2dCQUtoREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBSTNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQTt3QkFDcEJBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUMvREEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0E7d0JBR2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDekNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO3dCQUNyQkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsT0FBT0EsRUFBRUEsQ0FBQ0E7Z0JBRVZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMxRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxDQUFDQTtnQkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFB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RUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLFlBQVlBLEdBQUdBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBO2dCQUNiQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFJMUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzVEQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsV0FBV0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JFQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNqQ0EsQ0FBQ0E7WUFFREEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ2hCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0Esa0JBQWtCQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOURBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLENBQUNBO29CQUNwRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDUCxLQUFLLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3ZELENBQUM7Z0JBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtZQUNQQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtnQkFDakNBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxXQUFXQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDOURBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO2dCQUNqQ0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFFREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0RBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtZQUNEQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxN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Q0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDaENBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsQ0FBQ0E7b0JBQ0RBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtnQkFFREEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEO1FBQ0lDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBRS9CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtnQkFBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFFbkRBLElBQUlBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBO2dCQUNsRUEsS0FBS0EsQ0FB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RUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFFbEZBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDekVBLENBQUNBO1lBRURBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ2xDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFRZkEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbkZBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3hDQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUlEQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsVUFBVUEsQ0FBQ0E7WUFDOUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLGNBQWNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBO2dCQUNqQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeERBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBO2dCQUNqQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN2Q0EsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xGQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFLREEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0lBQ2JBLENBQUNBO0lBR0Q7UUFDSUMsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFZEEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDbEVBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBRVhBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUN2Q0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxDQUFDQTtnQkFFREEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUN4QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFRRDtRQUNJQyxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtRQUViQSxPQUFPQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxVQUFVQSxFQUFFQSxDQUFDQTtZQUN6Q0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDTkEsR0FBR0EsQ0FBQ0E7b0JBQ0FBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO2dCQUNuQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsS0FBS0EsV0FBV0EsRUFBRUE7Z0JBQ2hDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEJBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNYQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRTlDQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUUvQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0QkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBO1lBRURBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ1ZBLElBQUlBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDMUJBLENBQUNBLFNBQVNBLEtBQUtBLFlBQVlBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLENBQUNBO1lBR0RBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1lBRWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFhRCxlQUFlLFFBQWlCLEVBQUUsSUFBYyxFQUFFLE1BQWdCLEVBQUUsVUFBb0IsRUFBRSxNQUFnQjtRQUN0R0MsSUFBSUEsQ0FBQ0EsRUFDREEsQ0FBQ0EsR0FBR0EsT0FBT0EsRUFDWEEsVUFBVUEsR0FBR0EsTUFBTUEsRUFDbkJBLENBQUNBLEVBQ0RBLENBQUNBLEVBQ0RBLElBQUlBLEVBQ0pBLENBQUNBLENBQUNBO1FBRU5BLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FBRW5CQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUV0QkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLE9BQU9BLENBQUNBLGdCQUFnQkEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLE9BQU9BLENBQUNBLG9DQUFvQ0EsRUFBRUEsQ0FBQ0E7UUFFL0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUdiQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUMvQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUUxQ0EsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQzlCQSxPQUFPQSxDQUFDQSxRQUFRQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxFQUFFQSxDQUFDQTtvQkFDbERBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNUQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtvQkFDUEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDNUJBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM5QkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO29CQUNEQSxVQUFVQSxFQUFFQSxDQUFDQTtvQkFFYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzlEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDeENBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNwQkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsQ0FBQ0EsR0FBR0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBRWpCQSxPQUFPQSxDQUFDQSxjQUFjQSxJQUFJQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFFbkNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2xDQSxDQUFDQTtZQUVEQSxPQUFPQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO2dCQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLEtBQUtBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN4QkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFFakNBLE1BQU1BLEdBQUdBLFVBQVVBLENBQUNBO1FBQ3hCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO2dCQUUvQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBQ1BBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUN4Q0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsOEJBQThCQSxDQUFDQSxDQUFDQTtnQkFDckVBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDUkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDNUJBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM5QkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFDREEsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBRWZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3hDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFDcEJBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDckNBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNuRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFJSkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxLQUFLQSxDQUFDQTtZQUNuRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFFL0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLENBQUNBO1lBRURBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDMUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBRTlCQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUNsQkEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFFOUJBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ2pDQSxPQUFPQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO1FBQzdDQSxDQUFDQTtRQUdEQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsS0FBS0EsT0FBT0EsQ0FBQ0E7WUFDYkEsS0FBS0EsVUFBVUEsQ0FBQ0E7WUFDaEJBLEtBQUtBLFFBQVFBLENBQUNBO1lBQ2RBLEtBQUtBLE9BQU9BO2dCQUNSQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDVEEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO1lBR0xBO2dCQUNJQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFFREEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNB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QUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNO1lBQzVCLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLE1BQU0sSUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssTUFBTSxDQUFDLENBQUM7UUFFM0UsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUMzQixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkMsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9CLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUNILFFBQVEsQ0FBQyxLQUFLLEVBQUUsVUFBUyxJQUFJLEVBQUUsS0FBSztRQUNoQyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUNILFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNkLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNkLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNmLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNmLE9BQU8sQ0FBQyxJQUFJLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2pDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDMUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdkIsS0FBSyxDQUFDLFlBQVksRUFBRSxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdkMsS0FBSyxDQUFDLEdBQUcsRUFBRSxVQUFTLElBQUksRUFBRSxJQUFJO1FBQzFCLElBQUksS0FBSyxDQUFDO1FBQ1YsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXJDLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxVQUFVLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQztZQUMxQixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFDakMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVELE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDMUIsQ0FBQztZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ1IsTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNuQixNQUFNLENBQUMsS0FBSyxFQUFFO1FBQ1YsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hCLElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDO1FBQ3JCLElBQUksQ0FBQyxLQUFLLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzdCLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsS0FBSyxFQUFFLFVBQVMsSUFBSTtRQUN0QixPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDUixLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztJQUN2QixNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ25CLE1BQU0sQ0FBQyxLQUFLLEVBQUU7UUFDVixPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEIsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxLQUFLLEVBQUUsVUFBUyxJQUFJO1FBQ3RCLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNSLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3hCLEtBQUssQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZCLEtBQUssQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRXZCLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNiLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdkIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBRS9CLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNiLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDdkIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQy9CLE1BQU0sQ0FBQyxRQUFRLEVBQUU7UUFDYixJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNoQixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQy9CLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7UUFJZixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxDQUFDLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUMxQixDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBRWYsTUFBTSxDQUFDLEdBQUcsRUFBRTtRQUNSLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUN2QixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBQ0QsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sQ0FBQyxLQUFLLEVBQUU7UUFDVixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLHNCQUFzQixFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFpQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVO1lBQzdCLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxVQUFVO1lBQ3JDLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFbkQsS0FBSyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsR0FBRyxFQUFFO1FBQ1IsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUM7UUFDckIsSUFBSSxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFN0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNkLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdkIsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDL0IsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQztRQUU1QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUM7UUFJRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNmLENBQUMsQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQzFCLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDSixNQUFNLENBQUMsS0FBSyxFQUFFO1FBQ1YsSUFBSSxFQUFFLEdBQUcsWUFBWSxDQUFDLFFBQVEsRUFBRTtZQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNyQixPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQztZQUMxRCxDQUFDO1lBQ0QsSUFBSSxVQUFVLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDaEMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDUCxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzVCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFBQyxLQUFLLENBQUM7Z0JBQUMsQ0FBQztnQkFDN0IsQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUN2QixDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUNkLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDckQsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFBQyxDQUFDO1FBRXRCLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQztZQUMzQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDZixDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDZCxLQUFLLFFBQVEsQ0FBQztvQkFDZCxLQUFLLFFBQVEsQ0FBQztvQkFDZCxLQUFLLFNBQVMsQ0FBQztvQkFDZixLQUFLLE1BQU0sQ0FBQztvQkFDWixLQUFLLE1BQU07d0JBQ1AsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQzVDLEtBQUssQ0FBQztvQkFDVixLQUFLLFFBQVE7d0JBQ1QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQzs0QkFDaEIsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ2hELENBQUM7d0JBQ0QsS0FBSyxDQUFDO29CQUNWLEtBQUssVUFBVTt3QkFDWCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzs0QkFDckIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUNwQixDQUFDO3dCQUNELEtBQUssQ0FBQztvQkFDVixLQUFLLE1BQU0sQ0FBQztvQkFDWixLQUFLLFFBQVEsQ0FBQztvQkFDZCxLQUFLLE1BQU07d0JBQ1AsS0FBSyxDQUFDO29CQUNWO3dCQUNJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQzs0QkFDdEIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQzs0QkFDekIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7Z0NBQzNDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQ0FDaEQsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDOzRCQUN2QyxDQUFDO3dCQUNMLENBQUM7Z0JBQ1QsQ0FBQztZQUNMLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQy9DLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDdkMsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO2dCQUN2QixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlCLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUNELElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDNUIsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUVoQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUUzQixLQUFLLENBQUMsR0FBRyxFQUFFLFVBQVMsSUFBSSxFQUFFLElBQUk7UUFDMUIsSUFBSSxDQUFDLEdBQUcsVUFBVSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVoQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNuQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFZixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLGdCQUFnQixJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2pFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssV0FBVyxJQUFJLENBQUMsQ0FBQyxLQUFLLFFBQVEsSUFBSSxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNuQixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN0QixLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFVBQVU7WUFDOUQsQ0FBQyxDQUFDLEtBQUssT0FBTyxJQUFJLENBQUMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsS0FBSyxNQUFNLElBQUksQ0FBQyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RCxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNUIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3BCLENBQUM7UUFDTCxDQUFDO1FBRUQsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRWQsS0FBSyxDQUFDLEdBQUcsRUFBRSxVQUFTLElBQUksRUFBRSxJQUFJO1FBQzFCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBRUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1YsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBRVgsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNQLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDL0IsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQy9ELEVBQUUsQ0FBQyxDQUFDLHNEQUFzRCxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNwRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7NEJBQ3hCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQzFCLENBQUM7d0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzs0QkFDN0IsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDMUIsQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQy9CLEdBQUcsQ0FBQyxDQUFDLElBQUssQ0FBQztnQkFDUCxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDUCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDL0IsS0FBSyxDQUFDO2dCQUNWLENBQUM7Z0JBQ0QsS0FBSyxFQUFFLENBQUM7WUFDWixDQUFDO1FBQ0wsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUViLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxVQUFVLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLEtBQUssTUFBTSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssVUFBVTtvQkFDbEQsSUFBSSxDQUFDLEtBQUssS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUM5QixPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUV0QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUNqQyxjQUFjLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDckMsQ0FBQztnQkFDTCxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVO29CQUNyQyxDQUFDLElBQUksQ0FBQyxLQUFLLEtBQUssWUFBWTt3QkFDeEIsSUFBSSxDQUFDLEtBQUssS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ3RCLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUdyQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVO29CQUNyQyxJQUFJLENBQUMsS0FBSyxLQUFLLEdBQUc7b0JBQ2xCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLFFBQVE7b0JBQzVCLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxZQUFZO3dCQUN4QixJQUFJLENBQUMsS0FBSyxLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDcEMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDdEIsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JDLENBQUM7WUFDTCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssSUFBSTtnQkFDMUUsSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxJQUFJLElBQUksSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHO2dCQUMxRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckMsT0FBTyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMxQixDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBRTFCLE1BQU0sQ0FBQyxHQUFHLEVBQUU7UUFDUixJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksR0FBRyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDO1FBQ3BDLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ2hDLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ25DLElBQUksV0FBVyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFFN0MsR0FBRyxDQUFDO1lBQ0EsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixNQUFNLElBQUksQ0FBQyxDQUFDO1lBQ2hCLENBQUM7WUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixNQUFNLElBQUksQ0FBQyxDQUFDO1lBQ2hCLENBQUM7WUFFRCxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ1AsR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUNULEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssS0FBSyxHQUFHLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUU7UUFFMUYsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdEMsYUFBYSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDbkQsQ0FBQztRQUtELEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsVUFBVSxDQUFDLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBRUQsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBRWYsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDL0IsR0FBRyxDQUFDLENBQUMsSUFBSyxDQUFDO2dCQUNQLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBRTNCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUMvQixLQUFLLENBQUM7Z0JBQ1YsQ0FBQztnQkFFRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEIsQ0FBQztnQkFFRCxLQUFLLEVBQUUsQ0FBQztZQUNaLENBQUM7UUFDTCxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQy9ELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHO2dCQUM1QixLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMvRCxPQUFPLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzFCLENBQUM7UUFDTCxDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQixNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25CLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN2QyxHQUFHLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUVsQixLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUvQixFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2YsV0FBVyxHQUFHLFVBQVUsQ0FBQyxNQUFNLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQztZQUN4RCxDQUFDO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osR0FBRyxHQUFHLEtBQUssR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDZixXQUFXO29CQUdQLENBQUMsT0FBTyxDQUFDLFVBQVUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLGFBQWEsSUFBSSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFHM0UsQ0FBQyxhQUFhOzRCQUtWLENBQUMsQ0FBQyxXQUFXLEVBQUUsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLENBQUM7d0JBR3JELENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBRWxDLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUM7d0JBRzFDLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxVQUFVOzRCQUNwQixlQUFlLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDakUsQ0FBQztRQUNMLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBSU4sRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDM0QsV0FBVztvQkFDUCxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxHQUFHLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQzt3QkFDM0QsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUVELEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDZixPQUFPLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFFRCxHQUFHLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNyQixDQUFDO1FBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmLENBQUMsQ0FBQyxDQUFDO0lBRUgsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWxCLEtBQUssQ0FBQyxHQUFHLEVBQUUsVUFBUyxJQUFJLEVBQUUsSUFBSTtRQUMxQixJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDN0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssTUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN6RSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNwQixDQUFDO1lBQ0wsQ0FBQztZQUVELFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEQsQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNoRCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFDRCxPQUFPLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRW5CLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxLQUFLLGdCQUFnQixJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3ZFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZixNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFFZDtRQUNJQyxJQUFJQSxHQUFHQSxHQUFxQ0EsRUFBRUEsQ0FBQ0E7UUFDL0NBLEdBQUdBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtRQUduQ0EsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BDQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN2RUEsQ0FBQ0E7WUFDREEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLEdBQUdBLENBQUNBLEtBQUtBLEdBQUdBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNmQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzlDQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcERBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ2RBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUNEQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNoREEsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFZkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENB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QUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDN0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtnQkFDeENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLFVBQVVBLElBQUlBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLGNBQWNBLENBQUNBO2dCQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNwRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0E7Z0JBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQzVEQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxnQkFBZ0JBLENBQUNBLENBQUNBLENB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QUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO29CQUN4Q0EsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxFQUFFQSxDQUFDQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQy9EQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDekJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO29CQUNSQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDdEJBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuREEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUVKQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO3dCQUFFQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDdkVBLENBQUNBO1lBQ0xBLENBQUNBO1lBS0RBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDL0JBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElB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QSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxLQUFLQSxHQUFHQSxDQUFDQTtZQUNUQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUNWQSxLQUFLQSxJQUFJQTtnQkFDTEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLENBQUNBO1FBQ1RBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUQseUJBQXlCLEtBQUs7UUFFMUJDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDckJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO29CQUNyRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVE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QSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzNDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxPQUFPQSxHQUFHQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0E7UUFFREEsU0FBU0EsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDckJBLEdBQUdBLENBQUNBLENBQUNBLElBQUtBLENBQUNBO1lBQ1BBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsREEsTUFBTUEsR0FBR0Esb0JBQW9CQSxFQUFFQSxDQUFDQTtnQkFDaENBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBO1lBQ2pCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsVUFBVUEsRUFBRUEsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzFEQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNoRUEsQ0FBQ0E7WUFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0JBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDMUNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBOzRCQUM3QkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7d0JBQ25DQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7b0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzdDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQTs0QkFDbENBLElBQUlBLEVBQUVBLElBQUlBOzRCQUNWQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQTt5QkFDakJBLENBQUNBLENBQUNBO3dCQUNIQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTt3QkFFcEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBOzRCQUNuQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBQy9EQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO29CQUNoRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hFQSxDQUFDQTtnQkFDREEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7Z0JBRTNCQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDdENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1B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LEtBQUtBLEtBQUtBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNwRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3BFQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDeENBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBO3dCQUNkQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTt3QkFDekJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBOzRCQUMvQkEsSUFBSUEsR0FBR0Esb0JBQW9CQSxFQUFFQSxDQUFDQTt3QkFDbENBLENBQUNBO3dCQUFDQSxJQUFJQTs0QkFBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7b0JBQ3JCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN0RkEsT0FBT0EsRUFBRUEsQ0FBQ0E7Z0JBQ1ZBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNB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QSxZQUFZQSxHQUFHQSxZQUFZQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBRURBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLFlBQVlBLENBQUNBO1FBQzlDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUV6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNsREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdENBLENBQUNBO1FBRURBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUVEO1FBQ0lDLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxP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Q0FBQ0E7Z0JBQy9CQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFLQSxDQUFDQTtvQkFDUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ25DQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDN0NBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdENBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO3dCQUNuQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdENBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNyQ0EsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO3dCQUM3Q0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxDQUFDQTtvQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDdkVBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxXQUFXQTt3QkFDL0NBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLGNBQWNBO3dCQUMvREEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzlCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDaEVBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDSkEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7b0JBQ3RDQSxDQUFDQTtvQkFDREEsT0FBT0EsRUFBRUEsQ0FBQ0E7b0JBQ1ZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNiQSxTQUFTQSxFQUFFQSxDQUFD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LENBQUMsTUFBTSxDQUFDO0FBQ2xCLENBQUMsRUFBRyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiFcbiAqIEpTSGludCwgYnkgSlNIaW50IENvbW11bml0eS5cbiAqXG4gKiBUaGlzIGZpbGUgKGFuZCB0aGlzIGZpbGUgb25seSkgaXMgbGljZW5zZWQgdW5kZXIgdGhlIHNhbWUgc2xpZ2h0bHkgbW9kaWZpZWRcbiAqIE1JVCBsaWNlbnNlIHRoYXQgSlNMaW50IGlzLiBJdCBzdG9wcyBldmlsLWRvZXJzIGV2ZXJ5d2hlcmU6XG4gKlxuICogICBDb3B5cmlnaHQgKGMpIDIwMDIgRG91Z2xhcyBDcm9ja2ZvcmQgICh3d3cuSlNMaW50LmNvbSlcbiAqXG4gKiAgIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZ1xuICogICBhIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSxcbiAqICAgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvblxuICogICB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSxcbiAqICAgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob21cbiAqICAgdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogICBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuICogICBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiAgIFRoZSBTb2Z0d2FyZSBzaGFsbCBiZSB1c2VkIGZvciBHb29kLCBub3QgRXZpbC5cbiAqXG4gKiAgIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqICAgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiAgIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogICBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiAgIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HXG4gKiAgIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVJcbiAqICAgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuICpcbiAqL1xuXG4vKmpzaGludCBxdW90bWFyazpkb3VibGUgKi9cbi8qZ2xvYmFsIGNvbnNvbGU6dHJ1ZSAqL1xuLypleHBvcnRlZCBjb25zb2xlICovXG5pbXBvcnQgRXZlbnRFbWl0dGVyIGZyb20gXCIuL0V2ZW50RW1pdHRlclwiO1xuaW1wb3J0IHticm93c2VyLCBicm93c2VyaWZ5LCBjb3VjaCwgZGV2ZWwsIGRvam8sIGVjbWFJZGVudGlmaWVycywgamFzbWluZSwganF1ZXJ5LCBtb2NoYSwgbW9vdG9vbHMsIG5vZGUsIG5vbnN0YW5kYXJkLCBwaGFudG9tLCBwcm90b3R5cGVqcywgcXVuaXQsIHJlc2VydmVkVmFycywgcmhpbm8sIHNoZWxsanMsIHR5cGVkLCB3b3JrZXIsIHdzaCwgeXVpfSBmcm9tIFwiLi92YXJzXCI7XG5pbXBvcnQge2Vycm9ycywgaW5mbywgd2FybmluZ3N9IGZyb20gXCIuL21lc3NhZ2VzXCI7XG5pbXBvcnQgTGV4ZXIgZnJvbSBcIi4vbGV4XCI7XG5pbXBvcnQge2lkZW50aWZpZXJSZWdFeHAsIGphdmFzY3JpcHRVUkx9IGZyb20gXCIuL3JlZ1wiO1xuaW1wb3J0IHtzdGF0ZX0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7cmVnaXN0ZXJ9IGZyb20gXCIuL3N0eWxlXCI7XG5pbXBvcnQge2Jvb2wsIGludmVydGVkLCBub2VuZm9yY2VhbGwsIHJlbW92ZWQsIHJlbmFtZWQsIHZhbGlkTmFtZXN9IGZyb20gXCIuL29wdGlvbnNcIjtcbmltcG9ydCB7c2NvcGVNYW5hZ2VyfSBmcm9tIFwiLi9zY29wZS1tYW5hZ2VyXCI7XG5cbi8vIFdlIG5lZWQgdGhpcyBtb2R1bGUgaGVyZSBiZWNhdXNlIGVudmlyb25tZW50cyBzdWNoIGFzIElFIGFuZCBSaGlub1xuLy8gZG9uJ3QgbmVjZXNzYXJpbGx5IGV4cG9zZSB0aGUgJ2NvbnNvbGUnIEFQSSBhbmQgYnJvd3NlcmlmeSB1c2VzXG4vLyBpdCB0byBsb2cgdGhpbmdzLiBJdCdzIGEgc2FkIHN0YXRlIG9mIGFmZmFpciwgcmVhbGx5LlxuLy8gdmFyIGNvbnNvbGUgPSByZXF1aXJlKFwiY29uc29sZS1icm93c2VyaWZ5XCIpO1xuXG4vLyBXZSBidWlsZCB0aGUgYXBwbGljYXRpb24gaW5zaWRlIGEgZnVuY3Rpb24gc28gdGhhdCB3ZSBwcm9kdWNlIG9ubHkgYSBzaW5nbGV0b25cbi8vIHZhcmlhYmxlLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBpbW1lZGlhdGVseSwgYW5kIGl0cyByZXR1cm4gdmFsdWUgaXNcbi8vIHRoZSBKU0hJTlQgZnVuY3Rpb24gaXRzZWxmLlxuXG4vLyBUaHJvdyBhd2F5IHRoZSB0eXBlIGluZm9ybWF0aW9uIGJlY2F1c2UgSlNISU5UIGlzIGJvdGggYSBmdW5jdGlvbiB3aXRoIGF0dHJpYnV0ZXMhXG5leHBvcnQgdmFyIEpTSElOVDogYW55ID0gKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIGFwaSwgLy8gRXh0ZW5zaW9uIEFQSVxuXG4gICAgICAgIC8vIFRoZXNlIGFyZSBvcGVyYXRvcnMgdGhhdCBzaG91bGQgbm90IGJlIHVzZWQgd2l0aCB0aGUgISBvcGVyYXRvci5cbiAgICAgICAgYmFuZyA9IHtcbiAgICAgICAgICAgIFwiPFwiOiB0cnVlLFxuICAgICAgICAgICAgXCI8PVwiOiB0cnVlLFxuICAgICAgICAgICAgXCI9PVwiOiB0cnVlLFxuICAgICAgICAgICAgXCI9PT1cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiIT09XCI6IHRydWUsXG4gICAgICAgICAgICBcIiE9XCI6IHRydWUsXG4gICAgICAgICAgICBcIj5cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiPj1cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiK1wiOiB0cnVlLFxuICAgICAgICAgICAgXCItXCI6IHRydWUsXG4gICAgICAgICAgICBcIipcIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiL1wiOiB0cnVlLFxuICAgICAgICAgICAgXCIlXCI6IHRydWVcbiAgICAgICAgfSxcblxuICAgICAgICBkZWNsYXJlZCwgLy8gR2xvYmFscyB0aGF0IHdlcmUgZGVjbGFyZWQgdXNpbmcgLypnbG9iYWwgLi4uICovIHN5bnRheC5cblxuICAgICAgICBmdW5jdGlvbmljaXR5ID0gW1xuICAgICAgICAgICAgXCJjbG9zdXJlXCIsIFwiZXhjZXB0aW9uXCIsIFwiZ2xvYmFsXCIsIFwibGFiZWxcIixcbiAgICAgICAgICAgIFwib3V0ZXJcIiwgXCJ1bnVzZWRcIiwgXCJ2YXJcIlxuICAgICAgICBdLFxuXG4gICAgICAgIGZ1bmN0aW9ucywgLy8gQWxsIG9mIHRoZSBmdW5jdGlvbnNcblxuICAgICAgICBpbmJsb2NrLFxuICAgICAgICBpbmRlbnQsXG4gICAgICAgIGxvb2thaGVhZCxcbiAgICAgICAgbGV4LFxuICAgICAgICBtZW1iZXIsXG4gICAgICAgIG1lbWJlcnNPbmx5LFxuICAgICAgICBwcmVkZWZpbmVkLCAgICAvLyBHbG9iYWwgdmFyaWFibGVzIGRlZmluZWQgYnkgb3B0aW9uXG5cbiAgICAgICAgc3RhY2ssXG4gICAgICAgIHVybHMsXG5cbiAgICAgICAgZXh0cmFNb2R1bGVzID0gW10sXG4gICAgICAgIGVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbiAgICBmdW5jdGlvbiBjaGVja09wdGlvbihuYW1lLCB0KSB7XG4gICAgICAgIG5hbWUgPSBuYW1lLnRyaW0oKTtcblxuICAgICAgICBpZiAoL15bKy1dV1xcZHszfSQvZy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWxpZE5hbWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICBpZiAodC50eXBlICE9PSBcImpzbGludFwiICYmICFfLmhhcyhyZW1vdmVkLCBuYW1lKSkge1xuICAgICAgICAgICAgICAgIGVycm9yKFwiRTAwMVwiLCB0LCBuYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1N0cmluZyhvYmopIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSBcIltvYmplY3QgU3RyaW5nXVwiO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSWRlbnRpZmllcih0a24sIHZhbHVlKSB7XG4gICAgICAgIGlmICghdGtuKVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGlmICghdGtuLmlkZW50aWZpZXIgfHwgdGtuLnZhbHVlICE9PSB2YWx1ZSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc1Jlc2VydmVkKHRva2VuKSB7XG4gICAgICAgIGlmICghdG9rZW4ucmVzZXJ2ZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbWV0YSA9IHRva2VuLm1ldGE7XG5cbiAgICAgICAgaWYgKG1ldGEgJiYgbWV0YS5pc0Z1dHVyZVJlc2VydmVkV29yZCAmJiBzdGF0ZS5pbkVTNSgpKSB7XG4gICAgICAgICAgICAvLyBFUzMgRnV0dXJlUmVzZXJ2ZWRXb3JkIGluIGFuIEVTNSBlbnZpcm9ubWVudC5cbiAgICAgICAgICAgIGlmICghbWV0YS5lczUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNvbWUgRVM1IEZ1dHVyZVJlc2VydmVkV29yZCBpZGVudGlmaWVycyBhcmUgYWN0aXZlIG9ubHlcbiAgICAgICAgICAgIC8vIHdpdGhpbiBhIHN0cmljdCBtb2RlIGVudmlyb25tZW50LlxuICAgICAgICAgICAgaWYgKG1ldGEuc3RyaWN0T25seSkge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLnN0cmljdCAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9rZW4uaXNQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1cHBsYW50KHN0ciwgZGF0YSkge1xuICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xceyhbXnt9XSopXFx9L2csIGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciByID0gZGF0YVtiXTtcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgciA9PT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgciA9PT0gXCJudW1iZXJcIiA/IHIgOiBhO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21iaW5lKGRlc3QsIHNyYykge1xuICAgICAgICBPYmplY3Qua2V5cyhzcmMpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgaWYgKF8uaGFzKEpTSElOVC5ibGFja2xpc3QsIG5hbWUpKSByZXR1cm47XG4gICAgICAgICAgICBkZXN0W25hbWVdID0gc3JjW25hbWVdO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzZW5mb3JjZWFsbCgpIHtcbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5lbmZvcmNlYWxsKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBlbmZvcmNlb3B0IGluIGJvb2wuZW5mb3JjaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbltlbmZvcmNlb3B0XSA9PT0gdm9pZCAwICYmXG4gICAgICAgICAgICAgICAgICAgICFub2VuZm9yY2VhbGxbZW5mb3JjZW9wdF0pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW2VuZm9yY2VvcHRdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKHZhciByZWxheG9wdCBpbiBib29sLnJlbGF4aW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbltyZWxheG9wdF0gPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb25bcmVsYXhvcHRdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXNzdW1lKCkge1xuICAgICAgICBwcm9jZXNzZW5mb3JjZWFsbCgpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUT0RPOiBSZW1vdmUgaW4gSlNIaW50IDNcbiAgICAgICAgICovXG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmVzdmVyc2lvbiAmJiAhc3RhdGUub3B0aW9uLm1veikge1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5lczMpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uZXN2ZXJzaW9uID0gMztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3B0aW9uLmVzbmV4dCkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSA2O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uZXN2ZXJzaW9uID0gNTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5pbkVTNSgpKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGVjbWFJZGVudGlmaWVyc1s1XSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBlY21hSWRlbnRpZmllcnNbNl0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFVzZSBgaW5gIHRvIGNoZWNrIGZvciB0aGUgcHJlc2VuY2Ugb2YgYW55IGV4cGxpY2l0bHktc3BlY2lmaWVkIHZhbHVlIGZvclxuICAgICAgICAgKiBgZ2xvYmFsc3RyaWN0YCBiZWNhdXNlIGJvdGggYHRydWVgIGFuZCBgZmFsc2VgIHNob3VsZCB0cmlnZ2VyIGFuIGVycm9yLlxuICAgICAgICAgKi9cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IFwiZ2xvYmFsXCIgJiYgXCJnbG9iYWxzdHJpY3RcIiBpbiBzdGF0ZS5vcHRpb24pIHtcbiAgICAgICAgICAgIHF1aXQoXCJFMDU5XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcInN0cmljdFwiLCBcImdsb2JhbHN0cmljdFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubW9kdWxlKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnN0cmljdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSBcImdsb2JhbFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBUT0RPOiBFeHRlbmQgdGhpcyByZXN0cmljdGlvbiB0byAqYWxsKiBFUzYtc3BlY2lmaWMgb3B0aW9ucy5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzRcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwibW9kdWxlXCIsIDYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5jb3VjaCkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBjb3VjaCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnF1bml0KSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHF1bml0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ucmhpbm8pIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgcmhpbm8pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zaGVsbGpzKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHNoZWxsanMpO1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBub2RlKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnR5cGVkKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHR5cGVkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ucGhhbnRvbSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBwaGFudG9tKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IFwiZ2xvYmFsXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnByb3RvdHlwZWpzKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHByb3RvdHlwZWpzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubm9kZSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBub2RlKTtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgdHlwZWQpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc3RyaWN0ID0gXCJnbG9iYWxcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uZGV2ZWwpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgZGV2ZWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5kb2pvKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGRvam8pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5icm93c2VyKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGJyb3dzZXIpO1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCB0eXBlZCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmJyb3dzZXJpZnkpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgYnJvd3Nlcik7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHR5cGVkKTtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgYnJvd3NlcmlmeSk7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnN0cmljdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSBcImdsb2JhbFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub25zdGFuZGFyZCkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBub25zdGFuZGFyZCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmphc21pbmUpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgamFzbWluZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmpxdWVyeSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBqcXVlcnkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5tb290b29scykge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBtb290b29scyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLndvcmtlcikge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCB3b3JrZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi53c2gpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgd3NoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uZ2xvYmFsc3RyaWN0ICYmIHN0YXRlLm9wdGlvbi5zdHJpY3QgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBzdGF0ZS5vcHRpb24uc3RyaWN0ID0gXCJnbG9iYWxcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ueXVpKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHl1aSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm1vY2hhKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIG1vY2hhKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFByb2R1Y2UgYW4gZXJyb3Igd2FybmluZy5cbiAgICBmdW5jdGlvbiBxdWl0KGNvZGU6IHN0cmluZywgdG9rZW4sIGE/LCBiPykge1xuICAgICAgICB2YXIgcGVyY2VudGFnZSA9IE1hdGguZmxvb3IoKHRva2VuLmxpbmUgLyBzdGF0ZS5saW5lcy5sZW5ndGgpICogMTAwKTtcbiAgICAgICAgdmFyIG1lc3NhZ2UgPSBlcnJvcnNbY29kZV0uZGVzYztcblxuICAgICAgICB2YXIgZXhjZXB0aW9uID0ge1xuICAgICAgICAgICAgbmFtZTogXCJKU0hpbnRFcnJvclwiLFxuICAgICAgICAgICAgbGluZTogdG9rZW4ubGluZSxcbiAgICAgICAgICAgIGNoYXJhY3RlcjogdG9rZW4uZnJvbSxcbiAgICAgICAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UgKyBcIiAoXCIgKyBwZXJjZW50YWdlICsgXCIlIHNjYW5uZWQpLlwiLFxuICAgICAgICAgICAgcmF3OiBtZXNzYWdlLFxuICAgICAgICAgICAgY29kZTogY29kZSxcbiAgICAgICAgICAgIGE6IGEsXG4gICAgICAgICAgICBiOiBiLFxuICAgICAgICAgICAgcmVhc29uOiB2b2lkIDBcbiAgICAgICAgfTtcblxuICAgICAgICBleGNlcHRpb24ucmVhc29uID0gc3VwcGxhbnQobWVzc2FnZSwgZXhjZXB0aW9uKSArIFwiIChcIiArIHBlcmNlbnRhZ2UgK1xuICAgICAgICAgICAgXCIlIHNjYW5uZWQpLlwiO1xuXG4gICAgICAgIHRocm93IGV4Y2VwdGlvbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZW1vdmVJZ25vcmVkTWVzc2FnZXMoKSB7XG4gICAgICAgIHZhciBpZ25vcmVkID0gc3RhdGUuaWdub3JlZExpbmVzO1xuXG4gICAgICAgIGlmIChfLmlzRW1wdHkoaWdub3JlZCkpIHJldHVybjtcbiAgICAgICAgSlNISU5ULmVycm9ycyA9IF8ucmVqZWN0KEpTSElOVC5lcnJvcnMsIGZ1bmN0aW9uKGVycikgeyByZXR1cm4gaWdub3JlZFtlcnIubGluZV0gfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2FybmluZyhjb2RlOiBzdHJpbmcsIHQ/LCBhPywgYj8sIGM/LCBkPykge1xuICAgICAgICB2YXIgY2gsIGwsIHcsIG1zZztcblxuICAgICAgICBpZiAoL15XXFxkezN9JC8udGVzdChjb2RlKSkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLmlnbm9yZWRbY29kZV0pXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICBtc2cgPSB3YXJuaW5nc1tjb2RlXTtcbiAgICAgICAgfSBlbHNlIGlmICgvRVxcZHszfS8udGVzdChjb2RlKSkge1xuICAgICAgICAgICAgbXNnID0gZXJyb3JzW2NvZGVdO1xuICAgICAgICB9IGVsc2UgaWYgKC9JXFxkezN9Ly50ZXN0KGNvZGUpKSB7XG4gICAgICAgICAgICBtc2cgPSBpbmZvW2NvZGVdO1xuICAgICAgICB9XG5cbiAgICAgICAgdCA9IHQgfHwgc3RhdGUudG9rZW5zLm5leHQgfHwge307XG4gICAgICAgIGlmICh0LmlkID09PSBcIihlbmQpXCIpIHsgIC8vIGB+XG4gICAgICAgICAgICB0ID0gc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIH1cblxuICAgICAgICBsID0gdC5saW5lO1xuICAgICAgICBjaCA9IHQuZnJvbTtcblxuICAgICAgICB3ID0ge1xuICAgICAgICAgICAgaWQ6IFwiKGVycm9yKVwiLFxuICAgICAgICAgICAgcmF3OiBtc2cuZGVzYyxcbiAgICAgICAgICAgIGNvZGU6IG1zZy5jb2RlLFxuICAgICAgICAgICAgZXZpZGVuY2U6IHN0YXRlLmxpbmVzW2wgLSAxXSB8fCBcIlwiLFxuICAgICAgICAgICAgbGluZTogbCxcbiAgICAgICAgICAgIGNoYXJhY3RlcjogY2gsXG4gICAgICAgICAgICBzY29wZTogSlNISU5ULnNjb3BlLFxuICAgICAgICAgICAgYTogYSxcbiAgICAgICAgICAgIGI6IGIsXG4gICAgICAgICAgICBjOiBjLFxuICAgICAgICAgICAgZDogZFxuICAgICAgICB9O1xuXG4gICAgICAgIHcucmVhc29uID0gc3VwcGxhbnQobXNnLmRlc2MsIHcpO1xuICAgICAgICBKU0hJTlQuZXJyb3JzLnB1c2godyk7XG5cbiAgICAgICAgcmVtb3ZlSWdub3JlZE1lc3NhZ2VzKCk7XG5cbiAgICAgICAgaWYgKEpTSElOVC5lcnJvcnMubGVuZ3RoID49IHN0YXRlLm9wdGlvbi5tYXhlcnIpXG4gICAgICAgICAgICBxdWl0KFwiRTA0M1wiLCB0KTtcblxuICAgICAgICByZXR1cm4gdztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YXJuaW5nQXQobSwgbCwgY2gsIGE/LCBiPywgYz8sIGQ/KSB7XG4gICAgICAgIHJldHVybiB3YXJuaW5nKG0sIHtcbiAgICAgICAgICAgIGxpbmU6IGwsXG4gICAgICAgICAgICBmcm9tOiBjaFxuICAgICAgICB9LCBhLCBiLCBjLCBkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihtOiBzdHJpbmcsIHQ/LCBhPywgYj8sIGM/LCBkPykge1xuICAgICAgICB3YXJuaW5nKG0sIHQsIGEsIGIsIGMsIGQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yQXQobSwgbCwgY2g/LCBhPywgYj8sIGM/LCBkPykge1xuICAgICAgICByZXR1cm4gZXJyb3IobSwge1xuICAgICAgICAgICAgbGluZTogbCxcbiAgICAgICAgICAgIGZyb206IGNoXG4gICAgICAgIH0sIGEsIGIsIGMsIGQpO1xuICAgIH1cblxuICAgIC8vIFRyYWNraW5nIG9mIFwiaW50ZXJuYWxcIiBzY3JpcHRzLCBsaWtlIGV2YWwgY29udGFpbmluZyBhIHN0YXRpYyBzdHJpbmdcbiAgICBmdW5jdGlvbiBhZGRJbnRlcm5hbFNyYyhlbGVtLCBzcmMpIHtcbiAgICAgICAgdmFyIGk7XG4gICAgICAgIGkgPSB7XG4gICAgICAgICAgICBpZDogXCIoaW50ZXJuYWwpXCIsXG4gICAgICAgICAgICBlbGVtOiBlbGVtLFxuICAgICAgICAgICAgdmFsdWU6IHNyY1xuICAgICAgICB9O1xuICAgICAgICBKU0hJTlQuaW50ZXJuYWxzLnB1c2goaSk7XG4gICAgICAgIHJldHVybiBpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRvT3B0aW9uKCkge1xuICAgICAgICB2YXIgbnQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgdmFyIGJvZHkgPSBudC5ib2R5LnNwbGl0KFwiLFwiKS5tYXAoZnVuY3Rpb24ocykgeyByZXR1cm4gcy50cmltKCk7IH0pO1xuXG4gICAgICAgIHZhciBwcmVkZWYgPSB7fTtcbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwiZ2xvYmFsc1wiKSB7XG4gICAgICAgICAgICBib2R5LmZvckVhY2goZnVuY3Rpb24oZywgaWR4KSB7XG4gICAgICAgICAgICAgICAgZyA9IGcuc3BsaXQoXCI6XCIpO1xuICAgICAgICAgICAgICAgIHZhciBrZXk6IHN0cmluZyA9IChnWzBdIHx8IFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gKGdbMV0gfHwgXCJcIikudHJpbSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCItXCIgfHwgIWtleS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWdub3JlIHRyYWlsaW5nIGNvbW1hXG4gICAgICAgICAgICAgICAgICAgIGlmIChpZHggPiAwICYmIGlkeCA9PT0gYm9keS5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkuY2hhckF0KDApID09PSBcIi1cIikge1xuICAgICAgICAgICAgICAgICAgICBrZXkgPSBrZXkuc2xpY2UoMSk7XG4gICAgICAgICAgICAgICAgICAgIHZhbCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIEpTSElOVC5ibGFja2xpc3Rba2V5XSA9IGtleTtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHByZWRlZmluZWRba2V5XTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwcmVkZWZba2V5XSA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBwcmVkZWYpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gcHJlZGVmKSB7XG4gICAgICAgICAgICAgICAgaWYgKF8uaGFzKHByZWRlZiwga2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBkZWNsYXJlZFtrZXldID0gbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwiZXhwb3J0ZWRcIikge1xuICAgICAgICAgICAgYm9keS5mb3JFYWNoKGZ1bmN0aW9uKGUsIGlkeCkge1xuICAgICAgICAgICAgICAgIGlmICghZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWdub3JlIHRyYWlsaW5nIGNvbW1hXG4gICAgICAgICAgICAgICAgICAgIGlmIChpZHggPiAwICYmIGlkeCA9PT0gYm9keS5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRFeHBvcnRlZChlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwibWVtYmVyc1wiKSB7XG4gICAgICAgICAgICBtZW1iZXJzT25seSA9IG1lbWJlcnNPbmx5IHx8IHt9O1xuXG4gICAgICAgICAgICBib2R5LmZvckVhY2goZnVuY3Rpb24obSkge1xuICAgICAgICAgICAgICAgIHZhciBjaDEgPSBtLmNoYXJBdCgwKTtcbiAgICAgICAgICAgICAgICB2YXIgY2gyID0gbS5jaGFyQXQobS5sZW5ndGggLSAxKTtcblxuICAgICAgICAgICAgICAgIGlmIChjaDEgPT09IGNoMiAmJiAoY2gxID09PSBcIlxcXCJcIiB8fCBjaDEgPT09IFwiJ1wiKSkge1xuICAgICAgICAgICAgICAgICAgICBtID0gbVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN1YnN0cigxLCBtLmxlbmd0aCAtIDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShcIlxcXFxcXFwiXCIsIFwiXFxcIlwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtZW1iZXJzT25seVttXSA9IGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbnVtdmFscyA9IFtcbiAgICAgICAgICAgIFwibWF4c3RhdGVtZW50c1wiLFxuICAgICAgICAgICAgXCJtYXhwYXJhbXNcIixcbiAgICAgICAgICAgIFwibWF4ZGVwdGhcIixcbiAgICAgICAgICAgIFwibWF4Y29tcGxleGl0eVwiLFxuICAgICAgICAgICAgXCJtYXhlcnJcIixcbiAgICAgICAgICAgIFwibWF4bGVuXCIsXG4gICAgICAgICAgICBcImluZGVudFwiXG4gICAgICAgIF07XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwianNoaW50XCIgfHwgbnQudHlwZSA9PT0gXCJqc2xpbnRcIikge1xuICAgICAgICAgICAgYm9keS5mb3JFYWNoKGZ1bmN0aW9uKGcpIHtcbiAgICAgICAgICAgICAgICBnID0gZy5zcGxpdChcIjpcIik7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IChnWzBdIHx8IFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gKGdbMV0gfHwgXCJcIikudHJpbSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja09wdGlvbihrZXksIG50KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG51bXZhbHMuaW5kZXhPZihrZXkpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR0g5ODggLSBudW1lcmljIG9wdGlvbnMgY2FuIGJlIGRpc2FibGVkIGJ5IHNldHRpbmcgdGhlbSB0byBgZmFsc2VgXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwgIT09IFwiZmFsc2VcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gK3ZhbDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgIT09IFwibnVtYmVyXCIgfHwgIWlzRmluaXRlKHZhbCkgfHwgdmFsIDw9IDAgfHwgTWF0aC5mbG9vcih2YWwpICE9PSB2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzJcIiwgbnQsIGdbMV0udHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbltrZXldID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW2tleV0gPSBrZXkgPT09IFwiaW5kZW50XCIgPyA0IDogZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogVE9ETzogUmVtb3ZlIGluIEpTSGludCAzXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJlczVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsID09PSBcInRydWVcIiAmJiBzdGF0ZS5vcHRpb24uZXM1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiSTAwM1wiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwidmFsaWR0aGlzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYHZhbGlkdGhpc2AgaXMgdmFsaWQgb25seSB3aXRoaW4gYSBmdW5jdGlvbiBzY29wZS5cblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuZnVuY3RbXCIoZ2xvYmFsKVwiXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIGVycm9yKFwiRTAwOVwiKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsICE9PSBcInRydWVcIiAmJiB2YWwgIT09IFwiZmFsc2VcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIGVycm9yKFwiRTAwMlwiLCBudCk7XG5cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnZhbGlkdGhpcyA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwicXVvdG1hcmtcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRydWVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJmYWxzZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5xdW90bWFyayA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJkb3VibGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzaW5nbGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ucXVvdG1hcmsgPSB2YWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAwMlwiLCBudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwic2hhZG93XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnNoYWRvdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwib3V0ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc2hhZG93ID0gXCJvdXRlclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiaW5uZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc2hhZG93ID0gXCJpbm5lclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcInVudXNlZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi51bnVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnVudXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInZhcnNcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzdHJpY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24udW51c2VkID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcImxhdGVkZWZcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRydWVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm5vZnVuY1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5sYXRlZGVmID0gXCJub2Z1bmNcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJpZ25vcmVcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImxpbmVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5pZ25vcmVkTGluZXNbbnQubGluZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZUlnbm9yZWRNZXNzYWdlcygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcInN0cmljdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZ1bmNcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJnbG9iYWxcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbXBsaWVkXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJtb2R1bGVcIikge1xuICAgICAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgICAgICogVE9ETzogRXh0ZW5kIHRoaXMgcmVzdHJpY3Rpb24gdG8gKmFsbCogXCJlbnZpcm9ubWVudGFsXCIgb3B0aW9ucy5cbiAgICAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgICAgIGlmICghaGFzUGFyc2VkQ29kZShzdGF0ZS5mdW5jdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTA1NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJtb2R1bGVcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBUT0RPOiBSZW1vdmUgaW4gSlNIaW50IDNcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgZXN2ZXJzaW9ucyA9IHtcbiAgICAgICAgICAgICAgICAgICAgZXMzOiAzLFxuICAgICAgICAgICAgICAgICAgICBlczU6IDUsXG4gICAgICAgICAgICAgICAgICAgIGVzbmV4dDogNlxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKF8uaGFzKGVzdmVyc2lvbnMsIGtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLm1veiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSBlc3ZlcnNpb25zW2tleV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5tb3opIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLmVzdmVyc2lvbiA9IDU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcImVzdmVyc2lvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiNVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5pbkVTNSh0cnVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiSTAwM1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiM1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjZcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubW96ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLmVzdmVyc2lvbiA9ICt2YWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiMjAxNVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5tb3ogPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uZXN2ZXJzaW9uID0gNjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhc1BhcnNlZENvZGUoc3RhdGUuZnVuY3QpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwNTVcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiZXN2ZXJzaW9uXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2ggPSAvXihbKy1dKShXXFxkezN9KSQvZy5leGVjKGtleSk7XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlnbm9yZSBmb3IgLVcuLi4sIHVuaWdub3JlIGZvciArVy4uLlxuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5pZ25vcmVkW21hdGNoWzJdXSA9IChtYXRjaFsxXSA9PT0gXCItXCIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIHRuO1xuICAgICAgICAgICAgICAgIGlmICh2YWwgPT09IFwidHJ1ZVwiIHx8IHZhbCA9PT0gXCJmYWxzZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChudC50eXBlID09PSBcImpzbGludFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0biA9IHJlbmFtZWRba2V5XSB8fCBrZXk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb25bdG5dID0gKHZhbCA9PT0gXCJ0cnVlXCIpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW52ZXJ0ZWRbdG5dICE9PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb25bdG5dID0gIXN0YXRlLm9wdGlvblt0bl07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb25ba2V5XSA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGFzc3VtZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gV2UgbmVlZCBhIHBlZWsgZnVuY3Rpb24uIElmIGl0IGhhcyBhbiBhcmd1bWVudCwgaXQgcGVla3MgdGhhdCBtdWNoIGZhcnRoZXJcbiAgICAvLyBhaGVhZC4gSXQgaXMgdXNlZCB0byBkaXN0aW5ndWlzaFxuICAgIC8vICAgICBmb3IgKCB2YXIgaSBpbiAuLi5cbiAgICAvLyBmcm9tXG4gICAgLy8gICAgIGZvciAoIHZhciBpID0gLi4uXG5cbiAgICBmdW5jdGlvbiBwZWVrKHA/KSB7XG4gICAgICAgIHZhciBpID0gcCB8fCAwLCBqID0gbG9va2FoZWFkLmxlbmd0aCwgdDtcblxuICAgICAgICBpZiAoaSA8IGopIHtcbiAgICAgICAgICAgIHJldHVybiBsb29rYWhlYWRbaV07XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoaiA8PSBpKSB7XG4gICAgICAgICAgICB0ID0gbG9va2FoZWFkW2pdO1xuICAgICAgICAgICAgaWYgKCF0KSB7XG4gICAgICAgICAgICAgICAgdCA9IGxvb2thaGVhZFtqXSA9IGxleC50b2tlbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaiArPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGVla2luZyBwYXN0IHRoZSBlbmQgb2YgdGhlIHByb2dyYW0gc2hvdWxkIHByb2R1Y2UgdGhlIFwiKGVuZClcIiB0b2tlbi5cbiAgICAgICAgaWYgKCF0ICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZWtJZ25vcmVFT0woKSB7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgdmFyIHQ7XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIHQgPSBwZWVrKGkrKyk7XG4gICAgICAgIH0gd2hpbGUgKHQuaWQgPT09IFwiKGVuZGxpbmUpXCIpO1xuICAgICAgICByZXR1cm4gdDtcbiAgICB9XG5cbiAgICAvLyBQcm9kdWNlIHRoZSBuZXh0IHRva2VuLiBJdCBsb29rcyBmb3IgcHJvZ3JhbW1pbmcgZXJyb3JzLlxuXG4gICAgZnVuY3Rpb24gYWR2YW5jZShpZD8sIHQ/KSB7XG5cbiAgICAgICAgc3dpdGNoIChzdGF0ZS50b2tlbnMuY3Vyci5pZCkge1xuICAgICAgICAgICAgY2FzZSBcIihudW1iZXIpXCI6XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIi5cIikge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwNVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIi1cIjpcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiLVwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIi0tXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDZcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIitcIjpcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiK1wiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIisrXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDdcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBpZCkge1xuICAgICAgICAgICAgaWYgKHQpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMTlcIiwgdCwgdC5pZCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDIwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBpZCwgdC5pZCwgdC5saW5lLCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlICE9PSBcIihpZGVudGlmaWVyKVwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlICE9PSBpZCkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE2XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBpZCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUudG9rZW5zLnByZXYgPSBzdGF0ZS50b2tlbnMuY3VycjtcbiAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5uZXh0ID0gbG9va2FoZWFkLnNoaWZ0KCkgfHwgbGV4LnRva2VuKCk7XG5cbiAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQpIHsgLy8gTm8gbW9yZSB0b2tlbnMgbGVmdCwgZ2l2ZSB1cFxuICAgICAgICAgICAgICAgIHF1aXQoXCJFMDQxXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKGVycm9yKVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuY2hlY2spIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC5jaGVjaygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaXNTcGVjaWFsKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiZmFsbHMgdGhyb3VnaFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmNhc2VGYWxsc1Rocm91Z2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRvT3B0aW9uKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKGVuZGxpbmUpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNJbmZpeCh0b2tlbikge1xuICAgICAgICByZXR1cm4gdG9rZW4uaW5maXggfHwgKCF0b2tlbi5pZGVudGlmaWVyICYmICF0b2tlbi50ZW1wbGF0ZSAmJiAhIXRva2VuLmxlZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNFbmRPZkV4cHIoKSB7XG4gICAgICAgIHZhciBjdXJyID0gc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHZhciBuZXh0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIGlmIChuZXh0LmlkID09PSBcIjtcIiB8fCBuZXh0LmlkID09PSBcIn1cIiB8fCBuZXh0LmlkID09PSBcIjpcIikge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGlzSW5maXgobmV4dCkgPT09IGlzSW5maXgoY3VycikgfHwgKGN1cnIuaWQgPT09IFwieWllbGRcIiAmJiBzdGF0ZS5pbk1veigpKSkge1xuICAgICAgICAgICAgcmV0dXJuIGN1cnIubGluZSAhPT0gc3RhcnRMaW5lKG5leHQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0JlZ2luT2ZFeHByKHByZXYpIHtcbiAgICAgICAgcmV0dXJuICFwcmV2LmxlZnQgJiYgcHJldi5hcml0eSAhPT0gXCJ1bmFyeVwiO1xuICAgIH1cblxuICAgIC8vIFRoaXMgaXMgdGhlIGhlYXJ0IG9mIEpTSElOVCwgdGhlIFByYXR0IHBhcnNlci4gSW4gYWRkaXRpb24gdG8gcGFyc2luZywgaXRcbiAgICAvLyBpcyBsb29raW5nIGZvciBhZCBob2MgbGludCBwYXR0ZXJucy4gV2UgYWRkIC5mdWQgdG8gUHJhdHQncyBtb2RlbCwgd2hpY2ggaXNcbiAgICAvLyBsaWtlIC5udWQgZXhjZXB0IHRoYXQgaXQgaXMgb25seSB1c2VkIG9uIHRoZSBmaXJzdCB0b2tlbiBvZiBhIHN0YXRlbWVudC5cbiAgICAvLyBIYXZpbmcgLmZ1ZCBtYWtlcyBpdCBtdWNoIGVhc2llciB0byBkZWZpbmUgc3RhdGVtZW50LW9yaWVudGVkIGxhbmd1YWdlcyBsaWtlXG4gICAgLy8gSmF2YVNjcmlwdC4gSSByZXRhaW5lZCBQcmF0dCdzIG5vbWVuY2xhdHVyZS5cblxuICAgIC8vIC5udWQgIE51bGwgZGVub3RhdGlvblxuICAgIC8vIC5mdWQgIEZpcnN0IG51bGwgZGVub3RhdGlvblxuICAgIC8vIC5sZWQgIExlZnQgZGVub3RhdGlvblxuICAgIC8vICBsYnAgIExlZnQgYmluZGluZyBwb3dlclxuICAgIC8vICByYnAgIFJpZ2h0IGJpbmRpbmcgcG93ZXJcblxuICAgIC8vIFRoZXkgYXJlIGVsZW1lbnRzIG9mIHRoZSBwYXJzaW5nIG1ldGhvZCBjYWxsZWQgVG9wIERvd24gT3BlcmF0b3IgUHJlY2VkZW5jZS5cblxuICAgIGZ1bmN0aW9uIGV4cHJlc3Npb24ocmJwLCBpbml0aWFsPykge1xuICAgICAgICB2YXIgbGVmdCwgaXNBcnJheSA9IGZhbHNlLCBpc09iamVjdCA9IGZhbHNlLCBpc0xldEV4cHIgPSBmYWxzZTtcblxuICAgICAgICBzdGF0ZS5uYW1lU3RhY2sucHVzaCgpO1xuXG4gICAgICAgIC8vIGlmIGN1cnJlbnQgZXhwcmVzc2lvbiBpcyBhIGxldCBleHByZXNzaW9uXG4gICAgICAgIGlmICghaW5pdGlhbCAmJiBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJsZXRcIiAmJiBwZWVrKDApLnZhbHVlID09PSBcIihcIikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbk1veigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMThcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwibGV0IGV4cHJlc3Npb25zXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaXNMZXRFeHByID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBibG9jayBzY29wZSB3ZSB1c2Ugb25seSBmb3IgdGhlIGN1cnJlbnQgZXhwcmVzc2lvblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwibGV0XCIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMucHJldi5mdWQoKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIpXG4gICAgICAgICAgICBlcnJvcihcIkUwMDZcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuXG4gICAgICAgIHZhciBpc0Rhbmdlcm91cyA9XG4gICAgICAgICAgICBzdGF0ZS5vcHRpb24uYXNpICYmXG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMucHJldi5saW5lICE9PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLmN1cnIpICYmXG4gICAgICAgICAgICBfLmNvbnRhaW5zKFtcIl1cIiwgXCIpXCJdLCBzdGF0ZS50b2tlbnMucHJldi5pZCkgJiZcbiAgICAgICAgICAgIF8uY29udGFpbnMoW1wiW1wiLCBcIihcIl0sIHN0YXRlLnRva2Vucy5jdXJyLmlkKTtcblxuICAgICAgICBpZiAoaXNEYW5nZXJvdXMpXG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAxNFwiLCBzdGF0ZS50b2tlbnMuY3Vyciwgc3RhdGUudG9rZW5zLmN1cnIuaWQpO1xuXG4gICAgICAgIGFkdmFuY2UoKTtcblxuICAgICAgICBpZiAoaW5pdGlhbCkge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIodmVyYilcIl0gPSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZTtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmJlZ2luc1N0bXQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGluaXRpYWwgPT09IHRydWUgJiYgc3RhdGUudG9rZW5zLmN1cnIuZnVkKSB7XG4gICAgICAgICAgICBsZWZ0ID0gc3RhdGUudG9rZW5zLmN1cnIuZnVkKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLmN1cnIubnVkKSB7XG4gICAgICAgICAgICAgICAgbGVmdCA9IHN0YXRlLnRva2Vucy5jdXJyLm51ZCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzBcIiwgc3RhdGUudG9rZW5zLmN1cnIsIHN0YXRlLnRva2Vucy5jdXJyLmlkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVE9ETzogdXNlIHByYXR0IG1lY2hhbmljcyByYXRoZXIgdGhhbiBzcGVjaWFsIGNhc2luZyB0ZW1wbGF0ZSB0b2tlbnNcbiAgICAgICAgICAgIHdoaWxlICgocmJwIDwgc3RhdGUudG9rZW5zLm5leHQubGJwIHx8IHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHRlbXBsYXRlKVwiKSAmJlxuICAgICAgICAgICAgICAgICFpc0VuZE9mRXhwcigpKSB7XG4gICAgICAgICAgICAgICAgaXNBcnJheSA9IHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlID09PSBcIkFycmF5XCI7XG4gICAgICAgICAgICAgICAgaXNPYmplY3QgPSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSA9PT0gXCJPYmplY3RcIjtcblxuICAgICAgICAgICAgICAgIC8vICM1MjcsIG5ldyBGb28uQXJyYXkoKSwgRm9vLkFycmF5KCksIG5ldyBGb28uT2JqZWN0KCksIEZvby5PYmplY3QoKVxuICAgICAgICAgICAgICAgIC8vIExpbmUgYnJlYWtzIGluIElmU3RhdGVtZW50IGhlYWRzIGV4aXN0IHRvIHNhdGlzZnkgdGhlIGNoZWNrSlNIaW50XG4gICAgICAgICAgICAgICAgLy8gXCJMaW5lIHRvbyBsb25nLlwiIGVycm9yLlxuICAgICAgICAgICAgICAgIGlmIChsZWZ0ICYmIChsZWZ0LnZhbHVlIHx8IChsZWZ0LmZpcnN0ICYmIGxlZnQuZmlyc3QudmFsdWUpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgbGVmdC52YWx1ZSBpcyBub3QgXCJuZXdcIiwgb3IgdGhlIGxlZnQuZmlyc3QudmFsdWUgaXMgYSBcIi5cIlxuICAgICAgICAgICAgICAgICAgICAvLyB0aGVuIHNhZmVseSBhc3N1bWUgdGhhdCB0aGlzIGlzIG5vdCBcIm5ldyBBcnJheSgpXCIgYW5kIHBvc3NpYmx5XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vdCBcIm5ldyBPYmplY3QoKVwiLi4uXG4gICAgICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlICE9PSBcIm5ld1wiIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAobGVmdC5maXJzdCAmJiBsZWZ0LmZpcnN0LnZhbHVlICYmIGxlZnQuZmlyc3QudmFsdWUgPT09IFwiLlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLi4uSW4gdGhlIGNhc2Ugb2YgT2JqZWN0LCBpZiB0aGUgbGVmdC52YWx1ZSBhbmQgc3RhdGUudG9rZW5zLmN1cnIudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFyZSBub3QgZXF1YWwsIHRoZW4gc2FmZWx5IGFzc3VtZSB0aGF0IHRoaXMgbm90IFwibmV3IE9iamVjdCgpXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlICE9PSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzT2JqZWN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNBcnJheSAmJiBzdGF0ZS50b2tlbnMuY3Vyci5pZCA9PT0gXCIoXCIgJiYgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA5XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNPYmplY3QgJiYgc3RhdGUudG9rZW5zLmN1cnIuaWQgPT09IFwiKFwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxMFwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxlZnQgJiYgc3RhdGUudG9rZW5zLmN1cnIubGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlZnQgPSBzdGF0ZS50b2tlbnMuY3Vyci5sZWQobGVmdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDMzXCIsIHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMuY3Vyci5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc0xldEV4cHIpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgIH1cblxuICAgICAgICBzdGF0ZS5uYW1lU3RhY2sucG9wKCk7XG5cbiAgICAgICAgcmV0dXJuIGxlZnQ7XG4gICAgfVxuXG5cbiAgICAvLyBGdW5jdGlvbnMgZm9yIGNvbmZvcm1hbmNlIG9mIHN0eWxlLlxuXG4gICAgZnVuY3Rpb24gc3RhcnRMaW5lKHRva2VuKSB7XG4gICAgICAgIHJldHVybiB0b2tlbi5zdGFydExpbmUgfHwgdG9rZW4ubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub2JyZWFrbm9uYWRqYWNlbnQobGVmdCwgcmlnaHQpIHtcbiAgICAgICAgbGVmdCA9IGxlZnQgfHwgc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHJpZ2h0ID0gcmlnaHQgfHwgc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmxheGJyZWFrICYmIGxlZnQubGluZSAhPT0gc3RhcnRMaW5lKHJpZ2h0KSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMTRcIiwgcmlnaHQsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG5vbGluZWJyZWFrKHQpIHtcbiAgICAgICAgdCA9IHQgfHwgc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIGlmICh0LmxpbmUgIT09IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJFMDIyXCIsIHQsIHQudmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9icmVha2NvbW1hKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIGlmIChsZWZ0LmxpbmUgIT09IHN0YXJ0TGluZShyaWdodCkpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmxheGNvbW1hKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbW1hWydmaXJzdCddKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJJMDAxXCIpO1xuICAgICAgICAgICAgICAgICAgICBjb21tYVsnZmlyc3QnXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxNFwiLCBsZWZ0LCByaWdodC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21tYShvcHRzPykge1xuICAgICAgICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAgICAgICBpZiAoIW9wdHMucGVlaykge1xuICAgICAgICAgICAgbm9icmVha2NvbW1hKHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5vYnJlYWtjb21tYShzdGF0ZS50b2tlbnMucHJldiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIgJiYgIShvcHRzLnByb3BlcnR5ICYmIHN0YXRlLmluRVM1KCkpKSB7XG4gICAgICAgICAgICAvLyBLZXl3b3JkcyB0aGF0IGNhbm5vdCBmb2xsb3cgYSBjb21tYSBvcGVyYXRvci5cbiAgICAgICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwiYnJlYWtcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2FzZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJjYXRjaFwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJjb250aW51ZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJkZWZhdWx0XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcImRvXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcImVsc2VcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiZmluYWxseVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJmb3JcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaWZcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaW5cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaW5zdGFuY2VvZlwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJyZXR1cm5cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwic3dpdGNoXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcInRocm93XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcInRyeVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwibGV0XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIndoaWxlXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIndpdGhcIjpcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcIihwdW5jdHVhdG9yKVwiKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBcIn1cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiXVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCIsXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRzLmFsbG93VHJhaWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICAgICAgY2FzZSBcIilcIjpcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBGdW5jdGlvbmFsIGNvbnN0cnVjdG9ycyBmb3IgbWFraW5nIHRoZSBzeW1ib2xzIHRoYXQgd2lsbCBiZSBpbmhlcml0ZWQgYnlcbiAgICAvLyB0b2tlbnMuXG5cbiAgICBmdW5jdGlvbiBzeW1ib2woczogc3RyaW5nLCBwKSB7XG4gICAgICAgIHZhciB4ID0gc3RhdGUuc3ludGF4W3NdO1xuICAgICAgICBpZiAoIXggfHwgdHlwZW9mIHggIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIHN0YXRlLnN5bnRheFtzXSA9IHggPSB7XG4gICAgICAgICAgICAgICAgaWQ6IHMsXG4gICAgICAgICAgICAgICAgbGJwOiBwLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlbGltKHM6IHN0cmluZykge1xuICAgICAgICB2YXIgeCA9IHN5bWJvbChzLCAwKTtcbiAgICAgICAgeC5kZWxpbSA9IHRydWU7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0bXQoczogc3RyaW5nLCBmKSB7XG4gICAgICAgIHZhciB4ID0gZGVsaW0ocyk7XG4gICAgICAgIHguaWRlbnRpZmllciA9IHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB4LmZ1ZCA9IGY7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJsb2Nrc3RtdChzOiBzdHJpbmcsIGYpIHtcbiAgICAgICAgdmFyIHggPSBzdG10KHMsIGYpO1xuICAgICAgICB4LmJsb2NrID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZU5hbWUoeDogeyBpZDogc3RyaW5nOyBpZGVudGlmaWVyPzsgcmVzZXJ2ZWQ/fSkge1xuICAgICAgICB2YXIgYyA9IHguaWQuY2hhckF0KDApO1xuICAgICAgICBpZiAoKGMgPj0gXCJhXCIgJiYgYyA8PSBcInpcIikgfHwgKGMgPj0gXCJBXCIgJiYgYyA8PSBcIlpcIikpIHtcbiAgICAgICAgICAgIHguaWRlbnRpZmllciA9IHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByZWZpeChzOiBzdHJpbmcsIGY/KSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIDE1MCk7XG4gICAgICAgIHJlc2VydmVOYW1lKHgpO1xuXG4gICAgICAgIHgubnVkID0gKHR5cGVvZiBmID09PSBcImZ1bmN0aW9uXCIpID8gZiA6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5hcml0eSA9IFwidW5hcnlcIjtcbiAgICAgICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDE1MCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmlkID09PSBcIisrXCIgfHwgdGhpcy5pZCA9PT0gXCItLVwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5wbHVzcGx1cykge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxNlwiLCB0aGlzLCB0aGlzLmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucmlnaHQgJiYgKCF0aGlzLnJpZ2h0LmlkZW50aWZpZXIgfHwgaXNSZXNlcnZlZCh0aGlzLnJpZ2h0KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yaWdodC5pZCAhPT0gXCIuXCIgJiYgdGhpcy5yaWdodC5pZCAhPT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTdcIiwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucmlnaHQgJiYgdGhpcy5yaWdodC5pc01ldGFQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzFcIiwgdGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRldGVjdCBpbmNyZW1lbnQvZGVjcmVtZW50IG9mIGEgY29uc3RcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIGNhc2Ugb2YgYS5iLCByaWdodCB3aWxsIGJlIHRoZSBcIi5cIiBwdW5jdHVhdG9yXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnJpZ2h0ICYmIHRoaXMucmlnaHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2subW9kaWZ5KHRoaXMucmlnaHQudmFsdWUsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdHlwZShzOiBzdHJpbmcsIGZ1bmMpIHtcbiAgICAgICAgdmFyIHggPSBkZWxpbShzKTtcbiAgICAgICAgeC50eXBlID0gcztcbiAgICAgICAgeC5udWQgPSBmdW5jO1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNlcnZlKG5hbWU6IHN0cmluZywgZnVuYz8pIHtcbiAgICAgICAgdmFyIHggPSB0eXBlKG5hbWUsIGZ1bmMpO1xuICAgICAgICB4LmlkZW50aWZpZXIgPSB0cnVlO1xuICAgICAgICB4LnJlc2VydmVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gRnV0dXJlUmVzZXJ2ZWRXb3JkKG5hbWU6IHN0cmluZywgbWV0YT8pIHtcbiAgICAgICAgdmFyIHggPSB0eXBlKG5hbWUsIChtZXRhICYmIG1ldGEubnVkKSB8fCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBtZXRhID0gbWV0YSB8fCB7fTtcbiAgICAgICAgbWV0YS5pc0Z1dHVyZVJlc2VydmVkV29yZCA9IHRydWU7XG5cbiAgICAgICAgeC52YWx1ZSA9IG5hbWU7XG4gICAgICAgIHguaWRlbnRpZmllciA9IHRydWU7XG4gICAgICAgIHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB4Lm1ldGEgPSBtZXRhO1xuXG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2VydmV2YXIoczogc3RyaW5nLCB2Pykge1xuICAgICAgICByZXR1cm4gcmVzZXJ2ZShzLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgdih0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmZpeChzOiBzdHJpbmcsIGYsIHAsIHc/KSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIHApO1xuICAgICAgICByZXNlcnZlTmFtZSh4KTtcbiAgICAgICAgeC5pbmZpeCA9IHRydWU7XG4gICAgICAgIHgubGVkID0gZnVuY3Rpb24obGVmdCkge1xuICAgICAgICAgICAgaWYgKCF3KSB7XG4gICAgICAgICAgICAgICAgbm9icmVha25vbmFkamFjZW50KHN0YXRlLnRva2Vucy5wcmV2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoKHMgPT09IFwiaW5cIiB8fCBzID09PSBcImluc3RhbmNlb2ZcIikgJiYgbGVmdC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCBsZWZ0LCBcIiFcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmKGxlZnQsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbihwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXBwbGljYXRpb24oczogc3RyaW5nKSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIDQyKTtcblxuICAgICAgICB4LmxlZCA9IGZ1bmN0aW9uKGxlZnQpIHtcbiAgICAgICAgICAgIG5vYnJlYWtub25hZGphY2VudChzdGF0ZS50b2tlbnMucHJldiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuXG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgdGhpcy5yaWdodCA9IGRvRnVuY3Rpb24oeyB0eXBlOiBcImFycm93XCIsIGxvbmVBcmc6IGxlZnQgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVsYXRpb24oczogc3RyaW5nLCBmPykge1xuICAgICAgICB2YXIgeCA9IHN5bWJvbChzLCAxMDApO1xuXG4gICAgICAgIHgubGVkID0gZnVuY3Rpb24obGVmdCkge1xuICAgICAgICAgICAgbm9icmVha25vbmFkamFjZW50KHN0YXRlLnRva2Vucy5wcmV2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgdmFyIHJpZ2h0ID0gdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTAwKTtcblxuICAgICAgICAgICAgaWYgKGlzSWRlbnRpZmllcihsZWZ0LCBcIk5hTlwiKSB8fCBpc0lkZW50aWZpZXIocmlnaHQsIFwiTmFOXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTlcIiwgdGhpcyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGYpIHtcbiAgICAgICAgICAgICAgICBmLmFwcGx5KHRoaXMsIFtsZWZ0LCByaWdodF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWxlZnQgfHwgIXJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVmdC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCBsZWZ0LCBcIiFcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyaWdodC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCByaWdodCwgXCIhXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNQb29yUmVsYXRpb24obm9kZSkge1xuICAgICAgICByZXR1cm4gbm9kZSAmJlxuICAgICAgICAgICAgKChub2RlLnR5cGUgPT09IFwiKG51bWJlcilcIiAmJiArbm9kZS52YWx1ZSA9PT0gMCkgfHxcbiAgICAgICAgICAgICAgICAobm9kZS50eXBlID09PSBcIihzdHJpbmcpXCIgJiYgbm9kZS52YWx1ZSA9PT0gXCJcIikgfHxcbiAgICAgICAgICAgICAgICAobm9kZS50eXBlID09PSBcIm51bGxcIiAmJiAhc3RhdGUub3B0aW9uLmVxbnVsbCkgfHxcbiAgICAgICAgICAgICAgICBub2RlLnR5cGUgPT09IFwidHJ1ZVwiIHx8XG4gICAgICAgICAgICAgICAgbm9kZS50eXBlID09PSBcImZhbHNlXCIgfHxcbiAgICAgICAgICAgICAgICBub2RlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpO1xuICAgIH1cblxuICAgIHZhciB0eXBlb2ZWYWx1ZXM6IHsgbGVnYWN5PzsgZXMzPzsgZXM2P30gPSB7fTtcbiAgICB0eXBlb2ZWYWx1ZXMubGVnYWN5ID0gW1xuICAgICAgICAvLyBFNFggZXh0ZW5kZWQgdGhlIGB0eXBlb2ZgIG9wZXJhdG9yIHRvIHJldHVybiBcInhtbFwiIGZvciB0aGUgWE1MIGFuZFxuICAgICAgICAvLyBYTUxMaXN0IHR5cGVzIGl0IGludHJvZHVjZWQuXG4gICAgICAgIC8vIFJlZjogMTEuMy4yIFRoZSB0eXBlb2YgT3BlcmF0b3JcbiAgICAgICAgLy8gaHR0cDovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL3B1YmxpY2F0aW9ucy9maWxlcy9FQ01BLVNUL0VjbWEtMzU3LnBkZlxuICAgICAgICBcInhtbFwiLFxuICAgICAgICAvLyBJRTw5IHJlcG9ydHMgXCJ1bmtub3duXCIgd2hlbiB0aGUgYHR5cGVvZmAgb3BlcmF0b3IgaXMgYXBwbGllZCB0byBhblxuICAgICAgICAvLyBvYmplY3QgZXhpc3RpbmcgYWNyb3NzIGEgQ09NKyBicmlkZ2UuIEluIGxpZXUgb2Ygb2ZmaWNpYWwgZG9jdW1lbnRhdGlvblxuICAgICAgICAvLyAod2hpY2ggZG9lcyBub3QgZXhpc3QpLCBzZWU6XG4gICAgICAgIC8vIGh0dHA6Ly9yb2JlcnRueW1hbi5jb20vMjAwNS8xMi8yMS93aGF0LWlzLXR5cGVvZi11bmtub3duL1xuICAgICAgICBcInVua25vd25cIlxuICAgIF07XG4gICAgdHlwZW9mVmFsdWVzLmVzMyA9IFtcbiAgICAgICAgXCJ1bmRlZmluZWRcIiwgXCJib29sZWFuXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIsIFwiZnVuY3Rpb25cIiwgXCJvYmplY3RcIixcbiAgICBdO1xuICAgIHR5cGVvZlZhbHVlcy5lczMgPSB0eXBlb2ZWYWx1ZXMuZXMzLmNvbmNhdCh0eXBlb2ZWYWx1ZXMubGVnYWN5KTtcbiAgICB0eXBlb2ZWYWx1ZXMuZXM2ID0gdHlwZW9mVmFsdWVzLmVzMy5jb25jYXQoXCJzeW1ib2xcIik7XG5cbiAgICAvLyBDaGVja3Mgd2hldGhlciB0aGUgJ3R5cGVvZicgb3BlcmF0b3IgaXMgdXNlZCB3aXRoIHRoZSBjb3JyZWN0XG4gICAgLy8gdmFsdWUuIEZvciBkb2NzIG9uICd0eXBlb2YnIHNlZTpcbiAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvdHlwZW9mXG4gICAgZnVuY3Rpb24gaXNUeXBvVHlwZW9mKGxlZnQsIHJpZ2h0LCBzdGF0ZSkge1xuICAgICAgICB2YXIgdmFsdWVzO1xuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubm90eXBlb2YpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgaWYgKCFsZWZ0IHx8ICFyaWdodClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICB2YWx1ZXMgPSBzdGF0ZS5pbkVTNigpID8gdHlwZW9mVmFsdWVzLmVzNiA6IHR5cGVvZlZhbHVlcy5lczM7XG5cbiAgICAgICAgaWYgKHJpZ2h0LnR5cGUgPT09IFwiKGlkZW50aWZpZXIpXCIgJiYgcmlnaHQudmFsdWUgPT09IFwidHlwZW9mXCIgJiYgbGVmdC50eXBlID09PSBcIihzdHJpbmcpXCIpXG4gICAgICAgICAgICByZXR1cm4gIV8uY29udGFpbnModmFsdWVzLCBsZWZ0LnZhbHVlKTtcblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNHbG9iYWxFdmFsKGxlZnQsIHN0YXRlKSB7XG4gICAgICAgIHZhciBpc0dsb2JhbCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIHBlcm1pdCBtZXRob2RzIHRvIHJlZmVyIHRvIGFuIFwiZXZhbFwiIGtleSBpbiB0aGVpciBvd24gY29udGV4dFxuICAgICAgICBpZiAobGVmdC50eXBlID09PSBcInRoaXNcIiAmJiBzdGF0ZS5mdW5jdFtcIihjb250ZXh0KVwiXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgaXNHbG9iYWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIHBlcm1pdCB1c2Ugb2YgXCJldmFsXCIgbWVtYmVycyBvZiBvYmplY3RzXG4gICAgICAgIGVsc2UgaWYgKGxlZnQudHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIikge1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub2RlICYmIGxlZnQudmFsdWUgPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICBpc0dsb2JhbCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5icm93c2VyICYmIChsZWZ0LnZhbHVlID09PSBcIndpbmRvd1wiIHx8IGxlZnQudmFsdWUgPT09IFwiZG9jdW1lbnRcIikpIHtcbiAgICAgICAgICAgICAgICBpc0dsb2JhbCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaXNHbG9iYWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE5hdGl2ZVByb3RvdHlwZShsZWZ0KSB7XG4gICAgICAgIHZhciBuYXRpdmVzID0gW1xuICAgICAgICAgICAgXCJBcnJheVwiLCBcIkFycmF5QnVmZmVyXCIsIFwiQm9vbGVhblwiLCBcIkNvbGxhdG9yXCIsIFwiRGF0YVZpZXdcIiwgXCJEYXRlXCIsXG4gICAgICAgICAgICBcIkRhdGVUaW1lRm9ybWF0XCIsIFwiRXJyb3JcIiwgXCJFdmFsRXJyb3JcIiwgXCJGbG9hdDMyQXJyYXlcIiwgXCJGbG9hdDY0QXJyYXlcIixcbiAgICAgICAgICAgIFwiRnVuY3Rpb25cIiwgXCJJbmZpbml0eVwiLCBcIkludGxcIiwgXCJJbnQxNkFycmF5XCIsIFwiSW50MzJBcnJheVwiLCBcIkludDhBcnJheVwiLFxuICAgICAgICAgICAgXCJJdGVyYXRvclwiLCBcIk51bWJlclwiLCBcIk51bWJlckZvcm1hdFwiLCBcIk9iamVjdFwiLCBcIlJhbmdlRXJyb3JcIixcbiAgICAgICAgICAgIFwiUmVmZXJlbmNlRXJyb3JcIiwgXCJSZWdFeHBcIiwgXCJTdG9wSXRlcmF0aW9uXCIsIFwiU3RyaW5nXCIsIFwiU3ludGF4RXJyb3JcIixcbiAgICAgICAgICAgIFwiVHlwZUVycm9yXCIsIFwiVWludDE2QXJyYXlcIiwgXCJVaW50MzJBcnJheVwiLCBcIlVpbnQ4QXJyYXlcIiwgXCJVaW50OENsYW1wZWRBcnJheVwiLFxuICAgICAgICAgICAgXCJVUklFcnJvclwiXG4gICAgICAgIF07XG5cbiAgICAgICAgZnVuY3Rpb24gd2Fsa1Byb3RvdHlwZShvYmopIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSByZXR1cm47XG4gICAgICAgICAgICByZXR1cm4gb2JqLnJpZ2h0ID09PSBcInByb3RvdHlwZVwiID8gb2JqIDogd2Fsa1Byb3RvdHlwZShvYmoubGVmdCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB3YWxrTmF0aXZlKG9iaikge1xuICAgICAgICAgICAgd2hpbGUgKCFvYmouaWRlbnRpZmllciAmJiB0eXBlb2Ygb2JqLmxlZnQgPT09IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgb2JqID0gb2JqLmxlZnQ7XG5cbiAgICAgICAgICAgIGlmIChvYmouaWRlbnRpZmllciAmJiBuYXRpdmVzLmluZGV4T2Yob2JqLnZhbHVlKSA+PSAwKVxuICAgICAgICAgICAgICAgIHJldHVybiBvYmoudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcHJvdG90eXBlID0gd2Fsa1Byb3RvdHlwZShsZWZ0KTtcbiAgICAgICAgaWYgKHByb3RvdHlwZSkgcmV0dXJuIHdhbGtOYXRpdmUocHJvdG90eXBlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIGxlZnQgaGFuZCBzaWRlIG9mIGFuIGFzc2lnbm1lbnQgZm9yIGlzc3VlcywgcmV0dXJucyBpZiBva1xuICAgICAqIEBwYXJhbSB7dG9rZW59IGxlZnQgLSB0aGUgbGVmdCBoYW5kIHNpZGUgb2YgdGhlIGFzc2lnbm1lbnRcbiAgICAgKiBAcGFyYW0ge3Rva2VuPX0gYXNzaWduVG9rZW4gLSB0aGUgdG9rZW4gZm9yIHRoZSBhc3NpZ25tZW50LCB1c2VkIGZvciByZXBvcnRpbmdcbiAgICAgKiBAcGFyYW0ge29iamVjdD19IG9wdGlvbnMgLSBvcHRpb25hbCBvYmplY3RcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG9wdGlvbnMuYWxsb3dEZXN0cnVjdHVyaW5nIC0gd2hldGhlciB0byBhbGxvdyBkZXN0cnVjdHV0aW5nIGJpbmRpbmdcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gV2hldGhlciB0aGUgbGVmdCBoYW5kIHNpZGUgaXMgT0tcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjaGVja0xlZnRTaWRlQXNzaWduKGxlZnQsIGFzc2lnblRva2VuPywgb3B0aW9ucz8pIHtcblxuICAgICAgICB2YXIgYWxsb3dEZXN0cnVjdHVyaW5nID0gb3B0aW9ucyAmJiBvcHRpb25zLmFsbG93RGVzdHJ1Y3R1cmluZztcblxuICAgICAgICBhc3NpZ25Ub2tlbiA9IGFzc2lnblRva2VuIHx8IGxlZnQ7XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5mcmVlemUpIHtcbiAgICAgICAgICAgIHZhciBuYXRpdmVPYmplY3QgPSBmaW5kTmF0aXZlUHJvdG90eXBlKGxlZnQpO1xuICAgICAgICAgICAgaWYgKG5hdGl2ZU9iamVjdClcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEyMVwiLCBsZWZ0LCBuYXRpdmVPYmplY3QpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxlZnQuaWRlbnRpZmllciAmJiAhbGVmdC5pc01ldGFQcm9wZXJ0eSkge1xuICAgICAgICAgICAgLy8gcmVhc3NpZ24gYWxzbyBjYWxscyBtb2RpZnlcbiAgICAgICAgICAgIC8vIGJ1dCB3ZSBhcmUgc3BlY2lmaWMgaW4gb3JkZXIgdG8gY2F0Y2ggZnVuY3Rpb24gcmUtYXNzaWdubWVudFxuICAgICAgICAgICAgLy8gYW5kIGdsb2JhbHMgcmUtYXNzaWdubWVudFxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLnJlYXNzaWduKGxlZnQudmFsdWUsIGxlZnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxlZnQuaWQgPT09IFwiLlwiKSB7XG4gICAgICAgICAgICBpZiAoIWxlZnQubGVmdCB8fCBsZWZ0LmxlZnQudmFsdWUgPT09IFwiYXJndW1lbnRzXCIgJiYgIXN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMVwiLCBhc3NpZ25Ub2tlbik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlLm5hbWVTdGFjay5zZXQoc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAobGVmdC5pZCA9PT0gXCJ7XCIgfHwgbGVmdC5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgIGlmIChhbGxvd0Rlc3RydWN0dXJpbmcgJiYgc3RhdGUudG9rZW5zLmN1cnIubGVmdC5kZXN0cnVjdEFzc2lnbikge1xuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmxlZnQuZGVzdHJ1Y3RBc3NpZ24uZm9yRWFjaChmdW5jdGlvbih0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0LmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2subW9kaWZ5KHQuaWQsIHQudG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChsZWZ0LmlkID09PSBcIntcIiB8fCAhbGVmdC5sZWZ0KSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDMxXCIsIGFzc2lnblRva2VuKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxlZnQubGVmdC52YWx1ZSA9PT0gXCJhcmd1bWVudHNcIiAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMVwiLCBhc3NpZ25Ub2tlbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVmdC5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KGxlZnQucmlnaHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChsZWZ0LmlzTWV0YVByb3BlcnR5KSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMzFcIiwgYXNzaWduVG9rZW4pO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAobGVmdC5pZGVudGlmaWVyICYmICFpc1Jlc2VydmVkKGxlZnQpKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmxhYmVsdHlwZShsZWZ0LnZhbHVlKSA9PT0gXCJleGNlcHRpb25cIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDIyXCIsIGxlZnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChsZWZ0KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGxlZnQgPT09IHN0YXRlLnN5bnRheFtcImZ1bmN0aW9uXCJdKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAyM1wiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXNzaWdub3AocywgZiwgcCkge1xuICAgICAgICB2YXIgeCA9IGluZml4KHMsIHR5cGVvZiBmID09PSBcImZ1bmN0aW9uXCIgPyBmIDogZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICAgICAgdGhhdC5sZWZ0ID0gbGVmdDtcblxuICAgICAgICAgICAgaWYgKGxlZnQgJiYgY2hlY2tMZWZ0U2lkZUFzc2lnbihsZWZ0LCB0aGF0LCB7IGFsbG93RGVzdHJ1Y3R1cmluZzogdHJ1ZSB9KSkge1xuICAgICAgICAgICAgICAgIHRoYXQucmlnaHQgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhhdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZXJyb3IoXCJFMDMxXCIsIHRoYXQpO1xuICAgICAgICB9LCBwKTtcblxuICAgICAgICB4LmV4cHMgPSB0cnVlO1xuICAgICAgICB4LmFzc2lnbiA9IHRydWU7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gYml0d2lzZShzLCBmLCBwKSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIHApO1xuICAgICAgICByZXNlcnZlTmFtZSh4KTtcbiAgICAgICAgeC5sZWQgPSAodHlwZW9mIGYgPT09IFwiZnVuY3Rpb25cIikgPyBmIDogZnVuY3Rpb24obGVmdCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5iaXR3aXNlKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTZcIiwgdGhpcywgdGhpcy5pZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgdGhpcy5yaWdodCA9IGV4cHJlc3Npb24ocCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYml0d2lzZWFzc2lnbm9wKHMpIHtcbiAgICAgICAgcmV0dXJuIGFzc2lnbm9wKHMsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uYml0d2lzZSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDE2XCIsIHRoYXQsIHRoYXQuaWQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVmdCAmJiBjaGVja0xlZnRTaWRlQXNzaWduKGxlZnQsIHRoYXQpKSB7XG4gICAgICAgICAgICAgICAgdGhhdC5yaWdodCA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGF0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXJyb3IoXCJFMDMxXCIsIHRoYXQpO1xuICAgICAgICB9LCAyMCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VmZml4KHMpIHtcbiAgICAgICAgdmFyIHggPSBzeW1ib2wocywgMTUwKTtcblxuICAgICAgICB4LmxlZCA9IGZ1bmN0aW9uKGxlZnQpIHtcbiAgICAgICAgICAgIC8vIHRoaXMgPSBzdWZmaXggZS5nLiBcIisrXCIgcHVuY3R1YXRvclxuICAgICAgICAgICAgLy8gbGVmdCA9IHN5bWJvbCBvcGVyYXRlZCBlLmcuIFwiYVwiIGlkZW50aWZpZXIgb3IgXCJhLmJcIiBwdW5jdHVhdG9yXG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnBsdXNwbHVzKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTZcIiwgdGhpcywgdGhpcy5pZCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCghbGVmdC5pZGVudGlmaWVyIHx8IGlzUmVzZXJ2ZWQobGVmdCkpICYmIGxlZnQuaWQgIT09IFwiLlwiICYmIGxlZnQuaWQgIT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTdcIiwgdGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChsZWZ0LmlzTWV0YVByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDMxXCIsIHRoaXMpO1xuICAgICAgICAgICAgICAgIC8vIGRldGVjdCBpbmNyZW1lbnQvZGVjcmVtZW50IG9mIGEgY29uc3RcbiAgICAgICAgICAgICAgICAvLyBpbiB0aGUgY2FzZSBvZiBhLmIsIGxlZnQgd2lsbCBiZSB0aGUgXCIuXCIgcHVuY3R1YXRvclxuICAgICAgICAgICAgfSBlbHNlIGlmIChsZWZ0ICYmIGxlZnQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5ibG9jay5tb2RpZnkobGVmdC52YWx1ZSwgbGVmdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgLy8gZm5wYXJhbSBtZWFucyB0aGF0IHRoaXMgaWRlbnRpZmllciBpcyBiZWluZyBkZWZpbmVkIGFzIGEgZnVuY3Rpb25cbiAgICAvLyBhcmd1bWVudCAoc2VlIGlkZW50aWZpZXIoKSlcbiAgICAvLyBwcm9wIG1lYW5zIHRoYXQgdGhpcyBpZGVudGlmaWVyIGlzIHRoYXQgb2YgYW4gb2JqZWN0IHByb3BlcnR5XG5cbiAgICBmdW5jdGlvbiBvcHRpb25hbGlkZW50aWZpZXIoZm5wYXJhbT8sIHByb3A/LCBwcmVzZXJ2ZT8pIHtcbiAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMubmV4dC5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXByZXNlcnZlKSB7XG4gICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3VyciA9IHN0YXRlLnRva2Vucy5jdXJyO1xuICAgICAgICB2YXIgdmFsID0gc3RhdGUudG9rZW5zLmN1cnIudmFsdWU7XG5cbiAgICAgICAgaWYgKCFpc1Jlc2VydmVkKGN1cnIpKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3ApIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5pbkVTNSgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmbnBhcmFtICYmIHZhbCA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHdhcm5pbmcoXCJXMDI0XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMuY3Vyci5pZCk7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxuXG4gICAgLy8gZm5wYXJhbSBtZWFucyB0aGF0IHRoaXMgaWRlbnRpZmllciBpcyBiZWluZyBkZWZpbmVkIGFzIGEgZnVuY3Rpb25cbiAgICAvLyBhcmd1bWVudFxuICAgIC8vIHByb3AgbWVhbnMgdGhhdCB0aGlzIGlkZW50aWZpZXIgaXMgdGhhdCBvZiBhbiBvYmplY3QgcHJvcGVydHlcbiAgICBmdW5jdGlvbiBpZGVudGlmaWVyKGZucGFyYW0/LCBwcm9wPykge1xuICAgICAgICB2YXIgaSA9IG9wdGlvbmFsaWRlbnRpZmllcihmbnBhcmFtLCBwcm9wLCBmYWxzZSk7XG4gICAgICAgIGlmIChpKSB7XG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBhcmFtZXRlciBkZXN0cnVjdHVyaW5nIHdpdGggcmVzdCBvcGVyYXRvclxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiLi4uXCIpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJzcHJlYWQvcmVzdCBvcGVyYXRvclwiLCBcIjZcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKCk7XG5cbiAgICAgICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiLi4uXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMjRcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiLi4uXCIpO1xuICAgICAgICAgICAgICAgIHdoaWxlIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiLi4uXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcIi4uLlwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpZGVudGlmaWVyKGZucGFyYW0sIHByb3ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDMwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG5cbiAgICAgICAgICAgIC8vIFRoZSB0b2tlbiBzaG91bGQgYmUgY29uc3VtZWQgYWZ0ZXIgYSB3YXJuaW5nIGlzIGlzc3VlZCBzbyB0aGUgcGFyc2VyXG4gICAgICAgICAgICAvLyBjYW4gY29udGludWUgYXMgdGhvdWdoIGFuIGlkZW50aWZpZXIgd2VyZSBmb3VuZC4gVGhlIHNlbWljb2xvbiB0b2tlblxuICAgICAgICAgICAgLy8gc2hvdWxkIG5vdCBiZSBjb25zdW1lZCBpbiB0aGlzIHdheSBzbyB0aGF0IHRoZSBwYXJzZXIgaW50ZXJwcmV0cyBpdCBhc1xuICAgICAgICAgICAgLy8gYSBzdGF0ZW1lbnQgZGVsaW1ldGVyO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIikge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcmVhY2hhYmxlKGNvbnRyb2xUb2tlbikge1xuICAgICAgICB2YXIgaSA9IDAsIHQ7XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIgfHwgY29udHJvbFRva2VuLmluQnJhY2VsZXNzQmxvY2spIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHQgPSBwZWVrKGkpO1xuICAgICAgICAgICAgICAgIGkgKz0gMTtcbiAgICAgICAgICAgIH0gd2hpbGUgKHQuaWQgIT09IFwiKGVuZClcIiAmJiB0LmlkID09PSBcIihjb21tZW50KVwiKTtcblxuICAgICAgICAgICAgaWYgKHQucmVhY2gpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodC5pZCAhPT0gXCIoZW5kbGluZSlcIikge1xuICAgICAgICAgICAgICAgIGlmICh0LmlkID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5sYXRlZGVmID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyNlwiLCB0KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyN1wiLCB0LCB0LnZhbHVlLCBjb250cm9sVG9rZW4udmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyc2VGaW5hbFNlbWljb2xvbigpIHtcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIikge1xuICAgICAgICAgICAgLy8gZG9uJ3QgY29tcGxhaW4gYWJvdXQgdW5jbG9zZWQgdGVtcGxhdGVzIC8gc3RyaW5nc1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlzVW5jbG9zZWQpIHJldHVybiBhZHZhbmNlKCk7XG5cbiAgICAgICAgICAgIHZhciBzYW1lTGluZSA9IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCkgPT09IHN0YXRlLnRva2Vucy5jdXJyLmxpbmUgJiZcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoZW5kKVwiO1xuICAgICAgICAgICAgdmFyIGJsb2NrRW5kID0gY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIn1cIik7XG5cbiAgICAgICAgICAgIGlmIChzYW1lTGluZSAmJiAhYmxvY2tFbmQpIHtcbiAgICAgICAgICAgICAgICBlcnJvckF0KFwiRTA1OFwiLCBzdGF0ZS50b2tlbnMuY3Vyci5saW5lLCBzdGF0ZS50b2tlbnMuY3Vyci5jaGFyYWN0ZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghc3RhdGUub3B0aW9uLmFzaSkge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgaXMgdGhlIGxhc3Qgc3RhdGVtZW50IGluIGEgYmxvY2sgdGhhdCBlbmRzIG9uXG4gICAgICAgICAgICAgICAgLy8gdGhlIHNhbWUgbGluZSAqYW5kKiBvcHRpb24gbGFzdHNlbWljIGlzIG9uLCBpZ25vcmUgdGhlIHdhcm5pbmcuXG4gICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCBjb21wbGFpbiBhYm91dCBtaXNzaW5nIHNlbWljb2xvbi5cbiAgICAgICAgICAgICAgICBpZiAoKGJsb2NrRW5kICYmICFzdGF0ZS5vcHRpb24ubGFzdHNlbWljKSB8fCAhc2FtZUxpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ0F0KFwiVzAzM1wiLCBzdGF0ZS50b2tlbnMuY3Vyci5saW5lLCBzdGF0ZS50b2tlbnMuY3Vyci5jaGFyYWN0ZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFkdmFuY2UoXCI7XCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3RhdGVtZW50KCkge1xuICAgICAgICB2YXIgaSA9IGluZGVudCwgciwgdCA9IHN0YXRlLnRva2Vucy5uZXh0LCBoYXNPd25TY29wZSA9IGZhbHNlO1xuXG4gICAgICAgIGlmICh0LmlkID09PSBcIjtcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJcyB0aGlzIGEgbGFiZWxsZWQgc3RhdGVtZW50P1xuICAgICAgICB2YXIgcmVzID0gaXNSZXNlcnZlZCh0KTtcblxuICAgICAgICAvLyBXZSdyZSBiZWluZyBtb3JlIHRvbGVyYW50IGhlcmU6IGlmIHNvbWVvbmUgdXNlc1xuICAgICAgICAvLyBhIEZ1dHVyZVJlc2VydmVkV29yZCBhcyBhIGxhYmVsLCB3ZSB3YXJuIGJ1dCBwcm9jZWVkXG4gICAgICAgIC8vIGFueXdheS5cblxuICAgICAgICBpZiAocmVzICYmIHQubWV0YSAmJiB0Lm1ldGEuaXNGdXR1cmVSZXNlcnZlZFdvcmQgJiYgcGVlaygpLmlkID09PSBcIjpcIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMjRcIiwgdCwgdC5pZCk7XG4gICAgICAgICAgICByZXMgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0LmlkZW50aWZpZXIgJiYgIXJlcyAmJiBwZWVrKCkuaWQgPT09IFwiOlwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcblxuICAgICAgICAgICAgaGFzT3duU2NvcGUgPSB0cnVlO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2suYWRkQnJlYWtMYWJlbCh0LnZhbHVlLCB7IHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9KTtcblxuICAgICAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMubmV4dC5sYWJlbGxlZCAmJiBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSAhPT0gXCJ7XCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyOFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdC52YWx1ZSwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC5sYWJlbCA9IHQudmFsdWU7XG4gICAgICAgICAgICB0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJcyBpdCBhIGxvbmVseSBibG9jaz9cblxuICAgICAgICBpZiAodC5pZCA9PT0gXCJ7XCIpIHtcbiAgICAgICAgICAgIC8vIElzIGl0IGEgc3dpdGNoIGNhc2UgYmxvY2s/XG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gIHN3aXRjaCAoZm9vKSB7XG4gICAgICAgICAgICAvLyAgICBjYXNlIGJhcjogeyA8PSBoZXJlLlxuICAgICAgICAgICAgLy8gICAgICAuLi5cbiAgICAgICAgICAgIC8vICAgIH1cbiAgICAgICAgICAgIC8vICB9XG4gICAgICAgICAgICB2YXIgaXNjYXNlID0gKHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdID09PSBcImNhc2VcIiAmJiBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSA9PT0gXCI6XCIpO1xuICAgICAgICAgICAgYmxvY2sodHJ1ZSwgdHJ1ZSwgZmFsc2UsIGZhbHNlLCBpc2Nhc2UpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGFyc2UgdGhlIHN0YXRlbWVudC5cblxuICAgICAgICByID0gZXhwcmVzc2lvbigwLCB0cnVlKTtcblxuICAgICAgICBpZiAociAmJiAhKHIuaWRlbnRpZmllciAmJiByLnZhbHVlID09PSBcImZ1bmN0aW9uXCIpICYmXG4gICAgICAgICAgICAhKHIudHlwZSA9PT0gXCIocHVuY3R1YXRvcilcIiAmJiByLmxlZnQgJiZcbiAgICAgICAgICAgICAgICByLmxlZnQuaWRlbnRpZmllciAmJiByLmxlZnQudmFsdWUgPT09IFwiZnVuY3Rpb25cIikpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaXNTdHJpY3QoKSAmJlxuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAwN1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIExvb2sgZm9yIHRoZSBmaW5hbCBzZW1pY29sb24uXG5cbiAgICAgICAgaWYgKCF0LmJsb2NrKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5leHByICYmICghciB8fCAhci5leHBzKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDMwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3B0aW9uLm5vbmV3ICYmIHIgJiYgci5sZWZ0ICYmIHIuaWQgPT09IFwiKFwiICYmIHIubGVmdC5pZCA9PT0gXCJuZXdcIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDMxXCIsIHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcGFyc2VGaW5hbFNlbWljb2xvbigpO1xuICAgICAgICB9XG5cblxuICAgICAgICAvLyBSZXN0b3JlIHRoZSBpbmRlbnRhdGlvbi5cblxuICAgICAgICBpbmRlbnQgPSBpO1xuICAgICAgICBpZiAoaGFzT3duU2NvcGUpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHI7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBzdGF0ZW1lbnRzKCkge1xuICAgICAgICB2YXIgYSA9IFtdLCBwO1xuXG4gICAgICAgIHdoaWxlICghc3RhdGUudG9rZW5zLm5leHQucmVhY2ggJiYgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIjtcIikge1xuICAgICAgICAgICAgICAgIHAgPSBwZWVrKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXAgfHwgKHAuaWQgIT09IFwiKFwiICYmIHAuaWQgIT09IFwiW1wiKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAzMlwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiO1wiKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYS5wdXNoKHN0YXRlbWVudCgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYTtcbiAgICB9XG5cblxuICAgIC8qXG4gICAgICogcmVhZCBhbGwgZGlyZWN0aXZlc1xuICAgICAqIHJlY29nbml6ZXMgYSBzaW1wbGUgZm9ybSBvZiBhc2ksIGJ1dCBhbHdheXNcbiAgICAgKiB3YXJucywgaWYgaXQgaXMgdXNlZFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGRpcmVjdGl2ZXMoKSB7XG4gICAgICAgIHZhciBpLCBwLCBwbjtcblxuICAgICAgICB3aGlsZSAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKHN0cmluZylcIikge1xuICAgICAgICAgICAgcCA9IHBlZWsoMCk7XG4gICAgICAgICAgICBpZiAocC5pZCA9PT0gXCIoZW5kbGluZSlcIikge1xuICAgICAgICAgICAgICAgIGkgPSAxO1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgcG4gPSBwZWVrKGkrKyk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocG4uaWQgPT09IFwiKGVuZGxpbmUpXCIpO1xuICAgICAgICAgICAgICAgIGlmIChwbi5pZCA9PT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcCA9IHBuO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocG4udmFsdWUgPT09IFwiW1wiIHx8IHBuLnZhbHVlID09PSBcIi5cIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgLT4gWyB8IC4gaXMgYSB2YWxpZCBwcm9kdWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLm9wdGlvbi5hc2kgfHwgcG4udmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHN0cmluZyAtPiAoIGlzIG5vdCBhIHZhbGlkIHByb2R1Y3Rpb25cbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzNcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocC5pZCA9PT0gXCIuXCIgfHwgcC5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocC5pZCAhPT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAzM1wiLCBwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgdmFyIGRpcmVjdGl2ZSA9IHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlO1xuICAgICAgICAgICAgaWYgKHN0YXRlLmRpcmVjdGl2ZVtkaXJlY3RpdmVdIHx8XG4gICAgICAgICAgICAgICAgKGRpcmVjdGl2ZSA9PT0gXCJ1c2Ugc3RyaWN0XCIgJiYgc3RhdGUub3B0aW9uLnN0cmljdCA9PT0gXCJpbXBsaWVkXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzRcIiwgc3RhdGUudG9rZW5zLmN1cnIsIGRpcmVjdGl2ZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRoZXJlJ3Mgbm8gZGlyZWN0aXZlIG5lZ2F0aW9uLCBzbyBhbHdheXMgc2V0IHRvIHRydWVcbiAgICAgICAgICAgIHN0YXRlLmRpcmVjdGl2ZVtkaXJlY3RpdmVdID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKHAuaWQgPT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgc3RhdGUub3B0aW9uLnVuZGVmID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLypcbiAgICAgKiBQYXJzZXMgYSBzaW5nbGUgYmxvY2suIEEgYmxvY2sgaXMgYSBzZXF1ZW5jZSBvZiBzdGF0ZW1lbnRzIHdyYXBwZWQgaW5cbiAgICAgKiBicmFjZXMuXG4gICAgICpcbiAgICAgKiBvcmRpbmFyeSAgIC0gdHJ1ZSBmb3IgZXZlcnl0aGluZyBidXQgZnVuY3Rpb24gYm9kaWVzIGFuZCB0cnkgYmxvY2tzLlxuICAgICAqIHN0bXQgICAgICAgLSB0cnVlIGlmIGJsb2NrIGNhbiBiZSBhIHNpbmdsZSBzdGF0ZW1lbnQgKGUuZy4gaW4gaWYvZm9yL3doaWxlKS5cbiAgICAgKiBpc2Z1bmMgICAgIC0gdHJ1ZSBpZiBibG9jayBpcyBhIGZ1bmN0aW9uIGJvZHlcbiAgICAgKiBpc2ZhdGFycm93IC0gdHJ1ZSBpZiBpdHMgYSBib2R5IG9mIGEgZmF0IGFycm93IGZ1bmN0aW9uXG4gICAgICogaXNjYXNlICAgICAgLSB0cnVlIGlmIGJsb2NrIGlzIGEgc3dpdGNoIGNhc2UgYmxvY2tcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBibG9jayhvcmRpbmFyeTogYm9vbGVhbiwgc3RtdD86IGJvb2xlYW4sIGlzZnVuYz86IGJvb2xlYW4sIGlzZmF0YXJyb3c/OiBib29sZWFuLCBpc2Nhc2U/OiBib29sZWFuKSB7XG4gICAgICAgIHZhciBhLFxuICAgICAgICAgICAgYiA9IGluYmxvY2ssXG4gICAgICAgICAgICBvbGRfaW5kZW50ID0gaW5kZW50LFxuICAgICAgICAgICAgbSxcbiAgICAgICAgICAgIHQsXG4gICAgICAgICAgICBsaW5lLFxuICAgICAgICAgICAgZDtcblxuICAgICAgICBpbmJsb2NrID0gb3JkaW5hcnk7XG5cbiAgICAgICAgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuXG4gICAgICAgIHZhciBtZXRyaWNzID0gc3RhdGUuZnVuY3RbXCIobWV0cmljcylcIl07XG4gICAgICAgIG1ldHJpY3MubmVzdGVkQmxvY2tEZXB0aCArPSAxO1xuICAgICAgICBtZXRyaWNzLnZlcmlmeU1heE5lc3RlZEJsb2NrRGVwdGhQZXJGdW5jdGlvbigpO1xuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ7XCIpIHtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuXG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBuZXcgYmxvY2sgc2NvcGVcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjaygpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobm9ibG9ja3Njb3BlZHZhcilcIl0gPSBmYWxzZTtcblxuICAgICAgICAgICAgbGluZSA9IHN0YXRlLnRva2Vucy5jdXJyLmxpbmU7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50ICs9IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICAgICAgd2hpbGUgKCFvcmRpbmFyeSAmJiBzdGF0ZS50b2tlbnMubmV4dC5mcm9tID4gaW5kZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGVudCArPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChpc2Z1bmMpIHtcbiAgICAgICAgICAgICAgICAgICAgbSA9IHt9O1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGQgaW4gc3RhdGUuZGlyZWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoXy5oYXMoc3RhdGUuZGlyZWN0aXZlLCBkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1bZF0gPSBzdGF0ZS5kaXJlY3RpdmVbZF07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0aXZlcygpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ICYmIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKGdsb2JhbClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbVtcInVzZSBzdHJpY3RcIl0gJiYgIXN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAwN1wiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGEgPSBzdGF0ZW1lbnRzKCk7XG5cbiAgICAgICAgICAgICAgICBtZXRyaWNzLnN0YXRlbWVudENvdW50ICs9IGEubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFkdmFuY2UoXCJ9XCIsIHQpO1xuXG4gICAgICAgICAgICBpZiAoaXNmdW5jKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnZhbGlkYXRlUGFyYW1zKCk7XG4gICAgICAgICAgICAgICAgaWYgKG0pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZGlyZWN0aXZlID0gbTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG5cbiAgICAgICAgICAgIGluZGVudCA9IG9sZF9pbmRlbnQ7XG4gICAgICAgIH0gZWxzZSBpZiAoIW9yZGluYXJ5KSB7XG4gICAgICAgICAgICBpZiAoaXNmdW5jKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG5cbiAgICAgICAgICAgICAgICBtID0ge307XG4gICAgICAgICAgICAgICAgaWYgKHN0bXQgJiYgIWlzZmF0YXJyb3cgJiYgIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImZ1bmN0aW9uIGNsb3N1cmUgZXhwcmVzc2lvbnNcIik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCFzdG10KSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoZCBpbiBzdGF0ZS5kaXJlY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfLmhhcyhzdGF0ZS5kaXJlY3RpdmUsIGQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbVtkXSA9IHN0YXRlLmRpcmVjdGl2ZVtkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBleHByZXNzaW9uKDEwKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ICYmIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKGdsb2JhbClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtW1widXNlIHN0cmljdFwiXSAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMDdcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjFcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwie1wiLCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIGNoZWNrIHRvIGF2b2lkIGxldCBkZWNsYXJhdGlvbiBub3Qgd2l0aGluIGEgYmxvY2tcbiAgICAgICAgICAgIC8vIHRob3VnaCBpcyBmaW5lIGluc2lkZSBmb3IgbG9vcCBpbml0aWFsaXplciBzZWN0aW9uXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihub2Jsb2Nrc2NvcGVkdmFyKVwiXSA9IHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcImZvclwiO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG5cbiAgICAgICAgICAgIGlmICghc3RtdCB8fCBzdGF0ZS5vcHRpb24uY3VybHkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJ7XCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQuaW5CcmFjZWxlc3NCbG9jayA9IHRydWU7XG4gICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIC8vIHRlc3QgaW5kZW50YXRpb24gb25seSBpZiBzdGF0ZW1lbnQgaXMgaW4gbmV3IGxpbmVcbiAgICAgICAgICAgIGEgPSBbc3RhdGVtZW50KCldO1xuICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgICAgICBkZWxldGUgc3RhdGUuZnVuY3RbXCIobm9ibG9ja3Njb3BlZHZhcilcIl07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb24ndCBjbGVhciBhbmQgbGV0IGl0IHByb3BhZ2F0ZSBvdXQgaWYgaXQgaXMgXCJicmVha1wiLCBcInJldHVyblwiIG9yIHNpbWlsYXIgaW4gc3dpdGNoIGNhc2VcbiAgICAgICAgc3dpdGNoIChzdGF0ZS5mdW5jdFtcIih2ZXJiKVwiXSkge1xuICAgICAgICAgICAgY2FzZSBcImJyZWFrXCI6XG4gICAgICAgICAgICBjYXNlIFwiY29udGludWVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJyZXR1cm5cIjpcbiAgICAgICAgICAgIGNhc2UgXCJ0aHJvd1wiOlxuICAgICAgICAgICAgICAgIGlmIChpc2Nhc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGluYmxvY2sgPSBiO1xuICAgICAgICBpZiAob3JkaW5hcnkgJiYgc3RhdGUub3B0aW9uLm5vZW1wdHkgJiYgKCFhIHx8IGEubGVuZ3RoID09PSAwKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMzVcIiwgc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICB9XG4gICAgICAgIG1ldHJpY3MubmVzdGVkQmxvY2tEZXB0aCAtPSAxO1xuICAgICAgICByZXR1cm4gYTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGNvdW50TWVtYmVyKG0pIHtcbiAgICAgICAgaWYgKG1lbWJlcnNPbmx5ICYmIHR5cGVvZiBtZW1iZXJzT25seVttXSAhPT0gXCJib29sZWFuXCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDM2XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBtKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG1lbWJlclttXSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgbWVtYmVyW21dICs9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtZW1iZXJbbV0gPSAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgdGhlIHN5bnRheCB0YWJsZSBieSBkZWNsYXJpbmcgdGhlIHN5bnRhY3RpYyBlbGVtZW50cyBvZiB0aGUgbGFuZ3VhZ2UuXG5cbiAgICB0eXBlKFwiKG51bWJlcilcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgdHlwZShcIihzdHJpbmcpXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIHN0YXRlLnN5bnRheFtcIihpZGVudGlmaWVyKVwiXSA9IHtcbiAgICAgICAgdHlwZTogXCIoaWRlbnRpZmllcilcIixcbiAgICAgICAgbGJwOiAwLFxuICAgICAgICBpZGVudGlmaWVyOiB0cnVlLFxuXG4gICAgICAgIG51ZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgdiA9IHRoaXMudmFsdWU7XG5cbiAgICAgICAgICAgIC8vIElmIHRoaXMgaWRlbnRpZmllciBpcyB0aGUgbG9uZSBwYXJhbWV0ZXIgdG8gYSBzaG9ydGhhbmQgXCJmYXQgYXJyb3dcIlxuICAgICAgICAgICAgLy8gZnVuY3Rpb24gZGVmaW5pdGlvbiwgaS5lLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vICAgICB4ID0+IHg7XG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gLi4uaXQgc2hvdWxkIG5vdCBiZSBjb25zaWRlcmVkIGFzIGEgdmFyaWFibGUgaW4gdGhlIGN1cnJlbnQgc2NvcGUuIEl0XG4gICAgICAgICAgICAvLyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBzY29wZSBvZiB0aGUgbmV3IGZ1bmN0aW9uIHdoZW4gdGhlIG5leHQgdG9rZW4gaXNcbiAgICAgICAgICAgIC8vIHBhcnNlZCwgc28gaXQgY2FuIGJlIHNhZmVseSBpZ25vcmVkIGZvciBub3cuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiPT5cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uY2hlY2sodikpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2sudXNlKHYsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIGxlZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMzNcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgYmFzZVRlbXBsYXRlU3ludGF4ID0ge1xuICAgICAgICBsYnA6IDAsXG4gICAgICAgIGlkZW50aWZpZXI6IGZhbHNlLFxuICAgICAgICB0ZW1wbGF0ZTogdHJ1ZSxcbiAgICB9O1xuICAgIHN0YXRlLnN5bnRheFtcIih0ZW1wbGF0ZSlcIl0gPSBfLmV4dGVuZCh7XG4gICAgICAgIHR5cGU6IFwiKHRlbXBsYXRlKVwiLFxuICAgICAgICBudWQ6IGRvVGVtcGxhdGVMaXRlcmFsLFxuICAgICAgICBsZWQ6IGRvVGVtcGxhdGVMaXRlcmFsLFxuICAgICAgICBub1N1YnN0OiBmYWxzZVxuICAgIH0sIGJhc2VUZW1wbGF0ZVN5bnRheCk7XG5cbiAgICBzdGF0ZS5zeW50YXhbXCIodGVtcGxhdGUgbWlkZGxlKVwiXSA9IF8uZXh0ZW5kKHtcbiAgICAgICAgdHlwZTogXCIodGVtcGxhdGUgbWlkZGxlKVwiLFxuICAgICAgICBtaWRkbGU6IHRydWUsXG4gICAgICAgIG5vU3Vic3Q6IGZhbHNlXG4gICAgfSwgYmFzZVRlbXBsYXRlU3ludGF4KTtcblxuICAgIHN0YXRlLnN5bnRheFtcIih0ZW1wbGF0ZSB0YWlsKVwiXSA9IF8uZXh0ZW5kKHtcbiAgICAgICAgdHlwZTogXCIodGVtcGxhdGUgdGFpbClcIixcbiAgICAgICAgdGFpbDogdHJ1ZSxcbiAgICAgICAgbm9TdWJzdDogZmFsc2VcbiAgICB9LCBiYXNlVGVtcGxhdGVTeW50YXgpO1xuXG4gICAgc3RhdGUuc3ludGF4W1wiKG5vIHN1YnN0IHRlbXBsYXRlKVwiXSA9IF8uZXh0ZW5kKHtcbiAgICAgICAgdHlwZTogXCIodGVtcGxhdGUpXCIsXG4gICAgICAgIG51ZDogZG9UZW1wbGF0ZUxpdGVyYWwsXG4gICAgICAgIGxlZDogZG9UZW1wbGF0ZUxpdGVyYWwsXG4gICAgICAgIG5vU3Vic3Q6IHRydWUsXG4gICAgICAgIHRhaWw6IHRydWUgLy8gbWFyayBhcyB0YWlsLCBzaW5jZSBpdCdzIGFsd2F5cyB0aGUgbGFzdCBjb21wb25lbnRcbiAgICB9LCBiYXNlVGVtcGxhdGVTeW50YXgpO1xuXG4gICAgdHlwZShcIihyZWdleHApXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIC8vIEVDTUFTY3JpcHQgcGFyc2VyXG5cbiAgICBkZWxpbShcIihlbmRsaW5lKVwiKTtcbiAgICAoZnVuY3Rpb24oeCkge1xuICAgICAgICB4LmxpbmUgPSB4LmZyb20gPSAwO1xuICAgIH0pKGRlbGltKFwiKGJlZ2luKVwiKSk7XG4gICAgZGVsaW0oXCIoZW5kKVwiKS5yZWFjaCA9IHRydWU7XG4gICAgZGVsaW0oXCIoZXJyb3IpXCIpLnJlYWNoID0gdHJ1ZTtcbiAgICBkZWxpbShcIn1cIikucmVhY2ggPSB0cnVlO1xuICAgIGRlbGltKFwiKVwiKTtcbiAgICBkZWxpbShcIl1cIik7XG4gICAgZGVsaW0oXCJcXFwiXCIpLnJlYWNoID0gdHJ1ZTtcbiAgICBkZWxpbShcIidcIikucmVhY2ggPSB0cnVlO1xuICAgIGRlbGltKFwiO1wiKTtcbiAgICBkZWxpbShcIjpcIikucmVhY2ggPSB0cnVlO1xuICAgIGRlbGltKFwiI1wiKTtcblxuICAgIHJlc2VydmUoXCJlbHNlXCIpO1xuICAgIHJlc2VydmUoXCJjYXNlXCIpLnJlYWNoID0gdHJ1ZTtcbiAgICByZXNlcnZlKFwiY2F0Y2hcIik7XG4gICAgcmVzZXJ2ZShcImRlZmF1bHRcIikucmVhY2ggPSB0cnVlO1xuICAgIHJlc2VydmUoXCJmaW5hbGx5XCIpO1xuICAgIHJlc2VydmV2YXIoXCJhcmd1bWVudHNcIiwgZnVuY3Rpb24oeCkge1xuICAgICAgICBpZiAoc3RhdGUuaXNTdHJpY3QoKSAmJiBzdGF0ZS5mdW5jdFtcIihnbG9iYWwpXCJdKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiRTAwOFwiLCB4KTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJlc2VydmV2YXIoXCJldmFsXCIpO1xuICAgIHJlc2VydmV2YXIoXCJmYWxzZVwiKTtcbiAgICByZXNlcnZldmFyKFwiSW5maW5pdHlcIik7XG4gICAgcmVzZXJ2ZXZhcihcIm51bGxcIik7XG4gICAgcmVzZXJ2ZXZhcihcInRoaXNcIiwgZnVuY3Rpb24oeCkge1xuICAgICAgICBpZiAoc3RhdGUuaXNTdHJpY3QoKSAmJiAhaXNNZXRob2QoKSAmJlxuICAgICAgICAgICAgIXN0YXRlLm9wdGlvbi52YWxpZHRoaXMgJiYgKChzdGF0ZS5mdW5jdFtcIihzdGF0ZW1lbnQpXCJdICYmXG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobmFtZSlcIl0uY2hhckF0KDApID4gXCJaXCIpIHx8IHN0YXRlLmZ1bmN0W1wiKGdsb2JhbClcIl0pKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA0MFwiLCB4KTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJlc2VydmV2YXIoXCJ0cnVlXCIpO1xuICAgIHJlc2VydmV2YXIoXCJ1bmRlZmluZWRcIik7XG5cbiAgICBhc3NpZ25vcChcIj1cIiwgXCJhc3NpZ25cIiwgMjApO1xuICAgIGFzc2lnbm9wKFwiKz1cIiwgXCJhc3NpZ25hZGRcIiwgMjApO1xuICAgIGFzc2lnbm9wKFwiLT1cIiwgXCJhc3NpZ25zdWJcIiwgMjApO1xuICAgIGFzc2lnbm9wKFwiKj1cIiwgXCJhc3NpZ25tdWx0XCIsIDIwKTtcbiAgICBhc3NpZ25vcChcIi89XCIsIFwiYXNzaWduZGl2XCIsIDIwKS5udWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgZXJyb3IoXCJFMDE0XCIpO1xuICAgIH07XG4gICAgYXNzaWdub3AoXCIlPVwiLCBcImFzc2lnbm1vZFwiLCAyMCk7XG5cbiAgICBiaXR3aXNlYXNzaWdub3AoXCImPVwiKTtcbiAgICBiaXR3aXNlYXNzaWdub3AoXCJ8PVwiKTtcbiAgICBiaXR3aXNlYXNzaWdub3AoXCJePVwiKTtcbiAgICBiaXR3aXNlYXNzaWdub3AoXCI8PD1cIik7XG4gICAgYml0d2lzZWFzc2lnbm9wKFwiPj49XCIpO1xuICAgIGJpdHdpc2Vhc3NpZ25vcChcIj4+Pj1cIik7XG4gICAgaW5maXgoXCIsXCIsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgdmFyIGV4cHI7XG4gICAgICAgIHRoYXQuZXhwcnMgPSBbbGVmdF07XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub2NvbW1hKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzEyN1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29tbWEoeyBwZWVrOiB0cnVlIH0pKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhhdDtcbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgaWYgKCEoZXhwciA9IGV4cHJlc3Npb24oMTApKSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhhdC5leHBycy5wdXNoKGV4cHIpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlICE9PSBcIixcIiB8fCAhY29tbWEoKSkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGF0O1xuICAgIH0sIDEwLCB0cnVlKTtcblxuICAgIGluZml4KFwiP1wiLCBmdW5jdGlvbihsZWZ0LCB0aGF0KSB7XG4gICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgIHRoYXQubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoYXQucmlnaHQgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgIHRoYXRbXCJlbHNlXCJdID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIHJldHVybiB0aGF0O1xuICAgIH0sIDMwKTtcblxuICAgIHZhciBvclByZWNlbmRlbmNlID0gNDA7XG4gICAgaW5maXgoXCJ8fFwiLCBmdW5jdGlvbihsZWZ0LCB0aGF0KSB7XG4gICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgIHRoYXQubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoYXQucmlnaHQgPSBleHByZXNzaW9uKG9yUHJlY2VuZGVuY2UpO1xuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCBvclByZWNlbmRlbmNlKTtcbiAgICBpbmZpeChcIiYmXCIsIFwiYW5kXCIsIDUwKTtcbiAgICBiaXR3aXNlKFwifFwiLCBcImJpdG9yXCIsIDcwKTtcbiAgICBiaXR3aXNlKFwiXlwiLCBcImJpdHhvclwiLCA4MCk7XG4gICAgYml0d2lzZShcIiZcIiwgXCJiaXRhbmRcIiwgOTApO1xuICAgIHJlbGF0aW9uKFwiPT1cIiwgZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIGVxbnVsbCA9IHN0YXRlLm9wdGlvbi5lcW51bGwgJiZcbiAgICAgICAgICAgICgobGVmdCAmJiBsZWZ0LnZhbHVlKSA9PT0gXCJudWxsXCIgfHwgKHJpZ2h0ICYmIHJpZ2h0LnZhbHVlKSA9PT0gXCJudWxsXCIpO1xuXG4gICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgY2FzZSAhZXFudWxsICYmIHN0YXRlLm9wdGlvbi5lcWVxZXE6XG4gICAgICAgICAgICAgICAgdGhpcy5mcm9tID0gdGhpcy5jaGFyYWN0ZXI7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTZcIiwgdGhpcywgXCI9PT1cIiwgXCI9PVwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgaXNQb29yUmVsYXRpb24obGVmdCk6XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNDFcIiwgdGhpcywgXCI9PT1cIiwgbGVmdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGlzUG9vclJlbGF0aW9uKHJpZ2h0KTpcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA0MVwiLCB0aGlzLCBcIj09PVwiLCByaWdodC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGlzVHlwb1R5cGVvZihyaWdodCwgbGVmdCwgc3RhdGUpOlxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgaXNUeXBvVHlwZW9mKGxlZnQsIHJpZ2h0LCBzdGF0ZSk6XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjJcIiwgdGhpcywgbGVmdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICByZWxhdGlvbihcIj09PVwiLCBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICBpZiAoaXNUeXBvVHlwZW9mKHJpZ2h0LCBsZWZ0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cG9UeXBlb2YobGVmdCwgcmlnaHQsIHN0YXRlKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjJcIiwgdGhpcywgbGVmdC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gICAgcmVsYXRpb24oXCIhPVwiLCBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICB2YXIgZXFudWxsID0gc3RhdGUub3B0aW9uLmVxbnVsbCAmJlxuICAgICAgICAgICAgKChsZWZ0ICYmIGxlZnQudmFsdWUpID09PSBcIm51bGxcIiB8fCAocmlnaHQgJiYgcmlnaHQudmFsdWUpID09PSBcIm51bGxcIik7XG5cbiAgICAgICAgaWYgKCFlcW51bGwgJiYgc3RhdGUub3B0aW9uLmVxZXFlcSkge1xuICAgICAgICAgICAgdGhpcy5mcm9tID0gdGhpcy5jaGFyYWN0ZXI7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzExNlwiLCB0aGlzLCBcIiE9PVwiLCBcIiE9XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzUG9vclJlbGF0aW9uKGxlZnQpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA0MVwiLCB0aGlzLCBcIiE9PVwiLCBsZWZ0LnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1Bvb3JSZWxhdGlvbihyaWdodCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDQxXCIsIHRoaXMsIFwiIT09XCIsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cG9UeXBlb2YocmlnaHQsIGxlZnQsIHN0YXRlKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjJcIiwgdGhpcywgcmlnaHQudmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzVHlwb1R5cGVvZihsZWZ0LCByaWdodCwgc3RhdGUpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzEyMlwiLCB0aGlzLCBsZWZ0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICByZWxhdGlvbihcIiE9PVwiLCBmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgICBpZiAoaXNUeXBvVHlwZW9mKHJpZ2h0LCBsZWZ0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cG9UeXBlb2YobGVmdCwgcmlnaHQsIHN0YXRlKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjJcIiwgdGhpcywgbGVmdC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gICAgcmVsYXRpb24oXCI8XCIpO1xuICAgIHJlbGF0aW9uKFwiPlwiKTtcbiAgICByZWxhdGlvbihcIjw9XCIpO1xuICAgIHJlbGF0aW9uKFwiPj1cIik7XG4gICAgYml0d2lzZShcIjw8XCIsIFwic2hpZnRsZWZ0XCIsIDEyMCk7XG4gICAgYml0d2lzZShcIj4+XCIsIFwic2hpZnRyaWdodFwiLCAxMjApO1xuICAgIGJpdHdpc2UoXCI+Pj5cIiwgXCJzaGlmdHJpZ2h0dW5zaWduZWRcIiwgMTIwKTtcbiAgICBpbmZpeChcImluXCIsIFwiaW5cIiwgMTIwKTtcbiAgICBpbmZpeChcImluc3RhbmNlb2ZcIiwgXCJpbnN0YW5jZW9mXCIsIDEyMCk7XG4gICAgaW5maXgoXCIrXCIsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgdmFyIHJpZ2h0O1xuICAgICAgICB0aGF0LmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGF0LnJpZ2h0ID0gcmlnaHQgPSBleHByZXNzaW9uKDEzMCk7XG5cbiAgICAgICAgaWYgKGxlZnQgJiYgcmlnaHQgJiYgbGVmdC5pZCA9PT0gXCIoc3RyaW5nKVwiICYmIHJpZ2h0LmlkID09PSBcIihzdHJpbmcpXCIpIHtcbiAgICAgICAgICAgIGxlZnQudmFsdWUgKz0gcmlnaHQudmFsdWU7XG4gICAgICAgICAgICBsZWZ0LmNoYXJhY3RlciA9IHJpZ2h0LmNoYXJhY3RlcjtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLnNjcmlwdHVybCAmJiBqYXZhc2NyaXB0VVJMLnRlc3QobGVmdC52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1MFwiLCBsZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBsZWZ0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoYXQ7XG4gICAgfSwgMTMwKTtcbiAgICBwcmVmaXgoXCIrXCIsIFwibnVtXCIpO1xuICAgIHByZWZpeChcIisrK1wiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgd2FybmluZyhcIlcwMDdcIik7XG4gICAgICAgIHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG4gICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDE1MCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuICAgIGluZml4KFwiKysrXCIsIGZ1bmN0aW9uKGxlZnQpIHtcbiAgICAgICAgd2FybmluZyhcIlcwMDdcIik7XG4gICAgICAgIHRoaXMubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDEzMCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sIDEzMCk7XG4gICAgaW5maXgoXCItXCIsIFwic3ViXCIsIDEzMCk7XG4gICAgcHJlZml4KFwiLVwiLCBcIm5lZ1wiKTtcbiAgICBwcmVmaXgoXCItLS1cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHdhcm5pbmcoXCJXMDA2XCIpO1xuICAgICAgICB0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbigxNTApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICBpbmZpeChcIi0tLVwiLCBmdW5jdGlvbihsZWZ0KSB7XG4gICAgICAgIHdhcm5pbmcoXCJXMDA2XCIpO1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbigxMzApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LCAxMzApO1xuICAgIGluZml4KFwiKlwiLCBcIm11bHRcIiwgMTQwKTtcbiAgICBpbmZpeChcIi9cIiwgXCJkaXZcIiwgMTQwKTtcbiAgICBpbmZpeChcIiVcIiwgXCJtb2RcIiwgMTQwKTtcblxuICAgIHN1ZmZpeChcIisrXCIpO1xuICAgIHByZWZpeChcIisrXCIsIFwicHJlaW5jXCIpO1xuICAgIHN0YXRlLnN5bnRheFtcIisrXCJdLmV4cHMgPSB0cnVlO1xuXG4gICAgc3VmZml4KFwiLS1cIik7XG4gICAgcHJlZml4KFwiLS1cIiwgXCJwcmVkZWNcIik7XG4gICAgc3RhdGUuc3ludGF4W1wiLS1cIl0uZXhwcyA9IHRydWU7XG4gICAgcHJlZml4KFwiZGVsZXRlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICBpZiAoIXApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHAuaWQgIT09IFwiLlwiICYmIHAuaWQgIT09IFwiW1wiKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA1MVwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmZpcnN0ID0gcDtcblxuICAgICAgICAvLyBUaGUgYGRlbGV0ZWAgb3BlcmF0b3IgYWNjZXB0cyB1bnJlc29sdmFibGUgcmVmZXJlbmNlcyB3aGVuIG5vdCBpbiBzdHJpY3RcbiAgICAgICAgLy8gbW9kZSwgc28gdGhlIG9wZXJhbmQgbWF5IGJlIHVuZGVmaW5lZC5cbiAgICAgICAgaWYgKHAuaWRlbnRpZmllciAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgcC5mb3JnaXZlVW5kZWYgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG4gICAgcHJlZml4KFwiflwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5iaXR3aXNlKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAxNlwiLCB0aGlzLCBcIn5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hcml0eSA9IFwidW5hcnlcIjtcbiAgICAgICAgdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTUwKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICBwcmVmaXgoXCIuLi5cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE5XCIsIHRoaXMsIFwic3ByZWFkL3Jlc3Qgb3BlcmF0b3JcIiwgXCI2XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVE9ETzogQWxsb3cgYWxsIEFzc2lnbm1lbnRFeHByZXNzaW9uXG4gICAgICAgIC8vIG9uY2UgcGFyc2luZyBwZXJtaXRzLlxuICAgICAgICAvL1xuICAgICAgICAvLyBIb3cgdG8gaGFuZGxlIGVnLiBudW1iZXIsIGJvb2xlYW4gd2hlbiB0aGUgYnVpbHQtaW5cbiAgICAgICAgLy8gcHJvdG90eXBlIG9mIG1heSBoYXZlIGFuIEBAaXRlcmF0b3IgZGVmaW5pdGlvbj9cbiAgICAgICAgLy9cbiAgICAgICAgLy8gTnVtYmVyLnByb3RvdHlwZVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKiAoKSB7XG4gICAgICAgIC8vICAgeWllbGQgdGhpcy52YWx1ZU9mKCk7XG4gICAgICAgIC8vIH07XG4gICAgICAgIC8vXG4gICAgICAgIC8vIHZhciBhID0gWyAuLi4xIF07XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGEpOyAvLyBbMV07XG4gICAgICAgIC8vXG4gICAgICAgIC8vIGZvciAobGV0IG4gb2YgWy4uLjEwXSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhuKTtcbiAgICAgICAgLy8gfVxuICAgICAgICAvLyAvLyAxMFxuICAgICAgICAvL1xuICAgICAgICAvL1xuICAgICAgICAvLyBCb29sZWFuLnByb3RvdHlwZVtTeW1ib2wuaXRlcmF0b3JdID0gZnVuY3Rpb24gKiAoKSB7XG4gICAgICAgIC8vICAgeWllbGQgdGhpcy52YWx1ZU9mKCk7XG4gICAgICAgIC8vIH07XG4gICAgICAgIC8vXG4gICAgICAgIC8vIHZhciBhID0gWyAuLi50cnVlIF07XG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGEpOyAvLyBbdHJ1ZV07XG4gICAgICAgIC8vXG4gICAgICAgIC8vIGZvciAobGV0IG4gb2YgWy4uLmZhbHNlXSkge1xuICAgICAgICAvLyAgICBjb25zb2xlLmxvZyhuKTtcbiAgICAgICAgLy8gfVxuICAgICAgICAvLyAvLyBmYWxzZVxuICAgICAgICAvL1xuICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIgJiZcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgIT09IFwiKHN0cmluZylcIiAmJlxuICAgICAgICAgICAgIWNoZWNrUHVuY3R1YXRvcnMoc3RhdGUudG9rZW5zLm5leHQsIFtcIltcIiwgXCIoXCJdKSkge1xuXG4gICAgICAgICAgICBlcnJvcihcIkUwMzBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICBleHByZXNzaW9uKDE1MCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgcHJlZml4KFwiIVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5hcml0eSA9IFwidW5hcnlcIjtcbiAgICAgICAgdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTUwKTtcblxuICAgICAgICBpZiAoIXRoaXMucmlnaHQpIHsgLy8gJyEnIGZvbGxvd2VkIGJ5IG5vdGhpbmc/IEdpdmUgdXAuXG4gICAgICAgICAgICBxdWl0KFwiRTA0MVwiLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChiYW5nW3RoaXMucmlnaHQuaWRdID09PSB0cnVlKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCB0aGlzLCBcIiFcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICBwcmVmaXgoXCJ0eXBlb2ZcIiwgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IGV4cHJlc3Npb24oMTUwKTtcbiAgICAgICAgdGhpcy5maXJzdCA9IHRoaXMucmlnaHQgPSBwO1xuXG4gICAgICAgIGlmICghcCkgeyAvLyAndHlwZW9mJyBmb2xsb3dlZCBieSBub3RoaW5nPyBHaXZlIHVwLlxuICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGUgYHR5cGVvZmAgb3BlcmF0b3IgYWNjZXB0cyB1bnJlc29sdmFibGUgcmVmZXJlbmNlcywgc28gdGhlIG9wZXJhbmRcbiAgICAgICAgLy8gbWF5IGJlIHVuZGVmaW5lZC5cbiAgICAgICAgaWYgKHAuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgcC5mb3JnaXZlVW5kZWYgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pKTtcbiAgICBwcmVmaXgoXCJuZXdcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtcCA9IG1ldGFQcm9wZXJ0eShcInRhcmdldFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMucHJldiwgXCJuZXcudGFyZ2V0XCIsIFwiNlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBpbkZ1bmN0aW9uLCBjID0gc3RhdGUuZnVuY3Q7XG4gICAgICAgICAgICB3aGlsZSAoYykge1xuICAgICAgICAgICAgICAgIGluRnVuY3Rpb24gPSAhY1tcIihnbG9iYWwpXCJdO1xuICAgICAgICAgICAgICAgIGlmICghY1tcIihhcnJvdylcIl0pIHsgYnJlYWs7IH1cbiAgICAgICAgICAgICAgICBjID0gY1tcIihjb250ZXh0KVwiXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghaW5GdW5jdGlvbikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTM2XCIsIHN0YXRlLnRva2Vucy5wcmV2LCBcIm5ldy50YXJnZXRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAobXApIHsgcmV0dXJuIG1wOyB9XG5cbiAgICAgICAgdmFyIGMgPSBleHByZXNzaW9uKDE1NSksIGk7XG4gICAgICAgIGlmIChjICYmIGMuaWQgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgaWYgKGMuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgIGNbXCJuZXdcIl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoYy52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiTnVtYmVyXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJTdHJpbmdcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkJvb2xlYW5cIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIk1hdGhcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkpTT05cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDUzXCIsIHN0YXRlLnRva2Vucy5wcmV2LCBjLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiU3ltYm9sXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDUzXCIsIHN0YXRlLnRva2Vucy5wcmV2LCBjLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiRnVuY3Rpb25cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmV2aWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1NFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiRGF0ZVwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiUmVnRXhwXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0aGlzXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjLmlkICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpID0gYy52YWx1ZS5zdWJzdHIoMCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5uZXdjYXAgJiYgKGkgPCBcIkFcIiB8fCBpID4gXCJaXCIpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uaXNQcmVkZWZpbmVkKGMudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDU1XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoYy5pZCAhPT0gXCIuXCIgJiYgYy5pZCAhPT0gXCJbXCIgJiYgYy5pZCAhPT0gXCIoXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNTZcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLnN1cGVybmV3KVxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDU3XCIsIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoXCIgJiYgIXN0YXRlLm9wdGlvbi5zdXBlcm5ldykge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNThcIiwgc3RhdGUudG9rZW5zLmN1cnIsIHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmZpcnN0ID0gdGhpcy5yaWdodCA9IGM7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuICAgIHN0YXRlLnN5bnRheFtcIm5ld1wiXS5leHBzID0gdHJ1ZTtcblxuICAgIHByZWZpeChcInZvaWRcIikuZXhwcyA9IHRydWU7XG5cbiAgICBpbmZpeChcIi5cIiwgZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICB2YXIgbSA9IGlkZW50aWZpZXIoZmFsc2UsIHRydWUpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgbSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgY291bnRNZW1iZXIobSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGF0LmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGF0LnJpZ2h0ID0gbTtcblxuICAgICAgICBpZiAobSAmJiBtID09PSBcImhhc093blByb3BlcnR5XCIgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAwMVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsZWZ0ICYmIGxlZnQudmFsdWUgPT09IFwiYXJndW1lbnRzXCIgJiYgKG0gPT09IFwiY2FsbGVlXCIgfHwgbSA9PT0gXCJjYWxsZXJcIikpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubm9hcmcpXG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNTlcIiwgbGVmdCwgbSk7XG4gICAgICAgICAgICBlbHNlIGlmIChzdGF0ZS5pc1N0cmljdCgpKVxuICAgICAgICAgICAgICAgIGVycm9yKFwiRTAwOFwiKTtcbiAgICAgICAgfSBlbHNlIGlmICghc3RhdGUub3B0aW9uLmV2aWwgJiYgbGVmdCAmJiBsZWZ0LnZhbHVlID09PSBcImRvY3VtZW50XCIgJiZcbiAgICAgICAgICAgIChtID09PSBcIndyaXRlXCIgfHwgbSA9PT0gXCJ3cml0ZWxuXCIpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA2MFwiLCBsZWZ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmV2aWwgJiYgKG0gPT09IFwiZXZhbFwiIHx8IG0gPT09IFwiZXhlY1NjcmlwdFwiKSkge1xuICAgICAgICAgICAgaWYgKGlzR2xvYmFsRXZhbChsZWZ0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2MVwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGF0O1xuICAgIH0sIDE2MCwgdHJ1ZSk7XG5cbiAgICBpbmZpeChcIihcIiwgZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmltbWVkICYmIGxlZnQgJiYgIWxlZnQuaW1tZWQgJiYgbGVmdC5pZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA2MlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuID0gMDtcbiAgICAgICAgdmFyIHAgPSBbXTtcblxuICAgICAgICBpZiAobGVmdCkge1xuICAgICAgICAgICAgaWYgKGxlZnQudHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIikge1xuICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlLm1hdGNoKC9eW0EtWl0oW0EtWjAtOV8kXSpbYS16XVtBLVphLXowLTlfJF0qKT8kLykpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKFwiQXJyYXkgTnVtYmVyIFN0cmluZyBCb29sZWFuIERhdGUgT2JqZWN0IEVycm9yIFN5bWJvbFwiLmluZGV4T2YobGVmdC52YWx1ZSkgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGVmdC52YWx1ZSA9PT0gXCJNYXRoXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2M1wiLCBsZWZ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUub3B0aW9uLm5ld2NhcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDY0XCIsIGxlZnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIilcIikge1xuICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICBwW3AubGVuZ3RoXSA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgICAgIG4gKz0gMTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21tYSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYWR2YW5jZShcIilcIik7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBsZWZ0ID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM1KCkgJiYgbGVmdC52YWx1ZSA9PT0gXCJwYXJzZUludFwiICYmIG4gPT09IDEpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2NVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5ldmlsKSB7XG4gICAgICAgICAgICAgICAgaWYgKGxlZnQudmFsdWUgPT09IFwiZXZhbFwiIHx8IGxlZnQudmFsdWUgPT09IFwiRnVuY3Rpb25cIiB8fFxuICAgICAgICAgICAgICAgICAgICBsZWZ0LnZhbHVlID09PSBcImV4ZWNTY3JpcHRcIikge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2MVwiLCBsZWZ0KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocFswXSAmJiBwWzBdLmlkID09PSBcIihzdHJpbmcpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZEludGVybmFsU3JjKGxlZnQsIHBbMF0udmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwWzBdICYmIHBbMF0uaWQgPT09IFwiKHN0cmluZylcIiAmJlxuICAgICAgICAgICAgICAgICAgICAobGVmdC52YWx1ZSA9PT0gXCJzZXRUaW1lb3V0XCIgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxlZnQudmFsdWUgPT09IFwic2V0SW50ZXJ2YWxcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjZcIiwgbGVmdCk7XG4gICAgICAgICAgICAgICAgICAgIGFkZEludGVybmFsU3JjKGxlZnQsIHBbMF0udmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHdpbmRvdy5zZXRUaW1lb3V0L3NldEludGVydmFsXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwWzBdICYmIHBbMF0uaWQgPT09IFwiKHN0cmluZylcIiAmJlxuICAgICAgICAgICAgICAgICAgICBsZWZ0LnZhbHVlID09PSBcIi5cIiAmJlxuICAgICAgICAgICAgICAgICAgICBsZWZ0LmxlZnQudmFsdWUgPT09IFwid2luZG93XCIgJiZcbiAgICAgICAgICAgICAgICAgICAgKGxlZnQucmlnaHQgPT09IFwic2V0VGltZW91dFwiIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0LnJpZ2h0ID09PSBcInNldEludGVydmFsXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDY2XCIsIGxlZnQpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJbnRlcm5hbFNyYyhsZWZ0LCBwWzBdLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWxlZnQuaWRlbnRpZmllciAmJiBsZWZ0LmlkICE9PSBcIi5cIiAmJiBsZWZ0LmlkICE9PSBcIltcIiAmJiBsZWZ0LmlkICE9PSBcIj0+XCIgJiZcbiAgICAgICAgICAgICAgICBsZWZ0LmlkICE9PSBcIihcIiAmJiBsZWZ0LmlkICE9PSBcIiYmXCIgJiYgbGVmdC5pZCAhPT0gXCJ8fFwiICYmIGxlZnQuaWQgIT09IFwiP1wiICYmXG4gICAgICAgICAgICAgICAgIShzdGF0ZS5pbkVTNigpICYmIGxlZnRbXCIobmFtZSlcIl0pKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjdcIiwgdGhhdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGF0LmxlZnQgPSBsZWZ0O1xuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCAxNTUsIHRydWUpLmV4cHMgPSB0cnVlO1xuXG4gICAgcHJlZml4KFwiKFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHBuID0gc3RhdGUudG9rZW5zLm5leHQsIHBuMSwgaSA9IC0xO1xuICAgICAgICB2YXIgcmV0LCB0cmlnZ2VyRm5FeHByLCBmaXJzdCwgbGFzdDtcbiAgICAgICAgdmFyIHBhcmVucyA9IDE7XG4gICAgICAgIHZhciBvcGVuaW5nID0gc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHZhciBwcmVjZWVkaW5nID0gc3RhdGUudG9rZW5zLnByZXY7XG4gICAgICAgIHZhciBpc05lY2Vzc2FyeSA9ICFzdGF0ZS5vcHRpb24uc2luZ2xlR3JvdXBzO1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmIChwbi52YWx1ZSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgICAgICBwYXJlbnMgKz0gMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocG4udmFsdWUgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgcGFyZW5zIC09IDE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGkgKz0gMTtcbiAgICAgICAgICAgIHBuMSA9IHBuO1xuICAgICAgICAgICAgcG4gPSBwZWVrKGkpO1xuICAgICAgICB9IHdoaWxlICghKHBhcmVucyA9PT0gMCAmJiBwbjEudmFsdWUgPT09IFwiKVwiKSAmJiBwbi52YWx1ZSAhPT0gXCI7XCIgJiYgcG4udHlwZSAhPT0gXCIoZW5kKVwiKTtcblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgdHJpZ2dlckZuRXhwciA9IHN0YXRlLnRva2Vucy5uZXh0LmltbWVkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBiYWxhbmNlZCBncm91cGluZyBvcGVyYXRvciBpcyBmb2xsb3dlZCBieSBhIFwiZmF0IGFycm93XCIsIHRoZVxuICAgICAgICAvLyBjdXJyZW50IHRva2VuIG1hcmtzIHRoZSBiZWdpbm5pbmcgb2YgYSBcImZhdCBhcnJvd1wiIGZ1bmN0aW9uIGFuZCBwYXJzaW5nXG4gICAgICAgIC8vIHNob3VsZCBwcm9jZWVkIGFjY29yZGluZ2x5LlxuICAgICAgICBpZiAocG4udmFsdWUgPT09IFwiPT5cIikge1xuICAgICAgICAgICAgcmV0dXJuIGRvRnVuY3Rpb24oeyB0eXBlOiBcImFycm93XCIsIHBhcnNlZE9wZW5pbmc6IHRydWUgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwcnMgPSBbXTtcblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKVwiKSB7XG4gICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgIGV4cHJzLnB1c2goZXhwcmVzc2lvbigxMCkpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm5vY29tbWEpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjdcIik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29tbWEoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGFkdmFuY2UoXCIpXCIsIHRoaXMpO1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmltbWVkICYmIGV4cHJzWzBdICYmIGV4cHJzWzBdLmlkID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoXCIgJiZcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIuXCIgJiYgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjhcIiwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWV4cHJzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChleHBycy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICByZXQgPSBPYmplY3QuY3JlYXRlKHN0YXRlLnN5bnRheFtcIixcIl0pO1xuICAgICAgICAgICAgcmV0LmV4cHJzID0gZXhwcnM7XG5cbiAgICAgICAgICAgIGZpcnN0ID0gZXhwcnNbMF07XG4gICAgICAgICAgICBsYXN0ID0gZXhwcnNbZXhwcnMubGVuZ3RoIC0gMV07XG5cbiAgICAgICAgICAgIGlmICghaXNOZWNlc3NhcnkpIHtcbiAgICAgICAgICAgICAgICBpc05lY2Vzc2FyeSA9IHByZWNlZWRpbmcuYXNzaWduIHx8IHByZWNlZWRpbmcuZGVsaW07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXQgPSBmaXJzdCA9IGxhc3QgPSBleHByc1swXTtcblxuICAgICAgICAgICAgaWYgKCFpc05lY2Vzc2FyeSkge1xuICAgICAgICAgICAgICAgIGlzTmVjZXNzYXJ5ID1cbiAgICAgICAgICAgICAgICAgICAgLy8gVXNlZCB0byBkaXN0aW5ndWlzaCBmcm9tIGFuIEV4cHJlc3Npb25TdGF0ZW1lbnQgd2hpY2ggbWF5IG5vdFxuICAgICAgICAgICAgICAgICAgICAvLyBiZWdpbiB3aXRoIHRoZSBge2AgYW5kIGBmdW5jdGlvbmAgdG9rZW5zXG4gICAgICAgICAgICAgICAgICAgIChvcGVuaW5nLmJlZ2luc1N0bXQgJiYgKHJldC5pZCA9PT0gXCJ7XCIgfHwgdHJpZ2dlckZuRXhwciB8fCBpc0Z1bmN0b3IocmV0KSkpIHx8XG4gICAgICAgICAgICAgICAgICAgIC8vIFVzZWQgdG8gc2lnbmFsIHRoYXQgYSBmdW5jdGlvbiBleHByZXNzaW9uIGlzIGJlaW5nIHN1cHBsaWVkIHRvXG4gICAgICAgICAgICAgICAgICAgIC8vIHNvbWUgb3RoZXIgb3BlcmF0b3IuXG4gICAgICAgICAgICAgICAgICAgICh0cmlnZ2VyRm5FeHByICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgcGFyZW50aGVzaXMgd3JhcHBpbmcgYSBmdW5jdGlvbiBleHByZXNzaW9uIHRvIGJlIGNvbnNpZGVyZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5lY2Vzc2FyeSwgdGhlIGdyb3VwaW5nIG9wZXJhdG9yIHNob3VsZCBiZSB0aGUgbGVmdC1oYW5kLXNpZGUgb2ZcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvbWUgb3RoZXIgb3BlcmF0b3ItLWVpdGhlciB3aXRoaW4gdGhlIHBhcmVudGhlc2lzIG9yIGRpcmVjdGx5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBmb2xsb3dpbmcgdGhlbS5cbiAgICAgICAgICAgICAgICAgICAgICAgICghaXNFbmRPZkV4cHIoKSB8fCBzdGF0ZS50b2tlbnMucHJldi5pZCAhPT0gXCJ9XCIpKSB8fFxuICAgICAgICAgICAgICAgICAgICAvLyBVc2VkIHRvIGRlbWFyY2F0ZSBhbiBhcnJvdyBmdW5jdGlvbiBhcyB0aGUgbGVmdC1oYW5kIHNpZGUgb2Ygc29tZVxuICAgICAgICAgICAgICAgICAgICAvLyBvcGVyYXRvci5cbiAgICAgICAgICAgICAgICAgICAgKGlzRnVuY3RvcihyZXQpICYmICFpc0VuZE9mRXhwcigpKSB8fFxuICAgICAgICAgICAgICAgICAgICAvLyBVc2VkIGFzIHRoZSByZXR1cm4gdmFsdWUgb2YgYSBzaW5nbGUtc3RhdGVtZW50IGFycm93IGZ1bmN0aW9uXG4gICAgICAgICAgICAgICAgICAgIChyZXQuaWQgPT09IFwie1wiICYmIHByZWNlZWRpbmcuaWQgPT09IFwiPT5cIikgfHxcbiAgICAgICAgICAgICAgICAgICAgLy8gVXNlZCB0byBkZWxpbmVhdGUgYW4gaW50ZWdlciBudW1iZXIgbGl0ZXJhbCBmcm9tIGEgZGVyZWZlcmVuY2luZ1xuICAgICAgICAgICAgICAgICAgICAvLyBwdW5jdHVhdG9yIChvdGhlcndpc2UgaW50ZXJwcmV0ZWQgYXMgYSBkZWNpbWFsIHBvaW50KVxuICAgICAgICAgICAgICAgICAgICAocmV0LnR5cGUgPT09IFwiKG51bWJlcilcIiAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tQdW5jdHVhdG9yKHBuLCBcIi5cIikgJiYgL15cXGQrJC8udGVzdChyZXQudmFsdWUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXQpIHtcbiAgICAgICAgICAgIC8vIFRoZSBvcGVyYXRvciBtYXkgYmUgbmVjZXNzYXJ5IHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IGJpbmRpbmcgcG93ZXIgb2ZcbiAgICAgICAgICAgIC8vIG5laWdoYm9yaW5nIG9wZXJhdG9ycyAod2hlbmV2ZXIgdGhlcmUgaXMgYW4gb3BlcmF0b3IgaW4gdXNlIHdpdGhpbiB0aGVcbiAgICAgICAgICAgIC8vIGZpcnN0IGV4cHJlc3Npb24gKm9yKiB0aGUgY3VycmVudCBncm91cCBjb250YWlucyBtdWx0aXBsZSBleHByZXNzaW9ucylcbiAgICAgICAgICAgIGlmICghaXNOZWNlc3NhcnkgJiYgKGZpcnN0LmxlZnQgfHwgZmlyc3QucmlnaHQgfHwgcmV0LmV4cHJzKSkge1xuICAgICAgICAgICAgICAgIGlzTmVjZXNzYXJ5ID1cbiAgICAgICAgICAgICAgICAgICAgKCFpc0JlZ2luT2ZFeHByKHByZWNlZWRpbmcpICYmIGZpcnN0LmxicCA8PSBwcmVjZWVkaW5nLmxicCkgfHxcbiAgICAgICAgICAgICAgICAgICAgKCFpc0VuZE9mRXhwcigpICYmIGxhc3QubGJwIDwgc3RhdGUudG9rZW5zLm5leHQubGJwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFpc05lY2Vzc2FyeSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTI2XCIsIG9wZW5pbmcpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXQucGFyZW4gPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICB9KTtcblxuICAgIGFwcGxpY2F0aW9uKFwiPT5cIik7XG5cbiAgICBpbmZpeChcIltcIiwgZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICB2YXIgZSA9IGV4cHJlc3Npb24oMTApLCBzO1xuICAgICAgICBpZiAoZSAmJiBlLnR5cGUgPT09IFwiKHN0cmluZylcIikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uZXZpbCAmJiAoZS52YWx1ZSA9PT0gXCJldmFsXCIgfHwgZS52YWx1ZSA9PT0gXCJleGVjU2NyaXB0XCIpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzR2xvYmFsRXZhbChsZWZ0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjFcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb3VudE1lbWJlcihlLnZhbHVlKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLnN1YiAmJiBpZGVudGlmaWVyUmVnRXhwLnRlc3QoZS52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICBzID0gc3RhdGUuc3ludGF4W2UudmFsdWVdO1xuICAgICAgICAgICAgICAgIGlmICghcyB8fCAhaXNSZXNlcnZlZChzKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2OVwiLCBzdGF0ZS50b2tlbnMucHJldiwgZS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UoXCJdXCIsIHRoYXQpO1xuXG4gICAgICAgIGlmIChlICYmIGUudmFsdWUgPT09IFwiaGFzT3duUHJvcGVydHlcIiAmJiBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDAxXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhhdC5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhhdC5yaWdodCA9IGU7XG4gICAgICAgIHJldHVybiB0aGF0O1xuICAgIH0sIDE2MCwgdHJ1ZSk7XG5cbiAgICBmdW5jdGlvbiBjb21wcmVoZW5zaXZlQXJyYXlFeHByZXNzaW9uKCkge1xuICAgICAgICB2YXIgcmVzOiB7IGV4cHM/OyBmaWx0ZXI/OyBsZWZ0PzsgcmlnaHQ/fSA9IHt9O1xuICAgICAgICByZXMuZXhwcyA9IHRydWU7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc3RhY2soKTtcblxuICAgICAgICAvLyBIYW5kbGUgcmV2ZXJzZWQgZm9yIGV4cHJlc3Npb25zLCB1c2VkIGluIHNwaWRlcm1vbmtleVxuICAgICAgICB2YXIgcmV2ZXJzZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlICE9PSBcImZvclwiKSB7XG4gICAgICAgICAgICByZXZlcnNlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJmb3JcIiwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoY29tcGFycmF5KVwiXS5zZXRTdGF0ZShcInVzZVwiKTtcbiAgICAgICAgICAgIHJlcy5yaWdodCA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICB9XG5cbiAgICAgICAgYWR2YW5jZShcImZvclwiKTtcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImVhY2hcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcImVhY2hcIik7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJmb3IgZWFjaFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoY29tcGFycmF5KVwiXS5zZXRTdGF0ZShcImRlZmluZVwiKTtcbiAgICAgICAgcmVzLmxlZnQgPSBleHByZXNzaW9uKDEzMCk7XG4gICAgICAgIGlmIChfLmNvbnRhaW5zKFtcImluXCIsIFwib2ZcIl0sIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKSkge1xuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDQ1XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb21wYXJyYXkpXCJdLnNldFN0YXRlKFwiZ2VuZXJhdGVcIik7XG4gICAgICAgIGV4cHJlc3Npb24oMTApO1xuXG4gICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiaWZcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcImlmXCIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb21wYXJyYXkpXCJdLnNldFN0YXRlKFwiZmlsdGVyXCIpO1xuICAgICAgICAgICAgcmVzLmZpbHRlciA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgYWR2YW5jZShcIilcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJldmVyc2VkKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb21wYXJyYXkpXCJdLnNldFN0YXRlKFwidXNlXCIpO1xuICAgICAgICAgICAgcmVzLnJpZ2h0ID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIH1cblxuICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoY29tcGFycmF5KVwiXS51bnN0YWNrKCk7XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgcHJlZml4KFwiW1wiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGJsb2NrdHlwZSA9IGxvb2t1cEJsb2NrVHlwZSgpO1xuICAgICAgICBpZiAoYmxvY2t0eXBlLmlzQ29tcEFycmF5KSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5lc25leHQgJiYgIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJhcnJheSBjb21wcmVoZW5zaW9uXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbXByZWhlbnNpdmVBcnJheUV4cHJlc3Npb24oKTtcbiAgICAgICAgfSBlbHNlIGlmIChibG9ja3R5cGUuaXNEZXN0QXNzaWduKSB7XG4gICAgICAgICAgICB0aGlzLmRlc3RydWN0QXNzaWduID0gZGVzdHJ1Y3R1cmluZ1BhdHRlcm4oeyBvcGVuaW5nUGFyc2VkOiB0cnVlLCBhc3NpZ25tZW50OiB0cnVlIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGIgPSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lICE9PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICB0aGlzLmZpcnN0ID0gW107XG4gICAgICAgIGlmIChiKSB7XG4gICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5mcm9tID09PSBpbmRlbnQgKyBzdGF0ZS5vcHRpb24uaW5kZW50KSB7XG4gICAgICAgICAgICAgICAgaW5kZW50ICs9IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgIHdoaWxlIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5lbGlzaW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTWFpbnRhaW4gY29tcGF0IHdpdGggb2xkIG9wdGlvbnMgLS0tIEVTNSBtb2RlIHdpdGhvdXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsaXNpb249dHJ1ZSB3aWxsIHdhcm4gb25jZSBwZXIgY29tbWFcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjhcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIixcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IHdoaWxlIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIixcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJdXCIpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5maXJzdC5wdXNoKGV4cHJlc3Npb24oMTApKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBjb21tYSh7IGFsbG93VHJhaWxpbmc6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIl1cIiAmJiAhc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3MFwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGIpIHtcbiAgICAgICAgICAgIGluZGVudCAtPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UoXCJdXCIsIHRoaXMpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuXG4gICAgZnVuY3Rpb24gaXNNZXRob2QoKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5mdW5jdFtcIihzdGF0ZW1lbnQpXCJdICYmIHN0YXRlLmZ1bmN0W1wiKHN0YXRlbWVudClcIl0udHlwZSA9PT0gXCJjbGFzc1wiIHx8XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb250ZXh0KVwiXSAmJiBzdGF0ZS5mdW5jdFtcIihjb250ZXh0KVwiXVtcIih2ZXJiKVwiXSA9PT0gXCJjbGFzc1wiO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gaXNQcm9wZXJ0eU5hbWUodG9rZW4pIHtcbiAgICAgICAgcmV0dXJuIHRva2VuLmlkZW50aWZpZXIgfHwgdG9rZW4uaWQgPT09IFwiKHN0cmluZylcIiB8fCB0b2tlbi5pZCA9PT0gXCIobnVtYmVyKVwiO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gcHJvcGVydHlOYW1lKHByZXNlcnZlT3JUb2tlbj8pIHtcbiAgICAgICAgdmFyIGlkO1xuICAgICAgICB2YXIgcHJlc2VydmUgPSB0cnVlO1xuICAgICAgICBpZiAodHlwZW9mIHByZXNlcnZlT3JUb2tlbiA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWQgPSBwcmVzZXJ2ZU9yVG9rZW47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcmVzZXJ2ZSA9IHByZXNlcnZlT3JUb2tlbjtcbiAgICAgICAgICAgIGlkID0gb3B0aW9uYWxpZGVudGlmaWVyKGZhbHNlLCB0cnVlLCBwcmVzZXJ2ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKHN0cmluZylcIikge1xuICAgICAgICAgICAgICAgIGlkID0gc3RhdGUudG9rZW5zLm5leHQudmFsdWU7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmVzZXJ2ZSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIobnVtYmVyKVwiKSB7XG4gICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgIGlmICghcHJlc2VydmUpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgaWQgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChpZC5pZCA9PT0gXCIoc3RyaW5nKVwiIHx8IGlkLmlkID09PSBcIihpZGVudGlmaWVyKVwiKSBpZCA9IGlkLnZhbHVlO1xuICAgICAgICAgICAgZWxzZSBpZiAoaWQuaWQgPT09IFwiKG51bWJlcilcIikgaWQgPSBpZC52YWx1ZS50b1N0cmluZygpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlkID09PSBcImhhc093blByb3BlcnR5XCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDAxXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICAgKiBAcGFyYW0ge3Rva2VufSBbb3B0aW9ucy5sb25lQXJnXSBUaGUgYXJndW1lbnQgdG8gdGhlIGZ1bmN0aW9uIGluIGNhc2VzXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmUgaXQgd2FzIGRlZmluZWQgdXNpbmcgdGhlXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlLWFyZ3VtZW50IHNob3J0aGFuZC5cbiAgICAgKiBAcGFyYW0ge2Jvb2x9IFtvcHRpb25zLnBhcnNlZE9wZW5pbmddIFdoZXRoZXIgdGhlIG9wZW5pbmcgcGFyZW50aGVzaXMgaGFzXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbHJlYWR5IGJlZW4gcGFyc2VkLlxuICAgICAqIEByZXR1cm5zIHt7IGFyaXR5OiBudW1iZXIsIHBhcmFtczogQXJyYXkuPHN0cmluZz59fVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZ1bmN0aW9ucGFyYW1zKG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIG5leHQ7XG4gICAgICAgIHZhciBwYXJhbXNJZHMgPSBbXTtcbiAgICAgICAgdmFyIGlkZW50O1xuICAgICAgICB2YXIgdG9rZW5zID0gW107XG4gICAgICAgIHZhciB0O1xuICAgICAgICB2YXIgcGFzdERlZmF1bHQgPSBmYWxzZTtcbiAgICAgICAgdmFyIHBhc3RSZXN0ID0gZmFsc2U7XG4gICAgICAgIHZhciBhcml0eSA9IDA7XG4gICAgICAgIHZhciBsb25lQXJnID0gb3B0aW9ucyAmJiBvcHRpb25zLmxvbmVBcmc7XG5cbiAgICAgICAgaWYgKGxvbmVBcmcgJiYgbG9uZUFyZy5pZGVudGlmaWVyID09PSB0cnVlKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkUGFyYW0obG9uZUFyZy52YWx1ZSwgbG9uZUFyZyk7XG4gICAgICAgICAgICByZXR1cm4geyBhcml0eTogMSwgcGFyYW1zOiBbbG9uZUFyZy52YWx1ZV0gfTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5leHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcblxuICAgICAgICBpZiAoIW9wdGlvbnMgfHwgIW9wdGlvbnMucGFyc2VkT3BlbmluZykge1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFBhcmFtKGFkZFBhcmFtQXJncykge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZFBhcmFtLmFwcGx5KHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXSwgYWRkUGFyYW1BcmdzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICBhcml0eSsrO1xuICAgICAgICAgICAgLy8gYXJlIGFkZGVkIHRvIHRoZSBwYXJhbSBzY29wZVxuICAgICAgICAgICAgdmFyIGN1cnJlbnRQYXJhbXMgPSBbXTtcblxuICAgICAgICAgICAgaWYgKF8uY29udGFpbnMoW1wie1wiLCBcIltcIl0sIHN0YXRlLnRva2Vucy5uZXh0LmlkKSkge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKCk7XG4gICAgICAgICAgICAgICAgZm9yICh0IGluIHRva2Vucykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gdG9rZW5zW3RdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zSWRzLnB1c2godC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGFyYW1zLnB1c2goW3QuaWQsIHQudG9rZW5dKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIuLi5cIikpIHBhc3RSZXN0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZGVudCA9IGlkZW50aWZpZXIodHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGlkZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmFtc0lkcy5wdXNoKGlkZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFBhcmFtcy5wdXNoKFtpZGVudCwgc3RhdGUudG9rZW5zLmN1cnJdKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIGludmFsaWQgcGFyYW1ldGVyLlxuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoIWNoZWNrUHVuY3R1YXRvcnMoc3RhdGUudG9rZW5zLm5leHQsIFtcIixcIiwgXCIpXCJdKSkgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSXQgaXMgdmFsaWQgdG8gaGF2ZSBhIHJlZ3VsYXIgYXJndW1lbnQgYWZ0ZXIgYSBkZWZhdWx0IGFyZ3VtZW50XG4gICAgICAgICAgICAvLyBzaW5jZSB1bmRlZmluZWQgY2FuIGJlIHVzZWQgZm9yIG1pc3NpbmcgcGFyYW1ldGVycy4gU3RpbGwgd2FybiBhcyBpdCBpc1xuICAgICAgICAgICAgLy8gYSBwb3NzaWJsZSBjb2RlIHNtZWxsLlxuICAgICAgICAgICAgaWYgKHBhc3REZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIj1cIikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIlcxMzhcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiZGVmYXVsdCBwYXJhbWV0ZXJzXCIsIFwiNlwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIj1cIik7XG4gICAgICAgICAgICAgICAgcGFzdERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBub3cgd2UgaGF2ZSBldmFsdWF0ZWQgdGhlIGRlZmF1bHQgZXhwcmVzc2lvbiwgYWRkIHRoZSB2YXJpYWJsZSB0byB0aGUgcGFyYW0gc2NvcGVcbiAgICAgICAgICAgIGN1cnJlbnRQYXJhbXMuZm9yRWFjaChhZGRQYXJhbSk7XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAocGFzdFJlc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzFcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21tYSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKVwiLCBuZXh0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBhcml0eTogYXJpdHksIHBhcmFtczogcGFyYW1zSWRzIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmdW5jdG9yKG5hbWUsIHRva2VuLCBvdmVyd3JpdGVzKSB7XG4gICAgICAgIHZhciBmdW5jdCA9IHtcbiAgICAgICAgICAgIFwiKG5hbWUpXCI6IG5hbWUsXG4gICAgICAgICAgICBcIihicmVha2FnZSlcIjogMCxcbiAgICAgICAgICAgIFwiKGxvb3BhZ2UpXCI6IDAsXG4gICAgICAgICAgICBcIih0b2tlbnMpXCI6IHt9LFxuICAgICAgICAgICAgXCIocHJvcGVydGllcylcIjoge30sXG5cbiAgICAgICAgICAgIFwiKGNhdGNoKVwiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiKGdsb2JhbClcIjogZmFsc2UsXG5cbiAgICAgICAgICAgIFwiKGxpbmUpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihjaGFyYWN0ZXIpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihtZXRyaWNzKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoc3RhdGVtZW50KVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoY29udGV4dClcIjogbnVsbCxcbiAgICAgICAgICAgIFwiKHNjb3BlKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoY29tcGFycmF5KVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoZ2VuZXJhdG9yKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoYXJyb3cpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihwYXJhbXMpXCI6IG51bGxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIF8uZXh0ZW5kKGZ1bmN0LCB7XG4gICAgICAgICAgICAgICAgXCIobGluZSlcIjogdG9rZW4ubGluZSxcbiAgICAgICAgICAgICAgICBcIihjaGFyYWN0ZXIpXCI6IHRva2VuLmNoYXJhY3RlcixcbiAgICAgICAgICAgICAgICBcIihtZXRyaWNzKVwiOiBjcmVhdGVNZXRyaWNzKHRva2VuKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBfLmV4dGVuZChmdW5jdCwgb3ZlcndyaXRlcyk7XG5cbiAgICAgICAgaWYgKGZ1bmN0W1wiKGNvbnRleHQpXCJdKSB7XG4gICAgICAgICAgICBmdW5jdFtcIihzY29wZSlcIl0gPSBmdW5jdFtcIihjb250ZXh0KVwiXVtcIihzY29wZSlcIl07XG4gICAgICAgICAgICBmdW5jdFtcIihjb21wYXJyYXkpXCJdID0gZnVuY3RbXCIoY29udGV4dClcIl1bXCIoY29tcGFycmF5KVwiXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmdW5jdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0Z1bmN0b3IodG9rZW4pIHtcbiAgICAgICAgcmV0dXJuIFwiKHNjb3BlKVwiIGluIHRva2VuO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZSBpZiB0aGUgcGFyc2VyIGhhcyBiZWd1biBwYXJzaW5nIGV4ZWN1dGFibGUgY29kZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7VG9rZW59IGZ1bmN0IC0gVGhlIGN1cnJlbnQgXCJmdW5jdG9yXCIgdG9rZW5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGhhc1BhcnNlZENvZGUoZnVuY3QpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0W1wiKGdsb2JhbClcIl0gJiYgIWZ1bmN0W1wiKHZlcmIpXCJdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRvVGVtcGxhdGVMaXRlcmFsKGxlZnQpIHtcbiAgICAgICAgLy8gQVNTRVJUOiB0aGlzLnR5cGUgPT09IFwiKHRlbXBsYXRlKVwiXG4gICAgICAgIC8vIGpzaGludCB2YWxpZHRoaXM6IHRydWVcbiAgICAgICAgdmFyIGN0eCA9IHRoaXMuY29udGV4dDtcbiAgICAgICAgdmFyIG5vU3Vic3QgPSB0aGlzLm5vU3Vic3Q7XG4gICAgICAgIHZhciBkZXB0aCA9IHRoaXMuZGVwdGg7XG5cbiAgICAgICAgaWYgKCFub1N1YnN0KSB7XG4gICAgICAgICAgICB3aGlsZSAoIWVuZCgpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMubmV4dC50ZW1wbGF0ZSB8fCBzdGF0ZS50b2tlbnMubmV4dC5kZXB0aCA+IGRlcHRoKSB7XG4gICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMCk7IC8vIHNob3VsZCBwcm9iYWJseSBoYXZlIGRpZmZlcmVudCByYnA/XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc2tpcCB0ZW1wbGF0ZSBzdGFydCAvIG1pZGRsZVxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGlkOiBcIih0ZW1wbGF0ZSlcIixcbiAgICAgICAgICAgIHR5cGU6IFwiKHRlbXBsYXRlKVwiLFxuICAgICAgICAgICAgdGFnOiBsZWZ0XG4gICAgICAgIH07XG5cbiAgICAgICAgZnVuY3Rpb24gZW5kKCkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5jdXJyLnRlbXBsYXRlICYmIHN0YXRlLnRva2Vucy5jdXJyLnRhaWwgJiZcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5jb250ZXh0ID09PSBjdHgpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgdmFyIGNvbXBsZXRlID0gKHN0YXRlLnRva2Vucy5uZXh0LnRlbXBsYXRlICYmIHN0YXRlLnRva2Vucy5uZXh0LnRhaWwgJiZcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC5jb250ZXh0ID09PSBjdHgpO1xuICAgICAgICAgICAgaWYgKGNvbXBsZXRlKSBhZHZhbmNlKCk7XG4gICAgICAgICAgICByZXR1cm4gY29tcGxldGUgfHwgc3RhdGUudG9rZW5zLm5leHQuaXNVbmNsb3NlZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAgICAgKiBAcGFyYW0ge3Rva2VufSBbb3B0aW9ucy5uYW1lXSBUaGUgaWRlbnRpZmllciBiZWxvbmdpbmcgdG8gdGhlIGZ1bmN0aW9uIChpZlxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFueSlcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IFtvcHRpb25zLnN0YXRlbWVudF0gVGhlIHN0YXRlbWVudCB0aGF0IHRyaWdnZXJlZCBjcmVhdGlvblxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZiB0aGUgY3VycmVudCBmdW5jdGlvbi5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gW29wdGlvbnMudHlwZV0gSWYgc3BlY2lmaWVkLCBlaXRoZXIgXCJnZW5lcmF0b3JcIiBvciBcImFycm93XCJcbiAgICAgKiBAcGFyYW0ge3Rva2VufSBbb3B0aW9ucy5sb25lQXJnXSBUaGUgYXJndW1lbnQgdG8gdGhlIGZ1bmN0aW9uIGluIGNhc2VzXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmUgaXQgd2FzIGRlZmluZWQgdXNpbmcgdGhlXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luZ2xlLWFyZ3VtZW50IHNob3J0aGFuZFxuICAgICAqIEBwYXJhbSB7Ym9vbH0gW29wdGlvbnMucGFyc2VkT3BlbmluZ10gV2hldGhlciB0aGUgb3BlbmluZyBwYXJlbnRoZXNpcyBoYXNcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFscmVhZHkgYmVlbiBwYXJzZWRcbiAgICAgKiBAcGFyYW0ge3Rva2VufSBbb3B0aW9ucy5jbGFzc0V4cHJCaW5kaW5nXSBEZWZpbmUgYSBmdW5jdGlvbiB3aXRoIHRoaXNcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZGVudGlmaWVyIGluIHRoZSBuZXcgZnVuY3Rpb24nc1xuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLCBtaW1pY2tpbmcgdGhlIGJhaGF2aW9yIG9mXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3MgZXhwcmVzc2lvbiBuYW1lcyB3aXRoaW5cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGUgYm9keSBvZiBtZW1iZXIgZnVuY3Rpb25zLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGRvRnVuY3Rpb24ob3B0aW9ucz86IHsgbmFtZT87IHN0YXRlbWVudD87IHR5cGU/OyBsb25lQXJnPzsgcGFyc2VkT3BlbmluZz87IGNsYXNzRXhwckJpbmRpbmc/OyBpZ25vcmVMb29wRnVuYz99KSB7XG4gICAgICAgIHZhciBmLCB0b2tlbiwgbmFtZSwgc3RhdGVtZW50LCBjbGFzc0V4cHJCaW5kaW5nLCBpc0dlbmVyYXRvciwgaXNBcnJvdywgaWdub3JlTG9vcEZ1bmM7XG4gICAgICAgIHZhciBvbGRPcHRpb24gPSBzdGF0ZS5vcHRpb247XG4gICAgICAgIHZhciBvbGRJZ25vcmVkID0gc3RhdGUuaWdub3JlZDtcblxuICAgICAgICBpZiAob3B0aW9ucykge1xuICAgICAgICAgICAgbmFtZSA9IG9wdGlvbnMubmFtZTtcbiAgICAgICAgICAgIHN0YXRlbWVudCA9IG9wdGlvbnMuc3RhdGVtZW50O1xuICAgICAgICAgICAgY2xhc3NFeHByQmluZGluZyA9IG9wdGlvbnMuY2xhc3NFeHByQmluZGluZztcbiAgICAgICAgICAgIGlzR2VuZXJhdG9yID0gb3B0aW9ucy50eXBlID09PSBcImdlbmVyYXRvclwiO1xuICAgICAgICAgICAgaXNBcnJvdyA9IG9wdGlvbnMudHlwZSA9PT0gXCJhcnJvd1wiO1xuICAgICAgICAgICAgaWdub3JlTG9vcEZ1bmMgPSBvcHRpb25zLmlnbm9yZUxvb3BGdW5jO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUub3B0aW9uID0gT2JqZWN0LmNyZWF0ZShzdGF0ZS5vcHRpb24pO1xuICAgICAgICBzdGF0ZS5pZ25vcmVkID0gT2JqZWN0LmNyZWF0ZShzdGF0ZS5pZ25vcmVkKTtcblxuICAgICAgICBzdGF0ZS5mdW5jdCA9IGZ1bmN0b3IobmFtZSB8fCBzdGF0ZS5uYW1lU3RhY2suaW5mZXIoKSwgc3RhdGUudG9rZW5zLm5leHQsIHtcbiAgICAgICAgICAgIFwiKHN0YXRlbWVudClcIjogc3RhdGVtZW50LFxuICAgICAgICAgICAgXCIoY29udGV4dClcIjogc3RhdGUuZnVuY3QsXG4gICAgICAgICAgICBcIihhcnJvdylcIjogaXNBcnJvdyxcbiAgICAgICAgICAgIFwiKGdlbmVyYXRvcilcIjogaXNHZW5lcmF0b3JcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZiA9IHN0YXRlLmZ1bmN0O1xuICAgICAgICB0b2tlbiA9IHN0YXRlLnRva2Vucy5jdXJyO1xuICAgICAgICB0b2tlbi5mdW5jdCA9IHN0YXRlLmZ1bmN0O1xuXG4gICAgICAgIGZ1bmN0aW9ucy5wdXNoKHN0YXRlLmZ1bmN0KTtcblxuICAgICAgICAvLyBTbyB0aGF0IHRoZSBmdW5jdGlvbiBpcyBhdmFpbGFibGUgdG8gaXRzZWxmIGFuZCByZWZlcmVuY2luZyBpdHNlbGYgaXMgbm90XG4gICAgICAgIC8vIHNlZW4gYXMgYSBjbG9zdXJlLCBhZGQgdGhlIGZ1bmN0aW9uIG5hbWUgdG8gYSBuZXcgc2NvcGUsIGJ1dCBkbyBub3RcbiAgICAgICAgLy8gdGVzdCBmb3IgdW51c2VkICh1bnVzZWQ6IGZhbHNlKVxuICAgICAgICAvLyBpdCBpcyBhIG5ldyBibG9jayBzY29wZSBzbyB0aGF0IHBhcmFtcyBjYW4gb3ZlcnJpZGUgaXQsIGl0IGNhbiBiZSBibG9jayBzY29wZWRcbiAgICAgICAgLy8gYnV0IGRlY2xhcmF0aW9ucyBpbnNpZGUgdGhlIGZ1bmN0aW9uIGRvbid0IGNhdXNlIGFscmVhZHkgZGVjbGFyZWQgZXJyb3JcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKFwiZnVuY3Rpb25vdXRlclwiKTtcbiAgICAgICAgdmFyIGludGVybmFsbHlBY2Nlc3NpYmxlTmFtZSA9IG5hbWUgfHwgY2xhc3NFeHByQmluZGluZztcbiAgICAgICAgaWYgKGludGVybmFsbHlBY2Nlc3NpYmxlTmFtZSkge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLmFkZChpbnRlcm5hbGx5QWNjZXNzaWJsZU5hbWUsXG4gICAgICAgICAgICAgICAgY2xhc3NFeHByQmluZGluZyA/IFwiY2xhc3NcIiA6IFwiZnVuY3Rpb25cIiwgc3RhdGUudG9rZW5zLmN1cnIsIGZhbHNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNyZWF0ZSB0aGUgcGFyYW0gc2NvcGUgKHBhcmFtcyBhZGRlZCBpbiBmdW5jdGlvbnBhcmFtcylcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKFwiZnVuY3Rpb25wYXJhbXNcIik7XG5cbiAgICAgICAgdmFyIHBhcmFtc0luZm8gPSBmdW5jdGlvbnBhcmFtcyhvcHRpb25zKTtcblxuICAgICAgICBpZiAocGFyYW1zSW5mbykge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIocGFyYW1zKVwiXSA9IHBhcmFtc0luZm8ucGFyYW1zO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobWV0cmljcylcIl0uYXJpdHkgPSBwYXJhbXNJbmZvLmFyaXR5O1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobWV0cmljcylcIl0udmVyaWZ5TWF4UGFyYW1ldGVyc1BlckZ1bmN0aW9uKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS5hcml0eSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNBcnJvdykge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNih0cnVlKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE5XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImFycm93IGZ1bmN0aW9uIHN5bnRheCAoPT4pXCIsIFwiNlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFvcHRpb25zLmxvbmVBcmcpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPT5cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBibG9jayhmYWxzZSwgdHJ1ZSwgdHJ1ZSwgaXNBcnJvdyk7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24ubm95aWVsZCAmJiBpc0dlbmVyYXRvciAmJlxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoZ2VuZXJhdG9yKVwiXSAhPT0gXCJ5aWVsZGVkXCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTI0XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKG1ldHJpY3MpXCJdLnZlcmlmeU1heFN0YXRlbWVudHNQZXJGdW5jdGlvbigpO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS52ZXJpZnlNYXhDb21wbGV4aXR5UGVyRnVuY3Rpb24oKTtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIodW51c2VkT3B0aW9uKVwiXSA9IHN0YXRlLm9wdGlvbi51bnVzZWQ7XG4gICAgICAgIHN0YXRlLm9wdGlvbiA9IG9sZE9wdGlvbjtcbiAgICAgICAgc3RhdGUuaWdub3JlZCA9IG9sZElnbm9yZWQ7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxhc3QpXCJdID0gc3RhdGUudG9rZW5zLmN1cnIubGluZTtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIobGFzdGNoYXJhY3RlcilcIl0gPSBzdGF0ZS50b2tlbnMuY3Vyci5jaGFyYWN0ZXI7XG5cbiAgICAgICAgLy8gdW5zdGFjayB0aGUgcGFyYW1zIHNjb3BlXG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7IC8vIGFsc28gZG9lcyB1c2FnZSBhbmQgbGFiZWwgY2hlY2tzXG5cbiAgICAgICAgLy8gdW5zdGFjayB0aGUgZnVuY3Rpb24gb3V0ZXIgc3RhY2tcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnVuc3RhY2soKTtcblxuICAgICAgICBzdGF0ZS5mdW5jdCA9IHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdO1xuXG4gICAgICAgIGlmICghaWdub3JlTG9vcEZ1bmMgJiYgIXN0YXRlLm9wdGlvbi5sb29wZnVuYyAmJiBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSkge1xuICAgICAgICAgICAgLy8gSWYgdGhlIGZ1bmN0aW9uIHdlIGp1c3QgcGFyc2VkIGFjY2Vzc2VzIGFueSBub24tbG9jYWwgdmFyaWFibGVzXG4gICAgICAgICAgICAvLyB0cmlnZ2VyIGEgd2FybmluZy4gT3RoZXJ3aXNlLCB0aGUgZnVuY3Rpb24gaXMgc2FmZSBldmVuIHdpdGhpblxuICAgICAgICAgICAgLy8gYSBsb29wLlxuICAgICAgICAgICAgaWYgKGZbXCIoaXNDYXB0dXJpbmcpXCJdKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODNcIiwgdG9rZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGY7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlTWV0cmljcyhmdW5jdGlvblN0YXJ0VG9rZW4pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXRlbWVudENvdW50OiAwLFxuICAgICAgICAgICAgbmVzdGVkQmxvY2tEZXB0aDogLTEsXG4gICAgICAgICAgICBDb21wbGV4aXR5Q291bnQ6IDEsXG4gICAgICAgICAgICBhcml0eTogMCxcblxuICAgICAgICAgICAgdmVyaWZ5TWF4U3RhdGVtZW50c1BlckZ1bmN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm1heHN0YXRlbWVudHMgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZW1lbnRDb3VudCA+IHN0YXRlLm9wdGlvbi5tYXhzdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcxXCIsIGZ1bmN0aW9uU3RhcnRUb2tlbiwgdGhpcy5zdGF0ZW1lbnRDb3VudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgdmVyaWZ5TWF4UGFyYW1ldGVyc1BlckZ1bmN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBpZiAoXy5pc051bWJlcihzdGF0ZS5vcHRpb24ubWF4cGFyYW1zKSAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFyaXR5ID4gc3RhdGUub3B0aW9uLm1heHBhcmFtcykge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3MlwiLCBmdW5jdGlvblN0YXJ0VG9rZW4sIHRoaXMuYXJpdHkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHZlcmlmeU1heE5lc3RlZEJsb2NrRGVwdGhQZXJGdW5jdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5tYXhkZXB0aCAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5lc3RlZEJsb2NrRGVwdGggPiAwICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmVzdGVkQmxvY2tEZXB0aCA9PT0gc3RhdGUub3B0aW9uLm1heGRlcHRoICsgMSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3M1wiLCBudWxsLCB0aGlzLm5lc3RlZEJsb2NrRGVwdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHZlcmlmeU1heENvbXBsZXhpdHlQZXJGdW5jdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1heCA9IHN0YXRlLm9wdGlvbi5tYXhjb21wbGV4aXR5O1xuICAgICAgICAgICAgICAgIHZhciBjYyA9IHRoaXMuQ29tcGxleGl0eUNvdW50O1xuICAgICAgICAgICAgICAgIGlmIChtYXggJiYgY2MgPiBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzRcIiwgZnVuY3Rpb25TdGFydFRva2VuLCBjYyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCkge1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS5Db21wbGV4aXR5Q291bnQgKz0gMTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBhc3NpZ25tZW50cyB0aGF0IHdlcmUgZm91bmQgaW5zdGVhZCBvZiBjb25kaXRpb25hbHMuXG4gICAgLy8gRm9yIGV4YW1wbGU6IGlmIChhID0gMSkgeyAuLi4gfVxuXG4gICAgZnVuY3Rpb24gY2hlY2tDb25kQXNzaWdubWVudChleHByKSB7XG4gICAgICAgIHZhciBpZCwgcGFyZW47XG4gICAgICAgIGlmIChleHByKSB7XG4gICAgICAgICAgICBpZCA9IGV4cHIuaWQ7XG4gICAgICAgICAgICBwYXJlbiA9IGV4cHIucGFyZW47XG4gICAgICAgICAgICBpZiAoaWQgPT09IFwiLFwiICYmIChleHByID0gZXhwci5leHByc1tleHByLmV4cHJzLmxlbmd0aCAtIDFdKSkge1xuICAgICAgICAgICAgICAgIGlkID0gZXhwci5pZDtcbiAgICAgICAgICAgICAgICBwYXJlbiA9IHBhcmVuIHx8IGV4cHIucGFyZW47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChpZCkge1xuICAgICAgICAgICAgY2FzZSBcIj1cIjpcbiAgICAgICAgICAgIGNhc2UgXCIrPVwiOlxuICAgICAgICAgICAgY2FzZSBcIi09XCI6XG4gICAgICAgICAgICBjYXNlIFwiKj1cIjpcbiAgICAgICAgICAgIGNhc2UgXCIlPVwiOlxuICAgICAgICAgICAgY2FzZSBcIiY9XCI6XG4gICAgICAgICAgICBjYXNlIFwifD1cIjpcbiAgICAgICAgICAgIGNhc2UgXCJePVwiOlxuICAgICAgICAgICAgY2FzZSBcIi89XCI6XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJlbiAmJiAhc3RhdGUub3B0aW9uLmJvc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODRcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IHByb3BzIENvbGxlY3Rpb24gb2YgcHJvcGVydHkgZGVzY3JpcHRvcnMgZm9yIGEgZ2l2ZW5cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoZWNrUHJvcGVydGllcyhwcm9wcykge1xuICAgICAgICAvLyBDaGVjayBmb3IgbG9uZWx5IHNldHRlcnMgaWYgaW4gdGhlIEVTNSBtb2RlLlxuICAgICAgICBpZiAoc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgbmFtZSBpbiBwcm9wcykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wc1tuYW1lXSAmJiBwcm9wc1tuYW1lXS5zZXR0ZXJUb2tlbiAmJiAhcHJvcHNbbmFtZV0uZ2V0dGVyVG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzhcIiwgcHJvcHNbbmFtZV0uc2V0dGVyVG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1ldGFQcm9wZXJ0eShuYW1lLCBjKSB7XG4gICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiLlwiKSkge1xuICAgICAgICAgICAgdmFyIGxlZnQgPSBzdGF0ZS50b2tlbnMuY3Vyci5pZDtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIuXCIpO1xuICAgICAgICAgICAgdmFyIGlkID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuaXNNZXRhUHJvcGVydHkgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKG5hbWUgIT09IGlkKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDU3XCIsIHN0YXRlLnRva2Vucy5wcmV2LCBsZWZ0LCBpZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdGF0ZS50b2tlbnMuY3VycjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIChmdW5jdGlvbih4KSB7XG4gICAgICAgIHgubnVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgYiwgZiwgaSwgcCwgdCwgaXNHZW5lcmF0b3JNZXRob2QgPSBmYWxzZSwgbmV4dFZhbDtcbiAgICAgICAgICAgIHZhciBwcm9wcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEFsbCBwcm9wZXJ0aWVzLCBpbmNsdWRpbmcgYWNjZXNzb3JzXG5cbiAgICAgICAgICAgIGIgPSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lICE9PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgaWYgKGIpIHtcbiAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuZnJvbSA9PT0gaW5kZW50ICsgc3RhdGUub3B0aW9uLmluZGVudCkge1xuICAgICAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBibG9ja3R5cGUgPSBsb29rdXBCbG9ja1R5cGUoKTtcbiAgICAgICAgICAgIGlmIChibG9ja3R5cGUuaXNEZXN0QXNzaWduKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZXN0cnVjdEFzc2lnbiA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKHsgb3BlbmluZ1BhcnNlZDogdHJ1ZSwgYXNzaWdubWVudDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG5leHRWYWwgPSBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllciAmJlxuICAgICAgICAgICAgICAgICAgICAocGVla0lnbm9yZUVPTCgpLmlkID09PSBcIixcIiB8fCBwZWVrSWdub3JlRU9MKCkuaWQgPT09IFwifVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIm9iamVjdCBzaG9ydCBub3RhdGlvblwiLCBcIjZcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaSA9IHByb3BlcnR5TmFtZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVByb3BlcnR5KHByb3BzLCBpLCBzdGF0ZS50b2tlbnMubmV4dCk7XG5cbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbigxMCk7XG5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBlZWsoKS5pZCAhPT0gXCI6XCIgJiYgKG5leHRWYWwgPT09IFwiZ2V0XCIgfHwgbmV4dFZhbCA9PT0gXCJzZXRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShuZXh0VmFsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM1KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzNFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGkgPSBwcm9wZXJ0eU5hbWUoKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBFUzYgYWxsb3dzIGZvciBnZXQoKSB7Li4ufSBhbmQgc2V0KCkgey4uLn0gbWV0aG9kXG4gICAgICAgICAgICAgICAgICAgIC8vIGRlZmluaXRpb24gc2hvcnRoYW5kIHN5bnRheCwgc28gd2UgZG9uJ3QgcHJvZHVjZSBhbiBlcnJvclxuICAgICAgICAgICAgICAgICAgICAvLyBpZiBsaW50aW5nIEVDTUFTY3JpcHQgNiBjb2RlLlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWkgJiYgIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzNVwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc2F2ZSB0aGlzIGdldHRlciB1bmxlc3MgaXQncyBhbiBhY3R1YWwgZ2V0dGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCBub3QgYW4gRVM2IGNvbmNpc2UgbWV0aG9kXG4gICAgICAgICAgICAgICAgICAgIGlmIChpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlQWNjZXNzb3IobmV4dFZhbCwgcHJvcHMsIGksIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgICAgICAgICAgZiA9IGRvRnVuY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGZbXCIocGFyYW1zKVwiXTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCB3YXJuIGFib3V0IGdldHRlci9zZXR0ZXIgcGFpcnMgaWYgdGhpcyBpcyBhbiBFUzYgY29uY2lzZSBtZXRob2RcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5leHRWYWwgPT09IFwiZ2V0XCIgJiYgaSAmJiBwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3NlwiLCB0LCBwWzBdLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuZXh0VmFsID09PSBcInNldFwiICYmIGkgJiYgKCFwIHx8IHAubGVuZ3RoICE9PSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzdcIiwgdCwgaSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKlwiICYmIHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImdlbmVyYXRvciBmdW5jdGlvbnNcIiwgXCI2XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0dlbmVyYXRvck1ldGhvZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0dlbmVyYXRvck1ldGhvZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IGNvbXB1dGVkUHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KGkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpID0gcHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlUHJvcGVydHkocHJvcHMsIGksIHN0YXRlLnRva2Vucy5uZXh0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJjb25jaXNlIG1ldGhvZHNcIiwgXCI2XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZG9GdW5jdGlvbih7IHR5cGU6IGlzR2VuZXJhdG9yTWV0aG9kID8gXCJnZW5lcmF0b3JcIiA6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY291bnRNZW1iZXIoaSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbW1hKHsgYWxsb3dUcmFpbGluZzogdHJ1ZSwgcHJvcGVydHk6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ9XCIgJiYgIXN0YXRlLmluRVM1KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwifVwiLCB0aGlzKTtcblxuICAgICAgICAgICAgY2hlY2tQcm9wZXJ0aWVzKHByb3BzKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG4gICAgICAgIHguZnVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMzZcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9O1xuICAgIH0gKGRlbGltKFwie1wiKSkpO1xuXG4gICAgZnVuY3Rpb24gZGVzdHJ1Y3R1cmluZ1BhdHRlcm4ob3B0aW9ucz8pIHtcbiAgICAgICAgdmFyIGlzQXNzaWdubWVudCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5hc3NpZ25tZW50O1xuXG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMDRcIiwgc3RhdGUudG9rZW5zLmN1cnIsXG4gICAgICAgICAgICAgICAgaXNBc3NpZ25tZW50ID8gXCJkZXN0cnVjdHVyaW5nIGFzc2lnbm1lbnRcIiA6IFwiZGVzdHJ1Y3R1cmluZyBiaW5kaW5nXCIsIFwiNlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZShvcHRpb25zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZShvcHRpb25zKSB7XG4gICAgICAgIHZhciBpZHM7XG4gICAgICAgIHZhciBpZGVudGlmaWVycyA9IFtdO1xuICAgICAgICB2YXIgb3BlbmluZ1BhcnNlZCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5vcGVuaW5nUGFyc2VkO1xuICAgICAgICB2YXIgaXNBc3NpZ25tZW50ID0gb3B0aW9ucyAmJiBvcHRpb25zLmFzc2lnbm1lbnQ7XG4gICAgICAgIHZhciByZWN1cnNpdmVPcHRpb25zID0gaXNBc3NpZ25tZW50ID8geyBhc3NpZ25tZW50OiBpc0Fzc2lnbm1lbnQgfSA6IG51bGw7XG4gICAgICAgIHZhciBmaXJzdFRva2VuID0gb3BlbmluZ1BhcnNlZCA/IHN0YXRlLnRva2Vucy5jdXJyIDogc3RhdGUudG9rZW5zLm5leHQ7XG5cbiAgICAgICAgdmFyIG5leHRJbm5lckRFID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgaWRlbnQ7XG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhzdGF0ZS50b2tlbnMubmV4dCwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICAgICAgaWRzID0gZGVzdHJ1Y3R1cmluZ1BhdHRlcm5SZWN1cnNpdmUocmVjdXJzaXZlT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaWQgaW4gaWRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkID0gaWRzW2lkXTtcbiAgICAgICAgICAgICAgICAgICAgaWRlbnRpZmllcnMucHVzaCh7IGlkOiBpZC5pZCwgdG9rZW46IGlkLnRva2VuIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIixcIikpIHtcbiAgICAgICAgICAgICAgICBpZGVudGlmaWVycy5wdXNoKHsgaWQ6IG51bGwsIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIihcIikpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgICAgICAgICBuZXh0SW5uZXJERSgpO1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgaXNfcmVzdCA9IGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIuLi5cIik7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNBc3NpZ25tZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpZGVudGlmaWVyVG9rZW4gPSBpc19yZXN0ID8gcGVlaygwKSA6IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlkZW50aWZpZXJUb2tlbi5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMFwiLCBpZGVudGlmaWVyVG9rZW4sIGlkZW50aWZpZXJUb2tlbi52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2lnblRhcmdldCA9IGV4cHJlc3Npb24oMTU1KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2lnblRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tMZWZ0U2lkZUFzc2lnbihhc3NpZ25UYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgdGFyZ2V0IHdhcyBhIHNpbXBsZSBpZGVudGlmaWVyLCBhZGQgaXQgdG8gdGhlIGxpc3QgdG8gcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzaWduVGFyZ2V0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZGVudCA9IGFzc2lnblRhcmdldC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlkZW50ID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaWRlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWRlbnRpZmllcnMucHVzaCh7IGlkOiBpZGVudCwgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gaXNfcmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIGFzc2lnbm1lbnRQcm9wZXJ0eSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGlkO1xuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJbXCIpKSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIltcIik7XG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbigxMCk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIl1cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgbmV4dElubmVyREUoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKHN0cmluZylcIiB8fFxuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihudW1iZXIpXCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgbmV4dElubmVyREUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpZCB3aWxsIGVpdGhlciBiZSB0aGUgcHJvcGVydHkgbmFtZSBvciB0aGUgcHJvcGVydHkgbmFtZSBhbmQgdGhlIGFzc2lnbmluZyBpZGVudGlmaWVyXG4gICAgICAgICAgICAgICAgaWQgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCI6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICBuZXh0SW5uZXJERSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhpcyBjYXNlIHdlIGFyZSBhc3NpZ25pbmcgKG5vdCBkZWNsYXJpbmcpLCBzbyBjaGVjayBhc3NpZ25tZW50XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0Fzc2lnbm1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrTGVmdFNpZGVBc3NpZ24oc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlkZW50aWZpZXJzLnB1c2goeyBpZDogaWQsIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGlkLCB2YWx1ZTtcbiAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihmaXJzdFRva2VuLCBcIltcIikpIHtcbiAgICAgICAgICAgIGlmICghb3BlbmluZ1BhcnNlZCkge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJbXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJdXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzdcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGVsZW1lbnRfYWZ0ZXJfcmVzdCA9IGZhbHNlO1xuICAgICAgICAgICAgd2hpbGUgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiXVwiKSkge1xuICAgICAgICAgICAgICAgIGlmIChuZXh0SW5uZXJERSgpICYmICFlbGVtZW50X2FmdGVyX3Jlc3QgJiZcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIixcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzBcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50X2FmdGVyX3Jlc3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIj1cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMucHJldiwgXCIuLi5cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJdXCIpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIj1cIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiXVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGVja1B1bmN0dWF0b3IoZmlyc3RUb2tlbiwgXCJ7XCIpKSB7XG5cbiAgICAgICAgICAgIGlmICghb3BlbmluZ1BhcnNlZCkge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzdcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwifVwiKSkge1xuICAgICAgICAgICAgICAgIGFzc2lnbm1lbnRQcm9wZXJ0eSgpO1xuICAgICAgICAgICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiPVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPVwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwifVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUcmFpbGluZyBjb21tYVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT2JqZWN0QmluZGluZ1BhdHRlcm46IHsgQmluZGluZ1Byb3BlcnR5TGlzdCAsIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZShcIn1cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkZW50aWZpZXJzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2godG9rZW5zLCB2YWx1ZSkge1xuICAgICAgICB2YXIgZmlyc3QgPSB2YWx1ZS5maXJzdDtcblxuICAgICAgICBpZiAoIWZpcnN0KVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIF8uemlwKHRva2VucywgQXJyYXkuaXNBcnJheShmaXJzdCkgPyBmaXJzdCA6IFtmaXJzdF0pLmZvckVhY2goZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSB2YWxbMF07XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB2YWxbMV07XG5cbiAgICAgICAgICAgIGlmICh0b2tlbiAmJiB2YWx1ZSlcbiAgICAgICAgICAgICAgICB0b2tlbi5maXJzdCA9IHZhbHVlO1xuICAgICAgICAgICAgZWxzZSBpZiAodG9rZW4gJiYgdG9rZW4uZmlyc3QgJiYgIXZhbHVlKVxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIHRva2VuLmZpcnN0LCB0b2tlbi5maXJzdC52YWx1ZSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJsb2NrVmFyaWFibGVTdGF0ZW1lbnQodHlwZSwgc3RhdGVtZW50LCBjb250ZXh0KSB7XG4gICAgICAgIC8vIHVzZWQgZm9yIGJvdGggbGV0IGFuZCBjb25zdCBzdGF0ZW1lbnRzXG5cbiAgICAgICAgdmFyIHByZWZpeCA9IGNvbnRleHQgJiYgY29udGV4dC5wcmVmaXg7XG4gICAgICAgIHZhciBpbmV4cG9ydCA9IGNvbnRleHQgJiYgY29udGV4dC5pbmV4cG9ydDtcbiAgICAgICAgdmFyIGlzTGV0ID0gdHlwZSA9PT0gXCJsZXRcIjtcbiAgICAgICAgdmFyIGlzQ29uc3QgPSB0eXBlID09PSBcImNvbnN0XCI7XG4gICAgICAgIHZhciB0b2tlbnMsIGxvbmUsIHZhbHVlLCBsZXRibG9jaztcblxuICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5jdXJyLCB0eXBlLCBcIjZcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNMZXQgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJsZXQgYmxvY2tcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjaygpO1xuICAgICAgICAgICAgbGV0YmxvY2sgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmZ1bmN0W1wiKG5vYmxvY2tzY29wZWR2YXIpXCJdKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwNDhcIiwgc3RhdGUudG9rZW5zLmN1cnIsIGlzQ29uc3QgPyBcIkNvbnN0XCIgOiBcIkxldFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlbWVudC5maXJzdCA9IFtdO1xuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgdmFyIG5hbWVzID0gW107XG4gICAgICAgICAgICBpZiAoXy5jb250YWlucyhbXCJ7XCIsIFwiW1wiXSwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gZGVzdHJ1Y3R1cmluZ1BhdHRlcm4oKTtcbiAgICAgICAgICAgICAgICBsb25lID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IFt7IGlkOiBpZGVudGlmaWVyKCksIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9XTtcbiAgICAgICAgICAgICAgICBsb25lID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFwcmVmaXggJiYgaXNDb25zdCAmJiBzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI9XCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAxMlwiLCBzdGF0ZS50b2tlbnMuY3Vyciwgc3RhdGUudG9rZW5zLmN1cnIudmFsdWUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKHZhciB0IGluIHRva2Vucykge1xuICAgICAgICAgICAgICAgIGlmICh0b2tlbnMuaGFzT3duUHJvcGVydHkodCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdCA9IHRva2Vuc1t0XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5ibG9jay5pc0dsb2JhbCgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlZGVmaW5lZFt0LmlkXSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3OVwiLCB0LnRva2VuLCB0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCAmJiAhc3RhdGUuZnVuY3RbXCIobm9ibG9ja3Njb3BlZHZhcilcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRsYWJlbCh0LmlkLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbjogdC50b2tlblxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lcy5wdXNoKHQudG9rZW4pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobG9uZSAmJiBpbmV4cG9ydCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zZXRFeHBvcnRlZCh0LnRva2VuLnZhbHVlLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIj1cIikge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI9XCIpO1xuICAgICAgICAgICAgICAgIGlmICghcHJlZml4ICYmIHBlZWsoMCkuaWQgPT09IFwiPVwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGlkID0gc3RhdGUudG9rZW5zLnByZXY7XG4gICAgICAgICAgICAgICAgLy8gZG9uJ3QgYWNjZXB0IGBpbmAgaW4gZXhwcmVzc2lvbiBpZiBwcmVmaXggaXMgdXNlZCBmb3IgRm9ySW4vT2YgbG9vcC5cbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGV4cHJlc3Npb24ocHJlZml4ID8gMTIwIDogMTApO1xuICAgICAgICAgICAgICAgIGlmICghcHJlZml4ICYmIHZhbHVlICYmIHZhbHVlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODBcIiwgaWQsIGlkLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGxvbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5zWzBdLmZpcnN0ID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZGVzdHJ1Y3R1cmluZ1BhdHRlcm5NYXRjaChuYW1lcywgdmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGVtZW50LmZpcnN0ID0gc3RhdGVtZW50LmZpcnN0LmNvbmNhdChuYW1lcyk7XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxldGJsb2NrKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiKTtcbiAgICAgICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICAgICAgc3RhdGVtZW50LmJsb2NrID0gdHJ1ZTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc3RhdGVtZW50O1xuICAgIH1cblxuICAgIHZhciBjb25zdHN0YXRlbWVudCA9IHN0bXQoXCJjb25zdFwiLCBmdW5jdGlvbihjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBibG9ja1ZhcmlhYmxlU3RhdGVtZW50KFwiY29uc3RcIiwgdGhpcywgY29udGV4dCk7XG4gICAgfSk7XG4gICAgY29uc3RzdGF0ZW1lbnQuZXhwcyA9IHRydWU7XG5cbiAgICB2YXIgbGV0c3RhdGVtZW50ID0gc3RtdChcImxldFwiLCBmdW5jdGlvbihjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBibG9ja1ZhcmlhYmxlU3RhdGVtZW50KFwibGV0XCIsIHRoaXMsIGNvbnRleHQpO1xuICAgIH0pO1xuICAgIGxldHN0YXRlbWVudC5leHBzID0gdHJ1ZTtcblxuICAgIHZhciB2YXJzdGF0ZW1lbnQgPSBzdG10KFwidmFyXCIsIGZ1bmN0aW9uKGNvbnRleHQpIHtcbiAgICAgICAgdmFyIHByZWZpeCA9IGNvbnRleHQgJiYgY29udGV4dC5wcmVmaXg7XG4gICAgICAgIHZhciBpbmV4cG9ydCA9IGNvbnRleHQgJiYgY29udGV4dC5pbmV4cG9ydDtcbiAgICAgICAgdmFyIHRva2VucywgbG9uZSwgdmFsdWU7XG5cbiAgICAgICAgLy8gSWYgdGhlIGBpbXBsaWVkYCBvcHRpb24gaXMgc2V0LCBiaW5kaW5ncyBhcmUgc2V0IGRpZmZlcmVudGx5LlxuICAgICAgICB2YXIgaW1wbGllZCA9IGNvbnRleHQgJiYgY29udGV4dC5pbXBsaWVkO1xuICAgICAgICB2YXIgcmVwb3J0ID0gIShjb250ZXh0ICYmIGNvbnRleHQuaWdub3JlKTtcblxuICAgICAgICB0aGlzLmZpcnN0ID0gW107XG4gICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICAgICAgICAgIGlmIChfLmNvbnRhaW5zKFtcIntcIiwgXCJbXCJdLCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBkZXN0cnVjdHVyaW5nUGF0dGVybigpO1xuICAgICAgICAgICAgICAgIGxvbmUgPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gW3sgaWQ6IGlkZW50aWZpZXIoKSwgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyIH1dO1xuICAgICAgICAgICAgICAgIGxvbmUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIShwcmVmaXggJiYgaW1wbGllZCkgJiYgcmVwb3J0ICYmIHN0YXRlLm9wdGlvbi52YXJzdG10KSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzJcIiwgdGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZmlyc3QgPSB0aGlzLmZpcnN0LmNvbmNhdChuYW1lcyk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIHQgaW4gdG9rZW5zKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy5oYXNPd25Qcm9wZXJ0eSh0KSkge1xuICAgICAgICAgICAgICAgICAgICB0ID0gdG9rZW5zW3RdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWltcGxpZWQgJiYgc3RhdGUuZnVuY3RbXCIoZ2xvYmFsKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZWRlZmluZWRbdC5pZF0gPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzlcIiwgdC50b2tlbiwgdC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5mdXR1cmVob3N0aWxlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgoIXN0YXRlLmluRVM1KCkgJiYgZWNtYUlkZW50aWZpZXJzWzVdW3QuaWRdID09PSBmYWxzZSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCFzdGF0ZS5pbkVTNigpICYmIGVjbWFJZGVudGlmaWVyc1s2XVt0LmlkXSA9PT0gZmFsc2UpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTI5XCIsIHQudG9rZW4sIHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltcGxpZWQgPT09IFwiZm9yXCIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmhhcyh0LmlkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVwb3J0KSB3YXJuaW5nKFwiVzA4OFwiLCB0LnRva2VuLCB0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLnVzZSh0LmlkLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJ2YXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IHQudG9rZW5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsb25lICYmIGluZXhwb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zZXRFeHBvcnRlZCh0LmlkLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lcy5wdXNoKHQudG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChzdGF0ZS50b2tlbnMuY3Vycik7XG5cbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPVwiKTtcbiAgICAgICAgICAgICAgICBpZiAocGVlaygwKS5pZCA9PT0gXCI9XCIgJiYgc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByZWZpeCAmJiByZXBvcnQgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5mdW5jdFtcIihwYXJhbXMpXCJdIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihwYXJhbXMpXCJdLmluZGV4T2Yoc3RhdGUudG9rZW5zLm5leHQudmFsdWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAvLyBkb24ndCBhY2NlcHQgYGluYCBpbiBleHByZXNzaW9uIGlmIHByZWZpeCBpcyB1c2VkIGZvciBGb3JJbi9PZiBsb29wLlxuICAgICAgICAgICAgICAgIHZhbHVlID0gZXhwcmVzc2lvbihwcmVmaXggPyAxMjAgOiAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmICFwcmVmaXggJiYgcmVwb3J0ICYmICFzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSAmJiB2YWx1ZS50eXBlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsb25lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2Vuc1swXS5maXJzdCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2gobmFtZXMsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICB2YXJzdGF0ZW1lbnQuZXhwcyA9IHRydWU7XG5cbiAgICBibG9ja3N0bXQoXCJjbGFzc1wiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGNsYXNzZGVmLmNhbGwodGhpcywgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiBjbGFzc2RlZihpc1N0YXRlbWVudCkge1xuXG4gICAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMDRcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiY2xhc3NcIiwgXCI2XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRlbWVudCkge1xuICAgICAgICAgICAgLy8gQmluZGluZ0lkZW50aWZpZXJcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IGlkZW50aWZpZXIoKTtcblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHRoaXMubmFtZSwge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiY2xhc3NcIixcbiAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgIT09IFwiZXh0ZW5kc1wiKSB7XG4gICAgICAgICAgICAvLyBCaW5kaW5nSWRlbnRpZmllcihvcHQpXG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICB0aGlzLm5hbWVkRXhwciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBzdGF0ZS5uYW1lU3RhY2suaW5mZXIoKTtcbiAgICAgICAgfVxuICAgICAgICBjbGFzc3RhaWwodGhpcyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsYXNzdGFpbChjKSB7XG4gICAgICAgIHZhciB3YXNJbkNsYXNzQm9keSA9IHN0YXRlLmluQ2xhc3NCb2R5O1xuICAgICAgICAvLyBDbGFzc0hlcml0YWdlKG9wdClcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImV4dGVuZHNcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcImV4dGVuZHNcIik7XG4gICAgICAgICAgICBjLmhlcml0YWdlID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIH1cblxuICAgICAgICBzdGF0ZS5pbkNsYXNzQm9keSA9IHRydWU7XG4gICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuICAgICAgICAvLyBDbGFzc0JvZHkob3B0KVxuICAgICAgICBjLmJvZHkgPSBjbGFzc2JvZHkoYyk7XG4gICAgICAgIGFkdmFuY2UoXCJ9XCIpO1xuICAgICAgICBzdGF0ZS5pbkNsYXNzQm9keSA9IHdhc0luQ2xhc3NCb2R5O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsYXNzYm9keShjKSB7XG4gICAgICAgIHZhciBuYW1lO1xuICAgICAgICB2YXIgaXNTdGF0aWM7XG4gICAgICAgIHZhciBpc0dlbmVyYXRvcjtcbiAgICAgICAgdmFyIGdldHNldDtcbiAgICAgICAgdmFyIHByb3BzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIHN0YXRpY1Byb3BzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIGNvbXB1dGVkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwifVwiOyArK2kpIHtcbiAgICAgICAgICAgIG5hbWUgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgIGlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICBpc0dlbmVyYXRvciA9IGZhbHNlO1xuICAgICAgICAgICAgZ2V0c2V0ID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gVGhlIEVTNiBncmFtbWFyIGZvciBDbGFzc0VsZW1lbnQgaW5jbHVkZXMgdGhlIGA7YCB0b2tlbiwgYnV0IGl0IGlzXG4gICAgICAgICAgICAvLyBkZWZpbmVkIG9ubHkgYXMgYSBwbGFjZWhvbGRlciB0byBmYWNpbGl0YXRlIGZ1dHVyZSBsYW5ndWFnZVxuICAgICAgICAgICAgLy8gZXh0ZW5zaW9ucy4gSW4gRVM2IGNvZGUsIGl0IHNlcnZlcyBubyBwdXJwb3NlLlxuICAgICAgICAgICAgaWYgKG5hbWUuaWQgPT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzJcIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuYW1lLmlkID09PSBcIipcIikge1xuICAgICAgICAgICAgICAgIGlzR2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKlwiKTtcbiAgICAgICAgICAgICAgICBuYW1lID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmFtZS5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICBuYW1lID0gY29tcHV0ZWRQcm9wZXJ0eU5hbWUoKTtcbiAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzUHJvcGVydHlOYW1lKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gTm9uLUNvbXB1dGVkIFByb3BlcnR5TmFtZVxuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICBjb21wdXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChuYW1lLmlkZW50aWZpZXIgJiYgbmFtZS52YWx1ZSA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIipcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzR2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIqXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1Byb3BlcnR5TmFtZShzdGF0ZS50b2tlbnMubmV4dCkgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWUgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lID0gY29tcHV0ZWRQcm9wZXJ0eU5hbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobmFtZS5pZGVudGlmaWVyICYmIChuYW1lLnZhbHVlID09PSBcImdldFwiIHx8IG5hbWUudmFsdWUgPT09IFwic2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1Byb3BlcnR5TmFtZShzdGF0ZS50b2tlbnMubmV4dCkgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldHNldCA9IG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IGNvbXB1dGVkUHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1MlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgfHwgc3RhdGUudG9rZW5zLm5leHQudHlwZSk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIoXCIpKSB7XG4gICAgICAgICAgICAgICAgLy8gZXJyb3IgLS0tIGNsYXNzIHByb3BlcnRpZXMgbXVzdCBiZSBtZXRob2RzXG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDU0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIn1cIiAmJlxuICAgICAgICAgICAgICAgICAgICAhY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIihcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgIT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvRnVuY3Rpb24oeyBzdGF0ZW1lbnQ6IGMgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNvbXB1dGVkKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgZG9uJ3Qga25vdyBob3cgdG8gZGV0ZXJtaW5lIGlmIHdlIGhhdmUgZHVwbGljYXRlIGNvbXB1dGVkIHByb3BlcnR5IG5hbWVzIDooXG4gICAgICAgICAgICAgICAgaWYgKGdldHNldCkge1xuICAgICAgICAgICAgICAgICAgICBzYXZlQWNjZXNzb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICBnZXRzZXQudmFsdWUsIGlzU3RhdGljID8gc3RhdGljUHJvcHMgOiBwcm9wcywgbmFtZS52YWx1ZSwgbmFtZSwgdHJ1ZSwgaXNTdGF0aWMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuYW1lLnZhbHVlID09PSBcImNvbnN0cnVjdG9yXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm5hbWVTdGFjay5zZXQoYyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQcm9wZXJ0eShpc1N0YXRpYyA/IHN0YXRpY1Byb3BzIDogcHJvcHMsIG5hbWUudmFsdWUsIG5hbWUsIHRydWUsIGlzU3RhdGljKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChnZXRzZXQgJiYgbmFtZS52YWx1ZSA9PT0gXCJjb25zdHJ1Y3RvclwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByb3BEZXNjID0gZ2V0c2V0LnZhbHVlID09PSBcImdldFwiID8gXCJjbGFzcyBnZXR0ZXIgbWV0aG9kXCIgOiBcImNsYXNzIHNldHRlciBtZXRob2RcIjtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDlcIiwgbmFtZSwgcHJvcERlc2MsIFwiY29uc3RydWN0b3JcIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5hbWUudmFsdWUgPT09IFwicHJvdG90eXBlXCIpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDlcIiwgbmFtZSwgXCJjbGFzcyBtZXRob2RcIiwgXCJwcm90b3R5cGVcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHByb3BlcnR5TmFtZShuYW1lKTtcblxuICAgICAgICAgICAgZG9GdW5jdGlvbih7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50OiBjLFxuICAgICAgICAgICAgICAgIHR5cGU6IGlzR2VuZXJhdG9yID8gXCJnZW5lcmF0b3JcIiA6IG51bGwsXG4gICAgICAgICAgICAgICAgY2xhc3NFeHByQmluZGluZzogYy5uYW1lZEV4cHIgPyBjLm5hbWUgOiBudWxsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNoZWNrUHJvcGVydGllcyhwcm9wcyk7XG4gICAgfVxuXG4gICAgYmxvY2tzdG10KFwiZnVuY3Rpb25cIiwgZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgICB2YXIgaW5leHBvcnQgPSBjb250ZXh0ICYmIGNvbnRleHQuaW5leHBvcnQ7XG4gICAgICAgIHZhciBnZW5lcmF0b3IgPSBmYWxzZTtcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICBnZW5lcmF0b3IgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJmdW5jdGlvbipcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbmJsb2NrKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA4MlwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGkgPSBvcHRpb25hbGlkZW50aWZpZXIoKTtcblxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkbGFiZWwoaSwge1xuICAgICAgICAgICAgdHlwZTogXCJmdW5jdGlvblwiLFxuICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChpID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDI1XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKGluZXhwb3J0KSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc2V0RXhwb3J0ZWQoaSwgc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9GdW5jdGlvbih7XG4gICAgICAgICAgICBuYW1lOiBpLFxuICAgICAgICAgICAgc3RhdGVtZW50OiB0aGlzLFxuICAgICAgICAgICAgdHlwZTogZ2VuZXJhdG9yID8gXCJnZW5lcmF0b3JcIiA6IG51bGwsXG4gICAgICAgICAgICBpZ25vcmVMb29wRnVuYzogaW5ibG9jayAvLyBhIGRlY2xhcmF0aW9uIG1heSBhbHJlYWR5IGhhdmUgd2FybmVkXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKFwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmxpbmUgPT09IHN0YXRlLnRva2Vucy5jdXJyLmxpbmUpIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTAzOVwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIHByZWZpeChcImZ1bmN0aW9uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZ2VuZXJhdG9yID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZnVuY3Rpb24qXCIsIFwiNlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2UoXCIqXCIpO1xuICAgICAgICAgICAgZ2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gb3B0aW9uYWxpZGVudGlmaWVyKCk7XG4gICAgICAgIGRvRnVuY3Rpb24oeyBuYW1lOiBpLCB0eXBlOiBnZW5lcmF0b3IgPyBcImdlbmVyYXRvclwiIDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICBibG9ja3N0bXQoXCJpZlwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgaW5jcmVhc2VDb21wbGV4aXR5Q291bnQoKTtcbiAgICAgICAgc3RhdGUuY29uZGl0aW9uID0gdHJ1ZTtcbiAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIHZhciBleHByID0gZXhwcmVzc2lvbigwKTtcbiAgICAgICAgY2hlY2tDb25kQXNzaWdubWVudChleHByKTtcblxuICAgICAgICAvLyBXaGVuIHRoZSBpZiBpcyB3aXRoaW4gYSBmb3ItaW4gbG9vcCwgY2hlY2sgaWYgdGhlIGNvbmRpdGlvblxuICAgICAgICAvLyBzdGFydHMgd2l0aCBhIG5lZ2F0aW9uIG9wZXJhdG9yXG4gICAgICAgIHZhciBmb3JpbmlmY2hlY2sgPSBudWxsO1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmZvcmluICYmIHN0YXRlLmZvcmluaWZjaGVja25lZWRlZCkge1xuICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrbmVlZGVkID0gZmFsc2U7IC8vIFdlIG9ubHkgbmVlZCB0byBhbmFseXplIHRoZSBmaXJzdCBpZiBpbnNpZGUgdGhlIGxvb3BcbiAgICAgICAgICAgIGZvcmluaWZjaGVjayA9IHN0YXRlLmZvcmluaWZjaGVja3Nbc3RhdGUuZm9yaW5pZmNoZWNrcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGlmIChleHByLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgZXhwci52YWx1ZSA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKG5lZ2F0aXZlKVwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKHBvc2l0aXZlKVwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgIHN0YXRlLmNvbmRpdGlvbiA9IGZhbHNlO1xuICAgICAgICB2YXIgcyA9IGJsb2NrKHRydWUsIHRydWUpO1xuXG4gICAgICAgIC8vIFdoZW4gdGhlIGlmIGlzIHdpdGhpbiBhIGZvci1pbiBsb29wIGFuZCB0aGUgY29uZGl0aW9uIGhhcyBhIG5lZ2F0aXZlIGZvcm0sXG4gICAgICAgIC8vIGNoZWNrIGlmIHRoZSBib2R5IGNvbnRhaW5zIG5vdGhpbmcgYnV0IGEgY29udGludWUgc3RhdGVtZW50XG4gICAgICAgIGlmIChmb3JpbmlmY2hlY2sgJiYgZm9yaW5pZmNoZWNrLnR5cGUgPT09IFwiKG5lZ2F0aXZlKVwiKSB7XG4gICAgICAgICAgICBpZiAocyAmJiBzWzBdICYmIHNbMF0udHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIiAmJiBzWzBdLnZhbHVlID09PSBcImNvbnRpbnVlXCIpIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKG5lZ2F0aXZlLXdpdGgtY29udGludWUpXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiZWxzZVwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZWxzZVwiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJpZlwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcInN3aXRjaFwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgYmxvY2tzdG10KFwidHJ5XCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYjtcblxuICAgICAgICBmdW5jdGlvbiBkb0NhdGNoKCkge1xuICAgICAgICAgICAgYWR2YW5jZShcImNhdGNoXCIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjayhcImNhdGNocGFyYW1zXCIpO1xuXG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhzdGF0ZS50b2tlbnMubmV4dCwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRva2VucyA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKCk7XG4gICAgICAgICAgICAgICAgXy5lYWNoKHRva2VucywgZnVuY3Rpb24odG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkUGFyYW0odG9rZW4uaWQsIHRva2VuLCBcImV4Y2VwdGlvblwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlICE9PSBcIihpZGVudGlmaWVyKVwiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMzBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gb25seSBhZHZhbmNlIGlmIHdlIGhhdmUgYW4gaWRlbnRpZmllciBzbyB3ZSBjYW4gY29udGludWUgcGFyc2luZyBpbiB0aGUgbW9zdCBjb21tb24gZXJyb3IgLSB0aGF0IG5vIHBhcmFtIGlzIGdpdmVuLlxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRQYXJhbShpZGVudGlmaWVyKCksIHN0YXRlLnRva2Vucy5jdXJyLCBcImV4Y2VwdGlvblwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImlmXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMThcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiY2F0Y2ggZmlsdGVyXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiaWZcIik7XG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbigwKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYWR2YW5jZShcIilcIik7XG5cbiAgICAgICAgICAgIGJsb2NrKGZhbHNlKTtcblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnVuc3RhY2soKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJsb2NrKHRydWUpO1xuXG4gICAgICAgIHdoaWxlIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJjYXRjaFwiKSB7XG4gICAgICAgICAgICBpbmNyZWFzZUNvbXBsZXhpdHlDb3VudCgpO1xuICAgICAgICAgICAgaWYgKGIgJiYgKCFzdGF0ZS5pbk1veigpKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIm11bHRpcGxlIGNhdGNoIGJsb2Nrc1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRvQ2F0Y2goKTtcbiAgICAgICAgICAgIGIgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImZpbmFsbHlcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcImZpbmFsbHlcIik7XG4gICAgICAgICAgICBibG9jayh0cnVlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghYikge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDIxXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImNhdGNoXCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgYmxvY2tzdG10KFwid2hpbGVcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSArPSAxO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSArPSAxO1xuICAgICAgICBpbmNyZWFzZUNvbXBsZXhpdHlDb3VudCgpO1xuICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgY2hlY2tDb25kQXNzaWdubWVudChleHByZXNzaW9uKDApKTtcbiAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gLT0gMTtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIobG9vcGFnZSlcIl0gLT0gMTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkubGFiZWxsZWQgPSB0cnVlO1xuXG4gICAgYmxvY2tzdG10KFwid2l0aFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgaWYgKHN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTAxMFwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLm9wdGlvbi53aXRoc3RtdCkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwODVcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIGV4cHJlc3Npb24oMCk7XG4gICAgICAgIGFkdmFuY2UoXCIpXCIsIHQpO1xuICAgICAgICBibG9jayh0cnVlLCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIGJsb2Nrc3RtdChcInN3aXRjaFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgdmFyIGcgPSBmYWxzZTtcbiAgICAgICAgdmFyIG5vaW5kZW50ID0gZmFsc2U7XG5cbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdICs9IDE7XG4gICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuICAgICAgICBjaGVja0NvbmRBc3NpZ25tZW50KGV4cHJlc3Npb24oMCkpO1xuICAgICAgICBhZHZhbmNlKFwiKVwiLCB0KTtcbiAgICAgICAgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICBhZHZhbmNlKFwie1wiKTtcblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuZnJvbSA9PT0gaW5kZW50KVxuICAgICAgICAgICAgbm9pbmRlbnQgPSB0cnVlO1xuXG4gICAgICAgIGlmICghbm9pbmRlbnQpXG4gICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcblxuICAgICAgICB0aGlzLmNhc2VzID0gW107XG5cbiAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLm5leHQuaWQpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2FzZVwiOlxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwieWllbGRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJicmVha1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImNhc2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjb250aW51ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInJldHVyblwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInN3aXRjaFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRocm93XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFlvdSBjYW4gdGVsbCBKU0hpbnQgdGhhdCB5b3UgZG9uJ3QgdXNlIGJyZWFrIGludGVudGlvbmFsbHkgYnlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBhZGRpbmcgYSBjb21tZW50IC8qIGZhbGxzIHRocm91Z2ggKi8gb24gYSBsaW5lIGp1c3QgYmVmb3JlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlIG5leHQgYGNhc2VgLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLmN1cnIuY2FzZUZhbGxzVGhyb3VnaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA4NlwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJjYXNlXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJjYXNlXCIpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhc2VzLnB1c2goZXhwcmVzc2lvbigwKSk7XG4gICAgICAgICAgICAgICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIodmVyYilcIl0gPSBcImNhc2VcIjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcImRlZmF1bHRcIjpcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChzdGF0ZS5mdW5jdFtcIih2ZXJiKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInlpZWxkXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYnJlYWtcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjb250aW51ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInJldHVyblwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRocm93XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIERvIG5vdCBkaXNwbGF5IGEgd2FybmluZyBpZiAnZGVmYXVsdCcgaXMgdGhlIGZpcnN0IHN0YXRlbWVudCBvciBpZlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZXJlIGlzIGEgc3BlY2lhbCAvKiBmYWxscyB0aHJvdWdoICovIGNvbW1lbnQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuY2FzZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLmN1cnIuY2FzZUZhbGxzVGhyb3VnaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODZcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZGVmYXVsdFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJkZWZhdWx0XCIpO1xuICAgICAgICAgICAgICAgICAgICBnID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJ9XCI6XG4gICAgICAgICAgICAgICAgICAgIGlmICghbm9pbmRlbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmRlbnQgLT0gc3RhdGUub3B0aW9uLmluZGVudDtcblxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwifVwiLCB0KTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgY2FzZSBcIihlbmQpXCI6XG4gICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyM1wiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgaW5kZW50ICs9IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICAgICAgICAgIGlmIChnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLnRva2Vucy5jdXJyLmlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIixcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDQwXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjpcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMuY3Vyci5pZCA9PT0gXCI6XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjRcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyMVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJjYXNlXCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkubGFiZWxsZWQgPSB0cnVlO1xuXG4gICAgc3RtdChcImRlYnVnZ2VyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5kZWJ1Zykge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwODdcIiwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkuZXhwcyA9IHRydWU7XG5cbiAgICAoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB4ID0gc3RtdChcImRvXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdICs9IDE7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSArPSAxO1xuICAgICAgICAgICAgaW5jcmVhc2VDb21wbGV4aXR5Q291bnQoKTtcblxuICAgICAgICAgICAgdGhpcy5maXJzdCA9IGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICAgICAgYWR2YW5jZShcIndoaWxlXCIpO1xuICAgICAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuICAgICAgICAgICAgY2hlY2tDb25kQXNzaWdubWVudChleHByZXNzaW9uKDApKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIsIHQpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdIC09IDE7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSAtPSAxO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0pO1xuICAgICAgICB4LmxhYmVsbGVkID0gdHJ1ZTtcbiAgICAgICAgeC5leHBzID0gdHJ1ZTtcbiAgICB9ICgpKTtcblxuICAgIGJsb2Nrc3RtdChcImZvclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHMsIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgdmFyIGxldHNjb3BlID0gZmFsc2U7XG4gICAgICAgIHZhciBmb3JlYWNodG9rID0gbnVsbDtcblxuICAgICAgICBpZiAodC52YWx1ZSA9PT0gXCJlYWNoXCIpIHtcbiAgICAgICAgICAgIGZvcmVhY2h0b2sgPSB0O1xuICAgICAgICAgICAgYWR2YW5jZShcImVhY2hcIik7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluTW96KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJmb3IgZWFjaFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuXG4gICAgICAgIC8vIHdoYXQga2luZCBvZiBmb3Io4oCmKSBzdGF0ZW1lbnQgaXQgaXM/IGZvcijigKZvZuKApik/IGZvcijigKZpbuKApik/IGZvcijigKY74oCmO+KApik/XG4gICAgICAgIHZhciBuZXh0b3A7IC8vIGNvbnRhaW5zIHRoZSB0b2tlbiBvZiB0aGUgXCJpblwiIG9yIFwib2ZcIiBvcGVyYXRvclxuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIHZhciBpbm9mID0gW1wiaW5cIiwgXCJvZlwiXTtcbiAgICAgICAgdmFyIGxldmVsID0gMDsgLy8gQmluZGluZ1BhdHRlcm4gXCJsZXZlbFwiIC0tLSBsZXZlbCAwID09PSBubyBCaW5kaW5nUGF0dGVyblxuICAgICAgICB2YXIgY29tbWE7IC8vIEZpcnN0IGNvbW1hIHB1bmN0dWF0b3IgYXQgbGV2ZWwgMFxuICAgICAgICB2YXIgaW5pdGlhbGl6ZXI7IC8vIEZpcnN0IGluaXRpYWxpemVyIGF0IGxldmVsIDBcblxuICAgICAgICAvLyBJZiBpbml0aWFsIHRva2VuIGlzIGEgQmluZGluZ1BhdHRlcm4sIGNvdW50IGl0IGFzIHN1Y2guXG4gICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3JzKHN0YXRlLnRva2Vucy5uZXh0LCBbXCJ7XCIsIFwiW1wiXSkpKytsZXZlbDtcbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgbmV4dG9wID0gcGVlayhpKTtcbiAgICAgICAgICAgICsraTtcbiAgICAgICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3JzKG5leHRvcCwgW1wie1wiLCBcIltcIl0pKSsrbGV2ZWw7XG4gICAgICAgICAgICBlbHNlIGlmIChjaGVja1B1bmN0dWF0b3JzKG5leHRvcCwgW1wifVwiLCBcIl1cIl0pKS0tbGV2ZWw7XG4gICAgICAgICAgICBpZiAobGV2ZWwgPCAwKSBicmVhaztcbiAgICAgICAgICAgIGlmIChsZXZlbCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGlmICghY29tbWEgJiYgY2hlY2tQdW5jdHVhdG9yKG5leHRvcCwgXCIsXCIpKSBjb21tYSA9IG5leHRvcDtcbiAgICAgICAgICAgICAgICBlbHNlIGlmICghaW5pdGlhbGl6ZXIgJiYgY2hlY2tQdW5jdHVhdG9yKG5leHRvcCwgXCI9XCIpKSBpbml0aWFsaXplciA9IG5leHRvcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAobGV2ZWwgPiAwIHx8ICFfLmNvbnRhaW5zKGlub2YsIG5leHRvcC52YWx1ZSkgJiYgbmV4dG9wLnZhbHVlICE9PSBcIjtcIiAmJlxuICAgICAgICBuZXh0b3AudHlwZSAhPT0gXCIoZW5kKVwiKTsgLy8gSXMgdGhpcyBhIEpTQ1MgYnVnPyBUaGlzIGxvb2tzIHJlYWxseSB3ZWlyZC5cblxuICAgICAgICAvLyBpZiB3ZSdyZSBpbiBhIGZvciAo4oCmIGlufG9mIOKApikgc3RhdGVtZW50XG4gICAgICAgIGlmIChfLmNvbnRhaW5zKGlub2YsIG5leHRvcC52YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSAmJiBuZXh0b3AudmFsdWUgPT09IFwib2ZcIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIG5leHRvcCwgXCJmb3Igb2ZcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgb2sgPSAhKGluaXRpYWxpemVyIHx8IGNvbW1hKTtcbiAgICAgICAgICAgIGlmIChpbml0aWFsaXplcikge1xuICAgICAgICAgICAgICAgIGVycm9yKFwiVzEzM1wiLCBjb21tYSwgbmV4dG9wLnZhbHVlLCBcImluaXRpYWxpemVyIGlzIGZvcmJpZGRlblwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvbW1hKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJXMTMzXCIsIGNvbW1hLCBuZXh0b3AudmFsdWUsIFwibW9yZSB0aGFuIG9uZSBGb3JCaW5kaW5nXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwidmFyXCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwidmFyXCIpO1xuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmZ1ZCh7IHByZWZpeDogdHJ1ZSB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwibGV0XCIgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiY29uc3RcIikge1xuICAgICAgICAgICAgICAgIGFkdmFuY2Uoc3RhdGUudG9rZW5zLm5leHQuaWQpO1xuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBibG9jayBzY29wZVxuICAgICAgICAgICAgICAgIGxldHNjb3BlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5mdWQoeyBwcmVmaXg6IHRydWUgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFBhcnNlIGFzIGEgdmFyIHN0YXRlbWVudCwgd2l0aCBpbXBsaWVkIGJpbmRpbmdzLiBJZ25vcmUgZXJyb3JzIGlmIGFuIGVycm9yXG4gICAgICAgICAgICAgICAgLy8gd2FzIGFscmVhZHkgcmVwb3J0ZWRcbiAgICAgICAgICAgICAgICBPYmplY3QuY3JlYXRlKHZhcnN0YXRlbWVudCkuZnVkKHsgcHJlZml4OiB0cnVlLCBpbXBsaWVkOiBcImZvclwiLCBpZ25vcmU6ICFvayB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2UobmV4dG9wLnZhbHVlKTtcbiAgICAgICAgICAgIGV4cHJlc3Npb24oMjApO1xuICAgICAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG5cbiAgICAgICAgICAgIGlmIChuZXh0b3AudmFsdWUgPT09IFwiaW5cIiAmJiBzdGF0ZS5vcHRpb24uZm9yaW4pIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mb3JpbmlmY2hlY2tuZWVkZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmZvcmluaWZjaGVja3MgPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mb3JpbmlmY2hlY2tzID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUHVzaCBhIG5ldyBmb3ItaW4taWYgY2hlY2sgb250byB0aGUgc3RhY2suIFRoZSB0eXBlIHdpbGwgYmUgbW9kaWZpZWRcbiAgICAgICAgICAgICAgICAvLyB3aGVuIHRoZSBsb29wJ3MgYm9keSBpcyBwYXJzZWQgYW5kIGEgc3VpdGFibGUgaWYgc3RhdGVtZW50IGV4aXN0cy5cbiAgICAgICAgICAgICAgICBzdGF0ZS5mb3JpbmlmY2hlY2tzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIihub25lKVwiXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSArPSAxO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobG9vcGFnZSlcIl0gKz0gMTtcblxuICAgICAgICAgICAgcyA9IGJsb2NrKHRydWUsIHRydWUpO1xuXG4gICAgICAgICAgICBpZiAobmV4dG9wLnZhbHVlID09PSBcImluXCIgJiYgc3RhdGUub3B0aW9uLmZvcmluKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLmZvcmluaWZjaGVja3MgJiYgc3RhdGUuZm9yaW5pZmNoZWNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjaGVjayA9IHN0YXRlLmZvcmluaWZjaGVja3MucG9wKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKC8vIE5vIGlmIHN0YXRlbWVudCBvciBub3QgdGhlIGZpcnN0IHN0YXRlbWVudCBpbiBsb29wIGJvZHlcbiAgICAgICAgICAgICAgICAgICAgICAgIHMgJiYgcy5sZW5ndGggPiAwICYmICh0eXBlb2Ygc1swXSAhPT0gXCJvYmplY3RcIiB8fCBzWzBdLnZhbHVlICE9PSBcImlmXCIpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQb3NpdGl2ZSBpZiBzdGF0ZW1lbnQgaXMgbm90IHRoZSBvbmx5IG9uZSBpbiBsb29wIGJvZHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrLnR5cGUgPT09IFwiKHBvc2l0aXZlKVwiICYmIHMubGVuZ3RoID4gMSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmVnYXRpdmUgaWYgc3RhdGVtZW50IGJ1dCBubyBjb250aW51ZVxuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2sudHlwZSA9PT0gXCIobmVnYXRpdmUpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDg5XCIsIHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUmVzZXQgdGhlIGZsYWcgaW4gY2FzZSBubyBpZiBzdGF0ZW1lbnQgd2FzIGNvbnRhaW5lZCBpbiB0aGUgbG9vcCBib2R5XG4gICAgICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrbmVlZGVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSAtPSAxO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobG9vcGFnZSlcIl0gLT0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChmb3JlYWNodG9rKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDQ1XCIsIGZvcmVhY2h0b2spO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIikge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ2YXJcIikge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwidmFyXCIpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5mdWQoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImxldFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJsZXRcIik7XG4gICAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBibG9jayBzY29wZVxuICAgICAgICAgICAgICAgICAgICBsZXRzY29wZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjaygpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5mdWQoKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbigwLCBcImZvclwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBub2xpbmVicmVhayhzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICBhZHZhbmNlKFwiO1wiKTtcblxuICAgICAgICAgICAgLy8gc3RhcnQgbG9vcGFnZSBhZnRlciB0aGUgZmlyc3QgOyBhcyB0aGUgbmV4dCB0d28gZXhwcmVzc2lvbnMgYXJlIGV4ZWN1dGVkXG4gICAgICAgICAgICAvLyBvbiBldmVyeSBsb29wXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSArPSAxO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIikge1xuICAgICAgICAgICAgICAgIGNoZWNrQ29uZEFzc2lnbm1lbnQoZXhwcmVzc2lvbigwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBub2xpbmVicmVhayhzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICBhZHZhbmNlKFwiO1wiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjFcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiKVwiLCBcIjtcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbigwLCBcImZvclwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29tbWEoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiLCB0KTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSArPSAxO1xuICAgICAgICAgICAgYmxvY2sodHJ1ZSwgdHJ1ZSk7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gLT0gMTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdIC09IDE7XG5cbiAgICAgICAgfVxuICAgICAgICAvLyB1bnN0YWNrIGxvb3AgYmxvY2tzY29wZVxuICAgICAgICBpZiAobGV0c2NvcGUpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkubGFiZWxsZWQgPSB0cnVlO1xuXG5cbiAgICBzdG10KFwiYnJlYWtcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciB2ID0gc3RhdGUudG9rZW5zLm5leHQudmFsdWU7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uYXNpKVxuICAgICAgICAgICAgbm9saW5lYnJlYWsodGhpcyk7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIiAmJiAhc3RhdGUudG9rZW5zLm5leHQucmVhY2ggJiZcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmxpbmUgPT09IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCkpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmZ1bmN0Lmhhc0JyZWFrTGFiZWwodikpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5MFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZpcnN0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdID09PSAwKVxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDUyXCIsIHN0YXRlLnRva2Vucy5uZXh0LCB0aGlzLnZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlYWNoYWJsZSh0aGlzKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuXG4gICAgc3RtdChcImNvbnRpbnVlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdiA9IHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlO1xuXG4gICAgICAgIGlmIChzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gPT09IDApXG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA1MlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdGhpcy52YWx1ZSk7XG4gICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIobG9vcGFnZSlcIl0pXG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA1MlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdGhpcy52YWx1ZSk7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uYXNpKVxuICAgICAgICAgICAgbm9saW5lYnJlYWsodGhpcyk7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIiAmJiAhc3RhdGUudG9rZW5zLm5leHQucmVhY2gpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMuY3Vyci5saW5lID09PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uZnVuY3QuaGFzQnJlYWtMYWJlbCh2KSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5MFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuZmlyc3QgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZWFjaGFibGUodGhpcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkuZXhwcyA9IHRydWU7XG5cblxuICAgIHN0bXQoXCJyZXR1cm5cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLmxpbmUgPT09IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCkpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIgJiYgIXN0YXRlLnRva2Vucy5uZXh0LnJlYWNoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJzdCA9IGV4cHJlc3Npb24oMCk7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maXJzdCAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcnN0LnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgdGhpcy5maXJzdC52YWx1ZSA9PT0gXCI9XCIgJiZcbiAgICAgICAgICAgICAgICAgICAgIXRoaXMuZmlyc3QucGFyZW4gJiYgIXN0YXRlLm9wdGlvbi5ib3NzKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdBdChcIlcwOTNcIiwgdGhpcy5maXJzdC5saW5lLCB0aGlzLmZpcnN0LmNoYXJhY3Rlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiZcbiAgICAgICAgICAgICAgICBbXCJbXCIsIFwie1wiLCBcIitcIiwgXCItXCJdLmluZGV4T2Yoc3RhdGUudG9rZW5zLm5leHQudmFsdWUpID4gLTEpIHtcbiAgICAgICAgICAgICAgICBub2xpbmVicmVhayh0aGlzKTsgLy8gYWx3YXlzIHdhcm4gKExpbmUgYnJlYWtpbmcgZXJyb3IpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZWFjaGFibGUodGhpcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkuZXhwcyA9IHRydWU7XG5cbiAgICAoZnVuY3Rpb24oeCkge1xuICAgICAgICB4LmV4cHMgPSB0cnVlO1xuICAgICAgICB4LmxicCA9IDI1O1xuICAgIH0gKHByZWZpeChcInlpZWxkXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcHJldiA9IHN0YXRlLnRva2Vucy5wcmV2O1xuICAgICAgICBpZiAoc3RhdGUuaW5FUzYodHJ1ZSkgJiYgIXN0YXRlLmZ1bmN0W1wiKGdlbmVyYXRvcilcIl0pIHtcbiAgICAgICAgICAgIC8vIElmIGl0J3MgYSB5aWVsZCB3aXRoaW4gYSBjYXRjaCBjbGF1c2UgaW5zaWRlIGEgZ2VuZXJhdG9yIHRoZW4gdGhhdCdzIG9rXG4gICAgICAgICAgICBpZiAoIShcIihjYXRjaClcIiA9PT0gc3RhdGUuZnVuY3RbXCIobmFtZSlcIl0gJiYgc3RhdGUuZnVuY3RbXCIoY29udGV4dClcIl1bXCIoZ2VuZXJhdG9yKVwiXSkpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDZcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwieWllbGRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcInlpZWxkXCIsIFwiNlwiKTtcbiAgICAgICAgfVxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihnZW5lcmF0b3IpXCJdID0gXCJ5aWVsZGVkXCI7XG4gICAgICAgIHZhciBkZWxlZ2F0aW5nWWllbGQgPSBmYWxzZTtcblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKlwiKSB7XG4gICAgICAgICAgICBkZWxlZ2F0aW5nWWllbGQgPSB0cnVlO1xuICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5saW5lID09PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpIHx8ICFzdGF0ZS5pbk1veigpKSB7XG4gICAgICAgICAgICBpZiAoZGVsZWdhdGluZ1lpZWxkIHx8XG4gICAgICAgICAgICAgICAgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIjtcIiAmJiAhc3RhdGUub3B0aW9uLmFzaSAmJlxuICAgICAgICAgICAgICAgICAgICAhc3RhdGUudG9rZW5zLm5leHQucmVhY2ggJiYgc3RhdGUudG9rZW5zLm5leHQubnVkKSkge1xuXG4gICAgICAgICAgICAgICAgbm9icmVha25vbmFkamFjZW50KHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgICAgICAgICAgdGhpcy5maXJzdCA9IGV4cHJlc3Npb24oMTApO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlyc3QudHlwZSA9PT0gXCIocHVuY3R1YXRvcilcIiAmJiB0aGlzLmZpcnN0LnZhbHVlID09PSBcIj1cIiAmJlxuICAgICAgICAgICAgICAgICAgICAhdGhpcy5maXJzdC5wYXJlbiAmJiAhc3RhdGUub3B0aW9uLmJvc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ0F0KFwiVzA5M1wiLCB0aGlzLmZpcnN0LmxpbmUsIHRoaXMuZmlyc3QuY2hhcmFjdGVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS5pbk1veigpICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIilcIiAmJlxuICAgICAgICAgICAgICAgIChwcmV2LmxicCA+IDMwIHx8ICghcHJldi5hc3NpZ24gJiYgIWlzRW5kT2ZFeHByKCkpIHx8IHByZXYuaWQgPT09IFwieWllbGRcIikpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNTBcIiwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLm9wdGlvbi5hc2kpIHtcbiAgICAgICAgICAgIG5vbGluZWJyZWFrKHRoaXMpOyAvLyBhbHdheXMgd2FybiAoTGluZSBicmVha2luZyBlcnJvcilcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KSkpO1xuXG5cbiAgICBzdG10KFwidGhyb3dcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIG5vbGluZWJyZWFrKHRoaXMpO1xuICAgICAgICB0aGlzLmZpcnN0ID0gZXhwcmVzc2lvbigyMCk7XG5cbiAgICAgICAgcmVhY2hhYmxlKHRoaXMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG4gICAgc3RtdChcImltcG9ydFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJpbXBvcnRcIiwgXCI2XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHN0cmluZylcIikge1xuICAgICAgICAgICAgLy8gTW9kdWxlU3BlY2lmaWVyIDo6IFN0cmluZ0xpdGVyYWxcbiAgICAgICAgICAgIGFkdmFuY2UoXCIoc3RyaW5nKVwiKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIC8vIEltcG9ydENsYXVzZSA6OiBJbXBvcnRlZERlZmF1bHRCaW5kaW5nXG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICAvLyBJbXBvcnQgYmluZGluZ3MgYXJlIGltbXV0YWJsZSAoc2VlIEVTNiA4LjEuMS41LjUpXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkbGFiZWwodGhpcy5uYW1lLCB7XG4gICAgICAgICAgICAgICAgdHlwZTogXCJjb25zdFwiLFxuICAgICAgICAgICAgICAgIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyclxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBJbXBvcnRDbGF1c2UgOjogSW1wb3J0ZWREZWZhdWx0QmluZGluZyAsIE5hbWVTcGFjZUltcG9ydFxuICAgICAgICAgICAgICAgIC8vIEltcG9ydENsYXVzZSA6OiBJbXBvcnRlZERlZmF1bHRCaW5kaW5nICwgTmFtZWRJbXBvcnRzXG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIixcIik7XG4gICAgICAgICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCwgd2UgaW50ZW50aW9uYWxseSBmYWxsIHRocm91Z2ggdG8gY29udGludWUgbWF0Y2hpbmdcbiAgICAgICAgICAgICAgICAvLyBlaXRoZXIgTmFtZVNwYWNlSW1wb3J0IG9yIE5hbWVkSW1wb3J0cy5cbiAgICAgICAgICAgICAgICAvLyBEaXNjdXNzaW9uOlxuICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9qc2hpbnQvanNoaW50L3B1bGwvMjE0NCNkaXNjdXNzaW9uX3IyMzk3ODQwNlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiZnJvbVwiKTtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKHN0cmluZylcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKlwiKSB7XG4gICAgICAgICAgICAvLyBJbXBvcnRDbGF1c2UgOjogTmFtZVNwYWNlSW1wb3J0XG4gICAgICAgICAgICBhZHZhbmNlKFwiKlwiKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJhc1wiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uYW1lID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgICAgIC8vIEltcG9ydCBiaW5kaW5ncyBhcmUgaW1tdXRhYmxlIChzZWUgRVM2IDguMS4xLjUuNSlcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkbGFiZWwodGhpcy5uYW1lLCB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiY29uc3RcIixcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBJbXBvcnRDbGF1c2UgOjogTmFtZWRJbXBvcnRzXG4gICAgICAgICAgICBhZHZhbmNlKFwie1wiKTtcbiAgICAgICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIn1cIikge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwifVwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBpbXBvcnROYW1lO1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcImRlZmF1bHRcIikge1xuICAgICAgICAgICAgICAgICAgICBpbXBvcnROYW1lID0gXCJkZWZhdWx0XCI7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJkZWZhdWx0XCIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGltcG9ydE5hbWUgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJhc1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJhc1wiKTtcbiAgICAgICAgICAgICAgICAgICAgaW1wb3J0TmFtZSA9IGlkZW50aWZpZXIoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJbXBvcnQgYmluZGluZ3MgYXJlIGltbXV0YWJsZSAoc2VlIEVTNiA4LjEuMS41LjUpXG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKGltcG9ydE5hbWUsIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJjb25zdFwiLFxuICAgICAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnJcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIixcIik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGcm9tQ2xhdXNlXG4gICAgICAgIGFkdmFuY2UoXCJmcm9tXCIpO1xuICAgICAgICBhZHZhbmNlKFwiKHN0cmluZylcIik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG4gICAgc3RtdChcImV4cG9ydFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG9rID0gdHJ1ZTtcbiAgICAgICAgdmFyIHRva2VuO1xuICAgICAgICB2YXIgaWRlbnRpZmllcjtcblxuICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE5XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImV4cG9ydFwiLCBcIjZcIik7XG4gICAgICAgICAgICBvayA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2suaXNHbG9iYWwoKSkge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDUzXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIG9rID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKlwiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OiBleHBvcnQgKiBGcm9tQ2xhdXNlXG4gICAgICAgICAgICBhZHZhbmNlKFwiKlwiKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJmcm9tXCIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIihzdHJpbmcpXCIpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudHlwZSA9PT0gXCJkZWZhdWx0XCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6XG4gICAgICAgICAgICAvLyAgICAgIGV4cG9ydCBkZWZhdWx0IFtsb29rYWhlYWQg74OPIHsgZnVuY3Rpb24sIGNsYXNzIH1dIEFzc2lnbm1lbnRFeHByZXNzaW9uW0luXSA7XG4gICAgICAgICAgICAvLyAgICAgIGV4cG9ydCBkZWZhdWx0IEhvaXN0YWJsZURlY2xhcmF0aW9uXG4gICAgICAgICAgICAvLyAgICAgIGV4cG9ydCBkZWZhdWx0IENsYXNzRGVjbGFyYXRpb25cbiAgICAgICAgICAgIHN0YXRlLm5hbWVTdGFjay5zZXQoc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgYWR2YW5jZShcImRlZmF1bHRcIik7XG4gICAgICAgICAgICB2YXIgZXhwb3J0VHlwZSA9IHN0YXRlLnRva2Vucy5uZXh0LmlkO1xuICAgICAgICAgICAgaWYgKGV4cG9ydFR5cGUgPT09IFwiZnVuY3Rpb25cIiB8fCBleHBvcnRUeXBlID09PSBcImNsYXNzXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmJsb2NrID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdG9rZW4gPSBwZWVrKCk7XG5cbiAgICAgICAgICAgIGV4cHJlc3Npb24oMTApO1xuXG4gICAgICAgICAgICBpZGVudGlmaWVyID0gdG9rZW4udmFsdWU7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmJsb2NrKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKGlkZW50aWZpZXIsIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogZXhwb3J0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IHRva2VuXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc2V0RXhwb3J0ZWQoaWRlbnRpZmllciwgdG9rZW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJ7XCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBFeHBvcnRDbGF1c2VcbiAgICAgICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuICAgICAgICAgICAgdmFyIGV4cG9ydGVkVG9rZW5zID0gW107XG4gICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuXG4gICAgICAgICAgICAgICAgZXhwb3J0ZWRUb2tlbnMucHVzaChzdGF0ZS50b2tlbnMuY3Vycik7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiYXNcIikge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiYXNcIik7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDMwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIixcIik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiZnJvbVwiKSB7XG4gICAgICAgICAgICAgICAgLy8gRXhwb3J0RGVjbGFyYXRpb24gOjogZXhwb3J0IEV4cG9ydENsYXVzZSBGcm9tQ2xhdXNlXG4gICAgICAgICAgICAgICAgYWR2YW5jZShcImZyb21cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIihzdHJpbmcpXCIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChvaykge1xuICAgICAgICAgICAgICAgIGV4cG9ydGVkVG9rZW5zLmZvckVhY2goZnVuY3Rpb24odG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnNldEV4cG9ydGVkKHRva2VuLnZhbHVlLCB0b2tlbik7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ2YXJcIikge1xuICAgICAgICAgICAgLy8gRXhwb3J0RGVjbGFyYXRpb24gOjogZXhwb3J0IFZhcmlhYmxlU3RhdGVtZW50XG4gICAgICAgICAgICBhZHZhbmNlKFwidmFyXCIpO1xuICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuZnVkKHsgaW5leHBvcnQ6IHRydWUgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwibGV0XCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBWYXJpYWJsZVN0YXRlbWVudFxuICAgICAgICAgICAgYWR2YW5jZShcImxldFwiKTtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmZ1ZCh7IGluZXhwb3J0OiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImNvbnN0XCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBWYXJpYWJsZVN0YXRlbWVudFxuICAgICAgICAgICAgYWR2YW5jZShcImNvbnN0XCIpO1xuICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuZnVkKHsgaW5leHBvcnQ6IHRydWUgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgLy8gRXhwb3J0RGVjbGFyYXRpb24gOjogZXhwb3J0IERlY2xhcmF0aW9uXG4gICAgICAgICAgICB0aGlzLmJsb2NrID0gdHJ1ZTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJmdW5jdGlvblwiKTtcbiAgICAgICAgICAgIHN0YXRlLnN5bnRheFtcImZ1bmN0aW9uXCJdLmZ1ZCh7IGluZXhwb3J0OiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImNsYXNzXCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBEZWNsYXJhdGlvblxuICAgICAgICAgICAgdGhpcy5ibG9jayA9IHRydWU7XG4gICAgICAgICAgICBhZHZhbmNlKFwiY2xhc3NcIik7XG4gICAgICAgICAgICB2YXIgY2xhc3NOYW1lVG9rZW4gPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgIHN0YXRlLnN5bnRheFtcImNsYXNzXCJdLmZ1ZCgpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnNldEV4cG9ydGVkKGNsYXNzTmFtZVRva2VuLnZhbHVlLCBjbGFzc05hbWVUb2tlbik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMjRcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG4gICAgLy8gRnV0dXJlIFJlc2VydmVkIFdvcmRzXG5cbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJhYnN0cmFjdFwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJib29sZWFuXCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImJ5dGVcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiY2hhclwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJjbGFzc1wiLCB7IGVzNTogdHJ1ZSwgbnVkOiBjbGFzc2RlZiB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJkb3VibGVcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZW51bVwiLCB7IGVzNTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJleHBvcnRcIiwgeyBlczU6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZXh0ZW5kc1wiLCB7IGVzNTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJmaW5hbFwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJmbG9hdFwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJnb3RvXCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImltcGxlbWVudHNcIiwgeyBlczU6IHRydWUsIHN0cmljdE9ubHk6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiaW1wb3J0XCIsIHsgZXM1OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImludFwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJpbnRlcmZhY2VcIiwgeyBlczU6IHRydWUsIHN0cmljdE9ubHk6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwibG9uZ1wiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJuYXRpdmVcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwicGFja2FnZVwiLCB7IGVzNTogdHJ1ZSwgc3RyaWN0T25seTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJwcml2YXRlXCIsIHsgZXM1OiB0cnVlLCBzdHJpY3RPbmx5OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInByb3RlY3RlZFwiLCB7IGVzNTogdHJ1ZSwgc3RyaWN0T25seTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJwdWJsaWNcIiwgeyBlczU6IHRydWUsIHN0cmljdE9ubHk6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwic2hvcnRcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwic3RhdGljXCIsIHsgZXM1OiB0cnVlLCBzdHJpY3RPbmx5OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInN1cGVyXCIsIHsgZXM1OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInN5bmNocm9uaXplZFwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJ0cmFuc2llbnRcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwidm9sYXRpbGVcIik7XG5cbiAgICAvLyB0aGlzIGZ1bmN0aW9uIGlzIHVzZWQgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBzcXVhcmVicmFja2V0IG9yIGEgY3VybHlicmFja2V0XG4gICAgLy8gZXhwcmVzc2lvbiBpcyBhIGNvbXByZWhlbnNpb24gYXJyYXksIGRlc3RydWN0dXJpbmcgYXNzaWdubWVudCBvciBhIGpzb24gdmFsdWUuXG5cbiAgICB2YXIgbG9va3VwQmxvY2tUeXBlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwbiwgcG4xLCBwcmV2O1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB2YXIgYnJhY2tldFN0YWNrID0gMDtcbiAgICAgICAgdmFyIHJldDogYW55ID0ge307XG4gICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3JzKHN0YXRlLnRva2Vucy5jdXJyLCBbXCJbXCIsIFwie1wiXSkpIHtcbiAgICAgICAgICAgIGJyYWNrZXRTdGFjayArPSAxO1xuICAgICAgICB9XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIHByZXYgPSBpID09PSAtMSA/IHN0YXRlLnRva2Vucy5jdXJyIDogcG47XG4gICAgICAgICAgICBwbiA9IGkgPT09IC0xID8gc3RhdGUudG9rZW5zLm5leHQgOiBwZWVrKGkpO1xuICAgICAgICAgICAgcG4xID0gcGVlayhpICsgMSk7XG4gICAgICAgICAgICBpID0gaSArIDE7XG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhwbiwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICAgICAgYnJhY2tldFN0YWNrICs9IDE7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoZWNrUHVuY3R1YXRvcnMocG4sIFtcIl1cIiwgXCJ9XCJdKSkge1xuICAgICAgICAgICAgICAgIGJyYWNrZXRTdGFjayAtPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGJyYWNrZXRTdGFjayA9PT0gMSAmJiBwbi5pZGVudGlmaWVyICYmIHBuLnZhbHVlID09PSBcImZvclwiICYmXG4gICAgICAgICAgICAgICAgIWNoZWNrUHVuY3R1YXRvcihwcmV2LCBcIi5cIikpIHtcbiAgICAgICAgICAgICAgICByZXQuaXNDb21wQXJyYXkgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldC5ub3RKc29uID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChicmFja2V0U3RhY2sgPT09IDAgJiYgY2hlY2tQdW5jdHVhdG9ycyhwbiwgW1wifVwiLCBcIl1cIl0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHBuMS52YWx1ZSA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0LmlzRGVzdEFzc2lnbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJldC5ub3RKc29uID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwbjEudmFsdWUgPT09IFwiLlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldC5ub3RKc29uID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihwbiwgXCI7XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0LmlzQmxvY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldC5ub3RKc29uID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAoYnJhY2tldFN0YWNrID4gMCAmJiBwbi5pZCAhPT0gXCIoZW5kKVwiKTtcbiAgICAgICAgcmV0dXJuIHJldDtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gc2F2ZVByb3BlcnR5KHByb3BzLCBuYW1lLCB0a24sIGlzQ2xhc3M/LCBpc1N0YXRpYz8pIHtcbiAgICAgICAgdmFyIG1zZ3MgPSBbXCJrZXlcIiwgXCJjbGFzcyBtZXRob2RcIiwgXCJzdGF0aWMgY2xhc3MgbWV0aG9kXCJdO1xuICAgICAgICB2YXIgbXNnID0gbXNnc1soaXNDbGFzcyB8fCBmYWxzZSkgKyAoaXNTdGF0aWMgfHwgZmFsc2UpXTtcbiAgICAgICAgaWYgKHRrbi5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBuYW1lID0gdGtuLnZhbHVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BzW25hbWVdICYmIG5hbWUgIT09IFwiX19wcm90b19fXCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDc1XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBtc2csIG5hbWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvcHNbbmFtZV0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvcHNbbmFtZV0uYmFzaWMgPSB0cnVlO1xuICAgICAgICBwcm9wc1tuYW1lXS5iYXNpY3RrbiA9IHRrbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYWNjZXNzb3JUeXBlIC0gRWl0aGVyIFwiZ2V0XCIgb3IgXCJzZXRcIlxuICAgICAqIEBwYXJhbSB7b2JqZWN0fSBwcm9wcyAtIGEgY29sbGVjdGlvbiBvZiBhbGwgcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0IHRvXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgd2hpY2ggdGhlIGN1cnJlbnQgYWNjZXNzb3IgaXMgYmVpbmcgYXNzaWduZWRcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gdGtuIC0gdGhlIGlkZW50aWZpZXIgdG9rZW4gcmVwcmVzZW50aW5nIHRoZSBhY2Nlc3NvciBuYW1lXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc0NsYXNzIC0gd2hldGhlciB0aGUgYWNjZXNzb3IgaXMgcGFydCBvZiBhbiBFUzYgQ2xhc3NcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZpbml0aW9uXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc1N0YXRpYyAtIHdoZXRoZXIgdGhlIGFjY2Vzc29yIGlzIGEgc3RhdGljIG1ldGhvZFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHNhdmVBY2Nlc3NvcihhY2Nlc3NvclR5cGU6IHN0cmluZywgcHJvcHMsIG5hbWUsIHRrbiwgaXNDbGFzcz86IGJvb2xlYW4sIGlzU3RhdGljPzogYm9vbGVhbikge1xuICAgICAgICB2YXIgZmxhZ05hbWUgPSBhY2Nlc3NvclR5cGUgPT09IFwiZ2V0XCIgPyBcImdldHRlclRva2VuXCIgOiBcInNldHRlclRva2VuXCI7XG4gICAgICAgIHZhciBtc2cgPSBcIlwiO1xuXG4gICAgICAgIGlmIChpc0NsYXNzKSB7XG4gICAgICAgICAgICBpZiAoaXNTdGF0aWMpIHtcbiAgICAgICAgICAgICAgICBtc2cgKz0gXCJzdGF0aWMgXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtc2cgKz0gYWNjZXNzb3JUeXBlICsgXCJ0ZXIgbWV0aG9kXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtc2cgPSBcImtleVwiO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuYWNjZXNzb3JUeXBlID0gYWNjZXNzb3JUeXBlO1xuICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KHRrbik7XG5cbiAgICAgICAgaWYgKHByb3BzW25hbWVdKSB7XG4gICAgICAgICAgICBpZiAoKHByb3BzW25hbWVdLmJhc2ljIHx8IHByb3BzW25hbWVdW2ZsYWdOYW1lXSkgJiYgbmFtZSAhPT0gXCJfX3Byb3RvX19cIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDc1XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBtc2csIG5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvcHNbbmFtZV0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvcHNbbmFtZV1bZmxhZ05hbWVdID0gdGtuO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbXB1dGVkUHJvcGVydHlOYW1lKCkge1xuICAgICAgICBhZHZhbmNlKFwiW1wiKTtcbiAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJjb21wdXRlZCBwcm9wZXJ0eSBuYW1lc1wiLCBcIjZcIik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHZhbHVlID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIGFkdmFuY2UoXCJdXCIpO1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCB3aGV0aGVyIGEgZ2l2ZW4gdG9rZW4gaXMgYSBwdW5jdHVhdG9yIG1hdGNoaW5nIG9uZSBvZiB0aGUgc3BlY2lmaWVkIHZhbHVlc1xuICAgICAqIEBwYXJhbSB7VG9rZW59IHRva2VuXG4gICAgICogQHBhcmFtIHtBcnJheS48c3RyaW5nPn0gdmFsdWVzXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgZnVuY3Rpb24gY2hlY2tQdW5jdHVhdG9ycyh0b2tlbiwgdmFsdWVzKSB7XG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSBcIihwdW5jdHVhdG9yKVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gXy5jb250YWlucyh2YWx1ZXMsIHRva2VuLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCB3aGV0aGVyIGEgZ2l2ZW4gdG9rZW4gaXMgYSBwdW5jdHVhdG9yIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgdmFsdWVcbiAgICAgKiBAcGFyYW0ge1Rva2VufSB0b2tlblxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoZWNrUHVuY3R1YXRvcih0b2tlbiwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRva2VuLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgdG9rZW4udmFsdWUgPT09IHZhbHVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyBmdW5jdGlvbiBoYXMgYmVlbiByZWFjaGVkIGZvciBhIGRlc3RydWN0dXJpbmcgYXNzaWduIHdpdGggdW5kZWNsYXJlZCB2YWx1ZXNcbiAgICBmdW5jdGlvbiBkZXN0cnVjdHVyaW5nQXNzaWduT3JKc29uVmFsdWUoKSB7XG4gICAgICAgIC8vIGxvb2t1cCBmb3IgdGhlIGFzc2lnbm1lbnQgKEVDTUFTY3JpcHQgNiBvbmx5KVxuICAgICAgICAvLyBpZiBpdCBoYXMgc2VtaWNvbG9ucywgaXQgaXMgYSBibG9jaywgc28gZ28gcGFyc2UgaXQgYXMgYSBibG9ja1xuICAgICAgICAvLyBvciBpdCdzIG5vdCBhIGJsb2NrLCBidXQgdGhlcmUgYXJlIGFzc2lnbm1lbnRzLCBjaGVjayBmb3IgdW5kZWNsYXJlZCB2YXJpYWJsZXNcblxuICAgICAgICB2YXIgYmxvY2sgPSBsb29rdXBCbG9ja1R5cGUoKTtcbiAgICAgICAgaWYgKGJsb2NrLm5vdEpzb24pIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSAmJiBibG9jay5pc0Rlc3RBc3NpZ24pIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJkZXN0cnVjdHVyaW5nIGFzc2lnbm1lbnRcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGVtZW50cygpO1xuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIHBhcnNlIGpzb24gdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5sYXhicmVhayA9IHRydWU7XG4gICAgICAgICAgICBzdGF0ZS5qc29uTW9kZSA9IHRydWU7XG4gICAgICAgICAgICBqc29uVmFsdWUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGFycmF5IGNvbXByZWhlbnNpb24gcGFyc2luZyBmdW5jdGlvblxuICAgIC8vIHBhcnNlcyBhbmQgZGVmaW5lcyB0aGUgdGhyZWUgc3RhdGVzIG9mIHRoZSBsaXN0IGNvbXByZWhlbnNpb24gaW4gb3JkZXJcbiAgICAvLyB0byBhdm9pZCBkZWZpbmluZyBnbG9iYWwgdmFyaWFibGVzLCBidXQga2VlcGluZyB0aGVtIHRvIHRoZSBsaXN0IGNvbXByZWhlbnNpb24gc2NvcGVcbiAgICAvLyBvbmx5LiBUaGUgb3JkZXIgb2YgdGhlIHN0YXRlcyBhcmUgYXMgZm9sbG93czpcbiAgICAvLyAgKiBcInVzZVwiIHdoaWNoIHdpbGwgYmUgdGhlIHJldHVybmVkIGl0ZXJhdGl2ZSBwYXJ0IG9mIHRoZSBsaXN0IGNvbXByZWhlbnNpb25cbiAgICAvLyAgKiBcImRlZmluZVwiIHdoaWNoIHdpbGwgZGVmaW5lIHRoZSB2YXJpYWJsZXMgbG9jYWwgdG8gdGhlIGxpc3QgY29tcHJlaGVuc2lvblxuICAgIC8vICAqIFwiZmlsdGVyXCIgd2hpY2ggd2lsbCBoZWxwIGZpbHRlciBvdXQgdmFsdWVzXG5cbiAgICB2YXIgYXJyYXlDb21wcmVoZW5zaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBDb21wQXJyYXkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW9kZSA9IFwidXNlXCI7XG4gICAgICAgICAgICB0aGlzLnZhcmlhYmxlcyA9IFtdO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgX2NhcnJheXMgPSBbXTtcbiAgICAgICAgdmFyIF9jdXJyZW50O1xuICAgICAgICBmdW5jdGlvbiBkZWNsYXJlKHYpIHtcbiAgICAgICAgICAgIHZhciBsID0gX2N1cnJlbnQudmFyaWFibGVzLmZpbHRlcihmdW5jdGlvbihlbHQpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiBpdCBoYXMsIGNoYW5nZSBpdHMgdW5kZWYgc3RhdGVcbiAgICAgICAgICAgICAgICBpZiAoZWx0LnZhbHVlID09PSB2KSB7XG4gICAgICAgICAgICAgICAgICAgIGVsdC51bmRlZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gbCAhPT0gMDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiB1c2Uodikge1xuICAgICAgICAgICAgdmFyIGwgPSBfY3VycmVudC52YXJpYWJsZXMuZmlsdGVyKGZ1bmN0aW9uKGVsdCkge1xuICAgICAgICAgICAgICAgIC8vIGFuZCBpZiBpdCBoYXMgYmVlbiBkZWZpbmVkXG4gICAgICAgICAgICAgICAgaWYgKGVsdC52YWx1ZSA9PT0gdiAmJiAhZWx0LnVuZGVmKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbHQudW51c2VkID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHQudW51c2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkubGVuZ3RoO1xuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIHdlIHdhcm4gYWJvdXQgaXRcbiAgICAgICAgICAgIHJldHVybiAobCA9PT0gMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudCA9IG5ldyBDb21wQXJyYXkoKTtcbiAgICAgICAgICAgICAgICBfY2FycmF5cy5wdXNoKF9jdXJyZW50KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bnN0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudC52YXJpYWJsZXMuZmlsdGVyKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYudW51c2VkKVxuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOThcIiwgdi50b2tlbiwgdi5yYXdfdGV4dCB8fCB2LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYudW5kZWYpXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2sudXNlKHYudmFsdWUsIHYudG9rZW4pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIF9jYXJyYXlzLnNwbGljZSgtMSwgMSk7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnQgPSBfY2FycmF5c1tfY2FycmF5cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXRTdGF0ZTogZnVuY3Rpb24ocykge1xuICAgICAgICAgICAgICAgIGlmIChfLmNvbnRhaW5zKFtcInVzZVwiLCBcImRlZmluZVwiLCBcImdlbmVyYXRlXCIsIFwiZmlsdGVyXCJdLCBzKSlcbiAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnQubW9kZSA9IHM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hlY2s6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIV9jdXJyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gXCJ1c2VcIiBzdGF0ZSBvZiB0aGUgbGlzdCBjb21wLCB3ZSBlbnF1ZXVlIHRoYXQgdmFyXG4gICAgICAgICAgICAgICAgaWYgKF9jdXJyZW50ICYmIF9jdXJyZW50Lm1vZGUgPT09IFwidXNlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZSh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnQudmFyaWFibGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0OiBzdGF0ZS5mdW5jdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5kZWY6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW51c2VkOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIFwiZGVmaW5lXCIgc3RhdGUgb2YgdGhlIGxpc3QgY29tcCxcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKF9jdXJyZW50ICYmIF9jdXJyZW50Lm1vZGUgPT09IFwiZGVmaW5lXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIHZhcmlhYmxlIGhhcyBiZWVuIHVzZWQgcHJldmlvdXNseVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRlY2xhcmUodikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9jdXJyZW50LnZhcmlhYmxlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdDogc3RhdGUuZnVuY3QsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVmOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bnVzZWQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiB0aGUgXCJnZW5lcmF0ZVwiIHN0YXRlIG9mIHRoZSBsaXN0IGNvbXAsXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfY3VycmVudCAmJiBfY3VycmVudC5tb2RlID09PSBcImdlbmVyYXRlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLnVzZSh2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBcImZpbHRlclwiIHN0YXRlLFxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoX2N1cnJlbnQgJiYgX2N1cnJlbnQubW9kZSA9PT0gXCJmaWx0ZXJcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjaGVjayB3aGV0aGVyIGN1cnJlbnQgdmFyaWFibGUgaGFzIGJlZW4gZGVjbGFyZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZSh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgbm90IHdlIHdhcm4gYWJvdXQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5ibG9jay51c2Uodiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfTtcblxuXG4gICAgLy8gUGFyc2UgSlNPTlxuXG4gICAgZnVuY3Rpb24ganNvblZhbHVlKCkge1xuICAgICAgICBmdW5jdGlvbiBqc29uT2JqZWN0KCkge1xuICAgICAgICAgICAgdmFyIG8gPSB7fSwgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgYWR2YW5jZShcIntcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdC5saW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDk0XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI4XCIsIHN0YXRlLnRva2Vucy5uZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoc3RyaW5nKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChvW3N0YXRlLnRva2Vucy5uZXh0LnZhbHVlXSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzVcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwia2V5XCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiX19wcm90b19fXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5vcHRpb24ucHJvdG8pIHx8IChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJfX2l0ZXJhdG9yX19cIiAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5vcHRpb24uaXRlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5NlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgb1tzdGF0ZS50b2tlbnMubmV4dC52YWx1ZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgICAgIGpzb25WYWx1ZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwifVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGpzb25BcnJheSgpIHtcbiAgICAgICAgICAgIHZhciB0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICBhZHZhbmNlKFwiW1wiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCJdXCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI3XCIsIHN0YXRlLnRva2Vucy5uZXh0LCB0LmxpbmUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIl1cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOTRcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjhcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGpzb25WYWx1ZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLm5leHQuaWQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJ7XCI6XG4gICAgICAgICAgICAgICAganNvbk9iamVjdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIltcIjpcbiAgICAgICAgICAgICAgICBqc29uQXJyYXkoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgIGNhc2UgXCJudWxsXCI6XG4gICAgICAgICAgICBjYXNlIFwiKG51bWJlcilcIjpcbiAgICAgICAgICAgIGNhc2UgXCIoc3RyaW5nKVwiOlxuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIi1cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIihudW1iZXIpXCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDNcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGVzY2FwZVJlZ2V4ID0gZnVuY3Rpb24oc3RyKSB7XG4gICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvWy1cXC9cXFxcXiQqKz8uKCl8W1xcXXt9XS9nLCBcIlxcXFwkJlwiKTtcbiAgICB9O1xuXG4gICAgLy8gVGhlIGFjdHVhbCBKU0hJTlQgZnVuY3Rpb24gaXRzZWxmLlxuICAgIHZhciBpdHNlbGY6IGFueSA9IGZ1bmN0aW9uKHMsIG8sIGcpIHtcbiAgICAgICAgdmFyIGksIGssIHgsIHJlSWdub3JlU3RyLCByZUlnbm9yZTtcbiAgICAgICAgdmFyIG9wdGlvbktleXM7XG4gICAgICAgIHZhciBuZXdPcHRpb25PYmogPSB7fTtcbiAgICAgICAgdmFyIG5ld0lnbm9yZWRPYmogPSB7fTtcblxuICAgICAgICBvID0gXy5jbG9uZShvKTtcbiAgICAgICAgc3RhdGUucmVzZXQoKTtcblxuICAgICAgICBpZiAobyAmJiBvLnNjb3BlKSB7XG4gICAgICAgICAgICBKU0hJTlQuc2NvcGUgPSBvLnNjb3BlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgSlNISU5ULmVycm9ycyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULnVuZGVmcyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULmludGVybmFscyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULmJsYWNrbGlzdCA9IHt9O1xuICAgICAgICAgICAgSlNISU5ULnNjb3BlID0gXCIobWFpbilcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHByZWRlZmluZWQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGVjbWFJZGVudGlmaWVyc1szXSk7XG4gICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgcmVzZXJ2ZWRWYXJzKTtcblxuICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGcgfHwge30pO1xuXG4gICAgICAgIGRlY2xhcmVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIGV4cG9ydGVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gVmFyaWFibGVzIHRoYXQgbGl2ZSBvdXRzaWRlIHRoZSBjdXJyZW50IGZpbGVcblxuICAgICAgICBmdW5jdGlvbiBlYWNoKG9iaiwgY2IpIHtcbiAgICAgICAgICAgIGlmICghb2JqKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG9iaikgJiYgdHlwZW9mIG9iaiA9PT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgICAgICBvYmogPSBPYmplY3Qua2V5cyhvYmopO1xuXG4gICAgICAgICAgICBvYmouZm9yRWFjaChjYik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobykge1xuICAgICAgICAgICAgZWFjaChvLnByZWRlZiB8fCBudWxsLCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNsaWNlLCBwcm9wO1xuXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW1bMF0gPT09IFwiLVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHNsaWNlID0gaXRlbS5zbGljZSgxKTtcbiAgICAgICAgICAgICAgICAgICAgSlNISU5ULmJsYWNrbGlzdFtzbGljZV0gPSBzbGljZTtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGZyb20gcHJlZGVmaW5lZCBpZiB0aGVyZVxuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcHJlZGVmaW5lZFtzbGljZV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvcCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3Ioby5wcmVkZWYsIGl0ZW0pO1xuICAgICAgICAgICAgICAgICAgICBwcmVkZWZpbmVkW2l0ZW1dID0gcHJvcCA/IHByb3AudmFsdWUgOiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZWFjaChvLmV4cG9ydGVkIHx8IG51bGwsIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgICAgICAgICAgICBleHBvcnRlZFtpdGVtXSA9IHRydWU7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZGVsZXRlIG8ucHJlZGVmO1xuICAgICAgICAgICAgZGVsZXRlIG8uZXhwb3J0ZWQ7XG5cbiAgICAgICAgICAgIG9wdGlvbktleXMgPSBPYmplY3Qua2V5cyhvKTtcbiAgICAgICAgICAgIGZvciAoeCA9IDA7IHggPCBvcHRpb25LZXlzLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKC9eLVdcXGR7M30kL2cudGVzdChvcHRpb25LZXlzW3hdKSkge1xuICAgICAgICAgICAgICAgICAgICBuZXdJZ25vcmVkT2JqW29wdGlvbktleXNbeF0uc2xpY2UoMSldID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3B0aW9uS2V5ID0gb3B0aW9uS2V5c1t4XTtcbiAgICAgICAgICAgICAgICAgICAgbmV3T3B0aW9uT2JqW29wdGlvbktleV0gPSBvW29wdGlvbktleV07XG4gICAgICAgICAgICAgICAgICAgIGlmICgob3B0aW9uS2V5ID09PSBcImVzdmVyc2lvblwiICYmIG9bb3B0aW9uS2V5XSA9PT0gNSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChvcHRpb25LZXkgPT09IFwiZXM1XCIgJiYgb1tvcHRpb25LZXldKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZ0F0KFwiSTAwM1wiLCAwLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlLm9wdGlvbiA9IG5ld09wdGlvbk9iajtcbiAgICAgICAgc3RhdGUuaWdub3JlZCA9IG5ld0lnbm9yZWRPYmo7XG5cbiAgICAgICAgc3RhdGUub3B0aW9uLmluZGVudCA9IHN0YXRlLm9wdGlvbi5pbmRlbnQgfHwgNDtcbiAgICAgICAgc3RhdGUub3B0aW9uLm1heGVyciA9IHN0YXRlLm9wdGlvbi5tYXhlcnIgfHwgNTA7XG5cbiAgICAgICAgaW5kZW50ID0gMTtcblxuICAgICAgICB2YXIgc2NvcGVNYW5hZ2VySW5zdCA9IHNjb3BlTWFuYWdlcihzdGF0ZSwgcHJlZGVmaW5lZCwgZXhwb3J0ZWQsIGRlY2xhcmVkKTtcbiAgICAgICAgc2NvcGVNYW5hZ2VySW5zdC5vbihcIndhcm5pbmdcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIHdhcm5pbmcuYXBwbHkobnVsbCwgW2V2LmNvZGUsIGV2LnRva2VuXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZU1hbmFnZXJJbnN0Lm9uKFwiZXJyb3JcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGVycm9yLmFwcGx5KG51bGwsIFtldi5jb2RlLCBldi50b2tlbl0uY29uY2F0KGV2LmRhdGEpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3RhdGUuZnVuY3QgPSBmdW5jdG9yKFwiKGdsb2JhbClcIiwgbnVsbCwge1xuICAgICAgICAgICAgXCIoZ2xvYmFsKVwiOiB0cnVlLFxuICAgICAgICAgICAgXCIoc2NvcGUpXCI6IHNjb3BlTWFuYWdlckluc3QsXG4gICAgICAgICAgICBcIihjb21wYXJyYXkpXCI6IGFycmF5Q29tcHJlaGVuc2lvbigpLFxuICAgICAgICAgICAgXCIobWV0cmljcylcIjogY3JlYXRlTWV0cmljcyhzdGF0ZS50b2tlbnMubmV4dClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb25zID0gW3N0YXRlLmZ1bmN0XTtcbiAgICAgICAgdXJscyA9IFtdO1xuICAgICAgICBzdGFjayA9IG51bGw7XG4gICAgICAgIG1lbWJlciA9IHt9O1xuICAgICAgICBtZW1iZXJzT25seSA9IG51bGw7XG4gICAgICAgIGluYmxvY2sgPSBmYWxzZTtcbiAgICAgICAgbG9va2FoZWFkID0gW107XG5cbiAgICAgICAgaWYgKCFpc1N0cmluZyhzKSAmJiAhQXJyYXkuaXNBcnJheShzKSkge1xuICAgICAgICAgICAgZXJyb3JBdChcIkUwMDRcIiwgMCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBhcGkgPSB7XG4gICAgICAgICAgICBnZXQgaXNKU09OKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5qc29uTW9kZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdldE9wdGlvbjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5vcHRpb25bbmFtZV0gfHwgbnVsbDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdldENhY2hlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlLmNhY2hlW25hbWVdO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgc2V0Q2FjaGU6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuY2FjaGVbbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHdhcm46IGZ1bmN0aW9uKGNvZGUsIGRhdGEpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nQXQuYXBwbHkobnVsbCwgW2NvZGUsIGRhdGEubGluZSwgZGF0YS5jaGFyXS5jb25jYXQoZGF0YS5kYXRhKSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBvbjogZnVuY3Rpb24obmFtZXMsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbmFtZXMuc3BsaXQoXCIgXCIpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBlbWl0dGVyLm9uKG5hbWUsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGVtaXR0ZXIucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG4gICAgICAgIChleHRyYU1vZHVsZXMgfHwgW10pLmZvckVhY2goZnVuY3Rpb24oZnVuYykge1xuICAgICAgICAgICAgZnVuYyhhcGkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGF0ZS50b2tlbnMucHJldiA9IHN0YXRlLnRva2Vucy5jdXJyID0gc3RhdGUudG9rZW5zLm5leHQgPSBzdGF0ZS5zeW50YXhbXCIoYmVnaW4pXCJdO1xuXG4gICAgICAgIGlmIChvICYmIG8uaWdub3JlRGVsaW1pdGVycykge1xuXG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoby5pZ25vcmVEZWxpbWl0ZXJzKSkge1xuICAgICAgICAgICAgICAgIG8uaWdub3JlRGVsaW1pdGVycyA9IFtvLmlnbm9yZURlbGltaXRlcnNdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvLmlnbm9yZURlbGltaXRlcnMuZm9yRWFjaChmdW5jdGlvbihkZWxpbWl0ZXJQYWlyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFkZWxpbWl0ZXJQYWlyLnN0YXJ0IHx8ICFkZWxpbWl0ZXJQYWlyLmVuZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgcmVJZ25vcmVTdHIgPSBlc2NhcGVSZWdleChkZWxpbWl0ZXJQYWlyLnN0YXJ0KSArXG4gICAgICAgICAgICAgICAgICAgIFwiW1xcXFxzXFxcXFNdKj9cIiArXG4gICAgICAgICAgICAgICAgICAgIGVzY2FwZVJlZ2V4KGRlbGltaXRlclBhaXIuZW5kKTtcblxuICAgICAgICAgICAgICAgIHJlSWdub3JlID0gbmV3IFJlZ0V4cChyZUlnbm9yZVN0ciwgXCJpZ1wiKTtcblxuICAgICAgICAgICAgICAgIHMgPSBzLnJlcGxhY2UocmVJZ25vcmUsIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaC5yZXBsYWNlKC8uL2csIFwiIFwiKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV4ID0gbmV3IExleGVyKHMpO1xuXG4gICAgICAgIGxleC5vbihcIndhcm5pbmdcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIHdhcm5pbmdBdC5hcHBseShudWxsLCBbZXYuY29kZSwgZXYubGluZSwgZXYuY2hhcmFjdGVyXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJlcnJvclwiLCBmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXJyb3JBdC5hcHBseShudWxsLCBbZXYuY29kZSwgZXYubGluZSwgZXYuY2hhcmFjdGVyXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJmYXRhbFwiLCBmdW5jdGlvbihldikge1xuICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgZXYpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJJZGVudGlmaWVyXCIsIGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBlbWl0dGVyLmVtaXQoXCJJZGVudGlmaWVyXCIsIGV2KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV4Lm9uKFwiU3RyaW5nXCIsIGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBlbWl0dGVyLmVtaXQoXCJTdHJpbmdcIiwgZXYpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJOdW1iZXJcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGVtaXR0ZXIuZW1pdChcIk51bWJlclwiLCBldik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxleC5zdGFydCgpO1xuXG4gICAgICAgIC8vIENoZWNrIG9wdGlvbnNcbiAgICAgICAgZm9yICh2YXIgbmFtZSBpbiBvKSB7XG4gICAgICAgICAgICBpZiAoXy5oYXMobywgbmFtZSkpIHtcbiAgICAgICAgICAgICAgICBjaGVja09wdGlvbihuYW1lLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXNzdW1lKCk7XG5cbiAgICAgICAgICAgIC8vIGNvbWJpbmUgdGhlIHBhc3NlZCBnbG9iYWxzIGFmdGVyIHdlJ3ZlIGFzc3VtZWQgYWxsIG91ciBvcHRpb25zXG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGcgfHwge30pO1xuXG4gICAgICAgICAgICAvL3Jlc2V0IHZhbHVlc1xuICAgICAgICAgICAgY29tbWFbJ2ZpcnN0J10gPSB0cnVlO1xuXG4gICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLnRva2Vucy5uZXh0LmlkKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBcIntcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiW1wiOlxuICAgICAgICAgICAgICAgICAgICBkZXN0cnVjdHVyaW5nQXNzaWduT3JKc29uVmFsdWUoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0aXZlcygpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5kaXJlY3RpdmVbXCJ1c2Ugc3RyaWN0XCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnN0cmljdCAhPT0gXCJnbG9iYWxcIiAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICEoKHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IHRydWUgfHwgIXN0YXRlLm9wdGlvbi5zdHJpY3QpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChzdGF0ZS5vcHRpb24uZ2xvYmFsc3RyaWN0IHx8IHN0YXRlLm9wdGlvbi5tb2R1bGUgfHwgc3RhdGUub3B0aW9uLm5vZGUgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5waGFudG9tIHx8IHN0YXRlLm9wdGlvbi5icm93c2VyaWZ5KSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5N1wiLCBzdGF0ZS50b2tlbnMucHJldik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoZW5kKVwiKSB7XG4gICAgICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuXG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgaWYgKGVyciAmJiBlcnIubmFtZSA9PT0gXCJKU0hpbnRFcnJvclwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIG50ID0gc3RhdGUudG9rZW5zLm5leHQgfHwge307XG4gICAgICAgICAgICAgICAgSlNISU5ULmVycm9ycy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgc2NvcGU6IFwiKG1haW4pXCIsXG4gICAgICAgICAgICAgICAgICAgIHJhdzogZXJyLnJhdyxcbiAgICAgICAgICAgICAgICAgICAgY29kZTogZXJyLmNvZGUsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogZXJyLnJlYXNvbixcbiAgICAgICAgICAgICAgICAgICAgbGluZTogZXJyLmxpbmUgfHwgbnQubGluZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiBlcnIuY2hhcmFjdGVyIHx8IG50LmZyb21cbiAgICAgICAgICAgICAgICB9LCBudWxsKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTG9vcCBvdmVyIHRoZSBsaXN0ZWQgXCJpbnRlcm5hbHNcIiwgYW5kIGNoZWNrIHRoZW0gYXMgd2VsbC5cblxuICAgICAgICBpZiAoSlNISU5ULnNjb3BlID09PSBcIihtYWluKVwiKSB7XG4gICAgICAgICAgICBvID0gbyB8fCB7fTtcblxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IEpTSElOVC5pbnRlcm5hbHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICAgICAgICBrID0gSlNISU5ULmludGVybmFsc1tpXTtcbiAgICAgICAgICAgICAgICBvLnNjb3BlID0gay5lbGVtO1xuICAgICAgICAgICAgICAgIGl0c2VsZihrLnZhbHVlLCBvLCBnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBKU0hJTlQuZXJyb3JzLmxlbmd0aCA9PT0gMDtcbiAgICB9O1xuXG4gICAgLy8gTW9kdWxlcy5cbiAgICBpdHNlbGYuYWRkTW9kdWxlID0gZnVuY3Rpb24oZnVuYykge1xuICAgICAgICBleHRyYU1vZHVsZXMucHVzaChmdW5jKTtcbiAgICB9O1xuXG4gICAgaXRzZWxmLmFkZE1vZHVsZShyZWdpc3Rlcik7XG5cbiAgICAvLyBEYXRhIHN1bW1hcnkuXG4gICAgaXRzZWxmLmRhdGEgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGRhdGE6IHtcbiAgICAgICAgICAgIGVycm9ycz87XG4gICAgICAgICAgICBmdW5jdGlvbnM6IGFueVtdO1xuICAgICAgICAgICAgZ2xvYmFscz87XG4gICAgICAgICAgICBpbXBsaWVkcz87XG4gICAgICAgICAgICBqc29uPzogYm9vbGVhbjtcbiAgICAgICAgICAgIG1lbWJlcj87XG4gICAgICAgICAgICBvcHRpb25zPztcbiAgICAgICAgICAgIHVudXNlZD87XG4gICAgICAgICAgICB1cmxzPztcbiAgICAgICAgfSA9IHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbnM6IFtdLFxuICAgICAgICAgICAgICAgIG9wdGlvbnM6IHN0YXRlLm9wdGlvblxuICAgICAgICAgICAgfTtcblxuICAgICAgICB2YXIgZnUsIGYsIGksIGosIG4sIGdsb2JhbHM7XG5cbiAgICAgICAgaWYgKGl0c2VsZi5lcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICBkYXRhLmVycm9ycyA9IGl0c2VsZi5lcnJvcnM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuanNvbk1vZGUpIHtcbiAgICAgICAgICAgIGRhdGEuanNvbiA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaW1wbGllZEdsb2JhbHMgPSBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uZ2V0SW1wbGllZEdsb2JhbHMoKTtcbiAgICAgICAgaWYgKGltcGxpZWRHbG9iYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGRhdGEuaW1wbGllZHMgPSBpbXBsaWVkR2xvYmFscztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh1cmxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGRhdGEudXJscyA9IHVybHM7XG4gICAgICAgIH1cblxuICAgICAgICBnbG9iYWxzID0gc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmdldFVzZWRPckRlZmluZWRHbG9iYWxzKCk7XG4gICAgICAgIGlmIChnbG9iYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGRhdGEuZ2xvYmFscyA9IGdsb2JhbHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgZnVuY3Rpb25zLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICBmID0gZnVuY3Rpb25zW2ldO1xuICAgICAgICAgICAgZnUgPSB7fTtcblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGZ1bmN0aW9uaWNpdHkubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICBmdVtmdW5jdGlvbmljaXR5W2pdXSA9IFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgZnVuY3Rpb25pY2l0eS5sZW5ndGg7IGogKz0gMSkge1xuICAgICAgICAgICAgICAgIGlmIChmdVtmdW5jdGlvbmljaXR5W2pdXS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGZ1W2Z1bmN0aW9uaWNpdHlbal1dO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnUubmFtZSA9IGZbXCIobmFtZSlcIl07XG4gICAgICAgICAgICBmdS5wYXJhbSA9IGZbXCIocGFyYW1zKVwiXTtcbiAgICAgICAgICAgIGZ1LmxpbmUgPSBmW1wiKGxpbmUpXCJdO1xuICAgICAgICAgICAgZnUuY2hhcmFjdGVyID0gZltcIihjaGFyYWN0ZXIpXCJdO1xuICAgICAgICAgICAgZnUubGFzdCA9IGZbXCIobGFzdClcIl07XG4gICAgICAgICAgICBmdS5sYXN0Y2hhcmFjdGVyID0gZltcIihsYXN0Y2hhcmFjdGVyKVwiXTtcblxuICAgICAgICAgICAgZnUubWV0cmljcyA9IHtcbiAgICAgICAgICAgICAgICBjb21wbGV4aXR5OiBmW1wiKG1ldHJpY3MpXCJdLkNvbXBsZXhpdHlDb3VudCxcbiAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzOiBmW1wiKG1ldHJpY3MpXCJdLmFyaXR5LFxuICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IGZbXCIobWV0cmljcylcIl0uc3RhdGVtZW50Q291bnRcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGRhdGEuZnVuY3Rpb25zLnB1c2goZnUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHVudXNlZHMgPSBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uZ2V0VW51c2VkcygpO1xuICAgICAgICBpZiAodW51c2Vkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBkYXRhLnVudXNlZCA9IHVudXNlZHM7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKG4gaW4gbWVtYmVyKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1lbWJlcltuXSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIGRhdGEubWVtYmVyID0gbWVtYmVyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfTtcblxuICAgIGl0c2VsZi5qc2hpbnQgPSBpdHNlbGY7XG5cbiAgICByZXR1cm4gaXRzZWxmO1xufSAoKSk7XG4iXX0=