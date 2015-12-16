"use strict";
import Behaviour from "../Behaviour";
import TokenIterator from "../../TokenIterator";
function is(token, type) {
    return token.type.lastIndexOf(type + ".xml") > -1;
}
export default class XmlBehaviour extends Behaviour {
    constructor() {
        super();
        this.add("string_dquotes", "insertion", function (state, action, editor, session, text) {
            if (text === '"' || text === "'") {
                var quote = text;
                var selected = session.doc.getTextRange(editor.getSelectionRange());
                if (selected !== "" && selected !== "'" && selected !== '"' && editor.getWrapBehavioursEnabled()) {
                    return {
                        text: quote + selected + quote,
                        selection: void 0
                    };
                }
                var cursor = editor.getCursorPosition();
                var line = session.doc.getLine(cursor.row);
                var rightChar = line.substring(cursor.column, cursor.column + 1);
                var iterator = new TokenIterator(session, cursor.row, cursor.column);
                var token = iterator.getCurrentToken();
                if (rightChar === quote && (is(token, "attribute-value") || is(token, "string"))) {
                    return {
                        text: "",
                        selection: [1, 1]
                    };
                }
                if (!token)
                    token = iterator.stepBackward();
                if (!token)
                    return;
                while (is(token, "tag-whitespace") || is(token, "whitespace")) {
                    token = iterator.stepBackward();
                }
                var rightSpace = !rightChar || rightChar.match(/\s/);
                if (is(token, "attribute-equals") && (rightSpace || rightChar === '>') || (is(token, "decl-attribute-equals") && (rightSpace || rightChar == '?'))) {
                    return {
                        text: quote + quote,
                        selection: [1, 1]
                    };
                }
            }
        });
        this.add("string_dquotes", "deletion", function (state, action, editor, session, range) {
            var selected = session.doc.getTextRange(range);
            if (!range.isMultiLine() && (selected === '"' || selected === "'")) {
                var line = session.doc.getLine(range.start.row);
                var rightChar = line.substring(range.start.column + 1, range.start.column + 2);
                if (rightChar == selected) {
                    range.end.column++;
                    return range;
                }
            }
        });
        this.add("autoclosing", "insertion", function (state, action, editor, session, text) {
            if (text === '>') {
                var position = editor.getCursorPosition();
                var iterator = new TokenIterator(session, position.row, position.column);
                var token = iterator.getCurrentToken() || iterator.stepBackward();
                if (!token || !(is(token, "tag-name") || is(token, "tag-whitespace") || is(token, "attribute-name") || is(token, "attribute-equals") || is(token, "attribute-value")))
                    return;
                if (is(token, "reference.attribute-value"))
                    return;
                if (is(token, "attribute-value")) {
                    var firstChar = token.value.charAt(0);
                    if (firstChar == '"' || firstChar == "'") {
                        var lastChar = token.value.charAt(token.value.length - 1);
                        var tokenEnd = iterator.getCurrentTokenColumn() + token.value.length;
                        if (tokenEnd > position.column || tokenEnd == position.column && firstChar != lastChar)
                            return;
                    }
                }
                while (!is(token, "tag-name")) {
                    token = iterator.stepBackward();
                }
                var tokenRow = iterator.getCurrentTokenRow();
                var tokenColumn = iterator.getCurrentTokenColumn();
                if (is(iterator.stepBackward(), "end-tag-open"))
                    return;
                var element = token.value;
                if (tokenRow == position.row)
                    element = element.substring(0, position.column - tokenColumn);
                if (this.voidElements.hasOwnProperty(element.toLowerCase()))
                    return;
                return {
                    text: '>' + '</' + element + '>',
                    selection: [1, 1]
                };
            }
        });
        this.add('autoindent', 'insertion', function (state, action, editor, session, text) {
            if (text === "\n") {
                var cursor = editor.getCursorPosition();
                var line = session.getLine(cursor.row);
                var rightChars = line.substring(cursor.column, cursor.column + 2);
                if (rightChars == '</') {
                    var next_indent = this.$getIndent(line);
                    var indent = next_indent + session.getTabString();
                    return {
                        text: '\n' + indent + '\n' + next_indent,
                        selection: [1, indent.length, 1, indent.length]
                    };
                }
            }
        });
    }
}
