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
define(["require", "exports", "./FoldMode"], function (require, exports, FoldMode_1) {
    var MixedFoldMode = (function (_super) {
        __extends(MixedFoldMode, _super);
        function MixedFoldMode(defaultMode, subModes) {
            _super.call(this);
            this.defaultMode = defaultMode;
            this.subModes = subModes;
        }
        MixedFoldMode.prototype.$getMode = function (state) {
            if (typeof state != "string")
                state = state[0];
            for (var key in this.subModes) {
                if (state.indexOf(key) === 0)
                    return this.subModes[key];
            }
            return null;
        };
        MixedFoldMode.prototype.$tryMode = function (state, session, foldStyle, row) {
            var mode = this.$getMode(state);
            return (mode ? mode.getFoldWidget(session, foldStyle, row) : "");
        };
        MixedFoldMode.prototype.getFoldWidget = function (session, foldStyle, row) {
            return (this.$tryMode(session.getState(row - 1), session, foldStyle, row) ||
                this.$tryMode(session.getState(row), session, foldStyle, row) ||
                this.defaultMode.getFoldWidget(session, foldStyle, row));
        };
        MixedFoldMode.prototype.getFoldWidgetRange = function (session, foldStyle, row) {
            var mode = this.$getMode(session.getState(row - 1));
            if (!mode || !mode.getFoldWidget(session, foldStyle, row))
                mode = this.$getMode(session.getState(row));
            if (!mode || !mode.getFoldWidget(session, foldStyle, row))
                mode = this.defaultMode;
            return mode.getFoldWidgetRange(session, foldStyle, row);
        };
        return MixedFoldMode;
    })(FoldMode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = MixedFoldMode;
});
