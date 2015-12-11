/*!
CSSLint
Copyright (c) 2014 Nicole Sullivan and Nicholas C. Zakas. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the 'Software'), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
var parserlib = {};
(function () {
    function EventTarget() {
        this._listeners = {};
    }
    EventTarget.prototype = {
        constructor: EventTarget,
        addListener: function (type, listener) {
            if (!this._listeners[type]) {
                this._listeners[type] = [];
            }
            this._listeners[type].push(listener);
        },
        fire: function (event) {
            if (typeof event == "string") {
                event = { type: event };
            }
            if (typeof event.target != "undefined") {
                event.target = this;
            }
            if (typeof event.type == "undefined") {
                throw new Error("Event object missing 'type' property.");
            }
            if (this._listeners[event.type]) {
                var listeners = this._listeners[event.type].concat();
                for (var i = 0, len = listeners.length; i < len; i++) {
                    listeners[i].call(this, event);
                }
            }
        },
        removeListener: function (type, listener) {
            if (this._listeners[type]) {
                var listeners = this._listeners[type];
                for (var i = 0, len = listeners.length; i < len; i++) {
                    if (listeners[i] === listener) {
                        listeners.splice(i, 1);
                        break;
                    }
                }
            }
        }
    };
    function StringReader(text) {
        this._input = text.replace(/\n\r?/g, "\n");
        this._line = 1;
        this._col = 1;
        this._cursor = 0;
    }
    StringReader.prototype = {
        constructor: StringReader,
        getCol: function () {
            return this._col;
        },
        getLine: function () {
            return this._line;
        },
        eof: function () {
            return (this._cursor == this._input.length);
        },
        peek: function (count) {
            var c = null;
            count = (typeof count == "undefined" ? 1 : count);
            if (this._cursor < this._input.length) {
                c = this._input.charAt(this._cursor + count - 1);
            }
            return c;
        },
        read: function () {
            var c = null;
            if (this._cursor < this._input.length) {
                if (this._input.charAt(this._cursor) == "\n") {
                    this._line++;
                    this._col = 1;
                }
                else {
                    this._col++;
                }
                c = this._input.charAt(this._cursor++);
            }
            return c;
        },
        mark: function () {
            this._bookmark = {
                cursor: this._cursor,
                line: this._line,
                col: this._col
            };
        },
        reset: function () {
            if (this._bookmark) {
                this._cursor = this._bookmark.cursor;
                this._line = this._bookmark.line;
                this._col = this._bookmark.col;
                delete this._bookmark;
            }
        },
        readTo: function (pattern) {
            var buffer = "", c;
            while (buffer.length < pattern.length || buffer.lastIndexOf(pattern) != buffer.length - pattern.length) {
                c = this.read();
                if (c) {
                    buffer += c;
                }
                else {
                    throw new Error("Expected \"" + pattern + "\" at line " + this._line + ", col " + this._col + ".");
                }
            }
            return buffer;
        },
        readWhile: function (filter) {
            var buffer = "", c = this.read();
            while (c !== null && filter(c)) {
                buffer += c;
                c = this.read();
            }
            return buffer;
        },
        readMatch: function (matcher) {
            var source = this._input.substring(this._cursor), value = null;
            if (typeof matcher == "string") {
                if (source.indexOf(matcher) === 0) {
                    value = this.readCount(matcher.length);
                }
            }
            else if (matcher instanceof RegExp) {
                if (matcher.test(source)) {
                    value = this.readCount(RegExp.lastMatch.length);
                }
            }
            return value;
        },
        readCount: function (count) {
            var buffer = "";
            while (count--) {
                buffer += this.read();
            }
            return buffer;
        }
    };
    function SyntaxError(message, line, col) {
        this.col = col;
        this.line = line;
        this.message = message;
    }
    SyntaxError.prototype = new Error();
    function SyntaxUnit(text, line, col, type) {
        this.col = col;
        this.line = line;
        this.text = text;
        this.type = type;
    }
    SyntaxUnit.fromToken = function (token) {
        return new SyntaxUnit(token.value, token.startLine, token.startCol);
    };
    SyntaxUnit.prototype = {
        constructor: SyntaxUnit,
        valueOf: function () {
            return this.text;
        },
        toString: function () {
            return this.text;
        }
    };
    function TokenStreamBase(input, tokenData) {
        this._reader = input ? new StringReader(input.toString()) : null;
        this._token = null;
        this._tokenData = tokenData;
        this._lt = [];
        this._ltIndex = 0;
        this._ltIndexCache = [];
    }
    TokenStreamBase.createTokenData = function (tokens) {
        var nameMap = [], typeMap = {}, tokenData = tokens.concat([]), i = 0, len = tokenData.length + 1;
        tokenData.UNKNOWN = -1;
        tokenData.unshift({ name: "EOF" });
        for (; i < len; i++) {
            nameMap.push(tokenData[i].name);
            tokenData[tokenData[i].name] = i;
            if (tokenData[i].text) {
                typeMap[tokenData[i].text] = i;
            }
        }
        tokenData.name = function (tt) {
            return nameMap[tt];
        };
        tokenData.type = function (c) {
            return typeMap[c];
        };
        return tokenData;
    };
    TokenStreamBase.prototype = {
        constructor: TokenStreamBase,
        match: function (tokenTypes, channel) {
            if (!(tokenTypes instanceof Array)) {
                tokenTypes = [tokenTypes];
            }
            var tt = this.get(channel), i = 0, len = tokenTypes.length;
            while (i < len) {
                if (tt == tokenTypes[i++]) {
                    return true;
                }
            }
            this.unget();
            return false;
        },
        mustMatch: function (tokenTypes, channel) {
            var token;
            if (!(tokenTypes instanceof Array)) {
                tokenTypes = [tokenTypes];
            }
            if (!this.match.apply(this, arguments)) {
                token = this.LT(1);
                throw new SyntaxError("Expected " + this._tokenData[tokenTypes[0]].name +
                    " at line " + token.startLine + ", col " + token.startCol + ".", token.startLine, token.startCol);
            }
        },
        advance: function (tokenTypes, channel) {
            while (this.LA(0) !== 0 && !this.match(tokenTypes, channel)) {
                this.get();
            }
            return this.LA(0);
        },
        get: function (channel) {
            var tokenInfo = this._tokenData, reader = this._reader, value, i = 0, len = tokenInfo.length, found = false, token, info;
            if (this._lt.length && this._ltIndex >= 0 && this._ltIndex < this._lt.length) {
                i++;
                this._token = this._lt[this._ltIndex++];
                info = tokenInfo[this._token.type];
                while ((info.channel !== undefined && channel !== info.channel) &&
                    this._ltIndex < this._lt.length) {
                    this._token = this._lt[this._ltIndex++];
                    info = tokenInfo[this._token.type];
                    i++;
                }
                if ((info.channel === undefined || channel === info.channel) &&
                    this._ltIndex <= this._lt.length) {
                    this._ltIndexCache.push(i);
                    return this._token.type;
                }
            }
            token = this._getToken();
            if (token.type > -1 && !tokenInfo[token.type].hide) {
                token.channel = tokenInfo[token.type].channel;
                this._token = token;
                this._lt.push(token);
                this._ltIndexCache.push(this._lt.length - this._ltIndex + i);
                if (this._lt.length > 5) {
                    this._lt.shift();
                }
                if (this._ltIndexCache.length > 5) {
                    this._ltIndexCache.shift();
                }
                this._ltIndex = this._lt.length;
            }
            info = tokenInfo[token.type];
            if (info &&
                (info.hide ||
                    (info.channel !== undefined && channel !== info.channel))) {
                return this.get(channel);
            }
            else {
                return token.type;
            }
        },
        LA: function (index) {
            var total = index, tt;
            if (index > 0) {
                if (index > 5) {
                    throw new Error("Too much lookahead.");
                }
                while (total) {
                    tt = this.get();
                    total--;
                }
                while (total < index) {
                    this.unget();
                    total++;
                }
            }
            else if (index < 0) {
                if (this._lt[this._ltIndex + index]) {
                    tt = this._lt[this._ltIndex + index].type;
                }
                else {
                    throw new Error("Too much lookbehind.");
                }
            }
            else {
                tt = this._token.type;
            }
            return tt;
        },
        LT: function (index) {
            this.LA(index);
            return this._lt[this._ltIndex + index - 1];
        },
        peek: function () {
            return this.LA(1);
        },
        token: function () {
            return this._token;
        },
        tokenName: function (tokenType) {
            if (tokenType < 0 || tokenType > this._tokenData.length) {
                return "UNKNOWN_TOKEN";
            }
            else {
                return this._tokenData[tokenType].name;
            }
        },
        tokenType: function (tokenName) {
            return this._tokenData[tokenName] || -1;
        },
        unget: function () {
            if (this._ltIndexCache.length) {
                this._ltIndex -= this._ltIndexCache.pop();
                this._token = this._lt[this._ltIndex - 1];
            }
            else {
                throw new Error("Too much lookahead.");
            }
        }
    };
    parserlib.util = {
        StringReader: StringReader,
        SyntaxError: SyntaxError,
        SyntaxUnit: SyntaxUnit,
        EventTarget: EventTarget,
        TokenStreamBase: TokenStreamBase
    };
})();
(function () {
    var EventTarget = parserlib.util.EventTarget, TokenStreamBase = parserlib.util.TokenStreamBase, StringReader = parserlib.util.StringReader, SyntaxError = parserlib.util.SyntaxError, SyntaxUnit = parserlib.util.SyntaxUnit;
    var Colors = {
        aliceblue: "#f0f8ff",
        antiquewhite: "#faebd7",
        aqua: "#00ffff",
        aquamarine: "#7fffd4",
        azure: "#f0ffff",
        beige: "#f5f5dc",
        bisque: "#ffe4c4",
        black: "#000000",
        blanchedalmond: "#ffebcd",
        blue: "#0000ff",
        blueviolet: "#8a2be2",
        brown: "#a52a2a",
        burlywood: "#deb887",
        cadetblue: "#5f9ea0",
        chartreuse: "#7fff00",
        chocolate: "#d2691e",
        coral: "#ff7f50",
        cornflowerblue: "#6495ed",
        cornsilk: "#fff8dc",
        crimson: "#dc143c",
        cyan: "#00ffff",
        darkblue: "#00008b",
        darkcyan: "#008b8b",
        darkgoldenrod: "#b8860b",
        darkgray: "#a9a9a9",
        darkgrey: "#a9a9a9",
        darkgreen: "#006400",
        darkkhaki: "#bdb76b",
        darkmagenta: "#8b008b",
        darkolivegreen: "#556b2f",
        darkorange: "#ff8c00",
        darkorchid: "#9932cc",
        darkred: "#8b0000",
        darksalmon: "#e9967a",
        darkseagreen: "#8fbc8f",
        darkslateblue: "#483d8b",
        darkslategray: "#2f4f4f",
        darkslategrey: "#2f4f4f",
        darkturquoise: "#00ced1",
        darkviolet: "#9400d3",
        deeppink: "#ff1493",
        deepskyblue: "#00bfff",
        dimgray: "#696969",
        dimgrey: "#696969",
        dodgerblue: "#1e90ff",
        firebrick: "#b22222",
        floralwhite: "#fffaf0",
        forestgreen: "#228b22",
        fuchsia: "#ff00ff",
        gainsboro: "#dcdcdc",
        ghostwhite: "#f8f8ff",
        gold: "#ffd700",
        goldenrod: "#daa520",
        gray: "#808080",
        grey: "#808080",
        green: "#008000",
        greenyellow: "#adff2f",
        honeydew: "#f0fff0",
        hotpink: "#ff69b4",
        indianred: "#cd5c5c",
        indigo: "#4b0082",
        ivory: "#fffff0",
        khaki: "#f0e68c",
        lavender: "#e6e6fa",
        lavenderblush: "#fff0f5",
        lawngreen: "#7cfc00",
        lemonchiffon: "#fffacd",
        lightblue: "#add8e6",
        lightcoral: "#f08080",
        lightcyan: "#e0ffff",
        lightgoldenrodyellow: "#fafad2",
        lightgray: "#d3d3d3",
        lightgrey: "#d3d3d3",
        lightgreen: "#90ee90",
        lightpink: "#ffb6c1",
        lightsalmon: "#ffa07a",
        lightseagreen: "#20b2aa",
        lightskyblue: "#87cefa",
        lightslategray: "#778899",
        lightslategrey: "#778899",
        lightsteelblue: "#b0c4de",
        lightyellow: "#ffffe0",
        lime: "#00ff00",
        limegreen: "#32cd32",
        linen: "#faf0e6",
        magenta: "#ff00ff",
        maroon: "#800000",
        mediumaquamarine: "#66cdaa",
        mediumblue: "#0000cd",
        mediumorchid: "#ba55d3",
        mediumpurple: "#9370d8",
        mediumseagreen: "#3cb371",
        mediumslateblue: "#7b68ee",
        mediumspringgreen: "#00fa9a",
        mediumturquoise: "#48d1cc",
        mediumvioletred: "#c71585",
        midnightblue: "#191970",
        mintcream: "#f5fffa",
        mistyrose: "#ffe4e1",
        moccasin: "#ffe4b5",
        navajowhite: "#ffdead",
        navy: "#000080",
        oldlace: "#fdf5e6",
        olive: "#808000",
        olivedrab: "#6b8e23",
        orange: "#ffa500",
        orangered: "#ff4500",
        orchid: "#da70d6",
        palegoldenrod: "#eee8aa",
        palegreen: "#98fb98",
        paleturquoise: "#afeeee",
        palevioletred: "#d87093",
        papayawhip: "#ffefd5",
        peachpuff: "#ffdab9",
        peru: "#cd853f",
        pink: "#ffc0cb",
        plum: "#dda0dd",
        powderblue: "#b0e0e6",
        purple: "#800080",
        red: "#ff0000",
        rosybrown: "#bc8f8f",
        royalblue: "#4169e1",
        saddlebrown: "#8b4513",
        salmon: "#fa8072",
        sandybrown: "#f4a460",
        seagreen: "#2e8b57",
        seashell: "#fff5ee",
        sienna: "#a0522d",
        silver: "#c0c0c0",
        skyblue: "#87ceeb",
        slateblue: "#6a5acd",
        slategray: "#708090",
        slategrey: "#708090",
        snow: "#fffafa",
        springgreen: "#00ff7f",
        steelblue: "#4682b4",
        tan: "#d2b48c",
        teal: "#008080",
        thistle: "#d8bfd8",
        tomato: "#ff6347",
        turquoise: "#40e0d0",
        violet: "#ee82ee",
        wheat: "#f5deb3",
        white: "#ffffff",
        whitesmoke: "#f5f5f5",
        yellow: "#ffff00",
        yellowgreen: "#9acd32",
        activeBorder: "Active window border.",
        activecaption: "Active window caption.",
        appworkspace: "Background color of multiple document interface.",
        background: "Desktop background.",
        buttonface: "The face background color for 3-D elements that appear 3-D due to one layer of surrounding border.",
        buttonhighlight: "The color of the border facing the light source for 3-D elements that appear 3-D due to one layer of surrounding border.",
        buttonshadow: "The color of the border away from the light source for 3-D elements that appear 3-D due to one layer of surrounding border.",
        buttontext: "Text on push buttons.",
        captiontext: "Text in caption, size box, and scrollbar arrow box.",
        graytext: "Grayed (disabled) text. This color is set to #000 if the current display driver does not support a solid gray color.",
        greytext: "Greyed (disabled) text. This color is set to #000 if the current display driver does not support a solid grey color.",
        highlight: "Item(s) selected in a control.",
        highlighttext: "Text of item(s) selected in a control.",
        inactiveborder: "Inactive window border.",
        inactivecaption: "Inactive window caption.",
        inactivecaptiontext: "Color of text in an inactive caption.",
        infobackground: "Background color for tooltip controls.",
        infotext: "Text color for tooltip controls.",
        menu: "Menu background.",
        menutext: "Text in menus.",
        scrollbar: "Scroll bar gray area.",
        threeddarkshadow: "The color of the darker (generally outer) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.",
        threedface: "The face background color for 3-D elements that appear 3-D due to two concentric layers of surrounding border.",
        threedhighlight: "The color of the lighter (generally outer) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.",
        threedlightshadow: "The color of the darker (generally inner) of the two borders facing the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.",
        threedshadow: "The color of the lighter (generally inner) of the two borders away from the light source for 3-D elements that appear 3-D due to two concentric layers of surrounding border.",
        window: "Window background.",
        windowframe: "Window frame.",
        windowtext: "Text in windows."
    };
    function Combinator(text, line, col) {
        SyntaxUnit.call(this, text, line, col, Parser.COMBINATOR_TYPE);
        this.type = "unknown";
        if (/^\s+$/.test(text)) {
            this.type = "descendant";
        }
        else if (text == ">") {
            this.type = "child";
        }
        else if (text == "+") {
            this.type = "adjacent-sibling";
        }
        else if (text == "~") {
            this.type = "sibling";
        }
    }
    Combinator.prototype = new SyntaxUnit();
    Combinator.prototype.constructor = Combinator;
    function MediaFeature(name, value) {
        SyntaxUnit.call(this, "(" + name + (value !== null ? ":" + value : "") + ")", name.startLine, name.startCol, Parser.MEDIA_FEATURE_TYPE);
        this.name = name;
        this.value = value;
    }
    MediaFeature.prototype = new SyntaxUnit();
    MediaFeature.prototype.constructor = MediaFeature;
    function MediaQuery(modifier, mediaType, features, line, col) {
        SyntaxUnit.call(this, (modifier ? modifier + " " : "") + (mediaType ? mediaType : "") + (mediaType && features.length > 0 ? " and " : "") + features.join(" and "), line, col, Parser.MEDIA_QUERY_TYPE);
        this.modifier = modifier;
        this.mediaType = mediaType;
        this.features = features;
    }
    MediaQuery.prototype = new SyntaxUnit();
    MediaQuery.prototype.constructor = MediaQuery;
    function Parser(options) {
        EventTarget.call(this);
        this.options = options || {};
        this._tokenStream = null;
    }
    Parser.DEFAULT_TYPE = 0;
    Parser.COMBINATOR_TYPE = 1;
    Parser.MEDIA_FEATURE_TYPE = 2;
    Parser.MEDIA_QUERY_TYPE = 3;
    Parser.PROPERTY_NAME_TYPE = 4;
    Parser.PROPERTY_VALUE_TYPE = 5;
    Parser.PROPERTY_VALUE_PART_TYPE = 6;
    Parser.SELECTOR_TYPE = 7;
    Parser.SELECTOR_PART_TYPE = 8;
    Parser.SELECTOR_SUB_PART_TYPE = 9;
    Parser.prototype = function () {
        var proto = new EventTarget(), prop, additions = {
            constructor: Parser,
            DEFAULT_TYPE: 0,
            COMBINATOR_TYPE: 1,
            MEDIA_FEATURE_TYPE: 2,
            MEDIA_QUERY_TYPE: 3,
            PROPERTY_NAME_TYPE: 4,
            PROPERTY_VALUE_TYPE: 5,
            PROPERTY_VALUE_PART_TYPE: 6,
            SELECTOR_TYPE: 7,
            SELECTOR_PART_TYPE: 8,
            SELECTOR_SUB_PART_TYPE: 9,
            _stylesheet: function () {
                var tokenStream = this._tokenStream, charset = null, count, token, tt;
                this.fire("startstylesheet");
                this._charset();
                this._skipCruft();
                while (tokenStream.peek() == Tokens.IMPORT_SYM) {
                    this._import();
                    this._skipCruft();
                }
                while (tokenStream.peek() == Tokens.NAMESPACE_SYM) {
                    this._namespace();
                    this._skipCruft();
                }
                tt = tokenStream.peek();
                while (tt > Tokens.EOF) {
                    try {
                        switch (tt) {
                            case Tokens.MEDIA_SYM:
                                this._media();
                                this._skipCruft();
                                break;
                            case Tokens.PAGE_SYM:
                                this._page();
                                this._skipCruft();
                                break;
                            case Tokens.FONT_FACE_SYM:
                                this._font_face();
                                this._skipCruft();
                                break;
                            case Tokens.KEYFRAMES_SYM:
                                this._keyframes();
                                this._skipCruft();
                                break;
                            case Tokens.VIEWPORT_SYM:
                                this._viewport();
                                this._skipCruft();
                                break;
                            case Tokens.UNKNOWN_SYM:
                                tokenStream.get();
                                if (!this.options.strict) {
                                    this.fire({
                                        type: "error",
                                        error: null,
                                        message: "Unknown @ rule: " + tokenStream.LT(0).value + ".",
                                        line: tokenStream.LT(0).startLine,
                                        col: tokenStream.LT(0).startCol
                                    });
                                    count = 0;
                                    while (tokenStream.advance([Tokens.LBRACE, Tokens.RBRACE]) == Tokens.LBRACE) {
                                        count++;
                                    }
                                    while (count) {
                                        tokenStream.advance([Tokens.RBRACE]);
                                        count--;
                                    }
                                }
                                else {
                                    throw new SyntaxError("Unknown @ rule.", tokenStream.LT(0).startLine, tokenStream.LT(0).startCol);
                                }
                                break;
                            case Tokens.S:
                                this._readWhitespace();
                                break;
                            default:
                                if (!this._ruleset()) {
                                    switch (tt) {
                                        case Tokens.CHARSET_SYM:
                                            token = tokenStream.LT(1);
                                            this._charset(false);
                                            throw new SyntaxError("@charset not allowed here.", token.startLine, token.startCol);
                                        case Tokens.IMPORT_SYM:
                                            token = tokenStream.LT(1);
                                            this._import(false);
                                            throw new SyntaxError("@import not allowed here.", token.startLine, token.startCol);
                                        case Tokens.NAMESPACE_SYM:
                                            token = tokenStream.LT(1);
                                            this._namespace(false);
                                            throw new SyntaxError("@namespace not allowed here.", token.startLine, token.startCol);
                                        default:
                                            tokenStream.get();
                                            this._unexpectedToken(tokenStream.token());
                                    }
                                }
                        }
                    }
                    catch (ex) {
                        if (ex instanceof SyntaxError && !this.options.strict) {
                            this.fire({
                                type: "error",
                                error: ex,
                                message: ex.message,
                                line: ex.line,
                                col: ex.col
                            });
                        }
                        else {
                            throw ex;
                        }
                    }
                    tt = tokenStream.peek();
                }
                if (tt != Tokens.EOF) {
                    this._unexpectedToken(tokenStream.token());
                }
                this.fire("endstylesheet");
            },
            _charset: function (emit) {
                var tokenStream = this._tokenStream, charset, token, line, col;
                if (tokenStream.match(Tokens.CHARSET_SYM)) {
                    line = tokenStream.token().startLine;
                    col = tokenStream.token().startCol;
                    this._readWhitespace();
                    tokenStream.mustMatch(Tokens.STRING);
                    token = tokenStream.token();
                    charset = token.value;
                    this._readWhitespace();
                    tokenStream.mustMatch(Tokens.SEMICOLON);
                    if (emit !== false) {
                        this.fire({
                            type: "charset",
                            charset: charset,
                            line: line,
                            col: col
                        });
                    }
                }
            },
            _import: function (emit) {
                var tokenStream = this._tokenStream, tt, uri, importToken, mediaList = [];
                tokenStream.mustMatch(Tokens.IMPORT_SYM);
                importToken = tokenStream.token();
                this._readWhitespace();
                tokenStream.mustMatch([Tokens.STRING, Tokens.URI]);
                uri = tokenStream.token().value.replace(/^(?:url\()?["']?([^"']+?)["']?\)?$/, "$1");
                this._readWhitespace();
                mediaList = this._media_query_list();
                tokenStream.mustMatch(Tokens.SEMICOLON);
                this._readWhitespace();
                if (emit !== false) {
                    this.fire({
                        type: "import",
                        uri: uri,
                        media: mediaList,
                        line: importToken.startLine,
                        col: importToken.startCol
                    });
                }
            },
            _namespace: function (emit) {
                var tokenStream = this._tokenStream, line, col, prefix, uri;
                tokenStream.mustMatch(Tokens.NAMESPACE_SYM);
                line = tokenStream.token().startLine;
                col = tokenStream.token().startCol;
                this._readWhitespace();
                if (tokenStream.match(Tokens.IDENT)) {
                    prefix = tokenStream.token().value;
                    this._readWhitespace();
                }
                tokenStream.mustMatch([Tokens.STRING, Tokens.URI]);
                uri = tokenStream.token().value.replace(/(?:url\()?["']([^"']+)["']\)?/, "$1");
                this._readWhitespace();
                tokenStream.mustMatch(Tokens.SEMICOLON);
                this._readWhitespace();
                if (emit !== false) {
                    this.fire({
                        type: "namespace",
                        prefix: prefix,
                        uri: uri,
                        line: line,
                        col: col
                    });
                }
            },
            _media: function () {
                var tokenStream = this._tokenStream, line, col, mediaList;
                tokenStream.mustMatch(Tokens.MEDIA_SYM);
                line = tokenStream.token().startLine;
                col = tokenStream.token().startCol;
                this._readWhitespace();
                mediaList = this._media_query_list();
                tokenStream.mustMatch(Tokens.LBRACE);
                this._readWhitespace();
                this.fire({
                    type: "startmedia",
                    media: mediaList,
                    line: line,
                    col: col
                });
                while (true) {
                    if (tokenStream.peek() == Tokens.PAGE_SYM) {
                        this._page();
                    }
                    else if (tokenStream.peek() == Tokens.FONT_FACE_SYM) {
                        this._font_face();
                    }
                    else if (tokenStream.peek() == Tokens.VIEWPORT_SYM) {
                        this._viewport();
                    }
                    else if (!this._ruleset()) {
                        break;
                    }
                }
                tokenStream.mustMatch(Tokens.RBRACE);
                this._readWhitespace();
                this.fire({
                    type: "endmedia",
                    media: mediaList,
                    line: line,
                    col: col
                });
            },
            _media_query_list: function () {
                var tokenStream = this._tokenStream, mediaList = [];
                this._readWhitespace();
                if (tokenStream.peek() == Tokens.IDENT || tokenStream.peek() == Tokens.LPAREN) {
                    mediaList.push(this._media_query());
                }
                while (tokenStream.match(Tokens.COMMA)) {
                    this._readWhitespace();
                    mediaList.push(this._media_query());
                }
                return mediaList;
            },
            _media_query: function () {
                var tokenStream = this._tokenStream, type = null, ident = null, token = null, expressions = [];
                if (tokenStream.match(Tokens.IDENT)) {
                    ident = tokenStream.token().value.toLowerCase();
                    if (ident != "only" && ident != "not") {
                        tokenStream.unget();
                        ident = null;
                    }
                    else {
                        token = tokenStream.token();
                    }
                }
                this._readWhitespace();
                if (tokenStream.peek() == Tokens.IDENT) {
                    type = this._media_type();
                    if (token === null) {
                        token = tokenStream.token();
                    }
                }
                else if (tokenStream.peek() == Tokens.LPAREN) {
                    if (token === null) {
                        token = tokenStream.LT(1);
                    }
                    expressions.push(this._media_expression());
                }
                if (type === null && expressions.length === 0) {
                    return null;
                }
                else {
                    this._readWhitespace();
                    while (tokenStream.match(Tokens.IDENT)) {
                        if (tokenStream.token().value.toLowerCase() != "and") {
                            this._unexpectedToken(tokenStream.token());
                        }
                        this._readWhitespace();
                        expressions.push(this._media_expression());
                    }
                }
                return new MediaQuery(ident, type, expressions, token.startLine, token.startCol);
            },
            _media_type: function () {
                return this._media_feature();
            },
            _media_expression: function () {
                var tokenStream = this._tokenStream, feature = null, token, expression = null;
                tokenStream.mustMatch(Tokens.LPAREN);
                feature = this._media_feature();
                this._readWhitespace();
                if (tokenStream.match(Tokens.COLON)) {
                    this._readWhitespace();
                    token = tokenStream.LT(1);
                    expression = this._expression();
                }
                tokenStream.mustMatch(Tokens.RPAREN);
                this._readWhitespace();
                return new MediaFeature(feature, (expression ? new SyntaxUnit(expression, token.startLine, token.startCol) : null));
            },
            _media_feature: function () {
                var tokenStream = this._tokenStream;
                tokenStream.mustMatch(Tokens.IDENT);
                return SyntaxUnit.fromToken(tokenStream.token());
            },
            _page: function () {
                var tokenStream = this._tokenStream, line, col, identifier = null, pseudoPage = null;
                tokenStream.mustMatch(Tokens.PAGE_SYM);
                line = tokenStream.token().startLine;
                col = tokenStream.token().startCol;
                this._readWhitespace();
                if (tokenStream.match(Tokens.IDENT)) {
                    identifier = tokenStream.token().value;
                    if (identifier.toLowerCase() === "auto") {
                        this._unexpectedToken(tokenStream.token());
                    }
                }
                if (tokenStream.peek() == Tokens.COLON) {
                    pseudoPage = this._pseudo_page();
                }
                this._readWhitespace();
                this.fire({
                    type: "startpage",
                    id: identifier,
                    pseudo: pseudoPage,
                    line: line,
                    col: col
                });
                this._readDeclarations(true, true);
                this.fire({
                    type: "endpage",
                    id: identifier,
                    pseudo: pseudoPage,
                    line: line,
                    col: col
                });
            },
            _margin: function () {
                var tokenStream = this._tokenStream, line, col, marginSym = this._margin_sym();
                if (marginSym) {
                    line = tokenStream.token().startLine;
                    col = tokenStream.token().startCol;
                    this.fire({
                        type: "startpagemargin",
                        margin: marginSym,
                        line: line,
                        col: col
                    });
                    this._readDeclarations(true);
                    this.fire({
                        type: "endpagemargin",
                        margin: marginSym,
                        line: line,
                        col: col
                    });
                    return true;
                }
                else {
                    return false;
                }
            },
            _margin_sym: function () {
                var tokenStream = this._tokenStream;
                if (tokenStream.match([Tokens.TOPLEFTCORNER_SYM, Tokens.TOPLEFT_SYM,
                    Tokens.TOPCENTER_SYM, Tokens.TOPRIGHT_SYM, Tokens.TOPRIGHTCORNER_SYM,
                    Tokens.BOTTOMLEFTCORNER_SYM, Tokens.BOTTOMLEFT_SYM,
                    Tokens.BOTTOMCENTER_SYM, Tokens.BOTTOMRIGHT_SYM,
                    Tokens.BOTTOMRIGHTCORNER_SYM, Tokens.LEFTTOP_SYM,
                    Tokens.LEFTMIDDLE_SYM, Tokens.LEFTBOTTOM_SYM, Tokens.RIGHTTOP_SYM,
                    Tokens.RIGHTMIDDLE_SYM, Tokens.RIGHTBOTTOM_SYM])) {
                    return SyntaxUnit.fromToken(tokenStream.token());
                }
                else {
                    return null;
                }
            },
            _pseudo_page: function () {
                var tokenStream = this._tokenStream;
                tokenStream.mustMatch(Tokens.COLON);
                tokenStream.mustMatch(Tokens.IDENT);
                return tokenStream.token().value;
            },
            _font_face: function () {
                var tokenStream = this._tokenStream, line, col;
                tokenStream.mustMatch(Tokens.FONT_FACE_SYM);
                line = tokenStream.token().startLine;
                col = tokenStream.token().startCol;
                this._readWhitespace();
                this.fire({
                    type: "startfontface",
                    line: line,
                    col: col
                });
                this._readDeclarations(true);
                this.fire({
                    type: "endfontface",
                    line: line,
                    col: col
                });
            },
            _viewport: function () {
                var tokenStream = this._tokenStream, line, col;
                tokenStream.mustMatch(Tokens.VIEWPORT_SYM);
                line = tokenStream.token().startLine;
                col = tokenStream.token().startCol;
                this._readWhitespace();
                this.fire({
                    type: "startviewport",
                    line: line,
                    col: col
                });
                this._readDeclarations(true);
                this.fire({
                    type: "endviewport",
                    line: line,
                    col: col
                });
            },
            _operator: function (inFunction) {
                var tokenStream = this._tokenStream, token = null;
                if (tokenStream.match([Tokens.SLASH, Tokens.COMMA]) ||
                    (inFunction && tokenStream.match([Tokens.PLUS, Tokens.STAR, Tokens.MINUS]))) {
                    token = tokenStream.token();
                    this._readWhitespace();
                }
                return token ? PropertyValuePart.fromToken(token) : null;
            },
            _combinator: function () {
                var tokenStream = this._tokenStream, value = null, token;
                if (tokenStream.match([Tokens.PLUS, Tokens.GREATER, Tokens.TILDE])) {
                    token = tokenStream.token();
                    value = new Combinator(token.value, token.startLine, token.startCol);
                    this._readWhitespace();
                }
                return value;
            },
            _unary_operator: function () {
                var tokenStream = this._tokenStream;
                if (tokenStream.match([Tokens.MINUS, Tokens.PLUS])) {
                    return tokenStream.token().value;
                }
                else {
                    return null;
                }
            },
            _property: function () {
                var tokenStream = this._tokenStream, value = null, hack = null, tokenValue, token, line, col;
                if (tokenStream.peek() == Tokens.STAR && this.options.starHack) {
                    tokenStream.get();
                    token = tokenStream.token();
                    hack = token.value;
                    line = token.startLine;
                    col = token.startCol;
                }
                if (tokenStream.match(Tokens.IDENT)) {
                    token = tokenStream.token();
                    tokenValue = token.value;
                    if (tokenValue.charAt(0) == "_" && this.options.underscoreHack) {
                        hack = "_";
                        tokenValue = tokenValue.substring(1);
                    }
                    value = new PropertyName(tokenValue, hack, (line || token.startLine), (col || token.startCol));
                    this._readWhitespace();
                }
                return value;
            },
            _ruleset: function () {
                var tokenStream = this._tokenStream, tt, selectors;
                try {
                    selectors = this._selectors_group();
                }
                catch (ex) {
                    if (ex instanceof SyntaxError && !this.options.strict) {
                        this.fire({
                            type: "error",
                            error: ex,
                            message: ex.message,
                            line: ex.line,
                            col: ex.col
                        });
                        tt = tokenStream.advance([Tokens.RBRACE]);
                        if (tt == Tokens.RBRACE) {
                        }
                        else {
                            throw ex;
                        }
                    }
                    else {
                        throw ex;
                    }
                    return true;
                }
                if (selectors) {
                    this.fire({
                        type: "startrule",
                        selectors: selectors,
                        line: selectors[0].line,
                        col: selectors[0].col
                    });
                    this._readDeclarations(true);
                    this.fire({
                        type: "endrule",
                        selectors: selectors,
                        line: selectors[0].line,
                        col: selectors[0].col
                    });
                }
                return selectors;
            },
            _selectors_group: function () {
                var tokenStream = this._tokenStream, selectors = [], selector;
                selector = this._selector();
                if (selector !== null) {
                    selectors.push(selector);
                    while (tokenStream.match(Tokens.COMMA)) {
                        this._readWhitespace();
                        selector = this._selector();
                        if (selector !== null) {
                            selectors.push(selector);
                        }
                        else {
                            this._unexpectedToken(tokenStream.LT(1));
                        }
                    }
                }
                return selectors.length ? selectors : null;
            },
            _selector: function () {
                var tokenStream = this._tokenStream, selector = [], nextSelector = null, combinator = null, ws = null;
                nextSelector = this._simple_selector_sequence();
                if (nextSelector === null) {
                    return null;
                }
                selector.push(nextSelector);
                do {
                    combinator = this._combinator();
                    if (combinator !== null) {
                        selector.push(combinator);
                        nextSelector = this._simple_selector_sequence();
                        if (nextSelector === null) {
                            this._unexpectedToken(tokenStream.LT(1));
                        }
                        else {
                            selector.push(nextSelector);
                        }
                    }
                    else {
                        if (this._readWhitespace()) {
                            ws = new Combinator(tokenStream.token().value, tokenStream.token().startLine, tokenStream.token().startCol);
                            combinator = this._combinator();
                            nextSelector = this._simple_selector_sequence();
                            if (nextSelector === null) {
                                if (combinator !== null) {
                                    this._unexpectedToken(tokenStream.LT(1));
                                }
                            }
                            else {
                                if (combinator !== null) {
                                    selector.push(combinator);
                                }
                                else {
                                    selector.push(ws);
                                }
                                selector.push(nextSelector);
                            }
                        }
                        else {
                            break;
                        }
                    }
                } while (true);
                return new Selector(selector, selector[0].line, selector[0].col);
            },
            _simple_selector_sequence: function () {
                var tokenStream = this._tokenStream, elementName = null, modifiers = [], selectorText = "", components = [
                    function () {
                        return tokenStream.match(Tokens.HASH) ?
                            new SelectorSubPart(tokenStream.token().value, "id", tokenStream.token().startLine, tokenStream.token().startCol) :
                            null;
                    },
                    this._class,
                    this._attrib,
                    this._pseudo,
                    this._negation
                ], i = 0, len = components.length, component = null, found = false, line, col;
                line = tokenStream.LT(1).startLine;
                col = tokenStream.LT(1).startCol;
                elementName = this._type_selector();
                if (!elementName) {
                    elementName = this._universal();
                }
                if (elementName !== null) {
                    selectorText += elementName;
                }
                while (true) {
                    if (tokenStream.peek() === Tokens.S) {
                        break;
                    }
                    while (i < len && component === null) {
                        component = components[i++].call(this);
                    }
                    if (component === null) {
                        if (selectorText === "") {
                            return null;
                        }
                        else {
                            break;
                        }
                    }
                    else {
                        i = 0;
                        modifiers.push(component);
                        selectorText += component.toString();
                        component = null;
                    }
                }
                return selectorText !== "" ?
                    new SelectorPart(elementName, modifiers, selectorText, line, col) :
                    null;
            },
            _type_selector: function () {
                var tokenStream = this._tokenStream, ns = this._namespace_prefix(), elementName = this._element_name();
                if (!elementName) {
                    if (ns) {
                        tokenStream.unget();
                        if (ns.length > 1) {
                            tokenStream.unget();
                        }
                    }
                    return null;
                }
                else {
                    if (ns) {
                        elementName.text = ns + elementName.text;
                        elementName.col -= ns.length;
                    }
                    return elementName;
                }
            },
            _class: function () {
                var tokenStream = this._tokenStream, token;
                if (tokenStream.match(Tokens.DOT)) {
                    tokenStream.mustMatch(Tokens.IDENT);
                    token = tokenStream.token();
                    return new SelectorSubPart("." + token.value, "class", token.startLine, token.startCol - 1);
                }
                else {
                    return null;
                }
            },
            _element_name: function () {
                var tokenStream = this._tokenStream, token;
                if (tokenStream.match(Tokens.IDENT)) {
                    token = tokenStream.token();
                    return new SelectorSubPart(token.value, "elementName", token.startLine, token.startCol);
                }
                else {
                    return null;
                }
            },
            _namespace_prefix: function () {
                var tokenStream = this._tokenStream, value = "";
                if (tokenStream.LA(1) === Tokens.PIPE || tokenStream.LA(2) === Tokens.PIPE) {
                    if (tokenStream.match([Tokens.IDENT, Tokens.STAR])) {
                        value += tokenStream.token().value;
                    }
                    tokenStream.mustMatch(Tokens.PIPE);
                    value += "|";
                }
                return value.length ? value : null;
            },
            _universal: function () {
                var tokenStream = this._tokenStream, value = "", ns;
                ns = this._namespace_prefix();
                if (ns) {
                    value += ns;
                }
                if (tokenStream.match(Tokens.STAR)) {
                    value += "*";
                }
                return value.length ? value : null;
            },
            _attrib: function () {
                var tokenStream = this._tokenStream, value = null, ns, token;
                if (tokenStream.match(Tokens.LBRACKET)) {
                    token = tokenStream.token();
                    value = token.value;
                    value += this._readWhitespace();
                    ns = this._namespace_prefix();
                    if (ns) {
                        value += ns;
                    }
                    tokenStream.mustMatch(Tokens.IDENT);
                    value += tokenStream.token().value;
                    value += this._readWhitespace();
                    if (tokenStream.match([Tokens.PREFIXMATCH, Tokens.SUFFIXMATCH, Tokens.SUBSTRINGMATCH,
                        Tokens.EQUALS, Tokens.INCLUDES, Tokens.DASHMATCH])) {
                        value += tokenStream.token().value;
                        value += this._readWhitespace();
                        tokenStream.mustMatch([Tokens.IDENT, Tokens.STRING]);
                        value += tokenStream.token().value;
                        value += this._readWhitespace();
                    }
                    tokenStream.mustMatch(Tokens.RBRACKET);
                    return new SelectorSubPart(value + "]", "attribute", token.startLine, token.startCol);
                }
                else {
                    return null;
                }
            },
            _pseudo: function () {
                var tokenStream = this._tokenStream, pseudo = null, colons = ":", line, col;
                if (tokenStream.match(Tokens.COLON)) {
                    if (tokenStream.match(Tokens.COLON)) {
                        colons += ":";
                    }
                    if (tokenStream.match(Tokens.IDENT)) {
                        pseudo = tokenStream.token().value;
                        line = tokenStream.token().startLine;
                        col = tokenStream.token().startCol - colons.length;
                    }
                    else if (tokenStream.peek() == Tokens.FUNCTION) {
                        line = tokenStream.LT(1).startLine;
                        col = tokenStream.LT(1).startCol - colons.length;
                        pseudo = this._functional_pseudo();
                    }
                    if (pseudo) {
                        pseudo = new SelectorSubPart(colons + pseudo, "pseudo", line, col);
                    }
                }
                return pseudo;
            },
            _functional_pseudo: function () {
                var tokenStream = this._tokenStream, value = null;
                if (tokenStream.match(Tokens.FUNCTION)) {
                    value = tokenStream.token().value;
                    value += this._readWhitespace();
                    value += this._expression();
                    tokenStream.mustMatch(Tokens.RPAREN);
                    value += ")";
                }
                return value;
            },
            _expression: function () {
                var tokenStream = this._tokenStream, value = "";
                while (tokenStream.match([Tokens.PLUS, Tokens.MINUS, Tokens.DIMENSION,
                    Tokens.NUMBER, Tokens.STRING, Tokens.IDENT, Tokens.LENGTH,
                    Tokens.FREQ, Tokens.ANGLE, Tokens.TIME,
                    Tokens.RESOLUTION, Tokens.SLASH])) {
                    value += tokenStream.token().value;
                    value += this._readWhitespace();
                }
                return value.length ? value : null;
            },
            _negation: function () {
                var tokenStream = this._tokenStream, line, col, value = "", arg, subpart = null;
                if (tokenStream.match(Tokens.NOT)) {
                    value = tokenStream.token().value;
                    line = tokenStream.token().startLine;
                    col = tokenStream.token().startCol;
                    value += this._readWhitespace();
                    arg = this._negation_arg();
                    value += arg;
                    value += this._readWhitespace();
                    tokenStream.match(Tokens.RPAREN);
                    value += tokenStream.token().value;
                    subpart = new SelectorSubPart(value, "not", line, col);
                    subpart.args.push(arg);
                }
                return subpart;
            },
            _negation_arg: function () {
                var tokenStream = this._tokenStream, args = [
                    this._type_selector,
                    this._universal,
                    function () {
                        return tokenStream.match(Tokens.HASH) ?
                            new SelectorSubPart(tokenStream.token().value, "id", tokenStream.token().startLine, tokenStream.token().startCol) :
                            null;
                    },
                    this._class,
                    this._attrib,
                    this._pseudo
                ], arg = null, i = 0, len = args.length, elementName, line, col, part;
                line = tokenStream.LT(1).startLine;
                col = tokenStream.LT(1).startCol;
                while (i < len && arg === null) {
                    arg = args[i].call(this);
                    i++;
                }
                if (arg === null) {
                    this._unexpectedToken(tokenStream.LT(1));
                }
                if (arg.type == "elementName") {
                    part = new SelectorPart(arg, [], arg.toString(), line, col);
                }
                else {
                    part = new SelectorPart(null, [arg], arg.toString(), line, col);
                }
                return part;
            },
            _declaration: function () {
                var tokenStream = this._tokenStream, property = null, expr = null, prio = null, error = null, invalid = null, propertyName = "";
                property = this._property();
                if (property !== null) {
                    tokenStream.mustMatch(Tokens.COLON);
                    this._readWhitespace();
                    expr = this._expr();
                    if (!expr || expr.length === 0) {
                        this._unexpectedToken(tokenStream.LT(1));
                    }
                    prio = this._prio();
                    propertyName = property.toString();
                    if (this.options.starHack && property.hack == "*" ||
                        this.options.underscoreHack && property.hack == "_") {
                        propertyName = property.text;
                    }
                    try {
                        this._validateProperty(propertyName, expr);
                    }
                    catch (ex) {
                        invalid = ex;
                    }
                    this.fire({
                        type: "property",
                        property: property,
                        value: expr,
                        important: prio,
                        line: property.line,
                        col: property.col,
                        invalid: invalid
                    });
                    return true;
                }
                else {
                    return false;
                }
            },
            _prio: function () {
                var tokenStream = this._tokenStream, result = tokenStream.match(Tokens.IMPORTANT_SYM);
                this._readWhitespace();
                return result;
            },
            _expr: function (inFunction) {
                var tokenStream = this._tokenStream, values = [], value = null, operator = null;
                value = this._term(inFunction);
                if (value !== null) {
                    values.push(value);
                    do {
                        operator = this._operator(inFunction);
                        if (operator) {
                            values.push(operator);
                        }
                        value = this._term(inFunction);
                        if (value === null) {
                            break;
                        }
                        else {
                            values.push(value);
                        }
                    } while (true);
                }
                return values.length > 0 ? new PropertyValue(values, values[0].line, values[0].col) : null;
            },
            _term: function (inFunction) {
                var tokenStream = this._tokenStream, unary = null, value = null, endChar = null, token, line, col;
                unary = this._unary_operator();
                if (unary !== null) {
                    line = tokenStream.token().startLine;
                    col = tokenStream.token().startCol;
                }
                if (tokenStream.peek() == Tokens.IE_FUNCTION && this.options.ieFilters) {
                    value = this._ie_function();
                    if (unary === null) {
                        line = tokenStream.token().startLine;
                        col = tokenStream.token().startCol;
                    }
                }
                else if (inFunction && tokenStream.match([Tokens.LPAREN, Tokens.LBRACE, Tokens.LBRACKET])) {
                    token = tokenStream.token();
                    endChar = token.endChar;
                    value = token.value + this._expr(inFunction).text;
                    if (unary === null) {
                        line = tokenStream.token().startLine;
                        col = tokenStream.token().startCol;
                    }
                    tokenStream.mustMatch(Tokens.type(endChar));
                    value += endChar;
                    this._readWhitespace();
                }
                else if (tokenStream.match([Tokens.NUMBER, Tokens.PERCENTAGE, Tokens.LENGTH,
                    Tokens.ANGLE, Tokens.TIME,
                    Tokens.FREQ, Tokens.STRING, Tokens.IDENT, Tokens.URI, Tokens.UNICODE_RANGE])) {
                    value = tokenStream.token().value;
                    if (unary === null) {
                        line = tokenStream.token().startLine;
                        col = tokenStream.token().startCol;
                    }
                    this._readWhitespace();
                }
                else {
                    token = this._hexcolor();
                    if (token === null) {
                        if (unary === null) {
                            line = tokenStream.LT(1).startLine;
                            col = tokenStream.LT(1).startCol;
                        }
                        if (value === null) {
                            if (tokenStream.LA(3) == Tokens.EQUALS && this.options.ieFilters) {
                                value = this._ie_function();
                            }
                            else {
                                value = this._function();
                            }
                        }
                    }
                    else {
                        value = token.value;
                        if (unary === null) {
                            line = token.startLine;
                            col = token.startCol;
                        }
                    }
                }
                return value !== null ?
                    new PropertyValuePart(unary !== null ? unary + value : value, line, col) :
                    null;
            },
            _function: function () {
                var tokenStream = this._tokenStream, functionText = null, expr = null, lt;
                if (tokenStream.match(Tokens.FUNCTION)) {
                    functionText = tokenStream.token().value;
                    this._readWhitespace();
                    expr = this._expr(true);
                    functionText += expr;
                    if (this.options.ieFilters && tokenStream.peek() == Tokens.EQUALS) {
                        do {
                            if (this._readWhitespace()) {
                                functionText += tokenStream.token().value;
                            }
                            if (tokenStream.LA(0) == Tokens.COMMA) {
                                functionText += tokenStream.token().value;
                            }
                            tokenStream.match(Tokens.IDENT);
                            functionText += tokenStream.token().value;
                            tokenStream.match(Tokens.EQUALS);
                            functionText += tokenStream.token().value;
                            lt = tokenStream.peek();
                            while (lt != Tokens.COMMA && lt != Tokens.S && lt != Tokens.RPAREN) {
                                tokenStream.get();
                                functionText += tokenStream.token().value;
                                lt = tokenStream.peek();
                            }
                        } while (tokenStream.match([Tokens.COMMA, Tokens.S]));
                    }
                    tokenStream.match(Tokens.RPAREN);
                    functionText += ")";
                    this._readWhitespace();
                }
                return functionText;
            },
            _ie_function: function () {
                var tokenStream = this._tokenStream, functionText = null, expr = null, lt;
                if (tokenStream.match([Tokens.IE_FUNCTION, Tokens.FUNCTION])) {
                    functionText = tokenStream.token().value;
                    do {
                        if (this._readWhitespace()) {
                            functionText += tokenStream.token().value;
                        }
                        if (tokenStream.LA(0) == Tokens.COMMA) {
                            functionText += tokenStream.token().value;
                        }
                        tokenStream.match(Tokens.IDENT);
                        functionText += tokenStream.token().value;
                        tokenStream.match(Tokens.EQUALS);
                        functionText += tokenStream.token().value;
                        lt = tokenStream.peek();
                        while (lt != Tokens.COMMA && lt != Tokens.S && lt != Tokens.RPAREN) {
                            tokenStream.get();
                            functionText += tokenStream.token().value;
                            lt = tokenStream.peek();
                        }
                    } while (tokenStream.match([Tokens.COMMA, Tokens.S]));
                    tokenStream.match(Tokens.RPAREN);
                    functionText += ")";
                    this._readWhitespace();
                }
                return functionText;
            },
            _hexcolor: function () {
                var tokenStream = this._tokenStream, token = null, color;
                if (tokenStream.match(Tokens.HASH)) {
                    token = tokenStream.token();
                    color = token.value;
                    if (!/#[a-f0-9]{3,6}/i.test(color)) {
                        throw new SyntaxError("Expected a hex color but found '" + color + "' at line " + token.startLine + ", col " + token.startCol + ".", token.startLine, token.startCol);
                    }
                    this._readWhitespace();
                }
                return token;
            },
            _keyframes: function () {
                var tokenStream = this._tokenStream, token, tt, name, prefix = "";
                tokenStream.mustMatch(Tokens.KEYFRAMES_SYM);
                token = tokenStream.token();
                if (/^@\-([^\-]+)\-/.test(token.value)) {
                    prefix = RegExp.$1;
                }
                this._readWhitespace();
                name = this._keyframe_name();
                this._readWhitespace();
                tokenStream.mustMatch(Tokens.LBRACE);
                this.fire({
                    type: "startkeyframes",
                    name: name,
                    prefix: prefix,
                    line: token.startLine,
                    col: token.startCol
                });
                this._readWhitespace();
                tt = tokenStream.peek();
                while (tt == Tokens.IDENT || tt == Tokens.PERCENTAGE) {
                    this._keyframe_rule();
                    this._readWhitespace();
                    tt = tokenStream.peek();
                }
                this.fire({
                    type: "endkeyframes",
                    name: name,
                    prefix: prefix,
                    line: token.startLine,
                    col: token.startCol
                });
                this._readWhitespace();
                tokenStream.mustMatch(Tokens.RBRACE);
            },
            _keyframe_name: function () {
                var tokenStream = this._tokenStream, token;
                tokenStream.mustMatch([Tokens.IDENT, Tokens.STRING]);
                return SyntaxUnit.fromToken(tokenStream.token());
            },
            _keyframe_rule: function () {
                var tokenStream = this._tokenStream, token, keyList = this._key_list();
                this.fire({
                    type: "startkeyframerule",
                    keys: keyList,
                    line: keyList[0].line,
                    col: keyList[0].col
                });
                this._readDeclarations(true);
                this.fire({
                    type: "endkeyframerule",
                    keys: keyList,
                    line: keyList[0].line,
                    col: keyList[0].col
                });
            },
            _key_list: function () {
                var tokenStream = this._tokenStream, token, key, keyList = [];
                keyList.push(this._key());
                this._readWhitespace();
                while (tokenStream.match(Tokens.COMMA)) {
                    this._readWhitespace();
                    keyList.push(this._key());
                    this._readWhitespace();
                }
                return keyList;
            },
            _key: function () {
                var tokenStream = this._tokenStream, token;
                if (tokenStream.match(Tokens.PERCENTAGE)) {
                    return SyntaxUnit.fromToken(tokenStream.token());
                }
                else if (tokenStream.match(Tokens.IDENT)) {
                    token = tokenStream.token();
                    if (/from|to/i.test(token.value)) {
                        return SyntaxUnit.fromToken(token);
                    }
                    tokenStream.unget();
                }
                this._unexpectedToken(tokenStream.LT(1));
            },
            _skipCruft: function () {
                while (this._tokenStream.match([Tokens.S, Tokens.CDO, Tokens.CDC])) {
                }
            },
            _readDeclarations: function (checkStart, readMargins) {
                var tokenStream = this._tokenStream, tt;
                this._readWhitespace();
                if (checkStart) {
                    tokenStream.mustMatch(Tokens.LBRACE);
                }
                this._readWhitespace();
                try {
                    while (true) {
                        if (tokenStream.match(Tokens.SEMICOLON) || (readMargins && this._margin())) {
                        }
                        else if (this._declaration()) {
                            if (!tokenStream.match(Tokens.SEMICOLON)) {
                                break;
                            }
                        }
                        else {
                            break;
                        }
                        this._readWhitespace();
                    }
                    tokenStream.mustMatch(Tokens.RBRACE);
                    this._readWhitespace();
                }
                catch (ex) {
                    if (ex instanceof SyntaxError && !this.options.strict) {
                        this.fire({
                            type: "error",
                            error: ex,
                            message: ex.message,
                            line: ex.line,
                            col: ex.col
                        });
                        tt = tokenStream.advance([Tokens.SEMICOLON, Tokens.RBRACE]);
                        if (tt == Tokens.SEMICOLON) {
                            this._readDeclarations(false, readMargins);
                        }
                        else if (tt != Tokens.RBRACE) {
                            throw ex;
                        }
                    }
                    else {
                        throw ex;
                    }
                }
            },
            _readWhitespace: function () {
                var tokenStream = this._tokenStream, ws = "";
                while (tokenStream.match(Tokens.S)) {
                    ws += tokenStream.token().value;
                }
                return ws;
            },
            _unexpectedToken: function (token) {
                throw new SyntaxError("Unexpected token '" + token.value + "' at line " + token.startLine + ", col " + token.startCol + ".", token.startLine, token.startCol);
            },
            _verifyEnd: function () {
                if (this._tokenStream.LA(1) != Tokens.EOF) {
                    this._unexpectedToken(this._tokenStream.LT(1));
                }
            },
            _validateProperty: function (property, value) {
                Validation.validate(property, value);
            },
            parse: function (input) {
                this._tokenStream = new TokenStream(input, Tokens);
                this._stylesheet();
            },
            parseStyleSheet: function (input) {
                return this.parse(input);
            },
            parseMediaQuery: function (input) {
                this._tokenStream = new TokenStream(input, Tokens);
                var result = this._media_query();
                this._verifyEnd();
                return result;
            },
            parsePropertyValue: function (input) {
                this._tokenStream = new TokenStream(input, Tokens);
                this._readWhitespace();
                var result = this._expr();
                this._readWhitespace();
                this._verifyEnd();
                return result;
            },
            parseRule: function (input) {
                this._tokenStream = new TokenStream(input, Tokens);
                this._readWhitespace();
                var result = this._ruleset();
                this._readWhitespace();
                this._verifyEnd();
                return result;
            },
            parseSelector: function (input) {
                this._tokenStream = new TokenStream(input, Tokens);
                this._readWhitespace();
                var result = this._selector();
                this._readWhitespace();
                this._verifyEnd();
                return result;
            },
            parseStyleAttribute: function (input) {
                input += "}";
                this._tokenStream = new TokenStream(input, Tokens);
                this._readDeclarations();
            }
        };
        for (prop in additions) {
            if (additions.hasOwnProperty(prop)) {
                proto[prop] = additions[prop];
            }
        }
        return proto;
    }();
    var Properties = {
        "align-items": "flex-start | flex-end | center | baseline | stretch",
        "align-content": "flex-start | flex-end | center | space-between | space-around | stretch",
        "align-self": "auto | flex-start | flex-end | center | baseline | stretch",
        "-webkit-align-items": "flex-start | flex-end | center | baseline | stretch",
        "-webkit-align-content": "flex-start | flex-end | center | space-between | space-around | stretch",
        "-webkit-align-self": "auto | flex-start | flex-end | center | baseline | stretch",
        "alignment-adjust": "auto | baseline | before-edge | text-before-edge | middle | central | after-edge | text-after-edge | ideographic | alphabetic | hanging | mathematical | <percentage> | <length>",
        "alignment-baseline": "baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical",
        "animation": 1,
        "animation-delay": { multi: "<time>", comma: true },
        "animation-direction": { multi: "normal | alternate", comma: true },
        "animation-duration": { multi: "<time>", comma: true },
        "animation-fill-mode": { multi: "none | forwards | backwards | both", comma: true },
        "animation-iteration-count": { multi: "<number> | infinite", comma: true },
        "animation-name": { multi: "none | <ident>", comma: true },
        "animation-play-state": { multi: "running | paused", comma: true },
        "animation-timing-function": 1,
        "-moz-animation-delay": { multi: "<time>", comma: true },
        "-moz-animation-direction": { multi: "normal | alternate", comma: true },
        "-moz-animation-duration": { multi: "<time>", comma: true },
        "-moz-animation-iteration-count": { multi: "<number> | infinite", comma: true },
        "-moz-animation-name": { multi: "none | <ident>", comma: true },
        "-moz-animation-play-state": { multi: "running | paused", comma: true },
        "-ms-animation-delay": { multi: "<time>", comma: true },
        "-ms-animation-direction": { multi: "normal | alternate", comma: true },
        "-ms-animation-duration": { multi: "<time>", comma: true },
        "-ms-animation-iteration-count": { multi: "<number> | infinite", comma: true },
        "-ms-animation-name": { multi: "none | <ident>", comma: true },
        "-ms-animation-play-state": { multi: "running | paused", comma: true },
        "-webkit-animation-delay": { multi: "<time>", comma: true },
        "-webkit-animation-direction": { multi: "normal | alternate", comma: true },
        "-webkit-animation-duration": { multi: "<time>", comma: true },
        "-webkit-animation-fill-mode": { multi: "none | forwards | backwards | both", comma: true },
        "-webkit-animation-iteration-count": { multi: "<number> | infinite", comma: true },
        "-webkit-animation-name": { multi: "none | <ident>", comma: true },
        "-webkit-animation-play-state": { multi: "running | paused", comma: true },
        "-o-animation-delay": { multi: "<time>", comma: true },
        "-o-animation-direction": { multi: "normal | alternate", comma: true },
        "-o-animation-duration": { multi: "<time>", comma: true },
        "-o-animation-iteration-count": { multi: "<number> | infinite", comma: true },
        "-o-animation-name": { multi: "none | <ident>", comma: true },
        "-o-animation-play-state": { multi: "running | paused", comma: true },
        "appearance": "icon | window | desktop | workspace | document | tooltip | dialog | button | push-button | hyperlink | radio-button | checkbox | menu-item | tab | menu | menubar | pull-down-menu | pop-up-menu | list-menu | radio-group | checkbox-group | outline-tree | range | field | combo-box | signature | password | normal | none | inherit",
        "azimuth": function (expression) {
            var simple = "<angle> | leftwards | rightwards | inherit", direction = "left-side | far-left | left | center-left | center | center-right | right | far-right | right-side", behind = false, valid = false, part;
            if (!ValidationTypes.isAny(expression, simple)) {
                if (ValidationTypes.isAny(expression, "behind")) {
                    behind = true;
                    valid = true;
                }
                if (ValidationTypes.isAny(expression, direction)) {
                    valid = true;
                    if (!behind) {
                        ValidationTypes.isAny(expression, "behind");
                    }
                }
            }
            if (expression.hasNext()) {
                part = expression.next();
                if (valid) {
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    throw new ValidationError("Expected (<'azimuth'>) but found '" + part + "'.", part.line, part.col);
                }
            }
        },
        "backface-visibility": "visible | hidden",
        "background": 1,
        "background-attachment": { multi: "<attachment>", comma: true },
        "background-clip": { multi: "<box>", comma: true },
        "background-color": "<color> | inherit",
        "background-image": { multi: "<bg-image>", comma: true },
        "background-origin": { multi: "<box>", comma: true },
        "background-position": { multi: "<bg-position>", comma: true },
        "background-repeat": { multi: "<repeat-style>" },
        "background-size": { multi: "<bg-size>", comma: true },
        "baseline-shift": "baseline | sub | super | <percentage> | <length>",
        "behavior": 1,
        "binding": 1,
        "bleed": "<length>",
        "bookmark-label": "<content> | <attr> | <string>",
        "bookmark-level": "none | <integer>",
        "bookmark-state": "open | closed",
        "bookmark-target": "none | <uri> | <attr>",
        "border": "<border-width> || <border-style> || <color>",
        "border-bottom": "<border-width> || <border-style> || <color>",
        "border-bottom-color": "<color> | inherit",
        "border-bottom-left-radius": "<x-one-radius>",
        "border-bottom-right-radius": "<x-one-radius>",
        "border-bottom-style": "<border-style>",
        "border-bottom-width": "<border-width>",
        "border-collapse": "collapse | separate | inherit",
        "border-color": { multi: "<color> | inherit", max: 4 },
        "border-image": 1,
        "border-image-outset": { multi: "<length> | <number>", max: 4 },
        "border-image-repeat": { multi: "stretch | repeat | round", max: 2 },
        "border-image-slice": function (expression) {
            var valid = false, numeric = "<number> | <percentage>", fill = false, count = 0, max = 4, part;
            if (ValidationTypes.isAny(expression, "fill")) {
                fill = true;
                valid = true;
            }
            while (expression.hasNext() && count < max) {
                valid = ValidationTypes.isAny(expression, numeric);
                if (!valid) {
                    break;
                }
                count++;
            }
            if (!fill) {
                ValidationTypes.isAny(expression, "fill");
            }
            else {
                valid = true;
            }
            if (expression.hasNext()) {
                part = expression.next();
                if (valid) {
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    throw new ValidationError("Expected ([<number> | <percentage>]{1,4} && fill?) but found '" + part + "'.", part.line, part.col);
                }
            }
        },
        "border-image-source": "<image> | none",
        "border-image-width": { multi: "<length> | <percentage> | <number> | auto", max: 4 },
        "border-left": "<border-width> || <border-style> || <color>",
        "border-left-color": "<color> | inherit",
        "border-left-style": "<border-style>",
        "border-left-width": "<border-width>",
        "border-radius": function (expression) {
            var valid = false, simple = "<length> | <percentage> | inherit", slash = false, fill = false, count = 0, max = 8, part;
            while (expression.hasNext() && count < max) {
                valid = ValidationTypes.isAny(expression, simple);
                if (!valid) {
                    if (expression.peek() == "/" && count > 0 && !slash) {
                        slash = true;
                        max = count + 5;
                        expression.next();
                    }
                    else {
                        break;
                    }
                }
                count++;
            }
            if (expression.hasNext()) {
                part = expression.next();
                if (valid) {
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    throw new ValidationError("Expected (<'border-radius'>) but found '" + part + "'.", part.line, part.col);
                }
            }
        },
        "border-right": "<border-width> || <border-style> || <color>",
        "border-right-color": "<color> | inherit",
        "border-right-style": "<border-style>",
        "border-right-width": "<border-width>",
        "border-spacing": { multi: "<length> | inherit", max: 2 },
        "border-style": { multi: "<border-style>", max: 4 },
        "border-top": "<border-width> || <border-style> || <color>",
        "border-top-color": "<color> | inherit",
        "border-top-left-radius": "<x-one-radius>",
        "border-top-right-radius": "<x-one-radius>",
        "border-top-style": "<border-style>",
        "border-top-width": "<border-width>",
        "border-width": { multi: "<border-width>", max: 4 },
        "bottom": "<margin-width> | inherit",
        "-moz-box-align": "start | end | center | baseline | stretch",
        "-moz-box-decoration-break": "slice |clone",
        "-moz-box-direction": "normal | reverse | inherit",
        "-moz-box-flex": "<number>",
        "-moz-box-flex-group": "<integer>",
        "-moz-box-lines": "single | multiple",
        "-moz-box-ordinal-group": "<integer>",
        "-moz-box-orient": "horizontal | vertical | inline-axis | block-axis | inherit",
        "-moz-box-pack": "start | end | center | justify",
        "-webkit-box-align": "start | end | center | baseline | stretch",
        "-webkit-box-decoration-break": "slice |clone",
        "-webkit-box-direction": "normal | reverse | inherit",
        "-webkit-box-flex": "<number>",
        "-webkit-box-flex-group": "<integer>",
        "-webkit-box-lines": "single | multiple",
        "-webkit-box-ordinal-group": "<integer>",
        "-webkit-box-orient": "horizontal | vertical | inline-axis | block-axis | inherit",
        "-webkit-box-pack": "start | end | center | justify",
        "box-shadow": function (expression) {
            var result = false, part;
            if (!ValidationTypes.isAny(expression, "none")) {
                Validation.multiProperty("<shadow>", expression, true, Infinity);
            }
            else {
                if (expression.hasNext()) {
                    part = expression.next();
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
            }
        },
        "box-sizing": "content-box | border-box | inherit",
        "break-after": "auto | always | avoid | left | right | page | column | avoid-page | avoid-column",
        "break-before": "auto | always | avoid | left | right | page | column | avoid-page | avoid-column",
        "break-inside": "auto | avoid | avoid-page | avoid-column",
        "caption-side": "top | bottom | inherit",
        "clear": "none | right | left | both | inherit",
        "clip": 1,
        "color": "<color> | inherit",
        "color-profile": 1,
        "column-count": "<integer> | auto",
        "column-fill": "auto | balance",
        "column-gap": "<length> | normal",
        "column-rule": "<border-width> || <border-style> || <color>",
        "column-rule-color": "<color>",
        "column-rule-style": "<border-style>",
        "column-rule-width": "<border-width>",
        "column-span": "none | all",
        "column-width": "<length> | auto",
        "columns": 1,
        "content": 1,
        "counter-increment": 1,
        "counter-reset": 1,
        "crop": "<shape> | auto",
        "cue": "cue-after | cue-before | inherit",
        "cue-after": 1,
        "cue-before": 1,
        "cursor": 1,
        "direction": "ltr | rtl | inherit",
        "display": "inline | block | list-item | inline-block | table | inline-table | table-row-group | table-header-group | table-footer-group | table-row | table-column-group | table-column | table-cell | table-caption | grid | inline-grid | none | inherit | -moz-box | -moz-inline-block | -moz-inline-box | -moz-inline-grid | -moz-inline-stack | -moz-inline-table | -moz-grid | -moz-grid-group | -moz-grid-line | -moz-groupbox | -moz-deck | -moz-popup | -moz-stack | -moz-marker | -webkit-box | -webkit-inline-box | -ms-flexbox | -ms-inline-flexbox | flex | -webkit-flex | inline-flex | -webkit-inline-flex",
        "dominant-baseline": 1,
        "drop-initial-after-adjust": "central | middle | after-edge | text-after-edge | ideographic | alphabetic | mathematical | <percentage> | <length>",
        "drop-initial-after-align": "baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical",
        "drop-initial-before-adjust": "before-edge | text-before-edge | central | middle | hanging | mathematical | <percentage> | <length>",
        "drop-initial-before-align": "caps-height | baseline | use-script | before-edge | text-before-edge | after-edge | text-after-edge | central | middle | ideographic | alphabetic | hanging | mathematical",
        "drop-initial-size": "auto | line | <length> | <percentage>",
        "drop-initial-value": "initial | <integer>",
        "elevation": "<angle> | below | level | above | higher | lower | inherit",
        "empty-cells": "show | hide | inherit",
        "filter": 1,
        "fit": "fill | hidden | meet | slice",
        "fit-position": 1,
        "flex": "<flex>",
        "flex-basis": "<width>",
        "flex-direction": "row | row-reverse | column | column-reverse",
        "flex-flow": "<flex-direction> || <flex-wrap>",
        "flex-grow": "<number>",
        "flex-shrink": "<number>",
        "flex-wrap": "nowrap | wrap | wrap-reverse",
        "-webkit-flex": "<flex>",
        "-webkit-flex-basis": "<width>",
        "-webkit-flex-direction": "row | row-reverse | column | column-reverse",
        "-webkit-flex-flow": "<flex-direction> || <flex-wrap>",
        "-webkit-flex-grow": "<number>",
        "-webkit-flex-shrink": "<number>",
        "-webkit-flex-wrap": "nowrap | wrap | wrap-reverse",
        "-ms-flex": "<flex>",
        "-ms-flex-align": "start | end | center | stretch | baseline",
        "-ms-flex-direction": "row | row-reverse | column | column-reverse | inherit",
        "-ms-flex-order": "<number>",
        "-ms-flex-pack": "start | end | center | justify",
        "-ms-flex-wrap": "nowrap | wrap | wrap-reverse",
        "float": "left | right | none | inherit",
        "float-offset": 1,
        "font": 1,
        "font-family": 1,
        "font-size": "<absolute-size> | <relative-size> | <length> | <percentage> | inherit",
        "font-size-adjust": "<number> | none | inherit",
        "font-stretch": "normal | ultra-condensed | extra-condensed | condensed | semi-condensed | semi-expanded | expanded | extra-expanded | ultra-expanded | inherit",
        "font-style": "normal | italic | oblique | inherit",
        "font-variant": "normal | small-caps | inherit",
        "font-weight": "normal | bold | bolder | lighter | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | inherit",
        "grid-cell-stacking": "columns | rows | layer",
        "grid-column": 1,
        "grid-columns": 1,
        "grid-column-align": "start | end | center | stretch",
        "grid-column-sizing": 1,
        "grid-column-span": "<integer>",
        "grid-flow": "none | rows | columns",
        "grid-layer": "<integer>",
        "grid-row": 1,
        "grid-rows": 1,
        "grid-row-align": "start | end | center | stretch",
        "grid-row-span": "<integer>",
        "grid-row-sizing": 1,
        "hanging-punctuation": 1,
        "height": "<margin-width> | <content-sizing> | inherit",
        "hyphenate-after": "<integer> | auto",
        "hyphenate-before": "<integer> | auto",
        "hyphenate-character": "<string> | auto",
        "hyphenate-lines": "no-limit | <integer>",
        "hyphenate-resource": 1,
        "hyphens": "none | manual | auto",
        "icon": 1,
        "image-orientation": "angle | auto",
        "image-rendering": 1,
        "image-resolution": 1,
        "inline-box-align": "initial | last | <integer>",
        "justify-content": "flex-start | flex-end | center | space-between | space-around",
        "-webkit-justify-content": "flex-start | flex-end | center | space-between | space-around",
        "left": "<margin-width> | inherit",
        "letter-spacing": "<length> | normal | inherit",
        "line-height": "<number> | <length> | <percentage> | normal | inherit",
        "line-break": "auto | loose | normal | strict",
        "line-stacking": 1,
        "line-stacking-ruby": "exclude-ruby | include-ruby",
        "line-stacking-shift": "consider-shifts | disregard-shifts",
        "line-stacking-strategy": "inline-line-height | block-line-height | max-height | grid-height",
        "list-style": 1,
        "list-style-image": "<uri> | none | inherit",
        "list-style-position": "inside | outside | inherit",
        "list-style-type": "disc | circle | square | decimal | decimal-leading-zero | lower-roman | upper-roman | lower-greek | lower-latin | upper-latin | armenian | georgian | lower-alpha | upper-alpha | none | inherit",
        "margin": { multi: "<margin-width> | inherit", max: 4 },
        "margin-bottom": "<margin-width> | inherit",
        "margin-left": "<margin-width> | inherit",
        "margin-right": "<margin-width> | inherit",
        "margin-top": "<margin-width> | inherit",
        "mark": 1,
        "mark-after": 1,
        "mark-before": 1,
        "marks": 1,
        "marquee-direction": 1,
        "marquee-play-count": 1,
        "marquee-speed": 1,
        "marquee-style": 1,
        "max-height": "<length> | <percentage> | <content-sizing> | none | inherit",
        "max-width": "<length> | <percentage> | <content-sizing> | none | inherit",
        "min-height": "<length> | <percentage> | <content-sizing> | contain-floats | -moz-contain-floats | -webkit-contain-floats | inherit",
        "min-width": "<length> | <percentage> | <content-sizing> | contain-floats | -moz-contain-floats | -webkit-contain-floats | inherit",
        "move-to": 1,
        "nav-down": 1,
        "nav-index": 1,
        "nav-left": 1,
        "nav-right": 1,
        "nav-up": 1,
        "opacity": "<number> | inherit",
        "order": "<integer>",
        "-webkit-order": "<integer>",
        "orphans": "<integer> | inherit",
        "outline": 1,
        "outline-color": "<color> | invert | inherit",
        "outline-offset": 1,
        "outline-style": "<border-style> | inherit",
        "outline-width": "<border-width> | inherit",
        "overflow": "visible | hidden | scroll | auto | inherit",
        "overflow-style": 1,
        "overflow-wrap": "normal | break-word",
        "overflow-x": 1,
        "overflow-y": 1,
        "padding": { multi: "<padding-width> | inherit", max: 4 },
        "padding-bottom": "<padding-width> | inherit",
        "padding-left": "<padding-width> | inherit",
        "padding-right": "<padding-width> | inherit",
        "padding-top": "<padding-width> | inherit",
        "page": 1,
        "page-break-after": "auto | always | avoid | left | right | inherit",
        "page-break-before": "auto | always | avoid | left | right | inherit",
        "page-break-inside": "auto | avoid | inherit",
        "page-policy": 1,
        "pause": 1,
        "pause-after": 1,
        "pause-before": 1,
        "perspective": 1,
        "perspective-origin": 1,
        "phonemes": 1,
        "pitch": 1,
        "pitch-range": 1,
        "play-during": 1,
        "pointer-events": "auto | none | visiblePainted | visibleFill | visibleStroke | visible | painted | fill | stroke | all | inherit",
        "position": "static | relative | absolute | fixed | inherit",
        "presentation-level": 1,
        "punctuation-trim": 1,
        "quotes": 1,
        "rendering-intent": 1,
        "resize": 1,
        "rest": 1,
        "rest-after": 1,
        "rest-before": 1,
        "richness": 1,
        "right": "<margin-width> | inherit",
        "rotation": 1,
        "rotation-point": 1,
        "ruby-align": 1,
        "ruby-overhang": 1,
        "ruby-position": 1,
        "ruby-span": 1,
        "size": 1,
        "speak": "normal | none | spell-out | inherit",
        "speak-header": "once | always | inherit",
        "speak-numeral": "digits | continuous | inherit",
        "speak-punctuation": "code | none | inherit",
        "speech-rate": 1,
        "src": 1,
        "stress": 1,
        "string-set": 1,
        "table-layout": "auto | fixed | inherit",
        "tab-size": "<integer> | <length>",
        "target": 1,
        "target-name": 1,
        "target-new": 1,
        "target-position": 1,
        "text-align": "left | right | center | justify | inherit",
        "text-align-last": 1,
        "text-decoration": 1,
        "text-emphasis": 1,
        "text-height": 1,
        "text-indent": "<length> | <percentage> | inherit",
        "text-justify": "auto | none | inter-word | inter-ideograph | inter-cluster | distribute | kashida",
        "text-outline": 1,
        "text-overflow": 1,
        "text-rendering": "auto | optimizeSpeed | optimizeLegibility | geometricPrecision | inherit",
        "text-shadow": 1,
        "text-transform": "capitalize | uppercase | lowercase | none | inherit",
        "text-wrap": "normal | none | avoid",
        "top": "<margin-width> | inherit",
        "-ms-touch-action": "auto | none | pan-x | pan-y",
        "touch-action": "auto | none | pan-x | pan-y",
        "transform": 1,
        "transform-origin": 1,
        "transform-style": 1,
        "transition": 1,
        "transition-delay": 1,
        "transition-duration": 1,
        "transition-property": 1,
        "transition-timing-function": 1,
        "unicode-bidi": "normal | embed | isolate | bidi-override | isolate-override | plaintext | inherit",
        "user-modify": "read-only | read-write | write-only | inherit",
        "user-select": "none | text | toggle | element | elements | all | inherit",
        "vertical-align": "auto | use-script | baseline | sub | super | top | text-top | central | middle | bottom | text-bottom | <percentage> | <length>",
        "visibility": "visible | hidden | collapse | inherit",
        "voice-balance": 1,
        "voice-duration": 1,
        "voice-family": 1,
        "voice-pitch": 1,
        "voice-pitch-range": 1,
        "voice-rate": 1,
        "voice-stress": 1,
        "voice-volume": 1,
        "volume": 1,
        "white-space": "normal | pre | nowrap | pre-wrap | pre-line | inherit | -pre-wrap | -o-pre-wrap | -moz-pre-wrap | -hp-pre-wrap",
        "white-space-collapse": 1,
        "widows": "<integer> | inherit",
        "width": "<length> | <percentage> | <content-sizing> | auto | inherit",
        "word-break": "normal | keep-all | break-all",
        "word-spacing": "<length> | normal | inherit",
        "word-wrap": "normal | break-word",
        "writing-mode": "horizontal-tb | vertical-rl | vertical-lr | lr-tb | rl-tb | tb-rl | bt-rl | tb-lr | bt-lr | lr-bt | rl-bt | lr | rl | tb | inherit",
        "z-index": "<integer> | auto | inherit",
        "zoom": "<number> | <percentage> | normal"
    };
    function PropertyName(text, hack, line, col) {
        SyntaxUnit.call(this, text, line, col, Parser.PROPERTY_NAME_TYPE);
        this.hack = hack;
    }
    PropertyName.prototype = new SyntaxUnit();
    PropertyName.prototype.constructor = PropertyName;
    PropertyName.prototype.toString = function () {
        return (this.hack ? this.hack : "") + this.text;
    };
    function PropertyValue(parts, line, col) {
        SyntaxUnit.call(this, parts.join(" "), line, col, Parser.PROPERTY_VALUE_TYPE);
        this.parts = parts;
    }
    PropertyValue.prototype = new SyntaxUnit();
    PropertyValue.prototype.constructor = PropertyValue;
    function PropertyValueIterator(value) {
        this._i = 0;
        this._parts = value.parts;
        this._marks = [];
        this.value = value;
    }
    PropertyValueIterator.prototype.count = function () {
        return this._parts.length;
    };
    PropertyValueIterator.prototype.isFirst = function () {
        return this._i === 0;
    };
    PropertyValueIterator.prototype.hasNext = function () {
        return (this._i < this._parts.length);
    };
    PropertyValueIterator.prototype.mark = function () {
        this._marks.push(this._i);
    };
    PropertyValueIterator.prototype.peek = function (count) {
        return this.hasNext() ? this._parts[this._i + (count || 0)] : null;
    };
    PropertyValueIterator.prototype.next = function () {
        return this.hasNext() ? this._parts[this._i++] : null;
    };
    PropertyValueIterator.prototype.previous = function () {
        return this._i > 0 ? this._parts[--this._i] : null;
    };
    PropertyValueIterator.prototype.restore = function () {
        if (this._marks.length) {
            this._i = this._marks.pop();
        }
    };
    function PropertyValuePart(text, line, col) {
        SyntaxUnit.call(this, text, line, col, Parser.PROPERTY_VALUE_PART_TYPE);
        this.type = "unknown";
        var temp;
        if (/^([+\-]?[\d\.]+)([a-z]+)$/i.test(text)) {
            this.type = "dimension";
            this.value = +RegExp.$1;
            this.units = RegExp.$2;
            switch (this.units.toLowerCase()) {
                case "em":
                case "rem":
                case "ex":
                case "px":
                case "cm":
                case "mm":
                case "in":
                case "pt":
                case "pc":
                case "ch":
                case "vh":
                case "vw":
                case "vmax":
                case "vmin":
                    this.type = "length";
                    break;
                case "deg":
                case "rad":
                case "grad":
                    this.type = "angle";
                    break;
                case "ms":
                case "s":
                    this.type = "time";
                    break;
                case "hz":
                case "khz":
                    this.type = "frequency";
                    break;
                case "dpi":
                case "dpcm":
                    this.type = "resolution";
                    break;
            }
        }
        else if (/^([+\-]?[\d\.]+)%$/i.test(text)) {
            this.type = "percentage";
            this.value = +RegExp.$1;
        }
        else if (/^([+\-]?\d+)$/i.test(text)) {
            this.type = "integer";
            this.value = +RegExp.$1;
        }
        else if (/^([+\-]?[\d\.]+)$/i.test(text)) {
            this.type = "number";
            this.value = +RegExp.$1;
        }
        else if (/^#([a-f0-9]{3,6})/i.test(text)) {
            this.type = "color";
            temp = RegExp.$1;
            if (temp.length == 3) {
                this.red = parseInt(temp.charAt(0) + temp.charAt(0), 16);
                this.green = parseInt(temp.charAt(1) + temp.charAt(1), 16);
                this.blue = parseInt(temp.charAt(2) + temp.charAt(2), 16);
            }
            else {
                this.red = parseInt(temp.substring(0, 2), 16);
                this.green = parseInt(temp.substring(2, 4), 16);
                this.blue = parseInt(temp.substring(4, 6), 16);
            }
        }
        else if (/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.test(text)) {
            this.type = "color";
            this.red = +RegExp.$1;
            this.green = +RegExp.$2;
            this.blue = +RegExp.$3;
        }
        else if (/^rgb\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i.test(text)) {
            this.type = "color";
            this.red = +RegExp.$1 * 255 / 100;
            this.green = +RegExp.$2 * 255 / 100;
            this.blue = +RegExp.$3 * 255 / 100;
        }
        else if (/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d\.]+)\s*\)/i.test(text)) {
            this.type = "color";
            this.red = +RegExp.$1;
            this.green = +RegExp.$2;
            this.blue = +RegExp.$3;
            this.alpha = +RegExp.$4;
        }
        else if (/^rgba\(\s*(\d+)%\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d\.]+)\s*\)/i.test(text)) {
            this.type = "color";
            this.red = +RegExp.$1 * 255 / 100;
            this.green = +RegExp.$2 * 255 / 100;
            this.blue = +RegExp.$3 * 255 / 100;
            this.alpha = +RegExp.$4;
        }
        else if (/^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i.test(text)) {
            this.type = "color";
            this.hue = +RegExp.$1;
            this.saturation = +RegExp.$2 / 100;
            this.lightness = +RegExp.$3 / 100;
        }
        else if (/^hsla\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d\.]+)\s*\)/i.test(text)) {
            this.type = "color";
            this.hue = +RegExp.$1;
            this.saturation = +RegExp.$2 / 100;
            this.lightness = +RegExp.$3 / 100;
            this.alpha = +RegExp.$4;
        }
        else if (/^url\(["']?([^\)"']+)["']?\)/i.test(text)) {
            this.type = "uri";
            this.uri = RegExp.$1;
        }
        else if (/^([^\(]+)\(/i.test(text)) {
            this.type = "function";
            this.name = RegExp.$1;
            this.value = text;
        }
        else if (/^["'][^"']*["']/.test(text)) {
            this.type = "string";
            this.value = eval(text);
        }
        else if (Colors[text.toLowerCase()]) {
            this.type = "color";
            temp = Colors[text.toLowerCase()].substring(1);
            this.red = parseInt(temp.substring(0, 2), 16);
            this.green = parseInt(temp.substring(2, 4), 16);
            this.blue = parseInt(temp.substring(4, 6), 16);
        }
        else if (/^[\,\/]$/.test(text)) {
            this.type = "operator";
            this.value = text;
        }
        else if (/^[a-z\-_\u0080-\uFFFF][a-z0-9\-_\u0080-\uFFFF]*$/i.test(text)) {
            this.type = "identifier";
            this.value = text;
        }
    }
    PropertyValuePart.prototype = new SyntaxUnit();
    PropertyValuePart.prototype.constructor = PropertyValuePart;
    PropertyValuePart.fromToken = function (token) {
        return new PropertyValuePart(token.value, token.startLine, token.startCol);
    };
    var Pseudos = {
        ":first-letter": 1,
        ":first-line": 1,
        ":before": 1,
        ":after": 1
    };
    Pseudos.ELEMENT = 1;
    Pseudos.CLASS = 2;
    Pseudos.isElement = function (pseudo) {
        return pseudo.indexOf("::") === 0 || Pseudos[pseudo.toLowerCase()] == Pseudos.ELEMENT;
    };
    function Selector(parts, line, col) {
        SyntaxUnit.call(this, parts.join(" "), line, col, Parser.SELECTOR_TYPE);
        this.parts = parts;
        this.specificity = Specificity.calculate(this);
    }
    Selector.prototype = new SyntaxUnit();
    Selector.prototype.constructor = Selector;
    function SelectorPart(elementName, modifiers, text, line, col) {
        SyntaxUnit.call(this, text, line, col, Parser.SELECTOR_PART_TYPE);
        this.elementName = elementName;
        this.modifiers = modifiers;
    }
    SelectorPart.prototype = new SyntaxUnit();
    SelectorPart.prototype.constructor = SelectorPart;
    function SelectorSubPart(text, type, line, col) {
        SyntaxUnit.call(this, text, line, col, Parser.SELECTOR_SUB_PART_TYPE);
        this.type = type;
        this.args = [];
    }
    SelectorSubPart.prototype = new SyntaxUnit();
    SelectorSubPart.prototype.constructor = SelectorSubPart;
    function Specificity(a, b, c, d) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }
    Specificity.prototype = {
        constructor: Specificity,
        compare: function (other) {
            var comps = ["a", "b", "c", "d"], i, len;
            for (i = 0, len = comps.length; i < len; i++) {
                if (this[comps[i]] < other[comps[i]]) {
                    return -1;
                }
                else if (this[comps[i]] > other[comps[i]]) {
                    return 1;
                }
            }
            return 0;
        },
        valueOf: function () {
            return (this.a * 1000) + (this.b * 100) + (this.c * 10) + this.d;
        },
        toString: function () {
            return this.a + "," + this.b + "," + this.c + "," + this.d;
        }
    };
    Specificity.calculate = function (selector) {
        var i, len, part, b = 0, c = 0, d = 0;
        function updateValues(part) {
            var i, j, len, num, elementName = part.elementName ? part.elementName.text : "", modifier;
            if (elementName && elementName.charAt(elementName.length - 1) != "*") {
                d++;
            }
            for (i = 0, len = part.modifiers.length; i < len; i++) {
                modifier = part.modifiers[i];
                switch (modifier.type) {
                    case "class":
                    case "attribute":
                        c++;
                        break;
                    case "id":
                        b++;
                        break;
                    case "pseudo":
                        if (Pseudos.isElement(modifier.text)) {
                            d++;
                        }
                        else {
                            c++;
                        }
                        break;
                    case "not":
                        for (j = 0, num = modifier.args.length; j < num; j++) {
                            updateValues(modifier.args[j]);
                        }
                }
            }
        }
        for (i = 0, len = selector.parts.length; i < len; i++) {
            part = selector.parts[i];
            if (part instanceof SelectorPart) {
                updateValues(part);
            }
        }
        return new Specificity(0, b, c, d);
    };
    var h = /^[0-9a-fA-F]$/, nonascii = /^[\u0080-\uFFFF]$/, nl = /\n|\r\n|\r|\f/;
    function isHexDigit(c) {
        return c !== null && h.test(c);
    }
    function isDigit(c) {
        return c !== null && /\d/.test(c);
    }
    function isWhitespace(c) {
        return c !== null && /\s/.test(c);
    }
    function isNewLine(c) {
        return c !== null && nl.test(c);
    }
    function isNameStart(c) {
        return c !== null && (/[a-z_\u0080-\uFFFF\\]/i.test(c));
    }
    function isNameChar(c) {
        return c !== null && (isNameStart(c) || /[0-9\-\\]/.test(c));
    }
    function isIdentStart(c) {
        return c !== null && (isNameStart(c) || /\-\\/.test(c));
    }
    function mix(receiver, supplier) {
        for (var prop in supplier) {
            if (supplier.hasOwnProperty(prop)) {
                receiver[prop] = supplier[prop];
            }
        }
        return receiver;
    }
    function TokenStream(input) {
        TokenStreamBase.call(this, input, Tokens);
    }
    TokenStream.prototype = mix(new TokenStreamBase(), {
        _getToken: function (channel) {
            var c, reader = this._reader, token = null, startLine = reader.getLine(), startCol = reader.getCol();
            c = reader.read();
            while (c) {
                switch (c) {
                    case "/":
                        if (reader.peek() == "*") {
                            token = this.commentToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                        break;
                    case "|":
                    case "~":
                    case "^":
                    case "$":
                    case "*":
                        if (reader.peek() == "=") {
                            token = this.comparisonToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                        break;
                    case "\"":
                    case "'":
                        token = this.stringToken(c, startLine, startCol);
                        break;
                    case "#":
                        if (isNameChar(reader.peek())) {
                            token = this.hashToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                        break;
                    case ".":
                        if (isDigit(reader.peek())) {
                            token = this.numberToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                        break;
                    case "-":
                        if (reader.peek() == "-") {
                            token = this.htmlCommentEndToken(c, startLine, startCol);
                        }
                        else if (isNameStart(reader.peek())) {
                            token = this.identOrFunctionToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                        break;
                    case "!":
                        token = this.importantToken(c, startLine, startCol);
                        break;
                    case "@":
                        token = this.atRuleToken(c, startLine, startCol);
                        break;
                    case ":":
                        token = this.notToken(c, startLine, startCol);
                        break;
                    case "<":
                        token = this.htmlCommentStartToken(c, startLine, startCol);
                        break;
                    case "U":
                    case "u":
                        if (reader.peek() == "+") {
                            token = this.unicodeRangeToken(c, startLine, startCol);
                            break;
                        }
                    default:
                        if (isDigit(c)) {
                            token = this.numberToken(c, startLine, startCol);
                        }
                        else if (isWhitespace(c)) {
                            token = this.whitespaceToken(c, startLine, startCol);
                        }
                        else if (isIdentStart(c)) {
                            token = this.identOrFunctionToken(c, startLine, startCol);
                        }
                        else {
                            token = this.charToken(c, startLine, startCol);
                        }
                }
                break;
            }
            if (!token && c === null) {
                token = this.createToken(Tokens.EOF, null, startLine, startCol);
            }
            return token;
        },
        createToken: function (tt, value, startLine, startCol, options) {
            var reader = this._reader;
            options = options || {};
            return {
                value: value,
                type: tt,
                channel: options.channel,
                endChar: options.endChar,
                hide: options.hide || false,
                startLine: startLine,
                startCol: startCol,
                endLine: reader.getLine(),
                endCol: reader.getCol()
            };
        },
        atRuleToken: function (first, startLine, startCol) {
            var rule = first, reader = this._reader, tt = Tokens.CHAR, valid = false, ident, c;
            reader.mark();
            ident = this.readName();
            rule = first + ident;
            tt = Tokens.type(rule.toLowerCase());
            if (tt == Tokens.CHAR || tt == Tokens.UNKNOWN) {
                if (rule.length > 1) {
                    tt = Tokens.UNKNOWN_SYM;
                }
                else {
                    tt = Tokens.CHAR;
                    rule = first;
                    reader.reset();
                }
            }
            return this.createToken(tt, rule, startLine, startCol);
        },
        charToken: function (c, startLine, startCol) {
            var tt = Tokens.type(c);
            var opts = {};
            if (tt == -1) {
                tt = Tokens.CHAR;
            }
            else {
                opts.endChar = Tokens[tt].endChar;
            }
            return this.createToken(tt, c, startLine, startCol, opts);
        },
        commentToken: function (first, startLine, startCol) {
            var reader = this._reader, comment = this.readComment(first);
            return this.createToken(Tokens.COMMENT, comment, startLine, startCol);
        },
        comparisonToken: function (c, startLine, startCol) {
            var reader = this._reader, comparison = c + reader.read(), tt = Tokens.type(comparison) || Tokens.CHAR;
            return this.createToken(tt, comparison, startLine, startCol);
        },
        hashToken: function (first, startLine, startCol) {
            var reader = this._reader, name = this.readName(first);
            return this.createToken(Tokens.HASH, name, startLine, startCol);
        },
        htmlCommentStartToken: function (first, startLine, startCol) {
            var reader = this._reader, text = first;
            reader.mark();
            text += reader.readCount(3);
            if (text == "<!--") {
                return this.createToken(Tokens.CDO, text, startLine, startCol);
            }
            else {
                reader.reset();
                return this.charToken(first, startLine, startCol);
            }
        },
        htmlCommentEndToken: function (first, startLine, startCol) {
            var reader = this._reader, text = first;
            reader.mark();
            text += reader.readCount(2);
            if (text == "-->") {
                return this.createToken(Tokens.CDC, text, startLine, startCol);
            }
            else {
                reader.reset();
                return this.charToken(first, startLine, startCol);
            }
        },
        identOrFunctionToken: function (first, startLine, startCol) {
            var reader = this._reader, ident = this.readName(first), tt = Tokens.IDENT;
            if (reader.peek() == "(") {
                ident += reader.read();
                if (ident.toLowerCase() == "url(") {
                    tt = Tokens.URI;
                    ident = this.readURI(ident);
                    if (ident.toLowerCase() == "url(") {
                        tt = Tokens.FUNCTION;
                    }
                }
                else {
                    tt = Tokens.FUNCTION;
                }
            }
            else if (reader.peek() == ":") {
                if (ident.toLowerCase() == "progid") {
                    ident += reader.readTo("(");
                    tt = Tokens.IE_FUNCTION;
                }
            }
            return this.createToken(tt, ident, startLine, startCol);
        },
        importantToken: function (first, startLine, startCol) {
            var reader = this._reader, important = first, tt = Tokens.CHAR, temp, c;
            reader.mark();
            c = reader.read();
            while (c) {
                if (c == "/") {
                    if (reader.peek() != "*") {
                        break;
                    }
                    else {
                        temp = this.readComment(c);
                        if (temp === "") {
                            break;
                        }
                    }
                }
                else if (isWhitespace(c)) {
                    important += c + this.readWhitespace();
                }
                else if (/i/i.test(c)) {
                    temp = reader.readCount(8);
                    if (/mportant/i.test(temp)) {
                        important += c + temp;
                        tt = Tokens.IMPORTANT_SYM;
                    }
                    break;
                }
                else {
                    break;
                }
                c = reader.read();
            }
            if (tt == Tokens.CHAR) {
                reader.reset();
                return this.charToken(first, startLine, startCol);
            }
            else {
                return this.createToken(tt, important, startLine, startCol);
            }
        },
        notToken: function (first, startLine, startCol) {
            var reader = this._reader, text = first;
            reader.mark();
            text += reader.readCount(4);
            if (text.toLowerCase() == ":not(") {
                return this.createToken(Tokens.NOT, text, startLine, startCol);
            }
            else {
                reader.reset();
                return this.charToken(first, startLine, startCol);
            }
        },
        numberToken: function (first, startLine, startCol) {
            var reader = this._reader, value = this.readNumber(first), ident, tt = Tokens.NUMBER, c = reader.peek();
            if (isIdentStart(c)) {
                ident = this.readName(reader.read());
                value += ident;
                if (/^em$|^ex$|^px$|^gd$|^rem$|^vw$|^vh$|^vmax$|^vmin$|^ch$|^cm$|^mm$|^in$|^pt$|^pc$/i.test(ident)) {
                    tt = Tokens.LENGTH;
                }
                else if (/^deg|^rad$|^grad$/i.test(ident)) {
                    tt = Tokens.ANGLE;
                }
                else if (/^ms$|^s$/i.test(ident)) {
                    tt = Tokens.TIME;
                }
                else if (/^hz$|^khz$/i.test(ident)) {
                    tt = Tokens.FREQ;
                }
                else if (/^dpi$|^dpcm$/i.test(ident)) {
                    tt = Tokens.RESOLUTION;
                }
                else {
                    tt = Tokens.DIMENSION;
                }
            }
            else if (c == "%") {
                value += reader.read();
                tt = Tokens.PERCENTAGE;
            }
            return this.createToken(tt, value, startLine, startCol);
        },
        stringToken: function (first, startLine, startCol) {
            var delim = first, string = first, reader = this._reader, prev = first, tt = Tokens.STRING, c = reader.read();
            while (c) {
                string += c;
                if (c == delim && prev != "\\") {
                    break;
                }
                if (isNewLine(reader.peek()) && c != "\\") {
                    tt = Tokens.INVALID;
                    break;
                }
                prev = c;
                c = reader.read();
            }
            if (c === null) {
                tt = Tokens.INVALID;
            }
            return this.createToken(tt, string, startLine, startCol);
        },
        unicodeRangeToken: function (first, startLine, startCol) {
            var reader = this._reader, value = first, temp, tt = Tokens.CHAR;
            if (reader.peek() == "+") {
                reader.mark();
                value += reader.read();
                value += this.readUnicodeRangePart(true);
                if (value.length == 2) {
                    reader.reset();
                }
                else {
                    tt = Tokens.UNICODE_RANGE;
                    if (value.indexOf("?") == -1) {
                        if (reader.peek() == "-") {
                            reader.mark();
                            temp = reader.read();
                            temp += this.readUnicodeRangePart(false);
                            if (temp.length == 1) {
                                reader.reset();
                            }
                            else {
                                value += temp;
                            }
                        }
                    }
                }
            }
            return this.createToken(tt, value, startLine, startCol);
        },
        whitespaceToken: function (first, startLine, startCol) {
            var reader = this._reader, value = first + this.readWhitespace();
            return this.createToken(Tokens.S, value, startLine, startCol);
        },
        readUnicodeRangePart: function (allowQuestionMark) {
            var reader = this._reader, part = "", c = reader.peek();
            while (isHexDigit(c) && part.length < 6) {
                reader.read();
                part += c;
                c = reader.peek();
            }
            if (allowQuestionMark) {
                while (c == "?" && part.length < 6) {
                    reader.read();
                    part += c;
                    c = reader.peek();
                }
            }
            return part;
        },
        readWhitespace: function () {
            var reader = this._reader, whitespace = "", c = reader.peek();
            while (isWhitespace(c)) {
                reader.read();
                whitespace += c;
                c = reader.peek();
            }
            return whitespace;
        },
        readNumber: function (first) {
            var reader = this._reader, number = first, hasDot = (first == "."), c = reader.peek();
            while (c) {
                if (isDigit(c)) {
                    number += reader.read();
                }
                else if (c == ".") {
                    if (hasDot) {
                        break;
                    }
                    else {
                        hasDot = true;
                        number += reader.read();
                    }
                }
                else {
                    break;
                }
                c = reader.peek();
            }
            return number;
        },
        readString: function () {
            var reader = this._reader, delim = reader.read(), string = delim, prev = delim, c = reader.peek();
            while (c) {
                c = reader.read();
                string += c;
                if (c == delim && prev != "\\") {
                    break;
                }
                if (isNewLine(reader.peek()) && c != "\\") {
                    string = "";
                    break;
                }
                prev = c;
                c = reader.peek();
            }
            if (c === null) {
                string = "";
            }
            return string;
        },
        readURI: function (first) {
            var reader = this._reader, uri = first, inner = "", c = reader.peek();
            reader.mark();
            while (c && isWhitespace(c)) {
                reader.read();
                c = reader.peek();
            }
            if (c == "'" || c == "\"") {
                inner = this.readString();
            }
            else {
                inner = this.readURL();
            }
            c = reader.peek();
            while (c && isWhitespace(c)) {
                reader.read();
                c = reader.peek();
            }
            if (inner === "" || c != ")") {
                uri = first;
                reader.reset();
            }
            else {
                uri += inner + reader.read();
            }
            return uri;
        },
        readURL: function () {
            var reader = this._reader, url = "", c = reader.peek();
            while (/^[!#$%&\\*-~]$/.test(c)) {
                url += reader.read();
                c = reader.peek();
            }
            return url;
        },
        readName: function (first) {
            var reader = this._reader, ident = first || "", c = reader.peek();
            while (true) {
                if (c == "\\") {
                    ident += this.readEscape(reader.read());
                    c = reader.peek();
                }
                else if (c && isNameChar(c)) {
                    ident += reader.read();
                    c = reader.peek();
                }
                else {
                    break;
                }
            }
            return ident;
        },
        readEscape: function (first) {
            var reader = this._reader, cssEscape = first || "", i = 0, c = reader.peek();
            if (isHexDigit(c)) {
                do {
                    cssEscape += reader.read();
                    c = reader.peek();
                } while (c && isHexDigit(c) && ++i < 6);
            }
            if (cssEscape.length == 3 && /\s/.test(c) ||
                cssEscape.length == 7 || cssEscape.length == 1) {
                reader.read();
            }
            else {
                c = "";
            }
            return cssEscape + c;
        },
        readComment: function (first) {
            var reader = this._reader, comment = first || "", c = reader.read();
            if (c == "*") {
                while (c) {
                    comment += c;
                    if (comment.length > 2 && c == "*" && reader.peek() == "/") {
                        comment += reader.read();
                        break;
                    }
                    c = reader.read();
                }
                return comment;
            }
            else {
                return "";
            }
        }
    });
    var Tokens = [
        { name: "CDO" },
        { name: "CDC" },
        { name: "S", whitespace: true },
        { name: "COMMENT", comment: true, hide: true, channel: "comment" },
        { name: "INCLUDES", text: "~=" },
        { name: "DASHMATCH", text: "|=" },
        { name: "PREFIXMATCH", text: "^=" },
        { name: "SUFFIXMATCH", text: "$=" },
        { name: "SUBSTRINGMATCH", text: "*=" },
        { name: "STRING" },
        { name: "IDENT" },
        { name: "HASH" },
        { name: "IMPORT_SYM", text: "@import" },
        { name: "PAGE_SYM", text: "@page" },
        { name: "MEDIA_SYM", text: "@media" },
        { name: "FONT_FACE_SYM", text: "@font-face" },
        { name: "CHARSET_SYM", text: "@charset" },
        { name: "NAMESPACE_SYM", text: "@namespace" },
        { name: "VIEWPORT_SYM", text: ["@viewport", "@-ms-viewport"] },
        { name: "UNKNOWN_SYM" },
        { name: "KEYFRAMES_SYM", text: ["@keyframes", "@-webkit-keyframes", "@-moz-keyframes", "@-o-keyframes"] },
        { name: "IMPORTANT_SYM" },
        { name: "LENGTH" },
        { name: "ANGLE" },
        { name: "TIME" },
        { name: "FREQ" },
        { name: "DIMENSION" },
        { name: "PERCENTAGE" },
        { name: "NUMBER" },
        { name: "URI" },
        { name: "FUNCTION" },
        { name: "UNICODE_RANGE" },
        { name: "INVALID" },
        { name: "PLUS", text: "+" },
        { name: "GREATER", text: ">" },
        { name: "COMMA", text: "," },
        { name: "TILDE", text: "~" },
        { name: "NOT" },
        { name: "TOPLEFTCORNER_SYM", text: "@top-left-corner" },
        { name: "TOPLEFT_SYM", text: "@top-left" },
        { name: "TOPCENTER_SYM", text: "@top-center" },
        { name: "TOPRIGHT_SYM", text: "@top-right" },
        { name: "TOPRIGHTCORNER_SYM", text: "@top-right-corner" },
        { name: "BOTTOMLEFTCORNER_SYM", text: "@bottom-left-corner" },
        { name: "BOTTOMLEFT_SYM", text: "@bottom-left" },
        { name: "BOTTOMCENTER_SYM", text: "@bottom-center" },
        { name: "BOTTOMRIGHT_SYM", text: "@bottom-right" },
        { name: "BOTTOMRIGHTCORNER_SYM", text: "@bottom-right-corner" },
        { name: "LEFTTOP_SYM", text: "@left-top" },
        { name: "LEFTMIDDLE_SYM", text: "@left-middle" },
        { name: "LEFTBOTTOM_SYM", text: "@left-bottom" },
        { name: "RIGHTTOP_SYM", text: "@right-top" },
        { name: "RIGHTMIDDLE_SYM", text: "@right-middle" },
        { name: "RIGHTBOTTOM_SYM", text: "@right-bottom" },
        { name: "RESOLUTION", state: "media" },
        { name: "IE_FUNCTION" },
        { name: "CHAR" },
        {
            name: "PIPE",
            text: "|"
        },
        {
            name: "SLASH",
            text: "/"
        },
        {
            name: "MINUS",
            text: "-"
        },
        {
            name: "STAR",
            text: "*"
        },
        {
            name: "LBRACE",
            endChar: "}",
            text: "{"
        },
        {
            name: "RBRACE",
            text: "}"
        },
        {
            name: "LBRACKET",
            endChar: "]",
            text: "["
        },
        {
            name: "RBRACKET",
            text: "]"
        },
        {
            name: "EQUALS",
            text: "="
        },
        {
            name: "COLON",
            text: ":"
        },
        {
            name: "SEMICOLON",
            text: ";"
        },
        {
            name: "LPAREN",
            endChar: ")",
            text: "("
        },
        {
            name: "RPAREN",
            text: ")"
        },
        {
            name: "DOT",
            text: "."
        }
    ];
    (function () {
        var nameMap = [], typeMap = {};
        Tokens.UNKNOWN = -1;
        Tokens.unshift({ name: "EOF" });
        for (var i = 0, len = Tokens.length; i < len; i++) {
            nameMap.push(Tokens[i].name);
            Tokens[Tokens[i].name] = i;
            if (Tokens[i].text) {
                if (Tokens[i].text instanceof Array) {
                    for (var j = 0; j < Tokens[i].text.length; j++) {
                        typeMap[Tokens[i].text[j]] = i;
                    }
                }
                else {
                    typeMap[Tokens[i].text] = i;
                }
            }
        }
        Tokens.name = function (tt) {
            return nameMap[tt];
        };
        Tokens.type = function (c) {
            return typeMap[c] || -1;
        };
    })();
    var Validation = {
        validate: function (property, value) {
            var name = property.toString().toLowerCase(), parts = value.parts, expression = new PropertyValueIterator(value), spec = Properties[name], part, valid, j, count, msg, types, last, literals, max, multi, group;
            if (!spec) {
                if (name.indexOf("-") !== 0) {
                    throw new ValidationError("Unknown property '" + property + "'.", property.line, property.col);
                }
            }
            else if (typeof spec != "number") {
                if (typeof spec == "string") {
                    if (spec.indexOf("||") > -1) {
                        this.groupProperty(spec, expression);
                    }
                    else {
                        this.singleProperty(spec, expression, 1);
                    }
                }
                else if (spec.multi) {
                    this.multiProperty(spec.multi, expression, spec.comma, spec.max || Infinity);
                }
                else if (typeof spec == "function") {
                    spec(expression);
                }
            }
        },
        singleProperty: function (types, expression, max, partial) {
            var result = false, value = expression.value, count = 0, part;
            while (expression.hasNext() && count < max) {
                result = ValidationTypes.isAny(expression, types);
                if (!result) {
                    break;
                }
                count++;
            }
            if (!result) {
                if (expression.hasNext() && !expression.isFirst()) {
                    part = expression.peek();
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    throw new ValidationError("Expected (" + types + ") but found '" + value + "'.", value.line, value.col);
                }
            }
            else if (expression.hasNext()) {
                part = expression.next();
                throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
            }
        },
        multiProperty: function (types, expression, comma, max) {
            var result = false, value = expression.value, count = 0, sep = false, part;
            while (expression.hasNext() && !result && count < max) {
                if (ValidationTypes.isAny(expression, types)) {
                    count++;
                    if (!expression.hasNext()) {
                        result = true;
                    }
                    else if (comma) {
                        if (expression.peek() == ",") {
                            part = expression.next();
                        }
                        else {
                            break;
                        }
                    }
                }
                else {
                    break;
                }
            }
            if (!result) {
                if (expression.hasNext() && !expression.isFirst()) {
                    part = expression.peek();
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    part = expression.previous();
                    if (comma && part == ",") {
                        throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                    }
                    else {
                        throw new ValidationError("Expected (" + types + ") but found '" + value + "'.", value.line, value.col);
                    }
                }
            }
            else if (expression.hasNext()) {
                part = expression.next();
                throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
            }
        },
        groupProperty: function (types, expression, comma) {
            var result = false, value = expression.value, typeCount = types.split("||").length, groups = { count: 0 }, partial = false, name, part;
            while (expression.hasNext() && !result) {
                name = ValidationTypes.isAnyOfGroup(expression, types);
                if (name) {
                    if (groups[name]) {
                        break;
                    }
                    else {
                        groups[name] = 1;
                        groups.count++;
                        partial = true;
                        if (groups.count == typeCount || !expression.hasNext()) {
                            result = true;
                        }
                    }
                }
                else {
                    break;
                }
            }
            if (!result) {
                if (partial && expression.hasNext()) {
                    part = expression.peek();
                    throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
                }
                else {
                    throw new ValidationError("Expected (" + types + ") but found '" + value + "'.", value.line, value.col);
                }
            }
            else if (expression.hasNext()) {
                part = expression.next();
                throw new ValidationError("Expected end of value but found '" + part + "'.", part.line, part.col);
            }
        }
    };
    function ValidationError(message, line, col) {
        this.col = col;
        this.line = line;
        this.message = message;
    }
    ValidationError.prototype = new Error();
    var ValidationTypes = {
        isLiteral: function (part, literals) {
            var text = part.text.toString().toLowerCase(), args = literals.split(" | "), i, len, found = false;
            for (i = 0, len = args.length; i < len && !found; i++) {
                if (text == args[i].toLowerCase()) {
                    found = true;
                }
            }
            return found;
        },
        isSimple: function (type) {
            return !!this.simple[type];
        },
        isComplex: function (type) {
            return !!this.complex[type];
        },
        isAny: function (expression, types) {
            var args = types.split(" | "), i, len, found = false;
            for (i = 0, len = args.length; i < len && !found && expression.hasNext(); i++) {
                found = this.isType(expression, args[i]);
            }
            return found;
        },
        isAnyOfGroup: function (expression, types) {
            var args = types.split(" || "), i, len, found = false;
            for (i = 0, len = args.length; i < len && !found; i++) {
                found = this.isType(expression, args[i]);
            }
            return found ? args[i - 1] : false;
        },
        isType: function (expression, type) {
            var part = expression.peek(), result = false;
            if (type.charAt(0) != "<") {
                result = this.isLiteral(part, type);
                if (result) {
                    expression.next();
                }
            }
            else if (this.simple[type]) {
                result = this.simple[type](part);
                if (result) {
                    expression.next();
                }
            }
            else {
                result = this.complex[type](expression);
            }
            return result;
        },
        simple: {
            "<absolute-size>": function (part) {
                return ValidationTypes.isLiteral(part, "xx-small | x-small | small | medium | large | x-large | xx-large");
            },
            "<attachment>": function (part) {
                return ValidationTypes.isLiteral(part, "scroll | fixed | local");
            },
            "<attr>": function (part) {
                return part.type == "function" && part.name == "attr";
            },
            "<bg-image>": function (part) {
                return this["<image>"](part) || this["<gradient>"](part) || part == "none";
            },
            "<gradient>": function (part) {
                return part.type == "function" && /^(?:\-(?:ms|moz|o|webkit)\-)?(?:repeating\-)?(?:radial\-|linear\-)?gradient/i.test(part);
            },
            "<box>": function (part) {
                return ValidationTypes.isLiteral(part, "padding-box | border-box | content-box");
            },
            "<content>": function (part) {
                return part.type == "function" && part.name == "content";
            },
            "<relative-size>": function (part) {
                return ValidationTypes.isLiteral(part, "smaller | larger");
            },
            "<ident>": function (part) {
                return part.type == "identifier";
            },
            "<length>": function (part) {
                if (part.type == "function" && /^(?:\-(?:ms|moz|o|webkit)\-)?calc/i.test(part)) {
                    return true;
                }
                else {
                    return part.type == "length" || part.type == "number" || part.type == "integer" || part == "0";
                }
            },
            "<color>": function (part) {
                return part.type == "color" || part == "transparent";
            },
            "<number>": function (part) {
                return part.type == "number" || this["<integer>"](part);
            },
            "<integer>": function (part) {
                return part.type == "integer";
            },
            "<line>": function (part) {
                return part.type == "integer";
            },
            "<angle>": function (part) {
                return part.type == "angle";
            },
            "<uri>": function (part) {
                return part.type == "uri";
            },
            "<image>": function (part) {
                return this["<uri>"](part);
            },
            "<percentage>": function (part) {
                return part.type == "percentage" || part == "0";
            },
            "<border-width>": function (part) {
                return this["<length>"](part) || ValidationTypes.isLiteral(part, "thin | medium | thick");
            },
            "<border-style>": function (part) {
                return ValidationTypes.isLiteral(part, "none | hidden | dotted | dashed | solid | double | groove | ridge | inset | outset");
            },
            "<content-sizing>": function (part) {
                return ValidationTypes.isLiteral(part, "fill-available | -moz-available | -webkit-fill-available | max-content | -moz-max-content | -webkit-max-content | min-content | -moz-min-content | -webkit-min-content | fit-content | -moz-fit-content | -webkit-fit-content");
            },
            "<margin-width>": function (part) {
                return this["<length>"](part) || this["<percentage>"](part) || ValidationTypes.isLiteral(part, "auto");
            },
            "<padding-width>": function (part) {
                return this["<length>"](part) || this["<percentage>"](part);
            },
            "<shape>": function (part) {
                return part.type == "function" && (part.name == "rect" || part.name == "inset-rect");
            },
            "<time>": function (part) {
                return part.type == "time";
            },
            "<flex-grow>": function (part) {
                return this["<number>"](part);
            },
            "<flex-shrink>": function (part) {
                return this["<number>"](part);
            },
            "<width>": function (part) {
                return this["<margin-width>"](part);
            },
            "<flex-basis>": function (part) {
                return this["<width>"](part);
            },
            "<flex-direction>": function (part) {
                return ValidationTypes.isLiteral(part, "row | row-reverse | column | column-reverse");
            },
            "<flex-wrap>": function (part) {
                return ValidationTypes.isLiteral(part, "nowrap | wrap | wrap-reverse");
            }
        },
        complex: {
            "<bg-position>": function (expression) {
                var types = this, result = false, numeric = "<percentage> | <length>", xDir = "left | right", yDir = "top | bottom", count = 0, hasNext = function () {
                    return expression.hasNext() && expression.peek() != ",";
                };
                while (expression.peek(count) && expression.peek(count) != ",") {
                    count++;
                }
                if (count < 3) {
                    if (ValidationTypes.isAny(expression, xDir + " | center | " + numeric)) {
                        result = true;
                        ValidationTypes.isAny(expression, yDir + " | center | " + numeric);
                    }
                    else if (ValidationTypes.isAny(expression, yDir)) {
                        result = true;
                        ValidationTypes.isAny(expression, xDir + " | center");
                    }
                }
                else {
                    if (ValidationTypes.isAny(expression, xDir)) {
                        if (ValidationTypes.isAny(expression, yDir)) {
                            result = true;
                            ValidationTypes.isAny(expression, numeric);
                        }
                        else if (ValidationTypes.isAny(expression, numeric)) {
                            if (ValidationTypes.isAny(expression, yDir)) {
                                result = true;
                                ValidationTypes.isAny(expression, numeric);
                            }
                            else if (ValidationTypes.isAny(expression, "center")) {
                                result = true;
                            }
                        }
                    }
                    else if (ValidationTypes.isAny(expression, yDir)) {
                        if (ValidationTypes.isAny(expression, xDir)) {
                            result = true;
                            ValidationTypes.isAny(expression, numeric);
                        }
                        else if (ValidationTypes.isAny(expression, numeric)) {
                            if (ValidationTypes.isAny(expression, xDir)) {
                                result = true;
                                ValidationTypes.isAny(expression, numeric);
                            }
                            else if (ValidationTypes.isAny(expression, "center")) {
                                result = true;
                            }
                        }
                    }
                    else if (ValidationTypes.isAny(expression, "center")) {
                        if (ValidationTypes.isAny(expression, xDir + " | " + yDir)) {
                            result = true;
                            ValidationTypes.isAny(expression, numeric);
                        }
                    }
                }
                return result;
            },
            "<bg-size>": function (expression) {
                var types = this, result = false, numeric = "<percentage> | <length> | auto", part, i, len;
                if (ValidationTypes.isAny(expression, "cover | contain")) {
                    result = true;
                }
                else if (ValidationTypes.isAny(expression, numeric)) {
                    result = true;
                    ValidationTypes.isAny(expression, numeric);
                }
                return result;
            },
            "<repeat-style>": function (expression) {
                var result = false, values = "repeat | space | round | no-repeat", part;
                if (expression.hasNext()) {
                    part = expression.next();
                    if (ValidationTypes.isLiteral(part, "repeat-x | repeat-y")) {
                        result = true;
                    }
                    else if (ValidationTypes.isLiteral(part, values)) {
                        result = true;
                        if (expression.hasNext() && ValidationTypes.isLiteral(expression.peek(), values)) {
                            expression.next();
                        }
                    }
                }
                return result;
            },
            "<shadow>": function (expression) {
                var result = false, count = 0, inset = false, color = false, part;
                if (expression.hasNext()) {
                    if (ValidationTypes.isAny(expression, "inset")) {
                        inset = true;
                    }
                    if (ValidationTypes.isAny(expression, "<color>")) {
                        color = true;
                    }
                    while (ValidationTypes.isAny(expression, "<length>") && count < 4) {
                        count++;
                    }
                    if (expression.hasNext()) {
                        if (!color) {
                            ValidationTypes.isAny(expression, "<color>");
                        }
                        if (!inset) {
                            ValidationTypes.isAny(expression, "inset");
                        }
                    }
                    result = (count >= 2 && count <= 4);
                }
                return result;
            },
            "<x-one-radius>": function (expression) {
                var result = false, simple = "<length> | <percentage> | inherit";
                if (ValidationTypes.isAny(expression, simple)) {
                    result = true;
                    ValidationTypes.isAny(expression, simple);
                }
                return result;
            },
            "<flex>": function (expression) {
                var part, result = false;
                if (ValidationTypes.isAny(expression, "none | inherit")) {
                    result = true;
                }
                else {
                    if (ValidationTypes.isType(expression, "<flex-grow>")) {
                        if (expression.peek()) {
                            if (ValidationTypes.isType(expression, "<flex-shrink>")) {
                                if (expression.peek()) {
                                    result = ValidationTypes.isType(expression, "<flex-basis>");
                                }
                                else {
                                    result = true;
                                }
                            }
                            else if (ValidationTypes.isType(expression, "<flex-basis>")) {
                                result = expression.peek() === null;
                            }
                        }
                        else {
                            result = true;
                        }
                    }
                    else if (ValidationTypes.isType(expression, "<flex-basis>")) {
                        result = true;
                    }
                }
                if (!result) {
                    part = expression.peek();
                    throw new ValidationError("Expected (none | [ <flex-grow> <flex-shrink>? || <flex-basis> ]) but found '" + expression.value.text + "'.", part.line, part.col);
                }
                return result;
            }
        }
    };
    parserlib.css = {
        Colors: Colors,
        Combinator: Combinator,
        Parser: Parser,
        PropertyName: PropertyName,
        PropertyValue: PropertyValue,
        PropertyValuePart: PropertyValuePart,
        MediaFeature: MediaFeature,
        MediaQuery: MediaQuery,
        Selector: Selector,
        SelectorPart: SelectorPart,
        SelectorSubPart: SelectorSubPart,
        Specificity: Specificity,
        TokenStream: TokenStream,
        Tokens: Tokens,
        ValidationError: ValidationError
    };
})();
(function () {
    for (var prop in parserlib) {
        exports[prop] = parserlib[prop];
    }
})();
function objectToString(o) {
    return Object.prototype.toString.call(o);
}
var util = {
    isArray: function (ar) {
        return Array.isArray(ar) || (typeof ar === 'object' && objectToString(ar) === '[object Array]');
    },
    isDate: function (d) {
        return typeof d === 'object' && objectToString(d) === '[object Date]';
    },
    isRegExp: function (re) {
        return typeof re === 'object' && objectToString(re) === '[object RegExp]';
    },
    getRegExpFlags: function (re) {
        var flags = '';
        re.global && (flags += 'g');
        re.ignoreCase && (flags += 'i');
        re.multiline && (flags += 'm');
        return flags;
    }
};
if (typeof module === 'object')
    module.exports = clone;
function clone(parent, circular, depth, prototype) {
    var allParents = [];
    var allChildren = [];
    var useBuffer = typeof Buffer != 'undefined';
    if (typeof circular == 'undefined')
        circular = true;
    if (typeof depth == 'undefined')
        depth = Infinity;
    function _clone(parent, depth) {
        if (parent === null)
            return null;
        if (depth == 0)
            return parent;
        var child;
        if (typeof parent != 'object') {
            return parent;
        }
        if (util.isArray(parent)) {
            child = [];
        }
        else if (util.isRegExp(parent)) {
            child = new RegExp(parent.source, util.getRegExpFlags(parent));
            if (parent.lastIndex)
                child.lastIndex = parent.lastIndex;
        }
        else if (util.isDate(parent)) {
            child = new Date(parent.getTime());
        }
        else if (useBuffer && Buffer.isBuffer(parent)) {
            child = new Buffer(parent.length);
            parent.copy(child);
            return child;
        }
        else {
            if (typeof prototype == 'undefined')
                child = Object.create(Object.getPrototypeOf(parent));
            else
                child = Object.create(prototype);
        }
        if (circular) {
            var index = allParents.indexOf(parent);
            if (index != -1) {
                return allChildren[index];
            }
            allParents.push(parent);
            allChildren.push(child);
        }
        for (var i in parent) {
            child[i] = _clone(parent[i], depth - 1);
        }
        return child;
    }
    return _clone(parent, depth);
}
clone.clonePrototype = function (parent) {
    if (parent === null)
        return null;
    var c = function () { };
    c.prototype = parent;
    return new c();
};
var CSSLint = (function () {
    var rules = [], formatters = [], embeddedRuleset = /\/\*csslint([^\*]*)\*\//, api = new parserlib.util.EventTarget();
    api.version = "@VERSION@";
    api.addRule = function (rule) {
        rules.push(rule);
        rules[rule.id] = rule;
    };
    api.clearRules = function () {
        rules = [];
    };
    api.getRules = function () {
        return [].concat(rules).sort(function (a, b) {
            return a.id > b.id ? 1 : 0;
        });
    };
    api.getRuleset = function () {
        var ruleset = {}, i = 0, len = rules.length;
        while (i < len) {
            ruleset[rules[i++].id] = 1;
        }
        return ruleset;
    };
    function applyEmbeddedRuleset(text, ruleset) {
        var valueMap, embedded = text && text.match(embeddedRuleset), rules = embedded && embedded[1];
        if (rules) {
            valueMap = {
                "true": 2,
                "": 1,
                "false": 0,
                "2": 2,
                "1": 1,
                "0": 0
            };
            rules.toLowerCase().split(",").forEach(function (rule) {
                var pair = rule.split(":"), property = pair[0] || "", value = pair[1] || "";
                ruleset[property.trim()] = valueMap[value.trim()];
            });
        }
        return ruleset;
    }
    api.addFormatter = function (formatter) {
        formatters[formatter.id] = formatter;
    };
    api.getFormatter = function (formatId) {
        return formatters[formatId];
    };
    api.format = function (results, filename, formatId, options) {
        var formatter = this.getFormatter(formatId), result = null;
        if (formatter) {
            result = formatter.startFormat();
            result += formatter.formatResults(results, filename, options || {});
            result += formatter.endFormat();
        }
        return result;
    };
    api.hasFormat = function (formatId) {
        return formatters.hasOwnProperty(formatId);
    };
    api.verify = function (text, ruleset) {
        var i = 0, reporter, lines, report, parser = new parserlib.css.Parser({ starHack: true, ieFilters: true,
            underscoreHack: true, strict: false });
        lines = text.replace(/\n\r?/g, "$split$").split("$split$");
        if (!ruleset) {
            ruleset = this.getRuleset();
        }
        if (embeddedRuleset.test(text)) {
            ruleset = clone(ruleset);
            ruleset = applyEmbeddedRuleset(text, ruleset);
        }
        reporter = new Reporter(lines, ruleset);
        ruleset.errors = 2;
        for (i in ruleset) {
            if (ruleset.hasOwnProperty(i) && ruleset[i]) {
                if (rules[i]) {
                    rules[i].init(parser, reporter);
                }
            }
        }
        try {
            parser.parse(text);
        }
        catch (ex) {
            reporter.error("Fatal error, cannot continue: " + ex.message, ex.line, ex.col, {});
        }
        report = {
            messages: reporter.messages,
            stats: reporter.stats,
            ruleset: reporter.ruleset
        };
        report.messages.sort(function (a, b) {
            if (a.rollup && !b.rollup) {
                return 1;
            }
            else if (!a.rollup && b.rollup) {
                return -1;
            }
            else {
                return a.line - b.line;
            }
        });
        return report;
    };
    return api;
})();
function Reporter(lines, ruleset) {
    this.messages = [];
    this.stats = [];
    this.lines = lines;
    this.ruleset = ruleset;
}
Reporter.prototype = {
    constructor: Reporter,
    error: function (message, line, col, rule) {
        this.messages.push({
            type: "error",
            line: line,
            col: col,
            message: message,
            evidence: this.lines[line - 1],
            rule: rule || {}
        });
    },
    warn: function (message, line, col, rule) {
        this.report(message, line, col, rule);
    },
    report: function (message, line, col, rule) {
        this.messages.push({
            type: this.ruleset[rule.id] === 2 ? "error" : "warning",
            line: line,
            col: col,
            message: message,
            evidence: this.lines[line - 1],
            rule: rule
        });
    },
    info: function (message, line, col, rule) {
        this.messages.push({
            type: "info",
            line: line,
            col: col,
            message: message,
            evidence: this.lines[line - 1],
            rule: rule
        });
    },
    rollupError: function (message, rule) {
        this.messages.push({
            type: "error",
            rollup: true,
            message: message,
            rule: rule
        });
    },
    rollupWarn: function (message, rule) {
        this.messages.push({
            type: "warning",
            rollup: true,
            message: message,
            rule: rule
        });
    },
    stat: function (name, value) {
        this.stats[name] = value;
    }
};
CSSLint._Reporter = Reporter;
CSSLint.Util = {
    mix: function (receiver, supplier) {
        var prop;
        for (prop in supplier) {
            if (supplier.hasOwnProperty(prop)) {
                receiver[prop] = supplier[prop];
            }
        }
        return prop;
    },
    indexOf: function (values, value) {
        if (values.indexOf) {
            return values.indexOf(value);
        }
        else {
            for (var i = 0, len = values.length; i < len; i++) {
                if (values[i] === value) {
                    return i;
                }
            }
            return -1;
        }
    },
    forEach: function (values, func) {
        if (values.forEach) {
            return values.forEach(func);
        }
        else {
            for (var i = 0, len = values.length; i < len; i++) {
                func(values[i], i, values);
            }
        }
    }
};
CSSLint.addRule({
    id: "adjoining-classes",
    name: "Disallow adjoining classes",
    desc: "Don't use adjoining classes.",
    browsers: "IE6",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, modifier, classCount, i, j, k;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                for (j = 0; j < selector.parts.length; j++) {
                    part = selector.parts[j];
                    if (part.type === parser.SELECTOR_PART_TYPE) {
                        classCount = 0;
                        for (k = 0; k < part.modifiers.length; k++) {
                            modifier = part.modifiers[k];
                            if (modifier.type === "class") {
                                classCount++;
                            }
                            if (classCount > 1) {
                                reporter.report("Don't use adjoining classes.", part.line, part.col, rule);
                            }
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "box-model",
    name: "Beware of broken box size",
    desc: "Don't use width or height when using padding or border.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, widthProperties = {
            border: 1,
            "border-left": 1,
            "border-right": 1,
            padding: 1,
            "padding-left": 1,
            "padding-right": 1
        }, heightProperties = {
            border: 1,
            "border-bottom": 1,
            "border-top": 1,
            padding: 1,
            "padding-bottom": 1,
            "padding-top": 1
        }, properties, boxSizing = false;
        function startRule() {
            properties = {};
            boxSizing = false;
        }
        function endRule() {
            var prop, value;
            if (!boxSizing) {
                if (properties.height) {
                    for (prop in heightProperties) {
                        if (heightProperties.hasOwnProperty(prop) && properties[prop]) {
                            value = properties[prop].value;
                            if (!(prop === "padding" && value.parts.length === 2 && value.parts[0].value === 0)) {
                                reporter.report("Using height with " + prop + " can sometimes make elements larger than you expect.", properties[prop].line, properties[prop].col, rule);
                            }
                        }
                    }
                }
                if (properties.width) {
                    for (prop in widthProperties) {
                        if (widthProperties.hasOwnProperty(prop) && properties[prop]) {
                            value = properties[prop].value;
                            if (!(prop === "padding" && value.parts.length === 2 && value.parts[1].value === 0)) {
                                reporter.report("Using width with " + prop + " can sometimes make elements larger than you expect.", properties[prop].line, properties[prop].col, rule);
                            }
                        }
                    }
                }
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.text.toLowerCase();
            if (heightProperties[name] || widthProperties[name]) {
                if (!/^0\S*$/.test(event.value) && !(name === "border" && event.value.toString() === "none")) {
                    properties[name] = { line: event.property.line, col: event.property.col, value: event.value };
                }
            }
            else {
                if (/^(width|height)/i.test(name) && /^(length|percentage)/.test(event.value.parts[0].type)) {
                    properties[name] = 1;
                }
                else if (name === "box-sizing") {
                    boxSizing = true;
                }
            }
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
        parser.addListener("endpage", endRule);
        parser.addListener("endpagemargin", endRule);
        parser.addListener("endkeyframerule", endRule);
    }
});
CSSLint.addRule({
    id: "box-sizing",
    name: "Disallow use of box-sizing",
    desc: "The box-sizing properties isn't supported in IE6 and IE7.",
    browsers: "IE6, IE7",
    tags: ["Compatibility"],
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("property", function (event) {
            var name = event.property.text.toLowerCase();
            if (name === "box-sizing") {
                reporter.report("The box-sizing property isn't supported in IE6 and IE7.", event.line, event.col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "bulletproof-font-face",
    name: "Use the bulletproof @font-face syntax",
    desc: "Use the bulletproof @font-face syntax to avoid 404's in old IE (http://www.fontspring.com/blog/the-new-bulletproof-font-face-syntax).",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, fontFaceRule = false, firstSrc = true, ruleFailed = false, line, col;
        parser.addListener("startfontface", function () {
            fontFaceRule = true;
        });
        parser.addListener("property", function (event) {
            if (!fontFaceRule) {
                return;
            }
            var propertyName = event.property.toString().toLowerCase(), value = event.value.toString();
            line = event.line;
            col = event.col;
            if (propertyName === "src") {
                var regex = /^\s?url\(['"].+\.eot\?.*['"]\)\s*format\(['"]embedded-opentype['"]\).*$/i;
                if (!value.match(regex) && firstSrc) {
                    ruleFailed = true;
                    firstSrc = false;
                }
                else if (value.match(regex) && !firstSrc) {
                    ruleFailed = false;
                }
            }
        });
        parser.addListener("endfontface", function () {
            fontFaceRule = false;
            if (ruleFailed) {
                reporter.report("@font-face declaration doesn't follow the fontspring bulletproof syntax.", line, col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "compatible-vendor-prefixes",
    name: "Require compatible vendor prefixes",
    desc: "Include all compatible vendor prefixes to reach a wider range of users.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, compatiblePrefixes, properties, prop, variations, prefixed, i, len, inKeyFrame = false, arrayPush = Array.prototype.push, applyTo = [];
        compatiblePrefixes = {
            "animation": "webkit moz",
            "animation-delay": "webkit moz",
            "animation-direction": "webkit moz",
            "animation-duration": "webkit moz",
            "animation-fill-mode": "webkit moz",
            "animation-iteration-count": "webkit moz",
            "animation-name": "webkit moz",
            "animation-play-state": "webkit moz",
            "animation-timing-function": "webkit moz",
            "appearance": "webkit moz",
            "border-end": "webkit moz",
            "border-end-color": "webkit moz",
            "border-end-style": "webkit moz",
            "border-end-width": "webkit moz",
            "border-image": "webkit moz o",
            "border-radius": "webkit",
            "border-start": "webkit moz",
            "border-start-color": "webkit moz",
            "border-start-style": "webkit moz",
            "border-start-width": "webkit moz",
            "box-align": "webkit moz ms",
            "box-direction": "webkit moz ms",
            "box-flex": "webkit moz ms",
            "box-lines": "webkit ms",
            "box-ordinal-group": "webkit moz ms",
            "box-orient": "webkit moz ms",
            "box-pack": "webkit moz ms",
            "box-sizing": "webkit moz",
            "box-shadow": "webkit moz",
            "column-count": "webkit moz ms",
            "column-gap": "webkit moz ms",
            "column-rule": "webkit moz ms",
            "column-rule-color": "webkit moz ms",
            "column-rule-style": "webkit moz ms",
            "column-rule-width": "webkit moz ms",
            "column-width": "webkit moz ms",
            "hyphens": "epub moz",
            "line-break": "webkit ms",
            "margin-end": "webkit moz",
            "margin-start": "webkit moz",
            "marquee-speed": "webkit wap",
            "marquee-style": "webkit wap",
            "padding-end": "webkit moz",
            "padding-start": "webkit moz",
            "tab-size": "moz o",
            "text-size-adjust": "webkit ms",
            "transform": "webkit moz ms o",
            "transform-origin": "webkit moz ms o",
            "transition": "webkit moz o",
            "transition-delay": "webkit moz o",
            "transition-duration": "webkit moz o",
            "transition-property": "webkit moz o",
            "transition-timing-function": "webkit moz o",
            "user-modify": "webkit moz",
            "user-select": "webkit moz ms",
            "word-break": "epub ms",
            "writing-mode": "epub ms"
        };
        for (prop in compatiblePrefixes) {
            if (compatiblePrefixes.hasOwnProperty(prop)) {
                variations = [];
                prefixed = compatiblePrefixes[prop].split(" ");
                for (i = 0, len = prefixed.length; i < len; i++) {
                    variations.push("-" + prefixed[i] + "-" + prop);
                }
                compatiblePrefixes[prop] = variations;
                arrayPush.apply(applyTo, variations);
            }
        }
        parser.addListener("startrule", function () {
            properties = [];
        });
        parser.addListener("startkeyframes", function (event) {
            inKeyFrame = event.prefix || true;
        });
        parser.addListener("endkeyframes", function () {
            inKeyFrame = false;
        });
        parser.addListener("property", function (event) {
            var name = event.property;
            if (CSSLint.Util.indexOf(applyTo, name.text) > -1) {
                if (!inKeyFrame || typeof inKeyFrame !== "string" ||
                    name.text.indexOf("-" + inKeyFrame + "-") !== 0) {
                    properties.push(name);
                }
            }
        });
        parser.addListener("endrule", function () {
            if (!properties.length) {
                return;
            }
            var propertyGroups = {}, i, len, name, prop, variations, value, full, actual, item, propertiesSpecified;
            for (i = 0, len = properties.length; i < len; i++) {
                name = properties[i];
                for (prop in compatiblePrefixes) {
                    if (compatiblePrefixes.hasOwnProperty(prop)) {
                        variations = compatiblePrefixes[prop];
                        if (CSSLint.Util.indexOf(variations, name.text) > -1) {
                            if (!propertyGroups[prop]) {
                                propertyGroups[prop] = {
                                    full: variations.slice(0),
                                    actual: [],
                                    actualNodes: []
                                };
                            }
                            if (CSSLint.Util.indexOf(propertyGroups[prop].actual, name.text) === -1) {
                                propertyGroups[prop].actual.push(name.text);
                                propertyGroups[prop].actualNodes.push(name);
                            }
                        }
                    }
                }
            }
            for (prop in propertyGroups) {
                if (propertyGroups.hasOwnProperty(prop)) {
                    value = propertyGroups[prop];
                    full = value.full;
                    actual = value.actual;
                    if (full.length > actual.length) {
                        for (i = 0, len = full.length; i < len; i++) {
                            item = full[i];
                            if (CSSLint.Util.indexOf(actual, item) === -1) {
                                propertiesSpecified = (actual.length === 1) ? actual[0] : (actual.length === 2) ? actual.join(" and ") : actual.join(", ");
                                reporter.report("The property " + item + " is compatible with " + propertiesSpecified + " and should be included as well.", value.actualNodes[0].line, value.actualNodes[0].col, rule);
                            }
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "display-property-grouping",
    name: "Require properties appropriate for display",
    desc: "Certain properties shouldn't be used with certain display property values.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        var propertiesToCheck = {
            display: 1,
            "float": "none",
            height: 1,
            width: 1,
            margin: 1,
            "margin-left": 1,
            "margin-right": 1,
            "margin-bottom": 1,
            "margin-top": 1,
            padding: 1,
            "padding-left": 1,
            "padding-right": 1,
            "padding-bottom": 1,
            "padding-top": 1,
            "vertical-align": 1
        }, properties;
        function reportProperty(name, display, msg) {
            if (properties[name]) {
                if (typeof propertiesToCheck[name] !== "string" || properties[name].value.toLowerCase() !== propertiesToCheck[name]) {
                    reporter.report(msg || name + " can't be used with display: " + display + ".", properties[name].line, properties[name].col, rule);
                }
            }
        }
        function startRule() {
            properties = {};
        }
        function endRule() {
            var display = properties.display ? properties.display.value : null;
            if (display) {
                switch (display) {
                    case "inline":
                        reportProperty("height", display);
                        reportProperty("width", display);
                        reportProperty("margin", display);
                        reportProperty("margin-top", display);
                        reportProperty("margin-bottom", display);
                        reportProperty("float", display, "display:inline has no effect on floated elements (but may be used to fix the IE6 double-margin bug).");
                        break;
                    case "block":
                        reportProperty("vertical-align", display);
                        break;
                    case "inline-block":
                        reportProperty("float", display);
                        break;
                    default:
                        if (display.indexOf("table-") === 0) {
                            reportProperty("margin", display);
                            reportProperty("margin-left", display);
                            reportProperty("margin-right", display);
                            reportProperty("margin-top", display);
                            reportProperty("margin-bottom", display);
                            reportProperty("float", display);
                        }
                }
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.text.toLowerCase();
            if (propertiesToCheck[name]) {
                properties[name] = { value: event.value.text, line: event.property.line, col: event.property.col };
            }
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
        parser.addListener("endkeyframerule", endRule);
        parser.addListener("endpagemargin", endRule);
        parser.addListener("endpage", endRule);
    }
});
CSSLint.addRule({
    id: "duplicate-background-images",
    name: "Disallow duplicate background images",
    desc: "Every background-image should be unique. Use a common class for e.g. sprites.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, stack = {};
        parser.addListener("property", function (event) {
            var name = event.property.text, value = event.value, i, len;
            if (name.match(/background/i)) {
                for (i = 0, len = value.parts.length; i < len; i++) {
                    if (value.parts[i].type === "uri") {
                        if (typeof stack[value.parts[i].uri] === "undefined") {
                            stack[value.parts[i].uri] = event;
                        }
                        else {
                            reporter.report("Background image '" + value.parts[i].uri + "' was used multiple times, first declared at line " + stack[value.parts[i].uri].line + ", col " + stack[value.parts[i].uri].col + ".", event.line, event.col, rule);
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "duplicate-properties",
    name: "Disallow duplicate properties",
    desc: "Duplicate properties must appear one after the other.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, properties, lastProperty;
        function startRule() {
            properties = {};
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var property = event.property, name = property.text.toLowerCase();
            if (properties[name] && (lastProperty !== name || properties[name] === event.value.text)) {
                reporter.report("Duplicate property '" + event.property + "' found.", event.line, event.col, rule);
            }
            properties[name] = event.value.text;
            lastProperty = name;
        });
    }
});
CSSLint.addRule({
    id: "empty-rules",
    name: "Disallow empty rules",
    desc: "Rules without any properties specified should be removed.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("startrule", function () {
            count = 0;
        });
        parser.addListener("property", function () {
            count++;
        });
        parser.addListener("endrule", function (event) {
            var selectors = event.selectors;
            if (count === 0) {
                reporter.report("Rule is empty.", selectors[0].line, selectors[0].col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "errors",
    name: "Parsing Errors",
    desc: "This rule looks for recoverable syntax errors.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("error", function (event) {
            reporter.error(event.message, event.line, event.col, rule);
        });
    }
});
CSSLint.addRule({
    id: "fallback-colors",
    name: "Require fallback colors",
    desc: "For older browsers that don't support RGBA, HSL, or HSLA, provide a fallback color.",
    browsers: "IE6,IE7,IE8",
    init: function (parser, reporter) {
        var rule = this, lastProperty, propertiesToCheck = {
            color: 1,
            background: 1,
            "border-color": 1,
            "border-top-color": 1,
            "border-right-color": 1,
            "border-bottom-color": 1,
            "border-left-color": 1,
            border: 1,
            "border-top": 1,
            "border-right": 1,
            "border-bottom": 1,
            "border-left": 1,
            "background-color": 1
        }, properties;
        function startRule() {
            properties = {};
            lastProperty = null;
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var property = event.property, name = property.text.toLowerCase(), parts = event.value.parts, i = 0, colorType = "", len = parts.length;
            if (propertiesToCheck[name]) {
                while (i < len) {
                    if (parts[i].type === "color") {
                        if ("alpha" in parts[i] || "hue" in parts[i]) {
                            if (/([^\)]+)\(/.test(parts[i])) {
                                colorType = RegExp.$1.toUpperCase();
                            }
                            if (!lastProperty || (lastProperty.property.text.toLowerCase() !== name || lastProperty.colorType !== "compat")) {
                                reporter.report("Fallback " + name + " (hex or RGB) should precede " + colorType + " " + name + ".", event.line, event.col, rule);
                            }
                        }
                        else {
                            event.colorType = "compat";
                        }
                    }
                    i++;
                }
            }
            lastProperty = event;
        });
    }
});
CSSLint.addRule({
    id: "floats",
    name: "Disallow too many floats",
    desc: "This rule tests if the float property is used too many times",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        var count = 0;
        parser.addListener("property", function (event) {
            if (event.property.text.toLowerCase() === "float" &&
                event.value.text.toLowerCase() !== "none") {
                count++;
            }
        });
        parser.addListener("endstylesheet", function () {
            reporter.stat("floats", count);
            if (count >= 10) {
                reporter.rollupWarn("Too many floats (" + count + "), you're probably using them for layout. Consider using a grid system instead.", rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "font-faces",
    name: "Don't use too many web fonts",
    desc: "Too many different web fonts in the same stylesheet.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("startfontface", function () {
            count++;
        });
        parser.addListener("endstylesheet", function () {
            if (count > 5) {
                reporter.rollupWarn("Too many @font-face declarations (" + count + ").", rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "font-sizes",
    name: "Disallow too many font sizes",
    desc: "Checks the number of font-size declarations.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("property", function (event) {
            if (event.property.toString() === "font-size") {
                count++;
            }
        });
        parser.addListener("endstylesheet", function () {
            reporter.stat("font-sizes", count);
            if (count >= 10) {
                reporter.rollupWarn("Too many font-size declarations (" + count + "), abstraction needed.", rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "gradients",
    name: "Require all gradient definitions",
    desc: "When using a vendor-prefixed gradient, make sure to use them all.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, gradients;
        parser.addListener("startrule", function () {
            gradients = {
                moz: 0,
                webkit: 0,
                oldWebkit: 0,
                o: 0
            };
        });
        parser.addListener("property", function (event) {
            if (/\-(moz|o|webkit)(?:\-(?:linear|radial))\-gradient/i.test(event.value)) {
                gradients[RegExp.$1] = 1;
            }
            else if (/\-webkit\-gradient/i.test(event.value)) {
                gradients.oldWebkit = 1;
            }
        });
        parser.addListener("endrule", function (event) {
            var missing = [];
            if (!gradients.moz) {
                missing.push("Firefox 3.6+");
            }
            if (!gradients.webkit) {
                missing.push("Webkit (Safari 5+, Chrome)");
            }
            if (!gradients.oldWebkit) {
                missing.push("Old Webkit (Safari 4+, Chrome)");
            }
            if (!gradients.o) {
                missing.push("Opera 11.1+");
            }
            if (missing.length && missing.length < 4) {
                reporter.report("Missing vendor-prefixed CSS gradients for " + missing.join(", ") + ".", event.selectors[0].line, event.selectors[0].col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "ids",
    name: "Disallow IDs in selectors",
    desc: "Selectors should not contain IDs.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, modifier, idCount, i, j, k;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                idCount = 0;
                for (j = 0; j < selector.parts.length; j++) {
                    part = selector.parts[j];
                    if (part.type === parser.SELECTOR_PART_TYPE) {
                        for (k = 0; k < part.modifiers.length; k++) {
                            modifier = part.modifiers[k];
                            if (modifier.type === "id") {
                                idCount++;
                            }
                        }
                    }
                }
                if (idCount === 1) {
                    reporter.report("Don't use IDs in selectors.", selector.line, selector.col, rule);
                }
                else if (idCount > 1) {
                    reporter.report(idCount + " IDs in the selector, really?", selector.line, selector.col, rule);
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "import",
    name: "Disallow @import",
    desc: "Don't use @import, use <link> instead.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("import", function (event) {
            reporter.report("@import prevents parallel downloads, use <link> instead.", event.line, event.col, rule);
        });
    }
});
CSSLint.addRule({
    id: "important",
    name: "Disallow !important",
    desc: "Be careful when using !important declaration",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("property", function (event) {
            if (event.important === true) {
                count++;
                reporter.report("Use of !important", event.line, event.col, rule);
            }
        });
        parser.addListener("endstylesheet", function () {
            reporter.stat("important", count);
            if (count >= 10) {
                reporter.rollupWarn("Too many !important declarations (" + count + "), try to use less than 10 to avoid specificity issues.", rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "known-properties",
    name: "Require use of known properties",
    desc: "Properties should be known (listed in CSS3 specification) or be a vendor-prefixed property.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("property", function (event) {
            if (event.invalid) {
                reporter.report(event.invalid.message, event.line, event.col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "order-alphabetical",
    name: "Alphabetical order",
    desc: "Assure properties are in alphabetical order",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, properties;
        var startRule = function () {
            properties = [];
        };
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.text, lowerCasePrefixLessName = name.toLowerCase().replace(/^-.*?-/, "");
            properties.push(lowerCasePrefixLessName);
        });
        parser.addListener("endrule", function (event) {
            var currentProperties = properties.join(","), expectedProperties = properties.sort().join(",");
            if (currentProperties !== expectedProperties) {
                reporter.report("Rule doesn't have all its properties in alphabetical ordered.", event.line, event.col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "outline-none",
    name: "Disallow outline: none",
    desc: "Use of outline: none or outline: 0 should be limited to :focus rules.",
    browsers: "All",
    tags: ["Accessibility"],
    init: function (parser, reporter) {
        var rule = this, lastRule;
        function startRule(event) {
            if (event.selectors) {
                lastRule = {
                    line: event.line,
                    col: event.col,
                    selectors: event.selectors,
                    propCount: 0,
                    outline: false
                };
            }
            else {
                lastRule = null;
            }
        }
        function endRule() {
            if (lastRule) {
                if (lastRule.outline) {
                    if (lastRule.selectors.toString().toLowerCase().indexOf(":focus") === -1) {
                        reporter.report("Outlines should only be modified using :focus.", lastRule.line, lastRule.col, rule);
                    }
                    else if (lastRule.propCount === 1) {
                        reporter.report("Outlines shouldn't be hidden unless other visual changes are made.", lastRule.line, lastRule.col, rule);
                    }
                }
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.text.toLowerCase(), value = event.value;
            if (lastRule) {
                lastRule.propCount++;
                if (name === "outline" && (value.toString() === "none" || value.toString() === "0")) {
                    lastRule.outline = true;
                }
            }
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
        parser.addListener("endpage", endRule);
        parser.addListener("endpagemargin", endRule);
        parser.addListener("endkeyframerule", endRule);
    }
});
CSSLint.addRule({
    id: "overqualified-elements",
    name: "Disallow overqualified elements",
    desc: "Don't use classes or IDs with elements (a.foo or a#foo).",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, classes = {};
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, modifier, i, j, k;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                for (j = 0; j < selector.parts.length; j++) {
                    part = selector.parts[j];
                    if (part.type === parser.SELECTOR_PART_TYPE) {
                        for (k = 0; k < part.modifiers.length; k++) {
                            modifier = part.modifiers[k];
                            if (part.elementName && modifier.type === "id") {
                                reporter.report("Element (" + part + ") is overqualified, just use " + modifier + " without element name.", part.line, part.col, rule);
                            }
                            else if (modifier.type === "class") {
                                if (!classes[modifier]) {
                                    classes[modifier] = [];
                                }
                                classes[modifier].push({ modifier: modifier, part: part });
                            }
                        }
                    }
                }
            }
        });
        parser.addListener("endstylesheet", function () {
            var prop;
            for (prop in classes) {
                if (classes.hasOwnProperty(prop)) {
                    if (classes[prop].length === 1 && classes[prop][0].part.elementName) {
                        reporter.report("Element (" + classes[prop][0].part + ") is overqualified, just use " + classes[prop][0].modifier + " without element name.", classes[prop][0].part.line, classes[prop][0].part.col, rule);
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "qualified-headings",
    name: "Disallow qualified headings",
    desc: "Headings should not be qualified (namespaced).",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, i, j;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                for (j = 0; j < selector.parts.length; j++) {
                    part = selector.parts[j];
                    if (part.type === parser.SELECTOR_PART_TYPE) {
                        if (part.elementName && /h[1-6]/.test(part.elementName.toString()) && j > 0) {
                            reporter.report("Heading (" + part.elementName + ") should not be qualified.", part.line, part.col, rule);
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "regex-selectors",
    name: "Disallow selectors that look like regexs",
    desc: "Selectors that look like regular expressions are slow and should be avoided.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, modifier, i, j, k;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                for (j = 0; j < selector.parts.length; j++) {
                    part = selector.parts[j];
                    if (part.type === parser.SELECTOR_PART_TYPE) {
                        for (k = 0; k < part.modifiers.length; k++) {
                            modifier = part.modifiers[k];
                            if (modifier.type === "attribute") {
                                if (/([\~\|\^\$\*]=)/.test(modifier)) {
                                    reporter.report("Attribute selectors with " + RegExp.$1 + " are slow!", modifier.line, modifier.col, rule);
                                }
                            }
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "rules-count",
    name: "Rules Count",
    desc: "Track how many rules there are.",
    browsers: "All",
    init: function (parser, reporter) {
        var count = 0;
        parser.addListener("startrule", function () {
            count++;
        });
        parser.addListener("endstylesheet", function () {
            reporter.stat("rule-count", count);
        });
    }
});
CSSLint.addRule({
    id: "selector-max-approaching",
    name: "Warn when approaching the 4095 selector limit for IE",
    desc: "Will warn when selector count is >= 3800 selectors.",
    browsers: "IE",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("startrule", function (event) {
            count += event.selectors.length;
        });
        parser.addListener("endstylesheet", function () {
            if (count >= 3800) {
                reporter.report("You have " + count + " selectors. Internet Explorer supports a maximum of 4095 selectors per stylesheet. Consider refactoring.", 0, 0, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "selector-max",
    name: "Error when past the 4095 selector limit for IE",
    desc: "Will error when selector count is > 4095.",
    browsers: "IE",
    init: function (parser, reporter) {
        var rule = this, count = 0;
        parser.addListener("startrule", function (event) {
            count += event.selectors.length;
        });
        parser.addListener("endstylesheet", function () {
            if (count > 4095) {
                reporter.report("You have " + count + " selectors. Internet Explorer supports a maximum of 4095 selectors per stylesheet. Consider refactoring.", 0, 0, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "selector-newline",
    name: "Disallow new-line characters in selectors",
    desc: "New-line characters in selectors are usually a forgotten comma and not a descendant combinator.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        function startRule(event) {
            var i, len, selector, p, n, pLen, part, part2, type, currentLine, nextLine, selectors = event.selectors;
            for (i = 0, len = selectors.length; i < len; i++) {
                selector = selectors[i];
                for (p = 0, pLen = selector.parts.length; p < pLen; p++) {
                    for (n = p + 1; n < pLen; n++) {
                        part = selector.parts[p];
                        part2 = selector.parts[n];
                        type = part.type;
                        currentLine = part.line;
                        nextLine = part2.line;
                        if (type === "descendant" && nextLine > currentLine) {
                            reporter.report("newline character found in selector (forgot a comma?)", currentLine, selectors[i].parts[0].col, rule);
                        }
                    }
                }
            }
        }
        parser.addListener("startrule", startRule);
    }
});
CSSLint.addRule({
    id: "shorthand",
    name: "Require shorthand properties",
    desc: "Use shorthand properties where possible.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, prop, i, len, propertiesToCheck = {}, properties, mapping = {
            "margin": [
                "margin-top",
                "margin-bottom",
                "margin-left",
                "margin-right"
            ],
            "padding": [
                "padding-top",
                "padding-bottom",
                "padding-left",
                "padding-right"
            ]
        };
        for (prop in mapping) {
            if (mapping.hasOwnProperty(prop)) {
                for (i = 0, len = mapping[prop].length; i < len; i++) {
                    propertiesToCheck[mapping[prop][i]] = prop;
                }
            }
        }
        function startRule() {
            properties = {};
        }
        function endRule(event) {
            var prop, i, len, total;
            for (prop in mapping) {
                if (mapping.hasOwnProperty(prop)) {
                    total = 0;
                    for (i = 0, len = mapping[prop].length; i < len; i++) {
                        total += properties[mapping[prop][i]] ? 1 : 0;
                    }
                    if (total === mapping[prop].length) {
                        reporter.report("The properties " + mapping[prop].join(", ") + " can be replaced by " + prop + ".", event.line, event.col, rule);
                    }
                }
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.toString().toLowerCase();
            if (propertiesToCheck[name]) {
                properties[name] = 1;
            }
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
    }
});
CSSLint.addRule({
    id: "star-property-hack",
    name: "Disallow properties with a star prefix",
    desc: "Checks for the star property hack (targets IE6/7)",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("property", function (event) {
            var property = event.property;
            if (property.hack === "*") {
                reporter.report("Property with star prefix found.", event.property.line, event.property.col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "text-indent",
    name: "Disallow negative text-indent",
    desc: "Checks for text indent less than -99px",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, textIndent, direction;
        function startRule() {
            textIndent = false;
            direction = "inherit";
        }
        function endRule() {
            if (textIndent && direction !== "ltr") {
                reporter.report("Negative text-indent doesn't work well with RTL. If you use text-indent for image replacement explicitly set direction for that item to ltr.", textIndent.line, textIndent.col, rule);
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.toString().toLowerCase(), value = event.value;
            if (name === "text-indent" && value.parts[0].value < -99) {
                textIndent = event.property;
            }
            else if (name === "direction" && value.toString() === "ltr") {
                direction = "ltr";
            }
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
    }
});
CSSLint.addRule({
    id: "underscore-property-hack",
    name: "Disallow properties with an underscore prefix",
    desc: "Checks for the underscore property hack (targets IE6)",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("property", function (event) {
            var property = event.property;
            if (property.hack === "_") {
                reporter.report("Property with underscore prefix found.", event.property.line, event.property.col, rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "unique-headings",
    name: "Headings should only be defined once",
    desc: "Headings should be defined only once.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        var headings = {
            h1: 0,
            h2: 0,
            h3: 0,
            h4: 0,
            h5: 0,
            h6: 0
        };
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, pseudo, i, j;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                part = selector.parts[selector.parts.length - 1];
                if (part.elementName && /(h[1-6])/i.test(part.elementName.toString())) {
                    for (j = 0; j < part.modifiers.length; j++) {
                        if (part.modifiers[j].type === "pseudo") {
                            pseudo = true;
                            break;
                        }
                    }
                    if (!pseudo) {
                        headings[RegExp.$1]++;
                        if (headings[RegExp.$1] > 1) {
                            reporter.report("Heading (" + part.elementName + ") has already been defined.", part.line, part.col, rule);
                        }
                    }
                }
            }
        });
        parser.addListener("endstylesheet", function () {
            var prop, messages = [];
            for (prop in headings) {
                if (headings.hasOwnProperty(prop)) {
                    if (headings[prop] > 1) {
                        messages.push(headings[prop] + " " + prop + "s");
                    }
                }
            }
            if (messages.length) {
                reporter.rollupWarn("You have " + messages.join(", ") + " defined in this stylesheet.", rule);
            }
        });
    }
});
CSSLint.addRule({
    id: "universal-selector",
    name: "Disallow universal selector",
    desc: "The universal selector (*) is known to be slow.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, i;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                part = selector.parts[selector.parts.length - 1];
                if (part.elementName === "*") {
                    reporter.report(rule.desc, part.line, part.col, rule);
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "unqualified-attributes",
    name: "Disallow unqualified attribute selectors",
    desc: "Unqualified attribute selectors are known to be slow.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("startrule", function (event) {
            var selectors = event.selectors, selector, part, modifier, i, k;
            for (i = 0; i < selectors.length; i++) {
                selector = selectors[i];
                part = selector.parts[selector.parts.length - 1];
                if (part.type === parser.SELECTOR_PART_TYPE) {
                    for (k = 0; k < part.modifiers.length; k++) {
                        modifier = part.modifiers[k];
                        if (modifier.type === "attribute" && (!part.elementName || part.elementName === "*")) {
                            reporter.report(rule.desc, part.line, part.col, rule);
                        }
                    }
                }
            }
        });
    }
});
CSSLint.addRule({
    id: "vendor-prefix",
    name: "Require standard property with vendor prefix",
    desc: "When using a vendor-prefixed property, make sure to include the standard one.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this, properties, num, propertiesToCheck = {
            "-webkit-border-radius": "border-radius",
            "-webkit-border-top-left-radius": "border-top-left-radius",
            "-webkit-border-top-right-radius": "border-top-right-radius",
            "-webkit-border-bottom-left-radius": "border-bottom-left-radius",
            "-webkit-border-bottom-right-radius": "border-bottom-right-radius",
            "-o-border-radius": "border-radius",
            "-o-border-top-left-radius": "border-top-left-radius",
            "-o-border-top-right-radius": "border-top-right-radius",
            "-o-border-bottom-left-radius": "border-bottom-left-radius",
            "-o-border-bottom-right-radius": "border-bottom-right-radius",
            "-moz-border-radius": "border-radius",
            "-moz-border-radius-topleft": "border-top-left-radius",
            "-moz-border-radius-topright": "border-top-right-radius",
            "-moz-border-radius-bottomleft": "border-bottom-left-radius",
            "-moz-border-radius-bottomright": "border-bottom-right-radius",
            "-moz-column-count": "column-count",
            "-webkit-column-count": "column-count",
            "-moz-column-gap": "column-gap",
            "-webkit-column-gap": "column-gap",
            "-moz-column-rule": "column-rule",
            "-webkit-column-rule": "column-rule",
            "-moz-column-rule-style": "column-rule-style",
            "-webkit-column-rule-style": "column-rule-style",
            "-moz-column-rule-color": "column-rule-color",
            "-webkit-column-rule-color": "column-rule-color",
            "-moz-column-rule-width": "column-rule-width",
            "-webkit-column-rule-width": "column-rule-width",
            "-moz-column-width": "column-width",
            "-webkit-column-width": "column-width",
            "-webkit-column-span": "column-span",
            "-webkit-columns": "columns",
            "-moz-box-shadow": "box-shadow",
            "-webkit-box-shadow": "box-shadow",
            "-moz-transform": "transform",
            "-webkit-transform": "transform",
            "-o-transform": "transform",
            "-ms-transform": "transform",
            "-moz-transform-origin": "transform-origin",
            "-webkit-transform-origin": "transform-origin",
            "-o-transform-origin": "transform-origin",
            "-ms-transform-origin": "transform-origin",
            "-moz-box-sizing": "box-sizing",
            "-webkit-box-sizing": "box-sizing"
        };
        function startRule() {
            properties = {};
            num = 1;
        }
        function endRule() {
            var prop, i, len, needed, actual, needsStandard = [];
            for (prop in properties) {
                if (propertiesToCheck[prop]) {
                    needsStandard.push({ actual: prop, needed: propertiesToCheck[prop] });
                }
            }
            for (i = 0, len = needsStandard.length; i < len; i++) {
                needed = needsStandard[i].needed;
                actual = needsStandard[i].actual;
                if (!properties[needed]) {
                    reporter.report("Missing standard property '" + needed + "' to go along with '" + actual + "'.", properties[actual][0].name.line, properties[actual][0].name.col, rule);
                }
                else {
                    if (properties[needed][0].pos < properties[actual][0].pos) {
                        reporter.report("Standard property '" + needed + "' should come after vendor-prefixed property '" + actual + "'.", properties[actual][0].name.line, properties[actual][0].name.col, rule);
                    }
                }
            }
        }
        parser.addListener("startrule", startRule);
        parser.addListener("startfontface", startRule);
        parser.addListener("startpage", startRule);
        parser.addListener("startpagemargin", startRule);
        parser.addListener("startkeyframerule", startRule);
        parser.addListener("property", function (event) {
            var name = event.property.text.toLowerCase();
            if (!properties[name]) {
                properties[name] = [];
            }
            properties[name].push({ name: event.property, value: event.value, pos: num++ });
        });
        parser.addListener("endrule", endRule);
        parser.addListener("endfontface", endRule);
        parser.addListener("endpage", endRule);
        parser.addListener("endpagemargin", endRule);
        parser.addListener("endkeyframerule", endRule);
    }
});
CSSLint.addRule({
    id: "zero-units",
    name: "Disallow units for 0 values",
    desc: "You don't need to specify units when a value is 0.",
    browsers: "All",
    init: function (parser, reporter) {
        var rule = this;
        parser.addListener("property", function (event) {
            var parts = event.value.parts, i = 0, len = parts.length;
            while (i < len) {
                if ((parts[i].units || parts[i].type === "percentage") && parts[i].value === 0 && parts[i].type !== "time") {
                    reporter.report("Values of 0 shouldn't have units specified.", parts[i].line, parts[i].col, rule);
                }
                i++;
            }
        });
    }
});
(function () {
    var xmlEscape = function (str) {
        if (!str || str.constructor !== String) {
            return "";
        }
        return str.replace(/[\"&><]/g, function (match) {
            switch (match) {
                case "\"":
                    return "&quot;";
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
            }
        });
    };
    CSSLint.addFormatter({
        id: "checkstyle-xml",
        name: "Checkstyle XML format",
        startFormat: function () {
            return "<?xml version=\"1.0\" encoding=\"utf-8\"?><checkstyle>";
        },
        endFormat: function () {
            return "</checkstyle>";
        },
        readError: function (filename, message) {
            return "<file name=\"" + xmlEscape(filename) + "\"><error line=\"0\" column=\"0\" severty=\"error\" message=\"" + xmlEscape(message) + "\"></error></file>";
        },
        formatResults: function (results, filename) {
            var messages = results.messages, output = [];
            var generateSource = function (rule) {
                if (!rule || !("name" in rule)) {
                    return "";
                }
                return "net.csslint." + rule.name.replace(/\s/g, "");
            };
            if (messages.length > 0) {
                output.push("<file name=\"" + filename + "\">");
                CSSLint.Util.forEach(messages, function (message) {
                    if (!message.rollup) {
                        output.push("<error line=\"" + message.line + "\" column=\"" + message.col + "\" severity=\"" + message.type + "\"" +
                            " message=\"" + xmlEscape(message.message) + "\" source=\"" + generateSource(message.rule) + "\"/>");
                    }
                });
                output.push("</file>");
            }
            return output.join("");
        }
    });
}());
CSSLint.addFormatter({
    id: "compact",
    name: "Compact, 'porcelain' format",
    startFormat: function () {
        return "";
    },
    endFormat: function () {
        return "";
    },
    formatResults: function (results, filename, options) {
        var messages = results.messages, output = "";
        options = options || {};
        var capitalize = function (str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        };
        if (messages.length === 0) {
            return options.quiet ? "" : filename + ": Lint Free!";
        }
        CSSLint.Util.forEach(messages, function (message) {
            if (message.rollup) {
                output += filename + ": " + capitalize(message.type) + " - " + message.message + "\n";
            }
            else {
                output += filename + ": " + "line " + message.line +
                    ", col " + message.col + ", " + capitalize(message.type) + " - " + message.message + " (" + message.rule.id + ")\n";
            }
        });
        return output;
    }
});
CSSLint.addFormatter({
    id: "csslint-xml",
    name: "CSSLint XML format",
    startFormat: function () {
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?><csslint>";
    },
    endFormat: function () {
        return "</csslint>";
    },
    formatResults: function (results, filename) {
        var messages = results.messages, output = [];
        var escapeSpecialCharacters = function (str) {
            if (!str || str.constructor !== String) {
                return "";
            }
            return str.replace(/\"/g, "'").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        if (messages.length > 0) {
            output.push("<file name=\"" + filename + "\">");
            CSSLint.Util.forEach(messages, function (message) {
                if (message.rollup) {
                    output.push("<issue severity=\"" + message.type + "\" reason=\"" + escapeSpecialCharacters(message.message) + "\" evidence=\"" + escapeSpecialCharacters(message.evidence) + "\"/>");
                }
                else {
                    output.push("<issue line=\"" + message.line + "\" char=\"" + message.col + "\" severity=\"" + message.type + "\"" +
                        " reason=\"" + escapeSpecialCharacters(message.message) + "\" evidence=\"" + escapeSpecialCharacters(message.evidence) + "\"/>");
                }
            });
            output.push("</file>");
        }
        return output.join("");
    }
});
CSSLint.addFormatter({
    id: "junit-xml",
    name: "JUNIT XML format",
    startFormat: function () {
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?><testsuites>";
    },
    endFormat: function () {
        return "</testsuites>";
    },
    formatResults: function (results, filename) {
        var messages = results.messages, output = [], tests = {
            "error": 0,
            "failure": 0
        };
        var generateSource = function (rule) {
            if (!rule || !("name" in rule)) {
                return "";
            }
            return "net.csslint." + rule.name.replace(/\s/g, "");
        };
        var escapeSpecialCharacters = function (str) {
            if (!str || str.constructor !== String) {
                return "";
            }
            return str.replace(/\"/g, "'").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        if (messages.length > 0) {
            messages.forEach(function (message) {
                var type = message.type === "warning" ? "error" : message.type;
                if (!message.rollup) {
                    output.push("<testcase time=\"0\" name=\"" + generateSource(message.rule) + "\">");
                    output.push("<" + type + " message=\"" + escapeSpecialCharacters(message.message) + "\"><![CDATA[" + message.line + ":" + message.col + ":" + escapeSpecialCharacters(message.evidence) + "]]></" + type + ">");
                    output.push("</testcase>");
                    tests[type] += 1;
                }
            });
            output.unshift("<testsuite time=\"0\" tests=\"" + messages.length + "\" skipped=\"0\" errors=\"" + tests.error + "\" failures=\"" + tests.failure + "\" package=\"net.csslint\" name=\"" + filename + "\">");
            output.push("</testsuite>");
        }
        return output.join("");
    }
});
CSSLint.addFormatter({
    id: "lint-xml",
    name: "Lint XML format",
    startFormat: function () {
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?><lint>";
    },
    endFormat: function () {
        return "</lint>";
    },
    formatResults: function (results, filename) {
        var messages = results.messages, output = [];
        var escapeSpecialCharacters = function (str) {
            if (!str || str.constructor !== String) {
                return "";
            }
            return str.replace(/\"/g, "'").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        if (messages.length > 0) {
            output.push("<file name=\"" + filename + "\">");
            CSSLint.Util.forEach(messages, function (message) {
                if (message.rollup) {
                    output.push("<issue severity=\"" + message.type + "\" reason=\"" + escapeSpecialCharacters(message.message) + "\" evidence=\"" + escapeSpecialCharacters(message.evidence) + "\"/>");
                }
                else {
                    output.push("<issue line=\"" + message.line + "\" char=\"" + message.col + "\" severity=\"" + message.type + "\"" +
                        " reason=\"" + escapeSpecialCharacters(message.message) + "\" evidence=\"" + escapeSpecialCharacters(message.evidence) + "\"/>");
                }
            });
            output.push("</file>");
        }
        return output.join("");
    }
});
CSSLint.addFormatter({
    id: "text",
    name: "Plain Text",
    startFormat: function () {
        return "";
    },
    endFormat: function () {
        return "";
    },
    formatResults: function (results, filename, options) {
        var messages = results.messages, output = "";
        options = options || {};
        if (messages.length === 0) {
            return options.quiet ? "" : "\n\ncsslint: No errors in " + filename + ".";
        }
        output = "\n\ncsslint: There ";
        if (messages.length === 1) {
            output += "is 1 problem";
        }
        else {
            output += "are " + messages.length + " problems";
        }
        output += " in " + filename + ".";
        var pos = filename.lastIndexOf("/"), shortFilename = filename;
        if (pos === -1) {
            pos = filename.lastIndexOf("\\");
        }
        if (pos > -1) {
            shortFilename = filename.substring(pos + 1);
        }
        CSSLint.Util.forEach(messages, function (message, i) {
            output = output + "\n\n" + shortFilename;
            if (message.rollup) {
                output += "\n" + (i + 1) + ": " + message.type;
                output += "\n" + message.message;
            }
            else {
                output += "\n" + (i + 1) + ": " + message.type + " at line " + message.line + ", col " + message.col;
                output += "\n" + message.message;
                output += "\n" + message.evidence;
            }
        });
        return output;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ1NTTGludC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tb2RlL2Nzcy9DU1NMaW50LnRzIl0sIm5hbWVzIjpbIkV2ZW50VGFyZ2V0IiwiU3RyaW5nUmVhZGVyIiwiU3ludGF4RXJyb3IiLCJTeW50YXhVbml0IiwiVG9rZW5TdHJlYW1CYXNlIiwiQ29tYmluYXRvciIsIk1lZGlhRmVhdHVyZSIsIk1lZGlhUXVlcnkiLCJQYXJzZXIiLCJQcm9wZXJ0eU5hbWUiLCJQcm9wZXJ0eVZhbHVlIiwiUHJvcGVydHlWYWx1ZUl0ZXJhdG9yIiwiUHJvcGVydHlWYWx1ZVBhcnQiLCJTZWxlY3RvciIsIlNlbGVjdG9yUGFydCIsIlNlbGVjdG9yU3ViUGFydCIsIlNwZWNpZmljaXR5IiwidXBkYXRlVmFsdWVzIiwiaXNIZXhEaWdpdCIsImlzRGlnaXQiLCJpc1doaXRlc3BhY2UiLCJpc05ld0xpbmUiLCJpc05hbWVTdGFydCIsImlzTmFtZUNoYXIiLCJpc0lkZW50U3RhcnQiLCJtaXgiLCJUb2tlblN0cmVhbSIsIlZhbGlkYXRpb25FcnJvciIsIm9iamVjdFRvU3RyaW5nIiwiY2xvbmUiLCJjbG9uZS5fY2xvbmUiLCJhcHBseUVtYmVkZGVkUnVsZXNldCIsIlJlcG9ydGVyIiwic3RhcnRSdWxlIiwiZW5kUnVsZSIsInJlcG9ydFByb3BlcnR5Il0sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQXNCRTtBQTBCRixJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDbkIsQ0FBQztJQVFEO1FBUUlBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQUVELFdBQVcsQ0FBQyxTQUFTLEdBQUc7UUFHcEIsV0FBVyxFQUFFLFdBQVc7UUFTeEIsV0FBVyxFQUFFLFVBQVMsSUFBSSxFQUFFLFFBQVE7WUFDaEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUks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QUFZLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsY0FBYyxFQUFHLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsY0FBYyxFQUFHLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsY0FBYyxFQUFHLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsWUFBWSxFQUFLLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsWUFBWSxFQUFLLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsb0JBQW9CLEVBQUcsU0FBUztRQUNoQyxTQUFTLEVBQVEsU0FBUztRQUMxQixTQUFTLEVBQVEsU0FBUztRQUMxQixVQUFVLEVBQU8sU0FBUztRQUMxQixTQUFTLEVBQVEsU0FBUztRQUMxQixXQUFXLEVBQU0sU0FBUztRQUMxQixhQUFhLEVBQUksU0FBUztRQUMxQixZQUFZLEVBQUssU0FBUztRQUMxQixjQUFjLEVBQUcsU0FBUztRQUMxQixjQUFjLEVBQUcsU0FBUztRQUMxQixjQUFjLEVBQUcsU0FBUztRQUMxQixXQUFXLEVBQU0sU0FBUztRQUMxQixJQUFJLEVBQWEsU0FBUztRQUMxQixTQUFTLEVBQVEsU0FBUztRQUMxQixLQUFLLEVBQVksU0FBUztRQUMxQixPQUFPLEVBQVUsU0FBUztRQUMxQixNQUFNLEVBQVcsU0FBUztRQUMxQixnQkFBZ0IsRUFBQyxTQUFTO1FBQzFCLFVBQVUsRUFBTyxTQUFTO1FBQzFCLFlBQVksRUFBSyxTQUFTO1FBQzFCLFlBQVksRUFBSyxTQUFTO1FBQzFCLGNBQWMsRUFBRyxTQUFTO1FBQzFCLGVBQWUsRUFBRSxTQUFTO1FBQzFCLGlCQUFpQixFQUFJLFNBQVM7UUFDOUIsZUFBZSxFQUFFLFNBQVM7UUFDMUIsZUFBZSxFQUFFLFNBQVM7UUFDMUIsWUFBWSxFQUFLLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsYUFBYSxFQUFJLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsR0FBRyxFQUFjLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsUUFBUSxFQUFTLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsR0FBRyxFQUFjLFNBQVM7UUFDMUIsSUFBSSxFQUFhLFNBQVM7UUFDMUIsT0FBTyxFQUFVLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsU0FBUyxFQUFRLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsS0FBSyxFQUFZLFNBQVM7UUFDMUIsVUFBVSxFQUFPLFNBQVM7UUFDMUIsTUFBTSxFQUFXLFNBQVM7UUFDMUIsV0FBVyxFQUFNLFNBQVM7UUFFMUIsWUFBWSxFQUFTLHVCQUF1QjtRQUM1QyxhQUFhLEVBQVEsd0JBQXdCO1FBQzdDLFlBQVksRUFBUyxrREFBa0Q7UUFDdkUsVUFBVSxFQUFXLHFCQUFxQjtRQUMxQyxVQUFVLEVBQVcsb0dBQW9HO1FBQ3pILGVBQWUsRUFBTSwwSEFBMEg7UUFDL0ksWUFBWSxFQUFTLDZIQUE2SDtRQUNsSixVQUFVLEVBQVcsdUJBQXVCO1FBQzVDLFdBQVcsRUFBVSxxREFBcUQ7UUFDMUUsUUFBUSxFQUFhLHNIQUFzSDtRQUMzSSxRQUFRLEVBQWEsc0hBQXNIO1FBQzNJLFNBQVMsRUFBWSxnQ0FBZ0M7UUFDckQsYUFBYSxFQUFRLHdDQUF3QztRQUM3RCxjQUFjLEVBQU8seUJBQXlCO1FBQzlDLGVBQWUsRUFBTSwwQkFBMEI7UUFDL0MsbUJBQW1CLEVBQUUsdUNBQXVDO1FBQzVELGNBQWMsRUFBTyx3Q0FBd0M7UUFDN0QsUUFBUSxFQUFhLGtDQUFrQztRQUN2RCxJQUFJLEVBQWlCLGtCQUFrQjtRQUN2QyxRQUFRLEVBQWEsZ0JBQWdCO1FBQ3JDLFNBQVMsRUFBWSx1QkFBdUI7UUFDNUMsZ0JBQWdCLEVBQUssOEtBQThLO1FBQ25NLFVBQVUsRUFBVyxnSEFBZ0g7UUFDckksZUFBZSxFQUFNLDRLQUE0SztRQUNqTSxpQkFBaUIsRUFBSSwyS0FBMks7UUFDaE0sWUFBWSxFQUFTLCtLQUErSztRQUNwTSxNQUFNLEVBQWUsb0JBQW9CO1FBQ3pDLFdBQVcsRUFBVSxlQUFlO1FBQ3BDLFVBQVUsRUFBVyxrQkFBa0I7S0FDMUMsQ0FBQztJQVlGLG9CQUFvQixJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUc7UUFFL0JDLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1FBTy9EQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUd0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDcEJBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLFlBQVlBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDeEJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEdBQUdBLENBQUNBLENBQUFBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxrQkFBa0JBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFDMUJBLENBQUNBO0lBRUxBLENBQUNBO0lBRUQsVUFBVSxDQUFDLFNBQVMsR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO0lBQ3hDLFVBQVUsQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLFVBQVUsQ0FBQztJQVk5QyxzQkFBc0IsSUFBSSxFQUFFLEtBQUs7UUFFN0JDLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLEdBQUdBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7UUFPeElBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBT2pCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFFRCxZQUFZLENBQUMsU0FBUyxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7SUFDMUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsWUFBWSxDQUFDO0lBZWxELG9CQUFvQixRQUFRLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRztRQUV4REMsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsR0FBR0EsR0FBR0EsR0FBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsR0FBR0EsU0FBU0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsSUFBSUEsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtRQU92TUEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFPekJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1FBTzNCQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQTtJQUU3QkEsQ0FBQ0E7SUFFRCxVQUFVLENBQUMsU0FBUyxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7SUFDeEMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO0lBa0I5QyxnQkFBZ0IsT0FBTztRQUduQkMsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFHdkJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBO1FBRTdCQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFHRCxNQUFNLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztJQUN4QixNQUFNLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQztJQUMzQixNQUFNLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7SUFDNUIsTUFBTSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztJQUM5QixNQUFNLENBQUMsbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0lBQy9CLE1BQU0sQ0FBQyx3QkFBd0IsR0FBRyxDQUFDLENBQUM7SUFDcEMsTUFBTSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUM7SUFDekIsTUFBTSxDQUFDLGtCQUFrQixHQUFHLENBQUMsQ0FBQztJQUM5QixNQUFNLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxDQUFDO0lBRWxDLE1BQU0sQ0FBQyxTQUFTLEdBQUc7UUFFZixJQUFJLEtBQUssR0FBRyxJQUFJLFdBQVcsRUFBRSxFQUN6QixJQUFJLEVBQ0osU0FBUyxHQUFJO1lBR1QsV0FBVyxFQUFFLE1BQU07WUFHbkIsWUFBWSxFQUFHLENBQUM7WUFDaEIsZUFBZSxFQUFHLENBQUM7WUFDbkIsa0JBQWtCLEVBQUcsQ0FBQztZQUN0QixnQkFBZ0IsRUFBRyxDQUFDO1lBQ3BCLGtCQUFrQixFQUFHLENBQUM7WUFDdEIsbUJBQW1CLEVBQUcsQ0FBQztZQUN2Qix3QkFBd0IsRUFBRyxDQUFDO1lBQzVCLGFBQWEsRUFBRyxDQUFDO1lBQ2pCLGtCQUFrQixFQUFHLENBQUM7WUFDdEIsc0JBQXNCLEVBQUcsQ0FBQztZQU0xQixXQUFXLEVBQUU7Z0JBV1QsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsT0FBTyxHQUFPLElBQUksRUFDbEIsS0FBSyxFQUNMLEtBQUssRUFDTCxFQUFFLENBQUM7Z0JBRVAsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUc3QixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBRWhCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFHbEIsT0FBTyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLFVBQVUsRUFBQyxDQUFDO29CQUM1QyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ2YsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN0QixDQUFDO2dCQUdELE9BQU8sV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUMsQ0FBQztvQkFDL0MsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUNsQixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3RCLENBQUM7Z0JBR0QsRUFBRSxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFHeEIsT0FBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLEdBQUcsRUFBQyxDQUFDO29CQUVuQixJQUFJLENBQUM7d0JBRUQsTUFBTSxDQUFBLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQzs0QkFDUCxLQUFLLE1BQU0sQ0FBQyxTQUFTO2dDQUNqQixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7Z0NBQ2QsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dDQUNsQixLQUFLLENBQUM7NEJBQ1YsS0FBSyxNQUFNLENBQUMsUUFBUTtnQ0FDaEIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dDQUNiLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQ0FDbEIsS0FBSyxDQUFDOzRCQUNWLEtBQUssTUFBTSxDQUFDLGFBQWE7Z0NBQ3JCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQ0FDbEIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dDQUNsQixLQUFLLENBQUM7NEJBQ1YsS0FBSyxNQUFNLENBQUMsYUFBYTtnQ0FDckIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dDQUNsQixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0NBQ2xCLEtBQUssQ0FBQzs0QkFDVixLQUFLLE1BQU0sQ0FBQyxZQUFZO2dDQUNwQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0NBQ2pCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQ0FDbEIsS0FBSyxDQUFDOzRCQUNWLEtBQUssTUFBTSxDQUFDLFdBQVc7Z0NBQ25CLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQ0FDbEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUM7b0NBR3RCLElBQUksQ0FBQyxJQUFJLENBQUM7d0NBQ04sSUFBSSxFQUFRLE9BQU87d0NBQ25CLEtBQUssRUFBTyxJQUFJO3dDQUNoQixPQUFPLEVBQUssa0JBQWtCLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsR0FBRzt3Q0FDOUQsSUFBSSxFQUFRLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUzt3Q0FDdkMsR0FBRyxFQUFTLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUTtxQ0FDekMsQ0FBQyxDQUFDO29DQUdILEtBQUssR0FBQyxDQUFDLENBQUM7b0NBQ1IsT0FBTyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFDLENBQUM7d0NBQ3pFLEtBQUssRUFBRSxDQUFDO29DQUNaLENBQUM7b0NBRUQsT0FBTSxLQUFLLEVBQUMsQ0FBQzt3Q0FDVCxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0NBQ3JDLEtBQUssRUFBRSxDQUFDO29DQUNaLENBQUM7Z0NBRUwsQ0FBQztnQ0FBQyxJQUFJLENBQUMsQ0FBQztvQ0FFSixNQUFNLElBQUksV0FBVyxDQUFDLGlCQUFpQixFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7Z0NBQ3RHLENBQUM7Z0NBQ0QsS0FBSyxDQUFDOzRCQUNWLEtBQUssTUFBTSxDQUFDLENBQUM7Z0NBQ1QsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dDQUN2QixLQUFLLENBQUM7NEJBQ1Y7Z0NBQ0ksRUFBRSxDQUFBLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQSxDQUFDO29DQUdqQixNQUFNLENBQUEsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO3dDQUNQLEtBQUssTUFBTSxDQUFDLFdBQVc7NENBQ25CLEtBQUssR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDOzRDQUMxQixJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDOzRDQUNyQixNQUFNLElBQUksV0FBVyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO3dDQUN6RixLQUFLLE1BQU0sQ0FBQyxVQUFVOzRDQUNsQixLQUFLLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQzs0Q0FDMUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQzs0Q0FDcEIsTUFBTSxJQUFJLFdBQVcsQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQzt3Q0FDeEYsS0FBSyxNQUFNLENBQUMsYUFBYTs0Q0FDckIsS0FBSyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7NENBQzFCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7NENBQ3ZCLE1BQU0sSUFBSSxXQUFXLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7d0NBQzNGOzRDQUNJLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQzs0Q0FDbEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29DQUNuRCxDQUFDO2dDQUVMLENBQUM7d0JBQ1QsQ0FBQztvQkFDTCxDQUFFO29CQUFBLEtBQUssQ0FBQSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ1QsRUFBRSxDQUFDLENBQUMsRUFBRSxZQUFZLFdBQVcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQzs0QkFDbkQsSUFBSSxDQUFDLElBQUksQ0FBQztnQ0FDTixJQUFJLEVBQVEsT0FBTztnQ0FDbkIsS0FBSyxFQUFPLEVBQUU7Z0NBQ2QsT0FBTyxFQUFLLEVBQUUsQ0FBQyxPQUFPO2dDQUN0QixJQUFJLEVBQVEsRUFBRSxDQUFDLElBQUk7Z0NBQ25CLEdBQUcsRUFBUyxFQUFFLENBQUMsR0FBRzs2QkFDckIsQ0FBQyxDQUFDO3dCQUNQLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osTUFBTSxFQUFFLENBQUM7d0JBQ2IsQ0FBQztvQkFDTCxDQUFDO29CQUVELEVBQUUsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzVCLENBQUM7Z0JBRUQsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDO29CQUNsQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQy9DLENBQUM7Z0JBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUMvQixDQUFDO1lBRUQsUUFBUSxFQUFFLFVBQVMsSUFBSTtnQkFDbkIsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsT0FBTyxFQUNQLEtBQUssRUFDTCxJQUFJLEVBQ0osR0FBRyxDQUFDO2dCQUVSLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDdkMsSUFBSSxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxTQUFTLENBQUM7b0JBQ3JDLEdBQUcsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDO29CQUVuQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3ZCLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUVyQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM1QixPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztvQkFFdEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUN2QixXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFFeEMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFBLENBQUM7d0JBQ2hCLElBQUksQ0FBQyxJQUFJLENBQUM7NEJBQ04sSUFBSSxFQUFJLFNBQVM7NEJBQ2pCLE9BQU8sRUFBQyxPQUFPOzRCQUNmLElBQUksRUFBSSxJQUFJOzRCQUNaLEdBQUcsRUFBSyxHQUFHO3lCQUNkLENBQUMsQ0FBQztvQkFDUCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1lBRUQsT0FBTyxFQUFFLFVBQVMsSUFBSTtnQkFPbEIsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsRUFBRSxFQUNGLEdBQUcsRUFDSCxXQUFXLEVBQ1gsU0FBUyxHQUFLLEVBQUUsQ0FBQztnQkFHckIsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3pDLFdBQVcsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBR25ELEdBQUcsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxvQ0FBb0MsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFcEYsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUV2QixTQUFTLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBR3JDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQSxDQUFDO29CQUNoQixJQUFJLENBQUMsSUFBSSxDQUFDO3dCQUNOLElBQUksRUFBSSxRQUFRO3dCQUNoQixHQUFHLEVBQUssR0FBRzt3QkFDWCxLQUFLLEVBQUcsU0FBUzt3QkFDakIsSUFBSSxFQUFJLFdBQVcsQ0FBQyxTQUFTO3dCQUM3QixHQUFHLEVBQUssV0FBVyxDQUFDLFFBQVE7cUJBQy9CLENBQUMsQ0FBQztnQkFDUCxDQUFDO1lBRUwsQ0FBQztZQUVELFVBQVUsRUFBRSxVQUFTLElBQUk7Z0JBTXJCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLElBQUksRUFDSixHQUFHLEVBQ0gsTUFBTSxFQUNOLEdBQUcsQ0FBQztnQkFHUixXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxTQUFTLENBQUM7Z0JBQ3JDLEdBQUcsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBR3ZCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDakMsTUFBTSxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBQ25DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDM0IsQ0FBQztnQkFFRCxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFNbkQsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLCtCQUErQixFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUUvRSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBR3ZCLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQSxDQUFDO29CQUNoQixJQUFJLENBQUMsSUFBSSxDQUFDO3dCQUNOLElBQUksRUFBSSxXQUFXO3dCQUNuQixNQUFNLEVBQUUsTUFBTTt3QkFDZCxHQUFHLEVBQUssR0FBRzt3QkFDWCxJQUFJLEVBQUksSUFBSTt3QkFDWixHQUFHLEVBQUssR0FBRztxQkFDZCxDQUFDLENBQUM7Z0JBQ1AsQ0FBQztZQUVMLENBQUM7WUFFRCxNQUFNLEVBQUU7Z0JBTUosSUFBSSxXQUFXLEdBQU8sSUFBSSxDQUFDLFlBQVksRUFDbkMsSUFBSSxFQUNKLEdBQUcsRUFDSCxTQUFTLENBQUM7Z0JBR2QsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3hDLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDO2dCQUNyQyxHQUFHLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFFbkMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUV2QixTQUFTLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBRXJDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNyQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBRXZCLElBQUksQ0FBQyxJQUFJLENBQUM7b0JBQ04sSUFBSSxFQUFJLFlBQVk7b0JBQ3BCLEtBQUssRUFBRyxTQUFTO29CQUNqQixJQUFJLEVBQUksSUFBSTtvQkFDWixHQUFHLEVBQUssR0FBRztpQkFDZCxDQUFDLENBQUM7Z0JBRUgsT0FBTSxJQUFJLEVBQUUsQ0FBQztvQkFDVCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUM7d0JBQ3ZDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDakIsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQSxDQUFDO3dCQUNuRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ3RCLENBQUM7b0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUEsQ0FBQzt3QkFDbEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNyQixDQUFDO29CQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFBLENBQUM7d0JBQ3pCLEtBQUssQ0FBQztvQkFDVixDQUFDO2dCQUNMLENBQUM7Z0JBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3JDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksVUFBVTtvQkFDbEIsS0FBSyxFQUFHLFNBQVM7b0JBQ2pCLElBQUksRUFBSSxJQUFJO29CQUNaLEdBQUcsRUFBSyxHQUFHO2lCQUNkLENBQUMsQ0FBQztZQUNQLENBQUM7WUFJRCxpQkFBaUIsRUFBRTtnQkFNZixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixTQUFTLEdBQUssRUFBRSxDQUFDO2dCQUdyQixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQztvQkFDM0UsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztnQkFDeEMsQ0FBQztnQkFFRCxPQUFNLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFDLENBQUM7b0JBQ25DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDdkIsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztnQkFDeEMsQ0FBQztnQkFFRCxNQUFNLENBQUMsU0FBUyxDQUFDO1lBQ3JCLENBQUM7WUFPRCxZQUFZLEVBQUU7Z0JBT1YsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsSUFBSSxHQUFVLElBQUksRUFDbEIsS0FBSyxHQUFTLElBQUksRUFDbEIsS0FBSyxHQUFTLElBQUksRUFDbEIsV0FBVyxHQUFHLEVBQUUsQ0FBQztnQkFFckIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUNqQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFHaEQsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLE1BQU0sSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLENBQUEsQ0FBQzt3QkFDbkMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUNwQixLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNqQixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQ2hDLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUEsQ0FBQztvQkFDcEMsSUFBSSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDMUIsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7d0JBQ2hCLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQ2hDLENBQUM7Z0JBQ0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFDO29CQUM1QyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQzt3QkFDaEIsS0FBSyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUM7b0JBQ0QsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQyxDQUFDO2dCQUVELEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLElBQUksV0FBVyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUMzQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNoQixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDdkIsT0FBTyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBQyxDQUFDO3dCQUNwQyxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFBLENBQUM7NEJBQ2xELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQzt3QkFDL0MsQ0FBQzt3QkFFRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7d0JBQ3ZCLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztvQkFDL0MsQ0FBQztnQkFDTCxDQUFDO2dCQUVELE1BQU0sQ0FBQyxJQUFJLFVBQVUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNyRixDQUFDO1lBR0QsV0FBVyxFQUFFO2dCQU1ULE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDakMsQ0FBQztZQVVELGlCQUFpQixFQUFFO2dCQU1mLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLE9BQU8sR0FBTyxJQUFJLEVBQ2xCLEtBQUssRUFDTCxVQUFVLEdBQUksSUFBSSxDQUFDO2dCQUV2QixXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFckMsT0FBTyxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUV2QixFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBQ2pDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDdkIsS0FBSyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzFCLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3JDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsTUFBTSxDQUFDLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN4SCxDQUFDO1lBR0QsY0FBYyxFQUFFO2dCQU1aLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBRXBDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUVwQyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUNyRCxDQUFDO1lBR0QsS0FBSyxFQUFFO2dCQU9ILElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLElBQUksRUFDSixHQUFHLEVBQ0gsVUFBVSxHQUFJLElBQUksRUFDbEIsVUFBVSxHQUFJLElBQUksQ0FBQztnQkFHdkIsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3ZDLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDO2dCQUNyQyxHQUFHLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFFbkMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUV2QixFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBQ2pDLFVBQVUsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO29CQUd2QyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLEtBQUssTUFBTSxDQUFDLENBQUEsQ0FBQzt3QkFDckMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO29CQUMvQyxDQUFDO2dCQUNMLENBQUM7Z0JBR0QsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDO29CQUNwQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNyQyxDQUFDO2dCQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksV0FBVztvQkFDbkIsRUFBRSxFQUFNLFVBQVU7b0JBQ2xCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixJQUFJLEVBQUksSUFBSTtvQkFDWixHQUFHLEVBQUssR0FBRztpQkFDZCxDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFFbkMsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksU0FBUztvQkFDakIsRUFBRSxFQUFNLFVBQVU7b0JBQ2xCLE1BQU0sRUFBRSxVQUFVO29CQUNsQixJQUFJLEVBQUksSUFBSTtvQkFDWixHQUFHLEVBQUssR0FBRztpQkFDZCxDQUFDLENBQUM7WUFFUCxDQUFDO1lBR0QsT0FBTyxFQUFFO2dCQU1MLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLElBQUksRUFDSixHQUFHLEVBQ0gsU0FBUyxHQUFLLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFFckMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUEsQ0FBQztvQkFDWCxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQztvQkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7b0JBRW5DLElBQUksQ0FBQyxJQUFJLENBQUM7d0JBQ04sSUFBSSxFQUFFLGlCQUFpQjt3QkFDdkIsTUFBTSxFQUFFLFNBQVM7d0JBQ2pCLElBQUksRUFBSSxJQUFJO3dCQUNaLEdBQUcsRUFBSyxHQUFHO3FCQUNkLENBQUMsQ0FBQztvQkFFSCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRTdCLElBQUksQ0FBQyxJQUFJLENBQUM7d0JBQ04sSUFBSSxFQUFFLGVBQWU7d0JBQ3JCLE1BQU0sRUFBRSxTQUFTO3dCQUNqQixJQUFJLEVBQUksSUFBSTt3QkFDWixHQUFHLEVBQUssR0FBRztxQkFDZCxDQUFDLENBQUM7b0JBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNqQixDQUFDO1lBQ0wsQ0FBQztZQUdELFdBQVcsRUFBRTtnQkF1QlQsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFFcEMsRUFBRSxDQUFBLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsV0FBVztvQkFDMUQsTUFBTSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxrQkFBa0I7b0JBQ3BFLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMsY0FBYztvQkFDbEQsTUFBTSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxlQUFlO29CQUMvQyxNQUFNLENBQUMscUJBQXFCLEVBQUUsTUFBTSxDQUFDLFdBQVc7b0JBQ2hELE1BQU0sQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsWUFBWTtvQkFDakUsTUFBTSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUN6RCxDQUFDO29CQUNHLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7WUFFTCxDQUFDO1lBRUQsWUFBWSxFQUFFO2dCQU9WLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7Z0JBRXBDLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNwQyxXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFJcEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7WUFDckMsQ0FBQztZQUVELFVBQVUsRUFBRTtnQkFPUixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixJQUFJLEVBQ0osR0FBRyxDQUFDO2dCQUdSLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUM1QyxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQztnQkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7Z0JBRW5DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksZUFBZTtvQkFDdkIsSUFBSSxFQUFJLElBQUk7b0JBQ1osR0FBRyxFQUFLLEdBQUc7aUJBQ2QsQ0FBQyxDQUFDO2dCQUVILElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFN0IsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksYUFBYTtvQkFDckIsSUFBSSxFQUFJLElBQUk7b0JBQ1osR0FBRyxFQUFLLEdBQUc7aUJBQ2QsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUVELFNBQVMsRUFBRTtnQkFPTixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUNoQyxJQUFJLEVBQ0osR0FBRyxDQUFDO2dCQUVKLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUMzQyxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQztnQkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7Z0JBRW5DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksZUFBZTtvQkFDdkIsSUFBSSxFQUFJLElBQUk7b0JBQ1osR0FBRyxFQUFLLEdBQUc7aUJBQ2QsQ0FBQyxDQUFDO2dCQUVILElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFN0IsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksYUFBYTtvQkFDckIsSUFBSSxFQUFJLElBQUk7b0JBQ1osR0FBRyxFQUFLLEdBQUc7aUJBQ2QsQ0FBQyxDQUFDO1lBRVgsQ0FBQztZQUVELFNBQVMsRUFBRSxVQUFTLFVBQVU7Z0JBVTFCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssR0FBUyxJQUFJLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDL0MsQ0FBQyxVQUFVLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDN0UsS0FBSyxHQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDN0IsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzQixDQUFDO2dCQUNELE1BQU0sQ0FBQyxLQUFLLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQztZQUU3RCxDQUFDO1lBRUQsV0FBVyxFQUFFO2dCQVFULElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssR0FBUyxJQUFJLEVBQ2xCLEtBQUssQ0FBQztnQkFFVixFQUFFLENBQUEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDL0QsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDNUIsS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3JFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDM0IsQ0FBQztnQkFFRCxNQUFNLENBQUMsS0FBSyxDQUFDO1lBQ2pCLENBQUM7WUFFRCxlQUFlLEVBQUU7Z0JBUWIsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztnQkFFcEMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUNoRCxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztnQkFDckMsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNoQixDQUFDO1lBQ0wsQ0FBQztZQUVELFNBQVMsRUFBRTtnQkFRUCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLEdBQVMsSUFBSSxFQUNsQixJQUFJLEdBQVUsSUFBSSxFQUNsQixVQUFVLEVBQ1YsS0FBSyxFQUNMLElBQUksRUFDSixHQUFHLENBQUM7Z0JBR1IsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFDO29CQUM1RCxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQ2xCLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzVCLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO29CQUNuQixJQUFJLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztvQkFDdkIsR0FBRyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Z0JBQ3pCLENBQUM7Z0JBRUQsRUFBRSxDQUFBLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUNoQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM1QixVQUFVLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztvQkFHekIsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQSxDQUFDO3dCQUM1RCxJQUFJLEdBQUcsR0FBRyxDQUFDO3dCQUNYLFVBQVUsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUVELEtBQUssR0FBRyxJQUFJLFlBQVksQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxJQUFFLEtBQUssQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDM0YsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzQixDQUFDO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDakIsQ0FBQztZQUdELFFBQVEsRUFBRTtnQkFRTixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixFQUFFLEVBQ0YsU0FBUyxDQUFDO2dCQU9kLElBQUksQ0FBQztvQkFDRCxTQUFTLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7Z0JBQ3hDLENBQUU7Z0JBQUEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUEsQ0FBQztvQkFDVCxFQUFFLENBQUMsQ0FBQyxFQUFFLFlBQVksV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFDO3dCQUduRCxJQUFJLENBQUMsSUFBSSxDQUFDOzRCQUNOLElBQUksRUFBUSxPQUFPOzRCQUNuQixLQUFLLEVBQU8sRUFBRTs0QkFDZCxPQUFPLEVBQUssRUFBRSxDQUFDLE9BQU87NEJBQ3RCLElBQUksRUFBUSxFQUFFLENBQUMsSUFBSTs0QkFDbkIsR0FBRyxFQUFTLEVBQUUsQ0FBQyxHQUFHO3lCQUNyQixDQUFDLENBQUM7d0JBR0gsRUFBRSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzt3QkFDMUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFDO3dCQUV6QixDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUVKLE1BQU0sRUFBRSxDQUFDO3dCQUNiLENBQUM7b0JBRUwsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFFSixNQUFNLEVBQUUsQ0FBQztvQkFDYixDQUFDO29CQUdELE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7Z0JBR0QsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUEsQ0FBQztvQkFFWCxJQUFJLENBQUMsSUFBSSxDQUFDO3dCQUNOLElBQUksRUFBUSxXQUFXO3dCQUN2QixTQUFTLEVBQUcsU0FBUzt3QkFDckIsSUFBSSxFQUFRLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO3dCQUM3QixHQUFHLEVBQVMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUc7cUJBQy9CLENBQUMsQ0FBQztvQkFFSCxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBRTdCLElBQUksQ0FBQyxJQUFJLENBQUM7d0JBQ04sSUFBSSxFQUFRLFNBQVM7d0JBQ3JCLFNBQVMsRUFBRyxTQUFTO3dCQUNyQixJQUFJLEVBQVEsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7d0JBQzdCLEdBQUcsRUFBUyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRztxQkFDL0IsQ0FBQyxDQUFDO2dCQUVQLENBQUM7Z0JBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQztZQUVyQixDQUFDO1lBR0QsZ0JBQWdCLEVBQUU7Z0JBT2QsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsU0FBUyxHQUFLLEVBQUUsRUFDaEIsUUFBUSxDQUFDO2dCQUViLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQzVCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO29CQUVuQixTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUN6QixPQUFNLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFDLENBQUM7d0JBQ25DLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDdkIsUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQzt3QkFDNUIsRUFBRSxDQUFDLENBQUMsUUFBUSxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7NEJBQ25CLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7d0JBQzdCLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDN0MsQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7Z0JBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsU0FBUyxHQUFHLElBQUksQ0FBQztZQUMvQyxDQUFDO1lBR0QsU0FBUyxFQUFFO2dCQU9QLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLFFBQVEsR0FBTSxFQUFFLEVBQ2hCLFlBQVksR0FBRyxJQUFJLEVBQ25CLFVBQVUsR0FBSSxJQUFJLEVBQ2xCLEVBQUUsR0FBWSxJQUFJLENBQUM7Z0JBR3ZCLFlBQVksR0FBRyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztnQkFDaEQsRUFBRSxDQUFDLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7b0JBQ3ZCLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7Z0JBRUQsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFFNUIsR0FBRyxDQUFDO29CQUdBLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBRWhDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO3dCQUNyQixRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUMxQixZQUFZLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7d0JBR2hELEVBQUUsQ0FBQyxDQUFDLFlBQVksS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDOzRCQUN2QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM3QyxDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUdKLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7d0JBQ2hDLENBQUM7b0JBQ0wsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFHSixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQSxDQUFDOzRCQUd4QixFQUFFLEdBQUcsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQzs0QkFHNUcsVUFBVSxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQzs0QkFHaEMsWUFBWSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDOzRCQUNoRCxFQUFFLENBQUMsQ0FBQyxZQUFZLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQztnQ0FDdkIsRUFBRSxDQUFDLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7b0NBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQzdDLENBQUM7NEJBQ0wsQ0FBQzs0QkFBQyxJQUFJLENBQUMsQ0FBQztnQ0FFSixFQUFFLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQztvQ0FDckIsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztnQ0FDOUIsQ0FBQztnQ0FBQyxJQUFJLENBQUMsQ0FBQztvQ0FDSixRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dDQUN0QixDQUFDO2dDQUVELFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7NEJBQ2hDLENBQUM7d0JBQ0wsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDSixLQUFLLENBQUM7d0JBQ1YsQ0FBQztvQkFFTCxDQUFDO2dCQUNMLENBQUMsUUFBTyxJQUFJLEVBQUU7Z0JBRWQsTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyRSxDQUFDO1lBR0QseUJBQXlCLEVBQUU7Z0JBU3ZCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBRy9CLFdBQVcsR0FBRyxJQUFJLEVBQ2xCLFNBQVMsR0FBSyxFQUFFLEVBR2hCLFlBQVksR0FBRSxFQUFFLEVBR2hCLFVBQVUsR0FBSTtvQkFFVjt3QkFDSSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDOzRCQUM3QixJQUFJLGVBQWUsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7NEJBQ2pILElBQUksQ0FBQztvQkFDakIsQ0FBQztvQkFDRCxJQUFJLENBQUMsTUFBTTtvQkFDWCxJQUFJLENBQUMsT0FBTztvQkFDWixJQUFJLENBQUMsT0FBTztvQkFDWixJQUFJLENBQUMsU0FBUztpQkFDakIsRUFDRCxDQUFDLEdBQWEsQ0FBQyxFQUNmLEdBQUcsR0FBVyxVQUFVLENBQUMsTUFBTSxFQUMvQixTQUFTLEdBQUssSUFBSSxFQUNsQixLQUFLLEdBQVMsS0FBSyxFQUNuQixJQUFJLEVBQ0osR0FBRyxDQUFDO2dCQUlSLElBQUksR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFDbkMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO2dCQUVqQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUNwQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFBLENBQUM7b0JBQ2QsV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDcEMsQ0FBQztnQkFFRCxFQUFFLENBQUMsQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQztvQkFDdEIsWUFBWSxJQUFJLFdBQVcsQ0FBQztnQkFDaEMsQ0FBQztnQkFFRCxPQUFNLElBQUksRUFBQyxDQUFDO29CQUdSLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQzt3QkFDakMsS0FBSyxDQUFDO29CQUNWLENBQUM7b0JBR0QsT0FBTSxDQUFDLEdBQUcsR0FBRyxJQUFJLFNBQVMsS0FBSyxJQUFJLEVBQUMsQ0FBQzt3QkFDakMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDM0MsQ0FBQztvQkFFRCxFQUFFLENBQUMsQ0FBQyxTQUFTLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQzt3QkFHcEIsRUFBRSxDQUFDLENBQUMsWUFBWSxLQUFLLEVBQUUsQ0FBQyxDQUFBLENBQUM7NEJBQ3JCLE1BQU0sQ0FBQyxJQUFJLENBQUM7d0JBQ2hCLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ0osS0FBSyxDQUFDO3dCQUNWLENBQUM7b0JBQ0wsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQzt3QkFDSixDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUNOLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7d0JBQzFCLFlBQVksSUFBSSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7d0JBQ3JDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLENBQUM7Z0JBQ0wsQ0FBQztnQkFHRCxNQUFNLENBQUMsWUFBWSxLQUFLLEVBQUU7b0JBQ2xCLElBQUksWUFBWSxDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUM7b0JBQ2pFLElBQUksQ0FBQztZQUNqQixDQUFDO1lBR0QsY0FBYyxFQUFFO2dCQU9aLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEVBQUUsR0FBWSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsRUFDdEMsV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFFdkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQSxDQUFDO29CQU9kLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFBLENBQUM7d0JBQ0osV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUNwQixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFBLENBQUM7NEJBQ2YsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUN4QixDQUFDO29CQUNMLENBQUM7b0JBRUQsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO3dCQUNKLFdBQVcsQ0FBQyxJQUFJLEdBQUcsRUFBRSxHQUFHLFdBQVcsQ0FBQyxJQUFJLENBQUM7d0JBQ3pDLFdBQVcsQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQztvQkFDakMsQ0FBQztvQkFDRCxNQUFNLENBQUMsV0FBVyxDQUFDO2dCQUN2QixDQUFDO1lBQ0wsQ0FBQztZQUdELE1BQU0sRUFBRTtnQkFPSixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLENBQUM7Z0JBRVYsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUMvQixXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDcEMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDNUIsTUFBTSxDQUFDLElBQUksZUFBZSxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hHLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztZQUVMLENBQUM7WUFHRCxhQUFhLEVBQUU7Z0JBT1gsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsS0FBSyxDQUFDO2dCQUVWLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDakMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDNUIsTUFBTSxDQUFDLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUU1RixDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLENBQUM7WUFDTCxDQUFDO1lBR0QsaUJBQWlCLEVBQUU7Z0JBTWYsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsS0FBSyxHQUFTLEVBQUUsQ0FBQztnQkFHckIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFBLENBQUM7b0JBRXhFLEVBQUUsQ0FBQSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQzt3QkFDL0MsS0FBSyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBQ3ZDLENBQUM7b0JBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ25DLEtBQUssSUFBSSxHQUFHLENBQUM7Z0JBRWpCLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQztZQUN2QyxDQUFDO1lBR0QsVUFBVSxFQUFFO2dCQU1SLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssR0FBUyxFQUFFLEVBQ2hCLEVBQUUsQ0FBQztnQkFFUCxFQUFFLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7Z0JBQzlCLEVBQUUsQ0FBQSxDQUFDLEVBQUUsQ0FBQyxDQUFBLENBQUM7b0JBQ0gsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDaEIsQ0FBQztnQkFFRCxFQUFFLENBQUEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBQy9CLEtBQUssSUFBSSxHQUFHLENBQUM7Z0JBQ2pCLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQztZQUV4QyxDQUFDO1lBR0EsT0FBTyxFQUFFO2dCQWNMLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssR0FBUyxJQUFJLEVBQ2xCLEVBQUUsRUFDRixLQUFLLENBQUM7Z0JBRVYsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUNwQyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM1QixLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztvQkFDcEIsS0FBSyxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFFaEMsRUFBRSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO29CQUU5QixFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO3dCQUNKLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ2hCLENBQUM7b0JBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3BDLEtBQUssSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO29CQUNuQyxLQUFLLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUVoQyxFQUFFLENBQUEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxjQUFjO3dCQUMzRSxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO3dCQUV4RCxLQUFLLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQzt3QkFDbkMsS0FBSyxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFFaEMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ3JELEtBQUssSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO3dCQUNuQyxLQUFLLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUNwQyxDQUFDO29CQUVELFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUV2QyxNQUFNLENBQUMsSUFBSSxlQUFlLENBQUMsS0FBSyxHQUFHLEdBQUcsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzFGLENBQUM7Z0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBQ0osTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztZQUNMLENBQUM7WUFHRCxPQUFPLEVBQUU7Z0JBUUwsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsTUFBTSxHQUFRLElBQUksRUFDbEIsTUFBTSxHQUFRLEdBQUcsRUFDakIsSUFBSSxFQUNKLEdBQUcsQ0FBQztnQkFFUixFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBRWpDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQzt3QkFDakMsTUFBTSxJQUFJLEdBQUcsQ0FBQztvQkFDbEIsQ0FBQztvQkFFRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUM7d0JBQ2pDLE1BQU0sR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO3dCQUNuQyxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQzt3QkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztvQkFDdkQsQ0FBQztvQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQSxDQUFDO3dCQUM5QyxJQUFJLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7d0JBQ25DLEdBQUcsR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO3dCQUNqRCxNQUFNLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7b0JBQ3ZDLENBQUM7b0JBRUQsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQzt3QkFDUixNQUFNLEdBQUcsSUFBSSxlQUFlLENBQUMsTUFBTSxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUN2RSxDQUFDO2dCQUNMLENBQUM7Z0JBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsQixDQUFDO1lBR0Qsa0JBQWtCLEVBQUU7Z0JBT2hCLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssR0FBRyxJQUFJLENBQUM7Z0JBRWpCLEVBQUUsQ0FBQSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDbkMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBQ2xDLEtBQUssSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ2hDLEtBQUssSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQzVCLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNyQyxLQUFLLElBQUksR0FBRyxDQUFDO2dCQUNqQixDQUFDO2dCQUVELE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDakIsQ0FBQztZQUdELFdBQVcsRUFBRTtnQkFPVCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLEdBQVMsRUFBRSxDQUFDO2dCQUVyQixPQUFNLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLFNBQVM7b0JBQzVELE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxNQUFNO29CQUN6RCxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUk7b0JBQ3RDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUMsQ0FBQztvQkFFdkMsS0FBSyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBQ25DLEtBQUssSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQztZQUV2QyxDQUFDO1lBR0QsU0FBUyxFQUFFO2dCQU9QLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLElBQUksRUFDSixHQUFHLEVBQ0gsS0FBSyxHQUFTLEVBQUUsRUFDaEIsR0FBRyxFQUNILE9BQU8sR0FBTyxJQUFJLENBQUM7Z0JBRXZCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDL0IsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBQ2xDLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDO29CQUNyQyxHQUFHLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQztvQkFDbkMsS0FBSyxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDaEMsR0FBRyxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztvQkFDM0IsS0FBSyxJQUFJLEdBQUcsQ0FBQztvQkFDYixLQUFLLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUNoQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDakMsS0FBSyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7b0JBRW5DLE9BQU8sR0FBRyxJQUFJLGVBQWUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztvQkFDdkQsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzNCLENBQUM7Z0JBRUQsTUFBTSxDQUFDLE9BQU8sQ0FBQztZQUNuQixDQUFDO1lBR0QsYUFBYSxFQUFFO2dCQU9YLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLElBQUksR0FBVTtvQkFDVixJQUFJLENBQUMsY0FBYztvQkFDbkIsSUFBSSxDQUFDLFVBQVU7b0JBQ2Y7d0JBQ0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQzs0QkFDN0IsSUFBSSxlQUFlLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDOzRCQUNqSCxJQUFJLENBQUM7b0JBQ2pCLENBQUM7b0JBQ0QsSUFBSSxDQUFDLE1BQU07b0JBQ1gsSUFBSSxDQUFDLE9BQU87b0JBQ1osSUFBSSxDQUFDLE9BQU87aUJBQ2YsRUFDRCxHQUFHLEdBQVcsSUFBSSxFQUNsQixDQUFDLEdBQWEsQ0FBQyxFQUNmLEdBQUcsR0FBVyxJQUFJLENBQUMsTUFBTSxFQUN6QixXQUFXLEVBQ1gsSUFBSSxFQUNKLEdBQUcsRUFDSCxJQUFJLENBQUM7Z0JBRVQsSUFBSSxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUNuQyxHQUFHLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7Z0JBRWpDLE9BQU0sQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFDLENBQUM7b0JBRTNCLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN6QixDQUFDLEVBQUUsQ0FBQztnQkFDUixDQUFDO2dCQUdELEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO29CQUNkLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLENBQUM7Z0JBR0QsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxhQUFhLENBQUMsQ0FBQSxDQUFDO29CQUMzQixJQUFJLEdBQUcsSUFBSSxZQUFZLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLElBQUksR0FBRyxJQUFJLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNwRSxDQUFDO2dCQUVELE1BQU0sQ0FBQyxJQUFJLENBQUM7WUFDaEIsQ0FBQztZQUVELFlBQVksRUFBRTtnQkFTVixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixRQUFRLEdBQU0sSUFBSSxFQUNsQixJQUFJLEdBQVUsSUFBSSxFQUNsQixJQUFJLEdBQVUsSUFBSSxFQUNsQixLQUFLLEdBQVMsSUFBSSxFQUNsQixPQUFPLEdBQU8sSUFBSSxFQUNsQixZQUFZLEdBQUUsRUFBRSxDQUFDO2dCQUVyQixRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUM1QixFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQztvQkFFbkIsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3BDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFFdkIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFHcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDO3dCQUM1QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUM3QyxDQUFDO29CQUVELElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBT3BCLFlBQVksR0FBRyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ25DLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLElBQUksR0FBRzt3QkFDekMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO3dCQUUxRCxZQUFZLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQztvQkFDakMsQ0FBQztvQkFFRCxJQUFJLENBQUM7d0JBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDL0MsQ0FBRTtvQkFBQSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO3dCQUNWLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2pCLENBQUM7b0JBRUQsSUFBSSxDQUFDLElBQUksQ0FBQzt3QkFDTixJQUFJLEVBQVEsVUFBVTt3QkFDdEIsUUFBUSxFQUFJLFFBQVE7d0JBQ3BCLEtBQUssRUFBTyxJQUFJO3dCQUNoQixTQUFTLEVBQUcsSUFBSTt3QkFDaEIsSUFBSSxFQUFRLFFBQVEsQ0FBQyxJQUFJO3dCQUN6QixHQUFHLEVBQVMsUUFBUSxDQUFDLEdBQUc7d0JBQ3hCLE9BQU8sRUFBSyxPQUFPO3FCQUN0QixDQUFDLENBQUM7b0JBRUgsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNqQixDQUFDO1lBQ0wsQ0FBQztZQUVELEtBQUssRUFBRTtnQkFPSCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixNQUFNLEdBQVEsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBRTFELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsQixDQUFDO1lBRUQsS0FBSyxFQUFFLFVBQVMsVUFBVTtnQkFPdEIsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsTUFBTSxHQUFRLEVBQUUsRUFFaEIsS0FBSyxHQUFTLElBQUksRUFDbEIsUUFBUSxHQUFNLElBQUksQ0FBQztnQkFFdkIsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQy9CLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO29CQUVoQixNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUVuQixHQUFHLENBQUM7d0JBQ0EsUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBR3RDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFBLENBQUM7NEJBQ1YsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDMUIsQ0FBQzt3QkFNRCxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFFL0IsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7NEJBQ2hCLEtBQUssQ0FBQzt3QkFDVixDQUFDO3dCQUFDLElBQUksQ0FBQyxDQUFDOzRCQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQ3ZCLENBQUM7b0JBQ0wsQ0FBQyxRQUFPLElBQUksRUFBRTtnQkFDbEIsQ0FBQztnQkFPRCxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsSUFBSSxhQUFhLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUMvRixDQUFDO1lBRUQsS0FBSyxFQUFFLFVBQVMsVUFBVTtnQkFXdEIsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsS0FBSyxHQUFTLElBQUksRUFDbEIsS0FBSyxHQUFTLElBQUksRUFDbEIsT0FBTyxHQUFPLElBQUksRUFDbEIsS0FBSyxFQUNMLElBQUksRUFDSixHQUFHLENBQUM7Z0JBR1IsS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDL0IsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7b0JBQ2hCLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDO29CQUNyQyxHQUFHLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQztnQkFDdkMsQ0FBQztnQkFHRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFBLENBQUM7b0JBRXBFLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQzVCLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO3dCQUNoQixJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQzt3QkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7b0JBQ3ZDLENBQUM7Z0JBR0wsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUV6RixLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUM1QixPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztvQkFDeEIsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ2xELEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDO3dCQUNoQixJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQzt3QkFDckMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUM7b0JBQ3ZDLENBQUM7b0JBQ0QsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQzVDLEtBQUssSUFBSSxPQUFPLENBQUM7b0JBQ2pCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFHM0IsQ0FBQztnQkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsTUFBTTtvQkFDckUsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSTtvQkFDekIsTUFBTSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBRWxGLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO29CQUNsQyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQzt3QkFDaEIsSUFBSSxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxTQUFTLENBQUM7d0JBQ3JDLEdBQUcsR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDO29CQUN2QyxDQUFDO29CQUNELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDM0IsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFHSixLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUN6QixFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQzt3QkFHaEIsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFBLENBQUM7NEJBQ2hCLElBQUksR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQzs0QkFDbkMsR0FBRyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDO3dCQUNyQyxDQUFDO3dCQUdELEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQSxDQUFDOzRCQU1oQixFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQSxDQUFDO2dDQUM5RCxLQUFLLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDOzRCQUNoQyxDQUFDOzRCQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNKLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7NEJBQzdCLENBQUM7d0JBQ0wsQ0FBQztvQkFPTCxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO3dCQUNwQixFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUEsQ0FBQzs0QkFDaEIsSUFBSSxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7NEJBQ3ZCLEdBQUcsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO3dCQUN6QixDQUFDO29CQUNMLENBQUM7Z0JBRUwsQ0FBQztnQkFFRCxNQUFNLENBQUMsS0FBSyxLQUFLLElBQUk7b0JBQ2IsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLEtBQUssSUFBSSxHQUFHLEtBQUssR0FBRyxLQUFLLEdBQUcsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUM7b0JBQ3hFLElBQUksQ0FBQztZQUVqQixDQUFDO1lBRUQsU0FBUyxFQUFFO2dCQVFQLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLFlBQVksR0FBRyxJQUFJLEVBQ25CLElBQUksR0FBVSxJQUFJLEVBQ2xCLEVBQUUsQ0FBQztnQkFFUCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBQ3BDLFlBQVksR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO29CQUN6QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3ZCLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN4QixZQUFZLElBQUksSUFBSSxDQUFDO29CQUdyQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUM7d0JBQy9ELEdBQUcsQ0FBQzs0QkFFQSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQSxDQUFDO2dDQUN4QixZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQzs0QkFDOUMsQ0FBQzs0QkFHRCxFQUFFLENBQUMsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQSxDQUFDO2dDQUNuQyxZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQzs0QkFDOUMsQ0FBQzs0QkFFRCxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDaEMsWUFBWSxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7NEJBRTFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDOzRCQUNqQyxZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQzs0QkFHMUMsRUFBRSxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQzs0QkFDeEIsT0FBTSxFQUFFLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxDQUFDLE1BQU0sRUFBQyxDQUFDO2dDQUMvRCxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUM7Z0NBQ2xCLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO2dDQUMxQyxFQUFFLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDOzRCQUM1QixDQUFDO3dCQUNMLENBQUMsUUFBTyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDekQsQ0FBQztvQkFJRCxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDakMsWUFBWSxJQUFJLEdBQUcsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzQixDQUFDO2dCQUVELE1BQU0sQ0FBQyxZQUFZLENBQUM7WUFDeEIsQ0FBQztZQUVELFlBQVksRUFBRTtnQkFRVixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixZQUFZLEdBQUcsSUFBSSxFQUNuQixJQUFJLEdBQVUsSUFBSSxFQUNsQixFQUFFLENBQUM7Z0JBR1AsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUMxRCxZQUFZLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQztvQkFFekMsR0FBRyxDQUFDO3dCQUVBLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFBLENBQUM7NEJBQ3hCLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO3dCQUM5QyxDQUFDO3dCQUdELEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFBLENBQUM7NEJBQ25DLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO3dCQUM5QyxDQUFDO3dCQUVELFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO3dCQUNoQyxZQUFZLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQzt3QkFFMUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQ2pDLFlBQVksSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUMsS0FBSyxDQUFDO3dCQUcxQyxFQUFFLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUN4QixPQUFNLEVBQUUsSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFDLENBQUM7NEJBQy9ELFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQzs0QkFDbEIsWUFBWSxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7NEJBQzFDLEVBQUUsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQzVCLENBQUM7b0JBQ0wsQ0FBQyxRQUFPLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUVyRCxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDakMsWUFBWSxJQUFJLEdBQUcsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzQixDQUFDO2dCQUVELE1BQU0sQ0FBQyxZQUFZLENBQUM7WUFDeEIsQ0FBQztZQUVELFNBQVMsRUFBRTtnQkFXUCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLEdBQUcsSUFBSSxFQUNaLEtBQUssQ0FBQztnQkFFVixFQUFFLENBQUEsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUM7b0JBSS9CLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7b0JBQzVCLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO29CQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBLENBQUM7d0JBQ2hDLE1BQU0sSUFBSSxXQUFXLENBQUMsa0NBQWtDLEdBQUcsS0FBSyxHQUFHLFlBQVksR0FBRyxLQUFLLENBQUMsU0FBUyxHQUFHLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDMUssQ0FBQztvQkFDRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzNCLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBTUQsVUFBVSxFQUFFO2dCQU9SLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssRUFDTCxFQUFFLEVBQ0YsSUFBSSxFQUNKLE1BQU0sR0FBRyxFQUFFLENBQUM7Z0JBRWhCLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUM1QyxLQUFLLEdBQUcsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUM1QixFQUFFLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDckMsTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLENBQUM7Z0JBRUQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN2QixJQUFJLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUU3QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3ZCLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUVyQyxJQUFJLENBQUMsSUFBSSxDQUFDO29CQUNOLElBQUksRUFBSSxnQkFBZ0I7b0JBQ3hCLElBQUksRUFBSSxJQUFJO29CQUNaLE1BQU0sRUFBRSxNQUFNO29CQUNkLElBQUksRUFBSSxLQUFLLENBQUMsU0FBUztvQkFDdkIsR0FBRyxFQUFLLEtBQUssQ0FBQyxRQUFRO2lCQUN6QixDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN2QixFQUFFLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUd4QixPQUFNLEVBQUUsSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ2xELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztvQkFDdEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO29CQUN2QixFQUFFLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM1QixDQUFDO2dCQUVELElBQUksQ0FBQyxJQUFJLENBQUM7b0JBQ04sSUFBSSxFQUFJLGNBQWM7b0JBQ3RCLElBQUksRUFBSSxJQUFJO29CQUNaLE1BQU0sRUFBRSxNQUFNO29CQUNkLElBQUksRUFBSSxLQUFLLENBQUMsU0FBUztvQkFDdkIsR0FBRyxFQUFLLEtBQUssQ0FBQyxRQUFRO2lCQUN6QixDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUN2QixXQUFXLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUV6QyxDQUFDO1lBRUQsY0FBYyxFQUFFO2dCQVFaLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQy9CLEtBQUssQ0FBQztnQkFFVixXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDckQsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDckQsQ0FBQztZQUVELGNBQWMsRUFBRTtnQkFRWixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLEVBQ0wsT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFFL0IsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksbUJBQW1CO29CQUMzQixJQUFJLEVBQUksT0FBTztvQkFDZixJQUFJLEVBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7b0JBQ3ZCLEdBQUcsRUFBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRztpQkFDekIsQ0FBQyxDQUFDO2dCQUVILElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFN0IsSUFBSSxDQUFDLElBQUksQ0FBQztvQkFDTixJQUFJLEVBQUksaUJBQWlCO29CQUN6QixJQUFJLEVBQUksT0FBTztvQkFDZixJQUFJLEVBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7b0JBQ3ZCLEdBQUcsRUFBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRztpQkFDekIsQ0FBQyxDQUFDO1lBRVAsQ0FBQztZQUVELFNBQVMsRUFBRTtnQkFPUCxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixLQUFLLEVBQ0wsR0FBRyxFQUNILE9BQU8sR0FBRyxFQUFFLENBQUM7Z0JBR2pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBRTFCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsT0FBTSxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBQyxDQUFDO29CQUNuQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQ3ZCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQzFCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDM0IsQ0FBQztnQkFFRCxNQUFNLENBQUMsT0FBTyxDQUFDO1lBQ25CLENBQUM7WUFFRCxJQUFJLEVBQUU7Z0JBVUYsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFDL0IsS0FBSyxDQUFDO2dCQUVWLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDdEMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ3JELENBQUM7Z0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDeEMsS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFFNUIsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQSxDQUFDO3dCQUM5QixNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDdkMsQ0FBQztvQkFFRCxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hCLENBQUM7Z0JBR0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxDQUFDO1lBYUQsVUFBVSxFQUFFO2dCQUNSLE9BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUMsQ0FBQztnQkFFbkUsQ0FBQztZQUNMLENBQUM7WUFjRCxpQkFBaUIsRUFBRSxVQUFTLFVBQVUsRUFBRSxXQUFXO2dCQVUvQyxJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixFQUFFLENBQUM7Z0JBR1AsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUV2QixFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQSxDQUFDO29CQUNaLFdBQVcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN6QyxDQUFDO2dCQUVELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxDQUFDO29CQUVELE9BQU0sSUFBSSxFQUFDLENBQUM7d0JBRVIsRUFBRSxDQUFDLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQSxDQUFDO3dCQUU1RSxDQUFDO3dCQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQSxDQUFDOzRCQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUEsQ0FBQztnQ0FDdEMsS0FBSyxDQUFDOzRCQUNWLENBQUM7d0JBQ0wsQ0FBQzt3QkFBQyxJQUFJLENBQUMsQ0FBQzs0QkFDSixLQUFLLENBQUM7d0JBQ1YsQ0FBQzt3QkFLRCxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7b0JBQzNCLENBQUM7b0JBRUQsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ3JDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFM0IsQ0FBRTtnQkFBQSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNWLEVBQUUsQ0FBQyxDQUFDLEVBQUUsWUFBWSxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUM7d0JBR25ELElBQUksQ0FBQyxJQUFJLENBQUM7NEJBQ04sSUFBSSxFQUFRLE9BQU87NEJBQ25CLEtBQUssRUFBTyxFQUFFOzRCQUNkLE9BQU8sRUFBSyxFQUFFLENBQUMsT0FBTzs0QkFDdEIsSUFBSSxFQUFRLEVBQUUsQ0FBQyxJQUFJOzRCQUNuQixHQUFHLEVBQVMsRUFBRSxDQUFDLEdBQUc7eUJBQ3JCLENBQUMsQ0FBQzt3QkFHSCxFQUFFLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQzVELEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUEsQ0FBQzs0QkFFeEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQzt3QkFDL0MsQ0FBQzt3QkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFDOzRCQUc1QixNQUFNLEVBQUUsQ0FBQzt3QkFDYixDQUFDO29CQUVMLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBRUosTUFBTSxFQUFFLENBQUM7b0JBQ2IsQ0FBQztnQkFDTCxDQUFDO1lBRUwsQ0FBQztZQVdELGVBQWUsRUFBRTtnQkFFYixJQUFJLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxFQUMvQixFQUFFLEdBQUcsRUFBRSxDQUFDO2dCQUVaLE9BQU0sV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQztvQkFDL0IsRUFBRSxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNkLENBQUM7WUFVRCxnQkFBZ0IsRUFBRSxVQUFTLEtBQUs7Z0JBQzVCLE1BQU0sSUFBSSxXQUFXLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsR0FBRyxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsR0FBRyxHQUFHLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEssQ0FBQztZQVFELFVBQVUsRUFBRTtnQkFDUixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQztvQkFDdkMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELENBQUM7WUFDTCxDQUFDO1lBS0QsaUJBQWlCLEVBQUUsVUFBUyxRQUFRLEVBQUUsS0FBSztnQkFDdkMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekMsQ0FBQztZQU1ELEtBQUssRUFBRSxVQUFTLEtBQUs7Z0JBQ2pCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDdkIsQ0FBQztZQUVELGVBQWUsRUFBRSxVQUFTLEtBQUs7Z0JBRTNCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzdCLENBQUM7WUFFRCxlQUFlLEVBQUUsVUFBUyxLQUFLO2dCQUMzQixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksV0FBVyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDbkQsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUdqQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBR2xCLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDbEIsQ0FBQztZQVFELGtCQUFrQixFQUFFLFVBQVMsS0FBSztnQkFFOUIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ25ELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUcxQixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBR3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFHbEIsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsQixDQUFDO1lBU0QsU0FBUyxFQUFFLFVBQVMsS0FBSztnQkFDckIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBR25ELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUc3QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBR3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFHbEIsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsQixDQUFDO1lBU0QsYUFBYSxFQUFFLFVBQVMsS0FBSztnQkFFekIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBR25ELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFFdkIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUc5QixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBR3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFHbEIsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUNsQixDQUFDO1lBU0QsbUJBQW1CLEVBQUUsVUFBUyxLQUFLO2dCQUMvQixLQUFLLElBQUksR0FBRyxDQUFDO2dCQUNiLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNuRCxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixDQUFDO1NBQ0osQ0FBQztRQUdOLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBQSxDQUFDO1lBQ3BCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFDO2dCQUNoQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLENBQUM7UUFDTCxDQUFDO1FBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUNqQixDQUFDLEVBQUUsQ0FBQztJQVVKLElBQUksVUFBVSxHQUFHO1FBR2IsYUFBYSxFQUFxQixxREFBcUQ7UUFDdkYsZUFBZSxFQUFtQix5RUFBeUU7UUFDM0csWUFBWSxFQUFzQiw0REFBNEQ7UUFDOUYscUJBQXFCLEVBQWEscURBQXFEO1FBQ3ZGLHVCQUF1QixFQUFXLHlFQUF5RTtRQUMzRyxvQkFBb0IsRUFBYyw0REFBNEQ7UUFDOUYsa0JBQWtCLEVBQWdCLGtMQUFrTDtRQUNwTixvQkFBb0IsRUFBYyw4SkFBOEo7UUFDaE0sV0FBVyxFQUF1QixDQUFDO1FBQ25DLGlCQUFpQixFQUFpQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUNsRSxxQkFBcUIsRUFBYSxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQzlFLG9CQUFvQixFQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2xFLHFCQUFxQixFQUFhLEVBQUUsS0FBSyxFQUFFLG9DQUFvQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDOUYsMkJBQTJCLEVBQU8sRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUMvRSxnQkFBZ0IsRUFBa0IsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUMxRSxzQkFBc0IsRUFBWSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQzVFLDJCQUEyQixFQUFPLENBQUM7UUFHbkMsc0JBQXNCLEVBQWlCLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ3ZFLDBCQUEwQixFQUFhLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDbkYseUJBQXlCLEVBQWMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDdkUsZ0NBQWdDLEVBQU8sRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUNwRixxQkFBcUIsRUFBa0IsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUMvRSwyQkFBMkIsRUFBWSxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBRWpGLHFCQUFxQixFQUFpQixFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUN0RSx5QkFBeUIsRUFBYSxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2xGLHdCQUF3QixFQUFjLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ3RFLCtCQUErQixFQUFPLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDbkYsb0JBQW9CLEVBQWtCLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDOUUsMEJBQTBCLEVBQVksRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUVoRix5QkFBeUIsRUFBaUIsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDMUUsNkJBQTZCLEVBQWEsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUN0Riw0QkFBNEIsRUFBYyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUMxRSw2QkFBNkIsRUFBYSxFQUFFLEtBQUssRUFBRSxvQ0FBb0MsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ3RHLG1DQUFtQyxFQUFPLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDdkYsd0JBQXdCLEVBQWtCLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDbEYsOEJBQThCLEVBQVksRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUVwRixvQkFBb0IsRUFBaUIsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDckUsd0JBQXdCLEVBQWEsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUNqRix1QkFBdUIsRUFBYyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUNyRSw4QkFBOEIsRUFBTyxFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2xGLG1CQUFtQixFQUFrQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQzdFLHlCQUF5QixFQUFZLEVBQUUsS0FBSyxFQUFFLGtCQUFrQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFFL0UsWUFBWSxFQUFzQix5VUFBeVU7UUFDM1csU0FBUyxFQUF5QixVQUFVLFVBQVU7WUFDbEQsSUFBSSxNQUFNLEdBQVEsNENBQTRDLEVBQzFELFNBQVMsR0FBSyxvR0FBb0csRUFDbEgsTUFBTSxHQUFRLEtBQUssRUFDbkIsS0FBSyxHQUFTLEtBQUssRUFDbkIsSUFBSSxDQUFDO1lBRVQsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUMsTUFBTSxHQUFHLElBQUksQ0FBQztvQkFDZCxLQUFLLEdBQUcsSUFBSSxDQUFDO2dCQUNqQixDQUFDO2dCQUVELEVBQUUsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDL0MsS0FBSyxHQUFHLElBQUksQ0FBQztvQkFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQ1YsZUFBZSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLENBQUM7b0JBQ2hELENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNSLE1BQU0sSUFBSSxlQUFlLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEcsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLElBQUksZUFBZSxDQUFDLG9DQUFvQyxHQUFHLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3ZHLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUdELHFCQUFxQixFQUFhLGtCQUFrQjtRQUNwRCxZQUFZLEVBQXNCLENBQUM7UUFDbkMsdUJBQXVCLEVBQVcsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUU7UUFDeEUsaUJBQWlCLEVBQWlCLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2pFLGtCQUFrQixFQUFnQixtQkFBbUI7UUFDckQsa0JBQWtCLEVBQWdCLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ3RFLG1CQUFtQixFQUFlLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ2pFLHFCQUFxQixFQUFhLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFO1FBQ3pFLG1CQUFtQixFQUFlLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFO1FBQzdELGlCQUFpQixFQUFpQixFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRTtRQUNyRSxnQkFBZ0IsRUFBa0Isa0RBQWtEO1FBQ3BGLFVBQVUsRUFBd0IsQ0FBQztRQUNuQyxTQUFTLEVBQXlCLENBQUM7UUFDbkMsT0FBTyxFQUEyQixVQUFVO1FBQzVDLGdCQUFnQixFQUFrQiwrQkFBK0I7UUFDakUsZ0JBQWdCLEVBQWtCLGtCQUFrQjtRQUNwRCxnQkFBZ0IsRUFBa0IsZUFBZTtRQUNqRCxpQkFBaUIsRUFBaUIsdUJBQXVCO1FBQ3pELFFBQVEsRUFBMEIsNkNBQTZDO1FBQy9FLGVBQWUsRUFBbUIsNkNBQTZDO1FBQy9FLHFCQUFxQixFQUFhLG1CQUFtQjtRQUNyRCwyQkFBMkIsRUFBUSxnQkFBZ0I7UUFDbkQsNEJBQTRCLEVBQU8sZ0JBQWdCO1FBQ25ELHFCQUFxQixFQUFhLGdCQUFnQjtRQUNsRCxxQkFBcUIsRUFBYSxnQkFBZ0I7UUFDbEQsaUJBQWlCLEVBQWlCLCtCQUErQjtRQUNqRSxjQUFjLEVBQW9CLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUU7UUFDeEUsY0FBYyxFQUFvQixDQUFDO1FBQ25DLHFCQUFxQixFQUFhLEVBQUUsS0FBSyxFQUFFLHFCQUFxQixFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUU7UUFDMUUscUJBQXFCLEVBQWEsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtRQUMvRSxvQkFBb0IsRUFBYyxVQUFTLFVBQVU7WUFFakQsSUFBSSxLQUFLLEdBQUssS0FBSyxFQUNmLE9BQU8sR0FBRyx5QkFBeUIsRUFDbkMsSUFBSSxHQUFNLEtBQUssRUFDZixLQUFLLEdBQUssQ0FBQyxFQUNYLEdBQUcsR0FBTyxDQUFDLEVBQ1gsSUFBSSxDQUFDO1lBRVQsRUFBRSxDQUFDLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNaLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDakIsQ0FBQztZQUVELE9BQU8sVUFBVSxDQUFDLE9BQU8sRUFBRSxJQUFJLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQztnQkFDekMsS0FBSyxHQUFHLGVBQWUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNuRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1QsS0FBSyxDQUFDO2dCQUNWLENBQUM7Z0JBQ0QsS0FBSyxFQUFFLENBQUM7WUFDWixDQUFDO1lBR0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUNSLGVBQWUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzlDLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNSLE1BQU0sSUFBSSxlQUFlLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEcsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLElBQUksZUFBZSxDQUFDLGdFQUFnRSxHQUFHLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25JLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUNELHFCQUFxQixFQUFhLGdCQUFnQjtRQUNsRCxvQkFBb0IsRUFBYyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1FBQ2hHLGFBQWEsRUFBcUIsNkNBQTZDO1FBQy9FLG1CQUFtQixFQUFlLG1CQUFtQjtRQUNyRCxtQkFBbUIsRUFBZSxnQkFBZ0I7UUFDbEQsbUJBQW1CLEVBQWUsZ0JBQWdCO1FBQ2xELGVBQWUsRUFBbUIsVUFBUyxVQUFVO1lBRWpELElBQUksS0FBSyxHQUFLLEtBQUssRUFDZixNQUFNLEdBQUcsbUNBQW1DLEVBQzVDLEtBQUssR0FBSyxLQUFLLEVBQ2YsSUFBSSxHQUFNLEtBQUssRUFDZixLQUFLLEdBQUssQ0FBQyxFQUNYLEdBQUcsR0FBTyxDQUFDLEVBQ1gsSUFBSSxDQUFDO1lBRVQsT0FBTyxVQUFVLENBQUMsT0FBTyxFQUFFLElBQUksS0FBSyxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUN6QyxLQUFLLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2xELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFFVCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksR0FBRyxJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO3dCQUNsRCxLQUFLLEdBQUcsSUFBSSxDQUFDO3dCQUNiLEdBQUcsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO3dCQUNoQixVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3RCLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osS0FBSyxDQUFDO29CQUNWLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxLQUFLLEVBQUUsQ0FBQztZQUNaLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2QixJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUNSLE1BQU0sSUFBSSxlQUFlLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEcsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLElBQUksZUFBZSxDQUFDLDBDQUEwQyxHQUFHLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdHLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztRQUNELGNBQWMsRUFBb0IsNkNBQTZDO1FBQy9FLG9CQUFvQixFQUFjLG1CQUFtQjtRQUNyRCxvQkFBb0IsRUFBYyxnQkFBZ0I7UUFDbEQsb0JBQW9CLEVBQWMsZ0JBQWdCO1FBQ2xELGdCQUFnQixFQUFrQixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1FBQ3pFLGNBQWMsRUFBb0IsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtRQUNyRSxZQUFZLEVBQXNCLDZDQUE2QztRQUMvRSxrQkFBa0IsRUFBZ0IsbUJBQW1CO1FBQ3JELHdCQUF3QixFQUFVLGdCQUFnQjtRQUNsRCx5QkFBeUIsRUFBUyxnQkFBZ0I7UUFDbEQsa0JBQWtCLEVBQWdCLGdCQUFnQjtRQUNsRCxrQkFBa0IsRUFBZ0IsZ0JBQWdCO1FBQ2xELGNBQWMsRUFBb0IsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtRQUNyRSxRQUFRLEVBQTBCLDBCQUEwQjtRQUM1RCxnQkFBZ0IsRUFBa0IsMkNBQTJDO1FBQzdFLDJCQUEyQixFQUFPLGNBQWM7UUFDaEQsb0JBQW9CLEVBQWMsNEJBQTRCO1FBQzlELGVBQWUsRUFBbUIsVUFBVTtRQUM1QyxxQkFBcUIsRUFBYSxXQUFXO1FBQzdDLGdCQUFnQixFQUFrQixtQkFBbUI7UUFDckQsd0JBQXdCLEVBQVUsV0FBVztRQUM3QyxpQkFBaUIsRUFBaUIsNERBQTREO1FBQzlGLGVBQWUsRUFBbUIsZ0NBQWdDO1FBQ2xFLG1CQUFtQixFQUFlLDJDQUEyQztRQUM3RSw4QkFBOEIsRUFBSSxjQUFjO1FBQ2hELHVCQUF1QixFQUFXLDRCQUE0QjtRQUM5RCxrQkFBa0IsRUFBZ0IsVUFBVTtRQUM1Qyx3QkFBd0IsRUFBVSxXQUFXO1FBQzdDLG1CQUFtQixFQUFlLG1CQUFtQjtRQUNyRCwyQkFBMkIsRUFBTyxXQUFXO1FBQzdDLG9CQUFvQixFQUFjLDREQUE0RDtRQUM5RixrQkFBa0IsRUFBZ0IsZ0NBQWdDO1FBQ2xFLFlBQVksRUFBc0IsVUFBVSxVQUFVO1lBQ2xELElBQUksTUFBTSxHQUFRLEtBQUssRUFDbkIsSUFBSSxDQUFDO1lBRVQsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLFVBQVUsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDckUsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3pCLE1BQU0sSUFBSSxlQUFlLENBQUMsbUNBQW1DLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDdEcsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQ0QsWUFBWSxFQUFzQixvQ0FBb0M7UUFDdEUsYUFBYSxFQUFxQixrRkFBa0Y7UUFDcEgsY0FBYyxFQUFvQixrRkFBa0Y7UUFDcEgsY0FBYyxFQUFvQiwwQ0FBMEM7UUFHNUUsY0FBYyxFQUFvQix3QkFBd0I7UUFDMUQsT0FBTyxFQUEyQixzQ0FBc0M7UUFDeEUsTUFBTSxFQUE0QixDQUFDO1FBQ25DLE9BQU8sRUFBMkIsbUJBQW1CO1FBQ3JELGVBQWUsRUFBbUIsQ0FBQztRQUNuQyxjQUFjLEVBQW9CLGtCQUFrQjtRQUNwRCxhQUFhLEVBQXFCLGdCQUFnQjtRQUNsRCxZQUFZLEVBQXNCLG1CQUFtQjtRQUNyRCxhQUFhLEVBQXFCLDZDQUE2QztRQUMvRSxtQkFBbUIsRUFBZSxTQUFTO1FBQzNDLG1CQUFtQixFQUFlLGdCQUFnQjtRQUNsRCxtQkFBbUIsRUFBZSxnQkFBZ0I7UUFDbEQsYUFBYSxFQUFxQixZQUFZO1FBQzlDLGNBQWMsRUFBb0IsaUJBQWlCO1FBQ25ELFNBQVMsRUFBeUIsQ0FBQztRQUNuQyxTQUFTLEVBQXlCLENBQUM7UUFDbkMsbUJBQW1CLEVBQWUsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLENBQUM7UUFDbkMsTUFBTSxFQUE0QixnQkFBZ0I7UUFDbEQsS0FBSyxFQUE2QixrQ0FBa0M7UUFDcEUsV0FBVyxFQUF1QixDQUFDO1FBQ25DLFlBQVksRUFBc0IsQ0FBQztRQUNuQyxRQUFRLEVBQTBCLENBQUM7UUFHbkMsV0FBVyxFQUF1QixxQkFBcUI7UUFDdkQsU0FBUyxFQUF5QixnbEJBQWdsQjtRQUNsbkIsbUJBQW1CLEVBQWUsQ0FBQztRQUNuQywyQkFBMkIsRUFBTyxxSEFBcUg7UUFDdkosMEJBQTBCLEVBQVEsOEpBQThKO1FBQ2hNLDRCQUE0QixFQUFNLHNHQUFzRztRQUN4SSwyQkFBMkIsRUFBTyw0S0FBNEs7UUFDOU0sbUJBQW1CLEVBQWUsdUNBQXVDO1FBQ3pFLG9CQUFvQixFQUFjLHFCQUFxQjtRQUd2RCxXQUFXLEVBQXVCLDREQUE0RDtRQUM5RixhQUFhLEVBQXFCLHVCQUF1QjtRQUd6RCxRQUFRLEVBQTBCLENBQUM7UUFDbkMsS0FBSyxFQUE2Qiw4QkFBOEI7UUFDaEUsY0FBYyxFQUFvQixDQUFDO1FBQ25DLE1BQU0sRUFBNEIsUUFBUTtRQUMxQyxZQUFZLEVBQXNCLFNBQVM7UUFDM0MsZ0JBQWdCLEVBQWtCLDZDQUE2QztRQUMvRSxXQUFXLEVBQXVCLGlDQUFpQztRQUNuRSxXQUFXLEVBQXVCLFVBQVU7UUFDNUMsYUFBYSxFQUFxQixVQUFVO1FBQzVDLFdBQVcsRUFBdUIsOEJBQThCO1FBQ2hFLGNBQWMsRUFBb0IsUUFBUTtRQUMxQyxvQkFBb0IsRUFBYyxTQUFTO1FBQzNDLHdCQUF3QixFQUFVLDZDQUE2QztRQUMvRSxtQkFBbUIsRUFBZSxpQ0FBaUM7UUFDbkUsbUJBQW1CLEVBQWUsVUFBVTtRQUM1QyxxQkFBcUIsRUFBYSxVQUFVO1FBQzVDLG1CQUFtQixFQUFlLDhCQUE4QjtRQUNoRSxVQUFVLEVBQXdCLFFBQVE7UUFDMUMsZ0JBQWdCLEVBQWtCLDJDQUEyQztRQUM3RSxvQkFBb0IsRUFBYyx1REFBdUQ7UUFDekYsZ0JBQWdCLEVBQWtCLFVBQVU7UUFDNUMsZUFBZSxFQUFtQixnQ0FBZ0M7UUFDbEUsZUFBZSxFQUFtQiw4QkFBOEI7UUFDaEUsT0FBTyxFQUEyQiwrQkFBK0I7UUFDakUsY0FBYyxFQUFvQixDQUFDO1FBQ25DLE1BQU0sRUFBNEIsQ0FBQztRQUNuQyxhQUFhLEVBQXFCLENBQUM7UUFDbkMsV0FBVyxFQUF1Qix1RUFBdUU7UUFDekcsa0JBQWtCLEVBQWdCLDJCQUEyQjtRQUM3RCxjQUFjLEVBQW9CLGdKQUFnSjtRQUNsTCxZQUFZLEVBQXNCLHFDQUFxQztRQUN2RSxjQUFjLEVBQW9CLCtCQUErQjtRQUNqRSxhQUFhLEVBQXFCLGtHQUFrRztRQUdwSSxvQkFBb0IsRUFBYyx3QkFBd0I7UUFDMUQsYUFBYSxFQUFxQixDQUFDO1FBQ25DLGNBQWMsRUFBb0IsQ0FBQztRQUNuQyxtQkFBbUIsRUFBZSxnQ0FBZ0M7UUFDbEUsb0JBQW9CLEVBQWMsQ0FBQztRQUNuQyxrQkFBa0IsRUFBZ0IsV0FBVztRQUM3QyxXQUFXLEVBQXVCLHVCQUF1QjtRQUN6RCxZQUFZLEVBQXNCLFdBQVc7UUFDN0MsVUFBVSxFQUF3QixDQUFDO1FBQ25DLFdBQVcsRUFBdUIsQ0FBQztRQUNuQyxnQkFBZ0IsRUFBa0IsZ0NBQWdDO1FBQ2xFLGVBQWUsRUFBbUIsV0FBVztRQUM3QyxpQkFBaUIsRUFBaUIsQ0FBQztRQUduQyxxQkFBcUIsRUFBYSxDQUFDO1FBQ25DLFFBQVEsRUFBMEIsNkNBQTZDO1FBQy9FLGlCQUFpQixFQUFpQixrQkFBa0I7UUFDcEQsa0JBQWtCLEVBQWdCLGtCQUFrQjtRQUNwRCxxQkFBcUIsRUFBYSxpQkFBaUI7UUFDbkQsaUJBQWlCLEVBQWlCLHNCQUFzQjtRQUN4RCxvQkFBb0IsRUFBYyxDQUFDO1FBQ25DLFNBQVMsRUFBeUIsc0JBQXNCO1FBR3hELE1BQU0sRUFBNEIsQ0FBQztRQUNuQyxtQkFBbUIsRUFBZSxjQUFjO1FBQ2hELGlCQUFpQixFQUFpQixDQUFDO1FBQ25DLGtCQUFrQixFQUFnQixDQUFDO1FBQ25DLGtCQUFrQixFQUFnQiw0QkFBNEI7UUFHOUQsaUJBQWlCLEVBQWlCLCtEQUErRDtRQUNqRyx5QkFBeUIsRUFBUywrREFBK0Q7UUFHakcsTUFBTSxFQUE0QiwwQkFBMEI7UUFDNUQsZ0JBQWdCLEVBQWtCLDZCQUE2QjtRQUMvRCxhQUFhLEVBQXFCLHVEQUF1RDtRQUN6RixZQUFZLEVBQXNCLGdDQUFnQztRQUNsRSxlQUFlLEVBQW1CLENBQUM7UUFDbkMsb0JBQW9CLEVBQWMsNkJBQTZCO1FBQy9ELHFCQUFxQixFQUFhLG9DQUFvQztRQUN0RSx3QkFBd0IsRUFBVSxtRUFBbUU7UUFDckcsWUFBWSxFQUFzQixDQUFDO1FBQ25DLGtCQUFrQixFQUFnQix3QkFBd0I7UUFDMUQscUJBQXFCLEVBQWEsNEJBQTRCO1FBQzlELGlCQUFpQixFQUFpQixrTUFBa007UUFHcE8sUUFBUSxFQUEwQixFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1FBQy9FLGVBQWUsRUFBbUIsMEJBQTBCO1FBQzVELGFBQWEsRUFBcUIsMEJBQTBCO1FBQzVELGNBQWMsRUFBb0IsMEJBQTBCO1FBQzVELFlBQVksRUFBc0IsMEJBQTBCO1FBQzVELE1BQU0sRUFBNEIsQ0FBQztRQUNuQyxZQUFZLEVBQXNCLENBQUM7UUFDbkMsYUFBYSxFQUFxQixDQUFDO1FBQ25DLE9BQU8sRUFBMkIsQ0FBQztRQUNuQyxtQkFBbUIsRUFBZSxDQUFDO1FBQ25DLG9CQUFvQixFQUFjLENBQUM7UUFDbkMsZUFBZSxFQUFtQixDQUFDO1FBQ25DLGVBQWUsRUFBbUIsQ0FBQztRQUNuQyxZQUFZLEVBQXNCLDZEQUE2RDtRQUMvRixXQUFXLEVBQXVCLDZEQUE2RDtRQUMvRixZQUFZLEVBQXNCLHNIQUFzSDtRQUN4SixXQUFXLEVBQXVCLHNIQUFzSDtRQUN4SixTQUFTLEVBQXlCLENBQUM7UUFHbkMsVUFBVSxFQUF3QixDQUFDO1FBQ25DLFdBQVcsRUFBdUIsQ0FBQztRQUNuQyxVQUFVLEVBQXdCLENBQUM7UUFDbkMsV0FBVyxFQUF1QixDQUFDO1FBQ25DLFFBQVEsRUFBMEIsQ0FBQztRQUduQyxTQUFTLEVBQXlCLG9CQUFvQjtRQUN0RCxPQUFPLEVBQTJCLFdBQVc7UUFDN0MsZUFBZSxFQUFtQixXQUFXO1FBQzdDLFNBQVMsRUFBeUIscUJBQXFCO1FBQ3ZELFNBQVMsRUFBeUIsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLDRCQUE0QjtRQUM5RCxnQkFBZ0IsRUFBa0IsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLDBCQUEwQjtRQUM1RCxlQUFlLEVBQW1CLDBCQUEwQjtRQUM1RCxVQUFVLEVBQXdCLDRDQUE0QztRQUM5RSxnQkFBZ0IsRUFBa0IsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLHFCQUFxQjtRQUN2RCxZQUFZLEVBQXNCLENBQUM7UUFDbkMsWUFBWSxFQUFzQixDQUFDO1FBR25DLFNBQVMsRUFBeUIsRUFBRSxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtRQUNoRixnQkFBZ0IsRUFBa0IsMkJBQTJCO1FBQzdELGNBQWMsRUFBb0IsMkJBQTJCO1FBQzdELGVBQWUsRUFBbUIsMkJBQTJCO1FBQzdELGFBQWEsRUFBcUIsMkJBQTJCO1FBQzdELE1BQU0sRUFBNEIsQ0FBQztRQUNuQyxrQkFBa0IsRUFBZ0IsZ0RBQWdEO1FBQ2xGLG1CQUFtQixFQUFlLGdEQUFnRDtRQUNsRixtQkFBbUIsRUFBZSx3QkFBd0I7UUFDMUQsYUFBYSxFQUFxQixDQUFDO1FBQ25DLE9BQU8sRUFBMkIsQ0FBQztRQUNuQyxhQUFhLEVBQXFCLENBQUM7UUFDbkMsY0FBYyxFQUFvQixDQUFDO1FBQ25DLGFBQWEsRUFBcUIsQ0FBQztRQUNuQyxvQkFBb0IsRUFBYyxDQUFDO1FBQ25DLFVBQVUsRUFBd0IsQ0FBQztRQUNuQyxPQUFPLEVBQTJCLENBQUM7UUFDbkMsYUFBYSxFQUFxQixDQUFDO1FBQ25DLGFBQWEsRUFBcUIsQ0FBQztRQUNuQyxnQkFBZ0IsRUFBa0IsZ0hBQWdIO1FBQ2xKLFVBQVUsRUFBd0IsZ0RBQWdEO1FBQ2xGLG9CQUFvQixFQUFjLENBQUM7UUFDbkMsa0JBQWtCLEVBQWdCLENBQUM7UUFHbkMsUUFBUSxFQUEwQixDQUFDO1FBR25DLGtCQUFrQixFQUFnQixDQUFDO1FBQ25DLFFBQVEsRUFBMEIsQ0FBQztRQUNuQyxNQUFNLEVBQTRCLENBQUM7UUFDbkMsWUFBWSxFQUFzQixDQUFDO1FBQ25DLGFBQWEsRUFBcUIsQ0FBQztRQUNuQyxVQUFVLEVBQXdCLENBQUM7UUFDbkMsT0FBTyxFQUEyQiwwQkFBMEI7UUFDNUQsVUFBVSxFQUF3QixDQUFDO1FBQ25DLGdCQUFnQixFQUFrQixDQUFDO1FBQ25DLFlBQVksRUFBc0IsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLENBQUM7UUFDbkMsZUFBZSxFQUFtQixDQUFDO1FBQ25DLFdBQVcsRUFBdUIsQ0FBQztRQUduQyxNQUFNLEVBQTRCLENBQUM7UUFDbkMsT0FBTyxFQUEyQixxQ0FBcUM7UUFDdkUsY0FBYyxFQUFvQix5QkFBeUI7UUFDM0QsZUFBZSxFQUFtQiwrQkFBK0I7UUFDakUsbUJBQW1CLEVBQWUsdUJBQXVCO1FBQ3pELGFBQWEsRUFBcUIsQ0FBQztRQUNuQyxLQUFLLEVBQTZCLENBQUM7UUFDbkMsUUFBUSxFQUEwQixDQUFDO1FBQ25DLFlBQVksRUFBc0IsQ0FBQztRQUVuQyxjQUFjLEVBQW9CLHdCQUF3QjtRQUMxRCxVQUFVLEVBQXdCLHNCQUFzQjtRQUN4RCxRQUFRLEVBQTBCLENBQUM7UUFDbkMsYUFBYSxFQUFxQixDQUFDO1FBQ25DLFlBQVksRUFBc0IsQ0FBQztRQUNuQyxpQkFBaUIsRUFBaUIsQ0FBQztRQUNuQyxZQUFZLEVBQXNCLDJDQUEyQztRQUM3RSxpQkFBaUIsRUFBaUIsQ0FBQztRQUNuQyxpQkFBaUIsRUFBaUIsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLENBQUM7UUFDbkMsYUFBYSxFQUFxQixDQUFDO1FBQ25DLGFBQWEsRUFBcUIsbUNBQW1DO1FBQ3JFLGNBQWMsRUFBb0IsbUZBQW1GO1FBQ3JILGNBQWMsRUFBb0IsQ0FBQztRQUNuQyxlQUFlLEVBQW1CLENBQUM7UUFDbkMsZ0JBQWdCLEVBQWtCLDBFQUEwRTtRQUM1RyxhQUFhLEVBQXFCLENBQUM7UUFDbkMsZ0JBQWdCLEVBQWtCLHFEQUFxRDtRQUN2RixXQUFXLEVBQXVCLHVCQUF1QjtRQUN6RCxLQUFLLEVBQTZCLDBCQUEwQjtRQUM1RCxrQkFBa0IsRUFBZ0IsNkJBQTZCO1FBQy9ELGNBQWMsRUFBb0IsNkJBQTZCO1FBQy9ELFdBQVcsRUFBdUIsQ0FBQztRQUNuQyxrQkFBa0IsRUFBZ0IsQ0FBQztRQUNuQyxpQkFBaUIsRUFBaUIsQ0FBQztRQUNuQyxZQUFZLEVBQXNCLENBQUM7UUFDbkMsa0JBQWtCLEVBQWdCLENBQUM7UUFDbkMscUJBQXFCLEVBQWEsQ0FBQztRQUNuQyxxQkFBcUIsRUFBYSxDQUFDO1FBQ25DLDRCQUE0QixFQUFNLENBQUM7UUFHbkMsY0FBYyxFQUFvQixtRkFBbUY7UUFDckgsYUFBYSxFQUFxQiwrQ0FBK0M7UUFDakYsYUFBYSxFQUFxQiwyREFBMkQ7UUFHN0YsZ0JBQWdCLEVBQWtCLGlJQUFpSTtRQUNuSyxZQUFZLEVBQXNCLHVDQUF1QztRQUN6RSxlQUFlLEVBQW1CLENBQUM7UUFDbkMsZ0JBQWdCLEVBQWtCLENBQUM7UUFDbkMsY0FBYyxFQUFvQixDQUFDO1FBQ25DLGFBQWEsRUFBcUIsQ0FBQztRQUNuQyxtQkFBbUIsRUFBZSxDQUFDO1FBQ25DLFlBQVksRUFBc0IsQ0FBQztRQUNuQyxjQUFjLEVBQW9CLENBQUM7UUFDbkMsY0FBYyxFQUFvQixDQUFDO1FBQ25DLFFBQVEsRUFBMEIsQ0FBQztRQUduQyxhQUFhLEVBQXFCLGdIQUFnSDtRQUNsSixzQkFBc0IsRUFBWSxDQUFDO1FBQ25DLFFBQVEsRUFBMEIscUJBQXFCO1FBQ3ZELE9BQU8sRUFBMkIsNkRBQTZEO1FBQy9GLFlBQVksRUFBc0IsK0JBQStCO1FBQ2pFLGNBQWMsRUFBb0IsNkJBQTZCO1FBQy9ELFdBQVcsRUFBdUIscUJBQXFCO1FBQ3ZELGNBQWMsRUFBb0Isb0lBQW9JO1FBR3RLLFNBQVMsRUFBeUIsNEJBQTRCO1FBQzlELE1BQU0sRUFBNEIsa0NBQWtDO0tBQ3ZFLENBQUM7SUFhRixzQkFBc0IsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRztRQUV2Q0MsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQU9sRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFFckJBLENBQUNBO0lBRUQsWUFBWSxDQUFDLFNBQVMsR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO0lBQzFDLFlBQVksQ0FBQyxTQUFTLENBQUMsV0FBVyxHQUFHLFlBQVksQ0FBQztJQUNsRCxZQUFZLENBQUMsU0FBUyxDQUFDLFFBQVEsR0FBRztRQUM5QixNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztJQUNwRCxDQUFDLENBQUM7SUFjRix1QkFBdUIsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHO1FBRW5DQyxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1FBTzlFQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtJQUV2QkEsQ0FBQ0E7SUFFRCxhQUFhLENBQUMsU0FBUyxHQUFHLElBQUksVUFBVSxFQUFFLENBQUM7SUFDM0MsYUFBYSxDQUFDLFNBQVMsQ0FBQyxXQUFXLEdBQUcsYUFBYSxDQUFDO0lBV3BELCtCQUErQixLQUFLO1FBUWhDQyxJQUFJQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQVFaQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQVExQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFPakJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO0lBRXZCQSxDQUFDQTtJQU9ELHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUc7UUFDcEMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDO0lBQzlCLENBQUMsQ0FBQztJQU9GLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxPQUFPLEdBQUc7UUFDdEMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3pCLENBQUMsQ0FBQztJQU9GLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxPQUFPLEdBQUc7UUFDdEMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzFDLENBQUMsQ0FBQztJQVFGLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUc7UUFDbkMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQztJQVNGLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUcsVUFBUyxLQUFLO1FBQ2pELE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3ZFLENBQUMsQ0FBQztJQVNGLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxJQUFJLEdBQUc7UUFDbkMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQztJQUMxRCxDQUFDLENBQUM7SUFTRixxQkFBcUIsQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHO1FBQ3ZDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQztJQUN2RCxDQUFDLENBQUM7SUFPRixxQkFBcUIsQ0FBQyxTQUFTLENBQUMsT0FBTyxHQUFHO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQztZQUNwQixJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDaEMsQ0FBQztJQUNMLENBQUMsQ0FBQztJQWNGLDJCQUEyQixJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUc7UUFFdENDLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLHdCQUF3QkEsQ0FBQ0EsQ0FBQ0E7UUFPeEVBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLFNBQVNBLENBQUNBO1FBSXRCQSxJQUFJQSxJQUFJQSxDQUFDQTtRQUdUQSxFQUFFQSxDQUFDQSxDQUFDQSw0QkFBNEJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ3pDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1lBR3ZCQSxNQUFNQSxDQUFBQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFFN0JBLEtBQUtBLElBQUlBLENBQUNBO2dCQUNWQSxLQUFLQSxLQUFLQSxDQUFDQTtnQkFDWEEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLElBQUlBLENBQUNBO2dCQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFDVkEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLElBQUlBLENBQUNBO2dCQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFDVkEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLElBQUlBLENBQUNBO2dCQUNWQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFDVkEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLE1BQU1BLENBQUNBO2dCQUNaQSxLQUFLQSxNQUFNQTtvQkFDUEEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0E7b0JBQ3JCQSxLQUFLQSxDQUFDQTtnQkFFVkEsS0FBS0EsS0FBS0EsQ0FBQ0E7Z0JBQ1hBLEtBQUtBLEtBQUtBLENBQUNBO2dCQUNYQSxLQUFLQSxNQUFNQTtvQkFDUEEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0E7b0JBQ3BCQSxLQUFLQSxDQUFDQTtnQkFFVkEsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLEdBQUdBO29CQUNKQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQTtvQkFDbkJBLEtBQUtBLENBQUNBO2dCQUVWQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFDVkEsS0FBS0EsS0FBS0E7b0JBQ05BLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLFdBQVdBLENBQUNBO29CQUN4QkEsS0FBS0EsQ0FBQ0E7Z0JBRVZBLEtBQUtBLEtBQUtBLENBQUNBO2dCQUNYQSxLQUFLQSxNQUFNQTtvQkFDUEEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsWUFBWUEsQ0FBQ0E7b0JBQ3pCQSxLQUFLQSxDQUFDQTtZQUlkQSxDQUFDQTtRQUVMQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxxQkFBcUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ3pDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxZQUFZQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLFNBQVNBLENBQUNBO1lBQ3RCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUN4Q0EsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDckJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1FBRTVCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxvQkFBb0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ3hDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQTtZQUNwQkEsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDakJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO2dCQUNsQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBTUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pEQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDekRBLElBQUlBLENBQUNBLElBQUlBLEdBQUtBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEVBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQzdEQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBTUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7Z0JBQy9DQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFDQSxDQUFDQSxDQUFDQSxFQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDL0NBLElBQUlBLENBQUNBLElBQUlBLEdBQUtBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUNBLENBQUNBLENBQUNBLEVBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ25EQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSw4Q0FBOENBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ2xFQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxPQUFPQSxDQUFDQTtZQUN0QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsaURBQWlEQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNyRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsT0FBT0EsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLEdBQUdBLEdBQU1BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQTtZQUNyQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLCtEQUErREEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7WUFDbkZBLElBQUlBLENBQUNBLElBQUlBLEdBQUtBLE9BQU9BLENBQUNBO1lBQ3RCQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLElBQUlBLEdBQUtBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0Esa0VBQWtFQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUN0RkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsT0FBT0EsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLEdBQUdBLEdBQU1BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQTtZQUNyQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7WUFDckNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxnREFBZ0RBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ3BFQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxPQUFPQSxDQUFDQTtZQUN0QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBO1lBQ25DQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsaUVBQWlFQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFBQSxDQUFDQTtZQUNyRkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsT0FBT0EsQ0FBQ0E7WUFDdEJBLElBQUlBLENBQUNBLEdBQUdBLEdBQU1BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQTtZQUNuQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0E7WUFDbkNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSwrQkFBK0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ25EQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxLQUFLQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsR0FBTUEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxVQUFVQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUlBLElBQUlBLENBQUNBO1FBQ3ZCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxRQUFRQSxDQUFDQTtZQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQ25DQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFLQSxPQUFPQSxDQUFDQTtZQUN0QkEsSUFBSUEsR0FBVUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLENBQUNBLEdBQUdBLEdBQU1BLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUNBLENBQUNBLENBQUNBLEVBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQy9DQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFDQSxDQUFDQSxDQUFDQSxFQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMvQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO1lBQzlCQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFL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QUFDLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUN6QyxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUNiLENBQUM7WUFDTCxDQUFDO1lBRUQsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUM7UUFPRCxPQUFPLEVBQUU7WUFDTCxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNyRSxDQUFDO1FBT0QsUUFBUSxFQUFFO1lBQ04sTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0QsQ0FBQztLQUVKLENBQUM7SUFTRixXQUFXLENBQUMsU0FBUyxHQUFHLFVBQVMsUUFBUTtRQUVyQyxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQ04sSUFBSSxFQUNKLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFDLENBQUMsRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDO1FBRWxCLHNCQUFzQixJQUFJO1lBRXRCQyxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUNkQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxHQUFHQSxFQUFFQSxFQUMzREEsUUFBUUEsQ0FBQ0E7WUFFYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsSUFBSUEsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFB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R0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQy9DQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO29CQUN0REEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7d0JBQzVCQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDekJBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUMxQkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7d0JBQ2pCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQTt3QkFDeEJBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBO3dCQUV0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsWUFBWUEsSUFBSUEsUUFBUUEsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ2xEQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSx1REFBdURBLEVBQUVBLFdBQVdBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO3dCQUMzSEEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUVMQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBRS9DLENBQUM7Q0FDSixDQUFDLENBQUM7QUFPSCxPQUFPLENBQUMsT0FBTyxDQUFDO0lBR1osRUFBRSxFQUFFLFdBQVc7SUFDZixJQUFJLEVBQUUsOEJBQThCO0lBQ3BDLElBQUksRUFBRSwwQ0FBMEM7SUFDaEQsUUFBUSxFQUFFLEtBQUs7SUFHZixJQUFJLEVBQUUsVUFBUyxNQUFNLEVBQUUsUUFBUTtRQUMzQixJQUFJLElBQUksR0FBRyxJQUFJLEVBQ1gsSUFBSSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQ1osaUJBQWlCLEdBQUcsRUFBRSxFQUN0QixVQUFVLEVBQ1YsT0FBTyxHQUFHO1lBQ04sUUFBUSxFQUFFO2dCQUNOLFlBQVk7Z0JBQ1osZUFBZTtnQkFDZixhQUFhO2dCQUNiLGNBQWM7YUFDakI7WUFDRCxTQUFTLEVBQUU7Z0JBQ1AsYUFBYTtnQkFDYixnQkFBZ0I7Z0JBQ2hCLGNBQWM7Z0JBQ2QsZUFBZTthQUNsQjtTQUNKLENBQUM7UUFHTixHQUFHLENBQUMsQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLENBQUEsQ0FBQztZQUNsQixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBRSxHQUFHLEdBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFDLENBQUM7b0JBQzlDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztnQkFDL0MsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBRUQ7WUFDSUEsVUFBVUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBR0QsaUJBQWlCLEtBQUs7WUFFbEJDLElBQUlBLElBQUlBLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBO1lBR3hCQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxPQUFPQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDbEJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO29CQUM5QkEsS0FBS0EsR0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRVJBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUNBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUNBLENBQUNBO3dCQUM5Q0EsS0FBS0EsSUFBSUEsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xEQSxDQUFDQTtvQkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7d0JBQ2hDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLHNCQUFzQkEsR0FBR0EsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3JJQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFRCxNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUcvQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxVQUFTLEtBQUs7WUFDekMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUVuRCxFQUFFLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFBLENBQUM7Z0JBQ3pCLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFL0MsQ0FBQztDQUVKLENBQUMsQ0FBQztBQU9ILE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFHWixFQUFFLEVBQUUsb0JBQW9CO0lBQ3hCLElBQUksRUFBRSx3Q0FBd0M7SUFDOUMsSUFBSSxFQUFFLG1EQUFtRDtJQUN6RCxRQUFRLEVBQUUsS0FBSztJQUdmLElBQUksRUFBRSxVQUFTLE1BQU0sRUFBRSxRQUFRO1FBQzNCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUdoQixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxVQUFTLEtBQUs7WUFDekMsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUU5QixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLFFBQVEsQ0FBQyxNQUFNLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdkcsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKLENBQUMsQ0FBQztBQU9ILE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFHWixFQUFFLEVBQUUsYUFBYTtJQUNqQixJQUFJLEVBQUUsK0JBQStCO0lBQ3JDLElBQUksRUFBRSx3Q0FBd0M7SUFDOUMsUUFBUSxFQUFFLEtBQUs7SUFHZixJQUFJLEVBQUUsVUFBUyxNQUFNLEVBQUUsUUFBUTtRQUMzQixJQUFJLElBQUksR0FBRyxJQUFJLEVBQ1gsVUFBVSxFQUNWLFNBQVMsQ0FBQztRQUdkO1lBQ0lELFVBQVVBLEdBQUdBLEtBQUtBLENBQUNBO1lBQ25CQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFHRDtZQUNJQyxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxJQUFJQSxTQUFTQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFBQSxDQUFDQTtnQkFDbkNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLDhJQUE4SUEsRUFBRUEsVUFBVUEsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBVUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDM01BLENBQUNBO1FBQ0xBLENBQUNBO1FBRUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFHL0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsVUFBUyxLQUFLO1lBQ3pDLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsV0FBVyxFQUFFLEVBQzlDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBRXhCLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxhQUFhLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQSxDQUFDO2dCQUN0RCxVQUFVLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUNoQyxDQUFDO1lBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxXQUFXLElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLEtBQUssQ0FBQyxDQUFBLENBQUM7Z0JBQzNELFNBQVMsR0FBRyxLQUFLLENBQUM7WUFDdEIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFL0MsQ0FBQztDQUVKLENBQUMsQ0FBQztBQU9ILE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFHWixFQUFFLEVBQUUsMEJBQTBCO0lBQzlCLElBQUksRUFBRSwrQ0FBK0M7SUFDckQsSUFBSSxFQUFFLHVEQUF1RDtJQUM3RCxRQUFRLEVBQUUsS0FBSztJQUdmLElBQUksRUFBRSxVQUFTLE1BQU0sRUFBRSxRQUFRO1FBQzNCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUdoQixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxVQUFTLEtBQUs7WUFDekMsSUFBSSxRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztZQUU5QixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLFFBQVEsQ0FBQyxNQUFNLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDN0csQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztDQUNKLENBQUMsQ0FBQztBQU1ILE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFHWixFQUFFLEVBQUUsaUJBQWlCO0lBQ3JCLElBQUksRUFBRSxzQ0FBc0M7SUFDNUMsSUFBSSxFQUFFLHVDQUF1QztJQUM3QyxRQUFRLEVBQUUsS0FBSztJQUdmLElBQUksRUFBRSxVQUFTLE1BQU0sRUFBRSxRQUFRO1FBQzNCLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztRQUVoQixJQUFJLFFBQVEsR0FBRztZQUNQLEVBQUUsRUFBRSxDQUFDO1lBQ0wsRUFBRSxFQUFFLENBQUM7WUFDTCxFQUFFLEVBQUUsQ0FBQztZQUNMLEVBQUUsRUFBRSxDQUFDO1lBQ0wsRUFBRSxFQUFFLENBQUM7WUFDTCxFQUFFLEVBQUUsQ0FBQztTQUNSLENBQUM7UUFFTixNQUFNLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRSxVQUFTLEtBQUs7WUFDMUMsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLFNBQVMsRUFDM0IsUUFBUSxFQUNSLElBQUksRUFDSixNQUFNLEVBQ04sQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVULEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUMsQ0FBQztnQkFDakMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRS9DLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQSxDQUFDO29CQUVuRSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBQyxDQUFDO3dCQUN0QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQSxDQUFDOzRCQUNyQyxNQUFNLEdBQUcsSUFBSSxDQUFDOzRCQUNkLEtBQUssQ0FBQzt3QkFDVixDQUFDO29CQUNMLENBQUM7b0JBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQSxDQUFDO3dCQUNULFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQzt3QkFDdEIsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUMxQixRQUFRLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxHQUFHLDZCQUE2QixFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDL0csQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFBRTtZQUNoQyxJQUFJLElBQUksRUFDSixRQUFRLEdBQUcsRUFBRSxDQUFDO1lBRWxCLEdBQUcsQ0FBQyxDQUFDLElBQUksSUFBSSxRQUFRLENBQUMsQ0FBQSxDQUFDO2dCQUNuQixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUEsQ0FBQztvQkFDL0IsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBLENBQUM7d0JBQ3BCLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBQ3JELENBQUM7Z0JBQ0wsQ0FBQztZQUNMLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUEsQ0FBQztnQkFDakIsUUFBUSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyw4QkFBOEIsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNsRyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBRUosQ0FBQyxDQUFDO0FBTUgsT0FBTyxDQUFDLE9BQU8sQ0FBQztJQUdaLEVBQUUsRUFBRSxvQkFBb0I7SUFDeEIsSUFBSSxFQUFFLDZCQUE2QjtJQUNuQyxJQUFJLEVBQUUsaURBQWlEO0lBQ3ZELFFBQVEsRUFBRSxLQUFLO0lBR2YsSUFBSSxFQUFFLFVBQVMsTUFBTSxFQUFFLFFBQVE7UUFDM0IsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBRWhCLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFVBQVMsS0FBSztZQUMxQyxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxFQUMzQixRQUFRLEVBQ1IsSUFBSSxFQUNKLENBQUMsQ0FBQztZQUVOLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUMsQ0FBQztnQkFDakMsUUFBUSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFeEIsSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9DLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLEtBQUssR0FBRyxDQUFDLENBQUEsQ0FBQztvQkFDMUIsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDMUQsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7Q0FFSixDQUFDLENBQUM7QUFNSCxPQUFPLENBQUMsT0FBTyxDQUFDO0lBR1osRUFBRSxFQUFFLHdCQUF3QjtJQUM1QixJQUFJLEVBQUUsMENBQTBDO0lBQ2hELElBQUksRUFBRSx1REFBdUQ7SUFDN0QsUUFBUSxFQUFFLEtBQUs7SUFHZixJQUFJLEVBQUUsVUFBUyxNQUFNLEVBQUUsUUFBUTtRQUMzQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFFaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsVUFBUyxLQUFLO1lBRTFDLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQyxTQUFTLEVBQzNCLFFBQVEsRUFDUixJQUFJLEVBQ0osUUFBUSxFQUNSLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFVCxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFDLENBQUM7Z0JBQ2pDLFFBQVEsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRXhCLElBQUksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMvQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFBLENBQUM7b0JBQ3pDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFDLENBQUM7d0JBQ3RDLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM3QixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxLQUFLLFdBQVcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsV0FBVyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUEsQ0FBQzs0QkFDbEYsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQzt3QkFDMUQsQ0FBQztvQkFDTCxDQUFDO2dCQUNMLENBQUM7WUFFTCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0NBRUosQ0FBQyxDQUFDO0FBT0gsT0FBTyxDQUFDLE9BQU8sQ0FBQztJQUdaLEVBQUUsRUFBRSxlQUFlO0lBQ25CLElBQUksRUFBRSw4Q0FBOEM7SUFDcEQsSUFBSSxFQUFFLCtFQUErRTtJQUNyRixRQUFRLEVBQUUsS0FBSztJQUdmLElBQUksRUFBRSxVQUFTLE1BQU0sRUFBRSxRQUFRO1FBQzNCLElBQUksSUFBSSxHQUFHLElBQUksRUFDWCxVQUFVLEVBQ1YsR0FBRyxFQUNILGlCQUFpQixHQUFHO1lBQ2hCLHVCQUF1QixFQUFFLGVBQWU7WUFDeEMsZ0NBQWdDLEVBQUUsd0JBQXdCO1lBQzFELGlDQUFpQyxFQUFFLHlCQUF5QjtZQUM1RCxtQ0FBbUMsRUFBRSwyQkFBMkI7WUFDaEUsb0NBQW9DLEVBQUUsNEJBQTRCO1lBRWxFLGtCQUFrQixFQUFFLGVBQWU7WUFDbkMsMkJBQTJCLEVBQUUsd0JBQXdCO1lBQ3JELDRCQUE0QixFQUFFLHlCQUF5QjtZQUN2RCw4QkFBOEIsRUFBRSwyQkFBMkI7WUFDM0QsK0JBQStCLEVBQUUsNEJBQTRCO1lBRTdELG9CQUFvQixFQUFFLGVBQWU7WUFDckMsNEJBQTRCLEVBQUUsd0JBQXdCO1lBQ3RELDZCQUE2QixFQUFFLHlCQUF5QjtZQUN4RCwrQkFBK0IsRUFBRSwyQkFBMkI7WUFDNUQsZ0NBQWdDLEVBQUUsNEJBQTRCO1lBRTlELG1CQUFtQixFQUFFLGNBQWM7WUFDbkMsc0JBQXNCLEVBQUUsY0FBYztZQUV0QyxpQkFBaUIsRUFBRSxZQUFZO1lBQy9CLG9CQUFvQixFQUFFLFlBQVk7WUFFbEMsa0JBQWtCLEVBQUUsYUFBYTtZQUNqQyxxQkFBcUIsRUFBRSxhQUFhO1lBRXBDLHdCQUF3QixFQUFFLG1CQUFtQjtZQUM3QywyQkFBMkIsRUFBRSxtQkFBbUI7WUFFaEQsd0JBQXdCLEVBQUUsbUJBQW1CO1lBQzdDLDJCQUEyQixFQUFFLG1CQUFtQjtZQUVoRCx3QkFBd0IsRUFBRSxtQkFBbUI7WUFDN0MsMkJBQTJCLEVBQUUsbUJBQW1CO1lBRWhELG1CQUFtQixFQUFFLGNBQWM7WUFDbkMsc0JBQXNCLEVBQUUsY0FBYztZQUV0QyxxQkFBcUIsRUFBRSxhQUFhO1lBQ3BDLGlCQUFpQixFQUFFLFNBQVM7WUFFNUIsaUJBQWlCLEVBQUUsWUFBWTtZQUMvQixvQkFBb0IsRUFBRSxZQUFZO1lBRWxDLGdCQUFnQixFQUFHLFdBQVc7WUFDOUIsbUJBQW1CLEVBQUcsV0FBVztZQUNqQyxjQUFjLEVBQUcsV0FBVztZQUM1QixlQUFlLEVBQUcsV0FBVztZQUU3Qix1QkFBdUIsRUFBRyxrQkFBa0I7WUFDNUMsMEJBQTBCLEVBQUcsa0JBQWtCO1lBQy9DLHFCQUFxQixFQUFHLGtCQUFrQjtZQUMxQyxzQkFBc0IsRUFBRyxrQkFBa0I7WUFFM0MsaUJBQWlCLEVBQUcsWUFBWTtZQUNoQyxvQkFBb0IsRUFBRyxZQUFZO1NBQ3RDLENBQUM7UUFHTjtZQUNJRCxVQUFVQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNoQkEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDWkEsQ0FBQ0E7UUFHRDtZQUNJQyxJQUFJQSxJQUFJQSxFQUNKQSxDQUFDQSxFQUNEQSxHQUFHQSxFQUNIQSxNQUFNQSxFQUNOQSxNQUFNQSxFQUNOQSxhQUFhQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUV2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsVUFBVUEsQ0FBQ0EsQ0FBQUEsQ0FBQ0E7Z0JBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUFBLENBQUNBO29CQUN6QkEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFDQSxDQUFDQSxDQUFDQTtnQkFDekVBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUNBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUNBLGFBQWFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUNBLENBQUNBO2dCQUM5Q0EsTUFBTUEsR0FBR0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ2pDQSxNQUFNQSxHQUFHQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFFakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUFBLENBQUNBO29CQUNyQkEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsNkJBQTZCQSxHQUFHQSxNQUFNQSxHQUFHQSxzQkFBc0JBLEdBQUdBLE1BQU1BLEdBQUdBLElBQUlBLEVBQUVBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUM1S0EsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUVKQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFBQSxDQUFDQTt3QkFDdkRBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLHFCQUFxQkEsR0FBR0EsTUFBTUEsR0FBR0EsZ0RBQWdEQSxHQUFHQSxNQUFNQSxHQUFHQSxJQUFJQSxFQUFFQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDOUxBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUVMQSxDQUFDQTtRQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVuRCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxVQUFTLEtBQUs7WUFDekMsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFFN0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQSxDQUFDO2dCQUNuQixVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzFCLENBQUM7WUFFRCxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDbkQsQ0FBQztDQUVKLENBQUMsQ0FBQztBQU1ILE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFHWixFQUFFLEVBQUUsWUFBWTtJQUNoQixJQUFJLEVBQUUsNkJBQTZCO0lBQ25DLElBQUksRUFBRSxvREFBb0Q7SUFDMUQsUUFBUSxFQUFFLEtBQUs7SUFHZixJQUFJLEVBQUUsVUFBUyxNQUFNLEVBQUUsUUFBUTtRQUMzQixJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFHaEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsVUFBUyxLQUFLO1lBQ3pDLElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUN6QixDQUFDLEdBQUcsQ0FBQyxFQUNMLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1lBRXZCLE9BQU0sQ0FBQyxHQUFHLEdBQUcsRUFBQyxDQUFDO2dCQUNYLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUEsQ0FBQztvQkFDeEcsUUFBUSxDQUFDLE1BQU0sQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3RHLENBQUM7Z0JBQ0QsQ0FBQyxFQUFFLENBQUM7WUFDUixDQUFDO1FBRUwsQ0FBQyxDQUFDLENBQUM7SUFFUCxDQUFDO0NBRUosQ0FBQyxDQUFDO0FBRUgsQ0FBQztJQWNHLElBQUksU0FBUyxHQUFHLFVBQVMsR0FBRztRQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsVUFBUyxLQUFLO1lBQ3pDLE1BQU0sQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1osS0FBSyxJQUFJO29CQUNMLE1BQU0sQ0FBQyxRQUFRLENBQUM7Z0JBQ3BCLEtBQUssR0FBRztvQkFDSixNQUFNLENBQUMsT0FBTyxDQUFDO2dCQUNuQixLQUFLLEdBQUc7b0JBQ0osTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDbEIsS0FBSyxHQUFHO29CQUNKLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDdEIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDO0lBRUYsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUVqQixFQUFFLEVBQUUsZ0JBQWdCO1FBQ3BCLElBQUksRUFBRSx1QkFBdUI7UUFNN0IsV0FBVyxFQUFFO1lBQ1QsTUFBTSxDQUFDLHdEQUF3RCxDQUFDO1FBQ3BFLENBQUM7UUFNRCxTQUFTLEVBQUU7WUFDUCxNQUFNLENBQUMsZUFBZSxDQUFDO1FBQzNCLENBQUM7UUFRRCxTQUFTLEVBQUUsVUFBUyxRQUFRLEVBQUUsT0FBTztZQUNqQyxNQUFNLENBQUMsZUFBZSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxnRUFBZ0UsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsb0JBQW9CLENBQUM7UUFDaEssQ0FBQztRQVNELGFBQWEsRUFBRSxVQUFTLE9BQU8sRUFBRSxRQUFRO1lBQ3JDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQzNCLE1BQU0sR0FBRyxFQUFFLENBQUM7WUFTaEIsSUFBSSxjQUFjLEdBQUcsVUFBUyxJQUFJO2dCQUM5QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDN0IsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDZCxDQUFDO2dCQUNELE1BQU0sQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hELENBQUMsQ0FBQztZQUlGLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLEdBQUMsUUFBUSxHQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBVSxPQUFPO29CQUU1QyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJOzRCQUNqSCxhQUFhLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxjQUFjLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRSxNQUFNLENBQUMsQ0FBQztvQkFDMUcsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNCLENBQUM7WUFFRCxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzQixDQUFDO0tBQ0osQ0FBQyxDQUFDO0FBRVAsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVMLE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFakIsRUFBRSxFQUFFLFNBQVM7SUFDYixJQUFJLEVBQUUsNkJBQTZCO0lBTW5DLFdBQVcsRUFBRTtRQUNULE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBTUQsU0FBUyxFQUFFO1FBQ1AsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNkLENBQUM7SUFTRCxhQUFhLEVBQUUsVUFBUyxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU87UUFDOUMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFDM0IsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNoQixPQUFPLEdBQUcsT0FBTyxJQUFJLEVBQUUsQ0FBQztRQU94QixJQUFJLFVBQVUsR0FBRyxVQUFTLEdBQUc7WUFDekIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUM7UUFFRixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEdBQUcsRUFBRSxHQUFHLFFBQVEsR0FBRyxjQUFjLENBQUM7UUFDNUQsQ0FBQztRQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxVQUFTLE9BQU87WUFDM0MsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLE1BQU0sSUFBSSxRQUFRLEdBQUcsSUFBSSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBQzFGLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixNQUFNLElBQUksUUFBUSxHQUFHLElBQUksR0FBRyxPQUFPLEdBQUcsT0FBTyxDQUFDLElBQUk7b0JBQzlDLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUM7WUFDNUgsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUNsQixDQUFDO0NBQ0osQ0FBQyxDQUFDO0FBRUgsT0FBTyxDQUFDLFlBQVksQ0FBQztJQUVqQixFQUFFLEVBQUUsYUFBYTtJQUNqQixJQUFJLEVBQUUsb0JBQW9CO0lBTTFCLFdBQVcsRUFBRTtRQUNULE1BQU0sQ0FBQyxxREFBcUQsQ0FBQztJQUNqRSxDQUFDO0lBTUQsU0FBUyxFQUFFO1FBQ1AsTUFBTSxDQUFDLFlBQVksQ0FBQztJQUN4QixDQUFDO0lBU0QsYUFBYSxFQUFFLFVBQVMsT0FBTyxFQUFFLFFBQVE7UUFDckMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFDM0IsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQWNoQixJQUFJLHVCQUF1QixHQUFHLFVBQVMsR0FBRztZQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RHLENBQUMsQ0FBQztRQUVGLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsR0FBQyxRQUFRLEdBQUMsS0FBSyxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFVBQVUsT0FBTztnQkFDNUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxjQUFjLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDekwsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJO3dCQUM3RyxZQUFZLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDekksQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDM0IsQ0FBQztDQUNKLENBQUMsQ0FBQztBQUVILE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFakIsRUFBRSxFQUFFLFdBQVc7SUFDZixJQUFJLEVBQUUsa0JBQWtCO0lBTXhCLFdBQVcsRUFBRTtRQUNULE1BQU0sQ0FBQyx3REFBd0QsQ0FBQztJQUNwRSxDQUFDO0lBTUQsU0FBUyxFQUFFO1FBQ1AsTUFBTSxDQUFDLGVBQWUsQ0FBQztJQUMzQixDQUFDO0lBU0QsYUFBYSxFQUFFLFVBQVMsT0FBTyxFQUFFLFFBQVE7UUFFckMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFDM0IsTUFBTSxHQUFHLEVBQUUsRUFDWCxLQUFLLEdBQUc7WUFDSixPQUFPLEVBQUUsQ0FBQztZQUNWLFNBQVMsRUFBRSxDQUFDO1NBQ2YsQ0FBQztRQVNOLElBQUksY0FBYyxHQUFHLFVBQVMsSUFBSTtZQUM5QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDN0IsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxFQUFFLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUM7UUFhRixJQUFJLHVCQUF1QixHQUFHLFVBQVMsR0FBRztZQUV0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUUvRSxDQUFDLENBQUM7UUFFRixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFdEIsUUFBUSxDQUFDLE9BQU8sQ0FBQyxVQUFVLE9BQU87Z0JBSTlCLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEtBQUssU0FBUyxHQUFHLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO2dCQUcvRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUlsQixNQUFNLENBQUMsSUFBSSxDQUFDLDhCQUE4QixHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7b0JBQ25GLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxhQUFhLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLGNBQWMsR0FBRyxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUksT0FBTyxHQUFHLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztvQkFDak4sTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztvQkFFM0IsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFckIsQ0FBQztZQUVMLENBQUMsQ0FBQyxDQUFDO1lBRUgsTUFBTSxDQUFDLE9BQU8sQ0FBQyxnQ0FBZ0MsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLDRCQUE0QixHQUFHLEtBQUssQ0FBQyxLQUFLLEdBQUcsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLE9BQU8sR0FBRyxvQ0FBb0MsR0FBRyxRQUFRLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDN00sTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVoQyxDQUFDO1FBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFM0IsQ0FBQztDQUNKLENBQUMsQ0FBQztBQUVILE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFakIsRUFBRSxFQUFFLFVBQVU7SUFDZCxJQUFJLEVBQUUsaUJBQWlCO0lBTXZCLFdBQVcsRUFBRTtRQUNULE1BQU0sQ0FBQyxrREFBa0QsQ0FBQztJQUM5RCxDQUFDO0lBTUQsU0FBUyxFQUFFO1FBQ1AsTUFBTSxDQUFDLFNBQVMsQ0FBQztJQUNyQixDQUFDO0lBU0QsYUFBYSxFQUFFLFVBQVMsT0FBTyxFQUFFLFFBQVE7UUFDckMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsRUFDM0IsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQWNoQixJQUFJLHVCQUF1QixHQUFHLFVBQVMsR0FBRztZQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDZCxDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RHLENBQUMsQ0FBQztRQUVGLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUV0QixNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWUsR0FBQyxRQUFRLEdBQUMsS0FBSyxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFVBQVUsT0FBTztnQkFDNUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxjQUFjLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDekwsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxJQUFJLEdBQUcsWUFBWSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEdBQUcsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxJQUFJO3dCQUM3RyxZQUFZLEdBQUcsdUJBQXVCLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztnQkFDekksQ0FBQztZQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzQixDQUFDO1FBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDM0IsQ0FBQztDQUNKLENBQUMsQ0FBQztBQUVILE9BQU8sQ0FBQyxZQUFZLENBQUM7SUFFakIsRUFBRSxFQUFFLE1BQU07SUFDVixJQUFJLEVBQUUsWUFBWTtJQU1sQixXQUFXLEVBQUU7UUFDVCxNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ2QsQ0FBQztJQU1ELFNBQVMsRUFBRTtRQUNQLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBU0QsYUFBYSxFQUFFLFVBQVMsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPO1FBQzlDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLEVBQzNCLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDaEIsT0FBTyxHQUFHLE9BQU8sSUFBSSxFQUFFLENBQUM7UUFFeEIsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLEVBQUUsR0FBRyw0QkFBNEIsR0FBRyxRQUFRLEdBQUcsR0FBRyxDQUFDO1FBQzlFLENBQUM7UUFFRCxNQUFNLEdBQUcscUJBQXFCLENBQUM7UUFDL0IsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sSUFBSSxjQUFjLENBQUM7UUFDN0IsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFLLFdBQVcsQ0FBQztRQUN2RCxDQUFDO1FBQ0QsTUFBTSxJQUFJLE1BQU0sR0FBRyxRQUFRLEdBQUcsR0FBRyxDQUFDO1FBRWxDLElBQUksR0FBRyxHQUFHLFFBQVEsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQy9CLGFBQWEsR0FBRyxRQUFRLENBQUM7UUFFN0IsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUEsQ0FBQztZQUNaLEdBQUcsR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDO1lBQ1YsYUFBYSxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFFRCxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsVUFBVSxPQUFPLEVBQUUsQ0FBQztZQUMvQyxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxhQUFhLENBQUM7WUFDekMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQ2pCLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQzdDLE1BQU0sSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUNyQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsR0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxXQUFXLEdBQUcsT0FBTyxDQUFDLElBQUksR0FBRyxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQztnQkFDbkcsTUFBTSxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO2dCQUNqQyxNQUFNLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7WUFDdEMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUNsQixDQUFDO0NBQ0osQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyohXG5DU1NMaW50XG5Db3B5cmlnaHQgKGMpIDIwMTQgTmljb2xlIFN1bGxpdmFuIGFuZCBOaWNob2xhcyBDLiBaYWthcy4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgJ1NvZnR3YXJlJyksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgJ0FTIElTJywgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG5cbiovXG4vKiBCdWlsZDogdjAuMTAuMCAyMi1KdWx5LTIwMTQgMDE6MTc6NTIgKi9cbi8qIVxuUGFyc2VyLUxpYlxuQ29weXJpZ2h0IChjKSAyMDA5LTIwMTEgTmljaG9sYXMgQy4gWmFrYXMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cblxuKi9cbi8qIFZlcnNpb24gdjAuMi41LCBCdWlsZCB0aW1lOiA3LU1heS0yMDE0IDAzOjM3OjM4ICovXG52YXIgcGFyc2VybGliID0ge307XG4oZnVuY3Rpb24oKXtcblxuLyoqXG4gKiBBIGdlbmVyaWMgYmFzZSB0byBpbmhlcml0IGZyb20gZm9yIGFueSBvYmplY3RcbiAqIHRoYXQgbmVlZHMgZXZlbnQgaGFuZGxpbmcuXG4gKiBAY2xhc3MgRXZlbnRUYXJnZXRcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBFdmVudFRhcmdldCgpe1xuXG4gICAgLyoqXG4gICAgICogVGhlIGFycmF5IG9mIGxpc3RlbmVycyBmb3IgdmFyaW91cyBldmVudHMuXG4gICAgICogQHR5cGUgT2JqZWN0XG4gICAgICogQHByb3BlcnR5IF9saXN0ZW5lcnNcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMuX2xpc3RlbmVycyA9IHt9O1xufVxuXG5FdmVudFRhcmdldC5wcm90b3R5cGUgPSB7XG5cbiAgICAvL3Jlc3RvcmUgY29uc3RydWN0b3JcbiAgICBjb25zdHJ1Y3RvcjogRXZlbnRUYXJnZXQsXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbGlzdGVuZXIgZm9yIGEgZ2l2ZW4gZXZlbnQgdHlwZS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgdHlwZSBvZiBldmVudCB0byBhZGQgYSBsaXN0ZW5lciBmb3IuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgVGhlIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiB0aGUgZXZlbnQgb2NjdXJzLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQG1ldGhvZCBhZGRMaXN0ZW5lclxuICAgICAqL1xuICAgIGFkZExpc3RlbmVyOiBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcil7XG4gICAgICAgIGlmICghdGhpcy5fbGlzdGVuZXJzW3R5cGVdKXtcbiAgICAgICAgICAgIHRoaXMuX2xpc3RlbmVyc1t0eXBlXSA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fbGlzdGVuZXJzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBGaXJlcyBhbiBldmVudCBiYXNlZCBvbiB0aGUgcGFzc2VkLWluIG9iamVjdC5cbiAgICAgKiBAcGFyYW0ge09iamVjdHxTdHJpbmd9IGV2ZW50IEFuIG9iamVjdCB3aXRoIGF0IGxlYXN0IGEgJ3R5cGUnIGF0dHJpYnV0ZVxuICAgICAqICAgICAgb3IgYSBzdHJpbmcgaW5kaWNhdGluZyB0aGUgZXZlbnQgbmFtZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBtZXRob2QgZmlyZVxuICAgICAqL1xuICAgIGZpcmU6IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgaWYgKHR5cGVvZiBldmVudCA9PSBcInN0cmluZ1wiKXtcbiAgICAgICAgICAgIGV2ZW50ID0geyB0eXBlOiBldmVudCB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgZXZlbnQudGFyZ2V0ICE9IFwidW5kZWZpbmVkXCIpe1xuICAgICAgICAgICAgZXZlbnQudGFyZ2V0ID0gdGhpcztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgZXZlbnQudHlwZSA9PSBcInVuZGVmaW5lZFwiKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV2ZW50IG9iamVjdCBtaXNzaW5nICd0eXBlJyBwcm9wZXJ0eS5cIik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5fbGlzdGVuZXJzW2V2ZW50LnR5cGVdKXtcblxuICAgICAgICAgICAgLy9jcmVhdGUgYSBjb3B5IG9mIHRoZSBhcnJheSBhbmQgdXNlIHRoYXQgc28gbGlzdGVuZXJzIGNhbid0IGNoYW5lXG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzW2V2ZW50LnR5cGVdLmNvbmNhdCgpO1xuICAgICAgICAgICAgZm9yICh2YXIgaT0wLCBsZW49bGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKXtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0uY2FsbCh0aGlzLCBldmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhIGxpc3RlbmVyIGZvciBhIGdpdmVuIGV2ZW50IHR5cGUuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHR5cGUgVGhlIHR5cGUgb2YgZXZlbnQgdG8gcmVtb3ZlIGEgbGlzdGVuZXIgZnJvbS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBUaGUgZnVuY3Rpb24gdG8gcmVtb3ZlIGZyb20gdGhlIGV2ZW50LlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQG1ldGhvZCByZW1vdmVMaXN0ZW5lclxuICAgICAqL1xuICAgIHJlbW92ZUxpc3RlbmVyOiBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcil7XG4gICAgICAgIGlmICh0aGlzLl9saXN0ZW5lcnNbdHlwZV0pe1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVyc1t0eXBlXTtcbiAgICAgICAgICAgIGZvciAodmFyIGk9MCwgbGVuPWxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW47IGkrKyl7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3RlbmVyc1tpXSA9PT0gbGlzdGVuZXIpe1xuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICB9XG4gICAgfVxufTtcbi8qKlxuICogQ29udmVuaWVudCB3YXkgdG8gcmVhZCB0aHJvdWdoIHN0cmluZ3MuXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi51dGlsXG4gKiBAY2xhc3MgU3RyaW5nUmVhZGVyXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSB0ZXh0IHRvIHJlYWQuXG4gKi9cbmZ1bmN0aW9uIFN0cmluZ1JlYWRlcih0ZXh0KXtcblxuICAgIC8qKlxuICAgICAqIFRoZSBpbnB1dCB0ZXh0IHdpdGggbGluZSBlbmRpbmdzIG5vcm1hbGl6ZWQuXG4gICAgICogQHByb3BlcnR5IF9pbnB1dFxuICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5faW5wdXQgPSB0ZXh0LnJlcGxhY2UoL1xcblxccj8vZywgXCJcXG5cIik7XG5cblxuICAgIC8qKlxuICAgICAqIFRoZSByb3cgZm9yIHRoZSBjaGFyYWN0ZXIgdG8gYmUgcmVhZCBuZXh0LlxuICAgICAqIEBwcm9wZXJ0eSBfbGluZVxuICAgICAqIEB0eXBlIGludFxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5fbGluZSA9IDE7XG5cblxuICAgIC8qKlxuICAgICAqIFRoZSBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIgdG8gYmUgcmVhZCBuZXh0LlxuICAgICAqIEBwcm9wZXJ0eSBfY29sXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLl9jb2wgPSAxO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGluZGV4IG9mIHRoZSBjaGFyYWN0ZXIgaW4gdGhlIGlucHV0IHRvIGJlIHJlYWQgbmV4dC5cbiAgICAgKiBAcHJvcGVydHkgX2N1cnNvclxuICAgICAqIEB0eXBlIGludFxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5fY3Vyc29yID0gMDtcbn1cblxuU3RyaW5nUmVhZGVyLnByb3RvdHlwZSA9IHtcblxuICAgIC8vcmVzdG9yZSBjb25zdHJ1Y3RvclxuICAgIGNvbnN0cnVjdG9yOiBTdHJpbmdSZWFkZXIsXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBQb3NpdGlvbiBpbmZvXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gb2YgdGhlIGNoYXJhY3RlciB0byBiZSByZWFkIG5leHQuXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgY29sdW1uIG9mIHRoZSBjaGFyYWN0ZXIgdG8gYmUgcmVhZCBuZXh0LlxuICAgICAqIEBtZXRob2QgZ2V0Q29sXG4gICAgICovXG4gICAgZ2V0Q29sOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gdGhpcy5fY29sO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSByb3cgb2YgdGhlIGNoYXJhY3RlciB0byBiZSByZWFkIG5leHQuXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgcm93IG9mIHRoZSBjaGFyYWN0ZXIgdG8gYmUgcmVhZCBuZXh0LlxuICAgICAqIEBtZXRob2QgZ2V0TGluZVxuICAgICAqL1xuICAgIGdldExpbmU6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiB0aGlzLl9saW5lIDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB5b3UncmUgYXQgdGhlIGVuZCBvZiB0aGUgaW5wdXQuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGVyZSdzIG5vIG1vcmUgaW5wdXQsIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKiBAbWV0aG9kIGVvZlxuICAgICAqL1xuICAgIGVvZjogZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuICh0aGlzLl9jdXJzb3IgPT0gdGhpcy5faW5wdXQubGVuZ3RoKTtcbiAgICB9LFxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQmFzaWMgcmVhZGluZ1xuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogUmVhZHMgdGhlIG5leHQgY2hhcmFjdGVyIHdpdGhvdXQgYWR2YW5jaW5nIHRoZSBjdXJzb3IuXG4gICAgICogQHBhcmFtIHtpbnR9IGNvdW50IEhvdyBtYW55IGNoYXJhY3RlcnMgdG8gbG9vayBhaGVhZCAoZGVmYXVsdCBpcyAxKS5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBuZXh0IGNoYXJhY3RlciBvciBudWxsIGlmIHRoZXJlIGlzIG5vIG5leHQgY2hhcmFjdGVyLlxuICAgICAqIEBtZXRob2QgcGVla1xuICAgICAqL1xuICAgIHBlZWs6IGZ1bmN0aW9uKGNvdW50KXtcbiAgICAgICAgdmFyIGMgPSBudWxsO1xuICAgICAgICBjb3VudCA9ICh0eXBlb2YgY291bnQgPT0gXCJ1bmRlZmluZWRcIiA/IDEgOiBjb3VudCk7XG5cbiAgICAgICAgLy9pZiB3ZSdyZSBub3QgYXQgdGhlIGVuZCBvZiB0aGUgaW5wdXQuLi5cbiAgICAgICAgaWYgKHRoaXMuX2N1cnNvciA8IHRoaXMuX2lucHV0Lmxlbmd0aCl7XG5cbiAgICAgICAgICAgIC8vZ2V0IGNoYXJhY3RlciBhbmQgaW5jcmVtZW50IGN1cnNvciBhbmQgY29sdW1uXG4gICAgICAgICAgICBjID0gdGhpcy5faW5wdXQuY2hhckF0KHRoaXMuX2N1cnNvciArIGNvdW50IC0gMSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVhZHMgdGhlIG5leHQgY2hhcmFjdGVyIGZyb20gdGhlIGlucHV0IGFuZCBhZGp1c3RzIHRoZSByb3cgYW5kIGNvbHVtblxuICAgICAqIGFjY29yZGluZ2x5LlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIG5leHQgY2hhcmFjdGVyIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gbmV4dCBjaGFyYWN0ZXIuXG4gICAgICogQG1ldGhvZCByZWFkXG4gICAgICovXG4gICAgcmVhZDogZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIGMgPSBudWxsO1xuXG4gICAgICAgIC8vaWYgd2UncmUgbm90IGF0IHRoZSBlbmQgb2YgdGhlIGlucHV0Li4uXG4gICAgICAgIGlmICh0aGlzLl9jdXJzb3IgPCB0aGlzLl9pbnB1dC5sZW5ndGgpe1xuXG4gICAgICAgICAgICAvL2lmIHRoZSBsYXN0IGNoYXJhY3RlciB3YXMgYSBuZXdsaW5lLCBpbmNyZW1lbnQgcm93IGNvdW50XG4gICAgICAgICAgICAvL2FuZCByZXNldCBjb2x1bW4gY291bnRcbiAgICAgICAgICAgIGlmICh0aGlzLl9pbnB1dC5jaGFyQXQodGhpcy5fY3Vyc29yKSA9PSBcIlxcblwiKXtcbiAgICAgICAgICAgICAgICB0aGlzLl9saW5lKys7XG4gICAgICAgICAgICAgICAgdGhpcy5fY29sPTE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuX2NvbCsrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2dldCBjaGFyYWN0ZXIgYW5kIGluY3JlbWVudCBjdXJzb3IgYW5kIGNvbHVtblxuICAgICAgICAgICAgYyA9IHRoaXMuX2lucHV0LmNoYXJBdCh0aGlzLl9jdXJzb3IrKyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYztcbiAgICB9LFxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gTWlzY1xuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogU2F2ZXMgdGhlIGN1cnJlbnQgbG9jYXRpb24gc28gaXQgY2FuIGJlIHJldHVybmVkIHRvIGxhdGVyLlxuICAgICAqIEBtZXRob2QgbWFya1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbWFyazogZnVuY3Rpb24oKXtcbiAgICAgICAgdGhpcy5fYm9va21hcmsgPSB7XG4gICAgICAgICAgICBjdXJzb3I6IHRoaXMuX2N1cnNvcixcbiAgICAgICAgICAgIGxpbmU6ICAgdGhpcy5fbGluZSxcbiAgICAgICAgICAgIGNvbDogICAgdGhpcy5fY29sXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIHJlc2V0OiBmdW5jdGlvbigpe1xuICAgICAgICBpZiAodGhpcy5fYm9va21hcmspe1xuICAgICAgICAgICAgdGhpcy5fY3Vyc29yID0gdGhpcy5fYm9va21hcmsuY3Vyc29yO1xuICAgICAgICAgICAgdGhpcy5fbGluZSA9IHRoaXMuX2Jvb2ttYXJrLmxpbmU7XG4gICAgICAgICAgICB0aGlzLl9jb2wgPSB0aGlzLl9ib29rbWFyay5jb2w7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fYm9va21hcms7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQWR2YW5jZWQgcmVhZGluZ1xuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogUmVhZHMgdXAgdG8gYW5kIGluY2x1ZGluZyB0aGUgZ2l2ZW4gc3RyaW5nLiBUaHJvd3MgYW4gZXJyb3IgaWYgdGhhdFxuICAgICAqIHN0cmluZyBpcyBub3QgZm91bmQuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHBhdHRlcm4gVGhlIHN0cmluZyB0byByZWFkLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHN0cmluZyB3aGVuIGl0IGlzIGZvdW5kLlxuICAgICAqIEB0aHJvd3MgRXJyb3Igd2hlbiB0aGUgc3RyaW5nIHBhdHRlcm4gaXMgbm90IGZvdW5kLlxuICAgICAqIEBtZXRob2QgcmVhZFRvXG4gICAgICovXG4gICAgcmVhZFRvOiBmdW5jdGlvbihwYXR0ZXJuKXtcblxuICAgICAgICB2YXIgYnVmZmVyID0gXCJcIixcbiAgICAgICAgICAgIGM7XG5cbiAgICAgICAgLypcbiAgICAgICAgICogRmlyc3QsIGJ1ZmZlciBtdXN0IGJlIHRoZSBzYW1lIGxlbmd0aCBhcyB0aGUgcGF0dGVybi5cbiAgICAgICAgICogVGhlbiwgYnVmZmVyIG11c3QgZW5kIHdpdGggdGhlIHBhdHRlcm4gb3IgZWxzZSByZWFjaCB0aGVcbiAgICAgICAgICogZW5kIG9mIHRoZSBpbnB1dC5cbiAgICAgICAgICovXG4gICAgICAgIHdoaWxlIChidWZmZXIubGVuZ3RoIDwgcGF0dGVybi5sZW5ndGggfHwgYnVmZmVyLmxhc3RJbmRleE9mKHBhdHRlcm4pICE9IGJ1ZmZlci5sZW5ndGggLSBwYXR0ZXJuLmxlbmd0aCl7XG4gICAgICAgICAgICBjID0gdGhpcy5yZWFkKCk7XG4gICAgICAgICAgICBpZiAoYyl7XG4gICAgICAgICAgICAgICAgYnVmZmVyICs9IGM7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIFxcXCJcIiArIHBhdHRlcm4gKyBcIlxcXCIgYXQgbGluZSBcIiArIHRoaXMuX2xpbmUgICsgXCIsIGNvbCBcIiArIHRoaXMuX2NvbCArIFwiLlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWZmZXI7XG5cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVhZHMgY2hhcmFjdGVycyB3aGlsZSBlYWNoIGNoYXJhY3RlciBjYXVzZXMgdGhlIGdpdmVuXG4gICAgICogZmlsdGVyIGZ1bmN0aW9uIHRvIHJldHVybiB0cnVlLiBUaGUgZnVuY3Rpb24gaXMgcGFzc2VkXG4gICAgICogaW4gZWFjaCBjaGFyYWN0ZXIgYW5kIGVpdGhlciByZXR1cm5zIHRydWUgdG8gY29udGludWVcbiAgICAgKiByZWFkaW5nIG9yIGZhbHNlIHRvIHN0b3AuXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gZmlsdGVyIFRoZSBmdW5jdGlvbiB0byByZWFkIG9uIGVhY2ggY2hhcmFjdGVyLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHN0cmluZyBtYWRlIHVwIG9mIGFsbCBjaGFyYWN0ZXJzIHRoYXQgcGFzc2VkIHRoZVxuICAgICAqICAgICAgZmlsdGVyIGNoZWNrLlxuICAgICAqIEBtZXRob2QgcmVhZFdoaWxlXG4gICAgICovXG4gICAgcmVhZFdoaWxlOiBmdW5jdGlvbihmaWx0ZXIpe1xuXG4gICAgICAgIHZhciBidWZmZXIgPSBcIlwiLFxuICAgICAgICAgICAgYyA9IHRoaXMucmVhZCgpO1xuXG4gICAgICAgIHdoaWxlKGMgIT09IG51bGwgJiYgZmlsdGVyKGMpKXtcbiAgICAgICAgICAgIGJ1ZmZlciArPSBjO1xuICAgICAgICAgICAgYyA9IHRoaXMucmVhZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJ1ZmZlcjtcblxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWFkcyBjaGFyYWN0ZXJzIHRoYXQgbWF0Y2ggZWl0aGVyIHRleHQgb3IgYSByZWd1bGFyIGV4cHJlc3Npb24gYW5kXG4gICAgICogcmV0dXJucyB0aG9zZSBjaGFyYWN0ZXJzLiBJZiBhIG1hdGNoIGlzIGZvdW5kLCB0aGUgcm93IGFuZCBjb2x1bW5cbiAgICAgKiBhcmUgYWRqdXN0ZWQ7IGlmIG5vIG1hdGNoIGlzIGZvdW5kLCB0aGUgcmVhZGVyJ3Mgc3RhdGUgaXMgdW5jaGFuZ2VkLlxuICAgICAqIHJlYWRpbmcgb3IgZmFsc2UgdG8gc3RvcC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ3xSZWdFeHB9IG1hdGNodGVyIElmIGEgc3RyaW5nLCB0aGVuIHRoZSBsaXRlcmFsIHN0cmluZ1xuICAgICAqICAgICAgdmFsdWUgaXMgc2VhcmNoZWQgZm9yLiBJZiBhIHJlZ3VsYXIgZXhwcmVzc2lvbiwgdGhlbiBhbnkgc3RyaW5nXG4gICAgICogICAgICBtYXRjaGluZyB0aGUgcGF0dGVybiBpcyBzZWFyY2ggZm9yLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHN0cmluZyBtYWRlIHVwIG9mIGFsbCBjaGFyYWN0ZXJzIHRoYXQgbWF0Y2hlZCBvclxuICAgICAqICAgICAgbnVsbCBpZiB0aGVyZSB3YXMgbm8gbWF0Y2guXG4gICAgICogQG1ldGhvZCByZWFkTWF0Y2hcbiAgICAgKi9cbiAgICByZWFkTWF0Y2g6IGZ1bmN0aW9uKG1hdGNoZXIpe1xuXG4gICAgICAgIHZhciBzb3VyY2UgPSB0aGlzLl9pbnB1dC5zdWJzdHJpbmcodGhpcy5fY3Vyc29yKSxcbiAgICAgICAgICAgIHZhbHVlID0gbnVsbDtcblxuICAgICAgICAvL2lmIGl0J3MgYSBzdHJpbmcsIGp1c3QgZG8gYSBzdHJhaWdodCBtYXRjaFxuICAgICAgICBpZiAodHlwZW9mIG1hdGNoZXIgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICBpZiAoc291cmNlLmluZGV4T2YobWF0Y2hlcikgPT09IDApe1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy5yZWFkQ291bnQobWF0Y2hlci5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSZWdFeHApe1xuICAgICAgICAgICAgaWYgKG1hdGNoZXIudGVzdChzb3VyY2UpKXtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMucmVhZENvdW50KFJlZ0V4cC5sYXN0TWF0Y2gubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9LFxuXG5cbiAgICAvKipcbiAgICAgKiBSZWFkcyBhIGdpdmVuIG51bWJlciBvZiBjaGFyYWN0ZXJzLiBJZiB0aGUgZW5kIG9mIHRoZSBpbnB1dCBpcyByZWFjaGVkLFxuICAgICAqIGl0IHJlYWRzIG9ubHkgdGhlIHJlbWFpbmluZyBjaGFyYWN0ZXJzIGFuZCBkb2VzIG5vdCB0aHJvdyBhbiBlcnJvci5cbiAgICAgKiBAcGFyYW0ge2ludH0gY291bnQgVGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIHRvIHJlYWQuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgc3RyaW5nIG1hZGUgdXAgdGhlIHJlYWQgY2hhcmFjdGVycy5cbiAgICAgKiBAbWV0aG9kIHJlYWRDb3VudFxuICAgICAqL1xuICAgIHJlYWRDb3VudDogZnVuY3Rpb24oY291bnQpe1xuICAgICAgICB2YXIgYnVmZmVyID0gXCJcIjtcblxuICAgICAgICB3aGlsZShjb3VudC0tKXtcbiAgICAgICAgICAgIGJ1ZmZlciArPSB0aGlzLnJlYWQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBidWZmZXI7XG4gICAgfVxuXG59O1xuLyoqXG4gKiBUeXBlIHRvIHVzZSB3aGVuIGEgc3ludGF4IGVycm9yIG9jY3Vycy5cbiAqIEBjbGFzcyBTeW50YXhFcnJvclxuICogQG5hbWVzcGFjZSBwYXJzZXJsaWIudXRpbFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgZXJyb3IgbWVzc2FnZS5cbiAqIEBwYXJhbSB7aW50fSBsaW5lIFRoZSBsaW5lIGF0IHdoaWNoIHRoZSBlcnJvciBvY2N1cnJlZC5cbiAqIEBwYXJhbSB7aW50fSBjb2wgVGhlIGNvbHVtbiBhdCB3aGljaCB0aGUgZXJyb3Igb2NjdXJyZWQuXG4gKi9cbmZ1bmN0aW9uIFN5bnRheEVycm9yKG1lc3NhZ2UsIGxpbmUsIGNvbCl7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY29sdW1uIGF0IHdoaWNoIHRoZSBlcnJvciBvY2N1cnJlZC5cbiAgICAgKiBAdHlwZSBpbnRcbiAgICAgKiBAcHJvcGVydHkgY29sXG4gICAgICovXG4gICAgdGhpcy5jb2wgPSBjb2w7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbGluZSBhdCB3aGljaCB0aGUgZXJyb3Igb2NjdXJyZWQuXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByb3BlcnR5IGxpbmVcbiAgICAgKi9cbiAgICB0aGlzLmxpbmUgPSBsaW5lO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICogQHByb3BlcnR5IHRleHRcbiAgICAgKi9cbiAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXG59XG5cbi8vaW5oZXJpdCBmcm9tIEVycm9yXG5TeW50YXhFcnJvci5wcm90b3R5cGUgPSBuZXcgRXJyb3IoKTtcbi8qKlxuICogQmFzZSB0eXBlIHRvIHJlcHJlc2VudCBhIHNpbmdsZSBzeW50YWN0aWMgdW5pdC5cbiAqIEBjbGFzcyBTeW50YXhVbml0XG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi51dGlsXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSB0ZXh0IG9mIHRoZSB1bml0LlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqL1xuZnVuY3Rpb24gU3ludGF4VW5pdCh0ZXh0LCBsaW5lLCBjb2wsIHR5cGUpe1xuXG5cbiAgICAvKipcbiAgICAgKiBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAgICAgKiBAdHlwZSBpbnRcbiAgICAgKiBAcHJvcGVydHkgY29sXG4gICAgICovXG4gICAgdGhpcy5jb2wgPSBjb2w7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbGluZSBvZiB0ZXh0IG9uIHdoaWNoIHRoZSB1bml0IHJlc2lkZXMuXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByb3BlcnR5IGxpbmVcbiAgICAgKi9cbiAgICB0aGlzLmxpbmUgPSBsaW5lO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICogQHByb3BlcnR5IHRleHRcbiAgICAgKi9cbiAgICB0aGlzLnRleHQgPSB0ZXh0O1xuXG4gICAgLyoqXG4gICAgICogVGhlIHR5cGUgb2Ygc3ludGF4IHVuaXQuXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByb3BlcnR5IHR5cGVcbiAgICAgKi9cbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyBzeW50YXggdW5pdCBiYXNlZCBzb2xlbHkgb24gdGhlIGdpdmVuIHRva2VuLlxuICogQ29udmVuaWVuY2UgbWV0aG9kIGZvciBjcmVhdGluZyBhIG5ldyBzeW50YXggdW5pdCB3aGVuXG4gKiBpdCByZXByZXNlbnRzIGEgc2luZ2xlIHRva2VuIGluc3RlYWQgb2YgbXVsdGlwbGUuXG4gKiBAcGFyYW0ge09iamVjdH0gdG9rZW4gVGhlIHRva2VuIG9iamVjdCB0byByZXByZXNlbnQuXG4gKiBAcmV0dXJuIHtwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0fSBUaGUgb2JqZWN0IHJlcHJlc2VudGluZyB0aGUgdG9rZW4uXG4gKiBAc3RhdGljXG4gKiBAbWV0aG9kIGZyb21Ub2tlblxuICovXG5TeW50YXhVbml0LmZyb21Ub2tlbiA9IGZ1bmN0aW9uKHRva2VuKXtcbiAgICByZXR1cm4gbmV3IFN5bnRheFVuaXQodG9rZW4udmFsdWUsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xufTtcblxuU3ludGF4VW5pdC5wcm90b3R5cGUgPSB7XG5cbiAgICAvL3Jlc3RvcmUgY29uc3RydWN0b3JcbiAgICBjb25zdHJ1Y3RvcjogU3ludGF4VW5pdCxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgdGV4dCByZXByZXNlbnRhdGlvbiBvZiB0aGUgdW5pdC5cbiAgICAgKiBAbWV0aG9kIHZhbHVlT2ZcbiAgICAgKi9cbiAgICB2YWx1ZU9mOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gdGhpcy50ZXh0O1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB0ZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSB1bml0LlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICAqL1xuICAgIHRvU3RyaW5nOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gdGhpcy50ZXh0O1xuICAgIH1cblxufTtcbi8qZ2xvYmFsIFN0cmluZ1JlYWRlciwgU3ludGF4RXJyb3IqL1xuXG4vKipcbiAqIEdlbmVyaWMgVG9rZW5TdHJlYW0gcHJvdmlkaW5nIGJhc2UgZnVuY3Rpb25hbGl0eS5cbiAqIEBjbGFzcyBUb2tlblN0cmVhbUJhc2VcbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLnV0aWxcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtTdHJpbmd8U3RyaW5nUmVhZGVyfSBpbnB1dCBUaGUgdGV4dCB0byB0b2tlbml6ZSBvciBhIHJlYWRlciBmcm9tXG4gKiAgICAgIHdoaWNoIHRvIHJlYWQgdGhlIGlucHV0LlxuICovXG5mdW5jdGlvbiBUb2tlblN0cmVhbUJhc2UoaW5wdXQsIHRva2VuRGF0YSl7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgc3RyaW5nIHJlYWRlciBmb3IgZWFzeSBhY2Nlc3MgdG8gdGhlIHRleHQuXG4gICAgICogQHR5cGUgU3RyaW5nUmVhZGVyXG4gICAgICogQHByb3BlcnR5IF9yZWFkZXJcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMuX3JlYWRlciA9IGlucHV0ID8gbmV3IFN0cmluZ1JlYWRlcihpbnB1dC50b1N0cmluZygpKSA6IG51bGw7XG5cbiAgICAvKipcbiAgICAgKiBUb2tlbiBvYmplY3QgZm9yIHRoZSBsYXN0IGNvbnN1bWVkIHRva2VuLlxuICAgICAqIEB0eXBlIFRva2VuXG4gICAgICogQHByb3BlcnR5IF90b2tlblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5fdG9rZW4gPSBudWxsO1xuXG4gICAgLyoqXG4gICAgICogVGhlIGFycmF5IG9mIHRva2VuIGluZm9ybWF0aW9uLlxuICAgICAqIEB0eXBlIEFycmF5XG4gICAgICogQHByb3BlcnR5IF90b2tlbkRhdGFcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMuX3Rva2VuRGF0YSA9IHRva2VuRGF0YTtcblxuICAgIC8qKlxuICAgICAqIExvb2thaGVhZCB0b2tlbiBidWZmZXIuXG4gICAgICogQHR5cGUgQXJyYXlcbiAgICAgKiBAcHJvcGVydHkgX2x0XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLl9sdCA9IFtdO1xuXG4gICAgLyoqXG4gICAgICogTG9va2FoZWFkIHRva2VuIGJ1ZmZlciBpbmRleC5cbiAgICAgKiBAdHlwZSBpbnRcbiAgICAgKiBAcHJvcGVydHkgX2x0SW5kZXhcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMuX2x0SW5kZXggPSAwO1xuXG4gICAgdGhpcy5fbHRJbmRleENhY2hlID0gW107XG59XG5cbi8qKlxuICogQWNjZXB0cyBhbiBhcnJheSBvZiB0b2tlbiBpbmZvcm1hdGlvbiBhbmQgb3V0cHV0c1xuICogYW4gYXJyYXkgb2YgdG9rZW4gZGF0YSBjb250YWluaW5nIGtleS12YWx1ZSBtYXBwaW5nc1xuICogYW5kIG1hdGNoaW5nIGZ1bmN0aW9ucyB0aGF0IHRoZSBUb2tlblN0cmVhbSBuZWVkcy5cbiAqIEBwYXJhbSB7QXJyYXl9IHRva2VucyBBbiBhcnJheSBvZiB0b2tlbiBkZXNjcmlwdG9ycy5cbiAqIEByZXR1cm4ge0FycmF5fSBBbiBhcnJheSBvZiBwcm9jZXNzZWQgdG9rZW4gZGF0YS5cbiAqIEBtZXRob2QgY3JlYXRlVG9rZW5EYXRhXG4gKiBAc3RhdGljXG4gKi9cblRva2VuU3RyZWFtQmFzZS5jcmVhdGVUb2tlbkRhdGEgPSBmdW5jdGlvbih0b2tlbnMpe1xuXG4gICAgdmFyIG5hbWVNYXAgICAgID0gW10sXG4gICAgICAgIHR5cGVNYXAgICAgID0ge30sXG4gICAgICAgIHRva2VuRGF0YSAgICAgPSB0b2tlbnMuY29uY2F0KFtdKSxcbiAgICAgICAgaSAgICAgICAgICAgID0gMCxcbiAgICAgICAgbGVuICAgICAgICAgICAgPSB0b2tlbkRhdGEubGVuZ3RoKzE7XG5cbiAgICB0b2tlbkRhdGEuVU5LTk9XTiA9IC0xO1xuICAgIHRva2VuRGF0YS51bnNoaWZ0KHtuYW1lOlwiRU9GXCJ9KTtcblxuICAgIGZvciAoOyBpIDwgbGVuOyBpKyspe1xuICAgICAgICBuYW1lTWFwLnB1c2godG9rZW5EYXRhW2ldLm5hbWUpO1xuICAgICAgICB0b2tlbkRhdGFbdG9rZW5EYXRhW2ldLm5hbWVdID0gaTtcbiAgICAgICAgaWYgKHRva2VuRGF0YVtpXS50ZXh0KXtcbiAgICAgICAgICAgIHR5cGVNYXBbdG9rZW5EYXRhW2ldLnRleHRdID0gaTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRva2VuRGF0YS5uYW1lID0gZnVuY3Rpb24odHQpe1xuICAgICAgICByZXR1cm4gbmFtZU1hcFt0dF07XG4gICAgfTtcblxuICAgIHRva2VuRGF0YS50eXBlID0gZnVuY3Rpb24oYyl7XG4gICAgICAgIHJldHVybiB0eXBlTWFwW2NdO1xuICAgIH07XG5cbiAgICByZXR1cm4gdG9rZW5EYXRhO1xufTtcblxuVG9rZW5TdHJlYW1CYXNlLnByb3RvdHlwZSA9IHtcblxuICAgIC8vcmVzdG9yZSBjb25zdHJ1Y3RvclxuICAgIGNvbnN0cnVjdG9yOiBUb2tlblN0cmVhbUJhc2UsXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBNYXRjaGluZyBtZXRob2RzXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBuZXh0IHRva2VuIG1hdGNoZXMgdGhlIGdpdmVuIHRva2VuIHR5cGUuXG4gICAgICogSWYgc28sIHRoYXQgdG9rZW4gaXMgY29uc3VtZWQ7IGlmIG5vdCwgdGhlIHRva2VuIGlzIHBsYWNlZFxuICAgICAqIGJhY2sgb250byB0aGUgdG9rZW4gc3RyZWFtLiBZb3UgY2FuIHBhc3MgaW4gYW55IG51bWJlciBvZlxuICAgICAqIHRva2VuIHR5cGVzIGFuZCB0aGlzIHdpbGwgcmV0dXJuIHRydWUgaWYgYW55IG9mIHRoZSB0b2tlblxuICAgICAqIHR5cGVzIGlzIGZvdW5kLlxuICAgICAqIEBwYXJhbSB7aW50fGludFtdfSB0b2tlblR5cGVzIEVpdGhlciBhIHNpbmdsZSB0b2tlbiB0eXBlIG9yIGFuIGFycmF5IG9mXG4gICAgICogICAgICB0b2tlbiB0eXBlcyB0aGF0IHRoZSBuZXh0IHRva2VuIG1pZ2h0IGJlLiBJZiBhbiBhcnJheSBpcyBwYXNzZWQsXG4gICAgICogICAgICBpdCdzIGFzc3VtZWQgdGhhdCB0aGUgdG9rZW4gY2FuIGJlIGFueSBvZiB0aGVzZS5cbiAgICAgKiBAcGFyYW0ge3ZhcmlhbnR9IGNoYW5uZWwgKE9wdGlvbmFsKSBUaGUgY2hhbm5lbCB0byByZWFkIGZyb20uIElmIG5vdFxuICAgICAqICAgICAgcHJvdmlkZWQsIHJlYWRzIGZyb20gdGhlIGRlZmF1bHQgKHVubmFtZWQpIGNoYW5uZWwuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgdG9rZW4gdHlwZSBtYXRjaGVzLCBmYWxzZSBpZiBub3QuXG4gICAgICogQG1ldGhvZCBtYXRjaFxuICAgICAqL1xuICAgIG1hdGNoOiBmdW5jdGlvbih0b2tlblR5cGVzLCBjaGFubmVsKXtcblxuICAgICAgICAvL2Fsd2F5cyBjb252ZXJ0IHRvIGFuIGFycmF5LCBtYWtlcyB0aGluZ3MgZWFzaWVyXG4gICAgICAgIGlmICghKHRva2VuVHlwZXMgaW5zdGFuY2VvZiBBcnJheSkpe1xuICAgICAgICAgICAgdG9rZW5UeXBlcyA9IFt0b2tlblR5cGVzXTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0dCAgPSB0aGlzLmdldChjaGFubmVsKSxcbiAgICAgICAgICAgIGkgICA9IDAsXG4gICAgICAgICAgICBsZW4gPSB0b2tlblR5cGVzLmxlbmd0aDtcblxuICAgICAgICB3aGlsZShpIDwgbGVuKXtcbiAgICAgICAgICAgIGlmICh0dCA9PSB0b2tlblR5cGVzW2krK10pe1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy9ubyBtYXRjaCBmb3VuZCwgcHV0IHRoZSB0b2tlbiBiYWNrXG4gICAgICAgIHRoaXMudW5nZXQoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBuZXh0IHRva2VuIG1hdGNoZXMgdGhlIGdpdmVuIHRva2VuIHR5cGUuXG4gICAgICogSWYgc28sIHRoYXQgdG9rZW4gaXMgY29uc3VtZWQ7IGlmIG5vdCwgYW4gZXJyb3IgaXMgdGhyb3duLlxuICAgICAqIEBwYXJhbSB7aW50fGludFtdfSB0b2tlblR5cGVzIEVpdGhlciBhIHNpbmdsZSB0b2tlbiB0eXBlIG9yIGFuIGFycmF5IG9mXG4gICAgICogICAgICB0b2tlbiB0eXBlcyB0aGF0IHRoZSBuZXh0IHRva2VuIHNob3VsZCBiZS4gSWYgYW4gYXJyYXkgaXMgcGFzc2VkLFxuICAgICAqICAgICAgaXQncyBhc3N1bWVkIHRoYXQgdGhlIHRva2VuIG11c3QgYmUgb25lIG9mIHRoZXNlLlxuICAgICAqIEBwYXJhbSB7dmFyaWFudH0gY2hhbm5lbCAoT3B0aW9uYWwpIFRoZSBjaGFubmVsIHRvIHJlYWQgZnJvbS4gSWYgbm90XG4gICAgICogICAgICBwcm92aWRlZCwgcmVhZHMgZnJvbSB0aGUgZGVmYXVsdCAodW5uYW1lZCkgY2hhbm5lbC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBtZXRob2QgbXVzdE1hdGNoXG4gICAgICovXG4gICAgbXVzdE1hdGNoOiBmdW5jdGlvbih0b2tlblR5cGVzLCBjaGFubmVsKXtcblxuICAgICAgICB2YXIgdG9rZW47XG5cbiAgICAgICAgLy9hbHdheXMgY29udmVydCB0byBhbiBhcnJheSwgbWFrZXMgdGhpbmdzIGVhc2llclxuICAgICAgICBpZiAoISh0b2tlblR5cGVzIGluc3RhbmNlb2YgQXJyYXkpKXtcbiAgICAgICAgICAgIHRva2VuVHlwZXMgPSBbdG9rZW5UeXBlc107XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMubWF0Y2guYXBwbHkodGhpcywgYXJndW1lbnRzKSl7XG4gICAgICAgICAgICB0b2tlbiA9IHRoaXMuTFQoMSk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoXCJFeHBlY3RlZCBcIiArIHRoaXMuX3Rva2VuRGF0YVt0b2tlblR5cGVzWzBdXS5uYW1lICtcbiAgICAgICAgICAgICAgICBcIiBhdCBsaW5lIFwiICsgdG9rZW4uc3RhcnRMaW5lICsgXCIsIGNvbCBcIiArIHRva2VuLnN0YXJ0Q29sICsgXCIuXCIsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIENvbnN1bWluZyBtZXRob2RzXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBLZWVwcyByZWFkaW5nIGZyb20gdGhlIHRva2VuIHN0cmVhbSB1bnRpbCBlaXRoZXIgb25lIG9mIHRoZSBzcGVjaWZpZWRcbiAgICAgKiB0b2tlbiB0eXBlcyBpcyBmb3VuZCBvciB1bnRpbCB0aGUgZW5kIG9mIHRoZSBpbnB1dCBpcyByZWFjaGVkLlxuICAgICAqIEBwYXJhbSB7aW50fGludFtdfSB0b2tlblR5cGVzIEVpdGhlciBhIHNpbmdsZSB0b2tlbiB0eXBlIG9yIGFuIGFycmF5IG9mXG4gICAgICogICAgICB0b2tlbiB0eXBlcyB0aGF0IHRoZSBuZXh0IHRva2VuIHNob3VsZCBiZS4gSWYgYW4gYXJyYXkgaXMgcGFzc2VkLFxuICAgICAqICAgICAgaXQncyBhc3N1bWVkIHRoYXQgdGhlIHRva2VuIG11c3QgYmUgb25lIG9mIHRoZXNlLlxuICAgICAqIEBwYXJhbSB7dmFyaWFudH0gY2hhbm5lbCAoT3B0aW9uYWwpIFRoZSBjaGFubmVsIHRvIHJlYWQgZnJvbS4gSWYgbm90XG4gICAgICogICAgICBwcm92aWRlZCwgcmVhZHMgZnJvbSB0aGUgZGVmYXVsdCAodW5uYW1lZCkgY2hhbm5lbC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBtZXRob2QgYWR2YW5jZVxuICAgICAqL1xuICAgIGFkdmFuY2U6IGZ1bmN0aW9uKHRva2VuVHlwZXMsIGNoYW5uZWwpe1xuXG4gICAgICAgIHdoaWxlKHRoaXMuTEEoMCkgIT09IDAgJiYgIXRoaXMubWF0Y2godG9rZW5UeXBlcywgY2hhbm5lbCkpe1xuICAgICAgICAgICAgdGhpcy5nZXQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLkxBKDApO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb25zdW1lcyB0aGUgbmV4dCB0b2tlbiBmcm9tIHRoZSB0b2tlbiBzdHJlYW0uXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgdG9rZW4gdHlwZSBvZiB0aGUgdG9rZW4gdGhhdCB3YXMganVzdCBjb25zdW1lZC5cbiAgICAgKiBAbWV0aG9kIGdldFxuICAgICAqL1xuICAgIGdldDogZnVuY3Rpb24oY2hhbm5lbCl7XG5cbiAgICAgICAgdmFyIHRva2VuSW5mbyAgID0gdGhpcy5fdG9rZW5EYXRhLFxuICAgICAgICAgICAgcmVhZGVyICAgICAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgIGkgICAgICAgICAgID0wLFxuICAgICAgICAgICAgbGVuICAgICAgICAgPSB0b2tlbkluZm8ubGVuZ3RoLFxuICAgICAgICAgICAgZm91bmQgICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHRva2VuLFxuICAgICAgICAgICAgaW5mbztcblxuICAgICAgICAvL2NoZWNrIHRoZSBsb29rYWhlYWQgYnVmZmVyIGZpcnN0XG4gICAgICAgIGlmICh0aGlzLl9sdC5sZW5ndGggJiYgdGhpcy5fbHRJbmRleCA+PSAwICYmIHRoaXMuX2x0SW5kZXggPCB0aGlzLl9sdC5sZW5ndGgpe1xuXG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgICB0aGlzLl90b2tlbiA9IHRoaXMuX2x0W3RoaXMuX2x0SW5kZXgrK107XG4gICAgICAgICAgICBpbmZvID0gdG9rZW5JbmZvW3RoaXMuX3Rva2VuLnR5cGVdO1xuXG4gICAgICAgICAgICAvL29iZXkgY2hhbm5lbHMgbG9naWNcbiAgICAgICAgICAgIHdoaWxlKChpbmZvLmNoYW5uZWwgIT09IHVuZGVmaW5lZCAmJiBjaGFubmVsICE9PSBpbmZvLmNoYW5uZWwpICYmXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2x0SW5kZXggPCB0aGlzLl9sdC5sZW5ndGgpe1xuICAgICAgICAgICAgICAgIHRoaXMuX3Rva2VuID0gdGhpcy5fbHRbdGhpcy5fbHRJbmRleCsrXTtcbiAgICAgICAgICAgICAgICBpbmZvID0gdG9rZW5JbmZvW3RoaXMuX3Rva2VuLnR5cGVdO1xuICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9oZXJlIGJlIGRyYWdvbnNcbiAgICAgICAgICAgIGlmICgoaW5mby5jaGFubmVsID09PSB1bmRlZmluZWQgfHwgY2hhbm5lbCA9PT0gaW5mby5jaGFubmVsKSAmJlxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9sdEluZGV4IDw9IHRoaXMuX2x0Lmxlbmd0aCl7XG4gICAgICAgICAgICAgICAgdGhpcy5fbHRJbmRleENhY2hlLnB1c2goaSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuLnR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL2NhbGwgdG9rZW4gcmV0cmlldmVyIG1ldGhvZFxuICAgICAgICB0b2tlbiA9IHRoaXMuX2dldFRva2VuKCk7XG5cbiAgICAgICAgLy9pZiBpdCBzaG91bGQgYmUgaGlkZGVuLCBkb24ndCBzYXZlIGEgdG9rZW5cbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPiAtMSAmJiAhdG9rZW5JbmZvW3Rva2VuLnR5cGVdLmhpZGUpe1xuXG4gICAgICAgICAgICAvL2FwcGx5IHRva2VuIGNoYW5uZWxcbiAgICAgICAgICAgIHRva2VuLmNoYW5uZWwgPSB0b2tlbkluZm9bdG9rZW4udHlwZV0uY2hhbm5lbDtcblxuICAgICAgICAgICAgLy9zYXZlIGZvciBsYXRlclxuICAgICAgICAgICAgdGhpcy5fdG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgIHRoaXMuX2x0LnB1c2godG9rZW4pO1xuXG4gICAgICAgICAgICAvL3NhdmUgc3BhY2UgdGhhdCB3aWxsIGJlIG1vdmVkIChtdXN0IGJlIGRvbmUgYmVmb3JlIGFycmF5IGlzIHRydW5jYXRlZClcbiAgICAgICAgICAgIHRoaXMuX2x0SW5kZXhDYWNoZS5wdXNoKHRoaXMuX2x0Lmxlbmd0aCAtIHRoaXMuX2x0SW5kZXggKyBpKTtcblxuICAgICAgICAgICAgLy9rZWVwIHRoZSBidWZmZXIgdW5kZXIgNSBpdGVtc1xuICAgICAgICAgICAgaWYgKHRoaXMuX2x0Lmxlbmd0aCA+IDUpe1xuICAgICAgICAgICAgICAgIHRoaXMuX2x0LnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vYWxzbyBrZWVwIHRoZSBzaGlmdCBidWZmZXIgdW5kZXIgNSBpdGVtc1xuICAgICAgICAgICAgaWYgKHRoaXMuX2x0SW5kZXhDYWNoZS5sZW5ndGggPiA1KXtcbiAgICAgICAgICAgICAgICB0aGlzLl9sdEluZGV4Q2FjaGUuc2hpZnQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy91cGRhdGUgbG9va2FoZWFkIGluZGV4XG4gICAgICAgICAgICB0aGlzLl9sdEluZGV4ID0gdGhpcy5fbHQubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgLypcbiAgICAgICAgICogU2tpcCB0byB0aGUgbmV4dCB0b2tlbiBpZjpcbiAgICAgICAgICogMS4gVGhlIHRva2VuIHR5cGUgaXMgbWFya2VkIGFzIGhpZGRlbi5cbiAgICAgICAgICogMi4gVGhlIHRva2VuIHR5cGUgaGFzIGEgY2hhbm5lbCBzcGVjaWZpZWQgYW5kIGl0IGlzbid0IHRoZSBjdXJyZW50IGNoYW5uZWwuXG4gICAgICAgICAqL1xuICAgICAgICBpbmZvID0gdG9rZW5JbmZvW3Rva2VuLnR5cGVdO1xuICAgICAgICBpZiAoaW5mbyAmJlxuICAgICAgICAgICAgICAgIChpbmZvLmhpZGUgfHxcbiAgICAgICAgICAgICAgICAoaW5mby5jaGFubmVsICE9PSB1bmRlZmluZWQgJiYgY2hhbm5lbCAhPT0gaW5mby5jaGFubmVsKSkpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0KGNoYW5uZWwpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9yZXR1cm4ganVzdCB0aGUgdHlwZVxuICAgICAgICAgICAgcmV0dXJuIHRva2VuLnR5cGU7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTG9va3MgYWhlYWQgYSBjZXJ0YWluIG51bWJlciBvZiB0b2tlbnMgYW5kIHJldHVybnMgdGhlIHRva2VuIHR5cGUgYXRcbiAgICAgKiB0aGF0IHBvc2l0aW9uLiBUaGlzIHdpbGwgdGhyb3cgYW4gZXJyb3IgaWYgeW91IGxvb2thaGVhZCBwYXN0IHRoZVxuICAgICAqIGVuZCBvZiBpbnB1dCwgcGFzdCB0aGUgc2l6ZSBvZiB0aGUgbG9va2FoZWFkIGJ1ZmZlciwgb3IgYmFjayBwYXN0XG4gICAgICogdGhlIGZpcnN0IHRva2VuIGluIHRoZSBsb29rYWhlYWQgYnVmZmVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBUaGUgaW5kZXggb2YgdGhlIHRva2VuIHR5cGUgdG8gcmV0cmlldmUuIDAgZm9yIHRoZVxuICAgICAqICAgICAgY3VycmVudCB0b2tlbiwgMSBmb3IgdGhlIG5leHQsIC0xIGZvciB0aGUgcHJldmlvdXMsIGV0Yy5cbiAgICAgKiBAcmV0dXJuIHtpbnR9IFRoZSB0b2tlbiB0eXBlIG9mIHRoZSB0b2tlbiBpbiB0aGUgZ2l2ZW4gcG9zaXRpb24uXG4gICAgICogQG1ldGhvZCBMQVxuICAgICAqL1xuICAgIExBOiBmdW5jdGlvbihpbmRleCl7XG4gICAgICAgIHZhciB0b3RhbCA9IGluZGV4LFxuICAgICAgICAgICAgdHQ7XG4gICAgICAgIGlmIChpbmRleCA+IDApe1xuICAgICAgICAgICAgLy9UT0RPOiBTdG9yZSA1IHNvbWV3aGVyZVxuICAgICAgICAgICAgaWYgKGluZGV4ID4gNSl7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVG9vIG11Y2ggbG9va2FoZWFkLlwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9nZXQgYWxsIHRob3NlIHRva2Vuc1xuICAgICAgICAgICAgd2hpbGUodG90YWwpe1xuICAgICAgICAgICAgICAgIHR0ID0gdGhpcy5nZXQoKTtcbiAgICAgICAgICAgICAgICB0b3RhbC0tO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3VuZ2V0IGFsbCB0aG9zZSB0b2tlbnNcbiAgICAgICAgICAgIHdoaWxlKHRvdGFsIDwgaW5kZXgpe1xuICAgICAgICAgICAgICAgIHRoaXMudW5nZXQoKTtcbiAgICAgICAgICAgICAgICB0b3RhbCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGluZGV4IDwgMCl7XG5cbiAgICAgICAgICAgIGlmKHRoaXMuX2x0W3RoaXMuX2x0SW5kZXgraW5kZXhdKXtcbiAgICAgICAgICAgICAgICB0dCA9IHRoaXMuX2x0W3RoaXMuX2x0SW5kZXgraW5kZXhdLnR5cGU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvbyBtdWNoIGxvb2tiZWhpbmQuXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0dCA9IHRoaXMuX3Rva2VuLnR5cGU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdHQ7XG5cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTG9va3MgYWhlYWQgYSBjZXJ0YWluIG51bWJlciBvZiB0b2tlbnMgYW5kIHJldHVybnMgdGhlIHRva2VuIGF0XG4gICAgICogdGhhdCBwb3NpdGlvbi4gVGhpcyB3aWxsIHRocm93IGFuIGVycm9yIGlmIHlvdSBsb29rYWhlYWQgcGFzdCB0aGVcbiAgICAgKiBlbmQgb2YgaW5wdXQsIHBhc3QgdGhlIHNpemUgb2YgdGhlIGxvb2thaGVhZCBidWZmZXIsIG9yIGJhY2sgcGFzdFxuICAgICAqIHRoZSBmaXJzdCB0b2tlbiBpbiB0aGUgbG9va2FoZWFkIGJ1ZmZlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gVGhlIGluZGV4IG9mIHRoZSB0b2tlbiB0eXBlIHRvIHJldHJpZXZlLiAwIGZvciB0aGVcbiAgICAgKiAgICAgIGN1cnJlbnQgdG9rZW4sIDEgZm9yIHRoZSBuZXh0LCAtMSBmb3IgdGhlIHByZXZpb3VzLCBldGMuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgdG9rZW4gb2YgdGhlIHRva2VuIGluIHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBAbWV0aG9kIExBXG4gICAgICovXG4gICAgTFQ6IGZ1bmN0aW9uKGluZGV4KXtcblxuICAgICAgICAvL2xvb2thaGVhZCBmaXJzdCB0byBwcmltZSB0aGUgdG9rZW4gYnVmZmVyXG4gICAgICAgIHRoaXMuTEEoaW5kZXgpO1xuXG4gICAgICAgIC8vbm93IGZpbmQgdGhlIHRva2VuLCBzdWJ0cmFjdCBvbmUgYmVjYXVzZSBfbHRJbmRleCBpcyBhbHJlYWR5IGF0IHRoZSBuZXh0IGluZGV4XG4gICAgICAgIHJldHVybiB0aGlzLl9sdFt0aGlzLl9sdEluZGV4K2luZGV4LTFdO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB0b2tlbiB0eXBlIGZvciB0aGUgbmV4dCB0b2tlbiBpbiB0aGUgc3RyZWFtIHdpdGhvdXRcbiAgICAgKiBjb25zdW1pbmcgaXQuXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgdG9rZW4gdHlwZSBvZiB0aGUgbmV4dCB0b2tlbiBpbiB0aGUgc3RyZWFtLlxuICAgICAqIEBtZXRob2QgcGVla1xuICAgICAqL1xuICAgIHBlZWs6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiB0aGlzLkxBKDEpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBhY3R1YWwgdG9rZW4gb2JqZWN0IGZvciB0aGUgbGFzdCBjb25zdW1lZCB0b2tlbi5cbiAgICAgKiBAcmV0dXJuIHtUb2tlbn0gVGhlIHRva2VuIG9iamVjdCBmb3IgdGhlIGxhc3QgY29uc3VtZWQgdG9rZW4uXG4gICAgICogQG1ldGhvZCB0b2tlblxuICAgICAqL1xuICAgIHRva2VuOiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gdGhpcy5fdG9rZW47XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG5hbWUgb2YgdGhlIHRva2VuIGZvciB0aGUgZ2l2ZW4gdG9rZW4gdHlwZS5cbiAgICAgKiBAcGFyYW0ge2ludH0gdG9rZW5UeXBlIFRoZSB0eXBlIG9mIHRva2VuIHRvIGdldCB0aGUgbmFtZSBvZi5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBuYW1lIG9mIHRoZSB0b2tlbiBvciBcIlVOS05PV05fVE9LRU5cIiBmb3IgYW55XG4gICAgICogICAgICBpbnZhbGlkIHRva2VuIHR5cGUuXG4gICAgICogQG1ldGhvZCB0b2tlbk5hbWVcbiAgICAgKi9cbiAgICB0b2tlbk5hbWU6IGZ1bmN0aW9uKHRva2VuVHlwZSl7XG4gICAgICAgIGlmICh0b2tlblR5cGUgPCAwIHx8IHRva2VuVHlwZSA+IHRoaXMuX3Rva2VuRGF0YS5sZW5ndGgpe1xuICAgICAgICAgICAgcmV0dXJuIFwiVU5LTk9XTl9UT0tFTlwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuRGF0YVt0b2tlblR5cGVdLm5hbWU7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgdG9rZW4gdHlwZSB2YWx1ZSBmb3IgdGhlIGdpdmVuIHRva2VuIG5hbWUuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRva2VuTmFtZSBUaGUgbmFtZSBvZiB0aGUgdG9rZW4gd2hvc2UgdmFsdWUgc2hvdWxkIGJlIHJldHVybmVkLlxuICAgICAqIEByZXR1cm4ge2ludH0gVGhlIHRva2VuIHR5cGUgdmFsdWUgZm9yIHRoZSBnaXZlbiB0b2tlbiBuYW1lIG9yIC0xXG4gICAgICogICAgICBmb3IgYW4gdW5rbm93biB0b2tlbi5cbiAgICAgKiBAbWV0aG9kIHRva2VuTmFtZVxuICAgICAqL1xuICAgIHRva2VuVHlwZTogZnVuY3Rpb24odG9rZW5OYW1lKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3Rva2VuRGF0YVt0b2tlbk5hbWVdIHx8IC0xO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBsYXN0IGNvbnN1bWVkIHRva2VuIHRvIHRoZSB0b2tlbiBzdHJlYW0uXG4gICAgICogQG1ldGhvZCB1bmdldFxuICAgICAqL1xuICAgIHVuZ2V0OiBmdW5jdGlvbigpe1xuICAgICAgICAvL2lmICh0aGlzLl9sdEluZGV4ID4gLTEpe1xuICAgICAgICBpZiAodGhpcy5fbHRJbmRleENhY2hlLmxlbmd0aCl7XG4gICAgICAgICAgICB0aGlzLl9sdEluZGV4IC09IHRoaXMuX2x0SW5kZXhDYWNoZS5wb3AoKTsvLy0tO1xuICAgICAgICAgICAgdGhpcy5fdG9rZW4gPSB0aGlzLl9sdFt0aGlzLl9sdEluZGV4IC0gMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbXVjaCBsb29rYWhlYWQuXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG59O1xuXG5cbnBhcnNlcmxpYi51dGlsID0ge1xuU3RyaW5nUmVhZGVyOiBTdHJpbmdSZWFkZXIsXG5TeW50YXhFcnJvciA6IFN5bnRheEVycm9yLFxuU3ludGF4VW5pdCAgOiBTeW50YXhVbml0LFxuRXZlbnRUYXJnZXQgOiBFdmVudFRhcmdldCxcblRva2VuU3RyZWFtQmFzZSA6IFRva2VuU3RyZWFtQmFzZVxufTtcbn0pKCk7XG4vKlxuUGFyc2VyLUxpYlxuQ29weXJpZ2h0IChjKSAyMDA5LTIwMTEgTmljaG9sYXMgQy4gWmFrYXMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cblRIRSBTT0ZUV0FSRS5cblxuKi9cbi8qIFZlcnNpb24gdjAuMi41LCBCdWlsZCB0aW1lOiA3LU1heS0yMDE0IDAzOjM3OjM4ICovXG4oZnVuY3Rpb24oKXtcbnZhciBFdmVudFRhcmdldCA9IHBhcnNlcmxpYi51dGlsLkV2ZW50VGFyZ2V0LFxuVG9rZW5TdHJlYW1CYXNlID0gcGFyc2VybGliLnV0aWwuVG9rZW5TdHJlYW1CYXNlLFxuU3RyaW5nUmVhZGVyID0gcGFyc2VybGliLnV0aWwuU3RyaW5nUmVhZGVyLFxuU3ludGF4RXJyb3IgPSBwYXJzZXJsaWIudXRpbC5TeW50YXhFcnJvcixcblN5bnRheFVuaXQgID0gcGFyc2VybGliLnV0aWwuU3ludGF4VW5pdDtcblxudmFyIENvbG9ycyA9IHtcbiAgICBhbGljZWJsdWUgICAgICAgOlwiI2YwZjhmZlwiLFxuICAgIGFudGlxdWV3aGl0ZSAgICA6XCIjZmFlYmQ3XCIsXG4gICAgYXF1YSAgICAgICAgICAgIDpcIiMwMGZmZmZcIixcbiAgICBhcXVhbWFyaW5lICAgICAgOlwiIzdmZmZkNFwiLFxuICAgIGF6dXJlICAgICAgICAgICA6XCIjZjBmZmZmXCIsXG4gICAgYmVpZ2UgICAgICAgICAgIDpcIiNmNWY1ZGNcIixcbiAgICBiaXNxdWUgICAgICAgICAgOlwiI2ZmZTRjNFwiLFxuICAgIGJsYWNrICAgICAgICAgICA6XCIjMDAwMDAwXCIsXG4gICAgYmxhbmNoZWRhbG1vbmQgIDpcIiNmZmViY2RcIixcbiAgICBibHVlICAgICAgICAgICAgOlwiIzAwMDBmZlwiLFxuICAgIGJsdWV2aW9sZXQgICAgICA6XCIjOGEyYmUyXCIsXG4gICAgYnJvd24gICAgICAgICAgIDpcIiNhNTJhMmFcIixcbiAgICBidXJseXdvb2QgICAgICAgOlwiI2RlYjg4N1wiLFxuICAgIGNhZGV0Ymx1ZSAgICAgICA6XCIjNWY5ZWEwXCIsXG4gICAgY2hhcnRyZXVzZSAgICAgIDpcIiM3ZmZmMDBcIixcbiAgICBjaG9jb2xhdGUgICAgICAgOlwiI2QyNjkxZVwiLFxuICAgIGNvcmFsICAgICAgICAgICA6XCIjZmY3ZjUwXCIsXG4gICAgY29ybmZsb3dlcmJsdWUgIDpcIiM2NDk1ZWRcIixcbiAgICBjb3Juc2lsayAgICAgICAgOlwiI2ZmZjhkY1wiLFxuICAgIGNyaW1zb24gICAgICAgICA6XCIjZGMxNDNjXCIsXG4gICAgY3lhbiAgICAgICAgICAgIDpcIiMwMGZmZmZcIixcbiAgICBkYXJrYmx1ZSAgICAgICAgOlwiIzAwMDA4YlwiLFxuICAgIGRhcmtjeWFuICAgICAgICA6XCIjMDA4YjhiXCIsXG4gICAgZGFya2dvbGRlbnJvZCAgIDpcIiNiODg2MGJcIixcbiAgICBkYXJrZ3JheSAgICAgICAgOlwiI2E5YTlhOVwiLFxuICAgIGRhcmtncmV5ICAgICAgICA6XCIjYTlhOWE5XCIsXG4gICAgZGFya2dyZWVuICAgICAgIDpcIiMwMDY0MDBcIixcbiAgICBkYXJra2hha2kgICAgICAgOlwiI2JkYjc2YlwiLFxuICAgIGRhcmttYWdlbnRhICAgICA6XCIjOGIwMDhiXCIsXG4gICAgZGFya29saXZlZ3JlZW4gIDpcIiM1NTZiMmZcIixcbiAgICBkYXJrb3JhbmdlICAgICAgOlwiI2ZmOGMwMFwiLFxuICAgIGRhcmtvcmNoaWQgICAgICA6XCIjOTkzMmNjXCIsXG4gICAgZGFya3JlZCAgICAgICAgIDpcIiM4YjAwMDBcIixcbiAgICBkYXJrc2FsbW9uICAgICAgOlwiI2U5OTY3YVwiLFxuICAgIGRhcmtzZWFncmVlbiAgICA6XCIjOGZiYzhmXCIsXG4gICAgZGFya3NsYXRlYmx1ZSAgIDpcIiM0ODNkOGJcIixcbiAgICBkYXJrc2xhdGVncmF5ICAgOlwiIzJmNGY0ZlwiLFxuICAgIGRhcmtzbGF0ZWdyZXkgICA6XCIjMmY0ZjRmXCIsXG4gICAgZGFya3R1cnF1b2lzZSAgIDpcIiMwMGNlZDFcIixcbiAgICBkYXJrdmlvbGV0ICAgICAgOlwiIzk0MDBkM1wiLFxuICAgIGRlZXBwaW5rICAgICAgICA6XCIjZmYxNDkzXCIsXG4gICAgZGVlcHNreWJsdWUgICAgIDpcIiMwMGJmZmZcIixcbiAgICBkaW1ncmF5ICAgICAgICAgOlwiIzY5Njk2OVwiLFxuICAgIGRpbWdyZXkgICAgICAgICA6XCIjNjk2OTY5XCIsXG4gICAgZG9kZ2VyYmx1ZSAgICAgIDpcIiMxZTkwZmZcIixcbiAgICBmaXJlYnJpY2sgICAgICAgOlwiI2IyMjIyMlwiLFxuICAgIGZsb3JhbHdoaXRlICAgICA6XCIjZmZmYWYwXCIsXG4gICAgZm9yZXN0Z3JlZW4gICAgIDpcIiMyMjhiMjJcIixcbiAgICBmdWNoc2lhICAgICAgICAgOlwiI2ZmMDBmZlwiLFxuICAgIGdhaW5zYm9ybyAgICAgICA6XCIjZGNkY2RjXCIsXG4gICAgZ2hvc3R3aGl0ZSAgICAgIDpcIiNmOGY4ZmZcIixcbiAgICBnb2xkICAgICAgICAgICAgOlwiI2ZmZDcwMFwiLFxuICAgIGdvbGRlbnJvZCAgICAgICA6XCIjZGFhNTIwXCIsXG4gICAgZ3JheSAgICAgICAgICAgIDpcIiM4MDgwODBcIixcbiAgICBncmV5ICAgICAgICAgICAgOlwiIzgwODA4MFwiLFxuICAgIGdyZWVuICAgICAgICAgICA6XCIjMDA4MDAwXCIsXG4gICAgZ3JlZW55ZWxsb3cgICAgIDpcIiNhZGZmMmZcIixcbiAgICBob25leWRldyAgICAgICAgOlwiI2YwZmZmMFwiLFxuICAgIGhvdHBpbmsgICAgICAgICA6XCIjZmY2OWI0XCIsXG4gICAgaW5kaWFucmVkICAgICAgIDpcIiNjZDVjNWNcIixcbiAgICBpbmRpZ28gICAgICAgICAgOlwiIzRiMDA4MlwiLFxuICAgIGl2b3J5ICAgICAgICAgICA6XCIjZmZmZmYwXCIsXG4gICAga2hha2kgICAgICAgICAgIDpcIiNmMGU2OGNcIixcbiAgICBsYXZlbmRlciAgICAgICAgOlwiI2U2ZTZmYVwiLFxuICAgIGxhdmVuZGVyYmx1c2ggICA6XCIjZmZmMGY1XCIsXG4gICAgbGF3bmdyZWVuICAgICAgIDpcIiM3Y2ZjMDBcIixcbiAgICBsZW1vbmNoaWZmb24gICAgOlwiI2ZmZmFjZFwiLFxuICAgIGxpZ2h0Ymx1ZSAgICAgICA6XCIjYWRkOGU2XCIsXG4gICAgbGlnaHRjb3JhbCAgICAgIDpcIiNmMDgwODBcIixcbiAgICBsaWdodGN5YW4gICAgICAgOlwiI2UwZmZmZlwiLFxuICAgIGxpZ2h0Z29sZGVucm9keWVsbG93ICA6XCIjZmFmYWQyXCIsXG4gICAgbGlnaHRncmF5ICAgICAgIDpcIiNkM2QzZDNcIixcbiAgICBsaWdodGdyZXkgICAgICAgOlwiI2QzZDNkM1wiLFxuICAgIGxpZ2h0Z3JlZW4gICAgICA6XCIjOTBlZTkwXCIsXG4gICAgbGlnaHRwaW5rICAgICAgIDpcIiNmZmI2YzFcIixcbiAgICBsaWdodHNhbG1vbiAgICAgOlwiI2ZmYTA3YVwiLFxuICAgIGxpZ2h0c2VhZ3JlZW4gICA6XCIjMjBiMmFhXCIsXG4gICAgbGlnaHRza3libHVlICAgIDpcIiM4N2NlZmFcIixcbiAgICBsaWdodHNsYXRlZ3JheSAgOlwiIzc3ODg5OVwiLFxuICAgIGxpZ2h0c2xhdGVncmV5ICA6XCIjNzc4ODk5XCIsXG4gICAgbGlnaHRzdGVlbGJsdWUgIDpcIiNiMGM0ZGVcIixcbiAgICBsaWdodHllbGxvdyAgICAgOlwiI2ZmZmZlMFwiLFxuICAgIGxpbWUgICAgICAgICAgICA6XCIjMDBmZjAwXCIsXG4gICAgbGltZWdyZWVuICAgICAgIDpcIiMzMmNkMzJcIixcbiAgICBsaW5lbiAgICAgICAgICAgOlwiI2ZhZjBlNlwiLFxuICAgIG1hZ2VudGEgICAgICAgICA6XCIjZmYwMGZmXCIsXG4gICAgbWFyb29uICAgICAgICAgIDpcIiM4MDAwMDBcIixcbiAgICBtZWRpdW1hcXVhbWFyaW5lOlwiIzY2Y2RhYVwiLFxuICAgIG1lZGl1bWJsdWUgICAgICA6XCIjMDAwMGNkXCIsXG4gICAgbWVkaXVtb3JjaGlkICAgIDpcIiNiYTU1ZDNcIixcbiAgICBtZWRpdW1wdXJwbGUgICAgOlwiIzkzNzBkOFwiLFxuICAgIG1lZGl1bXNlYWdyZWVuICA6XCIjM2NiMzcxXCIsXG4gICAgbWVkaXVtc2xhdGVibHVlIDpcIiM3YjY4ZWVcIixcbiAgICBtZWRpdW1zcHJpbmdncmVlbiAgIDpcIiMwMGZhOWFcIixcbiAgICBtZWRpdW10dXJxdW9pc2UgOlwiIzQ4ZDFjY1wiLFxuICAgIG1lZGl1bXZpb2xldHJlZCA6XCIjYzcxNTg1XCIsXG4gICAgbWlkbmlnaHRibHVlICAgIDpcIiMxOTE5NzBcIixcbiAgICBtaW50Y3JlYW0gICAgICAgOlwiI2Y1ZmZmYVwiLFxuICAgIG1pc3R5cm9zZSAgICAgICA6XCIjZmZlNGUxXCIsXG4gICAgbW9jY2FzaW4gICAgICAgIDpcIiNmZmU0YjVcIixcbiAgICBuYXZham93aGl0ZSAgICAgOlwiI2ZmZGVhZFwiLFxuICAgIG5hdnkgICAgICAgICAgICA6XCIjMDAwMDgwXCIsXG4gICAgb2xkbGFjZSAgICAgICAgIDpcIiNmZGY1ZTZcIixcbiAgICBvbGl2ZSAgICAgICAgICAgOlwiIzgwODAwMFwiLFxuICAgIG9saXZlZHJhYiAgICAgICA6XCIjNmI4ZTIzXCIsXG4gICAgb3JhbmdlICAgICAgICAgIDpcIiNmZmE1MDBcIixcbiAgICBvcmFuZ2VyZWQgICAgICAgOlwiI2ZmNDUwMFwiLFxuICAgIG9yY2hpZCAgICAgICAgICA6XCIjZGE3MGQ2XCIsXG4gICAgcGFsZWdvbGRlbnJvZCAgIDpcIiNlZWU4YWFcIixcbiAgICBwYWxlZ3JlZW4gICAgICAgOlwiIzk4ZmI5OFwiLFxuICAgIHBhbGV0dXJxdW9pc2UgICA6XCIjYWZlZWVlXCIsXG4gICAgcGFsZXZpb2xldHJlZCAgIDpcIiNkODcwOTNcIixcbiAgICBwYXBheWF3aGlwICAgICAgOlwiI2ZmZWZkNVwiLFxuICAgIHBlYWNocHVmZiAgICAgICA6XCIjZmZkYWI5XCIsXG4gICAgcGVydSAgICAgICAgICAgIDpcIiNjZDg1M2ZcIixcbiAgICBwaW5rICAgICAgICAgICAgOlwiI2ZmYzBjYlwiLFxuICAgIHBsdW0gICAgICAgICAgICA6XCIjZGRhMGRkXCIsXG4gICAgcG93ZGVyYmx1ZSAgICAgIDpcIiNiMGUwZTZcIixcbiAgICBwdXJwbGUgICAgICAgICAgOlwiIzgwMDA4MFwiLFxuICAgIHJlZCAgICAgICAgICAgICA6XCIjZmYwMDAwXCIsXG4gICAgcm9zeWJyb3duICAgICAgIDpcIiNiYzhmOGZcIixcbiAgICByb3lhbGJsdWUgICAgICAgOlwiIzQxNjllMVwiLFxuICAgIHNhZGRsZWJyb3duICAgICA6XCIjOGI0NTEzXCIsXG4gICAgc2FsbW9uICAgICAgICAgIDpcIiNmYTgwNzJcIixcbiAgICBzYW5keWJyb3duICAgICAgOlwiI2Y0YTQ2MFwiLFxuICAgIHNlYWdyZWVuICAgICAgICA6XCIjMmU4YjU3XCIsXG4gICAgc2Vhc2hlbGwgICAgICAgIDpcIiNmZmY1ZWVcIixcbiAgICBzaWVubmEgICAgICAgICAgOlwiI2EwNTIyZFwiLFxuICAgIHNpbHZlciAgICAgICAgICA6XCIjYzBjMGMwXCIsXG4gICAgc2t5Ymx1ZSAgICAgICAgIDpcIiM4N2NlZWJcIixcbiAgICBzbGF0ZWJsdWUgICAgICAgOlwiIzZhNWFjZFwiLFxuICAgIHNsYXRlZ3JheSAgICAgICA6XCIjNzA4MDkwXCIsXG4gICAgc2xhdGVncmV5ICAgICAgIDpcIiM3MDgwOTBcIixcbiAgICBzbm93ICAgICAgICAgICAgOlwiI2ZmZmFmYVwiLFxuICAgIHNwcmluZ2dyZWVuICAgICA6XCIjMDBmZjdmXCIsXG4gICAgc3RlZWxibHVlICAgICAgIDpcIiM0NjgyYjRcIixcbiAgICB0YW4gICAgICAgICAgICAgOlwiI2QyYjQ4Y1wiLFxuICAgIHRlYWwgICAgICAgICAgICA6XCIjMDA4MDgwXCIsXG4gICAgdGhpc3RsZSAgICAgICAgIDpcIiNkOGJmZDhcIixcbiAgICB0b21hdG8gICAgICAgICAgOlwiI2ZmNjM0N1wiLFxuICAgIHR1cnF1b2lzZSAgICAgICA6XCIjNDBlMGQwXCIsXG4gICAgdmlvbGV0ICAgICAgICAgIDpcIiNlZTgyZWVcIixcbiAgICB3aGVhdCAgICAgICAgICAgOlwiI2Y1ZGViM1wiLFxuICAgIHdoaXRlICAgICAgICAgICA6XCIjZmZmZmZmXCIsXG4gICAgd2hpdGVzbW9rZSAgICAgIDpcIiNmNWY1ZjVcIixcbiAgICB5ZWxsb3cgICAgICAgICAgOlwiI2ZmZmYwMFwiLFxuICAgIHllbGxvd2dyZWVuICAgICA6XCIjOWFjZDMyXCIsXG4gICAgLy9DU1MyIHN5c3RlbSBjb2xvcnMgaHR0cDovL3d3dy53My5vcmcvVFIvY3NzMy1jb2xvci8jY3NzMi1zeXN0ZW1cbiAgICBhY3RpdmVCb3JkZXIgICAgICAgIDpcIkFjdGl2ZSB3aW5kb3cgYm9yZGVyLlwiLFxuICAgIGFjdGl2ZWNhcHRpb24gICAgICAgOlwiQWN0aXZlIHdpbmRvdyBjYXB0aW9uLlwiLFxuICAgIGFwcHdvcmtzcGFjZSAgICAgICAgOlwiQmFja2dyb3VuZCBjb2xvciBvZiBtdWx0aXBsZSBkb2N1bWVudCBpbnRlcmZhY2UuXCIsXG4gICAgYmFja2dyb3VuZCAgICAgICAgICA6XCJEZXNrdG9wIGJhY2tncm91bmQuXCIsXG4gICAgYnV0dG9uZmFjZSAgICAgICAgICA6XCJUaGUgZmFjZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciAzLUQgZWxlbWVudHMgdGhhdCBhcHBlYXIgMy1EIGR1ZSB0byBvbmUgbGF5ZXIgb2Ygc3Vycm91bmRpbmcgYm9yZGVyLlwiLFxuICAgIGJ1dHRvbmhpZ2hsaWdodCAgICAgOlwiVGhlIGNvbG9yIG9mIHRoZSBib3JkZXIgZmFjaW5nIHRoZSBsaWdodCBzb3VyY2UgZm9yIDMtRCBlbGVtZW50cyB0aGF0IGFwcGVhciAzLUQgZHVlIHRvIG9uZSBsYXllciBvZiBzdXJyb3VuZGluZyBib3JkZXIuXCIsXG4gICAgYnV0dG9uc2hhZG93ICAgICAgICA6XCJUaGUgY29sb3Igb2YgdGhlIGJvcmRlciBhd2F5IGZyb20gdGhlIGxpZ2h0IHNvdXJjZSBmb3IgMy1EIGVsZW1lbnRzIHRoYXQgYXBwZWFyIDMtRCBkdWUgdG8gb25lIGxheWVyIG9mIHN1cnJvdW5kaW5nIGJvcmRlci5cIixcbiAgICBidXR0b250ZXh0ICAgICAgICAgIDpcIlRleHQgb24gcHVzaCBidXR0b25zLlwiLFxuICAgIGNhcHRpb250ZXh0ICAgICAgICAgOlwiVGV4dCBpbiBjYXB0aW9uLCBzaXplIGJveCwgYW5kIHNjcm9sbGJhciBhcnJvdyBib3guXCIsXG4gICAgZ3JheXRleHQgICAgICAgICAgICA6XCJHcmF5ZWQgKGRpc2FibGVkKSB0ZXh0LiBUaGlzIGNvbG9yIGlzIHNldCB0byAjMDAwIGlmIHRoZSBjdXJyZW50IGRpc3BsYXkgZHJpdmVyIGRvZXMgbm90IHN1cHBvcnQgYSBzb2xpZCBncmF5IGNvbG9yLlwiLFxuICAgIGdyZXl0ZXh0ICAgICAgICAgICAgOlwiR3JleWVkIChkaXNhYmxlZCkgdGV4dC4gVGhpcyBjb2xvciBpcyBzZXQgdG8gIzAwMCBpZiB0aGUgY3VycmVudCBkaXNwbGF5IGRyaXZlciBkb2VzIG5vdCBzdXBwb3J0IGEgc29saWQgZ3JleSBjb2xvci5cIixcbiAgICBoaWdobGlnaHQgICAgICAgICAgIDpcIkl0ZW0ocykgc2VsZWN0ZWQgaW4gYSBjb250cm9sLlwiLFxuICAgIGhpZ2hsaWdodHRleHQgICAgICAgOlwiVGV4dCBvZiBpdGVtKHMpIHNlbGVjdGVkIGluIGEgY29udHJvbC5cIixcbiAgICBpbmFjdGl2ZWJvcmRlciAgICAgIDpcIkluYWN0aXZlIHdpbmRvdyBib3JkZXIuXCIsXG4gICAgaW5hY3RpdmVjYXB0aW9uICAgICA6XCJJbmFjdGl2ZSB3aW5kb3cgY2FwdGlvbi5cIixcbiAgICBpbmFjdGl2ZWNhcHRpb250ZXh0IDpcIkNvbG9yIG9mIHRleHQgaW4gYW4gaW5hY3RpdmUgY2FwdGlvbi5cIixcbiAgICBpbmZvYmFja2dyb3VuZCAgICAgIDpcIkJhY2tncm91bmQgY29sb3IgZm9yIHRvb2x0aXAgY29udHJvbHMuXCIsXG4gICAgaW5mb3RleHQgICAgICAgICAgICA6XCJUZXh0IGNvbG9yIGZvciB0b29sdGlwIGNvbnRyb2xzLlwiLFxuICAgIG1lbnUgICAgICAgICAgICAgICAgOlwiTWVudSBiYWNrZ3JvdW5kLlwiLFxuICAgIG1lbnV0ZXh0ICAgICAgICAgICAgOlwiVGV4dCBpbiBtZW51cy5cIixcbiAgICBzY3JvbGxiYXIgICAgICAgICAgIDpcIlNjcm9sbCBiYXIgZ3JheSBhcmVhLlwiLFxuICAgIHRocmVlZGRhcmtzaGFkb3cgICAgOlwiVGhlIGNvbG9yIG9mIHRoZSBkYXJrZXIgKGdlbmVyYWxseSBvdXRlcikgb2YgdGhlIHR3byBib3JkZXJzIGF3YXkgZnJvbSB0aGUgbGlnaHQgc291cmNlIGZvciAzLUQgZWxlbWVudHMgdGhhdCBhcHBlYXIgMy1EIGR1ZSB0byB0d28gY29uY2VudHJpYyBsYXllcnMgb2Ygc3Vycm91bmRpbmcgYm9yZGVyLlwiLFxuICAgIHRocmVlZGZhY2UgICAgICAgICAgOlwiVGhlIGZhY2UgYmFja2dyb3VuZCBjb2xvciBmb3IgMy1EIGVsZW1lbnRzIHRoYXQgYXBwZWFyIDMtRCBkdWUgdG8gdHdvIGNvbmNlbnRyaWMgbGF5ZXJzIG9mIHN1cnJvdW5kaW5nIGJvcmRlci5cIixcbiAgICB0aHJlZWRoaWdobGlnaHQgICAgIDpcIlRoZSBjb2xvciBvZiB0aGUgbGlnaHRlciAoZ2VuZXJhbGx5IG91dGVyKSBvZiB0aGUgdHdvIGJvcmRlcnMgZmFjaW5nIHRoZSBsaWdodCBzb3VyY2UgZm9yIDMtRCBlbGVtZW50cyB0aGF0IGFwcGVhciAzLUQgZHVlIHRvIHR3byBjb25jZW50cmljIGxheWVycyBvZiBzdXJyb3VuZGluZyBib3JkZXIuXCIsXG4gICAgdGhyZWVkbGlnaHRzaGFkb3cgICA6XCJUaGUgY29sb3Igb2YgdGhlIGRhcmtlciAoZ2VuZXJhbGx5IGlubmVyKSBvZiB0aGUgdHdvIGJvcmRlcnMgZmFjaW5nIHRoZSBsaWdodCBzb3VyY2UgZm9yIDMtRCBlbGVtZW50cyB0aGF0IGFwcGVhciAzLUQgZHVlIHRvIHR3byBjb25jZW50cmljIGxheWVycyBvZiBzdXJyb3VuZGluZyBib3JkZXIuXCIsXG4gICAgdGhyZWVkc2hhZG93ICAgICAgICA6XCJUaGUgY29sb3Igb2YgdGhlIGxpZ2h0ZXIgKGdlbmVyYWxseSBpbm5lcikgb2YgdGhlIHR3byBib3JkZXJzIGF3YXkgZnJvbSB0aGUgbGlnaHQgc291cmNlIGZvciAzLUQgZWxlbWVudHMgdGhhdCBhcHBlYXIgMy1EIGR1ZSB0byB0d28gY29uY2VudHJpYyBsYXllcnMgb2Ygc3Vycm91bmRpbmcgYm9yZGVyLlwiLFxuICAgIHdpbmRvdyAgICAgICAgICAgICAgOlwiV2luZG93IGJhY2tncm91bmQuXCIsXG4gICAgd2luZG93ZnJhbWUgICAgICAgICA6XCJXaW5kb3cgZnJhbWUuXCIsXG4gICAgd2luZG93dGV4dCAgICAgICAgICA6XCJUZXh0IGluIHdpbmRvd3MuXCJcbn07XG4vKmdsb2JhbCBTeW50YXhVbml0LCBQYXJzZXIqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2VsZWN0b3IgY29tYmluYXRvciAod2hpdGVzcGFjZSwgKywgPikuXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi5jc3NcbiAqIEBjbGFzcyBDb21iaW5hdG9yXG4gKiBAZXh0ZW5kcyBwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSB0ZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSB1bml0LlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqL1xuZnVuY3Rpb24gQ29tYmluYXRvcih0ZXh0LCBsaW5lLCBjb2wpe1xuXG4gICAgU3ludGF4VW5pdC5jYWxsKHRoaXMsIHRleHQsIGxpbmUsIGNvbCwgUGFyc2VyLkNPTUJJTkFUT1JfVFlQRSk7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiBtb2RpZmllci5cbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKiBAcHJvcGVydHkgdHlwZVxuICAgICAqL1xuICAgIHRoaXMudHlwZSA9IFwidW5rbm93blwiO1xuXG4gICAgLy9wcmV0dHkgc2ltcGxlXG4gICAgaWYgKC9eXFxzKyQvLnRlc3QodGV4dCkpe1xuICAgICAgICB0aGlzLnR5cGUgPSBcImRlc2NlbmRhbnRcIjtcbiAgICB9IGVsc2UgaWYgKHRleHQgPT0gXCI+XCIpe1xuICAgICAgICB0aGlzLnR5cGUgPSBcImNoaWxkXCI7XG4gICAgfSBlbHNlIGlmICh0ZXh0ID09IFwiK1wiKXtcbiAgICAgICAgdGhpcy50eXBlID0gXCJhZGphY2VudC1zaWJsaW5nXCI7XG4gICAgfSBlbHNlIGlmICh0ZXh0ID09IFwiflwiKXtcbiAgICAgICAgdGhpcy50eXBlID0gXCJzaWJsaW5nXCI7XG4gICAgfVxuXG59XG5cbkNvbWJpbmF0b3IucHJvdG90eXBlID0gbmV3IFN5bnRheFVuaXQoKTtcbkNvbWJpbmF0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gQ29tYmluYXRvcjtcblxuLypnbG9iYWwgU3ludGF4VW5pdCwgUGFyc2VyKi9cbi8qKlxuICogUmVwcmVzZW50cyBhIG1lZGlhIGZlYXR1cmUsIHN1Y2ggYXMgbWF4LXdpZHRoOjUwMC5cbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLmNzc1xuICogQGNsYXNzIE1lZGlhRmVhdHVyZVxuICogQGV4dGVuZHMgcGFyc2VybGliLnV0aWwuU3ludGF4VW5pdFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1N5bnRheFVuaXR9IG5hbWUgVGhlIG5hbWUgb2YgdGhlIGZlYXR1cmUuXG4gKiBAcGFyYW0ge1N5bnRheFVuaXR9IHZhbHVlIFRoZSB2YWx1ZSBvZiB0aGUgZmVhdHVyZSBvciBudWxsIGlmIG5vbmUuXG4gKi9cbmZ1bmN0aW9uIE1lZGlhRmVhdHVyZShuYW1lLCB2YWx1ZSl7XG5cbiAgICBTeW50YXhVbml0LmNhbGwodGhpcywgXCIoXCIgKyBuYW1lICsgKHZhbHVlICE9PSBudWxsID8gXCI6XCIgKyB2YWx1ZSA6IFwiXCIpICsgXCIpXCIsIG5hbWUuc3RhcnRMaW5lLCBuYW1lLnN0YXJ0Q29sLCBQYXJzZXIuTUVESUFfRkVBVFVSRV9UWVBFKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBuYW1lIG9mIHRoZSBtZWRpYSBmZWF0dXJlXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICogQHByb3BlcnR5IG5hbWVcbiAgICAgKi9cbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHZhbHVlIGZvciB0aGUgZmVhdHVyZSBvciBudWxsIGlmIHRoZXJlIGlzIG5vbmUuXG4gICAgICogQHR5cGUgU3ludGF4VW5pdFxuICAgICAqIEBwcm9wZXJ0eSB2YWx1ZVxuICAgICAqL1xuICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcbn1cblxuTWVkaWFGZWF0dXJlLnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5NZWRpYUZlYXR1cmUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gTWVkaWFGZWF0dXJlO1xuXG4vKmdsb2JhbCBTeW50YXhVbml0LCBQYXJzZXIqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGFuIGluZGl2aWR1YWwgbWVkaWEgcXVlcnkuXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi5jc3NcbiAqIEBjbGFzcyBNZWRpYVF1ZXJ5XG4gKiBAZXh0ZW5kcyBwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSBtb2RpZmllciBUaGUgbW9kaWZpZXIgXCJub3RcIiBvciBcIm9ubHlcIiAob3IgbnVsbCkuXG4gKiBAcGFyYW0ge1N0cmluZ30gbWVkaWFUeXBlIFRoZSB0eXBlIG9mIG1lZGlhIChpLmUuLCBcInByaW50XCIpLlxuICogQHBhcmFtIHtBcnJheX0gcGFydHMgQXJyYXkgb2Ygc2VsZWN0b3JzIHBhcnRzIG1ha2luZyB1cCB0aGlzIHNlbGVjdG9yLlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqL1xuZnVuY3Rpb24gTWVkaWFRdWVyeShtb2RpZmllciwgbWVkaWFUeXBlLCBmZWF0dXJlcywgbGluZSwgY29sKXtcblxuICAgIFN5bnRheFVuaXQuY2FsbCh0aGlzLCAobW9kaWZpZXIgPyBtb2RpZmllciArIFwiIFwiOiBcIlwiKSArIChtZWRpYVR5cGUgPyBtZWRpYVR5cGUgOiBcIlwiKSArIChtZWRpYVR5cGUgJiYgZmVhdHVyZXMubGVuZ3RoID4gMCA/IFwiIGFuZCBcIiA6IFwiXCIpICsgZmVhdHVyZXMuam9pbihcIiBhbmQgXCIpLCBsaW5lLCBjb2wsIFBhcnNlci5NRURJQV9RVUVSWV9UWVBFKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBtZWRpYSBtb2RpZmllciAoXCJub3RcIiBvciBcIm9ubHlcIilcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKiBAcHJvcGVydHkgbW9kaWZpZXJcbiAgICAgKi9cbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXI7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWVkaWFUeXBlIChpLmUuLCBcInByaW50XCIpXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICogQHByb3BlcnR5IG1lZGlhVHlwZVxuICAgICAqL1xuICAgIHRoaXMubWVkaWFUeXBlID0gbWVkaWFUeXBlO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHBhcnRzIHRoYXQgbWFrZSB1cCB0aGUgc2VsZWN0b3IuXG4gICAgICogQHR5cGUgQXJyYXlcbiAgICAgKiBAcHJvcGVydHkgZmVhdHVyZXNcbiAgICAgKi9cbiAgICB0aGlzLmZlYXR1cmVzID0gZmVhdHVyZXM7XG5cbn1cblxuTWVkaWFRdWVyeS5wcm90b3R5cGUgPSBuZXcgU3ludGF4VW5pdCgpO1xuTWVkaWFRdWVyeS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBNZWRpYVF1ZXJ5O1xuXG4vKmdsb2JhbCBUb2tlbnMsIFRva2VuU3RyZWFtLCBTeW50YXhFcnJvciwgUHJvcGVydGllcywgVmFsaWRhdGlvbiwgVmFsaWRhdGlvbkVycm9yLCBTeW50YXhVbml0LFxuICAgIFByb3BlcnR5VmFsdWUsIFByb3BlcnR5VmFsdWVQYXJ0LCBTZWxlY3RvclBhcnQsIFNlbGVjdG9yU3ViUGFydCwgU2VsZWN0b3IsXG4gICAgUHJvcGVydHlOYW1lLCBDb21iaW5hdG9yLCBNZWRpYUZlYXR1cmUsIE1lZGlhUXVlcnksIEV2ZW50VGFyZ2V0ICovXG5cbi8qKlxuICogQSBDU1MzIHBhcnNlci5cbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLmNzc1xuICogQGNsYXNzIFBhcnNlclxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAoT3B0aW9uYWwpIFZhcmlvdXMgb3B0aW9ucyBmb3IgdGhlIHBhcnNlcjpcbiAqICAgICAgc3RhckhhY2sgKHRydWV8ZmFsc2UpIHRvIGFsbG93IElFNiBzdGFyIGhhY2sgYXMgdmFsaWQsXG4gKiAgICAgIHVuZGVyc2NvcmVIYWNrICh0cnVlfGZhbHNlKSB0byBpbnRlcnByZXQgbGVhZGluZyB1bmRlcnNjb3Jlc1xuICogICAgICBhcyBJRTYtNyB0YXJnZXRpbmcgZm9yIGtub3duIHByb3BlcnRpZXMsIGllRmlsdGVycyAodHJ1ZXxmYWxzZSlcbiAqICAgICAgdG8gaW5kaWNhdGUgdGhhdCBJRSA8IDggZmlsdGVycyBzaG91bGQgYmUgYWNjZXB0ZWQgYW5kIG5vdCB0aHJvd1xuICogICAgICBzeW50YXggZXJyb3JzLlxuICovXG5mdW5jdGlvbiBQYXJzZXIob3B0aW9ucyl7XG5cbiAgICAvL2luaGVyaXQgZXZlbnQgZnVuY3Rpb25hbGl0eVxuICAgIEV2ZW50VGFyZ2V0LmNhbGwodGhpcyk7XG5cblxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB0aGlzLl90b2tlblN0cmVhbSA9IG51bGw7XG59XG5cbi8vU3RhdGljIGNvbnN0YW50c1xuUGFyc2VyLkRFRkFVTFRfVFlQRSA9IDA7XG5QYXJzZXIuQ09NQklOQVRPUl9UWVBFID0gMTtcblBhcnNlci5NRURJQV9GRUFUVVJFX1RZUEUgPSAyO1xuUGFyc2VyLk1FRElBX1FVRVJZX1RZUEUgPSAzO1xuUGFyc2VyLlBST1BFUlRZX05BTUVfVFlQRSA9IDQ7XG5QYXJzZXIuUFJPUEVSVFlfVkFMVUVfVFlQRSA9IDU7XG5QYXJzZXIuUFJPUEVSVFlfVkFMVUVfUEFSVF9UWVBFID0gNjtcblBhcnNlci5TRUxFQ1RPUl9UWVBFID0gNztcblBhcnNlci5TRUxFQ1RPUl9QQVJUX1RZUEUgPSA4O1xuUGFyc2VyLlNFTEVDVE9SX1NVQl9QQVJUX1RZUEUgPSA5O1xuXG5QYXJzZXIucHJvdG90eXBlID0gZnVuY3Rpb24oKXtcblxuICAgIHZhciBwcm90byA9IG5ldyBFdmVudFRhcmdldCgpLCAgLy9uZXcgcHJvdG90eXBlXG4gICAgICAgIHByb3AsXG4gICAgICAgIGFkZGl0aW9ucyA9ICB7XG5cbiAgICAgICAgICAgIC8vcmVzdG9yZSBjb25zdHJ1Y3RvclxuICAgICAgICAgICAgY29uc3RydWN0b3I6IFBhcnNlcixcblxuICAgICAgICAgICAgLy9pbnN0YW5jZSBjb25zdGFudHMgLSB5dWNrXG4gICAgICAgICAgICBERUZBVUxUX1RZUEUgOiAwLFxuICAgICAgICAgICAgQ09NQklOQVRPUl9UWVBFIDogMSxcbiAgICAgICAgICAgIE1FRElBX0ZFQVRVUkVfVFlQRSA6IDIsXG4gICAgICAgICAgICBNRURJQV9RVUVSWV9UWVBFIDogMyxcbiAgICAgICAgICAgIFBST1BFUlRZX05BTUVfVFlQRSA6IDQsXG4gICAgICAgICAgICBQUk9QRVJUWV9WQUxVRV9UWVBFIDogNSxcbiAgICAgICAgICAgIFBST1BFUlRZX1ZBTFVFX1BBUlRfVFlQRSA6IDYsXG4gICAgICAgICAgICBTRUxFQ1RPUl9UWVBFIDogNyxcbiAgICAgICAgICAgIFNFTEVDVE9SX1BBUlRfVFlQRSA6IDgsXG4gICAgICAgICAgICBTRUxFQ1RPUl9TVUJfUEFSVF9UWVBFIDogOSxcblxuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgLy8gR3JhbW1hclxuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICAgICAgICBfc3R5bGVzaGVldDogZnVuY3Rpb24oKXtcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogc3R5bGVzaGVldFxuICAgICAgICAgICAgICAgICAqICA6IFsgQ0hBUlNFVF9TWU0gUyogU1RSSU5HIFMqICc7JyBdP1xuICAgICAgICAgICAgICAgICAqICAgIFtTfENET3xDRENdKiBbIGltcG9ydCBbU3xDRE98Q0RDXSogXSpcbiAgICAgICAgICAgICAgICAgKiAgICBbIG5hbWVzcGFjZSBbU3xDRE98Q0RDXSogXSpcbiAgICAgICAgICAgICAgICAgKiAgICBbIFsgcnVsZXNldCB8IG1lZGlhIHwgcGFnZSB8IGZvbnRfZmFjZSB8IGtleWZyYW1lcyBdIFtTfENET3xDRENdKiBdKlxuICAgICAgICAgICAgICAgICAqICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgY2hhcnNldCAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjb3VudCxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4sXG4gICAgICAgICAgICAgICAgICAgIHR0O1xuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKFwic3RhcnRzdHlsZXNoZWV0XCIpO1xuXG4gICAgICAgICAgICAgICAgLy90cnkgdG8gcmVhZCBjaGFyYWN0ZXIgc2V0XG4gICAgICAgICAgICAgICAgdGhpcy5fY2hhcnNldCgpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fc2tpcENydWZ0KCk7XG5cbiAgICAgICAgICAgICAgICAvL3RyeSB0byByZWFkIGltcG9ydHMgLSBtYXkgYmUgbW9yZSB0aGFuIG9uZVxuICAgICAgICAgICAgICAgIHdoaWxlICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLklNUE9SVF9TWU0pe1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pbXBvcnQoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2tpcENydWZ0KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy90cnkgdG8gcmVhZCBuYW1lc3BhY2VzIC0gbWF5IGJlIG1vcmUgdGhhbiBvbmVcbiAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5TdHJlYW0ucGVlaygpID09IFRva2Vucy5OQU1FU1BBQ0VfU1lNKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbmFtZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3NraXBDcnVmdCgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vZ2V0IHRoZSBuZXh0IHRva2VuXG4gICAgICAgICAgICAgICAgdHQgPSB0b2tlblN0cmVhbS5wZWVrKCk7XG5cbiAgICAgICAgICAgICAgICAvL3RyeSB0byByZWFkIHRoZSByZXN0XG4gICAgICAgICAgICAgICAgd2hpbGUodHQgPiBUb2tlbnMuRU9GKXtcblxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2godHQpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVG9rZW5zLk1FRElBX1NZTTpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fbWVkaWEoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2tpcENydWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVG9rZW5zLlBBR0VfU1lNOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wYWdlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NraXBDcnVmdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFRva2Vucy5GT05UX0ZBQ0VfU1lNOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9mb250X2ZhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fc2tpcENydWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVG9rZW5zLktFWUZSQU1FU19TWU06XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2tleWZyYW1lcygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9za2lwQ3J1ZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBUb2tlbnMuVklFV1BPUlRfU1lNOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl92aWV3cG9ydCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9za2lwQ3J1ZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBUb2tlbnMuVU5LTk9XTl9TWU06ICAvL3Vua25vd24gQCBydWxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLmdldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMub3B0aW9ucy5zdHJpY3Qpe1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2ZpcmUgZXJyb3IgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogICAgICAgXCJlcnJvclwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogICAgXCJVbmtub3duIEAgcnVsZTogXCIgKyB0b2tlblN0cmVhbS5MVCgwKS52YWx1ZSArIFwiLlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgICAgIHRva2VuU3RyZWFtLkxUKDApLnN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgICAgICB0b2tlblN0cmVhbS5MVCgwKS5zdGFydENvbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vc2tpcCBicmFjZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50PTA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5TdHJlYW0uYWR2YW5jZShbVG9rZW5zLkxCUkFDRSwgVG9rZW5zLlJCUkFDRV0pID09IFRva2Vucy5MQlJBQ0Upe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvdW50Kys7ICAgIC8va2VlcCB0cmFjayBvZiBuZXN0aW5nIGRlcHRoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWxlKGNvdW50KXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5hZHZhbmNlKFtUb2tlbnMuUkJSQUNFXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9ub3QgYSBzeW50YXggZXJyb3IsIHJldGhyb3cgaXRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcihcIlVua25vd24gQCBydWxlLlwiLCB0b2tlblN0cmVhbS5MVCgwKS5zdGFydExpbmUsIHRva2VuU3RyZWFtLkxUKDApLnN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFRva2Vucy5TOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighdGhpcy5fcnVsZXNldCgpKXtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9lcnJvciBoYW5kbGluZyBmb3Iga25vd24gaXNzdWVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2godHQpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVG9rZW5zLkNIQVJTRVRfU1lNOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLkxUKDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9jaGFyc2V0KGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiQGNoYXJzZXQgbm90IGFsbG93ZWQgaGVyZS5cIiwgdG9rZW4uc3RhcnRMaW5lLCB0b2tlbi5zdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBUb2tlbnMuSU1QT1JUX1NZTTpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS5MVCgxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5faW1wb3J0KGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiQGltcG9ydCBub3QgYWxsb3dlZCBoZXJlLlwiLCB0b2tlbi5zdGFydExpbmUsIHRva2VuLnN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFRva2Vucy5OQU1FU1BBQ0VfU1lNOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLkxUKDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9uYW1lc3BhY2UoZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoXCJAbmFtZXNwYWNlIG5vdCBhbGxvd2VkIGhlcmUuXCIsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLmdldCgpOyAgLy9nZXQgdGhlIGxhc3QgdG9rZW5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5leHBlY3RlZFRva2VuKHRva2VuU3RyZWFtLnRva2VuKCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaChleCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4IGluc3RhbmNlb2YgU3ludGF4RXJyb3IgJiYgIXRoaXMub3B0aW9ucy5zdHJpY3Qpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgICAgIFwiZXJyb3JcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICAgICAgZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICAgIGV4Lm1lc3NhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgICAgIGV4LmxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbDogICAgICAgIGV4LmNvbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBleDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHR0ID0gdG9rZW5TdHJlYW0ucGVlaygpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0dCAhPSBUb2tlbnMuRU9GKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5leHBlY3RlZFRva2VuKHRva2VuU3RyZWFtLnRva2VuKCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZShcImVuZHN0eWxlc2hlZXRcIik7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfY2hhcnNldDogZnVuY3Rpb24oZW1pdCl7XG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIGNoYXJzZXQsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuLFxuICAgICAgICAgICAgICAgICAgICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkNIQVJTRVRfU1lNKSl7XG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbDtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlNUUklORyk7XG5cbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS50b2tlbigpO1xuICAgICAgICAgICAgICAgICAgICBjaGFyc2V0ID0gdG9rZW4udmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5TRU1JQ09MT04pO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbWl0ICE9PSBmYWxzZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgXCJjaGFyc2V0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hhcnNldDpjaGFyc2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGNvbFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfaW1wb3J0OiBmdW5jdGlvbihlbWl0KXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIGltcG9ydFxuICAgICAgICAgICAgICAgICAqICAgOiBJTVBPUlRfU1lNIFMqXG4gICAgICAgICAgICAgICAgICogICAgW1NUUklOR3xVUkldIFMqIG1lZGlhX3F1ZXJ5X2xpc3Q/ICc7JyBTKlxuICAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHR0LFxuICAgICAgICAgICAgICAgICAgICB1cmksXG4gICAgICAgICAgICAgICAgICAgIGltcG9ydFRva2VuLFxuICAgICAgICAgICAgICAgICAgICBtZWRpYUxpc3QgICA9IFtdO1xuXG4gICAgICAgICAgICAgICAgLy9yZWFkIGltcG9ydCBzeW1ib2xcbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLklNUE9SVF9TWU0pO1xuICAgICAgICAgICAgICAgIGltcG9ydFRva2VuID0gdG9rZW5TdHJlYW0udG9rZW4oKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFtUb2tlbnMuU1RSSU5HLCBUb2tlbnMuVVJJXSk7XG5cbiAgICAgICAgICAgICAgICAvL2dyYWIgdGhlIFVSSSB2YWx1ZVxuICAgICAgICAgICAgICAgIHVyaSA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWUucmVwbGFjZSgvXig/OnVybFxcKCk/W1wiJ10/KFteXCInXSs/KVtcIiddP1xcKT8kLywgXCIkMVwiKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICBtZWRpYUxpc3QgPSB0aGlzLl9tZWRpYV9xdWVyeV9saXN0KCk7XG5cbiAgICAgICAgICAgICAgICAvL211c3QgZW5kIHdpdGggYSBzZW1pY29sb25cbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlNFTUlDT0xPTik7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIGlmIChlbWl0ICE9PSBmYWxzZSl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgIFwiaW1wb3J0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICB1cmk6ICAgIHVyaSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lZGlhOiAgbWVkaWFMaXN0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogICBpbXBvcnRUb2tlbi5zdGFydExpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGltcG9ydFRva2VuLnN0YXJ0Q29sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX25hbWVzcGFjZTogZnVuY3Rpb24oZW1pdCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBuYW1lc3BhY2VcbiAgICAgICAgICAgICAgICAgKiAgIDogTkFNRVNQQUNFX1NZTSBTKiBbbmFtZXNwYWNlX3ByZWZpeCBTKl0/IFtTVFJJTkd8VVJJXSBTKiAnOycgUypcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2wsXG4gICAgICAgICAgICAgICAgICAgIHByZWZpeCxcbiAgICAgICAgICAgICAgICAgICAgdXJpO1xuXG4gICAgICAgICAgICAgICAgLy9yZWFkIGltcG9ydCBzeW1ib2xcbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLk5BTUVTUEFDRV9TWU0pO1xuICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0Q29sO1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICAvL2l0J3MgYSBuYW1lc3BhY2UgcHJlZml4IC0gbm8gX25hbWVzcGFjZV9wcmVmaXgoKSBtZXRob2QgYmVjYXVzZSBpdCdzIGp1c3QgYW4gSURFTlRcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLklERU5UKSl7XG4gICAgICAgICAgICAgICAgICAgIHByZWZpeCA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFtUb2tlbnMuU1RSSU5HLCBUb2tlbnMuVVJJXSk7XG4gICAgICAgICAgICAgICAgLyppZiAoIXRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5TVFJJTkcpKXtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5VUkkpO1xuICAgICAgICAgICAgICAgIH0qL1xuXG4gICAgICAgICAgICAgICAgLy9ncmFiIHRoZSBVUkkgdmFsdWVcbiAgICAgICAgICAgICAgICB1cmkgPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlLnJlcGxhY2UoLyg/OnVybFxcKCk/W1wiJ10oW15cIiddKylbXCInXVxcKT8vLCBcIiQxXCIpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIC8vbXVzdCBlbmQgd2l0aCBhIHNlbWljb2xvblxuICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuU0VNSUNPTE9OKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGVtaXQgIT09IGZhbHNlKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgXCJuYW1lc3BhY2VcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICAgICAgdXJpOiAgICB1cmksXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGNvbFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9tZWRpYTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIG1lZGlhXG4gICAgICAgICAgICAgICAgICogICA6IE1FRElBX1NZTSBTKiBtZWRpYV9xdWVyeV9saXN0IFMqICd7JyBTKiBydWxlc2V0KiAnfScgUypcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gICAgID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbCxcbiAgICAgICAgICAgICAgICAgICAgbWVkaWFMaXN0Oy8vICAgICAgID0gW107XG5cbiAgICAgICAgICAgICAgICAvL2xvb2sgZm9yIEBtZWRpYVxuICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuTUVESUFfU1lNKTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbDtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICBtZWRpYUxpc3QgPSB0aGlzLl9tZWRpYV9xdWVyeV9saXN0KCk7XG5cbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLkxCUkFDRSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgXCJzdGFydG1lZGlhXCIsXG4gICAgICAgICAgICAgICAgICAgIG1lZGlhOiAgbWVkaWFMaXN0LFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbDogICAgY29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB3aGlsZSh0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLlBBR0VfU1lNKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3BhZ2UoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLkZPTlRfRkFDRV9TWU0pe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fZm9udF9mYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW5TdHJlYW0ucGVlaygpID09IFRva2Vucy5WSUVXUE9SVF9TWU0pe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdmlld3BvcnQoKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghdGhpcy5fcnVsZXNldCgpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5SQlJBQ0UpO1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmZpcmUoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAgIFwiZW5kbWVkaWFcIixcbiAgICAgICAgICAgICAgICAgICAgbWVkaWE6ICBtZWRpYUxpc3QsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sOiAgICBjb2xcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG5cblxuICAgICAgICAgICAgLy9DU1MzIE1lZGlhIFF1ZXJpZXNcbiAgICAgICAgICAgIF9tZWRpYV9xdWVyeV9saXN0OiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogbWVkaWFfcXVlcnlfbGlzdFxuICAgICAgICAgICAgICAgICAqICAgOiBTKiBbbWVkaWFfcXVlcnkgWyAnLCcgUyogbWVkaWFfcXVlcnkgXSogXT9cbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgbWVkaWFMaXN0ICAgPSBbXTtcblxuXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLklERU5UIHx8IHRva2VuU3RyZWFtLnBlZWsoKSA9PSBUb2tlbnMuTFBBUkVOKXtcbiAgICAgICAgICAgICAgICAgICAgbWVkaWFMaXN0LnB1c2godGhpcy5fbWVkaWFfcXVlcnkoKSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgd2hpbGUodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkNPTU1BKSl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIG1lZGlhTGlzdC5wdXNoKHRoaXMuX21lZGlhX3F1ZXJ5KCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBtZWRpYUxpc3Q7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgICogTm90ZTogXCJleHByZXNzaW9uXCIgaW4gdGhlIGdyYW1tYXIgbWFwcyB0byB0aGUgX21lZGlhX2V4cHJlc3Npb25cbiAgICAgICAgICAgICAqIG1ldGhvZC5cblxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBfbWVkaWFfcXVlcnk6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBtZWRpYV9xdWVyeVxuICAgICAgICAgICAgICAgICAqICAgOiBbT05MWSB8IE5PVF0/IFMqIG1lZGlhX3R5cGUgUyogWyBBTkQgUyogZXhwcmVzc2lvbiBdKlxuICAgICAgICAgICAgICAgICAqICAgfCBleHByZXNzaW9uIFsgQU5EIFMqIGV4cHJlc3Npb24gXSpcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBpZGVudCAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuICAgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbnMgPSBbXTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuSURFTlQpKXtcbiAgICAgICAgICAgICAgICAgICAgaWRlbnQgPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy9zaW5jZSB0aGVyZSdzIG5vIGN1c3RvbSB0b2tlbnMgZm9yIHRoZXNlLCBuZWVkIHRvIG1hbnVhbGx5IGNoZWNrXG4gICAgICAgICAgICAgICAgICAgIGlmIChpZGVudCAhPSBcIm9ubHlcIiAmJiBpZGVudCAhPSBcIm5vdFwiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLnVuZ2V0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZGVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLnBlZWsoKSA9PSBUb2tlbnMuSURFTlQpe1xuICAgICAgICAgICAgICAgICAgICB0eXBlID0gdGhpcy5fbWVkaWFfdHlwZSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gPT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS50b2tlbigpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLkxQQVJFTil7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLkxUKDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb25zLnB1c2godGhpcy5fbWVkaWFfZXhwcmVzc2lvbigpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodHlwZSA9PT0gbnVsbCAmJiBleHByZXNzaW9ucy5sZW5ndGggPT09IDApe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLklERU5UKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZS50b0xvd2VyQ2FzZSgpICE9IFwiYW5kXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3VuZXhwZWN0ZWRUb2tlbih0b2tlblN0cmVhbS50b2tlbigpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb25zLnB1c2godGhpcy5fbWVkaWFfZXhwcmVzc2lvbigpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgTWVkaWFRdWVyeShpZGVudCwgdHlwZSwgZXhwcmVzc2lvbnMsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIE1lZGlhIFF1ZXJpZXNcbiAgICAgICAgICAgIF9tZWRpYV90eXBlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogbWVkaWFfdHlwZVxuICAgICAgICAgICAgICAgICAqICAgOiBJREVOVFxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLl9tZWRpYV9mZWF0dXJlKCk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIE5vdGU6IGluIENTUzMgTWVkaWEgUXVlcmllcywgdGhpcyBpcyBjYWxsZWQgXCJleHByZXNzaW9uXCIuXG4gICAgICAgICAgICAgKiBSZW5hbWVkIGhlcmUgdG8gYXZvaWQgY29uZmxpY3Qgd2l0aCBDU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgICogZGVmaW5pdGlvbiBvZiBcImV4cHJlc3Npb25cIi4gQWxzbyBub3RlIHRoYXQgXCJleHByXCIgaW4gdGhlXG4gICAgICAgICAgICAgKiBncmFtbWFyIG5vdyBtYXBzIHRvIFwiZXhwcmVzc2lvblwiIGZyb20gQ1NTMyBzZWxlY3RvcnMuXG4gICAgICAgICAgICAgKiBAbWV0aG9kIF9tZWRpYV9leHByZXNzaW9uXG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBfbWVkaWFfZXhwcmVzc2lvbjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIGV4cHJlc3Npb25cbiAgICAgICAgICAgICAgICAgKiAgOiAnKCcgUyogbWVkaWFfZmVhdHVyZSBTKiBbICc6JyBTKiBleHByIF0/ICcpJyBTKlxuICAgICAgICAgICAgICAgICAqICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIGZlYXR1cmUgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4sXG4gICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb24gID0gbnVsbDtcblxuICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuTFBBUkVOKTtcblxuICAgICAgICAgICAgICAgIGZlYXR1cmUgPSB0aGlzLl9tZWRpYV9mZWF0dXJlKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuQ09MT04pKXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS5MVCgxKTtcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbiA9IHRoaXMuX2V4cHJlc3Npb24oKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlJQQVJFTik7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgTWVkaWFGZWF0dXJlKGZlYXR1cmUsIChleHByZXNzaW9uID8gbmV3IFN5bnRheFVuaXQoZXhwcmVzc2lvbiwgdG9rZW4uc3RhcnRMaW5lLCB0b2tlbi5zdGFydENvbCkgOiBudWxsKSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvL0NTUzMgTWVkaWEgUXVlcmllc1xuICAgICAgICAgICAgX21lZGlhX2ZlYXR1cmU6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBtZWRpYV9mZWF0dXJlXG4gICAgICAgICAgICAgICAgICogICA6IElERU5UXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW07XG5cbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLklERU5UKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBTeW50YXhVbml0LmZyb21Ub2tlbih0b2tlblN0cmVhbS50b2tlbigpKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBQYWdlZCBNZWRpYVxuICAgICAgICAgICAgX3BhZ2U6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBwYWdlOlxuICAgICAgICAgICAgICAgICAqICAgIFBBR0VfU1lNIFMqIElERU5UPyBwc2V1ZG9fcGFnZT8gUypcbiAgICAgICAgICAgICAgICAgKiAgICAneycgUyogWyBkZWNsYXJhdGlvbiB8IG1hcmdpbiBdPyBbICc7JyBTKiBbIGRlY2xhcmF0aW9uIHwgbWFyZ2luIF0/IF0qICd9JyBTKlxuICAgICAgICAgICAgICAgICAqICAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sLFxuICAgICAgICAgICAgICAgICAgICBpZGVudGlmaWVyICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHBzZXVkb1BhZ2UgID0gbnVsbDtcblxuICAgICAgICAgICAgICAgIC8vbG9vayBmb3IgQHBhZ2VcbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlBBR0VfU1lNKTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbDtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLklERU5UKSl7XG4gICAgICAgICAgICAgICAgICAgIGlkZW50aWZpZXIgPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vVGhlIHZhbHVlICdhdXRvJyBtYXkgbm90IGJlIHVzZWQgYXMgYSBwYWdlIG5hbWUgYW5kIE1VU1QgYmUgdHJlYXRlZCBhcyBhIHN5bnRheCBlcnJvci5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlkZW50aWZpZXIudG9Mb3dlckNhc2UoKSA9PT0gXCJhdXRvXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5leHBlY3RlZFRva2VuKHRva2VuU3RyZWFtLnRva2VuKCkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9zZWUgaWYgdGhlcmUncyBhIGNvbG9uIHVwY29taW5nXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLnBlZWsoKSA9PSBUb2tlbnMuQ09MT04pe1xuICAgICAgICAgICAgICAgICAgICBwc2V1ZG9QYWdlID0gdGhpcy5fcHNldWRvX3BhZ2UoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcInN0YXJ0cGFnZVwiLFxuICAgICAgICAgICAgICAgICAgICBpZDogICAgIGlkZW50aWZpZXIsXG4gICAgICAgICAgICAgICAgICAgIHBzZXVkbzogcHNldWRvUGFnZSxcbiAgICAgICAgICAgICAgICAgICAgbGluZTogICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGNvbFxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZERlY2xhcmF0aW9ucyh0cnVlLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgXCJlbmRwYWdlXCIsXG4gICAgICAgICAgICAgICAgICAgIGlkOiAgICAgaWRlbnRpZmllcixcbiAgICAgICAgICAgICAgICAgICAgcHNldWRvOiBwc2V1ZG9QYWdlLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbDogICAgY29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBQYWdlZCBNZWRpYVxuICAgICAgICAgICAgX21hcmdpbjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIG1hcmdpbiA6XG4gICAgICAgICAgICAgICAgICogICAgbWFyZ2luX3N5bSBTKiAneycgZGVjbGFyYXRpb24gWyAnOycgUyogZGVjbGFyYXRpb24/IF0qICd9JyBTKlxuICAgICAgICAgICAgICAgICAqICAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sLFxuICAgICAgICAgICAgICAgICAgICBtYXJnaW5TeW0gICA9IHRoaXMuX21hcmdpbl9zeW0oKTtcblxuICAgICAgICAgICAgICAgIGlmIChtYXJnaW5TeW0pe1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgIGNvbCA9IHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2w7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RhcnRwYWdlbWFyZ2luXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXJnaW46IG1hcmdpblN5bSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbDogICAgY29sXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWREZWNsYXJhdGlvbnModHJ1ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6IFwiZW5kcGFnZW1hcmdpblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWFyZ2luOiBtYXJnaW5TeW0sXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGNvbFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBQYWdlZCBNZWRpYVxuICAgICAgICAgICAgX21hcmdpbl9zeW06IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIG1hcmdpbl9zeW0gOlxuICAgICAgICAgICAgICAgICAqICAgIFRPUExFRlRDT1JORVJfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBUT1BMRUZUX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgVE9QQ0VOVEVSX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgVE9QUklHSFRfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBUT1BSSUdIVENPUk5FUl9TWU0gfFxuICAgICAgICAgICAgICAgICAqICAgIEJPVFRPTUxFRlRDT1JORVJfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBCT1RUT01MRUZUX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgQk9UVE9NQ0VOVEVSX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgQk9UVE9NUklHSFRfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBCT1RUT01SSUdIVENPUk5FUl9TWU0gfFxuICAgICAgICAgICAgICAgICAqICAgIExFRlRUT1BfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBMRUZUTUlERExFX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgTEVGVEJPVFRPTV9TWU0gfFxuICAgICAgICAgICAgICAgICAqICAgIFJJR0hUVE9QX1NZTSB8XG4gICAgICAgICAgICAgICAgICogICAgUklHSFRNSURETEVfU1lNIHxcbiAgICAgICAgICAgICAgICAgKiAgICBSSUdIVEJPVFRPTV9TWU1cbiAgICAgICAgICAgICAgICAgKiAgICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbTtcblxuICAgICAgICAgICAgICAgIGlmKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuVE9QTEVGVENPUk5FUl9TWU0sIFRva2Vucy5UT1BMRUZUX1NZTSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5UT1BDRU5URVJfU1lNLCBUb2tlbnMuVE9QUklHSFRfU1lNLCBUb2tlbnMuVE9QUklHSFRDT1JORVJfU1lNLFxuICAgICAgICAgICAgICAgICAgICAgICAgVG9rZW5zLkJPVFRPTUxFRlRDT1JORVJfU1lNLCBUb2tlbnMuQk9UVE9NTEVGVF9TWU0sXG4gICAgICAgICAgICAgICAgICAgICAgICBUb2tlbnMuQk9UVE9NQ0VOVEVSX1NZTSwgVG9rZW5zLkJPVFRPTVJJR0hUX1NZTSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5CT1RUT01SSUdIVENPUk5FUl9TWU0sIFRva2Vucy5MRUZUVE9QX1NZTSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5MRUZUTUlERExFX1NZTSwgVG9rZW5zLkxFRlRCT1RUT01fU1lNLCBUb2tlbnMuUklHSFRUT1BfU1lNLFxuICAgICAgICAgICAgICAgICAgICAgICAgVG9rZW5zLlJJR0hUTUlERExFX1NZTSwgVG9rZW5zLlJJR0hUQk9UVE9NX1NZTV0pKVxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFN5bnRheFVuaXQuZnJvbVRva2VuKHRva2VuU3RyZWFtLnRva2VuKCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX3BzZXVkb19wYWdlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogcHNldWRvX3BhZ2VcbiAgICAgICAgICAgICAgICAgKiAgIDogJzonIElERU5UXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbTtcblxuICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuQ09MT04pO1xuICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuSURFTlQpO1xuXG4gICAgICAgICAgICAgICAgLy9UT0RPOiBDU1MzIFBhZ2VkIE1lZGlhIHNheXMgb25seSBcImxlZnRcIiwgXCJjZW50ZXJcIiwgYW5kIFwicmlnaHRcIiBhcmUgYWxsb3dlZFxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfZm9udF9mYWNlOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogZm9udF9mYWNlXG4gICAgICAgICAgICAgICAgICogICA6IEZPTlRfRkFDRV9TWU0gUypcbiAgICAgICAgICAgICAgICAgKiAgICAgJ3snIFMqIGRlY2xhcmF0aW9uIFsgJzsnIFMqIGRlY2xhcmF0aW9uIF0qICd9JyBTKlxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w7XG5cbiAgICAgICAgICAgICAgICAvL2xvb2sgZm9yIEBwYWdlXG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5GT05UX0ZBQ0VfU1lNKTtcbiAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbDtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmZpcmUoe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAgIFwic3RhcnRmb250ZmFjZVwiLFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbDogICAgY29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkRGVjbGFyYXRpb25zKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcImVuZGZvbnRmYWNlXCIsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sOiAgICBjb2xcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF92aWV3cG9ydDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHZpZXdwb3J0XG4gICAgICAgICAgICAgICAgICogICA6IFZJRVdQT1JUX1NZTSBTKlxuICAgICAgICAgICAgICAgICAqICAgICAneycgUyogZGVjbGFyYXRpb24/IFsgJzsnIFMqIGRlY2xhcmF0aW9uPyBdKiAnfScgUypcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbDtcblxuICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlZJRVdQT1JUX1NZTSk7XG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbDtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgIFwic3RhcnR2aWV3cG9ydFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sOiAgICBjb2xcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZERlY2xhcmF0aW9ucyh0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcImVuZHZpZXdwb3J0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGNvbFxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX29wZXJhdG9yOiBmdW5jdGlvbihpbkZ1bmN0aW9uKXtcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogb3BlcmF0b3IgKG91dHNpZGUgZnVuY3Rpb24pXG4gICAgICAgICAgICAgICAgICogIDogJy8nIFMqIHwgJywnIFMqIHwgLyggZW1wdHkgKS9cbiAgICAgICAgICAgICAgICAgKiBvcGVyYXRvciAoaW5zaWRlIGZ1bmN0aW9uKVxuICAgICAgICAgICAgICAgICAqICA6ICcvJyBTKiB8ICcrJyBTKiB8ICcqJyBTKiB8ICctJyBTKiAvKCBlbXB0eSApL1xuICAgICAgICAgICAgICAgICAqICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gICAgICAgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuU0xBU0gsIFRva2Vucy5DT01NQV0pIHx8XG4gICAgICAgICAgICAgICAgICAgIChpbkZ1bmN0aW9uICYmIHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuUExVUywgVG9rZW5zLlNUQVIsIFRva2Vucy5NSU5VU10pKSl7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gIHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbiA/IFByb3BlcnR5VmFsdWVQYXJ0LmZyb21Ub2tlbih0b2tlbikgOiBudWxsO1xuXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfY29tYmluYXRvcjogZnVuY3Rpb24oKXtcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogY29tYmluYXRvclxuICAgICAgICAgICAgICAgICAqICA6IFBMVVMgUyogfCBHUkVBVEVSIFMqIHwgVElMREUgUyogfCBTK1xuICAgICAgICAgICAgICAgICAqICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgICAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICB0b2tlbjtcblxuICAgICAgICAgICAgICAgIGlmKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuUExVUywgVG9rZW5zLkdSRUFURVIsIFRva2Vucy5USUxERV0pKXtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS50b2tlbigpO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IG5ldyBDb21iaW5hdG9yKHRva2VuLnZhbHVlLCB0b2tlbi5zdGFydExpbmUsIHRva2VuLnN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfdW5hcnlfb3BlcmF0b3I6IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHVuYXJ5X29wZXJhdG9yXG4gICAgICAgICAgICAgICAgICogIDogJy0nIHwgJysnXG4gICAgICAgICAgICAgICAgICogIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuTUlOVVMsIFRva2Vucy5QTFVTXSkpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfcHJvcGVydHk6IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHByb3BlcnR5XG4gICAgICAgICAgICAgICAgICogICA6IElERU5UIFMqXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgICAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBoYWNrICAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIHRva2VuLFxuICAgICAgICAgICAgICAgICAgICBsaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w7XG5cbiAgICAgICAgICAgICAgICAvL2NoZWNrIGZvciBzdGFyIGhhY2sgLSB0aHJvd3MgZXJyb3IgaWYgbm90IGFsbG93ZWRcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ucGVlaygpID09IFRva2Vucy5TVEFSICYmIHRoaXMub3B0aW9ucy5zdGFySGFjayl7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLmdldCgpO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIGhhY2sgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IHRva2VuLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICAgICAgY29sID0gdG9rZW4uc3RhcnRDb2w7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLklERU5UKSl7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gdG9rZW5TdHJlYW0udG9rZW4oKTtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5WYWx1ZSA9IHRva2VuLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vY2hlY2sgZm9yIHVuZGVyc2NvcmUgaGFjayAtIG5vIGVycm9yIGlmIG5vdCBhbGxvd2VkIGJlY2F1c2UgaXQncyB2YWxpZCBDU1Mgc3ludGF4XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlblZhbHVlLmNoYXJBdCgwKSA9PSBcIl9cIiAmJiB0aGlzLm9wdGlvbnMudW5kZXJzY29yZUhhY2spe1xuICAgICAgICAgICAgICAgICAgICAgICAgaGFjayA9IFwiX1wiO1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5WYWx1ZSA9IHRva2VuVmFsdWUuc3Vic3RyaW5nKDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBuZXcgUHJvcGVydHlOYW1lKHRva2VuVmFsdWUsIGhhY2ssIChsaW5lfHx0b2tlbi5zdGFydExpbmUpLCAoY29sfHx0b2tlbi5zdGFydENvbCkpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQXVnbWVudGVkIHdpdGggQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9ydWxlc2V0OiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogcnVsZXNldFxuICAgICAgICAgICAgICAgICAqICAgOiBzZWxlY3RvcnNfZ3JvdXBcbiAgICAgICAgICAgICAgICAgKiAgICAgJ3snIFMqIGRlY2xhcmF0aW9uPyBbICc7JyBTKiBkZWNsYXJhdGlvbj8gXSogJ30nIFMqXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdHQsXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdG9ycztcblxuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBFcnJvciBSZWNvdmVyeTogSWYgZXZlbiBhIHNpbmdsZSBzZWxlY3RvciBmYWlscyB0byBwYXJzZSxcbiAgICAgICAgICAgICAgICAgKiB0aGVuIHRoZSBlbnRpcmUgcnVsZXNldCBzaG91bGQgYmUgdGhyb3duIGF3YXkuXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3JzID0gdGhpcy5fc2VsZWN0b3JzX2dyb3VwKCk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXgpe1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXggaW5zdGFuY2VvZiBTeW50YXhFcnJvciAmJiAhdGhpcy5vcHRpb25zLnN0cmljdCl7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZmlyZSBlcnJvciBldmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgICAgICBcImVycm9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICAgICAgZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogICAgZXgubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiAgICAgICBleC5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbDogICAgICAgIGV4LmNvbFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vc2tpcCBvdmVyIGV2ZXJ5dGhpbmcgdW50aWwgY2xvc2luZyBicmFjZVxuICAgICAgICAgICAgICAgICAgICAgICAgdHQgPSB0b2tlblN0cmVhbS5hZHZhbmNlKFtUb2tlbnMuUkJSQUNFXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHQgPT0gVG9rZW5zLlJCUkFDRSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9pZiB0aGVyZSdzIGEgcmlnaHQgYnJhY2UsIHRoZSBydWxlIGlzIGZpbmlzaGVkIHNvIGRvbid0IGRvIGFueXRoaW5nXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vb3RoZXJ3aXNlLCByZXRocm93IHRoZSBlcnJvciBiZWNhdXNlIGl0IHdhc24ndCBoYW5kbGVkIHByb3Blcmx5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vbm90IGEgc3ludGF4IGVycm9yLCByZXRocm93IGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBleDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vdHJpZ2dlciBwYXJzZXIgdG8gY29udGludWVcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9pZiBpdCBnb3QgaGVyZSwgYWxsIHNlbGVjdG9ycyBwYXJzZWRcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0b3JzKXtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpcmUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogICAgICAgXCJzdGFydHJ1bGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yczogIHNlbGVjdG9ycyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgICAgIHNlbGVjdG9yc1swXS5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sOiAgICAgICAgc2VsZWN0b3JzWzBdLmNvbFxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkRGVjbGFyYXRpb25zKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgICAgICBcImVuZHJ1bGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yczogIHNlbGVjdG9ycyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgICAgIHNlbGVjdG9yc1swXS5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sOiAgICAgICAgc2VsZWN0b3JzWzBdLmNvbFxuICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxlY3RvcnM7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9zZWxlY3RvcnNfZ3JvdXA6IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHNlbGVjdG9yc19ncm91cFxuICAgICAgICAgICAgICAgICAqICAgOiBzZWxlY3RvciBbIENPTU1BIFMqIHNlbGVjdG9yIF0qXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdG9ycyAgID0gW10sXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yO1xuXG4gICAgICAgICAgICAgICAgc2VsZWN0b3IgPSB0aGlzLl9zZWxlY3RvcigpO1xuICAgICAgICAgICAgICAgIGlmIChzZWxlY3RvciAhPT0gbnVsbCl7XG5cbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3JzLnB1c2goc2VsZWN0b3IpO1xuICAgICAgICAgICAgICAgICAgICB3aGlsZSh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuQ09NTUEpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvciA9IHRoaXMuX3NlbGVjdG9yKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZWN0b3IgIT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9ycy5wdXNoKHNlbGVjdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5leHBlY3RlZFRva2VuKHRva2VuU3RyZWFtLkxUKDEpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxlY3RvcnMubGVuZ3RoID8gc2VsZWN0b3JzIDogbnVsbDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9zZWxlY3RvcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICogICA6IHNpbXBsZV9zZWxlY3Rvcl9zZXF1ZW5jZSBbIGNvbWJpbmF0b3Igc2ltcGxlX3NlbGVjdG9yX3NlcXVlbmNlIF0qXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3IgICAgPSBbXSxcbiAgICAgICAgICAgICAgICAgICAgbmV4dFNlbGVjdG9yID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY29tYmluYXRvciAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICB3cyAgICAgICAgICA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICAvL2lmIHRoZXJlJ3Mgbm8gc2ltcGxlIHNlbGVjdG9yLCB0aGVuIHRoZXJlJ3Mgbm8gc2VsZWN0b3JcbiAgICAgICAgICAgICAgICBuZXh0U2VsZWN0b3IgPSB0aGlzLl9zaW1wbGVfc2VsZWN0b3Jfc2VxdWVuY2UoKTtcbiAgICAgICAgICAgICAgICBpZiAobmV4dFNlbGVjdG9yID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc2VsZWN0b3IucHVzaChuZXh0U2VsZWN0b3IpO1xuXG4gICAgICAgICAgICAgICAgZG8ge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vbG9vayBmb3IgYSBjb21iaW5hdG9yXG4gICAgICAgICAgICAgICAgICAgIGNvbWJpbmF0b3IgPSB0aGlzLl9jb21iaW5hdG9yKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbWJpbmF0b3IgIT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3IucHVzaChjb21iaW5hdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5leHRTZWxlY3RvciA9IHRoaXMuX3NpbXBsZV9zZWxlY3Rvcl9zZXF1ZW5jZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL3RoZXJlIG11c3QgYmUgYSBuZXh0IHNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobmV4dFNlbGVjdG9yID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl91bmV4cGVjdGVkVG9rZW4odG9rZW5TdHJlYW0uTFQoMSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vbmV4dFNlbGVjdG9yIGlzIGFuIGluc3RhbmNlIG9mIFNlbGVjdG9yUGFydFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yLnB1c2gobmV4dFNlbGVjdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9pZiB0aGVyZSdzIG5vdCB3aGl0ZXNwYWNlLCB3ZSdyZSBkb25lXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fcmVhZFdoaXRlc3BhY2UoKSl7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL2FkZCB3aGl0ZXNwYWNlIHNlcGFyYXRvclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdzID0gbmV3IENvbWJpbmF0b3IodG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZSwgdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmUsIHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2wpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9jb21iaW5hdG9yIGlzIG5vdCByZXF1aXJlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbWJpbmF0b3IgPSB0aGlzLl9jb21iaW5hdG9yKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3NlbGVjdG9yIGlzIHJlcXVpcmVkIGlmIHRoZXJlJ3MgYSBjb21iaW5hdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dFNlbGVjdG9yID0gdGhpcy5fc2ltcGxlX3NlbGVjdG9yX3NlcXVlbmNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5leHRTZWxlY3RvciA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21iaW5hdG9yICE9PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3VuZXhwZWN0ZWRUb2tlbih0b2tlblN0cmVhbS5MVCgxKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21iaW5hdG9yICE9PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yLnB1c2goY29tYmluYXRvcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rvci5wdXNoKHdzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdG9yLnB1c2gobmV4dFNlbGVjdG9yKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBTZWxlY3RvcihzZWxlY3Rvciwgc2VsZWN0b3JbMF0ubGluZSwgc2VsZWN0b3JbMF0uY29sKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9zaW1wbGVfc2VsZWN0b3Jfc2VxdWVuY2U6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBzaW1wbGVfc2VsZWN0b3Jfc2VxdWVuY2VcbiAgICAgICAgICAgICAgICAgKiAgIDogWyB0eXBlX3NlbGVjdG9yIHwgdW5pdmVyc2FsIF1cbiAgICAgICAgICAgICAgICAgKiAgICAgWyBIQVNIIHwgY2xhc3MgfCBhdHRyaWIgfCBwc2V1ZG8gfCBuZWdhdGlvbiBdKlxuICAgICAgICAgICAgICAgICAqICAgfCBbIEhBU0ggfCBjbGFzcyB8IGF0dHJpYiB8IHBzZXVkbyB8IG5lZ2F0aW9uIF0rXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcblxuICAgICAgICAgICAgICAgICAgICAvL3BhcnRzIG9mIGEgc2ltcGxlIHNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnROYW1lID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZXJzICAgPSBbXSxcblxuICAgICAgICAgICAgICAgICAgICAvL2NvbXBsZXRlIHNlbGVjdG9yIHRleHRcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3JUZXh0PSBcIlwiLFxuXG4gICAgICAgICAgICAgICAgICAgIC8vdGhlIGRpZmZlcmVudCBwYXJ0cyBhZnRlciB0aGUgZWxlbWVudCBuYW1lIHRvIHNlYXJjaCBmb3JcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50cyAgPSBbXG4gICAgICAgICAgICAgICAgICAgICAgICAvL0hBU0hcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5IQVNIKSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgU2VsZWN0b3JTdWJQYXJ0KHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWUsIFwiaWRcIiwgdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmUsIHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2wpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fY2xhc3MsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9hdHRyaWIsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9wc2V1ZG8sXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9uZWdhdGlvblxuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICBpICAgICAgICAgICA9IDAsXG4gICAgICAgICAgICAgICAgICAgIGxlbiAgICAgICAgID0gY29tcG9uZW50cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudCAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sO1xuXG5cbiAgICAgICAgICAgICAgICAvL2dldCBzdGFydGluZyBsaW5lIGFuZCBjb2x1bW4gZm9yIHRoZSBzZWxlY3RvclxuICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS5MVCgxKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0uTFQoMSkuc3RhcnRDb2w7XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50TmFtZSA9IHRoaXMuX3R5cGVfc2VsZWN0b3IoKTtcbiAgICAgICAgICAgICAgICBpZiAoIWVsZW1lbnROYW1lKXtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudE5hbWUgPSB0aGlzLl91bml2ZXJzYWwoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZWxlbWVudE5hbWUgIT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3RvclRleHQgKz0gZWxlbWVudE5hbWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgd2hpbGUodHJ1ZSl7XG5cbiAgICAgICAgICAgICAgICAgICAgLy93aGl0ZXNwYWNlIG1lYW5zIHdlJ3JlIGRvbmVcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLnBlZWsoKSA9PT0gVG9rZW5zLlMpe1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvL2NoZWNrIGZvciBlYWNoIGNvbXBvbmVudFxuICAgICAgICAgICAgICAgICAgICB3aGlsZShpIDwgbGVuICYmIGNvbXBvbmVudCA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQgPSBjb21wb25lbnRzW2krK10uY2FsbCh0aGlzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnQgPT09IG51bGwpe1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL3dlIGRvbid0IGhhdmUgYSBzZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGVjdG9yVGV4dCA9PT0gXCJcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllcnMucHVzaChjb21wb25lbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3JUZXh0ICs9IGNvbXBvbmVudC50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlbGVjdG9yVGV4dCAhPT0gXCJcIiA/XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgU2VsZWN0b3JQYXJ0KGVsZW1lbnROYW1lLCBtb2RpZmllcnMsIHNlbGVjdG9yVGV4dCwgbGluZSwgY29sKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICBudWxsO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX3R5cGVfc2VsZWN0b3I6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiB0eXBlX3NlbGVjdG9yXG4gICAgICAgICAgICAgICAgICogICA6IFsgbmFtZXNwYWNlX3ByZWZpeCBdPyBlbGVtZW50X25hbWVcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICBucyAgICAgICAgICA9IHRoaXMuX25hbWVzcGFjZV9wcmVmaXgoKSxcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudE5hbWUgPSB0aGlzLl9lbGVtZW50X25hbWUoKTtcblxuICAgICAgICAgICAgICAgIGlmICghZWxlbWVudE5hbWUpe1xuICAgICAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAgICAgKiBOZWVkIHRvIGJhY2sgb3V0IHRoZSBuYW1lc3BhY2UgdGhhdCB3YXMgcmVhZCBkdWUgdG8gYm90aFxuICAgICAgICAgICAgICAgICAgICAgKiB0eXBlX3NlbGVjdG9yIGFuZCB1bml2ZXJzYWwgcmVhZGluZyBuYW1lc3BhY2VfcHJlZml4XG4gICAgICAgICAgICAgICAgICAgICAqIGZpcnN0LiBLaW5kIG9mIGhhY2t5LCBidXQgb25seSB3YXkgSSBjYW4gZmlndXJlIG91dFxuICAgICAgICAgICAgICAgICAgICAgKiByaWdodCBub3cgaG93IHRvIG5vdCBjaGFuZ2UgdGhlIGdyYW1tYXIuXG4gICAgICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAobnMpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0udW5nZXQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChucy5sZW5ndGggPiAxKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS51bmdldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5zKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnROYW1lLnRleHQgPSBucyArIGVsZW1lbnROYW1lLnRleHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50TmFtZS5jb2wgLT0gbnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtZW50TmFtZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvL0NTUzMgU2VsZWN0b3JzXG4gICAgICAgICAgICBfY2xhc3M6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBjbGFzc1xuICAgICAgICAgICAgICAgICAqICAgOiAnLicgSURFTlRcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICB0b2tlbjtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuRE9UKSl7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuSURFTlQpO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgU2VsZWN0b3JTdWJQYXJ0KFwiLlwiICsgdG9rZW4udmFsdWUsIFwiY2xhc3NcIiwgdG9rZW4uc3RhcnRMaW5lLCB0b2tlbi5zdGFydENvbCAtIDEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX2VsZW1lbnRfbmFtZTogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIGVsZW1lbnRfbmFtZVxuICAgICAgICAgICAgICAgICAqICAgOiBJREVOVFxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHRva2VuO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5JREVOVCkpe1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgU2VsZWN0b3JTdWJQYXJ0KHRva2VuLnZhbHVlLCBcImVsZW1lbnROYW1lXCIsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX25hbWVzcGFjZV9wcmVmaXg6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBuYW1lc3BhY2VfcHJlZml4XG4gICAgICAgICAgICAgICAgICogICA6IFsgSURFTlQgfCAnKicgXT8gJ3wnXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICAgICAgID0gXCJcIjtcblxuICAgICAgICAgICAgICAgIC8vdmVyaWZ5IHRoYXQgdGhpcyBpcyBhIG5hbWVzcGFjZSBwcmVmaXhcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0uTEEoMSkgPT09IFRva2Vucy5QSVBFIHx8IHRva2VuU3RyZWFtLkxBKDIpID09PSBUb2tlbnMuUElQRSl7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYodG9rZW5TdHJlYW0ubWF0Y2goW1Rva2Vucy5JREVOVCwgVG9rZW5zLlNUQVJdKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5QSVBFKTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gXCJ8XCI7XG5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUubGVuZ3RoID8gdmFsdWUgOiBudWxsO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX3VuaXZlcnNhbDogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHVuaXZlcnNhbFxuICAgICAgICAgICAgICAgICAqICAgOiBbIG5hbWVzcGFjZV9wcmVmaXggXT8gJyonXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICAgICAgID0gXCJcIixcbiAgICAgICAgICAgICAgICAgICAgbnM7XG5cbiAgICAgICAgICAgICAgICBucyA9IHRoaXMuX25hbWVzcGFjZV9wcmVmaXgoKTtcbiAgICAgICAgICAgICAgICBpZihucyl7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IG5zO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmKHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5TVEFSKSl7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IFwiKlwiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5sZW5ndGggPyB2YWx1ZSA6IG51bGw7XG5cbiAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX2F0dHJpYjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIGF0dHJpYlxuICAgICAgICAgICAgICAgICAqICAgOiAnWycgUyogWyBuYW1lc3BhY2VfcHJlZml4IF0/IElERU5UIFMqXG4gICAgICAgICAgICAgICAgICogICAgICAgICBbIFsgUFJFRklYTUFUQ0ggfFxuICAgICAgICAgICAgICAgICAqICAgICAgICAgICAgIFNVRkZJWE1BVENIIHxcbiAgICAgICAgICAgICAgICAgKiAgICAgICAgICAgICBTVUJTVFJJTkdNQVRDSCB8XG4gICAgICAgICAgICAgICAgICogICAgICAgICAgICAgJz0nIHxcbiAgICAgICAgICAgICAgICAgKiAgICAgICAgICAgICBJTkNMVURFUyB8XG4gICAgICAgICAgICAgICAgICogICAgICAgICAgICAgREFTSE1BVENIIF0gUyogWyBJREVOVCB8IFNUUklORyBdIFMqXG4gICAgICAgICAgICAgICAgICogICAgICAgICBdPyAnXSdcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIG5zLFxuICAgICAgICAgICAgICAgICAgICB0b2tlbjtcblxuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuTEJSQUNLRVQpKXtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS50b2tlbigpO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgIG5zID0gdGhpcy5fbmFtZXNwYWNlX3ByZWZpeCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChucyl7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSBucztcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuSURFTlQpO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuUFJFRklYTUFUQ0gsIFRva2Vucy5TVUZGSVhNQVRDSCwgVG9rZW5zLlNVQlNUUklOR01BVENILFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5FUVVBTFMsIFRva2Vucy5JTkNMVURFUywgVG9rZW5zLkRBU0hNQVRDSF0pKXtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChbVG9rZW5zLklERU5ULCBUb2tlbnMuU1RSSU5HXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuUkJSQUNLRVQpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgU2VsZWN0b3JTdWJQYXJ0KHZhbHVlICsgXCJdXCIsIFwiYXR0cmlidXRlXCIsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9wc2V1ZG86IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHBzZXVkb1xuICAgICAgICAgICAgICAgICAqICAgOiAnOicgJzonPyBbIElERU5UIHwgZnVuY3Rpb25hbF9wc2V1ZG8gXVxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHBzZXVkbyAgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY29sb25zICAgICAgPSBcIjpcIixcbiAgICAgICAgICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5DT0xPTikpe1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuQ09MT04pKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbG9ucyArPSBcIjpcIjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuSURFTlQpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBzZXVkbyA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0Q29sIC0gY29sb25zLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlblN0cmVhbS5wZWVrKCkgPT0gVG9rZW5zLkZVTkNUSU9OKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS5MVCgxKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS5MVCgxKS5zdGFydENvbCAtIGNvbG9ucy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBwc2V1ZG8gPSB0aGlzLl9mdW5jdGlvbmFsX3BzZXVkbygpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHBzZXVkbyl7XG4gICAgICAgICAgICAgICAgICAgICAgICBwc2V1ZG8gPSBuZXcgU2VsZWN0b3JTdWJQYXJ0KGNvbG9ucyArIHBzZXVkbywgXCJwc2V1ZG9cIiwgbGluZSwgY29sKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBwc2V1ZG87XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvL0NTUzMgU2VsZWN0b3JzXG4gICAgICAgICAgICBfZnVuY3Rpb25hbF9wc2V1ZG86IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBmdW5jdGlvbmFsX3BzZXVkb1xuICAgICAgICAgICAgICAgICAqICAgOiBGVU5DVElPTiBTKiBleHByZXNzaW9uICcpJ1xuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgaWYodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkZVTkNUSU9OKSl7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gdGhpcy5fZXhwcmVzc2lvbigpO1xuICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlJQQVJFTik7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IFwiKVwiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9leHByZXNzaW9uOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogZXhwcmVzc2lvblxuICAgICAgICAgICAgICAgICAqICAgOiBbIFsgUExVUyB8ICctJyB8IERJTUVOU0lPTiB8IE5VTUJFUiB8IFNUUklORyB8IElERU5UIF0gUyogXStcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSAgICAgICA9IFwiXCI7XG5cbiAgICAgICAgICAgICAgICB3aGlsZSh0b2tlblN0cmVhbS5tYXRjaChbVG9rZW5zLlBMVVMsIFRva2Vucy5NSU5VUywgVG9rZW5zLkRJTUVOU0lPTixcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5OVU1CRVIsIFRva2Vucy5TVFJJTkcsIFRva2Vucy5JREVOVCwgVG9rZW5zLkxFTkdUSCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5GUkVRLCBUb2tlbnMuQU5HTEUsIFRva2Vucy5USU1FLFxuICAgICAgICAgICAgICAgICAgICAgICAgVG9rZW5zLlJFU09MVVRJT04sIFRva2Vucy5TTEFTSF0pKXtcblxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5sZW5ndGggPyB2YWx1ZSA6IG51bGw7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vQ1NTMyBTZWxlY3RvcnNcbiAgICAgICAgICAgIF9uZWdhdGlvbjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIG5lZ2F0aW9uXG4gICAgICAgICAgICAgICAgICogICA6IE5PVCBTKiBuZWdhdGlvbl9hcmcgUyogJyknXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgbGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSAgICAgICA9IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIGFyZyxcbiAgICAgICAgICAgICAgICAgICAgc3VicGFydCAgICAgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5OT1QpKXtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgIGNvbCA9IHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2w7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGFyZyA9IHRoaXMuX25lZ2F0aW9uX2FyZygpO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSBhcmc7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICs9IHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5SUEFSRU4pO1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgIHN1YnBhcnQgPSBuZXcgU2VsZWN0b3JTdWJQYXJ0KHZhbHVlLCBcIm5vdFwiLCBsaW5lLCBjb2wpO1xuICAgICAgICAgICAgICAgICAgICBzdWJwYXJ0LmFyZ3MucHVzaChhcmcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBzdWJwYXJ0O1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy9DU1MzIFNlbGVjdG9yc1xuICAgICAgICAgICAgX25lZ2F0aW9uX2FyZzogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIG5lZ2F0aW9uX2FyZ1xuICAgICAgICAgICAgICAgICAqICAgOiB0eXBlX3NlbGVjdG9yIHwgdW5pdmVyc2FsIHwgSEFTSCB8IGNsYXNzIHwgYXR0cmliIHwgcHNldWRvXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgYXJncyAgICAgICAgPSBbXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl90eXBlX3NlbGVjdG9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdW5pdmVyc2FsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkhBU0gpID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBTZWxlY3RvclN1YlBhcnQodG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZSwgXCJpZFwiLCB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0TGluZSwgdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydENvbCkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9jbGFzcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2F0dHJpYixcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3BzZXVkb1xuICAgICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgICBhcmcgICAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGkgICAgICAgICAgID0gMCxcbiAgICAgICAgICAgICAgICAgICAgbGVuICAgICAgICAgPSBhcmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbCxcbiAgICAgICAgICAgICAgICAgICAgcGFydDtcblxuICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS5MVCgxKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgY29sID0gdG9rZW5TdHJlYW0uTFQoMSkuc3RhcnRDb2w7XG5cbiAgICAgICAgICAgICAgICB3aGlsZShpIDwgbGVuICYmIGFyZyA9PT0gbnVsbCl7XG5cbiAgICAgICAgICAgICAgICAgICAgYXJnID0gYXJnc1tpXS5jYWxsKHRoaXMpO1xuICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9tdXN0IGJlIGEgbmVnYXRpb24gYXJnXG4gICAgICAgICAgICAgICAgaWYgKGFyZyA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3VuZXhwZWN0ZWRUb2tlbih0b2tlblN0cmVhbS5MVCgxKSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9pdCdzIGFuIGVsZW1lbnQgbmFtZVxuICAgICAgICAgICAgICAgIGlmIChhcmcudHlwZSA9PSBcImVsZW1lbnROYW1lXCIpe1xuICAgICAgICAgICAgICAgICAgICBwYXJ0ID0gbmV3IFNlbGVjdG9yUGFydChhcmcsIFtdLCBhcmcudG9TdHJpbmcoKSwgbGluZSwgY29sKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0ID0gbmV3IFNlbGVjdG9yUGFydChudWxsLCBbYXJnXSwgYXJnLnRvU3RyaW5nKCksIGxpbmUsIGNvbCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnQ7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfZGVjbGFyYXRpb246IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIGRlY2xhcmF0aW9uXG4gICAgICAgICAgICAgICAgICogICA6IHByb3BlcnR5ICc6JyBTKiBleHByIHByaW8/XG4gICAgICAgICAgICAgICAgICogICB8IC8oIGVtcHR5ICkvXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHkgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBleHByICAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHByaW8gICAgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IgICAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBpbnZhbGlkICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5TmFtZT0gXCJcIjtcblxuICAgICAgICAgICAgICAgIHByb3BlcnR5ID0gdGhpcy5fcHJvcGVydHkoKTtcbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHkgIT09IG51bGwpe1xuXG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm11c3RNYXRjaChUb2tlbnMuQ09MT04pO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGV4cHIgPSB0aGlzLl9leHByKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy9pZiB0aGVyZSdzIG5vIHBhcnRzIGZvciB0aGUgdmFsdWUsIGl0J3MgYW4gZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFleHByIHx8IGV4cHIubGVuZ3RoID09PSAwKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3VuZXhwZWN0ZWRUb2tlbih0b2tlblN0cmVhbS5MVCgxKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBwcmlvID0gdGhpcy5fcHJpbygpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICAgICAqIElmIGhhY2tzIHNob3VsZCBiZSBhbGxvd2VkLCB0aGVuIG9ubHkgY2hlY2sgdGhlIHJvb3RcbiAgICAgICAgICAgICAgICAgICAgICogcHJvcGVydHkuIElmIGhhY2tzIHNob3VsZCBub3QgYmUgYWxsb3dlZCwgdHJlYXRcbiAgICAgICAgICAgICAgICAgICAgICogX3Byb3BlcnR5IG9yICpwcm9wZXJ0eSBhcyBpbnZhbGlkIHByb3BlcnRpZXMuXG4gICAgICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUgPSBwcm9wZXJ0eS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5vcHRpb25zLnN0YXJIYWNrICYmIHByb3BlcnR5LmhhY2sgPT0gXCIqXCIgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMudW5kZXJzY29yZUhhY2sgJiYgcHJvcGVydHkuaGFjayA9PSBcIl9cIikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUgPSBwcm9wZXJ0eS50ZXh0O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3ZhbGlkYXRlUHJvcGVydHkocHJvcGVydHlOYW1lLCBleHByKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQgPSBleDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgICAgICBcInByb3BlcnR5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogICBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiAgICAgIGV4cHIsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRhbnQ6ICBwcmlvLFxuICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogICAgICAgcHJvcGVydHkubGluZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbDogICAgICAgIHByb3BlcnR5LmNvbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQ6ICAgIGludmFsaWRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9wcmlvOiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogcHJpb1xuICAgICAgICAgICAgICAgICAqICAgOiBJTVBPUlRBTlRfU1lNIFMqXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICAgICAgPSB0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuSU1QT1JUQU5UX1NZTSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfZXhwcjogZnVuY3Rpb24oaW5GdW5jdGlvbil7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBleHByXG4gICAgICAgICAgICAgICAgICogICA6IHRlcm0gWyBvcGVyYXRvciB0ZXJtIF0qXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzICAgICAgPSBbXSxcblx0XHRcdFx0XHQvL3ZhbHVlUGFydHNcdD0gW10sXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlICAgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3IgICAgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLl90ZXJtKGluRnVuY3Rpb24pO1xuICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gbnVsbCl7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yID0gdGhpcy5fb3BlcmF0b3IoaW5GdW5jdGlvbik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBhbiBvcGVyYXRvciwga2VlcCBidWlsZGluZyB1cCB0aGUgdmFsdWUgcGFydHNcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcGVyYXRvcil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gob3BlcmF0b3IpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSAvKmVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBub3QgYW4gb3BlcmF0b3IsIHlvdSBoYXZlIGEgZnVsbCB2YWx1ZVxuXHRcdFx0XHRcdFx0XHR2YWx1ZXMucHVzaChuZXcgUHJvcGVydHlWYWx1ZSh2YWx1ZVBhcnRzLCB2YWx1ZVBhcnRzWzBdLmxpbmUsIHZhbHVlUGFydHNbMF0uY29sKSk7XG5cdFx0XHRcdFx0XHRcdHZhbHVlUGFydHMgPSBbXTtcblx0XHRcdFx0XHRcdH0qL1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMuX3Rlcm0oaW5GdW5jdGlvbik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSh0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG5cblx0XHRcdFx0Ly9jbGVhbnVwXG4gICAgICAgICAgICAgICAgLyppZiAodmFsdWVQYXJ0cy5sZW5ndGgpe1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZXMucHVzaChuZXcgUHJvcGVydHlWYWx1ZSh2YWx1ZVBhcnRzLCB2YWx1ZVBhcnRzWzBdLmxpbmUsIHZhbHVlUGFydHNbMF0uY29sKSk7XG4gICAgICAgICAgICAgICAgfSovXG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWVzLmxlbmd0aCA+IDAgPyBuZXcgUHJvcGVydHlWYWx1ZSh2YWx1ZXMsIHZhbHVlc1swXS5saW5lLCB2YWx1ZXNbMF0uY29sKSA6IG51bGw7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfdGVybTogZnVuY3Rpb24oaW5GdW5jdGlvbil7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIHRlcm1cbiAgICAgICAgICAgICAgICAgKiAgIDogdW5hcnlfb3BlcmF0b3I/XG4gICAgICAgICAgICAgICAgICogICAgIFsgTlVNQkVSIFMqIHwgUEVSQ0VOVEFHRSBTKiB8IExFTkdUSCBTKiB8IEFOR0xFIFMqIHxcbiAgICAgICAgICAgICAgICAgKiAgICAgICBUSU1FIFMqIHwgRlJFUSBTKiB8IGZ1bmN0aW9uIHwgaWVfZnVuY3Rpb24gXVxuICAgICAgICAgICAgICAgICAqICAgfCBTVFJJTkcgUyogfCBJREVOVCBTKiB8IFVSSSBTKiB8IFVOSUNPREVSQU5HRSBTKiB8IGhleGNvbG9yXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdW5hcnkgICAgICAgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGVuZENoYXIgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4sXG4gICAgICAgICAgICAgICAgICAgIGxpbmUsXG4gICAgICAgICAgICAgICAgICAgIGNvbDtcblxuICAgICAgICAgICAgICAgIC8vcmV0dXJucyB0aGUgb3BlcmF0b3Igb3IgbnVsbFxuICAgICAgICAgICAgICAgIHVuYXJ5ID0gdGhpcy5fdW5hcnlfb3BlcmF0b3IoKTtcbiAgICAgICAgICAgICAgICBpZiAodW5hcnkgIT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgIGNvbCA9IHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2w7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy9leGNlcHRpb24gZm9yIElFIGZpbHRlcnNcbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ucGVlaygpID09IFRva2Vucy5JRV9GVU5DVElPTiAmJiB0aGlzLm9wdGlvbnMuaWVGaWx0ZXJzKXtcblxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRoaXMuX2llX2Z1bmN0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bmFyeSA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0Q29sO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL3NlZSBpZiBpdCdzIGEgc2ltcGxlIGJsb2NrXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbkZ1bmN0aW9uICYmIHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuTFBBUkVOLCBUb2tlbnMuTEJSQUNFLCBUb2tlbnMuTEJSQUNLRVRdKSl7XG5cbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0b2tlblN0cmVhbS50b2tlbigpO1xuICAgICAgICAgICAgICAgICAgICBlbmRDaGFyID0gdG9rZW4uZW5kQ2hhcjtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZSArIHRoaXMuX2V4cHIoaW5GdW5jdGlvbikudGV4dDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVuYXJ5ID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbCA9IHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRDb2w7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy50eXBlKGVuZENoYXIpKTtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUgKz0gZW5kQ2hhcjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIC8vc2VlIGlmIHRoZXJlJ3MgYSBzaW1wbGUgbWF0Y2hcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuTlVNQkVSLCBUb2tlbnMuUEVSQ0VOVEFHRSwgVG9rZW5zLkxFTkdUSCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFRva2Vucy5BTkdMRSwgVG9rZW5zLlRJTUUsXG4gICAgICAgICAgICAgICAgICAgICAgICBUb2tlbnMuRlJFUSwgVG9rZW5zLlNUUklORywgVG9rZW5zLklERU5ULCBUb2tlbnMuVVJJLCBUb2tlbnMuVU5JQ09ERV9SQU5HRV0pKXtcblxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGlmICh1bmFyeSA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lID0gdG9rZW5TdHJlYW0udG9rZW4oKS5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0Q29sO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAvL3NlZSBpZiBpdCdzIGEgY29sb3JcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLl9oZXhjb2xvcigpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gPT09IG51bGwpe1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2lmIHRoZXJlJ3Mgbm8gdW5hcnksIGdldCB0aGUgc3RhcnQgb2YgdGhlIG5leHQgdG9rZW4gZm9yIGxpbmUvY29sIGluZm9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1bmFyeSA9PT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZSA9IHRva2VuU3RyZWFtLkxUKDEpLnN0YXJ0TGluZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2wgPSB0b2tlblN0cmVhbS5MVCgxKS5zdGFydENvbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLy9oYXMgdG8gYmUgYSBmdW5jdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsKXtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICogVGhpcyBjaGVja3MgZm9yIGFscGhhKG9wYWNpdHk9MCkgc3R5bGUgb2YgSUVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKiBmdW5jdGlvbnMuIElFX0ZVTkNUSU9OIG9ubHkgcHJlc2VudHMgcHJvZ2lkOiBzdHlsZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0uTEEoMykgPT0gVG9rZW5zLkVRVUFMUyAmJiB0aGlzLm9wdGlvbnMuaWVGaWx0ZXJzKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB0aGlzLl9pZV9mdW5jdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdGhpcy5fZnVuY3Rpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qaWYgKHZhbHVlID09PSBudWxsKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3Rocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGlkZW50aWZpZXIgYXQgbGluZSBcIiArIHRva2VuU3RyZWFtLnRva2VuKCkuc3RhcnRMaW5lICsgXCIsIGNoYXJhY3RlciBcIiArICB0b2tlblN0cmVhbS50b2tlbigpLnN0YXJ0Q29sICsgXCIuXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSovXG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodW5hcnkgPT09IG51bGwpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbmUgPSB0b2tlbi5zdGFydExpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sID0gdG9rZW4uc3RhcnRDb2w7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZSAhPT0gbnVsbCA/XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgUHJvcGVydHlWYWx1ZVBhcnQodW5hcnkgIT09IG51bGwgPyB1bmFyeSArIHZhbHVlIDogdmFsdWUsIGxpbmUsIGNvbCkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgbnVsbDtcblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX2Z1bmN0aW9uOiBmdW5jdGlvbigpe1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBmdW5jdGlvblxuICAgICAgICAgICAgICAgICAqICAgOiBGVU5DVElPTiBTKiBleHByICcpJyBTKlxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGV4cHIgICAgICAgID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbHQ7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkZVTkNUSU9OKSl7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGV4cHIgPSB0aGlzLl9leHByKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgKz0gZXhwcjtcblxuICAgICAgICAgICAgICAgICAgICAvL1NUQVJUOiBIb3JyaWJsZSBoYWNrIGluIGNhc2UgaXQncyBhbiBJRSBmaWx0ZXJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5pZUZpbHRlcnMgJiYgdG9rZW5TdHJlYW0ucGVlaygpID09IFRva2Vucy5FUVVBTFMpe1xuICAgICAgICAgICAgICAgICAgICAgICAgZG8ge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgKz0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL21pZ2h0IGJlIHNlY29uZCB0aW1lIGluIHRoZSBsb29wXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuU3RyZWFtLkxBKDApID09IFRva2Vucy5DT01NQSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5JREVOVCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb25UZXh0ICs9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuRVFVQUxTKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgKz0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vZnVuY3Rpb25UZXh0ICs9IHRoaXMuX3Rlcm0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsdCA9IHRva2VuU3RyZWFtLnBlZWsoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZShsdCAhPSBUb2tlbnMuQ09NTUEgJiYgbHQgIT0gVG9rZW5zLlMgJiYgbHQgIT0gVG9rZW5zLlJQQVJFTil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLmdldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgKz0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbHQgPSB0b2tlblN0cmVhbS5wZWVrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSB3aGlsZSh0b2tlblN0cmVhbS5tYXRjaChbVG9rZW5zLkNPTU1BLCBUb2tlbnMuU10pKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vRU5EOiBIb3JyaWJsZSBIYWNrXG5cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlJQQVJFTik7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCArPSBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb25UZXh0O1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX2llX2Z1bmN0aW9uOiBmdW5jdGlvbigpe1xuXG4gICAgICAgICAgICAgICAgLyogKE15IG93biBleHRlbnNpb24pXG4gICAgICAgICAgICAgICAgICogaWVfZnVuY3Rpb25cbiAgICAgICAgICAgICAgICAgKiAgIDogSUVfRlVOQ1RJT04gUyogSURFTlQgJz0nIHRlcm0gW1MqICcsJz8gSURFTlQgJz0nIHRlcm1dKyAnKScgUypcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cblxuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgPSBudWxsLFxuICAgICAgICAgICAgICAgICAgICBleHByICAgICAgICA9IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGx0O1xuXG4gICAgICAgICAgICAgICAgLy9JRSBmdW5jdGlvbiBjYW4gYmVnaW4gbGlrZSBhIHJlZ3VsYXIgZnVuY3Rpb24sIHRvb1xuICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5tYXRjaChbVG9rZW5zLklFX0ZVTkNUSU9OLCBUb2tlbnMuRlVOQ1RJT05dKSl7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCA9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgZG8ge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5fcmVhZFdoaXRlc3BhY2UoKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb25UZXh0ICs9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vbWlnaHQgYmUgc2Vjb25kIHRpbWUgaW4gdGhlIGxvb3BcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlblN0cmVhbS5MQSgwKSA9PSBUb2tlbnMuQ09NTUEpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuSURFTlQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb25UZXh0ICs9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5FUVVBTFMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb25UZXh0ICs9IHRva2VuU3RyZWFtLnRva2VuKCkudmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZnVuY3Rpb25UZXh0ICs9IHRoaXMuX3Rlcm0oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGx0ID0gdG9rZW5TdHJlYW0ucGVlaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUobHQgIT0gVG9rZW5zLkNPTU1BICYmIGx0ICE9IFRva2Vucy5TICYmIGx0ICE9IFRva2Vucy5SUEFSRU4pe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLmdldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uVGV4dCArPSB0b2tlblN0cmVhbS50b2tlbigpLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGx0ID0gdG9rZW5TdHJlYW0ucGVlaygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IHdoaWxlKHRva2VuU3RyZWFtLm1hdGNoKFtUb2tlbnMuQ09NTUEsIFRva2Vucy5TXSkpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRva2VuU3RyZWFtLm1hdGNoKFRva2Vucy5SUEFSRU4pO1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvblRleHQgKz0gXCIpXCI7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uVGV4dDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9oZXhjb2xvcjogZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFRoZXJlIGlzIGEgY29uc3RyYWludCBvbiB0aGUgY29sb3IgdGhhdCBpdCBtdXN0XG4gICAgICAgICAgICAgICAgICogaGF2ZSBlaXRoZXIgMyBvciA2IGhleC1kaWdpdHMgKGkuZS4sIFswLTlhLWZBLUZdKVxuICAgICAgICAgICAgICAgICAqIGFmdGVyIHRoZSBcIiNcIjsgZS5nLiwgXCIjMDAwXCIgaXMgT0ssIGJ1dCBcIiNhYmNkXCIgaXMgbm90LlxuICAgICAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgICAgICogaGV4Y29sb3JcbiAgICAgICAgICAgICAgICAgKiAgIDogSEFTSCBTKlxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I7XG5cbiAgICAgICAgICAgICAgICBpZih0b2tlblN0cmVhbS5tYXRjaChUb2tlbnMuSEFTSCkpe1xuXG4gICAgICAgICAgICAgICAgICAgIC8vbmVlZCB0byBkbyBzb21lIHZhbGlkYXRpb24gaGVyZVxuXG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gdG9rZW5TdHJlYW0udG9rZW4oKTtcbiAgICAgICAgICAgICAgICAgICAgY29sb3IgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCEvI1thLWYwLTldezMsNn0vaS50ZXN0KGNvbG9yKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgU3ludGF4RXJyb3IoXCJFeHBlY3RlZCBhIGhleCBjb2xvciBidXQgZm91bmQgJ1wiICsgY29sb3IgKyBcIicgYXQgbGluZSBcIiArIHRva2VuLnN0YXJ0TGluZSArIFwiLCBjb2wgXCIgKyB0b2tlbi5zdGFydENvbCArIFwiLlwiLCB0b2tlbi5zdGFydExpbmUsIHRva2VuLnN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgICAgIC8vIEFuaW1hdGlvbnMgbWV0aG9kc1xuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICAgICAgICBfa2V5ZnJhbWVzOiBmdW5jdGlvbigpe1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBrZXlmcmFtZXM6XG4gICAgICAgICAgICAgICAgICogICA6IEtFWUZSQU1FU19TWU0gUyoga2V5ZnJhbWVfbmFtZSBTKiAneycgUyoga2V5ZnJhbWVfcnVsZSogJ30nIHtcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4sXG4gICAgICAgICAgICAgICAgICAgIHR0LFxuICAgICAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgICAgICBwcmVmaXggPSBcIlwiO1xuXG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5LRVlGUkFNRVNfU1lNKTtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IHRva2VuU3RyZWFtLnRva2VuKCk7XG4gICAgICAgICAgICAgICAgaWYgKC9eQFxcLShbXlxcLV0rKVxcLS8udGVzdCh0b2tlbi52YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJlZml4ID0gUmVnRXhwLiQxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgbmFtZSA9IHRoaXMuX2tleWZyYW1lX25hbWUoKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5MQlJBQ0UpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcInN0YXJ0a2V5ZnJhbWVzXCIsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICAgbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcHJlZml4OiBwcmVmaXgsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6ICAgdG9rZW4uc3RhcnRMaW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIHRva2VuLnN0YXJ0Q29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICAgICAgICAgIHR0ID0gdG9rZW5TdHJlYW0ucGVlaygpO1xuXG4gICAgICAgICAgICAgICAgLy9jaGVjayBmb3Iga2V5XG4gICAgICAgICAgICAgICAgd2hpbGUodHQgPT0gVG9rZW5zLklERU5UIHx8IHR0ID09IFRva2Vucy5QRVJDRU5UQUdFKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2tleWZyYW1lX3J1bGUoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgdHQgPSB0b2tlblN0cmVhbS5wZWVrKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcImVuZGtleWZyYW1lc1wiLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiAgIG5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHByZWZpeDogcHJlZml4LFxuICAgICAgICAgICAgICAgICAgICBsaW5lOiAgIHRva2VuLnN0YXJ0TGluZSxcbiAgICAgICAgICAgICAgICAgICAgY29sOiAgICB0b2tlbi5zdGFydENvbFxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlJCUkFDRSk7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9rZXlmcmFtZV9uYW1lOiBmdW5jdGlvbigpe1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBrZXlmcmFtZV9uYW1lOlxuICAgICAgICAgICAgICAgICAqICAgOiBJREVOVFxuICAgICAgICAgICAgICAgICAqICAgfCBTVFJJTkdcbiAgICAgICAgICAgICAgICAgKiAgIDtcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW47XG5cbiAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goW1Rva2Vucy5JREVOVCwgVG9rZW5zLlNUUklOR10pO1xuICAgICAgICAgICAgICAgIHJldHVybiBTeW50YXhVbml0LmZyb21Ub2tlbih0b2tlblN0cmVhbS50b2tlbigpKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9rZXlmcmFtZV9ydWxlOiBmdW5jdGlvbigpe1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBrZXlmcmFtZV9ydWxlOlxuICAgICAgICAgICAgICAgICAqICAgOiBrZXlfbGlzdCBTKlxuICAgICAgICAgICAgICAgICAqICAgICAneycgUyogZGVjbGFyYXRpb24gWyAnOycgUyogZGVjbGFyYXRpb24gXSogJ30nIFMqXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdmFyIHRva2VuU3RyZWFtID0gdGhpcy5fdG9rZW5TdHJlYW0sXG4gICAgICAgICAgICAgICAgICAgIHRva2VuLFxuICAgICAgICAgICAgICAgICAgICBrZXlMaXN0ID0gdGhpcy5fa2V5X2xpc3QoKTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZSh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICAgXCJzdGFydGtleWZyYW1lcnVsZVwiLFxuICAgICAgICAgICAgICAgICAgICBrZXlzOiAgIGtleUxpc3QsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6ICAga2V5TGlzdFswXS5saW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGtleUxpc3RbMF0uY29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkRGVjbGFyYXRpb25zKHRydWUpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogICBcImVuZGtleWZyYW1lcnVsZVwiLFxuICAgICAgICAgICAgICAgICAgICBrZXlzOiAgIGtleUxpc3QsXG4gICAgICAgICAgICAgICAgICAgIGxpbmU6ICAga2V5TGlzdFswXS5saW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w6ICAgIGtleUxpc3RbMF0uY29sXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIF9rZXlfbGlzdDogZnVuY3Rpb24oKXtcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICoga2V5X2xpc3Q6XG4gICAgICAgICAgICAgICAgICogICA6IGtleSBbIFMqICcsJyBTKiBrZXldKlxuICAgICAgICAgICAgICAgICAqICAgO1xuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICB0b2tlbixcbiAgICAgICAgICAgICAgICAgICAga2V5LFxuICAgICAgICAgICAgICAgICAgICBrZXlMaXN0ID0gW107XG5cbiAgICAgICAgICAgICAgICAvL211c3QgYmUgbGVhc3Qgb25lIGtleVxuICAgICAgICAgICAgICAgIGtleUxpc3QucHVzaCh0aGlzLl9rZXkoKSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgd2hpbGUodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLkNPTU1BKSl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGtleUxpc3QucHVzaCh0aGlzLl9rZXkoKSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGtleUxpc3Q7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfa2V5OiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogVGhlcmUgaXMgYSByZXN0cmljdGlvbiB0aGF0IElERU5UIGNhbiBiZSBvbmx5IFwiZnJvbVwiIG9yIFwidG9cIi5cbiAgICAgICAgICAgICAgICAgKlxuICAgICAgICAgICAgICAgICAqIGtleVxuICAgICAgICAgICAgICAgICAqICAgOiBQRVJDRU5UQUdFXG4gICAgICAgICAgICAgICAgICogICB8IElERU5UXG4gICAgICAgICAgICAgICAgICogICA7XG4gICAgICAgICAgICAgICAgICovXG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW47XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlBFUkNFTlRBR0UpKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFN5bnRheFVuaXQuZnJvbVRva2VuKHRva2VuU3RyZWFtLnRva2VuKCkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLklERU5UKSl7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gdG9rZW5TdHJlYW0udG9rZW4oKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoL2Zyb218dG8vaS50ZXN0KHRva2VuLnZhbHVlKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gU3ludGF4VW5pdC5mcm9tVG9rZW4odG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0udW5nZXQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL2lmIGl0IGdldHMgaGVyZSwgdGhlcmUgd2Fzbid0IGEgdmFsaWQgdG9rZW4sIHNvIHRpbWUgdG8gZXhwbG9kZVxuICAgICAgICAgICAgICAgIHRoaXMuX3VuZXhwZWN0ZWRUb2tlbih0b2tlblN0cmVhbS5MVCgxKSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgICAgICAvLyBIZWxwZXIgbWV0aG9kc1xuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIE5vdCBwYXJ0IG9mIENTUyBncmFtbWFyLCBidXQgdXNlZnVsIGZvciBza2lwcGluZyBvdmVyXG4gICAgICAgICAgICAgKiBjb21iaW5hdGlvbiBvZiB3aGl0ZSBzcGFjZSBhbmQgSFRNTC1zdHlsZSBjb21tZW50cy5cbiAgICAgICAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgICAgICAgKiBAbWV0aG9kIF9za2lwQ3J1ZnRcbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIF9za2lwQ3J1ZnQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgd2hpbGUodGhpcy5fdG9rZW5TdHJlYW0ubWF0Y2goW1Rva2Vucy5TLCBUb2tlbnMuQ0RPLCBUb2tlbnMuQ0RDXSkpe1xuICAgICAgICAgICAgICAgICAgICAvL25vb3BcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIE5vdCBwYXJ0IG9mIENTUyBncmFtbWFyLCBidXQgdGhpcyBwYXR0ZXJuIG9jY3VycyBmcmVxdWVudGx5XG4gICAgICAgICAgICAgKiBpbiB0aGUgb2ZmaWNpYWwgQ1NTIGdyYW1tYXIuIFNwbGl0IG91dCBoZXJlIHRvIGVsaW1pbmF0ZVxuICAgICAgICAgICAgICogZHVwbGljYXRlIGNvZGUuXG4gICAgICAgICAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNoZWNrU3RhcnQgSW5kaWNhdGVzIGlmIHRoZSBydWxlIHNob3VsZCBjaGVja1xuICAgICAgICAgICAgICogICAgICBmb3IgdGhlIGxlZnQgYnJhY2UgYXQgdGhlIGJlZ2lubmluZy5cbiAgICAgICAgICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmVhZE1hcmdpbnMgSW5kaWNhdGVzIGlmIHRoZSBydWxlIHNob3VsZCBjaGVja1xuICAgICAgICAgICAgICogICAgICBmb3IgbWFyZ2luIHBhdHRlcm5zLlxuICAgICAgICAgICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgICAgICAgICAqIEBtZXRob2QgX3JlYWREZWNsYXJhdGlvbnNcbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIF9yZWFkRGVjbGFyYXRpb25zOiBmdW5jdGlvbihjaGVja1N0YXJ0LCByZWFkTWFyZ2lucyl7XG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBSZWFkcyB0aGUgcGF0dGVyblxuICAgICAgICAgICAgICAgICAqIFMqICd7JyBTKiBkZWNsYXJhdGlvbiBbICc7JyBTKiBkZWNsYXJhdGlvbiBdKiAnfScgUypcbiAgICAgICAgICAgICAgICAgKiBvclxuICAgICAgICAgICAgICAgICAqIFMqICd7JyBTKiBbIGRlY2xhcmF0aW9uIHwgbWFyZ2luIF0/IFsgJzsnIFMqIFsgZGVjbGFyYXRpb24gfCBtYXJnaW4gXT8gXSogJ30nIFMqXG4gICAgICAgICAgICAgICAgICogTm90ZSB0aGF0IHRoaXMgaXMgaG93IGl0IGlzIGRlc2NyaWJlZCBpbiBDU1MzIFBhZ2VkIE1lZGlhLCBidXQgaXMgYWN0dWFsbHkgaW5jb3JyZWN0LlxuICAgICAgICAgICAgICAgICAqIEEgc2VtaWNvbG9uIGlzIG9ubHkgbmVjZXNzYXJ5IGZvbGxvd2luZyBhIGRlY2xhcmF0aW9uIGlzIHRoZXJlJ3MgYW5vdGhlciBkZWNsYXJhdGlvblxuICAgICAgICAgICAgICAgICAqIG9yIG1hcmdpbiBhZnRlcndhcmRzLlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHZhciB0b2tlblN0cmVhbSA9IHRoaXMuX3Rva2VuU3RyZWFtLFxuICAgICAgICAgICAgICAgICAgICB0dDtcblxuXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIGlmIChjaGVja1N0YXJ0KXtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5TdHJlYW0ubXVzdE1hdGNoKFRva2Vucy5MQlJBQ0UpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuXG4gICAgICAgICAgICAgICAgICAgIHdoaWxlKHRydWUpe1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlNFTUlDT0xPTikgfHwgKHJlYWRNYXJnaW5zICYmIHRoaXMuX21hcmdpbigpKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9ub29wXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuX2RlY2xhcmF0aW9uKCkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlNFTUlDT0xPTikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2lmICgoIXRoaXMuX21hcmdpbigpICYmICF0aGlzLl9kZWNsYXJhdGlvbigpKSB8fCAhdG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlNFTUlDT0xPTikpe1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL31cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0b2tlblN0cmVhbS5tdXN0TWF0Y2goVG9rZW5zLlJCUkFDRSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB9IGNhdGNoIChleCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXggaW5zdGFuY2VvZiBTeW50YXhFcnJvciAmJiAhdGhpcy5vcHRpb25zLnN0cmljdCl7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZmlyZSBlcnJvciBldmVudFxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAgICAgICBcImVycm9yXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6ICAgICAgZXgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVzc2FnZTogICAgZXgubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lOiAgICAgICBleC5saW5lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbDogICAgICAgIGV4LmNvbFxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vc2VlIGlmIHRoZXJlJ3MgYW5vdGhlciBkZWNsYXJhdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgdHQgPSB0b2tlblN0cmVhbS5hZHZhbmNlKFtUb2tlbnMuU0VNSUNPTE9OLCBUb2tlbnMuUkJSQUNFXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHQgPT0gVG9rZW5zLlNFTUlDT0xPTil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9pZiB0aGVyZSdzIGEgc2VtaWNvbG9uLCB0aGVuIHRoZXJlIG1pZ2h0IGJlIGFub3RoZXIgZGVjbGFyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWFkRGVjbGFyYXRpb25zKGZhbHNlLCByZWFkTWFyZ2lucyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR0ICE9IFRva2Vucy5SQlJBQ0Upe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBhIHJpZ2h0IGJyYWNlLCB0aGUgcnVsZSBpcyBmaW5pc2hlZCBzbyBkb24ndCBkbyBhbnl0aGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vb3RoZXJ3aXNlLCByZXRocm93IHRoZSBlcnJvciBiZWNhdXNlIGl0IHdhc24ndCBoYW5kbGVkIHByb3Blcmx5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vbm90IGEgc3ludGF4IGVycm9yLCByZXRocm93IGl0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBleDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBJbiBzb21lIGNhc2VzLCB5b3UgY2FuIGVuZCB1cCB3aXRoIHR3byB3aGl0ZSBzcGFjZSB0b2tlbnMgaW4gYVxuICAgICAgICAgICAgICogcm93LiBJbnN0ZWFkIG9mIG1ha2luZyBhIGNoYW5nZSBpbiBldmVyeSBmdW5jdGlvbiB0aGF0IGxvb2tzIGZvclxuICAgICAgICAgICAgICogd2hpdGUgc3BhY2UsIHRoaXMgZnVuY3Rpb24gaXMgdXNlZCB0byBtYXRjaCBhcyBtdWNoIHdoaXRlIHNwYWNlXG4gICAgICAgICAgICAgKiBhcyBuZWNlc3NhcnkuXG4gICAgICAgICAgICAgKiBAbWV0aG9kIF9yZWFkV2hpdGVzcGFjZVxuICAgICAgICAgICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgd2hpdGUgc3BhY2UgaWYgZm91bmQsIGVtcHR5IHN0cmluZyBpZiBub3QuXG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBfcmVhZFdoaXRlc3BhY2U6IGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5TdHJlYW0gPSB0aGlzLl90b2tlblN0cmVhbSxcbiAgICAgICAgICAgICAgICAgICAgd3MgPSBcIlwiO1xuXG4gICAgICAgICAgICAgICAgd2hpbGUodG9rZW5TdHJlYW0ubWF0Y2goVG9rZW5zLlMpKXtcbiAgICAgICAgICAgICAgICAgICAgd3MgKz0gdG9rZW5TdHJlYW0udG9rZW4oKS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gd3M7XG4gICAgICAgICAgICB9LFxuXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogVGhyb3dzIGFuIGVycm9yIHdoZW4gYW4gdW5leHBlY3RlZCB0b2tlbiBpcyBmb3VuZC5cbiAgICAgICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b2tlbiBUaGUgdG9rZW4gdGhhdCB3YXMgZm91bmQuXG4gICAgICAgICAgICAgKiBAbWV0aG9kIF91bmV4cGVjdGVkVG9rZW5cbiAgICAgICAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBfdW5leHBlY3RlZFRva2VuOiBmdW5jdGlvbih0b2tlbil7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFwiVW5leHBlY3RlZCB0b2tlbiAnXCIgKyB0b2tlbi52YWx1ZSArIFwiJyBhdCBsaW5lIFwiICsgdG9rZW4uc3RhcnRMaW5lICsgXCIsIGNvbCBcIiArIHRva2VuLnN0YXJ0Q29sICsgXCIuXCIsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBIZWxwZXIgbWV0aG9kIHVzZWQgZm9yIHBhcnNpbmcgc3VicGFydHMgb2YgYSBzdHlsZSBzaGVldC5cbiAgICAgICAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgICAgICAgKiBAbWV0aG9kIF92ZXJpZnlFbmRcbiAgICAgICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIF92ZXJpZnlFbmQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuX3Rva2VuU3RyZWFtLkxBKDEpICE9IFRva2Vucy5FT0Ype1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl91bmV4cGVjdGVkVG9rZW4odGhpcy5fdG9rZW5TdHJlYW0uTFQoMSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgICAgIC8vIFZhbGlkYXRpb24gbWV0aG9kc1xuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgX3ZhbGlkYXRlUHJvcGVydHk6IGZ1bmN0aW9uKHByb3BlcnR5LCB2YWx1ZSl7XG4gICAgICAgICAgICAgICAgVmFsaWRhdGlvbi52YWxpZGF0ZShwcm9wZXJ0eSwgdmFsdWUpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAgICAgLy8gUGFyc2luZyBtZXRob2RzXG4gICAgICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAgICAgICAgIHBhcnNlOiBmdW5jdGlvbihpbnB1dCl7XG4gICAgICAgICAgICAgICAgdGhpcy5fdG9rZW5TdHJlYW0gPSBuZXcgVG9rZW5TdHJlYW0oaW5wdXQsIFRva2Vucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc3R5bGVzaGVldCgpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgcGFyc2VTdHlsZVNoZWV0OiBmdW5jdGlvbihpbnB1dCl7XG4gICAgICAgICAgICAgICAgLy9qdXN0IHBhc3N0aHJvdWdoXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyc2UoaW5wdXQpO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgcGFyc2VNZWRpYVF1ZXJ5OiBmdW5jdGlvbihpbnB1dCl7XG4gICAgICAgICAgICAgICAgdGhpcy5fdG9rZW5TdHJlYW0gPSBuZXcgVG9rZW5TdHJlYW0oaW5wdXQsIFRva2Vucyk7XG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHRoaXMuX21lZGlhX3F1ZXJ5KCk7XG5cbiAgICAgICAgICAgICAgICAvL2lmIHRoZXJlJ3MgYW55dGhpbmcgbW9yZSwgdGhlbiBpdCdzIGFuIGludmFsaWQgc2VsZWN0b3JcbiAgICAgICAgICAgICAgICB0aGlzLl92ZXJpZnlFbmQoKTtcblxuICAgICAgICAgICAgICAgIC8vb3RoZXJ3aXNlIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBQYXJzZXMgYSBwcm9wZXJ0eSB2YWx1ZSAoZXZlcnl0aGluZyBhZnRlciB0aGUgc2VtaWNvbG9uKS5cbiAgICAgICAgICAgICAqIEByZXR1cm4ge3BhcnNlcmxpYi5jc3MuUHJvcGVydHlWYWx1ZX0gVGhlIHByb3BlcnR5IHZhbHVlLlxuICAgICAgICAgICAgICogQHRocm93cyBwYXJzZXJsaWIudXRpbC5TeW50YXhFcnJvciBJZiBhbiB1bmV4cGVjdGVkIHRva2VuIGlzIGZvdW5kLlxuICAgICAgICAgICAgICogQG1ldGhvZCBwYXJzZXJQcm9wZXJ0eVZhbHVlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHBhcnNlUHJvcGVydHlWYWx1ZTogZnVuY3Rpb24oaW5wdXQpe1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fdG9rZW5TdHJlYW0gPSBuZXcgVG9rZW5TdHJlYW0oaW5wdXQsIFRva2Vucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIHZhciByZXN1bHQgPSB0aGlzLl9leHByKCk7XG5cbiAgICAgICAgICAgICAgICAvL29rYXkgdG8gaGF2ZSBhIHRyYWlsaW5nIHdoaXRlIHNwYWNlXG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZFdoaXRlc3BhY2UoKTtcblxuICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBhbnl0aGluZyBtb3JlLCB0aGVuIGl0J3MgYW4gaW52YWxpZCBzZWxlY3RvclxuICAgICAgICAgICAgICAgIHRoaXMuX3ZlcmlmeUVuZCgpO1xuXG4gICAgICAgICAgICAgICAgLy9vdGhlcndpc2UgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFBhcnNlcyBhIGNvbXBsZXRlIENTUyBydWxlLCBpbmNsdWRpbmcgc2VsZWN0b3JzIGFuZFxuICAgICAgICAgICAgICogcHJvcGVydGllcy5cbiAgICAgICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgdGV4dCB0byBwYXJzZXIuXG4gICAgICAgICAgICAgKiBAcmV0dXJuIHtCb29sZWFufSBUcnVlIGlmIHRoZSBwYXJzZSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5LCBmYWxzZSBpZiBub3QuXG4gICAgICAgICAgICAgKiBAbWV0aG9kIHBhcnNlUnVsZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBwYXJzZVJ1bGU6IGZ1bmN0aW9uKGlucHV0KXtcbiAgICAgICAgICAgICAgICB0aGlzLl90b2tlblN0cmVhbSA9IG5ldyBUb2tlblN0cmVhbShpbnB1dCwgVG9rZW5zKTtcblxuICAgICAgICAgICAgICAgIC8vc2tpcCBhbnkgbGVhZGluZyB3aGl0ZSBzcGFjZVxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5fcnVsZXNldCgpO1xuXG4gICAgICAgICAgICAgICAgLy9za2lwIGFueSB0cmFpbGluZyB3aGl0ZSBzcGFjZVxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICAvL2lmIHRoZXJlJ3MgYW55dGhpbmcgbW9yZSwgdGhlbiBpdCdzIGFuIGludmFsaWQgc2VsZWN0b3JcbiAgICAgICAgICAgICAgICB0aGlzLl92ZXJpZnlFbmQoKTtcblxuICAgICAgICAgICAgICAgIC8vb3RoZXJ3aXNlIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBQYXJzZXMgYSBzaW5nbGUgQ1NTIHNlbGVjdG9yIChubyBjb21tYSlcbiAgICAgICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgdGV4dCB0byBwYXJzZSBhcyBhIENTUyBzZWxlY3Rvci5cbiAgICAgICAgICAgICAqIEByZXR1cm4ge1NlbGVjdG9yfSBBbiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSBzZWxlY3Rvci5cbiAgICAgICAgICAgICAqIEB0aHJvd3MgcGFyc2VybGliLnV0aWwuU3ludGF4RXJyb3IgSWYgYW4gdW5leHBlY3RlZCB0b2tlbiBpcyBmb3VuZC5cbiAgICAgICAgICAgICAqIEBtZXRob2QgcGFyc2VTZWxlY3RvclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBwYXJzZVNlbGVjdG9yOiBmdW5jdGlvbihpbnB1dCl7XG5cbiAgICAgICAgICAgICAgICB0aGlzLl90b2tlblN0cmVhbSA9IG5ldyBUb2tlblN0cmVhbShpbnB1dCwgVG9rZW5zKTtcblxuICAgICAgICAgICAgICAgIC8vc2tpcCBhbnkgbGVhZGluZyB3aGl0ZSBzcGFjZVxuICAgICAgICAgICAgICAgIHRoaXMuX3JlYWRXaGl0ZXNwYWNlKCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgcmVzdWx0ID0gdGhpcy5fc2VsZWN0b3IoKTtcblxuICAgICAgICAgICAgICAgIC8vc2tpcCBhbnkgdHJhaWxpbmcgd2hpdGUgc3BhY2VcbiAgICAgICAgICAgICAgICB0aGlzLl9yZWFkV2hpdGVzcGFjZSgpO1xuXG4gICAgICAgICAgICAgICAgLy9pZiB0aGVyZSdzIGFueXRoaW5nIG1vcmUsIHRoZW4gaXQncyBhbiBpbnZhbGlkIHNlbGVjdG9yXG4gICAgICAgICAgICAgICAgdGhpcy5fdmVyaWZ5RW5kKCk7XG5cbiAgICAgICAgICAgICAgICAvL290aGVyd2lzZSByZXR1cm4gcmVzdWx0XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogUGFyc2VzIGFuIEhUTUwgc3R5bGUgYXR0cmlidXRlOiBhIHNldCBvZiBDU1MgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICAgKiBzZXBhcmF0ZWQgYnkgc2VtaWNvbG9ucy5cbiAgICAgICAgICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgdGV4dCB0byBwYXJzZSBhcyBhIHN0eWxlIGF0dHJpYnV0ZVxuICAgICAgICAgICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgICAgICAgICAqIEBtZXRob2QgcGFyc2VTdHlsZUF0dHJpYnV0ZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBwYXJzZVN0eWxlQXR0cmlidXRlOiBmdW5jdGlvbihpbnB1dCl7XG4gICAgICAgICAgICAgICAgaW5wdXQgKz0gXCJ9XCI7IC8vIGZvciBlcnJvciByZWNvdmVyeSBpbiBfcmVhZERlY2xhcmF0aW9ucygpXG4gICAgICAgICAgICAgICAgdGhpcy5fdG9rZW5TdHJlYW0gPSBuZXcgVG9rZW5TdHJlYW0oaW5wdXQsIFRva2Vucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5fcmVhZERlY2xhcmF0aW9ucygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgLy9jb3B5IG92ZXIgb250byBwcm90b3R5cGVcbiAgICBmb3IgKHByb3AgaW4gYWRkaXRpb25zKXtcbiAgICAgICAgaWYgKGFkZGl0aW9ucy5oYXNPd25Qcm9wZXJ0eShwcm9wKSl7XG4gICAgICAgICAgICBwcm90b1twcm9wXSA9IGFkZGl0aW9uc1twcm9wXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBwcm90bztcbn0oKTtcblxuXG4vKlxubnRoXG4gIDogUyogWyBbJy0nfCcrJ10/IElOVEVHRVI/IHtOfSBbIFMqIFsnLSd8JysnXSBTKiBJTlRFR0VSIF0/IHxcbiAgICAgICAgIFsnLSd8JysnXT8gSU5URUdFUiB8IHtPfXtEfXtEfSB8IHtFfXtWfXtFfXtOfSBdIFMqXG4gIDtcbiovXG4vKmdsb2JhbCBWYWxpZGF0aW9uLCBWYWxpZGF0aW9uVHlwZXMsIFZhbGlkYXRpb25FcnJvciovXG52YXIgUHJvcGVydGllcyA9IHtcblxuICAgIC8vQVxuICAgIFwiYWxpZ24taXRlbXNcIiAgICAgICAgICAgICAgICAgICA6IFwiZmxleC1zdGFydCB8IGZsZXgtZW5kIHwgY2VudGVyIHwgYmFzZWxpbmUgfCBzdHJldGNoXCIsXG4gICAgXCJhbGlnbi1jb250ZW50XCIgICAgICAgICAgICAgICAgIDogXCJmbGV4LXN0YXJ0IHwgZmxleC1lbmQgfCBjZW50ZXIgfCBzcGFjZS1iZXR3ZWVuIHwgc3BhY2UtYXJvdW5kIHwgc3RyZXRjaFwiLFxuICAgIFwiYWxpZ24tc2VsZlwiICAgICAgICAgICAgICAgICAgICA6IFwiYXV0byB8IGZsZXgtc3RhcnQgfCBmbGV4LWVuZCB8IGNlbnRlciB8IGJhc2VsaW5lIHwgc3RyZXRjaFwiLFxuICAgIFwiLXdlYmtpdC1hbGlnbi1pdGVtc1wiICAgICAgICAgICA6IFwiZmxleC1zdGFydCB8IGZsZXgtZW5kIHwgY2VudGVyIHwgYmFzZWxpbmUgfCBzdHJldGNoXCIsXG4gICAgXCItd2Via2l0LWFsaWduLWNvbnRlbnRcIiAgICAgICAgIDogXCJmbGV4LXN0YXJ0IHwgZmxleC1lbmQgfCBjZW50ZXIgfCBzcGFjZS1iZXR3ZWVuIHwgc3BhY2UtYXJvdW5kIHwgc3RyZXRjaFwiLFxuICAgIFwiLXdlYmtpdC1hbGlnbi1zZWxmXCIgICAgICAgICAgICA6IFwiYXV0byB8IGZsZXgtc3RhcnQgfCBmbGV4LWVuZCB8IGNlbnRlciB8IGJhc2VsaW5lIHwgc3RyZXRjaFwiLFxuICAgIFwiYWxpZ25tZW50LWFkanVzdFwiICAgICAgICAgICAgICA6IFwiYXV0byB8IGJhc2VsaW5lIHwgYmVmb3JlLWVkZ2UgfCB0ZXh0LWJlZm9yZS1lZGdlIHwgbWlkZGxlIHwgY2VudHJhbCB8IGFmdGVyLWVkZ2UgfCB0ZXh0LWFmdGVyLWVkZ2UgfCBpZGVvZ3JhcGhpYyB8IGFscGhhYmV0aWMgfCBoYW5naW5nIHwgbWF0aGVtYXRpY2FsIHwgPHBlcmNlbnRhZ2U+IHwgPGxlbmd0aD5cIixcbiAgICBcImFsaWdubWVudC1iYXNlbGluZVwiICAgICAgICAgICAgOiBcImJhc2VsaW5lIHwgdXNlLXNjcmlwdCB8IGJlZm9yZS1lZGdlIHwgdGV4dC1iZWZvcmUtZWRnZSB8IGFmdGVyLWVkZ2UgfCB0ZXh0LWFmdGVyLWVkZ2UgfCBjZW50cmFsIHwgbWlkZGxlIHwgaWRlb2dyYXBoaWMgfCBhbHBoYWJldGljIHwgaGFuZ2luZyB8IG1hdGhlbWF0aWNhbFwiLFxuICAgIFwiYW5pbWF0aW9uXCIgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJhbmltYXRpb24tZGVsYXlcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8dGltZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcImFuaW1hdGlvbi1kaXJlY3Rpb25cIiAgICAgICAgICAgOiB7IG11bHRpOiBcIm5vcm1hbCB8IGFsdGVybmF0ZVwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiYW5pbWF0aW9uLWR1cmF0aW9uXCIgICAgICAgICAgICA6IHsgbXVsdGk6IFwiPHRpbWU+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJhbmltYXRpb24tZmlsbC1tb2RlXCIgICAgICAgICAgIDogeyBtdWx0aTogXCJub25lIHwgZm9yd2FyZHMgfCBiYWNrd2FyZHMgfCBib3RoXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJhbmltYXRpb24taXRlcmF0aW9uLWNvdW50XCIgICAgIDogeyBtdWx0aTogXCI8bnVtYmVyPiB8IGluZmluaXRlXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJhbmltYXRpb24tbmFtZVwiICAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCJub25lIHwgPGlkZW50PlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiYW5pbWF0aW9uLXBsYXktc3RhdGVcIiAgICAgICAgICA6IHsgbXVsdGk6IFwicnVubmluZyB8IHBhdXNlZFwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiYW5pbWF0aW9uLXRpbWluZy1mdW5jdGlvblwiICAgICA6IDEsXG5cbiAgICAvL3ZlbmRvciBwcmVmaXhlZFxuICAgIFwiLW1vei1hbmltYXRpb24tZGVsYXlcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8dGltZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi1tb3otYW5pbWF0aW9uLWRpcmVjdGlvblwiICAgICAgICAgICA6IHsgbXVsdGk6IFwibm9ybWFsIHwgYWx0ZXJuYXRlXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItbW96LWFuaW1hdGlvbi1kdXJhdGlvblwiICAgICAgICAgICAgOiB7IG11bHRpOiBcIjx0aW1lPlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW1vei1hbmltYXRpb24taXRlcmF0aW9uLWNvdW50XCIgICAgIDogeyBtdWx0aTogXCI8bnVtYmVyPiB8IGluZmluaXRlXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItbW96LWFuaW1hdGlvbi1uYW1lXCIgICAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIm5vbmUgfCA8aWRlbnQ+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItbW96LWFuaW1hdGlvbi1wbGF5LXN0YXRlXCIgICAgICAgICAgOiB7IG11bHRpOiBcInJ1bm5pbmcgfCBwYXVzZWRcIiwgY29tbWE6IHRydWUgfSxcblxuICAgIFwiLW1zLWFuaW1hdGlvbi1kZWxheVwiICAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjx0aW1lPlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW1zLWFuaW1hdGlvbi1kaXJlY3Rpb25cIiAgICAgICAgICAgOiB7IG11bHRpOiBcIm5vcm1hbCB8IGFsdGVybmF0ZVwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW1zLWFuaW1hdGlvbi1kdXJhdGlvblwiICAgICAgICAgICAgOiB7IG11bHRpOiBcIjx0aW1lPlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW1zLWFuaW1hdGlvbi1pdGVyYXRpb24tY291bnRcIiAgICAgOiB7IG11bHRpOiBcIjxudW1iZXI+IHwgaW5maW5pdGVcIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi1tcy1hbmltYXRpb24tbmFtZVwiICAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCJub25lIHwgPGlkZW50PlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW1zLWFuaW1hdGlvbi1wbGF5LXN0YXRlXCIgICAgICAgICAgOiB7IG11bHRpOiBcInJ1bm5pbmcgfCBwYXVzZWRcIiwgY29tbWE6IHRydWUgfSxcblxuICAgIFwiLXdlYmtpdC1hbmltYXRpb24tZGVsYXlcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8dGltZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi13ZWJraXQtYW5pbWF0aW9uLWRpcmVjdGlvblwiICAgICAgICAgICA6IHsgbXVsdGk6IFwibm9ybWFsIHwgYWx0ZXJuYXRlXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItd2Via2l0LWFuaW1hdGlvbi1kdXJhdGlvblwiICAgICAgICAgICAgOiB7IG11bHRpOiBcIjx0aW1lPlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLXdlYmtpdC1hbmltYXRpb24tZmlsbC1tb2RlXCIgICAgICAgICAgIDogeyBtdWx0aTogXCJub25lIHwgZm9yd2FyZHMgfCBiYWNrd2FyZHMgfCBib3RoXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItd2Via2l0LWFuaW1hdGlvbi1pdGVyYXRpb24tY291bnRcIiAgICAgOiB7IG11bHRpOiBcIjxudW1iZXI+IHwgaW5maW5pdGVcIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi13ZWJraXQtYW5pbWF0aW9uLW5hbWVcIiAgICAgICAgICAgICAgICA6IHsgbXVsdGk6IFwibm9uZSB8IDxpZGVudD5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi13ZWJraXQtYW5pbWF0aW9uLXBsYXktc3RhdGVcIiAgICAgICAgICA6IHsgbXVsdGk6IFwicnVubmluZyB8IHBhdXNlZFwiLCBjb21tYTogdHJ1ZSB9LFxuXG4gICAgXCItby1hbmltYXRpb24tZGVsYXlcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8dGltZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcIi1vLWFuaW1hdGlvbi1kaXJlY3Rpb25cIiAgICAgICAgICAgOiB7IG11bHRpOiBcIm5vcm1hbCB8IGFsdGVybmF0ZVwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW8tYW5pbWF0aW9uLWR1cmF0aW9uXCIgICAgICAgICAgICA6IHsgbXVsdGk6IFwiPHRpbWU+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItby1hbmltYXRpb24taXRlcmF0aW9uLWNvdW50XCIgICAgIDogeyBtdWx0aTogXCI8bnVtYmVyPiB8IGluZmluaXRlXCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCItby1hbmltYXRpb24tbmFtZVwiICAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCJub25lIHwgPGlkZW50PlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiLW8tYW5pbWF0aW9uLXBsYXktc3RhdGVcIiAgICAgICAgICA6IHsgbXVsdGk6IFwicnVubmluZyB8IHBhdXNlZFwiLCBjb21tYTogdHJ1ZSB9LFxuXG4gICAgXCJhcHBlYXJhbmNlXCIgICAgICAgICAgICAgICAgICAgIDogXCJpY29uIHwgd2luZG93IHwgZGVza3RvcCB8IHdvcmtzcGFjZSB8IGRvY3VtZW50IHwgdG9vbHRpcCB8IGRpYWxvZyB8IGJ1dHRvbiB8IHB1c2gtYnV0dG9uIHwgaHlwZXJsaW5rIHwgcmFkaW8tYnV0dG9uIHwgY2hlY2tib3ggfCBtZW51LWl0ZW0gfCB0YWIgfCBtZW51IHwgbWVudWJhciB8IHB1bGwtZG93bi1tZW51IHwgcG9wLXVwLW1lbnUgfCBsaXN0LW1lbnUgfCByYWRpby1ncm91cCB8IGNoZWNrYm94LWdyb3VwIHwgb3V0bGluZS10cmVlIHwgcmFuZ2UgfCBmaWVsZCB8IGNvbWJvLWJveCB8IHNpZ25hdHVyZSB8IHBhc3N3b3JkIHwgbm9ybWFsIHwgbm9uZSB8IGluaGVyaXRcIixcbiAgICBcImF6aW11dGhcIiAgICAgICAgICAgICAgICAgICAgICAgOiBmdW5jdGlvbiAoZXhwcmVzc2lvbikge1xuICAgICAgICB2YXIgc2ltcGxlICAgICAgPSBcIjxhbmdsZT4gfCBsZWZ0d2FyZHMgfCByaWdodHdhcmRzIHwgaW5oZXJpdFwiLFxuICAgICAgICAgICAgZGlyZWN0aW9uICAgPSBcImxlZnQtc2lkZSB8IGZhci1sZWZ0IHwgbGVmdCB8IGNlbnRlci1sZWZ0IHwgY2VudGVyIHwgY2VudGVyLXJpZ2h0IHwgcmlnaHQgfCBmYXItcmlnaHQgfCByaWdodC1zaWRlXCIsXG4gICAgICAgICAgICBiZWhpbmQgICAgICA9IGZhbHNlLFxuICAgICAgICAgICAgdmFsaWQgICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHBhcnQ7XG5cbiAgICAgICAgaWYgKCFWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgc2ltcGxlKSkge1xuICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImJlaGluZFwiKSkge1xuICAgICAgICAgICAgICAgIGJlaGluZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgdmFsaWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIGRpcmVjdGlvbikpIHtcbiAgICAgICAgICAgICAgICB2YWxpZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKCFiZWhpbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIFwiYmVoaW5kXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChleHByZXNzaW9uLmhhc05leHQoKSkge1xuICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ubmV4dCgpO1xuICAgICAgICAgICAgaWYgKHZhbGlkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIGVuZCBvZiB2YWx1ZSBidXQgZm91bmQgJ1wiICsgcGFydCArIFwiJy5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoXCJFeHBlY3RlZCAoPCdhemltdXRoJz4pIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvL0JcbiAgICBcImJhY2tmYWNlLXZpc2liaWxpdHlcIiAgICAgICAgICAgOiBcInZpc2libGUgfCBoaWRkZW5cIixcbiAgICBcImJhY2tncm91bmRcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiYmFja2dyb3VuZC1hdHRhY2htZW50XCIgICAgICAgICA6IHsgbXVsdGk6IFwiPGF0dGFjaG1lbnQ+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJiYWNrZ3JvdW5kLWNsaXBcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8Ym94PlwiLCBjb21tYTogdHJ1ZSB9LFxuICAgIFwiYmFja2dyb3VuZC1jb2xvclwiICAgICAgICAgICAgICA6IFwiPGNvbG9yPiB8IGluaGVyaXRcIixcbiAgICBcImJhY2tncm91bmQtaW1hZ2VcIiAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjxiZy1pbWFnZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcImJhY2tncm91bmQtb3JpZ2luXCIgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjxib3g+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJiYWNrZ3JvdW5kLXBvc2l0aW9uXCIgICAgICAgICAgIDogeyBtdWx0aTogXCI8YmctcG9zaXRpb24+XCIsIGNvbW1hOiB0cnVlIH0sXG4gICAgXCJiYWNrZ3JvdW5kLXJlcGVhdFwiICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8cmVwZWF0LXN0eWxlPlwiIH0sXG4gICAgXCJiYWNrZ3JvdW5kLXNpemVcIiAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8Ymctc2l6ZT5cIiwgY29tbWE6IHRydWUgfSxcbiAgICBcImJhc2VsaW5lLXNoaWZ0XCIgICAgICAgICAgICAgICAgOiBcImJhc2VsaW5lIHwgc3ViIHwgc3VwZXIgfCA8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPlwiLFxuICAgIFwiYmVoYXZpb3JcIiAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJiaW5kaW5nXCIgICAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcImJsZWVkXCIgICAgICAgICAgICAgICAgICAgICAgICAgOiBcIjxsZW5ndGg+XCIsXG4gICAgXCJib29rbWFyay1sYWJlbFwiICAgICAgICAgICAgICAgIDogXCI8Y29udGVudD4gfCA8YXR0cj4gfCA8c3RyaW5nPlwiLFxuICAgIFwiYm9va21hcmstbGV2ZWxcIiAgICAgICAgICAgICAgICA6IFwibm9uZSB8IDxpbnRlZ2VyPlwiLFxuICAgIFwiYm9va21hcmstc3RhdGVcIiAgICAgICAgICAgICAgICA6IFwib3BlbiB8IGNsb3NlZFwiLFxuICAgIFwiYm9va21hcmstdGFyZ2V0XCIgICAgICAgICAgICAgICA6IFwibm9uZSB8IDx1cmk+IHwgPGF0dHI+XCIsXG4gICAgXCJib3JkZXJcIiAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXdpZHRoPiB8fCA8Ym9yZGVyLXN0eWxlPiB8fCA8Y29sb3I+XCIsXG4gICAgXCJib3JkZXItYm90dG9tXCIgICAgICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXdpZHRoPiB8fCA8Ym9yZGVyLXN0eWxlPiB8fCA8Y29sb3I+XCIsXG4gICAgXCJib3JkZXItYm90dG9tLWNvbG9yXCIgICAgICAgICAgIDogXCI8Y29sb3I+IHwgaW5oZXJpdFwiLFxuICAgIFwiYm9yZGVyLWJvdHRvbS1sZWZ0LXJhZGl1c1wiICAgICA6ICBcIjx4LW9uZS1yYWRpdXM+XCIsXG4gICAgXCJib3JkZXItYm90dG9tLXJpZ2h0LXJhZGl1c1wiICAgIDogIFwiPHgtb25lLXJhZGl1cz5cIixcbiAgICBcImJvcmRlci1ib3R0b20tc3R5bGVcIiAgICAgICAgICAgOiBcIjxib3JkZXItc3R5bGU+XCIsXG4gICAgXCJib3JkZXItYm90dG9tLXdpZHRoXCIgICAgICAgICAgIDogXCI8Ym9yZGVyLXdpZHRoPlwiLFxuICAgIFwiYm9yZGVyLWNvbGxhcHNlXCIgICAgICAgICAgICAgICA6IFwiY29sbGFwc2UgfCBzZXBhcmF0ZSB8IGluaGVyaXRcIixcbiAgICBcImJvcmRlci1jb2xvclwiICAgICAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjxjb2xvcj4gfCBpbmhlcml0XCIsIG1heDogNCB9LFxuICAgIFwiYm9yZGVyLWltYWdlXCIgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJib3JkZXItaW1hZ2Utb3V0c2V0XCIgICAgICAgICAgIDogeyBtdWx0aTogXCI8bGVuZ3RoPiB8IDxudW1iZXI+XCIsIG1heDogNCB9LFxuICAgIFwiYm9yZGVyLWltYWdlLXJlcGVhdFwiICAgICAgICAgICA6IHsgbXVsdGk6IFwic3RyZXRjaCB8IHJlcGVhdCB8IHJvdW5kXCIsIG1heDogMiB9LFxuICAgIFwiYm9yZGVyLWltYWdlLXNsaWNlXCIgICAgICAgICAgICA6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcblxuICAgICAgICB2YXIgdmFsaWQgICA9IGZhbHNlLFxuICAgICAgICAgICAgbnVtZXJpYyA9IFwiPG51bWJlcj4gfCA8cGVyY2VudGFnZT5cIixcbiAgICAgICAgICAgIGZpbGwgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIGNvdW50ICAgPSAwLFxuICAgICAgICAgICAgbWF4ICAgICA9IDQsXG4gICAgICAgICAgICBwYXJ0O1xuXG4gICAgICAgIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgXCJmaWxsXCIpKSB7XG4gICAgICAgICAgICBmaWxsID0gdHJ1ZTtcbiAgICAgICAgICAgIHZhbGlkID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChleHByZXNzaW9uLmhhc05leHQoKSAmJiBjb3VudCA8IG1heCkge1xuICAgICAgICAgICAgdmFsaWQgPSBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgbnVtZXJpYyk7XG4gICAgICAgICAgICBpZiAoIXZhbGlkKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICB9XG5cblxuICAgICAgICBpZiAoIWZpbGwpIHtcbiAgICAgICAgICAgIFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImZpbGxcIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWxpZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXhwcmVzc2lvbi5oYXNOZXh0KCkpIHtcbiAgICAgICAgICAgIHBhcnQgPSBleHByZXNzaW9uLm5leHQoKTtcbiAgICAgICAgICAgIGlmICh2YWxpZCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoXCJFeHBlY3RlZCBlbmQgb2YgdmFsdWUgYnV0IGZvdW5kICdcIiArIHBhcnQgKyBcIicuXCIsIHBhcnQubGluZSwgcGFydC5jb2wpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgKFs8bnVtYmVyPiB8IDxwZXJjZW50YWdlPl17MSw0fSAmJiBmaWxsPykgYnV0IGZvdW5kICdcIiArIHBhcnQgKyBcIicuXCIsIHBhcnQubGluZSwgcGFydC5jb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcImJvcmRlci1pbWFnZS1zb3VyY2VcIiAgICAgICAgICAgOiBcIjxpbWFnZT4gfCBub25lXCIsXG4gICAgXCJib3JkZXItaW1hZ2Utd2lkdGhcIiAgICAgICAgICAgIDogeyBtdWx0aTogXCI8bGVuZ3RoPiB8IDxwZXJjZW50YWdlPiB8IDxudW1iZXI+IHwgYXV0b1wiLCBtYXg6IDQgfSxcbiAgICBcImJvcmRlci1sZWZ0XCIgICAgICAgICAgICAgICAgICAgOiBcIjxib3JkZXItd2lkdGg+IHx8IDxib3JkZXItc3R5bGU+IHx8IDxjb2xvcj5cIixcbiAgICBcImJvcmRlci1sZWZ0LWNvbG9yXCIgICAgICAgICAgICAgOiBcIjxjb2xvcj4gfCBpbmhlcml0XCIsXG4gICAgXCJib3JkZXItbGVmdC1zdHlsZVwiICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXN0eWxlPlwiLFxuICAgIFwiYm9yZGVyLWxlZnQtd2lkdGhcIiAgICAgICAgICAgICA6IFwiPGJvcmRlci13aWR0aD5cIixcbiAgICBcImJvcmRlci1yYWRpdXNcIiAgICAgICAgICAgICAgICAgOiBmdW5jdGlvbihleHByZXNzaW9uKSB7XG5cbiAgICAgICAgdmFyIHZhbGlkICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHNpbXBsZSA9IFwiPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCBpbmhlcml0XCIsXG4gICAgICAgICAgICBzbGFzaCAgID0gZmFsc2UsXG4gICAgICAgICAgICBmaWxsICAgID0gZmFsc2UsXG4gICAgICAgICAgICBjb3VudCAgID0gMCxcbiAgICAgICAgICAgIG1heCAgICAgPSA4LFxuICAgICAgICAgICAgcGFydDtcblxuICAgICAgICB3aGlsZSAoZXhwcmVzc2lvbi5oYXNOZXh0KCkgJiYgY291bnQgPCBtYXgpIHtcbiAgICAgICAgICAgIHZhbGlkID0gVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHNpbXBsZSk7XG4gICAgICAgICAgICBpZiAoIXZhbGlkKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoZXhwcmVzc2lvbi5wZWVrKCkgPT0gXCIvXCIgJiYgY291bnQgPiAwICYmICFzbGFzaCkge1xuICAgICAgICAgICAgICAgICAgICBzbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIG1heCA9IGNvdW50ICsgNTtcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbi5uZXh0KCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChleHByZXNzaW9uLmhhc05leHQoKSkge1xuICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ubmV4dCgpO1xuICAgICAgICAgICAgaWYgKHZhbGlkKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIGVuZCBvZiB2YWx1ZSBidXQgZm91bmQgJ1wiICsgcGFydCArIFwiJy5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoXCJFeHBlY3RlZCAoPCdib3JkZXItcmFkaXVzJz4pIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgXCJib3JkZXItcmlnaHRcIiAgICAgICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXdpZHRoPiB8fCA8Ym9yZGVyLXN0eWxlPiB8fCA8Y29sb3I+XCIsXG4gICAgXCJib3JkZXItcmlnaHQtY29sb3JcIiAgICAgICAgICAgIDogXCI8Y29sb3I+IHwgaW5oZXJpdFwiLFxuICAgIFwiYm9yZGVyLXJpZ2h0LXN0eWxlXCIgICAgICAgICAgICA6IFwiPGJvcmRlci1zdHlsZT5cIixcbiAgICBcImJvcmRlci1yaWdodC13aWR0aFwiICAgICAgICAgICAgOiBcIjxib3JkZXItd2lkdGg+XCIsXG4gICAgXCJib3JkZXItc3BhY2luZ1wiICAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8bGVuZ3RoPiB8IGluaGVyaXRcIiwgbWF4OiAyIH0sXG4gICAgXCJib3JkZXItc3R5bGVcIiAgICAgICAgICAgICAgICAgIDogeyBtdWx0aTogXCI8Ym9yZGVyLXN0eWxlPlwiLCBtYXg6IDQgfSxcbiAgICBcImJvcmRlci10b3BcIiAgICAgICAgICAgICAgICAgICAgOiBcIjxib3JkZXItd2lkdGg+IHx8IDxib3JkZXItc3R5bGU+IHx8IDxjb2xvcj5cIixcbiAgICBcImJvcmRlci10b3AtY29sb3JcIiAgICAgICAgICAgICAgOiBcIjxjb2xvcj4gfCBpbmhlcml0XCIsXG4gICAgXCJib3JkZXItdG9wLWxlZnQtcmFkaXVzXCIgICAgICAgIDogXCI8eC1vbmUtcmFkaXVzPlwiLFxuICAgIFwiYm9yZGVyLXRvcC1yaWdodC1yYWRpdXNcIiAgICAgICA6IFwiPHgtb25lLXJhZGl1cz5cIixcbiAgICBcImJvcmRlci10b3Atc3R5bGVcIiAgICAgICAgICAgICAgOiBcIjxib3JkZXItc3R5bGU+XCIsXG4gICAgXCJib3JkZXItdG9wLXdpZHRoXCIgICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXdpZHRoPlwiLFxuICAgIFwiYm9yZGVyLXdpZHRoXCIgICAgICAgICAgICAgICAgICA6IHsgbXVsdGk6IFwiPGJvcmRlci13aWR0aD5cIiwgbWF4OiA0IH0sXG4gICAgXCJib3R0b21cIiAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8bWFyZ2luLXdpZHRoPiB8IGluaGVyaXRcIixcbiAgICBcIi1tb3otYm94LWFsaWduXCIgICAgICAgICAgICAgICAgOiBcInN0YXJ0IHwgZW5kIHwgY2VudGVyIHwgYmFzZWxpbmUgfCBzdHJldGNoXCIsXG4gICAgXCItbW96LWJveC1kZWNvcmF0aW9uLWJyZWFrXCIgICAgIDogXCJzbGljZSB8Y2xvbmVcIixcbiAgICBcIi1tb3otYm94LWRpcmVjdGlvblwiICAgICAgICAgICAgOiBcIm5vcm1hbCB8IHJldmVyc2UgfCBpbmhlcml0XCIsXG4gICAgXCItbW96LWJveC1mbGV4XCIgICAgICAgICAgICAgICAgIDogXCI8bnVtYmVyPlwiLFxuICAgIFwiLW1vei1ib3gtZmxleC1ncm91cFwiICAgICAgICAgICA6IFwiPGludGVnZXI+XCIsXG4gICAgXCItbW96LWJveC1saW5lc1wiICAgICAgICAgICAgICAgIDogXCJzaW5nbGUgfCBtdWx0aXBsZVwiLFxuICAgIFwiLW1vei1ib3gtb3JkaW5hbC1ncm91cFwiICAgICAgICA6IFwiPGludGVnZXI+XCIsXG4gICAgXCItbW96LWJveC1vcmllbnRcIiAgICAgICAgICAgICAgIDogXCJob3Jpem9udGFsIHwgdmVydGljYWwgfCBpbmxpbmUtYXhpcyB8IGJsb2NrLWF4aXMgfCBpbmhlcml0XCIsXG4gICAgXCItbW96LWJveC1wYWNrXCIgICAgICAgICAgICAgICAgIDogXCJzdGFydCB8IGVuZCB8IGNlbnRlciB8IGp1c3RpZnlcIixcbiAgICBcIi13ZWJraXQtYm94LWFsaWduXCIgICAgICAgICAgICAgOiBcInN0YXJ0IHwgZW5kIHwgY2VudGVyIHwgYmFzZWxpbmUgfCBzdHJldGNoXCIsXG4gICAgXCItd2Via2l0LWJveC1kZWNvcmF0aW9uLWJyZWFrXCIgIDogXCJzbGljZSB8Y2xvbmVcIixcbiAgICBcIi13ZWJraXQtYm94LWRpcmVjdGlvblwiICAgICAgICAgOiBcIm5vcm1hbCB8IHJldmVyc2UgfCBpbmhlcml0XCIsXG4gICAgXCItd2Via2l0LWJveC1mbGV4XCIgICAgICAgICAgICAgIDogXCI8bnVtYmVyPlwiLFxuICAgIFwiLXdlYmtpdC1ib3gtZmxleC1ncm91cFwiICAgICAgICA6IFwiPGludGVnZXI+XCIsXG4gICAgXCItd2Via2l0LWJveC1saW5lc1wiICAgICAgICAgICAgIDogXCJzaW5nbGUgfCBtdWx0aXBsZVwiLFxuICAgIFwiLXdlYmtpdC1ib3gtb3JkaW5hbC1ncm91cFwiICAgICA6IFwiPGludGVnZXI+XCIsXG4gICAgXCItd2Via2l0LWJveC1vcmllbnRcIiAgICAgICAgICAgIDogXCJob3Jpem9udGFsIHwgdmVydGljYWwgfCBpbmxpbmUtYXhpcyB8IGJsb2NrLWF4aXMgfCBpbmhlcml0XCIsXG4gICAgXCItd2Via2l0LWJveC1wYWNrXCIgICAgICAgICAgICAgIDogXCJzdGFydCB8IGVuZCB8IGNlbnRlciB8IGp1c3RpZnlcIixcbiAgICBcImJveC1zaGFkb3dcIiAgICAgICAgICAgICAgICAgICAgOiBmdW5jdGlvbiAoZXhwcmVzc2lvbikge1xuICAgICAgICB2YXIgcmVzdWx0ICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHBhcnQ7XG5cbiAgICAgICAgaWYgKCFWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgXCJub25lXCIpKSB7XG4gICAgICAgICAgICBWYWxpZGF0aW9uLm11bHRpUHJvcGVydHkoXCI8c2hhZG93PlwiLCBleHByZXNzaW9uLCB0cnVlLCBJbmZpbml0eSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZXhwcmVzc2lvbi5oYXNOZXh0KCkpIHtcbiAgICAgICAgICAgICAgICBwYXJ0ID0gZXhwcmVzc2lvbi5uZXh0KCk7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIGVuZCBvZiB2YWx1ZSBidXQgZm91bmQgJ1wiICsgcGFydCArIFwiJy5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9LFxuICAgIFwiYm94LXNpemluZ1wiICAgICAgICAgICAgICAgICAgICA6IFwiY29udGVudC1ib3ggfCBib3JkZXItYm94IHwgaW5oZXJpdFwiLFxuICAgIFwiYnJlYWstYWZ0ZXJcIiAgICAgICAgICAgICAgICAgICA6IFwiYXV0byB8IGFsd2F5cyB8IGF2b2lkIHwgbGVmdCB8IHJpZ2h0IHwgcGFnZSB8IGNvbHVtbiB8IGF2b2lkLXBhZ2UgfCBhdm9pZC1jb2x1bW5cIixcbiAgICBcImJyZWFrLWJlZm9yZVwiICAgICAgICAgICAgICAgICAgOiBcImF1dG8gfCBhbHdheXMgfCBhdm9pZCB8IGxlZnQgfCByaWdodCB8IHBhZ2UgfCBjb2x1bW4gfCBhdm9pZC1wYWdlIHwgYXZvaWQtY29sdW1uXCIsXG4gICAgXCJicmVhay1pbnNpZGVcIiAgICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgYXZvaWQgfCBhdm9pZC1wYWdlIHwgYXZvaWQtY29sdW1uXCIsXG5cbiAgICAvL0NcbiAgICBcImNhcHRpb24tc2lkZVwiICAgICAgICAgICAgICAgICAgOiBcInRvcCB8IGJvdHRvbSB8IGluaGVyaXRcIixcbiAgICBcImNsZWFyXCIgICAgICAgICAgICAgICAgICAgICAgICAgOiBcIm5vbmUgfCByaWdodCB8IGxlZnQgfCBib3RoIHwgaW5oZXJpdFwiLFxuICAgIFwiY2xpcFwiICAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJjb2xvclwiICAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8Y29sb3I+IHwgaW5oZXJpdFwiLFxuICAgIFwiY29sb3ItcHJvZmlsZVwiICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJjb2x1bW4tY291bnRcIiAgICAgICAgICAgICAgICAgIDogXCI8aW50ZWdlcj4gfCBhdXRvXCIsICAgICAgICAgICAgICAgICAgICAgIC8vaHR0cDovL3d3dy53My5vcmcvVFIvY3NzMy1tdWx0aWNvbC9cbiAgICBcImNvbHVtbi1maWxsXCIgICAgICAgICAgICAgICAgICAgOiBcImF1dG8gfCBiYWxhbmNlXCIsXG4gICAgXCJjb2x1bW4tZ2FwXCIgICAgICAgICAgICAgICAgICAgIDogXCI8bGVuZ3RoPiB8IG5vcm1hbFwiLFxuICAgIFwiY29sdW1uLXJ1bGVcIiAgICAgICAgICAgICAgICAgICA6IFwiPGJvcmRlci13aWR0aD4gfHwgPGJvcmRlci1zdHlsZT4gfHwgPGNvbG9yPlwiLFxuICAgIFwiY29sdW1uLXJ1bGUtY29sb3JcIiAgICAgICAgICAgICA6IFwiPGNvbG9yPlwiLFxuICAgIFwiY29sdW1uLXJ1bGUtc3R5bGVcIiAgICAgICAgICAgICA6IFwiPGJvcmRlci1zdHlsZT5cIixcbiAgICBcImNvbHVtbi1ydWxlLXdpZHRoXCIgICAgICAgICAgICAgOiBcIjxib3JkZXItd2lkdGg+XCIsXG4gICAgXCJjb2x1bW4tc3BhblwiICAgICAgICAgICAgICAgICAgIDogXCJub25lIHwgYWxsXCIsXG4gICAgXCJjb2x1bW4td2lkdGhcIiAgICAgICAgICAgICAgICAgIDogXCI8bGVuZ3RoPiB8IGF1dG9cIixcbiAgICBcImNvbHVtbnNcIiAgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiY29udGVudFwiICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJjb3VudGVyLWluY3JlbWVudFwiICAgICAgICAgICAgIDogMSxcbiAgICBcImNvdW50ZXItcmVzZXRcIiAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiY3JvcFwiICAgICAgICAgICAgICAgICAgICAgICAgICA6IFwiPHNoYXBlPiB8IGF1dG9cIixcbiAgICBcImN1ZVwiICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBcImN1ZS1hZnRlciB8IGN1ZS1iZWZvcmUgfCBpbmhlcml0XCIsXG4gICAgXCJjdWUtYWZ0ZXJcIiAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcImN1ZS1iZWZvcmVcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiY3Vyc29yXCIgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG5cbiAgICAvL0RcbiAgICBcImRpcmVjdGlvblwiICAgICAgICAgICAgICAgICAgICAgOiBcImx0ciB8IHJ0bCB8IGluaGVyaXRcIixcbiAgICBcImRpc3BsYXlcIiAgICAgICAgICAgICAgICAgICAgICAgOiBcImlubGluZSB8IGJsb2NrIHwgbGlzdC1pdGVtIHwgaW5saW5lLWJsb2NrIHwgdGFibGUgfCBpbmxpbmUtdGFibGUgfCB0YWJsZS1yb3ctZ3JvdXAgfCB0YWJsZS1oZWFkZXItZ3JvdXAgfCB0YWJsZS1mb290ZXItZ3JvdXAgfCB0YWJsZS1yb3cgfCB0YWJsZS1jb2x1bW4tZ3JvdXAgfCB0YWJsZS1jb2x1bW4gfCB0YWJsZS1jZWxsIHwgdGFibGUtY2FwdGlvbiB8IGdyaWQgfCBpbmxpbmUtZ3JpZCB8IG5vbmUgfCBpbmhlcml0IHwgLW1vei1ib3ggfCAtbW96LWlubGluZS1ibG9jayB8IC1tb3otaW5saW5lLWJveCB8IC1tb3otaW5saW5lLWdyaWQgfCAtbW96LWlubGluZS1zdGFjayB8IC1tb3otaW5saW5lLXRhYmxlIHwgLW1vei1ncmlkIHwgLW1vei1ncmlkLWdyb3VwIHwgLW1vei1ncmlkLWxpbmUgfCAtbW96LWdyb3VwYm94IHwgLW1vei1kZWNrIHwgLW1vei1wb3B1cCB8IC1tb3otc3RhY2sgfCAtbW96LW1hcmtlciB8IC13ZWJraXQtYm94IHwgLXdlYmtpdC1pbmxpbmUtYm94IHwgLW1zLWZsZXhib3ggfCAtbXMtaW5saW5lLWZsZXhib3ggfCBmbGV4IHwgLXdlYmtpdC1mbGV4IHwgaW5saW5lLWZsZXggfCAtd2Via2l0LWlubGluZS1mbGV4XCIsXG4gICAgXCJkb21pbmFudC1iYXNlbGluZVwiICAgICAgICAgICAgIDogMSxcbiAgICBcImRyb3AtaW5pdGlhbC1hZnRlci1hZGp1c3RcIiAgICAgOiBcImNlbnRyYWwgfCBtaWRkbGUgfCBhZnRlci1lZGdlIHwgdGV4dC1hZnRlci1lZGdlIHwgaWRlb2dyYXBoaWMgfCBhbHBoYWJldGljIHwgbWF0aGVtYXRpY2FsIHwgPHBlcmNlbnRhZ2U+IHwgPGxlbmd0aD5cIixcbiAgICBcImRyb3AtaW5pdGlhbC1hZnRlci1hbGlnblwiICAgICAgOiBcImJhc2VsaW5lIHwgdXNlLXNjcmlwdCB8IGJlZm9yZS1lZGdlIHwgdGV4dC1iZWZvcmUtZWRnZSB8IGFmdGVyLWVkZ2UgfCB0ZXh0LWFmdGVyLWVkZ2UgfCBjZW50cmFsIHwgbWlkZGxlIHwgaWRlb2dyYXBoaWMgfCBhbHBoYWJldGljIHwgaGFuZ2luZyB8IG1hdGhlbWF0aWNhbFwiLFxuICAgIFwiZHJvcC1pbml0aWFsLWJlZm9yZS1hZGp1c3RcIiAgICA6IFwiYmVmb3JlLWVkZ2UgfCB0ZXh0LWJlZm9yZS1lZGdlIHwgY2VudHJhbCB8IG1pZGRsZSB8IGhhbmdpbmcgfCBtYXRoZW1hdGljYWwgfCA8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPlwiLFxuICAgIFwiZHJvcC1pbml0aWFsLWJlZm9yZS1hbGlnblwiICAgICA6IFwiY2Fwcy1oZWlnaHQgfCBiYXNlbGluZSB8IHVzZS1zY3JpcHQgfCBiZWZvcmUtZWRnZSB8IHRleHQtYmVmb3JlLWVkZ2UgfCBhZnRlci1lZGdlIHwgdGV4dC1hZnRlci1lZGdlIHwgY2VudHJhbCB8IG1pZGRsZSB8IGlkZW9ncmFwaGljIHwgYWxwaGFiZXRpYyB8IGhhbmdpbmcgfCBtYXRoZW1hdGljYWxcIixcbiAgICBcImRyb3AtaW5pdGlhbC1zaXplXCIgICAgICAgICAgICAgOiBcImF1dG8gfCBsaW5lIHwgPGxlbmd0aD4gfCA8cGVyY2VudGFnZT5cIixcbiAgICBcImRyb3AtaW5pdGlhbC12YWx1ZVwiICAgICAgICAgICAgOiBcImluaXRpYWwgfCA8aW50ZWdlcj5cIixcblxuICAgIC8vRVxuICAgIFwiZWxldmF0aW9uXCIgICAgICAgICAgICAgICAgICAgICA6IFwiPGFuZ2xlPiB8IGJlbG93IHwgbGV2ZWwgfCBhYm92ZSB8IGhpZ2hlciB8IGxvd2VyIHwgaW5oZXJpdFwiLFxuICAgIFwiZW1wdHktY2VsbHNcIiAgICAgICAgICAgICAgICAgICA6IFwic2hvdyB8IGhpZGUgfCBpbmhlcml0XCIsXG5cbiAgICAvL0ZcbiAgICBcImZpbHRlclwiICAgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiZml0XCIgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFwiZmlsbCB8IGhpZGRlbiB8IG1lZXQgfCBzbGljZVwiLFxuICAgIFwiZml0LXBvc2l0aW9uXCIgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJmbGV4XCIgICAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8ZmxleD5cIixcbiAgICBcImZsZXgtYmFzaXNcIiAgICAgICAgICAgICAgICAgICAgOiBcIjx3aWR0aD5cIixcbiAgICBcImZsZXgtZGlyZWN0aW9uXCIgICAgICAgICAgICAgICAgOiBcInJvdyB8IHJvdy1yZXZlcnNlIHwgY29sdW1uIHwgY29sdW1uLXJldmVyc2VcIixcbiAgICBcImZsZXgtZmxvd1wiICAgICAgICAgICAgICAgICAgICAgOiBcIjxmbGV4LWRpcmVjdGlvbj4gfHwgPGZsZXgtd3JhcD5cIixcbiAgICBcImZsZXgtZ3Jvd1wiICAgICAgICAgICAgICAgICAgICAgOiBcIjxudW1iZXI+XCIsXG4gICAgXCJmbGV4LXNocmlua1wiICAgICAgICAgICAgICAgICAgIDogXCI8bnVtYmVyPlwiLFxuICAgIFwiZmxleC13cmFwXCIgICAgICAgICAgICAgICAgICAgICA6IFwibm93cmFwIHwgd3JhcCB8IHdyYXAtcmV2ZXJzZVwiLFxuICAgIFwiLXdlYmtpdC1mbGV4XCIgICAgICAgICAgICAgICAgICA6IFwiPGZsZXg+XCIsXG4gICAgXCItd2Via2l0LWZsZXgtYmFzaXNcIiAgICAgICAgICAgIDogXCI8d2lkdGg+XCIsXG4gICAgXCItd2Via2l0LWZsZXgtZGlyZWN0aW9uXCIgICAgICAgIDogXCJyb3cgfCByb3ctcmV2ZXJzZSB8IGNvbHVtbiB8IGNvbHVtbi1yZXZlcnNlXCIsXG4gICAgXCItd2Via2l0LWZsZXgtZmxvd1wiICAgICAgICAgICAgIDogXCI8ZmxleC1kaXJlY3Rpb24+IHx8IDxmbGV4LXdyYXA+XCIsXG4gICAgXCItd2Via2l0LWZsZXgtZ3Jvd1wiICAgICAgICAgICAgIDogXCI8bnVtYmVyPlwiLFxuICAgIFwiLXdlYmtpdC1mbGV4LXNocmlua1wiICAgICAgICAgICA6IFwiPG51bWJlcj5cIixcbiAgICBcIi13ZWJraXQtZmxleC13cmFwXCIgICAgICAgICAgICAgOiBcIm5vd3JhcCB8IHdyYXAgfCB3cmFwLXJldmVyc2VcIixcbiAgICBcIi1tcy1mbGV4XCIgICAgICAgICAgICAgICAgICAgICAgOiBcIjxmbGV4PlwiLFxuICAgIFwiLW1zLWZsZXgtYWxpZ25cIiAgICAgICAgICAgICAgICA6IFwic3RhcnQgfCBlbmQgfCBjZW50ZXIgfCBzdHJldGNoIHwgYmFzZWxpbmVcIixcbiAgICBcIi1tcy1mbGV4LWRpcmVjdGlvblwiICAgICAgICAgICAgOiBcInJvdyB8IHJvdy1yZXZlcnNlIHwgY29sdW1uIHwgY29sdW1uLXJldmVyc2UgfCBpbmhlcml0XCIsXG4gICAgXCItbXMtZmxleC1vcmRlclwiICAgICAgICAgICAgICAgIDogXCI8bnVtYmVyPlwiLFxuICAgIFwiLW1zLWZsZXgtcGFja1wiICAgICAgICAgICAgICAgICA6IFwic3RhcnQgfCBlbmQgfCBjZW50ZXIgfCBqdXN0aWZ5XCIsXG4gICAgXCItbXMtZmxleC13cmFwXCIgICAgICAgICAgICAgICAgIDogXCJub3dyYXAgfCB3cmFwIHwgd3JhcC1yZXZlcnNlXCIsXG4gICAgXCJmbG9hdFwiICAgICAgICAgICAgICAgICAgICAgICAgIDogXCJsZWZ0IHwgcmlnaHQgfCBub25lIHwgaW5oZXJpdFwiLFxuICAgIFwiZmxvYXQtb2Zmc2V0XCIgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJmb250XCIgICAgICAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcImZvbnQtZmFtaWx5XCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiZm9udC1zaXplXCIgICAgICAgICAgICAgICAgICAgICA6IFwiPGFic29sdXRlLXNpemU+IHwgPHJlbGF0aXZlLXNpemU+IHwgPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCBpbmhlcml0XCIsXG4gICAgXCJmb250LXNpemUtYWRqdXN0XCIgICAgICAgICAgICAgIDogXCI8bnVtYmVyPiB8IG5vbmUgfCBpbmhlcml0XCIsXG4gICAgXCJmb250LXN0cmV0Y2hcIiAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCB1bHRyYS1jb25kZW5zZWQgfCBleHRyYS1jb25kZW5zZWQgfCBjb25kZW5zZWQgfCBzZW1pLWNvbmRlbnNlZCB8IHNlbWktZXhwYW5kZWQgfCBleHBhbmRlZCB8IGV4dHJhLWV4cGFuZGVkIHwgdWx0cmEtZXhwYW5kZWQgfCBpbmhlcml0XCIsXG4gICAgXCJmb250LXN0eWxlXCIgICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBpdGFsaWMgfCBvYmxpcXVlIHwgaW5oZXJpdFwiLFxuICAgIFwiZm9udC12YXJpYW50XCIgICAgICAgICAgICAgICAgICA6IFwibm9ybWFsIHwgc21hbGwtY2FwcyB8IGluaGVyaXRcIixcbiAgICBcImZvbnQtd2VpZ2h0XCIgICAgICAgICAgICAgICAgICAgOiBcIm5vcm1hbCB8IGJvbGQgfCBib2xkZXIgfCBsaWdodGVyIHwgMTAwIHwgMjAwIHwgMzAwIHwgNDAwIHwgNTAwIHwgNjAwIHwgNzAwIHwgODAwIHwgOTAwIHwgaW5oZXJpdFwiLFxuXG4gICAgLy9HXG4gICAgXCJncmlkLWNlbGwtc3RhY2tpbmdcIiAgICAgICAgICAgIDogXCJjb2x1bW5zIHwgcm93cyB8IGxheWVyXCIsXG4gICAgXCJncmlkLWNvbHVtblwiICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcImdyaWQtY29sdW1uc1wiICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiZ3JpZC1jb2x1bW4tYWxpZ25cIiAgICAgICAgICAgICA6IFwic3RhcnQgfCBlbmQgfCBjZW50ZXIgfCBzdHJldGNoXCIsXG4gICAgXCJncmlkLWNvbHVtbi1zaXppbmdcIiAgICAgICAgICAgIDogMSxcbiAgICBcImdyaWQtY29sdW1uLXNwYW5cIiAgICAgICAgICAgICAgOiBcIjxpbnRlZ2VyPlwiLFxuICAgIFwiZ3JpZC1mbG93XCIgICAgICAgICAgICAgICAgICAgICA6IFwibm9uZSB8IHJvd3MgfCBjb2x1bW5zXCIsXG4gICAgXCJncmlkLWxheWVyXCIgICAgICAgICAgICAgICAgICAgIDogXCI8aW50ZWdlcj5cIixcbiAgICBcImdyaWQtcm93XCIgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwiZ3JpZC1yb3dzXCIgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJncmlkLXJvdy1hbGlnblwiICAgICAgICAgICAgICAgIDogXCJzdGFydCB8IGVuZCB8IGNlbnRlciB8IHN0cmV0Y2hcIixcbiAgICBcImdyaWQtcm93LXNwYW5cIiAgICAgICAgICAgICAgICAgOiBcIjxpbnRlZ2VyPlwiLFxuICAgIFwiZ3JpZC1yb3ctc2l6aW5nXCIgICAgICAgICAgICAgICA6IDEsXG5cbiAgICAvL0hcbiAgICBcImhhbmdpbmctcHVuY3R1YXRpb25cIiAgICAgICAgICAgOiAxLFxuICAgIFwiaGVpZ2h0XCIgICAgICAgICAgICAgICAgICAgICAgICA6IFwiPG1hcmdpbi13aWR0aD4gfCA8Y29udGVudC1zaXppbmc+IHwgaW5oZXJpdFwiLFxuICAgIFwiaHlwaGVuYXRlLWFmdGVyXCIgICAgICAgICAgICAgICA6IFwiPGludGVnZXI+IHwgYXV0b1wiLFxuICAgIFwiaHlwaGVuYXRlLWJlZm9yZVwiICAgICAgICAgICAgICA6IFwiPGludGVnZXI+IHwgYXV0b1wiLFxuICAgIFwiaHlwaGVuYXRlLWNoYXJhY3RlclwiICAgICAgICAgICA6IFwiPHN0cmluZz4gfCBhdXRvXCIsXG4gICAgXCJoeXBoZW5hdGUtbGluZXNcIiAgICAgICAgICAgICAgIDogXCJuby1saW1pdCB8IDxpbnRlZ2VyPlwiLFxuICAgIFwiaHlwaGVuYXRlLXJlc291cmNlXCIgICAgICAgICAgICA6IDEsXG4gICAgXCJoeXBoZW5zXCIgICAgICAgICAgICAgICAgICAgICAgIDogXCJub25lIHwgbWFudWFsIHwgYXV0b1wiLFxuXG4gICAgLy9JXG4gICAgXCJpY29uXCIgICAgICAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcImltYWdlLW9yaWVudGF0aW9uXCIgICAgICAgICAgICAgOiBcImFuZ2xlIHwgYXV0b1wiLFxuICAgIFwiaW1hZ2UtcmVuZGVyaW5nXCIgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJpbWFnZS1yZXNvbHV0aW9uXCIgICAgICAgICAgICAgIDogMSxcbiAgICBcImlubGluZS1ib3gtYWxpZ25cIiAgICAgICAgICAgICAgOiBcImluaXRpYWwgfCBsYXN0IHwgPGludGVnZXI+XCIsXG5cbiAgICAvL0pcbiAgICBcImp1c3RpZnktY29udGVudFwiICAgICAgICAgICAgICAgOiBcImZsZXgtc3RhcnQgfCBmbGV4LWVuZCB8IGNlbnRlciB8IHNwYWNlLWJldHdlZW4gfCBzcGFjZS1hcm91bmRcIixcbiAgICBcIi13ZWJraXQtanVzdGlmeS1jb250ZW50XCIgICAgICAgOiBcImZsZXgtc3RhcnQgfCBmbGV4LWVuZCB8IGNlbnRlciB8IHNwYWNlLWJldHdlZW4gfCBzcGFjZS1hcm91bmRcIixcblxuICAgIC8vTFxuICAgIFwibGVmdFwiICAgICAgICAgICAgICAgICAgICAgICAgICA6IFwiPG1hcmdpbi13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJsZXR0ZXItc3BhY2luZ1wiICAgICAgICAgICAgICAgIDogXCI8bGVuZ3RoPiB8IG5vcm1hbCB8IGluaGVyaXRcIixcbiAgICBcImxpbmUtaGVpZ2h0XCIgICAgICAgICAgICAgICAgICAgOiBcIjxudW1iZXI+IHwgPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCBub3JtYWwgfCBpbmhlcml0XCIsXG4gICAgXCJsaW5lLWJyZWFrXCIgICAgICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgbG9vc2UgfCBub3JtYWwgfCBzdHJpY3RcIixcbiAgICBcImxpbmUtc3RhY2tpbmdcIiAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwibGluZS1zdGFja2luZy1ydWJ5XCIgICAgICAgICAgICA6IFwiZXhjbHVkZS1ydWJ5IHwgaW5jbHVkZS1ydWJ5XCIsXG4gICAgXCJsaW5lLXN0YWNraW5nLXNoaWZ0XCIgICAgICAgICAgIDogXCJjb25zaWRlci1zaGlmdHMgfCBkaXNyZWdhcmQtc2hpZnRzXCIsXG4gICAgXCJsaW5lLXN0YWNraW5nLXN0cmF0ZWd5XCIgICAgICAgIDogXCJpbmxpbmUtbGluZS1oZWlnaHQgfCBibG9jay1saW5lLWhlaWdodCB8IG1heC1oZWlnaHQgfCBncmlkLWhlaWdodFwiLFxuICAgIFwibGlzdC1zdHlsZVwiICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJsaXN0LXN0eWxlLWltYWdlXCIgICAgICAgICAgICAgIDogXCI8dXJpPiB8IG5vbmUgfCBpbmhlcml0XCIsXG4gICAgXCJsaXN0LXN0eWxlLXBvc2l0aW9uXCIgICAgICAgICAgIDogXCJpbnNpZGUgfCBvdXRzaWRlIHwgaW5oZXJpdFwiLFxuICAgIFwibGlzdC1zdHlsZS10eXBlXCIgICAgICAgICAgICAgICA6IFwiZGlzYyB8IGNpcmNsZSB8IHNxdWFyZSB8IGRlY2ltYWwgfCBkZWNpbWFsLWxlYWRpbmctemVybyB8IGxvd2VyLXJvbWFuIHwgdXBwZXItcm9tYW4gfCBsb3dlci1ncmVlayB8IGxvd2VyLWxhdGluIHwgdXBwZXItbGF0aW4gfCBhcm1lbmlhbiB8IGdlb3JnaWFuIHwgbG93ZXItYWxwaGEgfCB1cHBlci1hbHBoYSB8IG5vbmUgfCBpbmhlcml0XCIsXG5cbiAgICAvL01cbiAgICBcIm1hcmdpblwiICAgICAgICAgICAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjxtYXJnaW4td2lkdGg+IHwgaW5oZXJpdFwiLCBtYXg6IDQgfSxcbiAgICBcIm1hcmdpbi1ib3R0b21cIiAgICAgICAgICAgICAgICAgOiBcIjxtYXJnaW4td2lkdGg+IHwgaW5oZXJpdFwiLFxuICAgIFwibWFyZ2luLWxlZnRcIiAgICAgICAgICAgICAgICAgICA6IFwiPG1hcmdpbi13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJtYXJnaW4tcmlnaHRcIiAgICAgICAgICAgICAgICAgIDogXCI8bWFyZ2luLXdpZHRoPiB8IGluaGVyaXRcIixcbiAgICBcIm1hcmdpbi10b3BcIiAgICAgICAgICAgICAgICAgICAgOiBcIjxtYXJnaW4td2lkdGg+IHwgaW5oZXJpdFwiLFxuICAgIFwibWFya1wiICAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJtYXJrLWFmdGVyXCIgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcIm1hcmstYmVmb3JlXCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwibWFya3NcIiAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJtYXJxdWVlLWRpcmVjdGlvblwiICAgICAgICAgICAgIDogMSxcbiAgICBcIm1hcnF1ZWUtcGxheS1jb3VudFwiICAgICAgICAgICAgOiAxLFxuICAgIFwibWFycXVlZS1zcGVlZFwiICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJtYXJxdWVlLXN0eWxlXCIgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcIm1heC1oZWlnaHRcIiAgICAgICAgICAgICAgICAgICAgOiBcIjxsZW5ndGg+IHwgPHBlcmNlbnRhZ2U+IHwgPGNvbnRlbnQtc2l6aW5nPiB8IG5vbmUgfCBpbmhlcml0XCIsXG4gICAgXCJtYXgtd2lkdGhcIiAgICAgICAgICAgICAgICAgICAgIDogXCI8bGVuZ3RoPiB8IDxwZXJjZW50YWdlPiB8IDxjb250ZW50LXNpemluZz4gfCBub25lIHwgaW5oZXJpdFwiLFxuICAgIFwibWluLWhlaWdodFwiICAgICAgICAgICAgICAgICAgICA6IFwiPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCA8Y29udGVudC1zaXppbmc+IHwgY29udGFpbi1mbG9hdHMgfCAtbW96LWNvbnRhaW4tZmxvYXRzIHwgLXdlYmtpdC1jb250YWluLWZsb2F0cyB8IGluaGVyaXRcIixcbiAgICBcIm1pbi13aWR0aFwiICAgICAgICAgICAgICAgICAgICAgOiBcIjxsZW5ndGg+IHwgPHBlcmNlbnRhZ2U+IHwgPGNvbnRlbnQtc2l6aW5nPiB8IGNvbnRhaW4tZmxvYXRzIHwgLW1vei1jb250YWluLWZsb2F0cyB8IC13ZWJraXQtY29udGFpbi1mbG9hdHMgfCBpbmhlcml0XCIsXG4gICAgXCJtb3ZlLXRvXCIgICAgICAgICAgICAgICAgICAgICAgIDogMSxcblxuICAgIC8vTlxuICAgIFwibmF2LWRvd25cIiAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJuYXYtaW5kZXhcIiAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcIm5hdi1sZWZ0XCIgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwibmF2LXJpZ2h0XCIgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJuYXYtdXBcIiAgICAgICAgICAgICAgICAgICAgICAgIDogMSxcblxuICAgIC8vT1xuICAgIFwib3BhY2l0eVwiICAgICAgICAgICAgICAgICAgICAgICA6IFwiPG51bWJlcj4gfCBpbmhlcml0XCIsXG4gICAgXCJvcmRlclwiICAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8aW50ZWdlcj5cIixcbiAgICBcIi13ZWJraXQtb3JkZXJcIiAgICAgICAgICAgICAgICAgOiBcIjxpbnRlZ2VyPlwiLFxuICAgIFwib3JwaGFuc1wiICAgICAgICAgICAgICAgICAgICAgICA6IFwiPGludGVnZXI+IHwgaW5oZXJpdFwiLFxuICAgIFwib3V0bGluZVwiICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJvdXRsaW5lLWNvbG9yXCIgICAgICAgICAgICAgICAgIDogXCI8Y29sb3I+IHwgaW52ZXJ0IHwgaW5oZXJpdFwiLFxuICAgIFwib3V0bGluZS1vZmZzZXRcIiAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJvdXRsaW5lLXN0eWxlXCIgICAgICAgICAgICAgICAgIDogXCI8Ym9yZGVyLXN0eWxlPiB8IGluaGVyaXRcIixcbiAgICBcIm91dGxpbmUtd2lkdGhcIiAgICAgICAgICAgICAgICAgOiBcIjxib3JkZXItd2lkdGg+IHwgaW5oZXJpdFwiLFxuICAgIFwib3ZlcmZsb3dcIiAgICAgICAgICAgICAgICAgICAgICA6IFwidmlzaWJsZSB8IGhpZGRlbiB8IHNjcm9sbCB8IGF1dG8gfCBpbmhlcml0XCIsXG4gICAgXCJvdmVyZmxvdy1zdHlsZVwiICAgICAgICAgICAgICAgIDogMSxcbiAgICBcIm92ZXJmbG93LXdyYXBcIiAgICAgICAgICAgICAgICAgOiBcIm5vcm1hbCB8IGJyZWFrLXdvcmRcIixcbiAgICBcIm92ZXJmbG93LXhcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwib3ZlcmZsb3cteVwiICAgICAgICAgICAgICAgICAgICA6IDEsXG5cbiAgICAvL1BcbiAgICBcInBhZGRpbmdcIiAgICAgICAgICAgICAgICAgICAgICAgOiB7IG11bHRpOiBcIjxwYWRkaW5nLXdpZHRoPiB8IGluaGVyaXRcIiwgbWF4OiA0IH0sXG4gICAgXCJwYWRkaW5nLWJvdHRvbVwiICAgICAgICAgICAgICAgIDogXCI8cGFkZGluZy13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJwYWRkaW5nLWxlZnRcIiAgICAgICAgICAgICAgICAgIDogXCI8cGFkZGluZy13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJwYWRkaW5nLXJpZ2h0XCIgICAgICAgICAgICAgICAgIDogXCI8cGFkZGluZy13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJwYWRkaW5nLXRvcFwiICAgICAgICAgICAgICAgICAgIDogXCI8cGFkZGluZy13aWR0aD4gfCBpbmhlcml0XCIsXG4gICAgXCJwYWdlXCIgICAgICAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInBhZ2UtYnJlYWstYWZ0ZXJcIiAgICAgICAgICAgICAgOiBcImF1dG8gfCBhbHdheXMgfCBhdm9pZCB8IGxlZnQgfCByaWdodCB8IGluaGVyaXRcIixcbiAgICBcInBhZ2UtYnJlYWstYmVmb3JlXCIgICAgICAgICAgICAgOiBcImF1dG8gfCBhbHdheXMgfCBhdm9pZCB8IGxlZnQgfCByaWdodCB8IGluaGVyaXRcIixcbiAgICBcInBhZ2UtYnJlYWstaW5zaWRlXCIgICAgICAgICAgICAgOiBcImF1dG8gfCBhdm9pZCB8IGluaGVyaXRcIixcbiAgICBcInBhZ2UtcG9saWN5XCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicGF1c2VcIiAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJwYXVzZS1hZnRlclwiICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInBhdXNlLWJlZm9yZVwiICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicGVyc3BlY3RpdmVcIiAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJwZXJzcGVjdGl2ZS1vcmlnaW5cIiAgICAgICAgICAgIDogMSxcbiAgICBcInBob25lbWVzXCIgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicGl0Y2hcIiAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJwaXRjaC1yYW5nZVwiICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInBsYXktZHVyaW5nXCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicG9pbnRlci1ldmVudHNcIiAgICAgICAgICAgICAgICA6IFwiYXV0byB8IG5vbmUgfCB2aXNpYmxlUGFpbnRlZCB8IHZpc2libGVGaWxsIHwgdmlzaWJsZVN0cm9rZSB8IHZpc2libGUgfCBwYWludGVkIHwgZmlsbCB8IHN0cm9rZSB8IGFsbCB8IGluaGVyaXRcIixcbiAgICBcInBvc2l0aW9uXCIgICAgICAgICAgICAgICAgICAgICAgOiBcInN0YXRpYyB8IHJlbGF0aXZlIHwgYWJzb2x1dGUgfCBmaXhlZCB8IGluaGVyaXRcIixcbiAgICBcInByZXNlbnRhdGlvbi1sZXZlbFwiICAgICAgICAgICAgOiAxLFxuICAgIFwicHVuY3R1YXRpb24tdHJpbVwiICAgICAgICAgICAgICA6IDEsXG5cbiAgICAvL1FcbiAgICBcInF1b3Rlc1wiICAgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuXG4gICAgLy9SXG4gICAgXCJyZW5kZXJpbmctaW50ZW50XCIgICAgICAgICAgICAgIDogMSxcbiAgICBcInJlc2l6ZVwiICAgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicmVzdFwiICAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJyZXN0LWFmdGVyXCIgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInJlc3QtYmVmb3JlXCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicmljaG5lc3NcIiAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJyaWdodFwiICAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8bWFyZ2luLXdpZHRoPiB8IGluaGVyaXRcIixcbiAgICBcInJvdGF0aW9uXCIgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicm90YXRpb24tcG9pbnRcIiAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJydWJ5LWFsaWduXCIgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInJ1Ynktb3ZlcmhhbmdcIiAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwicnVieS1wb3NpdGlvblwiICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJydWJ5LXNwYW5cIiAgICAgICAgICAgICAgICAgICAgIDogMSxcblxuICAgIC8vU1xuICAgIFwic2l6ZVwiICAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJzcGVha1wiICAgICAgICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBub25lIHwgc3BlbGwtb3V0IHwgaW5oZXJpdFwiLFxuICAgIFwic3BlYWstaGVhZGVyXCIgICAgICAgICAgICAgICAgICA6IFwib25jZSB8IGFsd2F5cyB8IGluaGVyaXRcIixcbiAgICBcInNwZWFrLW51bWVyYWxcIiAgICAgICAgICAgICAgICAgOiBcImRpZ2l0cyB8IGNvbnRpbnVvdXMgfCBpbmhlcml0XCIsXG4gICAgXCJzcGVhay1wdW5jdHVhdGlvblwiICAgICAgICAgICAgIDogXCJjb2RlIHwgbm9uZSB8IGluaGVyaXRcIixcbiAgICBcInNwZWVjaC1yYXRlXCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwic3JjXCIgICAgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJzdHJlc3NcIiAgICAgICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInN0cmluZy1zZXRcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuXG4gICAgXCJ0YWJsZS1sYXlvdXRcIiAgICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgZml4ZWQgfCBpbmhlcml0XCIsXG4gICAgXCJ0YWItc2l6ZVwiICAgICAgICAgICAgICAgICAgICAgIDogXCI8aW50ZWdlcj4gfCA8bGVuZ3RoPlwiLFxuICAgIFwidGFyZ2V0XCIgICAgICAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0YXJnZXQtbmFtZVwiICAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInRhcmdldC1uZXdcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidGFyZ2V0LXBvc2l0aW9uXCIgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0ZXh0LWFsaWduXCIgICAgICAgICAgICAgICAgICAgIDogXCJsZWZ0IHwgcmlnaHQgfCBjZW50ZXIgfCBqdXN0aWZ5IHwgaW5oZXJpdFwiICxcbiAgICBcInRleHQtYWxpZ24tbGFzdFwiICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidGV4dC1kZWNvcmF0aW9uXCIgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0ZXh0LWVtcGhhc2lzXCIgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInRleHQtaGVpZ2h0XCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidGV4dC1pbmRlbnRcIiAgICAgICAgICAgICAgICAgICA6IFwiPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCBpbmhlcml0XCIsXG4gICAgXCJ0ZXh0LWp1c3RpZnlcIiAgICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgbm9uZSB8IGludGVyLXdvcmQgfCBpbnRlci1pZGVvZ3JhcGggfCBpbnRlci1jbHVzdGVyIHwgZGlzdHJpYnV0ZSB8IGthc2hpZGFcIixcbiAgICBcInRleHQtb3V0bGluZVwiICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidGV4dC1vdmVyZmxvd1wiICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0ZXh0LXJlbmRlcmluZ1wiICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgb3B0aW1pemVTcGVlZCB8IG9wdGltaXplTGVnaWJpbGl0eSB8IGdlb21ldHJpY1ByZWNpc2lvbiB8IGluaGVyaXRcIixcbiAgICBcInRleHQtc2hhZG93XCIgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidGV4dC10cmFuc2Zvcm1cIiAgICAgICAgICAgICAgICA6IFwiY2FwaXRhbGl6ZSB8IHVwcGVyY2FzZSB8IGxvd2VyY2FzZSB8IG5vbmUgfCBpbmhlcml0XCIsXG4gICAgXCJ0ZXh0LXdyYXBcIiAgICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBub25lIHwgYXZvaWRcIixcbiAgICBcInRvcFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBcIjxtYXJnaW4td2lkdGg+IHwgaW5oZXJpdFwiLFxuICAgIFwiLW1zLXRvdWNoLWFjdGlvblwiICAgICAgICAgICAgICA6IFwiYXV0byB8IG5vbmUgfCBwYW4teCB8IHBhbi15XCIsXG4gICAgXCJ0b3VjaC1hY3Rpb25cIiAgICAgICAgICAgICAgICAgIDogXCJhdXRvIHwgbm9uZSB8IHBhbi14IHwgcGFuLXlcIixcbiAgICBcInRyYW5zZm9ybVwiICAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidHJhbnNmb3JtLW9yaWdpblwiICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0cmFuc2Zvcm0tc3R5bGVcIiAgICAgICAgICAgICAgIDogMSxcbiAgICBcInRyYW5zaXRpb25cIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidHJhbnNpdGlvbi1kZWxheVwiICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ0cmFuc2l0aW9uLWR1cmF0aW9uXCIgICAgICAgICAgIDogMSxcbiAgICBcInRyYW5zaXRpb24tcHJvcGVydHlcIiAgICAgICAgICAgOiAxLFxuICAgIFwidHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb25cIiAgICA6IDEsXG5cbiAgICAvL1VcbiAgICBcInVuaWNvZGUtYmlkaVwiICAgICAgICAgICAgICAgICAgOiBcIm5vcm1hbCB8IGVtYmVkIHwgaXNvbGF0ZSB8IGJpZGktb3ZlcnJpZGUgfCBpc29sYXRlLW92ZXJyaWRlIHwgcGxhaW50ZXh0IHwgaW5oZXJpdFwiLFxuICAgIFwidXNlci1tb2RpZnlcIiAgICAgICAgICAgICAgICAgICA6IFwicmVhZC1vbmx5IHwgcmVhZC13cml0ZSB8IHdyaXRlLW9ubHkgfCBpbmhlcml0XCIsXG4gICAgXCJ1c2VyLXNlbGVjdFwiICAgICAgICAgICAgICAgICAgIDogXCJub25lIHwgdGV4dCB8IHRvZ2dsZSB8IGVsZW1lbnQgfCBlbGVtZW50cyB8IGFsbCB8IGluaGVyaXRcIixcblxuICAgIC8vVlxuICAgIFwidmVydGljYWwtYWxpZ25cIiAgICAgICAgICAgICAgICA6IFwiYXV0byB8IHVzZS1zY3JpcHQgfCBiYXNlbGluZSB8IHN1YiB8IHN1cGVyIHwgdG9wIHwgdGV4dC10b3AgfCBjZW50cmFsIHwgbWlkZGxlIHwgYm90dG9tIHwgdGV4dC1ib3R0b20gfCA8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPlwiLFxuICAgIFwidmlzaWJpbGl0eVwiICAgICAgICAgICAgICAgICAgICA6IFwidmlzaWJsZSB8IGhpZGRlbiB8IGNvbGxhcHNlIHwgaW5oZXJpdFwiLFxuICAgIFwidm9pY2UtYmFsYW5jZVwiICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ2b2ljZS1kdXJhdGlvblwiICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInZvaWNlLWZhbWlseVwiICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidm9pY2UtcGl0Y2hcIiAgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ2b2ljZS1waXRjaC1yYW5nZVwiICAgICAgICAgICAgIDogMSxcbiAgICBcInZvaWNlLXJhdGVcIiAgICAgICAgICAgICAgICAgICAgOiAxLFxuICAgIFwidm9pY2Utc3RyZXNzXCIgICAgICAgICAgICAgICAgICA6IDEsXG4gICAgXCJ2b2ljZS12b2x1bWVcIiAgICAgICAgICAgICAgICAgIDogMSxcbiAgICBcInZvbHVtZVwiICAgICAgICAgICAgICAgICAgICAgICAgOiAxLFxuXG4gICAgLy9XXG4gICAgXCJ3aGl0ZS1zcGFjZVwiICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBwcmUgfCBub3dyYXAgfCBwcmUtd3JhcCB8IHByZS1saW5lIHwgaW5oZXJpdCB8IC1wcmUtd3JhcCB8IC1vLXByZS13cmFwIHwgLW1vei1wcmUtd3JhcCB8IC1ocC1wcmUtd3JhcFwiLCAvL2h0dHA6Ly9wZXJpc2hhYmxlcHJlc3MuY29tL3dyYXBwaW5nLWNvbnRlbnQvXG4gICAgXCJ3aGl0ZS1zcGFjZS1jb2xsYXBzZVwiICAgICAgICAgIDogMSxcbiAgICBcIndpZG93c1wiICAgICAgICAgICAgICAgICAgICAgICAgOiBcIjxpbnRlZ2VyPiB8IGluaGVyaXRcIixcbiAgICBcIndpZHRoXCIgICAgICAgICAgICAgICAgICAgICAgICAgOiBcIjxsZW5ndGg+IHwgPHBlcmNlbnRhZ2U+IHwgPGNvbnRlbnQtc2l6aW5nPiB8IGF1dG8gfCBpbmhlcml0XCIsXG4gICAgXCJ3b3JkLWJyZWFrXCIgICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBrZWVwLWFsbCB8IGJyZWFrLWFsbFwiLFxuICAgIFwid29yZC1zcGFjaW5nXCIgICAgICAgICAgICAgICAgICA6IFwiPGxlbmd0aD4gfCBub3JtYWwgfCBpbmhlcml0XCIsXG4gICAgXCJ3b3JkLXdyYXBcIiAgICAgICAgICAgICAgICAgICAgIDogXCJub3JtYWwgfCBicmVhay13b3JkXCIsXG4gICAgXCJ3cml0aW5nLW1vZGVcIiAgICAgICAgICAgICAgICAgIDogXCJob3Jpem9udGFsLXRiIHwgdmVydGljYWwtcmwgfCB2ZXJ0aWNhbC1sciB8IGxyLXRiIHwgcmwtdGIgfCB0Yi1ybCB8IGJ0LXJsIHwgdGItbHIgfCBidC1sciB8IGxyLWJ0IHwgcmwtYnQgfCBsciB8IHJsIHwgdGIgfCBpbmhlcml0XCIsXG5cbiAgICAvL1pcbiAgICBcInotaW5kZXhcIiAgICAgICAgICAgICAgICAgICAgICAgOiBcIjxpbnRlZ2VyPiB8IGF1dG8gfCBpbmhlcml0XCIsXG4gICAgXCJ6b29tXCIgICAgICAgICAgICAgICAgICAgICAgICAgIDogXCI8bnVtYmVyPiB8IDxwZXJjZW50YWdlPiB8IG5vcm1hbFwiXG59O1xuLypnbG9iYWwgU3ludGF4VW5pdCwgUGFyc2VyKi9cbi8qKlxuICogUmVwcmVzZW50cyBhIHNlbGVjdG9yIGNvbWJpbmF0b3IgKHdoaXRlc3BhY2UsICssID4pLlxuICogQG5hbWVzcGFjZSBwYXJzZXJsaWIuY3NzXG4gKiBAY2xhc3MgUHJvcGVydHlOYW1lXG4gKiBAZXh0ZW5kcyBwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSB0ZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSB1bml0LlxuICogQHBhcmFtIHtTdHJpbmd9IGhhY2sgVGhlIHR5cGUgb2YgSUUgaGFjayBhcHBsaWVkIChcIipcIiwgXCJfXCIsIG9yIG51bGwpLlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqL1xuZnVuY3Rpb24gUHJvcGVydHlOYW1lKHRleHQsIGhhY2ssIGxpbmUsIGNvbCl7XG5cbiAgICBTeW50YXhVbml0LmNhbGwodGhpcywgdGV4dCwgbGluZSwgY29sLCBQYXJzZXIuUFJPUEVSVFlfTkFNRV9UWVBFKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSB0eXBlIG9mIElFIGhhY2sgYXBwbGllZCAoXCIqXCIsIFwiX1wiLCBvciBudWxsKS5cbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKiBAcHJvcGVydHkgaGFja1xuICAgICAqL1xuICAgIHRoaXMuaGFjayA9IGhhY2s7XG5cbn1cblxuUHJvcGVydHlOYW1lLnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5Qcm9wZXJ0eU5hbWUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gUHJvcGVydHlOYW1lO1xuUHJvcGVydHlOYW1lLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuICh0aGlzLmhhY2sgPyB0aGlzLmhhY2sgOiBcIlwiKSArIHRoaXMudGV4dDtcbn07XG4vKmdsb2JhbCBTeW50YXhVbml0LCBQYXJzZXIqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2luZ2xlIHBhcnQgb2YgYSBDU1MgcHJvcGVydHkgdmFsdWUsIG1lYW5pbmcgdGhhdCBpdCByZXByZXNlbnRzXG4gKiBqdXN0IGV2ZXJ5dGhpbmcgc2luZ2xlIHBhcnQgYmV0d2VlbiBcIjpcIiBhbmQgXCI7XCIuIElmIHRoZXJlIGFyZSBtdWx0aXBsZSB2YWx1ZXNcbiAqIHNlcGFyYXRlZCBieSBjb21tYXMsIHRoaXMgdHlwZSByZXByZXNlbnRzIGp1c3Qgb25lIG9mIHRoZSB2YWx1ZXMuXG4gKiBAcGFyYW0ge1N0cmluZ1tdfSBwYXJ0cyBBbiBhcnJheSBvZiB2YWx1ZSBwYXJ0cyBtYWtpbmcgdXAgdGhpcyB2YWx1ZS5cbiAqIEBwYXJhbSB7aW50fSBsaW5lIFRoZSBsaW5lIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqIEBwYXJhbSB7aW50fSBjb2wgVGhlIGNvbHVtbiBvZiB0ZXh0IG9uIHdoaWNoIHRoZSB1bml0IHJlc2lkZXMuXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi5jc3NcbiAqIEBjbGFzcyBQcm9wZXJ0eVZhbHVlXG4gKiBAZXh0ZW5kcyBwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0XG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gUHJvcGVydHlWYWx1ZShwYXJ0cywgbGluZSwgY29sKXtcblxuICAgIFN5bnRheFVuaXQuY2FsbCh0aGlzLCBwYXJ0cy5qb2luKFwiIFwiKSwgbGluZSwgY29sLCBQYXJzZXIuUFJPUEVSVFlfVkFMVUVfVFlQRSk7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcGFydHMgdGhhdCBtYWtlIHVwIHRoZSBzZWxlY3Rvci5cbiAgICAgKiBAdHlwZSBBcnJheVxuICAgICAqIEBwcm9wZXJ0eSBwYXJ0c1xuICAgICAqL1xuICAgIHRoaXMucGFydHMgPSBwYXJ0cztcblxufVxuXG5Qcm9wZXJ0eVZhbHVlLnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5Qcm9wZXJ0eVZhbHVlLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IFByb3BlcnR5VmFsdWU7XG5cbi8qZ2xvYmFsIFN5bnRheFVuaXQsIFBhcnNlciovXG4vKipcbiAqIEEgdXRpbGl0eSBjbGFzcyB0aGF0IGFsbG93cyBmb3IgZWFzeSBpdGVyYXRpb24gb3ZlciB0aGUgdmFyaW91cyBwYXJ0cyBvZiBhXG4gKiBwcm9wZXJ0eSB2YWx1ZS5cbiAqIEBwYXJhbSB7cGFyc2VybGliLmNzcy5Qcm9wZXJ0eVZhbHVlfSB2YWx1ZSBUaGUgcHJvcGVydHkgdmFsdWUgdG8gaXRlcmF0ZSBvdmVyLlxuICogQG5hbWVzcGFjZSBwYXJzZXJsaWIuY3NzXG4gKiBAY2xhc3MgUHJvcGVydHlWYWx1ZUl0ZXJhdG9yXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gUHJvcGVydHlWYWx1ZUl0ZXJhdG9yKHZhbHVlKXtcblxuICAgIC8qKlxuICAgICAqIEl0ZXJhdG9yIHZhbHVlXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByb3BlcnR5IF9pXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLl9pID0gMDtcblxuICAgIC8qKlxuICAgICAqIFRoZSBwYXJ0cyB0aGF0IG1ha2UgdXAgdGhlIHZhbHVlLlxuICAgICAqIEB0eXBlIEFycmF5XG4gICAgICogQHByb3BlcnR5IF9wYXJ0c1xuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5fcGFydHMgPSB2YWx1ZS5wYXJ0cztcblxuICAgIC8qKlxuICAgICAqIEtlZXBzIHRyYWNrIG9mIGJvb2ttYXJrcyBhbG9uZyB0aGUgd2F5LlxuICAgICAqIEB0eXBlIEFycmF5XG4gICAgICogQHByb3BlcnR5IF9tYXJrc1xuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5fbWFya3MgPSBbXTtcblxuICAgIC8qKlxuICAgICAqIEhvbGRzIHRoZSBvcmlnaW5hbCBwcm9wZXJ0eSB2YWx1ZS5cbiAgICAgKiBAdHlwZSBwYXJzZXJsaWIuY3NzLlByb3BlcnR5VmFsdWVcbiAgICAgKiBAcHJvcGVydHkgdmFsdWVcbiAgICAgKi9cbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG5cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB0b3RhbCBudW1iZXIgb2YgcGFydHMgaW4gdGhlIHZhbHVlLlxuICogQHJldHVybiB7aW50fSBUaGUgdG90YWwgbnVtYmVyIG9mIHBhcnRzIGluIHRoZSB2YWx1ZS5cbiAqIEBtZXRob2QgY291bnRcbiAqL1xuUHJvcGVydHlWYWx1ZUl0ZXJhdG9yLnByb3RvdHlwZS5jb3VudCA9IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHRoaXMuX3BhcnRzLmxlbmd0aDtcbn07XG5cbi8qKlxuICogSW5kaWNhdGVzIGlmIHRoZSBpdGVyYXRvciBpcyBwb3NpdGlvbmVkIGF0IHRoZSBmaXJzdCBpdGVtLlxuICogQHJldHVybiB7Qm9vbGVhbn0gVHJ1ZSBpZiBwb3NpdGlvbmVkIGF0IGZpcnN0IGl0ZW0sIGZhbHNlIGlmIG5vdC5cbiAqIEBtZXRob2QgaXNGaXJzdFxuICovXG5Qcm9wZXJ0eVZhbHVlSXRlcmF0b3IucHJvdG90eXBlLmlzRmlyc3QgPSBmdW5jdGlvbigpe1xuICAgIHJldHVybiB0aGlzLl9pID09PSAwO1xufTtcblxuLyoqXG4gKiBJbmRpY2F0ZXMgaWYgdGhlcmUgYXJlIG1vcmUgcGFydHMgb2YgdGhlIHByb3BlcnR5IHZhbHVlLlxuICogQHJldHVybiB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGVyZSBhcmUgbW9yZSBwYXJ0cywgZmFsc2UgaWYgbm90LlxuICogQG1ldGhvZCBoYXNOZXh0XG4gKi9cblByb3BlcnR5VmFsdWVJdGVyYXRvci5wcm90b3R5cGUuaGFzTmV4dCA9IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuICh0aGlzLl9pIDwgdGhpcy5fcGFydHMubGVuZ3RoKTtcbn07XG5cbi8qKlxuICogTWFya3MgdGhlIGN1cnJlbnQgc3BvdCBpbiB0aGUgaXRlcmF0aW9uIHNvIGl0IGNhbiBiZSByZXN0b3JlZCB0b1xuICogbGF0ZXIgb24uXG4gKiBAcmV0dXJuIHt2b2lkfVxuICogQG1ldGhvZCBtYXJrXG4gKi9cblByb3BlcnR5VmFsdWVJdGVyYXRvci5wcm90b3R5cGUubWFyayA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5fbWFya3MucHVzaCh0aGlzLl9pKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbmV4dCBwYXJ0IG9mIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvciBudWxsIGlmIHRoZXJlIGlzIG5vIG5leHRcbiAqIHBhcnQuIERvZXMgbm90IG1vdmUgdGhlIGludGVybmFsIGNvdW50ZXIgZm9yd2FyZC5cbiAqIEByZXR1cm4ge3BhcnNlcmxpYi5jc3MuUHJvcGVydHlWYWx1ZVBhcnR9IFRoZSBuZXh0IHBhcnQgb2YgdGhlIHByb3BlcnR5IHZhbHVlIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gbmV4dFxuICogcGFydC5cbiAqIEBtZXRob2QgcGVla1xuICovXG5Qcm9wZXJ0eVZhbHVlSXRlcmF0b3IucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbihjb3VudCl7XG4gICAgcmV0dXJuIHRoaXMuaGFzTmV4dCgpID8gdGhpcy5fcGFydHNbdGhpcy5faSArIChjb3VudCB8fCAwKV0gOiBudWxsO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBuZXh0IHBhcnQgb2YgdGhlIHByb3BlcnR5IHZhbHVlIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gbmV4dFxuICogcGFydC5cbiAqIEByZXR1cm4ge3BhcnNlcmxpYi5jc3MuUHJvcGVydHlWYWx1ZVBhcnR9IFRoZSBuZXh0IHBhcnQgb2YgdGhlIHByb3BlcnR5IHZhbHVlIG9yIG51bGwgaWYgdGhlcmUgaXMgbm8gbmV4dFxuICogcGFydC5cbiAqIEBtZXRob2QgbmV4dFxuICovXG5Qcm9wZXJ0eVZhbHVlSXRlcmF0b3IucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbigpe1xuICAgIHJldHVybiB0aGlzLmhhc05leHQoKSA/IHRoaXMuX3BhcnRzW3RoaXMuX2krK10gOiBudWxsO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBwcmV2aW91cyBwYXJ0IG9mIHRoZSBwcm9wZXJ0eSB2YWx1ZSBvciBudWxsIGlmIHRoZXJlIGlzIG5vXG4gKiBwcmV2aW91cyBwYXJ0LlxuICogQHJldHVybiB7cGFyc2VybGliLmNzcy5Qcm9wZXJ0eVZhbHVlUGFydH0gVGhlIHByZXZpb3VzIHBhcnQgb2YgdGhlXG4gKiBwcm9wZXJ0eSB2YWx1ZSBvciBudWxsIGlmIHRoZXJlIGlzIG5vIG5leHQgcGFydC5cbiAqIEBtZXRob2QgcHJldmlvdXNcbiAqL1xuUHJvcGVydHlWYWx1ZUl0ZXJhdG9yLnByb3RvdHlwZS5wcmV2aW91cyA9IGZ1bmN0aW9uKCl7XG4gICAgcmV0dXJuIHRoaXMuX2kgPiAwID8gdGhpcy5fcGFydHNbLS10aGlzLl9pXSA6IG51bGw7XG59O1xuXG4vKipcbiAqIFJlc3RvcmVzIHRoZSBsYXN0IHNhdmVkIGJvb2ttYXJrLlxuICogQHJldHVybiB7dm9pZH1cbiAqIEBtZXRob2QgcmVzdG9yZVxuICovXG5Qcm9wZXJ0eVZhbHVlSXRlcmF0b3IucHJvdG90eXBlLnJlc3RvcmUgPSBmdW5jdGlvbigpe1xuICAgIGlmICh0aGlzLl9tYXJrcy5sZW5ndGgpe1xuICAgICAgICB0aGlzLl9pID0gdGhpcy5fbWFya3MucG9wKCk7XG4gICAgfVxufTtcblxuLypnbG9iYWwgU3ludGF4VW5pdCwgUGFyc2VyLCBDb2xvcnMqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2luZ2xlIHBhcnQgb2YgYSBDU1MgcHJvcGVydHkgdmFsdWUsIG1lYW5pbmcgdGhhdCBpdCByZXByZXNlbnRzXG4gKiBqdXN0IG9uZSBwYXJ0IG9mIHRoZSBkYXRhIGJldHdlZW4gXCI6XCIgYW5kIFwiO1wiLlxuICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gKiBAcGFyYW0ge2ludH0gbGluZSBUaGUgbGluZSBvZiB0ZXh0IG9uIHdoaWNoIHRoZSB1bml0IHJlc2lkZXMuXG4gKiBAcGFyYW0ge2ludH0gY29sIFRoZSBjb2x1bW4gb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQG5hbWVzcGFjZSBwYXJzZXJsaWIuY3NzXG4gKiBAY2xhc3MgUHJvcGVydHlWYWx1ZVBhcnRcbiAqIEBleHRlbmRzIHBhcnNlcmxpYi51dGlsLlN5bnRheFVuaXRcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBQcm9wZXJ0eVZhbHVlUGFydCh0ZXh0LCBsaW5lLCBjb2wpe1xuXG4gICAgU3ludGF4VW5pdC5jYWxsKHRoaXMsIHRleHQsIGxpbmUsIGNvbCwgUGFyc2VyLlBST1BFUlRZX1ZBTFVFX1BBUlRfVFlQRSk7XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgdGhlIHR5cGUgb2YgdmFsdWUgdW5pdC5cbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKiBAcHJvcGVydHkgdHlwZVxuICAgICAqL1xuICAgIHRoaXMudHlwZSA9IFwidW5rbm93blwiO1xuXG4gICAgLy9maWd1cmUgb3V0IHdoYXQgdHlwZSBvZiBkYXRhIGl0IGlzXG5cbiAgICB2YXIgdGVtcDtcblxuICAgIC8vaXQgaXMgYSBtZWFzdXJlbWVudD9cbiAgICBpZiAoL14oWytcXC1dP1tcXGRcXC5dKykoW2Etel0rKSQvaS50ZXN0KHRleHQpKXsgIC8vZGltZW5zaW9uXG4gICAgICAgIHRoaXMudHlwZSA9IFwiZGltZW5zaW9uXCI7XG4gICAgICAgIHRoaXMudmFsdWUgPSArUmVnRXhwLiQxO1xuICAgICAgICB0aGlzLnVuaXRzID0gUmVnRXhwLiQyO1xuXG4gICAgICAgIC8vdHJ5IHRvIG5hcnJvdyBkb3duXG4gICAgICAgIHN3aXRjaCh0aGlzLnVuaXRzLnRvTG93ZXJDYXNlKCkpe1xuXG4gICAgICAgICAgICBjYXNlIFwiZW1cIjpcbiAgICAgICAgICAgIGNhc2UgXCJyZW1cIjpcbiAgICAgICAgICAgIGNhc2UgXCJleFwiOlxuICAgICAgICAgICAgY2FzZSBcInB4XCI6XG4gICAgICAgICAgICBjYXNlIFwiY21cIjpcbiAgICAgICAgICAgIGNhc2UgXCJtbVwiOlxuICAgICAgICAgICAgY2FzZSBcImluXCI6XG4gICAgICAgICAgICBjYXNlIFwicHRcIjpcbiAgICAgICAgICAgIGNhc2UgXCJwY1wiOlxuICAgICAgICAgICAgY2FzZSBcImNoXCI6XG4gICAgICAgICAgICBjYXNlIFwidmhcIjpcbiAgICAgICAgICAgIGNhc2UgXCJ2d1wiOlxuICAgICAgICAgICAgY2FzZSBcInZtYXhcIjpcbiAgICAgICAgICAgIGNhc2UgXCJ2bWluXCI6XG4gICAgICAgICAgICAgICAgdGhpcy50eXBlID0gXCJsZW5ndGhcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImRlZ1wiOlxuICAgICAgICAgICAgY2FzZSBcInJhZFwiOlxuICAgICAgICAgICAgY2FzZSBcImdyYWRcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSBcImFuZ2xlXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJtc1wiOlxuICAgICAgICAgICAgY2FzZSBcInNcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSBcInRpbWVcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImh6XCI6XG4gICAgICAgICAgICBjYXNlIFwia2h6XCI6XG4gICAgICAgICAgICAgICAgdGhpcy50eXBlID0gXCJmcmVxdWVuY3lcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSBcImRwaVwiOlxuICAgICAgICAgICAgY2FzZSBcImRwY21cIjpcbiAgICAgICAgICAgICAgICB0aGlzLnR5cGUgPSBcInJlc29sdXRpb25cIjtcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgLy9kZWZhdWx0XG5cbiAgICAgICAgfVxuXG4gICAgfSBlbHNlIGlmICgvXihbK1xcLV0/W1xcZFxcLl0rKSUkL2kudGVzdCh0ZXh0KSl7ICAvL3BlcmNlbnRhZ2VcbiAgICAgICAgdGhpcy50eXBlID0gXCJwZXJjZW50YWdlXCI7XG4gICAgICAgIHRoaXMudmFsdWUgPSArUmVnRXhwLiQxO1xuICAgIH0gZWxzZSBpZiAoL14oWytcXC1dP1xcZCspJC9pLnRlc3QodGV4dCkpeyAgLy9pbnRlZ2VyXG4gICAgICAgIHRoaXMudHlwZSA9IFwiaW50ZWdlclwiO1xuICAgICAgICB0aGlzLnZhbHVlID0gK1JlZ0V4cC4kMTtcbiAgICB9IGVsc2UgaWYgKC9eKFsrXFwtXT9bXFxkXFwuXSspJC9pLnRlc3QodGV4dCkpeyAgLy9udW1iZXJcbiAgICAgICAgdGhpcy50eXBlID0gXCJudW1iZXJcIjtcbiAgICAgICAgdGhpcy52YWx1ZSA9ICtSZWdFeHAuJDE7XG5cbiAgICB9IGVsc2UgaWYgKC9eIyhbYS1mMC05XXszLDZ9KS9pLnRlc3QodGV4dCkpeyAgLy9oZXhjb2xvclxuICAgICAgICB0aGlzLnR5cGUgPSBcImNvbG9yXCI7XG4gICAgICAgIHRlbXAgPSBSZWdFeHAuJDE7XG4gICAgICAgIGlmICh0ZW1wLmxlbmd0aCA9PSAzKXtcbiAgICAgICAgICAgIHRoaXMucmVkICAgID0gcGFyc2VJbnQodGVtcC5jaGFyQXQoMCkrdGVtcC5jaGFyQXQoMCksMTYpO1xuICAgICAgICAgICAgdGhpcy5ncmVlbiAgPSBwYXJzZUludCh0ZW1wLmNoYXJBdCgxKSt0ZW1wLmNoYXJBdCgxKSwxNik7XG4gICAgICAgICAgICB0aGlzLmJsdWUgICA9IHBhcnNlSW50KHRlbXAuY2hhckF0KDIpK3RlbXAuY2hhckF0KDIpLDE2KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucmVkICAgID0gcGFyc2VJbnQodGVtcC5zdWJzdHJpbmcoMCwyKSwxNik7XG4gICAgICAgICAgICB0aGlzLmdyZWVuICA9IHBhcnNlSW50KHRlbXAuc3Vic3RyaW5nKDIsNCksMTYpO1xuICAgICAgICAgICAgdGhpcy5ibHVlICAgPSBwYXJzZUludCh0ZW1wLnN1YnN0cmluZyg0LDYpLDE2KTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoL15yZ2JcXChcXHMqKFxcZCspXFxzKixcXHMqKFxcZCspXFxzKixcXHMqKFxcZCspXFxzKlxcKS9pLnRlc3QodGV4dCkpeyAvL3JnYigpIGNvbG9yIHdpdGggYWJzb2x1dGUgbnVtYmVyc1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwiY29sb3JcIjtcbiAgICAgICAgdGhpcy5yZWQgICAgPSArUmVnRXhwLiQxO1xuICAgICAgICB0aGlzLmdyZWVuICA9ICtSZWdFeHAuJDI7XG4gICAgICAgIHRoaXMuYmx1ZSAgID0gK1JlZ0V4cC4kMztcbiAgICB9IGVsc2UgaWYgKC9ecmdiXFwoXFxzKihcXGQrKSVcXHMqLFxccyooXFxkKyklXFxzKixcXHMqKFxcZCspJVxccypcXCkvaS50ZXN0KHRleHQpKXsgLy9yZ2IoKSBjb2xvciB3aXRoIHBlcmNlbnRhZ2VzXG4gICAgICAgIHRoaXMudHlwZSAgID0gXCJjb2xvclwiO1xuICAgICAgICB0aGlzLnJlZCAgICA9ICtSZWdFeHAuJDEgKiAyNTUgLyAxMDA7XG4gICAgICAgIHRoaXMuZ3JlZW4gID0gK1JlZ0V4cC4kMiAqIDI1NSAvIDEwMDtcbiAgICAgICAgdGhpcy5ibHVlICAgPSArUmVnRXhwLiQzICogMjU1IC8gMTAwO1xuICAgIH0gZWxzZSBpZiAoL15yZ2JhXFwoXFxzKihcXGQrKVxccyosXFxzKihcXGQrKVxccyosXFxzKihcXGQrKVxccyosXFxzKihbXFxkXFwuXSspXFxzKlxcKS9pLnRlc3QodGV4dCkpeyAvL3JnYmEoKSBjb2xvciB3aXRoIGFic29sdXRlIG51bWJlcnNcbiAgICAgICAgdGhpcy50eXBlICAgPSBcImNvbG9yXCI7XG4gICAgICAgIHRoaXMucmVkICAgID0gK1JlZ0V4cC4kMTtcbiAgICAgICAgdGhpcy5ncmVlbiAgPSArUmVnRXhwLiQyO1xuICAgICAgICB0aGlzLmJsdWUgICA9ICtSZWdFeHAuJDM7XG4gICAgICAgIHRoaXMuYWxwaGEgID0gK1JlZ0V4cC4kNDtcbiAgICB9IGVsc2UgaWYgKC9ecmdiYVxcKFxccyooXFxkKyklXFxzKixcXHMqKFxcZCspJVxccyosXFxzKihcXGQrKSVcXHMqLFxccyooW1xcZFxcLl0rKVxccypcXCkvaS50ZXN0KHRleHQpKXsgLy9yZ2JhKCkgY29sb3Igd2l0aCBwZXJjZW50YWdlc1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwiY29sb3JcIjtcbiAgICAgICAgdGhpcy5yZWQgICAgPSArUmVnRXhwLiQxICogMjU1IC8gMTAwO1xuICAgICAgICB0aGlzLmdyZWVuICA9ICtSZWdFeHAuJDIgKiAyNTUgLyAxMDA7XG4gICAgICAgIHRoaXMuYmx1ZSAgID0gK1JlZ0V4cC4kMyAqIDI1NSAvIDEwMDtcbiAgICAgICAgdGhpcy5hbHBoYSAgPSArUmVnRXhwLiQ0O1xuICAgIH0gZWxzZSBpZiAoL15oc2xcXChcXHMqKFxcZCspXFxzKixcXHMqKFxcZCspJVxccyosXFxzKihcXGQrKSVcXHMqXFwpL2kudGVzdCh0ZXh0KSl7IC8vaHNsKClcbiAgICAgICAgdGhpcy50eXBlICAgPSBcImNvbG9yXCI7XG4gICAgICAgIHRoaXMuaHVlICAgID0gK1JlZ0V4cC4kMTtcbiAgICAgICAgdGhpcy5zYXR1cmF0aW9uID0gK1JlZ0V4cC4kMiAvIDEwMDtcbiAgICAgICAgdGhpcy5saWdodG5lc3MgID0gK1JlZ0V4cC4kMyAvIDEwMDtcbiAgICB9IGVsc2UgaWYgKC9eaHNsYVxcKFxccyooXFxkKylcXHMqLFxccyooXFxkKyklXFxzKixcXHMqKFxcZCspJVxccyosXFxzKihbXFxkXFwuXSspXFxzKlxcKS9pLnRlc3QodGV4dCkpeyAvL2hzbGEoKSBjb2xvciB3aXRoIHBlcmNlbnRhZ2VzXG4gICAgICAgIHRoaXMudHlwZSAgID0gXCJjb2xvclwiO1xuICAgICAgICB0aGlzLmh1ZSAgICA9ICtSZWdFeHAuJDE7XG4gICAgICAgIHRoaXMuc2F0dXJhdGlvbiA9ICtSZWdFeHAuJDIgLyAxMDA7XG4gICAgICAgIHRoaXMubGlnaHRuZXNzICA9ICtSZWdFeHAuJDMgLyAxMDA7XG4gICAgICAgIHRoaXMuYWxwaGEgID0gK1JlZ0V4cC4kNDtcbiAgICB9IGVsc2UgaWYgKC9edXJsXFwoW1wiJ10/KFteXFwpXCInXSspW1wiJ10/XFwpL2kudGVzdCh0ZXh0KSl7IC8vVVJJXG4gICAgICAgIHRoaXMudHlwZSAgID0gXCJ1cmlcIjtcbiAgICAgICAgdGhpcy51cmkgICAgPSBSZWdFeHAuJDE7XG4gICAgfSBlbHNlIGlmICgvXihbXlxcKF0rKVxcKC9pLnRlc3QodGV4dCkpe1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwiZnVuY3Rpb25cIjtcbiAgICAgICAgdGhpcy5uYW1lICAgPSBSZWdFeHAuJDE7XG4gICAgICAgIHRoaXMudmFsdWUgID0gdGV4dDtcbiAgICB9IGVsc2UgaWYgKC9eW1wiJ11bXlwiJ10qW1wiJ10vLnRlc3QodGV4dCkpeyAgICAvL3N0cmluZ1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwic3RyaW5nXCI7XG4gICAgICAgIHRoaXMudmFsdWUgID0gZXZhbCh0ZXh0KTtcbiAgICB9IGVsc2UgaWYgKENvbG9yc1t0ZXh0LnRvTG93ZXJDYXNlKCldKXsgIC8vbmFtZWQgY29sb3JcbiAgICAgICAgdGhpcy50eXBlICAgPSBcImNvbG9yXCI7XG4gICAgICAgIHRlbXAgICAgICAgID0gQ29sb3JzW3RleHQudG9Mb3dlckNhc2UoKV0uc3Vic3RyaW5nKDEpO1xuICAgICAgICB0aGlzLnJlZCAgICA9IHBhcnNlSW50KHRlbXAuc3Vic3RyaW5nKDAsMiksMTYpO1xuICAgICAgICB0aGlzLmdyZWVuICA9IHBhcnNlSW50KHRlbXAuc3Vic3RyaW5nKDIsNCksMTYpO1xuICAgICAgICB0aGlzLmJsdWUgICA9IHBhcnNlSW50KHRlbXAuc3Vic3RyaW5nKDQsNiksMTYpO1xuICAgIH0gZWxzZSBpZiAoL15bXFwsXFwvXSQvLnRlc3QodGV4dCkpe1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwib3BlcmF0b3JcIjtcbiAgICAgICAgdGhpcy52YWx1ZSAgPSB0ZXh0O1xuICAgIH0gZWxzZSBpZiAoL15bYS16XFwtX1xcdTAwODAtXFx1RkZGRl1bYS16MC05XFwtX1xcdTAwODAtXFx1RkZGRl0qJC9pLnRlc3QodGV4dCkpe1xuICAgICAgICB0aGlzLnR5cGUgICA9IFwiaWRlbnRpZmllclwiO1xuICAgICAgICB0aGlzLnZhbHVlICA9IHRleHQ7XG4gICAgfVxuXG59XG5cblByb3BlcnR5VmFsdWVQYXJ0LnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5Qcm9wZXJ0eVZhbHVlUGFydC5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBQcm9wZXJ0eVZhbHVlUGFydDtcblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgc3ludGF4IHVuaXQgYmFzZWQgc29sZWx5IG9uIHRoZSBnaXZlbiB0b2tlbi5cbiAqIENvbnZlbmllbmNlIG1ldGhvZCBmb3IgY3JlYXRpbmcgYSBuZXcgc3ludGF4IHVuaXQgd2hlblxuICogaXQgcmVwcmVzZW50cyBhIHNpbmdsZSB0b2tlbiBpbnN0ZWFkIG9mIG11bHRpcGxlLlxuICogQHBhcmFtIHtPYmplY3R9IHRva2VuIFRoZSB0b2tlbiBvYmplY3QgdG8gcmVwcmVzZW50LlxuICogQHJldHVybiB7cGFyc2VybGliLmNzcy5Qcm9wZXJ0eVZhbHVlUGFydH0gVGhlIG9iamVjdCByZXByZXNlbnRpbmcgdGhlIHRva2VuLlxuICogQHN0YXRpY1xuICogQG1ldGhvZCBmcm9tVG9rZW5cbiAqL1xuUHJvcGVydHlWYWx1ZVBhcnQuZnJvbVRva2VuID0gZnVuY3Rpb24odG9rZW4pe1xuICAgIHJldHVybiBuZXcgUHJvcGVydHlWYWx1ZVBhcnQodG9rZW4udmFsdWUsIHRva2VuLnN0YXJ0TGluZSwgdG9rZW4uc3RhcnRDb2wpO1xufTtcbnZhciBQc2V1ZG9zID0ge1xuICAgIFwiOmZpcnN0LWxldHRlclwiOiAxLFxuICAgIFwiOmZpcnN0LWxpbmVcIjogICAxLFxuICAgIFwiOmJlZm9yZVwiOiAgICAgICAxLFxuICAgIFwiOmFmdGVyXCI6ICAgICAgICAxXG59O1xuXG5Qc2V1ZG9zLkVMRU1FTlQgPSAxO1xuUHNldWRvcy5DTEFTUyA9IDI7XG5cblBzZXVkb3MuaXNFbGVtZW50ID0gZnVuY3Rpb24ocHNldWRvKXtcbiAgICByZXR1cm4gcHNldWRvLmluZGV4T2YoXCI6OlwiKSA9PT0gMCB8fCBQc2V1ZG9zW3BzZXVkby50b0xvd2VyQ2FzZSgpXSA9PSBQc2V1ZG9zLkVMRU1FTlQ7XG59O1xuLypnbG9iYWwgU3ludGF4VW5pdCwgUGFyc2VyLCBTcGVjaWZpY2l0eSovXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gZW50aXJlIHNpbmdsZSBzZWxlY3RvciwgaW5jbHVkaW5nIGFsbCBwYXJ0cyBidXQgbm90XG4gKiBpbmNsdWRpbmcgbXVsdGlwbGUgc2VsZWN0b3JzICh0aG9zZSBzZXBhcmF0ZWQgYnkgY29tbWFzKS5cbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLmNzc1xuICogQGNsYXNzIFNlbGVjdG9yXG4gKiBAZXh0ZW5kcyBwYXJzZXJsaWIudXRpbC5TeW50YXhVbml0XG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7QXJyYXl9IHBhcnRzIEFycmF5IG9mIHNlbGVjdG9ycyBwYXJ0cyBtYWtpbmcgdXAgdGhpcyBzZWxlY3Rvci5cbiAqIEBwYXJhbSB7aW50fSBsaW5lIFRoZSBsaW5lIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqIEBwYXJhbSB7aW50fSBjb2wgVGhlIGNvbHVtbiBvZiB0ZXh0IG9uIHdoaWNoIHRoZSB1bml0IHJlc2lkZXMuXG4gKi9cbmZ1bmN0aW9uIFNlbGVjdG9yKHBhcnRzLCBsaW5lLCBjb2wpe1xuXG4gICAgU3ludGF4VW5pdC5jYWxsKHRoaXMsIHBhcnRzLmpvaW4oXCIgXCIpLCBsaW5lLCBjb2wsIFBhcnNlci5TRUxFQ1RPUl9UWVBFKTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBwYXJ0cyB0aGF0IG1ha2UgdXAgdGhlIHNlbGVjdG9yLlxuICAgICAqIEB0eXBlIEFycmF5XG4gICAgICogQHByb3BlcnR5IHBhcnRzXG4gICAgICovXG4gICAgdGhpcy5wYXJ0cyA9IHBhcnRzO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHNwZWNpZmljaXR5IG9mIHRoZSBzZWxlY3Rvci5cbiAgICAgKiBAdHlwZSBwYXJzZXJsaWIuY3NzLlNwZWNpZmljaXR5XG4gICAgICogQHByb3BlcnR5IHNwZWNpZmljaXR5XG4gICAgICovXG4gICAgdGhpcy5zcGVjaWZpY2l0eSA9IFNwZWNpZmljaXR5LmNhbGN1bGF0ZSh0aGlzKTtcblxufVxuXG5TZWxlY3Rvci5wcm90b3R5cGUgPSBuZXcgU3ludGF4VW5pdCgpO1xuU2VsZWN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gU2VsZWN0b3I7XG5cbi8qZ2xvYmFsIFN5bnRheFVuaXQsIFBhcnNlciovXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzaW5nbGUgcGFydCBvZiBhIHNlbGVjdG9yIHN0cmluZywgbWVhbmluZyBhIHNpbmdsZSBzZXQgb2ZcbiAqIGVsZW1lbnQgbmFtZSBhbmQgbW9kaWZpZXJzLiBUaGlzIGRvZXMgbm90IGluY2x1ZGUgY29tYmluYXRvcnMgc3VjaCBhc1xuICogc3BhY2VzLCArLCA+LCBldGMuXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi5jc3NcbiAqIEBjbGFzcyBTZWxlY3RvclBhcnRcbiAqIEBleHRlbmRzIHBhcnNlcmxpYi51dGlsLlN5bnRheFVuaXRcbiAqIEBjb25zdHJ1Y3RvclxuICogQHBhcmFtIHtTdHJpbmd9IGVsZW1lbnROYW1lIFRoZSBlbGVtZW50IG5hbWUgaW4gdGhlIHNlbGVjdG9yIG9yIG51bGxcbiAqICAgICAgaWYgdGhlcmUgaXMgbm8gZWxlbWVudCBuYW1lLlxuICogQHBhcmFtIHtBcnJheX0gbW9kaWZpZXJzIEFycmF5IG9mIGluZGl2aWR1YWwgbW9kaWZpZXJzIGZvciB0aGUgZWxlbWVudC5cbiAqICAgICAgTWF5IGJlIGVtcHR5IGlmIHRoZXJlIGFyZSBub25lLlxuICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gKiBAcGFyYW0ge2ludH0gbGluZSBUaGUgbGluZSBvZiB0ZXh0IG9uIHdoaWNoIHRoZSB1bml0IHJlc2lkZXMuXG4gKiBAcGFyYW0ge2ludH0gY29sIFRoZSBjb2x1bW4gb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICovXG5mdW5jdGlvbiBTZWxlY3RvclBhcnQoZWxlbWVudE5hbWUsIG1vZGlmaWVycywgdGV4dCwgbGluZSwgY29sKXtcblxuICAgIFN5bnRheFVuaXQuY2FsbCh0aGlzLCB0ZXh0LCBsaW5lLCBjb2wsIFBhcnNlci5TRUxFQ1RPUl9QQVJUX1RZUEUpO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRhZyBuYW1lIG9mIHRoZSBlbGVtZW50IHRvIHdoaWNoIHRoaXMgcGFydFxuICAgICAqIG9mIHRoZSBzZWxlY3RvciBhZmZlY3RzLlxuICAgICAqIEB0eXBlIFN0cmluZ1xuICAgICAqIEBwcm9wZXJ0eSBlbGVtZW50TmFtZVxuICAgICAqL1xuICAgIHRoaXMuZWxlbWVudE5hbWUgPSBlbGVtZW50TmFtZTtcblxuICAgIC8qKlxuICAgICAqIFRoZSBwYXJ0cyB0aGF0IGNvbWUgYWZ0ZXIgdGhlIGVsZW1lbnQgbmFtZSwgc3VjaCBhcyBjbGFzcyBuYW1lcywgSURzLFxuICAgICAqIHBzZXVkbyBjbGFzc2VzL2VsZW1lbnRzLCBldGMuXG4gICAgICogQHR5cGUgQXJyYXlcbiAgICAgKiBAcHJvcGVydHkgbW9kaWZpZXJzXG4gICAgICovXG4gICAgdGhpcy5tb2RpZmllcnMgPSBtb2RpZmllcnM7XG5cbn1cblxuU2VsZWN0b3JQYXJ0LnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5TZWxlY3RvclBhcnQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gU2VsZWN0b3JQYXJ0O1xuXG4vKmdsb2JhbCBTeW50YXhVbml0LCBQYXJzZXIqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2VsZWN0b3IgbW9kaWZpZXIgc3RyaW5nLCBtZWFuaW5nIGEgY2xhc3MgbmFtZSwgZWxlbWVudCBuYW1lLFxuICogZWxlbWVudCBJRCwgcHNldWRvIHJ1bGUsIGV0Yy5cbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLmNzc1xuICogQGNsYXNzIFNlbGVjdG9yU3ViUGFydFxuICogQGV4dGVuZHMgcGFyc2VybGliLnV0aWwuU3ludGF4VW5pdFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgdGV4dCByZXByZXNlbnRhdGlvbiBvZiB0aGUgdW5pdC5cbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIFRoZSB0eXBlIG9mIHNlbGVjdG9yIG1vZGlmaWVyLlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgb2YgdGV4dCBvbiB3aGljaCB0aGUgdW5pdCByZXNpZGVzLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG9mIHRleHQgb24gd2hpY2ggdGhlIHVuaXQgcmVzaWRlcy5cbiAqL1xuZnVuY3Rpb24gU2VsZWN0b3JTdWJQYXJ0KHRleHQsIHR5cGUsIGxpbmUsIGNvbCl7XG5cbiAgICBTeW50YXhVbml0LmNhbGwodGhpcywgdGV4dCwgbGluZSwgY29sLCBQYXJzZXIuU0VMRUNUT1JfU1VCX1BBUlRfVFlQRSk7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgdHlwZSBvZiBtb2RpZmllci5cbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKiBAcHJvcGVydHkgdHlwZVxuICAgICAqL1xuICAgIHRoaXMudHlwZSA9IHR5cGU7XG5cbiAgICAvKipcbiAgICAgKiBTb21lIHN1YnBhcnRzIGhhdmUgYXJndW1lbnRzLCB0aGlzIHJlcHJlc2VudHMgdGhlbS5cbiAgICAgKiBAdHlwZSBBcnJheVxuICAgICAqIEBwcm9wZXJ0eSBhcmdzXG4gICAgICovXG4gICAgdGhpcy5hcmdzID0gW107XG5cbn1cblxuU2VsZWN0b3JTdWJQYXJ0LnByb3RvdHlwZSA9IG5ldyBTeW50YXhVbml0KCk7XG5TZWxlY3RvclN1YlBhcnQucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gU2VsZWN0b3JTdWJQYXJ0O1xuXG4vKmdsb2JhbCBQc2V1ZG9zLCBTZWxlY3RvclBhcnQqL1xuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2VsZWN0b3IncyBzcGVjaWZpY2l0eS5cbiAqIEBuYW1lc3BhY2UgcGFyc2VybGliLmNzc1xuICogQGNsYXNzIFNwZWNpZmljaXR5XG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7aW50fSBhIFNob3VsZCBiZSAxIGZvciBpbmxpbmUgc3R5bGVzLCB6ZXJvIGZvciBzdHlsZXNoZWV0IHN0eWxlc1xuICogQHBhcmFtIHtpbnR9IGIgTnVtYmVyIG9mIElEIHNlbGVjdG9yc1xuICogQHBhcmFtIHtpbnR9IGMgTnVtYmVyIG9mIGNsYXNzZXMgYW5kIHBzZXVkbyBjbGFzc2VzXG4gKiBAcGFyYW0ge2ludH0gZCBOdW1iZXIgb2YgZWxlbWVudCBuYW1lcyBhbmQgcHNldWRvIGVsZW1lbnRzXG4gKi9cbmZ1bmN0aW9uIFNwZWNpZmljaXR5KGEsIGIsIGMsIGQpe1xuICAgIHRoaXMuYSA9IGE7XG4gICAgdGhpcy5iID0gYjtcbiAgICB0aGlzLmMgPSBjO1xuICAgIHRoaXMuZCA9IGQ7XG59XG5cblNwZWNpZmljaXR5LnByb3RvdHlwZSA9IHtcbiAgICBjb25zdHJ1Y3RvcjogU3BlY2lmaWNpdHksXG5cbiAgICAvKipcbiAgICAgKiBDb21wYXJlIHRoaXMgc3BlY2lmaWNpdHkgdG8gYW5vdGhlci5cbiAgICAgKiBAcGFyYW0ge1NwZWNpZmljaXR5fSBvdGhlciBUaGUgb3RoZXIgc3BlY2lmaWNpdHkgdG8gY29tcGFyZSB0by5cbiAgICAgKiBAcmV0dXJuIHtpbnR9IC0xIGlmIHRoZSBvdGhlciBzcGVjaWZpY2l0eSBpcyBsYXJnZXIsIDEgaWYgc21hbGxlciwgMCBpZiBlcXVhbC5cbiAgICAgKiBAbWV0aG9kIGNvbXBhcmVcbiAgICAgKi9cbiAgICBjb21wYXJlOiBmdW5jdGlvbihvdGhlcil7XG4gICAgICAgIHZhciBjb21wcyA9IFtcImFcIiwgXCJiXCIsIFwiY1wiLCBcImRcIl0sXG4gICAgICAgICAgICBpLCBsZW47XG5cbiAgICAgICAgZm9yIChpPTAsIGxlbj1jb21wcy5sZW5ndGg7IGkgPCBsZW47IGkrKyl7XG4gICAgICAgICAgICBpZiAodGhpc1tjb21wc1tpXV0gPCBvdGhlcltjb21wc1tpXV0pe1xuICAgICAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpc1tjb21wc1tpXV0gPiBvdGhlcltjb21wc1tpXV0pe1xuICAgICAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBudW1lcmljIHZhbHVlIGZvciB0aGUgc3BlY2lmaWNpdHkuXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgbnVtZXJpYyB2YWx1ZSBmb3IgdGhlIHNwZWNpZmljaXR5LlxuICAgICAqIEBtZXRob2QgdmFsdWVPZlxuICAgICAqL1xuICAgIHZhbHVlT2Y6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiAodGhpcy5hICogMTAwMCkgKyAodGhpcy5iICogMTAwKSArICh0aGlzLmMgKiAxMCkgKyB0aGlzLmQ7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gZm9yIHNwZWNpZmljaXR5LlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBzcGVjaWZpY2l0eS5cbiAgICAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICAgICovXG4gICAgdG9TdHJpbmc6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmEgKyBcIixcIiArIHRoaXMuYiArIFwiLFwiICsgdGhpcy5jICsgXCIsXCIgKyB0aGlzLmQ7XG4gICAgfVxuXG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNwZWNpZmljaXR5IG9mIHRoZSBnaXZlbiBzZWxlY3Rvci5cbiAqIEBwYXJhbSB7cGFyc2VybGliLmNzcy5TZWxlY3Rvcn0gVGhlIHNlbGVjdG9yIHRvIGNhbGN1bGF0ZSBzcGVjaWZpY2l0eSBmb3IuXG4gKiBAcmV0dXJuIHtwYXJzZXJsaWIuY3NzLlNwZWNpZmljaXR5fSBUaGUgc3BlY2lmaWNpdHkgb2YgdGhlIHNlbGVjdG9yLlxuICogQHN0YXRpY1xuICogQG1ldGhvZCBjYWxjdWxhdGVcbiAqL1xuU3BlY2lmaWNpdHkuY2FsY3VsYXRlID0gZnVuY3Rpb24oc2VsZWN0b3Ipe1xuXG4gICAgdmFyIGksIGxlbixcbiAgICAgICAgcGFydCxcbiAgICAgICAgYj0wLCBjPTAsIGQ9MDtcblxuICAgIGZ1bmN0aW9uIHVwZGF0ZVZhbHVlcyhwYXJ0KXtcblxuICAgICAgICB2YXIgaSwgaiwgbGVuLCBudW0sXG4gICAgICAgICAgICBlbGVtZW50TmFtZSA9IHBhcnQuZWxlbWVudE5hbWUgPyBwYXJ0LmVsZW1lbnROYW1lLnRleHQgOiBcIlwiLFxuICAgICAgICAgICAgbW9kaWZpZXI7XG5cbiAgICAgICAgaWYgKGVsZW1lbnROYW1lICYmIGVsZW1lbnROYW1lLmNoYXJBdChlbGVtZW50TmFtZS5sZW5ndGgtMSkgIT0gXCIqXCIpIHtcbiAgICAgICAgICAgIGQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaT0wLCBsZW49cGFydC5tb2RpZmllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspe1xuICAgICAgICAgICAgbW9kaWZpZXIgPSBwYXJ0Lm1vZGlmaWVyc1tpXTtcbiAgICAgICAgICAgIHN3aXRjaChtb2RpZmllci50eXBlKXtcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2xhc3NcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiYXR0cmlidXRlXCI6XG4gICAgICAgICAgICAgICAgICAgIGMrKztcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjYXNlIFwiaWRcIjpcbiAgICAgICAgICAgICAgICAgICAgYisrO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgXCJwc2V1ZG9cIjpcbiAgICAgICAgICAgICAgICAgICAgaWYgKFBzZXVkb3MuaXNFbGVtZW50KG1vZGlmaWVyLnRleHQpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGQrKztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGMrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgXCJub3RcIjpcbiAgICAgICAgICAgICAgICAgICAgZm9yIChqPTAsIG51bT1tb2RpZmllci5hcmdzLmxlbmd0aDsgaiA8IG51bTsgaisrKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZVZhbHVlcyhtb2RpZmllci5hcmdzW2pdKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoaT0wLCBsZW49c2VsZWN0b3IucGFydHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspe1xuICAgICAgICBwYXJ0ID0gc2VsZWN0b3IucGFydHNbaV07XG5cbiAgICAgICAgaWYgKHBhcnQgaW5zdGFuY2VvZiBTZWxlY3RvclBhcnQpe1xuICAgICAgICAgICAgdXBkYXRlVmFsdWVzKHBhcnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBTcGVjaWZpY2l0eSgwLCBiLCBjLCBkKTtcbn07XG4vKmdsb2JhbCBUb2tlbnMsIFRva2VuU3RyZWFtQmFzZSovXG5cbnZhciBoID0gL15bMC05YS1mQS1GXSQvLFxuICAgIG5vbmFzY2lpID0gL15bXFx1MDA4MC1cXHVGRkZGXSQvLFxuICAgIG5sID0gL1xcbnxcXHJcXG58XFxyfFxcZi87XG5cbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhlbHBlciBmdW5jdGlvbnNcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXG5mdW5jdGlvbiBpc0hleERpZ2l0KGMpe1xuICAgIHJldHVybiBjICE9PSBudWxsICYmIGgudGVzdChjKTtcbn1cblxuZnVuY3Rpb24gaXNEaWdpdChjKXtcbiAgICByZXR1cm4gYyAhPT0gbnVsbCAmJiAvXFxkLy50ZXN0KGMpO1xufVxuXG5mdW5jdGlvbiBpc1doaXRlc3BhY2UoYyl7XG4gICAgcmV0dXJuIGMgIT09IG51bGwgJiYgL1xccy8udGVzdChjKTtcbn1cblxuZnVuY3Rpb24gaXNOZXdMaW5lKGMpe1xuICAgIHJldHVybiBjICE9PSBudWxsICYmIG5sLnRlc3QoYyk7XG59XG5cbmZ1bmN0aW9uIGlzTmFtZVN0YXJ0KGMpe1xuICAgIHJldHVybiBjICE9PSBudWxsICYmICgvW2Etel9cXHUwMDgwLVxcdUZGRkZcXFxcXS9pLnRlc3QoYykpO1xufVxuXG5mdW5jdGlvbiBpc05hbWVDaGFyKGMpe1xuICAgIHJldHVybiBjICE9PSBudWxsICYmIChpc05hbWVTdGFydChjKSB8fCAvWzAtOVxcLVxcXFxdLy50ZXN0KGMpKTtcbn1cblxuZnVuY3Rpb24gaXNJZGVudFN0YXJ0KGMpe1xuICAgIHJldHVybiBjICE9PSBudWxsICYmIChpc05hbWVTdGFydChjKSB8fCAvXFwtXFxcXC8udGVzdChjKSk7XG59XG5cbmZ1bmN0aW9uIG1peChyZWNlaXZlciwgc3VwcGxpZXIpe1xuXHRmb3IgKHZhciBwcm9wIGluIHN1cHBsaWVyKXtcblx0XHRpZiAoc3VwcGxpZXIuaGFzT3duUHJvcGVydHkocHJvcCkpe1xuXHRcdFx0cmVjZWl2ZXJbcHJvcF0gPSBzdXBwbGllcltwcm9wXTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlY2VpdmVyO1xufVxuXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDU1MgVG9rZW4gU3RyZWFtXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuLyoqXG4gKiBBIHRva2VuIHN0cmVhbSB0aGF0IHByb2R1Y2VzIENTUyB0b2tlbnMuXG4gKiBAcGFyYW0ge1N0cmluZ3xSZWFkZXJ9IGlucHV0IFRoZSBzb3VyY2Ugb2YgdGV4dCB0byB0b2tlbml6ZS5cbiAqIEBjb25zdHJ1Y3RvclxuICogQGNsYXNzIFRva2VuU3RyZWFtXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi5jc3NcbiAqL1xuZnVuY3Rpb24gVG9rZW5TdHJlYW0oaW5wdXQpe1xuXHRUb2tlblN0cmVhbUJhc2UuY2FsbCh0aGlzLCBpbnB1dCwgVG9rZW5zKTtcbn1cblxuVG9rZW5TdHJlYW0ucHJvdG90eXBlID0gbWl4KG5ldyBUb2tlblN0cmVhbUJhc2UoKSwge1xuXG4gICAgLyoqXG4gICAgICogT3ZlcnJpZGVzIHRoZSBUb2tlblN0cmVhbUJhc2UgbWV0aG9kIG9mIHRoZSBzYW1lIG5hbWVcbiAgICAgKiB0byBwcm9kdWNlIENTUyB0b2tlbnMuXG4gICAgICogQHBhcmFtIHt2YXJpYW50fSBjaGFubmVsIFRoZSBuYW1lIG9mIHRoZSBjaGFubmVsIHRvIHVzZVxuICAgICAqICAgICAgZm9yIHRoZSBuZXh0IHRva2VuLlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQSB0b2tlbiBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSBuZXh0IHRva2VuLlxuICAgICAqIEBtZXRob2QgX2dldFRva2VuXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBfZ2V0VG9rZW46IGZ1bmN0aW9uKGNoYW5uZWwpe1xuXG4gICAgICAgIHZhciBjLFxuICAgICAgICAgICAgcmVhZGVyID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgdG9rZW4gICA9IG51bGwsXG4gICAgICAgICAgICBzdGFydExpbmUgICA9IHJlYWRlci5nZXRMaW5lKCksXG4gICAgICAgICAgICBzdGFydENvbCAgICA9IHJlYWRlci5nZXRDb2woKTtcblxuICAgICAgICBjID0gcmVhZGVyLnJlYWQoKTtcblxuXG4gICAgICAgIHdoaWxlKGMpe1xuICAgICAgICAgICAgc3dpdGNoKGMpe1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAqIC0gQ09NTUVOVFxuICAgICAgICAgICAgICAgICAqIC0gU0xBU0hcbiAgICAgICAgICAgICAgICAgKiAtIENIQVJcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBjYXNlIFwiL1wiOlxuXG4gICAgICAgICAgICAgICAgICAgIGlmKHJlYWRlci5wZWVrKCkgPT0gXCIqXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmNvbW1lbnRUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5jaGFyVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICogLSBEQVNITUFUQ0hcbiAgICAgICAgICAgICAgICAgKiAtIElOQ0xVREVTXG4gICAgICAgICAgICAgICAgICogLSBQUkVGSVhNQVRDSFxuICAgICAgICAgICAgICAgICAqIC0gU1VGRklYTUFUQ0hcbiAgICAgICAgICAgICAgICAgKiAtIFNVQlNUUklOR01BVENIXG4gICAgICAgICAgICAgICAgICogLSBDSEFSXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2FzZSBcInxcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiflwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJeXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIiRcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiKlwiOlxuICAgICAgICAgICAgICAgICAgICBpZihyZWFkZXIucGVlaygpID09IFwiPVwiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5jb21wYXJpc29uVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRoaXMuY2hhclRva2VuKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAqIC0gU1RSSU5HXG4gICAgICAgICAgICAgICAgICogLSBJTlZBTElEXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2FzZSBcIlxcXCJcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiJ1wiOlxuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRoaXMuc3RyaW5nVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAqIC0gSEFTSFxuICAgICAgICAgICAgICAgICAqIC0gQ0hBUlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNhc2UgXCIjXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc05hbWVDaGFyKHJlYWRlci5wZWVrKCkpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5oYXNoVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRoaXMuY2hhclRva2VuKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAqIC0gRE9UXG4gICAgICAgICAgICAgICAgICogLSBOVU1CRVJcbiAgICAgICAgICAgICAgICAgKiAtIERJTUVOU0lPTlxuICAgICAgICAgICAgICAgICAqIC0gUEVSQ0VOVEFHRVxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNhc2UgXCIuXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0RpZ2l0KHJlYWRlci5wZWVrKCkpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5udW1iZXJUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5jaGFyVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICogLSBDRENcbiAgICAgICAgICAgICAgICAgKiAtIE1JTlVTXG4gICAgICAgICAgICAgICAgICogLSBOVU1CRVJcbiAgICAgICAgICAgICAgICAgKiAtIERJTUVOU0lPTlxuICAgICAgICAgICAgICAgICAqIC0gUEVSQ0VOVEFHRVxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNhc2UgXCItXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWFkZXIucGVlaygpID09IFwiLVwiKXsgIC8vY291bGQgYmUgY2xvc2luZyBIVE1MLXN0eWxlIGNvbW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5odG1sQ29tbWVudEVuZFRva2VuKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzTmFtZVN0YXJ0KHJlYWRlci5wZWVrKCkpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5pZGVudE9yRnVuY3Rpb25Ub2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5jaGFyVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICogLSBJTVBPUlRBTlRfU1lNXG4gICAgICAgICAgICAgICAgICogLSBDSEFSXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2FzZSBcIiFcIjpcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmltcG9ydGFudFRva2VuKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogQW55IGF0LWtleXdvcmQgb3IgQ0hBUlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNhc2UgXCJAXCI6XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5hdFJ1bGVUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICogLSBOT1RcbiAgICAgICAgICAgICAgICAgKiAtIENIQVJcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBjYXNlIFwiOlwiOlxuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRoaXMubm90VG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAqIC0gQ0RPXG4gICAgICAgICAgICAgICAgICogLSBDSEFSXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2FzZSBcIjxcIjpcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmh0bWxDb21tZW50U3RhcnRUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICogLSBVTklDT0RFX1JBTkdFXG4gICAgICAgICAgICAgICAgICogLSBVUkxcbiAgICAgICAgICAgICAgICAgKiAtIENIQVJcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICBjYXNlIFwiVVwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJ1XCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWFkZXIucGVlaygpID09IFwiK1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy51bmljb2RlUmFuZ2VUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8qIGZhbGxzIHRocm91Z2ggKi9cbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuXG4gICAgICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICAgICAqIC0gTlVNQkVSXG4gICAgICAgICAgICAgICAgICAgICAqIC0gRElNRU5TSU9OXG4gICAgICAgICAgICAgICAgICAgICAqIC0gTEVOR1RIXG4gICAgICAgICAgICAgICAgICAgICAqIC0gRlJFUVxuICAgICAgICAgICAgICAgICAgICAgKiAtIFRJTUVcbiAgICAgICAgICAgICAgICAgICAgICogLSBFTVNcbiAgICAgICAgICAgICAgICAgICAgICogLSBFWFNcbiAgICAgICAgICAgICAgICAgICAgICogLSBBTkdMRVxuICAgICAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzRGlnaXQoYykpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLm51bWJlclRva2VuKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcblxuICAgICAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgICAgICAgKiBQb3RlbnRpYWwgdG9rZW5zOlxuICAgICAgICAgICAgICAgICAgICAgKiAtIFNcbiAgICAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1doaXRlc3BhY2UoYykpe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLndoaXRlc3BhY2VUb2tlbihjLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG5cbiAgICAgICAgICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAgICAgICAgICogUG90ZW50aWFsIHRva2VuczpcbiAgICAgICAgICAgICAgICAgICAgICogLSBJREVOVFxuICAgICAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzSWRlbnRTdGFydChjKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHRoaXMuaWRlbnRPckZ1bmN0aW9uVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuXG4gICAgICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICAgICAqIFBvdGVudGlhbCB0b2tlbnM6XG4gICAgICAgICAgICAgICAgICAgICAqIC0gQ0hBUlxuICAgICAgICAgICAgICAgICAgICAgKiAtIFBMVVNcbiAgICAgICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva2VuID0gdGhpcy5jaGFyVG9rZW4oYywgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuXG5cblxuXG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy9tYWtlIHN1cmUgdGhpcyB0b2tlbiBpcyB3YW50ZWRcbiAgICAgICAgICAgIC8vVE9ETzogY2hlY2sgY2hhbm5lbFxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRva2VuICYmIGMgPT09IG51bGwpe1xuICAgICAgICAgICAgdG9rZW4gPSB0aGlzLmNyZWF0ZVRva2VuKFRva2Vucy5FT0YsbnVsbCxzdGFydExpbmUsc3RhcnRDb2wpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgIH0sXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBNZXRob2RzIHRvIGNyZWF0ZSB0b2tlbnNcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgdG9rZW4gYmFzZWQgb24gYXZhaWxhYmxlIGRhdGEgYW5kIHRoZSBjdXJyZW50XG4gICAgICogcmVhZGVyIHBvc2l0aW9uIGluZm9ybWF0aW9uLiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYnkgb3RoZXJcbiAgICAgKiBwcml2YXRlIG1ldGhvZHMgdG8gY3JlYXRlIHRva2VucyBhbmQgaXMgbmV2ZXIgY2FsbGVkIGRpcmVjdGx5LlxuICAgICAqIEBwYXJhbSB7aW50fSB0dCBUaGUgdG9rZW4gdHlwZS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdmFsdWUgVGhlIHRleHQgdmFsdWUgb2YgdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAoT3B0aW9uYWwpIFNwZWNpZmllcyBhIGNoYW5uZWwgcHJvcGVydHlcbiAgICAgKiAgICAgIHRvIGluZGljYXRlIHRoYXQgYSBkaWZmZXJlbnQgY2hhbm5lbCBzaG91bGQgYmUgc2Nhbm5lZFxuICAgICAqICAgICAgYW5kL29yIGEgaGlkZSBwcm9wZXJ0eSBpbmRpY2F0aW5nIHRoYXQgdGhlIHRva2VuIHNob3VsZFxuICAgICAqICAgICAgYmUgaGlkZGVuLlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQSB0b2tlbiBvYmplY3QuXG4gICAgICogQG1ldGhvZCBjcmVhdGVUb2tlblxuICAgICAqL1xuICAgIGNyZWF0ZVRva2VuOiBmdW5jdGlvbih0dCwgdmFsdWUsIHN0YXJ0TGluZSwgc3RhcnRDb2wsIG9wdGlvbnMpe1xuICAgICAgICB2YXIgcmVhZGVyID0gdGhpcy5fcmVhZGVyO1xuICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdmFsdWU6ICAgICAgdmFsdWUsXG4gICAgICAgICAgICB0eXBlOiAgICAgICB0dCxcbiAgICAgICAgICAgIGNoYW5uZWw6ICAgIG9wdGlvbnMuY2hhbm5lbCxcbiAgICAgICAgICAgIGVuZENoYXI6ICAgIG9wdGlvbnMuZW5kQ2hhcixcbiAgICAgICAgICAgIGhpZGU6ICAgICAgIG9wdGlvbnMuaGlkZSB8fCBmYWxzZSxcbiAgICAgICAgICAgIHN0YXJ0TGluZTogIHN0YXJ0TGluZSxcbiAgICAgICAgICAgIHN0YXJ0Q29sOiAgIHN0YXJ0Q29sLFxuICAgICAgICAgICAgZW5kTGluZTogICAgcmVhZGVyLmdldExpbmUoKSxcbiAgICAgICAgICAgIGVuZENvbDogICAgIHJlYWRlci5nZXRDb2woKVxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBNZXRob2RzIHRvIGNyZWF0ZSBzcGVjaWZpYyB0b2tlbnNcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgdG9rZW4gZm9yIGFueSBhdC1ydWxlLiBJZiB0aGUgYXQtcnVsZSBpcyB1bmtub3duLCB0aGVuXG4gICAgICogdGhlIHRva2VuIGlzIGZvciBhIHNpbmdsZSBcIkBcIiBjaGFyYWN0ZXIuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgZm9yIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIGF0UnVsZVRva2VuXG4gICAgICovXG4gICAgYXRSdWxlVG9rZW46IGZ1bmN0aW9uKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKXtcbiAgICAgICAgdmFyIHJ1bGUgICAgPSBmaXJzdCxcbiAgICAgICAgICAgIHJlYWRlciAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICB0dCAgICAgID0gVG9rZW5zLkNIQVIsXG4gICAgICAgICAgICB2YWxpZCAgID0gZmFsc2UsXG4gICAgICAgICAgICBpZGVudCxcbiAgICAgICAgICAgIGM7XG5cbiAgICAgICAgLypcbiAgICAgICAgICogRmlyc3QsIG1hcmsgd2hlcmUgd2UgYXJlLiBUaGVyZSBhcmUgb25seSBmb3VyIEAgcnVsZXMsXG4gICAgICAgICAqIHNvIGFueXRoaW5nIGVsc2UgaXMgcmVhbGx5IGp1c3QgYW4gaW52YWxpZCB0b2tlbi5cbiAgICAgICAgICogQmFzaWNhbGx5LCBpZiB0aGlzIGRvZXNuJ3QgbWF0Y2ggb25lIG9mIHRoZSBrbm93biBAXG4gICAgICAgICAqIHJ1bGVzLCBqdXN0IHJldHVybiAnQCcgYXMgYW4gdW5rbm93biB0b2tlbiBhbmQgYWxsb3dcbiAgICAgICAgICogcGFyc2luZyB0byBjb250aW51ZSBhZnRlciB0aGF0IHBvaW50LlxuICAgICAgICAgKi9cbiAgICAgICAgcmVhZGVyLm1hcmsoKTtcblxuICAgICAgICAvL3RyeSB0byBmaW5kIHRoZSBhdC1rZXl3b3JkXG4gICAgICAgIGlkZW50ID0gdGhpcy5yZWFkTmFtZSgpO1xuICAgICAgICBydWxlID0gZmlyc3QgKyBpZGVudDtcbiAgICAgICAgdHQgPSBUb2tlbnMudHlwZShydWxlLnRvTG93ZXJDYXNlKCkpO1xuXG4gICAgICAgIC8vaWYgaXQncyBub3QgdmFsaWQsIHVzZSB0aGUgZmlyc3QgY2hhcmFjdGVyIG9ubHkgYW5kIHJlc2V0IHRoZSByZWFkZXJcbiAgICAgICAgaWYgKHR0ID09IFRva2Vucy5DSEFSIHx8IHR0ID09IFRva2Vucy5VTktOT1dOKXtcbiAgICAgICAgICAgIGlmIChydWxlLmxlbmd0aCA+IDEpe1xuICAgICAgICAgICAgICAgIHR0ID0gVG9rZW5zLlVOS05PV05fU1lNO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0dCA9IFRva2Vucy5DSEFSO1xuICAgICAgICAgICAgICAgIHJ1bGUgPSBmaXJzdDtcbiAgICAgICAgICAgICAgICByZWFkZXIucmVzZXQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRva2VuKHR0LCBydWxlLCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHJvZHVjZXMgYSBjaGFyYWN0ZXIgdG9rZW4gYmFzZWQgb24gdGhlIGdpdmVuIGNoYXJhY3RlclxuICAgICAqIGFuZCBsb2NhdGlvbiBpbiB0aGUgc3RyZWFtLiBJZiB0aGVyZSdzIGEgc3BlY2lhbCAobm9uLXN0YW5kYXJkKVxuICAgICAqIHRva2VuIG5hbWUsIHRoaXMgaXMgdXNlZDsgb3RoZXJ3aXNlIENIQVIgaXMgdXNlZC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gYyBUaGUgY2hhcmFjdGVyIGZvciB0aGUgdG9rZW4uXG4gICAgICogQHBhcmFtIHtpbnR9IHN0YXJ0TGluZSBUaGUgYmVnaW5uaW5nIGxpbmUgZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHBhcmFtIHtpbnR9IHN0YXJ0Q29sIFRoZSBiZWdpbm5pbmcgY29sdW1uIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQSB0b2tlbiBvYmplY3QuXG4gICAgICogQG1ldGhvZCBjaGFyVG9rZW5cbiAgICAgKi9cbiAgICBjaGFyVG9rZW46IGZ1bmN0aW9uKGMsIHN0YXJ0TGluZSwgc3RhcnRDb2wpe1xuICAgICAgICB2YXIgdHQgPSBUb2tlbnMudHlwZShjKTtcbiAgICAgICAgdmFyIG9wdHMgPSB7fTtcblxuICAgICAgICBpZiAodHQgPT0gLTEpe1xuICAgICAgICAgICAgdHQgPSBUb2tlbnMuQ0hBUjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9wdHMuZW5kQ2hhciA9IFRva2Vuc1t0dF0uZW5kQ2hhcjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRva2VuKHR0LCBjLCBzdGFydExpbmUsIHN0YXJ0Q29sLCBvcHRzKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHJvZHVjZXMgYSBjaGFyYWN0ZXIgdG9rZW4gYmFzZWQgb24gdGhlIGdpdmVuIGNoYXJhY3RlclxuICAgICAqIGFuZCBsb2NhdGlvbiBpbiB0aGUgc3RyZWFtLiBJZiB0aGVyZSdzIGEgc3BlY2lhbCAobm9uLXN0YW5kYXJkKVxuICAgICAqIHRva2VuIG5hbWUsIHRoaXMgaXMgdXNlZDsgb3RoZXJ3aXNlIENIQVIgaXMgdXNlZC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZmlyc3QgVGhlIGZpcnN0IGNoYXJhY3RlciBmb3IgdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2QgY29tbWVudFRva2VuXG4gICAgICovXG4gICAgY29tbWVudFRva2VuOiBmdW5jdGlvbihmaXJzdCwgc3RhcnRMaW5lLCBzdGFydENvbCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgY29tbWVudCA9IHRoaXMucmVhZENvbW1lbnQoZmlyc3QpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRva2VuKFRva2Vucy5DT01NRU5ULCBjb21tZW50LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHJvZHVjZXMgYSBjb21wYXJpc29uIHRva2VuIGJhc2VkIG9uIHRoZSBnaXZlbiBjaGFyYWN0ZXJcbiAgICAgKiBhbmQgbG9jYXRpb24gaW4gdGhlIHN0cmVhbS4gVGhlIG5leHQgY2hhcmFjdGVyIG11c3QgYmVcbiAgICAgKiByZWFkIGFuZCBpcyBhbHJlYWR5IGtub3duIHRvIGJlIGFuIGVxdWFscyBzaWduLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjIFRoZSBjaGFyYWN0ZXIgZm9yIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIGNvbXBhcmlzb25Ub2tlblxuICAgICAqL1xuICAgIGNvbXBhcmlzb25Ub2tlbjogZnVuY3Rpb24oYywgc3RhcnRMaW5lLCBzdGFydENvbCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgY29tcGFyaXNvbiAgPSBjICsgcmVhZGVyLnJlYWQoKSxcbiAgICAgICAgICAgIHR0ICAgICAgPSBUb2tlbnMudHlwZShjb21wYXJpc29uKSB8fCBUb2tlbnMuQ0hBUjtcblxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbih0dCwgY29tcGFyaXNvbiwgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgaGFzaCB0b2tlbiBiYXNlZCBvbiB0aGUgc3BlY2lmaWVkIGluZm9ybWF0aW9uLiBUaGVcbiAgICAgKiBmaXJzdCBjaGFyYWN0ZXIgcHJvdmlkZWQgaXMgdGhlIHBvdW5kIHNpZ24gKCMpIGFuZCB0aGVuIHRoaXNcbiAgICAgKiBtZXRob2QgcmVhZHMgYSBuYW1lIGFmdGVyd2FyZC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZmlyc3QgVGhlIGZpcnN0IGNoYXJhY3RlciAoIykgaW4gdGhlIGhhc2ggbmFtZS5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIGhhc2hUb2tlblxuICAgICAqL1xuICAgIGhhc2hUb2tlbjogZnVuY3Rpb24oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpe1xuICAgICAgICB2YXIgcmVhZGVyICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIG5hbWUgICAgPSB0aGlzLnJlYWROYW1lKGZpcnN0KTtcblxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbihUb2tlbnMuSEFTSCwgbmFtZSwgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgQ0RPIG9yIENIQVIgdG9rZW4gYmFzZWQgb24gdGhlIHNwZWNpZmllZCBpbmZvcm1hdGlvbi4gVGhlXG4gICAgICogZmlyc3QgY2hhcmFjdGVyIGlzIHByb3ZpZGVkIGFuZCB0aGUgcmVzdCBpcyByZWFkIGJ5IHRoZSBmdW5jdGlvbiB0byBkZXRlcm1pbmVcbiAgICAgKiB0aGUgY29ycmVjdCB0b2tlbiB0byBjcmVhdGUuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2QgaHRtbENvbW1lbnRTdGFydFRva2VuXG4gICAgICovXG4gICAgaHRtbENvbW1lbnRTdGFydFRva2VuOiBmdW5jdGlvbihmaXJzdCwgc3RhcnRMaW5lLCBzdGFydENvbCl7XG4gICAgICAgIHZhciByZWFkZXIgICAgICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIHRleHQgICAgICAgID0gZmlyc3Q7XG5cbiAgICAgICAgcmVhZGVyLm1hcmsoKTtcbiAgICAgICAgdGV4dCArPSByZWFkZXIucmVhZENvdW50KDMpO1xuXG4gICAgICAgIGlmICh0ZXh0ID09IFwiPCEtLVwiKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRva2VuKFRva2Vucy5DRE8sIHRleHQsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVhZGVyLnJlc2V0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jaGFyVG9rZW4oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgQ0RDIG9yIENIQVIgdG9rZW4gYmFzZWQgb24gdGhlIHNwZWNpZmllZCBpbmZvcm1hdGlvbi4gVGhlXG4gICAgICogZmlyc3QgY2hhcmFjdGVyIGlzIHByb3ZpZGVkIGFuZCB0aGUgcmVzdCBpcyByZWFkIGJ5IHRoZSBmdW5jdGlvbiB0byBkZXRlcm1pbmVcbiAgICAgKiB0aGUgY29ycmVjdCB0b2tlbiB0byBjcmVhdGUuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2QgaHRtbENvbW1lbnRFbmRUb2tlblxuICAgICAqL1xuICAgIGh0bWxDb21tZW50RW5kVG9rZW46IGZ1bmN0aW9uKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKXtcbiAgICAgICAgdmFyIHJlYWRlciAgICAgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgdGV4dCAgICAgICAgPSBmaXJzdDtcblxuICAgICAgICByZWFkZXIubWFyaygpO1xuICAgICAgICB0ZXh0ICs9IHJlYWRlci5yZWFkQ291bnQoMik7XG5cbiAgICAgICAgaWYgKHRleHQgPT0gXCItLT5cIil7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbihUb2tlbnMuQ0RDLCB0ZXh0LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlYWRlci5yZXNldCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2hhclRva2VuKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBQcm9kdWNlcyBhbiBJREVOVCBvciBGVU5DVElPTiB0b2tlbiBiYXNlZCBvbiB0aGUgc3BlY2lmaWVkIGluZm9ybWF0aW9uLiBUaGVcbiAgICAgKiBmaXJzdCBjaGFyYWN0ZXIgaXMgcHJvdmlkZWQgYW5kIHRoZSByZXN0IGlzIHJlYWQgYnkgdGhlIGZ1bmN0aW9uIHRvIGRldGVybWluZVxuICAgICAqIHRoZSBjb3JyZWN0IHRva2VuIHRvIGNyZWF0ZS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZmlyc3QgVGhlIGZpcnN0IGNoYXJhY3RlciBpbiB0aGUgaWRlbnRpZmllci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIGlkZW50T3JGdW5jdGlvblRva2VuXG4gICAgICovXG4gICAgaWRlbnRPckZ1bmN0aW9uVG9rZW46IGZ1bmN0aW9uKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKXtcbiAgICAgICAgdmFyIHJlYWRlciAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICBpZGVudCAgID0gdGhpcy5yZWFkTmFtZShmaXJzdCksXG4gICAgICAgICAgICB0dCAgICAgID0gVG9rZW5zLklERU5UO1xuXG4gICAgICAgIC8vaWYgdGhlcmUncyBhIGxlZnQgcGFyZW4gaW1tZWRpYXRlbHkgYWZ0ZXIsIGl0J3MgYSBVUkkgb3IgZnVuY3Rpb25cbiAgICAgICAgaWYgKHJlYWRlci5wZWVrKCkgPT0gXCIoXCIpe1xuICAgICAgICAgICAgaWRlbnQgKz0gcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgIGlmIChpZGVudC50b0xvd2VyQ2FzZSgpID09IFwidXJsKFwiKXtcbiAgICAgICAgICAgICAgICB0dCA9IFRva2Vucy5VUkk7XG4gICAgICAgICAgICAgICAgaWRlbnQgPSB0aGlzLnJlYWRVUkkoaWRlbnQpO1xuXG4gICAgICAgICAgICAgICAgLy9kaWRuJ3QgZmluZCBhIHZhbGlkIFVSTCBvciB0aGVyZSdzIG5vIGNsb3NpbmcgcGFyZW5cbiAgICAgICAgICAgICAgICBpZiAoaWRlbnQudG9Mb3dlckNhc2UoKSA9PSBcInVybChcIil7XG4gICAgICAgICAgICAgICAgICAgIHR0ID0gVG9rZW5zLkZVTkNUSU9OO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHQgPSBUb2tlbnMuRlVOQ1RJT047XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocmVhZGVyLnBlZWsoKSA9PSBcIjpcIil7ICAvL21pZ2h0IGJlIGFuIElFIGZ1bmN0aW9uXG5cbiAgICAgICAgICAgIC8vSUUtc3BlY2lmaWMgZnVuY3Rpb25zIGFsd2F5cyBiZWluZyB3aXRoIHByb2dpZDpcbiAgICAgICAgICAgIGlmIChpZGVudC50b0xvd2VyQ2FzZSgpID09IFwicHJvZ2lkXCIpe1xuICAgICAgICAgICAgICAgIGlkZW50ICs9IHJlYWRlci5yZWFkVG8oXCIoXCIpO1xuICAgICAgICAgICAgICAgIHR0ID0gVG9rZW5zLklFX0ZVTkNUSU9OO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVG9rZW4odHQsIGlkZW50LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUHJvZHVjZXMgYW4gSU1QT1JUQU5UX1NZTSBvciBDSEFSIHRva2VuIGJhc2VkIG9uIHRoZSBzcGVjaWZpZWQgaW5mb3JtYXRpb24uIFRoZVxuICAgICAqIGZpcnN0IGNoYXJhY3RlciBpcyBwcm92aWRlZCBhbmQgdGhlIHJlc3QgaXMgcmVhZCBieSB0aGUgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lXG4gICAgICogdGhlIGNvcnJlY3QgdG9rZW4gdG8gY3JlYXRlLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBmaXJzdCBUaGUgZmlyc3QgY2hhcmFjdGVyIGluIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIGltcG9ydGFudFRva2VuXG4gICAgICovXG4gICAgaW1wb3J0YW50VG9rZW46IGZ1bmN0aW9uKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKXtcbiAgICAgICAgdmFyIHJlYWRlciAgICAgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgaW1wb3J0YW50ICAgPSBmaXJzdCxcbiAgICAgICAgICAgIHR0ICAgICAgICAgID0gVG9rZW5zLkNIQVIsXG4gICAgICAgICAgICB0ZW1wLFxuICAgICAgICAgICAgYztcblxuICAgICAgICByZWFkZXIubWFyaygpO1xuICAgICAgICBjID0gcmVhZGVyLnJlYWQoKTtcblxuICAgICAgICB3aGlsZShjKXtcblxuICAgICAgICAgICAgLy90aGVyZSBjYW4gYmUgYSBjb21tZW50IGluIGhlcmVcbiAgICAgICAgICAgIGlmIChjID09IFwiL1wiKXtcblxuICAgICAgICAgICAgICAgIC8vaWYgdGhlIG5leHQgY2hhcmFjdGVyIGlzbid0IGEgc3RhciwgdGhlbiB0aGlzIGlzbid0IGEgdmFsaWQgIWltcG9ydGFudCB0b2tlblxuICAgICAgICAgICAgICAgIGlmIChyZWFkZXIucGVlaygpICE9IFwiKlwiKXtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGVtcCA9IHRoaXMucmVhZENvbW1lbnQoYyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ZW1wID09PSBcIlwiKXsgICAgLy9icm9rZW4hXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNXaGl0ZXNwYWNlKGMpKXtcbiAgICAgICAgICAgICAgICBpbXBvcnRhbnQgKz0gYyArIHRoaXMucmVhZFdoaXRlc3BhY2UoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoL2kvaS50ZXN0KGMpKXtcbiAgICAgICAgICAgICAgICB0ZW1wID0gcmVhZGVyLnJlYWRDb3VudCg4KTtcbiAgICAgICAgICAgICAgICBpZiAoL21wb3J0YW50L2kudGVzdCh0ZW1wKSl7XG4gICAgICAgICAgICAgICAgICAgIGltcG9ydGFudCArPSBjICsgdGVtcDtcbiAgICAgICAgICAgICAgICAgICAgdHQgPSBUb2tlbnMuSU1QT1JUQU5UX1NZTTtcblxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhazsgIC8vd2UncmUgZG9uZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYyA9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHQgPT0gVG9rZW5zLkNIQVIpe1xuICAgICAgICAgICAgcmVhZGVyLnJlc2V0KCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jaGFyVG9rZW4oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlVG9rZW4odHQsIGltcG9ydGFudCwgc3RhcnRMaW5lLCBzdGFydENvbCk7XG4gICAgICAgIH1cblxuXG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFByb2R1Y2VzIGEgTk9UIG9yIENIQVIgdG9rZW4gYmFzZWQgb24gdGhlIHNwZWNpZmllZCBpbmZvcm1hdGlvbi4gVGhlXG4gICAgICogZmlyc3QgY2hhcmFjdGVyIGlzIHByb3ZpZGVkIGFuZCB0aGUgcmVzdCBpcyByZWFkIGJ5IHRoZSBmdW5jdGlvbiB0byBkZXRlcm1pbmVcbiAgICAgKiB0aGUgY29ycmVjdCB0b2tlbiB0byBjcmVhdGUuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2Qgbm90VG9rZW5cbiAgICAgKi9cbiAgICBub3RUb2tlbjogZnVuY3Rpb24oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpe1xuICAgICAgICB2YXIgcmVhZGVyICAgICAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICB0ZXh0ICAgICAgICA9IGZpcnN0O1xuXG4gICAgICAgIHJlYWRlci5tYXJrKCk7XG4gICAgICAgIHRleHQgKz0gcmVhZGVyLnJlYWRDb3VudCg0KTtcblxuICAgICAgICBpZiAodGV4dC50b0xvd2VyQ2FzZSgpID09IFwiOm5vdChcIil7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbihUb2tlbnMuTk9ULCB0ZXh0LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlYWRlci5yZXNldCgpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY2hhclRva2VuKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBQcm9kdWNlcyBhIG51bWJlciB0b2tlbiBiYXNlZCBvbiB0aGUgZ2l2ZW4gY2hhcmFjdGVyXG4gICAgICogYW5kIGxvY2F0aW9uIGluIHRoZSBzdHJlYW0uIFRoaXMgbWF5IHJldHVybiBhIHRva2VuIG9mXG4gICAgICogTlVNQkVSLCBFTVMsIEVYUywgTEVOR1RILCBBTkdMRSwgVElNRSwgRlJFUSwgRElNRU5TSU9OLFxuICAgICAqIG9yIFBFUkNFTlRBR0UuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgZm9yIHRoZSB0b2tlbi5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRMaW5lIFRoZSBiZWdpbm5pbmcgbGluZSBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gc3RhcnRDb2wgVGhlIGJlZ2lubmluZyBjb2x1bW4gZm9yIHRoZSBjaGFyYWN0ZXIuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBBIHRva2VuIG9iamVjdC5cbiAgICAgKiBAbWV0aG9kIG51bWJlclRva2VuXG4gICAgICovXG4gICAgbnVtYmVyVG9rZW46IGZ1bmN0aW9uKGZpcnN0LCBzdGFydExpbmUsIHN0YXJ0Q29sKXtcbiAgICAgICAgdmFyIHJlYWRlciAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICB2YWx1ZSAgID0gdGhpcy5yZWFkTnVtYmVyKGZpcnN0KSxcbiAgICAgICAgICAgIGlkZW50LFxuICAgICAgICAgICAgdHQgICAgICA9IFRva2Vucy5OVU1CRVIsXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuICAgICAgICBpZiAoaXNJZGVudFN0YXJ0KGMpKXtcbiAgICAgICAgICAgIGlkZW50ID0gdGhpcy5yZWFkTmFtZShyZWFkZXIucmVhZCgpKTtcbiAgICAgICAgICAgIHZhbHVlICs9IGlkZW50O1xuXG4gICAgICAgICAgICBpZiAoL15lbSR8XmV4JHxecHgkfF5nZCR8XnJlbSR8XnZ3JHxedmgkfF52bWF4JHxedm1pbiR8XmNoJHxeY20kfF5tbSR8XmluJHxecHQkfF5wYyQvaS50ZXN0KGlkZW50KSl7XG4gICAgICAgICAgICAgICAgdHQgPSBUb2tlbnMuTEVOR1RIO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgvXmRlZ3xecmFkJHxeZ3JhZCQvaS50ZXN0KGlkZW50KSl7XG4gICAgICAgICAgICAgICAgdHQgPSBUb2tlbnMuQU5HTEU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKC9ebXMkfF5zJC9pLnRlc3QoaWRlbnQpKXtcbiAgICAgICAgICAgICAgICB0dCA9IFRva2Vucy5USU1FO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgvXmh6JHxea2h6JC9pLnRlc3QoaWRlbnQpKXtcbiAgICAgICAgICAgICAgICB0dCA9IFRva2Vucy5GUkVRO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgvXmRwaSR8XmRwY20kL2kudGVzdChpZGVudCkpe1xuICAgICAgICAgICAgICAgIHR0ID0gVG9rZW5zLlJFU09MVVRJT047XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR0ID0gVG9rZW5zLkRJTUVOU0lPTjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGVsc2UgaWYgKGMgPT0gXCIlXCIpe1xuICAgICAgICAgICAgdmFsdWUgKz0gcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgIHR0ID0gVG9rZW5zLlBFUkNFTlRBR0U7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbih0dCwgdmFsdWUsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBQcm9kdWNlcyBhIHN0cmluZyB0b2tlbiBiYXNlZCBvbiB0aGUgZ2l2ZW4gY2hhcmFjdGVyXG4gICAgICogYW5kIGxvY2F0aW9uIGluIHRoZSBzdHJlYW0uIFNpbmNlIHN0cmluZ3MgbWF5IGJlIGluZGljYXRlZFxuICAgICAqIGJ5IHNpbmdsZSBvciBkb3VibGUgcXVvdGVzLCBhIGZhaWx1cmUgdG8gbWF0Y2ggc3RhcnRpbmdcbiAgICAgKiBhbmQgZW5kaW5nIHF1b3RlcyByZXN1bHRzIGluIGFuIElOVkFMSUQgdG9rZW4gYmVpbmcgZ2VuZXJhdGVkLlxuICAgICAqIFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZyBpcyBwYXNzZWQgaW4gYW5kIHRoZW5cbiAgICAgKiB0aGUgcmVzdCBhcmUgcmVhZCB1cCB0byBhbmQgaW5jbHVkaW5nIHRoZSBmaW5hbCBxdW90YXRpb24gbWFyay5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZmlyc3QgVGhlIGZpcnN0IGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2Qgc3RyaW5nVG9rZW5cbiAgICAgKi9cbiAgICBzdHJpbmdUb2tlbjogZnVuY3Rpb24oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpe1xuICAgICAgICB2YXIgZGVsaW0gICA9IGZpcnN0LFxuICAgICAgICAgICAgc3RyaW5nICA9IGZpcnN0LFxuICAgICAgICAgICAgcmVhZGVyICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIHByZXYgICAgPSBmaXJzdCxcbiAgICAgICAgICAgIHR0ICAgICAgPSBUb2tlbnMuU1RSSU5HLFxuICAgICAgICAgICAgYyAgICAgICA9IHJlYWRlci5yZWFkKCk7XG5cbiAgICAgICAgd2hpbGUoYyl7XG4gICAgICAgICAgICBzdHJpbmcgKz0gYztcblxuICAgICAgICAgICAgLy9pZiB0aGUgZGVsaW1pdGVyIGlzIGZvdW5kIHdpdGggYW4gZXNjYXBlbWVudCwgd2UncmUgZG9uZS5cbiAgICAgICAgICAgIGlmIChjID09IGRlbGltICYmIHByZXYgIT0gXCJcXFxcXCIpe1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIHRoZXJlJ3MgYSBuZXdsaW5lIHdpdGhvdXQgYW4gZXNjYXBlbWVudCwgaXQncyBhbiBpbnZhbGlkIHN0cmluZ1xuICAgICAgICAgICAgaWYgKGlzTmV3TGluZShyZWFkZXIucGVlaygpKSAmJiBjICE9IFwiXFxcXFwiKXtcbiAgICAgICAgICAgICAgICB0dCA9IFRva2Vucy5JTlZBTElEO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3NhdmUgcHJldmlvdXMgYW5kIGdldCBuZXh0XG4gICAgICAgICAgICBwcmV2ID0gYztcbiAgICAgICAgICAgIGMgPSByZWFkZXIucmVhZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9pZiBjIGlzIG51bGwsIHRoYXQgbWVhbnMgd2UncmUgb3V0IG9mIGlucHV0IGFuZCB0aGUgc3RyaW5nIHdhcyBuZXZlciBjbG9zZWRcbiAgICAgICAgaWYgKGMgPT09IG51bGwpe1xuICAgICAgICAgICAgdHQgPSBUb2tlbnMuSU5WQUxJRDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVRva2VuKHR0LCBzdHJpbmcsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgIH0sXG5cbiAgICB1bmljb2RlUmFuZ2VUb2tlbjogZnVuY3Rpb24oZmlyc3QsIHN0YXJ0TGluZSwgc3RhcnRDb2wpe1xuICAgICAgICB2YXIgcmVhZGVyICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIHZhbHVlICAgPSBmaXJzdCxcbiAgICAgICAgICAgIHRlbXAsXG4gICAgICAgICAgICB0dCAgICAgID0gVG9rZW5zLkNIQVI7XG5cbiAgICAgICAgLy90aGVuIGl0IHNob3VsZCBiZSBhIHVuaWNvZGUgcmFuZ2VcbiAgICAgICAgaWYgKHJlYWRlci5wZWVrKCkgPT0gXCIrXCIpe1xuICAgICAgICAgICAgcmVhZGVyLm1hcmsoKTtcbiAgICAgICAgICAgIHZhbHVlICs9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICB2YWx1ZSArPSB0aGlzLnJlYWRVbmljb2RlUmFuZ2VQYXJ0KHRydWUpO1xuXG4gICAgICAgICAgICAvL2Vuc3VyZSB0aGVyZSdzIGFuIGFjdHVhbCB1bmljb2RlIHJhbmdlIGhlcmVcbiAgICAgICAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT0gMil7XG4gICAgICAgICAgICAgICAgcmVhZGVyLnJlc2V0KCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgdHQgPSBUb2tlbnMuVU5JQ09ERV9SQU5HRTtcblxuICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBhID8gaW4gdGhlIGZpcnN0IHBhcnQsIHRoZXJlIGNhbid0IGJlIGEgc2Vjb25kIHBhcnRcbiAgICAgICAgICAgICAgICBpZiAodmFsdWUuaW5kZXhPZihcIj9cIikgPT0gLTEpe1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZWFkZXIucGVlaygpID09IFwiLVwiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRlci5tYXJrKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZW1wID0gcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRlbXAgKz0gdGhpcy5yZWFkVW5pY29kZVJhbmdlUGFydChmYWxzZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vaWYgdGhlcmUncyBub3QgYW5vdGhlciB2YWx1ZSwgYmFjayB1cCBhbmQganVzdCB0YWtlIHRoZSBmaXJzdFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRlbXAubGVuZ3RoID09IDEpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlYWRlci5yZXNldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSArPSB0ZW1wO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbih0dCwgdmFsdWUsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBQcm9kdWNlcyBhIFMgdG9rZW4gYmFzZWQgb24gdGhlIHNwZWNpZmllZCBpbmZvcm1hdGlvbi4gU2luY2Ugd2hpdGVzcGFjZVxuICAgICAqIG1heSBoYXZlIG11bHRpcGxlIGNoYXJhY3RlcnMsIHRoaXMgY29uc3VtZXMgYWxsIHdoaXRlc3BhY2UgY2hhcmFjdGVyc1xuICAgICAqIGludG8gYSBzaW5nbGUgdG9rZW4uXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZpcnN0IFRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gdGhlIHRva2VuLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydExpbmUgVGhlIGJlZ2lubmluZyBsaW5lIGZvciB0aGUgY2hhcmFjdGVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBzdGFydENvbCBUaGUgYmVnaW5uaW5nIGNvbHVtbiBmb3IgdGhlIGNoYXJhY3Rlci5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgdG9rZW4gb2JqZWN0LlxuICAgICAqIEBtZXRob2Qgd2hpdGVzcGFjZVRva2VuXG4gICAgICovXG4gICAgd2hpdGVzcGFjZVRva2VuOiBmdW5jdGlvbihmaXJzdCwgc3RhcnRMaW5lLCBzdGFydENvbCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgdmFsdWUgICA9IGZpcnN0ICsgdGhpcy5yZWFkV2hpdGVzcGFjZSgpO1xuICAgICAgICByZXR1cm4gdGhpcy5jcmVhdGVUb2tlbihUb2tlbnMuUywgdmFsdWUsIHN0YXJ0TGluZSwgc3RhcnRDb2wpO1xuICAgIH0sXG5cblxuXG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBNZXRob2RzIHRvIHJlYWQgdmFsdWVzIGZyb20gdGhlIHN0cmluZyBzdHJlYW1cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIHJlYWRVbmljb2RlUmFuZ2VQYXJ0OiBmdW5jdGlvbihhbGxvd1F1ZXN0aW9uTWFyayl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgcGFydCA9IFwiXCIsXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuICAgICAgICAvL2ZpcnN0IHJlYWQgaGV4IGRpZ2l0c1xuICAgICAgICB3aGlsZShpc0hleERpZ2l0KGMpICYmIHBhcnQubGVuZ3RoIDwgNil7XG4gICAgICAgICAgICByZWFkZXIucmVhZCgpO1xuICAgICAgICAgICAgcGFydCArPSBjO1xuICAgICAgICAgICAgYyA9IHJlYWRlci5wZWVrKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3RoZW4gcmVhZCBxdWVzdGlvbiBtYXJrcyBpZiBhbGxvd2VkXG4gICAgICAgIGlmIChhbGxvd1F1ZXN0aW9uTWFyayl7XG4gICAgICAgICAgICB3aGlsZShjID09IFwiP1wiICYmIHBhcnQubGVuZ3RoIDwgNil7XG4gICAgICAgICAgICAgICAgcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgICAgICBwYXJ0ICs9IGM7XG4gICAgICAgICAgICAgICAgYyA9IHJlYWRlci5wZWVrKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvL3RoZXJlIGNhbid0IGJlIGFueSBvdGhlciBjaGFyYWN0ZXJzIGFmdGVyIHRoaXMgcG9pbnRcblxuICAgICAgICByZXR1cm4gcGFydDtcbiAgICB9LFxuXG4gICAgcmVhZFdoaXRlc3BhY2U6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgd2hpdGVzcGFjZSA9IFwiXCIsXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuICAgICAgICB3aGlsZShpc1doaXRlc3BhY2UoYykpe1xuICAgICAgICAgICAgcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgIHdoaXRlc3BhY2UgKz0gYztcbiAgICAgICAgICAgIGMgPSByZWFkZXIucGVlaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHdoaXRlc3BhY2U7XG4gICAgfSxcbiAgICByZWFkTnVtYmVyOiBmdW5jdGlvbihmaXJzdCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgbnVtYmVyICA9IGZpcnN0LFxuICAgICAgICAgICAgaGFzRG90ICA9IChmaXJzdCA9PSBcIi5cIiksXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuXG4gICAgICAgIHdoaWxlKGMpe1xuICAgICAgICAgICAgaWYgKGlzRGlnaXQoYykpe1xuICAgICAgICAgICAgICAgIG51bWJlciArPSByZWFkZXIucmVhZCgpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjID09IFwiLlwiKXtcbiAgICAgICAgICAgICAgICBpZiAoaGFzRG90KXtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaGFzRG90ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbnVtYmVyICs9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYyA9IHJlYWRlci5wZWVrKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVtYmVyO1xuICAgIH0sXG4gICAgcmVhZFN0cmluZzogZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHJlYWRlciAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICBkZWxpbSAgID0gcmVhZGVyLnJlYWQoKSxcbiAgICAgICAgICAgIHN0cmluZyAgPSBkZWxpbSxcbiAgICAgICAgICAgIHByZXYgICAgPSBkZWxpbSxcbiAgICAgICAgICAgIGMgICAgICAgPSByZWFkZXIucGVlaygpO1xuXG4gICAgICAgIHdoaWxlKGMpe1xuICAgICAgICAgICAgYyA9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICBzdHJpbmcgKz0gYztcblxuICAgICAgICAgICAgLy9pZiB0aGUgZGVsaW1pdGVyIGlzIGZvdW5kIHdpdGggYW4gZXNjYXBlbWVudCwgd2UncmUgZG9uZS5cbiAgICAgICAgICAgIGlmIChjID09IGRlbGltICYmIHByZXYgIT0gXCJcXFxcXCIpe1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL2lmIHRoZXJlJ3MgYSBuZXdsaW5lIHdpdGhvdXQgYW4gZXNjYXBlbWVudCwgaXQncyBhbiBpbnZhbGlkIHN0cmluZ1xuICAgICAgICAgICAgaWYgKGlzTmV3TGluZShyZWFkZXIucGVlaygpKSAmJiBjICE9IFwiXFxcXFwiKXtcbiAgICAgICAgICAgICAgICBzdHJpbmcgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3NhdmUgcHJldmlvdXMgYW5kIGdldCBuZXh0XG4gICAgICAgICAgICBwcmV2ID0gYztcbiAgICAgICAgICAgIGMgPSByZWFkZXIucGVlaygpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9pZiBjIGlzIG51bGwsIHRoYXQgbWVhbnMgd2UncmUgb3V0IG9mIGlucHV0IGFuZCB0aGUgc3RyaW5nIHdhcyBuZXZlciBjbG9zZWRcbiAgICAgICAgaWYgKGMgPT09IG51bGwpe1xuICAgICAgICAgICAgc3RyaW5nID0gXCJcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdHJpbmc7XG4gICAgfSxcbiAgICByZWFkVVJJOiBmdW5jdGlvbihmaXJzdCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgdXJpICAgICA9IGZpcnN0LFxuICAgICAgICAgICAgaW5uZXIgICA9IFwiXCIsXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuICAgICAgICByZWFkZXIubWFyaygpO1xuXG4gICAgICAgIC8vc2tpcCB3aGl0ZXNwYWNlIGJlZm9yZVxuICAgICAgICB3aGlsZShjICYmIGlzV2hpdGVzcGFjZShjKSl7XG4gICAgICAgICAgICByZWFkZXIucmVhZCgpO1xuICAgICAgICAgICAgYyA9IHJlYWRlci5wZWVrKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL2l0J3MgYSBzdHJpbmdcbiAgICAgICAgaWYgKGMgPT0gXCInXCIgfHwgYyA9PSBcIlxcXCJcIil7XG4gICAgICAgICAgICBpbm5lciA9IHRoaXMucmVhZFN0cmluZygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5uZXIgPSB0aGlzLnJlYWRVUkwoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGMgPSByZWFkZXIucGVlaygpO1xuXG4gICAgICAgIC8vc2tpcCB3aGl0ZXNwYWNlIGFmdGVyXG4gICAgICAgIHdoaWxlKGMgJiYgaXNXaGl0ZXNwYWNlKGMpKXtcbiAgICAgICAgICAgIHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICBjID0gcmVhZGVyLnBlZWsoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vaWYgdGhlcmUgd2FzIG5vIGlubmVyIHZhbHVlIG9yIHRoZSBuZXh0IGNoYXJhY3RlciBpc24ndCBjbG9zaW5nIHBhcmVuLCBpdCdzIG5vdCBhIFVSSVxuICAgICAgICBpZiAoaW5uZXIgPT09IFwiXCIgfHwgYyAhPSBcIilcIil7XG4gICAgICAgICAgICB1cmkgPSBmaXJzdDtcbiAgICAgICAgICAgIHJlYWRlci5yZXNldCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXJpICs9IGlubmVyICsgcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1cmk7XG4gICAgfSxcbiAgICByZWFkVVJMOiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgcmVhZGVyICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIHVybCAgICAgPSBcIlwiLFxuICAgICAgICAgICAgYyAgICAgICA9IHJlYWRlci5wZWVrKCk7XG5cbiAgICAgICAgLy9UT0RPOiBDaGVjayBmb3IgZXNjYXBlIGFuZCBub25hc2NpaVxuICAgICAgICB3aGlsZSAoL15bISMkJSZcXFxcKi1+XSQvLnRlc3QoYykpe1xuICAgICAgICAgICAgdXJsICs9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICBjID0gcmVhZGVyLnBlZWsoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1cmw7XG5cbiAgICB9LFxuICAgIHJlYWROYW1lOiBmdW5jdGlvbihmaXJzdCl7XG4gICAgICAgIHZhciByZWFkZXIgID0gdGhpcy5fcmVhZGVyLFxuICAgICAgICAgICAgaWRlbnQgICA9IGZpcnN0IHx8IFwiXCIsXG4gICAgICAgICAgICBjICAgICAgID0gcmVhZGVyLnBlZWsoKTtcblxuICAgICAgICB3aGlsZSh0cnVlKXtcbiAgICAgICAgICAgIGlmIChjID09IFwiXFxcXFwiKXtcbiAgICAgICAgICAgICAgICBpZGVudCArPSB0aGlzLnJlYWRFc2NhcGUocmVhZGVyLnJlYWQoKSk7XG4gICAgICAgICAgICAgICAgYyA9IHJlYWRlci5wZWVrKCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYoYyAmJiBpc05hbWVDaGFyKGMpKXtcbiAgICAgICAgICAgICAgICBpZGVudCArPSByZWFkZXIucmVhZCgpO1xuICAgICAgICAgICAgICAgIGMgPSByZWFkZXIucGVlaygpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZGVudDtcbiAgICB9LFxuXG4gICAgcmVhZEVzY2FwZTogZnVuY3Rpb24oZmlyc3Qpe1xuICAgICAgICB2YXIgcmVhZGVyICA9IHRoaXMuX3JlYWRlcixcbiAgICAgICAgICAgIGNzc0VzY2FwZSA9IGZpcnN0IHx8IFwiXCIsXG4gICAgICAgICAgICBpICAgICAgID0gMCxcbiAgICAgICAgICAgIGMgICAgICAgPSByZWFkZXIucGVlaygpO1xuXG4gICAgICAgIGlmIChpc0hleERpZ2l0KGMpKXtcbiAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICBjc3NFc2NhcGUgKz0gcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgICAgICBjID0gcmVhZGVyLnBlZWsoKTtcbiAgICAgICAgICAgIH0gd2hpbGUoYyAmJiBpc0hleERpZ2l0KGMpICYmICsraSA8IDYpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNzc0VzY2FwZS5sZW5ndGggPT0gMyAmJiAvXFxzLy50ZXN0KGMpIHx8XG4gICAgICAgICAgICBjc3NFc2NhcGUubGVuZ3RoID09IDcgfHwgY3NzRXNjYXBlLmxlbmd0aCA9PSAxKXtcbiAgICAgICAgICAgICAgICByZWFkZXIucmVhZCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYyA9IFwiXCI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY3NzRXNjYXBlICsgYztcbiAgICB9LFxuXG4gICAgcmVhZENvbW1lbnQ6IGZ1bmN0aW9uKGZpcnN0KXtcbiAgICAgICAgdmFyIHJlYWRlciAgPSB0aGlzLl9yZWFkZXIsXG4gICAgICAgICAgICBjb21tZW50ID0gZmlyc3QgfHwgXCJcIixcbiAgICAgICAgICAgIGMgICAgICAgPSByZWFkZXIucmVhZCgpO1xuXG4gICAgICAgIGlmIChjID09IFwiKlwiKXtcbiAgICAgICAgICAgIHdoaWxlKGMpe1xuICAgICAgICAgICAgICAgIGNvbW1lbnQgKz0gYztcblxuICAgICAgICAgICAgICAgIC8vbG9vayBmb3IgZW5kIG9mIGNvbW1lbnRcbiAgICAgICAgICAgICAgICBpZiAoY29tbWVudC5sZW5ndGggPiAyICYmIGMgPT0gXCIqXCIgJiYgcmVhZGVyLnBlZWsoKSA9PSBcIi9cIil7XG4gICAgICAgICAgICAgICAgICAgIGNvbW1lbnQgKz0gcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYyA9IHJlYWRlci5yZWFkKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBjb21tZW50O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIH1cblxuICAgIH1cbn0pO1xuXG52YXIgVG9rZW5zICA9IFtcblxuICAgIC8qXG4gICAgICogVGhlIGZvbGxvd2luZyB0b2tlbiBuYW1lcyBhcmUgZGVmaW5lZCBpbiBDU1MzIEdyYW1tYXI6IGh0dHA6Ly93d3cudzMub3JnL1RSL2NzczMtc3ludGF4LyNsZXhpY2FsXG4gICAgICovXG5cbiAgICAvL0hUTUwtc3R5bGUgY29tbWVudHNcbiAgICB7IG5hbWU6IFwiQ0RPXCJ9LFxuICAgIHsgbmFtZTogXCJDRENcIn0sXG5cbiAgICAvL2lnbm9yYWJsZXNcbiAgICB7IG5hbWU6IFwiU1wiLCB3aGl0ZXNwYWNlOiB0cnVlLyosIGNoYW5uZWw6IFwid3NcIiovfSxcbiAgICB7IG5hbWU6IFwiQ09NTUVOVFwiLCBjb21tZW50OiB0cnVlLCBoaWRlOiB0cnVlLCBjaGFubmVsOiBcImNvbW1lbnRcIiB9LFxuXG4gICAgLy9hdHRyaWJ1dGUgZXF1YWxpdHlcbiAgICB7IG5hbWU6IFwiSU5DTFVERVNcIiwgdGV4dDogXCJ+PVwifSxcbiAgICB7IG5hbWU6IFwiREFTSE1BVENIXCIsIHRleHQ6IFwifD1cIn0sXG4gICAgeyBuYW1lOiBcIlBSRUZJWE1BVENIXCIsIHRleHQ6IFwiXj1cIn0sXG4gICAgeyBuYW1lOiBcIlNVRkZJWE1BVENIXCIsIHRleHQ6IFwiJD1cIn0sXG4gICAgeyBuYW1lOiBcIlNVQlNUUklOR01BVENIXCIsIHRleHQ6IFwiKj1cIn0sXG5cbiAgICAvL2lkZW50aWZpZXIgdHlwZXNcbiAgICB7IG5hbWU6IFwiU1RSSU5HXCJ9LFxuICAgIHsgbmFtZTogXCJJREVOVFwifSxcbiAgICB7IG5hbWU6IFwiSEFTSFwifSxcblxuICAgIC8vYXQta2V5d29yZHNcbiAgICB7IG5hbWU6IFwiSU1QT1JUX1NZTVwiLCB0ZXh0OiBcIkBpbXBvcnRcIn0sXG4gICAgeyBuYW1lOiBcIlBBR0VfU1lNXCIsIHRleHQ6IFwiQHBhZ2VcIn0sXG4gICAgeyBuYW1lOiBcIk1FRElBX1NZTVwiLCB0ZXh0OiBcIkBtZWRpYVwifSxcbiAgICB7IG5hbWU6IFwiRk9OVF9GQUNFX1NZTVwiLCB0ZXh0OiBcIkBmb250LWZhY2VcIn0sXG4gICAgeyBuYW1lOiBcIkNIQVJTRVRfU1lNXCIsIHRleHQ6IFwiQGNoYXJzZXRcIn0sXG4gICAgeyBuYW1lOiBcIk5BTUVTUEFDRV9TWU1cIiwgdGV4dDogXCJAbmFtZXNwYWNlXCJ9LFxuICAgIHsgbmFtZTogXCJWSUVXUE9SVF9TWU1cIiwgdGV4dDogW1wiQHZpZXdwb3J0XCIsIFwiQC1tcy12aWV3cG9ydFwiXX0sXG4gICAgeyBuYW1lOiBcIlVOS05PV05fU1lNXCIgfSxcbiAgICAvL3sgbmFtZTogXCJBVEtFWVdPUkRcIn0sXG5cbiAgICAvL0NTUzMgYW5pbWF0aW9uc1xuICAgIHsgbmFtZTogXCJLRVlGUkFNRVNfU1lNXCIsIHRleHQ6IFsgXCJAa2V5ZnJhbWVzXCIsIFwiQC13ZWJraXQta2V5ZnJhbWVzXCIsIFwiQC1tb3ota2V5ZnJhbWVzXCIsIFwiQC1vLWtleWZyYW1lc1wiIF0gfSxcblxuICAgIC8vaW1wb3J0YW50IHN5bWJvbFxuICAgIHsgbmFtZTogXCJJTVBPUlRBTlRfU1lNXCJ9LFxuXG4gICAgLy9tZWFzdXJlbWVudHNcbiAgICB7IG5hbWU6IFwiTEVOR1RIXCJ9LFxuICAgIHsgbmFtZTogXCJBTkdMRVwifSxcbiAgICB7IG5hbWU6IFwiVElNRVwifSxcbiAgICB7IG5hbWU6IFwiRlJFUVwifSxcbiAgICB7IG5hbWU6IFwiRElNRU5TSU9OXCJ9LFxuICAgIHsgbmFtZTogXCJQRVJDRU5UQUdFXCJ9LFxuICAgIHsgbmFtZTogXCJOVU1CRVJcIn0sXG5cbiAgICAvL2Z1bmN0aW9uc1xuICAgIHsgbmFtZTogXCJVUklcIn0sXG4gICAgeyBuYW1lOiBcIkZVTkNUSU9OXCJ9LFxuXG4gICAgLy9Vbmljb2RlIHJhbmdlc1xuICAgIHsgbmFtZTogXCJVTklDT0RFX1JBTkdFXCJ9LFxuXG4gICAgLypcbiAgICAgKiBUaGUgZm9sbG93aW5nIHRva2VuIG5hbWVzIGFyZSBkZWZpbmVkIGluIENTUzMgU2VsZWN0b3JzOiBodHRwOi8vd3d3LnczLm9yZy9UUi9jc3MzLXNlbGVjdG9ycy8jc2VsZWN0b3Itc3ludGF4XG4gICAgICovXG5cbiAgICAvL2ludmFsaWQgc3RyaW5nXG4gICAgeyBuYW1lOiBcIklOVkFMSURcIn0sXG5cbiAgICAvL2NvbWJpbmF0b3JzXG4gICAgeyBuYW1lOiBcIlBMVVNcIiwgdGV4dDogXCIrXCIgfSxcbiAgICB7IG5hbWU6IFwiR1JFQVRFUlwiLCB0ZXh0OiBcIj5cIn0sXG4gICAgeyBuYW1lOiBcIkNPTU1BXCIsIHRleHQ6IFwiLFwifSxcbiAgICB7IG5hbWU6IFwiVElMREVcIiwgdGV4dDogXCJ+XCJ9LFxuXG4gICAgLy9tb2RpZmllclxuICAgIHsgbmFtZTogXCJOT1RcIn0sXG5cbiAgICAvKlxuICAgICAqIERlZmluZWQgaW4gQ1NTMyBQYWdlZCBNZWRpYVxuICAgICAqL1xuICAgIHsgbmFtZTogXCJUT1BMRUZUQ09STkVSX1NZTVwiLCB0ZXh0OiBcIkB0b3AtbGVmdC1jb3JuZXJcIn0sXG4gICAgeyBuYW1lOiBcIlRPUExFRlRfU1lNXCIsIHRleHQ6IFwiQHRvcC1sZWZ0XCJ9LFxuICAgIHsgbmFtZTogXCJUT1BDRU5URVJfU1lNXCIsIHRleHQ6IFwiQHRvcC1jZW50ZXJcIn0sXG4gICAgeyBuYW1lOiBcIlRPUFJJR0hUX1NZTVwiLCB0ZXh0OiBcIkB0b3AtcmlnaHRcIn0sXG4gICAgeyBuYW1lOiBcIlRPUFJJR0hUQ09STkVSX1NZTVwiLCB0ZXh0OiBcIkB0b3AtcmlnaHQtY29ybmVyXCJ9LFxuICAgIHsgbmFtZTogXCJCT1RUT01MRUZUQ09STkVSX1NZTVwiLCB0ZXh0OiBcIkBib3R0b20tbGVmdC1jb3JuZXJcIn0sXG4gICAgeyBuYW1lOiBcIkJPVFRPTUxFRlRfU1lNXCIsIHRleHQ6IFwiQGJvdHRvbS1sZWZ0XCJ9LFxuICAgIHsgbmFtZTogXCJCT1RUT01DRU5URVJfU1lNXCIsIHRleHQ6IFwiQGJvdHRvbS1jZW50ZXJcIn0sXG4gICAgeyBuYW1lOiBcIkJPVFRPTVJJR0hUX1NZTVwiLCB0ZXh0OiBcIkBib3R0b20tcmlnaHRcIn0sXG4gICAgeyBuYW1lOiBcIkJPVFRPTVJJR0hUQ09STkVSX1NZTVwiLCB0ZXh0OiBcIkBib3R0b20tcmlnaHQtY29ybmVyXCJ9LFxuICAgIHsgbmFtZTogXCJMRUZUVE9QX1NZTVwiLCB0ZXh0OiBcIkBsZWZ0LXRvcFwifSxcbiAgICB7IG5hbWU6IFwiTEVGVE1JRERMRV9TWU1cIiwgdGV4dDogXCJAbGVmdC1taWRkbGVcIn0sXG4gICAgeyBuYW1lOiBcIkxFRlRCT1RUT01fU1lNXCIsIHRleHQ6IFwiQGxlZnQtYm90dG9tXCJ9LFxuICAgIHsgbmFtZTogXCJSSUdIVFRPUF9TWU1cIiwgdGV4dDogXCJAcmlnaHQtdG9wXCJ9LFxuICAgIHsgbmFtZTogXCJSSUdIVE1JRERMRV9TWU1cIiwgdGV4dDogXCJAcmlnaHQtbWlkZGxlXCJ9LFxuICAgIHsgbmFtZTogXCJSSUdIVEJPVFRPTV9TWU1cIiwgdGV4dDogXCJAcmlnaHQtYm90dG9tXCJ9LFxuXG4gICAgLypcbiAgICAgKiBUaGUgZm9sbG93aW5nIHRva2VuIG5hbWVzIGFyZSBkZWZpbmVkIGluIENTUzMgTWVkaWEgUXVlcmllczogaHR0cDovL3d3dy53My5vcmcvVFIvY3NzMy1tZWRpYXF1ZXJpZXMvI3N5bnRheFxuICAgICAqL1xuICAgIC8qeyBuYW1lOiBcIk1FRElBX09OTFlcIiwgc3RhdGU6IFwibWVkaWFcIn0sXG4gICAgeyBuYW1lOiBcIk1FRElBX05PVFwiLCBzdGF0ZTogXCJtZWRpYVwifSxcbiAgICB7IG5hbWU6IFwiTUVESUFfQU5EXCIsIHN0YXRlOiBcIm1lZGlhXCJ9LCovXG4gICAgeyBuYW1lOiBcIlJFU09MVVRJT05cIiwgc3RhdGU6IFwibWVkaWFcIn0sXG5cbiAgICAvKlxuICAgICAqIFRoZSBmb2xsb3dpbmcgdG9rZW4gbmFtZXMgYXJlIG5vdCBkZWZpbmVkIGluIGFueSBDU1Mgc3BlY2lmaWNhdGlvbiBidXQgYXJlIHVzZWQgYnkgdGhlIGxleGVyLlxuICAgICAqL1xuXG4gICAgLy9ub3QgYSByZWFsIHRva2VuLCBidXQgdXNlZnVsIGZvciBzdHVwaWQgSUUgZmlsdGVyc1xuICAgIHsgbmFtZTogXCJJRV9GVU5DVElPTlwiIH0sXG5cbiAgICAvL3BhcnQgb2YgQ1NTMyBncmFtbWFyIGJ1dCBub3QgdGhlIEZsZXggY29kZVxuICAgIHsgbmFtZTogXCJDSEFSXCIgfSxcblxuICAgIC8vVE9ETzogTmVlZGVkP1xuICAgIC8vTm90IGRlZmluZWQgYXMgdG9rZW5zLCBidXQgbWlnaHQgYXMgd2VsbCBiZVxuICAgIHtcbiAgICAgICAgbmFtZTogXCJQSVBFXCIsXG4gICAgICAgIHRleHQ6IFwifFwiXG4gICAgfSxcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiU0xBU0hcIixcbiAgICAgICAgdGV4dDogXCIvXCJcbiAgICB9LFxuICAgIHtcbiAgICAgICAgbmFtZTogXCJNSU5VU1wiLFxuICAgICAgICB0ZXh0OiBcIi1cIlxuICAgIH0sXG4gICAge1xuICAgICAgICBuYW1lOiBcIlNUQVJcIixcbiAgICAgICAgdGV4dDogXCIqXCJcbiAgICB9LFxuXG4gICAge1xuICAgICAgICBuYW1lOiBcIkxCUkFDRVwiLFxuICAgICAgICBlbmRDaGFyOiBcIn1cIixcbiAgICAgICAgdGV4dDogXCJ7XCJcbiAgICB9LFxuICAgIHtcbiAgICAgICAgbmFtZTogXCJSQlJBQ0VcIixcbiAgICAgICAgdGV4dDogXCJ9XCJcbiAgICB9LFxuICAgIHtcbiAgICAgICAgbmFtZTogXCJMQlJBQ0tFVFwiLFxuICAgICAgICBlbmRDaGFyOiBcIl1cIixcbiAgICAgICAgdGV4dDogXCJbXCJcbiAgICB9LFxuICAgIHtcbiAgICAgICAgbmFtZTogXCJSQlJBQ0tFVFwiLFxuICAgICAgICB0ZXh0OiBcIl1cIlxuICAgIH0sXG4gICAge1xuICAgICAgICBuYW1lOiBcIkVRVUFMU1wiLFxuICAgICAgICB0ZXh0OiBcIj1cIlxuICAgIH0sXG4gICAge1xuICAgICAgICBuYW1lOiBcIkNPTE9OXCIsXG4gICAgICAgIHRleHQ6IFwiOlwiXG4gICAgfSxcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiU0VNSUNPTE9OXCIsXG4gICAgICAgIHRleHQ6IFwiO1wiXG4gICAgfSxcblxuICAgIHtcbiAgICAgICAgbmFtZTogXCJMUEFSRU5cIixcbiAgICAgICAgZW5kQ2hhcjogXCIpXCIsXG4gICAgICAgIHRleHQ6IFwiKFwiXG4gICAgfSxcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiUlBBUkVOXCIsXG4gICAgICAgIHRleHQ6IFwiKVwiXG4gICAgfSxcbiAgICB7XG4gICAgICAgIG5hbWU6IFwiRE9UXCIsXG4gICAgICAgIHRleHQ6IFwiLlwiXG4gICAgfVxuXTtcblxuKGZ1bmN0aW9uKCl7XG5cbiAgICB2YXIgbmFtZU1hcCA9IFtdLFxuICAgICAgICB0eXBlTWFwID0ge307XG5cbiAgICBUb2tlbnMuVU5LTk9XTiA9IC0xO1xuICAgIFRva2Vucy51bnNoaWZ0KHtuYW1lOlwiRU9GXCJ9KTtcbiAgICBmb3IgKHZhciBpPTAsIGxlbiA9IFRva2Vucy5sZW5ndGg7IGkgPCBsZW47IGkrKyl7XG4gICAgICAgIG5hbWVNYXAucHVzaChUb2tlbnNbaV0ubmFtZSk7XG4gICAgICAgIFRva2Vuc1tUb2tlbnNbaV0ubmFtZV0gPSBpO1xuICAgICAgICBpZiAoVG9rZW5zW2ldLnRleHQpe1xuICAgICAgICAgICAgaWYgKFRva2Vuc1tpXS50ZXh0IGluc3RhbmNlb2YgQXJyYXkpe1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGo9MDsgaiA8IFRva2Vuc1tpXS50ZXh0Lmxlbmd0aDsgaisrKXtcbiAgICAgICAgICAgICAgICAgICAgdHlwZU1hcFtUb2tlbnNbaV0udGV4dFtqXV0gPSBpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZU1hcFtUb2tlbnNbaV0udGV4dF0gPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgVG9rZW5zLm5hbWUgPSBmdW5jdGlvbih0dCl7XG4gICAgICAgIHJldHVybiBuYW1lTWFwW3R0XTtcbiAgICB9O1xuXG4gICAgVG9rZW5zLnR5cGUgPSBmdW5jdGlvbihjKXtcbiAgICAgICAgcmV0dXJuIHR5cGVNYXBbY10gfHwgLTE7XG4gICAgfTtcblxufSkoKTtcblxuXG5cbi8vVGhpcyBmaWxlIHdpbGwgbGlrZWx5IGNoYW5nZSBhIGxvdCEgVmVyeSBleHBlcmltZW50YWwhXG4vKmdsb2JhbCBQcm9wZXJ0aWVzLCBWYWxpZGF0aW9uVHlwZXMsIFZhbGlkYXRpb25FcnJvciwgUHJvcGVydHlWYWx1ZUl0ZXJhdG9yICovXG52YXIgVmFsaWRhdGlvbiA9IHtcblxuICAgIHZhbGlkYXRlOiBmdW5jdGlvbihwcm9wZXJ0eSwgdmFsdWUpe1xuXG4gICAgICAgIC8vbm9ybWFsaXplIG5hbWVcbiAgICAgICAgdmFyIG5hbWUgICAgICAgID0gcHJvcGVydHkudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgICAgcGFydHMgICAgICAgPSB2YWx1ZS5wYXJ0cyxcbiAgICAgICAgICAgIGV4cHJlc3Npb24gID0gbmV3IFByb3BlcnR5VmFsdWVJdGVyYXRvcih2YWx1ZSksXG4gICAgICAgICAgICBzcGVjICAgICAgICA9IFByb3BlcnRpZXNbbmFtZV0sXG4gICAgICAgICAgICBwYXJ0LFxuICAgICAgICAgICAgdmFsaWQsXG4gICAgICAgICAgICBqLCBjb3VudCxcbiAgICAgICAgICAgIG1zZyxcbiAgICAgICAgICAgIHR5cGVzLFxuICAgICAgICAgICAgbGFzdCxcbiAgICAgICAgICAgIGxpdGVyYWxzLFxuICAgICAgICAgICAgbWF4LCBtdWx0aSwgZ3JvdXA7XG5cbiAgICAgICAgaWYgKCFzcGVjKSB7XG4gICAgICAgICAgICBpZiAobmFtZS5pbmRleE9mKFwiLVwiKSAhPT0gMCl7ICAgIC8vdmVuZG9yIHByZWZpeGVkIGFyZSBva1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoXCJVbmtub3duIHByb3BlcnR5ICdcIiArIHByb3BlcnR5ICsgXCInLlwiLCBwcm9wZXJ0eS5saW5lLCBwcm9wZXJ0eS5jb2wpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzcGVjICE9IFwibnVtYmVyXCIpe1xuXG4gICAgICAgICAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgICAgICAgICBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgaWYgKHNwZWMuaW5kZXhPZihcInx8XCIpID4gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncm91cFByb3BlcnR5KHNwZWMsIGV4cHJlc3Npb24pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2luZ2xlUHJvcGVydHkoc3BlYywgZXhwcmVzc2lvbiwgMSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNwZWMubXVsdGkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm11bHRpUHJvcGVydHkoc3BlYy5tdWx0aSwgZXhwcmVzc2lvbiwgc3BlYy5jb21tYSwgc3BlYy5tYXggfHwgSW5maW5pdHkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc3BlYyA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICBzcGVjKGV4cHJlc3Npb24pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cblxuICAgIH0sXG5cbiAgICBzaW5nbGVQcm9wZXJ0eTogZnVuY3Rpb24odHlwZXMsIGV4cHJlc3Npb24sIG1heCwgcGFydGlhbCkge1xuXG4gICAgICAgIHZhciByZXN1bHQgICAgICA9IGZhbHNlLFxuICAgICAgICAgICAgdmFsdWUgICAgICAgPSBleHByZXNzaW9uLnZhbHVlLFxuICAgICAgICAgICAgY291bnQgICAgICAgPSAwLFxuICAgICAgICAgICAgcGFydDtcblxuICAgICAgICB3aGlsZSAoZXhwcmVzc2lvbi5oYXNOZXh0KCkgJiYgY291bnQgPCBtYXgpIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCB0eXBlcyk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgICAgICBpZiAoZXhwcmVzc2lvbi5oYXNOZXh0KCkgJiYgIWV4cHJlc3Npb24uaXNGaXJzdCgpKSB7XG4gICAgICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ucGVlaygpO1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBWYWxpZGF0aW9uRXJyb3IoXCJFeHBlY3RlZCBlbmQgb2YgdmFsdWUgYnV0IGZvdW5kICdcIiArIHBhcnQgKyBcIicuXCIsIHBhcnQubGluZSwgcGFydC5jb2wpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIChcIiArIHR5cGVzICsgXCIpIGJ1dCBmb3VuZCAnXCIgKyB2YWx1ZSArIFwiJy5cIiwgdmFsdWUubGluZSwgdmFsdWUuY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChleHByZXNzaW9uLmhhc05leHQoKSkge1xuICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ubmV4dCgpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIGVuZCBvZiB2YWx1ZSBidXQgZm91bmQgJ1wiICsgcGFydCArIFwiJy5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCk7XG4gICAgICAgIH1cblxuICAgIH0sXG5cbiAgICBtdWx0aVByb3BlcnR5OiBmdW5jdGlvbiAodHlwZXMsIGV4cHJlc3Npb24sIGNvbW1hLCBtYXgpIHtcblxuICAgICAgICB2YXIgcmVzdWx0ICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHZhbHVlICAgICAgID0gZXhwcmVzc2lvbi52YWx1ZSxcbiAgICAgICAgICAgIGNvdW50ICAgICAgID0gMCxcbiAgICAgICAgICAgIHNlcCAgICAgICAgID0gZmFsc2UsXG4gICAgICAgICAgICBwYXJ0O1xuXG4gICAgICAgIHdoaWxlKGV4cHJlc3Npb24uaGFzTmV4dCgpICYmICFyZXN1bHQgJiYgY291bnQgPCBtYXgpIHtcbiAgICAgICAgICAgIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgdHlwZXMpKSB7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgICAgICBpZiAoIWV4cHJlc3Npb24uaGFzTmV4dCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbW1hKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChleHByZXNzaW9uLnBlZWsoKSA9PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ubmV4dCgpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKGV4cHJlc3Npb24uaGFzTmV4dCgpICYmICFleHByZXNzaW9uLmlzRmlyc3QoKSkge1xuICAgICAgICAgICAgICAgIHBhcnQgPSBleHByZXNzaW9uLnBlZWsoKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgZW5kIG9mIHZhbHVlIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ucHJldmlvdXMoKTtcbiAgICAgICAgICAgICAgICBpZiAoY29tbWEgJiYgcGFydCA9PSBcIixcIikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgZW5kIG9mIHZhbHVlIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgKFwiICsgdHlwZXMgKyBcIikgYnV0IGZvdW5kICdcIiArIHZhbHVlICsgXCInLlwiLCB2YWx1ZS5saW5lLCB2YWx1ZS5jb2wpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGVsc2UgaWYgKGV4cHJlc3Npb24uaGFzTmV4dCgpKSB7XG4gICAgICAgICAgICBwYXJ0ID0gZXhwcmVzc2lvbi5uZXh0KCk7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgZW5kIG9mIHZhbHVlIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgfVxuXG4gICAgfSxcblxuICAgIGdyb3VwUHJvcGVydHk6IGZ1bmN0aW9uICh0eXBlcywgZXhwcmVzc2lvbiwgY29tbWEpIHtcblxuICAgICAgICB2YXIgcmVzdWx0ICAgICAgPSBmYWxzZSxcbiAgICAgICAgICAgIHZhbHVlICAgICAgID0gZXhwcmVzc2lvbi52YWx1ZSxcbiAgICAgICAgICAgIHR5cGVDb3VudCAgID0gdHlwZXMuc3BsaXQoXCJ8fFwiKS5sZW5ndGgsXG4gICAgICAgICAgICBncm91cHMgICAgICA9IHsgY291bnQ6IDAgfSxcbiAgICAgICAgICAgIHBhcnRpYWwgICAgID0gZmFsc2UsXG4gICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgcGFydDtcblxuICAgICAgICB3aGlsZShleHByZXNzaW9uLmhhc05leHQoKSAmJiAhcmVzdWx0KSB7XG4gICAgICAgICAgICBuYW1lID0gVmFsaWRhdGlvblR5cGVzLmlzQW55T2ZHcm91cChleHByZXNzaW9uLCB0eXBlcyk7XG4gICAgICAgICAgICBpZiAobmFtZSkge1xuXG4gICAgICAgICAgICAgICAgLy9ubyBkdXBlc1xuICAgICAgICAgICAgICAgIGlmIChncm91cHNbbmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBzW25hbWVdID0gMTtcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBzLmNvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgIHBhcnRpYWwgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChncm91cHMuY291bnQgPT0gdHlwZUNvdW50IHx8ICFleHByZXNzaW9uLmhhc05leHQoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgaWYgKHBhcnRpYWwgJiYgZXhwcmVzc2lvbi5oYXNOZXh0KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ucGVlaygpO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgZW5kIG9mIHZhbHVlIGJ1dCBmb3VuZCAnXCIgKyBwYXJ0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIChcIiArIHR5cGVzICsgXCIpIGJ1dCBmb3VuZCAnXCIgKyB2YWx1ZSArIFwiJy5cIiwgdmFsdWUubGluZSwgdmFsdWUuY29sKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChleHByZXNzaW9uLmhhc05leHQoKSkge1xuICAgICAgICAgICAgcGFydCA9IGV4cHJlc3Npb24ubmV4dCgpO1xuICAgICAgICAgICAgdGhyb3cgbmV3IFZhbGlkYXRpb25FcnJvcihcIkV4cGVjdGVkIGVuZCBvZiB2YWx1ZSBidXQgZm91bmQgJ1wiICsgcGFydCArIFwiJy5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuXG59O1xuLyoqXG4gKiBUeXBlIHRvIHVzZSB3aGVuIGEgdmFsaWRhdGlvbiBlcnJvciBvY2N1cnMuXG4gKiBAY2xhc3MgVmFsaWRhdGlvbkVycm9yXG4gKiBAbmFtZXNwYWNlIHBhcnNlcmxpYi51dGlsXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlLlxuICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgYXQgd2hpY2ggdGhlIGVycm9yIG9jY3VycmVkLlxuICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIGF0IHdoaWNoIHRoZSBlcnJvciBvY2N1cnJlZC5cbiAqL1xuZnVuY3Rpb24gVmFsaWRhdGlvbkVycm9yKG1lc3NhZ2UsIGxpbmUsIGNvbCl7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgY29sdW1uIGF0IHdoaWNoIHRoZSBlcnJvciBvY2N1cnJlZC5cbiAgICAgKiBAdHlwZSBpbnRcbiAgICAgKiBAcHJvcGVydHkgY29sXG4gICAgICovXG4gICAgdGhpcy5jb2wgPSBjb2w7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbGluZSBhdCB3aGljaCB0aGUgZXJyb3Igb2NjdXJyZWQuXG4gICAgICogQHR5cGUgaW50XG4gICAgICogQHByb3BlcnR5IGxpbmVcbiAgICAgKi9cbiAgICB0aGlzLmxpbmUgPSBsaW5lO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHVuaXQuXG4gICAgICogQHR5cGUgU3RyaW5nXG4gICAgICogQHByb3BlcnR5IHRleHRcbiAgICAgKi9cbiAgICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXG59XG5cbi8vaW5oZXJpdCBmcm9tIEVycm9yXG5WYWxpZGF0aW9uRXJyb3IucHJvdG90eXBlID0gbmV3IEVycm9yKCk7XG4vL1RoaXMgZmlsZSB3aWxsIGxpa2VseSBjaGFuZ2UgYSBsb3QhIFZlcnkgZXhwZXJpbWVudGFsIVxuLypnbG9iYWwgUHJvcGVydGllcywgVmFsaWRhdGlvbiwgVmFsaWRhdGlvbkVycm9yLCBQcm9wZXJ0eVZhbHVlSXRlcmF0b3IsIGNvbnNvbGUqL1xudmFyIFZhbGlkYXRpb25UeXBlcyA9IHtcblxuICAgIGlzTGl0ZXJhbDogZnVuY3Rpb24gKHBhcnQsIGxpdGVyYWxzKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gcGFydC50ZXh0LnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICAgIGFyZ3MgPSBsaXRlcmFscy5zcGxpdChcIiB8IFwiKSxcbiAgICAgICAgICAgIGksIGxlbiwgZm91bmQgPSBmYWxzZTtcblxuICAgICAgICBmb3IgKGk9MCxsZW49YXJncy5sZW5ndGg7IGkgPCBsZW4gJiYgIWZvdW5kOyBpKyspe1xuICAgICAgICAgICAgaWYgKHRleHQgPT0gYXJnc1tpXS50b0xvd2VyQ2FzZSgpKXtcbiAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZm91bmQ7XG4gICAgfSxcblxuICAgIGlzU2ltcGxlOiBmdW5jdGlvbih0eXBlKSB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuc2ltcGxlW3R5cGVdO1xuICAgIH0sXG5cbiAgICBpc0NvbXBsZXg6IGZ1bmN0aW9uKHR5cGUpIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5jb21wbGV4W3R5cGVdO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBuZXh0IHBhcnQocykgb2YgdGhlIGdpdmVuIGV4cHJlc3Npb25cbiAgICAgKiBhcmUgYW55IG9mIHRoZSBnaXZlbiB0eXBlcy5cbiAgICAgKi9cbiAgICBpc0FueTogZnVuY3Rpb24gKGV4cHJlc3Npb24sIHR5cGVzKSB7XG4gICAgICAgIHZhciBhcmdzID0gdHlwZXMuc3BsaXQoXCIgfCBcIiksXG4gICAgICAgICAgICBpLCBsZW4sIGZvdW5kID0gZmFsc2U7XG5cbiAgICAgICAgZm9yIChpPTAsbGVuPWFyZ3MubGVuZ3RoOyBpIDwgbGVuICYmICFmb3VuZCAmJiBleHByZXNzaW9uLmhhc05leHQoKTsgaSsrKXtcbiAgICAgICAgICAgIGZvdW5kID0gdGhpcy5pc1R5cGUoZXhwcmVzc2lvbiwgYXJnc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZm91bmQ7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIG5leHQgcGFydChzKSBvZiB0aGUgZ2l2ZW4gZXhwcmVzc2lvblxuICAgICAqIGFyZSBvbmUgb2YgYSBncm91cC5cbiAgICAgKi9cbiAgICBpc0FueU9mR3JvdXA6IGZ1bmN0aW9uKGV4cHJlc3Npb24sIHR5cGVzKSB7XG4gICAgICAgIHZhciBhcmdzID0gdHlwZXMuc3BsaXQoXCIgfHwgXCIpLFxuICAgICAgICAgICAgaSwgbGVuLCBmb3VuZCA9IGZhbHNlO1xuXG4gICAgICAgIGZvciAoaT0wLGxlbj1hcmdzLmxlbmd0aDsgaSA8IGxlbiAmJiAhZm91bmQ7IGkrKyl7XG4gICAgICAgICAgICBmb3VuZCA9IHRoaXMuaXNUeXBlKGV4cHJlc3Npb24sIGFyZ3NbaV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZvdW5kID8gYXJnc1tpLTFdIDogZmFsc2U7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIG5leHQgcGFydChzKSBvZiB0aGUgZ2l2ZW4gZXhwcmVzc2lvblxuICAgICAqIGFyZSBvZiBhIGdpdmVuIHR5cGUuXG4gICAgICovXG4gICAgaXNUeXBlOiBmdW5jdGlvbiAoZXhwcmVzc2lvbiwgdHlwZSkge1xuICAgICAgICB2YXIgcGFydCA9IGV4cHJlc3Npb24ucGVlaygpLFxuICAgICAgICAgICAgcmVzdWx0ID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHR5cGUuY2hhckF0KDApICE9IFwiPFwiKSB7XG4gICAgICAgICAgICByZXN1bHQgPSB0aGlzLmlzTGl0ZXJhbChwYXJ0LCB0eXBlKTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICBleHByZXNzaW9uLm5leHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnNpbXBsZVt0eXBlXSkge1xuICAgICAgICAgICAgcmVzdWx0ID0gdGhpcy5zaW1wbGVbdHlwZV0ocGFydCk7XG4gICAgICAgICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbi5uZXh0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXN1bHQgPSB0aGlzLmNvbXBsZXhbdHlwZV0oZXhwcmVzc2lvbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sXG5cblxuXG4gICAgc2ltcGxlOiB7XG5cbiAgICAgICAgXCI8YWJzb2x1dGUtc2l6ZT5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gVmFsaWRhdGlvblR5cGVzLmlzTGl0ZXJhbChwYXJ0LCBcInh4LXNtYWxsIHwgeC1zbWFsbCB8IHNtYWxsIHwgbWVkaXVtIHwgbGFyZ2UgfCB4LWxhcmdlIHwgeHgtbGFyZ2VcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8YXR0YWNobWVudD5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gVmFsaWRhdGlvblR5cGVzLmlzTGl0ZXJhbChwYXJ0LCBcInNjcm9sbCB8IGZpeGVkIHwgbG9jYWxcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8YXR0cj5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gcGFydC50eXBlID09IFwiZnVuY3Rpb25cIiAmJiBwYXJ0Lm5hbWUgPT0gXCJhdHRyXCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8YmctaW1hZ2U+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXNbXCI8aW1hZ2U+XCJdKHBhcnQpIHx8IHRoaXNbXCI8Z3JhZGllbnQ+XCJdKHBhcnQpIHx8ICBwYXJ0ID09IFwibm9uZVwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGdyYWRpZW50PlwiOiBmdW5jdGlvbihwYXJ0KSB7XG4gICAgICAgICAgICByZXR1cm4gcGFydC50eXBlID09IFwiZnVuY3Rpb25cIiAmJiAvXig/OlxcLSg/Om1zfG1venxvfHdlYmtpdClcXC0pPyg/OnJlcGVhdGluZ1xcLSk/KD86cmFkaWFsXFwtfGxpbmVhclxcLSk/Z3JhZGllbnQvaS50ZXN0KHBhcnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGJveD5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gVmFsaWRhdGlvblR5cGVzLmlzTGl0ZXJhbChwYXJ0LCBcInBhZGRpbmctYm94IHwgYm9yZGVyLWJveCB8IGNvbnRlbnQtYm94XCIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGNvbnRlbnQ+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcImZ1bmN0aW9uXCIgJiYgcGFydC5uYW1lID09IFwiY29udGVudFwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPHJlbGF0aXZlLXNpemU+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIFZhbGlkYXRpb25UeXBlcy5pc0xpdGVyYWwocGFydCwgXCJzbWFsbGVyIHwgbGFyZ2VyXCIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vYW55IGlkZW50aWZpZXJcbiAgICAgICAgXCI8aWRlbnQ+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcImlkZW50aWZpZXJcIjtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxsZW5ndGg+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgaWYgKHBhcnQudHlwZSA9PSBcImZ1bmN0aW9uXCIgJiYgL14oPzpcXC0oPzptc3xtb3p8b3x3ZWJraXQpXFwtKT9jYWxjL2kudGVzdChwYXJ0KSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGFydC50eXBlID09IFwibGVuZ3RoXCIgfHwgcGFydC50eXBlID09IFwibnVtYmVyXCIgfHwgcGFydC50eXBlID09IFwiaW50ZWdlclwiIHx8IHBhcnQgPT0gXCIwXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8Y29sb3I+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcImNvbG9yXCIgfHwgcGFydCA9PSBcInRyYW5zcGFyZW50XCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8bnVtYmVyPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiBwYXJ0LnR5cGUgPT0gXCJudW1iZXJcIiB8fCB0aGlzW1wiPGludGVnZXI+XCJdKHBhcnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGludGVnZXI+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcImludGVnZXJcIjtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxsaW5lPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiBwYXJ0LnR5cGUgPT0gXCJpbnRlZ2VyXCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8YW5nbGU+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcImFuZ2xlXCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8dXJpPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiBwYXJ0LnR5cGUgPT0gXCJ1cmlcIjtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxpbWFnZT5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tcIjx1cmk+XCJdKHBhcnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPHBlcmNlbnRhZ2U+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcInBlcmNlbnRhZ2VcIiB8fCBwYXJ0ID09IFwiMFwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGJvcmRlci13aWR0aD5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tcIjxsZW5ndGg+XCJdKHBhcnQpIHx8IFZhbGlkYXRpb25UeXBlcy5pc0xpdGVyYWwocGFydCwgXCJ0aGluIHwgbWVkaXVtIHwgdGhpY2tcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8Ym9yZGVyLXN0eWxlPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiBWYWxpZGF0aW9uVHlwZXMuaXNMaXRlcmFsKHBhcnQsIFwibm9uZSB8IGhpZGRlbiB8IGRvdHRlZCB8IGRhc2hlZCB8IHNvbGlkIHwgZG91YmxlIHwgZ3Jvb3ZlIHwgcmlkZ2UgfCBpbnNldCB8IG91dHNldFwiKTtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxjb250ZW50LXNpemluZz5cIjogZnVuY3Rpb24ocGFydCl7IC8vIGh0dHA6Ly93d3cudzMub3JnL1RSL2NzczMtc2l6aW5nLyN3aWR0aC1oZWlnaHQta2V5d29yZHNcbiAgICAgICAgICAgIHJldHVybiBWYWxpZGF0aW9uVHlwZXMuaXNMaXRlcmFsKHBhcnQsIFwiZmlsbC1hdmFpbGFibGUgfCAtbW96LWF2YWlsYWJsZSB8IC13ZWJraXQtZmlsbC1hdmFpbGFibGUgfCBtYXgtY29udGVudCB8IC1tb3otbWF4LWNvbnRlbnQgfCAtd2Via2l0LW1heC1jb250ZW50IHwgbWluLWNvbnRlbnQgfCAtbW96LW1pbi1jb250ZW50IHwgLXdlYmtpdC1taW4tY29udGVudCB8IGZpdC1jb250ZW50IHwgLW1vei1maXQtY29udGVudCB8IC13ZWJraXQtZml0LWNvbnRlbnRcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8bWFyZ2luLXdpZHRoPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzW1wiPGxlbmd0aD5cIl0ocGFydCkgfHwgdGhpc1tcIjxwZXJjZW50YWdlPlwiXShwYXJ0KSB8fCBWYWxpZGF0aW9uVHlwZXMuaXNMaXRlcmFsKHBhcnQsIFwiYXV0b1wiKTtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxwYWRkaW5nLXdpZHRoPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzW1wiPGxlbmd0aD5cIl0ocGFydCkgfHwgdGhpc1tcIjxwZXJjZW50YWdlPlwiXShwYXJ0KTtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxzaGFwZT5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gcGFydC50eXBlID09IFwiZnVuY3Rpb25cIiAmJiAocGFydC5uYW1lID09IFwicmVjdFwiIHx8IHBhcnQubmFtZSA9PSBcImluc2V0LXJlY3RcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8dGltZT5cIjogZnVuY3Rpb24ocGFydCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnQudHlwZSA9PSBcInRpbWVcIjtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxmbGV4LWdyb3c+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXNbXCI8bnVtYmVyPlwiXShwYXJ0KTtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjxmbGV4LXNocmluaz5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tcIjxudW1iZXI+XCJdKHBhcnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPHdpZHRoPlwiOiBmdW5jdGlvbihwYXJ0KXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzW1wiPG1hcmdpbi13aWR0aD5cIl0ocGFydCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8ZmxleC1iYXNpcz5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gdGhpc1tcIjx3aWR0aD5cIl0ocGFydCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8ZmxleC1kaXJlY3Rpb24+XCI6IGZ1bmN0aW9uKHBhcnQpe1xuICAgICAgICAgICAgcmV0dXJuIFZhbGlkYXRpb25UeXBlcy5pc0xpdGVyYWwocGFydCwgXCJyb3cgfCByb3ctcmV2ZXJzZSB8IGNvbHVtbiB8IGNvbHVtbi1yZXZlcnNlXCIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGZsZXgtd3JhcD5cIjogZnVuY3Rpb24ocGFydCl7XG4gICAgICAgICAgICByZXR1cm4gVmFsaWRhdGlvblR5cGVzLmlzTGl0ZXJhbChwYXJ0LCBcIm5vd3JhcCB8IHdyYXAgfCB3cmFwLXJldmVyc2VcIik7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgY29tcGxleDoge1xuXG4gICAgICAgIFwiPGJnLXBvc2l0aW9uPlwiOiBmdW5jdGlvbihleHByZXNzaW9uKXtcbiAgICAgICAgICAgIHZhciB0eXBlcyAgID0gdGhpcyxcbiAgICAgICAgICAgICAgICByZXN1bHQgID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgbnVtZXJpYyA9IFwiPHBlcmNlbnRhZ2U+IHwgPGxlbmd0aD5cIixcbiAgICAgICAgICAgICAgICB4RGlyICAgID0gXCJsZWZ0IHwgcmlnaHRcIixcbiAgICAgICAgICAgICAgICB5RGlyICAgID0gXCJ0b3AgfCBib3R0b21cIixcbiAgICAgICAgICAgICAgICBjb3VudCA9IDAsXG4gICAgICAgICAgICAgICAgaGFzTmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXhwcmVzc2lvbi5oYXNOZXh0KCkgJiYgZXhwcmVzc2lvbi5wZWVrKCkgIT0gXCIsXCI7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgd2hpbGUgKGV4cHJlc3Npb24ucGVlayhjb3VudCkgJiYgZXhwcmVzc2lvbi5wZWVrKGNvdW50KSAhPSBcIixcIikge1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9XG5cbi8qXG48cG9zaXRpb24+ID0gW1xuICBbIGxlZnQgfCBjZW50ZXIgfCByaWdodCB8IHRvcCB8IGJvdHRvbSB8IDxwZXJjZW50YWdlPiB8IDxsZW5ndGg+IF1cbnxcbiAgWyBsZWZ0IHwgY2VudGVyIHwgcmlnaHQgfCA8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPiBdXG4gIFsgdG9wIHwgY2VudGVyIHwgYm90dG9tIHwgPHBlcmNlbnRhZ2U+IHwgPGxlbmd0aD4gXVxufFxuICBbIGNlbnRlciB8IFsgbGVmdCB8IHJpZ2h0IF0gWyA8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPiBdPyBdICYmXG4gIFsgY2VudGVyIHwgWyB0b3AgfCBib3R0b20gXSBbIDxwZXJjZW50YWdlPiB8IDxsZW5ndGg+IF0/IF1cbl1cbiovXG5cbiAgICAgICAgICAgIGlmIChjb3VudCA8IDMpIHtcbiAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHhEaXIgKyBcIiB8IGNlbnRlciB8IFwiICsgbnVtZXJpYykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgeURpciArIFwiIHwgY2VudGVyIHwgXCIgKyBudW1lcmljKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCB5RGlyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCB4RGlyICsgXCIgfCBjZW50ZXJcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHhEaXIpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgeURpcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgbnVtZXJpYyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIG51bWVyaWMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHlEaXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgbnVtZXJpYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImNlbnRlclwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCB5RGlyKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHhEaXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIG51bWVyaWMpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBudW1lcmljKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCB4RGlyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgbnVtZXJpYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImNlbnRlclwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImNlbnRlclwiKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIHhEaXIgKyBcIiB8IFwiICsgeURpcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgbnVtZXJpYyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgXCI8Ymctc2l6ZT5cIjogZnVuY3Rpb24oZXhwcmVzc2lvbil7XG4gICAgICAgICAgICAvLzxiZy1zaXplPiA9IFsgPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gfCBhdXRvIF17MSwyfSB8IGNvdmVyIHwgY29udGFpblxuICAgICAgICAgICAgdmFyIHR5cGVzICAgPSB0aGlzLFxuICAgICAgICAgICAgICAgIHJlc3VsdCAgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBudW1lcmljID0gXCI8cGVyY2VudGFnZT4gfCA8bGVuZ3RoPiB8IGF1dG9cIixcbiAgICAgICAgICAgICAgICBwYXJ0LFxuICAgICAgICAgICAgICAgIGksIGxlbjtcblxuICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcImNvdmVyIHwgY29udGFpblwiKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBudW1lcmljKSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIG51bWVyaWMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPHJlcGVhdC1zdHlsZT5cIjogZnVuY3Rpb24oZXhwcmVzc2lvbil7XG4gICAgICAgICAgICAvL3JlcGVhdC14IHwgcmVwZWF0LXkgfCBbcmVwZWF0IHwgc3BhY2UgfCByb3VuZCB8IG5vLXJlcGVhdF17MSwyfVxuICAgICAgICAgICAgdmFyIHJlc3VsdCAgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICB2YWx1ZXMgID0gXCJyZXBlYXQgfCBzcGFjZSB8IHJvdW5kIHwgbm8tcmVwZWF0XCIsXG4gICAgICAgICAgICAgICAgcGFydDtcblxuICAgICAgICAgICAgaWYgKGV4cHJlc3Npb24uaGFzTmV4dCgpKXtcbiAgICAgICAgICAgICAgICBwYXJ0ID0gZXhwcmVzc2lvbi5uZXh0KCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzTGl0ZXJhbChwYXJ0LCBcInJlcGVhdC14IHwgcmVwZWF0LXlcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0xpdGVyYWwocGFydCwgdmFsdWVzKSkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChleHByZXNzaW9uLmhhc05leHQoKSAmJiBWYWxpZGF0aW9uVHlwZXMuaXNMaXRlcmFsKGV4cHJlc3Npb24ucGVlaygpLCB2YWx1ZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uLm5leHQoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcblxuICAgICAgICB9LFxuXG4gICAgICAgIFwiPHNoYWRvdz5cIjogZnVuY3Rpb24oZXhwcmVzc2lvbikge1xuICAgICAgICAgICAgLy9pbnNldD8gJiYgWyA8bGVuZ3RoPnsyLDR9ICYmIDxjb2xvcj4/IF1cbiAgICAgICAgICAgIHZhciByZXN1bHQgID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgY291bnQgICA9IDAsXG4gICAgICAgICAgICAgICAgaW5zZXQgICA9IGZhbHNlLFxuICAgICAgICAgICAgICAgIGNvbG9yICAgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICBwYXJ0O1xuXG4gICAgICAgICAgICBpZiAoZXhwcmVzc2lvbi5oYXNOZXh0KCkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgXCJpbnNldFwiKSl7XG4gICAgICAgICAgICAgICAgICAgIGluc2V0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoVmFsaWRhdGlvblR5cGVzLmlzQW55KGV4cHJlc3Npb24sIFwiPGNvbG9yPlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgd2hpbGUgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcIjxsZW5ndGg+XCIpICYmIGNvdW50IDwgNCkge1xuICAgICAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICAgICAgaWYgKGV4cHJlc3Npb24uaGFzTmV4dCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghY29sb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcIjxjb2xvcj5cIik7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWluc2V0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBWYWxpZGF0aW9uVHlwZXMuaXNBbnkoZXhwcmVzc2lvbiwgXCJpbnNldFwiKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gKGNvdW50ID49IDIgJiYgY291bnQgPD0gNCk7XG5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBcIjx4LW9uZS1yYWRpdXM+XCI6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcbiAgICAgICAgICAgIC8vWyA8bGVuZ3RoPiB8IDxwZXJjZW50YWdlPiBdIFsgPGxlbmd0aD4gfCA8cGVyY2VudGFnZT4gXT9cbiAgICAgICAgICAgIHZhciByZXN1bHQgID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgc2ltcGxlID0gXCI8bGVuZ3RoPiB8IDxwZXJjZW50YWdlPiB8IGluaGVyaXRcIjtcblxuICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBzaW1wbGUpKXtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBzaW1wbGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiPGZsZXg+XCI6IGZ1bmN0aW9uKGV4cHJlc3Npb24pIHtcbiAgICAgICAgICAgIC8vIGh0dHA6Ly93d3cudzMub3JnL1RSLzIwMTQvV0QtY3NzLWZsZXhib3gtMS0yMDE0MDMyNS8jZmxleC1wcm9wZXJ0eVxuICAgICAgICAgICAgLy8gbm9uZSB8IFsgPGZsZXgtZ3Jvdz4gPGZsZXgtc2hyaW5rPj8gfHwgPGZsZXgtYmFzaXM+IF1cbiAgICAgICAgICAgIC8vIFZhbGlkIHN5bnRheGVzLCBhY2NvcmRpbmcgdG8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQ1NTL2ZsZXgjU3ludGF4XG4gICAgICAgICAgICAvLyAqIG5vbmVcbiAgICAgICAgICAgIC8vICogPGZsZXgtZ3Jvdz5cbiAgICAgICAgICAgIC8vICogPGZsZXgtYmFzaXM+XG4gICAgICAgICAgICAvLyAqIDxmbGV4LWdyb3c+IDxmbGV4LWJhc2lzPlxuICAgICAgICAgICAgLy8gKiA8ZmxleC1ncm93PiA8ZmxleC1zaHJpbms+XG4gICAgICAgICAgICAvLyAqIDxmbGV4LWdyb3c+IDxmbGV4LXNocmluaz4gPGZsZXgtYmFzaXM+XG4gICAgICAgICAgICAvLyAqIGluaGVyaXRcbiAgICAgICAgICAgIHZhciBwYXJ0LFxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc0FueShleHByZXNzaW9uLCBcIm5vbmUgfCBpbmhlcml0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKFZhbGlkYXRpb25UeXBlcy5pc1R5cGUoZXhwcmVzc2lvbiwgXCI8ZmxleC1ncm93PlwiKSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwcmVzc2lvbi5wZWVrKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNUeXBlKGV4cHJlc3Npb24sIFwiPGZsZXgtc2hyaW5rPlwiKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHByZXNzaW9uLnBlZWsoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBWYWxpZGF0aW9uVHlwZXMuaXNUeXBlKGV4cHJlc3Npb24sIFwiPGZsZXgtYmFzaXM+XCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNUeXBlKGV4cHJlc3Npb24sIFwiPGZsZXgtYmFzaXM+XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gZXhwcmVzc2lvbi5wZWVrKCkgPT09IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChWYWxpZGF0aW9uVHlwZXMuaXNUeXBlKGV4cHJlc3Npb24sIFwiPGZsZXgtYmFzaXM+XCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICAgIC8vIEdlbmVyYXRlIGEgbW9yZSB2ZXJib3NlIGVycm9yIHRoYW4gXCJFeHBlY3RlZCA8ZmxleD4uLi5cIlxuICAgICAgICAgICAgICAgIHBhcnQgPSBleHByZXNzaW9uLnBlZWsoKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVmFsaWRhdGlvbkVycm9yKFwiRXhwZWN0ZWQgKG5vbmUgfCBbIDxmbGV4LWdyb3c+IDxmbGV4LXNocmluaz4/IHx8IDxmbGV4LWJhc2lzPiBdKSBidXQgZm91bmQgJ1wiICsgZXhwcmVzc2lvbi52YWx1ZS50ZXh0ICsgXCInLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbnBhcnNlcmxpYi5jc3MgPSB7XG5Db2xvcnMgICAgICAgICAgICAgIDpDb2xvcnMsXG5Db21iaW5hdG9yICAgICAgICAgIDpDb21iaW5hdG9yLFxuUGFyc2VyICAgICAgICAgICAgICA6UGFyc2VyLFxuUHJvcGVydHlOYW1lICAgICAgICA6UHJvcGVydHlOYW1lLFxuUHJvcGVydHlWYWx1ZSAgICAgICA6UHJvcGVydHlWYWx1ZSxcblByb3BlcnR5VmFsdWVQYXJ0ICAgOlByb3BlcnR5VmFsdWVQYXJ0LFxuTWVkaWFGZWF0dXJlICAgICAgICA6TWVkaWFGZWF0dXJlLFxuTWVkaWFRdWVyeSAgICAgICAgICA6TWVkaWFRdWVyeSxcblNlbGVjdG9yICAgICAgICAgICAgOlNlbGVjdG9yLFxuU2VsZWN0b3JQYXJ0ICAgICAgICA6U2VsZWN0b3JQYXJ0LFxuU2VsZWN0b3JTdWJQYXJ0ICAgICA6U2VsZWN0b3JTdWJQYXJ0LFxuU3BlY2lmaWNpdHkgICAgICAgICA6U3BlY2lmaWNpdHksXG5Ub2tlblN0cmVhbSAgICAgICAgIDpUb2tlblN0cmVhbSxcblRva2VucyAgICAgICAgICAgICAgOlRva2VucyxcblZhbGlkYXRpb25FcnJvciAgICAgOlZhbGlkYXRpb25FcnJvclxufTtcbn0pKCk7XG5cbihmdW5jdGlvbigpe1xuZm9yKHZhciBwcm9wIGluIHBhcnNlcmxpYil7XG5leHBvcnRzW3Byb3BdID0gcGFyc2VybGliW3Byb3BdO1xufVxufSkoKTtcblxuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cbi8vIHNoaW0gZm9yIE5vZGUncyAndXRpbCcgcGFja2FnZVxuLy8gRE8gTk9UIFJFTU9WRSBUSElTISBJdCBpcyByZXF1aXJlZCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIEVuZGVySlMgKGh0dHA6Ly9lbmRlcmpzLmNvbS8pLlxudmFyIHV0aWwgPSB7XG4gIGlzQXJyYXk6IGZ1bmN0aW9uIChhcikge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KGFyKSB8fCAodHlwZW9mIGFyID09PSAnb2JqZWN0JyAmJiBvYmplY3RUb1N0cmluZyhhcikgPT09ICdbb2JqZWN0IEFycmF5XScpO1xuICB9LFxuICBpc0RhdGU6IGZ1bmN0aW9uIChkKSB7XG4gICAgcmV0dXJuIHR5cGVvZiBkID09PSAnb2JqZWN0JyAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xuICB9LFxuICBpc1JlZ0V4cDogZnVuY3Rpb24gKHJlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiByZSA9PT0gJ29iamVjdCcgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbiAgfSxcbiAgZ2V0UmVnRXhwRmxhZ3M6IGZ1bmN0aW9uIChyZSkge1xuICAgIHZhciBmbGFncyA9ICcnO1xuICAgIHJlLmdsb2JhbCAmJiAoZmxhZ3MgKz0gJ2cnKTtcbiAgICByZS5pZ25vcmVDYXNlICYmIChmbGFncyArPSAnaScpO1xuICAgIHJlLm11bHRpbGluZSAmJiAoZmxhZ3MgKz0gJ20nKTtcbiAgICByZXR1cm4gZmxhZ3M7XG4gIH1cbn07XG5cblxuaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKVxuICBtb2R1bGUuZXhwb3J0cyA9IGNsb25lO1xuXG4vKipcbiAqIENsb25lcyAoY29waWVzKSBhbiBPYmplY3QgdXNpbmcgZGVlcCBjb3B5aW5nLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gc3VwcG9ydHMgY2lyY3VsYXIgcmVmZXJlbmNlcyBieSBkZWZhdWx0LCBidXQgaWYgeW91IGFyZSBjZXJ0YWluXG4gKiB0aGVyZSBhcmUgbm8gY2lyY3VsYXIgcmVmZXJlbmNlcyBpbiB5b3VyIG9iamVjdCwgeW91IGNhbiBzYXZlIHNvbWUgQ1BVIHRpbWVcbiAqIGJ5IGNhbGxpbmcgY2xvbmUob2JqLCBmYWxzZSkuXG4gKlxuICogQ2F1dGlvbjogaWYgYGNpcmN1bGFyYCBpcyBmYWxzZSBhbmQgYHBhcmVudGAgY29udGFpbnMgY2lyY3VsYXIgcmVmZXJlbmNlcyxcbiAqIHlvdXIgcHJvZ3JhbSBtYXkgZW50ZXIgYW4gaW5maW5pdGUgbG9vcCBhbmQgY3Jhc2guXG4gKlxuICogQHBhcmFtIGBwYXJlbnRgIC0gdGhlIG9iamVjdCB0byBiZSBjbG9uZWRcbiAqIEBwYXJhbSBgY2lyY3VsYXJgIC0gc2V0IHRvIHRydWUgaWYgdGhlIG9iamVjdCB0byBiZSBjbG9uZWQgbWF5IGNvbnRhaW5cbiAqICAgIGNpcmN1bGFyIHJlZmVyZW5jZXMuIChvcHRpb25hbCAtIHRydWUgYnkgZGVmYXVsdClcbiAqIEBwYXJhbSBgZGVwdGhgIC0gc2V0IHRvIGEgbnVtYmVyIGlmIHRoZSBvYmplY3QgaXMgb25seSB0byBiZSBjbG9uZWQgdG9cbiAqICAgIGEgcGFydGljdWxhciBkZXB0aC4gKG9wdGlvbmFsIC0gZGVmYXVsdHMgdG8gSW5maW5pdHkpXG4gKiBAcGFyYW0gYHByb3RvdHlwZWAgLSBzZXRzIHRoZSBwcm90b3R5cGUgdG8gYmUgdXNlZCB3aGVuIGNsb25pbmcgYW4gb2JqZWN0LlxuICogICAgKG9wdGlvbmFsIC0gZGVmYXVsdHMgdG8gcGFyZW50IHByb3RvdHlwZSkuXG4qL1xuXG5mdW5jdGlvbiBjbG9uZShwYXJlbnQsIGNpcmN1bGFyLCBkZXB0aCwgcHJvdG90eXBlKSB7XG4gIC8vIG1haW50YWluIHR3byBhcnJheXMgZm9yIGNpcmN1bGFyIHJlZmVyZW5jZXMsIHdoZXJlIGNvcnJlc3BvbmRpbmcgcGFyZW50c1xuICAvLyBhbmQgY2hpbGRyZW4gaGF2ZSB0aGUgc2FtZSBpbmRleFxuICB2YXIgYWxsUGFyZW50cyA9IFtdO1xuICB2YXIgYWxsQ2hpbGRyZW4gPSBbXTtcblxuICB2YXIgdXNlQnVmZmVyID0gdHlwZW9mIEJ1ZmZlciAhPSAndW5kZWZpbmVkJztcblxuICBpZiAodHlwZW9mIGNpcmN1bGFyID09ICd1bmRlZmluZWQnKVxuICAgIGNpcmN1bGFyID0gdHJ1ZTtcblxuICBpZiAodHlwZW9mIGRlcHRoID09ICd1bmRlZmluZWQnKVxuICAgIGRlcHRoID0gSW5maW5pdHk7XG5cbiAgLy8gcmVjdXJzZSB0aGlzIGZ1bmN0aW9uIHNvIHdlIGRvbid0IHJlc2V0IGFsbFBhcmVudHMgYW5kIGFsbENoaWxkcmVuXG4gIGZ1bmN0aW9uIF9jbG9uZShwYXJlbnQsIGRlcHRoKSB7XG4gICAgLy8gY2xvbmluZyBudWxsIGFsd2F5cyByZXR1cm5zIG51bGxcbiAgICBpZiAocGFyZW50ID09PSBudWxsKVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoZGVwdGggPT0gMClcbiAgICAgIHJldHVybiBwYXJlbnQ7XG5cbiAgICB2YXIgY2hpbGQ7XG4gICAgaWYgKHR5cGVvZiBwYXJlbnQgIT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiBwYXJlbnQ7XG4gICAgfVxuXG4gICAgaWYgKHV0aWwuaXNBcnJheShwYXJlbnQpKSB7XG4gICAgICBjaGlsZCA9IFtdO1xuICAgIH0gZWxzZSBpZiAodXRpbC5pc1JlZ0V4cChwYXJlbnQpKSB7XG4gICAgICBjaGlsZCA9IG5ldyBSZWdFeHAocGFyZW50LnNvdXJjZSwgdXRpbC5nZXRSZWdFeHBGbGFncyhwYXJlbnQpKTtcbiAgICAgIGlmIChwYXJlbnQubGFzdEluZGV4KSBjaGlsZC5sYXN0SW5kZXggPSBwYXJlbnQubGFzdEluZGV4O1xuICAgIH0gZWxzZSBpZiAodXRpbC5pc0RhdGUocGFyZW50KSkge1xuICAgICAgY2hpbGQgPSBuZXcgRGF0ZShwYXJlbnQuZ2V0VGltZSgpKTtcbiAgICB9IGVsc2UgaWYgKHVzZUJ1ZmZlciAmJiBCdWZmZXIuaXNCdWZmZXIocGFyZW50KSkge1xuICAgICAgY2hpbGQgPSBuZXcgQnVmZmVyKHBhcmVudC5sZW5ndGgpO1xuICAgICAgcGFyZW50LmNvcHkoY2hpbGQpO1xuICAgICAgcmV0dXJuIGNoaWxkO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodHlwZW9mIHByb3RvdHlwZSA9PSAndW5kZWZpbmVkJykgY2hpbGQgPSBPYmplY3QuY3JlYXRlKE9iamVjdC5nZXRQcm90b3R5cGVPZihwYXJlbnQpKTtcbiAgICAgIGVsc2UgY2hpbGQgPSBPYmplY3QuY3JlYXRlKHByb3RvdHlwZSk7XG4gICAgfVxuXG4gICAgaWYgKGNpcmN1bGFyKSB7XG4gICAgICB2YXIgaW5kZXggPSBhbGxQYXJlbnRzLmluZGV4T2YocGFyZW50KTtcblxuICAgICAgaWYgKGluZGV4ICE9IC0xKSB7XG4gICAgICAgIHJldHVybiBhbGxDaGlsZHJlbltpbmRleF07XG4gICAgICB9XG4gICAgICBhbGxQYXJlbnRzLnB1c2gocGFyZW50KTtcbiAgICAgIGFsbENoaWxkcmVuLnB1c2goY2hpbGQpO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgaW4gcGFyZW50KSB7XG4gICAgICBjaGlsZFtpXSA9IF9jbG9uZShwYXJlbnRbaV0sIGRlcHRoIC0gMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNoaWxkO1xuICB9XG5cbiAgcmV0dXJuIF9jbG9uZShwYXJlbnQsIGRlcHRoKTtcbn1cblxuLyoqXG4gKiBTaW1wbGUgZmxhdCBjbG9uZSB1c2luZyBwcm90b3R5cGUsIGFjY2VwdHMgb25seSBvYmplY3RzLCB1c2VmdWxsIGZvciBwcm9wZXJ0eVxuICogb3ZlcnJpZGUgb24gRkxBVCBjb25maWd1cmF0aW9uIG9iamVjdCAobm8gbmVzdGVkIHByb3BzKS5cbiAqXG4gKiBVU0UgV0lUSCBDQVVUSU9OISBUaGlzIG1heSBub3QgYmVoYXZlIGFzIHlvdSB3aXNoIGlmIHlvdSBkbyBub3Qga25vdyBob3cgdGhpc1xuICogd29ya3MuXG4gKi9cbmNsb25lLmNsb25lUHJvdG90eXBlID0gZnVuY3Rpb24ocGFyZW50KSB7XG4gIGlmIChwYXJlbnQgPT09IG51bGwpXG4gICAgcmV0dXJuIG51bGw7XG5cbiAgdmFyIGMgPSBmdW5jdGlvbiAoKSB7fTtcbiAgYy5wcm90b3R5cGUgPSBwYXJlbnQ7XG4gIHJldHVybiBuZXcgYygpO1xufTtcblxuLyoqXG4gKiBNYWluIENTU0xpbnQgb2JqZWN0LlxuICogQGNsYXNzIENTU0xpbnRcbiAqIEBzdGF0aWNcbiAqIEBleHRlbmRzIHBhcnNlcmxpYi51dGlsLkV2ZW50VGFyZ2V0XG4gKi9cblxuLyogZ2xvYmFsIHBhcnNlcmxpYiwgY2xvbmUsIFJlcG9ydGVyICovXG4vKiBleHBvcnRlZCBDU1NMaW50ICovXG5cbnZhciBDU1NMaW50ID0gKGZ1bmN0aW9uKCl7XG5cbiAgICB2YXIgcnVsZXMgICAgICAgICAgID0gW10sXG4gICAgICAgIGZvcm1hdHRlcnMgICAgICA9IFtdLFxuICAgICAgICBlbWJlZGRlZFJ1bGVzZXQgPSAvXFwvXFwqY3NzbGludChbXlxcKl0qKVxcKlxcLy8sXG4gICAgICAgIGFwaSAgICAgICAgICAgICA9IG5ldyBwYXJzZXJsaWIudXRpbC5FdmVudFRhcmdldCgpO1xuXG4gICAgYXBpLnZlcnNpb24gPSBcIkBWRVJTSU9OQFwiO1xuXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gUnVsZSBNYW5hZ2VtZW50XG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IHJ1bGUgdG8gdGhlIGVuZ2luZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZSBUaGUgcnVsZSB0byBhZGQuXG4gICAgICogQG1ldGhvZCBhZGRSdWxlXG4gICAgICovXG4gICAgYXBpLmFkZFJ1bGUgPSBmdW5jdGlvbihydWxlKXtcbiAgICAgICAgcnVsZXMucHVzaChydWxlKTtcbiAgICAgICAgcnVsZXNbcnVsZS5pZF0gPSBydWxlO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBDbGVhcnMgYWxsIHJ1bGUgZnJvbSB0aGUgZW5naW5lLlxuICAgICAqIEBtZXRob2QgY2xlYXJSdWxlc1xuICAgICAqL1xuICAgIGFwaS5jbGVhclJ1bGVzID0gZnVuY3Rpb24oKXtcbiAgICAgICAgcnVsZXMgPSBbXTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcnVsZSBvYmplY3RzLlxuICAgICAqIEByZXR1cm4gQW4gYXJyYXkgb2YgcnVsZSBvYmplY3RzLlxuICAgICAqIEBtZXRob2QgZ2V0UnVsZXNcbiAgICAgKi9cbiAgICBhcGkuZ2V0UnVsZXMgPSBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gW10uY29uY2F0KHJ1bGVzKS5zb3J0KGZ1bmN0aW9uKGEsYil7XG4gICAgICAgICAgICByZXR1cm4gYS5pZCA+IGIuaWQgPyAxIDogMDtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBydWxlc2V0IGNvbmZpZ3VyYXRpb24gb2JqZWN0IHdpdGggYWxsIGN1cnJlbnQgcnVsZXMuXG4gICAgICogQHJldHVybiBBIHJ1bGVzZXQgb2JqZWN0LlxuICAgICAqIEBtZXRob2QgZ2V0UnVsZXNldFxuICAgICAqL1xuICAgIGFwaS5nZXRSdWxlc2V0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBydWxlc2V0ID0ge30sXG4gICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgIGxlbiA9IHJ1bGVzLmxlbmd0aDtcblxuICAgICAgICB3aGlsZSAoaSA8IGxlbil7XG4gICAgICAgICAgICBydWxlc2V0W3J1bGVzW2krK10uaWRdID0gMTsgICAgLy9ieSBkZWZhdWx0LCBldmVyeXRoaW5nIGlzIGEgd2FybmluZ1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJ1bGVzZXQ7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBydWxlc2V0IG9iamVjdCBiYXNlZCBvbiBlbWJlZGRlZCBydWxlcy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIHN0cmluZyBvZiBjc3MgY29udGFpbmluZyBlbWJlZGRlZCBydWxlcy5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZXNldCBBIHJ1bGVzZXQgb2JqZWN0IHRvIG1vZGlmeS5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IEEgcnVsZXNldCBvYmplY3QuXG4gICAgICogQG1ldGhvZCBnZXRFbWJlZGRlZFJ1bGVzZXRcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBhcHBseUVtYmVkZGVkUnVsZXNldCh0ZXh0LCBydWxlc2V0KXtcbiAgICAgICAgdmFyIHZhbHVlTWFwLFxuICAgICAgICAgICAgZW1iZWRkZWQgPSB0ZXh0ICYmIHRleHQubWF0Y2goZW1iZWRkZWRSdWxlc2V0KSxcbiAgICAgICAgICAgIHJ1bGVzID0gZW1iZWRkZWQgJiYgZW1iZWRkZWRbMV07XG5cbiAgICAgICAgaWYgKHJ1bGVzKSB7XG4gICAgICAgICAgICB2YWx1ZU1hcCA9IHtcbiAgICAgICAgICAgICAgICBcInRydWVcIjogMiwgIC8vIHRydWUgaXMgZXJyb3JcbiAgICAgICAgICAgICAgICBcIlwiOiAxLCAgICAgIC8vIGJsYW5rIGlzIHdhcm5pbmdcbiAgICAgICAgICAgICAgICBcImZhbHNlXCI6IDAsIC8vIGZhbHNlIGlzIGlnbm9yZVxuXG4gICAgICAgICAgICAgICAgXCIyXCI6IDIsICAgICAvLyBleHBsaWNpdCBlcnJvclxuICAgICAgICAgICAgICAgIFwiMVwiOiAxLCAgICAgLy8gZXhwbGljaXQgd2FybmluZ1xuICAgICAgICAgICAgICAgIFwiMFwiOiAwICAgICAgLy8gZXhwbGljaXQgaWdub3JlXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBydWxlcy50b0xvd2VyQ2FzZSgpLnNwbGl0KFwiLFwiKS5mb3JFYWNoKGZ1bmN0aW9uKHJ1bGUpe1xuICAgICAgICAgICAgICAgIHZhciBwYWlyID0gcnVsZS5zcGxpdChcIjpcIiksXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5ID0gcGFpclswXSB8fCBcIlwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHBhaXJbMV0gfHwgXCJcIjtcblxuICAgICAgICAgICAgICAgIHJ1bGVzZXRbcHJvcGVydHkudHJpbSgpXSA9IHZhbHVlTWFwW3ZhbHVlLnRyaW0oKV07XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBydWxlc2V0O1xuICAgIH1cblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIEZvcm1hdHRlcnNcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBuZXcgZm9ybWF0dGVyIHRvIHRoZSBlbmdpbmUuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGZvcm1hdHRlciBUaGUgZm9ybWF0dGVyIHRvIGFkZC5cbiAgICAgKiBAbWV0aG9kIGFkZEZvcm1hdHRlclxuICAgICAqL1xuICAgIGFwaS5hZGRGb3JtYXR0ZXIgPSBmdW5jdGlvbihmb3JtYXR0ZXIpIHtcbiAgICAgICAgLy8gZm9ybWF0dGVycy5wdXNoKGZvcm1hdHRlcik7XG4gICAgICAgIGZvcm1hdHRlcnNbZm9ybWF0dGVyLmlkXSA9IGZvcm1hdHRlcjtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmVzIGEgZm9ybWF0dGVyIGZvciB1c2UuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGZvcm1hdElkIFRoZSBuYW1lIG9mIHRoZSBmb3JtYXQgdG8gcmV0cmlldmUuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgZm9ybWF0dGVyIG9yIHVuZGVmaW5lZC5cbiAgICAgKiBAbWV0aG9kIGdldEZvcm1hdHRlclxuICAgICAqL1xuICAgIGFwaS5nZXRGb3JtYXR0ZXIgPSBmdW5jdGlvbihmb3JtYXRJZCl7XG4gICAgICAgIHJldHVybiBmb3JtYXR0ZXJzW2Zvcm1hdElkXTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogRm9ybWF0cyB0aGUgcmVzdWx0cyBpbiBhIHBhcnRpY3VsYXIgZm9ybWF0IGZvciBhIHNpbmdsZSBmaWxlLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByZXN1bHQgVGhlIHJlc3VsdHMgcmV0dXJuZWQgZnJvbSBDU1NMaW50LnZlcmlmeSgpLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZSBUaGUgZmlsZW5hbWUgZm9yIHdoaWNoIHRoZSByZXN1bHRzIGFwcGx5LlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBmb3JtYXRJZCBUaGUgbmFtZSBvZiB0aGUgZm9ybWF0dGVyIHRvIHVzZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAoT3B0aW9uYWwpIGZvciBzcGVjaWFsIG91dHB1dCBoYW5kbGluZy5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IEEgZm9ybWF0dGVkIHN0cmluZyBmb3IgdGhlIHJlc3VsdHMuXG4gICAgICogQG1ldGhvZCBmb3JtYXRcbiAgICAgKi9cbiAgICBhcGkuZm9ybWF0ID0gZnVuY3Rpb24ocmVzdWx0cywgZmlsZW5hbWUsIGZvcm1hdElkLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBmb3JtYXR0ZXIgPSB0aGlzLmdldEZvcm1hdHRlcihmb3JtYXRJZCksXG4gICAgICAgICAgICByZXN1bHQgPSBudWxsO1xuXG4gICAgICAgIGlmIChmb3JtYXR0ZXIpe1xuICAgICAgICAgICAgcmVzdWx0ID0gZm9ybWF0dGVyLnN0YXJ0Rm9ybWF0KCk7XG4gICAgICAgICAgICByZXN1bHQgKz0gZm9ybWF0dGVyLmZvcm1hdFJlc3VsdHMocmVzdWx0cywgZmlsZW5hbWUsIG9wdGlvbnMgfHwge30pO1xuICAgICAgICAgICAgcmVzdWx0ICs9IGZvcm1hdHRlci5lbmRGb3JtYXQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyBpZiB0aGUgZ2l2ZW4gZm9ybWF0IGlzIHN1cHBvcnRlZC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZm9ybWF0SWQgVGhlIElEIG9mIHRoZSBmb3JtYXQgdG8gY2hlY2suXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gVHJ1ZSBpZiB0aGUgZm9ybWF0IGV4aXN0cywgZmFsc2UgaWYgbm90LlxuICAgICAqIEBtZXRob2QgaGFzRm9ybWF0XG4gICAgICovXG4gICAgYXBpLmhhc0Zvcm1hdCA9IGZ1bmN0aW9uKGZvcm1hdElkKXtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlcnMuaGFzT3duUHJvcGVydHkoZm9ybWF0SWQpO1xuICAgIH07XG5cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLyBWZXJpZmljYXRpb25cbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyB0aGUgdmVyaWZpY2F0aW9uIHByb2Nlc3MgZm9yIHRoZSBnaXZlbiBDU1MgdGV4dC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgQ1NTIHRleHQgdG8gdmVyaWZ5LlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBydWxlc2V0IChPcHRpb25hbCkgTGlzdCBvZiBydWxlcyB0byBhcHBseS4gSWYgbnVsbCwgdGhlblxuICAgICAqICAgICAgYWxsIHJ1bGVzIGFyZSB1c2VkLiBJZiBhIHJ1bGUgaGFzIGEgdmFsdWUgb2YgMSB0aGVuIGl0J3MgYSB3YXJuaW5nLFxuICAgICAqICAgICAgYSB2YWx1ZSBvZiAyIG1lYW5zIGl0J3MgYW4gZXJyb3IuXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBSZXN1bHRzIG9mIHRoZSB2ZXJpZmljYXRpb24uXG4gICAgICogQG1ldGhvZCB2ZXJpZnlcbiAgICAgKi9cbiAgICBhcGkudmVyaWZ5ID0gZnVuY3Rpb24odGV4dCwgcnVsZXNldCl7XG5cbiAgICAgICAgdmFyIGkgPSAwLFxuICAgICAgICAgICAgcmVwb3J0ZXIsXG4gICAgICAgICAgICBsaW5lcyxcbiAgICAgICAgICAgIHJlcG9ydCxcbiAgICAgICAgICAgIHBhcnNlciA9IG5ldyBwYXJzZXJsaWIuY3NzLlBhcnNlcih7IHN0YXJIYWNrOiB0cnVlLCBpZUZpbHRlcnM6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmRlcnNjb3JlSGFjazogdHJ1ZSwgc3RyaWN0OiBmYWxzZSB9KTtcblxuICAgICAgICAvLyBub3JtYWxpemUgbGluZSBlbmRpbmdzXG4gICAgICAgIGxpbmVzID0gdGV4dC5yZXBsYWNlKC9cXG5cXHI/L2csIFwiJHNwbGl0JFwiKS5zcGxpdChcIiRzcGxpdCRcIik7XG5cbiAgICAgICAgaWYgKCFydWxlc2V0KXtcbiAgICAgICAgICAgIHJ1bGVzZXQgPSB0aGlzLmdldFJ1bGVzZXQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbWJlZGRlZFJ1bGVzZXQudGVzdCh0ZXh0KSl7XG4gICAgICAgICAgICAvL2RlZmVuc2l2ZWx5IGNvcHkgc28gdGhhdCBjYWxsZXIncyB2ZXJzaW9uIGRvZXMgbm90IGdldCBtb2RpZmllZFxuICAgICAgICAgICAgcnVsZXNldCA9IGNsb25lKHJ1bGVzZXQpO1xuICAgICAgICAgICAgcnVsZXNldCA9IGFwcGx5RW1iZWRkZWRSdWxlc2V0KHRleHQsIHJ1bGVzZXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVwb3J0ZXIgPSBuZXcgUmVwb3J0ZXIobGluZXMsIHJ1bGVzZXQpO1xuXG4gICAgICAgIHJ1bGVzZXQuZXJyb3JzID0gMjsgICAgICAgLy9hbHdheXMgcmVwb3J0IHBhcnNpbmcgZXJyb3JzIGFzIGVycm9yc1xuICAgICAgICBmb3IgKGkgaW4gcnVsZXNldCl7XG4gICAgICAgICAgICBpZihydWxlc2V0Lmhhc093blByb3BlcnR5KGkpICYmIHJ1bGVzZXRbaV0pe1xuICAgICAgICAgICAgICAgIGlmIChydWxlc1tpXSl7XG4gICAgICAgICAgICAgICAgICAgIHJ1bGVzW2ldLmluaXQocGFyc2VyLCByZXBvcnRlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICAvL2NhcHR1cmUgbW9zdCBob3JyaWJsZSBlcnJvciB0eXBlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwYXJzZXIucGFyc2UodGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAgICAgICByZXBvcnRlci5lcnJvcihcIkZhdGFsIGVycm9yLCBjYW5ub3QgY29udGludWU6IFwiICsgZXgubWVzc2FnZSwgZXgubGluZSwgZXguY29sLCB7fSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXBvcnQgPSB7XG4gICAgICAgICAgICBtZXNzYWdlcyAgICA6IHJlcG9ydGVyLm1lc3NhZ2VzLFxuICAgICAgICAgICAgc3RhdHMgICAgICAgOiByZXBvcnRlci5zdGF0cyxcbiAgICAgICAgICAgIHJ1bGVzZXQgICAgIDogcmVwb3J0ZXIucnVsZXNldFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vc29ydCBieSBsaW5lIG51bWJlcnMsIHJvbGx1cHMgYXQgdGhlIGJvdHRvbVxuICAgICAgICByZXBvcnQubWVzc2FnZXMuc29ydChmdW5jdGlvbiAoYSwgYil7XG4gICAgICAgICAgICBpZiAoYS5yb2xsdXAgJiYgIWIucm9sbHVwKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWEucm9sbHVwICYmIGIucm9sbHVwKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBhLmxpbmUgLSBiLmxpbmU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZXBvcnQ7XG4gICAgfTtcblxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgIC8vIFB1Ymxpc2ggdGhlIEFQSVxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgcmV0dXJuIGFwaTtcblxufSkoKTtcblxuLyoqXG4gKiBBbiBpbnN0YW5jZSBvZiBSZXBvcnQgaXMgdXNlZCB0byByZXBvcnQgcmVzdWx0cyBvZiB0aGVcbiAqIHZlcmlmaWNhdGlvbiBiYWNrIHRvIHRoZSBtYWluIEFQSS5cbiAqIEBjbGFzcyBSZXBvcnRlclxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1N0cmluZ1tdfSBsaW5lcyBUaGUgdGV4dCBsaW5lcyBvZiB0aGUgc291cmNlLlxuICogQHBhcmFtIHtPYmplY3R9IHJ1bGVzZXQgVGhlIHNldCBvZiBydWxlcyB0byB3b3JrIHdpdGgsIGluY2x1ZGluZyBpZlxuICogICAgICB0aGV5IGFyZSBlcnJvcnMgb3Igd2FybmluZ3MuXG4gKi9cbmZ1bmN0aW9uIFJlcG9ydGVyKGxpbmVzLCBydWxlc2V0KXtcblxuICAgIC8qKlxuICAgICAqIExpc3Qgb2YgbWVzc2FnZXMgYmVpbmcgcmVwb3J0ZWQuXG4gICAgICogQHByb3BlcnR5IG1lc3NhZ2VzXG4gICAgICogQHR5cGUgU3RyaW5nW11cbiAgICAgKi9cbiAgICB0aGlzLm1lc3NhZ2VzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBMaXN0IG9mIHN0YXRpc3RpY3MgYmVpbmcgcmVwb3J0ZWQuXG4gICAgICogQHByb3BlcnR5IHN0YXRzXG4gICAgICogQHR5cGUgU3RyaW5nW11cbiAgICAgKi9cbiAgICB0aGlzLnN0YXRzID0gW107XG5cbiAgICAvKipcbiAgICAgKiBMaW5lcyBvZiBjb2RlIGJlaW5nIHJlcG9ydGVkIG9uLiBVc2VkIHRvIHByb3ZpZGUgY29udGV4dHVhbCBpbmZvcm1hdGlvblxuICAgICAqIGZvciBtZXNzYWdlcy5cbiAgICAgKiBAcHJvcGVydHkgbGluZXNcbiAgICAgKiBAdHlwZSBTdHJpbmdbXVxuICAgICAqL1xuICAgIHRoaXMubGluZXMgPSBsaW5lcztcblxuICAgIC8qKlxuICAgICAqIEluZm9ybWF0aW9uIGFib3V0IHRoZSBydWxlcy4gVXNlZCB0byBkZXRlcm1pbmUgd2hldGhlciBhbiBpc3N1ZSBpcyBhblxuICAgICAqIGVycm9yIG9yIHdhcm5pbmcuXG4gICAgICogQHByb3BlcnR5IHJ1bGVzZXRcbiAgICAgKiBAdHlwZSBPYmplY3RcbiAgICAgKi9cbiAgICB0aGlzLnJ1bGVzZXQgPSBydWxlc2V0O1xufVxuXG5SZXBvcnRlci5wcm90b3R5cGUgPSB7XG5cbiAgICAvL3Jlc3RvcmUgY29uc3RydWN0b3JcbiAgICBjb25zdHJ1Y3RvcjogUmVwb3J0ZXIsXG5cbiAgICAvKipcbiAgICAgKiBSZXBvcnQgYW4gZXJyb3IuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIG1lc3NhZ2UgdG8gc3RvcmUuXG4gICAgICogQHBhcmFtIHtpbnR9IGxpbmUgVGhlIGxpbmUgbnVtYmVyLlxuICAgICAqIEBwYXJhbSB7aW50fSBjb2wgVGhlIGNvbHVtbiBudW1iZXIuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJ1bGUgVGhlIHJ1bGUgdGhpcyBtZXNzYWdlIHJlbGF0ZXMgdG8uXG4gICAgICogQG1ldGhvZCBlcnJvclxuICAgICAqL1xuICAgIGVycm9yOiBmdW5jdGlvbihtZXNzYWdlLCBsaW5lLCBjb2wsIHJ1bGUpe1xuICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgdHlwZSAgICA6IFwiZXJyb3JcIixcbiAgICAgICAgICAgIGxpbmUgICAgOiBsaW5lLFxuICAgICAgICAgICAgY29sICAgICA6IGNvbCxcbiAgICAgICAgICAgIG1lc3NhZ2UgOiBtZXNzYWdlLFxuICAgICAgICAgICAgZXZpZGVuY2U6IHRoaXMubGluZXNbbGluZS0xXSxcbiAgICAgICAgICAgIHJ1bGUgICAgOiBydWxlIHx8IHt9XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXBvcnQgYW4gd2FybmluZy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgbWVzc2FnZSB0byBzdG9yZS5cbiAgICAgKiBAcGFyYW0ge2ludH0gbGluZSBUaGUgbGluZSBudW1iZXIuXG4gICAgICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG51bWJlci5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZSBUaGUgcnVsZSB0aGlzIG1lc3NhZ2UgcmVsYXRlcyB0by5cbiAgICAgKiBAbWV0aG9kIHdhcm5cbiAgICAgKiBAZGVwcmVjYXRlZCBVc2UgcmVwb3J0IGluc3RlYWQuXG4gICAgICovXG4gICAgd2FybjogZnVuY3Rpb24obWVzc2FnZSwgbGluZSwgY29sLCBydWxlKXtcbiAgICAgICAgdGhpcy5yZXBvcnQobWVzc2FnZSwgbGluZSwgY29sLCBydWxlKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVwb3J0IGFuIGlzc3VlLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBtZXNzYWdlIFRoZSBtZXNzYWdlIHRvIHN0b3JlLlxuICAgICAqIEBwYXJhbSB7aW50fSBsaW5lIFRoZSBsaW5lIG51bWJlci5cbiAgICAgKiBAcGFyYW0ge2ludH0gY29sIFRoZSBjb2x1bW4gbnVtYmVyLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBydWxlIFRoZSBydWxlIHRoaXMgbWVzc2FnZSByZWxhdGVzIHRvLlxuICAgICAqIEBtZXRob2QgcmVwb3J0XG4gICAgICovXG4gICAgcmVwb3J0OiBmdW5jdGlvbihtZXNzYWdlLCBsaW5lLCBjb2wsIHJ1bGUpe1xuICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgdHlwZSAgICA6IHRoaXMucnVsZXNldFtydWxlLmlkXSA9PT0gMiA/IFwiZXJyb3JcIiA6IFwid2FybmluZ1wiLFxuICAgICAgICAgICAgbGluZSAgICA6IGxpbmUsXG4gICAgICAgICAgICBjb2wgICAgIDogY29sLFxuICAgICAgICAgICAgbWVzc2FnZSA6IG1lc3NhZ2UsXG4gICAgICAgICAgICBldmlkZW5jZTogdGhpcy5saW5lc1tsaW5lLTFdLFxuICAgICAgICAgICAgcnVsZSAgICA6IHJ1bGVcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlcG9ydCBzb21lIGluZm9ybWF0aW9uYWwgdGV4dC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgbWVzc2FnZSB0byBzdG9yZS5cbiAgICAgKiBAcGFyYW0ge2ludH0gbGluZSBUaGUgbGluZSBudW1iZXIuXG4gICAgICogQHBhcmFtIHtpbnR9IGNvbCBUaGUgY29sdW1uIG51bWJlci5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZSBUaGUgcnVsZSB0aGlzIG1lc3NhZ2UgcmVsYXRlcyB0by5cbiAgICAgKiBAbWV0aG9kIGluZm9cbiAgICAgKi9cbiAgICBpbmZvOiBmdW5jdGlvbihtZXNzYWdlLCBsaW5lLCBjb2wsIHJ1bGUpe1xuICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgdHlwZSAgICA6IFwiaW5mb1wiLFxuICAgICAgICAgICAgbGluZSAgICA6IGxpbmUsXG4gICAgICAgICAgICBjb2wgICAgIDogY29sLFxuICAgICAgICAgICAgbWVzc2FnZSA6IG1lc3NhZ2UsXG4gICAgICAgICAgICBldmlkZW5jZTogdGhpcy5saW5lc1tsaW5lLTFdLFxuICAgICAgICAgICAgcnVsZSAgICA6IHJ1bGVcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlcG9ydCBzb21lIHJvbGx1cCBlcnJvciBpbmZvcm1hdGlvbi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgbWVzc2FnZSB0byBzdG9yZS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZSBUaGUgcnVsZSB0aGlzIG1lc3NhZ2UgcmVsYXRlcyB0by5cbiAgICAgKiBAbWV0aG9kIHJvbGx1cEVycm9yXG4gICAgICovXG4gICAgcm9sbHVwRXJyb3I6IGZ1bmN0aW9uKG1lc3NhZ2UsIHJ1bGUpe1xuICAgICAgICB0aGlzLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgdHlwZSAgICA6IFwiZXJyb3JcIixcbiAgICAgICAgICAgIHJvbGx1cCAgOiB0cnVlLFxuICAgICAgICAgICAgbWVzc2FnZSA6IG1lc3NhZ2UsXG4gICAgICAgICAgICBydWxlICAgIDogcnVsZVxuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVwb3J0IHNvbWUgcm9sbHVwIHdhcm5pbmcgaW5mb3JtYXRpb24uXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgVGhlIG1lc3NhZ2UgdG8gc3RvcmUuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHJ1bGUgVGhlIHJ1bGUgdGhpcyBtZXNzYWdlIHJlbGF0ZXMgdG8uXG4gICAgICogQG1ldGhvZCByb2xsdXBXYXJuXG4gICAgICovXG4gICAgcm9sbHVwV2FybjogZnVuY3Rpb24obWVzc2FnZSwgcnVsZSl7XG4gICAgICAgIHRoaXMubWVzc2FnZXMucHVzaCh7XG4gICAgICAgICAgICB0eXBlICAgIDogXCJ3YXJuaW5nXCIsXG4gICAgICAgICAgICByb2xsdXAgIDogdHJ1ZSxcbiAgICAgICAgICAgIG1lc3NhZ2UgOiBtZXNzYWdlLFxuICAgICAgICAgICAgcnVsZSAgICA6IHJ1bGVcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlcG9ydCBhIHN0YXRpc3RpYy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBUaGUgbmFtZSBvZiB0aGUgc3RhdCB0byBzdG9yZS5cbiAgICAgKiBAcGFyYW0ge1ZhcmlhbnR9IHZhbHVlIFRoZSB2YWx1ZSBvZiB0aGUgc3RhdC5cbiAgICAgKiBAbWV0aG9kIHN0YXRcbiAgICAgKi9cbiAgICBzdGF0OiBmdW5jdGlvbihuYW1lLCB2YWx1ZSl7XG4gICAgICAgIHRoaXMuc3RhdHNbbmFtZV0gPSB2YWx1ZTtcbiAgICB9XG59O1xuXG4vL2V4cG9zZSBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuQ1NTTGludC5fUmVwb3J0ZXIgPSBSZXBvcnRlcjtcblxuLypcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgbWFrZSBsaWZlIGVhc2llci5cbiAqL1xuQ1NTTGludC5VdGlsID0ge1xuICAgIC8qXG4gICAgICogQWRkcyBhbGwgcHJvcGVydGllcyBmcm9tIHN1cHBsaWVyIG9udG8gcmVjZWl2ZXIsXG4gICAgICogb3ZlcndyaXRpbmcgaWYgdGhlIHNhbWUgbmFtZSBhbHJlYWR5IGV4aXN0cyBvblxuICAgICAqIHJlY2lldmVyLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBUaGUgb2JqZWN0IHRvIHJlY2VpdmUgdGhlIHByb3BlcnRpZXMuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFRoZSBvYmplY3QgdG8gcHJvdmlkZSB0aGUgcHJvcGVydGllcy5cbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSByZWNlaXZlclxuICAgICAqL1xuICAgIG1peDogZnVuY3Rpb24ocmVjZWl2ZXIsIHN1cHBsaWVyKXtcbiAgICAgICAgdmFyIHByb3A7XG5cbiAgICAgICAgZm9yIChwcm9wIGluIHN1cHBsaWVyKXtcbiAgICAgICAgICAgIGlmIChzdXBwbGllci5oYXNPd25Qcm9wZXJ0eShwcm9wKSl7XG4gICAgICAgICAgICAgICAgcmVjZWl2ZXJbcHJvcF0gPSBzdXBwbGllcltwcm9wXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcm9wO1xuICAgIH0sXG5cbiAgICAvKlxuICAgICAqIFBvbHlmaWxsIGZvciBhcnJheSBpbmRleE9mKCkgbWV0aG9kLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlcyBUaGUgYXJyYXkgdG8gc2VhcmNoLlxuICAgICAqIEBwYXJhbSB7VmFyaWFudH0gdmFsdWUgVGhlIHZhbHVlIHRvIHNlYXJjaCBmb3IuXG4gICAgICogQHJldHVybiB7aW50fSBUaGUgaW5kZXggb2YgdGhlIHZhbHVlIGlmIGZvdW5kLCAtMSBpZiBub3QuXG4gICAgICovXG4gICAgaW5kZXhPZjogZnVuY3Rpb24odmFsdWVzLCB2YWx1ZSl7XG4gICAgICAgIGlmICh2YWx1ZXMuaW5kZXhPZil7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVzLmluZGV4T2YodmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yICh2YXIgaT0wLCBsZW49dmFsdWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKXtcbiAgICAgICAgICAgICAgICBpZiAodmFsdWVzW2ldID09PSB2YWx1ZSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKlxuICAgICAqIFBvbHlmaWxsIGZvciBhcnJheSBmb3JFYWNoKCkgbWV0aG9kLlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IHZhbHVlcyBUaGUgYXJyYXkgdG8gb3BlcmF0ZSBvbi5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byBjYWxsIG9uIGVhY2ggaXRlbS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGZvckVhY2g6IGZ1bmN0aW9uKHZhbHVlcywgZnVuYykge1xuICAgICAgICBpZiAodmFsdWVzLmZvckVhY2gpe1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlcy5mb3JFYWNoKGZ1bmMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yICh2YXIgaT0wLCBsZW49dmFsdWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKXtcbiAgICAgICAgICAgICAgICBmdW5jKHZhbHVlc1tpXSwgaSwgdmFsdWVzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8qXG4gKiBSdWxlOiBEb24ndCB1c2UgYWRqb2luaW5nIGNsYXNzZXMgKC5mb28uYmFyKS5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiYWRqb2luaW5nLWNsYXNzZXNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IGFkam9pbmluZyBjbGFzc2VzXCIsXG4gICAgZGVzYzogXCJEb24ndCB1c2UgYWRqb2luaW5nIGNsYXNzZXMuXCIsXG4gICAgYnJvd3NlcnM6IFwiSUU2XCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBzZWxlY3RvcnMgPSBldmVudC5zZWxlY3RvcnMsXG4gICAgICAgICAgICAgICAgc2VsZWN0b3IsXG4gICAgICAgICAgICAgICAgcGFydCxcbiAgICAgICAgICAgICAgICBtb2RpZmllcixcbiAgICAgICAgICAgICAgICBjbGFzc0NvdW50LFxuICAgICAgICAgICAgICAgIGksIGosIGs7XG5cbiAgICAgICAgICAgIGZvciAoaT0wOyBpIDwgc2VsZWN0b3JzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgICAgICAgICBzZWxlY3RvciA9IHNlbGVjdG9yc1tpXTtcbiAgICAgICAgICAgICAgICBmb3IgKGo9MDsgaiA8IHNlbGVjdG9yLnBhcnRzLmxlbmd0aDsgaisrKXtcbiAgICAgICAgICAgICAgICAgICAgcGFydCA9IHNlbGVjdG9yLnBhcnRzW2pdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFydC50eXBlID09PSBwYXJzZXIuU0VMRUNUT1JfUEFSVF9UWVBFKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzQ291bnQgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChrPTA7IGsgPCBwYXJ0Lm1vZGlmaWVycy5sZW5ndGg7IGsrKyl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZXIgPSBwYXJ0Lm1vZGlmaWVyc1trXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW9kaWZpZXIudHlwZSA9PT0gXCJjbGFzc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NDb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xhc3NDb3VudCA+IDEpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJEb24ndCB1c2UgYWRqb2luaW5nIGNsYXNzZXMuXCIsIHBhcnQubGluZSwgcGFydC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IERvbid0IHVzZSB3aWR0aCBvciBoZWlnaHQgd2hlbiB1c2luZyBwYWRkaW5nIG9yIGJvcmRlci5cbiAqL1xuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImJveC1tb2RlbFwiLFxuICAgIG5hbWU6IFwiQmV3YXJlIG9mIGJyb2tlbiBib3ggc2l6ZVwiLFxuICAgIGRlc2M6IFwiRG9uJ3QgdXNlIHdpZHRoIG9yIGhlaWdodCB3aGVuIHVzaW5nIHBhZGRpbmcgb3IgYm9yZGVyLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICB3aWR0aFByb3BlcnRpZXMgPSB7XG4gICAgICAgICAgICAgICAgYm9yZGVyOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLWxlZnRcIjogMSxcbiAgICAgICAgICAgICAgICBcImJvcmRlci1yaWdodFwiOiAxLFxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDEsXG4gICAgICAgICAgICAgICAgXCJwYWRkaW5nLWxlZnRcIjogMSxcbiAgICAgICAgICAgICAgICBcInBhZGRpbmctcmlnaHRcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGhlaWdodFByb3BlcnRpZXMgPSB7XG4gICAgICAgICAgICAgICAgYm9yZGVyOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLWJvdHRvbVwiOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcFwiOiAxLFxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDEsXG4gICAgICAgICAgICAgICAgXCJwYWRkaW5nLWJvdHRvbVwiOiAxLFxuICAgICAgICAgICAgICAgIFwicGFkZGluZy10b3BcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb3BlcnRpZXMsXG4gICAgICAgICAgICBib3hTaXppbmcgPSBmYWxzZTtcblxuICAgICAgICBmdW5jdGlvbiBzdGFydFJ1bGUoKXtcbiAgICAgICAgICAgIHByb3BlcnRpZXMgPSB7fTtcbiAgICAgICAgICAgIGJveFNpemluZyA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZW5kUnVsZSgpe1xuICAgICAgICAgICAgdmFyIHByb3AsIHZhbHVlO1xuXG4gICAgICAgICAgICBpZiAoIWJveFNpemluZykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0aWVzLmhlaWdodCl7XG4gICAgICAgICAgICAgICAgICAgIGZvciAocHJvcCBpbiBoZWlnaHRQcm9wZXJ0aWVzKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChoZWlnaHRQcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHByb3ApICYmIHByb3BlcnRpZXNbcHJvcF0pe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlID0gcHJvcGVydGllc1twcm9wXS52YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3NwZWNpYWwgY2FzZSBmb3IgcGFkZGluZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghKHByb3AgPT09IFwicGFkZGluZ1wiICYmIHZhbHVlLnBhcnRzLmxlbmd0aCA9PT0gMiAmJiB2YWx1ZS5wYXJ0c1swXS52YWx1ZSA9PT0gMCkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJVc2luZyBoZWlnaHQgd2l0aCBcIiArIHByb3AgKyBcIiBjYW4gc29tZXRpbWVzIG1ha2UgZWxlbWVudHMgbGFyZ2VyIHRoYW4geW91IGV4cGVjdC5cIiwgcHJvcGVydGllc1twcm9wXS5saW5lLCBwcm9wZXJ0aWVzW3Byb3BdLmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnRpZXMud2lkdGgpe1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHByb3AgaW4gd2lkdGhQcm9wZXJ0aWVzKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3aWR0aFByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkocHJvcCkgJiYgcHJvcGVydGllc1twcm9wXSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSBwcm9wZXJ0aWVzW3Byb3BdLnZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEocHJvcCA9PT0gXCJwYWRkaW5nXCIgJiYgdmFsdWUucGFydHMubGVuZ3RoID09PSAyICYmIHZhbHVlLnBhcnRzWzFdLnZhbHVlID09PSAwKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIlVzaW5nIHdpZHRoIHdpdGggXCIgKyBwcm9wICsgXCIgY2FuIHNvbWV0aW1lcyBtYWtlIGVsZW1lbnRzIGxhcmdlciB0aGFuIHlvdSBleHBlY3QuXCIsIHByb3BlcnRpZXNbcHJvcF0ubGluZSwgcHJvcGVydGllc1twcm9wXS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cGFnZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHBhZ2VtYXJnaW5cIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRrZXlmcmFtZXJ1bGVcIiwgc3RhcnRSdWxlKTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGV2ZW50LnByb3BlcnR5LnRleHQudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgaWYgKGhlaWdodFByb3BlcnRpZXNbbmFtZV0gfHwgd2lkdGhQcm9wZXJ0aWVzW25hbWVdKXtcbiAgICAgICAgICAgICAgICBpZiAoIS9eMFxcUyokLy50ZXN0KGV2ZW50LnZhbHVlKSAmJiAhKG5hbWUgPT09IFwiYm9yZGVyXCIgJiYgZXZlbnQudmFsdWUudG9TdHJpbmcoKSA9PT0gXCJub25lXCIpKXtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllc1tuYW1lXSA9IHsgbGluZTogZXZlbnQucHJvcGVydHkubGluZSwgY29sOiBldmVudC5wcm9wZXJ0eS5jb2wsIHZhbHVlOiBldmVudC52YWx1ZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKC9eKHdpZHRofGhlaWdodCkvaS50ZXN0KG5hbWUpICYmIC9eKGxlbmd0aHxwZXJjZW50YWdlKS8udGVzdChldmVudC52YWx1ZS5wYXJ0c1swXS50eXBlKSl7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXNbbmFtZV0gPSAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gXCJib3gtc2l6aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgYm94U2l6aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcnVsZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kZm9udGZhY2VcIiwgZW5kUnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHBhZ2VcIiwgZW5kUnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHBhZ2VtYXJnaW5cIiwgZW5kUnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZGtleWZyYW1lcnVsZVwiLCBlbmRSdWxlKTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogYm94LXNpemluZyBkb2Vzbid0IHdvcmsgaW4gSUU2IGFuZCBJRTcuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImJveC1zaXppbmdcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IHVzZSBvZiBib3gtc2l6aW5nXCIsXG4gICAgZGVzYzogXCJUaGUgYm94LXNpemluZyBwcm9wZXJ0aWVzIGlzbid0IHN1cHBvcnRlZCBpbiBJRTYgYW5kIElFNy5cIixcbiAgICBicm93c2VyczogXCJJRTYsIElFN1wiLFxuICAgIHRhZ3M6IFtcIkNvbXBhdGliaWxpdHlcIl0sXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGV2ZW50LnByb3BlcnR5LnRleHQudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgaWYgKG5hbWUgPT09IFwiYm94LXNpemluZ1wiKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJUaGUgYm94LXNpemluZyBwcm9wZXJ0eSBpc24ndCBzdXBwb3J0ZWQgaW4gSUU2IGFuZCBJRTcuXCIsIGV2ZW50LmxpbmUsIGV2ZW50LmNvbCwgcnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBVc2UgdGhlIGJ1bGxldHByb29mIEBmb250LWZhY2Ugc3ludGF4IHRvIGF2b2lkIDQwNCdzIGluIG9sZCBJRVxuICogKGh0dHA6Ly93d3cuZm9udHNwcmluZy5jb20vYmxvZy90aGUtbmV3LWJ1bGxldHByb29mLWZvbnQtZmFjZS1zeW50YXgpXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImJ1bGxldHByb29mLWZvbnQtZmFjZVwiLFxuICAgIG5hbWU6IFwiVXNlIHRoZSBidWxsZXRwcm9vZiBAZm9udC1mYWNlIHN5bnRheFwiLFxuICAgIGRlc2M6IFwiVXNlIHRoZSBidWxsZXRwcm9vZiBAZm9udC1mYWNlIHN5bnRheCB0byBhdm9pZCA0MDQncyBpbiBvbGQgSUUgKGh0dHA6Ly93d3cuZm9udHNwcmluZy5jb20vYmxvZy90aGUtbmV3LWJ1bGxldHByb29mLWZvbnQtZmFjZS1zeW50YXgpLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBmb250RmFjZVJ1bGUgPSBmYWxzZSxcbiAgICAgICAgICAgIGZpcnN0U3JjICAgICA9IHRydWUsXG4gICAgICAgICAgICBydWxlRmFpbGVkICAgID0gZmFsc2UsXG4gICAgICAgICAgICBsaW5lLCBjb2w7XG5cbiAgICAgICAgLy8gTWFyayB0aGUgc3RhcnQgb2YgYSBAZm9udC1mYWNlIGRlY2xhcmF0aW9uIHNvIHdlIG9ubHkgdGVzdCBwcm9wZXJ0aWVzIGluc2lkZSBpdFxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBmb250RmFjZVJ1bGUgPSB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICAvLyBJZiB3ZSBhcmVuJ3QgaW5zaWRlIGFuIEBmb250LWZhY2UgZGVjbGFyYXRpb24gdGhlbiBqdXN0IHJldHVyblxuICAgICAgICAgICAgaWYgKCFmb250RmFjZVJ1bGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eU5hbWUgPSBldmVudC5wcm9wZXJ0eS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgICAgdmFsdWUgICAgICAgID0gZXZlbnQudmFsdWUudG9TdHJpbmcoKTtcblxuICAgICAgICAgICAgLy8gU2V0IHRoZSBsaW5lIGFuZCBjb2wgbnVtYmVycyBmb3IgdXNlIGluIHRoZSBlbmRmb250ZmFjZSBsaXN0ZW5lclxuICAgICAgICAgICAgbGluZSA9IGV2ZW50LmxpbmU7XG4gICAgICAgICAgICBjb2wgID0gZXZlbnQuY29sO1xuXG4gICAgICAgICAgICAvLyBUaGlzIGlzIHRoZSBwcm9wZXJ0eSB0aGF0IHdlIGNhcmUgYWJvdXQsIHdlIGNhbiBpZ25vcmUgdGhlIHJlc3RcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eU5hbWUgPT09IFwic3JjXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVnZXggPSAvXlxccz91cmxcXChbJ1wiXS4rXFwuZW90XFw/LipbJ1wiXVxcKVxccypmb3JtYXRcXChbJ1wiXWVtYmVkZGVkLW9wZW50eXBlWydcIl1cXCkuKiQvaTtcblxuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gaGFuZGxlIHRoZSBhZHZhbmNlZCBzeW50YXggd2l0aCB0d28gc3JjIHByb3BlcnRpZXNcbiAgICAgICAgICAgICAgICBpZiAoIXZhbHVlLm1hdGNoKHJlZ2V4KSAmJiBmaXJzdFNyYykge1xuICAgICAgICAgICAgICAgICAgICBydWxlRmFpbGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RTcmMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHZhbHVlLm1hdGNoKHJlZ2V4KSAmJiAhZmlyc3RTcmMpIHtcbiAgICAgICAgICAgICAgICAgICAgcnVsZUZhaWxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEJhY2sgdG8gbm9ybWFsIHJ1bGVzIHRoYXQgd2UgZG9uJ3QgbmVlZCB0byB0ZXN0XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZGZvbnRmYWNlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBmb250RmFjZVJ1bGUgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHJ1bGVGYWlsZWQpIHtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJAZm9udC1mYWNlIGRlY2xhcmF0aW9uIGRvZXNuJ3QgZm9sbG93IHRoZSBmb250c3ByaW5nIGJ1bGxldHByb29mIHN5bnRheC5cIiwgbGluZSwgY29sLCBydWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG5cbi8qXG4gKiBSdWxlOiBJbmNsdWRlIGFsbCBjb21wYXRpYmxlIHZlbmRvciBwcmVmaXhlcyB0byByZWFjaCBhIHdpZGVyXG4gKiByYW5nZSBvZiB1c2Vycy5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiY29tcGF0aWJsZS12ZW5kb3ItcHJlZml4ZXNcIixcbiAgICBuYW1lOiBcIlJlcXVpcmUgY29tcGF0aWJsZSB2ZW5kb3IgcHJlZml4ZXNcIixcbiAgICBkZXNjOiBcIkluY2x1ZGUgYWxsIGNvbXBhdGlibGUgdmVuZG9yIHByZWZpeGVzIHRvIHJlYWNoIGEgd2lkZXIgcmFuZ2Ugb2YgdXNlcnMuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24gKHBhcnNlciwgcmVwb3J0ZXIpIHtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzLFxuICAgICAgICAgICAgY29tcGF0aWJsZVByZWZpeGVzLFxuICAgICAgICAgICAgcHJvcGVydGllcyxcbiAgICAgICAgICAgIHByb3AsXG4gICAgICAgICAgICB2YXJpYXRpb25zLFxuICAgICAgICAgICAgcHJlZml4ZWQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgbGVuLFxuICAgICAgICAgICAgaW5LZXlGcmFtZSA9IGZhbHNlLFxuICAgICAgICAgICAgYXJyYXlQdXNoID0gQXJyYXkucHJvdG90eXBlLnB1c2gsXG4gICAgICAgICAgICBhcHBseVRvID0gW107XG5cbiAgICAgICAgLy8gU2VlIGh0dHA6Ly9wZXRlci5zaC9leHBlcmltZW50cy92ZW5kb3ItcHJlZml4ZWQtY3NzLXByb3BlcnR5LW92ZXJ2aWV3LyBmb3IgZGV0YWlsc1xuICAgICAgICBjb21wYXRpYmxlUHJlZml4ZXMgPSB7XG4gICAgICAgICAgICBcImFuaW1hdGlvblwiICAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYW5pbWF0aW9uLWRlbGF5XCIgICAgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJhbmltYXRpb24tZGlyZWN0aW9uXCIgICAgICAgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcImFuaW1hdGlvbi1kdXJhdGlvblwiICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYW5pbWF0aW9uLWZpbGwtbW9kZVwiICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJhbmltYXRpb24taXRlcmF0aW9uLWNvdW50XCIgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcImFuaW1hdGlvbi1uYW1lXCIgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYW5pbWF0aW9uLXBsYXktc3RhdGVcIiAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJhbmltYXRpb24tdGltaW5nLWZ1bmN0aW9uXCIgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcImFwcGVhcmFuY2VcIiAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYm9yZGVyLWVuZFwiICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJib3JkZXItZW5kLWNvbG9yXCIgICAgICAgICAgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcImJvcmRlci1lbmQtc3R5bGVcIiAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYm9yZGVyLWVuZC13aWR0aFwiICAgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJib3JkZXItaW1hZ2VcIiAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG9cIixcbiAgICAgICAgICAgIFwiYm9yZGVyLXJhZGl1c1wiICAgICAgICAgICAgICA6IFwid2Via2l0XCIsXG4gICAgICAgICAgICBcImJvcmRlci1zdGFydFwiICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYm9yZGVyLXN0YXJ0LWNvbG9yXCIgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJib3JkZXItc3RhcnQtc3R5bGVcIiAgICAgICAgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcImJvcmRlci1zdGFydC13aWR0aFwiICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYm94LWFsaWduXCIgICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1veiBtc1wiLFxuICAgICAgICAgICAgXCJib3gtZGlyZWN0aW9uXCIgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG1zXCIsXG4gICAgICAgICAgICBcImJveC1mbGV4XCIgICAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3ogbXNcIixcbiAgICAgICAgICAgIFwiYm94LWxpbmVzXCIgICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1zXCIsXG4gICAgICAgICAgICBcImJveC1vcmRpbmFsLWdyb3VwXCIgICAgICAgICAgOiBcIndlYmtpdCBtb3ogbXNcIixcbiAgICAgICAgICAgIFwiYm94LW9yaWVudFwiICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1veiBtc1wiLFxuICAgICAgICAgICAgXCJib3gtcGFja1wiICAgICAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG1zXCIsXG4gICAgICAgICAgICBcImJveC1zaXppbmdcIiAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwiYm94LXNoYWRvd1wiICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJjb2x1bW4tY291bnRcIiAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG1zXCIsXG4gICAgICAgICAgICBcImNvbHVtbi1nYXBcIiAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3ogbXNcIixcbiAgICAgICAgICAgIFwiY29sdW1uLXJ1bGVcIiAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1veiBtc1wiLFxuICAgICAgICAgICAgXCJjb2x1bW4tcnVsZS1jb2xvclwiICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG1zXCIsXG4gICAgICAgICAgICBcImNvbHVtbi1ydWxlLXN0eWxlXCIgICAgICAgICAgOiBcIndlYmtpdCBtb3ogbXNcIixcbiAgICAgICAgICAgIFwiY29sdW1uLXJ1bGUtd2lkdGhcIiAgICAgICAgICA6IFwid2Via2l0IG1veiBtc1wiLFxuICAgICAgICAgICAgXCJjb2x1bW4td2lkdGhcIiAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG1zXCIsXG4gICAgICAgICAgICBcImh5cGhlbnNcIiAgICAgICAgICAgICAgICAgICAgOiBcImVwdWIgbW96XCIsXG4gICAgICAgICAgICBcImxpbmUtYnJlYWtcIiAgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtc1wiLFxuICAgICAgICAgICAgXCJtYXJnaW4tZW5kXCIgICAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96XCIsXG4gICAgICAgICAgICBcIm1hcmdpbi1zdGFydFwiICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwibWFycXVlZS1zcGVlZFwiICAgICAgICAgICAgICA6IFwid2Via2l0IHdhcFwiLFxuICAgICAgICAgICAgXCJtYXJxdWVlLXN0eWxlXCIgICAgICAgICAgICAgIDogXCJ3ZWJraXQgd2FwXCIsXG4gICAgICAgICAgICBcInBhZGRpbmctZW5kXCIgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwicGFkZGluZy1zdGFydFwiICAgICAgICAgICAgICA6IFwid2Via2l0IG1velwiLFxuICAgICAgICAgICAgXCJ0YWItc2l6ZVwiICAgICAgICAgICAgICAgICAgIDogXCJtb3ogb1wiLFxuICAgICAgICAgICAgXCJ0ZXh0LXNpemUtYWRqdXN0XCIgICAgICAgICAgIDogXCJ3ZWJraXQgbXNcIixcbiAgICAgICAgICAgIFwidHJhbnNmb3JtXCIgICAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1veiBtcyBvXCIsXG4gICAgICAgICAgICBcInRyYW5zZm9ybS1vcmlnaW5cIiAgICAgICAgICAgOiBcIndlYmtpdCBtb3ogbXMgb1wiLFxuICAgICAgICAgICAgXCJ0cmFuc2l0aW9uXCIgICAgICAgICAgICAgICAgIDogXCJ3ZWJraXQgbW96IG9cIixcbiAgICAgICAgICAgIFwidHJhbnNpdGlvbi1kZWxheVwiICAgICAgICAgICA6IFwid2Via2l0IG1veiBvXCIsXG4gICAgICAgICAgICBcInRyYW5zaXRpb24tZHVyYXRpb25cIiAgICAgICAgOiBcIndlYmtpdCBtb3ogb1wiLFxuICAgICAgICAgICAgXCJ0cmFuc2l0aW9uLXByb3BlcnR5XCIgICAgICAgIDogXCJ3ZWJraXQgbW96IG9cIixcbiAgICAgICAgICAgIFwidHJhbnNpdGlvbi10aW1pbmctZnVuY3Rpb25cIiA6IFwid2Via2l0IG1veiBvXCIsXG4gICAgICAgICAgICBcInVzZXItbW9kaWZ5XCIgICAgICAgICAgICAgICAgOiBcIndlYmtpdCBtb3pcIixcbiAgICAgICAgICAgIFwidXNlci1zZWxlY3RcIiAgICAgICAgICAgICAgICA6IFwid2Via2l0IG1veiBtc1wiLFxuICAgICAgICAgICAgXCJ3b3JkLWJyZWFrXCIgICAgICAgICAgICAgICAgIDogXCJlcHViIG1zXCIsXG4gICAgICAgICAgICBcIndyaXRpbmctbW9kZVwiICAgICAgICAgICAgICAgOiBcImVwdWIgbXNcIlxuICAgICAgICB9O1xuXG5cbiAgICAgICAgZm9yIChwcm9wIGluIGNvbXBhdGlibGVQcmVmaXhlcykge1xuICAgICAgICAgICAgaWYgKGNvbXBhdGlibGVQcmVmaXhlcy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgICAgICAgICAgIHZhcmlhdGlvbnMgPSBbXTtcbiAgICAgICAgICAgICAgICBwcmVmaXhlZCA9IGNvbXBhdGlibGVQcmVmaXhlc1twcm9wXS5zcGxpdChcIiBcIik7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gcHJlZml4ZWQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyaWF0aW9ucy5wdXNoKFwiLVwiICsgcHJlZml4ZWRbaV0gKyBcIi1cIiArIHByb3ApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21wYXRpYmxlUHJlZml4ZXNbcHJvcF0gPSB2YXJpYXRpb25zO1xuICAgICAgICAgICAgICAgIGFycmF5UHVzaC5hcHBseShhcHBseVRvLCB2YXJpYXRpb25zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzID0gW107XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0a2V5ZnJhbWVzXCIsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaW5LZXlGcmFtZSA9IGV2ZW50LnByZWZpeCB8fCB0cnVlO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRrZXlmcmFtZXNcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaW5LZXlGcmFtZSA9IGZhbHNlO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBuYW1lID0gZXZlbnQucHJvcGVydHk7XG4gICAgICAgICAgICBpZiAoQ1NTTGludC5VdGlsLmluZGV4T2YoYXBwbHlUbywgbmFtZS50ZXh0KSA+IC0xKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBlLmcuLCAtbW96LXRyYW5zZm9ybSBpcyBva2F5IHRvIGJlIGFsb25lIGluIEAtbW96LWtleWZyYW1lc1xuICAgICAgICAgICAgICAgIGlmICghaW5LZXlGcmFtZSB8fCB0eXBlb2YgaW5LZXlGcmFtZSAhPT0gXCJzdHJpbmdcIiB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZS50ZXh0LmluZGV4T2YoXCItXCIgKyBpbktleUZyYW1lICsgXCItXCIpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHJ1bGVcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCFwcm9wZXJ0aWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHByb3BlcnR5R3JvdXBzID0ge30sXG4gICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICBsZW4sXG4gICAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgICBwcm9wLFxuICAgICAgICAgICAgICAgIHZhcmlhdGlvbnMsXG4gICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgZnVsbCxcbiAgICAgICAgICAgICAgICBhY3R1YWwsXG4gICAgICAgICAgICAgICAgaXRlbSxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzU3BlY2lmaWVkO1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBwcm9wZXJ0aWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgbmFtZSA9IHByb3BlcnRpZXNbaV07XG5cbiAgICAgICAgICAgICAgICBmb3IgKHByb3AgaW4gY29tcGF0aWJsZVByZWZpeGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wYXRpYmxlUHJlZml4ZXMuaGFzT3duUHJvcGVydHkocHJvcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhcmlhdGlvbnMgPSBjb21wYXRpYmxlUHJlZml4ZXNbcHJvcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTTGludC5VdGlsLmluZGV4T2YodmFyaWF0aW9ucywgbmFtZS50ZXh0KSA+IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9wZXJ0eUdyb3Vwc1twcm9wXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eUdyb3Vwc1twcm9wXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bGwgOiB2YXJpYXRpb25zLnNsaWNlKDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWxOb2RlczogW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKENTU0xpbnQuVXRpbC5pbmRleE9mKHByb3BlcnR5R3JvdXBzW3Byb3BdLmFjdHVhbCwgbmFtZS50ZXh0KSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlHcm91cHNbcHJvcF0uYWN0dWFsLnB1c2gobmFtZS50ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlHcm91cHNbcHJvcF0uYWN0dWFsTm9kZXMucHVzaChuYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAocHJvcCBpbiBwcm9wZXJ0eUdyb3Vwcykge1xuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUdyb3Vwcy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IHByb3BlcnR5R3JvdXBzW3Byb3BdO1xuICAgICAgICAgICAgICAgICAgICBmdWxsID0gdmFsdWUuZnVsbDtcbiAgICAgICAgICAgICAgICAgICAgYWN0dWFsID0gdmFsdWUuYWN0dWFsO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmdWxsLmxlbmd0aCA+IGFjdHVhbC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGZ1bGwubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtID0gZnVsbFtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTTGludC5VdGlsLmluZGV4T2YoYWN0dWFsLCBpdGVtKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllc1NwZWNpZmllZCA9IChhY3R1YWwubGVuZ3RoID09PSAxKSA/IGFjdHVhbFswXSA6IChhY3R1YWwubGVuZ3RoID09PSAyKSA/IGFjdHVhbC5qb2luKFwiIGFuZCBcIikgOiBhY3R1YWwuam9pbihcIiwgXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJUaGUgcHJvcGVydHkgXCIgKyBpdGVtICsgXCIgaXMgY29tcGF0aWJsZSB3aXRoIFwiICsgcHJvcGVydGllc1NwZWNpZmllZCArIFwiIGFuZCBzaG91bGQgYmUgaW5jbHVkZWQgYXMgd2VsbC5cIiwgdmFsdWUuYWN0dWFsTm9kZXNbMF0ubGluZSwgdmFsdWUuYWN0dWFsTm9kZXNbMF0uY29sLCBydWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufSk7XG5cbi8qXG4gKiBSdWxlOiBDZXJ0YWluIHByb3BlcnRpZXMgZG9uJ3QgcGxheSB3ZWxsIHdpdGggY2VydGFpbiBkaXNwbGF5IHZhbHVlcy5cbiAqIC0gZmxvYXQgc2hvdWxkIG5vdCBiZSB1c2VkIHdpdGggaW5saW5lLWJsb2NrXG4gKiAtIGhlaWdodCwgd2lkdGgsIG1hcmdpbi10b3AsIG1hcmdpbi1ib3R0b20sIGZsb2F0IHNob3VsZCBub3QgYmUgdXNlZCB3aXRoIGlubGluZVxuICogLSB2ZXJ0aWNhbC1hbGlnbiBzaG91bGQgbm90IGJlIHVzZWQgd2l0aCBibG9ja1xuICogLSBtYXJnaW4sIGZsb2F0IHNob3VsZCBub3QgYmUgdXNlZCB3aXRoIHRhYmxlLSpcbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiZGlzcGxheS1wcm9wZXJ0eS1ncm91cGluZ1wiLFxuICAgIG5hbWU6IFwiUmVxdWlyZSBwcm9wZXJ0aWVzIGFwcHJvcHJpYXRlIGZvciBkaXNwbGF5XCIsXG4gICAgZGVzYzogXCJDZXJ0YWluIHByb3BlcnRpZXMgc2hvdWxkbid0IGJlIHVzZWQgd2l0aCBjZXJ0YWluIGRpc3BsYXkgcHJvcGVydHkgdmFsdWVzLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgdmFyIHByb3BlcnRpZXNUb0NoZWNrID0ge1xuICAgICAgICAgICAgICAgIGRpc3BsYXk6IDEsXG4gICAgICAgICAgICAgICAgXCJmbG9hdFwiOiBcIm5vbmVcIixcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IDEsXG4gICAgICAgICAgICAgICAgd2lkdGg6IDEsXG4gICAgICAgICAgICAgICAgbWFyZ2luOiAxLFxuICAgICAgICAgICAgICAgIFwibWFyZ2luLWxlZnRcIjogMSxcbiAgICAgICAgICAgICAgICBcIm1hcmdpbi1yaWdodFwiOiAxLFxuICAgICAgICAgICAgICAgIFwibWFyZ2luLWJvdHRvbVwiOiAxLFxuICAgICAgICAgICAgICAgIFwibWFyZ2luLXRvcFwiOiAxLFxuICAgICAgICAgICAgICAgIHBhZGRpbmc6IDEsXG4gICAgICAgICAgICAgICAgXCJwYWRkaW5nLWxlZnRcIjogMSxcbiAgICAgICAgICAgICAgICBcInBhZGRpbmctcmlnaHRcIjogMSxcbiAgICAgICAgICAgICAgICBcInBhZGRpbmctYm90dG9tXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJwYWRkaW5nLXRvcFwiOiAxLFxuICAgICAgICAgICAgICAgIFwidmVydGljYWwtYWxpZ25cIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb3BlcnRpZXM7XG5cbiAgICAgICAgZnVuY3Rpb24gcmVwb3J0UHJvcGVydHkobmFtZSwgZGlzcGxheSwgbXNnPyl7XG4gICAgICAgICAgICBpZiAocHJvcGVydGllc1tuYW1lXSl7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBwcm9wZXJ0aWVzVG9DaGVja1tuYW1lXSAhPT0gXCJzdHJpbmdcIiB8fCBwcm9wZXJ0aWVzW25hbWVdLnZhbHVlLnRvTG93ZXJDYXNlKCkgIT09IHByb3BlcnRpZXNUb0NoZWNrW25hbWVdKXtcbiAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KG1zZyB8fCBuYW1lICsgXCIgY2FuJ3QgYmUgdXNlZCB3aXRoIGRpc3BsYXk6IFwiICsgZGlzcGxheSArIFwiLlwiLCBwcm9wZXJ0aWVzW25hbWVdLmxpbmUsIHByb3BlcnRpZXNbbmFtZV0uY29sLCBydWxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBzdGFydFJ1bGUoKXtcbiAgICAgICAgICAgIHByb3BlcnRpZXMgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGVuZFJ1bGUoKXtcblxuICAgICAgICAgICAgdmFyIGRpc3BsYXkgPSBwcm9wZXJ0aWVzLmRpc3BsYXkgPyBwcm9wZXJ0aWVzLmRpc3BsYXkudmFsdWUgOiBudWxsO1xuICAgICAgICAgICAgaWYgKGRpc3BsYXkpe1xuICAgICAgICAgICAgICAgIHN3aXRjaChkaXNwbGF5KXtcblxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiaW5saW5lXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2hlaWdodCwgd2lkdGgsIG1hcmdpbi10b3AsIG1hcmdpbi1ib3R0b20sIGZsb2F0IHNob3VsZCBub3QgYmUgdXNlZCB3aXRoIGlubGluZVxuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJoZWlnaHRcIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcIndpZHRoXCIsIGRpc3BsYXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJtYXJnaW5cIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcIm1hcmdpbi10b3BcIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcIm1hcmdpbi1ib3R0b21cIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcImZsb2F0XCIsIGRpc3BsYXksIFwiZGlzcGxheTppbmxpbmUgaGFzIG5vIGVmZmVjdCBvbiBmbG9hdGVkIGVsZW1lbnRzIChidXQgbWF5IGJlIHVzZWQgdG8gZml4IHRoZSBJRTYgZG91YmxlLW1hcmdpbiBidWcpLlwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJibG9ja1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgLy92ZXJ0aWNhbC1hbGlnbiBzaG91bGQgbm90IGJlIHVzZWQgd2l0aCBibG9ja1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJ2ZXJ0aWNhbC1hbGlnblwiLCBkaXNwbGF5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbmxpbmUtYmxvY2tcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZmxvYXQgc2hvdWxkIG5vdCBiZSB1c2VkIHdpdGggaW5saW5lLWJsb2NrXG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcImZsb2F0XCIsIGRpc3BsYXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vbWFyZ2luLCBmbG9hdCBzaG91bGQgbm90IGJlIHVzZWQgd2l0aCB0YWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRpc3BsYXkuaW5kZXhPZihcInRhYmxlLVwiKSA9PT0gMCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJtYXJnaW5cIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJtYXJnaW4tbGVmdFwiLCBkaXNwbGF5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcIm1hcmdpbi1yaWdodFwiLCBkaXNwbGF5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRQcm9wZXJ0eShcIm1hcmdpbi10b3BcIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0UHJvcGVydHkoXCJtYXJnaW4tYm90dG9tXCIsIGRpc3BsYXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydFByb3BlcnR5KFwiZmxvYXRcIiwgZGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vb3RoZXJ3aXNlIGRvIG5vdGhpbmdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0a2V5ZnJhbWVydWxlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cGFnZW1hcmdpblwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHBhZ2VcIiwgc3RhcnRSdWxlKTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGV2ZW50LnByb3BlcnR5LnRleHQudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnRpZXNUb0NoZWNrW25hbWVdKXtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW25hbWVdID0geyB2YWx1ZTogZXZlbnQudmFsdWUudGV4dCwgbGluZTogZXZlbnQucHJvcGVydHkubGluZSwgY29sOiBldmVudC5wcm9wZXJ0eS5jb2wgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcnVsZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kZm9udGZhY2VcIiwgZW5kUnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZGtleWZyYW1lcnVsZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZW1hcmdpblwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZVwiLCBlbmRSdWxlKTtcblxuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBEaXNhbGxvdyBkdXBsaWNhdGUgYmFja2dyb3VuZC1pbWFnZXMgKHVzaW5nIHVybCkuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImR1cGxpY2F0ZS1iYWNrZ3JvdW5kLWltYWdlc1wiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgZHVwbGljYXRlIGJhY2tncm91bmQgaW1hZ2VzXCIsXG4gICAgZGVzYzogXCJFdmVyeSBiYWNrZ3JvdW5kLWltYWdlIHNob3VsZCBiZSB1bmlxdWUuIFVzZSBhIGNvbW1vbiBjbGFzcyBmb3IgZS5nLiBzcHJpdGVzLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBzdGFjayA9IHt9O1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBuYW1lID0gZXZlbnQucHJvcGVydHkudGV4dCxcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGV2ZW50LnZhbHVlLFxuICAgICAgICAgICAgICAgIGksIGxlbjtcblxuICAgICAgICAgICAgaWYgKG5hbWUubWF0Y2goL2JhY2tncm91bmQvaSkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGk9MCwgbGVuPXZhbHVlLnBhcnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZS5wYXJ0c1tpXS50eXBlID09PSBcInVyaVwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHN0YWNrW3ZhbHVlLnBhcnRzW2ldLnVyaV0gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFja1t2YWx1ZS5wYXJ0c1tpXS51cmldID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJCYWNrZ3JvdW5kIGltYWdlICdcIiArIHZhbHVlLnBhcnRzW2ldLnVyaSArIFwiJyB3YXMgdXNlZCBtdWx0aXBsZSB0aW1lcywgZmlyc3QgZGVjbGFyZWQgYXQgbGluZSBcIiArIHN0YWNrW3ZhbHVlLnBhcnRzW2ldLnVyaV0ubGluZSArIFwiLCBjb2wgXCIgKyBzdGFja1t2YWx1ZS5wYXJ0c1tpXS51cmldLmNvbCArIFwiLlwiLCBldmVudC5saW5lLCBldmVudC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcblxuLypcbiAqIFJ1bGU6IER1cGxpY2F0ZSBwcm9wZXJ0aWVzIG11c3QgYXBwZWFyIG9uZSBhZnRlciB0aGUgb3RoZXIuIElmIGFuIGFscmVhZHktZGVmaW5lZFxuICogcHJvcGVydHkgYXBwZWFycyBzb21ld2hlcmUgZWxzZSBpbiB0aGUgcnVsZSwgdGhlbiBpdCdzIGxpa2VseSBhbiBlcnJvci5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiZHVwbGljYXRlLXByb3BlcnRpZXNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IGR1cGxpY2F0ZSBwcm9wZXJ0aWVzXCIsXG4gICAgZGVzYzogXCJEdXBsaWNhdGUgcHJvcGVydGllcyBtdXN0IGFwcGVhciBvbmUgYWZ0ZXIgdGhlIG90aGVyLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBwcm9wZXJ0aWVzLFxuICAgICAgICAgICAgbGFzdFByb3BlcnR5O1xuXG4gICAgICAgIGZ1bmN0aW9uIHN0YXJ0UnVsZSgpe1xuICAgICAgICAgICAgcHJvcGVydGllcyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0Zm9udGZhY2VcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRwYWdlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cGFnZW1hcmdpblwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGtleWZyYW1lcnVsZVwiLCBzdGFydFJ1bGUpO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IGV2ZW50LnByb3BlcnR5LFxuICAgICAgICAgICAgICAgIG5hbWUgPSBwcm9wZXJ0eS50ZXh0LnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0aWVzW25hbWVdICYmIChsYXN0UHJvcGVydHkgIT09IG5hbWUgfHwgcHJvcGVydGllc1tuYW1lXSA9PT0gZXZlbnQudmFsdWUudGV4dCkpe1xuICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIkR1cGxpY2F0ZSBwcm9wZXJ0eSAnXCIgKyBldmVudC5wcm9wZXJ0eSArIFwiJyBmb3VuZC5cIiwgZXZlbnQubGluZSwgZXZlbnQuY29sLCBydWxlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJvcGVydGllc1tuYW1lXSA9IGV2ZW50LnZhbHVlLnRleHQ7XG4gICAgICAgICAgICBsYXN0UHJvcGVydHkgPSBuYW1lO1xuXG4gICAgICAgIH0pO1xuXG5cbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogU3R5bGUgcnVsZXMgd2l0aG91dCBhbnkgcHJvcGVydGllcyBkZWZpbmVkIHNob3VsZCBiZSByZW1vdmVkLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJlbXB0eS1ydWxlc1wiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgZW1wdHkgcnVsZXNcIixcbiAgICBkZXNjOiBcIlJ1bGVzIHdpdGhvdXQgYW55IHByb3BlcnRpZXMgc3BlY2lmaWVkIHNob3VsZCBiZSByZW1vdmVkLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBjb3VudCA9IDA7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBjb3VudD0wO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcnVsZVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3JzID0gZXZlbnQuc2VsZWN0b3JzO1xuICAgICAgICAgICAgaWYgKGNvdW50ID09PSAwKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJSdWxlIGlzIGVtcHR5LlwiLCBzZWxlY3RvcnNbMF0ubGluZSwgc2VsZWN0b3JzWzBdLmNvbCwgcnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBUaGVyZSBzaG91bGQgYmUgbm8gc3ludGF4IGVycm9ycy4gKER1aC4pXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImVycm9yc1wiLFxuICAgIG5hbWU6IFwiUGFyc2luZyBFcnJvcnNcIixcbiAgICBkZXNjOiBcIlRoaXMgcnVsZSBsb29rcyBmb3IgcmVjb3ZlcmFibGUgc3ludGF4IGVycm9ycy5cIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVycm9yXCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHJlcG9ydGVyLmVycm9yKGV2ZW50Lm1lc3NhZ2UsIGV2ZW50LmxpbmUsIGV2ZW50LmNvbCwgcnVsZSk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG59KTtcblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImZhbGxiYWNrLWNvbG9yc1wiLFxuICAgIG5hbWU6IFwiUmVxdWlyZSBmYWxsYmFjayBjb2xvcnNcIixcbiAgICBkZXNjOiBcIkZvciBvbGRlciBicm93c2VycyB0aGF0IGRvbid0IHN1cHBvcnQgUkdCQSwgSFNMLCBvciBIU0xBLCBwcm92aWRlIGEgZmFsbGJhY2sgY29sb3IuXCIsXG4gICAgYnJvd3NlcnM6IFwiSUU2LElFNyxJRThcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzLFxuICAgICAgICAgICAgbGFzdFByb3BlcnR5LFxuICAgICAgICAgICAgcHJvcGVydGllc1RvQ2hlY2sgPSB7XG4gICAgICAgICAgICAgICAgY29sb3I6IDEsXG4gICAgICAgICAgICAgICAgYmFja2dyb3VuZDogMSxcbiAgICAgICAgICAgICAgICBcImJvcmRlci1jb2xvclwiOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLXRvcC1jb2xvclwiOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLXJpZ2h0LWNvbG9yXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJib3JkZXItYm90dG9tLWNvbG9yXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJib3JkZXItbGVmdC1jb2xvclwiOiAxLFxuICAgICAgICAgICAgICAgIGJvcmRlcjogMSxcbiAgICAgICAgICAgICAgICBcImJvcmRlci10b3BcIjogMSxcbiAgICAgICAgICAgICAgICBcImJvcmRlci1yaWdodFwiOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLWJvdHRvbVwiOiAxLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyLWxlZnRcIjogMSxcbiAgICAgICAgICAgICAgICBcImJhY2tncm91bmQtY29sb3JcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByb3BlcnRpZXM7XG5cbiAgICAgICAgZnVuY3Rpb24gc3RhcnRSdWxlKCl7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzID0ge307XG4gICAgICAgICAgICBsYXN0UHJvcGVydHkgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0Zm9udGZhY2VcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRwYWdlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cGFnZW1hcmdpblwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGtleWZyYW1lcnVsZVwiLCBzdGFydFJ1bGUpO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IGV2ZW50LnByb3BlcnR5LFxuICAgICAgICAgICAgICAgIG5hbWUgPSBwcm9wZXJ0eS50ZXh0LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgICAgcGFydHMgPSBldmVudC52YWx1ZS5wYXJ0cyxcbiAgICAgICAgICAgICAgICBpID0gMCxcbiAgICAgICAgICAgICAgICBjb2xvclR5cGUgPSBcIlwiLFxuICAgICAgICAgICAgICAgIGxlbiA9IHBhcnRzLmxlbmd0aDtcblxuICAgICAgICAgICAgaWYocHJvcGVydGllc1RvQ2hlY2tbbmFtZV0pe1xuICAgICAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pe1xuICAgICAgICAgICAgICAgICAgICBpZiAocGFydHNbaV0udHlwZSA9PT0gXCJjb2xvclwiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcImFscGhhXCIgaW4gcGFydHNbaV0gfHwgXCJodWVcIiBpbiBwYXJ0c1tpXSl7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoLyhbXlxcKV0rKVxcKC8udGVzdChwYXJ0c1tpXSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xvclR5cGUgPSBSZWdFeHAuJDEudG9VcHBlckNhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWxhc3RQcm9wZXJ0eSB8fCAobGFzdFByb3BlcnR5LnByb3BlcnR5LnRleHQudG9Mb3dlckNhc2UoKSAhPT0gbmFtZSB8fCBsYXN0UHJvcGVydHkuY29sb3JUeXBlICE9PSBcImNvbXBhdFwiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIkZhbGxiYWNrIFwiICsgbmFtZSArIFwiIChoZXggb3IgUkdCKSBzaG91bGQgcHJlY2VkZSBcIiArIGNvbG9yVHlwZSArIFwiIFwiICsgbmFtZSArIFwiLlwiLCBldmVudC5saW5lLCBldmVudC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuY29sb3JUeXBlID0gXCJjb21wYXRcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGxhc3RQcm9wZXJ0eSA9IGV2ZW50O1xuICAgICAgICB9KTtcblxuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBZb3Ugc2hvdWxkbid0IHVzZSBtb3JlIHRoYW4gMTAgZmxvYXRzLiBJZiB5b3UgZG8sIHRoZXJlJ3MgcHJvYmFibHlcbiAqIHJvb20gZm9yIHNvbWUgYWJzdHJhY3Rpb24uXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImZsb2F0c1wiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgdG9vIG1hbnkgZmxvYXRzXCIsXG4gICAgZGVzYzogXCJUaGlzIHJ1bGUgdGVzdHMgaWYgdGhlIGZsb2F0IHByb3BlcnR5IGlzIHVzZWQgdG9vIG1hbnkgdGltZXNcIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzO1xuICAgICAgICB2YXIgY291bnQgPSAwO1xuXG4gICAgICAgIC8vY291bnQgaG93IG1hbnkgdGltZXMgXCJmbG9hdFwiIGlzIHVzZWRcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwicHJvcGVydHlcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgaWYgKGV2ZW50LnByb3BlcnR5LnRleHQudG9Mb3dlckNhc2UoKSA9PT0gXCJmbG9hdFwiICYmXG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnZhbHVlLnRleHQudG9Mb3dlckNhc2UoKSAhPT0gXCJub25lXCIpe1xuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vcmVwb3J0IHRoZSByZXN1bHRzXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHN0eWxlc2hlZXRcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHJlcG9ydGVyLnN0YXQoXCJmbG9hdHNcIiwgY291bnQpO1xuICAgICAgICAgICAgaWYgKGNvdW50ID49IDEwKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yb2xsdXBXYXJuKFwiVG9vIG1hbnkgZmxvYXRzIChcIiArIGNvdW50ICsgXCIpLCB5b3UncmUgcHJvYmFibHkgdXNpbmcgdGhlbSBmb3IgbGF5b3V0LiBDb25zaWRlciB1c2luZyBhIGdyaWQgc3lzdGVtIGluc3RlYWQuXCIsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogQXZvaWQgdG9vIG1hbnkgQGZvbnQtZmFjZSBkZWNsYXJhdGlvbnMgaW4gdGhlIHNhbWUgc3R5bGVzaGVldC5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiZm9udC1mYWNlc1wiLFxuICAgIG5hbWU6IFwiRG9uJ3QgdXNlIHRvbyBtYW55IHdlYiBmb250c1wiLFxuICAgIGRlc2M6IFwiVG9vIG1hbnkgZGlmZmVyZW50IHdlYiBmb250cyBpbiB0aGUgc2FtZSBzdHlsZXNoZWV0LlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBjb3VudCA9IDA7XG5cblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRzdHlsZXNoZWV0XCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBpZiAoY291bnQgPiA1KXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yb2xsdXBXYXJuKFwiVG9vIG1hbnkgQGZvbnQtZmFjZSBkZWNsYXJhdGlvbnMgKFwiICsgY291bnQgKyBcIikuXCIsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogWW91IHNob3VsZG4ndCBuZWVkIG1vcmUgdGhhbiA5IGZvbnQtc2l6ZSBkZWNsYXJhdGlvbnMuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImZvbnQtc2l6ZXNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IHRvbyBtYW55IGZvbnQgc2l6ZXNcIixcbiAgICBkZXNjOiBcIkNoZWNrcyB0aGUgbnVtYmVyIG9mIGZvbnQtc2l6ZSBkZWNsYXJhdGlvbnMuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcyxcbiAgICAgICAgICAgIGNvdW50ID0gMDtcblxuICAgICAgICAvL2NoZWNrIGZvciB1c2Ugb2YgXCJmb250LXNpemVcIlxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBpZiAoZXZlbnQucHJvcGVydHkudG9TdHJpbmcoKSA9PT0gXCJmb250LXNpemVcIil7XG4gICAgICAgICAgICAgICAgY291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy9yZXBvcnQgdGhlIHJlc3VsdHNcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kc3R5bGVzaGVldFwiLCBmdW5jdGlvbigpe1xuICAgICAgICAgICAgcmVwb3J0ZXIuc3RhdChcImZvbnQtc2l6ZXNcIiwgY291bnQpO1xuICAgICAgICAgICAgaWYgKGNvdW50ID49IDEwKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yb2xsdXBXYXJuKFwiVG9vIG1hbnkgZm9udC1zaXplIGRlY2xhcmF0aW9ucyAoXCIgKyBjb3VudCArIFwiKSwgYWJzdHJhY3Rpb24gbmVlZGVkLlwiLCBydWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IFdoZW4gdXNpbmcgYSB2ZW5kb3ItcHJlZml4ZWQgZ3JhZGllbnQsIG1ha2Ugc3VyZSB0byB1c2UgdGhlbSBhbGwuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcImdyYWRpZW50c1wiLFxuICAgIG5hbWU6IFwiUmVxdWlyZSBhbGwgZ3JhZGllbnQgZGVmaW5pdGlvbnNcIixcbiAgICBkZXNjOiBcIldoZW4gdXNpbmcgYSB2ZW5kb3ItcHJlZml4ZWQgZ3JhZGllbnQsIG1ha2Ugc3VyZSB0byB1c2UgdGhlbSBhbGwuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcyxcbiAgICAgICAgICAgIGdyYWRpZW50cztcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIGdyYWRpZW50cyA9IHtcbiAgICAgICAgICAgICAgICBtb3o6IDAsXG4gICAgICAgICAgICAgICAgd2Via2l0OiAwLFxuICAgICAgICAgICAgICAgIG9sZFdlYmtpdDogMCxcbiAgICAgICAgICAgICAgICBvOiAwXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG5cbiAgICAgICAgICAgIGlmICgvXFwtKG1venxvfHdlYmtpdCkoPzpcXC0oPzpsaW5lYXJ8cmFkaWFsKSlcXC1ncmFkaWVudC9pLnRlc3QoZXZlbnQudmFsdWUpKXtcbiAgICAgICAgICAgICAgICBncmFkaWVudHNbUmVnRXhwLiQxXSA9IDE7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKC9cXC13ZWJraXRcXC1ncmFkaWVudC9pLnRlc3QoZXZlbnQudmFsdWUpKXtcbiAgICAgICAgICAgICAgICBncmFkaWVudHMub2xkV2Via2l0ID0gMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRydWxlXCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBtaXNzaW5nID0gW107XG5cbiAgICAgICAgICAgIGlmICghZ3JhZGllbnRzLm1veil7XG4gICAgICAgICAgICAgICAgbWlzc2luZy5wdXNoKFwiRmlyZWZveCAzLjYrXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWdyYWRpZW50cy53ZWJraXQpe1xuICAgICAgICAgICAgICAgIG1pc3NpbmcucHVzaChcIldlYmtpdCAoU2FmYXJpIDUrLCBDaHJvbWUpXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWdyYWRpZW50cy5vbGRXZWJraXQpe1xuICAgICAgICAgICAgICAgIG1pc3NpbmcucHVzaChcIk9sZCBXZWJraXQgKFNhZmFyaSA0KywgQ2hyb21lKVwiKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFncmFkaWVudHMubyl7XG4gICAgICAgICAgICAgICAgbWlzc2luZy5wdXNoKFwiT3BlcmEgMTEuMStcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChtaXNzaW5nLmxlbmd0aCAmJiBtaXNzaW5nLmxlbmd0aCA8IDQpe1xuICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIk1pc3NpbmcgdmVuZG9yLXByZWZpeGVkIENTUyBncmFkaWVudHMgZm9yIFwiICsgbWlzc2luZy5qb2luKFwiLCBcIikgKyBcIi5cIiwgZXZlbnQuc2VsZWN0b3JzWzBdLmxpbmUsIGV2ZW50LnNlbGVjdG9yc1swXS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IERvbid0IHVzZSBJRHMgZm9yIHNlbGVjdG9ycy5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiaWRzXCIsXG4gICAgbmFtZTogXCJEaXNhbGxvdyBJRHMgaW4gc2VsZWN0b3JzXCIsXG4gICAgZGVzYzogXCJTZWxlY3RvcnMgc2hvdWxkIG5vdCBjb250YWluIElEcy5cIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIHNlbGVjdG9ycyA9IGV2ZW50LnNlbGVjdG9ycyxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICBwYXJ0LFxuICAgICAgICAgICAgICAgIG1vZGlmaWVyLFxuICAgICAgICAgICAgICAgIGlkQ291bnQsXG4gICAgICAgICAgICAgICAgaSwgaiwgaztcblxuICAgICAgICAgICAgZm9yIChpPTA7IGkgPCBzZWxlY3RvcnMubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuICAgICAgICAgICAgICAgIGlkQ291bnQgPSAwO1xuXG4gICAgICAgICAgICAgICAgZm9yIChqPTA7IGogPCBzZWxlY3Rvci5wYXJ0cy5sZW5ndGg7IGorKyl7XG4gICAgICAgICAgICAgICAgICAgIHBhcnQgPSBzZWxlY3Rvci5wYXJ0c1tqXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnQudHlwZSA9PT0gcGFyc2VyLlNFTEVDVE9SX1BBUlRfVFlQRSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGs9MDsgayA8IHBhcnQubW9kaWZpZXJzLmxlbmd0aDsgaysrKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllciA9IHBhcnQubW9kaWZpZXJzW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtb2RpZmllci50eXBlID09PSBcImlkXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZENvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGlkQ291bnQgPT09IDEpe1xuICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJEb24ndCB1c2UgSURzIGluIHNlbGVjdG9ycy5cIiwgc2VsZWN0b3IubGluZSwgc2VsZWN0b3IuY29sLCBydWxlKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlkQ291bnQgPiAxKXtcbiAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KGlkQ291bnQgKyBcIiBJRHMgaW4gdGhlIHNlbGVjdG9yLCByZWFsbHk/XCIsIHNlbGVjdG9yLmxpbmUsIHNlbGVjdG9yLmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBEb24ndCB1c2UgQGltcG9ydCwgdXNlIDxsaW5rPiBpbnN0ZWFkLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJpbXBvcnRcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IEBpbXBvcnRcIixcbiAgICBkZXNjOiBcIkRvbid0IHVzZSBAaW1wb3J0LCB1c2UgPGxpbms+IGluc3RlYWQuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJpbXBvcnRcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiQGltcG9ydCBwcmV2ZW50cyBwYXJhbGxlbCBkb3dubG9hZHMsIHVzZSA8bGluaz4gaW5zdGVhZC5cIiwgZXZlbnQubGluZSwgZXZlbnQuY29sLCBydWxlKTtcbiAgICAgICAgfSk7XG5cbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogTWFrZSBzdXJlICFpbXBvcnRhbnQgaXMgbm90IG92ZXJ1c2VkLCB0aGlzIGNvdWxkIGxlYWQgdG8gc3BlY2lmaWNpdHlcbiAqIHdhci4gRGlzcGxheSBhIHdhcm5pbmcgb24gIWltcG9ydGFudCBkZWNsYXJhdGlvbnMsIGFuIGVycm9yIGlmIGl0J3NcbiAqIHVzZWQgbW9yZSBhdCBsZWFzdCAxMCB0aW1lcy5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiaW1wb3J0YW50XCIsXG4gICAgbmFtZTogXCJEaXNhbGxvdyAhaW1wb3J0YW50XCIsXG4gICAgZGVzYzogXCJCZSBjYXJlZnVsIHdoZW4gdXNpbmcgIWltcG9ydGFudCBkZWNsYXJhdGlvblwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsXG4gICAgICAgICAgICBjb3VudCA9IDA7XG5cbiAgICAgICAgLy93YXJuIHRoYXQgaW1wb3J0YW50IGlzIHVzZWQgYW5kIGluY3JlbWVudCB0aGUgZGVjbGFyYXRpb24gY291bnRlclxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICBpZiAoZXZlbnQuaW1wb3J0YW50ID09PSB0cnVlKXtcbiAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIlVzZSBvZiAhaW1wb3J0YW50XCIsIGV2ZW50LmxpbmUsIGV2ZW50LmNvbCwgcnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vaWYgdGhlcmUgYXJlIG1vcmUgdGhhbiAxMCwgc2hvdyBhbiBlcnJvclxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRzdHlsZXNoZWV0XCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXBvcnRlci5zdGF0KFwiaW1wb3J0YW50XCIsIGNvdW50KTtcbiAgICAgICAgICAgIGlmIChjb3VudCA+PSAxMCl7XG4gICAgICAgICAgICAgICAgcmVwb3J0ZXIucm9sbHVwV2FybihcIlRvbyBtYW55ICFpbXBvcnRhbnQgZGVjbGFyYXRpb25zIChcIiArIGNvdW50ICsgXCIpLCB0cnkgdG8gdXNlIGxlc3MgdGhhbiAxMCB0byBhdm9pZCBzcGVjaWZpY2l0eSBpc3N1ZXMuXCIsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogUHJvcGVydGllcyBzaG91bGQgYmUga25vd24gKGxpc3RlZCBpbiBDU1MzIHNwZWNpZmljYXRpb24pIG9yXG4gKiBiZSBhIHZlbmRvci1wcmVmaXhlZCBwcm9wZXJ0eS5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwia25vd24tcHJvcGVydGllc1wiLFxuICAgIG5hbWU6IFwiUmVxdWlyZSB1c2Ugb2Yga25vd24gcHJvcGVydGllc1wiLFxuICAgIGRlc2M6IFwiUHJvcGVydGllcyBzaG91bGQgYmUga25vd24gKGxpc3RlZCBpbiBDU1MzIHNwZWNpZmljYXRpb24pIG9yIGJlIGEgdmVuZG9yLXByZWZpeGVkIHByb3BlcnR5LlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwicHJvcGVydHlcIiwgZnVuY3Rpb24oZXZlbnQpe1xuXG4gICAgICAgICAgICAvLyB0aGUgY2hlY2sgaXMgaGFuZGxlZCBlbnRpcmVseSBieSB0aGUgcGFyc2VyLWxpYiAoaHR0cHM6Ly9naXRodWIuY29tL256YWthcy9wYXJzZXItbGliKVxuICAgICAgICAgICAgaWYgKGV2ZW50LmludmFsaWQpIHtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoZXZlbnQuaW52YWxpZC5tZXNzYWdlLCBldmVudC5saW5lLCBldmVudC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBBbGwgcHJvcGVydGllcyBzaG91bGQgYmUgaW4gYWxwaGFiZXRpY2FsIG9yZGVyLi5cbiAqL1xuLypnbG9iYWwgQ1NTTGludCovXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwib3JkZXItYWxwaGFiZXRpY2FsXCIsXG4gICAgbmFtZTogXCJBbHBoYWJldGljYWwgb3JkZXJcIixcbiAgICBkZXNjOiBcIkFzc3VyZSBwcm9wZXJ0aWVzIGFyZSBpbiBhbHBoYWJldGljYWwgb3JkZXJcIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzLFxuICAgICAgICAgICAgcHJvcGVydGllcztcblxuICAgICAgICB2YXIgc3RhcnRSdWxlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcHJvcGVydGllcyA9IFtdO1xuICAgICAgICB9O1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cGFnZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHBhZ2VtYXJnaW5cIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRrZXlmcmFtZXJ1bGVcIiwgc3RhcnRSdWxlKTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGV2ZW50LnByb3BlcnR5LnRleHQsXG4gICAgICAgICAgICAgICAgbG93ZXJDYXNlUHJlZml4TGVzc05hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXi0uKj8tLywgXCJcIik7XG5cbiAgICAgICAgICAgIHByb3BlcnRpZXMucHVzaChsb3dlckNhc2VQcmVmaXhMZXNzTmFtZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRQcm9wZXJ0aWVzID0gcHJvcGVydGllcy5qb2luKFwiLFwiKSxcbiAgICAgICAgICAgICAgICBleHBlY3RlZFByb3BlcnRpZXMgPSBwcm9wZXJ0aWVzLnNvcnQoKS5qb2luKFwiLFwiKTtcblxuICAgICAgICAgICAgaWYgKGN1cnJlbnRQcm9wZXJ0aWVzICE9PSBleHBlY3RlZFByb3BlcnRpZXMpe1xuICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIlJ1bGUgZG9lc24ndCBoYXZlIGFsbCBpdHMgcHJvcGVydGllcyBpbiBhbHBoYWJldGljYWwgb3JkZXJlZC5cIiwgZXZlbnQubGluZSwgZXZlbnQuY29sLCBydWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IG91dGxpbmU6IG5vbmUgb3Igb3V0bGluZTogMCBzaG91bGQgb25seSBiZSB1c2VkIGluIGEgOmZvY3VzIHJ1bGVcbiAqICAgICAgIGFuZCBvbmx5IGlmIHRoZXJlIGFyZSBvdGhlciBwcm9wZXJ0aWVzIGluIHRoZSBzYW1lIHJ1bGUuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcIm91dGxpbmUtbm9uZVwiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgb3V0bGluZTogbm9uZVwiLFxuICAgIGRlc2M6IFwiVXNlIG9mIG91dGxpbmU6IG5vbmUgb3Igb3V0bGluZTogMCBzaG91bGQgYmUgbGltaXRlZCB0byA6Zm9jdXMgcnVsZXMuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG4gICAgdGFnczogW1wiQWNjZXNzaWJpbGl0eVwiXSxcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzLFxuICAgICAgICAgICAgbGFzdFJ1bGU7XG5cbiAgICAgICAgZnVuY3Rpb24gc3RhcnRSdWxlKGV2ZW50KXtcbiAgICAgICAgICAgIGlmIChldmVudC5zZWxlY3RvcnMpe1xuICAgICAgICAgICAgICAgIGxhc3RSdWxlID0ge1xuICAgICAgICAgICAgICAgICAgICBsaW5lOiBldmVudC5saW5lLFxuICAgICAgICAgICAgICAgICAgICBjb2w6IGV2ZW50LmNvbCxcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0b3JzOiBldmVudC5zZWxlY3RvcnMsXG4gICAgICAgICAgICAgICAgICAgIHByb3BDb3VudDogMCxcbiAgICAgICAgICAgICAgICAgICAgb3V0bGluZTogZmFsc2VcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXN0UnVsZSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBlbmRSdWxlKCl7XG4gICAgICAgICAgICBpZiAobGFzdFJ1bGUpe1xuICAgICAgICAgICAgICAgIGlmIChsYXN0UnVsZS5vdXRsaW5lKXtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RSdWxlLnNlbGVjdG9ycy50b1N0cmluZygpLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihcIjpmb2N1c1wiKSA9PT0gLTEpe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiT3V0bGluZXMgc2hvdWxkIG9ubHkgYmUgbW9kaWZpZWQgdXNpbmcgOmZvY3VzLlwiLCBsYXN0UnVsZS5saW5lLCBsYXN0UnVsZS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxhc3RSdWxlLnByb3BDb3VudCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiT3V0bGluZXMgc2hvdWxkbid0IGJlIGhpZGRlbiB1bmxlc3Mgb3RoZXIgdmlzdWFsIGNoYW5nZXMgYXJlIG1hZGUuXCIsIGxhc3RSdWxlLmxpbmUsIGxhc3RSdWxlLmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRmb250ZmFjZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHBhZ2VcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRwYWdlbWFyZ2luXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0a2V5ZnJhbWVydWxlXCIsIHN0YXJ0UnVsZSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwicHJvcGVydHlcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBldmVudC5wcm9wZXJ0eS50ZXh0LnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBldmVudC52YWx1ZTtcblxuICAgICAgICAgICAgaWYgKGxhc3RSdWxlKXtcbiAgICAgICAgICAgICAgICBsYXN0UnVsZS5wcm9wQ291bnQrKztcbiAgICAgICAgICAgICAgICBpZiAobmFtZSA9PT0gXCJvdXRsaW5lXCIgJiYgKHZhbHVlLnRvU3RyaW5nKCkgPT09IFwibm9uZVwiIHx8IHZhbHVlLnRvU3RyaW5nKCkgPT09IFwiMFwiKSl7XG4gICAgICAgICAgICAgICAgICAgIGxhc3RSdWxlLm91dGxpbmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRydWxlXCIsIGVuZFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRmb250ZmFjZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZW1hcmdpblwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5ka2V5ZnJhbWVydWxlXCIsIGVuZFJ1bGUpO1xuXG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IERvbid0IHVzZSBjbGFzc2VzIG9yIElEcyB3aXRoIGVsZW1lbnRzIChhLmZvbyBvciBhI2ZvbykuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcIm92ZXJxdWFsaWZpZWQtZWxlbWVudHNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IG92ZXJxdWFsaWZpZWQgZWxlbWVudHNcIixcbiAgICBkZXNjOiBcIkRvbid0IHVzZSBjbGFzc2VzIG9yIElEcyB3aXRoIGVsZW1lbnRzIChhLmZvbyBvciBhI2ZvbykuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcyxcbiAgICAgICAgICAgIGNsYXNzZXMgPSB7fTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIHNlbGVjdG9ycyA9IGV2ZW50LnNlbGVjdG9ycyxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICBwYXJ0LFxuICAgICAgICAgICAgICAgIG1vZGlmaWVyLFxuICAgICAgICAgICAgICAgIGksIGosIGs7XG5cbiAgICAgICAgICAgIGZvciAoaT0wOyBpIDwgc2VsZWN0b3JzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgICAgICAgICBzZWxlY3RvciA9IHNlbGVjdG9yc1tpXTtcblxuICAgICAgICAgICAgICAgIGZvciAoaj0wOyBqIDwgc2VsZWN0b3IucGFydHMubGVuZ3RoOyBqKyspe1xuICAgICAgICAgICAgICAgICAgICBwYXJ0ID0gc2VsZWN0b3IucGFydHNbal07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0LnR5cGUgPT09IHBhcnNlci5TRUxFQ1RPUl9QQVJUX1RZUEUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChrPTA7IGsgPCBwYXJ0Lm1vZGlmaWVycy5sZW5ndGg7IGsrKyl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZXIgPSBwYXJ0Lm1vZGlmaWVyc1trXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocGFydC5lbGVtZW50TmFtZSAmJiBtb2RpZmllci50eXBlID09PSBcImlkXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJFbGVtZW50IChcIiArIHBhcnQgKyBcIikgaXMgb3ZlcnF1YWxpZmllZCwganVzdCB1c2UgXCIgKyBtb2RpZmllciArIFwiIHdpdGhvdXQgZWxlbWVudCBuYW1lLlwiLCBwYXJ0LmxpbmUsIHBhcnQuY29sLCBydWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKG1vZGlmaWVyLnR5cGUgPT09IFwiY2xhc3NcIil7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc2VzW21vZGlmaWVyXSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc2VzW21vZGlmaWVyXSA9IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzZXNbbW9kaWZpZXJdLnB1c2goeyBtb2RpZmllcjogbW9kaWZpZXIsIHBhcnQ6IHBhcnQgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRzdHlsZXNoZWV0XCIsIGZ1bmN0aW9uKCl7XG5cbiAgICAgICAgICAgIHZhciBwcm9wO1xuICAgICAgICAgICAgZm9yIChwcm9wIGluIGNsYXNzZXMpe1xuICAgICAgICAgICAgICAgIGlmIChjbGFzc2VzLmhhc093blByb3BlcnR5KHByb3ApKXtcblxuICAgICAgICAgICAgICAgICAgICAvL29uZSB1c2UgbWVhbnMgdGhhdCB0aGlzIGlzIG92ZXJxdWFsaWZpZWRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsYXNzZXNbcHJvcF0ubGVuZ3RoID09PSAxICYmIGNsYXNzZXNbcHJvcF1bMF0ucGFydC5lbGVtZW50TmFtZSl7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJFbGVtZW50IChcIiArIGNsYXNzZXNbcHJvcF1bMF0ucGFydCArIFwiKSBpcyBvdmVycXVhbGlmaWVkLCBqdXN0IHVzZSBcIiArIGNsYXNzZXNbcHJvcF1bMF0ubW9kaWZpZXIgKyBcIiB3aXRob3V0IGVsZW1lbnQgbmFtZS5cIiwgY2xhc3Nlc1twcm9wXVswXS5wYXJ0LmxpbmUsIGNsYXNzZXNbcHJvcF1bMF0ucGFydC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogSGVhZGluZ3MgKGgxLWg2KSBzaG91bGQgbm90IGJlIHF1YWxpZmllZCAobmFtZXNwYWNlZCkuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcInF1YWxpZmllZC1oZWFkaW5nc1wiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgcXVhbGlmaWVkIGhlYWRpbmdzXCIsXG4gICAgZGVzYzogXCJIZWFkaW5ncyBzaG91bGQgbm90IGJlIHF1YWxpZmllZCAobmFtZXNwYWNlZCkuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIHNlbGVjdG9ycyA9IGV2ZW50LnNlbGVjdG9ycyxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcixcbiAgICAgICAgICAgICAgICBwYXJ0LFxuICAgICAgICAgICAgICAgIGksIGo7XG5cbiAgICAgICAgICAgIGZvciAoaT0wOyBpIDwgc2VsZWN0b3JzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgICAgICAgICBzZWxlY3RvciA9IHNlbGVjdG9yc1tpXTtcblxuICAgICAgICAgICAgICAgIGZvciAoaj0wOyBqIDwgc2VsZWN0b3IucGFydHMubGVuZ3RoOyBqKyspe1xuICAgICAgICAgICAgICAgICAgICBwYXJ0ID0gc2VsZWN0b3IucGFydHNbal07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0LnR5cGUgPT09IHBhcnNlci5TRUxFQ1RPUl9QQVJUX1RZUEUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnQuZWxlbWVudE5hbWUgJiYgL2hbMS02XS8udGVzdChwYXJ0LmVsZW1lbnROYW1lLnRvU3RyaW5nKCkpICYmIGogPiAwKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJIZWFkaW5nIChcIiArIHBhcnQuZWxlbWVudE5hbWUgKyBcIikgc2hvdWxkIG5vdCBiZSBxdWFsaWZpZWQuXCIsIHBhcnQubGluZSwgcGFydC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogU2VsZWN0b3JzIHRoYXQgbG9vayBsaWtlIHJlZ3VsYXIgZXhwcmVzc2lvbnMgYXJlIHNsb3cgYW5kIHNob3VsZCBiZSBhdm9pZGVkLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJyZWdleC1zZWxlY3RvcnNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IHNlbGVjdG9ycyB0aGF0IGxvb2sgbGlrZSByZWdleHNcIixcbiAgICBkZXNjOiBcIlNlbGVjdG9ycyB0aGF0IGxvb2sgbGlrZSByZWd1bGFyIGV4cHJlc3Npb25zIGFyZSBzbG93IGFuZCBzaG91bGQgYmUgYXZvaWRlZC5cIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3JzID0gZXZlbnQuc2VsZWN0b3JzLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgIHBhcnQsXG4gICAgICAgICAgICAgICAgbW9kaWZpZXIsXG4gICAgICAgICAgICAgICAgaSwgaiwgaztcblxuICAgICAgICAgICAgZm9yIChpPTA7IGkgPCBzZWxlY3RvcnMubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuICAgICAgICAgICAgICAgIGZvciAoaj0wOyBqIDwgc2VsZWN0b3IucGFydHMubGVuZ3RoOyBqKyspe1xuICAgICAgICAgICAgICAgICAgICBwYXJ0ID0gc2VsZWN0b3IucGFydHNbal07XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0LnR5cGUgPT09IHBhcnNlci5TRUxFQ1RPUl9QQVJUX1RZUEUpe1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChrPTA7IGsgPCBwYXJ0Lm1vZGlmaWVycy5sZW5ndGg7IGsrKyl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZXIgPSBwYXJ0Lm1vZGlmaWVyc1trXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobW9kaWZpZXIudHlwZSA9PT0gXCJhdHRyaWJ1dGVcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgvKFtcXH5cXHxcXF5cXCRcXCpdPSkvLnRlc3QobW9kaWZpZXIpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIkF0dHJpYnV0ZSBzZWxlY3RvcnMgd2l0aCBcIiArIFJlZ0V4cC4kMSArIFwiIGFyZSBzbG93IVwiLCBtb2RpZmllci5saW5lLCBtb2RpZmllci5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBUb3RhbCBudW1iZXIgb2YgcnVsZXMgc2hvdWxkIG5vdCBleGNlZWQgeC5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwicnVsZXMtY291bnRcIixcbiAgICBuYW1lOiBcIlJ1bGVzIENvdW50XCIsXG4gICAgZGVzYzogXCJUcmFjayBob3cgbWFueSBydWxlcyB0aGVyZSBhcmUuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBjb3VudCA9IDA7XG5cbiAgICAgICAgLy9jb3VudCBlYWNoIHJ1bGVcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRzdHlsZXNoZWV0XCIsIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXBvcnRlci5zdGF0KFwicnVsZS1jb3VudFwiLCBjb3VudCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBXYXJuIHBlb3BsZSB3aXRoIGFwcHJvYWNoaW5nIHRoZSBJRSA0MDk1IGxpbWl0XG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcInNlbGVjdG9yLW1heC1hcHByb2FjaGluZ1wiLFxuICAgIG5hbWU6IFwiV2FybiB3aGVuIGFwcHJvYWNoaW5nIHRoZSA0MDk1IHNlbGVjdG9yIGxpbWl0IGZvciBJRVwiLFxuICAgIGRlc2M6IFwiV2lsbCB3YXJuIHdoZW4gc2VsZWN0b3IgY291bnQgaXMgPj0gMzgwMCBzZWxlY3RvcnMuXCIsXG4gICAgYnJvd3NlcnM6IFwiSUVcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKSB7XG4gICAgICAgIHZhciBydWxlID0gdGhpcywgY291bnQgPSAwO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgY291bnQgKz0gZXZlbnQuc2VsZWN0b3JzLmxlbmd0aDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kc3R5bGVzaGVldFwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+PSAzODAwKSB7XG4gICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiWW91IGhhdmUgXCIgKyBjb3VudCArIFwiIHNlbGVjdG9ycy4gSW50ZXJuZXQgRXhwbG9yZXIgc3VwcG9ydHMgYSBtYXhpbXVtIG9mIDQwOTUgc2VsZWN0b3JzIHBlciBzdHlsZXNoZWV0LiBDb25zaWRlciByZWZhY3RvcmluZy5cIiwwLDAscnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBXYXJuIHBlb3BsZSBwYXN0IHRoZSBJRSA0MDk1IGxpbWl0XG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcInNlbGVjdG9yLW1heFwiLFxuICAgIG5hbWU6IFwiRXJyb3Igd2hlbiBwYXN0IHRoZSA0MDk1IHNlbGVjdG9yIGxpbWl0IGZvciBJRVwiLFxuICAgIGRlc2M6IFwiV2lsbCBlcnJvciB3aGVuIHNlbGVjdG9yIGNvdW50IGlzID4gNDA5NS5cIixcbiAgICBicm93c2VyczogXCJJRVwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXMsIGNvdW50ID0gMDtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGNvdW50ICs9IGV2ZW50LnNlbGVjdG9ycy5sZW5ndGg7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHN0eWxlc2hlZXRcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoY291bnQgPiA0MDk1KSB7XG4gICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiWW91IGhhdmUgXCIgKyBjb3VudCArIFwiIHNlbGVjdG9ycy4gSW50ZXJuZXQgRXhwbG9yZXIgc3VwcG9ydHMgYSBtYXhpbXVtIG9mIDQwOTUgc2VsZWN0b3JzIHBlciBzdHlsZXNoZWV0LiBDb25zaWRlciByZWZhY3RvcmluZy5cIiwwLDAscnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBBdm9pZCBuZXctbGluZSBjaGFyYWN0ZXJzIGluIHNlbGVjdG9ycy5cbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwic2VsZWN0b3ItbmV3bGluZVwiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgbmV3LWxpbmUgY2hhcmFjdGVycyBpbiBzZWxlY3RvcnNcIixcbiAgICBkZXNjOiBcIk5ldy1saW5lIGNoYXJhY3RlcnMgaW4gc2VsZWN0b3JzIGFyZSB1c3VhbGx5IGEgZm9yZ290dGVuIGNvbW1hIGFuZCBub3QgYSBkZXNjZW5kYW50IGNvbWJpbmF0b3IuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcikge1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgZnVuY3Rpb24gc3RhcnRSdWxlKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgaSwgbGVuLCBzZWxlY3RvciwgcCwgbiwgcExlbiwgcGFydCwgcGFydDIsIHR5cGUsIGN1cnJlbnRMaW5lLCBuZXh0TGluZSxcbiAgICAgICAgICAgICAgICBzZWxlY3RvcnMgPSBldmVudC5zZWxlY3RvcnM7XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IHNlbGVjdG9ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuICAgICAgICAgICAgICAgIGZvciAocCA9IDAsIHBMZW4gPSBzZWxlY3Rvci5wYXJ0cy5sZW5ndGg7IHAgPCBwTGVuOyBwKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChuID0gcCArIDE7IG4gPCBwTGVuOyBuKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcnQgPSBzZWxlY3Rvci5wYXJ0c1twXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcnQyID0gc2VsZWN0b3IucGFydHNbbl07XG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlID0gcGFydC50eXBlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudExpbmUgPSBwYXJ0LmxpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXh0TGluZSA9IHBhcnQyLmxpbmU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlID09PSBcImRlc2NlbmRhbnRcIiAmJiBuZXh0TGluZSA+IGN1cnJlbnRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwibmV3bGluZSBjaGFyYWN0ZXIgZm91bmQgaW4gc2VsZWN0b3IgKGZvcmdvdCBhIGNvbW1hPylcIiwgY3VycmVudExpbmUsIHNlbGVjdG9yc1tpXS5wYXJ0c1swXS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgc3RhcnRSdWxlKTtcblxuICAgIH1cbn0pO1xuXG4vKlxuICogUnVsZTogVXNlIHNob3J0aGFuZCBwcm9wZXJ0aWVzIHdoZXJlIHBvc3NpYmxlLlxuICpcbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwic2hvcnRoYW5kXCIsXG4gICAgbmFtZTogXCJSZXF1aXJlIHNob3J0aGFuZCBwcm9wZXJ0aWVzXCIsXG4gICAgZGVzYzogXCJVc2Ugc2hvcnRoYW5kIHByb3BlcnRpZXMgd2hlcmUgcG9zc2libGUuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcyxcbiAgICAgICAgICAgIHByb3AsIGksIGxlbixcbiAgICAgICAgICAgIHByb3BlcnRpZXNUb0NoZWNrID0ge30sXG4gICAgICAgICAgICBwcm9wZXJ0aWVzLFxuICAgICAgICAgICAgbWFwcGluZyA9IHtcbiAgICAgICAgICAgICAgICBcIm1hcmdpblwiOiBbXG4gICAgICAgICAgICAgICAgICAgIFwibWFyZ2luLXRvcFwiLFxuICAgICAgICAgICAgICAgICAgICBcIm1hcmdpbi1ib3R0b21cIixcbiAgICAgICAgICAgICAgICAgICAgXCJtYXJnaW4tbGVmdFwiLFxuICAgICAgICAgICAgICAgICAgICBcIm1hcmdpbi1yaWdodFwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBcInBhZGRpbmdcIjogW1xuICAgICAgICAgICAgICAgICAgICBcInBhZGRpbmctdG9wXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicGFkZGluZy1ib3R0b21cIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYWRkaW5nLWxlZnRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYWRkaW5nLXJpZ2h0XCJcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIC8vaW5pdGlhbGl6ZSBwcm9wZXJ0aWVzVG9DaGVja1xuICAgICAgICBmb3IgKHByb3AgaW4gbWFwcGluZyl7XG4gICAgICAgICAgICBpZiAobWFwcGluZy5oYXNPd25Qcm9wZXJ0eShwcm9wKSl7XG4gICAgICAgICAgICAgICAgZm9yIChpPTAsIGxlbj1tYXBwaW5nW3Byb3BdLmxlbmd0aDsgaSA8IGxlbjsgaSsrKXtcbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydGllc1RvQ2hlY2tbbWFwcGluZ1twcm9wXVtpXV0gPSBwcm9wO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHN0YXJ0UnVsZSgpe1xuICAgICAgICAgICAgcHJvcGVydGllcyA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgLy9ldmVudCBoYW5kbGVyIGZvciBlbmQgb2YgcnVsZXNcbiAgICAgICAgZnVuY3Rpb24gZW5kUnVsZShldmVudCl7XG5cbiAgICAgICAgICAgIHZhciBwcm9wLCBpLCBsZW4sIHRvdGFsO1xuXG4gICAgICAgICAgICAvL2NoZWNrIHdoaWNoIHByb3BlcnRpZXMgdGhpcyBydWxlIGhhc1xuICAgICAgICAgICAgZm9yIChwcm9wIGluIG1hcHBpbmcpe1xuICAgICAgICAgICAgICAgIGlmIChtYXBwaW5nLmhhc093blByb3BlcnR5KHByb3ApKXtcbiAgICAgICAgICAgICAgICAgICAgdG90YWw9MDtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGk9MCwgbGVuPW1hcHBpbmdbcHJvcF0ubGVuZ3RoOyBpIDwgbGVuOyBpKyspe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG90YWwgKz0gcHJvcGVydGllc1ttYXBwaW5nW3Byb3BdW2ldXSA/IDEgOiAwO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRvdGFsID09PSBtYXBwaW5nW3Byb3BdLmxlbmd0aCl7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJUaGUgcHJvcGVydGllcyBcIiArIG1hcHBpbmdbcHJvcF0uam9pbihcIiwgXCIpICsgXCIgY2FuIGJlIHJlcGxhY2VkIGJ5IFwiICsgcHJvcCArIFwiLlwiLCBldmVudC5saW5lLCBldmVudC5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRydWxlXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0Zm9udGZhY2VcIiwgc3RhcnRSdWxlKTtcblxuICAgICAgICAvL2NoZWNrIGZvciB1c2Ugb2YgXCJmb250LXNpemVcIlxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJwcm9wZXJ0eVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgbmFtZSA9IGV2ZW50LnByb3BlcnR5LnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnRpZXNUb0NoZWNrW25hbWVdKXtcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzW25hbWVdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcnVsZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kZm9udGZhY2VcIiwgZW5kUnVsZSk7XG5cbiAgICB9XG5cbn0pO1xuXG4vKlxuICogUnVsZTogRG9uJ3QgdXNlIHByb3BlcnRpZXMgd2l0aCBhIHN0YXIgcHJlZml4LlxuICpcbiAqL1xuXG5DU1NMaW50LmFkZFJ1bGUoe1xuXG4gICAgLy9ydWxlIGluZm9ybWF0aW9uXG4gICAgaWQ6IFwic3Rhci1wcm9wZXJ0eS1oYWNrXCIsXG4gICAgbmFtZTogXCJEaXNhbGxvdyBwcm9wZXJ0aWVzIHdpdGggYSBzdGFyIHByZWZpeFwiLFxuICAgIGRlc2M6IFwiQ2hlY2tzIGZvciB0aGUgc3RhciBwcm9wZXJ0eSBoYWNrICh0YXJnZXRzIElFNi83KVwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgLy9jaGVjayBpZiBwcm9wZXJ0eSBuYW1lIHN0YXJ0cyB3aXRoIFwiKlwiXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IGV2ZW50LnByb3BlcnR5O1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHkuaGFjayA9PT0gXCIqXCIpIHtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJQcm9wZXJ0eSB3aXRoIHN0YXIgcHJlZml4IGZvdW5kLlwiLCBldmVudC5wcm9wZXJ0eS5saW5lLCBldmVudC5wcm9wZXJ0eS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcblxuLypcbiAqIFJ1bGU6IERvbid0IHVzZSB0ZXh0LWluZGVudCBmb3IgaW1hZ2UgcmVwbGFjZW1lbnQgaWYgeW91IG5lZWQgdG8gc3VwcG9ydCBydGwuXG4gKlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJ0ZXh0LWluZGVudFwiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgbmVnYXRpdmUgdGV4dC1pbmRlbnRcIixcbiAgICBkZXNjOiBcIkNoZWNrcyBmb3IgdGV4dCBpbmRlbnQgbGVzcyB0aGFuIC05OXB4XCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcyxcbiAgICAgICAgICAgIHRleHRJbmRlbnQsXG4gICAgICAgICAgICBkaXJlY3Rpb247XG5cblxuICAgICAgICBmdW5jdGlvbiBzdGFydFJ1bGUoKXtcbiAgICAgICAgICAgIHRleHRJbmRlbnQgPSBmYWxzZTtcbiAgICAgICAgICAgIGRpcmVjdGlvbiA9IFwiaW5oZXJpdFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9ldmVudCBoYW5kbGVyIGZvciBlbmQgb2YgcnVsZXNcbiAgICAgICAgZnVuY3Rpb24gZW5kUnVsZSgpe1xuICAgICAgICAgICAgaWYgKHRleHRJbmRlbnQgJiYgZGlyZWN0aW9uICE9PSBcImx0clwiKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJOZWdhdGl2ZSB0ZXh0LWluZGVudCBkb2Vzbid0IHdvcmsgd2VsbCB3aXRoIFJUTC4gSWYgeW91IHVzZSB0ZXh0LWluZGVudCBmb3IgaW1hZ2UgcmVwbGFjZW1lbnQgZXhwbGljaXRseSBzZXQgZGlyZWN0aW9uIGZvciB0aGF0IGl0ZW0gdG8gbHRyLlwiLCB0ZXh0SW5kZW50LmxpbmUsIHRleHRJbmRlbnQuY29sLCBydWxlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydGZvbnRmYWNlXCIsIHN0YXJ0UnVsZSk7XG5cbiAgICAgICAgLy9jaGVjayBmb3IgdXNlIG9mIFwiZm9udC1zaXplXCJcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwicHJvcGVydHlcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBldmVudC5wcm9wZXJ0eS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBldmVudC52YWx1ZTtcblxuICAgICAgICAgICAgaWYgKG5hbWUgPT09IFwidGV4dC1pbmRlbnRcIiAmJiB2YWx1ZS5wYXJ0c1swXS52YWx1ZSA8IC05OSl7XG4gICAgICAgICAgICAgICAgdGV4dEluZGVudCA9IGV2ZW50LnByb3BlcnR5O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSBcImRpcmVjdGlvblwiICYmIHZhbHVlLnRvU3RyaW5nKCkgPT09IFwibHRyXCIpe1xuICAgICAgICAgICAgICAgIGRpcmVjdGlvbiA9IFwibHRyXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHJ1bGVcIiwgZW5kUnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZGZvbnRmYWNlXCIsIGVuZFJ1bGUpO1xuXG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IERvbid0IHVzZSBwcm9wZXJ0aWVzIHdpdGggYSB1bmRlcnNjb3JlIHByZWZpeC5cbiAqXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcInVuZGVyc2NvcmUtcHJvcGVydHktaGFja1wiLFxuICAgIG5hbWU6IFwiRGlzYWxsb3cgcHJvcGVydGllcyB3aXRoIGFuIHVuZGVyc2NvcmUgcHJlZml4XCIsXG4gICAgZGVzYzogXCJDaGVja3MgZm9yIHRoZSB1bmRlcnNjb3JlIHByb3BlcnR5IGhhY2sgKHRhcmdldHMgSUU2KVwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgLy9jaGVjayBpZiBwcm9wZXJ0eSBuYW1lIHN0YXJ0cyB3aXRoIFwiX1wiXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IGV2ZW50LnByb3BlcnR5O1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHkuaGFjayA9PT0gXCJfXCIpIHtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJQcm9wZXJ0eSB3aXRoIHVuZGVyc2NvcmUgcHJlZml4IGZvdW5kLlwiLCBldmVudC5wcm9wZXJ0eS5saW5lLCBldmVudC5wcm9wZXJ0eS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59KTtcblxuLypcbiAqIFJ1bGU6IEhlYWRpbmdzIChoMS1oNikgc2hvdWxkIGJlIGRlZmluZWQgb25seSBvbmNlLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJ1bmlxdWUtaGVhZGluZ3NcIixcbiAgICBuYW1lOiBcIkhlYWRpbmdzIHNob3VsZCBvbmx5IGJlIGRlZmluZWQgb25jZVwiLFxuICAgIGRlc2M6IFwiSGVhZGluZ3Mgc2hvdWxkIGJlIGRlZmluZWQgb25seSBvbmNlLlwiLFxuICAgIGJyb3dzZXJzOiBcIkFsbFwiLFxuXG4gICAgLy9pbml0aWFsaXphdGlvblxuICAgIGluaXQ6IGZ1bmN0aW9uKHBhcnNlciwgcmVwb3J0ZXIpe1xuICAgICAgICB2YXIgcnVsZSA9IHRoaXM7XG5cbiAgICAgICAgdmFyIGhlYWRpbmdzID0ge1xuICAgICAgICAgICAgICAgIGgxOiAwLFxuICAgICAgICAgICAgICAgIGgyOiAwLFxuICAgICAgICAgICAgICAgIGgzOiAwLFxuICAgICAgICAgICAgICAgIGg0OiAwLFxuICAgICAgICAgICAgICAgIGg1OiAwLFxuICAgICAgICAgICAgICAgIGg2OiAwXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3JzID0gZXZlbnQuc2VsZWN0b3JzLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgIHBhcnQsXG4gICAgICAgICAgICAgICAgcHNldWRvLFxuICAgICAgICAgICAgICAgIGksIGo7XG5cbiAgICAgICAgICAgIGZvciAoaT0wOyBpIDwgc2VsZWN0b3JzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgICAgICAgICBzZWxlY3RvciA9IHNlbGVjdG9yc1tpXTtcbiAgICAgICAgICAgICAgICBwYXJ0ID0gc2VsZWN0b3IucGFydHNbc2VsZWN0b3IucGFydHMubGVuZ3RoLTFdO1xuXG4gICAgICAgICAgICAgICAgaWYgKHBhcnQuZWxlbWVudE5hbWUgJiYgLyhoWzEtNl0pL2kudGVzdChwYXJ0LmVsZW1lbnROYW1lLnRvU3RyaW5nKCkpKXtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKGo9MDsgaiA8IHBhcnQubW9kaWZpZXJzLmxlbmd0aDsgaisrKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwYXJ0Lm1vZGlmaWVyc1tqXS50eXBlID09PSBcInBzZXVkb1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwc2V1ZG8gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwc2V1ZG8pe1xuICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGluZ3NbUmVnRXhwLiQxXSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRpbmdzW1JlZ0V4cC4kMV0gPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KFwiSGVhZGluZyAoXCIgKyBwYXJ0LmVsZW1lbnROYW1lICsgXCIpIGhhcyBhbHJlYWR5IGJlZW4gZGVmaW5lZC5cIiwgcGFydC5saW5lLCBwYXJ0LmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcImVuZHN0eWxlc2hlZXRcIiwgZnVuY3Rpb24oKXtcbiAgICAgICAgICAgIHZhciBwcm9wLFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VzID0gW107XG5cbiAgICAgICAgICAgIGZvciAocHJvcCBpbiBoZWFkaW5ncyl7XG4gICAgICAgICAgICAgICAgaWYgKGhlYWRpbmdzLmhhc093blByb3BlcnR5KHByb3ApKXtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhlYWRpbmdzW3Byb3BdID4gMSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBtZXNzYWdlcy5wdXNoKGhlYWRpbmdzW3Byb3BdICsgXCIgXCIgKyBwcm9wICsgXCJzXCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoKXtcbiAgICAgICAgICAgICAgICByZXBvcnRlci5yb2xsdXBXYXJuKFwiWW91IGhhdmUgXCIgKyBtZXNzYWdlcy5qb2luKFwiLCBcIikgKyBcIiBkZWZpbmVkIGluIHRoaXMgc3R5bGVzaGVldC5cIiwgcnVsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBEb24ndCB1c2UgdW5pdmVyc2FsIHNlbGVjdG9yIGJlY2F1c2UgaXQncyBzbG93LlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJ1bml2ZXJzYWwtc2VsZWN0b3JcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IHVuaXZlcnNhbCBzZWxlY3RvclwiLFxuICAgIGRlc2M6IFwiVGhlIHVuaXZlcnNhbCBzZWxlY3RvciAoKikgaXMga25vd24gdG8gYmUgc2xvdy5cIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzO1xuXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0cnVsZVwiLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICB2YXIgc2VsZWN0b3JzID0gZXZlbnQuc2VsZWN0b3JzLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgIHBhcnQsXG4gICAgICAgICAgICAgICAgaTtcblxuICAgICAgICAgICAgZm9yIChpPTA7IGkgPCBzZWxlY3RvcnMubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuXG4gICAgICAgICAgICAgICAgcGFydCA9IHNlbGVjdG9yLnBhcnRzW3NlbGVjdG9yLnBhcnRzLmxlbmd0aC0xXTtcbiAgICAgICAgICAgICAgICBpZiAocGFydC5lbGVtZW50TmFtZSA9PT0gXCIqXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQocnVsZS5kZXNjLCBwYXJ0LmxpbmUsIHBhcnQuY29sLCBydWxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBEb24ndCB1c2UgdW5xdWFsaWZpZWQgYXR0cmlidXRlIHNlbGVjdG9ycyBiZWNhdXNlIHRoZXkncmUganVzdCBsaWtlIHVuaXZlcnNhbCBzZWxlY3RvcnMuXG4gKi9cblxuQ1NTTGludC5hZGRSdWxlKHtcblxuICAgIC8vcnVsZSBpbmZvcm1hdGlvblxuICAgIGlkOiBcInVucXVhbGlmaWVkLWF0dHJpYnV0ZXNcIixcbiAgICBuYW1lOiBcIkRpc2FsbG93IHVucXVhbGlmaWVkIGF0dHJpYnV0ZSBzZWxlY3RvcnNcIixcbiAgICBkZXNjOiBcIlVucXVhbGlmaWVkIGF0dHJpYnV0ZSBzZWxlY3RvcnMgYXJlIGtub3duIHRvIGJlIHNsb3cuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgZnVuY3Rpb24oZXZlbnQpe1xuXG4gICAgICAgICAgICB2YXIgc2VsZWN0b3JzID0gZXZlbnQuc2VsZWN0b3JzLFxuICAgICAgICAgICAgICAgIHNlbGVjdG9yLFxuICAgICAgICAgICAgICAgIHBhcnQsXG4gICAgICAgICAgICAgICAgbW9kaWZpZXIsXG4gICAgICAgICAgICAgICAgaSwgaztcblxuICAgICAgICAgICAgZm9yIChpPTA7IGkgPCBzZWxlY3RvcnMubGVuZ3RoOyBpKyspe1xuICAgICAgICAgICAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3JzW2ldO1xuXG4gICAgICAgICAgICAgICAgcGFydCA9IHNlbGVjdG9yLnBhcnRzW3NlbGVjdG9yLnBhcnRzLmxlbmd0aC0xXTtcbiAgICAgICAgICAgICAgICBpZiAocGFydC50eXBlID09PSBwYXJzZXIuU0VMRUNUT1JfUEFSVF9UWVBFKXtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrPTA7IGsgPCBwYXJ0Lm1vZGlmaWVycy5sZW5ndGg7IGsrKyl7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllciA9IHBhcnQubW9kaWZpZXJzW2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGlmaWVyLnR5cGUgPT09IFwiYXR0cmlidXRlXCIgJiYgKCFwYXJ0LmVsZW1lbnROYW1lIHx8IHBhcnQuZWxlbWVudE5hbWUgPT09IFwiKlwiKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVwb3J0ZXIucmVwb3J0KHJ1bGUuZGVzYywgcGFydC5saW5lLCBwYXJ0LmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcblxuLypcbiAqIFJ1bGU6IFdoZW4gdXNpbmcgYSB2ZW5kb3ItcHJlZml4ZWQgcHJvcGVydHksIG1ha2Ugc3VyZSB0b1xuICogaW5jbHVkZSB0aGUgc3RhbmRhcmQgb25lLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJ2ZW5kb3ItcHJlZml4XCIsXG4gICAgbmFtZTogXCJSZXF1aXJlIHN0YW5kYXJkIHByb3BlcnR5IHdpdGggdmVuZG9yIHByZWZpeFwiLFxuICAgIGRlc2M6IFwiV2hlbiB1c2luZyBhIHZlbmRvci1wcmVmaXhlZCBwcm9wZXJ0eSwgbWFrZSBzdXJlIHRvIGluY2x1ZGUgdGhlIHN0YW5kYXJkIG9uZS5cIixcbiAgICBicm93c2VyczogXCJBbGxcIixcblxuICAgIC8vaW5pdGlhbGl6YXRpb25cbiAgICBpbml0OiBmdW5jdGlvbihwYXJzZXIsIHJlcG9ydGVyKXtcbiAgICAgICAgdmFyIHJ1bGUgPSB0aGlzLFxuICAgICAgICAgICAgcHJvcGVydGllcyxcbiAgICAgICAgICAgIG51bSxcbiAgICAgICAgICAgIHByb3BlcnRpZXNUb0NoZWNrID0ge1xuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1ib3JkZXItcmFkaXVzXCI6IFwiYm9yZGVyLXJhZGl1c1wiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1ib3JkZXItdG9wLWxlZnQtcmFkaXVzXCI6IFwiYm9yZGVyLXRvcC1sZWZ0LXJhZGl1c1wiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1ib3JkZXItdG9wLXJpZ2h0LXJhZGl1c1wiOiBcImJvcmRlci10b3AtcmlnaHQtcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWJvcmRlci1ib3R0b20tbGVmdC1yYWRpdXNcIjogXCJib3JkZXItYm90dG9tLWxlZnQtcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWJvcmRlci1ib3R0b20tcmlnaHQtcmFkaXVzXCI6IFwiYm9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXNcIixcblxuICAgICAgICAgICAgICAgIFwiLW8tYm9yZGVyLXJhZGl1c1wiOiBcImJvcmRlci1yYWRpdXNcIixcbiAgICAgICAgICAgICAgICBcIi1vLWJvcmRlci10b3AtbGVmdC1yYWRpdXNcIjogXCJib3JkZXItdG9wLWxlZnQtcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItby1ib3JkZXItdG9wLXJpZ2h0LXJhZGl1c1wiOiBcImJvcmRlci10b3AtcmlnaHQtcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItby1ib3JkZXItYm90dG9tLWxlZnQtcmFkaXVzXCI6IFwiYm9yZGVyLWJvdHRvbS1sZWZ0LXJhZGl1c1wiLFxuICAgICAgICAgICAgICAgIFwiLW8tYm9yZGVyLWJvdHRvbS1yaWdodC1yYWRpdXNcIjogXCJib3JkZXItYm90dG9tLXJpZ2h0LXJhZGl1c1wiLFxuXG4gICAgICAgICAgICAgICAgXCItbW96LWJvcmRlci1yYWRpdXNcIjogXCJib3JkZXItcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItbW96LWJvcmRlci1yYWRpdXMtdG9wbGVmdFwiOiBcImJvcmRlci10b3AtbGVmdC1yYWRpdXNcIixcbiAgICAgICAgICAgICAgICBcIi1tb3otYm9yZGVyLXJhZGl1cy10b3ByaWdodFwiOiBcImJvcmRlci10b3AtcmlnaHQtcmFkaXVzXCIsXG4gICAgICAgICAgICAgICAgXCItbW96LWJvcmRlci1yYWRpdXMtYm90dG9tbGVmdFwiOiBcImJvcmRlci1ib3R0b20tbGVmdC1yYWRpdXNcIixcbiAgICAgICAgICAgICAgICBcIi1tb3otYm9yZGVyLXJhZGl1cy1ib3R0b21yaWdodFwiOiBcImJvcmRlci1ib3R0b20tcmlnaHQtcmFkaXVzXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLWNvdW50XCI6IFwiY29sdW1uLWNvdW50XCIsXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWNvbHVtbi1jb3VudFwiOiBcImNvbHVtbi1jb3VudFwiLFxuXG4gICAgICAgICAgICAgICAgXCItbW96LWNvbHVtbi1nYXBcIjogXCJjb2x1bW4tZ2FwXCIsXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWNvbHVtbi1nYXBcIjogXCJjb2x1bW4tZ2FwXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLXJ1bGVcIjogXCJjb2x1bW4tcnVsZVwiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1jb2x1bW4tcnVsZVwiOiBcImNvbHVtbi1ydWxlXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLXJ1bGUtc3R5bGVcIjogXCJjb2x1bW4tcnVsZS1zdHlsZVwiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1jb2x1bW4tcnVsZS1zdHlsZVwiOiBcImNvbHVtbi1ydWxlLXN0eWxlXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLXJ1bGUtY29sb3JcIjogXCJjb2x1bW4tcnVsZS1jb2xvclwiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1jb2x1bW4tcnVsZS1jb2xvclwiOiBcImNvbHVtbi1ydWxlLWNvbG9yXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLXJ1bGUtd2lkdGhcIjogXCJjb2x1bW4tcnVsZS13aWR0aFwiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1jb2x1bW4tcnVsZS13aWR0aFwiOiBcImNvbHVtbi1ydWxlLXdpZHRoXCIsXG5cbiAgICAgICAgICAgICAgICBcIi1tb3otY29sdW1uLXdpZHRoXCI6IFwiY29sdW1uLXdpZHRoXCIsXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWNvbHVtbi13aWR0aFwiOiBcImNvbHVtbi13aWR0aFwiLFxuXG4gICAgICAgICAgICAgICAgXCItd2Via2l0LWNvbHVtbi1zcGFuXCI6IFwiY29sdW1uLXNwYW5cIixcbiAgICAgICAgICAgICAgICBcIi13ZWJraXQtY29sdW1uc1wiOiBcImNvbHVtbnNcIixcblxuICAgICAgICAgICAgICAgIFwiLW1vei1ib3gtc2hhZG93XCI6IFwiYm94LXNoYWRvd1wiLFxuICAgICAgICAgICAgICAgIFwiLXdlYmtpdC1ib3gtc2hhZG93XCI6IFwiYm94LXNoYWRvd1wiLFxuXG4gICAgICAgICAgICAgICAgXCItbW96LXRyYW5zZm9ybVwiIDogXCJ0cmFuc2Zvcm1cIixcbiAgICAgICAgICAgICAgICBcIi13ZWJraXQtdHJhbnNmb3JtXCIgOiBcInRyYW5zZm9ybVwiLFxuICAgICAgICAgICAgICAgIFwiLW8tdHJhbnNmb3JtXCIgOiBcInRyYW5zZm9ybVwiLFxuICAgICAgICAgICAgICAgIFwiLW1zLXRyYW5zZm9ybVwiIDogXCJ0cmFuc2Zvcm1cIixcblxuICAgICAgICAgICAgICAgIFwiLW1vei10cmFuc2Zvcm0tb3JpZ2luXCIgOiBcInRyYW5zZm9ybS1vcmlnaW5cIixcbiAgICAgICAgICAgICAgICBcIi13ZWJraXQtdHJhbnNmb3JtLW9yaWdpblwiIDogXCJ0cmFuc2Zvcm0tb3JpZ2luXCIsXG4gICAgICAgICAgICAgICAgXCItby10cmFuc2Zvcm0tb3JpZ2luXCIgOiBcInRyYW5zZm9ybS1vcmlnaW5cIixcbiAgICAgICAgICAgICAgICBcIi1tcy10cmFuc2Zvcm0tb3JpZ2luXCIgOiBcInRyYW5zZm9ybS1vcmlnaW5cIixcblxuICAgICAgICAgICAgICAgIFwiLW1vei1ib3gtc2l6aW5nXCIgOiBcImJveC1zaXppbmdcIixcbiAgICAgICAgICAgICAgICBcIi13ZWJraXQtYm94LXNpemluZ1wiIDogXCJib3gtc2l6aW5nXCJcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgLy9ldmVudCBoYW5kbGVyIGZvciBiZWdpbm5pbmcgb2YgcnVsZXNcbiAgICAgICAgZnVuY3Rpb24gc3RhcnRSdWxlKCl7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzID0ge307XG4gICAgICAgICAgICBudW0gPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9ldmVudCBoYW5kbGVyIGZvciBlbmQgb2YgcnVsZXNcbiAgICAgICAgZnVuY3Rpb24gZW5kUnVsZSgpe1xuICAgICAgICAgICAgdmFyIHByb3AsXG4gICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICBsZW4sXG4gICAgICAgICAgICAgICAgbmVlZGVkLFxuICAgICAgICAgICAgICAgIGFjdHVhbCxcbiAgICAgICAgICAgICAgICBuZWVkc1N0YW5kYXJkID0gW107XG5cbiAgICAgICAgICAgIGZvciAocHJvcCBpbiBwcm9wZXJ0aWVzKXtcbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydGllc1RvQ2hlY2tbcHJvcF0pe1xuICAgICAgICAgICAgICAgICAgICBuZWVkc1N0YW5kYXJkLnB1c2goeyBhY3R1YWw6IHByb3AsIG5lZWRlZDogcHJvcGVydGllc1RvQ2hlY2tbcHJvcF19KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaT0wLCBsZW49bmVlZHNTdGFuZGFyZC5sZW5ndGg7IGkgPCBsZW47IGkrKyl7XG4gICAgICAgICAgICAgICAgbmVlZGVkID0gbmVlZHNTdGFuZGFyZFtpXS5uZWVkZWQ7XG4gICAgICAgICAgICAgICAgYWN0dWFsID0gbmVlZHNTdGFuZGFyZFtpXS5hY3R1YWw7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXByb3BlcnRpZXNbbmVlZGVkXSl7XG4gICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIk1pc3Npbmcgc3RhbmRhcmQgcHJvcGVydHkgJ1wiICsgbmVlZGVkICsgXCInIHRvIGdvIGFsb25nIHdpdGggJ1wiICsgYWN0dWFsICsgXCInLlwiLCBwcm9wZXJ0aWVzW2FjdHVhbF1bMF0ubmFtZS5saW5lLCBwcm9wZXJ0aWVzW2FjdHVhbF1bMF0ubmFtZS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vbWFrZSBzdXJlIHN0YW5kYXJkIHByb3BlcnR5IGlzIGxhc3RcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnRpZXNbbmVlZGVkXVswXS5wb3MgPCBwcm9wZXJ0aWVzW2FjdHVhbF1bMF0ucG9zKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlcG9ydGVyLnJlcG9ydChcIlN0YW5kYXJkIHByb3BlcnR5ICdcIiArIG5lZWRlZCArIFwiJyBzaG91bGQgY29tZSBhZnRlciB2ZW5kb3ItcHJlZml4ZWQgcHJvcGVydHkgJ1wiICsgYWN0dWFsICsgXCInLlwiLCBwcm9wZXJ0aWVzW2FjdHVhbF1bMF0ubmFtZS5saW5lLCBwcm9wZXJ0aWVzW2FjdHVhbF1bMF0ubmFtZS5jb2wsIHJ1bGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHJ1bGVcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRmb250ZmFjZVwiLCBzdGFydFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJzdGFydHBhZ2VcIiwgc3RhcnRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwic3RhcnRwYWdlbWFyZ2luXCIsIHN0YXJ0UnVsZSk7XG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInN0YXJ0a2V5ZnJhbWVydWxlXCIsIHN0YXJ0UnVsZSk7XG5cbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwicHJvcGVydHlcIiwgZnVuY3Rpb24oZXZlbnQpe1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBldmVudC5wcm9wZXJ0eS50ZXh0LnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgIGlmICghcHJvcGVydGllc1tuYW1lXSl7XG4gICAgICAgICAgICAgICAgcHJvcGVydGllc1tuYW1lXSA9IFtdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwcm9wZXJ0aWVzW25hbWVdLnB1c2goeyBuYW1lOiBldmVudC5wcm9wZXJ0eSwgdmFsdWUgOiBldmVudC52YWx1ZSwgcG9zOm51bSsrIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRydWxlXCIsIGVuZFJ1bGUpO1xuICAgICAgICBwYXJzZXIuYWRkTGlzdGVuZXIoXCJlbmRmb250ZmFjZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZVwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5kcGFnZW1hcmdpblwiLCBlbmRSdWxlKTtcbiAgICAgICAgcGFyc2VyLmFkZExpc3RlbmVyKFwiZW5ka2V5ZnJhbWVydWxlXCIsIGVuZFJ1bGUpO1xuICAgIH1cblxufSk7XG5cbi8qXG4gKiBSdWxlOiBZb3UgZG9uJ3QgbmVlZCB0byBzcGVjaWZ5IHVuaXRzIHdoZW4gYSB2YWx1ZSBpcyAwLlxuICovXG5cbkNTU0xpbnQuYWRkUnVsZSh7XG5cbiAgICAvL3J1bGUgaW5mb3JtYXRpb25cbiAgICBpZDogXCJ6ZXJvLXVuaXRzXCIsXG4gICAgbmFtZTogXCJEaXNhbGxvdyB1bml0cyBmb3IgMCB2YWx1ZXNcIixcbiAgICBkZXNjOiBcIllvdSBkb24ndCBuZWVkIHRvIHNwZWNpZnkgdW5pdHMgd2hlbiBhIHZhbHVlIGlzIDAuXCIsXG4gICAgYnJvd3NlcnM6IFwiQWxsXCIsXG5cbiAgICAvL2luaXRpYWxpemF0aW9uXG4gICAgaW5pdDogZnVuY3Rpb24ocGFyc2VyLCByZXBvcnRlcil7XG4gICAgICAgIHZhciBydWxlID0gdGhpcztcblxuICAgICAgICAvL2NvdW50IGhvdyBtYW55IHRpbWVzIFwiZmxvYXRcIiBpcyB1c2VkXG4gICAgICAgIHBhcnNlci5hZGRMaXN0ZW5lcihcInByb3BlcnR5XCIsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgIHZhciBwYXJ0cyA9IGV2ZW50LnZhbHVlLnBhcnRzLFxuICAgICAgICAgICAgICAgIGkgPSAwLFxuICAgICAgICAgICAgICAgIGxlbiA9IHBhcnRzLmxlbmd0aDtcblxuICAgICAgICAgICAgd2hpbGUoaSA8IGxlbil7XG4gICAgICAgICAgICAgICAgaWYgKChwYXJ0c1tpXS51bml0cyB8fCBwYXJ0c1tpXS50eXBlID09PSBcInBlcmNlbnRhZ2VcIikgJiYgcGFydHNbaV0udmFsdWUgPT09IDAgJiYgcGFydHNbaV0udHlwZSAhPT0gXCJ0aW1lXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXBvcnRlci5yZXBvcnQoXCJWYWx1ZXMgb2YgMCBzaG91bGRuJ3QgaGF2ZSB1bml0cyBzcGVjaWZpZWQuXCIsIHBhcnRzW2ldLmxpbmUsIHBhcnRzW2ldLmNvbCwgcnVsZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9KTtcblxuICAgIH1cblxufSk7XG5cbihmdW5jdGlvbigpIHtcblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2Ugc3BlY2lhbCBjaGFyYWN0ZXJzIGJlZm9yZSB3cml0ZSB0byBvdXRwdXQuXG4gICAgICpcbiAgICAgKiBSdWxlczpcbiAgICAgKiAgLSBzaW5nbGUgcXVvdGVzIGlzIHRoZSBlc2NhcGUgc2VxdWVuY2UgZm9yIGRvdWJsZS1xdW90ZXNcbiAgICAgKiAgLSAmYW1wOyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciAmXG4gICAgICogIC0gJmx0OyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciA8XG4gICAgICogIC0gJmd0OyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciA+XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBlc2NhcGVcbiAgICAgKiBAcmV0dXJuIGVzY2FwZWQgbWVzc2FnZSBhcyB7U3RyaW5nfVxuICAgICAqL1xuICAgIHZhciB4bWxFc2NhcGUgPSBmdW5jdGlvbihzdHIpIHtcbiAgICAgICAgaWYgKCFzdHIgfHwgc3RyLmNvbnN0cnVjdG9yICE9PSBTdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bXFxcIiY+PF0vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgICAgIHN3aXRjaCAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwiXFxcIlwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCImcXVvdDtcIjtcbiAgICAgICAgICAgICAgICBjYXNlIFwiJlwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCImYW1wO1wiO1xuICAgICAgICAgICAgICAgIGNhc2UgXCI8XCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIiZsdDtcIjtcbiAgICAgICAgICAgICAgICBjYXNlIFwiPlwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCImZ3Q7XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICBDU1NMaW50LmFkZEZvcm1hdHRlcih7XG4gICAgICAgIC8vZm9ybWF0IGluZm9ybWF0aW9uXG4gICAgICAgIGlkOiBcImNoZWNrc3R5bGUteG1sXCIsXG4gICAgICAgIG5hbWU6IFwiQ2hlY2tzdHlsZSBYTUwgZm9ybWF0XCIsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJldHVybiBvcGVuaW5nIHJvb3QgWE1MIHRhZy5cbiAgICAgICAgICogQHJldHVybiB7U3RyaW5nfSB0byBwcmVwZW5kIGJlZm9yZSBhbGwgcmVzdWx0c1xuICAgICAgICAgKi9cbiAgICAgICAgc3RhcnRGb3JtYXQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gXCI8P3htbCB2ZXJzaW9uPVxcXCIxLjBcXFwiIGVuY29kaW5nPVxcXCJ1dGYtOFxcXCI/PjxjaGVja3N0eWxlPlwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXR1cm4gY2xvc2luZyByb290IFhNTCB0YWcuXG4gICAgICAgICAqIEByZXR1cm4ge1N0cmluZ30gdG8gYXBwZW5kIGFmdGVyIGFsbCByZXN1bHRzXG4gICAgICAgICAqL1xuICAgICAgICBlbmRGb3JtYXQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXR1cm4gXCI8L2NoZWNrc3R5bGU+XCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJldHVybnMgbWVzc2FnZSB3aGVuIHRoZXJlIGlzIGEgZmlsZSByZWFkIGVycm9yLlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gZmlsZW5hbWUgVGhlIG5hbWUgb2YgdGhlIGZpbGUgdGhhdCBjYXVzZWQgdGhlIGVycm9yLlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSBUaGUgZXJyb3IgbWVzc2FnZVxuICAgICAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBlcnJvciBtZXNzYWdlLlxuICAgICAgICAgKi9cbiAgICAgICAgcmVhZEVycm9yOiBmdW5jdGlvbihmaWxlbmFtZSwgbWVzc2FnZSkge1xuICAgICAgICAgICAgcmV0dXJuIFwiPGZpbGUgbmFtZT1cXFwiXCIgKyB4bWxFc2NhcGUoZmlsZW5hbWUpICsgXCJcXFwiPjxlcnJvciBsaW5lPVxcXCIwXFxcIiBjb2x1bW49XFxcIjBcXFwiIHNldmVydHk9XFxcImVycm9yXFxcIiBtZXNzYWdlPVxcXCJcIiArIHhtbEVzY2FwZShtZXNzYWdlKSArIFwiXFxcIj48L2Vycm9yPjwvZmlsZT5cIjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogR2l2ZW4gQ1NTIExpbnQgcmVzdWx0cyBmb3IgYSBmaWxlLCByZXR1cm4gb3V0cHV0IGZvciB0aGlzIGZvcm1hdC5cbiAgICAgICAgICogQHBhcmFtIHJlc3VsdHMge09iamVjdH0gd2l0aCBlcnJvciBhbmQgd2FybmluZyBtZXNzYWdlc1xuICAgICAgICAgKiBAcGFyYW0gZmlsZW5hbWUge1N0cmluZ30gcmVsYXRpdmUgZmlsZSBwYXRoXG4gICAgICAgICAqIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IChVTlVTRUQgZm9yIG5vdykgc3BlY2lmaWVzIHNwZWNpYWwgaGFuZGxpbmcgb2Ygb3V0cHV0XG4gICAgICAgICAqIEByZXR1cm4ge1N0cmluZ30gb3V0cHV0IGZvciByZXN1bHRzXG4gICAgICAgICAqL1xuICAgICAgICBmb3JtYXRSZXN1bHRzOiBmdW5jdGlvbihyZXN1bHRzLCBmaWxlbmFtZS8qLCBvcHRpb25zKi8pIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlcyA9IHJlc3VsdHMubWVzc2FnZXMsXG4gICAgICAgICAgICAgICAgb3V0cHV0ID0gW107XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogR2VuZXJhdGUgYSBzb3VyY2Ugc3RyaW5nIGZvciBhIHJ1bGUuXG4gICAgICAgICAgICAgKiBDaGVja3N0eWxlIHNvdXJjZSBzdHJpbmdzIHVzdWFsbHkgcmVzZW1ibGUgSmF2YSBjbGFzcyBuYW1lcyBlLmdcbiAgICAgICAgICAgICAqIG5ldC5jc3NsaW50LlNvbWVSdWxlTmFtZVxuICAgICAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IHJ1bGVcbiAgICAgICAgICAgICAqIEByZXR1cm4gcnVsZSBzb3VyY2UgYXMge1N0cmluZ31cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdmFyIGdlbmVyYXRlU291cmNlID0gZnVuY3Rpb24ocnVsZSkge1xuICAgICAgICAgICAgICAgIGlmICghcnVsZSB8fCAhKFwibmFtZVwiIGluIHJ1bGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gXCJuZXQuY3NzbGludC5cIiArIHJ1bGUubmFtZS5yZXBsYWNlKC9cXHMvZyxcIlwiKTtcbiAgICAgICAgICAgIH07XG5cblxuXG4gICAgICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPGZpbGUgbmFtZT1cXFwiXCIrZmlsZW5hbWUrXCJcXFwiPlwiKTtcbiAgICAgICAgICAgICAgICBDU1NMaW50LlV0aWwuZm9yRWFjaChtZXNzYWdlcywgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy9pZ25vcmUgcm9sbHVwcyBmb3Igbm93XG4gICAgICAgICAgICAgICAgICAgIGlmICghbWVzc2FnZS5yb2xsdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPGVycm9yIGxpbmU9XFxcIlwiICsgbWVzc2FnZS5saW5lICsgXCJcXFwiIGNvbHVtbj1cXFwiXCIgKyBtZXNzYWdlLmNvbCArIFwiXFxcIiBzZXZlcml0eT1cXFwiXCIgKyBtZXNzYWdlLnR5cGUgKyBcIlxcXCJcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFwiIG1lc3NhZ2U9XFxcIlwiICsgeG1sRXNjYXBlKG1lc3NhZ2UubWVzc2FnZSkgKyBcIlxcXCIgc291cmNlPVxcXCJcIiArIGdlbmVyYXRlU291cmNlKG1lc3NhZ2UucnVsZSkgK1wiXFxcIi8+XCIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgb3V0cHV0LnB1c2goXCI8L2ZpbGU+XCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gb3V0cHV0LmpvaW4oXCJcIik7XG4gICAgICAgIH1cbiAgICB9KTtcblxufSgpKTtcblxuQ1NTTGludC5hZGRGb3JtYXR0ZXIoe1xuICAgIC8vZm9ybWF0IGluZm9ybWF0aW9uXG4gICAgaWQ6IFwiY29tcGFjdFwiLFxuICAgIG5hbWU6IFwiQ29tcGFjdCwgJ3BvcmNlbGFpbicgZm9ybWF0XCIsXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gY29udGVudCB0byBiZSBwcmludGVkIGJlZm9yZSBhbGwgZmlsZSByZXN1bHRzLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gdG8gcHJlcGVuZCBiZWZvcmUgYWxsIHJlc3VsdHNcbiAgICAgKi9cbiAgICBzdGFydEZvcm1hdDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gY29udGVudCB0byBiZSBwcmludGVkIGFmdGVyIGFsbCBmaWxlIHJlc3VsdHMuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBhcHBlbmQgYWZ0ZXIgYWxsIHJlc3VsdHNcbiAgICAgKi9cbiAgICBlbmRGb3JtYXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gQ1NTIExpbnQgcmVzdWx0cyBmb3IgYSBmaWxlLCByZXR1cm4gb3V0cHV0IGZvciB0aGlzIGZvcm1hdC5cbiAgICAgKiBAcGFyYW0gcmVzdWx0cyB7T2JqZWN0fSB3aXRoIGVycm9yIGFuZCB3YXJuaW5nIG1lc3NhZ2VzXG4gICAgICogQHBhcmFtIGZpbGVuYW1lIHtTdHJpbmd9IHJlbGF0aXZlIGZpbGUgcGF0aFxuICAgICAqIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IChPcHRpb25hbCkgc3BlY2lmaWVzIHNwZWNpYWwgaGFuZGxpbmcgb2Ygb3V0cHV0XG4gICAgICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgZm9yIHJlc3VsdHNcbiAgICAgKi9cbiAgICBmb3JtYXRSZXN1bHRzOiBmdW5jdGlvbihyZXN1bHRzLCBmaWxlbmFtZSwgb3B0aW9ucykge1xuICAgICAgICB2YXIgbWVzc2FnZXMgPSByZXN1bHRzLm1lc3NhZ2VzLFxuICAgICAgICAgICAgb3V0cHV0ID0gXCJcIjtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENhcGl0YWxpemUgYW5kIHJldHVybiBnaXZlbiBzdHJpbmcuXG4gICAgICAgICAqIEBwYXJhbSBzdHIge1N0cmluZ30gdG8gY2FwaXRhbGl6ZVxuICAgICAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IGNhcGl0YWxpemVkXG4gICAgICAgICAqL1xuICAgICAgICB2YXIgY2FwaXRhbGl6ZSA9IGZ1bmN0aW9uKHN0cikge1xuICAgICAgICAgICAgcmV0dXJuIHN0ci5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN0ci5zbGljZSgxKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgIHJldHVybiBvcHRpb25zLnF1aWV0ID8gXCJcIiA6IGZpbGVuYW1lICsgXCI6IExpbnQgRnJlZSFcIjtcbiAgICAgICAgfVxuXG4gICAgICAgIENTU0xpbnQuVXRpbC5mb3JFYWNoKG1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5yb2xsdXApIHtcbiAgICAgICAgICAgICAgICBvdXRwdXQgKz0gZmlsZW5hbWUgKyBcIjogXCIgKyBjYXBpdGFsaXplKG1lc3NhZ2UudHlwZSkgKyBcIiAtIFwiICsgbWVzc2FnZS5tZXNzYWdlICsgXCJcXG5cIjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0ICs9IGZpbGVuYW1lICsgXCI6IFwiICsgXCJsaW5lIFwiICsgbWVzc2FnZS5saW5lICtcbiAgICAgICAgICAgICAgICAgICAgXCIsIGNvbCBcIiArIG1lc3NhZ2UuY29sICsgXCIsIFwiICsgY2FwaXRhbGl6ZShtZXNzYWdlLnR5cGUpICsgXCIgLSBcIiArIG1lc3NhZ2UubWVzc2FnZSArIFwiIChcIiArIG1lc3NhZ2UucnVsZS5pZCArIFwiKVxcblwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gb3V0cHV0O1xuICAgIH1cbn0pO1xuXG5DU1NMaW50LmFkZEZvcm1hdHRlcih7XG4gICAgLy9mb3JtYXQgaW5mb3JtYXRpb25cbiAgICBpZDogXCJjc3NsaW50LXhtbFwiLFxuICAgIG5hbWU6IFwiQ1NTTGludCBYTUwgZm9ybWF0XCIsXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gb3BlbmluZyByb290IFhNTCB0YWcuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBwcmVwZW5kIGJlZm9yZSBhbGwgcmVzdWx0c1xuICAgICAqL1xuICAgIHN0YXJ0Rm9ybWF0OiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gXCI8P3htbCB2ZXJzaW9uPVxcXCIxLjBcXFwiIGVuY29kaW5nPVxcXCJ1dGYtOFxcXCI/Pjxjc3NsaW50PlwiO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gY2xvc2luZyByb290IFhNTCB0YWcuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBhcHBlbmQgYWZ0ZXIgYWxsIHJlc3VsdHNcbiAgICAgKi9cbiAgICBlbmRGb3JtYXQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiBcIjwvY3NzbGludD5cIjtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gQ1NTIExpbnQgcmVzdWx0cyBmb3IgYSBmaWxlLCByZXR1cm4gb3V0cHV0IGZvciB0aGlzIGZvcm1hdC5cbiAgICAgKiBAcGFyYW0gcmVzdWx0cyB7T2JqZWN0fSB3aXRoIGVycm9yIGFuZCB3YXJuaW5nIG1lc3NhZ2VzXG4gICAgICogQHBhcmFtIGZpbGVuYW1lIHtTdHJpbmd9IHJlbGF0aXZlIGZpbGUgcGF0aFxuICAgICAqIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IChVTlVTRUQgZm9yIG5vdykgc3BlY2lmaWVzIHNwZWNpYWwgaGFuZGxpbmcgb2Ygb3V0cHV0XG4gICAgICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgZm9yIHJlc3VsdHNcbiAgICAgKi9cbiAgICBmb3JtYXRSZXN1bHRzOiBmdW5jdGlvbihyZXN1bHRzLCBmaWxlbmFtZS8qLCBvcHRpb25zKi8pIHtcbiAgICAgICAgdmFyIG1lc3NhZ2VzID0gcmVzdWx0cy5tZXNzYWdlcyxcbiAgICAgICAgICAgIG91dHB1dCA9IFtdO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXBsYWNlIHNwZWNpYWwgY2hhcmFjdGVycyBiZWZvcmUgd3JpdGUgdG8gb3V0cHV0LlxuICAgICAgICAgKlxuICAgICAgICAgKiBSdWxlczpcbiAgICAgICAgICogIC0gc2luZ2xlIHF1b3RlcyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciBkb3VibGUtcXVvdGVzXG4gICAgICAgICAqICAtICZhbXA7IGlzIHRoZSBlc2NhcGUgc2VxdWVuY2UgZm9yICZcbiAgICAgICAgICogIC0gJmx0OyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciA8XG4gICAgICAgICAqICAtICZndDsgaXMgdGhlIGVzY2FwZSBzZXF1ZW5jZSBmb3IgPlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBlc2NhcGVcbiAgICAgICAgICogQHJldHVybiBlc2NhcGVkIG1lc3NhZ2UgYXMge1N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHZhciBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKHN0cikge1xuICAgICAgICAgICAgaWYgKCFzdHIgfHwgc3RyLmNvbnN0cnVjdG9yICE9PSBTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvXFxcIi9nLCBcIidcIikucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBvdXRwdXQucHVzaChcIjxmaWxlIG5hbWU9XFxcIlwiK2ZpbGVuYW1lK1wiXFxcIj5cIik7XG4gICAgICAgICAgICBDU1NMaW50LlV0aWwuZm9yRWFjaChtZXNzYWdlcywgZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgICAgICAgICAgICAgICBpZiAobWVzc2FnZS5yb2xsdXApIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0LnB1c2goXCI8aXNzdWUgc2V2ZXJpdHk9XFxcIlwiICsgbWVzc2FnZS50eXBlICsgXCJcXFwiIHJlYXNvbj1cXFwiXCIgKyBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyhtZXNzYWdlLm1lc3NhZ2UpICsgXCJcXFwiIGV2aWRlbmNlPVxcXCJcIiArIGVzY2FwZVNwZWNpYWxDaGFyYWN0ZXJzKG1lc3NhZ2UuZXZpZGVuY2UpICsgXCJcXFwiLz5cIik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0LnB1c2goXCI8aXNzdWUgbGluZT1cXFwiXCIgKyBtZXNzYWdlLmxpbmUgKyBcIlxcXCIgY2hhcj1cXFwiXCIgKyBtZXNzYWdlLmNvbCArIFwiXFxcIiBzZXZlcml0eT1cXFwiXCIgKyBtZXNzYWdlLnR5cGUgKyBcIlxcXCJcIiArXG4gICAgICAgICAgICAgICAgICAgICAgICBcIiByZWFzb249XFxcIlwiICsgZXNjYXBlU3BlY2lhbENoYXJhY3RlcnMobWVzc2FnZS5tZXNzYWdlKSArIFwiXFxcIiBldmlkZW5jZT1cXFwiXCIgKyBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyhtZXNzYWdlLmV2aWRlbmNlKSArIFwiXFxcIi8+XCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgb3V0cHV0LnB1c2goXCI8L2ZpbGU+XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG91dHB1dC5qb2luKFwiXCIpO1xuICAgIH1cbn0pO1xuXG5DU1NMaW50LmFkZEZvcm1hdHRlcih7XG4gICAgLy9mb3JtYXQgaW5mb3JtYXRpb25cbiAgICBpZDogXCJqdW5pdC14bWxcIixcbiAgICBuYW1lOiBcIkpVTklUIFhNTCBmb3JtYXRcIixcblxuICAgIC8qKlxuICAgICAqIFJldHVybiBvcGVuaW5nIHJvb3QgWE1MIHRhZy5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IHRvIHByZXBlbmQgYmVmb3JlIGFsbCByZXN1bHRzXG4gICAgICovXG4gICAgc3RhcnRGb3JtYXQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiBcIjw/eG1sIHZlcnNpb249XFxcIjEuMFxcXCIgZW5jb2Rpbmc9XFxcInV0Zi04XFxcIj8+PHRlc3RzdWl0ZXM+XCI7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybiBjbG9zaW5nIHJvb3QgWE1MIHRhZy5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IHRvIGFwcGVuZCBhZnRlciBhbGwgcmVzdWx0c1xuICAgICAqL1xuICAgIGVuZEZvcm1hdDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBcIjwvdGVzdHN1aXRlcz5cIjtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gQ1NTIExpbnQgcmVzdWx0cyBmb3IgYSBmaWxlLCByZXR1cm4gb3V0cHV0IGZvciB0aGlzIGZvcm1hdC5cbiAgICAgKiBAcGFyYW0gcmVzdWx0cyB7T2JqZWN0fSB3aXRoIGVycm9yIGFuZCB3YXJuaW5nIG1lc3NhZ2VzXG4gICAgICogQHBhcmFtIGZpbGVuYW1lIHtTdHJpbmd9IHJlbGF0aXZlIGZpbGUgcGF0aFxuICAgICAqIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IChVTlVTRUQgZm9yIG5vdykgc3BlY2lmaWVzIHNwZWNpYWwgaGFuZGxpbmcgb2Ygb3V0cHV0XG4gICAgICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgZm9yIHJlc3VsdHNcbiAgICAgKi9cbiAgICBmb3JtYXRSZXN1bHRzOiBmdW5jdGlvbihyZXN1bHRzLCBmaWxlbmFtZS8qLCBvcHRpb25zKi8pIHtcblxuICAgICAgICB2YXIgbWVzc2FnZXMgPSByZXN1bHRzLm1lc3NhZ2VzLFxuICAgICAgICAgICAgb3V0cHV0ID0gW10sXG4gICAgICAgICAgICB0ZXN0cyA9IHtcbiAgICAgICAgICAgICAgICBcImVycm9yXCI6IDAsXG4gICAgICAgICAgICAgICAgXCJmYWlsdXJlXCI6IDBcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEdlbmVyYXRlIGEgc291cmNlIHN0cmluZyBmb3IgYSBydWxlLlxuICAgICAgICAgKiBKVU5JVCBzb3VyY2Ugc3RyaW5ncyB1c3VhbGx5IHJlc2VtYmxlIEphdmEgY2xhc3MgbmFtZXMgZS5nXG4gICAgICAgICAqIG5ldC5jc3NsaW50LlNvbWVSdWxlTmFtZVxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gcnVsZVxuICAgICAgICAgKiBAcmV0dXJuIHJ1bGUgc291cmNlIGFzIHtTdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgZ2VuZXJhdGVTb3VyY2UgPSBmdW5jdGlvbihydWxlKSB7XG4gICAgICAgICAgICBpZiAoIXJ1bGUgfHwgIShcIm5hbWVcIiBpbiBydWxlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFwibmV0LmNzc2xpbnQuXCIgKyBydWxlLm5hbWUucmVwbGFjZSgvXFxzL2csXCJcIik7XG4gICAgICAgIH07XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlcGxhY2Ugc3BlY2lhbCBjaGFyYWN0ZXJzIGJlZm9yZSB3cml0ZSB0byBvdXRwdXQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJ1bGVzOlxuICAgICAgICAgKiAgLSBzaW5nbGUgcXVvdGVzIGlzIHRoZSBlc2NhcGUgc2VxdWVuY2UgZm9yIGRvdWJsZS1xdW90ZXNcbiAgICAgICAgICogIC0gJmx0OyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciA8XG4gICAgICAgICAqICAtICZndDsgaXMgdGhlIGVzY2FwZSBzZXF1ZW5jZSBmb3IgPlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBlc2NhcGVcbiAgICAgICAgICogQHJldHVybiBlc2NhcGVkIG1lc3NhZ2UgYXMge1N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHZhciBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKHN0cikge1xuXG4gICAgICAgICAgICBpZiAoIXN0ciB8fCBzdHIuY29uc3RydWN0b3IgIT09IFN0cmluZykge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXCIvZywgXCInXCIpLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKG1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcblxuICAgICAgICAgICAgbWVzc2FnZXMuZm9yRWFjaChmdW5jdGlvbiAobWVzc2FnZSkge1xuXG4gICAgICAgICAgICAgICAgLy8gc2luY2UganVuaXQgaGFzIG5vIHdhcm5pbmcgY2xhc3NcbiAgICAgICAgICAgICAgICAvLyBhbGwgaXNzdWVzIGFzIGVycm9yc1xuICAgICAgICAgICAgICAgIHZhciB0eXBlID0gbWVzc2FnZS50eXBlID09PSBcIndhcm5pbmdcIiA/IFwiZXJyb3JcIiA6IG1lc3NhZ2UudHlwZTtcblxuICAgICAgICAgICAgICAgIC8vaWdub3JlIHJvbGx1cHMgZm9yIG5vd1xuICAgICAgICAgICAgICAgIGlmICghbWVzc2FnZS5yb2xsdXApIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBidWlsZCB0aGUgdGVzdCBjYXNlIHNlcGVyYXRlbHksIG9uY2Ugam9pbmVkXG4gICAgICAgICAgICAgICAgICAgIC8vIHdlJ2xsIGFkZCBpdCB0byBhIGN1c3RvbSBhcnJheSBmaWx0ZXJlZCBieSB0eXBlXG4gICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPHRlc3RjYXNlIHRpbWU9XFxcIjBcXFwiIG5hbWU9XFxcIlwiICsgZ2VuZXJhdGVTb3VyY2UobWVzc2FnZS5ydWxlKSArIFwiXFxcIj5cIik7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPFwiICsgdHlwZSArIFwiIG1lc3NhZ2U9XFxcIlwiICsgZXNjYXBlU3BlY2lhbENoYXJhY3RlcnMobWVzc2FnZS5tZXNzYWdlKSArIFwiXFxcIj48IVtDREFUQVtcIiArIG1lc3NhZ2UubGluZSArIFwiOlwiICsgbWVzc2FnZS5jb2wgKyBcIjpcIiArIGVzY2FwZVNwZWNpYWxDaGFyYWN0ZXJzKG1lc3NhZ2UuZXZpZGVuY2UpICArIFwiXV0+PC9cIiArIHR5cGUgKyBcIj5cIik7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPC90ZXN0Y2FzZT5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgdGVzdHNbdHlwZV0gKz0gMTtcblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIG91dHB1dC51bnNoaWZ0KFwiPHRlc3RzdWl0ZSB0aW1lPVxcXCIwXFxcIiB0ZXN0cz1cXFwiXCIgKyBtZXNzYWdlcy5sZW5ndGggKyBcIlxcXCIgc2tpcHBlZD1cXFwiMFxcXCIgZXJyb3JzPVxcXCJcIiArIHRlc3RzLmVycm9yICsgXCJcXFwiIGZhaWx1cmVzPVxcXCJcIiArIHRlc3RzLmZhaWx1cmUgKyBcIlxcXCIgcGFja2FnZT1cXFwibmV0LmNzc2xpbnRcXFwiIG5hbWU9XFxcIlwiICsgZmlsZW5hbWUgKyBcIlxcXCI+XCIpO1xuICAgICAgICAgICAgb3V0cHV0LnB1c2goXCI8L3Rlc3RzdWl0ZT5cIik7XG5cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXRwdXQuam9pbihcIlwiKTtcblxuICAgIH1cbn0pO1xuXG5DU1NMaW50LmFkZEZvcm1hdHRlcih7XG4gICAgLy9mb3JtYXQgaW5mb3JtYXRpb25cbiAgICBpZDogXCJsaW50LXhtbFwiLFxuICAgIG5hbWU6IFwiTGludCBYTUwgZm9ybWF0XCIsXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gb3BlbmluZyByb290IFhNTCB0YWcuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBwcmVwZW5kIGJlZm9yZSBhbGwgcmVzdWx0c1xuICAgICAqL1xuICAgIHN0YXJ0Rm9ybWF0OiBmdW5jdGlvbigpe1xuICAgICAgICByZXR1cm4gXCI8P3htbCB2ZXJzaW9uPVxcXCIxLjBcXFwiIGVuY29kaW5nPVxcXCJ1dGYtOFxcXCI/PjxsaW50PlwiO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm4gY2xvc2luZyByb290IFhNTCB0YWcuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBhcHBlbmQgYWZ0ZXIgYWxsIHJlc3VsdHNcbiAgICAgKi9cbiAgICBlbmRGb3JtYXQ6IGZ1bmN0aW9uKCl7XG4gICAgICAgIHJldHVybiBcIjwvbGludD5cIjtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gQ1NTIExpbnQgcmVzdWx0cyBmb3IgYSBmaWxlLCByZXR1cm4gb3V0cHV0IGZvciB0aGlzIGZvcm1hdC5cbiAgICAgKiBAcGFyYW0gcmVzdWx0cyB7T2JqZWN0fSB3aXRoIGVycm9yIGFuZCB3YXJuaW5nIG1lc3NhZ2VzXG4gICAgICogQHBhcmFtIGZpbGVuYW1lIHtTdHJpbmd9IHJlbGF0aXZlIGZpbGUgcGF0aFxuICAgICAqIEBwYXJhbSBvcHRpb25zIHtPYmplY3R9IChVTlVTRUQgZm9yIG5vdykgc3BlY2lmaWVzIHNwZWNpYWwgaGFuZGxpbmcgb2Ygb3V0cHV0XG4gICAgICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgZm9yIHJlc3VsdHNcbiAgICAgKi9cbiAgICBmb3JtYXRSZXN1bHRzOiBmdW5jdGlvbihyZXN1bHRzLCBmaWxlbmFtZS8qLCBvcHRpb25zKi8pIHtcbiAgICAgICAgdmFyIG1lc3NhZ2VzID0gcmVzdWx0cy5tZXNzYWdlcyxcbiAgICAgICAgICAgIG91dHB1dCA9IFtdO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXBsYWNlIHNwZWNpYWwgY2hhcmFjdGVycyBiZWZvcmUgd3JpdGUgdG8gb3V0cHV0LlxuICAgICAgICAgKlxuICAgICAgICAgKiBSdWxlczpcbiAgICAgICAgICogIC0gc2luZ2xlIHF1b3RlcyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciBkb3VibGUtcXVvdGVzXG4gICAgICAgICAqICAtICZhbXA7IGlzIHRoZSBlc2NhcGUgc2VxdWVuY2UgZm9yICZcbiAgICAgICAgICogIC0gJmx0OyBpcyB0aGUgZXNjYXBlIHNlcXVlbmNlIGZvciA8XG4gICAgICAgICAqICAtICZndDsgaXMgdGhlIGVzY2FwZSBzZXF1ZW5jZSBmb3IgPlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSB0byBlc2NhcGVcbiAgICAgICAgICogQHJldHVybiBlc2NhcGVkIG1lc3NhZ2UgYXMge1N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIHZhciBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyA9IGZ1bmN0aW9uKHN0cikge1xuICAgICAgICAgICAgaWYgKCFzdHIgfHwgc3RyLmNvbnN0cnVjdG9yICE9PSBTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvXFxcIi9nLCBcIidcIikucmVwbGFjZSgvJi9nLCBcIiZhbXA7XCIpLnJlcGxhY2UoLzwvZywgXCImbHQ7XCIpLnJlcGxhY2UoLz4vZywgXCImZ3Q7XCIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cbiAgICAgICAgICAgIG91dHB1dC5wdXNoKFwiPGZpbGUgbmFtZT1cXFwiXCIrZmlsZW5hbWUrXCJcXFwiPlwiKTtcbiAgICAgICAgICAgIENTU0xpbnQuVXRpbC5mb3JFYWNoKG1lc3NhZ2VzLCBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIGlmIChtZXNzYWdlLnJvbGx1cCkge1xuICAgICAgICAgICAgICAgICAgICBvdXRwdXQucHVzaChcIjxpc3N1ZSBzZXZlcml0eT1cXFwiXCIgKyBtZXNzYWdlLnR5cGUgKyBcIlxcXCIgcmVhc29uPVxcXCJcIiArIGVzY2FwZVNwZWNpYWxDaGFyYWN0ZXJzKG1lc3NhZ2UubWVzc2FnZSkgKyBcIlxcXCIgZXZpZGVuY2U9XFxcIlwiICsgZXNjYXBlU3BlY2lhbENoYXJhY3RlcnMobWVzc2FnZS5ldmlkZW5jZSkgKyBcIlxcXCIvPlwiKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXRwdXQucHVzaChcIjxpc3N1ZSBsaW5lPVxcXCJcIiArIG1lc3NhZ2UubGluZSArIFwiXFxcIiBjaGFyPVxcXCJcIiArIG1lc3NhZ2UuY29sICsgXCJcXFwiIHNldmVyaXR5PVxcXCJcIiArIG1lc3NhZ2UudHlwZSArIFwiXFxcIlwiICtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiIHJlYXNvbj1cXFwiXCIgKyBlc2NhcGVTcGVjaWFsQ2hhcmFjdGVycyhtZXNzYWdlLm1lc3NhZ2UpICsgXCJcXFwiIGV2aWRlbmNlPVxcXCJcIiArIGVzY2FwZVNwZWNpYWxDaGFyYWN0ZXJzKG1lc3NhZ2UuZXZpZGVuY2UpICsgXCJcXFwiLz5cIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBvdXRwdXQucHVzaChcIjwvZmlsZT5cIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0cHV0LmpvaW4oXCJcIik7XG4gICAgfVxufSk7XG5cbkNTU0xpbnQuYWRkRm9ybWF0dGVyKHtcbiAgICAvL2Zvcm1hdCBpbmZvcm1hdGlvblxuICAgIGlkOiBcInRleHRcIixcbiAgICBuYW1lOiBcIlBsYWluIFRleHRcIixcblxuICAgIC8qKlxuICAgICAqIFJldHVybiBjb250ZW50IHRvIGJlIHByaW50ZWQgYmVmb3JlIGFsbCBmaWxlIHJlc3VsdHMuXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB0byBwcmVwZW5kIGJlZm9yZSBhbGwgcmVzdWx0c1xuICAgICAqL1xuICAgIHN0YXJ0Rm9ybWF0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybiBjb250ZW50IHRvIGJlIHByaW50ZWQgYWZ0ZXIgYWxsIGZpbGUgcmVzdWx0cy5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IHRvIGFwcGVuZCBhZnRlciBhbGwgcmVzdWx0c1xuICAgICAqL1xuICAgIGVuZEZvcm1hdDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBHaXZlbiBDU1MgTGludCByZXN1bHRzIGZvciBhIGZpbGUsIHJldHVybiBvdXRwdXQgZm9yIHRoaXMgZm9ybWF0LlxuICAgICAqIEBwYXJhbSByZXN1bHRzIHtPYmplY3R9IHdpdGggZXJyb3IgYW5kIHdhcm5pbmcgbWVzc2FnZXNcbiAgICAgKiBAcGFyYW0gZmlsZW5hbWUge1N0cmluZ30gcmVsYXRpdmUgZmlsZSBwYXRoXG4gICAgICogQHBhcmFtIG9wdGlvbnMge09iamVjdH0gKE9wdGlvbmFsKSBzcGVjaWZpZXMgc3BlY2lhbCBoYW5kbGluZyBvZiBvdXRwdXRcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IG91dHB1dCBmb3IgcmVzdWx0c1xuICAgICAqL1xuICAgIGZvcm1hdFJlc3VsdHM6IGZ1bmN0aW9uKHJlc3VsdHMsIGZpbGVuYW1lLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBtZXNzYWdlcyA9IHJlc3VsdHMubWVzc2FnZXMsXG4gICAgICAgICAgICBvdXRwdXQgPSBcIlwiO1xuICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gb3B0aW9ucy5xdWlldCA/IFwiXCIgOiBcIlxcblxcbmNzc2xpbnQ6IE5vIGVycm9ycyBpbiBcIiArIGZpbGVuYW1lICsgXCIuXCI7XG4gICAgICAgIH1cblxuICAgICAgICBvdXRwdXQgPSBcIlxcblxcbmNzc2xpbnQ6IFRoZXJlIFwiO1xuICAgICAgICBpZiAobWVzc2FnZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBvdXRwdXQgKz0gXCJpcyAxIHByb2JsZW1cIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG91dHB1dCArPSBcImFyZSBcIiArIG1lc3NhZ2VzLmxlbmd0aCAgKyAgXCIgcHJvYmxlbXNcIjtcbiAgICAgICAgfVxuICAgICAgICBvdXRwdXQgKz0gXCIgaW4gXCIgKyBmaWxlbmFtZSArIFwiLlwiO1xuXG4gICAgICAgIHZhciBwb3MgPSBmaWxlbmFtZS5sYXN0SW5kZXhPZihcIi9cIiksXG4gICAgICAgICAgICBzaG9ydEZpbGVuYW1lID0gZmlsZW5hbWU7XG5cbiAgICAgICAgaWYgKHBvcyA9PT0gLTEpe1xuICAgICAgICAgICAgcG9zID0gZmlsZW5hbWUubGFzdEluZGV4T2YoXCJcXFxcXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChwb3MgPiAtMSl7XG4gICAgICAgICAgICBzaG9ydEZpbGVuYW1lID0gZmlsZW5hbWUuc3Vic3RyaW5nKHBvcysxKTtcbiAgICAgICAgfVxuXG4gICAgICAgIENTU0xpbnQuVXRpbC5mb3JFYWNoKG1lc3NhZ2VzLCBmdW5jdGlvbiAobWVzc2FnZSwgaSkge1xuICAgICAgICAgICAgb3V0cHV0ID0gb3V0cHV0ICsgXCJcXG5cXG5cIiArIHNob3J0RmlsZW5hbWU7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5yb2xsdXApIHtcbiAgICAgICAgICAgICAgICBvdXRwdXQgKz0gXCJcXG5cIiArIChpKzEpICsgXCI6IFwiICsgbWVzc2FnZS50eXBlO1xuICAgICAgICAgICAgICAgIG91dHB1dCArPSBcIlxcblwiICsgbWVzc2FnZS5tZXNzYWdlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdXRwdXQgKz0gXCJcXG5cIiArIChpKzEpICsgXCI6IFwiICsgbWVzc2FnZS50eXBlICsgXCIgYXQgbGluZSBcIiArIG1lc3NhZ2UubGluZSArIFwiLCBjb2wgXCIgKyBtZXNzYWdlLmNvbDtcbiAgICAgICAgICAgICAgICBvdXRwdXQgKz0gXCJcXG5cIiArIG1lc3NhZ2UubWVzc2FnZTtcbiAgICAgICAgICAgICAgICBvdXRwdXQgKz0gXCJcXG5cIiArIG1lc3NhZ2UuZXZpZGVuY2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBvdXRwdXQ7XG4gICAgfVxufSk7Il19