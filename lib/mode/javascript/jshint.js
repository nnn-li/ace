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