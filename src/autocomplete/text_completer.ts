/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
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

import Completion from '../Completion';
import EditSession from '../EditSession';
import Editor from '../Editor';
import Position from "../Position";
import Range from "../Range";

/**
 * A map from the word (string) to score (number).
 */
interface WordScores {
    [word: string]: number;
}

/**
 * Does a distance analysis of the word at position `pos` in `doc`.
 */
function wordDistance(position: Position, session: EditSession): WordScores {
    var splitRegex: RegExp = /[^a-zA-Z_0-9\$\-\u00C0-\u1FFF\u2C00-\uD7FF\w]+/;

    function getWordIndex(): number {
        var textBefore = session.getTextRange(Range.fromPoints({ row: 0, column: 0 }, position));
        return textBefore.split(splitRegex).length - 1;
    }

    var prefixPos: number = getWordIndex();
    var words: string[] = session.getValue().split(splitRegex);
    var wordScores: WordScores = Object.create(null);

    var currentWord: string = words[prefixPos];

    words.forEach(function(word: string, index: number) {
        if (!word || word === currentWord) return;

        var distance = Math.abs(prefixPos - index);
        var score = words.length - distance;
        if (wordScores[word]) {
            wordScores[word] = Math.max(score, wordScores[word]);
        }
        else {
            wordScores[word] = score;
        }
    });
    return wordScores;
}

/**
 * This textual completer is rather dumb.
 */
export default function getCompletions(editor: Editor, session: EditSession, pos: Position, prefix: string, callback: (err, completions: Completion[]) => void) {

    var wordScore: WordScores = wordDistance(pos, session);

    var wordList: string[] = Object.keys(wordScore);

    callback(null, wordList.map(function(word: string) {
        return {
            caption: word,
            value: word,
            score: wordScore[word],
            meta: "local"
        };
    }));
}

