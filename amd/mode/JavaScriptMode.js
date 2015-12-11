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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./Mode", "./JavaScriptHighlightRules", "./MatchingBraceOutdent", "../worker/WorkerClient", "./behaviour/CstyleBehaviour", "./folding/CstyleFoldMode"], function (require, exports, Mode_1, JavaScriptHighlightRules_1, MatchingBraceOutdent_1, WorkerClient_1, CstyleBehaviour_1, CstyleFoldMode_1) {
    var JavaScriptMode = (function (_super) {
        __extends(JavaScriptMode, _super);
        function JavaScriptMode() {
            _super.call(this);
            // The Tokenizer will be built using these rules.
            this.HighlightRules = JavaScriptHighlightRules_1.default;
            this.$outdent = new MatchingBraceOutdent_1.default();
            this.$behaviour = new CstyleBehaviour_1.default();
            this.foldingRules = new CstyleFoldMode_1.default();
            this.lineCommentStart = "//";
            this.blockComment = { start: "/*", end: "*/" };
            this.$id = "ace/mode/javascript";
        }
        JavaScriptMode.prototype.getNextLineIndent = function (state, line, tab) {
            var indent = this.$getIndent(line);
            var tokenizedLine = this.getTokenizer().getLineTokens(line, state);
            var tokens = tokenizedLine.tokens;
            var endState = tokenizedLine.state;
            if (tokens.length && tokens[tokens.length - 1].type == "comment") {
                return indent;
            }
            if (state === "start" || state === "no_regex") {
                var match = line.match(/^.*(?:\bcase\b.*\:|[\{\(\[])\s*$/);
                if (match) {
                    indent += tab;
                }
            }
            else if (state === "doc-start") {
                if (endState == "start" || endState == "no_regex") {
                    return "";
                }
                var match = line.match(/^\s*(\/?)\*/);
                if (match) {
                    if (match[1]) {
                        indent += " ";
                    }
                    indent += "* ";
                }
            }
            return indent;
        };
        JavaScriptMode.prototype.checkOutdent = function (state, line, text) {
            return this.$outdent.checkOutdent(line, text);
        };
        ;
        JavaScriptMode.prototype.autoOutdent = function (state, session, row) {
            return this.$outdent.autoOutdent(session, row);
        };
        ;
        JavaScriptMode.prototype.createWorker = function (session) {
            var worker = new WorkerClient_1.default("lib/worker/worker-systemjs.js");
            worker.on("initAfter", function () {
                worker.attachToDocument(session.getDocument());
            });
            worker.on("errors", function (errors) {
                session.setAnnotations(errors.data);
            });
            worker.on("terminate", function () {
                session.clearAnnotations();
            });
            worker.init("lib/mode/JavaScriptWorker", "default");
            return worker;
        };
        return JavaScriptMode;
    })(Mode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = JavaScriptMode;
});
