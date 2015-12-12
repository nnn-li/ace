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
import Mirror from "../worker/Mirror";
import SAXParser from "./html/SAXParser";
import IWorkerCallback from "../IWorkerCallback";

var errorTypes = {
    "expected-doctype-but-got-start-tag": "info",
    "expected-doctype-but-got-chars": "info",
    "non-html-root": "info",
}

export default class HtmlWorker extends Mirror {
    context;
    constructor(sender: IWorkerCallback) {
        super(sender);
        this.setOptions();
        sender.emit('initAfter');
    }

    setOptions(options?: { context }) {
        if (options) {
            this.context = options.context;
        }
        else {
            this.context = void 0;
        }
        this.doc.getValue() && this.deferredUpdate.schedule(100);
    }

    onUpdate() {
        var value = this.doc.getValue();
        if (!value) {
            return;
        }
        var errors = [];
        var parser = new SAXParser();
        if (parser) {
            var noop = function() { };
            parser.contentHandler = {
                startDocument: noop,
                endDocument: noop,
                startElement: noop,
                endElement: noop,
                characters: noop
            };
            parser.errorHandler = {
                error: function(message: string, location: { line: number; column: number }, code: string) {
                    errors.push({
                        row: location.line,
                        column: location.column,
                        text: message,
                        type: errorTypes[code] || "error"
                    });
                }
            };
            if (this.context) {
                parser.parseFragment(value, this.context);
            }
            else {
                parser.parse(value);
            }
        }
        this.sender.emit("error", errors);
    }
}
