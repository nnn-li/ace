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

import {inherits} from "../lib/oop";
import {arrayToMap} from "../lib/lang";
import Annotation from "../Annotation";
import TextMode from "./Mode";
import JavaScriptMode from "./JavaScriptMode";
import CssMode from "./CssMode";
import HtmlHighlightRules from "./HtmlHighlightRules";
import HtmlBehaviour from "./behaviour/HtmlBehaviour";
import HtmlFoldMode from "./folding/HtmlFoldMode";
import HtmlCompletions from "./HtmlCompletions";
import WorkerClient from "../worker/WorkerClient";
import EditSession from "../EditSession";

// http://www.w3.org/TR/html5/syntax.html#void-elements
var voidElements = ["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"];
var optionalEndTags = ["li", "dt", "dd", "p", "rt", "rp", "optgroup", "option", "colgroup", "td", "th"];

/**
 * @class HtmlMode
 */
export default class HtmlMode extends TextMode {
    protected blockComment = { start: "<!--", end: "-->" };
    private voidElements = arrayToMap(voidElements);
    public $id = "ace/mode/html";

    /**
     * The name of the element for fragment parsing.
     */
    private fragmentContext: string;

    $completer: HtmlCompletions;

    /**
     * @class HtmlMode
     * @constructor
     */
    constructor(options?: { fragmentContext: string }) {
        super();
        this.fragmentContext = options && options.fragmentContext;
        this.HighlightRules = HtmlHighlightRules;
        this.$behaviour = new HtmlBehaviour();
        this.$completer = new HtmlCompletions();

        this.createModeDelegates({
            "js-": JavaScriptMode,
            "css-": CssMode
        });

        this.foldingRules = new HtmlFoldMode(this.voidElements, arrayToMap(optionalEndTags));
    }

    getNextLineIndent(state: string, line: string, tab: string): string {
        return this.$getIndent(line);
    }

    checkOutdent(state: string, line: string, text: string): boolean {
        return false;
    }

    getCompletions(state: string, session: EditSession, pos: { row: number; column: number }, prefix: string) {
        return this.$completer.getCompletions(state, session, pos, prefix);
    }

    createWorker(session: EditSession): WorkerClient {

        var worker = new WorkerClient("lib/worker/worker-systemjs.js");
        var mode = this;

        worker.on("initAfter", function() {
            worker.attachToDocument(session.getDocument());
            if (mode.fragmentContext) {
                worker.call("setOptions", [{ context: mode.fragmentContext }]);
            }
        });

        // FIXME: Standardize
        worker.on("error", function(message: {data: Annotation[]}) {
            session.setAnnotations(message.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        worker.init("lib/mode/HtmlWorker", "default");

        return worker;
    };
}
