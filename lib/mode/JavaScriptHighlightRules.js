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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSmF2YVNjcmlwdEhpZ2hsaWdodFJ1bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL21vZGUvSmF2YVNjcmlwdEhpZ2hsaWdodFJ1bGVzLnRzIl0sIm5hbWVzIjpbIkphdmFTY3JpcHRIaWdobGlnaHRSdWxlcyIsIkphdmFTY3JpcHRIaWdobGlnaHRSdWxlcy5jb25zdHJ1Y3RvciJdLCJtYXBwaW5ncyI6Ik9BOEJPLHdCQUF3QixNQUFNLDRCQUE0QjtPQUMxRCxrQkFBa0IsTUFBTSxzQkFBc0I7QUFFckQsc0RBQXNELGtCQUFrQjtJQUN0RUEsWUFBWUEsT0FBT0E7UUFDakJDLE9BQU9BLENBQUFBO1FBRVBBLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0E7WUFDekNBLG1CQUFtQkEsRUFDZkEseUVBQXlFQTtnQkFDekVBLDhCQUE4QkE7Z0JBQzlCQSx3RUFBd0VBO2dCQUN4RUEsdURBQXVEQTtnQkFDdkRBLHdFQUF3RUE7Z0JBQ3hFQSxpQ0FBaUNBO2dCQUNqQ0EsMEVBQTBFQTtnQkFDMUVBLDRCQUE0QkE7Z0JBQzVCQSxZQUFZQTtnQkFDWkEsMENBQTBDQTtZQUM5Q0EsU0FBU0EsRUFDTEEsNkJBQTZCQTtnQkFDN0JBLHdFQUF3RUE7Z0JBQ3hFQSxrRkFBa0ZBO2dCQUVsRkEsc0RBQXNEQTtnQkFDdERBLDhGQUE4RkE7WUFDbEdBLGNBQWNBLEVBQ1ZBLHdCQUF3QkE7WUFDNUJBLG1CQUFtQkEsRUFDZkEsNkJBQTZCQTtZQUNqQ0Esa0JBQWtCQSxFQUNkQSxPQUFPQTtZQUNYQSwyQkFBMkJBLEVBQUVBLFlBQVlBO1NBQzVDQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUdqQkEsSUFBSUEsVUFBVUEsR0FBR0EsdUVBQXVFQSxDQUFDQTtRQUd6RkEsSUFBSUEsWUFBWUEsR0FBR0EsMkRBQTJEQSxDQUFDQTtRQUUvRUEsSUFBSUEsU0FBU0EsR0FBR0EseUJBQXlCQTtZQUNyQ0Esa0JBQWtCQTtZQUNs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QTtnQkFDQ0EsS0FBS0EsRUFBR0Esb0JBQW9CQTtnQkFDNUJBLEtBQUtBLEVBQUdBLEdBQUdBO2dCQUNYQSxJQUFJQSxFQUFJQSxDQUFDQTt3QkFDTEEsS0FBS0EsRUFBR0EsMEJBQTBCQTt3QkFDbENBLEtBQUtBLEVBQUdBLFNBQVNBO3FCQUNwQkEsRUFBRUE7d0JBQ0NBLEtBQUtBLEVBQUdBLG1CQUFtQkE7d0JBQzNCQSxLQUFLQSxFQUFHQSxLQUFLQTt3QkFDYkEsSUFBSUEsRUFBSUEsT0FBT0E7cUJBQ2xCQSxFQUFFQTt3QkFDQ0EsS0FBS0EsRUFBR0Esa0JBQWtCQTt3QkFDMUJBLEtBQUtBLEVBQUdBLEdBQUdBO3dCQUNYQSxJQUFJQSxFQUFJQSxLQUFLQTtxQkFDaEJBLEVBQUVBO3dCQUNDQSxZQUFZQSxFQUFFQSxjQUFjQTtxQkFDL0JBLENBQUNBO2FBQ0xBLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLHdCQUF3QkEsRUFBRUEsTUFBTUEsRUFDNUNBLENBQUVBLHdCQUF3QkEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBRUEsQ0FBQ0EsQ0FBQ0E7UUFFekRBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQ3hCQSxDQUFDQTtBQUNIRCxDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCBEb2NDb21tZW50SGlnaGxpZ2h0UnVsZXMgZnJvbSBcIi4vRG9jQ29tbWVudEhpZ2hsaWdodFJ1bGVzXCI7XG5pbXBvcnQgVGV4dEhpZ2hsaWdodFJ1bGVzIGZyb20gXCIuL1RleHRIaWdobGlnaHRSdWxlc1wiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBKYXZhU2NyaXB0SGlnaGxpZ2h0UnVsZXMgZXh0ZW5kcyBUZXh0SGlnaGxpZ2h0UnVsZXMge1xuICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG4gICAgc3VwZXIoKVxuICAgIC8vIHNlZTogaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4vSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHNcbiAgICB2YXIga2V5d29yZE1hcHBlciA9IHRoaXMuY3JlYXRlS2V5d29yZE1hcHBlcih7XG4gICAgICAgIFwidmFyaWFibGUubGFuZ3VhZ2VcIjpcbiAgICAgICAgICAgIFwiQXJyYXl8Qm9vbGVhbnxEYXRlfEZ1bmN0aW9ufEl0ZXJhdG9yfE51bWJlcnxPYmplY3R8UmVnRXhwfFN0cmluZ3xQcm94eXxcIiAgKyAvLyBDb25zdHJ1Y3RvcnNcbiAgICAgICAgICAgIFwiTmFtZXNwYWNlfFFOYW1lfFhNTHxYTUxMaXN0fFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyAvLyBFNFhcbiAgICAgICAgICAgIFwiQXJyYXlCdWZmZXJ8RmxvYXQzMkFycmF5fEZsb2F0NjRBcnJheXxJbnQxNkFycmF5fEludDMyQXJyYXl8SW50OEFycmF5fFwiICAgK1xuICAgICAgICAgICAgXCJVaW50MTZBcnJheXxVaW50MzJBcnJheXxVaW50OEFycmF5fFVpbnQ4Q2xhbXBlZEFycmF5fFwiICAgICAgICAgICAgICAgICAgICArXG4gICAgICAgICAgICBcIkVycm9yfEV2YWxFcnJvcnxJbnRlcm5hbEVycm9yfFJhbmdlRXJyb3J8UmVmZXJlbmNlRXJyb3J8U3RvcEl0ZXJhdGlvbnxcIiAgICsgLy8gRXJyb3JzXG4gICAgICAgICAgICBcIlN5bnRheEVycm9yfFR5cGVFcnJvcnxVUklFcnJvcnxcIiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICtcbiAgICAgICAgICAgIFwiZGVjb2RlVVJJfGRlY29kZVVSSUNvbXBvbmVudHxlbmNvZGVVUkl8ZW5jb2RlVVJJQ29tcG9uZW50fGV2YWx8aXNGaW5pdGV8XCIgKyAvLyBOb24tY29uc3RydWN0b3IgZnVuY3Rpb25zXG4gICAgICAgICAgICBcImlzTmFOfHBhcnNlRmxvYXR8cGFyc2VJbnR8XCIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICtcbiAgICAgICAgICAgIFwiSlNPTnxNYXRofFwiICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKyAvLyBPdGhlclxuICAgICAgICAgICAgXCJ0aGlzfGFyZ3VtZW50c3xwcm90b3R5cGV8d2luZG93fGRvY3VtZW50XCIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAsIC8vIFBzZXVkb1xuICAgICAgICBcImtleXdvcmRcIjpcbiAgICAgICAgICAgIFwiY29uc3R8eWllbGR8aW1wb3J0fGdldHxzZXR8XCIgK1xuICAgICAgICAgICAgXCJicmVha3xjYXNlfGNhdGNofGNvbnRpbnVlfGRlZmF1bHR8ZGVsZXRlfGRvfGVsc2V8ZmluYWxseXxmb3J8ZnVuY3Rpb258XCIgK1xuICAgICAgICAgICAgXCJpZnxpbnxpbnN0YW5jZW9mfG5ld3xyZXR1cm58c3dpdGNofHRocm93fHRyeXx0eXBlb2Z8bGV0fHZhcnx3aGlsZXx3aXRofGRlYnVnZ2VyfFwiICtcbiAgICAgICAgICAgIC8vIGludmFsaWQgb3IgcmVzZXJ2ZWRcbiAgICAgICAgICAgIFwiX19wYXJlbnRfX3xfX2NvdW50X198ZXNjYXBlfHVuZXNjYXBlfHdpdGh8X19wcm90b19ffFwiICtcbiAgICAgICAgICAgIFwiY2xhc3N8ZW51bXxleHRlbmRzfHN1cGVyfGV4cG9ydHxpbXBsZW1lbnRzfHByaXZhdGV8cHVibGljfGludGVyZmFjZXxwYWNrYWdlfHByb3RlY3RlZHxzdGF0aWNcIixcbiAgICAgICAgXCJzdG9yYWdlLnR5cGVcIjpcbiAgICAgICAgICAgIFwiY29uc3R8bGV0fHZhcnxmdW5jdGlvblwiLFxuICAgICAgICBcImNvbnN0YW50Lmxhbmd1YWdlXCI6XG4gICAgICAgICAgICBcIm51bGx8SW5maW5pdHl8TmFOfHVuZGVmaW5lZFwiLFxuICAgICAgICBcInN1cHBvcnQuZnVuY3Rpb25cIjpcbiAgICAgICAgICAgIFwiYWxlcnRcIixcbiAgICAgICAgXCJjb25zdGFudC5sYW5ndWFnZS5ib29sZWFuXCI6IFwidHJ1ZXxmYWxzZVwiXG4gICAgfSwgXCJpZGVudGlmaWVyXCIpO1xuXG4gICAgLy8ga2V5d29yZHMgd2hpY2ggY2FuIGJlIGZvbGxvd2VkIGJ5IHJlZ3VsYXIgZXhwcmVzc2lvbnNcbiAgICB2YXIga3dCZWZvcmVSZSA9IFwiY2FzZXxkb3xlbHNlfGZpbmFsbHl8aW58aW5zdGFuY2VvZnxyZXR1cm58dGhyb3d8dHJ5fHR5cGVvZnx5aWVsZHx2b2lkXCI7XG5cbiAgICAvLyBUT0RPOiBVbmljb2RlIGVzY2FwZSBzZXF1ZW5jZXNcbiAgICB2YXIgaWRlbnRpZmllclJlID0gXCJbYS16QS1aXFxcXCRfXFx1MDBhMS1cXHVmZmZmXVthLXpBLVpcXFxcZFxcXFwkX1xcdTAwYTEtXFx1ZmZmZl0qXFxcXGJcIjtcblxuICAgIHZhciBlc2NhcGVkUmUgPSBcIlxcXFxcXFxcKD86eFswLTlhLWZBLUZdezJ9fFwiICsgLy8gaGV4XG4gICAgICAgIFwidVswLTlhLWZBLUZdezR9fFwiICsgLy8gdW5pY29kZVxuICAgICAgICBcIlswLTJdWzAtN117MCwyfXxcIiArIC8vIG9jdFxuICAgICAgICBcIjNbMC02XVswLTddP3xcIiArIC8vIG9jdFxuICAgICAgICBcIjM3WzAtN10/fFwiICsgLy8gb2N0XG4gICAgICAgIFwiWzQtN11bMC03XT98XCIgKyAvL29jdFxuICAgICAgICBcIi4pXCI7XG5cbiAgICAvLyByZWdleHAgbXVzdCBub3QgaGF2ZSBjYXB0dXJpbmcgcGFyZW50aGVzZXMuIFVzZSAoPzopIGluc3RlYWQuXG4gICAgLy8gcmVnZXhwcyBhcmUgb3JkZXJlZCAtPiB0aGUgZmlyc3QgbWF0Y2ggaXMgdXNlZFxuXG4gICAgdGhpcy4kcnVsZXMgPSB7XG4gICAgICAgIFwibm9fcmVnZXhcIiA6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29tbWVudFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxcL1xcXFwvXCIsXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwibGluZV9jb21tZW50XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBEb2NDb21tZW50SGlnaGxpZ2h0UnVsZXMuZ2V0U3RhcnRSdWxlKFwiZG9jLXN0YXJ0XCIpLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb21tZW50XCIsIC8vIG11bHRpIGxpbmUgY29tbWVudFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1xcL1xcKi8sXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwiY29tbWVudFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCInKD89LilcIixcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwicXN0cmluZ1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogJ1wiKD89LiknLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJxcXN0cmluZ1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lm51bWVyaWNcIiwgLy8gaGV4XG4gICAgICAgICAgICAgICAgcmVnZXggOiAvMFt4WF1bMC05YS1mQS1GXStcXGIvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lm51bWVyaWNcIiwgLy8gZmxvYXRcbiAgICAgICAgICAgICAgICByZWdleCA6IC9bKy1dP1xcZCsoPzooPzpcXC5cXGQqKT8oPzpbZUVdWystXT9cXGQrKT8pP1xcYi9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBTb3VuZC5wcm90b3R5cGUucGxheSA9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwic3RvcmFnZS50eXBlXCIsIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJzdXBwb3J0LmZ1bmN0aW9uXCIsXG4gICAgICAgICAgICAgICAgICAgIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIixcImtleXdvcmQub3BlcmF0b3JcIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihcIiArIGlkZW50aWZpZXJSZSArIFwiKShcXFxcLikocHJvdG90eXBlKShcXFxcLikoXCIgKyBpZGVudGlmaWVyUmUgK1wiKShcXFxccyopKD0pXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIFNvdW5kLnBsYXkgPSBmdW5jdGlvbigpIHsgIH1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJzdG9yYWdlLnR5cGVcIiwgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICBcImtleXdvcmQub3BlcmF0b3JcIiwgXCJ0ZXh0XCIsIFwic3RvcmFnZS50eXBlXCIsIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKFwiICsgaWRlbnRpZmllclJlICsgXCIpKFxcXFwuKShcIiArIGlkZW50aWZpZXJSZSArXCIpKFxcXFxzKikoPSkoXFxcXHMqKShmdW5jdGlvbikoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gcGxheSA9IGZ1bmN0aW9uKCkgeyAgfVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLCBcImtleXdvcmQub3BlcmF0b3JcIiwgXCJ0ZXh0XCIsIFwic3RvcmFnZS50eXBlXCIsXG4gICAgICAgICAgICAgICAgICAgIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKFwiICsgaWRlbnRpZmllclJlICtcIikoXFxcXHMqKSg9KShcXFxccyopKGZ1bmN0aW9uKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBTb3VuZC5wbGF5ID0gZnVuY3Rpb24gcGxheSgpIHsgIH1cbiAgICAgICAgICAgICAgICB0b2tlbiA6IFtcbiAgICAgICAgICAgICAgICAgICAgXCJzdG9yYWdlLnR5cGVcIiwgXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICBcImtleXdvcmQub3BlcmF0b3JcIiwgXCJ0ZXh0XCIsXG4gICAgICAgICAgICAgICAgICAgIFwic3RvcmFnZS50eXBlXCIsIFwidGV4dFwiLCBcImVudGl0eS5uYW1lLmZ1bmN0aW9uXCIsIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKFwiICsgaWRlbnRpZmllclJlICsgXCIpKFxcXFwuKShcIiArIGlkZW50aWZpZXJSZSArXCIpKFxcXFxzKikoPSkoXFxcXHMqKShmdW5jdGlvbikoXFxcXHMrKShcXFxcdyspKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIGZ1bmN0aW9uIG15RnVuYyhhcmcpIHsgfVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcInN0b3JhZ2UudHlwZVwiLCBcInRleHRcIiwgXCJlbnRpdHkubmFtZS5mdW5jdGlvblwiLCBcInRleHRcIiwgXCJwYXJlbi5scGFyZW5cIlxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIihmdW5jdGlvbikoXFxcXHMrKShcIiArIGlkZW50aWZpZXJSZSArIFwiKShcXFxccyopKFxcXFwoKVwiLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwiZnVuY3Rpb25fYXJndW1lbnRzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBmb29iYXI6IGZ1bmN0aW9uKCkgeyB9XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXG4gICAgICAgICAgICAgICAgICAgIFwiZW50aXR5Lm5hbWUuZnVuY3Rpb25cIiwgXCJ0ZXh0XCIsIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICAgICAgXCJ0ZXh0XCIsIFwic3RvcmFnZS50eXBlXCIsIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKFwiICsgaWRlbnRpZmllclJlICsgXCIpKFxcXFxzKikoOikoXFxcXHMqKShmdW5jdGlvbikoXFxcXHMqKShcXFxcKClcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcImZ1bmN0aW9uX2FyZ3VtZW50c1wiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gOiBmdW5jdGlvbigpIHsgfSAodGhpcyBpcyBmb3IgaXNzdWVzIHdpdGggJ2Zvbyc6IGZ1bmN0aW9uKCkgeyB9KVxuICAgICAgICAgICAgICAgIHRva2VuIDogW1xuICAgICAgICAgICAgICAgICAgICBcInRleHRcIiwgXCJ0ZXh0XCIsIFwic3RvcmFnZS50eXBlXCIsIFwidGV4dFwiLCBcInBhcmVuLmxwYXJlblwiXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiKDopKFxcXFxzKikoZnVuY3Rpb24pKFxcXFxzKikoXFxcXCgpXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJmdW5jdGlvbl9hcmd1bWVudHNcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJrZXl3b3JkXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIig/OlwiICsga3dCZWZvcmVSZSArIFwiKVxcXFxiXCIsXG4gICAgICAgICAgICAgICAgbmV4dCA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogW1wicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJzdXBwb3J0LmZ1bmN0aW9uXCJdLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLyhcXC4pKHMoPzpoKD86aWZ0fG93KD86TW9kKD86ZWxlc3NEaWFsb2d8YWxEaWFsb2cpfEhlbHApKXxjcm9sbCg/Olh8QnkoPzpQYWdlc3xMaW5lcyk/fFl8VG8pP3x0KD86b3B8cmlrZSl8aSg/Om58emVUb0NvbnRlbnR8ZGViYXJ8Z25UZXh0KXxvcnR8dSg/OnB8Yig/OnN0cig/OmluZyk/KT8pfHBsaSg/OmNlfHQpfGUoPzpuZHx0KD86UmUoPzpzaXphYmxlfHF1ZXN0SGVhZGVyKXxNKD86aSg/Om51dGVzfGxsaXNlY29uZHMpfG9udGgpfFNlY29uZHN8SG8oPzp0S2V5c3x1cnMpfFllYXJ8Q3Vyc29yfFRpbWUoPzpvdXQpP3xJbnRlcnZhbHxaT3B0aW9uc3xEYXRlfFVUQyg/Ok0oPzppKD86bnV0ZXN8bGxpc2Vjb25kcyl8b250aCl8U2Vjb25kc3xIb3Vyc3xEYXRlfEZ1bGxZZWFyKXxGdWxsWWVhcnxBY3RpdmUpfGFyY2gpfHFydHxsaWNlfGF2ZVByZWZlcmVuY2VzfG1hbGwpfGgoPzpvbWV8YW5kbGVFdmVudCl8bmF2aWdhdGV8Yyg/Omhhcig/OkNvZGVBdHxBdCl8byg/OnN8big/OmNhdHx0ZXh0dWFsfGZpcm0pfG1waWxlKXxlaWx8bGVhcig/OlRpbWVvdXR8SW50ZXJ2YWwpP3xhKD86cHR1cmVFdmVudHN8bGwpfHJlYXRlKD86U3R5bGVTaGVldHxQb3B1cHxFdmVudE9iamVjdCkpfHQoPzpvKD86R01UU3RyaW5nfFMoPzp0cmluZ3xvdXJjZSl8VSg/OlRDU3RyaW5nfHBwZXJDYXNlKXxMbyg/OmNhbGVTdHJpbmd8d2VyQ2FzZSkpfGVzdHxhKD86bnxpbnQoPzpFbmFibGVkKT8pKXxpKD86cyg/Ok5hTnxGaW5pdGUpfG5kZXhPZnx0YWxpY3MpfGQoPzppc2FibGVFeHRlcm5hbENhcHR1cmV8dW1wfGV0YWNoRXZlbnQpfHUoPzpuKD86c2hpZnR8dGFpbnR8ZXNjYXBlfHdhdGNoKXxwZGF0ZUNvbW1hbmRzKXxqKD86b2lufGF2YUVuYWJsZWQpfHAoPzpvKD86cHx3KXx1c2h8bHVnaW5zLnJlZnJlc2h8YSg/OmRkaW5nc3xyc2UoPzpJbnR8RmxvYXQpPyl8cig/OmludHxvbXB0fGVmZXJlbmNlKSl8ZSg/OnNjYXBlfG5hYmxlRXh0ZXJuYWxDYXB0dXJlfHZhbHxsZW1lbnRGcm9tUG9pbnR8eCg/OnB8ZWMoPzpTY3JpcHR8Q29tbWFuZCk/KSl8dmFsdWVPZnxVVEN8cXVlcnlDb21tYW5kKD86U3RhdGV8SW5kZXRlcm18RW5hYmxlZHxWYWx1ZSl8Zig/OmkoPzpuZHxsZSg/Ok1vZGlmaWVkRGF0ZXxTaXplfENyZWF0ZWREYXRlfFVwZGF0ZWREYXRlKXx4ZWQpfG8oPzpudCg/OnNpemV8Y29sb3IpfHJ3YXJkKXxsb29yfHJvbUNoYXJDb2RlKXx3YXRjaHxsKD86aW5rfG8oPzphZHxnKXxhc3RJbmRleE9mKXxhKD86c2lufG5jaG9yfGNvc3x0KD86dGFjaEV2ZW50fG9ifGFuKD86Mik/KXxwcGx5fGxlcnR8Yig/OnN8b3J0KSl8cig/Om91KD86bmR8dGVFdmVudHMpfGUoPzpzaXplKD86Qnl8VG8pfGNhbGN8dHVyblZhbHVlfHBsYWNlfHZlcnNlfGwoPzpvYWR8ZWFzZSg/OkNhcHR1cmV8RXZlbnRzKSkpfGFuZG9tKXxnKD86b3xldCg/OlJlc3BvbnNlSGVhZGVyfE0oPzppKD86bnV0ZXN8bGxpc2Vjb25kcyl8b250aCl8U2UoPzpjb25kc3xsZWN0aW9uKXxIb3Vyc3xZZWFyfFRpbWUoPzp6b25lT2Zmc2V0KT98RGEoPzp5fHRlKXxVVEMoPzpNKD86aSg/Om51dGVzfGxsaXNlY29uZHMpfG9udGgpfFNlY29uZHN8SG91cnN8RGEoPzp5fHRlKXxGdWxsWWVhcil8RnVsbFllYXJ8QSg/OnR0ZW50aW9ufGxsUmVzcG9uc2VIZWFkZXJzKSkpfG0oPzppbnxvdmUoPzpCKD86eXxlbG93KXxUbyg/OkFic29sdXRlKT98QWJvdmUpfGVyZ2VBdHRyaWJ1dGVzfGEoPzp0Y2h8cmdpbnN8eCkpfGIoPzp0b2F8aWd8byg/OmxkfHJkZXJXaWR0aHMpfGxpbmt8YWNrKSlcXGIoPz1cXCgpL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogW1wicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJzdXBwb3J0LmZ1bmN0aW9uLmRvbVwiXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IC8oXFwuKShzKD86dWIoPzpzdHJpbmdEYXRhfG1pdCl8cGxpdFRleHR8ZSg/OnQoPzpOYW1lZEl0ZW18QXR0cmlidXRlKD86Tm9kZSk/KXxsZWN0KSl8aGFzKD86Q2hpbGROb2Rlc3xGZWF0dXJlKXxuYW1lZEl0ZW18Yyg/OmwoPzppY2t8byg/OnNlfG5lTm9kZSkpfHJlYXRlKD86Qyg/Om9tbWVudHxEQVRBU2VjdGlvbnxhcHRpb24pfFQoPzpIZWFkfGV4dE5vZGV8Rm9vdCl8RG9jdW1lbnRGcmFnbWVudHxQcm9jZXNzaW5nSW5zdHJ1Y3Rpb258RSg/Om50aXR5UmVmZXJlbmNlfGxlbWVudCl8QXR0cmlidXRlKSl8dGFiSW5kZXh8aSg/Om5zZXJ0KD86Um93fEJlZm9yZXxDZWxsfERhdGEpfHRlbSl8b3BlbnxkZWxldGUoPzpSb3d8Qyg/OmVsbHxhcHRpb24pfFQoPzpIZWFkfEZvb3QpfERhdGEpfGZvY3VzfHdyaXRlKD86bG4pP3xhKD86ZGR8cHBlbmQoPzpDaGlsZHxEYXRhKSl8cmUoPzpzZXR8cGxhY2UoPzpDaGlsZHxEYXRhKXxtb3ZlKD86TmFtZWRJdGVtfENoaWxkfEF0dHJpYnV0ZSg/Ok5vZGUpPyk/KXxnZXQoPzpOYW1lZEl0ZW18RWxlbWVudCg/OnNCeSg/Ok5hbWV8VGFnTmFtZSl8QnlJZCl8QXR0cmlidXRlKD86Tm9kZSk/KXxibHVyKVxcYig/PVxcKCkvXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBbXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLCBcInN1cHBvcnQuY29uc3RhbnRcIl0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvKFxcLikocyg/OnlzdGVtTGFuZ3VhZ2V8Y3IoPzppcHRzfG9sbGJhcnN8ZWVuKD86WHxZfFRvcHxMZWZ0KSl8dCg/OnlsZSg/OlNoZWV0cyk/fGF0dXMoPzpUZXh0fGJhcik/KXxpYmxpbmcoPzpCZWxvd3xBYm92ZSl8b3VyY2V8dWZmaXhlc3xlKD86Y3VyaXR5KD86UG9saWN5KT98bCg/OmVjdGlvbnxmKSkpfGgoPzppc3Rvcnl8b3N0KD86bmFtZSk/fGFzKD86aHxGb2N1cykpfHl8WCg/Ok1MRG9jdW1lbnR8U0xEb2N1bWVudCl8big/OmV4dHxhbWUoPzpzcGFjZSg/OnN8VVJJKXxQcm9wKSl8TSg/OklOX1ZBTFVFfEFYX1ZBTFVFKXxjKD86aGFyYWN0ZXJTZXR8byg/Om4oPzpzdHJ1Y3Rvcnx0cm9sbGVycyl8b2tpZUVuYWJsZWR8bG9yRGVwdGh8bXAoPzpvbmVudHN8bGV0ZSkpfHVycmVudHxwdUNsYXNzfGwoPzppKD86cCg/OmJvYXJkRGF0YSk/fGVudEluZm9ybWF0aW9uKXxvc2VkfGFzc2VzKXxhbGxlKD86ZXxyKXxyeXB0byl8dCg/Om8oPzpvbGJhcnxwKXxleHQoPzpUcmFuc2Zvcm18SW5kZW50fERlY29yYXRpb258QWxpZ24pfGFncyl8U1FSVCg/OjFfMnwyKXxpKD86big/Om5lcig/OkhlaWdodHxXaWR0aCl8cHV0KXxkc3xnbm9yZUNhc2UpfHpJbmRleHxvKD86c2NwdXxuKD86cmVhZHlzdGF0ZWNoYW5nZXxMaW5lKXx1dGVyKD86SGVpZ2h0fFdpZHRoKXxwKD86c1Byb2ZpbGV8ZW5lcil8ZmZzY3JlZW5CdWZmZXJpbmcpfE5FR0FUSVZFX0lORklOSVRZfGQoPzppKD86c3BsYXl8YWxvZyg/OkhlaWdodHxUb3B8V2lkdGh8TGVmdHxBcmd1bWVudHMpfHJlY3Rvcmllcyl8ZSg/OnNjcmlwdGlvbnxmYXVsdCg/OlN0YXR1c3xDaCg/OmVja2VkfGFyc2V0KXxWaWV3KSkpfHUoPzpzZXIoPzpQcm9maWxlfExhbmd1YWdlfEFnZW50KXxuKD86aXF1ZUlEfGRlZmluZWQpfHBkYXRlSW50ZXJ2YWwpfF9jb250ZW50fHAoPzppeGVsRGVwdGh8b3J0fGVyc29uYWxiYXJ8a2NzMTF8bCg/OnVnaW5zfGF0Zm9ybSl8YSg/OnRobmFtZXxkZGluZyg/OlJpZ2h0fEJvdHRvbXxUb3B8TGVmdCl8cmVudCg/OldpbmRvd3xMYXllcik/fGdlKD86WCg/Ok9mZnNldCk/fFkoPzpPZmZzZXQpPykpfHIoPzpvKD86dG8oPzpjb2x8dHlwZSl8ZHVjdCg/OlN1Yik/fG1wdGVyKXxlKD86dmlvdXN8Zml4KSkpfGUoPzpuKD86Y29kaW5nfGFibGVkUGx1Z2luKXx4KD86dGVybmFsfHBhbmRvKXxtYmVkcyl8dig/OmlzaWJpbGl0eXxlbmRvcig/OlN1Yik/fExpbmtjb2xvcil8VVJMVW5lbmNvZGVkfFAoPzpJfE9TSVRJVkVfSU5GSU5JVFkpfGYoPzppbGVuYW1lfG8oPzpudCg/OlNpemV8RmFtaWx5fFdlaWdodCl8cm1OYW1lKXxyYW1lKD86c3xFbGVtZW50KXxnQ29sb3IpfEV8d2hpdGVTcGFjZXxsKD86aSg/OnN0U3R5bGVUeXBlfG4oPzplSGVpZ2h0fGtDb2xvcikpfG8oPzpjYSg/OnRpb24oPzpiYXIpP3xsTmFtZSl8d3NyYyl8ZSg/Om5ndGh8ZnQoPzpDb250ZXh0KT8pfGEoPzpzdCg/Ok0oPzpvZGlmaWVkfGF0Y2gpfEluZGV4fFBhcmVuKXx5ZXIoPzpzfFgpfG5ndWFnZSkpfGEoPzpwcCg/Ok1pbm9yVmVyc2lvbnxOYW1lfENvKD86ZGVOYW1lfHJlKXxWZXJzaW9uKXx2YWlsKD86SGVpZ2h0fFRvcHxXaWR0aHxMZWZ0KXxsbHxyKD86aXR5fGd1bWVudHMpfExpbmtjb2xvcnxib3ZlKXxyKD86aWdodCg/OkNvbnRleHQpP3xlKD86c3BvbnNlKD86WE1MfFRleHQpfGFkeVN0YXRlKSl8Z2xvYmFsfHh8bSg/OmltZVR5cGVzfHVsdGlsaW5lfGVudWJhcnxhcmdpbig/OlJpZ2h0fEJvdHRvbXxUb3B8TGVmdCkpfEwoPzpOKD86MTB8Mil8T0coPzoxMEV8MkUpKXxiKD86byg/OnR0b218cmRlcig/OldpZHRofFJpZ2h0V2lkdGh8Qm90dG9tV2lkdGh8U3R5bGV8Q29sb3J8VG9wV2lkdGh8TGVmdFdpZHRoKSl8dWZmZXJEZXB0aHxlbG93fGFja2dyb3VuZCg/OkNvbG9yfEltYWdlKSkpXFxiL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogW1wic3VwcG9ydC5jb25zdGFudFwiXSxcbiAgICAgICAgICAgICAgICByZWdleCA6IC90aGF0XFxiL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogW1wic3RvcmFnZS50eXBlXCIsIFwicHVuY3R1YXRpb24ub3BlcmF0b3JcIiwgXCJzdXBwb3J0LmZ1bmN0aW9uLmZpcmVidWdcIl0sXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvKGNvbnNvbGUpKFxcLikod2FybnxpbmZvfGxvZ3xlcnJvcnx0aW1lfHRyYWNlfHRpbWVFbmR8YXNzZXJ0KVxcYi9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IGtleXdvcmRNYXBwZXIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBpZGVudGlmaWVyUmVcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwia2V5d29yZC5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogLy0tfFxcK1xcK3w9PT18PT18PXwhPXwhPT18PD18Pj18PDw9fD4+PXw+Pj49fDw+fDx8PnwhfCYmfFxcfFxcfHxcXD9cXDp8WyEkJSYqK1xcLX5cXC9eXT0/LyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1s/Oiw7Ll0vLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInBhcmVuLmxwYXJlblwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1tcXFsoe10vLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInBhcmVuLnJwYXJlblwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogL1tcXF0pfV0vXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiY29tbWVudFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXiMhLiokL1xuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICAvLyByZWd1bGFyIGV4cHJlc3Npb25zIGFyZSBvbmx5IGFsbG93ZWQgYWZ0ZXIgY2VydGFpbiB0b2tlbnMuIFRoaXNcbiAgICAgICAgLy8gbWFrZXMgc3VyZSB3ZSBkb24ndCBtaXggdXAgcmVnZXhwcyB3aXRoIHRoZSBkaXZpc29uIG9wZXJhdG9yXG4gICAgICAgIFwic3RhcnRcIjogW1xuICAgICAgICAgICAgRG9jQ29tbWVudEhpZ2hsaWdodFJ1bGVzLmdldFN0YXJ0UnVsZShcImRvYy1zdGFydFwiKSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29tbWVudFwiLCAvLyBtdWx0aSBsaW5lIGNvbW1lbnRcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXC9cXFxcKlwiLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcImNvbW1lbnRfcmVnZXhfYWxsb3dlZFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbW1lbnRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IFwiXFxcXC9cXFxcL1wiLFxuICAgICAgICAgICAgICAgIG5leHQgOiBcImxpbmVfY29tbWVudF9yZWdleF9hbGxvd2VkXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcucmVnZXhwXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXC9cIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcInJlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwidGV4dFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxccyt8XiRcIixcbiAgICAgICAgICAgICAgICBuZXh0IDogXCJzdGFydFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gaW1tZWRpYXRlbHkgcmV0dXJuIHRvIHRoZSBzdGFydCBtb2RlIHdpdGhvdXQgbWF0Y2hpbmdcbiAgICAgICAgICAgICAgICAvLyBhbnl0aGluZ1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImVtcHR5XCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIFwicmVnZXhcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIC8vIGVzY2FwZXNcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJyZWdleHAua2V5d29yZC5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlxcXFxcXFxcKD86dVtcXFxcZGEtZkEtRl17NH18eFtcXFxcZGEtZkEtRl17Mn18LilcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIC8vIGZsYWdcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcucmVnZXhwXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiL1tzeG5naW15XSpcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAvLyBpbnZhbGlkIG9wZXJhdG9yc1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJpbnZhbGlkXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IC9cXHtcXGQrXFxiLD9cXGQqXFx9WysqXXxbKyokXj9dWysqXXxbJF5dWz9dfFxcP3szLH0vXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgLy8gb3BlcmF0b3JzXG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiAvXFwoXFw/Wzo9IV18XFwpfFxce1xcZCtcXGIsP1xcZCpcXH18WysqXVxcP3xbKCkkXisqPy5dL1xuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJjb25zdGFudC5sYW5ndWFnZS5kZWxpbWl0ZXJcIixcbiAgICAgICAgICAgICAgICByZWdleDogL1xcfC9cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleDogL1xcW1xcXj8vLFxuICAgICAgICAgICAgICAgIG5leHQ6IFwicmVnZXhfY2hhcmFjdGVyX2NsYXNzXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJlbXB0eVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIiRcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBcIm5vX3JlZ2V4XCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICBkZWZhdWx0VG9rZW46IFwic3RyaW5nLnJlZ2V4cFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIFwicmVnZXhfY2hhcmFjdGVyX2NsYXNzXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJyZWdleHAuY2hhcmNsYXNzLmtleXdvcmQub3BlcmF0b3JcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcXFxcXCg/OnVbXFxcXGRhLWZBLUZdezR9fHhbXFxcXGRhLWZBLUZdezJ9fC4pXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGVcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCJdXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJyZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiLVwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiZW1wdHlcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCIkXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgZGVmYXVsdFRva2VuOiBcInN0cmluZy5yZWdleHAuY2hhcmFjaHRlcmNsYXNzXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXSxcbiAgICAgICAgXCJmdW5jdGlvbl9hcmd1bWVudHNcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInZhcmlhYmxlLnBhcmFtZXRlclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBpZGVudGlmaWVyUmVcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIlssIF0rXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJwdW5jdHVhdGlvbi5vcGVyYXRvclwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIiRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImVtcHR5XCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXCIsXG4gICAgICAgICAgICAgICAgbmV4dDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF0sXG4gICAgICAgIFwiY29tbWVudF9yZWdleF9hbGxvd2VkXCIgOiBbXG4gICAgICAgICAgICB7dG9rZW4gOiBcImNvbW1lbnRcIiwgcmVnZXggOiBcIlxcXFwqXFxcXC9cIiwgbmV4dCA6IFwic3RhcnRcIn0sXG4gICAgICAgICAgICB7ZGVmYXVsdFRva2VuIDogXCJjb21tZW50XCJ9XG4gICAgICAgIF0sXG4gICAgICAgIFwiY29tbWVudFwiIDogW1xuICAgICAgICAgICAge3Rva2VuIDogXCJjb21tZW50XCIsIHJlZ2V4IDogXCJcXFxcKlxcXFwvXCIsIG5leHQgOiBcIm5vX3JlZ2V4XCJ9LFxuICAgICAgICAgICAge2RlZmF1bHRUb2tlbiA6IFwiY29tbWVudFwifVxuICAgICAgICBdLFxuICAgICAgICBcImxpbmVfY29tbWVudF9yZWdleF9hbGxvd2VkXCIgOiBbXG4gICAgICAgICAgICB7dG9rZW4gOiBcImNvbW1lbnRcIiwgcmVnZXggOiBcIiR8XlwiLCBuZXh0IDogXCJzdGFydFwifSxcbiAgICAgICAgICAgIHtkZWZhdWx0VG9rZW4gOiBcImNvbW1lbnRcIn1cbiAgICAgICAgXSxcbiAgICAgICAgXCJsaW5lX2NvbW1lbnRcIiA6IFtcbiAgICAgICAgICAgIHt0b2tlbiA6IFwiY29tbWVudFwiLCByZWdleCA6IFwiJHxeXCIsIG5leHQgOiBcIm5vX3JlZ2V4XCJ9LFxuICAgICAgICAgICAge2RlZmF1bHRUb2tlbiA6IFwiY29tbWVudFwifVxuICAgICAgICBdLFxuICAgICAgICBcInFxc3RyaW5nXCIgOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZVwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogZXNjYXBlZFJlXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgdG9rZW4gOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIHJlZ2V4IDogXCJcXFxcXFxcXCRcIixcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwicXFzdHJpbmdcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICByZWdleCA6ICdcInwkJyxcbiAgICAgICAgICAgICAgICBuZXh0ICA6IFwibm9fcmVnZXhcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIGRlZmF1bHRUb2tlbjogXCJzdHJpbmdcIlxuICAgICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBcInFzdHJpbmdcIiA6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBlc2NhcGVkUmVcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIlxcXFxcXFxcJFwiLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJxc3RyaW5nXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBcIid8JFwiLFxuICAgICAgICAgICAgICAgIG5leHQgIDogXCJub19yZWdleFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgZGVmYXVsdFRva2VuOiBcInN0cmluZ1wiXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9O1xuICAgIFxuICAgIFxuICAgIGlmICghb3B0aW9ucyB8fCAhb3B0aW9ucy5ub0VTNikge1xuICAgICAgICB0aGlzLiRydWxlcy5ub19yZWdleC51bnNoaWZ0KHtcbiAgICAgICAgICAgIHJlZ2V4OiBcIlt7fV1cIiwgb25NYXRjaDogZnVuY3Rpb24odmFsLCBzdGF0ZSwgc3RhY2spIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5leHQgPSB2YWwgPT0gXCJ7XCIgPyB0aGlzLm5leHRTdGF0ZSA6IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHZhbCA9PSBcIntcIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2sudW5zaGlmdChcInN0YXJ0XCIsIHN0YXRlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicGFyZW5cIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHZhbCA9PSBcIn1cIiAmJiBzdGFjay5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhY2suc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0ID0gc3RhY2suc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubmV4dC5pbmRleE9mKFwic3RyaW5nXCIpICE9IC0xKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicGFyZW4ucXVhc2kuZW5kXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB2YWwgPT0gXCJ7XCIgPyBcInBhcmVuLmxwYXJlblwiIDogXCJwYXJlbi5ycGFyZW5cIjtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBuZXh0U3RhdGU6IFwic3RhcnRcIlxuICAgICAgICB9LCB7XG4gICAgICAgICAgICB0b2tlbiA6IFwic3RyaW5nLnF1YXNpLnN0YXJ0XCIsXG4gICAgICAgICAgICByZWdleCA6IC9gLyxcbiAgICAgICAgICAgIHB1c2ggIDogW3tcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwiY29uc3RhbnQubGFuZ3VhZ2UuZXNjYXBlXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiBlc2NhcGVkUmVcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA6IFwicGFyZW4ucXVhc2kuc3RhcnRcIixcbiAgICAgICAgICAgICAgICByZWdleCA6IC9cXCR7LyxcbiAgICAgICAgICAgICAgICBwdXNoICA6IFwic3RhcnRcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgIHRva2VuIDogXCJzdHJpbmcucXVhc2kuZW5kXCIsXG4gICAgICAgICAgICAgICAgcmVnZXggOiAvYC8sXG4gICAgICAgICAgICAgICAgbmV4dCAgOiBcInBvcFwiXG4gICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgZGVmYXVsdFRva2VuOiBcInN0cmluZy5xdWFzaVwiXG4gICAgICAgICAgICB9XVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgdGhpcy5lbWJlZFJ1bGVzKERvY0NvbW1lbnRIaWdobGlnaHRSdWxlcywgXCJkb2MtXCIsXG4gICAgICAgIFsgRG9jQ29tbWVudEhpZ2hsaWdodFJ1bGVzLmdldEVuZFJ1bGUoXCJub19yZWdleFwiKSBdKTtcbiAgICBcbiAgICB0aGlzLm5vcm1hbGl6ZVJ1bGVzKCk7XG4gIH1cbn1cbiJdfQ==