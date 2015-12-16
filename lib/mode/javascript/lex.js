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
