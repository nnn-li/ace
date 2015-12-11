"use strict";
import EventEmitter from "./EventEmitter";
import { fallsThrough, maxlenException, unsafeChars } from "./reg";
import { state } from "./state";
import { asciiIdentifierStartTable } from "./ascii-identifier-data";
import { asciiIdentifierPartTable } from "./ascii-identifier-data";
import { nonAsciiIdentifierStartTable } from "./non-ascii-identifier-start";
import { nonAsciiIdentifierPartTable } from "./non-ascii-identifier-part-only";
function some(xs, callback) {
    for (var i = 0, iLength = xs.length; i < iLength; i++) {
        if (callback(xs[i])) {
            return true;
        }
    }
    return false;
}
var Token = {
    Identifier: 1,
    Punctuator: 2,
    NumericLiteral: 3,
    StringLiteral: 4,
    Comment: 5,
    Keyword: 6,
    NullLiteral: 7,
    BooleanLiteral: 8,
    RegExp: 9,
    TemplateHead: 10,
    TemplateMiddle: 11,
    TemplateTail: 12,
    NoSubstTemplate: 13
};
export var Context = {
    Block: 1,
    Template: 2
};
function asyncTrigger() {
    var _checks = [];
    return {
        push: function (fn) {
            _checks.push(fn);
        },
        check: function () {
            for (var check = 0; check < _checks.length; ++check) {
                _checks[check]();
            }
            _checks.splice(0, _checks.length);
        }
    };
}
export default class Lexer {
    constructor(source) {
        this._lines = [];
        var lines = source;
        if (typeof lines === "string") {
            lines = lines
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n")
                .split("\n");
        }
        if (lines[0] && lines[0].substr(0, 2) === "#!") {
            if (lines[0].indexOf("node") !== -1) {
                state.option.node = true;
            }
            lines[0] = "";
        }
        this.emitter = new EventEmitter();
        this.source = source;
        this.setLines(lines);
        this.prereg = true;
        this.line = 0;
        this.char = 1;
        this.from = 1;
        this.input = "";
        this.inComment = false;
        this.context = [];
        this.templateStarts = [];
        for (var i = 0; i < state.option.indent; i += 1) {
            state.tab += " ";
        }
    }
    inContext(ctxType) {
        return this.context.length > 0 && this.context[this.context.length - 1].type === ctxType;
    }
    pushContext(ctxType) {
        this.context.push({ type: ctxType });
    }
    popContext() {
        return this.context.pop();
    }
    isContext(context) {
        return this.context.length > 0 && this.context[this.context.length - 1] === context;
    }
    currentContext() {
        return this.context.length > 0 && this.context[this.context.length - 1];
    }
    getLines() {
        this._lines = state.lines;
        return this._lines;
    }
    setLines(val) {
        this._lines = val;
        state.lines = this._lines;
    }
    peek(i) {
        return this.input.charAt(i || 0);
    }
    skip(i) {
        i = i || 1;
        this.char += i;
        this.input = this.input.slice(i);
    }
    on(names, listener) {
        names.split(" ").forEach(function (name) {
            this.emitter.on(name, listener);
        }.bind(this));
    }
    trigger(unused0, unused1) {
        this.emitter.emit.apply(this.emitter, Array.prototype.slice.call(arguments));
    }
    triggerAsync(type, args, checks, fn) {
        checks.push(function () {
            if (fn()) {
                this.trigger(type, args);
            }
        }.bind(this));
    }
    scanPunctuator() {
        var ch1 = this.peek();
        var ch2, ch3, ch4;
        switch (ch1) {
            case ".":
                if ((/^[0-9]$/).test(this.peek(1))) {
                    return null;
                }
                if (this.peek(1) === "." && this.peek(2) === ".") {
                    return {
                        type: Token.Punctuator,
                        value: "..."
                    };
                }
            case "(":
            case ")":
            case ";":
            case ",":
            case "[":
            case "]":
            case ":":
            case "~":
            case "?":
                return {
                    type: Token.Punctuator,
                    value: ch1
                };
            case "{":
                this.pushContext(Context.Block);
                return {
                    type: Token.Punctuator,
                    value: ch1
                };
            case "}":
                if (this.inContext(Context.Block)) {
                    this.popContext();
                }
                return {
                    type: Token.Punctuator,
                    value: ch1
                };
            case "#":
                return {
                    type: Token.Punctuator,
                    value: ch1
                };
            case "":
                return null;
        }
        ch2 = this.peek(1);
        ch3 = this.peek(2);
        ch4 = this.peek(3);
        if (ch1 === ">" && ch2 === ">" && ch3 === ">" && ch4 === "=") {
            return {
                type: Token.Punctuator,
                value: ">>>="
            };
        }
        if (ch1 === "=" && ch2 === "=" && ch3 === "=") {
            return {
                type: Token.Punctuator,
                value: "==="
            };
        }
        if (ch1 === "!" && ch2 === "=" && ch3 === "=") {
            return {
                type: Token.Punctuator,
                value: "!=="
            };
        }
        if (ch1 === ">" && ch2 === ">" && ch3 === ">") {
            return {
                type: Token.Punctuator,
                value: ">>>"
            };
        }
        if (ch1 === "<" && ch2 === "<" && ch3 === "=") {
            return {
                type: Token.Punctuator,
                value: "<<="
            };
        }
        if (ch1 === ">" && ch2 === ">" && ch3 === "=") {
            return {
                type: Token.Punctuator,
                value: ">>="
            };
        }
        if (ch1 === "=" && ch2 === ">") {
            return {
                type: Token.Punctuator,
                value: ch1 + ch2
            };
        }
        if (ch1 === ch2 && ("+-<>&|".indexOf(ch1) >= 0)) {
            return {
                type: Token.Punctuator,
                value: ch1 + ch2
            };
        }
        if ("<>=!+-*%&|^/".indexOf(ch1) >= 0) {
            if (ch2 === "=") {
                return {
                    type: Token.Punctuator,
                    value: ch1 + ch2
                };
            }
            return {
                type: Token.Punctuator,
                value: ch1
            };
        }
        return null;
    }
    scanComments() {
        var ch1 = this.peek();
        var ch2 = this.peek(1);
        var rest = this.input.substr(2);
        var startLine = this.line;
        var startChar = this.char;
        var self = this;
        function commentToken(label, body, opt) {
            var special = ["jshint", "jslint", "members", "member", "globals", "global", "exported"];
            var isSpecial = false;
            var value = label + body;
            var commentType = "plain";
            opt = opt || {};
            if (opt.isMultiline) {
                value += "*/";
            }
            body = body.replace(/\n/g, " ");
            if (label === "/*" && fallsThrough.test(body)) {
                isSpecial = true;
                commentType = "falls through";
            }
            special.forEach(function (str) {
                if (isSpecial) {
                    return;
                }
                if (label === "//" && str !== "jshint") {
                    return;
                }
                if (body.charAt(str.length) === " " && body.substr(0, str.length) === str) {
                    isSpecial = true;
                    label = label + str;
                    body = body.substr(str.length);
                }
                if (!isSpecial && body.charAt(0) === " " && body.charAt(str.length + 1) === " " &&
                    body.substr(1, str.length) === str) {
                    isSpecial = true;
                    label = label + " " + str;
                    body = body.substr(str.length + 1);
                }
                if (!isSpecial) {
                    return;
                }
                switch (str) {
                    case "member":
                        commentType = "members";
                        break;
                    case "global":
                        commentType = "globals";
                        break;
                    default:
                        var options = body.split(":").map(function (v) {
                            return v.replace(/^\s+/, "").replace(/\s+$/, "");
                        });
                        if (options.length === 2) {
                            switch (options[0]) {
                                case "ignore":
                                    switch (options[1]) {
                                        case "start":
                                            self.ignoringLinterErrors = true;
                                            isSpecial = false;
                                            break;
                                        case "end":
                                            self.ignoringLinterErrors = false;
                                            isSpecial = false;
                                            break;
                                    }
                            }
                        }
                        commentType = str;
                }
            });
            return {
                type: Token.Comment,
                commentType: commentType,
                value: value,
                body: body,
                isSpecial: isSpecial,
                isMultiline: opt.isMultiline || false,
                isMalformed: opt.isMalformed || false
            };
        }
        if (ch1 === "*" && ch2 === "/") {
            this.trigger("error", {
                code: "E018",
                line: startLine,
                character: startChar
            });
            this.skip(2);
            return null;
        }
        if (ch1 !== "/" || (ch2 !== "*" && ch2 !== "/")) {
            return null;
        }
        if (ch2 === "/") {
            this.skip(this.input.length);
            return commentToken("//", rest);
        }
        var body = "";
        if (ch2 === "*") {
            this.inComment = true;
            this.skip(2);
            while (this.peek() !== "*" || this.peek(1) !== "/") {
                if (this.peek() === "") {
                    body += "\n";
                    if (!this.nextLine()) {
                        this.trigger("error", {
                            code: "E017",
                            line: startLine,
                            character: startChar
                        });
                        this.inComment = false;
                        return commentToken("/*", body, {
                            isMultiline: true,
                            isMalformed: true
                        });
                    }
                }
                else {
                    body += this.peek();
                    this.skip();
                }
            }
            this.skip(2);
            this.inComment = false;
            return commentToken("/*", body, { isMultiline: true });
        }
    }
    scanKeyword() {
        var result = /^[a-zA-Z_$][a-zA-Z0-9_$]*/.exec(this.input);
        var keywords = [
            "if", "in", "do", "var", "for", "new",
            "try", "let", "this", "else", "case",
            "void", "with", "enum", "while", "break",
            "catch", "throw", "const", "yield", "class",
            "super", "return", "typeof", "delete",
            "switch", "export", "import", "default",
            "finally", "extends", "function", "continue",
            "debugger", "instanceof"
        ];
        if (result && keywords.indexOf(result[0]) >= 0) {
            return {
                type: Token.Keyword,
                value: result[0]
            };
        }
        return null;
    }
    scanIdentifier() {
        var id = "";
        var index = 0;
        var type, char;
        function isNonAsciiIdentifierStart(code) {
            return nonAsciiIdentifierStartTable.indexOf(code) > -1;
        }
        function isNonAsciiIdentifierPart(code) {
            return isNonAsciiIdentifierStart(code) || nonAsciiIdentifierPartTable.indexOf(code) > -1;
        }
        function isHexDigit(str) {
            return (/^[0-9a-fA-F]$/).test(str);
        }
        var readUnicodeEscapeSequence = function () {
            index += 1;
            if (this.peek(index) !== "u") {
                return null;
            }
            var ch1 = this.peek(index + 1);
            var ch2 = this.peek(index + 2);
            var ch3 = this.peek(index + 3);
            var ch4 = this.peek(index + 4);
            var code;
            if (isHexDigit(ch1) && isHexDigit(ch2) && isHexDigit(ch3) && isHexDigit(ch4)) {
                code = parseInt(ch1 + ch2 + ch3 + ch4, 16);
                if (asciiIdentifierPartTable[code] || isNonAsciiIdentifierPart(code)) {
                    index += 5;
                    return "\\u" + ch1 + ch2 + ch3 + ch4;
                }
                return null;
            }
            return null;
        }.bind(this);
        var getIdentifierStart = function () {
            var chr = this.peek(index);
            var code = chr.charCodeAt(0);
            if (code === 92) {
                return readUnicodeEscapeSequence();
            }
            if (code < 128) {
                if (asciiIdentifierStartTable[code]) {
                    index += 1;
                    return chr;
                }
                return null;
            }
            if (isNonAsciiIdentifierStart(code)) {
                index += 1;
                return chr;
            }
            return null;
        }.bind(this);
        var getIdentifierPart = function () {
            var chr = this.peek(index);
            var code = chr.charCodeAt(0);
            if (code === 92) {
                return readUnicodeEscapeSequence();
            }
            if (code < 128) {
                if (asciiIdentifierPartTable[code]) {
                    index += 1;
                    return chr;
                }
                return null;
            }
            if (isNonAsciiIdentifierPart(code)) {
                index += 1;
                return chr;
            }
            return null;
        }.bind(this);
        function removeEscapeSequences(id) {
            return id.replace(/\\u([0-9a-fA-F]{4})/g, function (m0, codepoint) {
                return String.fromCharCode(parseInt(codepoint, 16));
            });
        }
        char = getIdentifierStart();
        if (char === null) {
            return null;
        }
        id = char;
        for (;;) {
            char = getIdentifierPart();
            if (char === null) {
                break;
            }
            id += char;
        }
        switch (id) {
            case "true":
            case "false":
                type = Token.BooleanLiteral;
                break;
            case "null":
                type = Token.NullLiteral;
                break;
            default:
                type = Token.Identifier;
        }
        return {
            type: type,
            value: removeEscapeSequences(id),
            text: id,
            tokenLength: id.length
        };
    }
    scanNumericLiteral() {
        var index = 0;
        var value = "";
        var length = this.input.length;
        var char = this.peek(index);
        var bad;
        var isAllowedDigit = isDecimalDigit;
        var base = 10;
        var isLegacy = false;
        function isDecimalDigit(str) {
            return (/^[0-9]$/).test(str);
        }
        function isOctalDigit(str) {
            return (/^[0-7]$/).test(str);
        }
        function isBinaryDigit(str) {
            return (/^[01]$/).test(str);
        }
        function isHexDigit(str) {
            return (/^[0-9a-fA-F]$/).test(str);
        }
        function isIdentifierStart(ch) {
            return (ch === "$") || (ch === "_") || (ch === "\\") ||
                (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
        }
        if (char !== "." && !isDecimalDigit(char)) {
            return null;
        }
        if (char !== ".") {
            value = this.peek(index);
            index += 1;
            char = this.peek(index);
            if (value === "0") {
                if (char === "x" || char === "X") {
                    isAllowedDigit = isHexDigit;
                    base = 16;
                    index += 1;
                    value += char;
                }
                if (char === "o" || char === "O") {
                    isAllowedDigit = isOctalDigit;
                    base = 8;
                    if (!state.inES6(true)) {
                        this.trigger("warning", {
                            code: "W119",
                            line: this.line,
                            character: this.char,
                            data: ["Octal integer literal", "6"]
                        });
                    }
                    index += 1;
                    value += char;
                }
                if (char === "b" || char === "B") {
                    isAllowedDigit = isBinaryDigit;
                    base = 2;
                    if (!state.inES6(true)) {
                        this.trigger("warning", {
                            code: "W119",
                            line: this.line,
                            character: this.char,
                            data: ["Binary integer literal", "6"]
                        });
                    }
                    index += 1;
                    value += char;
                }
                if (isOctalDigit(char)) {
                    isAllowedDigit = isOctalDigit;
                    base = 8;
                    isLegacy = true;
                    bad = false;
                    index += 1;
                    value += char;
                }
                if (!isOctalDigit(char) && isDecimalDigit(char)) {
                    index += 1;
                    value += char;
                }
            }
            while (index < length) {
                char = this.peek(index);
                if (isLegacy && isDecimalDigit(char)) {
                    bad = true;
                }
                else if (!isAllowedDigit(char)) {
                    break;
                }
                value += char;
                index += 1;
            }
            if (isAllowedDigit !== isDecimalDigit) {
                if (!isLegacy && value.length <= 2) {
                    return {
                        type: Token.NumericLiteral,
                        value: value,
                        isMalformed: true
                    };
                }
                if (index < length) {
                    char = this.peek(index);
                    if (isIdentifierStart(char)) {
                        return null;
                    }
                }
                return {
                    type: Token.NumericLiteral,
                    value: value,
                    base: base,
                    isLegacy: isLegacy,
                    isMalformed: false
                };
            }
        }
        if (char === ".") {
            value += char;
            index += 1;
            while (index < length) {
                char = this.peek(index);
                if (!isDecimalDigit(char)) {
                    break;
                }
                value += char;
                index += 1;
            }
        }
        if (char === "e" || char === "E") {
            value += char;
            index += 1;
            char = this.peek(index);
            if (char === "+" || char === "-") {
                value += this.peek(index);
                index += 1;
            }
            char = this.peek(index);
            if (isDecimalDigit(char)) {
                value += char;
                index += 1;
                while (index < length) {
                    char = this.peek(index);
                    if (!isDecimalDigit(char)) {
                        break;
                    }
                    value += char;
                    index += 1;
                }
            }
            else {
                return null;
            }
        }
        if (index < length) {
            char = this.peek(index);
            if (isIdentifierStart(char)) {
                return null;
            }
        }
        return {
            type: Token.NumericLiteral,
            value: value,
            base: base,
            isMalformed: !isFinite(parseFloat(value))
        };
    }
    scanEscapeSequence(checks) {
        var allowNewLine = false;
        var jump = 1;
        this.skip();
        var char = this.peek();
        switch (char) {
            case "'":
                this.triggerAsync("warning", {
                    code: "W114",
                    line: this.line,
                    character: this.char,
                    data: ["\\'"]
                }, checks, function () { return state.jsonMode; });
                break;
            case "b":
                char = "\\b";
                break;
            case "f":
                char = "\\f";
                break;
            case "n":
                char = "\\n";
                break;
            case "r":
                char = "\\r";
                break;
            case "t":
                char = "\\t";
                break;
            case "0":
                char = "\\0";
                var n = parseInt(this.peek(1), 10);
                this.triggerAsync("warning", {
                    code: "W115",
                    line: this.line,
                    character: this.char
                }, checks, function () { return n >= 0 && n <= 7 && state.isStrict(); });
                break;
            case "u":
                var hexCode = this.input.substr(1, 4);
                var code = parseInt(hexCode, 16);
                if (isNaN(code)) {
                    this.trigger("warning", {
                        code: "W052",
                        line: this.line,
                        character: this.char,
                        data: ["u" + hexCode]
                    });
                }
                char = String.fromCharCode(code);
                jump = 5;
                break;
            case "v":
                this.triggerAsync("warning", {
                    code: "W114",
                    line: this.line,
                    character: this.char,
                    data: ["\\v"]
                }, checks, function () { return state.jsonMode; });
                char = "\v";
                break;
            case "x":
                var x = parseInt(this.input.substr(1, 2), 16);
                this.triggerAsync("warning", {
                    code: "W114",
                    line: this.line,
                    character: this.char,
                    data: ["\\x-"]
                }, checks, function () { return state.jsonMode; });
                char = String.fromCharCode(x);
                jump = 3;
                break;
            case "\\":
                char = "\\\\";
                break;
            case "\"":
                char = "\\\"";
                break;
            case "/":
                break;
            case "":
                allowNewLine = true;
                char = "";
                break;
        }
        return { char: char, jump: jump, allowNewLine: allowNewLine };
    }
    scanTemplateLiteral(checks) {
        var tokenType;
        var value = "";
        var ch;
        var startLine = this.line;
        var startChar = this.char;
        var depth = this.templateStarts.length;
        if (this.peek() === "`") {
            if (!state.inES6(true)) {
                this.trigger("warning", {
                    code: "W119",
                    line: this.line,
                    character: this.char,
                    data: ["template literal syntax", "6"]
                });
            }
            tokenType = Token.TemplateHead;
            this.templateStarts.push({ line: this.line, char: this.char });
            depth = this.templateStarts.length;
            this.skip(1);
            this.pushContext(Context.Template);
        }
        else if (this.inContext(Context.Template) && this.peek() === "}") {
            tokenType = Token.TemplateMiddle;
        }
        else {
            return null;
        }
        while (this.peek() !== "`") {
            while ((ch = this.peek()) === "") {
                value += "\n";
                if (!this.nextLine()) {
                    var startPos = this.templateStarts.pop();
                    this.trigger("error", {
                        code: "E052",
                        line: startPos.line,
                        character: startPos.char
                    });
                    return {
                        type: tokenType,
                        value: value,
                        startLine: startLine,
                        startChar: startChar,
                        isUnclosed: true,
                        depth: depth,
                        context: this.popContext()
                    };
                }
            }
            if (ch === '$' && this.peek(1) === '{') {
                value += '${';
                this.skip(2);
                return {
                    type: tokenType,
                    value: value,
                    startLine: startLine,
                    startChar: startChar,
                    isUnclosed: false,
                    depth: depth,
                    context: this.currentContext()
                };
            }
            else if (ch === '\\') {
                var escape = this.scanEscapeSequence(checks);
                value += escape.char;
                this.skip(escape.jump);
            }
            else if (ch !== '`') {
                value += ch;
                this.skip(1);
            }
        }
        tokenType = tokenType === Token.TemplateHead ? Token.NoSubstTemplate : Token.TemplateTail;
        this.skip(1);
        this.templateStarts.pop();
        return {
            type: tokenType,
            value: value,
            startLine: startLine,
            startChar: startChar,
            isUnclosed: false,
            depth: depth,
            context: this.popContext()
        };
    }
    scanStringLiteral(checks) {
        var quote = this.peek();
        if (quote !== "\"" && quote !== "'") {
            return null;
        }
        this.triggerAsync("warning", {
            code: "W108",
            line: this.line,
            character: this.char
        }, checks, function () { return state.jsonMode && quote !== "\""; });
        var value = "";
        var startLine = this.line;
        var startChar = this.char;
        var allowNewLine = false;
        this.skip();
        while (this.peek() !== quote) {
            if (this.peek() === "") {
                if (!allowNewLine) {
                    this.trigger("warning", {
                        code: "W112",
                        line: this.line,
                        character: this.char
                    });
                }
                else {
                    allowNewLine = false;
                    this.triggerAsync("warning", {
                        code: "W043",
                        line: this.line,
                        character: this.char
                    }, checks, function () { return !state.option.multistr; });
                    this.triggerAsync("warning", {
                        code: "W042",
                        line: this.line,
                        character: this.char
                    }, checks, function () { return state.jsonMode && state.option.multistr; });
                }
                if (!this.nextLine()) {
                    this.trigger("error", {
                        code: "E029",
                        line: startLine,
                        character: startChar
                    });
                    return {
                        type: Token.StringLiteral,
                        value: value,
                        startLine: startLine,
                        startChar: startChar,
                        isUnclosed: true,
                        quote: quote
                    };
                }
            }
            else {
                allowNewLine = false;
                var char = this.peek();
                var jump = 1;
                if (char < " ") {
                    this.trigger("warning", {
                        code: "W113",
                        line: this.line,
                        character: this.char,
                        data: ["<non-printable>"]
                    });
                }
                if (char === "\\") {
                    var parsed = this.scanEscapeSequence(checks);
                    char = parsed.char;
                    jump = parsed.jump;
                    allowNewLine = parsed.allowNewLine;
                }
                value += char;
                this.skip(jump);
            }
        }
        this.skip();
        return {
            type: Token.StringLiteral,
            value: value,
            startLine: startLine,
            startChar: startChar,
            isUnclosed: false,
            quote: quote
        };
    }
    scanRegExp() {
        var index = 0;
        var length = this.input.length;
        var char = this.peek();
        var value = char;
        var body = "";
        var flags = [];
        var malformed = false;
        var isCharSet = false;
        var terminated;
        var scanUnexpectedChars = function () {
            if (char < " ") {
                malformed = true;
                this.trigger("warning", {
                    code: "W048",
                    line: this.line,
                    character: this.char
                });
            }
            if (char === "<") {
                malformed = true;
                this.trigger("warning", {
                    code: "W049",
                    line: this.line,
                    character: this.char,
                    data: [char]
                });
            }
        }.bind(this);
        if (!this.prereg || char !== "/") {
            return null;
        }
        index += 1;
        terminated = false;
        while (index < length) {
            char = this.peek(index);
            value += char;
            body += char;
            if (isCharSet) {
                if (char === "]") {
                    if (this.peek(index - 1) !== "\\" || this.peek(index - 2) === "\\") {
                        isCharSet = false;
                    }
                }
                if (char === "\\") {
                    index += 1;
                    char = this.peek(index);
                    body += char;
                    value += char;
                    scanUnexpectedChars();
                }
                index += 1;
                continue;
            }
            if (char === "\\") {
                index += 1;
                char = this.peek(index);
                body += char;
                value += char;
                scanUnexpectedChars();
                if (char === "/") {
                    index += 1;
                    continue;
                }
                if (char === "[") {
                    index += 1;
                    continue;
                }
            }
            if (char === "[") {
                isCharSet = true;
                index += 1;
                continue;
            }
            if (char === "/") {
                body = body.substr(0, body.length - 1);
                terminated = true;
                index += 1;
                break;
            }
            index += 1;
        }
        if (!terminated) {
            this.trigger("error", {
                code: "E015",
                line: this.line,
                character: this.from
            });
            return void this.trigger("fatal", {
                line: this.line,
                from: this.from
            });
        }
        while (index < length) {
            char = this.peek(index);
            if (!/[gim]/.test(char)) {
                break;
            }
            flags.push(char);
            value += char;
            index += 1;
        }
        try {
            new RegExp(body, flags.join(""));
        }
        catch (err) {
            malformed = true;
            this.trigger("error", {
                code: "E016",
                line: this.line,
                character: this.char,
                data: [err.message]
            });
        }
        return {
            type: Token.RegExp,
            value: value,
            flags: flags,
            isMalformed: malformed
        };
    }
    scanNonBreakingSpaces() {
        return state.option.nonbsp ?
            this.input.search(/(\u00A0)/) : -1;
    }
    scanUnsafeChars() {
        return this.input.search(unsafeChars);
    }
    next(checks) {
        this.from = this.char;
        while (/\s/.test(this.peek())) {
            this.from += 1;
            this.skip();
        }
        var match = this.scanComments() ||
            this.scanStringLiteral(checks) ||
            this.scanTemplateLiteral(checks);
        if (match) {
            return match;
        }
        match =
            this.scanRegExp() ||
                this.scanPunctuator() ||
                this.scanKeyword() ||
                this.scanIdentifier() ||
                this.scanNumericLiteral();
        if (match) {
            this.skip(match['tokenLength'] || match.value.length);
            return match;
        }
        return null;
    }
    nextLine() {
        var char;
        if (this.line >= this.getLines().length) {
            return false;
        }
        this.input = this.getLines()[this.line];
        this.line += 1;
        this.char = 1;
        this.from = 1;
        var inputTrimmed = this.input.trim();
        var startsWith = function (unused0, unused1) {
            return some(arguments, function (prefix) {
                return inputTrimmed.indexOf(prefix) === 0;
            });
        };
        var endsWith = function (unused) {
            return some(arguments, function (suffix) {
                return inputTrimmed.indexOf(suffix, inputTrimmed.length - suffix.length) !== -1;
            });
        };
        if (this.ignoringLinterErrors === true) {
            if (!startsWith("/*", "//") && !(this.inComment && endsWith("*/"))) {
                this.input = "";
            }
        }
        char = this.scanNonBreakingSpaces();
        if (char >= 0) {
            this.trigger("warning", { code: "W125", line: this.line, character: char + 1 });
        }
        this.input = this.input.replace(/\t/g, state.tab);
        char = this.scanUnsafeChars();
        if (char >= 0) {
            this.trigger("warning", { code: "W100", line: this.line, character: char });
        }
        if (!this.ignoringLinterErrors && state.option.maxlen &&
            state.option.maxlen < this.input.length) {
            var inComment = this.inComment ||
                startsWith.call(inputTrimmed, "//") ||
                startsWith.call(inputTrimmed, "/*");
            var shouldTriggerError = !inComment || !maxlenException.test(inputTrimmed);
            if (shouldTriggerError) {
                this.trigger("warning", { code: "W101", line: this.line, character: this.input.length });
            }
        }
        return true;
    }
    start() {
        this.nextLine();
    }
    token() {
        var checks = asyncTrigger();
        var token;
        function isReserved(token, isProperty) {
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
                if (isProperty) {
                    return false;
                }
            }
            return true;
        }
        var create = function (type, value, isProperty, token) {
            var obj;
            if (type !== "(endline)" && type !== "(end)") {
                this.prereg = false;
            }
            if (type === "(punctuator)") {
                switch (value) {
                    case ".":
                    case ")":
                    case "~":
                    case "#":
                    case "]":
                    case "++":
                    case "--":
                        this.prereg = false;
                        break;
                    default:
                        this.prereg = true;
                }
                obj = Object.create(state.syntax[value] || state.syntax["(error)"]);
            }
            if (type === "(identifier)") {
                if (value === "return" || value === "case" || value === "typeof") {
                    this.prereg = true;
                }
                if (state.syntax[value]) {
                    obj = Object.create(state.syntax[value] || state.syntax["(error)"]);
                    if (!isReserved(obj, isProperty && type === "(identifier)")) {
                        obj = null;
                    }
                }
            }
            if (!obj) {
                obj = Object.create(state.syntax[type]);
            }
            obj.identifier = (type === "(identifier)");
            obj.type = obj.type || type;
            obj.value = value;
            obj.line = this.line;
            obj.character = this.char;
            obj.from = this.from;
            if (obj.identifier && token)
                obj.raw_text = token.text || token.value;
            if (token && token.startLine && token.startLine !== this.line) {
                obj.startLine = token.startLine;
            }
            if (token && token.context) {
                obj.context = token.context;
            }
            if (token && token.depth) {
                obj.depth = token.depth;
            }
            if (token && token.isUnclosed) {
                obj.isUnclosed = token.isUnclosed;
            }
            if (isProperty && obj.identifier) {
                obj.isProperty = isProperty;
            }
            obj.check = checks.check;
            return obj;
        }.bind(this);
        for (;;) {
            if (!this.input.length) {
                if (this.nextLine()) {
                    return create("(endline)", "");
                }
                if (this.exhausted) {
                    return null;
                }
                this.exhausted = true;
                return create("(end)", "");
            }
            token = this.next(checks);
            if (!token) {
                if (this.input.length) {
                    this.trigger("error", {
                        code: "E024",
                        line: this.line,
                        character: this.char,
                        data: [this.peek()]
                    });
                    this.input = "";
                }
                continue;
            }
            switch (token.type) {
                case Token.StringLiteral:
                    this.triggerAsync("String", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        startLine: token.startLine,
                        startChar: token.startChar,
                        value: token.value,
                        quote: token.quote
                    }, checks, function () { return true; });
                    return create("(string)", token.value, null, token);
                case Token.TemplateHead:
                    this.trigger("TemplateHead", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        startLine: token.startLine,
                        startChar: token.startChar,
                        value: token.value
                    });
                    return create("(template)", token.value, null, token);
                case Token.TemplateMiddle:
                    this.trigger("TemplateMiddle", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        startLine: token.startLine,
                        startChar: token.startChar,
                        value: token.value
                    });
                    return create("(template middle)", token.value, null, token);
                case Token.TemplateTail:
                    this.trigger("TemplateTail", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        startLine: token.startLine,
                        startChar: token.startChar,
                        value: token.value
                    });
                    return create("(template tail)", token.value, null, token);
                case Token.NoSubstTemplate:
                    this.trigger("NoSubstTemplate", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        startLine: token.startLine,
                        startChar: token.startChar,
                        value: token.value
                    });
                    return create("(no subst template)", token.value, null, token);
                case Token.Identifier:
                    this.triggerAsync("Identifier", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        name: token.value,
                        raw_name: token.text,
                        isProperty: state.tokens.curr.id === "."
                    }, checks, function () { return true; });
                case Token.Keyword:
                case Token.NullLiteral:
                case Token.BooleanLiteral:
                    return create("(identifier)", token.value, state.tokens.curr.id === ".", token);
                case Token.NumericLiteral:
                    if (token.isMalformed) {
                        this.trigger("warning", {
                            code: "W045",
                            line: this.line,
                            character: this.char,
                            data: [token.value]
                        });
                    }
                    this.triggerAsync("warning", {
                        code: "W114",
                        line: this.line,
                        character: this.char,
                        data: ["0x-"]
                    }, checks, function () { return token.base === 16 && state.jsonMode; });
                    this.triggerAsync("warning", {
                        code: "W115",
                        line: this.line,
                        character: this.char
                    }, checks, function () {
                        return state.isStrict() && token.base === 8 && token.isLegacy;
                    });
                    this.trigger("Number", {
                        line: this.line,
                        char: this.char,
                        from: this.from,
                        value: token.value,
                        base: token.base,
                        isMalformed: token.malformed
                    });
                    return create("(number)", token.value);
                case Token.RegExp:
                    return create("(regexp)", token.value);
                case Token.Comment:
                    state.tokens.curr.comment = true;
                    if (token.isSpecial) {
                        return {
                            id: '(comment)',
                            value: token.value,
                            body: token.body,
                            type: token.commentType,
                            isSpecial: token.isSpecial,
                            line: this.line,
                            character: this.char,
                            from: this.from
                        };
                    }
                    break;
                case "":
                    break;
                default:
                    return create("(punctuator)", token.value);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGV4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL21vZGUvamF2YXNjcmlwdC9sZXgudHMiXSwibmFtZXMiOlsic29tZSIsImFzeW5jVHJpZ2dlciIsIkxleGVyIiwiTGV4ZXIuY29uc3RydWN0b3IiLCJMZXhlci5pbkNvbnRleHQiLCJMZXhlci5wdXNoQ29udGV4dCIsIkxleGVyLnBvcENvbnRleHQiLCJMZXhlci5pc0NvbnRleHQiLCJMZXhlci5jdXJyZW50Q29udGV4dCIsIkxleGVyLmdldExpbmVzIiwiTGV4ZXIuc2V0TGluZXMiLCJMZXhlci5wZWVrIiwiTGV4ZXIuc2tpcCIsIkxleGVyLm9uIiwiTGV4ZXIudHJpZ2dlciIsIkxleGVyLnRyaWdnZXJBc3luYyIsIkxleGVyLnNjYW5QdW5jdHVhdG9yIiwiTGV4ZXIuc2NhbkNvbW1lbnRzIiwiTGV4ZXIuc2NhbkNvbW1lbnRzLmNvbW1lbnRUb2tlbiIsIkxleGVyLnNjYW5LZXl3b3JkIiwiTGV4ZXIuc2NhbklkZW50aWZpZXIiLCJMZXhlci5zY2FuSWRlbnRpZmllci5pc05vbkFzY2lpSWRlbnRpZmllclN0YXJ0IiwiTGV4ZXIuc2NhbklkZW50aWZpZXIuaXNOb25Bc2NpaUlkZW50aWZpZXJQYXJ0IiwiTGV4ZXIuc2NhbklkZW50aWZpZXIuaXNIZXhEaWdpdCIsIkxleGVyLnNjYW5JZGVudGlmaWVyLnJlbW92ZUVzY2FwZVNlcXVlbmNlcyIsIkxleGVyLnNjYW5OdW1lcmljTGl0ZXJhbCIsIkxleGVyLnNjYW5OdW1lcmljTGl0ZXJhbC5pc0RlY2ltYWxEaWdpdCIsIkxleGVyLnNjYW5OdW1lcmljTGl0ZXJhbC5pc09jdGFsRGlnaXQiLCJMZXhlci5zY2FuTnVtZXJpY0xpdGVyYWwuaXNCaW5hcnlEaWdpdCIsIkxleGVyLnNjYW5OdW1lcmljTGl0ZXJhbC5pc0hleERpZ2l0IiwiTGV4ZXIuc2Nhbk51bWVyaWNMaXRlcmFsLmlzSWRlbnRpZmllclN0YXJ0IiwiTGV4ZXIuc2NhbkVzY2FwZVNlcXVlbmNlIiwiTGV4ZXIuc2NhblRlbXBsYXRlTGl0ZXJhbCIsIkxleGVyLnNjYW5TdHJpbmdMaXRlcmFsIiwiTGV4ZXIuc2NhblJlZ0V4cCIsIkxleGVyLnNjYW5Ob25CcmVha2luZ1NwYWNlcyIsIkxleGVyLnNjYW5VbnNhZmVDaGFycyIsIkxleGVyLm5leHQiLCJMZXhlci5uZXh0TGluZSIsIkxleGVyLnN0YXJ0IiwiTGV4ZXIudG9rZW4iLCJMZXhlci50b2tlbi5pc1Jlc2VydmVkIl0sIm1hcHBpbmdzIjoiQUFJQSxZQUFZLENBQUM7T0FFTixZQUFZLE1BQU0sZ0JBQWdCO09BQ2xDLEVBQUMsWUFBWSxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUMsTUFBTSxPQUFPO09BQ3pELEVBQUMsS0FBSyxFQUFDLE1BQU0sU0FBUztPQUV0QixFQUFDLHlCQUF5QixFQUFDLE1BQU0seUJBQXlCO09BQzFELEVBQUMsd0JBQXdCLEVBQUMsTUFBTSx5QkFBeUI7T0FDekQsRUFBQyw0QkFBNEIsRUFBQyxNQUFNLDhCQUE4QjtPQUNsRSxFQUFDLDJCQUEyQixFQUFDLE1BQU0sa0NBQWtDO0FBRTVFLGNBQWlCLEVBQU8sRUFBRSxRQUEyQjtJQUNqREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsR0FBR0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7UUFDcERBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQUE7QUFDaEJBLENBQUNBO0FBTUQsSUFBSSxLQUFLLEdBQUc7SUFDUixVQUFVLEVBQUUsQ0FBQztJQUNiLFVBQVUsRUFBRSxDQUFDO0lBQ2IsY0FBYyxFQUFFLENBQUM7SUFDakIsYUFBYSxFQUFFLENBQUM7SUFDaEIsT0FBTyxFQUFFLENBQUM7SUFDVixPQUFPLEVBQUUsQ0FBQztJQUNWLFdBQVcsRUFBRSxDQUFDO0lBQ2QsY0FBYyxFQUFFLENBQUM7SUFDakIsTUFBTSxFQUFFLENBQUM7SUFDVCxZQUFZLEVBQUUsRUFBRTtJQUNoQixjQUFjLEVBQUUsRUFBRTtJQUNsQixZQUFZLEVBQUUsRUFBRTtJQUNoQixlQUFlLEVBQUUsRUFBRTtDQUN0QixDQUFDO0FBRUYsV0FBVyxPQUFPLEdBQUc7SUFDakIsS0FBSyxFQUFFLENBQUM7SUFDUixRQUFRLEVBQUUsQ0FBQztDQUNkLENBQUM7QUFLRjtJQUNJQyxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUVqQkEsTUFBTUEsQ0FBQ0E7UUFDSEEsSUFBSUEsRUFBRUEsVUFBU0EsRUFBRUE7WUFDYixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JCLENBQUM7UUFFREEsS0FBS0EsRUFBRUE7WUFDSCxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDO2dCQUNsRCxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQixDQUFDO1lBRUQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RDLENBQUM7S0FDSkEsQ0FBQ0E7QUFDTkEsQ0FBQ0E7QUE0QkQ7SUFjSUMsWUFBWUEsTUFBTUE7UUFibEJDLFdBQU1BLEdBQWFBLEVBQUVBLENBQUNBO1FBY2xCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUVuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsS0FBS0EsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLEtBQUtBLEdBQUdBLEtBQUtBO2lCQUNSQSxPQUFPQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQTtpQkFDdEJBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBO2lCQUNwQkEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckJBLENBQUNBO1FBS0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbENBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUNEQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNsQkEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNyQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFFbkJBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNB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QUtBLEVBQUVBLEtBQUtBO2FBQ2ZBLENBQUNBO1FBQ05BLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzVDQSxNQUFNQSxDQUFDQTtnQkFDSEEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsVUFBVUE7Z0JBQ3RCQSxLQUFLQSxFQUFFQSxLQUFLQTthQUNmQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1Q0EsTUFBTUEsQ0FBQ0E7Z0JBQ0hBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLFVBQVVBO2dCQUN0QkEsS0FBS0EsRUFBRUEsS0FBS0E7YUFDZkEsQ0FBQ0E7UUFDTkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLE1BQU1BLENBQUNBO2dCQUNIQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxVQUFVQTtnQkFDdEJBLEtBQUtBLEVBQUVBLEtBQUtBO2FBQ2ZBLENBQUNBO1FBQ05BLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzVDQSxNQUFNQSxDQUFDQTtnQkFDSEEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsVUFBVUE7Z0JBQ3RCQSxLQUFLQSxFQUFFQSxLQUFLQTthQUNmQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUdE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Q0E7Z0JBQ1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNsQkEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ1hBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBRURBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBO1FBQ2ZBLENBQUNBO1FBS0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLEVBQUVBO2dCQUNsQkEsSUFBSUEsRUFBRUEsTUFBTUE7Z0JBQ1pBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBO2dCQUNmQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTthQUN2QkEsQ0FBQ0EsQ0FBQ0E7WUFFSEEsTUFBTUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsRUFBRUE7Z0JBQzlCQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTtnQkFDZkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7YUFDbEJBLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBSURBLE9BQU9BLEtBQUtBLEdBQUdBLE1BQU1BLEVBQUVBLENBQUNBO1lBQ3BCQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JB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TUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDcEYsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENBQUNBO1FBSUZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLG9CQUFvQkEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsQ0FBQ0E7UUFDcENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3BGQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsREEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFFOUJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNB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SUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7d0JBQ2ZBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBO3dCQUNmQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTt3QkFDZkEsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0E7d0JBQzFCQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxTQUFTQTt3QkFDMUJBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBO3FCQUNyQkEsQ0FBQ0EsQ0FBQ0E7b0JBQ0hBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLG1CQUFtQkEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWpFQSxLQUFLQSxLQUFLQSxDQUFDQSxZQUFZQTtvQkFDbkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBO3dCQUN6QkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7d0JBQ2ZBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBO3dCQUNmQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTt3QkFDZkEsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsU0FBU0E7d0JBQzFCQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxTQUFTQTt3QkFDMUJBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBO3FCQUNyQkEsQ0FBQ0EsQ0FBQ0E7b0JBQ0hBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLGlCQUFpQkEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBRS9EQSxLQUFLQSxLQUFLQSxDQUFDQSxlQUFlQTtvQkFDdEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUE7d0JBQzVCQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTt3QkFDZkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FB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QUssQ0FBQyxRQUFRLENBQUM7b0JBQ2xFLENBQUMsQ0FBQ0EsQ0FBQ0E7b0JBRUhBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBO3dCQUNuQkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7d0JBQ2ZBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBO3dCQUNmQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQTt3QkFDZkEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0E7d0JBQ2xCQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQTt3QkFDaEJBLFdBQVdBLEVBQUVBLEtBQUtBLENBQUNBLFNBQVNBO3FCQUMvQkEsQ0FBQ0EsQ0FBQ0E7b0JBRUhBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUUzQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsTUFBTUE7b0JBQ2JBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUUzQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsT0FBT0E7b0JBQ2RBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO29CQUVqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2xCQSxNQUFNQSxDQUFDQTs0QkFDSEEsRUFBRUEsRUFBRUEsV0FBV0E7NEJBQ2ZBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBOzRCQUNsQkEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUE7NEJBQ2hCQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxXQUFXQTs0QkFDdkJBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLFNBQVNBOzRCQUMxQkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7NEJBQ2ZBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBOzRCQUNwQkEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUE7eUJBQ2xCQSxDQUFDQTtvQkFDTkEsQ0FBQ0E7b0JBRURBLEtBQUtBLENBQUNBO2dCQUVWQSxLQUFLQSxFQUFFQTtvQkFDSEEsS0FBS0EsQ0FBQ0E7Z0JBRVZBO29CQUNJQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNuREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7QUFDTHRDLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogTGV4aWNhbCBhbmFseXNpcyBhbmQgdG9rZW4gY29uc3RydWN0aW9uLlxuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgRXZlbnRFbWl0dGVyIGZyb20gXCIuL0V2ZW50RW1pdHRlclwiO1xuaW1wb3J0IHtmYWxsc1Rocm91Z2gsIG1heGxlbkV4Y2VwdGlvbiwgdW5zYWZlQ2hhcnN9IGZyb20gXCIuL3JlZ1wiO1xuaW1wb3J0IHtzdGF0ZX0gZnJvbSBcIi4vc3RhdGVcIjtcblxuaW1wb3J0IHthc2NpaUlkZW50aWZpZXJTdGFydFRhYmxlfSBmcm9tIFwiLi9hc2NpaS1pZGVudGlmaWVyLWRhdGFcIjtcbmltcG9ydCB7YXNjaWlJZGVudGlmaWVyUGFydFRhYmxlfSBmcm9tIFwiLi9hc2NpaS1pZGVudGlmaWVyLWRhdGFcIjtcbmltcG9ydCB7bm9uQXNjaWlJZGVudGlmaWVyU3RhcnRUYWJsZX0gZnJvbSBcIi4vbm9uLWFzY2lpLWlkZW50aWZpZXItc3RhcnRcIjtcbmltcG9ydCB7bm9uQXNjaWlJZGVudGlmaWVyUGFydFRhYmxlfSBmcm9tIFwiLi9ub24tYXNjaWktaWRlbnRpZmllci1wYXJ0LW9ubHlcIjtcblxuZnVuY3Rpb24gc29tZTxUPih4czogVFtdLCBjYWxsYmFjazogKHg6IFQpID0+IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICBmb3IgKHZhciBpID0gMCwgaUxlbmd0aCA9IHhzLmxlbmd0aDsgaSA8IGlMZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoY2FsbGJhY2soeHNbaV0pKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2Vcbn1cblxuLy8gU29tZSBvZiB0aGVzZSB0b2tlbiB0eXBlcyBhcmUgZnJvbSBKYXZhU2NyaXB0IFBhcnNlciBBUElcbi8vIHdoaWxlIG90aGVycyBhcmUgc3BlY2lmaWMgdG8gSlNIaW50IHBhcnNlci5cbi8vIEpTIFBhcnNlciBBUEk6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvU3BpZGVyTW9ua2V5L1BhcnNlcl9BUElcblxudmFyIFRva2VuID0ge1xuICAgIElkZW50aWZpZXI6IDEsXG4gICAgUHVuY3R1YXRvcjogMixcbiAgICBOdW1lcmljTGl0ZXJhbDogMyxcbiAgICBTdHJpbmdMaXRlcmFsOiA0LFxuICAgIENvbW1lbnQ6IDUsXG4gICAgS2V5d29yZDogNixcbiAgICBOdWxsTGl0ZXJhbDogNyxcbiAgICBCb29sZWFuTGl0ZXJhbDogOCxcbiAgICBSZWdFeHA6IDksXG4gICAgVGVtcGxhdGVIZWFkOiAxMCxcbiAgICBUZW1wbGF0ZU1pZGRsZTogMTEsXG4gICAgVGVtcGxhdGVUYWlsOiAxMixcbiAgICBOb1N1YnN0VGVtcGxhdGU6IDEzXG59O1xuXG5leHBvcnQgdmFyIENvbnRleHQgPSB7XG4gICAgQmxvY2s6IDEsXG4gICAgVGVtcGxhdGU6IDJcbn07XG5cbi8vIE9iamVjdCB0aGF0IGhhbmRsZXMgcG9zdHBvbmVkIGxleGluZyB2ZXJpZmljYXRpb25zIHRoYXQgY2hlY2tzIHRoZSBwYXJzZWRcbi8vIGVudmlyb25tZW50IHN0YXRlLlxuXG5mdW5jdGlvbiBhc3luY1RyaWdnZXIoKSB7XG4gICAgdmFyIF9jaGVja3MgPSBbXTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHB1c2g6IGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICBfY2hlY2tzLnB1c2goZm4pO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNoZWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGNoZWNrID0gMDsgY2hlY2sgPCBfY2hlY2tzLmxlbmd0aDsgKytjaGVjaykge1xuICAgICAgICAgICAgICAgIF9jaGVja3NbY2hlY2tdKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9jaGVja3Muc3BsaWNlKDAsIF9jaGVja3MubGVuZ3RoKTtcbiAgICAgICAgfVxuICAgIH07XG59XG5cbi8qXG4gKiBMZXhlciBmb3IgSlNIaW50LlxuICpcbiAqIFRoaXMgb2JqZWN0IGRvZXMgYSBjaGFyLWJ5LWNoYXIgc2NhbiBvZiB0aGUgcHJvdmlkZWQgc291cmNlIGNvZGVcbiAqIGFuZCBwcm9kdWNlcyBhIHNlcXVlbmNlIG9mIHRva2Vucy5cbiAqXG4gKiAgIHZhciBsZXggPSBuZXcgTGV4ZXIoXCJ2YXIgaSA9IDA7XCIpO1xuICogICBsZXguc3RhcnQoKTtcbiAqICAgbGV4LnRva2VuKCk7IC8vIHJldHVybnMgdGhlIG5leHQgdG9rZW5cbiAqXG4gKiBZb3UgaGF2ZSB0byB1c2UgdGhlIHRva2VuKCkgbWV0aG9kIHRvIG1vdmUgdGhlIGxleGVyIGZvcndhcmRcbiAqIGJ1dCB5b3UgZG9uJ3QgaGF2ZSB0byB1c2UgaXRzIHJldHVybiB2YWx1ZSB0byBnZXQgdG9rZW5zLiBJbiBhZGRpdGlvblxuICogdG8gdG9rZW4oKSBtZXRob2QgcmV0dXJuaW5nIHRoZSBuZXh0IHRva2VuLCB0aGUgTGV4ZXIgb2JqZWN0IGFsc29cbiAqIGVtaXRzIGV2ZW50cy5cbiAqXG4gKiAgIGxleC5vbihcIklkZW50aWZpZXJcIiwgZnVuY3Rpb24oZGF0YSkge1xuICogICAgIGlmIChkYXRhLm5hbWUuaW5kZXhPZihcIl9cIikgPj0gMCkge1xuICogICAgICAgLy8gUHJvZHVjZSBhIHdhcm5pbmcuXG4gKiAgICAgfVxuICogICB9KTtcbiAqXG4gKiBOb3RlIHRoYXQgdGhlIHRva2VuKCkgbWV0aG9kIHJldHVybnMgdG9rZW5zIGluIGEgSlNMaW50LWNvbXBhdGlibGVcbiAqIGZvcm1hdCB3aGlsZSB0aGUgZXZlbnQgZW1pdHRlciB1c2VzIGEgc2xpZ2h0bHkgbW9kaWZpZWQgdmVyc2lvbiBvZlxuICogTW96aWxsYSdzIEphdmFTY3JpcHQgUGFyc2VyIEFQSS4gRXZlbnR1YWxseSwgd2Ugd2lsbCBtb3ZlIGF3YXkgZnJvbVxuICogSlNMaW50IGZvcm1hdC5cbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTGV4ZXIge1xuICAgIF9saW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBlbWl0dGVyOiBFdmVudEVtaXR0ZXI7XG4gICAgc291cmNlXG4gICAgcHJlcmVnOiBib29sZWFuO1xuICAgIGxpbmU6IG51bWJlcjtcbiAgICBjaGFyOiBudW1iZXI7XG4gICAgZnJvbTogbnVtYmVyO1xuICAgIGlucHV0OiBzdHJpbmc7XG4gICAgaW5Db21tZW50OiBib29sZWFuO1xuICAgIGNvbnRleHQ6IGFueVtdO1xuICAgIHRlbXBsYXRlU3RhcnRzOiBhbnlbXTtcbiAgICBleGhhdXN0ZWQ6IGJvb2xlYW47XG4gICAgaWdub3JpbmdMaW50ZXJFcnJvcnM6IGJvb2xlYW47XG4gICAgY29uc3RydWN0b3Ioc291cmNlKSB7XG4gICAgICAgIHZhciBsaW5lcyA9IHNvdXJjZTtcblxuICAgICAgICBpZiAodHlwZW9mIGxpbmVzID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBsaW5lcyA9IGxpbmVzXG4gICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcclxcbi9nLCBcIlxcblwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgXCJcXG5cIilcbiAgICAgICAgICAgICAgICAuc3BsaXQoXCJcXG5cIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgZmlyc3QgbGluZSBpcyBhIHNoZWJhbmcgKCMhKSwgbWFrZSBpdCBhIGJsYW5rIGFuZCBtb3ZlIG9uLlxuICAgICAgICAvLyBTaGViYW5ncyBhcmUgdXNlZCBieSBOb2RlIHNjcmlwdHMuXG5cbiAgICAgICAgaWYgKGxpbmVzWzBdICYmIGxpbmVzWzBdLnN1YnN0cigwLCAyKSA9PT0gXCIjIVwiKSB7XG4gICAgICAgICAgICBpZiAobGluZXNbMF0uaW5kZXhPZihcIm5vZGVcIikgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUub3B0aW9uLm5vZGUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGluZXNbMF0gPSBcIlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuICAgICAgICB0aGlzLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgICAgdGhpcy5zZXRMaW5lcyhsaW5lcyk7XG4gICAgICAgIHRoaXMucHJlcmVnID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLmxpbmUgPSAwO1xuICAgICAgICB0aGlzLmNoYXIgPSAxO1xuICAgICAgICB0aGlzLmZyb20gPSAxO1xuICAgICAgICB0aGlzLmlucHV0ID0gXCJcIjtcbiAgICAgICAgdGhpcy5pbkNvbW1lbnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5jb250ZXh0ID0gW107XG4gICAgICAgIHRoaXMudGVtcGxhdGVTdGFydHMgPSBbXTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0YXRlLm9wdGlvbi5pbmRlbnQ7IGkgKz0gMSkge1xuICAgICAgICAgICAgc3RhdGUudGFiICs9IFwiIFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5Db250ZXh0KGN0eFR5cGUpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29udGV4dC5sZW5ndGggPiAwICYmIHRoaXMuY29udGV4dFt0aGlzLmNvbnRleHQubGVuZ3RoIC0gMV0udHlwZSA9PT0gY3R4VHlwZTtcbiAgICB9XG5cbiAgICBwdXNoQ29udGV4dChjdHhUeXBlKSB7XG4gICAgICAgIHRoaXMuY29udGV4dC5wdXNoKHsgdHlwZTogY3R4VHlwZSB9KTtcbiAgICB9XG5cbiAgICBwb3BDb250ZXh0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0LnBvcCgpO1xuICAgIH1cblxuICAgIGlzQ29udGV4dChjb250ZXh0KSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbnRleHQubGVuZ3RoID4gMCAmJiB0aGlzLmNvbnRleHRbdGhpcy5jb250ZXh0Lmxlbmd0aCAtIDFdID09PSBjb250ZXh0O1xuICAgIH1cblxuICAgIGN1cnJlbnRDb250ZXh0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jb250ZXh0Lmxlbmd0aCA+IDAgJiYgdGhpcy5jb250ZXh0W3RoaXMuY29udGV4dC5sZW5ndGggLSAxXTtcbiAgICB9XG5cbiAgICBnZXRMaW5lcygpIHtcbiAgICAgICAgdGhpcy5fbGluZXMgPSBzdGF0ZS5saW5lcztcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xpbmVzO1xuICAgIH1cblxuICAgIHNldExpbmVzKHZhbCkge1xuICAgICAgICB0aGlzLl9saW5lcyA9IHZhbDtcbiAgICAgICAgc3RhdGUubGluZXMgPSB0aGlzLl9saW5lcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybiB0aGUgbmV4dCBpIGNoYXJhY3RlciB3aXRob3V0IGFjdHVhbGx5IG1vdmluZyB0aGVcbiAgICAgKiBjaGFyIHBvaW50ZXIuXG4gICAgICovXG4gICAgcGVlayhpPzogbnVtYmVyKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0LmNoYXJBdChpIHx8IDApO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogTW92ZSB0aGUgY2hhciBwb2ludGVyIGZvcndhcmQgaSB0aW1lcy5cbiAgICAgKi9cbiAgICBza2lwKGk/OiBudW1iZXIpIHtcbiAgICAgICAgaSA9IGkgfHwgMTtcbiAgICAgICAgdGhpcy5jaGFyICs9IGk7XG4gICAgICAgIHRoaXMuaW5wdXQgPSB0aGlzLmlucHV0LnNsaWNlKGkpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogU3Vic2NyaWJlIHRvIGEgdG9rZW4gZXZlbnQuIFRoZSBBUEkgZm9yIHRoaXMgbWV0aG9kIGlzIHNpbWlsYXJcbiAgICAgKiBVbmRlcnNjb3JlLmpzIGkuZS4geW91IGNhbiBzdWJzY3JpYmUgdG8gbXVsdGlwbGUgZXZlbnRzIHdpdGhcbiAgICAgKiBvbmUgY2FsbDpcbiAgICAgKlxuICAgICAqICAgbGV4Lm9uKFwiSWRlbnRpZmllciBOdW1iZXJcIiwgZnVuY3Rpb24oZGF0YSkge1xuICAgICAqICAgICAvLyAuLi5cbiAgICAgKiAgIH0pO1xuICAgICAqL1xuICAgIG9uKG5hbWVzLCBsaXN0ZW5lcikge1xuICAgICAgICBuYW1lcy5zcGxpdChcIiBcIikuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXR0ZXIub24obmFtZSwgbGlzdGVuZXIpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogVHJpZ2dlciBhIHRva2VuIGV2ZW50LiBBbGwgYXJndW1lbnRzIHdpbGwgYmUgcGFzc2VkIHRvIGVhY2hcbiAgICAgKiBsaXN0ZW5lci5cbiAgICAgKi9cbiAgICB0cmlnZ2VyKHVudXNlZDA/LCB1bnVzZWQxPykge1xuICAgICAgICB0aGlzLmVtaXR0ZXIuZW1pdC5hcHBseSh0aGlzLmVtaXR0ZXIsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogUG9zdHBvbmUgYSB0b2tlbiBldmVudC4gdGhlIGNoZWNraW5nIGNvbmRpdGlvbiBpcyBzZXQgYXNcbiAgICAgKiBsYXN0IHBhcmFtZXRlciwgYW5kIHRoZSB0cmlnZ2VyIGZ1bmN0aW9uIGlzIGNhbGxlZCBpbiBhXG4gICAgICogc3RvcmVkIGNhbGxiYWNrLiBUbyBiZSBsYXRlciBjYWxsZWQgdXNpbmcgdGhlIGNoZWNrKCkgZnVuY3Rpb25cbiAgICAgKiBieSB0aGUgcGFyc2VyLiBUaGlzIGF2b2lkcyBwYXJzZXIncyBwZWVrKCkgdG8gZ2l2ZSB0aGUgbGV4ZXJcbiAgICAgKiBhIGZhbHNlIGNvbnRleHQuXG4gICAgICovXG4gICAgdHJpZ2dlckFzeW5jKHR5cGUsIGFyZ3MsIGNoZWNrcywgZm4pIHtcbiAgICAgICAgY2hlY2tzLnB1c2goZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoZm4oKSkge1xuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcih0eXBlLCBhcmdzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEV4dHJhY3QgYSBwdW5jdHVhdG9yIG91dCBvZiB0aGUgbmV4dCBzZXF1ZW5jZSBvZiBjaGFyYWN0ZXJzXG4gICAgICogb3IgcmV0dXJuICdudWxsJyBpZiBpdHMgbm90IHBvc3NpYmxlLlxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2QncyBpbXBsZW1lbnRhdGlvbiB3YXMgaGVhdmlseSBpbmZsdWVuY2VkIGJ5IHRoZVxuICAgICAqIHNjYW5QdW5jdHVhdG9yIGZ1bmN0aW9uIGluIHRoZSBFc3ByaW1hIHBhcnNlcidzIHNvdXJjZSBjb2RlLlxuICAgICAqL1xuICAgIHNjYW5QdW5jdHVhdG9yKCkge1xuICAgICAgICB2YXIgY2gxID0gdGhpcy5wZWVrKCk7XG4gICAgICAgIHZhciBjaDIsIGNoMywgY2g0O1xuXG4gICAgICAgIHN3aXRjaCAoY2gxKSB7XG4gICAgICAgICAgICAvLyBNb3N0IGNvbW1vbiBzaW5nbGUtY2hhcmFjdGVyIHB1bmN0dWF0b3JzXG4gICAgICAgICAgICBjYXNlIFwiLlwiOlxuICAgICAgICAgICAgICAgIGlmICgoL15bMC05XSQvKS50ZXN0KHRoaXMucGVlaygxKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBlZWsoMSkgPT09IFwiLlwiICYmIHRoaXMucGVlaygyKSA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLlB1bmN0dWF0b3IsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogXCIuLi5cIlxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8qIGZhbGxzIHRocm91Z2ggKi9cbiAgICAgICAgICAgIGNhc2UgXCIoXCI6XG4gICAgICAgICAgICBjYXNlIFwiKVwiOlxuICAgICAgICAgICAgY2FzZSBcIjtcIjpcbiAgICAgICAgICAgIGNhc2UgXCIsXCI6XG4gICAgICAgICAgICBjYXNlIFwiW1wiOlxuICAgICAgICAgICAgY2FzZSBcIl1cIjpcbiAgICAgICAgICAgIGNhc2UgXCI6XCI6XG4gICAgICAgICAgICBjYXNlIFwiflwiOlxuICAgICAgICAgICAgY2FzZSBcIj9cIjpcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5QdW5jdHVhdG9yLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY2gxXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gQSBibG9jay9vYmplY3Qgb3BlbmVyXG4gICAgICAgICAgICBjYXNlIFwie1wiOlxuICAgICAgICAgICAgICAgIHRoaXMucHVzaENvbnRleHQoQ29udGV4dC5CbG9jayk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNoMVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIEEgYmxvY2svb2JqZWN0IGNsb3NlclxuICAgICAgICAgICAgY2FzZSBcIn1cIjpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbkNvbnRleHQoQ29udGV4dC5CbG9jaykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3BDb250ZXh0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLlB1bmN0dWF0b3IsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBjaDFcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBBIHBvdW5kIHNpZ24gKGZvciBOb2RlIHNoZWJhbmdzKVxuICAgICAgICAgICAgY2FzZSBcIiNcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5QdW5jdHVhdG9yLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogY2gxXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gV2UncmUgYXQgdGhlIGVuZCBvZiBpbnB1dFxuICAgICAgICAgICAgY2FzZSBcIlwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGVlayBtb3JlIGNoYXJhY3RlcnNcblxuICAgICAgICBjaDIgPSB0aGlzLnBlZWsoMSk7XG4gICAgICAgIGNoMyA9IHRoaXMucGVlaygyKTtcbiAgICAgICAgY2g0ID0gdGhpcy5wZWVrKDMpO1xuXG4gICAgICAgIC8vIDQtY2hhcmFjdGVyIHB1bmN0dWF0b3I6ID4+Pj1cblxuICAgICAgICBpZiAoY2gxID09PSBcIj5cIiAmJiBjaDIgPT09IFwiPlwiICYmIGNoMyA9PT0gXCI+XCIgJiYgY2g0ID09PSBcIj1cIikge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5QdW5jdHVhdG9yLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBcIj4+Pj1cIlxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIDMtY2hhcmFjdGVyIHB1bmN0dWF0b3JzOiA9PT0gIT09ID4+PiA8PD0gPj49XG5cbiAgICAgICAgaWYgKGNoMSA9PT0gXCI9XCIgJiYgY2gyID09PSBcIj1cIiAmJiBjaDMgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLlB1bmN0dWF0b3IsXG4gICAgICAgICAgICAgICAgdmFsdWU6IFwiPT09XCJcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2gxID09PSBcIiFcIiAmJiBjaDIgPT09IFwiPVwiICYmIGNoMyA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICB2YWx1ZTogXCIhPT1cIlxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaDEgPT09IFwiPlwiICYmIGNoMiA9PT0gXCI+XCIgJiYgY2gzID09PSBcIj5cIikge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5QdW5jdHVhdG9yLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBcIj4+PlwiXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoMSA9PT0gXCI8XCIgJiYgY2gyID09PSBcIjxcIiAmJiBjaDMgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLlB1bmN0dWF0b3IsXG4gICAgICAgICAgICAgICAgdmFsdWU6IFwiPDw9XCJcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2gxID09PSBcIj5cIiAmJiBjaDIgPT09IFwiPlwiICYmIGNoMyA9PT0gXCI9XCIpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICB2YWx1ZTogXCI+Pj1cIlxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZhdCBhcnJvdyBwdW5jdHVhdG9yXG4gICAgICAgIGlmIChjaDEgPT09IFwiPVwiICYmIGNoMiA9PT0gXCI+XCIpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICB2YWx1ZTogY2gxICsgY2gyXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gMi1jaGFyYWN0ZXIgcHVuY3R1YXRvcnM6IDw9ID49ID09ICE9ICsrIC0tIDw8ID4+ICYmIHx8XG4gICAgICAgIC8vICs9IC09ICo9ICU9ICY9IHw9IF49IC89XG4gICAgICAgIGlmIChjaDEgPT09IGNoMiAmJiAoXCIrLTw+JnxcIi5pbmRleE9mKGNoMSkgPj0gMCkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICB2YWx1ZTogY2gxICsgY2gyXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFwiPD49ISstKiUmfF4vXCIuaW5kZXhPZihjaDEpID49IDApIHtcbiAgICAgICAgICAgIGlmIChjaDIgPT09IFwiPVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGNoMSArIGNoMlxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdHlwZTogVG9rZW4uUHVuY3R1YXRvcixcbiAgICAgICAgICAgICAgICB2YWx1ZTogY2gxXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBFeHRyYWN0IGEgY29tbWVudCBvdXQgb2YgdGhlIG5leHQgc2VxdWVuY2Ugb2YgY2hhcmFjdGVycyBhbmQvb3JcbiAgICAgKiBsaW5lcyBvciByZXR1cm4gJ251bGwnIGlmIGl0cyBub3QgcG9zc2libGUuIFNpbmNlIGNvbW1lbnRzIGNhblxuICAgICAqIHNwYW4gYWNyb3NzIG11bHRpcGxlIGxpbmVzIHRoaXMgbWV0aG9kIGhhcyB0byBtb3ZlIHRoZSBjaGFyXG4gICAgICogcG9pbnRlci5cbiAgICAgKlxuICAgICAqIEluIGFkZGl0aW9uIHRvIG5vcm1hbCBKYXZhU2NyaXB0IGNvbW1lbnRzICgvLyBhbmQgLyopIHRoaXMgbWV0aG9kXG4gICAgICogYWxzbyByZWNvZ25pemVzIEpTSGludC0gYW5kIEpTTGludC1zcGVjaWZpYyBjb21tZW50cyBzdWNoIGFzXG4gICAgICogLypqc2hpbnQsIC8qanNsaW50LCAvKmdsb2JhbHMgYW5kIHNvIG9uLlxuICAgICAqL1xuICAgIHNjYW5Db21tZW50cygpIHtcbiAgICAgICAgdmFyIGNoMSA9IHRoaXMucGVlaygpO1xuICAgICAgICB2YXIgY2gyID0gdGhpcy5wZWVrKDEpO1xuICAgICAgICB2YXIgcmVzdCA9IHRoaXMuaW5wdXQuc3Vic3RyKDIpO1xuICAgICAgICB2YXIgc3RhcnRMaW5lID0gdGhpcy5saW5lO1xuICAgICAgICB2YXIgc3RhcnRDaGFyID0gdGhpcy5jaGFyO1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgY29tbWVudCB0b2tlbiBvYmplY3QgYW5kIG1ha2Ugc3VyZSBpdFxuICAgICAgICAvLyBoYXMgYWxsIHRoZSBkYXRhIEpTSGludCBuZWVkcyB0byB3b3JrIHdpdGggc3BlY2lhbFxuICAgICAgICAvLyBjb21tZW50cy5cblxuICAgICAgICBmdW5jdGlvbiBjb21tZW50VG9rZW4obGFiZWwsIGJvZHksIG9wdD8pIHtcbiAgICAgICAgICAgIHZhciBzcGVjaWFsID0gW1wianNoaW50XCIsIFwianNsaW50XCIsIFwibWVtYmVyc1wiLCBcIm1lbWJlclwiLCBcImdsb2JhbHNcIiwgXCJnbG9iYWxcIiwgXCJleHBvcnRlZFwiXTtcbiAgICAgICAgICAgIHZhciBpc1NwZWNpYWwgPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IGxhYmVsICsgYm9keTtcbiAgICAgICAgICAgIHZhciBjb21tZW50VHlwZSA9IFwicGxhaW5cIjtcbiAgICAgICAgICAgIG9wdCA9IG9wdCB8fCB7fTtcblxuICAgICAgICAgICAgaWYgKG9wdC5pc011bHRpbGluZSkge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IFwiKi9cIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYm9keSA9IGJvZHkucmVwbGFjZSgvXFxuL2csIFwiIFwiKTtcblxuICAgICAgICAgICAgaWYgKGxhYmVsID09PSBcIi8qXCIgJiYgZmFsbHNUaHJvdWdoLnRlc3QoYm9keSkpIHtcbiAgICAgICAgICAgICAgICBpc1NwZWNpYWwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbW1lbnRUeXBlID0gXCJmYWxscyB0aHJvdWdoXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHNwZWNpYWwuZm9yRWFjaChmdW5jdGlvbihzdHIpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNTcGVjaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBEb24ndCByZWNvZ25pemUgYW55IHNwZWNpYWwgY29tbWVudHMgb3RoZXIgdGhhbiBqc2hpbnQgZm9yIHNpbmdsZS1saW5lXG4gICAgICAgICAgICAgICAgLy8gY29tbWVudHMuIFRoaXMgaW50cm9kdWNlZCBtYW55IHByb2JsZW1zIHdpdGggbGVnaXQgY29tbWVudHMuXG4gICAgICAgICAgICAgICAgaWYgKGxhYmVsID09PSBcIi8vXCIgJiYgc3RyICE9PSBcImpzaGludFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoYm9keS5jaGFyQXQoc3RyLmxlbmd0aCkgPT09IFwiIFwiICYmIGJvZHkuc3Vic3RyKDAsIHN0ci5sZW5ndGgpID09PSBzdHIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNTcGVjaWFsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBsYWJlbCArIHN0cjtcbiAgICAgICAgICAgICAgICAgICAgYm9keSA9IGJvZHkuc3Vic3RyKHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghaXNTcGVjaWFsICYmIGJvZHkuY2hhckF0KDApID09PSBcIiBcIiAmJiBib2R5LmNoYXJBdChzdHIubGVuZ3RoICsgMSkgPT09IFwiIFwiICYmXG4gICAgICAgICAgICAgICAgICAgIGJvZHkuc3Vic3RyKDEsIHN0ci5sZW5ndGgpID09PSBzdHIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNTcGVjaWFsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwgPSBsYWJlbCArIFwiIFwiICsgc3RyO1xuICAgICAgICAgICAgICAgICAgICBib2R5ID0gYm9keS5zdWJzdHIoc3RyLmxlbmd0aCArIDEpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghaXNTcGVjaWFsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHN0cikge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwibWVtYmVyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21tZW50VHlwZSA9IFwibWVtYmVyc1wiO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJnbG9iYWxcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbW1lbnRUeXBlID0gXCJnbG9iYWxzXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvcHRpb25zID0gYm9keS5zcGxpdChcIjpcIikubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdi5yZXBsYWNlKC9eXFxzKy8sIFwiXCIpLnJlcGxhY2UoL1xccyskLywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dpdGNoIChvcHRpb25zWzBdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpZ25vcmVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAob3B0aW9uc1sxXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzdGFydFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxmLmlnbm9yaW5nTGludGVyRXJyb3JzID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNTcGVjaWFsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJlbmRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5pZ25vcmluZ0xpbnRlckVycm9ycyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1NwZWNpYWwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21tZW50VHlwZSA9IHN0cjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5Db21tZW50LFxuICAgICAgICAgICAgICAgIGNvbW1lbnRUeXBlOiBjb21tZW50VHlwZSxcbiAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgYm9keTogYm9keSxcbiAgICAgICAgICAgICAgICBpc1NwZWNpYWw6IGlzU3BlY2lhbCxcbiAgICAgICAgICAgICAgICBpc011bHRpbGluZTogb3B0LmlzTXVsdGlsaW5lIHx8IGZhbHNlLFxuICAgICAgICAgICAgICAgIGlzTWFsZm9ybWVkOiBvcHQuaXNNYWxmb3JtZWQgfHwgZmFsc2VcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFbmQgb2YgdW5iZWd1biBjb21tZW50LiBSYWlzZSBhbiBlcnJvciBhbmQgc2tpcCB0aGF0IGlucHV0LlxuICAgICAgICBpZiAoY2gxID09PSBcIipcIiAmJiBjaDIgPT09IFwiL1wiKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJlcnJvclwiLCB7XG4gICAgICAgICAgICAgICAgY29kZTogXCJFMDE4XCIsXG4gICAgICAgICAgICAgICAgbGluZTogc3RhcnRMaW5lLFxuICAgICAgICAgICAgICAgIGNoYXJhY3Rlcjogc3RhcnRDaGFyXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdGhpcy5za2lwKDIpO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDb21tZW50cyBtdXN0IHN0YXJ0IGVpdGhlciB3aXRoIC8vIG9yIC8qXG4gICAgICAgIGlmIChjaDEgIT09IFwiL1wiIHx8IChjaDIgIT09IFwiKlwiICYmIGNoMiAhPT0gXCIvXCIpKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9uZS1saW5lIGNvbW1lbnRcbiAgICAgICAgaWYgKGNoMiA9PT0gXCIvXCIpIHtcbiAgICAgICAgICAgIHRoaXMuc2tpcCh0aGlzLmlucHV0Lmxlbmd0aCk7IC8vIFNraXAgdG8gdGhlIEVPTC5cbiAgICAgICAgICAgIHJldHVybiBjb21tZW50VG9rZW4oXCIvL1wiLCByZXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBib2R5ID0gXCJcIjtcblxuICAgICAgICAvKiBNdWx0aS1saW5lIGNvbW1lbnQgKi9cbiAgICAgICAgaWYgKGNoMiA9PT0gXCIqXCIpIHtcbiAgICAgICAgICAgIHRoaXMuaW5Db21tZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuc2tpcCgyKTtcblxuICAgICAgICAgICAgd2hpbGUgKHRoaXMucGVlaygpICE9PSBcIipcIiB8fCB0aGlzLnBlZWsoMSkgIT09IFwiL1wiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGVlaygpID09PSBcIlwiKSB7IC8vIEVuZCBvZiBMaW5lXG4gICAgICAgICAgICAgICAgICAgIGJvZHkgKz0gXCJcXG5cIjtcblxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB3ZSBoaXQgRU9GIGFuZCBvdXIgY29tbWVudCBpcyBzdGlsbCB1bmNsb3NlZCxcbiAgICAgICAgICAgICAgICAgICAgLy8gdHJpZ2dlciBhbiBlcnJvciBhbmQgZW5kIHRoZSBjb21tZW50IGltcGxpY2l0bHkuXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5uZXh0TGluZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJlcnJvclwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogXCJFMDE3XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogc3RhcnRMaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJhY3Rlcjogc3RhcnRDaGFyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbkNvbW1lbnQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjb21tZW50VG9rZW4oXCIvKlwiLCBib2R5LCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNNdWx0aWxpbmU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWxmb3JtZWQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYm9keSArPSB0aGlzLnBlZWsoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5za2lwKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNraXAoMik7XG4gICAgICAgICAgICB0aGlzLmluQ29tbWVudCA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1lbnRUb2tlbihcIi8qXCIsIGJvZHksIHsgaXNNdWx0aWxpbmU6IHRydWUgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEV4dHJhY3QgYSBrZXl3b3JkIG91dCBvZiB0aGUgbmV4dCBzZXF1ZW5jZSBvZiBjaGFyYWN0ZXJzIG9yXG4gICAgICogcmV0dXJuICdudWxsJyBpZiBpdHMgbm90IHBvc3NpYmxlLlxuICAgICAqL1xuICAgIHNjYW5LZXl3b3JkKCkge1xuICAgICAgICB2YXIgcmVzdWx0ID0gL15bYS16QS1aXyRdW2EtekEtWjAtOV8kXSovLmV4ZWModGhpcy5pbnB1dCk7XG4gICAgICAgIHZhciBrZXl3b3JkcyA9IFtcbiAgICAgICAgICAgIFwiaWZcIiwgXCJpblwiLCBcImRvXCIsIFwidmFyXCIsIFwiZm9yXCIsIFwibmV3XCIsXG4gICAgICAgICAgICBcInRyeVwiLCBcImxldFwiLCBcInRoaXNcIiwgXCJlbHNlXCIsIFwiY2FzZVwiLFxuICAgICAgICAgICAgXCJ2b2lkXCIsIFwid2l0aFwiLCBcImVudW1cIiwgXCJ3aGlsZVwiLCBcImJyZWFrXCIsXG4gICAgICAgICAgICBcImNhdGNoXCIsIFwidGhyb3dcIiwgXCJjb25zdFwiLCBcInlpZWxkXCIsIFwiY2xhc3NcIixcbiAgICAgICAgICAgIFwic3VwZXJcIiwgXCJyZXR1cm5cIiwgXCJ0eXBlb2ZcIiwgXCJkZWxldGVcIixcbiAgICAgICAgICAgIFwic3dpdGNoXCIsIFwiZXhwb3J0XCIsIFwiaW1wb3J0XCIsIFwiZGVmYXVsdFwiLFxuICAgICAgICAgICAgXCJmaW5hbGx5XCIsIFwiZXh0ZW5kc1wiLCBcImZ1bmN0aW9uXCIsIFwiY29udGludWVcIixcbiAgICAgICAgICAgIFwiZGVidWdnZXJcIiwgXCJpbnN0YW5jZW9mXCJcbiAgICAgICAgXTtcblxuICAgICAgICBpZiAocmVzdWx0ICYmIGtleXdvcmRzLmluZGV4T2YocmVzdWx0WzBdKSA+PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLktleXdvcmQsXG4gICAgICAgICAgICAgICAgdmFsdWU6IHJlc3VsdFswXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogRXh0cmFjdCBhIEphdmFTY3JpcHQgaWRlbnRpZmllciBvdXQgb2YgdGhlIG5leHQgc2VxdWVuY2Ugb2ZcbiAgICAgKiBjaGFyYWN0ZXJzIG9yIHJldHVybiAnbnVsbCcgaWYgaXRzIG5vdCBwb3NzaWJsZS4gSW4gYWRkaXRpb24sXG4gICAgICogdG8gSWRlbnRpZmllciB0aGlzIG1ldGhvZCBjYW4gYWxzbyBwcm9kdWNlIEJvb2xlYW5MaXRlcmFsXG4gICAgICogKHRydWUvZmFsc2UpIGFuZCBOdWxsTGl0ZXJhbCAobnVsbCkuXG4gICAgICovXG4gICAgc2NhbklkZW50aWZpZXIoKSB7XG4gICAgICAgIHZhciBpZCA9IFwiXCI7XG4gICAgICAgIHZhciBpbmRleCA9IDA7XG4gICAgICAgIHZhciB0eXBlLCBjaGFyO1xuXG4gICAgICAgIGZ1bmN0aW9uIGlzTm9uQXNjaWlJZGVudGlmaWVyU3RhcnQoY29kZSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vbkFzY2lpSWRlbnRpZmllclN0YXJ0VGFibGUuaW5kZXhPZihjb2RlKSA+IC0xO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaXNOb25Bc2NpaUlkZW50aWZpZXJQYXJ0KGNvZGUpIHtcbiAgICAgICAgICAgIHJldHVybiBpc05vbkFzY2lpSWRlbnRpZmllclN0YXJ0KGNvZGUpIHx8IG5vbkFzY2lpSWRlbnRpZmllclBhcnRUYWJsZS5pbmRleE9mKGNvZGUpID4gLTE7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc0hleERpZ2l0KHN0cikge1xuICAgICAgICAgICAgcmV0dXJuICgvXlswLTlhLWZBLUZdJC8pLnRlc3Qoc3RyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZWFkVW5pY29kZUVzY2FwZVNlcXVlbmNlID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcblxuICAgICAgICAgICAgaWYgKHRoaXMucGVlayhpbmRleCkgIT09IFwidVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjaDEgPSB0aGlzLnBlZWsoaW5kZXggKyAxKTtcbiAgICAgICAgICAgIHZhciBjaDIgPSB0aGlzLnBlZWsoaW5kZXggKyAyKTtcbiAgICAgICAgICAgIHZhciBjaDMgPSB0aGlzLnBlZWsoaW5kZXggKyAzKTtcbiAgICAgICAgICAgIHZhciBjaDQgPSB0aGlzLnBlZWsoaW5kZXggKyA0KTtcbiAgICAgICAgICAgIHZhciBjb2RlO1xuXG4gICAgICAgICAgICBpZiAoaXNIZXhEaWdpdChjaDEpICYmIGlzSGV4RGlnaXQoY2gyKSAmJiBpc0hleERpZ2l0KGNoMykgJiYgaXNIZXhEaWdpdChjaDQpKSB7XG4gICAgICAgICAgICAgICAgY29kZSA9IHBhcnNlSW50KGNoMSArIGNoMiArIGNoMyArIGNoNCwgMTYpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFzY2lpSWRlbnRpZmllclBhcnRUYWJsZVtjb2RlXSB8fCBpc05vbkFzY2lpSWRlbnRpZmllclBhcnQoY29kZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggKz0gNTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXFxcXHVcIiArIGNoMSArIGNoMiArIGNoMyArIGNoNDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgICB2YXIgZ2V0SWRlbnRpZmllclN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgICAgICAgdmFyIGNociA9IHRoaXMucGVlayhpbmRleCk7XG4gICAgICAgICAgICB2YXIgY29kZSA9IGNoci5jaGFyQ29kZUF0KDApO1xuXG4gICAgICAgICAgICBpZiAoY29kZSA9PT0gOTIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVhZFVuaWNvZGVFc2NhcGVTZXF1ZW5jZSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY29kZSA8IDEyOCkge1xuICAgICAgICAgICAgICAgIGlmIChhc2NpaUlkZW50aWZpZXJTdGFydFRhYmxlW2NvZGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaHI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc05vbkFzY2lpSWRlbnRpZmllclN0YXJ0KGNvZGUpKSB7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuXG4gICAgICAgIHZhciBnZXRJZGVudGlmaWVyUGFydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLypqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cbiAgICAgICAgICAgIHZhciBjaHIgPSB0aGlzLnBlZWsoaW5kZXgpO1xuICAgICAgICAgICAgdmFyIGNvZGUgPSBjaHIuY2hhckNvZGVBdCgwKTtcblxuICAgICAgICAgICAgaWYgKGNvZGUgPT09IDkyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYWRVbmljb2RlRXNjYXBlU2VxdWVuY2UoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNvZGUgPCAxMjgpIHtcbiAgICAgICAgICAgICAgICBpZiAoYXNjaWlJZGVudGlmaWVyUGFydFRhYmxlW2NvZGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjaHI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc05vbkFzY2lpSWRlbnRpZmllclBhcnQoY29kZSkpIHtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICAgIHJldHVybiBjaHI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9LmJpbmQodGhpcyk7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVtb3ZlRXNjYXBlU2VxdWVuY2VzKGlkKSB7XG4gICAgICAgICAgICByZXR1cm4gaWQucmVwbGFjZSgvXFxcXHUoWzAtOWEtZkEtRl17NH0pL2csIGZ1bmN0aW9uKG0wLCBjb2RlcG9pbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChjb2RlcG9pbnQsIDE2KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNoYXIgPSBnZXRJZGVudGlmaWVyU3RhcnQoKTtcbiAgICAgICAgaWYgKGNoYXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWQgPSBjaGFyO1xuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgY2hhciA9IGdldElkZW50aWZpZXJQYXJ0KCk7XG5cbiAgICAgICAgICAgIGlmIChjaGFyID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlkICs9IGNoYXI7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKGlkKSB7XG4gICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgdHlwZSA9IFRva2VuLkJvb2xlYW5MaXRlcmFsO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm51bGxcIjpcbiAgICAgICAgICAgICAgICB0eXBlID0gVG9rZW4uTnVsbExpdGVyYWw7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHR5cGUgPSBUb2tlbi5JZGVudGlmaWVyO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6IHR5cGUsXG4gICAgICAgICAgICB2YWx1ZTogcmVtb3ZlRXNjYXBlU2VxdWVuY2VzKGlkKSxcbiAgICAgICAgICAgIHRleHQ6IGlkLFxuICAgICAgICAgICAgdG9rZW5MZW5ndGg6IGlkLmxlbmd0aFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qXG4gICAgICogRXh0cmFjdCBhIG51bWVyaWMgbGl0ZXJhbCBvdXQgb2YgdGhlIG5leHQgc2VxdWVuY2Ugb2ZcbiAgICAgKiBjaGFyYWN0ZXJzIG9yIHJldHVybiAnbnVsbCcgaWYgaXRzIG5vdCBwb3NzaWJsZS4gVGhpcyBtZXRob2RcbiAgICAgKiBzdXBwb3J0cyBhbGwgbnVtZXJpYyBsaXRlcmFscyBkZXNjcmliZWQgaW4gc2VjdGlvbiA3LjguM1xuICAgICAqIG9mIHRoZSBFY21hU2NyaXB0IDUgc3BlY2lmaWNhdGlvbi5cbiAgICAgKlxuICAgICAqIFRoaXMgbWV0aG9kJ3MgaW1wbGVtZW50YXRpb24gd2FzIGhlYXZpbHkgaW5mbHVlbmNlZCBieSB0aGVcbiAgICAgKiBzY2FuTnVtZXJpY0xpdGVyYWwgZnVuY3Rpb24gaW4gdGhlIEVzcHJpbWEgcGFyc2VyJ3Mgc291cmNlIGNvZGUuXG4gICAgICovXG4gICAgc2Nhbk51bWVyaWNMaXRlcmFsKCk6IGFueSB7XG4gICAgICAgIHZhciBpbmRleCA9IDA7XG4gICAgICAgIHZhciB2YWx1ZSA9IFwiXCI7XG4gICAgICAgIHZhciBsZW5ndGggPSB0aGlzLmlucHV0Lmxlbmd0aDtcbiAgICAgICAgdmFyIGNoYXIgPSB0aGlzLnBlZWsoaW5kZXgpO1xuICAgICAgICB2YXIgYmFkO1xuICAgICAgICB2YXIgaXNBbGxvd2VkRGlnaXQgPSBpc0RlY2ltYWxEaWdpdDtcbiAgICAgICAgdmFyIGJhc2UgPSAxMDtcbiAgICAgICAgdmFyIGlzTGVnYWN5ID0gZmFsc2U7XG5cbiAgICAgICAgZnVuY3Rpb24gaXNEZWNpbWFsRGlnaXQoc3RyKSB7XG4gICAgICAgICAgICByZXR1cm4gKC9eWzAtOV0kLykudGVzdChzdHIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaXNPY3RhbERpZ2l0KHN0cikge1xuICAgICAgICAgICAgcmV0dXJuICgvXlswLTddJC8pLnRlc3Qoc3RyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGlzQmluYXJ5RGlnaXQoc3RyKSB7XG4gICAgICAgICAgICByZXR1cm4gKC9eWzAxXSQvKS50ZXN0KHN0cik7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBpc0hleERpZ2l0KHN0cikge1xuICAgICAgICAgICAgcmV0dXJuICgvXlswLTlhLWZBLUZdJC8pLnRlc3Qoc3RyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGlzSWRlbnRpZmllclN0YXJ0KGNoKSB7XG4gICAgICAgICAgICByZXR1cm4gKGNoID09PSBcIiRcIikgfHwgKGNoID09PSBcIl9cIikgfHwgKGNoID09PSBcIlxcXFxcIikgfHxcbiAgICAgICAgICAgICAgICAoY2ggPj0gXCJhXCIgJiYgY2ggPD0gXCJ6XCIpIHx8IChjaCA+PSBcIkFcIiAmJiBjaCA8PSBcIlpcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOdW1iZXJzIG11c3Qgc3RhcnQgZWl0aGVyIHdpdGggYSBkZWNpbWFsIGRpZ2l0IG9yIGEgcG9pbnQuXG5cbiAgICAgICAgaWYgKGNoYXIgIT09IFwiLlwiICYmICFpc0RlY2ltYWxEaWdpdChjaGFyKSkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2hhciAhPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcblxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBcIjBcIikge1xuICAgICAgICAgICAgICAgIC8vIEJhc2UtMTYgbnVtYmVycy5cbiAgICAgICAgICAgICAgICBpZiAoY2hhciA9PT0gXCJ4XCIgfHwgY2hhciA9PT0gXCJYXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNBbGxvd2VkRGlnaXQgPSBpc0hleERpZ2l0O1xuICAgICAgICAgICAgICAgICAgICBiYXNlID0gMTY7XG5cbiAgICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gY2hhcjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBCYXNlLTggbnVtYmVycy5cbiAgICAgICAgICAgICAgICBpZiAoY2hhciA9PT0gXCJvXCIgfHwgY2hhciA9PT0gXCJPXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNBbGxvd2VkRGlnaXQgPSBpc09jdGFsRGlnaXQ7XG4gICAgICAgICAgICAgICAgICAgIGJhc2UgPSA4O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUuaW5FUzYodHJ1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIndhcm5pbmdcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExOVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCJPY3RhbCBpbnRlZ2VyIGxpdGVyYWxcIiwgXCI2XCJdXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQmFzZS0yIG51bWJlcnMuXG4gICAgICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiYlwiIHx8IGNoYXIgPT09IFwiQlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlzQWxsb3dlZERpZ2l0ID0gaXNCaW5hcnlEaWdpdDtcbiAgICAgICAgICAgICAgICAgICAgYmFzZSA9IDI7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5pbkVTNih0cnVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogXCJXMTE5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IFtcIkJpbmFyeSBpbnRlZ2VyIGxpdGVyYWxcIiwgXCI2XCJdXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gTGVnYWN5IGJhc2UtOCBudW1iZXJzLlxuICAgICAgICAgICAgICAgIGlmIChpc09jdGFsRGlnaXQoY2hhcikpIHtcbiAgICAgICAgICAgICAgICAgICAgaXNBbGxvd2VkRGlnaXQgPSBpc09jdGFsRGlnaXQ7XG4gICAgICAgICAgICAgICAgICAgIGJhc2UgPSA4O1xuICAgICAgICAgICAgICAgICAgICBpc0xlZ2FjeSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJhZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRGVjaW1hbCBudW1iZXJzIHRoYXQgc3RhcnQgd2l0aCAnMCcgc3VjaCBhcyAnMDknIGFyZSBpbGxlZ2FsXG4gICAgICAgICAgICAgICAgLy8gYnV0IHdlIHN0aWxsIHBhcnNlIHRoZW0gYW5kIHJldHVybiBhcyBtYWxmb3JtZWQuXG5cbiAgICAgICAgICAgICAgICBpZiAoIWlzT2N0YWxEaWdpdChjaGFyKSAmJiBpc0RlY2ltYWxEaWdpdChjaGFyKSkge1xuICAgICAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSBjaGFyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUgKGluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgY2hhciA9IHRoaXMucGVlayhpbmRleCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNMZWdhY3kgJiYgaXNEZWNpbWFsRGlnaXQoY2hhcikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTnVtYmVycyBsaWtlICcwMTknIChub3RlIHRoZSA5KSBhcmUgbm90IHZhbGlkIG9jdGFsc1xuICAgICAgICAgICAgICAgICAgICAvLyBidXQgd2Ugc3RpbGwgcGFyc2UgdGhlbSBhbmQgbWFyayBhcyBtYWxmb3JtZWQuXG4gICAgICAgICAgICAgICAgICAgIGJhZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICghaXNBbGxvd2VkRGlnaXQoY2hhcikpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQWxsb3dlZERpZ2l0ICE9PSBpc0RlY2ltYWxEaWdpdCkge1xuICAgICAgICAgICAgICAgIGlmICghaXNMZWdhY3kgJiYgdmFsdWUubGVuZ3RoIDw9IDIpIHsgLy8gMHhcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLk51bWVyaWNMaXRlcmFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWxmb3JtZWQ6IHRydWVcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCBsZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgY2hhciA9IHRoaXMucGVlayhpbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0lkZW50aWZpZXJTdGFydChjaGFyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBUb2tlbi5OdW1lcmljTGl0ZXJhbCxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBiYXNlOiBiYXNlLFxuICAgICAgICAgICAgICAgICAgICBpc0xlZ2FjeTogaXNMZWdhY3ksXG4gICAgICAgICAgICAgICAgICAgIGlzTWFsZm9ybWVkOiBmYWxzZVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZWNpbWFsIGRpZ2l0cy5cblxuICAgICAgICBpZiAoY2hhciA9PT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuXG4gICAgICAgICAgICB3aGlsZSAoaW5kZXggPCBsZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAoIWlzRGVjaW1hbERpZ2l0KGNoYXIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBjaGFyO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeHBvbmVudCBwYXJ0LlxuXG4gICAgICAgIGlmIChjaGFyID09PSBcImVcIiB8fCBjaGFyID09PSBcIkVcIikge1xuICAgICAgICAgICAgdmFsdWUgKz0gY2hhcjtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiK1wiIHx8IGNoYXIgPT09IFwiLVwiKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgIGlmIChpc0RlY2ltYWxEaWdpdChjaGFyKSkge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcblxuICAgICAgICAgICAgICAgIHdoaWxlIChpbmRleCA8IGxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc0RlY2ltYWxEaWdpdChjaGFyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gY2hhcjtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgIGlmIChpc0lkZW50aWZpZXJTdGFydChjaGFyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6IFRva2VuLk51bWVyaWNMaXRlcmFsLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgYmFzZTogYmFzZSxcbiAgICAgICAgICAgIGlzTWFsZm9ybWVkOiAhaXNGaW5pdGUocGFyc2VGbG9hdCh2YWx1ZSkpXG4gICAgICAgIH07XG4gICAgfVxuXG5cbiAgICAvLyBBc3N1bWVzIHByZXZpb3VzbHkgcGFyc2VkIGNoYXJhY3RlciB3YXMgXFwgKD09PSAnXFxcXCcpIGFuZCB3YXMgbm90IHNraXBwZWQuXG4gICAgc2NhbkVzY2FwZVNlcXVlbmNlKGNoZWNrcykge1xuICAgICAgICB2YXIgYWxsb3dOZXdMaW5lID0gZmFsc2U7XG4gICAgICAgIHZhciBqdW1wID0gMTtcbiAgICAgICAgdGhpcy5za2lwKCk7XG4gICAgICAgIHZhciBjaGFyID0gdGhpcy5wZWVrKCk7XG5cbiAgICAgICAgc3dpdGNoIChjaGFyKSB7XG4gICAgICAgICAgICBjYXNlIFwiJ1wiOlxuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlckFzeW5jKFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExNFwiLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCJcXFxcJ1wiXVxuICAgICAgICAgICAgICAgIH0sIGNoZWNrcywgZnVuY3Rpb24oKSB7IHJldHVybiBzdGF0ZS5qc29uTW9kZTsgfSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYlwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFxiXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiZlwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFxmXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiblwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFxuXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiclwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFxyXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwidFwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFx0XCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiMFwiOlxuICAgICAgICAgICAgICAgIGNoYXIgPSBcIlxcXFwwXCI7XG5cbiAgICAgICAgICAgICAgICAvLyBPY3RhbCBsaXRlcmFscyBmYWlsIGluIHN0cmljdCBtb2RlLlxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBudW1iZXIgaXMgYmV0d2VlbiAwMCBhbmQgMDcuXG4gICAgICAgICAgICAgICAgdmFyIG4gPSBwYXJzZUludCh0aGlzLnBlZWsoMSksIDEwKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXJBc3luYyhcIndhcm5pbmdcIiwge1xuICAgICAgICAgICAgICAgICAgICBjb2RlOiBcIlcxMTVcIixcbiAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhclxuICAgICAgICAgICAgICAgIH0sIGNoZWNrcyxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBuID49IDAgJiYgbiA8PSA3ICYmIHN0YXRlLmlzU3RyaWN0KCk7IH0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInVcIjpcbiAgICAgICAgICAgICAgICB2YXIgaGV4Q29kZSA9IHRoaXMuaW5wdXQuc3Vic3RyKDEsIDQpO1xuICAgICAgICAgICAgICAgIHZhciBjb2RlID0gcGFyc2VJbnQoaGV4Q29kZSwgMTYpO1xuICAgICAgICAgICAgICAgIGlmIChpc05hTihjb2RlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzA1MlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCJ1XCIgKyBoZXhDb2RlXVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2hhciA9IFN0cmluZy5mcm9tQ2hhckNvZGUoY29kZSk7XG4gICAgICAgICAgICAgICAganVtcCA9IDU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwidlwiOlxuICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlckFzeW5jKFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExNFwiLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCJcXFxcdlwiXVxuICAgICAgICAgICAgICAgIH0sIGNoZWNrcywgZnVuY3Rpb24oKSB7IHJldHVybiBzdGF0ZS5qc29uTW9kZTsgfSk7XG5cbiAgICAgICAgICAgICAgICBjaGFyID0gXCJcXHZcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJ4XCI6XG4gICAgICAgICAgICAgICAgdmFyIHggPSBwYXJzZUludCh0aGlzLmlucHV0LnN1YnN0cigxLCAyKSwgMTYpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXN5bmMoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogXCJXMTE0XCIsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IFtcIlxcXFx4LVwiXVxuICAgICAgICAgICAgICAgIH0sIGNoZWNrcywgZnVuY3Rpb24oKSB7IHJldHVybiBzdGF0ZS5qc29uTW9kZTsgfSk7XG5cbiAgICAgICAgICAgICAgICBjaGFyID0gU3RyaW5nLmZyb21DaGFyQ29kZSh4KTtcbiAgICAgICAgICAgICAgICBqdW1wID0gMztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJcXFxcXCI6XG4gICAgICAgICAgICAgICAgY2hhciA9IFwiXFxcXFxcXFxcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJcXFwiXCI6XG4gICAgICAgICAgICAgICAgY2hhciA9IFwiXFxcXFxcXCJcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCIvXCI6XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiXCI6XG4gICAgICAgICAgICAgICAgYWxsb3dOZXdMaW5lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjaGFyID0gXCJcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IGNoYXI6IGNoYXIsIGp1bXA6IGp1bXAsIGFsbG93TmV3TGluZTogYWxsb3dOZXdMaW5lIH07XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBFeHRyYWN0IGEgdGVtcGxhdGUgbGl0ZXJhbCBvdXQgb2YgdGhlIG5leHQgc2VxdWVuY2Ugb2YgY2hhcmFjdGVyc1xuICAgICAqIGFuZC9vciBsaW5lcyBvciByZXR1cm4gJ251bGwnIGlmIGl0cyBub3QgcG9zc2libGUuIFNpbmNlIHRlbXBsYXRlXG4gICAgICogbGl0ZXJhbHMgY2FuIHNwYW4gYWNyb3NzIG11bHRpcGxlIGxpbmVzLCB0aGlzIG1ldGhvZCBoYXMgdG8gbW92ZVxuICAgICAqIHRoZSBjaGFyIHBvaW50ZXIuXG4gICAgICovXG4gICAgc2NhblRlbXBsYXRlTGl0ZXJhbChjaGVja3MpIHtcbiAgICAgICAgdmFyIHRva2VuVHlwZTtcbiAgICAgICAgdmFyIHZhbHVlID0gXCJcIjtcbiAgICAgICAgdmFyIGNoO1xuICAgICAgICB2YXIgc3RhcnRMaW5lID0gdGhpcy5saW5lO1xuICAgICAgICB2YXIgc3RhcnRDaGFyID0gdGhpcy5jaGFyO1xuICAgICAgICB2YXIgZGVwdGggPSB0aGlzLnRlbXBsYXRlU3RhcnRzLmxlbmd0aDtcblxuICAgICAgICBpZiAodGhpcy5wZWVrKCkgPT09IFwiYFwiKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmluRVM2KHRydWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExOVwiLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCJ0ZW1wbGF0ZSBsaXRlcmFsIHN5bnRheFwiLCBcIjZcIl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFRlbXBsYXRlIG11c3Qgc3RhcnQgd2l0aCBhIGJhY2t0aWNrLlxuICAgICAgICAgICAgdG9rZW5UeXBlID0gVG9rZW4uVGVtcGxhdGVIZWFkO1xuICAgICAgICAgICAgdGhpcy50ZW1wbGF0ZVN0YXJ0cy5wdXNoKHsgbGluZTogdGhpcy5saW5lLCBjaGFyOiB0aGlzLmNoYXIgfSk7XG4gICAgICAgICAgICBkZXB0aCA9IHRoaXMudGVtcGxhdGVTdGFydHMubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5za2lwKDEpO1xuICAgICAgICAgICAgdGhpcy5wdXNoQ29udGV4dChDb250ZXh0LlRlbXBsYXRlKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmluQ29udGV4dChDb250ZXh0LlRlbXBsYXRlKSAmJiB0aGlzLnBlZWsoKSA9PT0gXCJ9XCIpIHtcbiAgICAgICAgICAgIC8vIElmIHdlJ3JlIGluIGEgdGVtcGxhdGUgY29udGV4dCwgYW5kIHdlIGhhdmUgYSAnfScsIGxleCBhIFRlbXBsYXRlTWlkZGxlLlxuICAgICAgICAgICAgdG9rZW5UeXBlID0gVG9rZW4uVGVtcGxhdGVNaWRkbGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBHbyBsZXggc29tZXRoaW5nIGVsc2UuXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlICh0aGlzLnBlZWsoKSAhPT0gXCJgXCIpIHtcbiAgICAgICAgICAgIHdoaWxlICgoY2ggPSB0aGlzLnBlZWsoKSkgPT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5uZXh0TGluZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFVuY2xvc2VkIHRlbXBsYXRlIGxpdGVyYWwgLS0tIHBvaW50IHRvIHRoZSBzdGFydGluZyBcImBcIlxuICAgICAgICAgICAgICAgICAgICB2YXIgc3RhcnRQb3MgPSB0aGlzLnRlbXBsYXRlU3RhcnRzLnBvcCgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJlcnJvclwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBcIkUwNTJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHN0YXJ0UG9zLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHN0YXJ0UG9zLmNoYXJcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiB0b2tlblR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhcjogc3RhcnRDaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNVbmNsb3NlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoOiBkZXB0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHRoaXMucG9wQ29udGV4dCgpXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2ggPT09ICckJyAmJiB0aGlzLnBlZWsoMSkgPT09ICd7Jykge1xuICAgICAgICAgICAgICAgIHZhbHVlICs9ICckeyc7XG4gICAgICAgICAgICAgICAgdGhpcy5za2lwKDIpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnRDaGFyOiBzdGFydENoYXIsXG4gICAgICAgICAgICAgICAgICAgIGlzVW5jbG9zZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBkZXB0aDogZGVwdGgsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRleHQ6IHRoaXMuY3VycmVudENvbnRleHQoKVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoID09PSAnXFxcXCcpIHtcbiAgICAgICAgICAgICAgICB2YXIgZXNjYXBlID0gdGhpcy5zY2FuRXNjYXBlU2VxdWVuY2UoY2hlY2tzKTtcbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBlc2NhcGUuY2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnNraXAoZXNjYXBlLmp1bXApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjaCAhPT0gJ2AnKSB7XG4gICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlLCBhcHBlbmQgdGhlIHZhbHVlIGFuZCBjb250aW51ZS5cbiAgICAgICAgICAgICAgICB2YWx1ZSArPSBjaDtcbiAgICAgICAgICAgICAgICB0aGlzLnNraXAoMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbCB2YWx1ZSBpcyBlaXRoZXIgTm9TdWJzdFRlbXBsYXRlIG9yIFRlbXBsYXRlVGFpbFxuICAgICAgICB0b2tlblR5cGUgPSB0b2tlblR5cGUgPT09IFRva2VuLlRlbXBsYXRlSGVhZCA/IFRva2VuLk5vU3Vic3RUZW1wbGF0ZSA6IFRva2VuLlRlbXBsYXRlVGFpbDtcbiAgICAgICAgdGhpcy5za2lwKDEpO1xuICAgICAgICB0aGlzLnRlbXBsYXRlU3RhcnRzLnBvcCgpO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB0eXBlOiB0b2tlblR5cGUsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0TGluZSxcbiAgICAgICAgICAgIHN0YXJ0Q2hhcjogc3RhcnRDaGFyLFxuICAgICAgICAgICAgaXNVbmNsb3NlZDogZmFsc2UsXG4gICAgICAgICAgICBkZXB0aDogZGVwdGgsXG4gICAgICAgICAgICBjb250ZXh0OiB0aGlzLnBvcENvbnRleHQoKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qXG4gICAgICogRXh0cmFjdCBhIHN0cmluZyBvdXQgb2YgdGhlIG5leHQgc2VxdWVuY2Ugb2YgY2hhcmFjdGVycyBhbmQvb3JcbiAgICAgKiBsaW5lcyBvciByZXR1cm4gJ251bGwnIGlmIGl0cyBub3QgcG9zc2libGUuIFNpbmNlIHN0cmluZ3MgY2FuXG4gICAgICogc3BhbiBhY3Jvc3MgbXVsdGlwbGUgbGluZXMgdGhpcyBtZXRob2QgaGFzIHRvIG1vdmUgdGhlIGNoYXJcbiAgICAgKiBwb2ludGVyLlxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2QgcmVjb2duaXplcyBwc2V1ZG8tbXVsdGlsaW5lIEphdmFTY3JpcHQgc3RyaW5nczpcbiAgICAgKlxuICAgICAqICAgdmFyIHN0ciA9IFwiaGVsbG9cXFxuICAgICAqICAgd29ybGRcIjtcbiAgICAgKi9cbiAgICBzY2FuU3RyaW5nTGl0ZXJhbChjaGVja3MpIHtcbiAgICAgICAgLypqc2hpbnQgbG9vcGZ1bmM6dHJ1ZSAqL1xuICAgICAgICB2YXIgcXVvdGUgPSB0aGlzLnBlZWsoKTtcblxuICAgICAgICAvLyBTdHJpbmcgbXVzdCBzdGFydCB3aXRoIGEgcXVvdGUuXG4gICAgICAgIGlmIChxdW90ZSAhPT0gXCJcXFwiXCIgJiYgcXVvdGUgIT09IFwiJ1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEluIEpTT04gc3RyaW5ncyBtdXN0IGFsd2F5cyB1c2UgZG91YmxlIHF1b3Rlcy5cbiAgICAgICAgdGhpcy50cmlnZ2VyQXN5bmMoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgIGNvZGU6IFwiVzEwOFwiLFxuICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXIgLy8gKzE/XG4gICAgICAgIH0sIGNoZWNrcywgZnVuY3Rpb24oKSB7IHJldHVybiBzdGF0ZS5qc29uTW9kZSAmJiBxdW90ZSAhPT0gXCJcXFwiXCI7IH0pO1xuXG4gICAgICAgIHZhciB2YWx1ZSA9IFwiXCI7XG4gICAgICAgIHZhciBzdGFydExpbmUgPSB0aGlzLmxpbmU7XG4gICAgICAgIHZhciBzdGFydENoYXIgPSB0aGlzLmNoYXI7XG4gICAgICAgIHZhciBhbGxvd05ld0xpbmUgPSBmYWxzZTtcblxuICAgICAgICB0aGlzLnNraXAoKTtcblxuICAgICAgICB3aGlsZSAodGhpcy5wZWVrKCkgIT09IHF1b3RlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5wZWVrKCkgPT09IFwiXCIpIHsgLy8gRW5kIE9mIExpbmVcblxuICAgICAgICAgICAgICAgIC8vIElmIGFuIEVPTCBpcyBub3QgcHJlY2VkZWQgYnkgYSBiYWNrc2xhc2gsIHNob3cgYSB3YXJuaW5nXG4gICAgICAgICAgICAgICAgLy8gYW5kIHByb2NlZWQgbGlrZSBpdCB3YXMgYSBsZWdpdCBtdWx0aS1saW5lIHN0cmluZyB3aGVyZVxuICAgICAgICAgICAgICAgIC8vIGF1dGhvciBzaW1wbHkgZm9yZ290IHRvIGVzY2FwZSB0aGUgbmV3bGluZSBzeW1ib2wuXG4gICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAvLyBBbm90aGVyIGFwcHJvYWNoIGlzIHRvIGltcGxpY2l0bHkgY2xvc2UgYSBzdHJpbmcgb24gRU9MXG4gICAgICAgICAgICAgICAgLy8gYnV0IGl0IGdlbmVyYXRlcyB0b28gbWFueSBmYWxzZSBwb3NpdGl2ZXMuXG5cbiAgICAgICAgICAgICAgICBpZiAoIWFsbG93TmV3TGluZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExMlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXJcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dOZXdMaW5lID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gT3RoZXJ3aXNlIHNob3cgYSB3YXJuaW5nIGlmIG11bHRpc3RyIG9wdGlvbiB3YXMgbm90IHNldC5cbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIEpTT04sIHNob3cgd2FybmluZyBubyBtYXR0ZXIgd2hhdC5cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXJBc3luYyhcIndhcm5pbmdcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogXCJXMDQzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhclxuICAgICAgICAgICAgICAgICAgICB9LCBjaGVja3MsIGZ1bmN0aW9uKCkgeyByZXR1cm4gIXN0YXRlLm9wdGlvbi5tdWx0aXN0cjsgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXN5bmMoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzA0MlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXJcbiAgICAgICAgICAgICAgICAgICAgfSwgY2hlY2tzLCBmdW5jdGlvbigpIHsgcmV0dXJuIHN0YXRlLmpzb25Nb2RlICYmIHN0YXRlLm9wdGlvbi5tdWx0aXN0cjsgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgZ2V0IGFuIEVPRiBpbnNpZGUgb2YgYW4gdW5jbG9zZWQgc3RyaW5nLCBzaG93IGFuXG4gICAgICAgICAgICAgICAgLy8gZXJyb3IgYW5kIGltcGxpY2l0bHkgY2xvc2UgaXQgYXQgdGhlIEVPRiBwb2ludC5cblxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5uZXh0TGluZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcImVycm9yXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiRTAyOVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogc3RhcnRMaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiBzdGFydENoYXJcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFRva2VuLlN0cmluZ0xpdGVyYWwsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhcjogc3RhcnRDaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNVbmNsb3NlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1b3RlOiBxdW90ZVxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSBlbHNlIHsgLy8gQW55IGNoYXJhY3RlciBvdGhlciB0aGFuIEVuZCBPZiBMaW5lXG5cbiAgICAgICAgICAgICAgICBhbGxvd05ld0xpbmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB2YXIgY2hhciA9IHRoaXMucGVlaygpO1xuICAgICAgICAgICAgICAgIHZhciBqdW1wID0gMTsgLy8gQSBsZW5ndGggb2YgYSBqdW1wLCBhZnRlciB3ZSdyZSBkb25lXG4gICAgICAgICAgICAgICAgLy8gcGFyc2luZyB0aGlzIGNoYXJhY3Rlci5cblxuICAgICAgICAgICAgICAgIGlmIChjaGFyIDwgXCIgXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gV2FybiBhYm91dCBhIGNvbnRyb2wgY2hhcmFjdGVyIGluIGEgc3RyaW5nLlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExM1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBbXCI8bm9uLXByaW50YWJsZT5cIl1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gU3BlY2lhbCB0cmVhdG1lbnQgZm9yIHNvbWUgZXNjYXBlZCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgICAgIGlmIChjaGFyID09PSBcIlxcXFxcIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcGFyc2VkID0gdGhpcy5zY2FuRXNjYXBlU2VxdWVuY2UoY2hlY2tzKTtcbiAgICAgICAgICAgICAgICAgICAgY2hhciA9IHBhcnNlZC5jaGFyO1xuICAgICAgICAgICAgICAgICAgICBqdW1wID0gcGFyc2VkLmp1bXA7XG4gICAgICAgICAgICAgICAgICAgIGFsbG93TmV3TGluZSA9IHBhcnNlZC5hbGxvd05ld0xpbmU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFsdWUgKz0gY2hhcjtcbiAgICAgICAgICAgICAgICB0aGlzLnNraXAoanVtcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNraXAoKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6IFRva2VuLlN0cmluZ0xpdGVyYWwsXG4gICAgICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgICBzdGFydExpbmU6IHN0YXJ0TGluZSxcbiAgICAgICAgICAgIHN0YXJ0Q2hhcjogc3RhcnRDaGFyLFxuICAgICAgICAgICAgaXNVbmNsb3NlZDogZmFsc2UsXG4gICAgICAgICAgICBxdW90ZTogcXVvdGVcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEV4dHJhY3QgYSByZWd1bGFyIGV4cHJlc3Npb24gb3V0IG9mIHRoZSBuZXh0IHNlcXVlbmNlIG9mXG4gICAgICogY2hhcmFjdGVycyBhbmQvb3IgbGluZXMgb3IgcmV0dXJuICdudWxsJyBpZiBpdHMgbm90IHBvc3NpYmxlLlxuICAgICAqXG4gICAgICogVGhpcyBtZXRob2QgaXMgcGxhdGZvcm0gZGVwZW5kZW50OiBpdCBhY2NlcHRzIGFsbW9zdCBhbnlcbiAgICAgKiByZWd1bGFyIGV4cHJlc3Npb24gdmFsdWVzIGJ1dCB0aGVuIHRyaWVzIHRvIGNvbXBpbGUgYW5kIHJ1blxuICAgICAqIHRoZW0gdXNpbmcgc3lzdGVtJ3MgUmVnRXhwIG9iamVjdC4gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGFyZVxuICAgICAqIHJhcmUgZWRnZSBjYXNlcyB3aGVyZSBvbmUgSmF2YVNjcmlwdCBlbmdpbmUgY29tcGxhaW5zIGFib3V0XG4gICAgICogeW91ciByZWd1bGFyIGV4cHJlc3Npb24gd2hpbGUgb3RoZXJzIGRvbid0LlxuICAgICAqL1xuICAgIHNjYW5SZWdFeHAoKSB7XG4gICAgICAgIHZhciBpbmRleCA9IDA7XG4gICAgICAgIHZhciBsZW5ndGggPSB0aGlzLmlucHV0Lmxlbmd0aDtcbiAgICAgICAgdmFyIGNoYXIgPSB0aGlzLnBlZWsoKTtcbiAgICAgICAgdmFyIHZhbHVlID0gY2hhcjtcbiAgICAgICAgdmFyIGJvZHkgPSBcIlwiO1xuICAgICAgICB2YXIgZmxhZ3MgPSBbXTtcbiAgICAgICAgdmFyIG1hbGZvcm1lZCA9IGZhbHNlO1xuICAgICAgICB2YXIgaXNDaGFyU2V0ID0gZmFsc2U7XG4gICAgICAgIHZhciB0ZXJtaW5hdGVkO1xuXG4gICAgICAgIHZhciBzY2FuVW5leHBlY3RlZENoYXJzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvLyBVbmV4cGVjdGVkIGNvbnRyb2wgY2hhcmFjdGVyXG4gICAgICAgICAgICBpZiAoY2hhciA8IFwiIFwiKSB7XG4gICAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogXCJXMDQ4XCIsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXJcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVW5leHBlY3RlZCBlc2NhcGVkIGNoYXJhY3RlclxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiPFwiKSB7XG4gICAgICAgICAgICAgICAgbWFsZm9ybWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgY29kZTogXCJXMDQ5XCIsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgIGRhdGE6IFtjaGFyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyk7XG5cbiAgICAgICAgLy8gUmVndWxhciBleHByZXNzaW9ucyBtdXN0IHN0YXJ0IHdpdGggJy8nXG4gICAgICAgIGlmICghdGhpcy5wcmVyZWcgfHwgY2hhciAhPT0gXCIvXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgdGVybWluYXRlZCA9IGZhbHNlO1xuXG4gICAgICAgIC8vIFRyeSB0byBnZXQgZXZlcnl0aGluZyBpbiBiZXR3ZWVuIHNsYXNoZXMuIEEgY291cGxlIG9mXG4gICAgICAgIC8vIGNhc2VzIGFzaWRlIChzZWUgc2NhblVuZXhwZWN0ZWRDaGFycykgd2UgZG9uJ3QgcmVhbGx5XG4gICAgICAgIC8vIGNhcmUgd2hldGhlciB0aGUgcmVzdWx0aW5nIGV4cHJlc3Npb24gaXMgdmFsaWQgb3Igbm90LlxuICAgICAgICAvLyBXZSB3aWxsIGNoZWNrIHRoYXQgbGF0ZXIgdXNpbmcgdGhlIFJlZ0V4cCBvYmplY3QuXG5cbiAgICAgICAgd2hpbGUgKGluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG4gICAgICAgICAgICBib2R5ICs9IGNoYXI7XG5cbiAgICAgICAgICAgIGlmIChpc0NoYXJTZXQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hhciA9PT0gXCJdXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGVlayhpbmRleCAtIDEpICE9PSBcIlxcXFxcIiB8fCB0aGlzLnBlZWsoaW5kZXggLSAyKSA9PT0gXCJcXFxcXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzQ2hhclNldCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiXFxcXFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIGNoYXIgPSB0aGlzLnBlZWsoaW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICBib2R5ICs9IGNoYXI7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG5cbiAgICAgICAgICAgICAgICAgICAgc2NhblVuZXhwZWN0ZWRDaGFycygpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjaGFyID09PSBcIlxcXFxcIikge1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgY2hhciA9IHRoaXMucGVlayhpbmRleCk7XG4gICAgICAgICAgICAgICAgYm9keSArPSBjaGFyO1xuICAgICAgICAgICAgICAgIHZhbHVlICs9IGNoYXI7XG5cbiAgICAgICAgICAgICAgICBzY2FuVW5leHBlY3RlZENoYXJzKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY2hhciA9PT0gXCIvXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoYXIgPT09IFwiW1wiKSB7XG4gICAgICAgICAgICAgICAgaXNDaGFyU2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gXCIvXCIpIHtcbiAgICAgICAgICAgICAgICBib2R5ID0gYm9keS5zdWJzdHIoMCwgYm9keS5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgICAgICB0ZXJtaW5hdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQSByZWd1bGFyIGV4cHJlc3Npb24gdGhhdCB3YXMgbmV2ZXIgY2xvc2VkIGlzIGFuXG4gICAgICAgIC8vIGVycm9yIGZyb20gd2hpY2ggd2UgY2Fubm90IHJlY292ZXIuXG5cbiAgICAgICAgaWYgKCF0ZXJtaW5hdGVkKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJlcnJvclwiLCB7XG4gICAgICAgICAgICAgICAgY29kZTogXCJFMDE1XCIsXG4gICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5mcm9tXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHZvaWQgdGhpcy50cmlnZ2VyKFwiZmF0YWxcIiwge1xuICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmZyb21cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUGFyc2UgZmxhZ3MgKGlmIGFueSkuXG5cbiAgICAgICAgd2hpbGUgKGluZGV4IDwgbGVuZ3RoKSB7XG4gICAgICAgICAgICBjaGFyID0gdGhpcy5wZWVrKGluZGV4KTtcbiAgICAgICAgICAgIGlmICghL1tnaW1dLy50ZXN0KGNoYXIpKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmbGFncy5wdXNoKGNoYXIpO1xuICAgICAgICAgICAgdmFsdWUgKz0gY2hhcjtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayByZWd1bGFyIGV4cHJlc3Npb24gZm9yIGNvcnJlY3RuZXNzLlxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXcgUmVnRXhwKGJvZHksIGZsYWdzLmpvaW4oXCJcIikpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIG1hbGZvcm1lZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJlcnJvclwiLCB7XG4gICAgICAgICAgICAgICAgY29kZTogXCJFMDE2XCIsXG4gICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgIGRhdGE6IFtlcnIubWVzc2FnZV0gLy8gUGxhdGZvcm0gZGVwZW5kZW50IVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogVG9rZW4uUmVnRXhwLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICAgICAgZmxhZ3M6IGZsYWdzLFxuICAgICAgICAgICAgaXNNYWxmb3JtZWQ6IG1hbGZvcm1lZFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qXG4gICAgICogU2NhbiBmb3IgYW55IG9jY3VycmVuY2Ugb2Ygbm9uLWJyZWFraW5nIHNwYWNlcy4gTm9uLWJyZWFraW5nIHNwYWNlc1xuICAgICAqIGNhbiBiZSBtaXN0YWtlbmx5IHR5cGVkIG9uIE9TIFggd2l0aCBvcHRpb24tc3BhY2UuIE5vbiBVVEYtOCB3ZWJcbiAgICAgKiBwYWdlcyB3aXRoIG5vbi1icmVha2luZyBwYWdlcyBwcm9kdWNlIHN5bnRheCBlcnJvcnMuXG4gICAgICovXG4gICAgc2Nhbk5vbkJyZWFraW5nU3BhY2VzKCkge1xuICAgICAgICByZXR1cm4gc3RhdGUub3B0aW9uLm5vbmJzcCA/XG4gICAgICAgICAgICB0aGlzLmlucHV0LnNlYXJjaCgvKFxcdTAwQTApLykgOiAtMTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFNjYW4gZm9yIGNoYXJhY3RlcnMgdGhhdCBnZXQgc2lsZW50bHkgZGVsZXRlZCBieSBvbmUgb3IgbW9yZSBicm93c2Vycy5cbiAgICAgKi9cbiAgICBzY2FuVW5zYWZlQ2hhcnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmlucHV0LnNlYXJjaCh1bnNhZmVDaGFycyk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBQcm9kdWNlIHRoZSBuZXh0IHJhdyB0b2tlbiBvciByZXR1cm4gJ251bGwnIGlmIG5vIHRva2VucyBjYW4gYmUgbWF0Y2hlZC5cbiAgICAgKiBUaGlzIG1ldGhvZCBza2lwcyBvdmVyIGFsbCBzcGFjZSBjaGFyYWN0ZXJzLlxuICAgICAqL1xuICAgIG5leHQoY2hlY2tzKSB7XG4gICAgICAgIHRoaXMuZnJvbSA9IHRoaXMuY2hhcjtcblxuICAgICAgICAvLyBNb3ZlIHRvIHRoZSBuZXh0IG5vbi1zcGFjZSBjaGFyYWN0ZXIuXG4gICAgICAgIHdoaWxlICgvXFxzLy50ZXN0KHRoaXMucGVlaygpKSkge1xuICAgICAgICAgICAgdGhpcy5mcm9tICs9IDE7XG4gICAgICAgICAgICB0aGlzLnNraXAoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1ldGhvZHMgdGhhdCB3b3JrIHdpdGggbXVsdGktbGluZSBzdHJ1Y3R1cmVzIGFuZCBtb3ZlIHRoZVxuICAgICAgICAvLyBjaGFyYWN0ZXIgcG9pbnRlci5cblxuICAgICAgICB2YXIgbWF0Y2ggPSB0aGlzLnNjYW5Db21tZW50cygpIHx8XG4gICAgICAgICAgICB0aGlzLnNjYW5TdHJpbmdMaXRlcmFsKGNoZWNrcykgfHxcbiAgICAgICAgICAgIHRoaXMuc2NhblRlbXBsYXRlTGl0ZXJhbChjaGVja3MpO1xuXG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWV0aG9kcyB0aGF0IGRvbid0IG1vdmUgdGhlIGNoYXJhY3RlciBwb2ludGVyLlxuXG4gICAgICAgIG1hdGNoID1cbiAgICAgICAgICAgIHRoaXMuc2NhblJlZ0V4cCgpIHx8XG4gICAgICAgICAgICB0aGlzLnNjYW5QdW5jdHVhdG9yKCkgfHxcbiAgICAgICAgICAgIHRoaXMuc2NhbktleXdvcmQoKSB8fFxuICAgICAgICAgICAgdGhpcy5zY2FuSWRlbnRpZmllcigpIHx8XG4gICAgICAgICAgICB0aGlzLnNjYW5OdW1lcmljTGl0ZXJhbCgpO1xuXG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgLy8gRklYTUU6IENhbid0IHZlcmlmeSB0aGlzIHN0YXRpY2FsbHkuXG4gICAgICAgICAgICB0aGlzLnNraXAobWF0Y2hbJ3Rva2VuTGVuZ3RoJ10gfHwgbWF0Y2gudmFsdWUubGVuZ3RoKTtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5vIHRva2VuIGNvdWxkIGJlIG1hdGNoZWQsIGdpdmUgdXAuXG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBTd2l0Y2ggdG8gdGhlIG5leHQgbGluZSBhbmQgcmVzZXQgYWxsIGNoYXIgcG9pbnRlcnMuIE9uY2VcbiAgICAgKiBzd2l0Y2hlZCwgdGhpcyBtZXRob2QgYWxzbyBjaGVja3MgZm9yIG90aGVyIG1pbm9yIHdhcm5pbmdzLlxuICAgICAqL1xuICAgIG5leHRMaW5lKCkge1xuICAgICAgICB2YXIgY2hhcjtcblxuICAgICAgICBpZiAodGhpcy5saW5lID49IHRoaXMuZ2V0TGluZXMoKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5wdXQgPSB0aGlzLmdldExpbmVzKClbdGhpcy5saW5lXTtcbiAgICAgICAgdGhpcy5saW5lICs9IDE7XG4gICAgICAgIHRoaXMuY2hhciA9IDE7XG4gICAgICAgIHRoaXMuZnJvbSA9IDE7XG5cbiAgICAgICAgdmFyIGlucHV0VHJpbW1lZCA9IHRoaXMuaW5wdXQudHJpbSgpO1xuXG4gICAgICAgIHZhciBzdGFydHNXaXRoID0gZnVuY3Rpb24odW51c2VkMD86IHN0cmluZywgdW51c2VkMT86IHN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIHNvbWUoPGFueT5hcmd1bWVudHMsIGZ1bmN0aW9uKHByZWZpeDogc3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VHJpbW1lZC5pbmRleE9mKHByZWZpeCkgPT09IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgZW5kc1dpdGggPSBmdW5jdGlvbih1bnVzZWQ6IHN0cmluZykge1xuICAgICAgICAgICAgcmV0dXJuIHNvbWUoPGFueT5hcmd1bWVudHMsIGZ1bmN0aW9uKHN1ZmZpeDogc3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlucHV0VHJpbW1lZC5pbmRleE9mKHN1ZmZpeCwgaW5wdXRUcmltbWVkLmxlbmd0aCAtIHN1ZmZpeC5sZW5ndGgpICE9PSAtMTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpZ25vcmluZyBsaW50ZXIgZXJyb3JzLCByZXBsYWNlIHRoZSBpbnB1dCB3aXRoIGVtcHR5IHN0cmluZ1xuICAgICAgICAvLyBpZiBpdCBkb2Vzbid0IGFscmVhZHkgYXQgbGVhc3Qgc3RhcnQgb3IgZW5kIGEgbXVsdGktbGluZSBjb21tZW50XG4gICAgICAgIGlmICh0aGlzLmlnbm9yaW5nTGludGVyRXJyb3JzID09PSB0cnVlKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXJ0c1dpdGgoXCIvKlwiLCBcIi8vXCIpICYmICEodGhpcy5pbkNvbW1lbnQgJiYgZW5kc1dpdGgoXCIqL1wiKSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0ID0gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNoYXIgPSB0aGlzLnNjYW5Ob25CcmVha2luZ1NwYWNlcygpO1xuICAgICAgICBpZiAoY2hhciA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHsgY29kZTogXCJXMTI1XCIsIGxpbmU6IHRoaXMubGluZSwgY2hhcmFjdGVyOiBjaGFyICsgMSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5wdXQgPSB0aGlzLmlucHV0LnJlcGxhY2UoL1xcdC9nLCBzdGF0ZS50YWIpO1xuICAgICAgICBjaGFyID0gdGhpcy5zY2FuVW5zYWZlQ2hhcnMoKTtcblxuICAgICAgICBpZiAoY2hhciA+PSAwKSB7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHsgY29kZTogXCJXMTAwXCIsIGxpbmU6IHRoaXMubGluZSwgY2hhcmFjdGVyOiBjaGFyIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBsaW1pdCBvbiBsaW5lIGxlbmd0aCwgd2FybiB3aGVuIGxpbmVzIGdldCB0b29cbiAgICAgICAgLy8gbG9uZy5cblxuICAgICAgICBpZiAoIXRoaXMuaWdub3JpbmdMaW50ZXJFcnJvcnMgJiYgc3RhdGUub3B0aW9uLm1heGxlbiAmJlxuICAgICAgICAgICAgc3RhdGUub3B0aW9uLm1heGxlbiA8IHRoaXMuaW5wdXQubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgaW5Db21tZW50ID0gdGhpcy5pbkNvbW1lbnQgfHxcbiAgICAgICAgICAgICAgICBzdGFydHNXaXRoLmNhbGwoaW5wdXRUcmltbWVkLCBcIi8vXCIpIHx8XG4gICAgICAgICAgICAgICAgc3RhcnRzV2l0aC5jYWxsKGlucHV0VHJpbW1lZCwgXCIvKlwiKTtcblxuICAgICAgICAgICAgdmFyIHNob3VsZFRyaWdnZXJFcnJvciA9ICFpbkNvbW1lbnQgfHwgIW1heGxlbkV4Y2VwdGlvbi50ZXN0KGlucHV0VHJpbW1lZCk7XG5cbiAgICAgICAgICAgIGlmIChzaG91bGRUcmlnZ2VyRXJyb3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJ3YXJuaW5nXCIsIHsgY29kZTogXCJXMTAxXCIsIGxpbmU6IHRoaXMubGluZSwgY2hhcmFjdGVyOiB0aGlzLmlucHV0Lmxlbmd0aCB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogVGhpcyBpcyBzaW1wbHkgYSBzeW5vbnltIGZvciBuZXh0TGluZSgpIG1ldGhvZCB3aXRoIGEgZnJpZW5kbGllclxuICAgICAqIHB1YmxpYyBuYW1lLlxuICAgICAqL1xuICAgIHN0YXJ0KCkge1xuICAgICAgICB0aGlzLm5leHRMaW5lKCk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBQcm9kdWNlIHRoZSBuZXh0IHRva2VuLiBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBieSBhZHZhbmNlKCkgdG8gZ2V0XG4gICAgICogdGhlIG5leHQgdG9rZW4uIEl0IHJldHVybnMgYSB0b2tlbiBpbiBhIEpTTGludC1jb21wYXRpYmxlIGZvcm1hdC5cbiAgICAgKi9cbiAgICB0b2tlbigpIHtcbiAgICAgICAgLypqc2hpbnQgbG9vcGZ1bmM6dHJ1ZSAqL1xuICAgICAgICB2YXIgY2hlY2tzID0gYXN5bmNUcmlnZ2VyKCk7XG4gICAgICAgIHZhciB0b2tlbjtcblxuXG4gICAgICAgIGZ1bmN0aW9uIGlzUmVzZXJ2ZWQodG9rZW4sIGlzUHJvcGVydHkpIHtcbiAgICAgICAgICAgIGlmICghdG9rZW4ucmVzZXJ2ZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgbWV0YSA9IHRva2VuLm1ldGE7XG5cbiAgICAgICAgICAgIGlmIChtZXRhICYmIG1ldGEuaXNGdXR1cmVSZXNlcnZlZFdvcmQgJiYgc3RhdGUuaW5FUzUoKSkge1xuICAgICAgICAgICAgICAgIC8vIEVTMyBGdXR1cmVSZXNlcnZlZFdvcmQgaW4gYW4gRVM1IGVudmlyb25tZW50LlxuICAgICAgICAgICAgICAgIGlmICghbWV0YS5lczUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFNvbWUgRVM1IEZ1dHVyZVJlc2VydmVkV29yZCBpZGVudGlmaWVycyBhcmUgYWN0aXZlIG9ubHlcbiAgICAgICAgICAgICAgICAvLyB3aXRoaW4gYSBzdHJpY3QgbW9kZSBlbnZpcm9ubWVudC5cbiAgICAgICAgICAgICAgICBpZiAobWV0YS5zdHJpY3RPbmx5KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghc3RhdGUub3B0aW9uLnN0cmljdCAmJiAhc3RhdGUuaXNTdHJpY3QoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGlzUHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcm9kdWNlIGEgdG9rZW4gb2JqZWN0LlxuICAgICAgICB2YXIgY3JlYXRlID0gZnVuY3Rpb24odHlwZSwgdmFsdWUsIGlzUHJvcGVydHksIHRva2VuKSB7XG4gICAgICAgICAgICAvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuICAgICAgICAgICAgdmFyIG9iajtcblxuICAgICAgICAgICAgaWYgKHR5cGUgIT09IFwiKGVuZGxpbmUpXCIgJiYgdHlwZSAhPT0gXCIoZW5kKVwiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVyZWcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwiKHB1bmN0dWF0b3IpXCIpIHtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCIuXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCIpXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ+XCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCIjXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJdXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCIrK1wiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiLS1cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcmVnID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcmVnID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBvYmogPSBPYmplY3QuY3JlYXRlKHN0YXRlLnN5bnRheFt2YWx1ZV0gfHwgc3RhdGUuc3ludGF4W1wiKGVycm9yKVwiXSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSBcIihpZGVudGlmaWVyKVwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSBcInJldHVyblwiIHx8IHZhbHVlID09PSBcImNhc2VcIiB8fCB2YWx1ZSA9PT0gXCJ0eXBlb2ZcIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXJlZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN5bnRheFt2YWx1ZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgb2JqID0gT2JqZWN0LmNyZWF0ZShzdGF0ZS5zeW50YXhbdmFsdWVdIHx8IHN0YXRlLnN5bnRheFtcIihlcnJvcilcIl0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgY2FuJ3QgYmUgYSByZXNlcnZlZCBrZXl3b3JkLCByZXNldCB0aGUgb2JqZWN0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzUmVzZXJ2ZWQob2JqLCBpc1Byb3BlcnR5ICYmIHR5cGUgPT09IFwiKGlkZW50aWZpZXIpXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvYmogPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIW9iaikge1xuICAgICAgICAgICAgICAgIG9iaiA9IE9iamVjdC5jcmVhdGUoc3RhdGUuc3ludGF4W3R5cGVdKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgb2JqLmlkZW50aWZpZXIgPSAodHlwZSA9PT0gXCIoaWRlbnRpZmllcilcIik7XG4gICAgICAgICAgICBvYmoudHlwZSA9IG9iai50eXBlIHx8IHR5cGU7XG4gICAgICAgICAgICBvYmoudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIG9iai5saW5lID0gdGhpcy5saW5lO1xuICAgICAgICAgICAgb2JqLmNoYXJhY3RlciA9IHRoaXMuY2hhcjtcbiAgICAgICAgICAgIG9iai5mcm9tID0gdGhpcy5mcm9tO1xuICAgICAgICAgICAgaWYgKG9iai5pZGVudGlmaWVyICYmIHRva2VuKSBvYmoucmF3X3RleHQgPSB0b2tlbi50ZXh0IHx8IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnN0YXJ0TGluZSAmJiB0b2tlbi5zdGFydExpbmUgIT09IHRoaXMubGluZSkge1xuICAgICAgICAgICAgICAgIG9iai5zdGFydExpbmUgPSB0b2tlbi5zdGFydExpbmU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4uY29udGV4dCkge1xuICAgICAgICAgICAgICAgIC8vIENvbnRleHQgb2YgY3VycmVudCB0b2tlblxuICAgICAgICAgICAgICAgIG9iai5jb250ZXh0ID0gdG9rZW4uY29udGV4dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi5kZXB0aCkge1xuICAgICAgICAgICAgICAgIC8vIE5lc3RlZCB0ZW1wbGF0ZSBkZXB0aFxuICAgICAgICAgICAgICAgIG9iai5kZXB0aCA9IHRva2VuLmRlcHRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLmlzVW5jbG9zZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBNYXJrIHRva2VuIGFzIHVuY2xvc2VkIHN0cmluZyAvIHRlbXBsYXRlIGxpdGVyYWxcbiAgICAgICAgICAgICAgICBvYmouaXNVbmNsb3NlZCA9IHRva2VuLmlzVW5jbG9zZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc1Byb3BlcnR5ICYmIG9iai5pZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgICAgb2JqLmlzUHJvcGVydHkgPSBpc1Byb3BlcnR5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvYmouY2hlY2sgPSBjaGVja3MuY2hlY2s7XG5cbiAgICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgICBmb3IgKDsgOykge1xuICAgICAgICAgICAgaWYgKCF0aGlzLmlucHV0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLm5leHRMaW5lKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZShcIihlbmRsaW5lKVwiLCBcIlwiKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5leGhhdXN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5leGhhdXN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGUoXCIoZW5kKVwiLCBcIlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLm5leHQoY2hlY2tzKTtcblxuICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlucHV0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBVbmV4cGVjdGVkIGNoYXJhY3Rlci5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiZXJyb3JcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29kZTogXCJFMDI0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IFt0aGlzLnBlZWsoKV1cbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN3aXRjaCAodG9rZW4udHlwZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgVG9rZW4uU3RyaW5nTGl0ZXJhbDpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXN5bmMoXCJTdHJpbmdcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgZnJvbTogdGhpcy5mcm9tLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRMaW5lOiB0b2tlbi5zdGFydExpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydENoYXI6IHRva2VuLnN0YXJ0Q2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB0b2tlbi52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHF1b3RlOiB0b2tlbi5xdW90ZVxuICAgICAgICAgICAgICAgICAgICB9LCBjaGVja3MsIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZShcIihzdHJpbmcpXCIsIHRva2VuLnZhbHVlLCBudWxsLCB0b2tlbik7XG5cbiAgICAgICAgICAgICAgICBjYXNlIFRva2VuLlRlbXBsYXRlSGVhZDpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyKFwiVGVtcGxhdGVIZWFkXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYXI6IHRoaXMuY2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGZyb206IHRoaXMuZnJvbSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0TGluZTogdG9rZW4uc3RhcnRMaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRDaGFyOiB0b2tlbi5zdGFydENoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdG9rZW4udmFsdWVcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGUoXCIodGVtcGxhdGUpXCIsIHRva2VuLnZhbHVlLCBudWxsLCB0b2tlbik7XG5cbiAgICAgICAgICAgICAgICBjYXNlIFRva2VuLlRlbXBsYXRlTWlkZGxlOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJUZW1wbGF0ZU1pZGRsZVwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmZyb20sXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHRva2VuLnN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhcjogdG9rZW4uc3RhcnRDaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHRva2VuLnZhbHVlXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlKFwiKHRlbXBsYXRlIG1pZGRsZSlcIiwgdG9rZW4udmFsdWUsIG51bGwsIHRva2VuKTtcblxuICAgICAgICAgICAgICAgIGNhc2UgVG9rZW4uVGVtcGxhdGVUYWlsOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXIoXCJUZW1wbGF0ZVRhaWxcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgZnJvbTogdGhpcy5mcm9tLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRMaW5lOiB0b2tlbi5zdGFydExpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydENoYXI6IHRva2VuLnN0YXJ0Q2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB0b2tlbi52YWx1ZVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZShcIih0ZW1wbGF0ZSB0YWlsKVwiLCB0b2tlbi52YWx1ZSwgbnVsbCwgdG9rZW4pO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBUb2tlbi5Ob1N1YnN0VGVtcGxhdGU6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIk5vU3Vic3RUZW1wbGF0ZVwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmZyb20sXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydExpbmU6IHRva2VuLnN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhcjogdG9rZW4uc3RhcnRDaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHRva2VuLnZhbHVlXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlKFwiKG5vIHN1YnN0IHRlbXBsYXRlKVwiLCB0b2tlbi52YWx1ZSwgbnVsbCwgdG9rZW4pO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBUb2tlbi5JZGVudGlmaWVyOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRyaWdnZXJBc3luYyhcIklkZW50aWZpZXJcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgZnJvbTogdGhpcy5mcm9tLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdG9rZW4udmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICByYXdfbmFtZTogdG9rZW4udGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlzUHJvcGVydHk6IHN0YXRlLnRva2Vucy5jdXJyLmlkID09PSBcIi5cIlxuICAgICAgICAgICAgICAgICAgICB9LCBjaGVja3MsIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSk7XG5cbiAgICAgICAgICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgICAgICAgICAgY2FzZSBUb2tlbi5LZXl3b3JkOlxuICAgICAgICAgICAgICAgIGNhc2UgVG9rZW4uTnVsbExpdGVyYWw6XG4gICAgICAgICAgICAgICAgY2FzZSBUb2tlbi5Cb29sZWFuTGl0ZXJhbDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZShcIihpZGVudGlmaWVyKVwiLCB0b2tlbi52YWx1ZSwgc3RhdGUudG9rZW5zLmN1cnIuaWQgPT09IFwiLlwiLCB0b2tlbik7XG5cbiAgICAgICAgICAgICAgICBjYXNlIFRva2VuLk51bWVyaWNMaXRlcmFsOlxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4uaXNNYWxmb3JtZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIndhcm5pbmdcIiwge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzA0NVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBbdG9rZW4udmFsdWVdXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlckFzeW5jKFwid2FybmluZ1wiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2RlOiBcIlcxMTRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoYXJhY3RlcjogdGhpcy5jaGFyLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YTogW1wiMHgtXCJdXG4gICAgICAgICAgICAgICAgICAgIH0sIGNoZWNrcywgZnVuY3Rpb24oKSB7IHJldHVybiB0b2tlbi5iYXNlID09PSAxNiAmJiBzdGF0ZS5qc29uTW9kZTsgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy50cmlnZ2VyQXN5bmMoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvZGU6IFwiVzExNVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogdGhpcy5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hhcmFjdGVyOiB0aGlzLmNoYXJcbiAgICAgICAgICAgICAgICAgICAgfSwgY2hlY2tzLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBzdGF0ZS5pc1N0cmljdCgpICYmIHRva2VuLmJhc2UgPT09IDggJiYgdG9rZW4uaXNMZWdhY3k7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlcihcIk51bWJlclwiLCB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGFyOiB0aGlzLmNoYXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmZyb20sXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZTogdG9rZW4udmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXNlOiB0b2tlbi5iYXNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYWxmb3JtZWQ6IHRva2VuLm1hbGZvcm1lZFxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlKFwiKG51bWJlcilcIiwgdG9rZW4udmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBUb2tlbi5SZWdFeHA6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjcmVhdGUoXCIocmVnZXhwKVwiLCB0b2tlbi52YWx1ZSk7XG5cbiAgICAgICAgICAgICAgICBjYXNlIFRva2VuLkNvbW1lbnQ6XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlLnRva2Vucy5jdXJyLmNvbW1lbnQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbi5pc1NwZWNpYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICcoY29tbWVudCknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiB0b2tlbi52YWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBib2R5OiB0b2tlbi5ib2R5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IHRva2VuLmNvbW1lbnRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzU3BlY2lhbDogdG9rZW4uaXNTcGVjaWFsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IHRoaXMuY2hhcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tOiB0aGlzLmZyb21cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgXCJcIjpcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlKFwiKHB1bmN0dWF0b3IpXCIsIHRva2VuLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuIl19