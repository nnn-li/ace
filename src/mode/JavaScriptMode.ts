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

import {inherits} from "../lib/oop";
import Mode from "./Mode";
import JavaScriptHighlightRules from "./javascript_highlight_rules";
import MatchingBraceOutdent from "./matching_brace_outdent";
import Range from "../Range";
import {WorkerClient} from "../worker/worker_client";
import CstyleBehaviour from "./behaviour/cstyle";
import CStyleFoldMode from "./folding/cstyle";
import EditSession from "../EditSession";

export default class JavaScriptMode extends Mode {
    $outdent: MatchingBraceOutdent;
    lineCommentStart: string;
    blockComment: { start: string; end: string };
    constructor() {
        super();
        // The Tokenizer will be built using these rules.
        this.HighlightRules = JavaScriptHighlightRules;

        this.$outdent = new MatchingBraceOutdent();
        this.$behaviour = new CstyleBehaviour();
        this.foldingRules = new CStyleFoldMode();
        this.lineCommentStart = "//";
        this.blockComment = { start: "/*", end: "*/" };

        this.$id = "ace/mode/javascript";
    }
    getNextLineIndent(state: string, line: string, tab: string): string {
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
    }

    checkOutdent(state, line: string, input: string): boolean {
        return this.$outdent.checkOutdent(line, input);
    };

    autoOutdent(state, session: EditSession, row: number) {
        this.$outdent.autoOutdent(session, row);
    };

    createWorker(session: EditSession): WorkerClient {

        var worker = new WorkerClient(["ace"], "ace/mode/javascript_worker", "JavaScriptWorker");

        worker.attachToDocument(session.getDocument());

        worker.on("jslint", function(results) {
            session.setAnnotations(results.data);
        });

        worker.on("terminate", function() {
            session.clearAnnotations();
        });

        return worker;
    }
}
