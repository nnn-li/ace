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
define(["require", "exports", "./CstyleBehaviour", "../../TokenIterator"], function (require, exports, CstyleBehaviour_1, TokenIterator_1) {
    var CssBehavior = (function (_super) {
        __extends(CssBehavior, _super);
        function CssBehavior() {
            _super.call(this);
            this.inherit(CstyleBehaviour_1.default);
            this.add("colon", "insertion", function (state, action, editor, session, text) {
                if (text === ':') {
                    var cursor = editor.getCursorPosition();
                    var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
                    var token = iterator.getCurrentToken();
                    if (token && token.value.match(/\s+/)) {
                        token = iterator.stepBackward();
                    }
                    if (token && token.type === 'support.type') {
                        var line = session.doc.getLine(cursor.row);
                        var rightChar = line.substring(cursor.column, cursor.column + 1);
                        if (rightChar === ':') {
                            return {
                                text: '',
                                selection: [1, 1]
                            };
                        }
                        if (!line.substring(cursor.column).match(/^\s*;/)) {
                            return {
                                text: ':;',
                                selection: [1, 1]
                            };
                        }
                    }
                }
            });
            this.add("colon", "deletion", function (state, action, editor, session, range) {
                var selected = session.doc.getTextRange(range);
                if (!range.isMultiLine() && selected === ':') {
                    var cursor = editor.getCursorPosition();
                    var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
                    var token = iterator.getCurrentToken();
                    if (token && token.value.match(/\s+/)) {
                        token = iterator.stepBackward();
                    }
                    if (token && token.type === 'support.type') {
                        var line = session.doc.getLine(range.start.row);
                        var rightChar = line.substring(range.end.column, range.end.column + 1);
                        if (rightChar === ';') {
                            range.end.column++;
                            return range;
                        }
                    }
                }
            });
            this.add("semicolon", "insertion", function (state, action, editor, session, text) {
                if (text === ';') {
                    var cursor = editor.getCursorPosition();
                    var line = session.doc.getLine(cursor.row);
                    var rightChar = line.substring(cursor.column, cursor.column + 1);
                    if (rightChar === ';') {
                        return {
                            text: '',
                            selection: [1, 1]
                        };
                    }
                }
            });
        }
        return CssBehavior;
    })(CstyleBehaviour_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = CssBehavior;
});
