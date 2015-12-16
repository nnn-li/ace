"use strict";
import CstyleBehaviour from "./CstyleBehaviour";
import TokenIterator from "../../TokenIterator";
export default class CssBehavior extends CstyleBehaviour {
    constructor() {
        super();
        this.inherit(new CstyleBehaviour());
        this.add("colon", "insertion", function (state, action, editor, session, text) {
            if (text === ':') {
                var cursor = editor.getCursorPosition();
                var iterator = new TokenIterator(session, cursor.row, cursor.column);
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
                var iterator = new TokenIterator(session, cursor.row, cursor.column);
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
}
