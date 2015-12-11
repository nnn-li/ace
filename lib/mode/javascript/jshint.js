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
import contains from "../../fp/contains";
import clone from "../../fp/clone";
import each from "../../fp/each";
import extend from "../../fp/extend";
import has from "../../fp/has";
import isEmpty from "../../fp/isEmpty";
import isNumber from "../../fp/isNumber";
import reject from "../../fp/reject";
import zip from "../../fp/zip";
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
            if (t.type !== "jslint" && !has(removed, name)) {
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
            if (has(JSHINT.blacklist, name))
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
        if (isEmpty(ignored)) {
            return;
        }
        var errors = JSHINT.errors;
        JSHINT.errors = reject(errors, function (err) { return ignored[err.line]; });
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
                if (has(predef, key)) {
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
                if (has(esversions, key)) {
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
            contains(["]", ")"], state.tokens.prev.id) &&
            contains(["[", "("], state.tokens.curr.id);
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
            return !contains(values, left.value);
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
                        if (has(state.directive, d)) {
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
                        if (has(state.directive, d)) {
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
    state.syntax["(template)"] = extend({
        type: "(template)",
        nud: doTemplateLiteral,
        led: doTemplateLiteral,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(template middle)"] = extend({
        type: "(template middle)",
        middle: true,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(template tail)"] = extend({
        type: "(template tail)",
        tail: true,
        noSubst: false
    }, baseTemplateSyntax);
    state.syntax["(no subst template)"] = extend({
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
        if (contains(["in", "of"], state.tokens.next.value)) {
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
            if (contains(["{", "["], state.tokens.next.id)) {
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
            extend(funct, {
                "(line)": token.line,
                "(character)": token.character,
                "(metrics)": createMetrics(token)
            });
        }
        extend(funct, overwrites);
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
                if (isNumber(state.option.maxparams) &&
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
        zip(tokens, Array.isArray(first) ? first : [first]).forEach(function (val) {
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
            if (contains(["{", "["], state.tokens.next.value)) {
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
            if (contains(["{", "["], state.tokens.next.value)) {
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
                tokens.forEach(function (token) {
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
        } while (level > 0 || !contains(inof, nextop.value) && nextop.value !== ";" &&
            nextop.type !== "(end)");
        if (contains(inof, nextop.value)) {
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
            return contains(values, token.value);
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
                if (contains(["use", "define", "generate", "filter"], s))
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
        o = clone(o);
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
            if (has(o, name)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNoaW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21vZGUvamF2YXNjcmlwdC9qc2hpbnQudHMiXSwibmFtZXMiOlsiY2hlY2tPcHRpb24iLCJpc1N0cmluZyIsImlzSWRlbnRpZmllciIsImlzUmVzZXJ2ZWQiLCJzdXBwbGFudCIsImNvbWJpbmUiLCJwcm9jZXNzZW5mb3JjZWFsbCIsImFzc3VtZSIsInF1aXQiLCJyZW1vdmVJZ25vcmVkTWVzc2FnZXMiLCJ3YXJuaW5nIiwid2FybmluZ0F0IiwiZXJyb3IiLCJlcnJvckF0IiwiYWRkSW50ZXJuYWxTcmMiLCJkb09wdGlvbiIsInBlZWsiLCJwZWVrSWdub3JlRU9MIiwiYWR2YW5jZSIsImlzSW5maXgiLCJpc0VuZE9mRXhwciIsImlzQmVnaW5PZkV4cHIiLCJleHByZXNzaW9uIiwic3RhcnRMaW5lIiwibm9icmVha25vbmFkamFjZW50Iiwibm9saW5lYnJlYWsiLCJub2JyZWFrY29tbWEiLCJjb21tYSIsInN5bWJvbCIsImRlbGltIiwic3RtdCIsImJsb2Nrc3RtdCIsInJlc2VydmVOYW1lIiwicHJlZml4IiwidHlwZSIsInJlc2VydmUiLCJGdXR1cmVSZXNlcnZlZFdvcmQiLCJyZXNlcnZldmFyIiwiaW5maXgiLCJhcHBsaWNhdGlvbiIsInJlbGF0aW9uIiwiaXNQb29yUmVsYXRpb24iLCJpc1R5cG9UeXBlb2YiLCJpc0dsb2JhbEV2YWwiLCJmaW5kTmF0aXZlUHJvdG90eXBlIiwiZmluZE5hdGl2ZVByb3RvdHlwZS53YWxrUHJvdG90eXBlIiwiZmluZE5hdGl2ZVByb3RvdHlwZS53YWxrTmF0aXZlIiwiY2hlY2tMZWZ0U2lkZUFzc2lnbiIsImFzc2lnbm9wIiwiYml0d2lzZSIsImJpdHdpc2Vhc3NpZ25vcCIsInN1ZmZpeCIsIm9wdGlvbmFsaWRlbnRpZmllciIsImlkZW50aWZpZXIiLCJyZWFjaGFibGUiLCJwYXJzZUZpbmFsU2VtaWNvbG9uIiwic3RhdGVtZW50Iiwic3RhdGVtZW50cyIsImRpcmVjdGl2ZXMiLCJibG9jayIsImNvdW50TWVtYmVyIiwiY29tcHJlaGVuc2l2ZUFycmF5RXhwcmVzc2lvbiIsImlzTWV0aG9kIiwiaXNQcm9wZXJ0eU5hbWUiLCJwcm9wZXJ0eU5hbWUiLCJmdW5jdGlvbnBhcmFtcyIsImZ1bmN0aW9ucGFyYW1zLmFkZFBhcmFtIiwiZnVuY3RvciIsImlzRnVuY3RvciIsImhhc1BhcnNlZENvZGUiLCJkb1RlbXBsYXRlTGl0ZXJhbCIsImRvVGVtcGxhdGVMaXRlcmFsLmVuZCIsImRvRnVuY3Rpb24iLCJjcmVhdGVNZXRyaWNzIiwiaW5jcmVhc2VDb21wbGV4aXR5Q291bnQiLCJjaGVja0NvbmRBc3NpZ25tZW50IiwiY2hlY2tQcm9wZXJ0aWVzIiwibWV0YVByb3BlcnR5IiwiZGVzdHJ1Y3R1cmluZ1BhdHRlcm4iLCJkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZSIsImRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2giLCJibG9ja1ZhcmlhYmxlU3RhdGVtZW50IiwiY2xhc3NkZWYiLCJjbGFzc3RhaWwiLCJjbGFzc2JvZHkiLCJkb0NhdGNoIiwic2F2ZVByb3BlcnR5Iiwic2F2ZUFjY2Vzc29yIiwiY29tcHV0ZWRQcm9wZXJ0eU5hbWUiLCJjaGVja1B1bmN0dWF0b3JzIiwiY2hlY2tQdW5jdHVhdG9yIiwiZGVzdHJ1Y3R1cmluZ0Fzc2lnbk9ySnNvblZhbHVlIiwiZGVjbGFyZSIsInVzZSIsImpzb25WYWx1ZSIsImpzb25WYWx1ZS5qc29uT2JqZWN0IiwianNvblZhbHVlLmpzb25BcnJheSIsImlzSlNPTiJdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0E0Qkc7T0FNSSxZQUFZLE1BQU0sZ0JBQWdCO09BQ2xDLEVBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLElB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QzFCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBO29CQUNuQ0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzVCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDcENBLENBQUNBO1lBQ0xBLENBQUNBO1lBQ0RBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDbkNBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBRUQ7UUFDSUMsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUtwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMvQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLENBQUNBO1FBTURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLFFBQVFBLElBQUlBLGNBQWNBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3JFQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxFQUFFQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUM5REEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDbkNBLENBQUNBO1lBSURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcERBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM3QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1lBQzdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBO1lBQ25DQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDbkNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1lBQzNCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDaENBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBO1FBQ25DQSxDQUFDQTtR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QUM3QkEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFFREEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDWEEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFWkEsQ0FBQ0EsR0FBR0E7WUFDQUEsRUFBRUEsRUFBRUEsU0FBU0E7WUFDYkEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsSUFBSUE7WUFDYkEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsSUFBSUE7WUFDZEEsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUE7WUFDbENBLElBQUlBLEVBQUVBLENBQUNBO1lBQ1BBLFNBQVNBLEVBQUVBLEVBQUVBO1lBQ2JBLEtBQUtBLEVBQUVBLE1BQU1BLENBQUNBLEtBQUtBO1lBQ25CQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNKQSxDQUFDQSxFQUFFQSxDQUFDQTtTQUNQQSxDQUFD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Q0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkNBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxHQUFHQTtnQkFDSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxHQUFHQTtnQkFDSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtRQUNkQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUNuQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoRkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsS0FBS0EsY0FBY0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JGQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDdENBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ3RDQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUVyREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pFQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQzlCQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO29CQUM3Q0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDOUNBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsUUFBUUEsRUFBRUEsQ0FBQ0E7Z0JBQ2ZBLENBQUNBO1lBQ0xBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkNBLEtBQUtBLENBQUNBO2dCQUNWQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVELGlCQUFpQixLQUFLO1FBQ2xCQyxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxJQUFJQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNoRkEsQ0FBQ0E7SUFFRDtRQUNJQyxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUM3QkEsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFFRCx1QkFBdUIsSUFBSTtRQUN2QkMsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsT0FBT0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBZ0JELG9CQUFvQixHQUFHLEVBQUUsT0FBUTtRQUM3QkMsSUFBSUEsSUFBSUEsRUFBRUEsT0FBT0EsR0FBR0EsS0FBS0EsRUFBRUEsUUFBUUEsR0FBR0EsS0FBS0EsRUFBRUEsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFFL0RBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBR3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1lBQzFEQSxDQUFDQTtZQUNEQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUVqQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ2ZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ3hCQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsQ0FBQ0E7WUFDakNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRXJDQSxJQUFJQSxXQUFXQSxHQUNYQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQTtZQUNoQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsS0FBS0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDdkRBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFDQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUUvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDWkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFN0RBLE9BQU9BLEVBQUVBLENBQUNBO1FBRVZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1lBQ2hEQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ25DQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDM0RBLENBQUNBO1lBR0RBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLFlBQVlBLENBQUNBO2dCQUMzRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ2pCQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxPQUFPQSxDQUFDQTtnQkFDOUNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLFFBQVFBLENBQUNBO2dCQUtoREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBSTNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQTt3QkFDcEJBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUMvREEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0E7d0JBR2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDekNBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBO3dCQUNyQkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFFREEsT0FBT0EsRUFBRUEsQ0FBQ0E7Z0JBRVZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMxRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxDQUFDQTtnQkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNFQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkNBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaENBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2Q0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDM0RBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUVEQSxLQUFLQSxDQUFDQSxTQUFT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VUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFcEVBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUM5QkEsS0FBS0EsT0FBT0EsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLE1BQU1BLENBQUNBO2dCQUNaQSxLQUFLQSxPQUFPQSxDQUFDQTtnQkFDYkEsS0FBS0EsVUFBVUEsQ0FBQ0E7Z0JBQ2hCQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDZkEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLE1BQU1BLENBQUNBO2dCQUNaQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDZkEsS0FBS0EsS0FBS0EsQ0FBQ0E7Z0JBQ1hBLEtBQUtBLElBQUlBLENBQUNBO2dCQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFDVkEsS0FBS0EsWUFBWUEsQ0FBQ0E7Z0JBQ2xCQSxLQUFLQSxRQUFRQSxDQUFDQTtnQkFDZEEsS0FBS0EsUUFBUUEsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLE9BQU9BLENBQUNBO2dCQUNiQSxLQUFLQSxLQUFLQSxDQUFDQTtnQkFDWEEsS0FBS0EsS0FBS0EsQ0FBQ0E7Z0JBQ1hBLEtBQUtBLEtBQUtBLENBQUNBO2dCQUNYQSxLQUFLQSxPQUFPQSxDQUFDQTtnQkFDYkEsS0FBS0EsTUFBTUE7b0JBQ1BBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUMxREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDckJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNB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QSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaENBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO2dCQUMxQ0EsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFFREEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBTTFEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ2RBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBR0QsbUJBQW1CLFlBQVk7UUFDM0JDLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLFlBQVlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLEdBQUdBLENBQUNBLENBQUNBLElBQUtBLENBQUNBO1lBQ1BBLEdBQUdBLENBQUNBO2dCQUNBQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDWEEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsV0FBV0EsRUFBRUE7WUFFbkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO29CQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkJBLENBQUNBO29CQUNEQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBRURBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRDtRQUNJQyxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUvQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNB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S0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO1lBRWxGQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakVBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3pFQSxDQUFDQTtZQUVEQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNsQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDMUJBLENBQUNBO1FBSURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBUWZBLElBQUlBLE1BQU1BLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1lBQ25GQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN4Q0EsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFJREEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLElBQUlBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLFVBQVVBLENBQUNBO1lBQzlDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxjQUFjQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQTtnQkFDakNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQTtnQkFDakJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBSURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4Q0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsRkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLENBQUNBO1lBQ0RBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7UUFDMUJBLENBQUNBO1FBS0RBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ1hBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNiQSxDQUFDQTtJQUdEO1FBQ0lDLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBRWRBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ2xFQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLENBQUNBO2dCQUVYQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDdkNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwQkEsQ0FBQ0E7Z0JBRURBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2pCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0lBQ2JBLENBQUNBO0lBUUQ7UUFDSUMsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFFYkEsT0FBT0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsRUFBRUEsQ0FBQ0E7WUFDekNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2QkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ05BLEdBQUdBLENBQUNBO29CQUNBQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDbkJBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLFdBQVdBLEVBQUVBO2dCQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hCQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDWEEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLElBQUlBLEVBQUVBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUU5Q0EsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFL0NBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2Q0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxDQUFDQTtZQUVEQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUNWQSxJQUFJQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUN4Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQzFCQSxDQUFDQSxTQUFTQSxLQUFLQSxZQUFZQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEVBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBQ2xEQSxDQUFDQTtZQUdEQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUVsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2pCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDOUJBLENBQUNBO0lBQ0xBLENBQUNBO0lBYUQsZUFBZSxRQUFpQixFQUFFLElBQWMsRUFBRSxNQUFnQixFQUFFLFVBQW9CLEVBQUUsTUFBZ0I7UUFDdEdDLElBQUlBLENBQUNBLEVBQ0RBLENBQUNBLEdBQUdBLE9BQU9BLEVBQ1hBLFVBQVVBLEdBQUdBLE1BQU1BLEVBQ25CQSxDQUFDQSxFQUNEQSxDQUFDQSxFQUNEQSxJQUFJQSxFQUNKQSxDQUFDQSxDQUFDQTtRQUVOQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUVuQkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFdEJBLElBQUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQ3ZDQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxPQUFPQSxDQUFDQSxvQ0FBb0NBLEVBQUVBLENBQUNBO1FBRS9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFHYkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFFMUNBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBO1lBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO2dCQUM5QkEsT0FBT0EsQ0FBQ0EsUUFBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsTUFBTUEsRUFBRUEsQ0FBQ0E7b0JBQ2xEQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDbENBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDVEEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7b0JBQ1BBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO3dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQzFCQSxDQUFDQSxDQUFDQSxDQUFDQSxD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QSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDOURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO3dCQUN4Q0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBRURBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBO1lBQ3JDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBSUpBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsS0FBS0EsQ0FBQ0E7WUFDbkVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBRS9CQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlB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QUNBLENBQUNBLENBQUNBO2dCQUNqQkEsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2JBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzlDQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ2RBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUNEQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNoREEsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFZkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2RBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNB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S0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDN0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtnQkFDeENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLFVBQVVBLElBQUlBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLGNBQWNBLENBQUNBO2dCQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNwRUEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsS0FBS0EsVUFBVUEsQ0FBQ0E7Z0JBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVB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QUFDQSxDQUFDQTtvQkFDL0JBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNyQ0EsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakJBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLG9CQUFvQkEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xFQSxDQUFDQTtnQkFDREEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNuQkEsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLENBQUNBO1lBR0RBLGFBQWFBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBRWhDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNYQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkNBLENBQUNBO2dCQUNEQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNaQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsT0FBT0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0Es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QSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3ZDQSxDQUFDQTtZQUNEQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDOUNBLGtCQUFrQkEsRUFBRUEsQ0FBQ0E7Z0JBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDMUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNiQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtvQkFDdkJBLEtBQUtBLEdBQUdBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO29CQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDbENBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFD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Q0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLENBQUNBO1lBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDN0JBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO3dCQUNuQ0EsQ0FBQ0E7b0JBQ0xBLENBQUNBO29CQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM3Q0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUE7NEJBQ2xDQSxJQUFJQSxFQUFFQSxJQUFJQTs0QkFDVkEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0E7eUJBQ2pCQSxDQUFDQSxDQUFDQTt3QkFDSEEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7d0JBRXBCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDbkJBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO3dCQUMvREEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEVBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoRUEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO2dCQUUzQkEsS0FBS0EsR0FBR0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakRBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO29CQUNQQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDNUJBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEseUJBQXlCQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDNUNBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLFNBQVNBLENBQUNBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRWhEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1pBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xCQSxTQUFTQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUN2QkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDckNBLENBQUNB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Q0FBQ0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRTNDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDMURBLE9BQU9BLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLEdBQUdBO29CQUMvQkEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7b0JBQzNDQSxPQUFPQSxFQUFFQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUNsQ0EsVUFBVUEsQ0FBQ0EsRUFBRUEsU0FBU0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1RBLFlBQVlBLENBQ1JBLE1BQU1BLENBQUNBLEtBQUtBLEVBQUVBLFFBQVFBLEdBQUdBLFdBQVdBLEdBQUdBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUN4RkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSxFQUFFQSxDQUFDQSxDQUFD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QUN2Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBRURBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLFlBQVlBLENBQUNBO1FBQzlDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUV6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNsREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdENBLENBQUNBO1FBRURBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUVEO1FBQ0lDLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFL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Q1BBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO3dCQUNuQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQzdDQSxDQUFDQTtvQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RDQSxPQUFPQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDbkNBLEtBQUtBLENBQUNBO29CQUNWQSxDQUFDQTtvQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDckNBLENBQUNBO29CQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxLQUFLQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDN0NBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUNoRUEsQ0FBQ0E7b0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNB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QUFDO1lBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUVELElBQUksT0FBTyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEQsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO1FBQzFCLENBQUM7UUFFRCxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNmLEVBQUUsQ0FBQyxDQUFDLE9BQU8sTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO2dCQUNyQixLQUFLLENBQUM7WUFDVixDQUFDO1FBQ0wsQ0FBQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQyxDQUFDO0lBRUYsTUFBTSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFFdkIsTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUNsQixDQUFDLEVBQUcsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyohXG4gKiBKU0hpbnQsIGJ5IEpTSGludCBDb21tdW5pdHkuXG4gKlxuICogVGhpcyBmaWxlIChhbmQgdGhpcyBmaWxlIG9ubHkpIGlzIGxpY2Vuc2VkIHVuZGVyIHRoZSBzYW1lIHNsaWdodGx5IG1vZGlmaWVkXG4gKiBNSVQgbGljZW5zZSB0aGF0IEpTTGludCBpcy4gSXQgc3RvcHMgZXZpbC1kb2VycyBldmVyeXdoZXJlOlxuICpcbiAqICAgQ29weXJpZ2h0IChjKSAyMDAyIERvdWdsYXMgQ3JvY2tmb3JkICAod3d3LkpTTGludC5jb20pXG4gKlxuICogICBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmdcbiAqICAgYSBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksXG4gKiAgIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb25cbiAqICAgdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsXG4gKiAgIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tXG4gKiAgIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqICAgVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbiAqICAgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogICBUaGUgU29mdHdhcmUgc2hhbGwgYmUgdXNlZCBmb3IgR29vZCwgbm90IEV2aWwuXG4gKlxuICogICBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiAgIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogICBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqICAgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogICBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lOR1xuICogICBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSXG4gKiAgIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cbiAqXG4gKi9cblxuLypqc2hpbnQgcXVvdG1hcms6ZG91YmxlICovXG4vKmdsb2JhbCBjb25zb2xlOnRydWUgKi9cbi8qZXhwb3J0ZWQgY29uc29sZSAqL1xuaW1wb3J0IEpTSGludE9wdGlvbnMgZnJvbSAnLi9KU0hpbnRPcHRpb25zJztcbmltcG9ydCBFdmVudEVtaXR0ZXIgZnJvbSBcIi4vRXZlbnRFbWl0dGVyXCI7XG5pbXBvcnQge2Jyb3dzZXIsIGJyb3dzZXJpZnksIGNvdWNoLCBkZXZlbCwgZG9qbywgZWNtYUlkZW50aWZpZXJzLCBqYXNtaW5lLCBqcXVlcnksIG1vY2hhLCBtb290b29scywgbm9kZSwgbm9uc3RhbmRhcmQsIHBoYW50b20sIHByb3RvdHlwZWpzLCBxdW5pdCwgcmVzZXJ2ZWRWYXJzLCByaGlubywgc2hlbGxqcywgdHlwZWQsIHdvcmtlciwgd3NoLCB5dWl9IGZyb20gXCIuL3ZhcnNcIjtcbmltcG9ydCB7ZXJyb3JzLCBpbmZvLCB3YXJuaW5nc30gZnJvbSBcIi4vbWVzc2FnZXNcIjtcbmltcG9ydCBMZXhlciBmcm9tIFwiLi9sZXhcIjtcbmltcG9ydCB7aWRlbnRpZmllclJlZ0V4cCwgamF2YXNjcmlwdFVSTH0gZnJvbSBcIi4vcmVnXCI7XG5pbXBvcnQge3N0YXRlfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHtyZWdpc3Rlcn0gZnJvbSBcIi4vc3R5bGVcIjtcbmltcG9ydCB7Ym9vbCwgaW52ZXJ0ZWQsIG5vZW5mb3JjZWFsbCwgcmVtb3ZlZCwgcmVuYW1lZCwgdmFsaWROYW1lc30gZnJvbSBcIi4vb3B0aW9uc1wiO1xuaW1wb3J0IHtzY29wZU1hbmFnZXJ9IGZyb20gXCIuL3Njb3BlLW1hbmFnZXJcIjtcbmltcG9ydCBjb250YWlucyBmcm9tIFwiLi4vLi4vZnAvY29udGFpbnNcIjtcbmltcG9ydCBjbG9uZSBmcm9tIFwiLi4vLi4vZnAvY2xvbmVcIjtcbmltcG9ydCBlYWNoIGZyb20gXCIuLi8uLi9mcC9lYWNoXCI7XG5pbXBvcnQgZXh0ZW5kIGZyb20gXCIuLi8uLi9mcC9leHRlbmRcIjtcbmltcG9ydCBoYXMgZnJvbSBcIi4uLy4uL2ZwL2hhc1wiO1xuaW1wb3J0IGlzRW1wdHkgZnJvbSBcIi4uLy4uL2ZwL2lzRW1wdHlcIjtcbmltcG9ydCBpc051bWJlciBmcm9tIFwiLi4vLi4vZnAvaXNOdW1iZXJcIjtcbmltcG9ydCByZWplY3QgZnJvbSBcIi4uLy4uL2ZwL3JlamVjdFwiO1xuaW1wb3J0IHppcCBmcm9tIFwiLi4vLi4vZnAvemlwXCI7XG5cbi8vIFdlIG5lZWQgdGhpcyBtb2R1bGUgaGVyZSBiZWNhdXNlIGVudmlyb25tZW50cyBzdWNoIGFzIElFIGFuZCBSaGlub1xuLy8gZG9uJ3QgbmVjZXNzYXJpbGx5IGV4cG9zZSB0aGUgJ2NvbnNvbGUnIEFQSSBhbmQgYnJvd3NlcmlmeSB1c2VzXG4vLyBpdCB0byBsb2cgdGhpbmdzLiBJdCdzIGEgc2FkIHN0YXRlIG9mIGFmZmFpciwgcmVhbGx5LlxuLy8gdmFyIGNvbnNvbGUgPSByZXF1aXJlKFwiY29uc29sZS1icm93c2VyaWZ5XCIpO1xuXG4vLyBXZSBidWlsZCB0aGUgYXBwbGljYXRpb24gaW5zaWRlIGEgZnVuY3Rpb24gc28gdGhhdCB3ZSBwcm9kdWNlIG9ubHkgYSBzaW5nbGV0b25cbi8vIHZhcmlhYmxlLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgaW52b2tlZCBpbW1lZGlhdGVseSwgYW5kIGl0cyByZXR1cm4gdmFsdWUgaXNcbi8vIHRoZSBKU0hJTlQgZnVuY3Rpb24gaXRzZWxmLlxuXG4vLyBUaHJvdyBhd2F5IHRoZSB0eXBlIGluZm9ybWF0aW9uIGJlY2F1c2UgSlNISU5UIGlzIGJvdGggYSBmdW5jdGlvbiB3aXRoIGF0dHJpYnV0ZXMhXG5leHBvcnQgdmFyIEpTSElOVDogYW55ID0gKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIGFwaSwgLy8gRXh0ZW5zaW9uIEFQSVxuXG4gICAgICAgIC8vIFRoZXNlIGFyZSBvcGVyYXRvcnMgdGhhdCBzaG91bGQgbm90IGJlIHVzZWQgd2l0aCB0aGUgISBvcGVyYXRvci5cbiAgICAgICAgYmFuZyA9IHtcbiAgICAgICAgICAgIFwiPFwiOiB0cnVlLFxuICAgICAgICAgICAgXCI8PVwiOiB0cnVlLFxuICAgICAgICAgICAgXCI9PVwiOiB0cnVlLFxuICAgICAgICAgICAgXCI9PT1cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiIT09XCI6IHRydWUsXG4gICAgICAgICAgICBcIiE9XCI6IHRydWUsXG4gICAgICAgICAgICBcIj5cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiPj1cIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiK1wiOiB0cnVlLFxuICAgICAgICAgICAgXCItXCI6IHRydWUsXG4gICAgICAgICAgICBcIipcIjogdHJ1ZSxcbiAgICAgICAgICAgIFwiL1wiOiB0cnVlLFxuICAgICAgICAgICAgXCIlXCI6IHRydWVcbiAgICAgICAgfSxcblxuICAgICAgICBkZWNsYXJlZCwgLy8gR2xvYmFscyB0aGF0IHdlcmUgZGVjbGFyZWQgdXNpbmcgLypnbG9iYWwgLi4uICovIHN5bnRheC5cblxuICAgICAgICBmdW5jdGlvbmljaXR5ID0gW1xuICAgICAgICAgICAgXCJjbG9zdXJlXCIsIFwiZXhjZXB0aW9uXCIsIFwiZ2xvYmFsXCIsIFwibGFiZWxcIixcbiAgICAgICAgICAgIFwib3V0ZXJcIiwgXCJ1bnVzZWRcIiwgXCJ2YXJcIlxuICAgICAgICBdLFxuXG4gICAgICAgIGZ1bmN0aW9ucywgLy8gQWxsIG9mIHRoZSBmdW5jdGlvbnNcblxuICAgICAgICBpbmJsb2NrLFxuICAgICAgICBpbmRlbnQsXG4gICAgICAgIGxvb2thaGVhZCxcbiAgICAgICAgbGV4LFxuICAgICAgICBtZW1iZXIsXG4gICAgICAgIG1lbWJlcnNPbmx5LFxuICAgICAgICBwcmVkZWZpbmVkLCAgICAvLyBHbG9iYWwgdmFyaWFibGVzIGRlZmluZWQgYnkgb3B0aW9uXG5cbiAgICAgICAgc3RhY2ssXG4gICAgICAgIHVybHMsXG5cbiAgICAgICAgZXh0cmFNb2R1bGVzID0gW10sXG4gICAgICAgIGVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbiAgICBmdW5jdGlvbiBjaGVja09wdGlvbihuYW1lLCB0KSB7XG4gICAgICAgIG5hbWUgPSBuYW1lLnRyaW0oKTtcblxuICAgICAgICBpZiAoL15bKy1dV1xcZHszfSQvZy50ZXN0KG5hbWUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWxpZE5hbWVzLmluZGV4T2YobmFtZSkgPT09IC0xKSB7XG4gICAgICAgICAgICBpZiAodC50eXBlICE9PSBcImpzbGludFwiICYmICFoYXMocmVtb3ZlZCwgbmFtZSkpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDFcIiwgdCwgbmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNTdHJpbmcob2JqKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSA9PT0gXCJbb2JqZWN0IFN0cmluZ11cIjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0lkZW50aWZpZXIodGtuLCB2YWx1ZSkge1xuICAgICAgICBpZiAoIXRrbilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBpZiAoIXRrbi5pZGVudGlmaWVyIHx8IHRrbi52YWx1ZSAhPT0gdmFsdWUpXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNSZXNlcnZlZCh0b2tlbikge1xuICAgICAgICBpZiAoIXRva2VuLnJlc2VydmVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG1ldGEgPSB0b2tlbi5tZXRhO1xuXG4gICAgICAgIGlmIChtZXRhICYmIG1ldGEuaXNGdXR1cmVSZXNlcnZlZFdvcmQgJiYgc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgLy8gRVMzIEZ1dHVyZVJlc2VydmVkV29yZCBpbiBhbiBFUzUgZW52aXJvbm1lbnQuXG4gICAgICAgICAgICBpZiAoIW1ldGEuZXM1KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBTb21lIEVTNSBGdXR1cmVSZXNlcnZlZFdvcmQgaWRlbnRpZmllcnMgYXJlIGFjdGl2ZSBvbmx5XG4gICAgICAgICAgICAvLyB3aXRoaW4gYSBzdHJpY3QgbW9kZSBlbnZpcm9ubWVudC5cbiAgICAgICAgICAgIGlmIChtZXRhLnN0cmljdE9ubHkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5zdHJpY3QgJiYgIXN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRva2VuLmlzUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdXBwbGFudChzdHIsIGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9cXHsoW157fV0qKVxcfS9nLCBmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICB2YXIgciA9IGRhdGFbYl07XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHIgPT09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHIgPT09IFwibnVtYmVyXCIgPyByIDogYTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29tYmluZShkZXN0LCBzcmMpIHtcbiAgICAgICAgT2JqZWN0LmtleXMoc3JjKS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgICAgIGlmIChoYXMoSlNISU5ULmJsYWNrbGlzdCwgbmFtZSkpIHJldHVybjtcbiAgICAgICAgICAgIGRlc3RbbmFtZV0gPSBzcmNbbmFtZV07XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NlbmZvcmNlYWxsKCkge1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmVuZm9yY2VhbGwpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGVuZm9yY2VvcHQgaW4gYm9vbC5lbmZvcmNpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uW2VuZm9yY2VvcHRdID09PSB2b2lkIDAgJiZcbiAgICAgICAgICAgICAgICAgICAgIW5vZW5mb3JjZWFsbFtlbmZvcmNlb3B0XSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb25bZW5mb3JjZW9wdF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAodmFyIHJlbGF4b3B0IGluIGJvb2wucmVsYXhpbmcpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uW3JlbGF4b3B0XSA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbltyZWxheG9wdF0gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhc3N1bWUoKSB7XG4gICAgICAgIHByb2Nlc3NlbmZvcmNlYWxsKCk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRPRE86IFJlbW92ZSBpbiBKU0hpbnQgM1xuICAgICAgICAgKi9cbiAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uZXN2ZXJzaW9uICYmICFzdGF0ZS5vcHRpb24ubW96KSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmVzMykge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSAzO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcHRpb24uZXNuZXh0KSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLmVzdmVyc2lvbiA9IDY7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSA1O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLmluRVM1KCkpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgZWNtYUlkZW50aWZpZXJzWzVdKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGVjbWFJZGVudGlmaWVyc1s2XSk7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogVXNlIGBpbmAgdG8gY2hlY2sgZm9yIHRoZSBwcmVzZW5jZSBvZiBhbnkgZXhwbGljaXRseS1zcGVjaWZpZWQgdmFsdWUgZm9yXG4gICAgICAgICAqIGBnbG9iYWxzdHJpY3RgIGJlY2F1c2UgYm90aCBgdHJ1ZWAgYW5kIGBmYWxzZWAgc2hvdWxkIHRyaWdnZXIgYW4gZXJyb3IuXG4gICAgICAgICAqL1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnN0cmljdCA9PT0gXCJnbG9iYWxcIiAmJiBcImdsb2JhbHN0cmljdFwiIGluIHN0YXRlLm9wdGlvbikge1xuICAgICAgICAgICAgcXVpdChcIkUwNTlcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwic3RyaWN0XCIsIFwiZ2xvYmFsc3RyaWN0XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5tb2R1bGUpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IFwiZ2xvYmFsXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFRPRE86IEV4dGVuZCB0aGlzIHJlc3RyaWN0aW9uIHRvICphbGwqIEVTNi1zcGVjaWZpYyBvcHRpb25zLlxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEzNFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJtb2R1bGVcIiwgNik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmNvdWNoKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGNvdWNoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ucXVuaXQpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgcXVuaXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5yaGlubykge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCByaGlubyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnNoZWxsanMpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgc2hlbGxqcyk7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIG5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24udHlwZWQpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgdHlwZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5waGFudG9tKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHBoYW50b20pO1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc3RyaWN0ID0gXCJnbG9iYWxcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ucHJvdG90eXBlanMpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgcHJvdG90eXBlanMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub2RlKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIG5vZGUpO1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCB0eXBlZCk7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnN0cmljdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSBcImdsb2JhbFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5kZXZlbCkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBkZXZlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmRvam8pIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgZG9qbyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmJyb3dzZXIpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgYnJvd3Nlcik7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHR5cGVkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uYnJvd3NlcmlmeSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBicm93c2VyKTtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgdHlwZWQpO1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBicm93c2VyaWZ5KTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IFwiZ2xvYmFsXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm5vbnN0YW5kYXJkKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIG5vbnN0YW5kYXJkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uamFzbWluZSkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBqYXNtaW5lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uanF1ZXJ5KSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGpxdWVyeSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm1vb3Rvb2xzKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIG1vb3Rvb2xzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ud29ya2VyKSB7XG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHdvcmtlcik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLndzaCkge1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCB3c2gpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5nbG9iYWxzdHJpY3QgJiYgc3RhdGUub3B0aW9uLnN0cmljdCAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSBcImdsb2JhbFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi55dWkpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgeXVpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubW9jaGEpIHtcbiAgICAgICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgbW9jaGEpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUHJvZHVjZSBhbiBlcnJvciB3YXJuaW5nLlxuICAgIGZ1bmN0aW9uIHF1aXQoY29kZTogc3RyaW5nLCB0b2tlbiwgYT8sIGI/KSB7XG4gICAgICAgIHZhciBwZXJjZW50YWdlID0gTWF0aC5mbG9vcigodG9rZW4ubGluZSAvIHN0YXRlLmxpbmVzLmxlbmd0aCkgKiAxMDApO1xuICAgICAgICB2YXIgbWVzc2FnZSA9IGVycm9yc1tjb2RlXS5kZXNjO1xuXG4gICAgICAgIHZhciBleGNlcHRpb24gPSB7XG4gICAgICAgICAgICBuYW1lOiBcIkpTSGludEVycm9yXCIsXG4gICAgICAgICAgICBsaW5lOiB0b2tlbi5saW5lLFxuICAgICAgICAgICAgY2hhcmFjdGVyOiB0b2tlbi5mcm9tLFxuICAgICAgICAgICAgbWVzc2FnZTogbWVzc2FnZSArIFwiIChcIiArIHBlcmNlbnRhZ2UgKyBcIiUgc2Nhbm5lZCkuXCIsXG4gICAgICAgICAgICByYXc6IG1lc3NhZ2UsXG4gICAgICAgICAgICBjb2RlOiBjb2RlLFxuICAgICAgICAgICAgYTogYSxcbiAgICAgICAgICAgIGI6IGIsXG4gICAgICAgICAgICByZWFzb246IHZvaWQgMFxuICAgICAgICB9O1xuXG4gICAgICAgIGV4Y2VwdGlvbi5yZWFzb24gPSBzdXBwbGFudChtZXNzYWdlLCBleGNlcHRpb24pICsgXCIgKFwiICsgcGVyY2VudGFnZSArXG4gICAgICAgICAgICBcIiUgc2Nhbm5lZCkuXCI7XG5cbiAgICAgICAgdGhyb3cgZXhjZXB0aW9uO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlbW92ZUlnbm9yZWRNZXNzYWdlcygpIHtcbiAgICAgICAgdmFyIGlnbm9yZWQ6IHsgW2xpbmU6IHN0cmluZ106IGJvb2xlYW4gfSA9IHN0YXRlLmlnbm9yZWRMaW5lcztcblxuICAgICAgICBpZiAoaXNFbXB0eShpZ25vcmVkKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBlcnJvcnM6IHt9W10gPSBKU0hJTlQuZXJyb3JzO1xuICAgICAgICBKU0hJTlQuZXJyb3JzID0gcmVqZWN0KGVycm9ycywgZnVuY3Rpb24oZXJyOiB7IGxpbmU6IHN0cmluZyB9KSB7IHJldHVybiBpZ25vcmVkW2Vyci5saW5lXSB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YXJuaW5nKGNvZGU6IHN0cmluZywgdD8sIGE/LCBiPywgYz8sIGQ/KSB7XG4gICAgICAgIHZhciBjaCwgbCwgdywgbXNnO1xuXG4gICAgICAgIGlmICgvXldcXGR7M30kLy50ZXN0KGNvZGUpKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaWdub3JlZFtjb2RlXSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIG1zZyA9IHdhcm5pbmdzW2NvZGVdO1xuICAgICAgICB9IGVsc2UgaWYgKC9FXFxkezN9Ly50ZXN0KGNvZGUpKSB7XG4gICAgICAgICAgICBtc2cgPSBlcnJvcnNbY29kZV07XG4gICAgICAgIH0gZWxzZSBpZiAoL0lcXGR7M30vLnRlc3QoY29kZSkpIHtcbiAgICAgICAgICAgIG1zZyA9IGluZm9bY29kZV07XG4gICAgICAgIH1cblxuICAgICAgICB0ID0gdCB8fCBzdGF0ZS50b2tlbnMubmV4dCB8fCB7fTtcbiAgICAgICAgaWYgKHQuaWQgPT09IFwiKGVuZClcIikgeyAgLy8gYH5cbiAgICAgICAgICAgIHQgPSBzdGF0ZS50b2tlbnMuY3VycjtcbiAgICAgICAgfVxuXG4gICAgICAgIGwgPSB0LmxpbmU7XG4gICAgICAgIGNoID0gdC5mcm9tO1xuXG4gICAgICAgIHcgPSB7XG4gICAgICAgICAgICBpZDogXCIoZXJyb3IpXCIsXG4gICAgICAgICAgICByYXc6IG1zZy5kZXNjLFxuICAgICAgICAgICAgY29kZTogbXNnLmNvZGUsXG4gICAgICAgICAgICBldmlkZW5jZTogc3RhdGUubGluZXNbbCAtIDFdIHx8IFwiXCIsXG4gICAgICAgICAgICBsaW5lOiBsLFxuICAgICAgICAgICAgY2hhcmFjdGVyOiBjaCxcbiAgICAgICAgICAgIHNjb3BlOiBKU0hJTlQuc2NvcGUsXG4gICAgICAgICAgICBhOiBhLFxuICAgICAgICAgICAgYjogYixcbiAgICAgICAgICAgIGM6IGMsXG4gICAgICAgICAgICBkOiBkXG4gICAgICAgIH07XG5cbiAgICAgICAgdy5yZWFzb24gPSBzdXBwbGFudChtc2cuZGVzYywgdyk7XG4gICAgICAgIEpTSElOVC5lcnJvcnMucHVzaCh3KTtcblxuICAgICAgICByZW1vdmVJZ25vcmVkTWVzc2FnZXMoKTtcblxuICAgICAgICBpZiAoSlNISU5ULmVycm9ycy5sZW5ndGggPj0gc3RhdGUub3B0aW9uLm1heGVycilcbiAgICAgICAgICAgIHF1aXQoXCJFMDQzXCIsIHQpO1xuXG4gICAgICAgIHJldHVybiB3O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhcm5pbmdBdChtLCBsLCBjaCwgYT8sIGI/LCBjPywgZD8pIHtcbiAgICAgICAgcmV0dXJuIHdhcm5pbmcobSwge1xuICAgICAgICAgICAgbGluZTogbCxcbiAgICAgICAgICAgIGZyb206IGNoXG4gICAgICAgIH0sIGEsIGIsIGMsIGQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKG06IHN0cmluZywgdD8sIGE/LCBiPywgYz8sIGQ/KSB7XG4gICAgICAgIHdhcm5pbmcobSwgdCwgYSwgYiwgYywgZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3JBdChtLCBsLCBjaD8sIGE/LCBiPywgYz8sIGQ/KSB7XG4gICAgICAgIHJldHVybiBlcnJvcihtLCB7XG4gICAgICAgICAgICBsaW5lOiBsLFxuICAgICAgICAgICAgZnJvbTogY2hcbiAgICAgICAgfSwgYSwgYiwgYywgZCk7XG4gICAgfVxuXG4gICAgLy8gVHJhY2tpbmcgb2YgXCJpbnRlcm5hbFwiIHNjcmlwdHMsIGxpa2UgZXZhbCBjb250YWluaW5nIGEgc3RhdGljIHN0cmluZ1xuICAgIGZ1bmN0aW9uIGFkZEludGVybmFsU3JjKGVsZW0sIHNyYykge1xuICAgICAgICB2YXIgaTtcbiAgICAgICAgaSA9IHtcbiAgICAgICAgICAgIGlkOiBcIihpbnRlcm5hbClcIixcbiAgICAgICAgICAgIGVsZW06IGVsZW0sXG4gICAgICAgICAgICB2YWx1ZTogc3JjXG4gICAgICAgIH07XG4gICAgICAgIEpTSElOVC5pbnRlcm5hbHMucHVzaChpKTtcbiAgICAgICAgcmV0dXJuIGk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZG9PcHRpb24oKSB7XG4gICAgICAgIHZhciBudCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICB2YXIgYm9keSA9IG50LmJvZHkuc3BsaXQoXCIsXCIpLm1hcChmdW5jdGlvbihzKSB7IHJldHVybiBzLnRyaW0oKTsgfSk7XG5cbiAgICAgICAgdmFyIHByZWRlZiA9IHt9O1xuICAgICAgICBpZiAobnQudHlwZSA9PT0gXCJnbG9iYWxzXCIpIHtcbiAgICAgICAgICAgIGJvZHkuZm9yRWFjaChmdW5jdGlvbihnLCBpZHgpIHtcbiAgICAgICAgICAgICAgICBnID0gZy5zcGxpdChcIjpcIik7XG4gICAgICAgICAgICAgICAgdmFyIGtleTogc3RyaW5nID0gKGdbMF0gfHwgXCJcIikudHJpbSgpO1xuICAgICAgICAgICAgICAgIHZhciB2YWwgPSAoZ1sxXSB8fCBcIlwiKS50cmltKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcIi1cIiB8fCAha2V5Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgdHJhaWxpbmcgY29tbWFcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlkeCA+IDAgJiYgaWR4ID09PSBib2R5Lmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleS5jaGFyQXQoMCkgPT09IFwiLVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGtleSA9IGtleS5zbGljZSgxKTtcbiAgICAgICAgICAgICAgICAgICAgdmFsID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgSlNISU5ULmJsYWNrbGlzdFtrZXldID0ga2V5O1xuICAgICAgICAgICAgICAgICAgICBkZWxldGUgcHJlZGVmaW5lZFtrZXldO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByZWRlZltrZXldID0gKHZhbCA9PT0gXCJ0cnVlXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIHByZWRlZik7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGtleSBpbiBwcmVkZWYpIHtcbiAgICAgICAgICAgICAgICBpZiAoaGFzKHByZWRlZiwga2V5KSkge1xuICAgICAgICAgICAgICAgICAgICBkZWNsYXJlZFtrZXldID0gbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwiZXhwb3J0ZWRcIikge1xuICAgICAgICAgICAgYm9keS5mb3JFYWNoKGZ1bmN0aW9uKGUsIGlkeCkge1xuICAgICAgICAgICAgICAgIGlmICghZS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWdub3JlIHRyYWlsaW5nIGNvbW1hXG4gICAgICAgICAgICAgICAgICAgIGlmIChpZHggPiAwICYmIGlkeCA9PT0gYm9keS5sZW5ndGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRFeHBvcnRlZChlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwibWVtYmVyc1wiKSB7XG4gICAgICAgICAgICBtZW1iZXJzT25seSA9IG1lbWJlcnNPbmx5IHx8IHt9O1xuXG4gICAgICAgICAgICBib2R5LmZvckVhY2goZnVuY3Rpb24obSkge1xuICAgICAgICAgICAgICAgIHZhciBjaDEgPSBtLmNoYXJBdCgwKTtcbiAgICAgICAgICAgICAgICB2YXIgY2gyID0gbS5jaGFyQXQobS5sZW5ndGggLSAxKTtcblxuICAgICAgICAgICAgICAgIGlmIChjaDEgPT09IGNoMiAmJiAoY2gxID09PSBcIlxcXCJcIiB8fCBjaDEgPT09IFwiJ1wiKSkge1xuICAgICAgICAgICAgICAgICAgICBtID0gbVxuICAgICAgICAgICAgICAgICAgICAgICAgLnN1YnN0cigxLCBtLmxlbmd0aCAtIDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShcIlxcXFxcXFwiXCIsIFwiXFxcIlwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtZW1iZXJzT25seVttXSA9IGZhbHNlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbnVtdmFscyA9IFtcbiAgICAgICAgICAgIFwibWF4c3RhdGVtZW50c1wiLFxuICAgICAgICAgICAgXCJtYXhwYXJhbXNcIixcbiAgICAgICAgICAgIFwibWF4ZGVwdGhcIixcbiAgICAgICAgICAgIFwibWF4Y29tcGxleGl0eVwiLFxuICAgICAgICAgICAgXCJtYXhlcnJcIixcbiAgICAgICAgICAgIFwibWF4bGVuXCIsXG4gICAgICAgICAgICBcImluZGVudFwiXG4gICAgICAgIF07XG5cbiAgICAgICAgaWYgKG50LnR5cGUgPT09IFwianNoaW50XCIgfHwgbnQudHlwZSA9PT0gXCJqc2xpbnRcIikge1xuICAgICAgICAgICAgYm9keS5mb3JFYWNoKGZ1bmN0aW9uKGcpIHtcbiAgICAgICAgICAgICAgICBnID0gZy5zcGxpdChcIjpcIik7XG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IChnWzBdIHx8IFwiXCIpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gKGdbMV0gfHwgXCJcIikudHJpbSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja09wdGlvbihrZXksIG50KSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG51bXZhbHMuaW5kZXhPZihrZXkpID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gR0g5ODggLSBudW1lcmljIG9wdGlvbnMgY2FuIGJlIGRpc2FibGVkIGJ5IHNldHRpbmcgdGhlbSB0byBgZmFsc2VgXG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWwgIT09IFwiZmFsc2VcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gK3ZhbDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWwgIT09IFwibnVtYmVyXCIgfHwgIWlzRmluaXRlKHZhbCkgfHwgdmFsIDw9IDAgfHwgTWF0aC5mbG9vcih2YWwpICE9PSB2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzJcIiwgbnQsIGdbMV0udHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbltrZXldID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW2tleV0gPSBrZXkgPT09IFwiaW5kZW50XCIgPyA0IDogZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogVE9ETzogUmVtb3ZlIGluIEpTSGludCAzXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJlczVcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsID09PSBcInRydWVcIiAmJiBzdGF0ZS5vcHRpb24uZXM1KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiSTAwM1wiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwidmFsaWR0aGlzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYHZhbGlkdGhpc2AgaXMgdmFsaWQgb25seSB3aXRoaW4gYSBmdW5jdGlvbiBzY29wZS5cblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuZnVuY3RbXCIoZ2xvYmFsKVwiXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIGVycm9yKFwiRTAwOVwiKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsICE9PSBcInRydWVcIiAmJiB2YWwgIT09IFwiZmFsc2VcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIGVycm9yKFwiRTAwMlwiLCBudCk7XG5cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnZhbGlkdGhpcyA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwicXVvdG1hcmtcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRydWVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJmYWxzZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5xdW90bWFyayA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJkb3VibGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzaW5nbGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ucXVvdG1hcmsgPSB2YWw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAwMlwiLCBudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChrZXkgPT09IFwic2hhZG93XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnNoYWRvdyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwib3V0ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc2hhZG93ID0gXCJvdXRlclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiaW5uZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc2hhZG93ID0gXCJpbm5lclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcInVudXNlZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi51bnVzZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnVudXNlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInZhcnNcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzdHJpY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24udW51c2VkID0gdmFsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcImxhdGVkZWZcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRydWVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm5vZnVuY1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5sYXRlZGVmID0gXCJub2Z1bmNcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJpZ25vcmVcIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImxpbmVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5pZ25vcmVkTGluZXNbbnQubGluZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZUlnbm9yZWRNZXNzYWdlcygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDJcIiwgbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5ID09PSBcInN0cmljdFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5zdHJpY3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZ1bmNcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJnbG9iYWxcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbXBsaWVkXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLnN0cmljdCA9IHZhbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJtb2R1bGVcIikge1xuICAgICAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgICAgICogVE9ETzogRXh0ZW5kIHRoaXMgcmVzdHJpY3Rpb24gdG8gKmFsbCogXCJlbnZpcm9ubWVudGFsXCIgb3B0aW9ucy5cbiAgICAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgICAgIGlmICghaGFzUGFyc2VkQ29kZShzdGF0ZS5mdW5jdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTA1NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJtb2R1bGVcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBUT0RPOiBSZW1vdmUgaW4gSlNIaW50IDNcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgZXN2ZXJzaW9ucyA9IHtcbiAgICAgICAgICAgICAgICAgICAgZXMzOiAzLFxuICAgICAgICAgICAgICAgICAgICBlczU6IDUsXG4gICAgICAgICAgICAgICAgICAgIGVzbmV4dDogNlxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKGhhcyhlc3ZlcnNpb25zLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodmFsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5tb3ogPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uZXN2ZXJzaW9uID0gZXN2ZXJzaW9uc1trZXldO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24ubW96KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSA1O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGtleSA9PT0gXCJlc3ZlcnNpb25cIikge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuaW5FUzUodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkkwMDNcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjNcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCI2XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLm1veiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5lc3ZlcnNpb24gPSArdmFsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjIwMTVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ubW96ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLmVzdmVyc2lvbiA9IDY7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAwMlwiLCBudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNQYXJzZWRDb2RlKHN0YXRlLmZ1bmN0KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDU1XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImVzdmVyc2lvblwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gL14oWystXSkoV1xcZHszfSkkL2cuZXhlYyhrZXkpO1xuICAgICAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZ25vcmUgZm9yIC1XLi4uLCB1bmlnbm9yZSBmb3IgK1cuLi5cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuaWdub3JlZFttYXRjaFsyXV0gPSAobWF0Y2hbMV0gPT09IFwiLVwiKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciB0bjtcbiAgICAgICAgICAgICAgICBpZiAodmFsID09PSBcInRydWVcIiB8fCB2YWwgPT09IFwiZmFsc2VcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAobnQudHlwZSA9PT0gXCJqc2xpbnRcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdG4gPSByZW5hbWVkW2tleV0gfHwga2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW3RuXSA9ICh2YWwgPT09IFwidHJ1ZVwiKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGludmVydGVkW3RuXSAhPT0gdm9pZCAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW3RuXSA9ICFzdGF0ZS5vcHRpb25bdG5dO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uW2tleV0gPSAodmFsID09PSBcInRydWVcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDAyXCIsIG50KTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBhc3N1bWUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdlIG5lZWQgYSBwZWVrIGZ1bmN0aW9uLiBJZiBpdCBoYXMgYW4gYXJndW1lbnQsIGl0IHBlZWtzIHRoYXQgbXVjaCBmYXJ0aGVyXG4gICAgLy8gYWhlYWQuIEl0IGlzIHVzZWQgdG8gZGlzdGluZ3Vpc2hcbiAgICAvLyAgICAgZm9yICggdmFyIGkgaW4gLi4uXG4gICAgLy8gZnJvbVxuICAgIC8vICAgICBmb3IgKCB2YXIgaSA9IC4uLlxuXG4gICAgZnVuY3Rpb24gcGVlayhwPykge1xuICAgICAgICB2YXIgaSA9IHAgfHwgMCwgaiA9IGxvb2thaGVhZC5sZW5ndGgsIHQ7XG5cbiAgICAgICAgaWYgKGkgPCBqKSB7XG4gICAgICAgICAgICByZXR1cm4gbG9va2FoZWFkW2ldO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGogPD0gaSkge1xuICAgICAgICAgICAgdCA9IGxvb2thaGVhZFtqXTtcbiAgICAgICAgICAgIGlmICghdCkge1xuICAgICAgICAgICAgICAgIHQgPSBsb29rYWhlYWRbal0gPSBsZXgudG9rZW4oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGogKz0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBlZWtpbmcgcGFzdCB0aGUgZW5kIG9mIHRoZSBwcm9ncmFtIHNob3VsZCBwcm9kdWNlIHRoZSBcIihlbmQpXCIgdG9rZW4uXG4gICAgICAgIGlmICghdCAmJiBzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIoZW5kKVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWVrSWdub3JlRU9MKCkge1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIHZhciB0O1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICB0ID0gcGVlayhpKyspO1xuICAgICAgICB9IHdoaWxlICh0LmlkID09PSBcIihlbmRsaW5lKVwiKTtcbiAgICAgICAgcmV0dXJuIHQ7XG4gICAgfVxuXG4gICAgLy8gUHJvZHVjZSB0aGUgbmV4dCB0b2tlbi4gSXQgbG9va3MgZm9yIHByb2dyYW1taW5nIGVycm9ycy5cblxuICAgIGZ1bmN0aW9uIGFkdmFuY2UoaWQ/LCB0Pykge1xuXG4gICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLmN1cnIuaWQpIHtcbiAgICAgICAgICAgIGNhc2UgXCIobnVtYmVyKVwiOlxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDVcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIi1cIiB8fCBzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCItLVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA2XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCIrXCI6XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIitcIiB8fCBzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIrK1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA3XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpZCAmJiBzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gaWQpIHtcbiAgICAgICAgICAgIGlmICh0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDE5XCIsIHQsIHQuaWQpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyMFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgaWQsIHQuaWQsIHQubGluZSwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQudHlwZSAhPT0gXCIoaWRlbnRpZmllcilcIiB8fCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSAhPT0gaWQpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgaWQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlLnRva2Vucy5wcmV2ID0gc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHN0YXRlLnRva2Vucy5jdXJyID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dCA9IGxvb2thaGVhZC5zaGlmdCgpIHx8IGxleC50b2tlbigpO1xuXG4gICAgICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0KSB7IC8vIE5vIG1vcmUgdG9rZW5zIGxlZnQsIGdpdmUgdXBcbiAgICAgICAgICAgICAgICBxdWl0KFwiRTA0MVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIoZW5kKVwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlcnJvcilcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmNoZWNrKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQuY2hlY2soKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlzU3BlY2lhbCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcImZhbGxzIHRocm91Z2hcIikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5jYXNlRmFsbHNUaHJvdWdoID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkb09wdGlvbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIihlbmRsaW5lKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzSW5maXgodG9rZW4pIHtcbiAgICAgICAgcmV0dXJuIHRva2VuLmluZml4IHx8ICghdG9rZW4uaWRlbnRpZmllciAmJiAhdG9rZW4udGVtcGxhdGUgJiYgISF0b2tlbi5sZWQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzRW5kT2ZFeHByKCkge1xuICAgICAgICB2YXIgY3VyciA9IHN0YXRlLnRva2Vucy5jdXJyO1xuICAgICAgICB2YXIgbmV4dCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICBpZiAobmV4dC5pZCA9PT0gXCI7XCIgfHwgbmV4dC5pZCA9PT0gXCJ9XCIgfHwgbmV4dC5pZCA9PT0gXCI6XCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc0luZml4KG5leHQpID09PSBpc0luZml4KGN1cnIpIHx8IChjdXJyLmlkID09PSBcInlpZWxkXCIgJiYgc3RhdGUuaW5Nb3ooKSkpIHtcbiAgICAgICAgICAgIHJldHVybiBjdXJyLmxpbmUgIT09IHN0YXJ0TGluZShuZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNCZWdpbk9mRXhwcihwcmV2KSB7XG4gICAgICAgIHJldHVybiAhcHJldi5sZWZ0ICYmIHByZXYuYXJpdHkgIT09IFwidW5hcnlcIjtcbiAgICB9XG5cbiAgICAvLyBUaGlzIGlzIHRoZSBoZWFydCBvZiBKU0hJTlQsIHRoZSBQcmF0dCBwYXJzZXIuIEluIGFkZGl0aW9uIHRvIHBhcnNpbmcsIGl0XG4gICAgLy8gaXMgbG9va2luZyBmb3IgYWQgaG9jIGxpbnQgcGF0dGVybnMuIFdlIGFkZCAuZnVkIHRvIFByYXR0J3MgbW9kZWwsIHdoaWNoIGlzXG4gICAgLy8gbGlrZSAubnVkIGV4Y2VwdCB0aGF0IGl0IGlzIG9ubHkgdXNlZCBvbiB0aGUgZmlyc3QgdG9rZW4gb2YgYSBzdGF0ZW1lbnQuXG4gICAgLy8gSGF2aW5nIC5mdWQgbWFrZXMgaXQgbXVjaCBlYXNpZXIgdG8gZGVmaW5lIHN0YXRlbWVudC1vcmllbnRlZCBsYW5ndWFnZXMgbGlrZVxuICAgIC8vIEphdmFTY3JpcHQuIEkgcmV0YWluZWQgUHJhdHQncyBub21lbmNsYXR1cmUuXG5cbiAgICAvLyAubnVkICBOdWxsIGRlbm90YXRpb25cbiAgICAvLyAuZnVkICBGaXJzdCBudWxsIGRlbm90YXRpb25cbiAgICAvLyAubGVkICBMZWZ0IGRlbm90YXRpb25cbiAgICAvLyAgbGJwICBMZWZ0IGJpbmRpbmcgcG93ZXJcbiAgICAvLyAgcmJwICBSaWdodCBiaW5kaW5nIHBvd2VyXG5cbiAgICAvLyBUaGV5IGFyZSBlbGVtZW50cyBvZiB0aGUgcGFyc2luZyBtZXRob2QgY2FsbGVkIFRvcCBEb3duIE9wZXJhdG9yIFByZWNlZGVuY2UuXG5cbiAgICBmdW5jdGlvbiBleHByZXNzaW9uKHJicCwgaW5pdGlhbD8pIHtcbiAgICAgICAgdmFyIGxlZnQsIGlzQXJyYXkgPSBmYWxzZSwgaXNPYmplY3QgPSBmYWxzZSwgaXNMZXRFeHByID0gZmFsc2U7XG5cbiAgICAgICAgc3RhdGUubmFtZVN0YWNrLnB1c2goKTtcblxuICAgICAgICAvLyBpZiBjdXJyZW50IGV4cHJlc3Npb24gaXMgYSBsZXQgZXhwcmVzc2lvblxuICAgICAgICBpZiAoIWluaXRpYWwgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwibGV0XCIgJiYgcGVlaygwKS52YWx1ZSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImxldCBleHByZXNzaW9uc1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlzTGV0RXhwciA9IHRydWU7XG4gICAgICAgICAgICAvLyBjcmVhdGUgYSBuZXcgYmxvY2sgc2NvcGUgd2UgdXNlIG9ubHkgZm9yIHRoZSBjdXJyZW50IGV4cHJlc3Npb25cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjaygpO1xuICAgICAgICAgICAgYWR2YW5jZShcImxldFwiKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuICAgICAgICAgICAgc3RhdGUudG9rZW5zLnByZXYuZnVkKCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIoZW5kKVwiKVxuICAgICAgICAgICAgZXJyb3IoXCJFMDA2XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcblxuICAgICAgICB2YXIgaXNEYW5nZXJvdXMgPVxuICAgICAgICAgICAgc3RhdGUub3B0aW9uLmFzaSAmJlxuICAgICAgICAgICAgc3RhdGUudG9rZW5zLnByZXYubGluZSAhPT0gc3RhcnRMaW5lKHN0YXRlLnRva2Vucy5jdXJyKSAmJlxuICAgICAgICAgICAgY29udGFpbnMoW1wiXVwiLCBcIilcIl0sIHN0YXRlLnRva2Vucy5wcmV2LmlkKSAmJlxuICAgICAgICAgICAgY29udGFpbnMoW1wiW1wiLCBcIihcIl0sIHN0YXRlLnRva2Vucy5jdXJyLmlkKTtcblxuICAgICAgICBpZiAoaXNEYW5nZXJvdXMpXG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAxNFwiLCBzdGF0ZS50b2tlbnMuY3Vyciwgc3RhdGUudG9rZW5zLmN1cnIuaWQpO1xuXG4gICAgICAgIGFkdmFuY2UoKTtcblxuICAgICAgICBpZiAoaW5pdGlhbCkge1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIodmVyYilcIl0gPSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZTtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmJlZ2luc1N0bXQgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGluaXRpYWwgPT09IHRydWUgJiYgc3RhdGUudG9rZW5zLmN1cnIuZnVkKSB7XG4gICAgICAgICAgICBsZWZ0ID0gc3RhdGUudG9rZW5zLmN1cnIuZnVkKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLmN1cnIubnVkKSB7XG4gICAgICAgICAgICAgICAgbGVmdCA9IHN0YXRlLnRva2Vucy5jdXJyLm51ZCgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzBcIiwgc3RhdGUudG9rZW5zLmN1cnIsIHN0YXRlLnRva2Vucy5jdXJyLmlkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVE9ETzogdXNlIHByYXR0IG1lY2hhbmljcyByYXRoZXIgdGhhbiBzcGVjaWFsIGNhc2luZyB0ZW1wbGF0ZSB0b2tlbnNcbiAgICAgICAgICAgIHdoaWxlICgocmJwIDwgc3RhdGUudG9rZW5zLm5leHQubGJwIHx8IHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHRlbXBsYXRlKVwiKSAmJlxuICAgICAgICAgICAgICAgICFpc0VuZE9mRXhwcigpKSB7XG4gICAgICAgICAgICAgICAgaXNBcnJheSA9IHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlID09PSBcIkFycmF5XCI7XG4gICAgICAgICAgICAgICAgaXNPYmplY3QgPSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSA9PT0gXCJPYmplY3RcIjtcblxuICAgICAgICAgICAgICAgIC8vICM1MjcsIG5ldyBGb28uQXJyYXkoKSwgRm9vLkFycmF5KCksIG5ldyBGb28uT2JqZWN0KCksIEZvby5PYmplY3QoKVxuICAgICAgICAgICAgICAgIC8vIExpbmUgYnJlYWtzIGluIElmU3RhdGVtZW50IGhlYWRzIGV4aXN0IHRvIHNhdGlzZnkgdGhlIGNoZWNrSlNIaW50XG4gICAgICAgICAgICAgICAgLy8gXCJMaW5lIHRvbyBsb25nLlwiIGVycm9yLlxuICAgICAgICAgICAgICAgIGlmIChsZWZ0ICYmIChsZWZ0LnZhbHVlIHx8IChsZWZ0LmZpcnN0ICYmIGxlZnQuZmlyc3QudmFsdWUpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgbGVmdC52YWx1ZSBpcyBub3QgXCJuZXdcIiwgb3IgdGhlIGxlZnQuZmlyc3QudmFsdWUgaXMgYSBcIi5cIlxuICAgICAgICAgICAgICAgICAgICAvLyB0aGVuIHNhZmVseSBhc3N1bWUgdGhhdCB0aGlzIGlzIG5vdCBcIm5ldyBBcnJheSgpXCIgYW5kIHBvc3NpYmx5XG4gICAgICAgICAgICAgICAgICAgIC8vIG5vdCBcIm5ldyBPYmplY3QoKVwiLi4uXG4gICAgICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlICE9PSBcIm5ld1wiIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAobGVmdC5maXJzdCAmJiBsZWZ0LmZpcnN0LnZhbHVlICYmIGxlZnQuZmlyc3QudmFsdWUgPT09IFwiLlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNBcnJheSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gLi4uSW4gdGhlIGNhc2Ugb2YgT2JqZWN0LCBpZiB0aGUgbGVmdC52YWx1ZSBhbmQgc3RhdGUudG9rZW5zLmN1cnIudmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFyZSBub3QgZXF1YWwsIHRoZW4gc2FmZWx5IGFzc3VtZSB0aGF0IHRoaXMgbm90IFwibmV3IE9iamVjdCgpXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlICE9PSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzT2JqZWN0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNBcnJheSAmJiBzdGF0ZS50b2tlbnMuY3Vyci5pZCA9PT0gXCIoXCIgJiYgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA5XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNPYmplY3QgJiYgc3RhdGUudG9rZW5zLmN1cnIuaWQgPT09IFwiKFwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxMFwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGxlZnQgJiYgc3RhdGUudG9rZW5zLmN1cnIubGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlZnQgPSBzdGF0ZS50b2tlbnMuY3Vyci5sZWQobGVmdCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDMzXCIsIHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMuY3Vyci5pZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpc0xldEV4cHIpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgIH1cblxuICAgICAgICBzdGF0ZS5uYW1lU3RhY2sucG9wKCk7XG5cbiAgICAgICAgcmV0dXJuIGxlZnQ7XG4gICAgfVxuXG5cbiAgICAvLyBGdW5jdGlvbnMgZm9yIGNvbmZvcm1hbmNlIG9mIHN0eWxlLlxuXG4gICAgZnVuY3Rpb24gc3RhcnRMaW5lKHRva2VuKSB7XG4gICAgICAgIHJldHVybiB0b2tlbi5zdGFydExpbmUgfHwgdG9rZW4ubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub2JyZWFrbm9uYWRqYWNlbnQobGVmdCwgcmlnaHQpIHtcbiAgICAgICAgbGVmdCA9IGxlZnQgfHwgc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHJpZ2h0ID0gcmlnaHQgfHwgc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmxheGJyZWFrICYmIGxlZnQubGluZSAhPT0gc3RhcnRMaW5lKHJpZ2h0KSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMTRcIiwgcmlnaHQsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG5vbGluZWJyZWFrKHQpIHtcbiAgICAgICAgdCA9IHQgfHwgc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIGlmICh0LmxpbmUgIT09IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJFMDIyXCIsIHQsIHQudmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9icmVha2NvbW1hKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIGlmIChsZWZ0LmxpbmUgIT09IHN0YXJ0TGluZShyaWdodCkpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmxheGNvbW1hKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbW1hWydmaXJzdCddKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJJMDAxXCIpO1xuICAgICAgICAgICAgICAgICAgICBjb21tYVsnZmlyc3QnXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxNFwiLCBsZWZ0LCByaWdodC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21tYShvcHRzPykge1xuICAgICAgICBvcHRzID0gb3B0cyB8fCB7fTtcblxuICAgICAgICBpZiAoIW9wdHMucGVlaykge1xuICAgICAgICAgICAgbm9icmVha2NvbW1hKHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5vYnJlYWtjb21tYShzdGF0ZS50b2tlbnMucHJldiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIgJiYgIShvcHRzLnByb3BlcnR5ICYmIHN0YXRlLmluRVM1KCkpKSB7XG4gICAgICAgICAgICAvLyBLZXl3b3JkcyB0aGF0IGNhbm5vdCBmb2xsb3cgYSBjb21tYSBvcGVyYXRvci5cbiAgICAgICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwiYnJlYWtcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2FzZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJjYXRjaFwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJjb250aW51ZVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJkZWZhdWx0XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcImRvXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcImVsc2VcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiZmluYWxseVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJmb3JcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaWZcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaW5cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiaW5zdGFuY2VvZlwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJyZXR1cm5cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwic3dpdGNoXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcInRocm93XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcInRyeVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2YXJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwibGV0XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIndoaWxlXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIndpdGhcIjpcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcIihwdW5jdHVhdG9yKVwiKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBcIn1cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiXVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCIsXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRzLmFsbG93VHJhaWxpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICAgICAgY2FzZSBcIilcIjpcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBGdW5jdGlvbmFsIGNvbnN0cnVjdG9ycyBmb3IgbWFraW5nIHRoZSBzeW1ib2xzIHRoYXQgd2lsbCBiZSBpbmhlcml0ZWQgYnlcbiAgICAvLyB0b2tlbnMuXG5cbiAgICBmdW5jdGlvbiBzeW1ib2woczogc3RyaW5nLCBwKSB7XG4gICAgICAgIHZhciB4ID0gc3RhdGUuc3ludGF4W3NdO1xuICAgICAgICBpZiAoIXggfHwgdHlwZW9mIHggIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIHN0YXRlLnN5bnRheFtzXSA9IHggPSB7XG4gICAgICAgICAgICAgICAgaWQ6IHMsXG4gICAgICAgICAgICAgICAgbGJwOiBwLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlbGltKHM6IHN0cmluZykge1xuICAgICAgICB2YXIgeCA9IHN5bWJvbChzLCAwKTtcbiAgICAgICAgeC5kZWxpbSA9IHRydWU7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0bXQoczogc3RyaW5nLCBmKSB7XG4gICAgICAgIHZhciB4ID0gZGVsaW0ocyk7XG4gICAgICAgIHguaWRlbnRpZmllciA9IHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB4LmZ1ZCA9IGY7XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJsb2Nrc3RtdChzOiBzdHJpbmcsIGYpIHtcbiAgICAgICAgdmFyIHggPSBzdG10KHMsIGYpO1xuICAgICAgICB4LmJsb2NrID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzZXJ2ZU5hbWUoeDogeyBpZDogc3RyaW5nOyBpZGVudGlmaWVyPzsgcmVzZXJ2ZWQ/fSkge1xuICAgICAgICB2YXIgYyA9IHguaWQuY2hhckF0KDApO1xuICAgICAgICBpZiAoKGMgPj0gXCJhXCIgJiYgYyA8PSBcInpcIikgfHwgKGMgPj0gXCJBXCIgJiYgYyA8PSBcIlpcIikpIHtcbiAgICAgICAgICAgIHguaWRlbnRpZmllciA9IHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHByZWZpeChzOiBzdHJpbmcsIGY/KSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIDE1MCk7XG4gICAgICAgIHJlc2VydmVOYW1lKHgpO1xuXG4gICAgICAgIHgubnVkID0gKHR5cGVvZiBmID09PSBcImZ1bmN0aW9uXCIpID8gZiA6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5hcml0eSA9IFwidW5hcnlcIjtcbiAgICAgICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDE1MCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmlkID09PSBcIisrXCIgfHwgdGhpcy5pZCA9PT0gXCItLVwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5wbHVzcGx1cykge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxNlwiLCB0aGlzLCB0aGlzLmlkKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucmlnaHQgJiYgKCF0aGlzLnJpZ2h0LmlkZW50aWZpZXIgfHwgaXNSZXNlcnZlZCh0aGlzLnJpZ2h0KSkgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yaWdodC5pZCAhPT0gXCIuXCIgJiYgdGhpcy5yaWdodC5pZCAhPT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTdcIiwgdGhpcyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucmlnaHQgJiYgdGhpcy5yaWdodC5pc01ldGFQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMzFcIiwgdGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIC8vIGRldGVjdCBpbmNyZW1lbnQvZGVjcmVtZW50IG9mIGEgY29uc3RcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIGNhc2Ugb2YgYS5iLCByaWdodCB3aWxsIGJlIHRoZSBcIi5cIiBwdW5jdHVhdG9yXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnJpZ2h0ICYmIHRoaXMucmlnaHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2subW9kaWZ5KHRoaXMucmlnaHQudmFsdWUsIHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdHlwZShzOiBzdHJpbmcsIGZ1bmMpIHtcbiAgICAgICAgdmFyIHggPSBkZWxpbShzKTtcbiAgICAgICAgeC50eXBlID0gcztcbiAgICAgICAgeC5udWQgPSBmdW5jO1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNlcnZlKG5hbWU6IHN0cmluZywgZnVuYz8pIHtcbiAgICAgICAgdmFyIHggPSB0eXBlKG5hbWUsIGZ1bmMpO1xuICAgICAgICB4LmlkZW50aWZpZXIgPSB0cnVlO1xuICAgICAgICB4LnJlc2VydmVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gRnV0dXJlUmVzZXJ2ZWRXb3JkKG5hbWU6IHN0cmluZywgbWV0YT8pIHtcbiAgICAgICAgdmFyIHggPSB0eXBlKG5hbWUsIChtZXRhICYmIG1ldGEubnVkKSB8fCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBtZXRhID0gbWV0YSB8fCB7fTtcbiAgICAgICAgbWV0YS5pc0Z1dHVyZVJlc2VydmVkV29yZCA9IHRydWU7XG5cbiAgICAgICAgeC52YWx1ZSA9IG5hbWU7XG4gICAgICAgIHguaWRlbnRpZmllciA9IHRydWU7XG4gICAgICAgIHgucmVzZXJ2ZWQgPSB0cnVlO1xuICAgICAgICB4Lm1ldGEgPSBtZXRhO1xuXG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc2VydmV2YXIoczogc3RyaW5nLCB2Pykge1xuICAgICAgICByZXR1cm4gcmVzZXJ2ZShzLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgdih0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpbmZpeChzOiBzdHJpbmcsIGYsIHAsIHc/KSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIHApO1xuICAgICAgICByZXNlcnZlTmFtZSh4KTtcbiAgICAgICAgeC5pbmZpeCA9IHRydWU7XG4gICAgICAgIHgubGVkID0gZnVuY3Rpb24obGVmdCkge1xuICAgICAgICAgICAgaWYgKCF3KSB7XG4gICAgICAgICAgICAgICAgbm9icmVha25vbmFkamFjZW50KHN0YXRlLnRva2Vucy5wcmV2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoKHMgPT09IFwiaW5cIiB8fCBzID09PSBcImluc3RhbmNlb2ZcIikgJiYgbGVmdC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCBsZWZ0LCBcIiFcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGYgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiBmKGxlZnQsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbihwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYXBwbGljYXRpb24oczogc3RyaW5nKSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIDQyKTtcblxuICAgICAgICB4LmxlZCA9IGZ1bmN0aW9uKGxlZnQpIHtcbiAgICAgICAgICAgIG5vYnJlYWtub25hZGphY2VudChzdGF0ZS50b2tlbnMucHJldiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuXG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgdGhpcy5yaWdodCA9IGRvRnVuY3Rpb24oeyB0eXBlOiBcImFycm93XCIsIGxvbmVBcmc6IGxlZnQgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVsYXRpb24oczogc3RyaW5nLCBmPykge1xuICAgICAgICB2YXIgeCA9IHN5bWJvbChzLCAxMDApO1xuXG4gICAgICAgIHgubGVkID0gZnVuY3Rpb24obGVmdCkge1xuICAgICAgICAgICAgbm9icmVha25vbmFkamFjZW50KHN0YXRlLnRva2Vucy5wcmV2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgdmFyIHJpZ2h0ID0gdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTAwKTtcblxuICAgICAgICAgICAgaWYgKGlzSWRlbnRpZmllcihsZWZ0LCBcIk5hTlwiKSB8fCBpc0lkZW50aWZpZXIocmlnaHQsIFwiTmFOXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMTlcIiwgdGhpcyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGYpIHtcbiAgICAgICAgICAgICAgICBmLmFwcGx5KHRoaXMsIFtsZWZ0LCByaWdodF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWxlZnQgfHwgIXJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVmdC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCBsZWZ0LCBcIiFcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyaWdodC5pZCA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxOFwiLCByaWdodCwgXCIhXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNQb29yUmVsYXRpb24obm9kZSkge1xuICAgICAgICByZXR1cm4gbm9kZSAmJlxuICAgICAgICAgICAgKChub2RlLnR5cGUgPT09IFwiKG51bWJlcilcIiAmJiArbm9kZS52YWx1ZSA9PT0gMCkgfHxcbiAgICAgICAgICAgICAgICAobm9kZS50eXBlID09PSBcIihzdHJpbmcpXCIgJiYgbm9kZS52YWx1ZSA9PT0gXCJcIikgfHxcbiAgICAgICAgICAgICAgICAobm9kZS50eXBlID09PSBcIm51bGxcIiAmJiAhc3RhdGUub3B0aW9uLmVxbnVsbCkgfHxcbiAgICAgICAgICAgICAgICBub2RlLnR5cGUgPT09IFwidHJ1ZVwiIHx8XG4gICAgICAgICAgICAgICAgbm9kZS50eXBlID09PSBcImZhbHNlXCIgfHxcbiAgICAgICAgICAgICAgICBub2RlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpO1xuICAgIH1cblxuICAgIHZhciB0eXBlb2ZWYWx1ZXM6IHsgbGVnYWN5Pzogc3RyaW5nW107IGVzMz86IHN0cmluZ1tdOyBlczY/OiBzdHJpbmdbXSB9ID0ge307XG4gICAgdHlwZW9mVmFsdWVzLmxlZ2FjeSA9IFtcbiAgICAgICAgLy8gRTRYIGV4dGVuZGVkIHRoZSBgdHlwZW9mYCBvcGVyYXRvciB0byByZXR1cm4gXCJ4bWxcIiBmb3IgdGhlIFhNTCBhbmRcbiAgICAgICAgLy8gWE1MTGlzdCB0eXBlcyBpdCBpbnRyb2R1Y2VkLlxuICAgICAgICAvLyBSZWY6IDExLjMuMiBUaGUgdHlwZW9mIE9wZXJhdG9yXG4gICAgICAgIC8vIGh0dHA6Ly93d3cuZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9wdWJsaWNhdGlvbnMvZmlsZXMvRUNNQS1TVC9FY21hLTM1Ny5wZGZcbiAgICAgICAgXCJ4bWxcIixcbiAgICAgICAgLy8gSUU8OSByZXBvcnRzIFwidW5rbm93blwiIHdoZW4gdGhlIGB0eXBlb2ZgIG9wZXJhdG9yIGlzIGFwcGxpZWQgdG8gYW5cbiAgICAgICAgLy8gb2JqZWN0IGV4aXN0aW5nIGFjcm9zcyBhIENPTSsgYnJpZGdlLiBJbiBsaWV1IG9mIG9mZmljaWFsIGRvY3VtZW50YXRpb25cbiAgICAgICAgLy8gKHdoaWNoIGRvZXMgbm90IGV4aXN0KSwgc2VlOlxuICAgICAgICAvLyBodHRwOi8vcm9iZXJ0bnltYW4uY29tLzIwMDUvMTIvMjEvd2hhdC1pcy10eXBlb2YtdW5rbm93bi9cbiAgICAgICAgXCJ1bmtub3duXCJcbiAgICBdO1xuICAgIHR5cGVvZlZhbHVlcy5lczMgPSBbXG4gICAgICAgIFwidW5kZWZpbmVkXCIsIFwiYm9vbGVhblwiLCBcIm51bWJlclwiLCBcInN0cmluZ1wiLCBcImZ1bmN0aW9uXCIsIFwib2JqZWN0XCIsXG4gICAgXTtcbiAgICB0eXBlb2ZWYWx1ZXMuZXMzID0gdHlwZW9mVmFsdWVzLmVzMy5jb25jYXQodHlwZW9mVmFsdWVzLmxlZ2FjeSk7XG4gICAgdHlwZW9mVmFsdWVzLmVzNiA9IHR5cGVvZlZhbHVlcy5lczMuY29uY2F0KFwic3ltYm9sXCIpO1xuXG4gICAgLy8gQ2hlY2tzIHdoZXRoZXIgdGhlICd0eXBlb2YnIG9wZXJhdG9yIGlzIHVzZWQgd2l0aCB0aGUgY29ycmVjdFxuICAgIC8vIHZhbHVlLiBGb3IgZG9jcyBvbiAndHlwZW9mJyBzZWU6XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvT3BlcmF0b3JzL3R5cGVvZlxuICAgIGZ1bmN0aW9uIGlzVHlwb1R5cGVvZihsZWZ0OiB7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9LCByaWdodCwgc3RhdGUpIHtcbiAgICAgICAgdmFyIHZhbHVlczogc3RyaW5nW107XG5cbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub3R5cGVvZilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICBpZiAoIWxlZnQgfHwgIXJpZ2h0KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIHZhbHVlcyA9IHN0YXRlLmluRVM2KCkgPyB0eXBlb2ZWYWx1ZXMuZXM2IDogdHlwZW9mVmFsdWVzLmVzMztcblxuICAgICAgICBpZiAocmlnaHQudHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIiAmJiByaWdodC52YWx1ZSA9PT0gXCJ0eXBlb2ZcIiAmJiBsZWZ0LnR5cGUgPT09IFwiKHN0cmluZylcIilcbiAgICAgICAgICAgIHJldHVybiAhY29udGFpbnModmFsdWVzLCBsZWZ0LnZhbHVlKTtcblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNHbG9iYWxFdmFsKGxlZnQsIHN0YXRlKSB7XG4gICAgICAgIHZhciBpc0dsb2JhbCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIHBlcm1pdCBtZXRob2RzIHRvIHJlZmVyIHRvIGFuIFwiZXZhbFwiIGtleSBpbiB0aGVpciBvd24gY29udGV4dFxuICAgICAgICBpZiAobGVmdC50eXBlID09PSBcInRoaXNcIiAmJiBzdGF0ZS5mdW5jdFtcIihjb250ZXh0KVwiXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgaXNHbG9iYWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIC8vIHBlcm1pdCB1c2Ugb2YgXCJldmFsXCIgbWVtYmVycyBvZiBvYmplY3RzXG4gICAgICAgIGVsc2UgaWYgKGxlZnQudHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIikge1xuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub2RlICYmIGxlZnQudmFsdWUgPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgICAgICAgICAgICBpc0dsb2JhbCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5icm93c2VyICYmIChsZWZ0LnZhbHVlID09PSBcIndpbmRvd1wiIHx8IGxlZnQudmFsdWUgPT09IFwiZG9jdW1lbnRcIikpIHtcbiAgICAgICAgICAgICAgICBpc0dsb2JhbCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaXNHbG9iYWw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZE5hdGl2ZVByb3RvdHlwZShsZWZ0KSB7XG4gICAgICAgIHZhciBuYXRpdmVzID0gW1xuICAgICAgICAgICAgXCJBcnJheVwiLCBcIkFycmF5QnVmZmVyXCIsIFwiQm9vbGVhblwiLCBcIkNvbGxhdG9yXCIsIFwiRGF0YVZpZXdcIiwgXCJEYXRlXCIsXG4gICAgICAgICAgICBcIkRhdGVUaW1lRm9ybWF0XCIsIFwiRXJyb3JcIiwgXCJFdmFsRXJyb3JcIiwgXCJGbG9hdDMyQXJyYXlcIiwgXCJGbG9hdDY0QXJyYXlcIixcbiAgICAgICAgICAgIFwiRnVuY3Rpb25cIiwgXCJJbmZpbml0eVwiLCBcIkludGxcIiwgXCJJbnQxNkFycmF5XCIsIFwiSW50MzJBcnJheVwiLCBcIkludDhBcnJheVwiLFxuICAgICAgICAgICAgXCJJdGVyYXRvclwiLCBcIk51bWJlclwiLCBcIk51bWJlckZvcm1hdFwiLCBcIk9iamVjdFwiLCBcIlJhbmdlRXJyb3JcIixcbiAgICAgICAgICAgIFwiUmVmZXJlbmNlRXJyb3JcIiwgXCJSZWdFeHBcIiwgXCJTdG9wSXRlcmF0aW9uXCIsIFwiU3RyaW5nXCIsIFwiU3ludGF4RXJyb3JcIixcbiAgICAgICAgICAgIFwiVHlwZUVycm9yXCIsIFwiVWludDE2QXJyYXlcIiwgXCJVaW50MzJBcnJheVwiLCBcIlVpbnQ4QXJyYXlcIiwgXCJVaW50OENsYW1wZWRBcnJheVwiLFxuICAgICAgICAgICAgXCJVUklFcnJvclwiXG4gICAgICAgIF07XG5cbiAgICAgICAgZnVuY3Rpb24gd2Fsa1Byb3RvdHlwZShvYmopIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiKSByZXR1cm47XG4gICAgICAgICAgICByZXR1cm4gb2JqLnJpZ2h0ID09PSBcInByb3RvdHlwZVwiID8gb2JqIDogd2Fsa1Byb3RvdHlwZShvYmoubGVmdCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiB3YWxrTmF0aXZlKG9iaikge1xuICAgICAgICAgICAgd2hpbGUgKCFvYmouaWRlbnRpZmllciAmJiB0eXBlb2Ygb2JqLmxlZnQgPT09IFwib2JqZWN0XCIpXG4gICAgICAgICAgICAgICAgb2JqID0gb2JqLmxlZnQ7XG5cbiAgICAgICAgICAgIGlmIChvYmouaWRlbnRpZmllciAmJiBuYXRpdmVzLmluZGV4T2Yob2JqLnZhbHVlKSA+PSAwKVxuICAgICAgICAgICAgICAgIHJldHVybiBvYmoudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcHJvdG90eXBlID0gd2Fsa1Byb3RvdHlwZShsZWZ0KTtcbiAgICAgICAgaWYgKHByb3RvdHlwZSkgcmV0dXJuIHdhbGtOYXRpdmUocHJvdG90eXBlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgdGhlIGxlZnQgaGFuZCBzaWRlIG9mIGFuIGFzc2lnbm1lbnQgZm9yIGlzc3VlcywgcmV0dXJucyBpZiBva1xuICAgICAqIEBwYXJhbSB7dG9rZW59IGxlZnQgLSB0aGUgbGVmdCBoYW5kIHNpZGUgb2YgdGhlIGFzc2lnbm1lbnRcbiAgICAgKiBAcGFyYW0ge3Rva2VuPX0gYXNzaWduVG9rZW4gLSB0aGUgdG9rZW4gZm9yIHRoZSBhc3NpZ25tZW50LCB1c2VkIGZvciByZXBvcnRpbmdcbiAgICAgKiBAcGFyYW0ge29iamVjdD19IG9wdGlvbnMgLSBvcHRpb25hbCBvYmplY3RcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG9wdGlvbnMuYWxsb3dEZXN0cnVjdHVyaW5nIC0gd2hldGhlciB0byBhbGxvdyBkZXN0cnVjdHV0aW5nIGJpbmRpbmdcbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gV2hldGhlciB0aGUgbGVmdCBoYW5kIHNpZGUgaXMgT0tcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBjaGVja0xlZnRTaWRlQXNzaWduKGxlZnQsIGFzc2lnblRva2VuPywgb3B0aW9ucz86IHsgYWxsb3dEZXN0cnVjdHVyaW5nPzogYm9vbGVhbiB9KSB7XG5cbiAgICAgICAgdmFyIGFsbG93RGVzdHJ1Y3R1cmluZyA9IG9wdGlvbnMgJiYgb3B0aW9ucy5hbGxvd0Rlc3RydWN0dXJpbmc7XG5cbiAgICAgICAgYXNzaWduVG9rZW4gPSBhc3NpZ25Ub2tlbiB8fCBsZWZ0O1xuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uZnJlZXplKSB7XG4gICAgICAgICAgICB2YXIgbmF0aXZlT2JqZWN0ID0gZmluZE5hdGl2ZVByb3RvdHlwZShsZWZ0KTtcbiAgICAgICAgICAgIGlmIChuYXRpdmVPYmplY3QpXG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjFcIiwgbGVmdCwgbmF0aXZlT2JqZWN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsZWZ0LmlkZW50aWZpZXIgJiYgIWxlZnQuaXNNZXRhUHJvcGVydHkpIHtcbiAgICAgICAgICAgIC8vIHJlYXNzaWduIGFsc28gY2FsbHMgbW9kaWZ5XG4gICAgICAgICAgICAvLyBidXQgd2UgYXJlIHNwZWNpZmljIGluIG9yZGVyIHRvIGNhdGNoIGZ1bmN0aW9uIHJlLWFzc2lnbm1lbnRcbiAgICAgICAgICAgIC8vIGFuZCBnbG9iYWxzIHJlLWFzc2lnbm1lbnRcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5ibG9jay5yZWFzc2lnbihsZWZ0LnZhbHVlLCBsZWZ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsZWZ0LmlkID09PSBcIi5cIikge1xuICAgICAgICAgICAgaWYgKCFsZWZ0LmxlZnQgfHwgbGVmdC5sZWZ0LnZhbHVlID09PSBcImFyZ3VtZW50c1wiICYmICFzdGF0ZS5pc1N0cmljdCgpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMzFcIiwgYXNzaWduVG9rZW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KHN0YXRlLnRva2Vucy5wcmV2KTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGxlZnQuaWQgPT09IFwie1wiIHx8IGxlZnQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICBpZiAoYWxsb3dEZXN0cnVjdHVyaW5nICYmIHN0YXRlLnRva2Vucy5jdXJyLmxlZnQuZGVzdHJ1Y3RBc3NpZ24pIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5sZWZ0LmRlc3RydWN0QXNzaWduLmZvckVhY2goZnVuY3Rpb24odCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLm1vZGlmeSh0LmlkLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAobGVmdC5pZCA9PT0gXCJ7XCIgfHwgIWxlZnQubGVmdCkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMVwiLCBhc3NpZ25Ub2tlbik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChsZWZ0LmxlZnQudmFsdWUgPT09IFwiYXJndW1lbnRzXCIgJiYgIXN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMzFcIiwgYXNzaWduVG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxlZnQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChsZWZ0LnJpZ2h0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAobGVmdC5pc01ldGFQcm9wZXJ0eSkge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDMxXCIsIGFzc2lnblRva2VuKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGxlZnQuaWRlbnRpZmllciAmJiAhaXNSZXNlcnZlZChsZWZ0KSkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5sYWJlbHR5cGUobGVmdC52YWx1ZSkgPT09IFwiZXhjZXB0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAyMlwiLCBsZWZ0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRlLm5hbWVTdGFjay5zZXQobGVmdCk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChsZWZ0ID09PSBzdGF0ZS5zeW50YXhbXCJmdW5jdGlvblwiXSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMjNcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFzc2lnbm9wKHMsIGYsIHApIHtcbiAgICAgICAgdmFyIHggPSBpbmZpeChzLCB0eXBlb2YgZiA9PT0gXCJmdW5jdGlvblwiID8gZiA6IGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgICAgIHRoYXQubGVmdCA9IGxlZnQ7XG5cbiAgICAgICAgICAgIGlmIChsZWZ0ICYmIGNoZWNrTGVmdFNpZGVBc3NpZ24obGVmdCwgdGhhdCwgeyBhbGxvd0Rlc3RydWN0dXJpbmc6IHRydWUgfSkpIHtcbiAgICAgICAgICAgICAgICB0aGF0LnJpZ2h0ID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoYXQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGVycm9yKFwiRTAzMVwiLCB0aGF0KTtcbiAgICAgICAgfSwgcCk7XG5cbiAgICAgICAgeC5leHBzID0gdHJ1ZTtcbiAgICAgICAgeC5hc3NpZ24gPSB0cnVlO1xuICAgICAgICByZXR1cm4geDtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGJpdHdpc2UocywgZiwgcCkge1xuICAgICAgICB2YXIgeCA9IHN5bWJvbChzLCBwKTtcbiAgICAgICAgcmVzZXJ2ZU5hbWUoeCk7XG4gICAgICAgIHgubGVkID0gKHR5cGVvZiBmID09PSBcImZ1bmN0aW9uXCIpID8gZiA6IGZ1bmN0aW9uKGxlZnQpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uYml0d2lzZSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDE2XCIsIHRoaXMsIHRoaXMuaWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKHApO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJpdHdpc2Vhc3NpZ25vcChzKSB7XG4gICAgICAgIHJldHVybiBhc3NpZ25vcChzLCBmdW5jdGlvbihsZWZ0LCB0aGF0KSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmJpdHdpc2UpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAxNlwiLCB0aGF0LCB0aGF0LmlkKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGxlZnQgJiYgY2hlY2tMZWZ0U2lkZUFzc2lnbihsZWZ0LCB0aGF0KSkge1xuICAgICAgICAgICAgICAgIHRoYXQucmlnaHQgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhhdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVycm9yKFwiRTAzMVwiLCB0aGF0KTtcbiAgICAgICAgfSwgMjApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN1ZmZpeChzKSB7XG4gICAgICAgIHZhciB4ID0gc3ltYm9sKHMsIDE1MCk7XG5cbiAgICAgICAgeC5sZWQgPSBmdW5jdGlvbihsZWZ0KSB7XG4gICAgICAgICAgICAvLyB0aGlzID0gc3VmZml4IGUuZy4gXCIrK1wiIHB1bmN0dWF0b3JcbiAgICAgICAgICAgIC8vIGxlZnQgPSBzeW1ib2wgb3BlcmF0ZWQgZS5nLiBcImFcIiBpZGVudGlmaWVyIG9yIFwiYS5iXCIgcHVuY3R1YXRvclxuICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5wbHVzcGx1cykge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDE2XCIsIHRoaXMsIHRoaXMuaWQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgoIWxlZnQuaWRlbnRpZmllciB8fCBpc1Jlc2VydmVkKGxlZnQpKSAmJiBsZWZ0LmlkICE9PSBcIi5cIiAmJiBsZWZ0LmlkICE9PSBcIltcIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDE3XCIsIHRoaXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobGVmdC5pc01ldGFQcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzMVwiLCB0aGlzKTtcbiAgICAgICAgICAgICAgICAvLyBkZXRlY3QgaW5jcmVtZW50L2RlY3JlbWVudCBvZiBhIGNvbnN0XG4gICAgICAgICAgICAgICAgLy8gaW4gdGhlIGNhc2Ugb2YgYS5iLCBsZWZ0IHdpbGwgYmUgdGhlIFwiLlwiIHB1bmN0dWF0b3JcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobGVmdCAmJiBsZWZ0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2subW9kaWZ5KGxlZnQudmFsdWUsIGxlZnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cblxuICAgIC8vIGZucGFyYW0gbWVhbnMgdGhhdCB0aGlzIGlkZW50aWZpZXIgaXMgYmVpbmcgZGVmaW5lZCBhcyBhIGZ1bmN0aW9uXG4gICAgLy8gYXJndW1lbnQgKHNlZSBpZGVudGlmaWVyKCkpXG4gICAgLy8gcHJvcCBtZWFucyB0aGF0IHRoaXMgaWRlbnRpZmllciBpcyB0aGF0IG9mIGFuIG9iamVjdCBwcm9wZXJ0eVxuXG4gICAgZnVuY3Rpb24gb3B0aW9uYWxpZGVudGlmaWVyKGZucGFyYW0/LCBwcm9wPywgcHJlc2VydmU/KSB7XG4gICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFwcmVzZXJ2ZSkge1xuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnIgPSBzdGF0ZS50b2tlbnMuY3VycjtcbiAgICAgICAgdmFyIHZhbCA9IHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlO1xuXG4gICAgICAgIGlmICghaXNSZXNlcnZlZChjdXJyKSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm5wYXJhbSAmJiB2YWwgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIH1cblxuICAgICAgICB3YXJuaW5nKFwiVzAyNFwiLCBzdGF0ZS50b2tlbnMuY3Vyciwgc3RhdGUudG9rZW5zLmN1cnIuaWQpO1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cblxuICAgIC8vIGZucGFyYW0gbWVhbnMgdGhhdCB0aGlzIGlkZW50aWZpZXIgaXMgYmVpbmcgZGVmaW5lZCBhcyBhIGZ1bmN0aW9uXG4gICAgLy8gYXJndW1lbnRcbiAgICAvLyBwcm9wIG1lYW5zIHRoYXQgdGhpcyBpZGVudGlmaWVyIGlzIHRoYXQgb2YgYW4gb2JqZWN0IHByb3BlcnR5XG4gICAgZnVuY3Rpb24gaWRlbnRpZmllcihmbnBhcmFtPywgcHJvcD8pIHtcbiAgICAgICAgdmFyIGkgPSBvcHRpb25hbGlkZW50aWZpZXIoZm5wYXJhbSwgcHJvcCwgZmFsc2UpO1xuICAgICAgICBpZiAoaSkge1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwYXJhbWV0ZXIgZGVzdHJ1Y3R1cmluZyB3aXRoIHJlc3Qgb3BlcmF0b3JcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIi4uLlwiKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KHRydWUpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwic3ByZWFkL3Jlc3Qgb3BlcmF0b3JcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZSgpO1xuXG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIi4uLlwiKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIi4uLlwiKTtcbiAgICAgICAgICAgICAgICB3aGlsZSAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIi4uLlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAyNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCIuLi5cIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaWRlbnRpZmllcihmbnBhcmFtLCBwcm9wKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTAzMFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuXG4gICAgICAgICAgICAvLyBUaGUgdG9rZW4gc2hvdWxkIGJlIGNvbnN1bWVkIGFmdGVyIGEgd2FybmluZyBpcyBpc3N1ZWQgc28gdGhlIHBhcnNlclxuICAgICAgICAgICAgLy8gY2FuIGNvbnRpbnVlIGFzIHRob3VnaCBhbiBpZGVudGlmaWVyIHdlcmUgZm91bmQuIFRoZSBzZW1pY29sb24gdG9rZW5cbiAgICAgICAgICAgIC8vIHNob3VsZCBub3QgYmUgY29uc3VtZWQgaW4gdGhpcyB3YXkgc28gdGhhdCB0aGUgcGFyc2VyIGludGVycHJldHMgaXQgYXNcbiAgICAgICAgICAgIC8vIGEgc3RhdGVtZW50IGRlbGltZXRlcjtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHJlYWNoYWJsZShjb250cm9sVG9rZW4pIHtcbiAgICAgICAgdmFyIGkgPSAwLCB0O1xuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiO1wiIHx8IGNvbnRyb2xUb2tlbi5pbkJyYWNlbGVzc0Jsb2NrKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICB0ID0gcGVlayhpKTtcbiAgICAgICAgICAgICAgICBpICs9IDE7XG4gICAgICAgICAgICB9IHdoaWxlICh0LmlkICE9PSBcIihlbmQpXCIgJiYgdC5pZCA9PT0gXCIoY29tbWVudClcIik7XG5cbiAgICAgICAgICAgIGlmICh0LnJlYWNoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHQuaWQgIT09IFwiKGVuZGxpbmUpXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodC5pZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMjZcIiwgdCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMjdcIiwgdCwgdC52YWx1ZSwgY29udHJvbFRva2VuLnZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBhcnNlRmluYWxTZW1pY29sb24oKSB7XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIpIHtcbiAgICAgICAgICAgIC8vIGRvbid0IGNvbXBsYWluIGFib3V0IHVuY2xvc2VkIHRlbXBsYXRlcyAvIHN0cmluZ3NcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pc1VuY2xvc2VkKSByZXR1cm4gYWR2YW5jZSgpO1xuXG4gICAgICAgICAgICB2YXIgc2FtZUxpbmUgPSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpID09PSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lICYmXG4gICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKGVuZClcIjtcbiAgICAgICAgICAgIHZhciBibG9ja0VuZCA9IGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpO1xuXG4gICAgICAgICAgICBpZiAoc2FtZUxpbmUgJiYgIWJsb2NrRW5kKSB7XG4gICAgICAgICAgICAgICAgZXJyb3JBdChcIkUwNThcIiwgc3RhdGUudG9rZW5zLmN1cnIubGluZSwgc3RhdGUudG9rZW5zLmN1cnIuY2hhcmFjdGVyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLm9wdGlvbi5hc2kpIHtcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBsYXN0IHN0YXRlbWVudCBpbiBhIGJsb2NrIHRoYXQgZW5kcyBvblxuICAgICAgICAgICAgICAgIC8vIHRoZSBzYW1lIGxpbmUgKmFuZCogb3B0aW9uIGxhc3RzZW1pYyBpcyBvbiwgaWdub3JlIHRoZSB3YXJuaW5nLlxuICAgICAgICAgICAgICAgIC8vIE90aGVyd2lzZSwgY29tcGxhaW4gYWJvdXQgbWlzc2luZyBzZW1pY29sb24uXG4gICAgICAgICAgICAgICAgaWYgKChibG9ja0VuZCAmJiAhc3RhdGUub3B0aW9uLmxhc3RzZW1pYykgfHwgIXNhbWVMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdBdChcIlcwMzNcIiwgc3RhdGUudG9rZW5zLmN1cnIubGluZSwgc3RhdGUudG9rZW5zLmN1cnIuY2hhcmFjdGVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiO1wiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0YXRlbWVudCgpIHtcbiAgICAgICAgdmFyIGkgPSBpbmRlbnQsIHIsIHQgPSBzdGF0ZS50b2tlbnMubmV4dCwgaGFzT3duU2NvcGUgPSBmYWxzZTtcblxuICAgICAgICBpZiAodC5pZCA9PT0gXCI7XCIpIHtcbiAgICAgICAgICAgIGFkdmFuY2UoXCI7XCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSXMgdGhpcyBhIGxhYmVsbGVkIHN0YXRlbWVudD9cbiAgICAgICAgdmFyIHJlcyA9IGlzUmVzZXJ2ZWQodCk7XG5cbiAgICAgICAgLy8gV2UncmUgYmVpbmcgbW9yZSB0b2xlcmFudCBoZXJlOiBpZiBzb21lb25lIHVzZXNcbiAgICAgICAgLy8gYSBGdXR1cmVSZXNlcnZlZFdvcmQgYXMgYSBsYWJlbCwgd2Ugd2FybiBidXQgcHJvY2VlZFxuICAgICAgICAvLyBhbnl3YXkuXG5cbiAgICAgICAgaWYgKHJlcyAmJiB0Lm1ldGEgJiYgdC5tZXRhLmlzRnV0dXJlUmVzZXJ2ZWRXb3JkICYmIHBlZWsoKS5pZCA9PT0gXCI6XCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDI0XCIsIHQsIHQuaWQpO1xuICAgICAgICAgICAgcmVzID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodC5pZGVudGlmaWVyICYmICFyZXMgJiYgcGVlaygpLmlkID09PSBcIjpcIikge1xuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG5cbiAgICAgICAgICAgIGhhc093blNjb3BlID0gdHJ1ZTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjaygpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLmFkZEJyZWFrTGFiZWwodC52YWx1ZSwgeyB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnIgfSk7XG5cbiAgICAgICAgICAgIGlmICghc3RhdGUudG9rZW5zLm5leHQubGFiZWxsZWQgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgIT09IFwie1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMjhcIiwgc3RhdGUudG9rZW5zLm5leHQsIHQudmFsdWUsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQubGFiZWwgPSB0LnZhbHVlO1xuICAgICAgICAgICAgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSXMgaXQgYSBsb25lbHkgYmxvY2s/XG5cbiAgICAgICAgaWYgKHQuaWQgPT09IFwie1wiKSB7XG4gICAgICAgICAgICAvLyBJcyBpdCBhIHN3aXRjaCBjYXNlIGJsb2NrP1xuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vICBzd2l0Y2ggKGZvbykge1xuICAgICAgICAgICAgLy8gICAgY2FzZSBiYXI6IHsgPD0gaGVyZS5cbiAgICAgICAgICAgIC8vICAgICAgLi4uXG4gICAgICAgICAgICAvLyAgICB9XG4gICAgICAgICAgICAvLyAgfVxuICAgICAgICAgICAgdmFyIGlzY2FzZSA9IChzdGF0ZS5mdW5jdFtcIih2ZXJiKVwiXSA9PT0gXCJjYXNlXCIgJiYgc3RhdGUudG9rZW5zLmN1cnIudmFsdWUgPT09IFwiOlwiKTtcbiAgICAgICAgICAgIGJsb2NrKHRydWUsIHRydWUsIGZhbHNlLCBmYWxzZSwgaXNjYXNlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBhcnNlIHRoZSBzdGF0ZW1lbnQuXG5cbiAgICAgICAgciA9IGV4cHJlc3Npb24oMCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHIgJiYgIShyLmlkZW50aWZpZXIgJiYgci52YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSAmJlxuICAgICAgICAgICAgIShyLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgci5sZWZ0ICYmXG4gICAgICAgICAgICAgICAgci5sZWZ0LmlkZW50aWZpZXIgJiYgci5sZWZ0LnZhbHVlID09PSBcImZ1bmN0aW9uXCIpKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmlzU3RyaWN0KCkgJiZcbiAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24uc3RyaWN0ID09PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMDdcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb29rIGZvciB0aGUgZmluYWwgc2VtaWNvbG9uLlxuXG4gICAgICAgIGlmICghdC5ibG9jaykge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uZXhwciAmJiAoIXIgfHwgIXIuZXhwcykpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAzMFwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5ub25ldyAmJiByICYmIHIubGVmdCAmJiByLmlkID09PSBcIihcIiAmJiByLmxlZnQuaWQgPT09IFwibmV3XCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAzMVwiLCB0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBhcnNlRmluYWxTZW1pY29sb24oKTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUmVzdG9yZSB0aGUgaW5kZW50YXRpb24uXG5cbiAgICAgICAgaW5kZW50ID0gaTtcbiAgICAgICAgaWYgKGhhc093blNjb3BlKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gc3RhdGVtZW50cygpIHtcbiAgICAgICAgdmFyIGEgPSBbXSwgcDtcblxuICAgICAgICB3aGlsZSAoIXN0YXRlLnRva2Vucy5uZXh0LnJlYWNoICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICBwID0gcGVlaygpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFwIHx8IChwLmlkICE9PSBcIihcIiAmJiBwLmlkICE9PSBcIltcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzJcIik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGEucHVzaChzdGF0ZW1lbnQoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGE7XG4gICAgfVxuXG5cbiAgICAvKlxuICAgICAqIHJlYWQgYWxsIGRpcmVjdGl2ZXNcbiAgICAgKiByZWNvZ25pemVzIGEgc2ltcGxlIGZvcm0gb2YgYXNpLCBidXQgYWx3YXlzXG4gICAgICogd2FybnMsIGlmIGl0IGlzIHVzZWRcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBkaXJlY3RpdmVzKCkge1xuICAgICAgICB2YXIgaSwgcCwgcG47XG5cbiAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihzdHJpbmcpXCIpIHtcbiAgICAgICAgICAgIHAgPSBwZWVrKDApO1xuICAgICAgICAgICAgaWYgKHAuaWQgPT09IFwiKGVuZGxpbmUpXCIpIHtcbiAgICAgICAgICAgICAgICBpID0gMTtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHBuID0gcGVlayhpKyspO1xuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHBuLmlkID09PSBcIihlbmRsaW5lKVwiKTtcbiAgICAgICAgICAgICAgICBpZiAocG4uaWQgPT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBwbjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBuLnZhbHVlID09PSBcIltcIiB8fCBwbi52YWx1ZSA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc3RyaW5nIC0+IFsgfCAuIGlzIGEgdmFsaWQgcHJvZHVjdGlvblxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCFzdGF0ZS5vcHRpb24uYXNpIHx8IHBuLnZhbHVlID09PSBcIihcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgLT4gKCBpcyBub3QgYSB2YWxpZCBwcm9kdWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDMzXCIsIHN0YXRlLnRva2Vucy5uZXh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAuaWQgPT09IFwiLlwiIHx8IHAuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHAuaWQgIT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzNcIiwgcCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgIHZhciBkaXJlY3RpdmUgPSBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5kaXJlY3RpdmVbZGlyZWN0aXZlXSB8fFxuICAgICAgICAgICAgICAgIChkaXJlY3RpdmUgPT09IFwidXNlIHN0cmljdFwiICYmIHN0YXRlLm9wdGlvbi5zdHJpY3QgPT09IFwiaW1wbGllZFwiKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDM0XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBkaXJlY3RpdmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB0aGVyZSdzIG5vIGRpcmVjdGl2ZSBuZWdhdGlvbiwgc28gYWx3YXlzIHNldCB0byB0cnVlXG4gICAgICAgICAgICBzdGF0ZS5kaXJlY3RpdmVbZGlyZWN0aXZlXSA9IHRydWU7XG5cbiAgICAgICAgICAgIGlmIChwLmlkID09PSBcIjtcIikge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgIHN0YXRlLm9wdGlvbi51bmRlZiA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIC8qXG4gICAgICogUGFyc2VzIGEgc2luZ2xlIGJsb2NrLiBBIGJsb2NrIGlzIGEgc2VxdWVuY2Ugb2Ygc3RhdGVtZW50cyB3cmFwcGVkIGluXG4gICAgICogYnJhY2VzLlxuICAgICAqXG4gICAgICogb3JkaW5hcnkgICAtIHRydWUgZm9yIGV2ZXJ5dGhpbmcgYnV0IGZ1bmN0aW9uIGJvZGllcyBhbmQgdHJ5IGJsb2Nrcy5cbiAgICAgKiBzdG10ICAgICAgIC0gdHJ1ZSBpZiBibG9jayBjYW4gYmUgYSBzaW5nbGUgc3RhdGVtZW50IChlLmcuIGluIGlmL2Zvci93aGlsZSkuXG4gICAgICogaXNmdW5jICAgICAtIHRydWUgaWYgYmxvY2sgaXMgYSBmdW5jdGlvbiBib2R5XG4gICAgICogaXNmYXRhcnJvdyAtIHRydWUgaWYgaXRzIGEgYm9keSBvZiBhIGZhdCBhcnJvdyBmdW5jdGlvblxuICAgICAqIGlzY2FzZSAgICAgIC0gdHJ1ZSBpZiBibG9jayBpcyBhIHN3aXRjaCBjYXNlIGJsb2NrXG4gICAgICovXG4gICAgZnVuY3Rpb24gYmxvY2sob3JkaW5hcnk6IGJvb2xlYW4sIHN0bXQ/OiBib29sZWFuLCBpc2Z1bmM/OiBib29sZWFuLCBpc2ZhdGFycm93PzogYm9vbGVhbiwgaXNjYXNlPzogYm9vbGVhbikge1xuICAgICAgICB2YXIgYSxcbiAgICAgICAgICAgIGIgPSBpbmJsb2NrLFxuICAgICAgICAgICAgb2xkX2luZGVudCA9IGluZGVudCxcbiAgICAgICAgICAgIG0sXG4gICAgICAgICAgICB0LFxuICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgIGQ7XG5cbiAgICAgICAgaW5ibG9jayA9IG9yZGluYXJ5O1xuXG4gICAgICAgIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcblxuICAgICAgICB2YXIgbWV0cmljcyA9IHN0YXRlLmZ1bmN0W1wiKG1ldHJpY3MpXCJdO1xuICAgICAgICBtZXRyaWNzLm5lc3RlZEJsb2NrRGVwdGggKz0gMTtcbiAgICAgICAgbWV0cmljcy52ZXJpZnlNYXhOZXN0ZWRCbG9ja0RlcHRoUGVyRnVuY3Rpb24oKTtcblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwie1wiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwie1wiKTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlIGEgbmV3IGJsb2NrIHNjb3BlXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soKTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKG5vYmxvY2tzY29wZWR2YXIpXCJdID0gZmFsc2U7XG5cbiAgICAgICAgICAgIGxpbmUgPSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIn1cIikge1xuICAgICAgICAgICAgICAgIGluZGVudCArPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuICAgICAgICAgICAgICAgIHdoaWxlICghb3JkaW5hcnkgJiYgc3RhdGUudG9rZW5zLm5leHQuZnJvbSA+IGluZGVudCkge1xuICAgICAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNmdW5jKSB7XG4gICAgICAgICAgICAgICAgICAgIG0gPSB7fTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChkIGluIHN0YXRlLmRpcmVjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhcyhzdGF0ZS5kaXJlY3RpdmUsIGQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbVtkXSA9IHN0YXRlLmRpcmVjdGl2ZVtkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBkaXJlY3RpdmVzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zdHJpY3QgJiYgc3RhdGUuZnVuY3RbXCIoY29udGV4dClcIl1bXCIoZ2xvYmFsKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFtW1widXNlIHN0cmljdFwiXSAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDA3XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYSA9IHN0YXRlbWVudHMoKTtcblxuICAgICAgICAgICAgICAgIG1ldHJpY3Muc3RhdGVtZW50Q291bnQgKz0gYS5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICBpbmRlbnQgLT0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYWR2YW5jZShcIn1cIiwgdCk7XG5cbiAgICAgICAgICAgIGlmIChpc2Z1bmMpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udmFsaWRhdGVQYXJhbXMoKTtcbiAgICAgICAgICAgICAgICBpZiAobSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kaXJlY3RpdmUgPSBtO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnVuc3RhY2soKTtcblxuICAgICAgICAgICAgaW5kZW50ID0gb2xkX2luZGVudDtcbiAgICAgICAgfSBlbHNlIGlmICghb3JkaW5hcnkpIHtcbiAgICAgICAgICAgIGlmIChpc2Z1bmMpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soKTtcblxuICAgICAgICAgICAgICAgIG0gPSB7fTtcbiAgICAgICAgICAgICAgICBpZiAoc3RtdCAmJiAhaXNmYXRhcnJvdyAmJiAhc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIlcxMThcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZnVuY3Rpb24gY2xvc3VyZSBleHByZXNzaW9uc1wiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXN0bXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChkIGluIHN0YXRlLmRpcmVjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhcyhzdGF0ZS5kaXJlY3RpdmUsIGQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbVtkXSA9IHN0YXRlLmRpcmVjdGl2ZVtkXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBleHByZXNzaW9uKDEwKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24uc3RyaWN0ICYmIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKGdsb2JhbClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFtW1widXNlIHN0cmljdFwiXSAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMDdcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjFcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwie1wiLCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgIC8vIGNoZWNrIHRvIGF2b2lkIGxldCBkZWNsYXJhdGlvbiBub3Qgd2l0aGluIGEgYmxvY2tcbiAgICAgICAgICAgIC8vIHRob3VnaCBpcyBmaW5lIGluc2lkZSBmb3IgbG9vcCBpbml0aWFsaXplciBzZWN0aW9uXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihub2Jsb2Nrc2NvcGVkdmFyKVwiXSA9IHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcImZvclwiO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG5cbiAgICAgICAgICAgIGlmICghc3RtdCB8fCBzdGF0ZS5vcHRpb24uY3VybHkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgXCJ7XCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQuaW5CcmFjZWxlc3NCbG9jayA9IHRydWU7XG4gICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIC8vIHRlc3QgaW5kZW50YXRpb24gb25seSBpZiBzdGF0ZW1lbnQgaXMgaW4gbmV3IGxpbmVcbiAgICAgICAgICAgIGEgPSBbc3RhdGVtZW50KCldO1xuICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS51bnN0YWNrKCk7XG4gICAgICAgICAgICBkZWxldGUgc3RhdGUuZnVuY3RbXCIobm9ibG9ja3Njb3BlZHZhcilcIl07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEb24ndCBjbGVhciBhbmQgbGV0IGl0IHByb3BhZ2F0ZSBvdXQgaWYgaXQgaXMgXCJicmVha1wiLCBcInJldHVyblwiIG9yIHNpbWlsYXIgaW4gc3dpdGNoIGNhc2VcbiAgICAgICAgc3dpdGNoIChzdGF0ZS5mdW5jdFtcIih2ZXJiKVwiXSkge1xuICAgICAgICAgICAgY2FzZSBcImJyZWFrXCI6XG4gICAgICAgICAgICBjYXNlIFwiY29udGludWVcIjpcbiAgICAgICAgICAgIGNhc2UgXCJyZXR1cm5cIjpcbiAgICAgICAgICAgIGNhc2UgXCJ0aHJvd1wiOlxuICAgICAgICAgICAgICAgIGlmIChpc2Nhc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGluYmxvY2sgPSBiO1xuICAgICAgICBpZiAob3JkaW5hcnkgJiYgc3RhdGUub3B0aW9uLm5vZW1wdHkgJiYgKCFhIHx8IGEubGVuZ3RoID09PSAwKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMzVcIiwgc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICB9XG4gICAgICAgIG1ldHJpY3MubmVzdGVkQmxvY2tEZXB0aCAtPSAxO1xuICAgICAgICByZXR1cm4gYTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGNvdW50TWVtYmVyKG0pIHtcbiAgICAgICAgaWYgKG1lbWJlcnNPbmx5ICYmIHR5cGVvZiBtZW1iZXJzT25seVttXSAhPT0gXCJib29sZWFuXCIpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDM2XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBtKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodHlwZW9mIG1lbWJlclttXSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgbWVtYmVyW21dICs9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBtZW1iZXJbbV0gPSAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gQnVpbGQgdGhlIHN5bnRheCB0YWJsZSBieSBkZWNsYXJpbmcgdGhlIHN5bnRhY3RpYyBlbGVtZW50cyBvZiB0aGUgbGFuZ3VhZ2UuXG5cbiAgICB0eXBlKFwiKG51bWJlcilcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgdHlwZShcIihzdHJpbmcpXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIHN0YXRlLnN5bnRheFtcIihpZGVudGlmaWVyKVwiXSA9IHtcbiAgICAgICAgdHlwZTogXCIoaWRlbnRpZmllcilcIixcbiAgICAgICAgbGJwOiAwLFxuICAgICAgICBpZGVudGlmaWVyOiB0cnVlLFxuXG4gICAgICAgIG51ZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgdiA9IHRoaXMudmFsdWU7XG5cbiAgICAgICAgICAgIC8vIElmIHRoaXMgaWRlbnRpZmllciBpcyB0aGUgbG9uZSBwYXJhbWV0ZXIgdG8gYSBzaG9ydGhhbmQgXCJmYXQgYXJyb3dcIlxuICAgICAgICAgICAgLy8gZnVuY3Rpb24gZGVmaW5pdGlvbiwgaS5lLlxuICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIC8vICAgICB4ID0+IHg7XG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gLi4uaXQgc2hvdWxkIG5vdCBiZSBjb25zaWRlcmVkIGFzIGEgdmFyaWFibGUgaW4gdGhlIGN1cnJlbnQgc2NvcGUuIEl0XG4gICAgICAgICAgICAvLyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBzY29wZSBvZiB0aGUgbmV3IGZ1bmN0aW9uIHdoZW4gdGhlIG5leHQgdG9rZW4gaXNcbiAgICAgICAgICAgIC8vIHBhcnNlZCwgc28gaXQgY2FuIGJlIHNhZmVseSBpZ25vcmVkIGZvciBub3cuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiPT5cIikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uY2hlY2sodikpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2sudXNlKHYsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIGxlZDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMzNcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgYmFzZVRlbXBsYXRlU3ludGF4ID0ge1xuICAgICAgICBsYnA6IDAsXG4gICAgICAgIGlkZW50aWZpZXI6IGZhbHNlLFxuICAgICAgICB0ZW1wbGF0ZTogdHJ1ZSxcbiAgICB9O1xuICAgIHN0YXRlLnN5bnRheFtcIih0ZW1wbGF0ZSlcIl0gPSBleHRlbmQoe1xuICAgICAgICB0eXBlOiBcIih0ZW1wbGF0ZSlcIixcbiAgICAgICAgbnVkOiBkb1RlbXBsYXRlTGl0ZXJhbCxcbiAgICAgICAgbGVkOiBkb1RlbXBsYXRlTGl0ZXJhbCxcbiAgICAgICAgbm9TdWJzdDogZmFsc2VcbiAgICB9LCBiYXNlVGVtcGxhdGVTeW50YXgpO1xuXG4gICAgc3RhdGUuc3ludGF4W1wiKHRlbXBsYXRlIG1pZGRsZSlcIl0gPSBleHRlbmQoe1xuICAgICAgICB0eXBlOiBcIih0ZW1wbGF0ZSBtaWRkbGUpXCIsXG4gICAgICAgIG1pZGRsZTogdHJ1ZSxcbiAgICAgICAgbm9TdWJzdDogZmFsc2VcbiAgICB9LCBiYXNlVGVtcGxhdGVTeW50YXgpO1xuXG4gICAgc3RhdGUuc3ludGF4W1wiKHRlbXBsYXRlIHRhaWwpXCJdID0gZXh0ZW5kKHtcbiAgICAgICAgdHlwZTogXCIodGVtcGxhdGUgdGFpbClcIixcbiAgICAgICAgdGFpbDogdHJ1ZSxcbiAgICAgICAgbm9TdWJzdDogZmFsc2VcbiAgICB9LCBiYXNlVGVtcGxhdGVTeW50YXgpO1xuXG4gICAgc3RhdGUuc3ludGF4W1wiKG5vIHN1YnN0IHRlbXBsYXRlKVwiXSA9IGV4dGVuZCh7XG4gICAgICAgIHR5cGU6IFwiKHRlbXBsYXRlKVwiLFxuICAgICAgICBudWQ6IGRvVGVtcGxhdGVMaXRlcmFsLFxuICAgICAgICBsZWQ6IGRvVGVtcGxhdGVMaXRlcmFsLFxuICAgICAgICBub1N1YnN0OiB0cnVlLFxuICAgICAgICB0YWlsOiB0cnVlIC8vIG1hcmsgYXMgdGFpbCwgc2luY2UgaXQncyBhbHdheXMgdGhlIGxhc3QgY29tcG9uZW50XG4gICAgfSwgYmFzZVRlbXBsYXRlU3ludGF4KTtcblxuICAgIHR5cGUoXCIocmVnZXhwKVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICAvLyBFQ01BU2NyaXB0IHBhcnNlclxuXG4gICAgZGVsaW0oXCIoZW5kbGluZSlcIik7XG4gICAgKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgeC5saW5lID0geC5mcm9tID0gMDtcbiAgICB9KShkZWxpbShcIihiZWdpbilcIikpO1xuICAgIGRlbGltKFwiKGVuZClcIikucmVhY2ggPSB0cnVlO1xuICAgIGRlbGltKFwiKGVycm9yKVwiKS5yZWFjaCA9IHRydWU7XG4gICAgZGVsaW0oXCJ9XCIpLnJlYWNoID0gdHJ1ZTtcbiAgICBkZWxpbShcIilcIik7XG4gICAgZGVsaW0oXCJdXCIpO1xuICAgIGRlbGltKFwiXFxcIlwiKS5yZWFjaCA9IHRydWU7XG4gICAgZGVsaW0oXCInXCIpLnJlYWNoID0gdHJ1ZTtcbiAgICBkZWxpbShcIjtcIik7XG4gICAgZGVsaW0oXCI6XCIpLnJlYWNoID0gdHJ1ZTtcbiAgICBkZWxpbShcIiNcIik7XG5cbiAgICByZXNlcnZlKFwiZWxzZVwiKTtcbiAgICByZXNlcnZlKFwiY2FzZVwiKS5yZWFjaCA9IHRydWU7XG4gICAgcmVzZXJ2ZShcImNhdGNoXCIpO1xuICAgIHJlc2VydmUoXCJkZWZhdWx0XCIpLnJlYWNoID0gdHJ1ZTtcbiAgICByZXNlcnZlKFwiZmluYWxseVwiKTtcbiAgICByZXNlcnZldmFyKFwiYXJndW1lbnRzXCIsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgaWYgKHN0YXRlLmlzU3RyaWN0KCkgJiYgc3RhdGUuZnVuY3RbXCIoZ2xvYmFsKVwiXSkge1xuICAgICAgICAgICAgd2FybmluZyhcIkUwMDhcIiwgeCk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXNlcnZldmFyKFwiZXZhbFwiKTtcbiAgICByZXNlcnZldmFyKFwiZmFsc2VcIik7XG4gICAgcmVzZXJ2ZXZhcihcIkluZmluaXR5XCIpO1xuICAgIHJlc2VydmV2YXIoXCJudWxsXCIpO1xuICAgIHJlc2VydmV2YXIoXCJ0aGlzXCIsIGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgaWYgKHN0YXRlLmlzU3RyaWN0KCkgJiYgIWlzTWV0aG9kKCkgJiZcbiAgICAgICAgICAgICFzdGF0ZS5vcHRpb24udmFsaWR0aGlzICYmICgoc3RhdGUuZnVuY3RbXCIoc3RhdGVtZW50KVwiXSAmJlxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKG5hbWUpXCJdLmNoYXJBdCgwKSA+IFwiWlwiKSB8fCBzdGF0ZS5mdW5jdFtcIihnbG9iYWwpXCJdKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNDBcIiwgeCk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXNlcnZldmFyKFwidHJ1ZVwiKTtcbiAgICByZXNlcnZldmFyKFwidW5kZWZpbmVkXCIpO1xuXG4gICAgYXNzaWdub3AoXCI9XCIsIFwiYXNzaWduXCIsIDIwKTtcbiAgICBhc3NpZ25vcChcIis9XCIsIFwiYXNzaWduYWRkXCIsIDIwKTtcbiAgICBhc3NpZ25vcChcIi09XCIsIFwiYXNzaWduc3ViXCIsIDIwKTtcbiAgICBhc3NpZ25vcChcIio9XCIsIFwiYXNzaWdubXVsdFwiLCAyMCk7XG4gICAgYXNzaWdub3AoXCIvPVwiLCBcImFzc2lnbmRpdlwiLCAyMCkubnVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGVycm9yKFwiRTAxNFwiKTtcbiAgICB9O1xuICAgIGFzc2lnbm9wKFwiJT1cIiwgXCJhc3NpZ25tb2RcIiwgMjApO1xuXG4gICAgYml0d2lzZWFzc2lnbm9wKFwiJj1cIik7XG4gICAgYml0d2lzZWFzc2lnbm9wKFwifD1cIik7XG4gICAgYml0d2lzZWFzc2lnbm9wKFwiXj1cIik7XG4gICAgYml0d2lzZWFzc2lnbm9wKFwiPDw9XCIpO1xuICAgIGJpdHdpc2Vhc3NpZ25vcChcIj4+PVwiKTtcbiAgICBiaXR3aXNlYXNzaWdub3AoXCI+Pj49XCIpO1xuICAgIGluZml4KFwiLFwiLCBmdW5jdGlvbihsZWZ0LCB0aGF0KSB7XG4gICAgICAgIHZhciBleHByO1xuICAgICAgICB0aGF0LmV4cHJzID0gW2xlZnRdO1xuXG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubm9jb21tYSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjdcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvbW1hKHsgcGVlazogdHJ1ZSB9KSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoYXQ7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIGlmICghKGV4cHIgPSBleHByZXNzaW9uKDEwKSkpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoYXQuZXhwcnMucHVzaChleHByKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSAhPT0gXCIsXCIgfHwgIWNvbW1hKCkpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCAxMCwgdHJ1ZSk7XG5cbiAgICBpbmZpeChcIj9cIiwgZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICBpbmNyZWFzZUNvbXBsZXhpdHlDb3VudCgpO1xuICAgICAgICB0aGF0LmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGF0LnJpZ2h0ID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIGFkdmFuY2UoXCI6XCIpO1xuICAgICAgICB0aGF0W1wiZWxzZVwiXSA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCAzMCk7XG5cbiAgICB2YXIgb3JQcmVjZW5kZW5jZSA9IDQwO1xuICAgIGluZml4KFwifHxcIiwgZnVuY3Rpb24obGVmdCwgdGhhdCkge1xuICAgICAgICBpbmNyZWFzZUNvbXBsZXhpdHlDb3VudCgpO1xuICAgICAgICB0aGF0LmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGF0LnJpZ2h0ID0gZXhwcmVzc2lvbihvclByZWNlbmRlbmNlKTtcbiAgICAgICAgcmV0dXJuIHRoYXQ7XG4gICAgfSwgb3JQcmVjZW5kZW5jZSk7XG4gICAgaW5maXgoXCImJlwiLCBcImFuZFwiLCA1MCk7XG4gICAgYml0d2lzZShcInxcIiwgXCJiaXRvclwiLCA3MCk7XG4gICAgYml0d2lzZShcIl5cIiwgXCJiaXR4b3JcIiwgODApO1xuICAgIGJpdHdpc2UoXCImXCIsIFwiYml0YW5kXCIsIDkwKTtcbiAgICByZWxhdGlvbihcIj09XCIsIGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICAgIHZhciBlcW51bGwgPSBzdGF0ZS5vcHRpb24uZXFudWxsICYmXG4gICAgICAgICAgICAoKGxlZnQgJiYgbGVmdC52YWx1ZSkgPT09IFwibnVsbFwiIHx8IChyaWdodCAmJiByaWdodC52YWx1ZSkgPT09IFwibnVsbFwiKTtcblxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgIGNhc2UgIWVxbnVsbCAmJiBzdGF0ZS5vcHRpb24uZXFlcWVxOlxuICAgICAgICAgICAgICAgIHRoaXMuZnJvbSA9IHRoaXMuY2hhcmFjdGVyO1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE2XCIsIHRoaXMsIFwiPT09XCIsIFwiPT1cIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGlzUG9vclJlbGF0aW9uKGxlZnQpOlxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDQxXCIsIHRoaXMsIFwiPT09XCIsIGxlZnQudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBpc1Bvb3JSZWxhdGlvbihyaWdodCk6XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNDFcIiwgdGhpcywgXCI9PT1cIiwgcmlnaHQudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBpc1R5cG9UeXBlb2YocmlnaHQsIGxlZnQsIHN0YXRlKTpcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEyMlwiLCB0aGlzLCByaWdodC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGlzVHlwb1R5cGVvZihsZWZ0LCByaWdodCwgc3RhdGUpOlxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIGxlZnQudmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gICAgcmVsYXRpb24oXCI9PT1cIiwgZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgaWYgKGlzVHlwb1R5cGVvZihyaWdodCwgbGVmdCwgc3RhdGUpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzEyMlwiLCB0aGlzLCByaWdodC52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBvVHlwZW9mKGxlZnQsIHJpZ2h0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIGxlZnQudmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuICAgIHJlbGF0aW9uKFwiIT1cIiwgZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgdmFyIGVxbnVsbCA9IHN0YXRlLm9wdGlvbi5lcW51bGwgJiZcbiAgICAgICAgICAgICgobGVmdCAmJiBsZWZ0LnZhbHVlKSA9PT0gXCJudWxsXCIgfHwgKHJpZ2h0ICYmIHJpZ2h0LnZhbHVlKSA9PT0gXCJudWxsXCIpO1xuXG4gICAgICAgIGlmICghZXFudWxsICYmIHN0YXRlLm9wdGlvbi5lcWVxZXEpIHtcbiAgICAgICAgICAgIHRoaXMuZnJvbSA9IHRoaXMuY2hhcmFjdGVyO1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMTZcIiwgdGhpcywgXCIhPT1cIiwgXCIhPVwiKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1Bvb3JSZWxhdGlvbihsZWZ0KSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNDFcIiwgdGhpcywgXCIhPT1cIiwgbGVmdC52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNQb29yUmVsYXRpb24ocmlnaHQpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA0MVwiLCB0aGlzLCBcIiE9PVwiLCByaWdodC52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBvVHlwZW9mKHJpZ2h0LCBsZWZ0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIHJpZ2h0LnZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1R5cG9UeXBlb2YobGVmdCwgcmlnaHQsIHN0YXRlKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjJcIiwgdGhpcywgbGVmdC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gICAgcmVsYXRpb24oXCIhPT1cIiwgZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgICAgaWYgKGlzVHlwb1R5cGVvZihyaWdodCwgbGVmdCwgc3RhdGUpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzEyMlwiLCB0aGlzLCByaWdodC52YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNUeXBvVHlwZW9mKGxlZnQsIHJpZ2h0LCBzdGF0ZSkpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIyXCIsIHRoaXMsIGxlZnQudmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuICAgIHJlbGF0aW9uKFwiPFwiKTtcbiAgICByZWxhdGlvbihcIj5cIik7XG4gICAgcmVsYXRpb24oXCI8PVwiKTtcbiAgICByZWxhdGlvbihcIj49XCIpO1xuICAgIGJpdHdpc2UoXCI8PFwiLCBcInNoaWZ0bGVmdFwiLCAxMjApO1xuICAgIGJpdHdpc2UoXCI+PlwiLCBcInNoaWZ0cmlnaHRcIiwgMTIwKTtcbiAgICBiaXR3aXNlKFwiPj4+XCIsIFwic2hpZnRyaWdodHVuc2lnbmVkXCIsIDEyMCk7XG4gICAgaW5maXgoXCJpblwiLCBcImluXCIsIDEyMCk7XG4gICAgaW5maXgoXCJpbnN0YW5jZW9mXCIsIFwiaW5zdGFuY2VvZlwiLCAxMjApO1xuICAgIGluZml4KFwiK1wiLCBmdW5jdGlvbihsZWZ0LCB0aGF0KSB7XG4gICAgICAgIHZhciByaWdodDtcbiAgICAgICAgdGhhdC5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhhdC5yaWdodCA9IHJpZ2h0ID0gZXhwcmVzc2lvbigxMzApO1xuXG4gICAgICAgIGlmIChsZWZ0ICYmIHJpZ2h0ICYmIGxlZnQuaWQgPT09IFwiKHN0cmluZylcIiAmJiByaWdodC5pZCA9PT0gXCIoc3RyaW5nKVwiKSB7XG4gICAgICAgICAgICBsZWZ0LnZhbHVlICs9IHJpZ2h0LnZhbHVlO1xuICAgICAgICAgICAgbGVmdC5jaGFyYWN0ZXIgPSByaWdodC5jaGFyYWN0ZXI7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5zY3JpcHR1cmwgJiYgamF2YXNjcmlwdFVSTC50ZXN0KGxlZnQudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNTBcIiwgbGVmdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbGVmdDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGF0O1xuICAgIH0sIDEzMCk7XG4gICAgcHJlZml4KFwiK1wiLCBcIm51bVwiKTtcbiAgICBwcmVmaXgoXCIrKytcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHdhcm5pbmcoXCJXMDA3XCIpO1xuICAgICAgICB0aGlzLmFyaXR5ID0gXCJ1bmFyeVwiO1xuICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbigxNTApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICBpbmZpeChcIisrK1wiLCBmdW5jdGlvbihsZWZ0KSB7XG4gICAgICAgIHdhcm5pbmcoXCJXMDA3XCIpO1xuICAgICAgICB0aGlzLmxlZnQgPSBsZWZ0O1xuICAgICAgICB0aGlzLnJpZ2h0ID0gZXhwcmVzc2lvbigxMzApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LCAxMzApO1xuICAgIGluZml4KFwiLVwiLCBcInN1YlwiLCAxMzApO1xuICAgIHByZWZpeChcIi1cIiwgXCJuZWdcIik7XG4gICAgcHJlZml4KFwiLS0tXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB3YXJuaW5nKFwiVzAwNlwiKTtcbiAgICAgICAgdGhpcy5hcml0eSA9IFwidW5hcnlcIjtcbiAgICAgICAgdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTUwKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG4gICAgaW5maXgoXCItLS1cIiwgZnVuY3Rpb24obGVmdCkge1xuICAgICAgICB3YXJuaW5nKFwiVzAwNlwiKTtcbiAgICAgICAgdGhpcy5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhpcy5yaWdodCA9IGV4cHJlc3Npb24oMTMwKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSwgMTMwKTtcbiAgICBpbmZpeChcIipcIiwgXCJtdWx0XCIsIDE0MCk7XG4gICAgaW5maXgoXCIvXCIsIFwiZGl2XCIsIDE0MCk7XG4gICAgaW5maXgoXCIlXCIsIFwibW9kXCIsIDE0MCk7XG5cbiAgICBzdWZmaXgoXCIrK1wiKTtcbiAgICBwcmVmaXgoXCIrK1wiLCBcInByZWluY1wiKTtcbiAgICBzdGF0ZS5zeW50YXhbXCIrK1wiXS5leHBzID0gdHJ1ZTtcblxuICAgIHN1ZmZpeChcIi0tXCIpO1xuICAgIHByZWZpeChcIi0tXCIsIFwicHJlZGVjXCIpO1xuICAgIHN0YXRlLnN5bnRheFtcIi0tXCJdLmV4cHMgPSB0cnVlO1xuICAgIHByZWZpeChcImRlbGV0ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHAgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgaWYgKCFwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwLmlkICE9PSBcIi5cIiAmJiBwLmlkICE9PSBcIltcIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNTFcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5maXJzdCA9IHA7XG5cbiAgICAgICAgLy8gVGhlIGBkZWxldGVgIG9wZXJhdG9yIGFjY2VwdHMgdW5yZXNvbHZhYmxlIHJlZmVyZW5jZXMgd2hlbiBub3QgaW4gc3RyaWN0XG4gICAgICAgIC8vIG1vZGUsIHNvIHRoZSBvcGVyYW5kIG1heSBiZSB1bmRlZmluZWQuXG4gICAgICAgIGlmIChwLmlkZW50aWZpZXIgJiYgIXN0YXRlLmlzU3RyaWN0KCkpIHtcbiAgICAgICAgICAgIHAuZm9yZ2l2ZVVuZGVmID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuICAgIHByZWZpeChcIn5cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmIChzdGF0ZS5vcHRpb24uYml0d2lzZSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMTZcIiwgdGhpcywgXCJ+XCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG4gICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDE1MCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgcHJlZml4KFwiLi4uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIXN0YXRlLmluRVM2KHRydWUpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCB0aGlzLCBcInNwcmVhZC9yZXN0IG9wZXJhdG9yXCIsIFwiNlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRPRE86IEFsbG93IGFsbCBBc3NpZ25tZW50RXhwcmVzc2lvblxuICAgICAgICAvLyBvbmNlIHBhcnNpbmcgcGVybWl0cy5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gSG93IHRvIGhhbmRsZSBlZy4gbnVtYmVyLCBib29sZWFuIHdoZW4gdGhlIGJ1aWx0LWluXG4gICAgICAgIC8vIHByb3RvdHlwZSBvZiBtYXkgaGF2ZSBhbiBAQGl0ZXJhdG9yIGRlZmluaXRpb24/XG4gICAgICAgIC8vXG4gICAgICAgIC8vIE51bWJlci5wcm90b3R5cGVbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICogKCkge1xuICAgICAgICAvLyAgIHlpZWxkIHRoaXMudmFsdWVPZigpO1xuICAgICAgICAvLyB9O1xuICAgICAgICAvL1xuICAgICAgICAvLyB2YXIgYSA9IFsgLi4uMSBdO1xuICAgICAgICAvLyBjb25zb2xlLmxvZyhhKTsgLy8gWzFdO1xuICAgICAgICAvL1xuICAgICAgICAvLyBmb3IgKGxldCBuIG9mIFsuLi4xMF0pIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2cobik7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gLy8gMTBcbiAgICAgICAgLy9cbiAgICAgICAgLy9cbiAgICAgICAgLy8gQm9vbGVhbi5wcm90b3R5cGVbU3ltYm9sLml0ZXJhdG9yXSA9IGZ1bmN0aW9uICogKCkge1xuICAgICAgICAvLyAgIHlpZWxkIHRoaXMudmFsdWVPZigpO1xuICAgICAgICAvLyB9O1xuICAgICAgICAvL1xuICAgICAgICAvLyB2YXIgYSA9IFsgLi4udHJ1ZSBdO1xuICAgICAgICAvLyBjb25zb2xlLmxvZyhhKTsgLy8gW3RydWVdO1xuICAgICAgICAvL1xuICAgICAgICAvLyBmb3IgKGxldCBuIG9mIFsuLi5mYWxzZV0pIHtcbiAgICAgICAgLy8gICAgY29uc29sZS5sb2cobik7XG4gICAgICAgIC8vIH1cbiAgICAgICAgLy8gLy8gZmFsc2VcbiAgICAgICAgLy9cbiAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMubmV4dC5pZGVudGlmaWVyICYmXG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMubmV4dC50eXBlICE9PSBcIihzdHJpbmcpXCIgJiZcbiAgICAgICAgICAgICFjaGVja1B1bmN0dWF0b3JzKHN0YXRlLnRva2Vucy5uZXh0LCBbXCJbXCIsIFwiKFwiXSkpIHtcblxuICAgICAgICAgICAgZXJyb3IoXCJFMDMwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZXhwcmVzc2lvbigxNTApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIHByZWZpeChcIiFcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuYXJpdHkgPSBcInVuYXJ5XCI7XG4gICAgICAgIHRoaXMucmlnaHQgPSBleHByZXNzaW9uKDE1MCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLnJpZ2h0KSB7IC8vICchJyBmb2xsb3dlZCBieSBub3RoaW5nPyBHaXZlIHVwLlxuICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYmFuZ1t0aGlzLnJpZ2h0LmlkXSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMThcIiwgdGhpcywgXCIhXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgcHJlZml4KFwidHlwZW9mXCIsIChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHAgPSBleHByZXNzaW9uKDE1MCk7XG4gICAgICAgIHRoaXMuZmlyc3QgPSB0aGlzLnJpZ2h0ID0gcDtcblxuICAgICAgICBpZiAoIXApIHsgLy8gJ3R5cGVvZicgZm9sbG93ZWQgYnkgbm90aGluZz8gR2l2ZSB1cC5cbiAgICAgICAgICAgIHF1aXQoXCJFMDQxXCIsIHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVGhlIGB0eXBlb2ZgIG9wZXJhdG9yIGFjY2VwdHMgdW5yZXNvbHZhYmxlIHJlZmVyZW5jZXMsIHNvIHRoZSBvcGVyYW5kXG4gICAgICAgIC8vIG1heSBiZSB1bmRlZmluZWQuXG4gICAgICAgIGlmIChwLmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIHAuZm9yZ2l2ZVVuZGVmID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KSk7XG4gICAgcHJlZml4KFwibmV3XCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXAgPSBtZXRhUHJvcGVydHkoXCJ0YXJnZXRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KHRydWUpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLnByZXYsIFwibmV3LnRhcmdldFwiLCBcIjZcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgaW5GdW5jdGlvbiwgYyA9IHN0YXRlLmZ1bmN0O1xuICAgICAgICAgICAgd2hpbGUgKGMpIHtcbiAgICAgICAgICAgICAgICBpbkZ1bmN0aW9uID0gIWNbXCIoZ2xvYmFsKVwiXTtcbiAgICAgICAgICAgICAgICBpZiAoIWNbXCIoYXJyb3cpXCJdKSB7IGJyZWFrOyB9XG4gICAgICAgICAgICAgICAgYyA9IGNbXCIoY29udGV4dClcIl07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWluRnVuY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEzNlwiLCBzdGF0ZS50b2tlbnMucHJldiwgXCJuZXcudGFyZ2V0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKG1wKSB7IHJldHVybiBtcDsgfVxuXG4gICAgICAgIHZhciBjID0gZXhwcmVzc2lvbigxNTUpLCBpO1xuICAgICAgICBpZiAoYyAmJiBjLmlkICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIGlmIChjLmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICBjW1wibmV3XCJdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGMudmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIk51bWJlclwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiU3RyaW5nXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJCb29sZWFuXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJNYXRoXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJKU09OXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1M1wiLCBzdGF0ZS50b2tlbnMucHJldiwgYy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIlN5bWJvbFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1M1wiLCBzdGF0ZS50b2tlbnMucHJldiwgYy52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkZ1bmN0aW9uXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5ldmlsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNTRcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIkRhdGVcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIlJlZ0V4cFwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwidGhpc1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYy5pZCAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaSA9IGMudmFsdWUuc3Vic3RyKDAsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubmV3Y2FwICYmIChpIDwgXCJBXCIgfHwgaSA+IFwiWlwiKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmlzUHJlZGVmaW5lZChjLnZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1NVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGMuaWQgIT09IFwiLlwiICYmIGMuaWQgIT09IFwiW1wiICYmIGMuaWQgIT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDU2XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5zdXBlcm5ldylcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1N1wiLCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKFwiICYmICFzdGF0ZS5vcHRpb24uc3VwZXJuZXcpIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDU4XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBzdGF0ZS50b2tlbnMuY3Vyci52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5maXJzdCA9IHRoaXMucmlnaHQgPSBjO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICBzdGF0ZS5zeW50YXhbXCJuZXdcIl0uZXhwcyA9IHRydWU7XG5cbiAgICBwcmVmaXgoXCJ2b2lkXCIpLmV4cHMgPSB0cnVlO1xuXG4gICAgaW5maXgoXCIuXCIsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgdmFyIG0gPSBpZGVudGlmaWVyKGZhbHNlLCB0cnVlKTtcblxuICAgICAgICBpZiAodHlwZW9mIG0gPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIGNvdW50TWVtYmVyKG0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhhdC5sZWZ0ID0gbGVmdDtcbiAgICAgICAgdGhhdC5yaWdodCA9IG07XG5cbiAgICAgICAgaWYgKG0gJiYgbSA9PT0gXCJoYXNPd25Qcm9wZXJ0eVwiICYmIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIj1cIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMDFcIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobGVmdCAmJiBsZWZ0LnZhbHVlID09PSBcImFyZ3VtZW50c1wiICYmIChtID09PSBcImNhbGxlZVwiIHx8IG0gPT09IFwiY2FsbGVyXCIpKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUub3B0aW9uLm5vYXJnKVxuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDU5XCIsIGxlZnQsIG0pO1xuICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUuaXNTdHJpY3QoKSlcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDhcIik7XG4gICAgICAgIH0gZWxzZSBpZiAoIXN0YXRlLm9wdGlvbi5ldmlsICYmIGxlZnQgJiYgbGVmdC52YWx1ZSA9PT0gXCJkb2N1bWVudFwiICYmXG4gICAgICAgICAgICAobSA9PT0gXCJ3cml0ZVwiIHx8IG0gPT09IFwid3JpdGVsblwiKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNjBcIiwgbGVmdCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5ldmlsICYmIChtID09PSBcImV2YWxcIiB8fCBtID09PSBcImV4ZWNTY3JpcHRcIikpIHtcbiAgICAgICAgICAgIGlmIChpc0dsb2JhbEV2YWwobGVmdCwgc3RhdGUpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjFcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCAxNjAsIHRydWUpO1xuXG4gICAgaW5maXgoXCIoXCIsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5pbW1lZCAmJiBsZWZ0ICYmICFsZWZ0LmltbWVkICYmIGxlZnQuaWQgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwNjJcIik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbiA9IDA7XG4gICAgICAgIHZhciBwID0gW107XG5cbiAgICAgICAgaWYgKGxlZnQpIHtcbiAgICAgICAgICAgIGlmIChsZWZ0LnR5cGUgPT09IFwiKGlkZW50aWZpZXIpXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobGVmdC52YWx1ZS5tYXRjaCgvXltBLVpdKFtBLVowLTlfJF0qW2Etel1bQS1aYS16MC05XyRdKik/JC8pKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChcIkFycmF5IE51bWJlciBTdHJpbmcgQm9vbGVhbiBEYXRlIE9iamVjdCBFcnJvciBTeW1ib2xcIi5pbmRleE9mKGxlZnQudmFsdWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxlZnQudmFsdWUgPT09IFwiTWF0aFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjNcIiwgbGVmdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5uZXdjYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2NFwiLCBsZWZ0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIpXCIpIHtcbiAgICAgICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICAgICAgcFtwLmxlbmd0aF0gPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICBuICs9IDE7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29tbWEoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgbGVmdCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNSgpICYmIGxlZnQudmFsdWUgPT09IFwicGFyc2VJbnRcIiAmJiBuID09PSAxKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjVcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5vcHRpb24uZXZpbCkge1xuICAgICAgICAgICAgICAgIGlmIChsZWZ0LnZhbHVlID09PSBcImV2YWxcIiB8fCBsZWZ0LnZhbHVlID09PSBcIkZ1bmN0aW9uXCIgfHxcbiAgICAgICAgICAgICAgICAgICAgbGVmdC52YWx1ZSA9PT0gXCJleGVjU2NyaXB0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjFcIiwgbGVmdCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBbMF0gJiYgcFswXS5pZCA9PT0gXCIoc3RyaW5nKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRJbnRlcm5hbFNyYyhsZWZ0LCBwWzBdLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocFswXSAmJiBwWzBdLmlkID09PSBcIihzdHJpbmcpXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgKGxlZnQudmFsdWUgPT09IFwic2V0VGltZW91dFwiIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0LnZhbHVlID09PSBcInNldEludGVydmFsXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDY2XCIsIGxlZnQpO1xuICAgICAgICAgICAgICAgICAgICBhZGRJbnRlcm5hbFNyYyhsZWZ0LCBwWzBdLnZhbHVlKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyB3aW5kb3cuc2V0VGltZW91dC9zZXRJbnRlcnZhbFxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocFswXSAmJiBwWzBdLmlkID09PSBcIihzdHJpbmcpXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgbGVmdC52YWx1ZSA9PT0gXCIuXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgbGVmdC5sZWZ0LnZhbHVlID09PSBcIndpbmRvd1wiICYmXG4gICAgICAgICAgICAgICAgICAgIChsZWZ0LnJpZ2h0ID09PSBcInNldFRpbWVvdXRcIiB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbGVmdC5yaWdodCA9PT0gXCJzZXRJbnRlcnZhbFwiKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA2NlwiLCBsZWZ0KTtcbiAgICAgICAgICAgICAgICAgICAgYWRkSW50ZXJuYWxTcmMobGVmdCwgcFswXS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFsZWZ0LmlkZW50aWZpZXIgJiYgbGVmdC5pZCAhPT0gXCIuXCIgJiYgbGVmdC5pZCAhPT0gXCJbXCIgJiYgbGVmdC5pZCAhPT0gXCI9PlwiICYmXG4gICAgICAgICAgICAgICAgbGVmdC5pZCAhPT0gXCIoXCIgJiYgbGVmdC5pZCAhPT0gXCImJlwiICYmIGxlZnQuaWQgIT09IFwifHxcIiAmJiBsZWZ0LmlkICE9PSBcIj9cIiAmJlxuICAgICAgICAgICAgICAgICEoc3RhdGUuaW5FUzYoKSAmJiBsZWZ0W1wiKG5hbWUpXCJdKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDY3XCIsIHRoYXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhhdC5sZWZ0ID0gbGVmdDtcbiAgICAgICAgcmV0dXJuIHRoYXQ7XG4gICAgfSwgMTU1LCB0cnVlKS5leHBzID0gdHJ1ZTtcblxuICAgIHByZWZpeChcIihcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBwbiA9IHN0YXRlLnRva2Vucy5uZXh0LCBwbjEsIGkgPSAtMTtcbiAgICAgICAgdmFyIHJldCwgdHJpZ2dlckZuRXhwciwgZmlyc3QsIGxhc3Q7XG4gICAgICAgIHZhciBwYXJlbnMgPSAxO1xuICAgICAgICB2YXIgb3BlbmluZyA9IHN0YXRlLnRva2Vucy5jdXJyO1xuICAgICAgICB2YXIgcHJlY2VlZGluZyA9IHN0YXRlLnRva2Vucy5wcmV2O1xuICAgICAgICB2YXIgaXNOZWNlc3NhcnkgPSAhc3RhdGUub3B0aW9uLnNpbmdsZUdyb3VwcztcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBpZiAocG4udmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgcGFyZW5zICs9IDE7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHBuLnZhbHVlID09PSBcIilcIikge1xuICAgICAgICAgICAgICAgIHBhcmVucyAtPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpICs9IDE7XG4gICAgICAgICAgICBwbjEgPSBwbjtcbiAgICAgICAgICAgIHBuID0gcGVlayhpKTtcbiAgICAgICAgfSB3aGlsZSAoIShwYXJlbnMgPT09IDAgJiYgcG4xLnZhbHVlID09PSBcIilcIikgJiYgcG4udmFsdWUgIT09IFwiO1wiICYmIHBuLnR5cGUgIT09IFwiKGVuZClcIik7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIHRyaWdnZXJGbkV4cHIgPSBzdGF0ZS50b2tlbnMubmV4dC5pbW1lZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgYmFsYW5jZWQgZ3JvdXBpbmcgb3BlcmF0b3IgaXMgZm9sbG93ZWQgYnkgYSBcImZhdCBhcnJvd1wiLCB0aGVcbiAgICAgICAgLy8gY3VycmVudCB0b2tlbiBtYXJrcyB0aGUgYmVnaW5uaW5nIG9mIGEgXCJmYXQgYXJyb3dcIiBmdW5jdGlvbiBhbmQgcGFyc2luZ1xuICAgICAgICAvLyBzaG91bGQgcHJvY2VlZCBhY2NvcmRpbmdseS5cbiAgICAgICAgaWYgKHBuLnZhbHVlID09PSBcIj0+XCIpIHtcbiAgICAgICAgICAgIHJldHVybiBkb0Z1bmN0aW9uKHsgdHlwZTogXCJhcnJvd1wiLCBwYXJzZWRPcGVuaW5nOiB0cnVlIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cHJzID0gW107XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIilcIikge1xuICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICBleHBycy5wdXNoKGV4cHJlc3Npb24oMTApKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5ub2NvbW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTI3XCIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhZHZhbmNlKFwiKVwiLCB0aGlzKTtcbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5pbW1lZCAmJiBleHByc1swXSAmJiBleHByc1swXS5pZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKFwiICYmXG4gICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLlwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIltcIikge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDY4XCIsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFleHBycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZXhwcnMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgcmV0ID0gT2JqZWN0LmNyZWF0ZShzdGF0ZS5zeW50YXhbXCIsXCJdKTtcbiAgICAgICAgICAgIHJldC5leHBycyA9IGV4cHJzO1xuXG4gICAgICAgICAgICBmaXJzdCA9IGV4cHJzWzBdO1xuICAgICAgICAgICAgbGFzdCA9IGV4cHJzW2V4cHJzLmxlbmd0aCAtIDFdO1xuXG4gICAgICAgICAgICBpZiAoIWlzTmVjZXNzYXJ5KSB7XG4gICAgICAgICAgICAgICAgaXNOZWNlc3NhcnkgPSBwcmVjZWVkaW5nLmFzc2lnbiB8fCBwcmVjZWVkaW5nLmRlbGltO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0ID0gZmlyc3QgPSBsYXN0ID0gZXhwcnNbMF07XG5cbiAgICAgICAgICAgIGlmICghaXNOZWNlc3NhcnkpIHtcbiAgICAgICAgICAgICAgICBpc05lY2Vzc2FyeSA9XG4gICAgICAgICAgICAgICAgICAgIC8vIFVzZWQgdG8gZGlzdGluZ3Vpc2ggZnJvbSBhbiBFeHByZXNzaW9uU3RhdGVtZW50IHdoaWNoIG1heSBub3RcbiAgICAgICAgICAgICAgICAgICAgLy8gYmVnaW4gd2l0aCB0aGUgYHtgIGFuZCBgZnVuY3Rpb25gIHRva2Vuc1xuICAgICAgICAgICAgICAgICAgICAob3BlbmluZy5iZWdpbnNTdG10ICYmIChyZXQuaWQgPT09IFwie1wiIHx8IHRyaWdnZXJGbkV4cHIgfHwgaXNGdW5jdG9yKHJldCkpKSB8fFxuICAgICAgICAgICAgICAgICAgICAvLyBVc2VkIHRvIHNpZ25hbCB0aGF0IGEgZnVuY3Rpb24gZXhwcmVzc2lvbiBpcyBiZWluZyBzdXBwbGllZCB0b1xuICAgICAgICAgICAgICAgICAgICAvLyBzb21lIG90aGVyIG9wZXJhdG9yLlxuICAgICAgICAgICAgICAgICAgICAodHJpZ2dlckZuRXhwciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHBhcmVudGhlc2lzIHdyYXBwaW5nIGEgZnVuY3Rpb24gZXhwcmVzc2lvbiB0byBiZSBjb25zaWRlcmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBuZWNlc3NhcnksIHRoZSBncm91cGluZyBvcGVyYXRvciBzaG91bGQgYmUgdGhlIGxlZnQtaGFuZC1zaWRlIG9mXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzb21lIG90aGVyIG9wZXJhdG9yLS1laXRoZXIgd2l0aGluIHRoZSBwYXJlbnRoZXNpcyBvciBkaXJlY3RseVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZm9sbG93aW5nIHRoZW0uXG4gICAgICAgICAgICAgICAgICAgICAgICAoIWlzRW5kT2ZFeHByKCkgfHwgc3RhdGUudG9rZW5zLnByZXYuaWQgIT09IFwifVwiKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgLy8gVXNlZCB0byBkZW1hcmNhdGUgYW4gYXJyb3cgZnVuY3Rpb24gYXMgdGhlIGxlZnQtaGFuZCBzaWRlIG9mIHNvbWVcbiAgICAgICAgICAgICAgICAgICAgLy8gb3BlcmF0b3IuXG4gICAgICAgICAgICAgICAgICAgIChpc0Z1bmN0b3IocmV0KSAmJiAhaXNFbmRPZkV4cHIoKSkgfHxcbiAgICAgICAgICAgICAgICAgICAgLy8gVXNlZCBhcyB0aGUgcmV0dXJuIHZhbHVlIG9mIGEgc2luZ2xlLXN0YXRlbWVudCBhcnJvdyBmdW5jdGlvblxuICAgICAgICAgICAgICAgICAgICAocmV0LmlkID09PSBcIntcIiAmJiBwcmVjZWVkaW5nLmlkID09PSBcIj0+XCIpIHx8XG4gICAgICAgICAgICAgICAgICAgIC8vIFVzZWQgdG8gZGVsaW5lYXRlIGFuIGludGVnZXIgbnVtYmVyIGxpdGVyYWwgZnJvbSBhIGRlcmVmZXJlbmNpbmdcbiAgICAgICAgICAgICAgICAgICAgLy8gcHVuY3R1YXRvciAob3RoZXJ3aXNlIGludGVycHJldGVkIGFzIGEgZGVjaW1hbCBwb2ludClcbiAgICAgICAgICAgICAgICAgICAgKHJldC50eXBlID09PSBcIihudW1iZXIpXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrUHVuY3R1YXRvcihwbiwgXCIuXCIpICYmIC9eXFxkKyQvLnRlc3QocmV0LnZhbHVlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmV0KSB7XG4gICAgICAgICAgICAvLyBUaGUgb3BlcmF0b3IgbWF5IGJlIG5lY2Vzc2FyeSB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBiaW5kaW5nIHBvd2VyIG9mXG4gICAgICAgICAgICAvLyBuZWlnaGJvcmluZyBvcGVyYXRvcnMgKHdoZW5ldmVyIHRoZXJlIGlzIGFuIG9wZXJhdG9yIGluIHVzZSB3aXRoaW4gdGhlXG4gICAgICAgICAgICAvLyBmaXJzdCBleHByZXNzaW9uICpvciogdGhlIGN1cnJlbnQgZ3JvdXAgY29udGFpbnMgbXVsdGlwbGUgZXhwcmVzc2lvbnMpXG4gICAgICAgICAgICBpZiAoIWlzTmVjZXNzYXJ5ICYmIChmaXJzdC5sZWZ0IHx8IGZpcnN0LnJpZ2h0IHx8IHJldC5leHBycykpIHtcbiAgICAgICAgICAgICAgICBpc05lY2Vzc2FyeSA9XG4gICAgICAgICAgICAgICAgICAgICghaXNCZWdpbk9mRXhwcihwcmVjZWVkaW5nKSAmJiBmaXJzdC5sYnAgPD0gcHJlY2VlZGluZy5sYnApIHx8XG4gICAgICAgICAgICAgICAgICAgICghaXNFbmRPZkV4cHIoKSAmJiBsYXN0LmxicCA8IHN0YXRlLnRva2Vucy5uZXh0LmxicCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghaXNOZWNlc3NhcnkpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEyNlwiLCBvcGVuaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0LnBhcmVuID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfSk7XG5cbiAgICBhcHBsaWNhdGlvbihcIj0+XCIpO1xuXG4gICAgaW5maXgoXCJbXCIsIGZ1bmN0aW9uKGxlZnQsIHRoYXQpIHtcbiAgICAgICAgdmFyIGUgPSBleHByZXNzaW9uKDEwKSwgcztcbiAgICAgICAgaWYgKGUgJiYgZS50eXBlID09PSBcIihzdHJpbmcpXCIpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmV2aWwgJiYgKGUudmFsdWUgPT09IFwiZXZhbFwiIHx8IGUudmFsdWUgPT09IFwiZXhlY1NjcmlwdFwiKSkge1xuICAgICAgICAgICAgICAgIGlmIChpc0dsb2JhbEV2YWwobGVmdCwgc3RhdGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDYxXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY291bnRNZW1iZXIoZS52YWx1ZSk7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5zdWIgJiYgaWRlbnRpZmllclJlZ0V4cC50ZXN0KGUudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcyA9IHN0YXRlLnN5bnRheFtlLnZhbHVlXTtcbiAgICAgICAgICAgICAgICBpZiAoIXMgfHwgIWlzUmVzZXJ2ZWQocykpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNjlcIiwgc3RhdGUudG9rZW5zLnByZXYsIGUudmFsdWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlKFwiXVwiLCB0aGF0KTtcblxuICAgICAgICBpZiAoZSAmJiBlLnZhbHVlID09PSBcImhhc093blByb3BlcnR5XCIgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzAwMVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoYXQubGVmdCA9IGxlZnQ7XG4gICAgICAgIHRoYXQucmlnaHQgPSBlO1xuICAgICAgICByZXR1cm4gdGhhdDtcbiAgICB9LCAxNjAsIHRydWUpO1xuXG4gICAgZnVuY3Rpb24gY29tcHJlaGVuc2l2ZUFycmF5RXhwcmVzc2lvbigpIHtcbiAgICAgICAgdmFyIHJlczogeyBleHBzPzsgZmlsdGVyPzsgbGVmdD87IHJpZ2h0P30gPSB7fTtcbiAgICAgICAgcmVzLmV4cHMgPSB0cnVlO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb21wYXJyYXkpXCJdLnN0YWNrKCk7XG5cbiAgICAgICAgLy8gSGFuZGxlIHJldmVyc2VkIGZvciBleHByZXNzaW9ucywgdXNlZCBpbiBzcGlkZXJtb25rZXlcbiAgICAgICAgdmFyIHJldmVyc2VkID0gZmFsc2U7XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSAhPT0gXCJmb3JcIikge1xuICAgICAgICAgICAgcmV2ZXJzZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbk1veigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTZcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiZm9yXCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc2V0U3RhdGUoXCJ1c2VcIik7XG4gICAgICAgICAgICByZXMucmlnaHQgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFkdmFuY2UoXCJmb3JcIik7XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJlYWNoXCIpIHtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJlYWNoXCIpO1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbk1veigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMThcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZm9yIGVhY2hcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc2V0U3RhdGUoXCJkZWZpbmVcIik7XG4gICAgICAgIHJlcy5sZWZ0ID0gZXhwcmVzc2lvbigxMzApO1xuICAgICAgICBpZiAoY29udGFpbnMoW1wiaW5cIiwgXCJvZlwiXSwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpKSB7XG4gICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwNDVcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc2V0U3RhdGUoXCJnZW5lcmF0ZVwiKTtcbiAgICAgICAgZXhwcmVzc2lvbigxMCk7XG5cbiAgICAgICAgYWR2YW5jZShcIilcIik7XG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJpZlwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiaWZcIik7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc2V0U3RhdGUoXCJmaWx0ZXJcIik7XG4gICAgICAgICAgICByZXMuZmlsdGVyID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmV2ZXJzZWQpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbXBhcnJheSlcIl0uc2V0U3RhdGUoXCJ1c2VcIik7XG4gICAgICAgICAgICByZXMucmlnaHQgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGFkdmFuY2UoXCJdXCIpO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihjb21wYXJyYXkpXCJdLnVuc3RhY2soKTtcbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICBwcmVmaXgoXCJbXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYmxvY2t0eXBlID0gbG9va3VwQmxvY2tUeXBlKCk7XG4gICAgICAgIGlmIChibG9ja3R5cGUuaXNDb21wQXJyYXkpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmVzbmV4dCAmJiAhc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImFycmF5IGNvbXByZWhlbnNpb25cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY29tcHJlaGVuc2l2ZUFycmF5RXhwcmVzc2lvbigpO1xuICAgICAgICB9IGVsc2UgaWYgKGJsb2NrdHlwZS5pc0Rlc3RBc3NpZ24pIHtcbiAgICAgICAgICAgIHRoaXMuZGVzdHJ1Y3RBc3NpZ24gPSBkZXN0cnVjdHVyaW5nUGF0dGVybih7IG9wZW5pbmdQYXJzZWQ6IHRydWUsIGFzc2lnbm1lbnQ6IHRydWUgfSk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuICAgICAgICB2YXIgYiA9IHN0YXRlLnRva2Vucy5jdXJyLmxpbmUgIT09IHN0YXJ0TGluZShzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgIHRoaXMuZmlyc3QgPSBbXTtcbiAgICAgICAgaWYgKGIpIHtcbiAgICAgICAgICAgIGluZGVudCArPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmZyb20gPT09IGluZGVudCArIHN0YXRlLm9wdGlvbi5pbmRlbnQpIHtcbiAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIixcIikge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLmVsaXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNSgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBNYWludGFpbiBjb21wYXQgd2l0aCBvbGQgb3B0aW9ucyAtLS0gRVM1IG1vZGUgd2l0aG91dFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZWxpc2lvbj10cnVlIHdpbGwgd2FybiBvbmNlIHBlciBjb21tYVxuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzBcIik7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEyOFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIixcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIl1cIikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmZpcnN0LnB1c2goZXhwcmVzc2lvbigxMCkpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIixcIikge1xuICAgICAgICAgICAgICAgIGNvbW1hKHsgYWxsb3dUcmFpbGluZzogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiXVwiICYmICFzdGF0ZS5pbkVTNSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoYikge1xuICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZShcIl1cIiwgdGhpcyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG5cbiAgICBmdW5jdGlvbiBpc01ldGhvZCgpIHtcbiAgICAgICAgcmV0dXJuIHN0YXRlLmZ1bmN0W1wiKHN0YXRlbWVudClcIl0gJiYgc3RhdGUuZnVuY3RbXCIoc3RhdGVtZW50KVwiXS50eXBlID09PSBcImNsYXNzXCIgfHxcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdICYmIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKHZlcmIpXCJdID09PSBcImNsYXNzXCI7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBpc1Byb3BlcnR5TmFtZSh0b2tlbikge1xuICAgICAgICByZXR1cm4gdG9rZW4uaWRlbnRpZmllciB8fCB0b2tlbi5pZCA9PT0gXCIoc3RyaW5nKVwiIHx8IHRva2VuLmlkID09PSBcIihudW1iZXIpXCI7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBwcm9wZXJ0eU5hbWUocHJlc2VydmVPclRva2VuPykge1xuICAgICAgICB2YXIgaWQ7XG4gICAgICAgIHZhciBwcmVzZXJ2ZSA9IHRydWU7XG4gICAgICAgIGlmICh0eXBlb2YgcHJlc2VydmVPclRva2VuID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBpZCA9IHByZXNlcnZlT3JUb2tlbjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByZXNlcnZlID0gcHJlc2VydmVPclRva2VuO1xuICAgICAgICAgICAgaWQgPSBvcHRpb25hbGlkZW50aWZpZXIoZmFsc2UsIHRydWUsIHByZXNlcnZlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghaWQpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIoc3RyaW5nKVwiKSB7XG4gICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIXByZXNlcnZlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihudW1iZXIpXCIpIHtcbiAgICAgICAgICAgICAgICBpZCA9IHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmVzZXJ2ZSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpZCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAgaWYgKGlkLmlkID09PSBcIihzdHJpbmcpXCIgfHwgaWQuaWQgPT09IFwiKGlkZW50aWZpZXIpXCIpIGlkID0gaWQudmFsdWU7XG4gICAgICAgICAgICBlbHNlIGlmIChpZC5pZCA9PT0gXCIobnVtYmVyKVwiKSBpZCA9IGlkLnZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaWQgPT09IFwiaGFzT3duUHJvcGVydHlcIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcwMDFcIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgICAqIEBwYXJhbSB7dG9rZW59IFtvcHRpb25zLmxvbmVBcmddIFRoZSBhcmd1bWVudCB0byB0aGUgZnVuY3Rpb24gaW4gY2FzZXNcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSBpdCB3YXMgZGVmaW5lZCB1c2luZyB0aGVcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGUtYXJndW1lbnQgc2hvcnRoYW5kLlxuICAgICAqIEBwYXJhbSB7Ym9vbH0gW29wdGlvbnMucGFyc2VkT3BlbmluZ10gV2hldGhlciB0aGUgb3BlbmluZyBwYXJlbnRoZXNpcyBoYXNcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFscmVhZHkgYmVlbiBwYXJzZWQuXG4gICAgICogQHJldHVybnMge3sgYXJpdHk6IG51bWJlciwgcGFyYW1zOiBBcnJheS48c3RyaW5nPn19XG4gICAgICovXG4gICAgZnVuY3Rpb24gZnVuY3Rpb25wYXJhbXMob3B0aW9ucykge1xuICAgICAgICB2YXIgbmV4dDtcbiAgICAgICAgdmFyIHBhcmFtc0lkcyA9IFtdO1xuICAgICAgICB2YXIgaWRlbnQ7XG4gICAgICAgIHZhciB0b2tlbnMgPSBbXTtcbiAgICAgICAgdmFyIHQ7XG4gICAgICAgIHZhciBwYXN0RGVmYXVsdCA9IGZhbHNlO1xuICAgICAgICB2YXIgcGFzdFJlc3QgPSBmYWxzZTtcbiAgICAgICAgdmFyIGFyaXR5ID0gMDtcbiAgICAgICAgdmFyIGxvbmVBcmcgPSBvcHRpb25zICYmIG9wdGlvbnMubG9uZUFyZztcblxuICAgICAgICBpZiAobG9uZUFyZyAmJiBsb25lQXJnLmlkZW50aWZpZXIgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRQYXJhbShsb25lQXJnLnZhbHVlLCBsb25lQXJnKTtcbiAgICAgICAgICAgIHJldHVybiB7IGFyaXR5OiAxLCBwYXJhbXM6IFtsb25lQXJnLnZhbHVlXSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgbmV4dCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuXG4gICAgICAgIGlmICghb3B0aW9ucyB8fCAhb3B0aW9ucy5wYXJzZWRPcGVuaW5nKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIpXCIpIHtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYWRkUGFyYW0oYWRkUGFyYW1BcmdzKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkUGFyYW0uYXBwbHkoc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLCBhZGRQYXJhbUFyZ3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgIGFyaXR5Kys7XG4gICAgICAgICAgICAvLyBhcmUgYWRkZWQgdG8gdGhlIHBhcmFtIHNjb3BlXG4gICAgICAgICAgICB2YXIgY3VycmVudFBhcmFtcyA9IFtdO1xuXG4gICAgICAgICAgICBpZiAoY29udGFpbnMoW1wie1wiLCBcIltcIl0sIHN0YXRlLnRva2Vucy5uZXh0LmlkKSkge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKCk7XG4gICAgICAgICAgICAgICAgZm9yICh0IGluIHRva2Vucykge1xuICAgICAgICAgICAgICAgICAgICB0ID0gdG9rZW5zW3RdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFyYW1zSWRzLnB1c2godC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50UGFyYW1zLnB1c2goW3QuaWQsIHQudG9rZW5dKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIuLi5cIikpIHBhc3RSZXN0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZGVudCA9IGlkZW50aWZpZXIodHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGlkZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmFtc0lkcy5wdXNoKGlkZW50KTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFBhcmFtcy5wdXNoKFtpZGVudCwgc3RhdGUudG9rZW5zLmN1cnJdKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIGludmFsaWQgcGFyYW1ldGVyLlxuICAgICAgICAgICAgICAgICAgICB3aGlsZSAoIWNoZWNrUHVuY3R1YXRvcnMoc3RhdGUudG9rZW5zLm5leHQsIFtcIixcIiwgXCIpXCJdKSkgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSXQgaXMgdmFsaWQgdG8gaGF2ZSBhIHJlZ3VsYXIgYXJndW1lbnQgYWZ0ZXIgYSBkZWZhdWx0IGFyZ3VtZW50XG4gICAgICAgICAgICAvLyBzaW5jZSB1bmRlZmluZWQgY2FuIGJlIHVzZWQgZm9yIG1pc3NpbmcgcGFyYW1ldGVycy4gU3RpbGwgd2FybiBhcyBpdCBpc1xuICAgICAgICAgICAgLy8gYSBwb3NzaWJsZSBjb2RlIHNtZWxsLlxuICAgICAgICAgICAgaWYgKHBhc3REZWZhdWx0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIj1cIikge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIlcxMzhcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiZGVmYXVsdCBwYXJhbWV0ZXJzXCIsIFwiNlwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIj1cIik7XG4gICAgICAgICAgICAgICAgcGFzdERlZmF1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBub3cgd2UgaGF2ZSBldmFsdWF0ZWQgdGhlIGRlZmF1bHQgZXhwcmVzc2lvbiwgYWRkIHRoZSB2YXJpYWJsZSB0byB0aGUgcGFyYW0gc2NvcGVcbiAgICAgICAgICAgIGN1cnJlbnRQYXJhbXMuZm9yRWFjaChhZGRQYXJhbSk7XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAocGFzdFJlc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzFcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21tYSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKVwiLCBuZXh0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBhcml0eTogYXJpdHksIHBhcmFtczogcGFyYW1zSWRzIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmdW5jdG9yKG5hbWUsIHRva2VuLCBvdmVyd3JpdGVzKSB7XG4gICAgICAgIHZhciBmdW5jdCA9IHtcbiAgICAgICAgICAgIFwiKG5hbWUpXCI6IG5hbWUsXG4gICAgICAgICAgICBcIihicmVha2FnZSlcIjogMCxcbiAgICAgICAgICAgIFwiKGxvb3BhZ2UpXCI6IDAsXG4gICAgICAgICAgICBcIih0b2tlbnMpXCI6IHt9LFxuICAgICAgICAgICAgXCIocHJvcGVydGllcylcIjoge30sXG5cbiAgICAgICAgICAgIFwiKGNhdGNoKVwiOiBmYWxzZSxcbiAgICAgICAgICAgIFwiKGdsb2JhbClcIjogZmFsc2UsXG5cbiAgICAgICAgICAgIFwiKGxpbmUpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihjaGFyYWN0ZXIpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihtZXRyaWNzKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoc3RhdGVtZW50KVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoY29udGV4dClcIjogbnVsbCxcbiAgICAgICAgICAgIFwiKHNjb3BlKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoY29tcGFycmF5KVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoZ2VuZXJhdG9yKVwiOiBudWxsLFxuICAgICAgICAgICAgXCIoYXJyb3cpXCI6IG51bGwsXG4gICAgICAgICAgICBcIihwYXJhbXMpXCI6IG51bGxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgIGV4dGVuZChmdW5jdCwge1xuICAgICAgICAgICAgICAgIFwiKGxpbmUpXCI6IHRva2VuLmxpbmUsXG4gICAgICAgICAgICAgICAgXCIoY2hhcmFjdGVyKVwiOiB0b2tlbi5jaGFyYWN0ZXIsXG4gICAgICAgICAgICAgICAgXCIobWV0cmljcylcIjogY3JlYXRlTWV0cmljcyh0b2tlbilcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZXh0ZW5kKGZ1bmN0LCBvdmVyd3JpdGVzKTtcblxuICAgICAgICBpZiAoZnVuY3RbXCIoY29udGV4dClcIl0pIHtcbiAgICAgICAgICAgIGZ1bmN0W1wiKHNjb3BlKVwiXSA9IGZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKHNjb3BlKVwiXTtcbiAgICAgICAgICAgIGZ1bmN0W1wiKGNvbXBhcnJheSlcIl0gPSBmdW5jdFtcIihjb250ZXh0KVwiXVtcIihjb21wYXJyYXkpXCJdO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzRnVuY3Rvcih0b2tlbikge1xuICAgICAgICByZXR1cm4gXCIoc2NvcGUpXCIgaW4gdG9rZW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lIGlmIHRoZSBwYXJzZXIgaGFzIGJlZ3VuIHBhcnNpbmcgZXhlY3V0YWJsZSBjb2RlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtUb2tlbn0gZnVuY3QgLSBUaGUgY3VycmVudCBcImZ1bmN0b3JcIiB0b2tlblxuICAgICAqXG4gICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICovXG4gICAgZnVuY3Rpb24gaGFzUGFyc2VkQ29kZShmdW5jdCkge1xuICAgICAgICByZXR1cm4gZnVuY3RbXCIoZ2xvYmFsKVwiXSAmJiAhZnVuY3RbXCIodmVyYilcIl07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZG9UZW1wbGF0ZUxpdGVyYWwobGVmdCkge1xuICAgICAgICAvLyBBU1NFUlQ6IHRoaXMudHlwZSA9PT0gXCIodGVtcGxhdGUpXCJcbiAgICAgICAgLy8ganNoaW50IHZhbGlkdGhpczogdHJ1ZVxuICAgICAgICB2YXIgY3R4ID0gdGhpcy5jb250ZXh0O1xuICAgICAgICB2YXIgbm9TdWJzdCA9IHRoaXMubm9TdWJzdDtcbiAgICAgICAgdmFyIGRlcHRoID0gdGhpcy5kZXB0aDtcblxuICAgICAgICBpZiAoIW5vU3Vic3QpIHtcbiAgICAgICAgICAgIHdoaWxlICghZW5kKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0LnRlbXBsYXRlIHx8IHN0YXRlLnRva2Vucy5uZXh0LmRlcHRoID4gZGVwdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbigwKTsgLy8gc2hvdWxkIHByb2JhYmx5IGhhdmUgZGlmZmVyZW50IHJicD9cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBza2lwIHRlbXBsYXRlIHN0YXJ0IC8gbWlkZGxlXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IFwiKHRlbXBsYXRlKVwiLFxuICAgICAgICAgICAgdHlwZTogXCIodGVtcGxhdGUpXCIsXG4gICAgICAgICAgICB0YWc6IGxlZnRcbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiBlbmQoKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLmN1cnIudGVtcGxhdGUgJiYgc3RhdGUudG9rZW5zLmN1cnIudGFpbCAmJlxuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmNvbnRleHQgPT09IGN0eCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB2YXIgY29tcGxldGUgPSAoc3RhdGUudG9rZW5zLm5leHQudGVtcGxhdGUgJiYgc3RhdGUudG9rZW5zLm5leHQudGFpbCAmJlxuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5uZXh0LmNvbnRleHQgPT09IGN0eCk7XG4gICAgICAgICAgICBpZiAoY29tcGxldGUpIGFkdmFuY2UoKTtcbiAgICAgICAgICAgIHJldHVybiBjb21wbGV0ZSB8fCBzdGF0ZS50b2tlbnMubmV4dC5pc1VuY2xvc2VkO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtvcHRpb25zXVxuICAgICAqIEBwYXJhbSB7dG9rZW59IFtvcHRpb25zLm5hbWVdIFRoZSBpZGVudGlmaWVyIGJlbG9uZ2luZyB0byB0aGUgZnVuY3Rpb24gKGlmXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYW55KVxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMuc3RhdGVtZW50XSBUaGUgc3RhdGVtZW50IHRoYXQgdHJpZ2dlcmVkIGNyZWF0aW9uXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9mIHRoZSBjdXJyZW50IGZ1bmN0aW9uLlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBbb3B0aW9ucy50eXBlXSBJZiBzcGVjaWZpZWQsIGVpdGhlciBcImdlbmVyYXRvclwiIG9yIFwiYXJyb3dcIlxuICAgICAqIEBwYXJhbSB7dG9rZW59IFtvcHRpb25zLmxvbmVBcmddIFRoZSBhcmd1bWVudCB0byB0aGUgZnVuY3Rpb24gaW4gY2FzZXNcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGVyZSBpdCB3YXMgZGVmaW5lZCB1c2luZyB0aGVcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW5nbGUtYXJndW1lbnQgc2hvcnRoYW5kXG4gICAgICogQHBhcmFtIHtib29sfSBbb3B0aW9ucy5wYXJzZWRPcGVuaW5nXSBXaGV0aGVyIHRoZSBvcGVuaW5nIHBhcmVudGhlc2lzIGhhc1xuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWxyZWFkeSBiZWVuIHBhcnNlZFxuICAgICAqIEBwYXJhbSB7dG9rZW59IFtvcHRpb25zLmNsYXNzRXhwckJpbmRpbmddIERlZmluZSBhIGZ1bmN0aW9uIHdpdGggdGhpc1xuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkZW50aWZpZXIgaW4gdGhlIG5ldyBmdW5jdGlvbidzXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUsIG1pbWlja2luZyB0aGUgYmFoYXZpb3Igb2ZcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzcyBleHByZXNzaW9uIG5hbWVzIHdpdGhpblxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoZSBib2R5IG9mIG1lbWJlciBmdW5jdGlvbnMuXG4gICAgICovXG4gICAgZnVuY3Rpb24gZG9GdW5jdGlvbihvcHRpb25zPzogeyBuYW1lPzsgc3RhdGVtZW50PzsgdHlwZT87IGxvbmVBcmc/OyBwYXJzZWRPcGVuaW5nPzsgY2xhc3NFeHByQmluZGluZz87IGlnbm9yZUxvb3BGdW5jP30pIHtcbiAgICAgICAgdmFyIGYsIHRva2VuLCBuYW1lLCBzdGF0ZW1lbnQsIGNsYXNzRXhwckJpbmRpbmcsIGlzR2VuZXJhdG9yLCBpc0Fycm93LCBpZ25vcmVMb29wRnVuYztcbiAgICAgICAgdmFyIG9sZE9wdGlvbiA9IHN0YXRlLm9wdGlvbjtcbiAgICAgICAgdmFyIG9sZElnbm9yZWQgPSBzdGF0ZS5pZ25vcmVkO1xuXG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICBuYW1lID0gb3B0aW9ucy5uYW1lO1xuICAgICAgICAgICAgc3RhdGVtZW50ID0gb3B0aW9ucy5zdGF0ZW1lbnQ7XG4gICAgICAgICAgICBjbGFzc0V4cHJCaW5kaW5nID0gb3B0aW9ucy5jbGFzc0V4cHJCaW5kaW5nO1xuICAgICAgICAgICAgaXNHZW5lcmF0b3IgPSBvcHRpb25zLnR5cGUgPT09IFwiZ2VuZXJhdG9yXCI7XG4gICAgICAgICAgICBpc0Fycm93ID0gb3B0aW9ucy50eXBlID09PSBcImFycm93XCI7XG4gICAgICAgICAgICBpZ25vcmVMb29wRnVuYyA9IG9wdGlvbnMuaWdub3JlTG9vcEZ1bmM7XG4gICAgICAgIH1cblxuICAgICAgICBzdGF0ZS5vcHRpb24gPSBPYmplY3QuY3JlYXRlKHN0YXRlLm9wdGlvbik7XG4gICAgICAgIHN0YXRlLmlnbm9yZWQgPSBPYmplY3QuY3JlYXRlKHN0YXRlLmlnbm9yZWQpO1xuXG4gICAgICAgIHN0YXRlLmZ1bmN0ID0gZnVuY3RvcihuYW1lIHx8IHN0YXRlLm5hbWVTdGFjay5pbmZlcigpLCBzdGF0ZS50b2tlbnMubmV4dCwge1xuICAgICAgICAgICAgXCIoc3RhdGVtZW50KVwiOiBzdGF0ZW1lbnQsXG4gICAgICAgICAgICBcIihjb250ZXh0KVwiOiBzdGF0ZS5mdW5jdCxcbiAgICAgICAgICAgIFwiKGFycm93KVwiOiBpc0Fycm93LFxuICAgICAgICAgICAgXCIoZ2VuZXJhdG9yKVwiOiBpc0dlbmVyYXRvclxuICAgICAgICB9KTtcblxuICAgICAgICBmID0gc3RhdGUuZnVuY3Q7XG4gICAgICAgIHRva2VuID0gc3RhdGUudG9rZW5zLmN1cnI7XG4gICAgICAgIHRva2VuLmZ1bmN0ID0gc3RhdGUuZnVuY3Q7XG5cbiAgICAgICAgZnVuY3Rpb25zLnB1c2goc3RhdGUuZnVuY3QpO1xuXG4gICAgICAgIC8vIFNvIHRoYXQgdGhlIGZ1bmN0aW9uIGlzIGF2YWlsYWJsZSB0byBpdHNlbGYgYW5kIHJlZmVyZW5jaW5nIGl0c2VsZiBpcyBub3RcbiAgICAgICAgLy8gc2VlbiBhcyBhIGNsb3N1cmUsIGFkZCB0aGUgZnVuY3Rpb24gbmFtZSB0byBhIG5ldyBzY29wZSwgYnV0IGRvIG5vdFxuICAgICAgICAvLyB0ZXN0IGZvciB1bnVzZWQgKHVudXNlZDogZmFsc2UpXG4gICAgICAgIC8vIGl0IGlzIGEgbmV3IGJsb2NrIHNjb3BlIHNvIHRoYXQgcGFyYW1zIGNhbiBvdmVycmlkZSBpdCwgaXQgY2FuIGJlIGJsb2NrIHNjb3BlZFxuICAgICAgICAvLyBidXQgZGVjbGFyYXRpb25zIGluc2lkZSB0aGUgZnVuY3Rpb24gZG9uJ3QgY2F1c2UgYWxyZWFkeSBkZWNsYXJlZCBlcnJvclxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soXCJmdW5jdGlvbm91dGVyXCIpO1xuICAgICAgICB2YXIgaW50ZXJuYWxseUFjY2Vzc2libGVOYW1lID0gbmFtZSB8fCBjbGFzc0V4cHJCaW5kaW5nO1xuICAgICAgICBpZiAoaW50ZXJuYWxseUFjY2Vzc2libGVOYW1lKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2suYWRkKGludGVybmFsbHlBY2Nlc3NpYmxlTmFtZSxcbiAgICAgICAgICAgICAgICBjbGFzc0V4cHJCaW5kaW5nID8gXCJjbGFzc1wiIDogXCJmdW5jdGlvblwiLCBzdGF0ZS50b2tlbnMuY3VyciwgZmFsc2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY3JlYXRlIHRoZSBwYXJhbSBzY29wZSAocGFyYW1zIGFkZGVkIGluIGZ1bmN0aW9ucGFyYW1zKVxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soXCJmdW5jdGlvbnBhcmFtc1wiKTtcblxuICAgICAgICB2YXIgcGFyYW1zSW5mbyA9IGZ1bmN0aW9ucGFyYW1zKG9wdGlvbnMpO1xuXG4gICAgICAgIGlmIChwYXJhbXNJbmZvKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihwYXJhbXMpXCJdID0gcGFyYW1zSW5mby5wYXJhbXM7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS5hcml0eSA9IHBhcmFtc0luZm8uYXJpdHk7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS52ZXJpZnlNYXhQYXJhbWV0ZXJzUGVyRnVuY3Rpb24oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKG1ldHJpY3MpXCJdLmFyaXR5ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0Fycm93KSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KHRydWUpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiYXJyb3cgZnVuY3Rpb24gc3ludGF4ICg9PilcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW9wdGlvbnMubG9uZUFyZykge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI9PlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGJsb2NrKGZhbHNlLCB0cnVlLCB0cnVlLCBpc0Fycm93KTtcblxuICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5ub3lpZWxkICYmIGlzR2VuZXJhdG9yICYmXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihnZW5lcmF0b3IpXCJdICE9PSBcInlpZWxkZWRcIikge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMjRcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUuZnVuY3RbXCIobWV0cmljcylcIl0udmVyaWZ5TWF4U3RhdGVtZW50c1BlckZ1bmN0aW9uKCk7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKG1ldHJpY3MpXCJdLnZlcmlmeU1heENvbXBsZXhpdHlQZXJGdW5jdGlvbigpO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIih1bnVzZWRPcHRpb24pXCJdID0gc3RhdGUub3B0aW9uLnVudXNlZDtcbiAgICAgICAgc3RhdGUub3B0aW9uID0gb2xkT3B0aW9uO1xuICAgICAgICBzdGF0ZS5pZ25vcmVkID0gb2xkSWdub3JlZDtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIobGFzdClcIl0gPSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihsYXN0Y2hhcmFjdGVyKVwiXSA9IHN0YXRlLnRva2Vucy5jdXJyLmNoYXJhY3RlcjtcblxuICAgICAgICAvLyB1bnN0YWNrIHRoZSBwYXJhbXMgc2NvcGVcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnVuc3RhY2soKTsgLy8gYWxzbyBkb2VzIHVzYWdlIGFuZCBsYWJlbCBjaGVja3NcblxuICAgICAgICAvLyB1bnN0YWNrIHRoZSBmdW5jdGlvbiBvdXRlciBzdGFja1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuXG4gICAgICAgIHN0YXRlLmZ1bmN0ID0gc3RhdGUuZnVuY3RbXCIoY29udGV4dClcIl07XG5cbiAgICAgICAgaWYgKCFpZ25vcmVMb29wRnVuYyAmJiAhc3RhdGUub3B0aW9uLmxvb3BmdW5jICYmIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgZnVuY3Rpb24gd2UganVzdCBwYXJzZWQgYWNjZXNzZXMgYW55IG5vbi1sb2NhbCB2YXJpYWJsZXNcbiAgICAgICAgICAgIC8vIHRyaWdnZXIgYSB3YXJuaW5nLiBPdGhlcndpc2UsIHRoZSBmdW5jdGlvbiBpcyBzYWZlIGV2ZW4gd2l0aGluXG4gICAgICAgICAgICAvLyBhIGxvb3AuXG4gICAgICAgICAgICBpZiAoZltcIihpc0NhcHR1cmluZylcIl0pIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA4M1wiLCB0b2tlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVNZXRyaWNzKGZ1bmN0aW9uU3RhcnRUb2tlbikge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhdGVtZW50Q291bnQ6IDAsXG4gICAgICAgICAgICBuZXN0ZWRCbG9ja0RlcHRoOiAtMSxcbiAgICAgICAgICAgIENvbXBsZXhpdHlDb3VudDogMSxcbiAgICAgICAgICAgIGFyaXR5OiAwLFxuXG4gICAgICAgICAgICB2ZXJpZnlNYXhTdGF0ZW1lbnRzUGVyRnVuY3Rpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24ubWF4c3RhdGVtZW50cyAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlbWVudENvdW50ID4gc3RhdGUub3B0aW9uLm1heHN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzFcIiwgZnVuY3Rpb25TdGFydFRva2VuLCB0aGlzLnN0YXRlbWVudENvdW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICB2ZXJpZnlNYXhQYXJhbWV0ZXJzUGVyRnVuY3Rpb246IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmIChpc051bWJlcihzdGF0ZS5vcHRpb24ubWF4cGFyYW1zKSAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFyaXR5ID4gc3RhdGUub3B0aW9uLm1heHBhcmFtcykge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3MlwiLCBmdW5jdGlvblN0YXJ0VG9rZW4sIHRoaXMuYXJpdHkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHZlcmlmeU1heE5lc3RlZEJsb2NrRGVwdGhQZXJGdW5jdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5tYXhkZXB0aCAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5lc3RlZEJsb2NrRGVwdGggPiAwICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmVzdGVkQmxvY2tEZXB0aCA9PT0gc3RhdGUub3B0aW9uLm1heGRlcHRoICsgMSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3M1wiLCBudWxsLCB0aGlzLm5lc3RlZEJsb2NrRGVwdGgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHZlcmlmeU1heENvbXBsZXhpdHlQZXJGdW5jdGlvbjogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1heCA9IHN0YXRlLm9wdGlvbi5tYXhjb21wbGV4aXR5O1xuICAgICAgICAgICAgICAgIHZhciBjYyA9IHRoaXMuQ29tcGxleGl0eUNvdW50O1xuICAgICAgICAgICAgICAgIGlmIChtYXggJiYgY2MgPiBtYXgpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzRcIiwgZnVuY3Rpb25TdGFydFRva2VuLCBjYyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCkge1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihtZXRyaWNzKVwiXS5Db21wbGV4aXR5Q291bnQgKz0gMTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBhc3NpZ25tZW50cyB0aGF0IHdlcmUgZm91bmQgaW5zdGVhZCBvZiBjb25kaXRpb25hbHMuXG4gICAgLy8gRm9yIGV4YW1wbGU6IGlmIChhID0gMSkgeyAuLi4gfVxuXG4gICAgZnVuY3Rpb24gY2hlY2tDb25kQXNzaWdubWVudChleHByKSB7XG4gICAgICAgIHZhciBpZCwgcGFyZW47XG4gICAgICAgIGlmIChleHByKSB7XG4gICAgICAgICAgICBpZCA9IGV4cHIuaWQ7XG4gICAgICAgICAgICBwYXJlbiA9IGV4cHIucGFyZW47XG4gICAgICAgICAgICBpZiAoaWQgPT09IFwiLFwiICYmIChleHByID0gZXhwci5leHByc1tleHByLmV4cHJzLmxlbmd0aCAtIDFdKSkge1xuICAgICAgICAgICAgICAgIGlkID0gZXhwci5pZDtcbiAgICAgICAgICAgICAgICBwYXJlbiA9IHBhcmVuIHx8IGV4cHIucGFyZW47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChpZCkge1xuICAgICAgICAgICAgY2FzZSBcIj1cIjpcbiAgICAgICAgICAgIGNhc2UgXCIrPVwiOlxuICAgICAgICAgICAgY2FzZSBcIi09XCI6XG4gICAgICAgICAgICBjYXNlIFwiKj1cIjpcbiAgICAgICAgICAgIGNhc2UgXCIlPVwiOlxuICAgICAgICAgICAgY2FzZSBcIiY9XCI6XG4gICAgICAgICAgICBjYXNlIFwifD1cIjpcbiAgICAgICAgICAgIGNhc2UgXCJePVwiOlxuICAgICAgICAgICAgY2FzZSBcIi89XCI6XG4gICAgICAgICAgICAgICAgaWYgKCFwYXJlbiAmJiAhc3RhdGUub3B0aW9uLmJvc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODRcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtvYmplY3R9IHByb3BzIENvbGxlY3Rpb24gb2YgcHJvcGVydHkgZGVzY3JpcHRvcnMgZm9yIGEgZ2l2ZW5cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0LlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoZWNrUHJvcGVydGllcyhwcm9wcykge1xuICAgICAgICAvLyBDaGVjayBmb3IgbG9uZWx5IHNldHRlcnMgaWYgaW4gdGhlIEVTNSBtb2RlLlxuICAgICAgICBpZiAoc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgbmFtZSBpbiBwcm9wcykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wc1tuYW1lXSAmJiBwcm9wc1tuYW1lXS5zZXR0ZXJUb2tlbiAmJiAhcHJvcHNbbmFtZV0uZ2V0dGVyVG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzhcIiwgcHJvcHNbbmFtZV0uc2V0dGVyVG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1ldGFQcm9wZXJ0eShuYW1lLCBjKSB7XG4gICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiLlwiKSkge1xuICAgICAgICAgICAgdmFyIGxlZnQgPSBzdGF0ZS50b2tlbnMuY3Vyci5pZDtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIuXCIpO1xuICAgICAgICAgICAgdmFyIGlkID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuaXNNZXRhUHJvcGVydHkgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKG5hbWUgIT09IGlkKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDU3XCIsIHN0YXRlLnRva2Vucy5wcmV2LCBsZWZ0LCBpZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdGF0ZS50b2tlbnMuY3VycjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIChmdW5jdGlvbih4KSB7XG4gICAgICAgIHgubnVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgYiwgZiwgaSwgcCwgdCwgaXNHZW5lcmF0b3JNZXRob2QgPSBmYWxzZSwgbmV4dFZhbDtcbiAgICAgICAgICAgIHZhciBwcm9wcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEFsbCBwcm9wZXJ0aWVzLCBpbmNsdWRpbmcgYWNjZXNzb3JzXG5cbiAgICAgICAgICAgIGIgPSBzdGF0ZS50b2tlbnMuY3Vyci5saW5lICE9PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgaWYgKGIpIHtcbiAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuZnJvbSA9PT0gaW5kZW50ICsgc3RhdGUub3B0aW9uLmluZGVudCkge1xuICAgICAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBibG9ja3R5cGUgPSBsb29rdXBCbG9ja1R5cGUoKTtcbiAgICAgICAgICAgIGlmIChibG9ja3R5cGUuaXNEZXN0QXNzaWduKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kZXN0cnVjdEFzc2lnbiA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKHsgb3BlbmluZ1BhcnNlZDogdHJ1ZSwgYXNzaWdubWVudDogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG5leHRWYWwgPSBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllciAmJlxuICAgICAgICAgICAgICAgICAgICAocGVla0lnbm9yZUVPTCgpLmlkID09PSBcIixcIiB8fCBwZWVrSWdub3JlRU9MKCkuaWQgPT09IFwifVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIm9iamVjdCBzaG9ydCBub3RhdGlvblwiLCBcIjZcIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaSA9IHByb3BlcnR5TmFtZSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgc2F2ZVByb3BlcnR5KHByb3BzLCBpLCBzdGF0ZS50b2tlbnMubmV4dCk7XG5cbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbigxMCk7XG5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBlZWsoKS5pZCAhPT0gXCI6XCIgJiYgKG5leHRWYWwgPT09IFwiZ2V0XCIgfHwgbmV4dFZhbCA9PT0gXCJzZXRcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShuZXh0VmFsKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM1KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzNFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGkgPSBwcm9wZXJ0eU5hbWUoKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBFUzYgYWxsb3dzIGZvciBnZXQoKSB7Li4ufSBhbmQgc2V0KCkgey4uLn0gbWV0aG9kXG4gICAgICAgICAgICAgICAgICAgIC8vIGRlZmluaXRpb24gc2hvcnRoYW5kIHN5bnRheCwgc28gd2UgZG9uJ3QgcHJvZHVjZSBhbiBlcnJvclxuICAgICAgICAgICAgICAgICAgICAvLyBpZiBsaW50aW5nIEVDTUFTY3JpcHQgNiBjb2RlLlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWkgJiYgIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzNVwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGRvbid0IHdhbnQgdG8gc2F2ZSB0aGlzIGdldHRlciB1bmxlc3MgaXQncyBhbiBhY3R1YWwgZ2V0dGVyXG4gICAgICAgICAgICAgICAgICAgIC8vIGFuZCBub3QgYW4gRVM2IGNvbmNpc2UgbWV0aG9kXG4gICAgICAgICAgICAgICAgICAgIGlmIChpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlQWNjZXNzb3IobmV4dFZhbCwgcHJvcHMsIGksIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgICAgICAgICAgZiA9IGRvRnVuY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgcCA9IGZbXCIocGFyYW1zKVwiXTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBEb24ndCB3YXJuIGFib3V0IGdldHRlci9zZXR0ZXIgcGFpcnMgaWYgdGhpcyBpcyBhbiBFUzYgY29uY2lzZSBtZXRob2RcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5leHRWYWwgPT09IFwiZ2V0XCIgJiYgaSAmJiBwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3NlwiLCB0LCBwWzBdLCBpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuZXh0VmFsID09PSBcInNldFwiICYmIGkgJiYgKCFwIHx8IHAubGVuZ3RoICE9PSAxKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzdcIiwgdCwgaSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKlwiICYmIHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTA0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImdlbmVyYXRvciBmdW5jdGlvbnNcIiwgXCI2XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0dlbmVyYXRvck1ldGhvZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0dlbmVyYXRvck1ldGhvZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IGNvbXB1dGVkUHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KGkpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChzdGF0ZS50b2tlbnMubmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpID0gcHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzYXZlUHJvcGVydHkocHJvcHMsIGksIHN0YXRlLnRva2Vucy5uZXh0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJjb25jaXNlIG1ldGhvZHNcIiwgXCI2XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZG9GdW5jdGlvbih7IHR5cGU6IGlzR2VuZXJhdG9yTWV0aG9kID8gXCJnZW5lcmF0b3JcIiA6IG51bGwgfSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMTApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY291bnRNZW1iZXIoaSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbW1hKHsgYWxsb3dUcmFpbGluZzogdHJ1ZSwgcHJvcGVydHk6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ9XCIgJiYgIXN0YXRlLmluRVM1KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDcwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiKSB7XG4gICAgICAgICAgICAgICAgaW5kZW50IC09IHN0YXRlLm9wdGlvbi5pbmRlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwifVwiLCB0aGlzKTtcblxuICAgICAgICAgICAgY2hlY2tQcm9wZXJ0aWVzKHByb3BzKTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH07XG4gICAgICAgIHguZnVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMzZcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICB9O1xuICAgIH0gKGRlbGltKFwie1wiKSkpO1xuXG4gICAgZnVuY3Rpb24gZGVzdHJ1Y3R1cmluZ1BhdHRlcm4ob3B0aW9ucz8pIHtcbiAgICAgICAgdmFyIGlzQXNzaWdubWVudCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5hc3NpZ25tZW50O1xuXG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMDRcIiwgc3RhdGUudG9rZW5zLmN1cnIsXG4gICAgICAgICAgICAgICAgaXNBc3NpZ25tZW50ID8gXCJkZXN0cnVjdHVyaW5nIGFzc2lnbm1lbnRcIiA6IFwiZGVzdHJ1Y3R1cmluZyBiaW5kaW5nXCIsIFwiNlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZShvcHRpb25zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZXN0cnVjdHVyaW5nUGF0dGVyblJlY3Vyc2l2ZShvcHRpb25zKSB7XG4gICAgICAgIHZhciBpZHM7XG4gICAgICAgIHZhciBpZGVudGlmaWVycyA9IFtdO1xuICAgICAgICB2YXIgb3BlbmluZ1BhcnNlZCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5vcGVuaW5nUGFyc2VkO1xuICAgICAgICB2YXIgaXNBc3NpZ25tZW50ID0gb3B0aW9ucyAmJiBvcHRpb25zLmFzc2lnbm1lbnQ7XG4gICAgICAgIHZhciByZWN1cnNpdmVPcHRpb25zID0gaXNBc3NpZ25tZW50ID8geyBhc3NpZ25tZW50OiBpc0Fzc2lnbm1lbnQgfSA6IG51bGw7XG4gICAgICAgIHZhciBmaXJzdFRva2VuID0gb3BlbmluZ1BhcnNlZCA/IHN0YXRlLnRva2Vucy5jdXJyIDogc3RhdGUudG9rZW5zLm5leHQ7XG5cbiAgICAgICAgdmFyIG5leHRJbm5lckRFID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgaWRlbnQ7XG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhzdGF0ZS50b2tlbnMubmV4dCwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICAgICAgaWRzID0gZGVzdHJ1Y3R1cmluZ1BhdHRlcm5SZWN1cnNpdmUocmVjdXJzaXZlT3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaWQgaW4gaWRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkID0gaWRzW2lkXTtcbiAgICAgICAgICAgICAgICAgICAgaWRlbnRpZmllcnMucHVzaCh7IGlkOiBpZC5pZCwgdG9rZW46IGlkLnRva2VuIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIixcIikpIHtcbiAgICAgICAgICAgICAgICBpZGVudGlmaWVycy5wdXNoKHsgaWQ6IG51bGwsIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIihcIikpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgICAgICAgICBuZXh0SW5uZXJERSgpO1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgaXNfcmVzdCA9IGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIuLi5cIik7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNBc3NpZ25tZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBpZGVudGlmaWVyVG9rZW4gPSBpc19yZXN0ID8gcGVlaygwKSA6IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWlkZW50aWZpZXJUb2tlbi5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMFwiLCBpZGVudGlmaWVyVG9rZW4sIGlkZW50aWZpZXJUb2tlbi52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIGFzc2lnblRhcmdldCA9IGV4cHJlc3Npb24oMTU1KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2lnblRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hlY2tMZWZ0U2lkZUFzc2lnbihhc3NpZ25UYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgdGFyZ2V0IHdhcyBhIHNpbXBsZSBpZGVudGlmaWVyLCBhZGQgaXQgdG8gdGhlIGxpc3QgdG8gcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYXNzaWduVGFyZ2V0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZGVudCA9IGFzc2lnblRhcmdldC52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlkZW50ID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoaWRlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWRlbnRpZmllcnMucHVzaCh7IGlkOiBpZGVudCwgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gaXNfcmVzdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIGFzc2lnbm1lbnRQcm9wZXJ0eSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIGlkO1xuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJbXCIpKSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIltcIik7XG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbigxMCk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIl1cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgbmV4dElubmVyREUoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKHN0cmluZylcIiB8fFxuICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihudW1iZXIpXCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgbmV4dElubmVyREUoKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpZCB3aWxsIGVpdGhlciBiZSB0aGUgcHJvcGVydHkgbmFtZSBvciB0aGUgcHJvcGVydHkgbmFtZSBhbmQgdGhlIGFzc2lnbmluZyBpZGVudGlmaWVyXG4gICAgICAgICAgICAgICAgaWQgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCI6XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICBuZXh0SW5uZXJERSgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhpcyBjYXNlIHdlIGFyZSBhc3NpZ25pbmcgKG5vdCBkZWNsYXJpbmcpLCBzbyBjaGVjayBhc3NpZ25tZW50XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0Fzc2lnbm1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrTGVmdFNpZGVBc3NpZ24oc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlkZW50aWZpZXJzLnB1c2goeyBpZDogaWQsIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyciB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGlkLCB2YWx1ZTtcbiAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihmaXJzdFRva2VuLCBcIltcIikpIHtcbiAgICAgICAgICAgIGlmICghb3BlbmluZ1BhcnNlZCkge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJbXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJdXCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzdcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGVsZW1lbnRfYWZ0ZXJfcmVzdCA9IGZhbHNlO1xuICAgICAgICAgICAgd2hpbGUgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiXVwiKSkge1xuICAgICAgICAgICAgICAgIGlmIChuZXh0SW5uZXJERSgpICYmICFlbGVtZW50X2FmdGVyX3Jlc3QgJiZcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIixcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzBcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50X2FmdGVyX3Jlc3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIj1cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMucHJldiwgXCIuLi5cIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJdXCIpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIj1cIik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiXVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGVja1B1bmN0dWF0b3IoZmlyc3RUb2tlbiwgXCJ7XCIpKSB7XG5cbiAgICAgICAgICAgIGlmICghb3BlbmluZ1BhcnNlZCkge1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzdcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd2hpbGUgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwifVwiKSkge1xuICAgICAgICAgICAgICAgIGFzc2lnbm1lbnRQcm9wZXJ0eSgpO1xuICAgICAgICAgICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwiPVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPVwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBleHByZXNzaW9uKDEwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLnR5cGUgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFjaGVja1B1bmN0dWF0b3Ioc3RhdGUudG9rZW5zLm5leHQsIFwifVwiKSkge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCJ9XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUcmFpbGluZyBjb21tYVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT2JqZWN0QmluZGluZ1BhdHRlcm46IHsgQmluZGluZ1Byb3BlcnR5TGlzdCAsIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZShcIn1cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGlkZW50aWZpZXJzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2godG9rZW5zOiB7IGZpcnN0IH1bXSwgdmFsdWUpIHtcbiAgICAgICAgdmFyIGZpcnN0ID0gdmFsdWUuZmlyc3Q7XG5cbiAgICAgICAgaWYgKCFmaXJzdClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB6aXAodG9rZW5zLCBBcnJheS5pc0FycmF5KGZpcnN0KSA/IGZpcnN0IDogW2ZpcnN0XSkuZm9yRWFjaChmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IHZhbFswXTtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHZhbFsxXTtcblxuICAgICAgICAgICAgaWYgKHRva2VuICYmIHZhbHVlKVxuICAgICAgICAgICAgICAgIHRva2VuLmZpcnN0ID0gdmFsdWU7XG4gICAgICAgICAgICBlbHNlIGlmICh0b2tlbiAmJiB0b2tlbi5maXJzdCAmJiAhdmFsdWUpXG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwODBcIiwgdG9rZW4uZmlyc3QsIHRva2VuLmZpcnN0LnZhbHVlKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmxvY2tWYXJpYWJsZVN0YXRlbWVudCh0eXBlLCBzdGF0ZW1lbnQsIGNvbnRleHQpIHtcbiAgICAgICAgLy8gdXNlZCBmb3IgYm90aCBsZXQgYW5kIGNvbnN0IHN0YXRlbWVudHNcblxuICAgICAgICB2YXIgcHJlZml4ID0gY29udGV4dCAmJiBjb250ZXh0LnByZWZpeDtcbiAgICAgICAgdmFyIGluZXhwb3J0ID0gY29udGV4dCAmJiBjb250ZXh0LmluZXhwb3J0O1xuICAgICAgICB2YXIgaXNMZXQgPSB0eXBlID09PSBcImxldFwiO1xuICAgICAgICB2YXIgaXNDb25zdCA9IHR5cGUgPT09IFwiY29uc3RcIjtcbiAgICAgICAgdmFyIHRva2VucywgbG9uZSwgdmFsdWUsIGxldGJsb2NrO1xuXG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMDRcIiwgc3RhdGUudG9rZW5zLmN1cnIsIHR5cGUsIFwiNlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0xldCAmJiBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCIoXCIpIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImxldCBibG9ja1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG4gICAgICAgICAgICBsZXRibG9jayA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoc3RhdGUuZnVuY3RbXCIobm9ibG9ja3Njb3BlZHZhcilcIl0pIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTA0OFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgaXNDb25zdCA/IFwiQ29uc3RcIiA6IFwiTGV0XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGVtZW50LmZpcnN0ID0gW107XG4gICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICB2YXIgbmFtZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBpZiAoY29udGFpbnMoW1wie1wiLCBcIltcIl0sIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKCk7XG4gICAgICAgICAgICAgICAgbG9uZSA9IGZhbHNlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBbeyBpZDogaWRlbnRpZmllcigpLCB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnIgfV07XG4gICAgICAgICAgICAgICAgbG9uZSA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghcHJlZml4ICYmIGlzQ29uc3QgJiYgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiPVwiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIkUwMTJcIiwgc3RhdGUudG9rZW5zLmN1cnIsIHN0YXRlLnRva2Vucy5jdXJyLnZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yICh2YXIgdCBpbiB0b2tlbnMpIHtcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5zLmhhc093blByb3BlcnR5KHQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB0b2tlbnNbdF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2suaXNHbG9iYWwoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZWRlZmluZWRbdC5pZF0gPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzlcIiwgdC50b2tlbiwgdC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHQuaWQgJiYgIXN0YXRlLmZ1bmN0W1wiKG5vYmxvY2tzY29wZWR2YXIpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkbGFiZWwodC5pZCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IHQudG9rZW5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZXMucHVzaCh0LnRva2VuKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxvbmUgJiYgaW5leHBvcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc2V0RXhwb3J0ZWQodC50b2tlbi52YWx1ZSwgdC50b2tlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPVwiKTtcbiAgICAgICAgICAgICAgICBpZiAoIXByZWZpeCAmJiBwZWVrKDApLmlkID09PSBcIj1cIiAmJiBzdGF0ZS50b2tlbnMubmV4dC5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciBpZCA9IHN0YXRlLnRva2Vucy5wcmV2O1xuICAgICAgICAgICAgICAgIC8vIGRvbid0IGFjY2VwdCBgaW5gIGluIGV4cHJlc3Npb24gaWYgcHJlZml4IGlzIHVzZWQgZm9yIEZvckluL09mIGxvb3AuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBleHByZXNzaW9uKHByZWZpeCA/IDEyMCA6IDEwKTtcbiAgICAgICAgICAgICAgICBpZiAoIXByZWZpeCAmJiB2YWx1ZSAmJiB2YWx1ZS50eXBlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsb25lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2Vuc1swXS5maXJzdCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2gobmFtZXMsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlbWVudC5maXJzdCA9IHN0YXRlbWVudC5maXJzdC5jb25jYXQobmFtZXMpO1xuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb21tYSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsZXRibG9jaykge1xuICAgICAgICAgICAgYWR2YW5jZShcIilcIik7XG4gICAgICAgICAgICBibG9jayh0cnVlLCB0cnVlKTtcbiAgICAgICAgICAgIHN0YXRlbWVudC5ibG9jayA9IHRydWU7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0YXRlbWVudDtcbiAgICB9XG5cbiAgICB2YXIgY29uc3RzdGF0ZW1lbnQgPSBzdG10KFwiY29uc3RcIiwgZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgICByZXR1cm4gYmxvY2tWYXJpYWJsZVN0YXRlbWVudChcImNvbnN0XCIsIHRoaXMsIGNvbnRleHQpO1xuICAgIH0pO1xuICAgIGNvbnN0c3RhdGVtZW50LmV4cHMgPSB0cnVlO1xuXG4gICAgdmFyIGxldHN0YXRlbWVudCA9IHN0bXQoXCJsZXRcIiwgZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgICByZXR1cm4gYmxvY2tWYXJpYWJsZVN0YXRlbWVudChcImxldFwiLCB0aGlzLCBjb250ZXh0KTtcbiAgICB9KTtcbiAgICBsZXRzdGF0ZW1lbnQuZXhwcyA9IHRydWU7XG5cbiAgICB2YXIgdmFyc3RhdGVtZW50ID0gc3RtdChcInZhclwiLCBmdW5jdGlvbihjb250ZXh0KSB7XG4gICAgICAgIHZhciBwcmVmaXggPSBjb250ZXh0ICYmIGNvbnRleHQucHJlZml4O1xuICAgICAgICB2YXIgaW5leHBvcnQgPSBjb250ZXh0ICYmIGNvbnRleHQuaW5leHBvcnQ7XG4gICAgICAgIHZhciB0b2tlbnMsIGxvbmUsIHZhbHVlO1xuXG4gICAgICAgIC8vIElmIHRoZSBgaW1wbGllZGAgb3B0aW9uIGlzIHNldCwgYmluZGluZ3MgYXJlIHNldCBkaWZmZXJlbnRseS5cbiAgICAgICAgdmFyIGltcGxpZWQgPSBjb250ZXh0ICYmIGNvbnRleHQuaW1wbGllZDtcbiAgICAgICAgdmFyIHJlcG9ydCA9ICEoY29udGV4dCAmJiBjb250ZXh0Lmlnbm9yZSk7XG5cbiAgICAgICAgdGhpcy5maXJzdCA9IFtdO1xuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgdmFyIG5hbWVzOiB7IGZpcnN0IH1bXSA9IFtdO1xuICAgICAgICAgICAgaWYgKGNvbnRhaW5zKFtcIntcIiwgXCJbXCJdLCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSBkZXN0cnVjdHVyaW5nUGF0dGVybigpO1xuICAgICAgICAgICAgICAgIGxvbmUgPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gW3sgaWQ6IGlkZW50aWZpZXIoKSwgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyIH1dO1xuICAgICAgICAgICAgICAgIGxvbmUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIShwcmVmaXggJiYgaW1wbGllZCkgJiYgcmVwb3J0ICYmIHN0YXRlLm9wdGlvbi52YXJzdG10KSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMzJcIiwgdGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZmlyc3QgPSB0aGlzLmZpcnN0LmNvbmNhdChuYW1lcyk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIHQgaW4gdG9rZW5zKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRva2Vucy5oYXNPd25Qcm9wZXJ0eSh0KSkge1xuICAgICAgICAgICAgICAgICAgICB0ID0gdG9rZW5zW3RdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWltcGxpZWQgJiYgc3RhdGUuZnVuY3RbXCIoZ2xvYmFsKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZWRlZmluZWRbdC5pZF0gPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzlcIiwgdC50b2tlbiwgdC5pZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5mdXR1cmVob3N0aWxlID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgoIXN0YXRlLmluRVM1KCkgJiYgZWNtYUlkZW50aWZpZXJzWzVdW3QuaWRdID09PSBmYWxzZSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCFzdGF0ZS5pbkVTNigpICYmIGVjbWFJZGVudGlmaWVyc1s2XVt0LmlkXSA9PT0gZmFsc2UpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTI5XCIsIHQudG9rZW4sIHQuaWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodC5pZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltcGxpZWQgPT09IFwiZm9yXCIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmhhcyh0LmlkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVwb3J0KSB3YXJuaW5nKFwiVzA4OFwiLCB0LnRva2VuLCB0LmlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLnVzZSh0LmlkLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHQuaWQsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJ2YXJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IHQudG9rZW5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsb25lICYmIGluZXhwb3J0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zZXRFeHBvcnRlZCh0LmlkLCB0LnRva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lcy5wdXNoKHQudG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldChzdGF0ZS50b2tlbnMuY3Vycik7XG5cbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiPVwiKTtcbiAgICAgICAgICAgICAgICBpZiAocGVlaygwKS5pZCA9PT0gXCI9XCIgJiYgc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXByZWZpeCAmJiByZXBvcnQgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5mdW5jdFtcIihwYXJhbXMpXCJdIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihwYXJhbXMpXCJdLmluZGV4T2Yoc3RhdGUudG9rZW5zLm5leHQudmFsdWUpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMjBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgaWQgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgICAgICAgICAvLyBkb24ndCBhY2NlcHQgYGluYCBpbiBleHByZXNzaW9uIGlmIHByZWZpeCBpcyB1c2VkIGZvciBGb3JJbi9PZiBsb29wLlxuICAgICAgICAgICAgICAgIHZhbHVlID0gZXhwcmVzc2lvbihwcmVmaXggPyAxMjAgOiAxMCk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmICFwcmVmaXggJiYgcmVwb3J0ICYmICFzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSAmJiB2YWx1ZS50eXBlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDgwXCIsIGlkLCBpZC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsb25lKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2Vuc1swXS5maXJzdCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRlc3RydWN0dXJpbmdQYXR0ZXJuTWF0Y2gobmFtZXMsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcbiAgICB2YXJzdGF0ZW1lbnQuZXhwcyA9IHRydWU7XG5cbiAgICBibG9ja3N0bXQoXCJjbGFzc1wiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIGNsYXNzZGVmLmNhbGwodGhpcywgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiBjbGFzc2RlZihpc1N0YXRlbWVudCkge1xuXG4gICAgICAgIC8qanNoaW50IHZhbGlkdGhpczp0cnVlICovXG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMDRcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiY2xhc3NcIiwgXCI2XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpc1N0YXRlbWVudCkge1xuICAgICAgICAgICAgLy8gQmluZGluZ0lkZW50aWZpZXJcbiAgICAgICAgICAgIHRoaXMubmFtZSA9IGlkZW50aWZpZXIoKTtcblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHRoaXMubmFtZSwge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiY2xhc3NcIixcbiAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnJcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIgJiYgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgIT09IFwiZXh0ZW5kc1wiKSB7XG4gICAgICAgICAgICAvLyBCaW5kaW5nSWRlbnRpZmllcihvcHQpXG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICB0aGlzLm5hbWVkRXhwciA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBzdGF0ZS5uYW1lU3RhY2suaW5mZXIoKTtcbiAgICAgICAgfVxuICAgICAgICBjbGFzc3RhaWwodGhpcyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsYXNzdGFpbChjKSB7XG4gICAgICAgIHZhciB3YXNJbkNsYXNzQm9keSA9IHN0YXRlLmluQ2xhc3NCb2R5O1xuICAgICAgICAvLyBDbGFzc0hlcml0YWdlKG9wdClcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImV4dGVuZHNcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcImV4dGVuZHNcIik7XG4gICAgICAgICAgICBjLmhlcml0YWdlID0gZXhwcmVzc2lvbigxMCk7XG4gICAgICAgIH1cblxuICAgICAgICBzdGF0ZS5pbkNsYXNzQm9keSA9IHRydWU7XG4gICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuICAgICAgICAvLyBDbGFzc0JvZHkob3B0KVxuICAgICAgICBjLmJvZHkgPSBjbGFzc2JvZHkoYyk7XG4gICAgICAgIGFkdmFuY2UoXCJ9XCIpO1xuICAgICAgICBzdGF0ZS5pbkNsYXNzQm9keSA9IHdhc0luQ2xhc3NCb2R5O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsYXNzYm9keShjKSB7XG4gICAgICAgIHZhciBuYW1lO1xuICAgICAgICB2YXIgaXNTdGF0aWM7XG4gICAgICAgIHZhciBpc0dlbmVyYXRvcjtcbiAgICAgICAgdmFyIGdldHNldDtcbiAgICAgICAgdmFyIHByb3BzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIHN0YXRpY1Byb3BzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIGNvbXB1dGVkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwifVwiOyArK2kpIHtcbiAgICAgICAgICAgIG5hbWUgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgIGlzU3RhdGljID0gZmFsc2U7XG4gICAgICAgICAgICBpc0dlbmVyYXRvciA9IGZhbHNlO1xuICAgICAgICAgICAgZ2V0c2V0ID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gVGhlIEVTNiBncmFtbWFyIGZvciBDbGFzc0VsZW1lbnQgaW5jbHVkZXMgdGhlIGA7YCB0b2tlbiwgYnV0IGl0IGlzXG4gICAgICAgICAgICAvLyBkZWZpbmVkIG9ubHkgYXMgYSBwbGFjZWhvbGRlciB0byBmYWNpbGl0YXRlIGZ1dHVyZSBsYW5ndWFnZVxuICAgICAgICAgICAgLy8gZXh0ZW5zaW9ucy4gSW4gRVM2IGNvZGUsIGl0IHNlcnZlcyBubyBwdXJwb3NlLlxuICAgICAgICAgICAgaWYgKG5hbWUuaWQgPT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMzJcIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuYW1lLmlkID09PSBcIipcIikge1xuICAgICAgICAgICAgICAgIGlzR2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKFwiKlwiKTtcbiAgICAgICAgICAgICAgICBuYW1lID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmFtZS5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICBuYW1lID0gY29tcHV0ZWRQcm9wZXJ0eU5hbWUoKTtcbiAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzUHJvcGVydHlOYW1lKG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gTm9uLUNvbXB1dGVkIFByb3BlcnR5TmFtZVxuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICBjb21wdXRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChuYW1lLmlkZW50aWZpZXIgJiYgbmFtZS52YWx1ZSA9PT0gXCJzdGF0aWNcIikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIipcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzR2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIqXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1Byb3BlcnR5TmFtZShzdGF0ZS50b2tlbnMubmV4dCkgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzU3RhdGljID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWUgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJbXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lID0gY29tcHV0ZWRQcm9wZXJ0eU5hbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBhZHZhbmNlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAobmFtZS5pZGVudGlmaWVyICYmIChuYW1lLnZhbHVlID09PSBcImdldFwiIHx8IG5hbWUudmFsdWUgPT09IFwic2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1Byb3BlcnR5TmFtZShzdGF0ZS50b2tlbnMubmV4dCkgfHwgc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wdXRlZCA9IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIltcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldHNldCA9IG5hbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZSA9IGNvbXB1dGVkUHJvcGVydHlOYW1lKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1MlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUgfHwgc3RhdGUudG9rZW5zLm5leHQudHlwZSk7XG4gICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNoZWNrUHVuY3R1YXRvcihzdGF0ZS50b2tlbnMubmV4dCwgXCIoXCIpKSB7XG4gICAgICAgICAgICAgICAgLy8gZXJyb3IgLS0tIGNsYXNzIHByb3BlcnRpZXMgbXVzdCBiZSBtZXRob2RzXG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDU0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIn1cIiAmJlxuICAgICAgICAgICAgICAgICAgICAhY2hlY2tQdW5jdHVhdG9yKHN0YXRlLnRva2Vucy5uZXh0LCBcIihcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgIT09IFwiKFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvRnVuY3Rpb24oeyBzdGF0ZW1lbnQ6IGMgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWNvbXB1dGVkKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgZG9uJ3Qga25vdyBob3cgdG8gZGV0ZXJtaW5lIGlmIHdlIGhhdmUgZHVwbGljYXRlIGNvbXB1dGVkIHByb3BlcnR5IG5hbWVzIDooXG4gICAgICAgICAgICAgICAgaWYgKGdldHNldCkge1xuICAgICAgICAgICAgICAgICAgICBzYXZlQWNjZXNzb3IoXG4gICAgICAgICAgICAgICAgICAgICAgICBnZXRzZXQudmFsdWUsIGlzU3RhdGljID8gc3RhdGljUHJvcHMgOiBwcm9wcywgbmFtZS52YWx1ZSwgbmFtZSwgdHJ1ZSwgaXNTdGF0aWMpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChuYW1lLnZhbHVlID09PSBcImNvbnN0cnVjdG9yXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLm5hbWVTdGFjay5zZXQoYyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KG5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNhdmVQcm9wZXJ0eShpc1N0YXRpYyA/IHN0YXRpY1Byb3BzIDogcHJvcHMsIG5hbWUudmFsdWUsIG5hbWUsIHRydWUsIGlzU3RhdGljKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChnZXRzZXQgJiYgbmFtZS52YWx1ZSA9PT0gXCJjb25zdHJ1Y3RvclwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByb3BEZXNjID0gZ2V0c2V0LnZhbHVlID09PSBcImdldFwiID8gXCJjbGFzcyBnZXR0ZXIgbWV0aG9kXCIgOiBcImNsYXNzIHNldHRlciBtZXRob2RcIjtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDlcIiwgbmFtZSwgcHJvcERlc2MsIFwiY29uc3RydWN0b3JcIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5hbWUudmFsdWUgPT09IFwicHJvdG90eXBlXCIpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDlcIiwgbmFtZSwgXCJjbGFzcyBtZXRob2RcIiwgXCJwcm90b3R5cGVcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHByb3BlcnR5TmFtZShuYW1lKTtcblxuICAgICAgICAgICAgZG9GdW5jdGlvbih7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50OiBjLFxuICAgICAgICAgICAgICAgIHR5cGU6IGlzR2VuZXJhdG9yID8gXCJnZW5lcmF0b3JcIiA6IG51bGwsXG4gICAgICAgICAgICAgICAgY2xhc3NFeHByQmluZGluZzogYy5uYW1lZEV4cHIgPyBjLm5hbWUgOiBudWxsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNoZWNrUHJvcGVydGllcyhwcm9wcyk7XG4gICAgfVxuXG4gICAgYmxvY2tzdG10KFwiZnVuY3Rpb25cIiwgZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgICB2YXIgaW5leHBvcnQgPSBjb250ZXh0ICYmIGNvbnRleHQuaW5leHBvcnQ7XG4gICAgICAgIHZhciBnZW5lcmF0b3IgPSBmYWxzZTtcbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICBnZW5lcmF0b3IgPSB0cnVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJmdW5jdGlvbipcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbmJsb2NrKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA4MlwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGkgPSBvcHRpb25hbGlkZW50aWZpZXIoKTtcblxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYWRkbGFiZWwoaSwge1xuICAgICAgICAgICAgdHlwZTogXCJmdW5jdGlvblwiLFxuICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChpID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgIHdhcm5pbmcoXCJXMDI1XCIpO1xuICAgICAgICB9IGVsc2UgaWYgKGluZXhwb3J0KSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc2V0RXhwb3J0ZWQoaSwgc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9GdW5jdGlvbih7XG4gICAgICAgICAgICBuYW1lOiBpLFxuICAgICAgICAgICAgc3RhdGVtZW50OiB0aGlzLFxuICAgICAgICAgICAgdHlwZTogZ2VuZXJhdG9yID8gXCJnZW5lcmF0b3JcIiA6IG51bGwsXG4gICAgICAgICAgICBpZ25vcmVMb29wRnVuYzogaW5ibG9jayAvLyBhIGRlY2xhcmF0aW9uIG1heSBhbHJlYWR5IGhhdmUgd2FybmVkXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKFwiICYmIHN0YXRlLnRva2Vucy5uZXh0LmxpbmUgPT09IHN0YXRlLnRva2Vucy5jdXJyLmxpbmUpIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTAzOVwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KTtcblxuICAgIHByZWZpeChcImZ1bmN0aW9uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgZ2VuZXJhdG9yID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZnVuY3Rpb24qXCIsIFwiNlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFkdmFuY2UoXCIqXCIpO1xuICAgICAgICAgICAgZ2VuZXJhdG9yID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gb3B0aW9uYWxpZGVudGlmaWVyKCk7XG4gICAgICAgIGRvRnVuY3Rpb24oeyBuYW1lOiBpLCB0eXBlOiBnZW5lcmF0b3IgPyBcImdlbmVyYXRvclwiIDogbnVsbCB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICBibG9ja3N0bXQoXCJpZlwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgaW5jcmVhc2VDb21wbGV4aXR5Q291bnQoKTtcbiAgICAgICAgc3RhdGUuY29uZGl0aW9uID0gdHJ1ZTtcbiAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIHZhciBleHByID0gZXhwcmVzc2lvbigwKTtcbiAgICAgICAgY2hlY2tDb25kQXNzaWdubWVudChleHByKTtcblxuICAgICAgICAvLyBXaGVuIHRoZSBpZiBpcyB3aXRoaW4gYSBmb3ItaW4gbG9vcCwgY2hlY2sgaWYgdGhlIGNvbmRpdGlvblxuICAgICAgICAvLyBzdGFydHMgd2l0aCBhIG5lZ2F0aW9uIG9wZXJhdG9yXG4gICAgICAgIHZhciBmb3JpbmlmY2hlY2sgPSBudWxsO1xuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLmZvcmluICYmIHN0YXRlLmZvcmluaWZjaGVja25lZWRlZCkge1xuICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrbmVlZGVkID0gZmFsc2U7IC8vIFdlIG9ubHkgbmVlZCB0byBhbmFseXplIHRoZSBmaXJzdCBpZiBpbnNpZGUgdGhlIGxvb3BcbiAgICAgICAgICAgIGZvcmluaWZjaGVjayA9IHN0YXRlLmZvcmluaWZjaGVja3Nbc3RhdGUuZm9yaW5pZmNoZWNrcy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIGlmIChleHByLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgZXhwci52YWx1ZSA9PT0gXCIhXCIpIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKG5lZ2F0aXZlKVwiO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKHBvc2l0aXZlKVwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgIHN0YXRlLmNvbmRpdGlvbiA9IGZhbHNlO1xuICAgICAgICB2YXIgcyA9IGJsb2NrKHRydWUsIHRydWUpO1xuXG4gICAgICAgIC8vIFdoZW4gdGhlIGlmIGlzIHdpdGhpbiBhIGZvci1pbiBsb29wIGFuZCB0aGUgY29uZGl0aW9uIGhhcyBhIG5lZ2F0aXZlIGZvcm0sXG4gICAgICAgIC8vIGNoZWNrIGlmIHRoZSBib2R5IGNvbnRhaW5zIG5vdGhpbmcgYnV0IGEgY29udGludWUgc3RhdGVtZW50XG4gICAgICAgIGlmIChmb3JpbmlmY2hlY2sgJiYgZm9yaW5pZmNoZWNrLnR5cGUgPT09IFwiKG5lZ2F0aXZlKVwiKSB7XG4gICAgICAgICAgICBpZiAocyAmJiBzWzBdICYmIHNbMF0udHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIiAmJiBzWzBdLnZhbHVlID09PSBcImNvbnRpbnVlXCIpIHtcbiAgICAgICAgICAgICAgICBmb3JpbmlmY2hlY2sudHlwZSA9IFwiKG5lZ2F0aXZlLXdpdGgtY29udGludWUpXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiZWxzZVwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZWxzZVwiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJpZlwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcInN3aXRjaFwiKSB7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgYmxvY2tzdG10KFwidHJ5XCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYjtcblxuICAgICAgICBmdW5jdGlvbiBkb0NhdGNoKCkge1xuICAgICAgICAgICAgYWR2YW5jZShcImNhdGNoXCIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG5cbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zdGFjayhcImNhdGNocGFyYW1zXCIpO1xuXG4gICAgICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhzdGF0ZS50b2tlbnMubmV4dCwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRva2VucyA9IGRlc3RydWN0dXJpbmdQYXR0ZXJuKCk7XG4gICAgICAgICAgICAgICAgdG9rZW5zLmZvckVhY2goZnVuY3Rpb24odG9rZW46IGFueSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4uaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRQYXJhbSh0b2tlbi5pZCwgdG9rZW4sIFwiZXhjZXB0aW9uXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgIT09IFwiKGlkZW50aWZpZXIpXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAzMFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBvbmx5IGFkdmFuY2UgaWYgd2UgaGF2ZSBhbiBpZGVudGlmaWVyIHNvIHdlIGNhbiBjb250aW51ZSBwYXJzaW5nIGluIHRoZSBtb3N0IGNvbW1vbiBlcnJvciAtIHRoYXQgbm8gcGFyYW0gaXMgZ2l2ZW4uXG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZFBhcmFtKGlkZW50aWZpZXIoKSwgc3RhdGUudG9rZW5zLmN1cnIsIFwiZXhjZXB0aW9uXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiaWZcIikge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzExOFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJjYXRjaCBmaWx0ZXJcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJpZlwiKTtcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uKDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhZHZhbmNlKFwiKVwiKTtcblxuICAgICAgICAgICAgYmxvY2soZmFsc2UpO1xuXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgYmxvY2sodHJ1ZSk7XG5cbiAgICAgICAgd2hpbGUgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImNhdGNoXCIpIHtcbiAgICAgICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgICAgICBpZiAoYiAmJiAoIXN0YXRlLmluTW96KCkpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMThcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwibXVsdGlwbGUgY2F0Y2ggYmxvY2tzXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZG9DYXRjaCgpO1xuICAgICAgICAgICAgYiA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiZmluYWxseVwiKSB7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZmluYWxseVwiKTtcbiAgICAgICAgICAgIGJsb2NrKHRydWUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFiKSB7XG4gICAgICAgICAgICBlcnJvcihcIkUwMjFcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwiY2F0Y2hcIiwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSk7XG5cbiAgICBibG9ja3N0bXQoXCJ3aGlsZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHQgPSBzdGF0ZS50b2tlbnMubmV4dDtcbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdICs9IDE7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdICs9IDE7XG4gICAgICAgIGluY3JlYXNlQ29tcGxleGl0eUNvdW50KCk7XG4gICAgICAgIGFkdmFuY2UoXCIoXCIpO1xuICAgICAgICBjaGVja0NvbmRBc3NpZ25tZW50KGV4cHJlc3Npb24oMCkpO1xuICAgICAgICBhZHZhbmNlKFwiKVwiLCB0KTtcbiAgICAgICAgYmxvY2sodHJ1ZSwgdHJ1ZSk7XG4gICAgICAgIHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSAtPSAxO1xuICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSAtPSAxO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5sYWJlbGxlZCA9IHRydWU7XG5cbiAgICBibG9ja3N0bXQoXCJ3aXRoXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICBpZiAoc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDEwXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgfSBlbHNlIGlmICghc3RhdGUub3B0aW9uLndpdGhzdG10KSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA4NVwiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgIH1cblxuICAgICAgICBhZHZhbmNlKFwiKFwiKTtcbiAgICAgICAgZXhwcmVzc2lvbigwKTtcbiAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pO1xuXG4gICAgYmxvY2tzdG10KFwic3dpdGNoXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICB2YXIgZyA9IGZhbHNlO1xuICAgICAgICB2YXIgbm9pbmRlbnQgPSBmYWxzZTtcblxuICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gKz0gMTtcbiAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgIGNoZWNrQ29uZEFzc2lnbm1lbnQoZXhwcmVzc2lvbigwKSk7XG4gICAgICAgIGFkdmFuY2UoXCIpXCIsIHQpO1xuICAgICAgICB0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgIGFkdmFuY2UoXCJ7XCIpO1xuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5mcm9tID09PSBpbmRlbnQpXG4gICAgICAgICAgICBub2luZGVudCA9IHRydWU7XG5cbiAgICAgICAgaWYgKCFub2luZGVudClcbiAgICAgICAgICAgIGluZGVudCArPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuXG4gICAgICAgIHRoaXMuY2FzZXMgPSBbXTtcblxuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgc3dpdGNoIChzdGF0ZS50b2tlbnMubmV4dC5pZCkge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJjYXNlXCI6XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAoc3RhdGUuZnVuY3RbXCIodmVyYilcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ5aWVsZFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImJyZWFrXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY2FzZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImNvbnRpbnVlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicmV0dXJuXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwic3dpdGNoXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidGhyb3dcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gWW91IGNhbiB0ZWxsIEpTSGludCB0aGF0IHlvdSBkb24ndCB1c2UgYnJlYWsgaW50ZW50aW9uYWxseSBieVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGFkZGluZyBhIGNvbW1lbnQgLyogZmFsbHMgdGhyb3VnaCAqLyBvbiBhIGxpbmUganVzdCBiZWZvcmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgbmV4dCBgY2FzZWAuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMuY3Vyci5jYXNlRmFsbHNUaHJvdWdoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDg2XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImNhc2VcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcImNhc2VcIik7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2FzZXMucHVzaChleHByZXNzaW9uKDApKTtcbiAgICAgICAgICAgICAgICAgICAgaW5jcmVhc2VDb21wbGV4aXR5Q291bnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIih2ZXJiKVwiXSA9IFwiY2FzZVwiO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIFwiZGVmYXVsdFwiOlxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHN0YXRlLmZ1bmN0W1wiKHZlcmIpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwieWllbGRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJicmVha1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImNvbnRpbnVlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicmV0dXJuXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidGhyb3dcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRG8gbm90IGRpc3BsYXkgYSB3YXJuaW5nIGlmICdkZWZhdWx0JyBpcyB0aGUgZmlyc3Qgc3RhdGVtZW50IG9yIGlmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlcmUgaXMgYSBzcGVjaWFsIC8qIGZhbGxzIHRocm91Z2ggKi8gY29tbWVudC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXNlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS50b2tlbnMuY3Vyci5jYXNlRmFsbHNUaHJvdWdoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA4NlwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJkZWZhdWx0XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcImRlZmF1bHRcIik7XG4gICAgICAgICAgICAgICAgICAgIGcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiOlwiKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSBcIn1cIjpcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFub2luZGVudClcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZGVudCAtPSBzdGF0ZS5vcHRpb24uaW5kZW50O1xuXG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJ9XCIsIHQpO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIodmVyYilcIl0gPSB2b2lkIDA7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBjYXNlIFwiKGVuZClcIjpcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDIzXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBpbmRlbnQgKz0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLmN1cnIuaWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiLFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwNDBcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiOlwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBnID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI1XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5jdXJyLmlkID09PSBcIjpcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCI6XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHMoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDIxXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcImNhc2VcIiwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpbmRlbnQgLT0gc3RhdGUub3B0aW9uLmluZGVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5sYWJlbGxlZCA9IHRydWU7XG5cbiAgICBzdG10KFwiZGVidWdnZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmRlYnVnKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA4N1wiLCB0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuICAgIChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHggPSBzdG10KFwiZG9cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gKz0gMTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdICs9IDE7XG4gICAgICAgICAgICBpbmNyZWFzZUNvbXBsZXhpdHlDb3VudCgpO1xuXG4gICAgICAgICAgICB0aGlzLmZpcnN0ID0gYmxvY2sodHJ1ZSwgdHJ1ZSk7XG4gICAgICAgICAgICBhZHZhbmNlKFwid2hpbGVcIik7XG4gICAgICAgICAgICB2YXIgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgYWR2YW5jZShcIihcIik7XG4gICAgICAgICAgICBjaGVja0NvbmRBc3NpZ25tZW50KGV4cHJlc3Npb24oMCkpO1xuICAgICAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gLT0gMTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdIC09IDE7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSk7XG4gICAgICAgIHgubGFiZWxsZWQgPSB0cnVlO1xuICAgICAgICB4LmV4cHMgPSB0cnVlO1xuICAgIH0gKCkpO1xuXG4gICAgYmxvY2tzdG10KFwiZm9yXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcywgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICB2YXIgbGV0c2NvcGUgPSBmYWxzZTtcbiAgICAgICAgdmFyIGZvcmVhY2h0b2sgPSBudWxsO1xuXG4gICAgICAgIGlmICh0LnZhbHVlID09PSBcImVhY2hcIikge1xuICAgICAgICAgICAgZm9yZWFjaHRvayA9IHQ7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZWFjaFwiKTtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTE4XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcImZvciBlYWNoXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaW5jcmVhc2VDb21wbGV4aXR5Q291bnQoKTtcbiAgICAgICAgYWR2YW5jZShcIihcIik7XG5cbiAgICAgICAgLy8gd2hhdCBraW5kIG9mIGZvcijigKYpIHN0YXRlbWVudCBpdCBpcz8gZm9yKOKApm9m4oCmKT8gZm9yKOKApmlu4oCmKT8gZm9yKOKApjvigKY74oCmKT9cbiAgICAgICAgdmFyIG5leHRvcDsgLy8gY29udGFpbnMgdGhlIHRva2VuIG9mIHRoZSBcImluXCIgb3IgXCJvZlwiIG9wZXJhdG9yXG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgdmFyIGlub2YgPSBbXCJpblwiLCBcIm9mXCJdO1xuICAgICAgICB2YXIgbGV2ZWwgPSAwOyAvLyBCaW5kaW5nUGF0dGVybiBcImxldmVsXCIgLS0tIGxldmVsIDAgPT09IG5vIEJpbmRpbmdQYXR0ZXJuXG4gICAgICAgIHZhciBjb21tYTsgLy8gRmlyc3QgY29tbWEgcHVuY3R1YXRvciBhdCBsZXZlbCAwXG4gICAgICAgIHZhciBpbml0aWFsaXplcjsgLy8gRmlyc3QgaW5pdGlhbGl6ZXIgYXQgbGV2ZWwgMFxuXG4gICAgICAgIC8vIElmIGluaXRpYWwgdG9rZW4gaXMgYSBCaW5kaW5nUGF0dGVybiwgY291bnQgaXQgYXMgc3VjaC5cbiAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcnMoc3RhdGUudG9rZW5zLm5leHQsIFtcIntcIiwgXCJbXCJdKSkrK2xldmVsO1xuICAgICAgICBkbyB7XG4gICAgICAgICAgICBuZXh0b3AgPSBwZWVrKGkpO1xuICAgICAgICAgICAgKytpO1xuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcnMobmV4dG9wLCBbXCJ7XCIsIFwiW1wiXSkpKytsZXZlbDtcbiAgICAgICAgICAgIGVsc2UgaWYgKGNoZWNrUHVuY3R1YXRvcnMobmV4dG9wLCBbXCJ9XCIsIFwiXVwiXSkpLS1sZXZlbDtcbiAgICAgICAgICAgIGlmIChsZXZlbCA8IDApIGJyZWFrO1xuICAgICAgICAgICAgaWYgKGxldmVsID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjb21tYSAmJiBjaGVja1B1bmN0dWF0b3IobmV4dG9wLCBcIixcIikpIGNvbW1hID0gbmV4dG9wO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKCFpbml0aWFsaXplciAmJiBjaGVja1B1bmN0dWF0b3IobmV4dG9wLCBcIj1cIikpIGluaXRpYWxpemVyID0gbmV4dG9wO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlIChsZXZlbCA+IDAgfHwgIWNvbnRhaW5zKGlub2YsIG5leHRvcC52YWx1ZSkgJiYgbmV4dG9wLnZhbHVlICE9PSBcIjtcIiAmJlxuICAgICAgICBuZXh0b3AudHlwZSAhPT0gXCIoZW5kKVwiKTsgLy8gSXMgdGhpcyBhIEpTQ1MgYnVnPyBUaGlzIGxvb2tzIHJlYWxseSB3ZWlyZC5cblxuICAgICAgICAvLyBpZiB3ZSdyZSBpbiBhIGZvciAo4oCmIGlufG9mIOKApikgc3RhdGVtZW50XG4gICAgICAgIGlmIChjb250YWlucyhpbm9mLCBuZXh0b3AudmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KCkgJiYgbmV4dG9wLnZhbHVlID09PSBcIm9mXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBuZXh0b3AsIFwiZm9yIG9mXCIsIFwiNlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG9rID0gIShpbml0aWFsaXplciB8fCBjb21tYSk7XG4gICAgICAgICAgICBpZiAoaW5pdGlhbGl6ZXIpIHtcbiAgICAgICAgICAgICAgICBlcnJvcihcIlcxMzNcIiwgY29tbWEsIG5leHRvcC52YWx1ZSwgXCJpbml0aWFsaXplciBpcyBmb3JiaWRkZW5cIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjb21tYSkge1xuICAgICAgICAgICAgICAgIGVycm9yKFwiVzEzM1wiLCBjb21tYSwgbmV4dG9wLnZhbHVlLCBcIm1vcmUgdGhhbiBvbmUgRm9yQmluZGluZ1wiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcInZhclwiKSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcInZhclwiKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5mdWQoeyBwcmVmaXg6IHRydWUgfSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImxldFwiIHx8IHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImNvbnN0XCIpIHtcbiAgICAgICAgICAgICAgICBhZHZhbmNlKHN0YXRlLnRva2Vucy5uZXh0LmlkKTtcbiAgICAgICAgICAgICAgICAvLyBjcmVhdGUgYSBuZXcgYmxvY2sgc2NvcGVcbiAgICAgICAgICAgICAgICBsZXRzY29wZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnN0YWNrKCk7XG4gICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuZnVkKHsgcHJlZml4OiB0cnVlIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBQYXJzZSBhcyBhIHZhciBzdGF0ZW1lbnQsIHdpdGggaW1wbGllZCBiaW5kaW5ncy4gSWdub3JlIGVycm9ycyBpZiBhbiBlcnJvclxuICAgICAgICAgICAgICAgIC8vIHdhcyBhbHJlYWR5IHJlcG9ydGVkXG4gICAgICAgICAgICAgICAgT2JqZWN0LmNyZWF0ZSh2YXJzdGF0ZW1lbnQpLmZ1ZCh7IHByZWZpeDogdHJ1ZSwgaW1wbGllZDogXCJmb3JcIiwgaWdub3JlOiAhb2sgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKG5leHRvcC52YWx1ZSk7XG4gICAgICAgICAgICBleHByZXNzaW9uKDIwKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIpXCIsIHQpO1xuXG4gICAgICAgICAgICBpZiAobmV4dG9wLnZhbHVlID09PSBcImluXCIgJiYgc3RhdGUub3B0aW9uLmZvcmluKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrbmVlZGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5mb3JpbmlmY2hlY2tzID09PSB2b2lkIDApIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrcyA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFB1c2ggYSBuZXcgZm9yLWluLWlmIGNoZWNrIG9udG8gdGhlIHN0YWNrLiBUaGUgdHlwZSB3aWxsIGJlIG1vZGlmaWVkXG4gICAgICAgICAgICAgICAgLy8gd2hlbiB0aGUgbG9vcCdzIGJvZHkgaXMgcGFyc2VkIGFuZCBhIHN1aXRhYmxlIGlmIHN0YXRlbWVudCBleGlzdHMuXG4gICAgICAgICAgICAgICAgc3RhdGUuZm9yaW5pZmNoZWNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCIobm9uZSlcIlxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gKz0gMTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdICs9IDE7XG5cbiAgICAgICAgICAgIHMgPSBibG9jayh0cnVlLCB0cnVlKTtcblxuICAgICAgICAgICAgaWYgKG5leHRvcC52YWx1ZSA9PT0gXCJpblwiICYmIHN0YXRlLm9wdGlvbi5mb3Jpbikge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5mb3JpbmlmY2hlY2tzICYmIHN0YXRlLmZvcmluaWZjaGVja3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2hlY2sgPSBzdGF0ZS5mb3JpbmlmY2hlY2tzLnBvcCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICgvLyBObyBpZiBzdGF0ZW1lbnQgb3Igbm90IHRoZSBmaXJzdCBzdGF0ZW1lbnQgaW4gbG9vcCBib2R5XG4gICAgICAgICAgICAgICAgICAgICAgICBzICYmIHMubGVuZ3RoID4gMCAmJiAodHlwZW9mIHNbMF0gIT09IFwib2JqZWN0XCIgfHwgc1swXS52YWx1ZSAhPT0gXCJpZlwiKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUG9zaXRpdmUgaWYgc3RhdGVtZW50IGlzIG5vdCB0aGUgb25seSBvbmUgaW4gbG9vcCBib2R5XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGVjay50eXBlID09PSBcIihwb3NpdGl2ZSlcIiAmJiBzLmxlbmd0aCA+IDEgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5lZ2F0aXZlIGlmIHN0YXRlbWVudCBidXQgbm8gY29udGludWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoZWNrLnR5cGUgPT09IFwiKG5lZ2F0aXZlKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA4OVwiLCB0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFJlc2V0IHRoZSBmbGFnIGluIGNhc2Ugbm8gaWYgc3RhdGVtZW50IHdhcyBjb250YWluZWQgaW4gdGhlIGxvb3AgYm9keVxuICAgICAgICAgICAgICAgIHN0YXRlLmZvcmluaWZjaGVja25lZWRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gLT0gMTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdIC09IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZm9yZWFjaHRvaykge1xuICAgICAgICAgICAgICAgIGVycm9yKFwiRTA0NVwiLCBmb3JlYWNodG9rKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwidmFyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcInZhclwiKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuZnVkKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJsZXRcIikge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwibGV0XCIpO1xuICAgICAgICAgICAgICAgICAgICAvLyBjcmVhdGUgYSBuZXcgYmxvY2sgc2NvcGVcbiAgICAgICAgICAgICAgICAgICAgbGV0c2NvcGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uc3RhY2soKTtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUudG9rZW5zLmN1cnIuZnVkKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMCwgXCJmb3JcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21tYSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbm9saW5lYnJlYWsoc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG5cbiAgICAgICAgICAgIC8vIHN0YXJ0IGxvb3BhZ2UgYWZ0ZXIgdGhlIGZpcnN0IDsgYXMgdGhlIG5leHQgdHdvIGV4cHJlc3Npb25zIGFyZSBleGVjdXRlZFxuICAgICAgICAgICAgLy8gb24gZXZlcnkgbG9vcFxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIobG9vcGFnZSlcIl0gKz0gMTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIpIHtcbiAgICAgICAgICAgICAgICBjaGVja0NvbmRBc3NpZ25tZW50KGV4cHJlc3Npb24oMCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbm9saW5lYnJlYWsoc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgYWR2YW5jZShcIjtcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiO1wiKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDIxXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBcIilcIiwgXCI7XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkICE9PSBcIilcIikge1xuICAgICAgICAgICAgICAgIGZvciAoOyA7KSB7XG4gICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24oMCwgXCJmb3JcIik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIsXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvbW1hKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYWR2YW5jZShcIilcIiwgdCk7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihicmVha2FnZSlcIl0gKz0gMTtcbiAgICAgICAgICAgIGJsb2NrKHRydWUsIHRydWUpO1xuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdIC09IDE7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihsb29wYWdlKVwiXSAtPSAxO1xuXG4gICAgICAgIH1cbiAgICAgICAgLy8gdW5zdGFjayBsb29wIGJsb2Nrc2NvcGVcbiAgICAgICAgaWYgKGxldHNjb3BlKSB7XG4gICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0udW5zdGFjaygpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmxhYmVsbGVkID0gdHJ1ZTtcblxuXG4gICAgc3RtdChcImJyZWFrXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdiA9IHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlO1xuXG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmFzaSlcbiAgICAgICAgICAgIG5vbGluZWJyZWFrKHRoaXMpO1xuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIgJiYgIXN0YXRlLnRva2Vucy5uZXh0LnJlYWNoICYmXG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5saW5lID09PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5mdW5jdC5oYXNCcmVha0xhYmVsKHYpKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOTBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHYpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5maXJzdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHN0YXRlLmZ1bmN0W1wiKGJyZWFrYWdlKVwiXSA9PT0gMClcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA1MlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdGhpcy52YWx1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZWFjaGFibGUodGhpcyk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkuZXhwcyA9IHRydWU7XG5cblxuICAgIHN0bXQoXCJjb250aW51ZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHYgPSBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZTtcblxuICAgICAgICBpZiAoc3RhdGUuZnVuY3RbXCIoYnJlYWthZ2UpXCJdID09PSAwKVxuICAgICAgICAgICAgd2FybmluZyhcIlcwNTJcIiwgc3RhdGUudG9rZW5zLm5leHQsIHRoaXMudmFsdWUpO1xuICAgICAgICBpZiAoIXN0YXRlLmZ1bmN0W1wiKGxvb3BhZ2UpXCJdKVxuICAgICAgICAgICAgd2FybmluZyhcIlcwNTJcIiwgc3RhdGUudG9rZW5zLm5leHQsIHRoaXMudmFsdWUpO1xuXG4gICAgICAgIGlmICghc3RhdGUub3B0aW9uLmFzaSlcbiAgICAgICAgICAgIG5vbGluZWJyZWFrKHRoaXMpO1xuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIgJiYgIXN0YXRlLnRva2Vucy5uZXh0LnJlYWNoKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLmN1cnIubGluZSA9PT0gc3RhcnRMaW5lKHN0YXRlLnRva2Vucy5uZXh0KSkge1xuICAgICAgICAgICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmZ1bmN0Lmhhc0JyZWFrTGFiZWwodikpIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOTBcIiwgc3RhdGUudG9rZW5zLm5leHQsIHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLmZpcnN0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVhY2hhYmxlKHRoaXMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG5cbiAgICBzdG10KFwicmV0dXJuXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5saW5lID09PSBzdGFydExpbmUoc3RhdGUudG9rZW5zLm5leHQpKSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiO1wiICYmICFzdGF0ZS50b2tlbnMubmV4dC5yZWFjaCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDApO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlyc3QgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJzdC50eXBlID09PSBcIihwdW5jdHVhdG9yKVwiICYmIHRoaXMuZmlyc3QudmFsdWUgPT09IFwiPVwiICYmXG4gICAgICAgICAgICAgICAgICAgICF0aGlzLmZpcnN0LnBhcmVuICYmICFzdGF0ZS5vcHRpb24uYm9zcykge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nQXQoXCJXMDkzXCIsIHRoaXMuZmlyc3QubGluZSwgdGhpcy5maXJzdC5jaGFyYWN0ZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcIihwdW5jdHVhdG9yKVwiICYmXG4gICAgICAgICAgICAgICAgW1wiW1wiLCBcIntcIiwgXCIrXCIsIFwiLVwiXS5pbmRleE9mKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgbm9saW5lYnJlYWsodGhpcyk7IC8vIGFsd2F5cyB3YXJuIChMaW5lIGJyZWFraW5nIGVycm9yKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVhY2hhYmxlKHRoaXMpO1xuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0pLmV4cHMgPSB0cnVlO1xuXG4gICAgKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgeC5leHBzID0gdHJ1ZTtcbiAgICAgICAgeC5sYnAgPSAyNTtcbiAgICB9IChwcmVmaXgoXCJ5aWVsZFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByZXYgPSBzdGF0ZS50b2tlbnMucHJldjtcbiAgICAgICAgaWYgKHN0YXRlLmluRVM2KHRydWUpICYmICFzdGF0ZS5mdW5jdFtcIihnZW5lcmF0b3IpXCJdKSB7XG4gICAgICAgICAgICAvLyBJZiBpdCdzIGEgeWllbGQgd2l0aGluIGEgY2F0Y2ggY2xhdXNlIGluc2lkZSBhIGdlbmVyYXRvciB0aGVuIHRoYXQncyBva1xuICAgICAgICAgICAgaWYgKCEoXCIoY2F0Y2gpXCIgPT09IHN0YXRlLmZ1bmN0W1wiKG5hbWUpXCJdICYmIHN0YXRlLmZ1bmN0W1wiKGNvbnRleHQpXCJdW1wiKGdlbmVyYXRvcilcIl0pKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDQ2XCIsIHN0YXRlLnRva2Vucy5jdXJyLCBcInlpZWxkXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJ5aWVsZFwiLCBcIjZcIik7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGUuZnVuY3RbXCIoZ2VuZXJhdG9yKVwiXSA9IFwieWllbGRlZFwiO1xuICAgICAgICB2YXIgZGVsZWdhdGluZ1lpZWxkID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgZGVsZWdhdGluZ1lpZWxkID0gdHJ1ZTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIqXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubGluZSA9PT0gc3RhcnRMaW5lKHN0YXRlLnRva2Vucy5uZXh0KSB8fCAhc3RhdGUuaW5Nb3ooKSkge1xuICAgICAgICAgICAgaWYgKGRlbGVnYXRpbmdZaWVsZCB8fFxuICAgICAgICAgICAgICAgIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCI7XCIgJiYgIXN0YXRlLm9wdGlvbi5hc2kgJiZcbiAgICAgICAgICAgICAgICAgICAgIXN0YXRlLnRva2Vucy5uZXh0LnJlYWNoICYmIHN0YXRlLnRva2Vucy5uZXh0Lm51ZCkpIHtcblxuICAgICAgICAgICAgICAgIG5vYnJlYWtub25hZGphY2VudChzdGF0ZS50b2tlbnMuY3Vyciwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyc3QgPSBleHByZXNzaW9uKDEwKTtcblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpcnN0LnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgdGhpcy5maXJzdC52YWx1ZSA9PT0gXCI9XCIgJiZcbiAgICAgICAgICAgICAgICAgICAgIXRoaXMuZmlyc3QucGFyZW4gJiYgIXN0YXRlLm9wdGlvbi5ib3NzKSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdBdChcIlcwOTNcIiwgdGhpcy5maXJzdC5saW5lLCB0aGlzLmZpcnN0LmNoYXJhY3Rlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUuaW5Nb3ooKSAmJiBzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIpXCIgJiZcbiAgICAgICAgICAgICAgICAocHJldi5sYnAgPiAzMCB8fCAoIXByZXYuYXNzaWduICYmICFpc0VuZE9mRXhwcigpKSB8fCBwcmV2LmlkID09PSBcInlpZWxkXCIpKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IoXCJFMDUwXCIsIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKCFzdGF0ZS5vcHRpb24uYXNpKSB7XG4gICAgICAgICAgICBub2xpbmVicmVhayh0aGlzKTsgLy8gYWx3YXlzIHdhcm4gKExpbmUgYnJlYWtpbmcgZXJyb3IpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSkpKTtcblxuXG4gICAgc3RtdChcInRocm93XCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICBub2xpbmVicmVhayh0aGlzKTtcbiAgICAgICAgdGhpcy5maXJzdCA9IGV4cHJlc3Npb24oMjApO1xuXG4gICAgICAgIHJlYWNoYWJsZSh0aGlzKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuICAgIHN0bXQoXCJpbXBvcnRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiaW1wb3J0XCIsIFwiNlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC50eXBlID09PSBcIihzdHJpbmcpXCIpIHtcbiAgICAgICAgICAgIC8vIE1vZHVsZVNwZWNpZmllciA6OiBTdHJpbmdMaXRlcmFsXG4gICAgICAgICAgICBhZHZhbmNlKFwiKHN0cmluZylcIik7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAvLyBJbXBvcnRDbGF1c2UgOjogSW1wb3J0ZWREZWZhdWx0QmluZGluZ1xuICAgICAgICAgICAgdGhpcy5uYW1lID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgLy8gSW1wb3J0IGJpbmRpbmdzIGFyZSBpbW11dGFibGUgKHNlZSBFUzYgOC4xLjEuNS41KVxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHRoaXMubmFtZSwge1xuICAgICAgICAgICAgICAgIHR5cGU6IFwiY29uc3RcIixcbiAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnJcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gSW1wb3J0Q2xhdXNlIDo6IEltcG9ydGVkRGVmYXVsdEJpbmRpbmcgLCBOYW1lU3BhY2VJbXBvcnRcbiAgICAgICAgICAgICAgICAvLyBJbXBvcnRDbGF1c2UgOjogSW1wb3J0ZWREZWZhdWx0QmluZGluZyAsIE5hbWVkSW1wb3J0c1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIsXCIpO1xuICAgICAgICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIHdlIGludGVudGlvbmFsbHkgZmFsbCB0aHJvdWdoIHRvIGNvbnRpbnVlIG1hdGNoaW5nXG4gICAgICAgICAgICAgICAgLy8gZWl0aGVyIE5hbWVTcGFjZUltcG9ydCBvciBOYW1lZEltcG9ydHMuXG4gICAgICAgICAgICAgICAgLy8gRGlzY3Vzc2lvbjpcbiAgICAgICAgICAgICAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vanNoaW50L2pzaGludC9wdWxsLzIxNDQjZGlzY3Vzc2lvbl9yMjM5Nzg0MDZcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcImZyb21cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIihzdHJpbmcpXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIipcIikge1xuICAgICAgICAgICAgLy8gSW1wb3J0Q2xhdXNlIDo6IE5hbWVTcGFjZUltcG9ydFxuICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICBhZHZhbmNlKFwiYXNcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWRlbnRpZmllcikge1xuICAgICAgICAgICAgICAgIHRoaXMubmFtZSA9IGlkZW50aWZpZXIoKTtcbiAgICAgICAgICAgICAgICAvLyBJbXBvcnQgYmluZGluZ3MgYXJlIGltbXV0YWJsZSAoc2VlIEVTNiA4LjEuMS41LjUpXG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmFkZGxhYmVsKHRoaXMubmFtZSwge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcImNvbnN0XCIsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuOiBzdGF0ZS50b2tlbnMuY3VyclxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSW1wb3J0Q2xhdXNlIDo6IE5hbWVkSW1wb3J0c1xuICAgICAgICAgICAgYWR2YW5jZShcIntcIik7XG4gICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIn1cIik7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgaW1wb3J0TmFtZTtcbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudHlwZSA9PT0gXCJkZWZhdWx0XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaW1wb3J0TmFtZSA9IFwiZGVmYXVsdFwiO1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiZGVmYXVsdFwiKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpbXBvcnROYW1lID0gaWRlbnRpZmllcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiYXNcIikge1xuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiYXNcIik7XG4gICAgICAgICAgICAgICAgICAgIGltcG9ydE5hbWUgPSBpZGVudGlmaWVyKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSW1wb3J0IGJpbmRpbmdzIGFyZSBpbW11dGFibGUgKHNlZSBFUzYgOC4xLjEuNS41KVxuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRsYWJlbChpbXBvcnROYW1lLCB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiY29uc3RcIixcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJ9XCIpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjRcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRnJvbUNsYXVzZVxuICAgICAgICBhZHZhbmNlKFwiZnJvbVwiKTtcbiAgICAgICAgYWR2YW5jZShcIihzdHJpbmcpXCIpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuICAgIHN0bXQoXCJleHBvcnRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBvayA9IHRydWU7XG4gICAgICAgIHZhciB0b2tlbjtcbiAgICAgICAgdmFyIGlkZW50aWZpZXI7XG5cbiAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNigpKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzExOVwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJleHBvcnRcIiwgXCI2XCIpO1xuICAgICAgICAgICAgb2sgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLmlzR2xvYmFsKCkpIHtcbiAgICAgICAgICAgIGVycm9yKFwiRTA1M1wiLCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICBvayA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcIipcIikge1xuICAgICAgICAgICAgLy8gRXhwb3J0RGVjbGFyYXRpb24gOjogZXhwb3J0ICogRnJvbUNsYXVzZVxuICAgICAgICAgICAgYWR2YW5jZShcIipcIik7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZnJvbVwiKTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCIoc3RyaW5nKVwiKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnR5cGUgPT09IFwiZGVmYXVsdFwiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OlxuICAgICAgICAgICAgLy8gICAgICBleHBvcnQgZGVmYXVsdCBbbG9va2FoZWFkIO+DjyB7IGZ1bmN0aW9uLCBjbGFzcyB9XSBBc3NpZ25tZW50RXhwcmVzc2lvbltJbl0gO1xuICAgICAgICAgICAgLy8gICAgICBleHBvcnQgZGVmYXVsdCBIb2lzdGFibGVEZWNsYXJhdGlvblxuICAgICAgICAgICAgLy8gICAgICBleHBvcnQgZGVmYXVsdCBDbGFzc0RlY2xhcmF0aW9uXG4gICAgICAgICAgICBzdGF0ZS5uYW1lU3RhY2suc2V0KHN0YXRlLnRva2Vucy5uZXh0KTtcbiAgICAgICAgICAgIGFkdmFuY2UoXCJkZWZhdWx0XCIpO1xuICAgICAgICAgICAgdmFyIGV4cG9ydFR5cGUgPSBzdGF0ZS50b2tlbnMubmV4dC5pZDtcbiAgICAgICAgICAgIGlmIChleHBvcnRUeXBlID09PSBcImZ1bmN0aW9uXCIgfHwgZXhwb3J0VHlwZSA9PT0gXCJjbGFzc1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ibG9jayA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRva2VuID0gcGVlaygpO1xuXG4gICAgICAgICAgICBleHByZXNzaW9uKDEwKTtcblxuICAgICAgICAgICAgaWRlbnRpZmllciA9IHRva2VuLnZhbHVlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5ibG9jaykge1xuICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5hZGRsYWJlbChpZGVudGlmaWVyLCB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IGV4cG9ydFR5cGUsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuOiB0b2tlblxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnNldEV4cG9ydGVkKGlkZW50aWZpZXIsIHRva2VuKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwie1wiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OiBleHBvcnQgRXhwb3J0Q2xhdXNlXG4gICAgICAgICAgICBhZHZhbmNlKFwie1wiKTtcbiAgICAgICAgICAgIHZhciBleHBvcnRlZFRva2VucyA9IFtdO1xuICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDMwXCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcblxuICAgICAgICAgICAgICAgIGV4cG9ydGVkVG9rZW5zLnB1c2goc3RhdGUudG9rZW5zLmN1cnIpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImFzXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcImFzXCIpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLnRva2Vucy5uZXh0LmlkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAzMFwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIsXCIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJ9XCIpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjRcIiwgc3RhdGUudG9rZW5zLm5leHQsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlID09PSBcImZyb21cIikge1xuICAgICAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBFeHBvcnRDbGF1c2UgRnJvbUNsYXVzZVxuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCJmcm9tXCIpO1xuICAgICAgICAgICAgICAgIGFkdmFuY2UoXCIoc3RyaW5nKVwiKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob2spIHtcbiAgICAgICAgICAgICAgICBleHBvcnRlZFRva2Vucy5mb3JFYWNoKGZ1bmN0aW9uKHRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zZXRFeHBvcnRlZCh0b2tlbi52YWx1ZSwgdG9rZW4pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwidmFyXCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBWYXJpYWJsZVN0YXRlbWVudFxuICAgICAgICAgICAgYWR2YW5jZShcInZhclwiKTtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmZ1ZCh7IGluZXhwb3J0OiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImxldFwiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OiBleHBvcnQgVmFyaWFibGVTdGF0ZW1lbnRcbiAgICAgICAgICAgIGFkdmFuY2UoXCJsZXRcIik7XG4gICAgICAgICAgICBzdGF0ZS50b2tlbnMuY3Vyci5mdWQoeyBpbmV4cG9ydDogdHJ1ZSB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJjb25zdFwiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OiBleHBvcnQgVmFyaWFibGVTdGF0ZW1lbnRcbiAgICAgICAgICAgIGFkdmFuY2UoXCJjb25zdFwiKTtcbiAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmZ1ZCh7IGluZXhwb3J0OiB0cnVlIH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgIC8vIEV4cG9ydERlY2xhcmF0aW9uIDo6IGV4cG9ydCBEZWNsYXJhdGlvblxuICAgICAgICAgICAgdGhpcy5ibG9jayA9IHRydWU7XG4gICAgICAgICAgICBhZHZhbmNlKFwiZnVuY3Rpb25cIik7XG4gICAgICAgICAgICBzdGF0ZS5zeW50YXhbXCJmdW5jdGlvblwiXS5mdWQoeyBpbmV4cG9ydDogdHJ1ZSB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJjbGFzc1wiKSB7XG4gICAgICAgICAgICAvLyBFeHBvcnREZWNsYXJhdGlvbiA6OiBleHBvcnQgRGVjbGFyYXRpb25cbiAgICAgICAgICAgIHRoaXMuYmxvY2sgPSB0cnVlO1xuICAgICAgICAgICAgYWR2YW5jZShcImNsYXNzXCIpO1xuICAgICAgICAgICAgdmFyIGNsYXNzTmFtZVRva2VuID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICBzdGF0ZS5zeW50YXhbXCJjbGFzc1wiXS5mdWQoKTtcbiAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5zZXRFeHBvcnRlZChjbGFzc05hbWVUb2tlbi52YWx1ZSwgY2xhc3NOYW1lVG9rZW4pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3IoXCJFMDI0XCIsIHN0YXRlLnRva2Vucy5uZXh0LCBzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9KS5leHBzID0gdHJ1ZTtcblxuICAgIC8vIEZ1dHVyZSBSZXNlcnZlZCBXb3Jkc1xuXG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiYWJzdHJhY3RcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiYm9vbGVhblwiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJieXRlXCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImNoYXJcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiY2xhc3NcIiwgeyBlczU6IHRydWUsIG51ZDogY2xhc3NkZWYgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZG91YmxlXCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImVudW1cIiwgeyBlczU6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZXhwb3J0XCIsIHsgZXM1OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImV4dGVuZHNcIiwgeyBlczU6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZmluYWxcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZmxvYXRcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiZ290b1wiKTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJpbXBsZW1lbnRzXCIsIHsgZXM1OiB0cnVlLCBzdHJpY3RPbmx5OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImltcG9ydFwiLCB7IGVzNTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJpbnRcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwiaW50ZXJmYWNlXCIsIHsgZXM1OiB0cnVlLCBzdHJpY3RPbmx5OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcImxvbmdcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwibmF0aXZlXCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInBhY2thZ2VcIiwgeyBlczU6IHRydWUsIHN0cmljdE9ubHk6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwicHJpdmF0ZVwiLCB7IGVzNTogdHJ1ZSwgc3RyaWN0T25seTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJwcm90ZWN0ZWRcIiwgeyBlczU6IHRydWUsIHN0cmljdE9ubHk6IHRydWUgfSk7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwicHVibGljXCIsIHsgZXM1OiB0cnVlLCBzdHJpY3RPbmx5OiB0cnVlIH0pO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInNob3J0XCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInN0YXRpY1wiLCB7IGVzNTogdHJ1ZSwgc3RyaWN0T25seTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJzdXBlclwiLCB7IGVzNTogdHJ1ZSB9KTtcbiAgICBGdXR1cmVSZXNlcnZlZFdvcmQoXCJzeW5jaHJvbml6ZWRcIik7XG4gICAgRnV0dXJlUmVzZXJ2ZWRXb3JkKFwidHJhbnNpZW50XCIpO1xuICAgIEZ1dHVyZVJlc2VydmVkV29yZChcInZvbGF0aWxlXCIpO1xuXG4gICAgLy8gdGhpcyBmdW5jdGlvbiBpcyB1c2VkIHRvIGRldGVybWluZSB3aGV0aGVyIGEgc3F1YXJlYnJhY2tldCBvciBhIGN1cmx5YnJhY2tldFxuICAgIC8vIGV4cHJlc3Npb24gaXMgYSBjb21wcmVoZW5zaW9uIGFycmF5LCBkZXN0cnVjdHVyaW5nIGFzc2lnbm1lbnQgb3IgYSBqc29uIHZhbHVlLlxuXG4gICAgdmFyIGxvb2t1cEJsb2NrVHlwZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcG4sIHBuMSwgcHJldjtcbiAgICAgICAgdmFyIGkgPSAtMTtcbiAgICAgICAgdmFyIGJyYWNrZXRTdGFjayA9IDA7XG4gICAgICAgIHZhciByZXQ6IGFueSA9IHt9O1xuICAgICAgICBpZiAoY2hlY2tQdW5jdHVhdG9ycyhzdGF0ZS50b2tlbnMuY3VyciwgW1wiW1wiLCBcIntcIl0pKSB7XG4gICAgICAgICAgICBicmFja2V0U3RhY2sgKz0gMTtcbiAgICAgICAgfVxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBwcmV2ID0gaSA9PT0gLTEgPyBzdGF0ZS50b2tlbnMuY3VyciA6IHBuO1xuICAgICAgICAgICAgcG4gPSBpID09PSAtMSA/IHN0YXRlLnRva2Vucy5uZXh0IDogcGVlayhpKTtcbiAgICAgICAgICAgIHBuMSA9IHBlZWsoaSArIDEpO1xuICAgICAgICAgICAgaSA9IGkgKyAxO1xuICAgICAgICAgICAgaWYgKGNoZWNrUHVuY3R1YXRvcnMocG4sIFtcIltcIiwgXCJ7XCJdKSkge1xuICAgICAgICAgICAgICAgIGJyYWNrZXRTdGFjayArPSAxO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaGVja1B1bmN0dWF0b3JzKHBuLCBbXCJdXCIsIFwifVwiXSkpIHtcbiAgICAgICAgICAgICAgICBicmFja2V0U3RhY2sgLT0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChicmFja2V0U3RhY2sgPT09IDEgJiYgcG4uaWRlbnRpZmllciAmJiBwbi52YWx1ZSA9PT0gXCJmb3JcIiAmJlxuICAgICAgICAgICAgICAgICFjaGVja1B1bmN0dWF0b3IocHJldiwgXCIuXCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0LmlzQ29tcEFycmF5ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXQubm90SnNvbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYnJhY2tldFN0YWNrID09PSAwICYmIGNoZWNrUHVuY3R1YXRvcnMocG4sIFtcIn1cIiwgXCJdXCJdKSkge1xuICAgICAgICAgICAgICAgIGlmIChwbjEudmFsdWUgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldC5pc0Rlc3RBc3NpZ24gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXQubm90SnNvbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocG4xLnZhbHVlID09PSBcIi5cIikge1xuICAgICAgICAgICAgICAgICAgICByZXQubm90SnNvbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChjaGVja1B1bmN0dWF0b3IocG4sIFwiO1wiKSkge1xuICAgICAgICAgICAgICAgIHJldC5pc0Jsb2NrID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICByZXQubm90SnNvbiA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gd2hpbGUgKGJyYWNrZXRTdGFjayA+IDAgJiYgcG4uaWQgIT09IFwiKGVuZClcIik7XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHNhdmVQcm9wZXJ0eShwcm9wcywgbmFtZSwgdGtuLCBpc0NsYXNzPywgaXNTdGF0aWM/KSB7XG4gICAgICAgIHZhciBtc2dzID0gW1wia2V5XCIsIFwiY2xhc3MgbWV0aG9kXCIsIFwic3RhdGljIGNsYXNzIG1ldGhvZFwiXTtcbiAgICAgICAgdmFyIG1zZyA9IG1zZ3NbKGlzQ2xhc3MgfHwgZmFsc2UpICsgKGlzU3RhdGljIHx8IGZhbHNlKV07XG4gICAgICAgIGlmICh0a24uaWRlbnRpZmllcikge1xuICAgICAgICAgICAgbmFtZSA9IHRrbi52YWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wc1tuYW1lXSAmJiBuYW1lICE9PSBcIl9fcHJvdG9fX1wiKSB7XG4gICAgICAgICAgICB3YXJuaW5nKFwiVzA3NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgbXNnLCBuYW1lKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3BzW25hbWVdID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb3BzW25hbWVdLmJhc2ljID0gdHJ1ZTtcbiAgICAgICAgcHJvcHNbbmFtZV0uYmFzaWN0a24gPSB0a247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFjY2Vzc29yVHlwZSAtIEVpdGhlciBcImdldFwiIG9yIFwic2V0XCJcbiAgICAgKiBAcGFyYW0ge29iamVjdH0gcHJvcHMgLSBhIGNvbGxlY3Rpb24gb2YgYWxsIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdCB0b1xuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWNoIHRoZSBjdXJyZW50IGFjY2Vzc29yIGlzIGJlaW5nIGFzc2lnbmVkXG4gICAgICogQHBhcmFtIHtvYmplY3R9IHRrbiAtIHRoZSBpZGVudGlmaWVyIHRva2VuIHJlcHJlc2VudGluZyB0aGUgYWNjZXNzb3IgbmFtZVxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNDbGFzcyAtIHdoZXRoZXIgdGhlIGFjY2Vzc29yIGlzIHBhcnQgb2YgYW4gRVM2IENsYXNzXG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmaW5pdGlvblxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaXNTdGF0aWMgLSB3aGV0aGVyIHRoZSBhY2Nlc3NvciBpcyBhIHN0YXRpYyBtZXRob2RcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBzYXZlQWNjZXNzb3IoYWNjZXNzb3JUeXBlOiBzdHJpbmcsIHByb3BzLCBuYW1lLCB0a24sIGlzQ2xhc3M/OiBib29sZWFuLCBpc1N0YXRpYz86IGJvb2xlYW4pIHtcbiAgICAgICAgdmFyIGZsYWdOYW1lID0gYWNjZXNzb3JUeXBlID09PSBcImdldFwiID8gXCJnZXR0ZXJUb2tlblwiIDogXCJzZXR0ZXJUb2tlblwiO1xuICAgICAgICB2YXIgbXNnID0gXCJcIjtcblxuICAgICAgICBpZiAoaXNDbGFzcykge1xuICAgICAgICAgICAgaWYgKGlzU3RhdGljKSB7XG4gICAgICAgICAgICAgICAgbXNnICs9IFwic3RhdGljIFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbXNnICs9IGFjY2Vzc29yVHlwZSArIFwidGVyIG1ldGhvZFwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbXNnID0gXCJrZXlcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmFjY2Vzc29yVHlwZSA9IGFjY2Vzc29yVHlwZTtcbiAgICAgICAgc3RhdGUubmFtZVN0YWNrLnNldCh0a24pO1xuXG4gICAgICAgIGlmIChwcm9wc1tuYW1lXSkge1xuICAgICAgICAgICAgaWYgKChwcm9wc1tuYW1lXS5iYXNpYyB8fCBwcm9wc1tuYW1lXVtmbGFnTmFtZV0pICYmIG5hbWUgIT09IFwiX19wcm90b19fXCIpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA3NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgbXNnLCBuYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3BzW25hbWVdID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb3BzW25hbWVdW2ZsYWdOYW1lXSA9IHRrbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb21wdXRlZFByb3BlcnR5TmFtZSgpIHtcbiAgICAgICAgYWR2YW5jZShcIltcIik7XG4gICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSkge1xuICAgICAgICAgICAgd2FybmluZyhcIlcxMTlcIiwgc3RhdGUudG9rZW5zLmN1cnIsIFwiY29tcHV0ZWQgcHJvcGVydHkgbmFtZXNcIiwgXCI2XCIpO1xuICAgICAgICB9XG4gICAgICAgIHZhciB2YWx1ZSA9IGV4cHJlc3Npb24oMTApO1xuICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRlc3Qgd2hldGhlciBhIGdpdmVuIHRva2VuIGlzIGEgcHVuY3R1YXRvciBtYXRjaGluZyBvbmUgb2YgdGhlIHNwZWNpZmllZCB2YWx1ZXNcbiAgICAgKiBAcGFyYW0ge1Rva2VufSB0b2tlblxuICAgICAqIEBwYXJhbSB7QXJyYXkuPHN0cmluZz59IHZhbHVlc1xuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoZWNrUHVuY3R1YXRvcnModG9rZW46IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0sIHZhbHVlczogc3RyaW5nW10pIHtcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBjb250YWlucyh2YWx1ZXMsIHRva2VuLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGVzdCB3aGV0aGVyIGEgZ2l2ZW4gdG9rZW4gaXMgYSBwdW5jdHVhdG9yIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgdmFsdWVcbiAgICAgKiBAcGFyYW0ge1Rva2VufSB0b2tlblxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtib29sZWFufVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNoZWNrUHVuY3R1YXRvcih0b2tlbiwgdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRva2VuLnR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIgJiYgdG9rZW4udmFsdWUgPT09IHZhbHVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyBmdW5jdGlvbiBoYXMgYmVlbiByZWFjaGVkIGZvciBhIGRlc3RydWN0dXJpbmcgYXNzaWduIHdpdGggdW5kZWNsYXJlZCB2YWx1ZXNcbiAgICBmdW5jdGlvbiBkZXN0cnVjdHVyaW5nQXNzaWduT3JKc29uVmFsdWUoKSB7XG4gICAgICAgIC8vIGxvb2t1cCBmb3IgdGhlIGFzc2lnbm1lbnQgKEVDTUFTY3JpcHQgNiBvbmx5KVxuICAgICAgICAvLyBpZiBpdCBoYXMgc2VtaWNvbG9ucywgaXQgaXMgYSBibG9jaywgc28gZ28gcGFyc2UgaXQgYXMgYSBibG9ja1xuICAgICAgICAvLyBvciBpdCdzIG5vdCBhIGJsb2NrLCBidXQgdGhlcmUgYXJlIGFzc2lnbm1lbnRzLCBjaGVjayBmb3IgdW5kZWNsYXJlZCB2YXJpYWJsZXNcblxuICAgICAgICB2YXIgYmxvY2sgPSBsb29rdXBCbG9ja1R5cGUoKTtcbiAgICAgICAgaWYgKGJsb2NrLm5vdEpzb24pIHtcbiAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYoKSAmJiBibG9jay5pc0Rlc3RBc3NpZ24pIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzEwNFwiLCBzdGF0ZS50b2tlbnMuY3VyciwgXCJkZXN0cnVjdHVyaW5nIGFzc2lnbm1lbnRcIiwgXCI2XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3RhdGVtZW50cygpO1xuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIHBhcnNlIGpzb24gdmFsdWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlLm9wdGlvbi5sYXhicmVhayA9IHRydWU7XG4gICAgICAgICAgICBzdGF0ZS5qc29uTW9kZSA9IHRydWU7XG4gICAgICAgICAgICBqc29uVmFsdWUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGFycmF5IGNvbXByZWhlbnNpb24gcGFyc2luZyBmdW5jdGlvblxuICAgIC8vIHBhcnNlcyBhbmQgZGVmaW5lcyB0aGUgdGhyZWUgc3RhdGVzIG9mIHRoZSBsaXN0IGNvbXByZWhlbnNpb24gaW4gb3JkZXJcbiAgICAvLyB0byBhdm9pZCBkZWZpbmluZyBnbG9iYWwgdmFyaWFibGVzLCBidXQga2VlcGluZyB0aGVtIHRvIHRoZSBsaXN0IGNvbXByZWhlbnNpb24gc2NvcGVcbiAgICAvLyBvbmx5LiBUaGUgb3JkZXIgb2YgdGhlIHN0YXRlcyBhcmUgYXMgZm9sbG93czpcbiAgICAvLyAgKiBcInVzZVwiIHdoaWNoIHdpbGwgYmUgdGhlIHJldHVybmVkIGl0ZXJhdGl2ZSBwYXJ0IG9mIHRoZSBsaXN0IGNvbXByZWhlbnNpb25cbiAgICAvLyAgKiBcImRlZmluZVwiIHdoaWNoIHdpbGwgZGVmaW5lIHRoZSB2YXJpYWJsZXMgbG9jYWwgdG8gdGhlIGxpc3QgY29tcHJlaGVuc2lvblxuICAgIC8vICAqIFwiZmlsdGVyXCIgd2hpY2ggd2lsbCBoZWxwIGZpbHRlciBvdXQgdmFsdWVzXG5cbiAgICB2YXIgYXJyYXlDb21wcmVoZW5zaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBDb21wQXJyYXkgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMubW9kZSA9IFwidXNlXCI7XG4gICAgICAgICAgICB0aGlzLnZhcmlhYmxlcyA9IFtdO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgX2NhcnJheXMgPSBbXTtcbiAgICAgICAgdmFyIF9jdXJyZW50O1xuICAgICAgICBmdW5jdGlvbiBkZWNsYXJlKHYpIHtcbiAgICAgICAgICAgIHZhciBsID0gX2N1cnJlbnQudmFyaWFibGVzLmZpbHRlcihmdW5jdGlvbihlbHQpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiBpdCBoYXMsIGNoYW5nZSBpdHMgdW5kZWYgc3RhdGVcbiAgICAgICAgICAgICAgICBpZiAoZWx0LnZhbHVlID09PSB2KSB7XG4gICAgICAgICAgICAgICAgICAgIGVsdC51bmRlZiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gbCAhPT0gMDtcbiAgICAgICAgfVxuICAgICAgICBmdW5jdGlvbiB1c2Uodikge1xuICAgICAgICAgICAgdmFyIGwgPSBfY3VycmVudC52YXJpYWJsZXMuZmlsdGVyKGZ1bmN0aW9uKGVsdCkge1xuICAgICAgICAgICAgICAgIC8vIGFuZCBpZiBpdCBoYXMgYmVlbiBkZWZpbmVkXG4gICAgICAgICAgICAgICAgaWYgKGVsdC52YWx1ZSA9PT0gdiAmJiAhZWx0LnVuZGVmKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbHQudW51c2VkID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHQudW51c2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkubGVuZ3RoO1xuICAgICAgICAgICAgLy8gb3RoZXJ3aXNlIHdlIHdhcm4gYWJvdXQgaXRcbiAgICAgICAgICAgIHJldHVybiAobCA9PT0gMCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudCA9IG5ldyBDb21wQXJyYXkoKTtcbiAgICAgICAgICAgICAgICBfY2FycmF5cy5wdXNoKF9jdXJyZW50KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB1bnN0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudC52YXJpYWJsZXMuZmlsdGVyKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYudW51c2VkKVxuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOThcIiwgdi50b2tlbiwgdi5yYXdfdGV4dCB8fCB2LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHYudW5kZWYpXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihzY29wZSlcIl0uYmxvY2sudXNlKHYudmFsdWUsIHYudG9rZW4pO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIF9jYXJyYXlzLnNwbGljZSgtMSwgMSk7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnQgPSBfY2FycmF5c1tfY2FycmF5cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzZXRTdGF0ZTogZnVuY3Rpb24oczogc3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbnRhaW5zKFtcInVzZVwiLCBcImRlZmluZVwiLCBcImdlbmVyYXRlXCIsIFwiZmlsdGVyXCJdLCBzKSlcbiAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnQubW9kZSA9IHM7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hlY2s6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgICAgICBpZiAoIV9jdXJyZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gV2hlbiB3ZSBhcmUgaW4gXCJ1c2VcIiBzdGF0ZSBvZiB0aGUgbGlzdCBjb21wLCB3ZSBlbnF1ZXVlIHRoYXQgdmFyXG4gICAgICAgICAgICAgICAgaWYgKF9jdXJyZW50ICYmIF9jdXJyZW50Lm1vZGUgPT09IFwidXNlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZSh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2N1cnJlbnQudmFyaWFibGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0OiBzdGF0ZS5mdW5jdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbjogc3RhdGUudG9rZW5zLmN1cnIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5kZWY6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdW51c2VkOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gd2UgYXJlIGluIFwiZGVmaW5lXCIgc3RhdGUgb2YgdGhlIGxpc3QgY29tcCxcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKF9jdXJyZW50ICYmIF9jdXJyZW50Lm1vZGUgPT09IFwiZGVmaW5lXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIHZhcmlhYmxlIGhhcyBiZWVuIHVzZWQgcHJldmlvdXNseVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRlY2xhcmUodikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9jdXJyZW50LnZhcmlhYmxlcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdDogc3RhdGUuZnVuY3QsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IHN0YXRlLnRva2Vucy5jdXJyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB2LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVmOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bnVzZWQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiB0aGUgXCJnZW5lcmF0ZVwiIHN0YXRlIG9mIHRoZSBsaXN0IGNvbXAsXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChfY3VycmVudCAmJiBfY3VycmVudC5tb2RlID09PSBcImdlbmVyYXRlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmJsb2NrLnVzZSh2LCBzdGF0ZS50b2tlbnMuY3Vycik7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIHdlIGFyZSBpbiBcImZpbHRlclwiIHN0YXRlLFxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoX2N1cnJlbnQgJiYgX2N1cnJlbnQubW9kZSA9PT0gXCJmaWx0ZXJcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjaGVjayB3aGV0aGVyIGN1cnJlbnQgdmFyaWFibGUgaGFzIGJlZW4gZGVjbGFyZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZSh2KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgbm90IHdlIHdhcm4gYWJvdXQgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5ibG9jay51c2Uodiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfTtcblxuXG4gICAgLy8gUGFyc2UgSlNPTlxuXG4gICAgZnVuY3Rpb24ganNvblZhbHVlKCkge1xuICAgICAgICBmdW5jdGlvbiBqc29uT2JqZWN0KCkge1xuICAgICAgICAgICAgdmFyIG8gPSB7fSwgdCA9IHN0YXRlLnRva2Vucy5uZXh0O1xuICAgICAgICAgICAgYWR2YW5jZShcIntcIik7XG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwifVwiKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IDspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIihlbmQpXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAyNlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgdC5saW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDk0XCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI4XCIsIHN0YXRlLnRva2Vucy5uZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCIoc3RyaW5nKVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5NVwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChvW3N0YXRlLnRva2Vucy5uZXh0LnZhbHVlXSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwNzVcIiwgc3RhdGUudG9rZW5zLm5leHQsIFwia2V5XCIsIHN0YXRlLnRva2Vucy5uZXh0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgoc3RhdGUudG9rZW5zLm5leHQudmFsdWUgPT09IFwiX19wcm90b19fXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5vcHRpb24ucHJvdG8pIHx8IChzdGF0ZS50b2tlbnMubmV4dC52YWx1ZSA9PT0gXCJfX2l0ZXJhdG9yX19cIiAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICFzdGF0ZS5vcHRpb24uaXRlcmF0b3IpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5NlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgc3RhdGUudG9rZW5zLm5leHQudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgb1tzdGF0ZS50b2tlbnMubmV4dC52YWx1ZV0gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZShcIjpcIik7XG4gICAgICAgICAgICAgICAgICAgIGpzb25WYWx1ZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwifVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGpzb25BcnJheSgpIHtcbiAgICAgICAgICAgIHZhciB0ID0gc3RhdGUudG9rZW5zLm5leHQ7XG4gICAgICAgICAgICBhZHZhbmNlKFwiW1wiKTtcbiAgICAgICAgICAgIGlmIChzdGF0ZS50b2tlbnMubmV4dC5pZCAhPT0gXCJdXCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IoXCJFMDI3XCIsIHN0YXRlLnRva2Vucy5uZXh0LCB0LmxpbmUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLnRva2Vucy5uZXh0LmlkID09PSBcIl1cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOTRcIiwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgPT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIkUwMjhcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGpzb25WYWx1ZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiLFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlKFwiLFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZHZhbmNlKFwiXVwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaCAoc3RhdGUudG9rZW5zLm5leHQuaWQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJ7XCI6XG4gICAgICAgICAgICAgICAganNvbk9iamVjdCgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIltcIjpcbiAgICAgICAgICAgICAgICBqc29uQXJyYXkoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgIGNhc2UgXCJudWxsXCI6XG4gICAgICAgICAgICBjYXNlIFwiKG51bWJlcilcIjpcbiAgICAgICAgICAgIGNhc2UgXCIoc3RyaW5nKVwiOlxuICAgICAgICAgICAgICAgIGFkdmFuY2UoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIi1cIik7XG4gICAgICAgICAgICAgICAgYWR2YW5jZShcIihudW1iZXIpXCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBlcnJvcihcIkUwMDNcIiwgc3RhdGUudG9rZW5zLm5leHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGVzY2FwZVJlZ2V4ID0gZnVuY3Rpb24oc3RyKSB7XG4gICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvWy1cXC9cXFxcXiQqKz8uKCl8W1xcXXt9XS9nLCBcIlxcXFwkJlwiKTtcbiAgICB9O1xuXG4gICAgLy8gVGhlIGFjdHVhbCBKU0hJTlQgZnVuY3Rpb24gaXRzZWxmLlxuICAgIHZhciBpdHNlbGY6IGFueSA9IGZ1bmN0aW9uKHMsIG86IEpTSGludE9wdGlvbnMsIGcpIHtcbiAgICAgICAgdmFyIGksIGssIHgsIHJlSWdub3JlU3RyLCByZUlnbm9yZTtcbiAgICAgICAgdmFyIG9wdGlvbktleXM6IHN0cmluZ1tdO1xuICAgICAgICB2YXIgbmV3T3B0aW9uT2JqID0ge307XG4gICAgICAgIHZhciBuZXdJZ25vcmVkT2JqOiB7IFtzb21ldGhpbmc6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXG4gICAgICAgIG8gPSBjbG9uZShvKTtcbiAgICAgICAgc3RhdGUucmVzZXQoKTtcblxuICAgICAgICBpZiAobyAmJiBvLnNjb3BlKSB7XG4gICAgICAgICAgICBKU0hJTlQuc2NvcGUgPSBvLnNjb3BlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgSlNISU5ULmVycm9ycyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULnVuZGVmcyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULmludGVybmFscyA9IFtdO1xuICAgICAgICAgICAgSlNISU5ULmJsYWNrbGlzdCA9IHt9O1xuICAgICAgICAgICAgSlNISU5ULnNjb3BlID0gXCIobWFpbilcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHByZWRlZmluZWQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGVjbWFJZGVudGlmaWVyc1szXSk7XG4gICAgICAgIGNvbWJpbmUocHJlZGVmaW5lZCwgcmVzZXJ2ZWRWYXJzKTtcblxuICAgICAgICBjb21iaW5lKHByZWRlZmluZWQsIGcgfHwge30pO1xuXG4gICAgICAgIGRlY2xhcmVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgdmFyIGV4cG9ydGVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gVmFyaWFibGVzIHRoYXQgbGl2ZSBvdXRzaWRlIHRoZSBjdXJyZW50IGZpbGVcblxuICAgICAgICBpZiAobykge1xuICAgICAgICAgICAgZWFjaChvLnByZWRlZiB8fCBudWxsLCBmdW5jdGlvbihpdGVtOiBhbnkpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2xpY2UsIHByb3A7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXRlbVswXSA9PT0gXCItXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgc2xpY2UgPSBpdGVtLnNsaWNlKDEpO1xuICAgICAgICAgICAgICAgICAgICBKU0hJTlQuYmxhY2tsaXN0W3NsaWNlXSA9IHNsaWNlO1xuICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgZnJvbSBwcmVkZWZpbmVkIGlmIHRoZXJlXG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBwcmVkZWZpbmVkW3NsaWNlXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3AgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKG8ucHJlZGVmLCBpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgcHJlZGVmaW5lZFtpdGVtXSA9IHByb3AgPyBwcm9wLnZhbHVlIDogZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGVhY2goby5leHBvcnRlZCB8fCBudWxsLCBmdW5jdGlvbihpdGVtOiBzdHJpbmcpIHtcbiAgICAgICAgICAgICAgICBleHBvcnRlZFtpdGVtXSA9IHRydWU7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgZGVsZXRlIG8ucHJlZGVmO1xuICAgICAgICAgICAgZGVsZXRlIG8uZXhwb3J0ZWQ7XG5cbiAgICAgICAgICAgIG9wdGlvbktleXMgPSBPYmplY3Qua2V5cyhvKTtcbiAgICAgICAgICAgIGZvciAoeCA9IDA7IHggPCBvcHRpb25LZXlzLmxlbmd0aDsgeCsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKC9eLVdcXGR7M30kL2cudGVzdChvcHRpb25LZXlzW3hdKSkge1xuICAgICAgICAgICAgICAgICAgICBuZXdJZ25vcmVkT2JqW29wdGlvbktleXNbeF0uc2xpY2UoMSldID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3B0aW9uS2V5ID0gb3B0aW9uS2V5c1t4XTtcbiAgICAgICAgICAgICAgICAgICAgbmV3T3B0aW9uT2JqW29wdGlvbktleV0gPSBvW29wdGlvbktleV07XG4gICAgICAgICAgICAgICAgICAgIGlmICgob3B0aW9uS2V5ID09PSBcImVzdmVyc2lvblwiICYmIG9bb3B0aW9uS2V5XSA9PT0gNSkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChvcHRpb25LZXkgPT09IFwiZXM1XCIgJiYgb1tvcHRpb25LZXldKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZ0F0KFwiSTAwM1wiLCAwLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHN0YXRlLm9wdGlvbiA9IG5ld09wdGlvbk9iajtcbiAgICAgICAgc3RhdGUuaWdub3JlZCA9IG5ld0lnbm9yZWRPYmo7XG5cbiAgICAgICAgc3RhdGUub3B0aW9uLmluZGVudCA9IHN0YXRlLm9wdGlvbi5pbmRlbnQgfHwgNDtcbiAgICAgICAgc3RhdGUub3B0aW9uLm1heGVyciA9IHN0YXRlLm9wdGlvbi5tYXhlcnIgfHwgNTA7XG5cbiAgICAgICAgaW5kZW50ID0gMTtcblxuICAgICAgICB2YXIgc2NvcGVNYW5hZ2VySW5zdCA9IHNjb3BlTWFuYWdlcihzdGF0ZSwgcHJlZGVmaW5lZCwgZXhwb3J0ZWQsIGRlY2xhcmVkKTtcbiAgICAgICAgc2NvcGVNYW5hZ2VySW5zdC5vbihcIndhcm5pbmdcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIHdhcm5pbmcuYXBwbHkobnVsbCwgW2V2LmNvZGUsIGV2LnRva2VuXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzY29wZU1hbmFnZXJJbnN0Lm9uKFwiZXJyb3JcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGVycm9yLmFwcGx5KG51bGwsIFtldi5jb2RlLCBldi50b2tlbl0uY29uY2F0KGV2LmRhdGEpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3RhdGUuZnVuY3QgPSBmdW5jdG9yKFwiKGdsb2JhbClcIiwgbnVsbCwge1xuICAgICAgICAgICAgXCIoZ2xvYmFsKVwiOiB0cnVlLFxuICAgICAgICAgICAgXCIoc2NvcGUpXCI6IHNjb3BlTWFuYWdlckluc3QsXG4gICAgICAgICAgICBcIihjb21wYXJyYXkpXCI6IGFycmF5Q29tcHJlaGVuc2lvbigpLFxuICAgICAgICAgICAgXCIobWV0cmljcylcIjogY3JlYXRlTWV0cmljcyhzdGF0ZS50b2tlbnMubmV4dClcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZnVuY3Rpb25zID0gW3N0YXRlLmZ1bmN0XTtcbiAgICAgICAgdXJscyA9IFtdO1xuICAgICAgICBzdGFjayA9IG51bGw7XG4gICAgICAgIG1lbWJlciA9IHt9O1xuICAgICAgICBtZW1iZXJzT25seSA9IG51bGw7XG4gICAgICAgIGluYmxvY2sgPSBmYWxzZTtcbiAgICAgICAgbG9va2FoZWFkID0gW107XG5cbiAgICAgICAgaWYgKCFpc1N0cmluZyhzKSAmJiAhQXJyYXkuaXNBcnJheShzKSkge1xuICAgICAgICAgICAgZXJyb3JBdChcIkUwMDRcIiwgMCk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBhcGkgPSB7XG4gICAgICAgICAgICBnZXQgaXNKU09OKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5qc29uTW9kZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdldE9wdGlvbjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5vcHRpb25bbmFtZV0gfHwgbnVsbDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdldENhY2hlOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXRlLmNhY2hlW25hbWVdO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgc2V0Q2FjaGU6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuY2FjaGVbbmFtZV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHdhcm46IGZ1bmN0aW9uKGNvZGUsIGRhdGEpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nQXQuYXBwbHkobnVsbCwgW2NvZGUsIGRhdGEubGluZSwgZGF0YS5jaGFyXS5jb25jYXQoZGF0YS5kYXRhKSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBvbjogZnVuY3Rpb24obmFtZXMsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICAgICAgbmFtZXMuc3BsaXQoXCIgXCIpLmZvckVhY2goZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBlbWl0dGVyLm9uKG5hbWUsIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGVtaXR0ZXIucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG4gICAgICAgIChleHRyYU1vZHVsZXMgfHwgW10pLmZvckVhY2goZnVuY3Rpb24oZnVuYykge1xuICAgICAgICAgICAgZnVuYyhhcGkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBzdGF0ZS50b2tlbnMucHJldiA9IHN0YXRlLnRva2Vucy5jdXJyID0gc3RhdGUudG9rZW5zLm5leHQgPSBzdGF0ZS5zeW50YXhbXCIoYmVnaW4pXCJdO1xuXG4gICAgICAgIGlmIChvICYmIG8uaWdub3JlRGVsaW1pdGVycykge1xuXG4gICAgICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkoby5pZ25vcmVEZWxpbWl0ZXJzKSkge1xuICAgICAgICAgICAgICAgIG8uaWdub3JlRGVsaW1pdGVycyA9IFtvLmlnbm9yZURlbGltaXRlcnNdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvLmlnbm9yZURlbGltaXRlcnMuZm9yRWFjaChmdW5jdGlvbihkZWxpbWl0ZXJQYWlyKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFkZWxpbWl0ZXJQYWlyLnN0YXJ0IHx8ICFkZWxpbWl0ZXJQYWlyLmVuZClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgcmVJZ25vcmVTdHIgPSBlc2NhcGVSZWdleChkZWxpbWl0ZXJQYWlyLnN0YXJ0KSArXG4gICAgICAgICAgICAgICAgICAgIFwiW1xcXFxzXFxcXFNdKj9cIiArXG4gICAgICAgICAgICAgICAgICAgIGVzY2FwZVJlZ2V4KGRlbGltaXRlclBhaXIuZW5kKTtcblxuICAgICAgICAgICAgICAgIHJlSWdub3JlID0gbmV3IFJlZ0V4cChyZUlnbm9yZVN0ciwgXCJpZ1wiKTtcblxuICAgICAgICAgICAgICAgIHMgPSBzLnJlcGxhY2UocmVJZ25vcmUsIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaC5yZXBsYWNlKC8uL2csIFwiIFwiKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV4ID0gbmV3IExleGVyKHMpO1xuXG4gICAgICAgIGxleC5vbihcIndhcm5pbmdcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIHdhcm5pbmdBdC5hcHBseShudWxsLCBbZXYuY29kZSwgZXYubGluZSwgZXYuY2hhcmFjdGVyXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJlcnJvclwiLCBmdW5jdGlvbihldikge1xuICAgICAgICAgICAgZXJyb3JBdC5hcHBseShudWxsLCBbZXYuY29kZSwgZXYubGluZSwgZXYuY2hhcmFjdGVyXS5jb25jYXQoZXYuZGF0YSkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJmYXRhbFwiLCBmdW5jdGlvbihldikge1xuICAgICAgICAgICAgcXVpdChcIkUwNDFcIiwgZXYpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJJZGVudGlmaWVyXCIsIGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBlbWl0dGVyLmVtaXQoXCJJZGVudGlmaWVyXCIsIGV2KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV4Lm9uKFwiU3RyaW5nXCIsIGZ1bmN0aW9uKGV2KSB7XG4gICAgICAgICAgICBlbWl0dGVyLmVtaXQoXCJTdHJpbmdcIiwgZXYpO1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXgub24oXCJOdW1iZXJcIiwgZnVuY3Rpb24oZXYpIHtcbiAgICAgICAgICAgIGVtaXR0ZXIuZW1pdChcIk51bWJlclwiLCBldik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxleC5zdGFydCgpO1xuXG4gICAgICAgIC8vIENoZWNrIG9wdGlvbnNcbiAgICAgICAgZm9yICh2YXIgbmFtZSBpbiBvKSB7XG4gICAgICAgICAgICBpZiAoaGFzKG8sIG5hbWUpKSB7XG4gICAgICAgICAgICAgICAgY2hlY2tPcHRpb24obmFtZSwgc3RhdGUudG9rZW5zLmN1cnIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGFzc3VtZSgpO1xuXG4gICAgICAgICAgICAvLyBjb21iaW5lIHRoZSBwYXNzZWQgZ2xvYmFscyBhZnRlciB3ZSd2ZSBhc3N1bWVkIGFsbCBvdXIgb3B0aW9uc1xuICAgICAgICAgICAgY29tYmluZShwcmVkZWZpbmVkLCBnIHx8IHt9KTtcblxuICAgICAgICAgICAgLy9yZXNldCB2YWx1ZXNcbiAgICAgICAgICAgIGNvbW1hWydmaXJzdCddID0gdHJ1ZTtcblxuICAgICAgICAgICAgYWR2YW5jZSgpO1xuICAgICAgICAgICAgc3dpdGNoIChzdGF0ZS50b2tlbnMubmV4dC5pZCkge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJ7XCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIltcIjpcbiAgICAgICAgICAgICAgICAgICAgZGVzdHJ1Y3R1cmluZ0Fzc2lnbk9ySnNvblZhbHVlKCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGRpcmVjdGl2ZXMoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUuZGlyZWN0aXZlW1widXNlIHN0cmljdFwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5zdHJpY3QgIT09IFwiZ2xvYmFsXCIgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAhKChzdGF0ZS5vcHRpb24uc3RyaWN0ID09PSB0cnVlIHx8ICFzdGF0ZS5vcHRpb24uc3RyaWN0KSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoc3RhdGUub3B0aW9uLmdsb2JhbHN0cmljdCB8fCBzdGF0ZS5vcHRpb24ubW9kdWxlIHx8IHN0YXRlLm9wdGlvbi5ub2RlIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5vcHRpb24ucGhhbnRvbSB8fCBzdGF0ZS5vcHRpb24uYnJvd3NlcmlmeSkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwOTdcIiwgc3RhdGUudG9rZW5zLnByZXYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc3RhdGVtZW50cygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoc3RhdGUudG9rZW5zLm5leHQuaWQgIT09IFwiKGVuZClcIikge1xuICAgICAgICAgICAgICAgIHF1aXQoXCJFMDQxXCIsIHN0YXRlLnRva2Vucy5jdXJyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLnVuc3RhY2soKTtcblxuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIgJiYgZXJyLm5hbWUgPT09IFwiSlNIaW50RXJyb3JcIikge1xuICAgICAgICAgICAgICAgIHZhciBudCA9IHN0YXRlLnRva2Vucy5uZXh0IHx8IHt9O1xuICAgICAgICAgICAgICAgIEpTSElOVC5lcnJvcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHNjb3BlOiBcIihtYWluKVwiLFxuICAgICAgICAgICAgICAgICAgICByYXc6IGVyci5yYXcsXG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IGVyci5jb2RlLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IGVyci5yZWFzb24sXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IGVyci5saW5lIHx8IG50LmxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogZXJyLmNoYXJhY3RlciB8fCBudC5mcm9tXG4gICAgICAgICAgICAgICAgfSwgbnVsbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIExvb3Agb3ZlciB0aGUgbGlzdGVkIFwiaW50ZXJuYWxzXCIsIGFuZCBjaGVjayB0aGVtIGFzIHdlbGwuXG5cbiAgICAgICAgaWYgKEpTSElOVC5zY29wZSA9PT0gXCIobWFpbilcIikge1xuICAgICAgICAgICAgbyA9IG8gfHwge307XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBKU0hJTlQuaW50ZXJuYWxzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgayA9IEpTSElOVC5pbnRlcm5hbHNbaV07XG4gICAgICAgICAgICAgICAgby5zY29wZSA9IGsuZWxlbTtcbiAgICAgICAgICAgICAgICBpdHNlbGYoay52YWx1ZSwgbywgZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gSlNISU5ULmVycm9ycy5sZW5ndGggPT09IDA7XG4gICAgfTtcblxuICAgIC8vIE1vZHVsZXMuXG4gICAgaXRzZWxmLmFkZE1vZHVsZSA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAgICAgZXh0cmFNb2R1bGVzLnB1c2goZnVuYyk7XG4gICAgfTtcblxuICAgIGl0c2VsZi5hZGRNb2R1bGUocmVnaXN0ZXIpO1xuXG4gICAgLy8gRGF0YSBzdW1tYXJ5LlxuICAgIGl0c2VsZi5kYXRhID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBkYXRhOiB7XG4gICAgICAgICAgICBlcnJvcnM/O1xuICAgICAgICAgICAgZnVuY3Rpb25zOiBhbnlbXTtcbiAgICAgICAgICAgIGdsb2JhbHM/O1xuICAgICAgICAgICAgaW1wbGllZHM/O1xuICAgICAgICAgICAganNvbj86IGJvb2xlYW47XG4gICAgICAgICAgICBtZW1iZXI/O1xuICAgICAgICAgICAgb3B0aW9ucz87XG4gICAgICAgICAgICB1bnVzZWQ/O1xuICAgICAgICAgICAgdXJscz87XG4gICAgICAgIH0gPSB7XG4gICAgICAgICAgICAgICAgZnVuY3Rpb25zOiBbXSxcbiAgICAgICAgICAgICAgICBvcHRpb25zOiBzdGF0ZS5vcHRpb25cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdmFyIGZ1LCBmLCBpLCBqLCBuLCBnbG9iYWxzO1xuXG4gICAgICAgIGlmIChpdHNlbGYuZXJyb3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgZGF0YS5lcnJvcnMgPSBpdHNlbGYuZXJyb3JzO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLmpzb25Nb2RlKSB7XG4gICAgICAgICAgICBkYXRhLmpzb24gPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGltcGxpZWRHbG9iYWxzID0gc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmdldEltcGxpZWRHbG9iYWxzKCk7XG4gICAgICAgIGlmIChpbXBsaWVkR2xvYmFscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBkYXRhLmltcGxpZWRzID0gaW1wbGllZEdsb2JhbHM7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodXJscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBkYXRhLnVybHMgPSB1cmxzO1xuICAgICAgICB9XG5cbiAgICAgICAgZ2xvYmFscyA9IHN0YXRlLmZ1bmN0W1wiKHNjb3BlKVwiXS5nZXRVc2VkT3JEZWZpbmVkR2xvYmFscygpO1xuICAgICAgICBpZiAoZ2xvYmFscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBkYXRhLmdsb2JhbHMgPSBnbG9iYWxzO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGZ1bmN0aW9ucy5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgZiA9IGZ1bmN0aW9uc1tpXTtcbiAgICAgICAgICAgIGZ1ID0ge307XG5cbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCBmdW5jdGlvbmljaXR5Lmxlbmd0aDsgaiArPSAxKSB7XG4gICAgICAgICAgICAgICAgZnVbZnVuY3Rpb25pY2l0eVtqXV0gPSBbXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGZ1bmN0aW9uaWNpdHkubGVuZ3RoOyBqICs9IDEpIHtcbiAgICAgICAgICAgICAgICBpZiAoZnVbZnVuY3Rpb25pY2l0eVtqXV0ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBmdVtmdW5jdGlvbmljaXR5W2pdXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1Lm5hbWUgPSBmW1wiKG5hbWUpXCJdO1xuICAgICAgICAgICAgZnUucGFyYW0gPSBmW1wiKHBhcmFtcylcIl07XG4gICAgICAgICAgICBmdS5saW5lID0gZltcIihsaW5lKVwiXTtcbiAgICAgICAgICAgIGZ1LmNoYXJhY3RlciA9IGZbXCIoY2hhcmFjdGVyKVwiXTtcbiAgICAgICAgICAgIGZ1Lmxhc3QgPSBmW1wiKGxhc3QpXCJdO1xuICAgICAgICAgICAgZnUubGFzdGNoYXJhY3RlciA9IGZbXCIobGFzdGNoYXJhY3RlcilcIl07XG5cbiAgICAgICAgICAgIGZ1Lm1ldHJpY3MgPSB7XG4gICAgICAgICAgICAgICAgY29tcGxleGl0eTogZltcIihtZXRyaWNzKVwiXS5Db21wbGV4aXR5Q291bnQsXG4gICAgICAgICAgICAgICAgcGFyYW1ldGVyczogZltcIihtZXRyaWNzKVwiXS5hcml0eSxcbiAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBmW1wiKG1ldHJpY3MpXCJdLnN0YXRlbWVudENvdW50XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBkYXRhLmZ1bmN0aW9ucy5wdXNoKGZ1KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB1bnVzZWRzID0gc3RhdGUuZnVuY3RbXCIoc2NvcGUpXCJdLmdldFVudXNlZHMoKTtcbiAgICAgICAgaWYgKHVudXNlZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgZGF0YS51bnVzZWQgPSB1bnVzZWRzO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChuIGluIG1lbWJlcikge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtZW1iZXJbbl0gPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICBkYXRhLm1lbWJlciA9IG1lbWJlcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH07XG5cbiAgICBpdHNlbGYuanNoaW50ID0gaXRzZWxmO1xuXG4gICAgcmV0dXJuIGl0c2VsZjtcbn0gKCkpO1xuIl19