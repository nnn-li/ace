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
define(["require", "exports", "./TextHighlightRules"], function (require, exports, TextHighlightRules_1) {
    var DocCommentHighlightRules = (function (_super) {
        __extends(DocCommentHighlightRules, _super);
        function DocCommentHighlightRules() {
            _super.call(this);
            this.$rules = {
                "start": [{
                        token: "comment.doc.tag",
                        regex: "@[\\w\\d_]+" // TODO: fix email addresses
                    }, {
                        token: "comment.doc.tag",
                        regex: "\\bTODO\\b"
                    }, {
                        defaultToken: "comment.doc"
                    }]
            };
        }
        DocCommentHighlightRules.getStartRule = function (start) {
            return {
                token: "comment.doc",
                regex: "\\/\\*(?=\\*)",
                next: start
            };
        };
        DocCommentHighlightRules.getEndRule = function (start) {
            return {
                token: "comment.doc",
                regex: "\\*\\/",
                next: start
            };
        };
        return DocCommentHighlightRules;
    })(TextHighlightRules_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = DocCommentHighlightRules;
});
