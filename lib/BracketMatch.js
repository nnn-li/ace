"use strict";
import TokenIterator from "./TokenIterator";
import Range from "./Range";
var $brackets = {
    ")": "(",
    "(": ")",
    "]": "[",
    "[": "]",
    "{": "}",
    "}": "{"
};
export default class BracketMatch {
    constructor(editSession) {
        this.editSession = editSession;
    }
    findMatchingBracket(position, chr) {
        if (position.column === 0)
            return null;
        var charBeforeCursor = chr || this.editSession.getLine(position.row).charAt(position.column - 1);
        if (charBeforeCursor === "")
            return null;
        var match = charBeforeCursor.match(/([\(\[\{])|([\)\]\}])/);
        if (!match)
            return null;
        if (match[1])
            return this.findClosingBracket(match[1], position);
        else
            return this.findOpeningBracket(match[2], position);
    }
    getBracketRange(pos) {
        var line = this.editSession.getLine(pos.row);
        var before = true;
        var range;
        var chr = line.charAt(pos.column - 1);
        var match = chr && chr.match(/([\(\[\{])|([\)\]\}])/);
        if (!match) {
            chr = line.charAt(pos.column);
            pos = { row: pos.row, column: pos.column + 1 };
            match = chr && chr.match(/([\(\[\{])|([\)\]\}])/);
            before = false;
        }
        if (!match)
            return null;
        if (match[1]) {
            var closingPos = this.findClosingBracket(match[1], pos);
            if (!closingPos)
                return null;
            range = Range.fromPoints(pos, closingPos);
            if (!before) {
                range.end.column++;
                range.start.column--;
            }
            range['cursor'] = range.end;
        }
        else {
            var openingPos = this.findOpeningBracket(match[2], pos);
            if (!openingPos)
                return null;
            range = Range.fromPoints(openingPos, pos);
            if (!before) {
                range.start.column++;
                range.end.column--;
            }
            range['cursor'] = range.start;
        }
        return range;
    }
    findOpeningBracket(bracket, position, typeRe) {
        var openBracket = $brackets[bracket];
        var depth = 1;
        var iterator = new TokenIterator(this.editSession, position.row, position.column);
        var token = iterator.getCurrentToken();
        if (!token)
            token = iterator.stepForward();
        if (!token)
            return;
        if (!typeRe) {
            typeRe = new RegExp("(\\.?" + token.type.replace(".", "\\.").replace("rparen", ".paren").replace(/\b(?:end|start|begin)\b/, "") + ")+");
        }
        var valueIndex = position.column - iterator.getCurrentTokenColumn() - 2;
        var value = token.value;
        while (true) {
            while (valueIndex >= 0) {
                var chr = value.charAt(valueIndex);
                if (chr == openBracket) {
                    depth -= 1;
                    if (depth === 0) {
                        return {
                            row: iterator.getCurrentTokenRow(),
                            column: valueIndex + iterator.getCurrentTokenColumn()
                        };
                    }
                }
                else if (chr === bracket) {
                    depth += 1;
                }
                valueIndex -= 1;
            }
            do {
                token = iterator.stepBackward();
            } while (token && !typeRe.test(token.type));
            if (token === null)
                break;
            value = token.value;
            valueIndex = value.length - 1;
        }
        return null;
    }
    findClosingBracket(bracket, position, typeRe) {
        var closingBracket = $brackets[bracket];
        var depth = 1;
        var iterator = new TokenIterator(this.editSession, position.row, position.column);
        var token = iterator.getCurrentToken();
        if (!token)
            token = iterator.stepForward();
        if (!token)
            return;
        if (!typeRe) {
            typeRe = new RegExp("(\\.?" + token.type.replace(".", "\\.").replace("lparen", ".paren").replace(/\b(?:end|start|begin)\b/, "") + ")+");
        }
        var valueIndex = position.column - iterator.getCurrentTokenColumn();
        while (true) {
            var value = token.value;
            var valueLength = value.length;
            while (valueIndex < valueLength) {
                var chr = value.charAt(valueIndex);
                if (chr == closingBracket) {
                    depth -= 1;
                    if (depth === 0) {
                        return {
                            row: iterator.getCurrentTokenRow(),
                            column: valueIndex + iterator.getCurrentTokenColumn()
                        };
                    }
                }
                else if (chr === bracket) {
                    depth += 1;
                }
                valueIndex += 1;
            }
            do {
                token = iterator.stepForward();
            } while (token && !typeRe.test(token.type));
            if (token === null)
                break;
            valueIndex = 0;
        }
        return null;
    }
}
