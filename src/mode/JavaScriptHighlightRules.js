"use strict";
import DocCommentHighlightRules from "./DocCommentHighlightRules";
import TextHighlightRules from "./TextHighlightRules";
export default class JavaScriptHighlightRules extends TextHighlightRules {
    constructor(options) {
        super();
        var keywordMapper = this.createKeywordMapper({
            "variable.language": "Array|Boolean|Date|Function|Iterator|Number|Object|RegExp|String|Proxy|" +
                "Namespace|QName|XML|XMLList|" +
                "ArrayBuffer|Float32Array|Float64Array|Int16Array|Int32Array|Int8Array|" +
                "Uint16Array|Uint32Array|Uint8Array|Uint8ClampedArray|" +
                "Error|EvalError|InternalError|RangeError|ReferenceError|StopIteration|" +
                "SyntaxError|TypeError|URIError|" +
                "decodeURI|decodeURIComponent|encodeURI|encodeURIComponent|eval|isFinite|" +
                "isNaN|parseFloat|parseInt|" +
                "JSON|Math|" +
                "this|arguments|prototype|window|document",
            "keyword": "const|yield|import|get|set|" +
                "break|case|catch|continue|default|delete|do|else|finally|for|function|" +
                "if|in|instanceof|new|return|switch|throw|try|typeof|let|var|while|with|debugger|" +
                "__parent__|__count__|escape|unescape|with|__proto__|" +
                "class|enum|extends|super|export|implements|private|public|interface|package|protected|static",
            "storage.type": "const|let|var|function",
            "constant.language": "null|Infinity|NaN|undefined",
            "support.function": "alert",
            "constant.language.boolean": "true|false"
        }, "identifier");
        var kwBeforeRe = "case|do|else|finally|in|instanceof|return|throw|try|typeof|yield|void";
        var identifierRe = "[a-zA-Z\\$_\u00a1-\uffff][a-zA-Z\\d\\$_\u00a1-\uffff]*\\b";
        var escapedRe = "\\\\(?:x[0-9a-fA-F]{2}|" +
            "u[0-9a-fA-F]{4}|" +
            "[0-2][0-7]{0,2}|" +
            "3[0-6][0-7]?|" +
            "37[0-7]?|" +
            "[4-7][0-7]?|" +
            ".)";
        this.$rules = {
            "no_regex": [
                {
                    token: "comment",
                    regex: "\\/\\/",
                    next: "line_comment"
                },
                DocCommentHighlightRules.getStartRule("doc-start"),
                {
                    token: "comment",
                    regex: /\/\*/,
                    next: "comment"
                }, {
                    token: "string",
                    regex: "'(?=.)",
                    next: "qstring"
                }, {
                    token: "string",
                    regex: '"(?=.)',
                    next: "qqstring"
                }, {
                    token: "constant.numeric",
                    regex: /0[xX][0-9a-fA-F]+\b/
                }, {
                    token: "constant.numeric",
                    regex: /[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/
                }, {
                    token: [
                        "storage.type", "punctuation.operator", "support.function",
                        "punctuation.operator", "entity.name.function", "text", "keyword.operator"
                    ],
                    regex: "(" + identifierRe + ")(\\.)(prototype)(\\.)(" + identifierRe + ")(\\s*)(=)",
                    next: "function_arguments"
                }, {
                    token: [
                        "storage.type", "punctuation.operator", "entity.name.function", "text",
                        "keyword.operator", "text", "storage.type", "text", "paren.lparen"
                    ],
                    regex: "(" + identifierRe + ")(\\.)(" + identifierRe + ")(\\s*)(=)(\\s*)(function)(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: [
                        "entity.name.function", "text", "keyword.operator", "text", "storage.type",
                        "text", "paren.lparen"
                    ],
                    regex: "(" + identifierRe + ")(\\s*)(=)(\\s*)(function)(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: [
                        "storage.type", "punctuation.operator", "entity.name.function", "text",
                        "keyword.operator", "text",
                        "storage.type", "text", "entity.name.function", "text", "paren.lparen"
                    ],
                    regex: "(" + identifierRe + ")(\\.)(" + identifierRe + ")(\\s*)(=)(\\s*)(function)(\\s+)(\\w+)(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: [
                        "storage.type", "text", "entity.name.function", "text", "paren.lparen"
                    ],
                    regex: "(function)(\\s+)(" + identifierRe + ")(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: [
                        "entity.name.function", "text", "punctuation.operator",
                        "text", "storage.type", "text", "paren.lparen"
                    ],
                    regex: "(" + identifierRe + ")(\\s*)(:)(\\s*)(function)(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: [
                        "text", "text", "storage.type", "text", "paren.lparen"
                    ],
                    regex: "(:)(\\s*)(function)(\\s*)(\\()",
                    next: "function_arguments"
                }, {
                    token: "keyword",
                    regex: "(?:" + kwBeforeRe + ")\\b",
                    next: "start"
                }, {
                    token: ["punctuation.operator", "support.function"],
                    regex: /(\.)(s(?:h(?:ift|ow(?:Mod(?:elessDialog|alDialog)|Help))|croll(?:X|By(?:Pages|Lines)?|Y|To)?|t(?:op|rike)|i(?:n|zeToContent|debar|gnText)|ort|u(?:p|b(?:str(?:ing)?)?)|pli(?:ce|t)|e(?:nd|t(?:Re(?:sizable|questHeader)|M(?:i(?:nutes|lliseconds)|onth)|Seconds|Ho(?:tKeys|urs)|Year|Cursor|Time(?:out)?|Interval|ZOptions|Date|UTC(?:M(?:i(?:nutes|lliseconds)|onth)|Seconds|Hours|Date|FullYear)|FullYear|Active)|arch)|qrt|lice|avePreferences|mall)|h(?:ome|andleEvent)|navigate|c(?:har(?:CodeAt|At)|o(?:s|n(?:cat|textual|firm)|mpile)|eil|lear(?:Timeout|Interval)?|a(?:ptureEvents|ll)|reate(?:StyleSheet|Popup|EventObject))|t(?:o(?:GMTString|S(?:tring|ource)|U(?:TCString|pperCase)|Lo(?:caleString|werCase))|est|a(?:n|int(?:Enabled)?))|i(?:s(?:NaN|Finite)|ndexOf|talics)|d(?:isableExternalCapture|ump|etachEvent)|u(?:n(?:shift|taint|escape|watch)|pdateCommands)|j(?:oin|avaEnabled)|p(?:o(?:p|w)|ush|lugins.refresh|a(?:ddings|rse(?:Int|Float)?)|r(?:int|ompt|eference))|e(?:scape|nableExternalCapture|val|lementFromPoint|x(?:p|ec(?:Script|Command)?))|valueOf|UTC|queryCommand(?:State|Indeterm|Enabled|Value)|f(?:i(?:nd|le(?:ModifiedDate|Size|CreatedDate|UpdatedDate)|xed)|o(?:nt(?:size|color)|rward)|loor|romCharCode)|watch|l(?:ink|o(?:ad|g)|astIndexOf)|a(?:sin|nchor|cos|t(?:tachEvent|ob|an(?:2)?)|pply|lert|b(?:s|ort))|r(?:ou(?:nd|teEvents)|e(?:size(?:By|To)|calc|turnValue|place|verse|l(?:oad|ease(?:Capture|Events)))|andom)|g(?:o|et(?:ResponseHeader|M(?:i(?:nutes|lliseconds)|onth)|Se(?:conds|lection)|Hours|Year|Time(?:zoneOffset)?|Da(?:y|te)|UTC(?:M(?:i(?:nutes|lliseconds)|onth)|Seconds|Hours|Da(?:y|te)|FullYear)|FullYear|A(?:ttention|llResponseHeaders)))|m(?:in|ove(?:B(?:y|elow)|To(?:Absolute)?|Above)|ergeAttributes|a(?:tch|rgins|x))|b(?:toa|ig|o(?:ld|rderWidths)|link|ack))\b(?=\()/
                }, {
                    token: ["punctuation.operator", "support.function.dom"],
                    regex: /(\.)(s(?:ub(?:stringData|mit)|plitText|e(?:t(?:NamedItem|Attribute(?:Node)?)|lect))|has(?:ChildNodes|Feature)|namedItem|c(?:l(?:ick|o(?:se|neNode))|reate(?:C(?:omment|DATASection|aption)|T(?:Head|extNode|Foot)|DocumentFragment|ProcessingInstruction|E(?:ntityReference|lement)|Attribute))|tabIndex|i(?:nsert(?:Row|Before|Cell|Data)|tem)|open|delete(?:Row|C(?:ell|aption)|T(?:Head|Foot)|Data)|focus|write(?:ln)?|a(?:dd|ppend(?:Child|Data))|re(?:set|place(?:Child|Data)|move(?:NamedItem|Child|Attribute(?:Node)?)?)|get(?:NamedItem|Element(?:sBy(?:Name|TagName)|ById)|Attribute(?:Node)?)|blur)\b(?=\()/
                }, {
                    token: ["punctuation.operator", "support.constant"],
                    regex: /(\.)(s(?:ystemLanguage|cr(?:ipts|ollbars|een(?:X|Y|Top|Left))|t(?:yle(?:Sheets)?|atus(?:Text|bar)?)|ibling(?:Below|Above)|ource|uffixes|e(?:curity(?:Policy)?|l(?:ection|f)))|h(?:istory|ost(?:name)?|as(?:h|Focus))|y|X(?:MLDocument|SLDocument)|n(?:ext|ame(?:space(?:s|URI)|Prop))|M(?:IN_VALUE|AX_VALUE)|c(?:haracterSet|o(?:n(?:structor|trollers)|okieEnabled|lorDepth|mp(?:onents|lete))|urrent|puClass|l(?:i(?:p(?:boardData)?|entInformation)|osed|asses)|alle(?:e|r)|rypto)|t(?:o(?:olbar|p)|ext(?:Transform|Indent|Decoration|Align)|ags)|SQRT(?:1_2|2)|i(?:n(?:ner(?:Height|Width)|put)|ds|gnoreCase)|zIndex|o(?:scpu|n(?:readystatechange|Line)|uter(?:Height|Width)|p(?:sProfile|ener)|ffscreenBuffering)|NEGATIVE_INFINITY|d(?:i(?:splay|alog(?:Height|Top|Width|Left|Arguments)|rectories)|e(?:scription|fault(?:Status|Ch(?:ecked|arset)|View)))|u(?:ser(?:Profile|Language|Agent)|n(?:iqueID|defined)|pdateInterval)|_content|p(?:ixelDepth|ort|ersonalbar|kcs11|l(?:ugins|atform)|a(?:thname|dding(?:Right|Bottom|Top|Left)|rent(?:Window|Layer)?|ge(?:X(?:Offset)?|Y(?:Offset)?))|r(?:o(?:to(?:col|type)|duct(?:Sub)?|mpter)|e(?:vious|fix)))|e(?:n(?:coding|abledPlugin)|x(?:ternal|pando)|mbeds)|v(?:isibility|endor(?:Sub)?|Linkcolor)|URLUnencoded|P(?:I|OSITIVE_INFINITY)|f(?:ilename|o(?:nt(?:Size|Family|Weight)|rmName)|rame(?:s|Element)|gColor)|E|whiteSpace|l(?:i(?:stStyleType|n(?:eHeight|kColor))|o(?:ca(?:tion(?:bar)?|lName)|wsrc)|e(?:ngth|ft(?:Context)?)|a(?:st(?:M(?:odified|atch)|Index|Paren)|yer(?:s|X)|nguage))|a(?:pp(?:MinorVersion|Name|Co(?:deName|re)|Version)|vail(?:Height|Top|Width|Left)|ll|r(?:ity|guments)|Linkcolor|bove)|r(?:ight(?:Context)?|e(?:sponse(?:XML|Text)|adyState))|global|x|m(?:imeTypes|ultiline|enubar|argin(?:Right|Bottom|Top|Left))|L(?:N(?:10|2)|OG(?:10E|2E))|b(?:o(?:ttom|rder(?:Width|RightWidth|BottomWidth|Style|Color|TopWidth|LeftWidth))|ufferDepth|elow|ackground(?:Color|Image)))\b/
                }, {
                    token: ["support.constant"],
                    regex: /that\b/
                }, {
                    token: ["storage.type", "punctuation.operator", "support.function.firebug"],
                    regex: /(console)(\.)(warn|info|log|error|time|trace|timeEnd|assert)\b/
                }, {
                    token: keywordMapper,
                    regex: identifierRe
                }, {
                    token: "keyword.operator",
                    regex: /--|\+\+|===|==|=|!=|!==|<=|>=|<<=|>>=|>>>=|<>|<|>|!|&&|\|\||\?\:|[!$%&*+\-~\/^]=?/,
                    next: "start"
                }, {
                    token: "punctuation.operator",
                    regex: /[?:,;.]/,
                    next: "start"
                }, {
                    token: "paren.lparen",
                    regex: /[\[({]/,
                    next: "start"
                }, {
                    token: "paren.rparen",
                    regex: /[\])}]/
                }, {
                    token: "comment",
                    regex: /^#!.*$/
                }
            ],
            "start": [
                DocCommentHighlightRules.getStartRule("doc-start"),
                {
                    token: "comment",
                    regex: "\\/\\*",
                    next: "comment_regex_allowed"
                }, {
                    token: "comment",
                    regex: "\\/\\/",
                    next: "line_comment_regex_allowed"
                }, {
                    token: "string.regexp",
                    regex: "\\/",
                    next: "regex"
                }, {
                    token: "text",
                    regex: "\\s+|^$",
                    next: "start"
                }, {
                    token: "empty",
                    regex: "",
                    next: "no_regex"
                }
            ],
            "regex": [
                {
                    token: "regexp.keyword.operator",
                    regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
                }, {
                    token: "string.regexp",
                    regex: "/[sxngimy]*",
                    next: "no_regex"
                }, {
                    token: "invalid",
                    regex: /\{\d+\b,?\d*\}[+*]|[+*$^?][+*]|[$^][?]|\?{3,}/
                }, {
                    token: "constant.language.escape",
                    regex: /\(\?[:=!]|\)|\{\d+\b,?\d*\}|[+*]\?|[()$^+*?.]/
                }, {
                    token: "constant.language.delimiter",
                    regex: /\|/
                }, {
                    token: "constant.language.escape",
                    regex: /\[\^?/,
                    next: "regex_character_class"
                }, {
                    token: "empty",
                    regex: "$",
                    next: "no_regex"
                }, {
                    defaultToken: "string.regexp"
                }
            ],
            "regex_character_class": [
                {
                    token: "regexp.charclass.keyword.operator",
                    regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
                }, {
                    token: "constant.language.escape",
                    regex: "]",
                    next: "regex"
                }, {
                    token: "constant.language.escape",
                    regex: "-"
                }, {
                    token: "empty",
                    regex: "$",
                    next: "no_regex"
                }, {
                    defaultToken: "string.regexp.charachterclass"
                }
            ],
            "function_arguments": [
                {
                    token: "variable.parameter",
                    regex: identifierRe
                }, {
                    token: "punctuation.operator",
                    regex: "[, ]+"
                }, {
                    token: "punctuation.operator",
                    regex: "$"
                }, {
                    token: "empty",
                    regex: "",
                    next: "no_regex"
                }
            ],
            "comment_regex_allowed": [
                { token: "comment", regex: "\\*\\/", next: "start" },
                { defaultToken: "comment" }
            ],
            "comment": [
                { token: "comment", regex: "\\*\\/", next: "no_regex" },
                { defaultToken: "comment" }
            ],
            "line_comment_regex_allowed": [
                { token: "comment", regex: "$|^", next: "start" },
                { defaultToken: "comment" }
            ],
            "line_comment": [
                { token: "comment", regex: "$|^", next: "no_regex" },
                { defaultToken: "comment" }
            ],
            "qqstring": [
                {
                    token: "constant.language.escape",
                    regex: escapedRe
                }, {
                    token: "string",
                    regex: "\\\\$",
                    next: "qqstring"
                }, {
                    token: "string",
                    regex: '"|$',
                    next: "no_regex"
                }, {
                    defaultToken: "string"
                }
            ],
            "qstring": [
                {
                    token: "constant.language.escape",
                    regex: escapedRe
                }, {
                    token: "string",
                    regex: "\\\\$",
                    next: "qstring"
                }, {
                    token: "string",
                    regex: "'|$",
                    next: "no_regex"
                }, {
                    defaultToken: "string"
                }
            ]
        };
        if (!options || !options.noES6) {
            this.$rules.no_regex.unshift({
                regex: "[{}]", onMatch: function (val, state, stack) {
                    this.next = val == "{" ? this.nextState : "";
                    if (val == "{" && stack.length) {
                        stack.unshift("start", state);
                        return "paren";
                    }
                    if (val == "}" && stack.length) {
                        stack.shift();
                        this.next = stack.shift();
                        if (this.next.indexOf("string") != -1)
                            return "paren.quasi.end";
                    }
                    return val == "{" ? "paren.lparen" : "paren.rparen";
                },
                nextState: "start"
            }, {
                token: "string.quasi.start",
                regex: /`/,
                push: [{
                        token: "constant.language.escape",
                        regex: escapedRe
                    }, {
                        token: "paren.quasi.start",
                        regex: /\${/,
                        push: "start"
                    }, {
                        token: "string.quasi.end",
                        regex: /`/,
                        next: "pop"
                    }, {
                        defaultToken: "string.quasi"
                    }]
            });
        }
        this.embedRules(DocCommentHighlightRules, "doc-", [DocCommentHighlightRules.getEndRule("no_regex")]);
        this.normalizeRules();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSmF2YVNjcmlwdEhpZ2hsaWdodFJ1bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiSmF2YVNjcmlwdEhpZ2hsaWdodFJ1bGVzLnRzIl0sIm5hbWVzIjpbIkphdmFTY3JpcHRIaWdobGlnaHRSdWxlcyIsIkphdmFTY3JpcHRIaWdobGlnaHRSdWxlcy5jb25zdHJ1Y3RvciJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLHdCQUF3QixNQUFNLDRCQUE0QjtPQUMxRCxrQkFBa0IsTUFBTSxzQkFBc0I7QUFFckQsc0RBQXNELGtCQUFrQjtJQUN0RUEsWUFBWUEsT0FBa0JBO1FBQzVCQyxPQUFPQSxDQUFBQTtRQUVQQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBO1lBQ3pDQSxtQkFBbUJBLEVBQ2ZBLHlFQUF5RUE7Z0JBQ3pFQSw4QkFBOEJBO2dCQUM5QkEsd0VBQXdFQTtnQkFDeEVBLHVEQUF1REE7Z0JBQ3ZEQSx3RUFBd0VBO2dCQUN4RUEsaUNBQWlDQTtnQkFDakNBLDBFQUEwRUE7Z0JBQzFFQSw0QkFBNEJBO2dCQUM1QkEsWUFBWUE7Z0JBQ1pBLDBDQUEwQ0E7WUFDOUNBLFNBQVNBLEVBQ0xBLDZCQUE2QkE7Z0JBQzdCQSx3RUFBd0VBO2dCQUN4RUEsa0ZBQWtGQTtnQkFFbEZBLHNEQUFzREE7Z0JBQ3REQSw4RkFBOEZBO1lBQ2xHQSxjQUFjQSxFQUNWQSx3QkFBd0JBO1lBQzVCQSxtQkFBbUJBLEVBQ2ZBLDZCQUE2QkE7WUFDakNBLGtCQUFrQkEsRUFDZEEsT0FBT0E7WUFDWEEsMkJBQTJCQSxFQUFFQSxZQUFZQTtTQUM1Q0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFHakJBLElBQUlBLFVBQVVBLEdBQUdBLHVFQUF1RUEsQ0FBQ0E7UUFHekZBLElBQUlBLFlBQVlBLEdBQUdBLDJEQUEyREEsQ0FBQ0E7UUFFL0VBLElBQUlBLFNBQVNBLEdBQUdBLHlCQUF5QkE7WUFDckNBLGtCQUFrQkE7WUFD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RUE7Z0JBQ0NBLEtBQUtBLEVBQUdBLG9CQUFvQkE7Z0JBQzVCQSxLQUFLQSxFQUFHQSxHQUFHQTtnQkFDWEEsSUFBSUEsRUFBSUEsQ0FBQ0E7d0JBQ0xBLEtBQUtBLEVBQUdBLDBCQUEwQkE7d0JBQ2xDQSxLQUFLQSxFQUFHQSxTQUFTQTtxQkFDcEJBLEVBQUVBO3dCQUNDQSxLQUFLQSxFQUFHQSxtQkFBbUJBO3dCQUMzQkEsS0FBS0EsRUFBR0EsS0FBS0E7d0JBQ2JBLElBQUlBLEVBQUlBLE9BQU9BO3FCQUNsQkEsRUFBRUE7d0JBQ0NBLEtBQUtBLEVBQUdBLGtCQUFrQkE7d0JBQzFCQSxLQUFLQSxFQUFHQSxHQUFHQTt3QkFDWEEsSUFBSUEsRUFBSUEsS0FBS0E7cUJBQ2hCQSxFQUFFQTt3QkFDQ0EsWUFBWUEsRUFBRUEsY0FBY0E7cUJBQy9CQSxDQUFDQTthQUNMQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSx3QkFBd0JBLEVBQUVBLE1BQU1BLEVBQzVDQSxDQUFFQSx3QkFBd0JBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUVBLENBQUNBLENBQUNBO1FBRXpEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUN4QkEsQ0FBQ0E7QUFDSEQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcyBmcm9tIFwiLi9Eb2NDb21tZW50SGlnaGxpZ2h0UnVsZXNcIjtcbmltcG9ydCBUZXh0SGlnaGxpZ2h0UnVsZXMgZnJvbSBcIi4vVGV4dEhpZ2hsaWdodFJ1bGVzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEphdmFTY3JpcHRIaWdobGlnaHRSdWxlcyBleHRlbmRzIFRleHRIaWdobGlnaHRSdWxlcyB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnM/OiB7bm9FUzY/fSkge1xuICAgIHN1cGVyKClcbiAgICAvLyBzZWU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzXG4gICAgdmFyIGtleXdvcmRNYXBwZXIgPSB0aGlzLmNyZWF0ZUtleXdvcmRNYXBwZXIoe1xuICAgICAgICBcInZhcmlhYmxlLmxhbmd1YWdlXCI6XG4gICAgICAgICAgICBcIkFycmF5fEJvb2xlYW58RGF0ZXxGdW5jdGlvbnxJdGVyYXRvcnxOdW1iZXJ8T2JqZWN0fFJlZ0V4cHxTdHJpbmd8UHJveHl8XCIgICsgLy8gQ29uc3RydWN0b3JzXG4gICAgICAgICAgICBcIk5hbWVzcGFjZXxRTmFtZXxYTUx8WE1MTGlzdHxcIiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgLy8gRTRYXG4gICAgICAgICAgICBcIkFycmF5QnVmZmVyfEZsb2F0MzJBcnJheXxGbG9hdDY0QXJyYXl8SW50MTZBcnJheXxJbnQzMkFycmF5fEludDhBcnJheXxcIiAgICtcbiAgICAgICAgICAgIFwiVWludDE2QXJyYXl8VWludDMyQXJyYXl8VWludDhBcnJheXxVaW50OENsYW1wZWRBcnJheXxcIiAgICAgICAgICAgICAgICAgICAgK1xuICAgICAgICAgICAgXCJFcnJvcnxFdmFsRXJyb3J8SW50ZXJuYWxFcnJvcnxSYW5nZUVycm9yfFJlZmVyZW5jZUVycm9yfFN0b3BJdGVyYXRpb258XCIgICArIC8vIEVycm9yc1xuICAgICAgICAgICAgXCJTeW50YXhFcnJvcnxUeXBlRXJyb3J8VVJJRXJyb3J8XCIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArXG4gICAgICAgICAgICBcImRlY29kZVVSSXxkZWNvZGVVUklDb21wb25lbnR8ZW5jb2RlVVJJfGVuY29kZVVSSUNvbXBvbmVudHxldmFsfGlzRmluaXRlfFwiICsgLy8gTm9uLWNvbnN0cnVjdG9yIGZ1bmN0aW9uc1xuICAgICAgICAgICAgXCJpc05hTnxwYXJzZUZsb2F0fHBhcnNlSW50fFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArXG4gICAgICAgICAgICBcIkpTT058TWF0aHxcIiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICsgLy8gT3RoZXJcbiAgICAgICAgICAgIFwidGhpc3xhcmd1bWVudHN8cHJvdG90eXBlfHdpbmRvd3xkb2N1bWVudFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLCAvLyBQc2V1ZG9cbiAgICAgICAgXCJrZXl3b3JkXCI6XG4gICAgICAgICAgICBcImNvbnN0fHlpZWxkfGltcG9ydHxnZXR8c2V0fFwiICtcbiAgICAgICAgICAgIFwiYnJlYWt8Y2FzZXxjYXRjaHxjb250aW51ZXxkZWZhdWx0fGRlbGV0ZXxkb3xlbHNlfGZpbmFsbHl8Zm9yfGZ1bmN0aW9ufFwiICtcbiAgICAgICAgICAgIFwiaWZ8aW58aW5zdGFuY2VvZnxuZXd8cmV0dXJufHN3aXRjaHx0aHJvd3x0cnl8dHlwZW9mfGxldHx2YXJ8d2hpbGV8d2l0aHxkZWJ1Z2dlcnxcIiArXG4gICAgICAgICAgICAvLyBpbnZhbGlkIG9yIHJlc2VydmVkXG4gICAgICAgICAgICBcIl9fcGFyZW50X198X19jb3VudF9ffGVzY2FwZXx1bmVzY2FwZXx3aXRofF9fcHJvdG9fX3xcIiArXG4gICAgICAgICAgICBcImNsYXNzfGVudW18ZXh0ZW5kc3xzdXBlcnxleHBvcnR8aW1wbGVtZW50c3xwcml2YXRlfHB1YmxpY3xpbnRlcmZhY2V8cGFja2FnZXxwcm90ZWN0ZWR8c3RhdGljXCIsXG4gICAgICAgIFwic3RvcmFnZS50eXBlXCI6XG4gICAgICAgICAgICBcImNvbnN0fGxldHx2YXJ8ZnVuY3Rpb25cIixcbiAgICAgICAgXCJjb25zdGFudC5sYW5ndWFnZVwiOlxuICAgICAgICAgICAgXCJudWxsfEluZmluaXR5fE5hTnx1bmRlZmluZWRcIixcbiAgICAgICAgXCJzdXBwb3J0LmZ1bmN0aW9uXCI6XG4gICAgICAgICAgICBcImFsZXJ0XCIsXG4gICAgICAgIFwiY29uc3RhbnQubGFuZ3VhZ2UuYm9vbGVhblwiOiBcInRydWV8ZmFsc2VcIlxuICAgIH0sIFwiaWRlbnRpZmllclwiKTtcblxuICAgIC8vIGtleXdvcmRzIHdoaWNoIGNhbiBiZSBmb2xsb3dlZCBieSByZWd1bGFyIGV4cHJlc3Npb25zXG4gICAgdmFyIGt3QmVmb3JlUmUgPSBcImNhc2V8ZG98ZWxzZXxmaW5hbGx5fGlufGluc3RhbmNlb2Z8cmV0dXJufHRocm93fHRyeXx0eXBlb2Z8eWllbGR8dm9pZFwiO1xuXG4gICAgLy8gVE9ETzogVW5pY29kZSBlc2NhcGUgc2VxdWVuY2VzXG4gICAgdmFyIGlkZW50aWZpZXJSZSA9IFwiW2EtekEtWlxcXFwkX1xcdTAwYTEtXFx1ZmZmZl1bYS16QS1aXFxcXGRcXFxcJF9cXHUwMGExLVxcdWZmZmZdKlxcXFxiXCI7XG5cbiAgICB2YXIgZXNjYXBlZFJlID0gXCJcXFxcXFxcXCg/OnhbMC05YS1mQS1GXXsyfXxcIiArIC8vIGhleFxuICAgICAgICBcInVbMC05YS1mQS1GXXs0fXxcIiArIC8vIHVuaWNvZGVcbiAgICAgICAgXCJbMC0yXVswLTddezAsMn18XCIgKyAvLyBvY3RcbiAgICAgICAgXCIzWzAtNl1bMC03XT98XCIgKyAvLyBvY3RcbiAgICAgICAgXCIzN1swLTddP3xcIiArIC8vIG9jdFxuICAgICAgICBcIls0LTddWzAtN10/fFwiICsgLy9vY3RcbiAgICAgICAgXCIuKVwiO1xuXG4gICAgLy8gcmVnZXhwIG11c3Qgbm90IGhhdmUgY2FwdHVyaW5nIHBhcmVudGhlc2VzLiBVc2UgKD86KSBpbnN0ZWFkLlxuICAgIC8vIHJlZ2V4cHMgYXJlIG9yZGVyZWQgLT4gdGhlIGZpcnN0IG1hdGNoIGlzIHVzZWRcblxuICAgIHRoaXMuJHJ1bGVzID0ge1xuICAgICAgICBcIm5vX3JlZ2V4XCIgOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbW1lbnRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXC9cXFxcL1wiLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcImxpbmVfY29tbWVudFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgRG9jQ29tbWVudEhpZ2hsaWdodFJ1bGVzLmdldFN0YXJ0UnVsZShcImRvYy1zdGFydFwiKSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29tbWVudFwiLCAvLyBtdWx0aSBsaW5lIGNvbW1lbnRcbiAgICAgICAgICAgICAgICByZWdleCA6IC9cXC9cXCovLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcImNvbW1lbnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiJyg/PS4pXCIsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInFzdHJpbmdcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6ICdcIig/PS4pJyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwicXFzdHJpbmdcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5udW1lcmljXCIsIC8vIGhleFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLzBbeFhdWzAtOWEtZkEtRl0rXFxiL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5udW1lcmljXCIsIC8vIGZsb2F0XG4gICAgICAgICAgICAgICAgcmVnZXggOiAvWystXT9cXGQrKD86KD86XFwuXFxkKik/KD86W2VFXVsrLV0/XFxkKyk/KT9cXGIvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gU291bmQucHJvdG90eXBlLnBsYXkgPVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcInN0b3JhZ2UudHlwZVwiLCBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwic3VwcG9ydC5mdW5jdGlvblwiLFxuICAgICAgICAgICAgICAgICAgICBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsXCJrZXl3b3JkLm9wZXJhdG9yXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoXCIgKyBpZGVudGlmaWVyUmUgKyBcIikoXFxcXC4pKHByb3RvdHlwZSkoXFxcXC4pKFwiICsgaWRlbnRpZmllclJlICtcIikoXFxcXHMqKSg9KVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBTb3VuZC5wbGF5ID0gZnVuY3Rpb24oKSB7ICB9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwic3RvcmFnZS50eXBlXCIsIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJrZXl3b3JkLm9wZXJhdG9yXCIsIFwidGV4dFwiLCBcInN0b3JhZ2UudHlwZVwiLCBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihcIiArIGlkZW50aWZpZXJSZSArIFwiKShcXFxcLikoXCIgKyBpZGVudGlmaWVyUmUgK1wiKShcXFxccyopKD0pKFxcXFxzKikoZnVuY3Rpb24pKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIHBsYXkgPSBmdW5jdGlvbigpIHsgIH1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIiwgXCJrZXl3b3JkLm9wZXJhdG9yXCIsIFwidGV4dFwiLCBcInN0b3JhZ2UudHlwZVwiLFxuICAgICAgICAgICAgICAgICAgICBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihcIiArIGlkZW50aWZpZXJSZSArXCIpKFxcXFxzKikoPSkoXFxcXHMqKShmdW5jdGlvbikoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gU291bmQucGxheSA9IGZ1bmN0aW9uIHBsYXkoKSB7ICB9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwic3RvcmFnZS50eXBlXCIsIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJrZXl3b3JkLm9wZXJhdG9yXCIsIFwidGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICBcInN0b3JhZ2UudHlwZVwiLCBcInRleHRcIiwgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihcIiArIGlkZW50aWZpZXJSZSArIFwiKShcXFxcLikoXCIgKyBpZGVudGlmaWVyUmUgK1wiKShcXFxccyopKD0pKFxcXFxzKikoZnVuY3Rpb24pKFxcXFxzKykoXFxcXHcrKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBmdW5jdGlvbiBteUZ1bmMoYXJnKSB7IH1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJzdG9yYWdlLnR5cGVcIiwgXCJ0ZXh0XCIsIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoZnVuY3Rpb24pKFxcXFxzKykoXCIgKyBpZGVudGlmaWVyUmUgKyBcIikoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gZm9vYmFyOiBmdW5jdGlvbigpIHsgfVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLCBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgICAgIFwidGV4dFwiLCBcInN0b3JhZ2UudHlwZVwiLCBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihcIiArIGlkZW50aWZpZXJSZSArIFwiKShcXFxccyopKDopKFxcXFxzKikoZnVuY3Rpb24pKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIDogZnVuY3Rpb24oKSB7IH0gKHRoaXMgaXMgZm9yIGlzc3VlcyB3aXRoICdmb28nOiBmdW5jdGlvbigpIHsgfSlcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCIsIFwidGV4dFwiLCBcInN0b3JhZ2UudHlwZVwiLCBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIig6KShcXFxccyopKGZ1bmN0aW9uKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwia2V5d29yZFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoPzpcIiArIGt3QmVmb3JlUmUgKyBcIilcXFxcYlwiLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwic3VwcG9ydC5mdW5jdGlvblwiXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IC8oXFwuKShzKD86aCg/OmlmdHxvdyg/Ok1vZCg/OmVsZXNzRGlhbG9nfGFsRGlhbG9nKXxIZWxwKSl8Y3JvbGwoPzpYfEJ5KD86UGFnZXN8TGluZXMpP3xZfFRvKT98dCg/Om9wfHJpa2UpfGkoPzpufHplVG9Db250ZW50fGRlYmFyfGduVGV4dCl8b3J0fHUoPzpwfGIoPzpzdHIoPzppbmcpPyk/KXxwbGkoPzpjZXx0KXxlKD86bmR8dCg/OlJlKD86c2l6YWJsZXxxdWVzdEhlYWRlcil8TSg/OmkoPzpudXRlc3xsbGlzZWNvbmRzKXxvbnRoKXxTZWNvbmRzfEhvKD86dEtleXN8dXJzKXxZZWFyfEN1cnNvcnxUaW1lKD86b3V0KT98SW50ZXJ2YWx8Wk9wdGlvbnN8RGF0ZXxVVEMoPzpNKD86aSg/Om51dGVzfGxsaXNlY29uZHMpfG9udGgpfFNlY29uZHN8SG91cnN8RGF0ZXxGdWxsWWVhcil8RnVsbFllYXJ8QWN0aXZlKXxhcmNoKXxxcnR8bGljZXxhdmVQcmVmZXJlbmNlc3xtYWxsKXxoKD86b21lfGFuZGxlRXZlbnQpfG5hdmlnYXRlfGMoPzpoYXIoPzpDb2RlQXR8QXQpfG8oPzpzfG4oPzpjYXR8dGV4dHVhbHxmaXJtKXxtcGlsZSl8ZWlsfGxlYXIoPzpUaW1lb3V0fEludGVydmFsKT98YSg/OnB0dXJlRXZlbnRzfGxsKXxyZWF0ZSg/OlN0eWxlU2hlZXR8UG9wdXB8RXZlbnRPYmplY3QpKXx0KD86byg/OkdNVFN0cmluZ3xTKD86dHJpbmd8b3VyY2UpfFUoPzpUQ1N0cmluZ3xwcGVyQ2FzZSl8TG8oPzpjYWxlU3RyaW5nfHdlckNhc2UpKXxlc3R8YSg/Om58aW50KD86RW5hYmxlZCk/KSl8aSg/OnMoPzpOYU58RmluaXRlKXxuZGV4T2Z8dGFsaWNzKXxkKD86aXNhYmxlRXh0ZXJuYWxDYXB0dXJlfHVtcHxldGFjaEV2ZW50KXx1KD86big/OnNoaWZ0fHRhaW50fGVzY2FwZXx3YXRjaCl8cGRhdGVDb21tYW5kcyl8aig/Om9pbnxhdmFFbmFibGVkKXxwKD86byg/OnB8dyl8dXNofGx1Z2lucy5yZWZyZXNofGEoPzpkZGluZ3N8cnNlKD86SW50fEZsb2F0KT8pfHIoPzppbnR8b21wdHxlZmVyZW5jZSkpfGUoPzpzY2FwZXxuYWJsZUV4dGVybmFsQ2FwdHVyZXx2YWx8bGVtZW50RnJvbVBvaW50fHgoPzpwfGVjKD86U2NyaXB0fENvbW1hbmQpPykpfHZhbHVlT2Z8VVRDfHF1ZXJ5Q29tbWFuZCg/OlN0YXRlfEluZGV0ZXJtfEVuYWJsZWR8VmFsdWUpfGYoPzppKD86bmR8bGUoPzpNb2RpZmllZERhdGV8U2l6ZXxDcmVhdGVkRGF0ZXxVcGRhdGVkRGF0ZSl8eGVkKXxvKD86bnQoPzpzaXplfGNvbG9yKXxyd2FyZCl8bG9vcnxyb21DaGFyQ29kZSl8d2F0Y2h8bCg/Omlua3xvKD86YWR8Zyl8YXN0SW5kZXhPZil8YSg/OnNpbnxuY2hvcnxjb3N8dCg/OnRhY2hFdmVudHxvYnxhbig/OjIpPyl8cHBseXxsZXJ0fGIoPzpzfG9ydCkpfHIoPzpvdSg/Om5kfHRlRXZlbnRzKXxlKD86c2l6ZSg/OkJ5fFRvKXxjYWxjfHR1cm5WYWx1ZXxwbGFjZXx2ZXJzZXxsKD86b2FkfGVhc2UoPzpDYXB0dXJlfEV2ZW50cykpKXxhbmRvbSl8Zyg/Om98ZXQoPzpSZXNwb25zZUhlYWRlcnxNKD86aSg/Om51dGVzfGxsaXNlY29uZHMpfG9udGgpfFNlKD86Y29uZHN8bGVjdGlvbil8SG91cnN8WWVhcnxUaW1lKD86em9uZU9mZnNldCk/fERhKD86eXx0ZSl8VVRDKD86TSg/OmkoPzpudXRlc3xsbGlzZWNvbmRzKXxvbnRoKXxTZWNvbmRzfEhvdXJzfERhKD86eXx0ZSl8RnVsbFllYXIpfEZ1bGxZZWFyfEEoPzp0dGVudGlvbnxsbFJlc3BvbnNlSGVhZGVycykpKXxtKD86aW58b3ZlKD86Qig/Onl8ZWxvdyl8VG8oPzpBYnNvbHV0ZSk/fEFib3ZlKXxlcmdlQXR0cmlidXRlc3xhKD86dGNofHJnaW5zfHgpKXxiKD86dG9hfGlnfG8oPzpsZHxyZGVyV2lkdGhzKXxsaW5rfGFjaykpXFxiKD89XFwoKS9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwic3VwcG9ydC5mdW5jdGlvbi5kb21cIl0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvKFxcLikocyg/OnViKD86c3RyaW5nRGF0YXxtaXQpfHBsaXRUZXh0fGUoPzp0KD86TmFtZWRJdGVtfEF0dHJpYnV0ZSg/Ok5vZGUpPyl8bGVjdCkpfGhhcyg/OkNoaWxkTm9kZXN8RmVhdHVyZSl8bmFtZWRJdGVtfGMoPzpsKD86aWNrfG8oPzpzZXxuZU5vZGUpKXxyZWF0ZSg/OkMoPzpvbW1lbnR8REFUQVNlY3Rpb258YXB0aW9uKXxUKD86SGVhZHxleHROb2RlfEZvb3QpfERvY3VtZW50RnJhZ21lbnR8UHJvY2Vzc2luZ0luc3RydWN0aW9ufEUoPzpudGl0eVJlZmVyZW5jZXxsZW1lbnQpfEF0dHJpYnV0ZSkpfHRhYkluZGV4fGkoPzpuc2VydCg/OlJvd3xCZWZvcmV8Q2VsbHxEYXRhKXx0ZW0pfG9wZW58ZGVsZXRlKD86Um93fEMoPzplbGx8YXB0aW9uKXxUKD86SGVhZHxGb290KXxEYXRhKXxmb2N1c3x3cml0ZSg/OmxuKT98YSg/OmRkfHBwZW5kKD86Q2hpbGR8RGF0YSkpfHJlKD86c2V0fHBsYWNlKD86Q2hpbGR8RGF0YSl8bW92ZSg/Ok5hbWVkSXRlbXxDaGlsZHxBdHRyaWJ1dGUoPzpOb2RlKT8pPyl8Z2V0KD86TmFtZWRJdGVtfEVsZW1lbnQoPzpzQnkoPzpOYW1lfFRhZ05hbWUpfEJ5SWQpfEF0dHJpYnV0ZSg/Ok5vZGUpPyl8Ymx1cilcXGIoPz1cXCgpL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogW1wicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJzdXBwb3J0LmNvbnN0YW50XCJdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLyhcXC4pKHMoPzp5c3RlbUxhbmd1YWdlfGNyKD86aXB0c3xvbGxiYXJzfGVlbig/Olh8WXxUb3B8TGVmdCkpfHQoPzp5bGUoPzpTaGVldHMpP3xhdHVzKD86VGV4dHxiYXIpPyl8aWJsaW5nKD86QmVsb3d8QWJvdmUpfG91cmNlfHVmZml4ZXN8ZSg/OmN1cml0eSg/OlBvbGljeSk/fGwoPzplY3Rpb258ZikpKXxoKD86aXN0b3J5fG9zdCg/Om5hbWUpP3xhcyg/Omh8Rm9jdXMpKXx5fFgoPzpNTERvY3VtZW50fFNMRG9jdW1lbnQpfG4oPzpleHR8YW1lKD86c3BhY2UoPzpzfFVSSSl8UHJvcCkpfE0oPzpJTl9WQUxVRXxBWF9WQUxVRSl8Yyg/OmhhcmFjdGVyU2V0fG8oPzpuKD86c3RydWN0b3J8dHJvbGxlcnMpfG9raWVFbmFibGVkfGxvckRlcHRofG1wKD86b25lbnRzfGxldGUpKXx1cnJlbnR8cHVDbGFzc3xsKD86aSg/OnAoPzpib2FyZERhdGEpP3xlbnRJbmZvcm1hdGlvbil8b3NlZHxhc3Nlcyl8YWxsZSg/OmV8cil8cnlwdG8pfHQoPzpvKD86b2xiYXJ8cCl8ZXh0KD86VHJhbnNmb3JtfEluZGVudHxEZWNvcmF0aW9ufEFsaWduKXxhZ3MpfFNRUlQoPzoxXzJ8Mil8aSg/Om4oPzpuZXIoPzpIZWlnaHR8V2lkdGgpfHB1dCl8ZHN8Z25vcmVDYXNlKXx6SW5kZXh8byg/OnNjcHV8big/OnJlYWR5c3RhdGVjaGFuZ2V8TGluZSl8dXRlcig/OkhlaWdodHxXaWR0aCl8cCg/OnNQcm9maWxlfGVuZXIpfGZmc2NyZWVuQnVmZmVyaW5nKXxORUdBVElWRV9JTkZJTklUWXxkKD86aSg/OnNwbGF5fGFsb2coPzpIZWlnaHR8VG9wfFdpZHRofExlZnR8QXJndW1lbnRzKXxyZWN0b3JpZXMpfGUoPzpzY3JpcHRpb258ZmF1bHQoPzpTdGF0dXN8Q2goPzplY2tlZHxhcnNldCl8VmlldykpKXx1KD86c2VyKD86UHJvZmlsZXxMYW5ndWFnZXxBZ2VudCl8big/OmlxdWVJRHxkZWZpbmVkKXxwZGF0ZUludGVydmFsKXxfY29udGVudHxwKD86aXhlbERlcHRofG9ydHxlcnNvbmFsYmFyfGtjczExfGwoPzp1Z2luc3xhdGZvcm0pfGEoPzp0aG5hbWV8ZGRpbmcoPzpSaWdodHxCb3R0b218VG9wfExlZnQpfHJlbnQoPzpXaW5kb3d8TGF5ZXIpP3xnZSg/OlgoPzpPZmZzZXQpP3xZKD86T2Zmc2V0KT8pKXxyKD86byg/OnRvKD86Y29sfHR5cGUpfGR1Y3QoPzpTdWIpP3xtcHRlcil8ZSg/OnZpb3VzfGZpeCkpKXxlKD86big/OmNvZGluZ3xhYmxlZFBsdWdpbil8eCg/OnRlcm5hbHxwYW5kbyl8bWJlZHMpfHYoPzppc2liaWxpdHl8ZW5kb3IoPzpTdWIpP3xMaW5rY29sb3IpfFVSTFVuZW5jb2RlZHxQKD86SXxPU0lUSVZFX0lORklOSVRZKXxmKD86aWxlbmFtZXxvKD86bnQoPzpTaXplfEZhbWlseXxXZWlnaHQpfHJtTmFtZSl8cmFtZSg/OnN8RWxlbWVudCl8Z0NvbG9yKXxFfHdoaXRlU3BhY2V8bCg/OmkoPzpzdFN0eWxlVHlwZXxuKD86ZUhlaWdodHxrQ29sb3IpKXxvKD86Y2EoPzp0aW9uKD86YmFyKT98bE5hbWUpfHdzcmMpfGUoPzpuZ3RofGZ0KD86Q29udGV4dCk/KXxhKD86c3QoPzpNKD86b2RpZmllZHxhdGNoKXxJbmRleHxQYXJlbil8eWVyKD86c3xYKXxuZ3VhZ2UpKXxhKD86cHAoPzpNaW5vclZlcnNpb258TmFtZXxDbyg/OmRlTmFtZXxyZSl8VmVyc2lvbil8dmFpbCg/OkhlaWdodHxUb3B8V2lkdGh8TGVmdCl8bGx8cig/Oml0eXxndW1lbnRzKXxMaW5rY29sb3J8Ym92ZSl8cig/OmlnaHQoPzpDb250ZXh0KT98ZSg/OnNwb25zZSg/OlhNTHxUZXh0KXxhZHlTdGF0ZSkpfGdsb2JhbHx4fG0oPzppbWVUeXBlc3x1bHRpbGluZXxlbnViYXJ8YXJnaW4oPzpSaWdodHxCb3R0b218VG9wfExlZnQpKXxMKD86Tig/OjEwfDIpfE9HKD86MTBFfDJFKSl8Yig/Om8oPzp0dG9tfHJkZXIoPzpXaWR0aHxSaWdodFdpZHRofEJvdHRvbVdpZHRofFN0eWxlfENvbG9yfFRvcFdpZHRofExlZnRXaWR0aCkpfHVmZmVyRGVwdGh8ZWxvd3xhY2tncm91bmQoPzpDb2xvcnxJbWFnZSkpKVxcYi9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcInN1cHBvcnQuY29uc3RhbnRcIl0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvdGhhdFxcYi9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcInN0b3JhZ2UudHlwZVwiLCBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwic3VwcG9ydC5mdW5jdGlvbi5maXJlYnVnXCJdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLyhjb25zb2xlKShcXC4pKHdhcm58aW5mb3xsb2d8ZXJyb3J8dGltZXx0cmFjZXx0aW1lRW5kfGFzc2VydClcXGIvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBrZXl3b3JkTWFwcGVyLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogaWRlbnRpZmllclJlXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImtleXdvcmQub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC8tLXxcXCtcXCt8PT09fD09fD18IT18IT09fDw9fD49fDw8PXw+Pj18Pj4+PXw8Pnw8fD58IXwmJnxcXHxcXHx8XFw/XFw6fFshJCUmKitcXC1+XFwvXl09Py8sXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC9bPzosOy5dLyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJwYXJlbi5scGFyZW5cIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC9bXFxbKHtdLyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJwYXJlbi5ycGFyZW5cIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC9bXFxdKX1dL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImNvbW1lbnRcIixcbiAgICAgICAgICAgICAgICByZWdleDogL14jIS4qJC9cbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgLy8gcmVndWxhciBleHByZXNzaW9ucyBhcmUgb25seSBhbGxvd2VkIGFmdGVyIGNlcnRhaW4gdG9rZW5zLiBUaGlzXG4gICAgICAgIC8vIG1ha2VzIHN1cmUgd2UgZG9uJ3QgbWl4IHVwIHJlZ2V4cHMgd2l0aCB0aGUgZGl2aXNvbiBvcGVyYXRvclxuICAgICAgICBcInN0YXJ0XCI6IFtcbiAgICAgICAgICAgIERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcy5nZXRTdGFydFJ1bGUoXCJkb2Mtc3RhcnRcIiksXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbW1lbnRcIiwgLy8gbXVsdGkgbGluZSBjb21tZW50XG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFwvXFxcXCpcIixcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJjb21tZW50X3JlZ2V4X2FsbG93ZWRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb21tZW50XCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFwvXFxcXC9cIixcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJsaW5lX2NvbW1lbnRfcmVnZXhfYWxsb3dlZFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwic3RyaW5nLnJlZ2V4cFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFwvXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJyZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInRleHRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXHMrfF4kXCIsXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIGltbWVkaWF0ZWx5IHJldHVybiB0byB0aGUgc3RhcnQgbW9kZSB3aXRob3V0IG1hdGNoaW5nXG4gICAgICAgICAgICAgICAgLy8gYW55dGhpbmdcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJlbXB0eVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBcInJlZ2V4XCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAvLyBlc2NhcGVzXG4gICAgICAgICAgICAgICAgdG9rZW46IFwicmVnZXhwLmtleXdvcmQub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcXFxcXCg/OnVbXFxcXGRhLWZBLUZdezR9fHhbXFxcXGRhLWZBLUZdezJ9fC4pXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBmbGFnXG4gICAgICAgICAgICAgICAgdG9rZW46IFwic3RyaW5nLnJlZ2V4cFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIi9bc3huZ2lteV0qXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gaW52YWxpZCBvcGVyYXRvcnNcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiaW52YWxpZFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFx7XFxkK1xcYiw/XFxkKlxcfVsrKl18WysqJF4/XVsrKl18WyReXVs/XXxcXD97Myx9L1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIG9wZXJhdG9yc1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleDogL1xcKFxcP1s6PSFdfFxcKXxcXHtcXGQrXFxiLD9cXGQqXFx9fFsrKl1cXD98WygpJF4rKj8uXS9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubGFuZ3VhZ2UuZGVsaW1pdGVyXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXHwvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXFtcXF4/LyxcbiAgICAgICAgICAgICAgICBuZXh0OiBcInJlZ2V4X2NoYXJhY3Rlcl9jbGFzc1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiZW1wdHlcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCIkXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgZGVmYXVsdFRva2VuOiBcInN0cmluZy5yZWdleHBcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBcInJlZ2V4X2NoYXJhY3Rlcl9jbGFzc1wiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwicmVnZXhwLmNoYXJjbGFzcy5rZXl3b3JkLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXFxcXFwoPzp1W1xcXFxkYS1mQS1GXXs0fXx4W1xcXFxkYS1mQS1GXXsyfXwuKVwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwicmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIi1cIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImVtcHR5XCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiJFwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGRlZmF1bHRUb2tlbjogXCJzdHJpbmcucmVnZXhwLmNoYXJhY2h0ZXJjbGFzc1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIFwiZnVuY3Rpb25fYXJndW1lbnRzXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJ2YXJpYWJsZS5wYXJhbWV0ZXJcIixcbiAgICAgICAgICAgICAgICByZWdleDogaWRlbnRpZmllclJlXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJbLCBdK1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCIkXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJlbXB0eVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBcImNvbW1lbnRfcmVnZXhfYWxsb3dlZFwiIDogW1xuICAgICAgICAgICAge3Rva2VuIDogXCJjb21tZW50XCIsIHJlZ2V4IDogXCJcXFxcKlxcXFwvXCIsIG5leHQgOiBcInN0YXJ0XCJ9LFxuICAgICAgICAgICAge2RlZmF1bHRUb2tlbiA6IFwiY29tbWVudFwifVxuICAgICAgICBdLFxuICAgICAgICBcImNvbW1lbnRcIiA6IFtcbiAgICAgICAgICAgIHt0b2tlbiA6IFwiY29tbWVudFwiLCByZWdleCA6IFwiXFxcXCpcXFxcL1wiLCBuZXh0IDogXCJub19yZWdleFwifSxcbiAgICAgICAgICAgIHtkZWZhdWx0VG9rZW4gOiBcImNvbW1lbnRcIn1cbiAgICAgICAgXSxcbiAgICAgICAgXCJsaW5lX2NvbW1lbnRfcmVnZXhfYWxsb3dlZFwiIDogW1xuICAgICAgICAgICAge3Rva2VuIDogXCJjb21tZW50XCIsIHJlZ2V4IDogXCIkfF5cIiwgbmV4dCA6IFwic3RhcnRcIn0sXG4gICAgICAgICAgICB7ZGVmYXVsdFRva2VuIDogXCJjb21tZW50XCJ9XG4gICAgICAgIF0sXG4gICAgICAgIFwibGluZV9jb21tZW50XCIgOiBbXG4gICAgICAgICAgICB7dG9rZW4gOiBcImNvbW1lbnRcIiwgcmVnZXggOiBcIiR8XlwiLCBuZXh0IDogXCJub19yZWdleFwifSxcbiAgICAgICAgICAgIHtkZWZhdWx0VG9rZW4gOiBcImNvbW1lbnRcIn1cbiAgICAgICAgXSxcbiAgICAgICAgXCJxcXN0cmluZ1wiIDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IGVzY2FwZWRSZVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXFxcXFwkXCIsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInFxc3RyaW5nXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAnXCJ8JCcsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0VG9rZW46IFwic3RyaW5nXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgXCJxc3RyaW5nXCIgOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogZXNjYXBlZFJlXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxcXFxcXCRcIixcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwicXN0cmluZ1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCInfCRcIixcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGRlZmF1bHRUb2tlbjogXCJzdHJpbmdcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdXG4gICAgfTtcbiAgICBcbiAgICBcbiAgICBpZiAoIW9wdGlvbnMgfHwgIW9wdGlvbnMubm9FUzYpIHtcbiAgICAgICAgdGhpcy4kcnVsZXMubm9fcmVnZXgudW5zaGlmdCh7XG4gICAgICAgICAgICByZWdleDogXCJbe31dXCIsIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbCwgc3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5uZXh0ID0gdmFsID09IFwie1wiID8gdGhpcy5uZXh0U3RhdGUgOiBcIlwiO1xuICAgICAgICAgICAgICAgIGlmICh2YWwgPT0gXCJ7XCIgJiYgc3RhY2subGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnVuc2hpZnQoXCJzdGFydFwiLCBzdGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcInBhcmVuXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh2YWwgPT0gXCJ9XCIgJiYgc3RhY2subGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV4dCA9IHN0YWNrLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm5leHQuaW5kZXhPZihcInN0cmluZ1wiKSAhPSAtMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcInBhcmVuLnF1YXNpLmVuZFwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsID09IFwie1wiID8gXCJwYXJlbi5scGFyZW5cIiA6IFwicGFyZW4ucnBhcmVuXCI7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbmV4dFN0YXRlOiBcInN0YXJ0XCJcbiAgICAgICAgfSwge1xuICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZy5xdWFzaS5zdGFydFwiLFxuICAgICAgICAgICAgcmVnZXggOiAvYC8sXG4gICAgICAgICAgICBwdXNoICA6IFt7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogZXNjYXBlZFJlXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInBhcmVuLnF1YXNpLnN0YXJ0XCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvXFwkey8sXG4gICAgICAgICAgICAgICAgcHVzaCAgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nLnF1YXNpLmVuZFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL2AvLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJwb3BcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGRlZmF1bHRUb2tlbjogXCJzdHJpbmcucXVhc2lcIlxuICAgICAgICAgICAgfV1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIHRoaXMuZW1iZWRSdWxlcyhEb2NDb21tZW50SGlnaGxpZ2h0UnVsZXMsIFwiZG9jLVwiLFxuICAgICAgICBbIERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcy5nZXRFbmRSdWxlKFwibm9fcmVnZXhcIikgXSk7XG4gICAgXG4gICAgdGhpcy5ub3JtYWxpemVSdWxlcygpO1xuICB9XG59XG4iXX0=