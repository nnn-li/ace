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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQnJhY2tldE1hdGNoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiQnJhY2tldE1hdGNoLnRzIl0sIm5hbWVzIjpbIkJyYWNrZXRNYXRjaCIsIkJyYWNrZXRNYXRjaC5jb25zdHJ1Y3RvciIsIkJyYWNrZXRNYXRjaC5maW5kTWF0Y2hpbmdCcmFja2V0IiwiQnJhY2tldE1hdGNoLmdldEJyYWNrZXRSYW5nZSIsIkJyYWNrZXRNYXRjaC5maW5kT3BlbmluZ0JyYWNrZXQiLCJCcmFja2V0TWF0Y2guZmluZENsb3NpbmdCcmFja2V0Il0sIm1hcHBpbmdzIjoiQUFvREEsWUFBWSxDQUFDO09BRU4sYUFBYSxNQUFNLGlCQUFpQjtPQUdwQyxLQUFLLE1BQU0sU0FBUztBQUszQixJQUFJLFNBQVMsR0FBa0M7SUFDM0MsR0FBRyxFQUFFLEdBQUc7SUFDUixHQUFHLEVBQUUsR0FBRztJQUNSLEdBQUcsRUFBRSxHQUFHO0lBQ1IsR0FBRyxFQUFFLEdBQUc7SUFDUixHQUFHLEVBQUUsR0FBRztJQUNSLEdBQUcsRUFBRSxHQUFHO0NBQ1gsQ0FBQTtBQUtEO0lBY0lBLFlBQVlBLFdBQXdCQTtRQUNoQ0MsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsV0FBV0EsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBRURELG1CQUFtQkEsQ0FBQ0EsUUFBa0JBLEVBQUVBLEdBQVdBO1FBQy9DRSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUV2Q0EsSUFBSUEsZ0JBQWdCQSxHQUFXQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6R0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsZ0JBQWdCQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUV6Q0EsSUFBSUEsS0FBS0EsR0FBR0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBO1FBQzVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUE7WUFDQUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUMzREEsQ0FBQ0E7SUFFREYsZUFBZUEsQ0FBQ0EsR0FBYUE7UUFDekJHLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzdDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUEsS0FBWUEsQ0FBQ0E7UUFFakJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3RDQSxJQUFJQSxLQUFLQSxHQUFHQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSx1QkFBdUJBLENBQUNBLENBQUNBO1FBQ3REQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM5QkEsR0FBR0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDL0NBLEtBQUtBLEdBQUdBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ25CQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUVoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1lBQ2hCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUMxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNuQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDekJBLENBQUNBO1lBQ0RBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2hDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ3JCQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDbENBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUVESCxrQkFBa0JBLENBQUNBLE9BQWVBLEVBQUVBLFFBQWtCQSxFQUFFQSxNQUFlQTtRQUNuRUksSUFBSUEsV0FBV0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDckNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBRWRBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2xGQSxJQUFJQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtRQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDbkNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1BBLE1BQU1BLENBQUNBO1FBRVhBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLE1BQU1BLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLHlCQUF5QkEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDNUlBLENBQUNBO1FBR0RBLElBQUlBLFVBQVVBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBRXhCQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNWQSxPQUFPQSxVQUFVQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDckJBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO2dCQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3JCQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2RBLE1BQU1BLENBQUNBOzRCQUNIQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBOzRCQUNsQ0EsTUFBTUEsRUFBRUEsVUFBVUEsR0FBR0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQTt5QkFDeERBLENBQUNBO29CQUNOQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLENBQUNBO2dCQUNEQSxVQUFVQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFJREEsR0FBR0EsQ0FBQ0E7Z0JBQ0FBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1lBQ3BDQSxDQUFDQSxRQUFRQSxLQUFLQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQTtZQUU1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ2ZBLEtBQUtBLENBQUNBO1lBRVZBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3BCQSxVQUFVQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURKLGtCQUFrQkEsQ0FBQ0EsT0FBZUEsRUFBRUEsUUFBa0JBLEVBQUVBLE1BQWVBO1FBQ25FSyxJQUFJQSxjQUFjQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFZEEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbEZBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUVuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsTUFBTUEsQ0FBQ0E7UUFFWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsTUFBTUEsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EseUJBQXlCQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM1SUEsQ0FBQ0E7UUFHREEsSUFBSUEsVUFBVUEsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxDQUFDQTtRQUVwRUEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFFVkEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDeEJBLElBQUlBLFdBQVdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1lBQy9CQSxPQUFPQSxVQUFVQSxHQUFHQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDOUJBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO2dCQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3hCQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2RBLE1BQU1BLENBQUNBOzRCQUNIQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBOzRCQUNsQ0EsTUFBTUEsRUFBRUEsVUFBVUEsR0FBR0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQTt5QkFDeERBLENBQUNBO29CQUNOQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLENBQUNBO2dCQUNEQSxVQUFVQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFJREEsR0FBR0EsQ0FBQ0E7Z0JBQ0FBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ25DQSxDQUFDQSxRQUFRQSxLQUFLQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQTtZQUU1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQ2ZBLEtBQUtBLENBQUNBO1lBRVZBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25CQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7QUFDTEwsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgVG9rZW5JdGVyYXRvciBmcm9tIFwiLi9Ub2tlbkl0ZXJhdG9yXCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSBcIi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBQb3NpdGlvbiBmcm9tIFwiLi9Qb3NpdGlvblwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5cbi8qKlxuICogTWFwcyBhbiBvcGVuaW5nKGNsb3NpbmcpIGJyYWNrZXQgc3RyaW5nIHRvIHRoZSBjb3JyZXNwb25kaW5nIGNsb3Npbmcob3BlbmluZykgYnJhY2tldC5cbiAqL1xudmFyICRicmFja2V0czogeyBbYnJhY2tldDogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG4gICAgXCIpXCI6IFwiKFwiLFxuICAgIFwiKFwiOiBcIilcIixcbiAgICBcIl1cIjogXCJbXCIsXG4gICAgXCJbXCI6IFwiXVwiLFxuICAgIFwie1wiOiBcIn1cIixcbiAgICBcIn1cIjogXCJ7XCJcbn1cblxuLyoqXG4gKiBAY2xhc3MgQnJhY2tldE1hdGNoXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyYWNrZXRNYXRjaCB7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgZWRpdFNlc3Npb25cbiAgICAgKiBAdHlwZSBFZGl0U2Vzc2lvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb247XG5cbiAgICAvKipcbiAgICAgKiBAY2xhc3MgQnJhY2tldE1hdGNoXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGVkaXRTZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5lZGl0U2Vzc2lvbiA9IGVkaXRTZXNzaW9uO1xuICAgIH1cblxuICAgIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IFBvc2l0aW9uLCBjaHI6IHN0cmluZyk6IFBvc2l0aW9uIHtcbiAgICAgICAgaWYgKHBvc2l0aW9uLmNvbHVtbiA9PT0gMCkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGNoYXJCZWZvcmVDdXJzb3I6IHN0cmluZyA9IGNociB8fCB0aGlzLmVkaXRTZXNzaW9uLmdldExpbmUocG9zaXRpb24ucm93KS5jaGFyQXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG4gICAgICAgIGlmIChjaGFyQmVmb3JlQ3Vyc29yID09PSBcIlwiKSByZXR1cm4gbnVsbDtcblxuICAgICAgICB2YXIgbWF0Y2ggPSBjaGFyQmVmb3JlQ3Vyc29yLm1hdGNoKC8oW1xcKFxcW1xce10pfChbXFwpXFxdXFx9XSkvKTtcbiAgICAgICAgaWYgKCFtYXRjaClcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIGlmIChtYXRjaFsxXSlcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmZpbmRDbG9zaW5nQnJhY2tldChtYXRjaFsxXSwgcG9zaXRpb24pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5maW5kT3BlbmluZ0JyYWNrZXQobWF0Y2hbMl0sIHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICBnZXRCcmFja2V0UmFuZ2UocG9zOiBQb3NpdGlvbik6IFJhbmdlIHtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmVkaXRTZXNzaW9uLmdldExpbmUocG9zLnJvdyk7XG4gICAgICAgIHZhciBiZWZvcmUgPSB0cnVlO1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuXG4gICAgICAgIHZhciBjaHIgPSBsaW5lLmNoYXJBdChwb3MuY29sdW1uIC0gMSk7XG4gICAgICAgIHZhciBtYXRjaCA9IGNociAmJiBjaHIubWF0Y2goLyhbXFwoXFxbXFx7XSl8KFtcXClcXF1cXH1dKS8pO1xuICAgICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgICBjaHIgPSBsaW5lLmNoYXJBdChwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIHBvcyA9IHsgcm93OiBwb3Mucm93LCBjb2x1bW46IHBvcy5jb2x1bW4gKyAxIH07XG4gICAgICAgICAgICBtYXRjaCA9IGNociAmJiBjaHIubWF0Y2goLyhbXFwoXFxbXFx7XSl8KFtcXClcXF1cXH1dKS8pO1xuICAgICAgICAgICAgYmVmb3JlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFtYXRjaClcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIGlmIChtYXRjaFsxXSkge1xuICAgICAgICAgICAgdmFyIGNsb3NpbmdQb3MgPSB0aGlzLmZpbmRDbG9zaW5nQnJhY2tldChtYXRjaFsxXSwgcG9zKTtcbiAgICAgICAgICAgIGlmICghY2xvc2luZ1BvcylcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhwb3MsIGNsb3NpbmdQb3MpO1xuICAgICAgICAgICAgaWYgKCFiZWZvcmUpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uKys7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uLS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByYW5nZVsnY3Vyc29yJ10gPSByYW5nZS5lbmQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgb3BlbmluZ1BvcyA9IHRoaXMuZmluZE9wZW5pbmdCcmFja2V0KG1hdGNoWzJdLCBwb3MpO1xuICAgICAgICAgICAgaWYgKCFvcGVuaW5nUG9zKVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKG9wZW5pbmdQb3MsIHBvcyk7XG4gICAgICAgICAgICBpZiAoIWJlZm9yZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4tLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJhbmdlWydjdXJzb3InXSA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdHlwZVJlPzogUmVnRXhwKTogUG9zaXRpb24ge1xuICAgICAgICB2YXIgb3BlbkJyYWNrZXQgPSAkYnJhY2tldHNbYnJhY2tldF07XG4gICAgICAgIHZhciBkZXB0aCA9IDE7XG5cbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcy5lZGl0U2Vzc2lvbiwgcG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBpZiAoIXR5cGVSZSkge1xuICAgICAgICAgICAgdHlwZVJlID0gbmV3IFJlZ0V4cChcIihcXFxcLj9cIiArIHRva2VuLnR5cGUucmVwbGFjZShcIi5cIiwgXCJcXFxcLlwiKS5yZXBsYWNlKFwicnBhcmVuXCIsIFwiLnBhcmVuXCIpLnJlcGxhY2UoL1xcYig/OmVuZHxzdGFydHxiZWdpbilcXGIvLCBcIlwiKSArIFwiKStcIik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIFN0YXJ0IHNlYXJjaGluZyBpbiB0b2tlbiwganVzdCBiZWZvcmUgdGhlIGNoYXJhY3RlciBhdCBwb3NpdGlvbi5jb2x1bW5cbiAgICAgICAgdmFyIHZhbHVlSW5kZXggPSBwb3NpdGlvbi5jb2x1bW4gLSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDI7XG4gICAgICAgIHZhciB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICB3aGlsZSAodmFsdWVJbmRleCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNociA9IHZhbHVlLmNoYXJBdCh2YWx1ZUluZGV4KTtcbiAgICAgICAgICAgICAgICBpZiAoY2hyID09IG9wZW5CcmFja2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb3c6IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbHVtbjogdmFsdWVJbmRleCArIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNociA9PT0gYnJhY2tldCkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aCArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YWx1ZUluZGV4IC09IDE7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNjYW4gYmFja3dhcmQgdGhyb3VnaCB0aGUgZG9jdW1lbnQsIGxvb2tpbmcgZm9yIHRoZSBuZXh0IHRva2VuXG4gICAgICAgICAgICAvLyB3aG9zZSB0eXBlIG1hdGNoZXMgdHlwZVJlXG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmICF0eXBlUmUudGVzdCh0b2tlbi50eXBlKSk7XG5cbiAgICAgICAgICAgIGlmICh0b2tlbiA9PT0gbnVsbClcbiAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgdmFsdWUgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHZhbHVlSW5kZXggPSB2YWx1ZS5sZW5ndGggLSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IFBvc2l0aW9uLCB0eXBlUmU/OiBSZWdFeHApOiBQb3NpdGlvbiB7XG4gICAgICAgIHZhciBjbG9zaW5nQnJhY2tldCA9ICRicmFja2V0c1ticmFja2V0XTtcbiAgICAgICAgdmFyIGRlcHRoID0gMTtcblxuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLmVkaXRTZXNzaW9uLCBwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG4gICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgaWYgKCF0eXBlUmUpIHtcbiAgICAgICAgICAgIHR5cGVSZSA9IG5ldyBSZWdFeHAoXCIoXFxcXC4/XCIgKyB0b2tlbi50eXBlLnJlcGxhY2UoXCIuXCIsIFwiXFxcXC5cIikucmVwbGFjZShcImxwYXJlblwiLCBcIi5wYXJlblwiKS5yZXBsYWNlKC9cXGIoPzplbmR8c3RhcnR8YmVnaW4pXFxiLywgXCJcIikgKyBcIikrXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3RhcnQgc2VhcmNoaW5nIGluIHRva2VuLCBhZnRlciB0aGUgY2hhcmFjdGVyIGF0IHBvc2l0aW9uLmNvbHVtblxuICAgICAgICB2YXIgdmFsdWVJbmRleCA9IHBvc2l0aW9uLmNvbHVtbiAtIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpO1xuXG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG5cbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgdmFyIHZhbHVlTGVuZ3RoID0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgd2hpbGUgKHZhbHVlSW5kZXggPCB2YWx1ZUxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHZhciBjaHIgPSB2YWx1ZS5jaGFyQXQodmFsdWVJbmRleCk7XG4gICAgICAgICAgICAgICAgaWYgKGNociA9PSBjbG9zaW5nQnJhY2tldCkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aCAtPSAxO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm93OiBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb2x1bW46IHZhbHVlSW5kZXggKyBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKVxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjaHIgPT09IGJyYWNrZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGggKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWVJbmRleCArPSAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBTY2FuIGZvcndhcmQgdGhyb3VnaCB0aGUgZG9jdW1lbnQsIGxvb2tpbmcgZm9yIHRoZSBuZXh0IHRva2VuXG4gICAgICAgICAgICAvLyB3aG9zZSB0eXBlIG1hdGNoZXMgdHlwZVJlXG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgIXR5cGVSZS50ZXN0KHRva2VuLnR5cGUpKTtcblxuICAgICAgICAgICAgaWYgKHRva2VuID09PSBudWxsKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICB2YWx1ZUluZGV4ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cbiJdfQ==