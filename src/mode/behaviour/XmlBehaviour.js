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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiWG1sQmVoYXZpb3VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiWG1sQmVoYXZpb3VyLnRzIl0sIm5hbWVzIjpbImlzIiwiWG1sQmVoYXZpb3VyIiwiWG1sQmVoYXZpb3VyLmNvbnN0cnVjdG9yIl0sIm1hcHBpbmdzIjoiQUFvREEsWUFBWSxDQUFDO09BRU4sU0FBUyxNQUFNLGNBQWM7T0FDN0IsYUFBYSxNQUFNLHFCQUFxQjtBQU0vQyxZQUFZLEtBQVksRUFBRSxJQUFZO0lBQ2xDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUN0REEsQ0FBQ0E7QUFNRCwwQ0FBMEMsU0FBUztJQU0vQ0M7UUFDSUMsT0FBT0EsQ0FBQ0E7UUFFUkEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxXQUFXQSxFQUFFQSxVQUFTQSxLQUFhQSxFQUFFQSxNQUFjQSxFQUFFQSxNQUFjQSxFQUFFQSxPQUFvQkEsRUFBRUEsSUFBWUE7WUFDOUgsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDL0IsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDO2dCQUNqQixJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO2dCQUNwRSxFQUFFLENBQUMsQ0FBQyxRQUFRLEtBQUssRUFBRSxJQUFJLFFBQVEsS0FBSyxHQUFHLElBQUksUUFBUSxLQUFLLEdBQUcsSUFBSSxNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQy9GLE1BQU0sQ0FBQzt3QkFDSCxJQUFJLEVBQUUsS0FBSyxHQUFHLFFBQVEsR0FBRyxLQUFLO3dCQUM5QixTQUFTLEVBQUUsS0FBSyxD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LElBQUksRUFBRSxJQUFJLEdBQUcsTUFBTSxHQUFHLElBQUksR0FBRyxXQUFXO3dCQUN4QyxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQztxQkFDbEQsQ0FBQztnQkFDTixDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7QUFDTEQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqIFxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKiBcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgQmVoYXZpb3VyIGZyb20gXCIuLi9CZWhhdmlvdXJcIjtcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gXCIuLi8uLi9Ub2tlbkl0ZXJhdG9yXCI7XG5pbXBvcnQgRWRpdG9yIGZyb20gXCIuLi8uLi9FZGl0b3JcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi4vLi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi4vLi4vUmFuZ2VcIjtcbmltcG9ydCBUb2tlbiBmcm9tIFwiLi4vLi4vVG9rZW5cIjtcblxuZnVuY3Rpb24gaXModG9rZW46IFRva2VuLCB0eXBlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdG9rZW4udHlwZS5sYXN0SW5kZXhPZih0eXBlICsgXCIueG1sXCIpID4gLTE7XG59XG5cbi8qKlxuICogQGNsYXNzIFhtbEJlaGF2aW91clxuICogQGV4dGVuZHMgQmVoYXZpb3VyXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFhtbEJlaGF2aW91ciBleHRlbmRzIEJlaGF2aW91ciB7XG5cbiAgICAvKipcbiAgICAgKiBAY2xhc3MgWG1sQmVoYXZpb3VyXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHN1cGVyKCk7XG5cbiAgICAgICAgdGhpcy5hZGQoXCJzdHJpbmdfZHF1b3Rlc1wiLCBcImluc2VydGlvblwiLCBmdW5jdGlvbihzdGF0ZTogc3RyaW5nLCBhY3Rpb246IHN0cmluZywgZWRpdG9yOiBFZGl0b3IsIHNlc3Npb246IEVkaXRTZXNzaW9uLCB0ZXh0OiBzdHJpbmcpOiB7IHRleHQ6IHN0cmluZzsgc2VsZWN0aW9uOiBudW1iZXJbXSB9IHtcbiAgICAgICAgICAgIGlmICh0ZXh0ID09PSAnXCInIHx8IHRleHQgPT09IFwiJ1wiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHF1b3RlID0gdGV4dDtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0ZWQgPSBzZXNzaW9uLmRvYy5nZXRUZXh0UmFuZ2UoZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICAgICAgICAgIGlmIChzZWxlY3RlZCAhPT0gXCJcIiAmJiBzZWxlY3RlZCAhPT0gXCInXCIgJiYgc2VsZWN0ZWQgIT09ICdcIicgJiYgZWRpdG9yLmdldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiBxdW90ZSArIHNlbGVjdGVkICsgcXVvdGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb246IHZvaWQgMFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBjdXJzb3IgPSBlZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZG9jLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIHJpZ2h0Q2hhciA9IGxpbmUuc3Vic3RyaW5nKGN1cnNvci5jb2x1bW4sIGN1cnNvci5jb2x1bW4gKyAxKTtcbiAgICAgICAgICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcihzZXNzaW9uLCBjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgICAgIGlmIChyaWdodENoYXIgPT09IHF1b3RlICYmIChpcyh0b2tlbiwgXCJhdHRyaWJ1dGUtdmFsdWVcIikgfHwgaXModG9rZW4sIFwic3RyaW5nXCIpKSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZ25vcmUgaW5wdXQgYW5kIG1vdmUgcmlnaHQgb25lIGlmIHdlJ3JlIHR5cGluZyBvdmVyIHRoZSBjbG9zaW5nIHF1b3RlLlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogXCJcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbjogWzEsIDFdXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgICAgIHdoaWxlIChpcyh0b2tlbiwgXCJ0YWctd2hpdGVzcGFjZVwiKSB8fCBpcyh0b2tlbiwgXCJ3aGl0ZXNwYWNlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhciByaWdodFNwYWNlID0gIXJpZ2h0Q2hhciB8fCByaWdodENoYXIubWF0Y2goL1xccy8pO1xuICAgICAgICAgICAgICAgIGlmIChpcyh0b2tlbiwgXCJhdHRyaWJ1dGUtZXF1YWxzXCIpICYmIChyaWdodFNwYWNlIHx8IHJpZ2h0Q2hhciA9PT0gJz4nKSB8fCAoaXModG9rZW4sIFwiZGVjbC1hdHRyaWJ1dGUtZXF1YWxzXCIpICYmIChyaWdodFNwYWNlIHx8IHJpZ2h0Q2hhciA9PSAnPycpKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogcXVvdGUgKyBxdW90ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbjogWzEsIDFdXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZChcInN0cmluZ19kcXVvdGVzXCIsIFwiZGVsZXRpb25cIiwgZnVuY3Rpb24oc3RhdGU6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcsIGVkaXRvcjogRWRpdG9yLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbiwgcmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGVkOiBzdHJpbmcgPSBzZXNzaW9uLmRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpICYmIChzZWxlY3RlZCA9PT0gJ1wiJyB8fCBzZWxlY3RlZCA9PT0gXCInXCIpKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmRvYy5nZXRMaW5lKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIHJpZ2h0Q2hhciA9IGxpbmUuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0LmNvbHVtbiArIDEsIHJhbmdlLnN0YXJ0LmNvbHVtbiArIDIpO1xuICAgICAgICAgICAgICAgIGlmIChyaWdodENoYXIgPT0gc2VsZWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZChcImF1dG9jbG9zaW5nXCIsIFwiaW5zZXJ0aW9uXCIsIGZ1bmN0aW9uKHN0YXRlOiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nLCBlZGl0b3I6IEVkaXRvciwgc2Vzc2lvbjogRWRpdFNlc3Npb24sIHRleHQ6IHN0cmluZykge1xuICAgICAgICAgICAgaWYgKHRleHQgPT09ICc+Jykge1xuICAgICAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHNlc3Npb24sIHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcbiAgICAgICAgICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKSB8fCBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgIC8vIGV4aXQgaWYgd2UncmUgbm90IGluIGEgdGFnXG4gICAgICAgICAgICAgICAgaWYgKCF0b2tlbiB8fCAhKGlzKHRva2VuLCBcInRhZy1uYW1lXCIpIHx8IGlzKHRva2VuLCBcInRhZy13aGl0ZXNwYWNlXCIpIHx8IGlzKHRva2VuLCBcImF0dHJpYnV0ZS1uYW1lXCIpIHx8IGlzKHRva2VuLCBcImF0dHJpYnV0ZS1lcXVhbHNcIikgfHwgaXModG9rZW4sIFwiYXR0cmlidXRlLXZhbHVlXCIpKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgLy8gZXhpdCBpZiB3ZSdyZSBpbnNpZGUgb2YgYSBxdW90ZWQgYXR0cmlidXRlIHZhbHVlXG4gICAgICAgICAgICAgICAgaWYgKGlzKHRva2VuLCBcInJlZmVyZW5jZS5hdHRyaWJ1dGUtdmFsdWVcIikpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAoaXModG9rZW4sIFwiYXR0cmlidXRlLXZhbHVlXCIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmaXJzdENoYXIgPSB0b2tlbi52YWx1ZS5jaGFyQXQoMCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdENoYXIgPT0gJ1wiJyB8fCBmaXJzdENoYXIgPT0gXCInXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsYXN0Q2hhciA9IHRva2VuLnZhbHVlLmNoYXJBdCh0b2tlbi52YWx1ZS5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0b2tlbkVuZCA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuRW5kID4gcG9zaXRpb24uY29sdW1uIHx8IHRva2VuRW5kID09IHBvc2l0aW9uLmNvbHVtbiAmJiBmaXJzdENoYXIgIT0gbGFzdENoYXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZmluZCB0YWcgbmFtZVxuICAgICAgICAgICAgICAgIHdoaWxlICghaXModG9rZW4sIFwidGFnLW5hbWVcIikpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5Sb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgICAgICB2YXIgdG9rZW5Db2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKTtcblxuICAgICAgICAgICAgICAgIC8vIGV4aXQgaWYgdGhlIHRhZyBpcyBlbmRpbmdcbiAgICAgICAgICAgICAgICBpZiAoaXMoaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCksIFwiZW5kLXRhZy1vcGVuXCIpKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgICAgICB2YXIgZWxlbWVudCA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgICAgIGlmICh0b2tlblJvdyA9PSBwb3NpdGlvbi5yb3cpXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBlbGVtZW50LnN1YnN0cmluZygwLCBwb3NpdGlvbi5jb2x1bW4gLSB0b2tlbkNvbHVtbik7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy52b2lkRWxlbWVudHMuaGFzT3duUHJvcGVydHkoZWxlbWVudC50b0xvd2VyQ2FzZSgpKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdGV4dDogJz4nICsgJzwvJyArIGVsZW1lbnQgKyAnPicsXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbjogWzEsIDFdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGQoJ2F1dG9pbmRlbnQnLCAnaW5zZXJ0aW9uJywgZnVuY3Rpb24oc3RhdGUsIGFjdGlvbiwgZWRpdG9yOiBFZGl0b3IsIHNlc3Npb246IEVkaXRTZXNzaW9uLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgICAgIGlmICh0ZXh0ID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIGN1cnNvciA9IGVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICAgICAgICAgIHZhciByaWdodENoYXJzID0gbGluZS5zdWJzdHJpbmcoY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIDIpO1xuICAgICAgICAgICAgICAgIGlmIChyaWdodENoYXJzID09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5leHRfaW5kZW50ID0gdGhpcy4kZ2V0SW5kZW50KGxpbmUpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgaW5kZW50ID0gbmV4dF9pbmRlbnQgKyBzZXNzaW9uLmdldFRhYlN0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogJ1xcbicgKyBpbmRlbnQgKyAnXFxuJyArIG5leHRfaW5kZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uOiBbMSwgaW5kZW50Lmxlbmd0aCwgMSwgaW5kZW50Lmxlbmd0aF1cbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==