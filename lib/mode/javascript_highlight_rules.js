import DocCommentHighlightRules from "./doc_comment_highlight_rules";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamF2YXNjcmlwdF9oaWdobGlnaHRfcnVsZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbW9kZS9qYXZhc2NyaXB0X2hpZ2hsaWdodF9ydWxlcy50cyJdLCJuYW1lcyI6WyJKYXZhU2NyaXB0SGlnaGxpZ2h0UnVsZXMiLCJKYXZhU2NyaXB0SGlnaGxpZ2h0UnVsZXMuY29uc3RydWN0b3IiXSwibWFwcGluZ3MiOiJPQStCTyx3QkFBd0IsTUFBTSwrQkFBK0I7T0FDN0Qsa0JBQWtCLE1BQU0sc0JBQXNCO0FBRXJELHNEQUFzRCxrQkFBa0I7SUFDdEVBLFlBQVlBLE9BQU9BO1FBQ2pCQyxPQUFPQSxDQUFBQTtRQUVQQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBO1lBQ3pDQSxtQkFBbUJBLEVBQ2ZBLHlFQUF5RUE7Z0JBQ3pFQSw4QkFBOEJBO2dCQUM5QkEsd0VBQXdFQTtnQkFDeEVBLHVEQUF1REE7Z0JBQ3ZEQSx3RUFBd0VBO2dCQUN4RUEsaUNBQWlDQTtnQkFDakNBLDBFQUEwRUE7Z0JBQzFFQSw0QkFBNEJBO2dCQUM1QkEsWUFBWUE7Z0JBQ1pBLDBDQUEwQ0E7WUFDOUNBLFNBQVNBLEVBQ0xBLDZCQUE2QkE7Z0JBQzdCQSx3RUFBd0VBO2dCQUN4RUEsa0ZBQWtGQTtnQkFFbEZBLHNEQUFzREE7Z0JBQ3REQSw4RkFBOEZBO1lBQ2xHQSxjQUFjQSxFQUNWQSx3QkFBd0JBO1lBQzVCQSxtQkFBbUJBLEVBQ2ZBLDZCQUE2QkE7WUFDakNBLGtCQUFrQkEsRUFDZEEsT0FBT0E7WUFDWEEsMkJBQTJCQSxFQUFFQSxZQUFZQTtTQUM1Q0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFHakJBLElBQUlBLFVBQVVBLEdBQUdBLHVFQUF1RUEsQ0FBQ0E7UUFHekZBLElBQUlBLFlBQVlBLEdBQUdBLDJEQUEyREEsQ0FBQ0E7UUFFL0VBLElBQUlBLFNBQVNBLEdBQUdBLHlCQUF5QkE7WUFDckNBLGtCQUFrQkE7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RUFBRUE7Z0JBQ0NBLEtBQUtBLEVBQUdBLG9CQUFvQkE7Z0JBQzVCQSxLQUFLQSxFQUFHQSxHQUFHQTtnQkFDWEEsSUFBSUEsRUFBSUEsQ0FBQ0E7d0JBQ0xBLEtBQUtBLEVBQUdBLDBCQUEwQkE7d0JBQ2xDQSxLQUFLQSxFQUFHQSxTQUFTQTtxQkFDcEJBLEVBQUVBO3dCQUNDQSxLQUFLQSxFQUFHQSxtQkFBbUJBO3dCQUMzQkEsS0FBS0EsRUFBR0EsS0FBS0E7d0JBQ2JBLElBQUlBLEVBQUlBLE9BQU9BO3FCQUNsQkEsRUFBRUE7d0JBQ0NBLEtBQUtBLEVBQUdBLGtCQUFrQkE7d0JBQzFCQSxLQUFLQSxFQUFHQSxHQUFHQTt3QkFDWEEsSUFBSUEsRUFBSUEsS0FBS0E7cUJBQ2hCQSxFQUFFQTt3QkFDQ0EsWUFBWUEsRUFBRUEsY0FBY0E7cUJBQy9CQSxDQUFDQTthQUNMQSxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSx3QkFBd0JBLEVBQUVBLE1BQU1BLEVBQzVDQSxDQUFFQSx3QkFBd0JBLENBQUNBLFVBQVVBLENBQUNBLFVBQVVBLENBQUNBLENBQUVBLENBQUNBLENBQUNBO1FBRXpEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUN4QkEsQ0FBQ0E7QUFDSEQsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG5pbXBvcnQge2luaGVyaXRzfSBmcm9tIFwiLi4vbGliL29vcFwiO1xuaW1wb3J0IERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcyBmcm9tIFwiLi9kb2NfY29tbWVudF9oaWdobGlnaHRfcnVsZXNcIjtcbmltcG9ydCBUZXh0SGlnaGxpZ2h0UnVsZXMgZnJvbSBcIi4vVGV4dEhpZ2hsaWdodFJ1bGVzXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEphdmFTY3JpcHRIaWdobGlnaHRSdWxlcyBleHRlbmRzIFRleHRIaWdobGlnaHRSdWxlcyB7XG4gIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICBzdXBlcigpXG4gICAgLy8gc2VlOiBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0c1xuICAgIHZhciBrZXl3b3JkTWFwcGVyID0gdGhpcy5jcmVhdGVLZXl3b3JkTWFwcGVyKHtcbiAgICAgICAgXCJ2YXJpYWJsZS5sYW5ndWFnZVwiOlxuICAgICAgICAgICAgXCJBcnJheXxCb29sZWFufERhdGV8RnVuY3Rpb258SXRlcmF0b3J8TnVtYmVyfE9iamVjdHxSZWdFeHB8U3RyaW5nfFByb3h5fFwiICArIC8vIENvbnN0cnVjdG9yc1xuICAgICAgICAgICAgXCJOYW1lc3BhY2V8UU5hbWV8WE1MfFhNTExpc3R8XCIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIC8vIEU0WFxuICAgICAgICAgICAgXCJBcnJheUJ1ZmZlcnxGbG9hdDMyQXJyYXl8RmxvYXQ2NEFycmF5fEludDE2QXJyYXl8SW50MzJBcnJheXxJbnQ4QXJyYXl8XCIgICArXG4gICAgICAgICAgICBcIlVpbnQxNkFycmF5fFVpbnQzMkFycmF5fFVpbnQ4QXJyYXl8VWludDhDbGFtcGVkQXJyYXl8XCIgICAgICAgICAgICAgICAgICAgICtcbiAgICAgICAgICAgIFwiRXJyb3J8RXZhbEVycm9yfEludGVybmFsRXJyb3J8UmFuZ2VFcnJvcnxSZWZlcmVuY2VFcnJvcnxTdG9wSXRlcmF0aW9ufFwiICAgKyAvLyBFcnJvcnNcbiAgICAgICAgICAgIFwiU3ludGF4RXJyb3J8VHlwZUVycm9yfFVSSUVycm9yfFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgK1xuICAgICAgICAgICAgXCJkZWNvZGVVUkl8ZGVjb2RlVVJJQ29tcG9uZW50fGVuY29kZVVSSXxlbmNvZGVVUklDb21wb25lbnR8ZXZhbHxpc0Zpbml0ZXxcIiArIC8vIE5vbi1jb25zdHJ1Y3RvciBmdW5jdGlvbnNcbiAgICAgICAgICAgIFwiaXNOYU58cGFyc2VGbG9hdHxwYXJzZUludHxcIiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgK1xuICAgICAgICAgICAgXCJKU09OfE1hdGh8XCIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICArIC8vIE90aGVyXG4gICAgICAgICAgICBcInRoaXN8YXJndW1lbnRzfHByb3RvdHlwZXx3aW5kb3d8ZG9jdW1lbnRcIiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICwgLy8gUHNldWRvXG4gICAgICAgIFwia2V5d29yZFwiOlxuICAgICAgICAgICAgXCJjb25zdHx5aWVsZHxpbXBvcnR8Z2V0fHNldHxcIiArXG4gICAgICAgICAgICBcImJyZWFrfGNhc2V8Y2F0Y2h8Y29udGludWV8ZGVmYXVsdHxkZWxldGV8ZG98ZWxzZXxmaW5hbGx5fGZvcnxmdW5jdGlvbnxcIiArXG4gICAgICAgICAgICBcImlmfGlufGluc3RhbmNlb2Z8bmV3fHJldHVybnxzd2l0Y2h8dGhyb3d8dHJ5fHR5cGVvZnxsZXR8dmFyfHdoaWxlfHdpdGh8ZGVidWdnZXJ8XCIgK1xuICAgICAgICAgICAgLy8gaW52YWxpZCBvciByZXNlcnZlZFxuICAgICAgICAgICAgXCJfX3BhcmVudF9ffF9fY291bnRfX3xlc2NhcGV8dW5lc2NhcGV8d2l0aHxfX3Byb3RvX198XCIgK1xuICAgICAgICAgICAgXCJjbGFzc3xlbnVtfGV4dGVuZHN8c3VwZXJ8ZXhwb3J0fGltcGxlbWVudHN8cHJpdmF0ZXxwdWJsaWN8aW50ZXJmYWNlfHBhY2thZ2V8cHJvdGVjdGVkfHN0YXRpY1wiLFxuICAgICAgICBcInN0b3JhZ2UudHlwZVwiOlxuICAgICAgICAgICAgXCJjb25zdHxsZXR8dmFyfGZ1bmN0aW9uXCIsXG4gICAgICAgIFwiY29uc3RhbnQubGFuZ3VhZ2VcIjpcbiAgICAgICAgICAgIFwibnVsbHxJbmZpbml0eXxOYU58dW5kZWZpbmVkXCIsXG4gICAgICAgIFwic3VwcG9ydC5mdW5jdGlvblwiOlxuICAgICAgICAgICAgXCJhbGVydFwiLFxuICAgICAgICBcImNvbnN0YW50Lmxhbmd1YWdlLmJvb2xlYW5cIjogXCJ0cnVlfGZhbHNlXCJcbiAgICB9LCBcImlkZW50aWZpZXJcIik7XG5cbiAgICAvLyBrZXl3b3JkcyB3aGljaCBjYW4gYmUgZm9sbG93ZWQgYnkgcmVndWxhciBleHByZXNzaW9uc1xuICAgIHZhciBrd0JlZm9yZVJlID0gXCJjYXNlfGRvfGVsc2V8ZmluYWxseXxpbnxpbnN0YW5jZW9mfHJldHVybnx0aHJvd3x0cnl8dHlwZW9mfHlpZWxkfHZvaWRcIjtcblxuICAgIC8vIFRPRE86IFVuaWNvZGUgZXNjYXBlIHNlcXVlbmNlc1xuICAgIHZhciBpZGVudGlmaWVyUmUgPSBcIlthLXpBLVpcXFxcJF9cXHUwMGExLVxcdWZmZmZdW2EtekEtWlxcXFxkXFxcXCRfXFx1MDBhMS1cXHVmZmZmXSpcXFxcYlwiO1xuXG4gICAgdmFyIGVzY2FwZWRSZSA9IFwiXFxcXFxcXFwoPzp4WzAtOWEtZkEtRl17Mn18XCIgKyAvLyBoZXhcbiAgICAgICAgXCJ1WzAtOWEtZkEtRl17NH18XCIgKyAvLyB1bmljb2RlXG4gICAgICAgIFwiWzAtMl1bMC03XXswLDJ9fFwiICsgLy8gb2N0XG4gICAgICAgIFwiM1swLTZdWzAtN10/fFwiICsgLy8gb2N0XG4gICAgICAgIFwiMzdbMC03XT98XCIgKyAvLyBvY3RcbiAgICAgICAgXCJbNC03XVswLTddP3xcIiArIC8vb2N0XG4gICAgICAgIFwiLilcIjtcblxuICAgIC8vIHJlZ2V4cCBtdXN0IG5vdCBoYXZlIGNhcHR1cmluZyBwYXJlbnRoZXNlcy4gVXNlICg/OikgaW5zdGVhZC5cbiAgICAvLyByZWdleHBzIGFyZSBvcmRlcmVkIC0+IHRoZSBmaXJzdCBtYXRjaCBpcyB1c2VkXG5cbiAgICB0aGlzLiRydWxlcyA9IHtcbiAgICAgICAgXCJub19yZWdleFwiIDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb21tZW50XCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFwvXFxcXC9cIixcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJsaW5lX2NvbW1lbnRcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcy5nZXRTdGFydFJ1bGUoXCJkb2Mtc3RhcnRcIiksXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbW1lbnRcIiwgLy8gbXVsdGkgbGluZSBjb21tZW50XG4gICAgICAgICAgICAgICAgcmVnZXggOiAvXFwvXFwqLyxcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJjb21tZW50XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIicoPz0uKVwiLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJxc3RyaW5nXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAnXCIoPz0uKScsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInFxc3RyaW5nXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubnVtZXJpY1wiLCAvLyBoZXhcbiAgICAgICAgICAgICAgICByZWdleCA6IC8wW3hYXVswLTlhLWZBLUZdK1xcYi9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubnVtZXJpY1wiLCAvLyBmbG9hdFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1srLV0/XFxkKyg/Oig/OlxcLlxcZCopPyg/OltlRV1bKy1dP1xcZCspPyk/XFxiL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIFNvdW5kLnByb3RvdHlwZS5wbGF5ID1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJzdG9yYWdlLnR5cGVcIiwgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcInN1cHBvcnQuZnVuY3Rpb25cIixcbiAgICAgICAgICAgICAgICAgICAgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLFwia2V5d29yZC5vcGVyYXRvclwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKFwiICsgaWRlbnRpZmllclJlICsgXCIpKFxcXFwuKShwcm90b3R5cGUpKFxcXFwuKShcIiArIGlkZW50aWZpZXJSZSArXCIpKFxcXFxzKikoPSlcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gU291bmQucGxheSA9IGZ1bmN0aW9uKCkgeyAgfVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcInN0b3JhZ2UudHlwZVwiLCBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwia2V5d29yZC5vcGVyYXRvclwiLCBcInRleHRcIiwgXCJzdG9yYWdlLnR5cGVcIiwgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoXCIgKyBpZGVudGlmaWVyUmUgKyBcIikoXFxcXC4pKFwiICsgaWRlbnRpZmllclJlICtcIikoXFxcXHMqKSg9KShcXFxccyopKGZ1bmN0aW9uKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBwbGF5ID0gZnVuY3Rpb24oKSB7ICB9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsIFwia2V5d29yZC5vcGVyYXRvclwiLCBcInRleHRcIiwgXCJzdG9yYWdlLnR5cGVcIixcbiAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoXCIgKyBpZGVudGlmaWVyUmUgK1wiKShcXFxccyopKD0pKFxcXFxzKikoZnVuY3Rpb24pKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIFNvdW5kLnBsYXkgPSBmdW5jdGlvbiBwbGF5KCkgeyAgfVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcInN0b3JhZ2UudHlwZVwiLCBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwia2V5d29yZC5vcGVyYXRvclwiLCBcInRleHRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJzdG9yYWdlLnR5cGVcIiwgXCJ0ZXh0XCIsIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoXCIgKyBpZGVudGlmaWVyUmUgKyBcIikoXFxcXC4pKFwiICsgaWRlbnRpZmllclJlICtcIikoXFxcXHMqKSg9KShcXFxccyopKGZ1bmN0aW9uKShcXFxccyspKFxcXFx3KykoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gZnVuY3Rpb24gbXlGdW5jKGFyZykgeyB9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwic3RvcmFnZS50eXBlXCIsIFwidGV4dFwiLCBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKGZ1bmN0aW9uKShcXFxccyspKFwiICsgaWRlbnRpZmllclJlICsgXCIpKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIGZvb2JhcjogZnVuY3Rpb24oKSB7IH1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIiwgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgICAgICBcInRleHRcIiwgXCJzdG9yYWdlLnR5cGVcIiwgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoXCIgKyBpZGVudGlmaWVyUmUgKyBcIikoXFxcXHMqKSg6KShcXFxccyopKGZ1bmN0aW9uKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyA6IGZ1bmN0aW9uKCkgeyB9ICh0aGlzIGlzIGZvciBpc3N1ZXMgd2l0aCAnZm9vJzogZnVuY3Rpb24oKSB7IH0pXG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwidGV4dFwiLCBcInRleHRcIiwgXCJzdG9yYWdlLnR5cGVcIiwgXCJ0ZXh0XCIsIFwicGFyZW4ubHBhcmVuXCJcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCIoOikoXFxcXHMqKShmdW5jdGlvbikoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImtleXdvcmRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKD86XCIgKyBrd0JlZm9yZVJlICsgXCIpXFxcXGJcIixcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcInN1cHBvcnQuZnVuY3Rpb25cIl0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvKFxcLikocyg/OmgoPzppZnR8b3coPzpNb2QoPzplbGVzc0RpYWxvZ3xhbERpYWxvZyl8SGVscCkpfGNyb2xsKD86WHxCeSg/OlBhZ2VzfExpbmVzKT98WXxUbyk/fHQoPzpvcHxyaWtlKXxpKD86bnx6ZVRvQ29udGVudHxkZWJhcnxnblRleHQpfG9ydHx1KD86cHxiKD86c3RyKD86aW5nKT8pPyl8cGxpKD86Y2V8dCl8ZSg/Om5kfHQoPzpSZSg/OnNpemFibGV8cXVlc3RIZWFkZXIpfE0oPzppKD86bnV0ZXN8bGxpc2Vjb25kcyl8b250aCl8U2Vjb25kc3xIbyg/OnRLZXlzfHVycyl8WWVhcnxDdXJzb3J8VGltZSg/Om91dCk/fEludGVydmFsfFpPcHRpb25zfERhdGV8VVRDKD86TSg/OmkoPzpudXRlc3xsbGlzZWNvbmRzKXxvbnRoKXxTZWNvbmRzfEhvdXJzfERhdGV8RnVsbFllYXIpfEZ1bGxZZWFyfEFjdGl2ZSl8YXJjaCl8cXJ0fGxpY2V8YXZlUHJlZmVyZW5jZXN8bWFsbCl8aCg/Om9tZXxhbmRsZUV2ZW50KXxuYXZpZ2F0ZXxjKD86aGFyKD86Q29kZUF0fEF0KXxvKD86c3xuKD86Y2F0fHRleHR1YWx8ZmlybSl8bXBpbGUpfGVpbHxsZWFyKD86VGltZW91dHxJbnRlcnZhbCk/fGEoPzpwdHVyZUV2ZW50c3xsbCl8cmVhdGUoPzpTdHlsZVNoZWV0fFBvcHVwfEV2ZW50T2JqZWN0KSl8dCg/Om8oPzpHTVRTdHJpbmd8Uyg/OnRyaW5nfG91cmNlKXxVKD86VENTdHJpbmd8cHBlckNhc2UpfExvKD86Y2FsZVN0cmluZ3x3ZXJDYXNlKSl8ZXN0fGEoPzpufGludCg/OkVuYWJsZWQpPykpfGkoPzpzKD86TmFOfEZpbml0ZSl8bmRleE9mfHRhbGljcyl8ZCg/OmlzYWJsZUV4dGVybmFsQ2FwdHVyZXx1bXB8ZXRhY2hFdmVudCl8dSg/Om4oPzpzaGlmdHx0YWludHxlc2NhcGV8d2F0Y2gpfHBkYXRlQ29tbWFuZHMpfGooPzpvaW58YXZhRW5hYmxlZCl8cCg/Om8oPzpwfHcpfHVzaHxsdWdpbnMucmVmcmVzaHxhKD86ZGRpbmdzfHJzZSg/OkludHxGbG9hdCk/KXxyKD86aW50fG9tcHR8ZWZlcmVuY2UpKXxlKD86c2NhcGV8bmFibGVFeHRlcm5hbENhcHR1cmV8dmFsfGxlbWVudEZyb21Qb2ludHx4KD86cHxlYyg/OlNjcmlwdHxDb21tYW5kKT8pKXx2YWx1ZU9mfFVUQ3xxdWVyeUNvbW1hbmQoPzpTdGF0ZXxJbmRldGVybXxFbmFibGVkfFZhbHVlKXxmKD86aSg/Om5kfGxlKD86TW9kaWZpZWREYXRlfFNpemV8Q3JlYXRlZERhdGV8VXBkYXRlZERhdGUpfHhlZCl8byg/Om50KD86c2l6ZXxjb2xvcil8cndhcmQpfGxvb3J8cm9tQ2hhckNvZGUpfHdhdGNofGwoPzppbmt8byg/OmFkfGcpfGFzdEluZGV4T2YpfGEoPzpzaW58bmNob3J8Y29zfHQoPzp0YWNoRXZlbnR8b2J8YW4oPzoyKT8pfHBwbHl8bGVydHxiKD86c3xvcnQpKXxyKD86b3UoPzpuZHx0ZUV2ZW50cyl8ZSg/OnNpemUoPzpCeXxUbyl8Y2FsY3x0dXJuVmFsdWV8cGxhY2V8dmVyc2V8bCg/Om9hZHxlYXNlKD86Q2FwdHVyZXxFdmVudHMpKSl8YW5kb20pfGcoPzpvfGV0KD86UmVzcG9uc2VIZWFkZXJ8TSg/OmkoPzpudXRlc3xsbGlzZWNvbmRzKXxvbnRoKXxTZSg/OmNvbmRzfGxlY3Rpb24pfEhvdXJzfFllYXJ8VGltZSg/OnpvbmVPZmZzZXQpP3xEYSg/Onl8dGUpfFVUQyg/Ok0oPzppKD86bnV0ZXN8bGxpc2Vjb25kcyl8b250aCl8U2Vjb25kc3xIb3Vyc3xEYSg/Onl8dGUpfEZ1bGxZZWFyKXxGdWxsWWVhcnxBKD86dHRlbnRpb258bGxSZXNwb25zZUhlYWRlcnMpKSl8bSg/OmlufG92ZSg/OkIoPzp5fGVsb3cpfFRvKD86QWJzb2x1dGUpP3xBYm92ZSl8ZXJnZUF0dHJpYnV0ZXN8YSg/OnRjaHxyZ2luc3x4KSl8Yig/OnRvYXxpZ3xvKD86bGR8cmRlcldpZHRocyl8bGlua3xhY2spKVxcYig/PVxcKCkvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcInN1cHBvcnQuZnVuY3Rpb24uZG9tXCJdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLyhcXC4pKHMoPzp1Yig/OnN0cmluZ0RhdGF8bWl0KXxwbGl0VGV4dHxlKD86dCg/Ok5hbWVkSXRlbXxBdHRyaWJ1dGUoPzpOb2RlKT8pfGxlY3QpKXxoYXMoPzpDaGlsZE5vZGVzfEZlYXR1cmUpfG5hbWVkSXRlbXxjKD86bCg/Omlja3xvKD86c2V8bmVOb2RlKSl8cmVhdGUoPzpDKD86b21tZW50fERBVEFTZWN0aW9ufGFwdGlvbil8VCg/OkhlYWR8ZXh0Tm9kZXxGb290KXxEb2N1bWVudEZyYWdtZW50fFByb2Nlc3NpbmdJbnN0cnVjdGlvbnxFKD86bnRpdHlSZWZlcmVuY2V8bGVtZW50KXxBdHRyaWJ1dGUpKXx0YWJJbmRleHxpKD86bnNlcnQoPzpSb3d8QmVmb3JlfENlbGx8RGF0YSl8dGVtKXxvcGVufGRlbGV0ZSg/OlJvd3xDKD86ZWxsfGFwdGlvbil8VCg/OkhlYWR8Rm9vdCl8RGF0YSl8Zm9jdXN8d3JpdGUoPzpsbik/fGEoPzpkZHxwcGVuZCg/OkNoaWxkfERhdGEpKXxyZSg/OnNldHxwbGFjZSg/OkNoaWxkfERhdGEpfG1vdmUoPzpOYW1lZEl0ZW18Q2hpbGR8QXR0cmlidXRlKD86Tm9kZSk/KT8pfGdldCg/Ok5hbWVkSXRlbXxFbGVtZW50KD86c0J5KD86TmFtZXxUYWdOYW1lKXxCeUlkKXxBdHRyaWJ1dGUoPzpOb2RlKT8pfGJsdXIpXFxiKD89XFwoKS9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsIFwic3VwcG9ydC5jb25zdGFudFwiXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IC8oXFwuKShzKD86eXN0ZW1MYW5ndWFnZXxjcig/OmlwdHN8b2xsYmFyc3xlZW4oPzpYfFl8VG9wfExlZnQpKXx0KD86eWxlKD86U2hlZXRzKT98YXR1cyg/OlRleHR8YmFyKT8pfGlibGluZyg/OkJlbG93fEFib3ZlKXxvdXJjZXx1ZmZpeGVzfGUoPzpjdXJpdHkoPzpQb2xpY3kpP3xsKD86ZWN0aW9ufGYpKSl8aCg/OmlzdG9yeXxvc3QoPzpuYW1lKT98YXMoPzpofEZvY3VzKSl8eXxYKD86TUxEb2N1bWVudHxTTERvY3VtZW50KXxuKD86ZXh0fGFtZSg/OnNwYWNlKD86c3xVUkkpfFByb3ApKXxNKD86SU5fVkFMVUV8QVhfVkFMVUUpfGMoPzpoYXJhY3RlclNldHxvKD86big/OnN0cnVjdG9yfHRyb2xsZXJzKXxva2llRW5hYmxlZHxsb3JEZXB0aHxtcCg/Om9uZW50c3xsZXRlKSl8dXJyZW50fHB1Q2xhc3N8bCg/OmkoPzpwKD86Ym9hcmREYXRhKT98ZW50SW5mb3JtYXRpb24pfG9zZWR8YXNzZXMpfGFsbGUoPzplfHIpfHJ5cHRvKXx0KD86byg/Om9sYmFyfHApfGV4dCg/OlRyYW5zZm9ybXxJbmRlbnR8RGVjb3JhdGlvbnxBbGlnbil8YWdzKXxTUVJUKD86MV8yfDIpfGkoPzpuKD86bmVyKD86SGVpZ2h0fFdpZHRoKXxwdXQpfGRzfGdub3JlQ2FzZSl8ekluZGV4fG8oPzpzY3B1fG4oPzpyZWFkeXN0YXRlY2hhbmdlfExpbmUpfHV0ZXIoPzpIZWlnaHR8V2lkdGgpfHAoPzpzUHJvZmlsZXxlbmVyKXxmZnNjcmVlbkJ1ZmZlcmluZyl8TkVHQVRJVkVfSU5GSU5JVFl8ZCg/OmkoPzpzcGxheXxhbG9nKD86SGVpZ2h0fFRvcHxXaWR0aHxMZWZ0fEFyZ3VtZW50cyl8cmVjdG9yaWVzKXxlKD86c2NyaXB0aW9ufGZhdWx0KD86U3RhdHVzfENoKD86ZWNrZWR8YXJzZXQpfFZpZXcpKSl8dSg/OnNlcig/OlByb2ZpbGV8TGFuZ3VhZ2V8QWdlbnQpfG4oPzppcXVlSUR8ZGVmaW5lZCl8cGRhdGVJbnRlcnZhbCl8X2NvbnRlbnR8cCg/Oml4ZWxEZXB0aHxvcnR8ZXJzb25hbGJhcnxrY3MxMXxsKD86dWdpbnN8YXRmb3JtKXxhKD86dGhuYW1lfGRkaW5nKD86UmlnaHR8Qm90dG9tfFRvcHxMZWZ0KXxyZW50KD86V2luZG93fExheWVyKT98Z2UoPzpYKD86T2Zmc2V0KT98WSg/Ok9mZnNldCk/KSl8cig/Om8oPzp0byg/OmNvbHx0eXBlKXxkdWN0KD86U3ViKT98bXB0ZXIpfGUoPzp2aW91c3xmaXgpKSl8ZSg/Om4oPzpjb2Rpbmd8YWJsZWRQbHVnaW4pfHgoPzp0ZXJuYWx8cGFuZG8pfG1iZWRzKXx2KD86aXNpYmlsaXR5fGVuZG9yKD86U3ViKT98TGlua2NvbG9yKXxVUkxVbmVuY29kZWR8UCg/Okl8T1NJVElWRV9JTkZJTklUWSl8Zig/OmlsZW5hbWV8byg/Om50KD86U2l6ZXxGYW1pbHl8V2VpZ2h0KXxybU5hbWUpfHJhbWUoPzpzfEVsZW1lbnQpfGdDb2xvcil8RXx3aGl0ZVNwYWNlfGwoPzppKD86c3RTdHlsZVR5cGV8big/OmVIZWlnaHR8a0NvbG9yKSl8byg/OmNhKD86dGlvbig/OmJhcik/fGxOYW1lKXx3c3JjKXxlKD86bmd0aHxmdCg/OkNvbnRleHQpPyl8YSg/OnN0KD86TSg/Om9kaWZpZWR8YXRjaCl8SW5kZXh8UGFyZW4pfHllcig/OnN8WCl8bmd1YWdlKSl8YSg/OnBwKD86TWlub3JWZXJzaW9ufE5hbWV8Q28oPzpkZU5hbWV8cmUpfFZlcnNpb24pfHZhaWwoPzpIZWlnaHR8VG9wfFdpZHRofExlZnQpfGxsfHIoPzppdHl8Z3VtZW50cyl8TGlua2NvbG9yfGJvdmUpfHIoPzppZ2h0KD86Q29udGV4dCk/fGUoPzpzcG9uc2UoPzpYTUx8VGV4dCl8YWR5U3RhdGUpKXxnbG9iYWx8eHxtKD86aW1lVHlwZXN8dWx0aWxpbmV8ZW51YmFyfGFyZ2luKD86UmlnaHR8Qm90dG9tfFRvcHxMZWZ0KSl8TCg/Ok4oPzoxMHwyKXxPRyg/OjEwRXwyRSkpfGIoPzpvKD86dHRvbXxyZGVyKD86V2lkdGh8UmlnaHRXaWR0aHxCb3R0b21XaWR0aHxTdHlsZXxDb2xvcnxUb3BXaWR0aHxMZWZ0V2lkdGgpKXx1ZmZlckRlcHRofGVsb3d8YWNrZ3JvdW5kKD86Q29sb3J8SW1hZ2UpKSlcXGIvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXCJzdXBwb3J0LmNvbnN0YW50XCJdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL3RoYXRcXGIvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXCJzdG9yYWdlLnR5cGVcIiwgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcInN1cHBvcnQuZnVuY3Rpb24uZmlyZWJ1Z1wiXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IC8oY29uc29sZSkoXFwuKSh3YXJufGluZm98bG9nfGVycm9yfHRpbWV8dHJhY2V8dGltZUVuZHxhc3NlcnQpXFxiL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDoga2V5d29yZE1hcHBlcixcbiAgICAgICAgICAgICAgICByZWdleCA6IGlkZW50aWZpZXJSZVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJrZXl3b3JkLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvLS18XFwrXFwrfD09PXw9PXw9fCE9fCE9PXw8PXw+PXw8PD18Pj49fD4+Pj18PD58PHw+fCF8JiZ8XFx8XFx8fFxcP1xcOnxbISQlJiorXFwtflxcL15dPT8vLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvWz86LDsuXS8sXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwicGFyZW4ubHBhcmVuXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvW1xcWyh7XS8sXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwicGFyZW4ucnBhcmVuXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvW1xcXSl9XS9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJjb21tZW50XCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9eIyEuKiQvXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIC8vIHJlZ3VsYXIgZXhwcmVzc2lvbnMgYXJlIG9ubHkgYWxsb3dlZCBhZnRlciBjZXJ0YWluIHRva2Vucy4gVGhpc1xuICAgICAgICAvLyBtYWtlcyBzdXJlIHdlIGRvbid0IG1peCB1cCByZWdleHBzIHdpdGggdGhlIGRpdmlzb24gb3BlcmF0b3JcbiAgICAgICAgXCJzdGFydFwiOiBbXG4gICAgICAgICAgICBEb2NDb21tZW50SGlnaGxpZ2h0UnVsZXMuZ2V0U3RhcnRSdWxlKFwiZG9jLXN0YXJ0XCIpLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb21tZW50XCIsIC8vIG11bHRpIGxpbmUgY29tbWVudFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxcL1xcXFwqXCIsXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwiY29tbWVudF9yZWdleF9hbGxvd2VkXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29tbWVudFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxcL1xcXFwvXCIsXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwibGluZV9jb21tZW50X3JlZ2V4X2FsbG93ZWRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInN0cmluZy5yZWdleHBcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcL1wiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwicmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFxzK3xeJFwiLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcInN0YXJ0XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBpbW1lZGlhdGVseSByZXR1cm4gdG8gdGhlIHN0YXJ0IG1vZGUgd2l0aG91dCBtYXRjaGluZ1xuICAgICAgICAgICAgICAgIC8vIGFueXRoaW5nXG4gICAgICAgICAgICAgICAgdG9rZW46IFwiZW1wdHlcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgXCJyZWdleFwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgLy8gZXNjYXBlc1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInJlZ2V4cC5rZXl3b3JkLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXFxcXFwoPzp1W1xcXFxkYS1mQS1GXXs0fXx4W1xcXFxkYS1mQS1GXXsyfXwuKVwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gZmxhZ1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInN0cmluZy5yZWdleHBcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCIvW3N4bmdpbXldKlwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIGludmFsaWQgb3BlcmF0b3JzXG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImludmFsaWRcIixcbiAgICAgICAgICAgICAgICByZWdleDogL1xce1xcZCtcXGIsP1xcZCpcXH1bKypdfFsrKiReP11bKypdfFskXl1bP118XFw/ezMsfS9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBvcGVyYXRvcnNcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXChcXD9bOj0hXXxcXCl8XFx7XFxkK1xcYiw/XFxkKlxcfXxbKypdXFw/fFsoKSReKyo/Ll0vXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lmxhbmd1YWdlLmRlbGltaXRlclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFx8L1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFxbXFxePy8sXG4gICAgICAgICAgICAgICAgbmV4dDogXCJyZWdleF9jaGFyYWN0ZXJfY2xhc3NcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImVtcHR5XCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiJFwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGRlZmF1bHRUb2tlbjogXCJzdHJpbmcucmVnZXhwXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgXCJyZWdleF9jaGFyYWN0ZXJfY2xhc3NcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInJlZ2V4cC5jaGFyY2xhc3Mua2V5d29yZC5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFxcXFxcKD86dVtcXFxcZGEtZkEtRl17NH18eFtcXFxcZGEtZkEtRl17Mn18LilcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIl1cIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcInJlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCItXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJlbXB0eVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIiRcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0VG9rZW46IFwic3RyaW5nLnJlZ2V4cC5jaGFyYWNodGVyY2xhc3NcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwidmFyaWFibGUucGFyYW1ldGVyXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IGlkZW50aWZpZXJSZVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiWywgXStcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInB1bmN0dWF0aW9uLm9wZXJhdG9yXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiJFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiZW1wdHlcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgXCJjb21tZW50X3JlZ2V4X2FsbG93ZWRcIiA6IFtcbiAgICAgICAgICAgIHt0b2tlbiA6IFwiY29tbWVudFwiLCByZWdleCA6IFwiXFxcXCpcXFxcL1wiLCBuZXh0IDogXCJzdGFydFwifSxcbiAgICAgICAgICAgIHtkZWZhdWx0VG9rZW4gOiBcImNvbW1lbnRcIn1cbiAgICAgICAgXSxcbiAgICAgICAgXCJjb21tZW50XCIgOiBbXG4gICAgICAgICAgICB7dG9rZW4gOiBcImNvbW1lbnRcIiwgcmVnZXggOiBcIlxcXFwqXFxcXC9cIiwgbmV4dCA6IFwibm9fcmVnZXhcIn0sXG4gICAgICAgICAgICB7ZGVmYXVsdFRva2VuIDogXCJjb21tZW50XCJ9XG4gICAgICAgIF0sXG4gICAgICAgIFwibGluZV9jb21tZW50X3JlZ2V4X2FsbG93ZWRcIiA6IFtcbiAgICAgICAgICAgIHt0b2tlbiA6IFwiY29tbWVudFwiLCByZWdleCA6IFwiJHxeXCIsIG5leHQgOiBcInN0YXJ0XCJ9LFxuICAgICAgICAgICAge2RlZmF1bHRUb2tlbiA6IFwiY29tbWVudFwifVxuICAgICAgICBdLFxuICAgICAgICBcImxpbmVfY29tbWVudFwiIDogW1xuICAgICAgICAgICAge3Rva2VuIDogXCJjb21tZW50XCIsIHJlZ2V4IDogXCIkfF5cIiwgbmV4dCA6IFwibm9fcmVnZXhcIn0sXG4gICAgICAgICAgICB7ZGVmYXVsdFRva2VuIDogXCJjb21tZW50XCJ9XG4gICAgICAgIF0sXG4gICAgICAgIFwicXFzdHJpbmdcIiA6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBlc2NhcGVkUmVcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFxcXFxcJFwiLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJxcXN0cmluZ1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogJ1wifCQnLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgZGVmYXVsdFRva2VuOiBcInN0cmluZ1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIFwicXN0cmluZ1wiIDogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IGVzY2FwZWRSZVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXFxcXFwkXCIsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInFzdHJpbmdcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiJ3wkXCIsXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0VG9rZW46IFwic3RyaW5nXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH07XG4gICAgXG4gICAgXG4gICAgaWYgKCFvcHRpb25zIHx8ICFvcHRpb25zLm5vRVM2KSB7XG4gICAgICAgIHRoaXMuJHJ1bGVzLm5vX3JlZ2V4LnVuc2hpZnQoe1xuICAgICAgICAgICAgcmVnZXg6IFwiW3t9XVwiLCBvbk1hdGNoOiBmdW5jdGlvbih2YWwsIHN0YXRlLCBzdGFjaykge1xuICAgICAgICAgICAgICAgIHRoaXMubmV4dCA9IHZhbCA9PSBcIntcIiA/IHRoaXMubmV4dFN0YXRlIDogXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAodmFsID09IFwie1wiICYmIHN0YWNrLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay51bnNoaWZ0KFwic3RhcnRcIiwgc3RhdGUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJwYXJlblwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodmFsID09IFwifVwiICYmIHN0YWNrLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzdGFjay5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm5leHQgPSBzdGFjay5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5uZXh0LmluZGV4T2YoXCJzdHJpbmdcIikgIT0gLTEpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJwYXJlbi5xdWFzaS5lbmRcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbCA9PSBcIntcIiA/IFwicGFyZW4ubHBhcmVuXCIgOiBcInBhcmVuLnJwYXJlblwiO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG5leHRTdGF0ZTogXCJzdGFydFwiXG4gICAgICAgIH0sIHtcbiAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmcucXVhc2kuc3RhcnRcIixcbiAgICAgICAgICAgIHJlZ2V4IDogL2AvLFxuICAgICAgICAgICAgcHVzaCAgOiBbe1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IGVzY2FwZWRSZVxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJwYXJlbi5xdWFzaS5zdGFydFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1xcJHsvLFxuICAgICAgICAgICAgICAgIHB1c2ggIDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZy5xdWFzaS5lbmRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC9gLyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwicG9wXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0VG9rZW46IFwic3RyaW5nLnF1YXNpXCJcbiAgICAgICAgICAgIH1dXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICB0aGlzLmVtYmVkUnVsZXMoRG9jQ29tbWVudEhpZ2hsaWdodFJ1bGVzLCBcImRvYy1cIixcbiAgICAgICAgWyBEb2NDb21tZW50SGlnaGxpZ2h0UnVsZXMuZ2V0RW5kUnVsZShcIm5vX3JlZ2V4XCIpIF0pO1xuICAgIFxuICAgIHRoaXMubm9ybWFsaXplUnVsZXMoKTtcbiAgfVxufVxuIl19