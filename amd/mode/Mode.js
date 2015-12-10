/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
define(["require", "exports", "../Tokenizer", "./TextHighlightRules", "./Behaviour", "../unicode", "../lib/lang", "../TokenIterator", "../Range"], function (require, exports, Tokenizer_1, TextHighlightRules_1, Behaviour_1, unicode_1, lang_1, TokenIterator_1, Range_1) {
    /**
     * @class Mode
     */
    var Mode = (function () {
        function Mode() {
            this.HighlightRules = TextHighlightRules_1.default;
            this.$behaviour = new Behaviour_1.default();
            this.tokenRe = new RegExp("^["
                + unicode_1.packages.L
                + unicode_1.packages.Mn + unicode_1.packages.Mc
                + unicode_1.packages.Nd
                + unicode_1.packages.Pc + "\\$_]+", "g");
            this.nonTokenRe = new RegExp("^(?:[^"
                + unicode_1.packages.L
                + unicode_1.packages.Mn + unicode_1.packages.Mc
                + unicode_1.packages.Nd
                + unicode_1.packages.Pc + "\\$_]|\\s])+", "g");
            this.lineCommentStart = "";
            this.blockComment = "";
            this.$id = "ace/mode/text";
        }
        Mode.prototype.getTokenizer = function () {
            if (!this.$tokenizer) {
                this.$highlightRules = this.$highlightRules || new this.HighlightRules();
                this.$tokenizer = new Tokenizer_1.default(this.$highlightRules.getRules());
            }
            return this.$tokenizer;
        };
        Mode.prototype.toggleCommentLines = function (state, session, startRow, endRow) {
            var doc = session.doc;
            var ignoreBlankLines = true;
            var shouldRemove = true;
            var minIndent = Infinity;
            var tabSize = session.getTabSize();
            var insertAtTabStop = false;
            if (!this.lineCommentStart) {
                if (!this.blockComment)
                    return false;
                var lineCommentStart = this.blockComment.start;
                var lineCommentEnd = this.blockComment.end;
                var regexpStart = new RegExp("^(\\s*)(?:" + lang_1.escapeRegExp(lineCommentStart) + ")");
                var regexpEnd = new RegExp("(?:" + lang_1.escapeRegExp(lineCommentEnd) + ")\\s*$");
                var comment = function (line, i) {
                    if (testRemove(line, i))
                        return;
                    if (!ignoreBlankLines || /\S/.test(line)) {
                        doc.insertInLine({ row: i, column: line.length }, lineCommentEnd);
                        doc.insertInLine({ row: i, column: minIndent }, lineCommentStart);
                    }
                };
                var uncomment = function (line, i) {
                    var m;
                    if (m = line.match(regexpEnd))
                        doc.removeInLine(i, line.length - m[0].length, line.length);
                    if (m = line.match(regexpStart))
                        doc.removeInLine(i, m[1].length, m[0].length);
                };
                var testRemove = function (line, row) {
                    if (regexpStart.test(line))
                        return true;
                    var tokens = session.getTokens(row);
                    for (var i = 0; i < tokens.length; i++) {
                        if (tokens[i].type === 'comment')
                            return true;
                    }
                };
            }
            else {
                if (Array.isArray(this.lineCommentStart)) {
                    var regexpStartString = this.lineCommentStart.map(lang_1.escapeRegExp).join("|");
                    var lineCommentStart = this.lineCommentStart[0];
                }
                else {
                    var regexpStartString = lang_1.escapeRegExp(this.lineCommentStart);
                    var lineCommentStart = this.lineCommentStart;
                }
                regexpStart = new RegExp("^(\\s*)(?:" + regexpStartString + ") ?");
                insertAtTabStop = session.getUseSoftTabs();
                var uncomment = function (line, i) {
                    var m = line.match(regexpStart);
                    if (!m)
                        return;
                    var start = m[1].length, end = m[0].length;
                    if (!shouldInsertSpace(line, start, end) && m[0][end - 1] == " ")
                        end--;
                    doc.removeInLine(i, start, end);
                };
                var commentWithSpace = lineCommentStart + " ";
                var comment = function (line, i) {
                    if (!ignoreBlankLines || /\S/.test(line)) {
                        if (shouldInsertSpace(line, minIndent, minIndent))
                            doc.insertInLine({ row: i, column: minIndent }, commentWithSpace);
                        else
                            doc.insertInLine({ row: i, column: minIndent }, lineCommentStart);
                    }
                };
                var testRemove = function (line, i) {
                    return regexpStart.test(line);
                };
                var shouldInsertSpace = function (line, before, after) {
                    var spaces = 0;
                    while (before-- && line.charAt(before) == " ")
                        spaces++;
                    if (spaces % tabSize != 0)
                        return false;
                    var spaces = 0;
                    while (line.charAt(after++) == " ")
                        spaces++;
                    if (tabSize > 2)
                        return spaces % tabSize != tabSize - 1;
                    else
                        return spaces % tabSize == 0;
                    return true;
                };
            }
            function iter(fun) {
                for (var i = startRow; i <= endRow; i++)
                    fun(doc.getLine(i), i);
            }
            var minEmptyLength = Infinity;
            iter(function (line, row) {
                var indent = line.search(/\S/);
                if (indent !== -1) {
                    if (indent < minIndent)
                        minIndent = indent;
                    if (shouldRemove && !testRemove(line, row))
                        shouldRemove = false;
                }
                else if (minEmptyLength > line.length) {
                    minEmptyLength = line.length;
                }
            });
            if (minIndent == Infinity) {
                minIndent = minEmptyLength;
                ignoreBlankLines = false;
                shouldRemove = false;
            }
            if (insertAtTabStop && minIndent % tabSize != 0)
                minIndent = Math.floor(minIndent / tabSize) * tabSize;
            iter(shouldRemove ? uncomment : comment);
        };
        Mode.prototype.toggleBlockComment = function (state, session, range, cursor) {
            var comment = this.blockComment;
            if (!comment)
                return;
            if (!comment.start && comment[0])
                comment = comment[0];
            var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
            var token = iterator.getCurrentToken();
            var selection = session.getSelection();
            var initialRange = selection.toOrientedRange();
            var startRow, colDiff;
            if (token && /comment/.test(token.type)) {
                var startRange, endRange;
                while (token && /comment/.test(token.type)) {
                    var i = token.value.indexOf(comment.start);
                    if (i != -1) {
                        var row = iterator.getCurrentTokenRow();
                        var column = iterator.getCurrentTokenColumn() + i;
                        startRange = new Range_1.default(row, column, row, column + comment.start.length);
                        break;
                    }
                    token = iterator.stepBackward();
                }
                var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
                var token = iterator.getCurrentToken();
                while (token && /comment/.test(token.type)) {
                    var i = token.value.indexOf(comment.end);
                    if (i != -1) {
                        var row = iterator.getCurrentTokenRow();
                        var column = iterator.getCurrentTokenColumn() + i;
                        endRange = new Range_1.default(row, column, row, column + comment.end.length);
                        break;
                    }
                    token = iterator.stepForward();
                }
                if (endRange)
                    session.remove(endRange);
                if (startRange) {
                    session.remove(startRange);
                    startRow = startRange.start.row;
                    colDiff = -comment.start.length;
                }
            }
            else {
                colDiff = comment.start.length;
                startRow = range.start.row;
                session.insert(range.end, comment.end);
                session.insert(range.start, comment.start);
            }
            // todo: selection should have ended up in the right place automatically!
            if (initialRange.start.row == startRow)
                initialRange.start.column += colDiff;
            if (initialRange.end.row == startRow)
                initialRange.end.column += colDiff;
            session.getSelection().fromOrientedRange(initialRange);
        };
        Mode.prototype.getNextLineIndent = function (state, line, tab) {
            return this.$getIndent(line);
        };
        Mode.prototype.checkOutdent = function (state, line, text) {
            return false;
        };
        Mode.prototype.autoOutdent = function (state, session, row) {
            return 0;
        };
        Mode.prototype.$getIndent = function (line) {
            return line.match(/^\s*/)[0];
        };
        Mode.prototype.createWorker = function (session) {
            return null;
        };
        Mode.prototype.createModeDelegates = function (mapping) {
            this.$embeds = [];
            this.$modes = {};
            for (var p in mapping) {
                if (mapping[p]) {
                    this.$embeds.push(p);
                    this.$modes[p] = new mapping[p]();
                }
            }
            var delegations = ['toggleBlockComment', 'toggleCommentLines', 'getNextLineIndent',
                'checkOutdent', 'autoOutdent', 'transformAction', 'getCompletions'];
            for (var k = 0; k < delegations.length; k++) {
                (function (scope) {
                    var functionName = delegations[k];
                    var defaultHandler = scope[functionName];
                    scope[delegations[k]] = function () {
                        return this.$delegator(functionName, arguments, defaultHandler);
                    };
                }(this));
            }
        };
        Mode.prototype.$delegator = function (method, args, defaultHandler) {
            var state = args[0];
            if (typeof state != "string")
                state = state[0];
            for (var i = 0; i < this.$embeds.length; i++) {
                if (!this.$modes[this.$embeds[i]])
                    continue;
                var split = state.split(this.$embeds[i]);
                if (!split[0] && split[1]) {
                    args[0] = split[1];
                    var mode = this.$modes[this.$embeds[i]];
                    return mode[method].apply(mode, args);
                }
            }
            var ret = defaultHandler.apply(this, args);
            return defaultHandler ? ret : undefined;
        };
        Mode.prototype.transformAction = function (state, action, editor, session, param) {
            if (this.$behaviour) {
                var behaviours = this.$behaviour.getBehaviours();
                for (var key in behaviours) {
                    if (behaviours[key][action]) {
                        var ret = behaviours[key][action].apply(this, arguments);
                        if (ret) {
                            return ret;
                        }
                    }
                }
            }
        };
        Mode.prototype.getKeywords = function (append) {
            // this is for autocompletion to pick up regexp'ed keywords
            if (!this.completionKeywords) {
                var rules = this.$tokenizer.states;
                var completionKeywords = [];
                for (var rule in rules) {
                    var ruleItr = rules[rule];
                    for (var r = 0, l = ruleItr.length; r < l; r++) {
                        if (typeof ruleItr[r].token === "string") {
                            if (/keyword|support|storage/.test(ruleItr[r].token))
                                completionKeywords.push(ruleItr[r].regex);
                        }
                        else if (typeof ruleItr[r].token === "object") {
                            for (var a = 0, aLength = ruleItr[r].token.length; a < aLength; a++) {
                                if (/keyword|support|storage/.test(ruleItr[r].token[a])) {
                                    // drop surrounding parens
                                    var rule = ruleItr[r].regex.match(/\(.+?\)/g)[a];
                                    completionKeywords.push(rule.substr(1, rule.length - 2));
                                }
                            }
                        }
                    }
                }
                this.completionKeywords = completionKeywords;
            }
            // this is for highlighting embed rules, like HAML/Ruby or Obj-C/C
            if (!append) {
                return this.$keywordList;
            }
            return completionKeywords.concat(this.$keywordList || []);
        };
        Mode.prototype.$createKeywordList = function () {
            if (!this.$highlightRules)
                this.getTokenizer();
            return this.$keywordList = this.$highlightRules.$keywordList || [];
        };
        Mode.prototype.getCompletions = function (state, session, pos, prefix) {
            var keywords = this.$keywordList || this.$createKeywordList();
            return keywords.map(function (word) {
                return {
                    name: word,
                    value: word,
                    score: 0,
                    meta: "keyword"
                };
            });
        };
        return Mode;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Mode;
});
