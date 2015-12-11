var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "../lib/lang", "./Mode", "./JavaScriptMode", "./CssMode", "./HtmlHighlightRules", "./behaviour/HtmlBehaviour", "./folding/HtmlFoldMode", "./HtmlCompletions", "../worker/WorkerClient"], function (require, exports, lang_1, Mode_1, JavaScriptMode_1, CssMode_1, HtmlHighlightRules_1, HtmlBehaviour_1, HtmlFoldMode_1, HtmlCompletions_1, WorkerClient_1) {
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
    "use strict";
    // http://www.w3.org/TR/html5/syntax.html#void-elements
    var voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
    var optionalEndTags = ["li", "dt", "dd", "p", "rt", "rp", "optgroup", "option", "colgroup", "td", "th"];
    /**
     * @class HtmlMode
     */
    var HtmlMode = (function (_super) {
        __extends(HtmlMode, _super);
        /**
         * @class HtmlMode
         * @constructor
         */
        function HtmlMode(options) {
            _super.call(this);
            this.blockComment = { start: "<!--", end: "-->" };
            this.voidElements = lang_1.arrayToMap(voidElements);
            this.$id = "ace/mode/html";
            this.fragmentContext = options && options.fragmentContext;
            this.HighlightRules = HtmlHighlightRules_1.default;
            this.$behaviour = new HtmlBehaviour_1.default();
            this.$completer = new HtmlCompletions_1.default();
            this.createModeDelegates({
                "js-": JavaScriptMode_1.default,
                "css-": CssMode_1.default
            });
            this.foldingRules = new HtmlFoldMode_1.default(this.voidElements, lang_1.arrayToMap(optionalEndTags));
        }
        HtmlMode.prototype.getNextLineIndent = function (state, line, tab) {
            return this.$getIndent(line);
        };
        HtmlMode.prototype.checkOutdent = function (state, line, text) {
            return false;
        };
        HtmlMode.prototype.getCompletions = function (state, session, pos, prefix) {
            return this.$completer.getCompletions(state, session, pos, prefix);
        };
        HtmlMode.prototype.createWorker = function (session) {
            var worker = new WorkerClient_1.default("lib/worker/worker-systemjs.js");
            var mode = this;
            worker.on("initAfter", function () {
                worker.attachToDocument(session.getDocument());
                if (mode.fragmentContext) {
                    worker.call("setOptions", [{ context: mode.fragmentContext }]);
                }
            });
            // FIXME: Standardize
            worker.on("error", function (message) {
                session.setAnnotations(message.data);
            });
            worker.on("terminate", function () {
                session.clearAnnotations();
            });
            worker.init("lib/mode/HtmlWorker", "default");
            return worker;
        };
        ;
        return HtmlMode;
    })(Mode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HtmlMode;
});
