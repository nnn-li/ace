"use strict";
import TextHighlightRules from "./TextHighlightRules";
export default class XmlHighlightRules extends TextHighlightRules {
    constructor(normalize) {
        super();
        this.$rules = {
            start: [
                { token: "string.cdata.xml", regex: "<\\!\\[CDATA\\[", next: "cdata" },
                {
                    token: ["punctuation.xml-decl.xml", "keyword.xml-decl.xml"],
                    regex: "(<\\?)(xml)(?=[\\s])", next: "xml_decl", caseInsensitive: true
                },
                {
                    token: ["punctuation.instruction.xml", "keyword.instruction.xml"],
                    regex: "(<\\?)([-_a-zA-Z0-9]+)", next: "processing_instruction",
                },
                { token: "comment.xml", regex: "<\\!--", next: "comment" },
                {
                    token: ["xml-pe.doctype.xml", "xml-pe.doctype.xml"],
                    regex: "(<\\!)(DOCTYPE)(?=[\\s])", next: "doctype", caseInsensitive: true
                },
                { include: "tag" },
                { token: "text.end-tag-open.xml", regex: "</" },
                { token: "text.tag-open.xml", regex: "<" },
                { include: "reference" },
                { defaultToken: "text.xml" }
            ],
            xml_decl: [{
                    token: "entity.other.attribute-name.decl-attribute-name.xml",
                    regex: "(?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+"
                }, {
                    token: "keyword.operator.decl-attribute-equals.xml",
                    regex: "="
                }, {
                    include: "whitespace"
                }, {
                    include: "string"
                }, {
                    token: "punctuation.xml-decl.xml",
                    regex: "\\?>",
                    next: "start"
                }],
            processing_instruction: [
                { token: "punctuation.instruction.xml", regex: "\\?>", next: "start" },
                { defaultToken: "instruction.xml" }
            ],
            doctype: [
                { include: "whitespace" },
                { include: "string" },
                { token: "xml-pe.doctype.xml", regex: ">", next: "start" },
                { token: "xml-pe.xml", regex: "[-_a-zA-Z0-9:]+" },
                { token: "punctuation.int-subset", regex: "\\[", push: "int_subset" }
            ],
            int_subset: [{
                    token: "text.xml",
                    regex: "\\s+"
                }, {
                    token: "punctuation.int-subset.xml",
                    regex: "]",
                    next: "pop"
                }, {
                    token: ["punctuation.markup-decl.xml", "keyword.markup-decl.xml"],
                    regex: "(<\\!)([-_a-zA-Z0-9]+)",
                    push: [{
                            token: "text",
                            regex: "\\s+"
                        },
                        {
                            token: "punctuation.markup-decl.xml",
                            regex: ">",
                            next: "pop"
                        },
                        { include: "string" }]
                }],
            cdata: [
                { token: "string.cdata.xml", regex: "\\]\\]>", next: "start" },
                { token: "text.xml", regex: "\\s+" },
                { token: "text.xml", regex: "(?:[^\\]]|\\](?!\\]>))+" }
            ],
            comment: [
                { token: "comment.xml", regex: "-->", next: "start" },
                { defaultToken: "comment.xml" }
            ],
            reference: [{
                    token: "constant.language.escape.reference.xml",
                    regex: "(?:&#[0-9]+;)|(?:&#x[0-9a-fA-F]+;)|(?:&[a-zA-Z0-9_:\\.-]+;)"
                }],
            attr_reference: [{
                    token: "constant.language.escape.reference.attribute-value.xml",
                    regex: "(?:&#[0-9]+;)|(?:&#x[0-9a-fA-F]+;)|(?:&[a-zA-Z0-9_:\\.-]+;)"
                }],
            tag: [{
                    token: ["meta.tag.punctuation.tag-open.xml", "meta.tag.punctuation.end-tag-open.xml", "meta.tag.tag-name.xml"],
                    regex: "(?:(<)|(</))((?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+)",
                    next: [
                        { include: "attributes" },
                        { token: "meta.tag.punctuation.tag-close.xml", regex: "/?>", next: "start" }
                    ]
                }],
            tag_whitespace: [
                { token: "text.tag-whitespace.xml", regex: "\\s+" }
            ],
            whitespace: [
                { token: "text.whitespace.xml", regex: "\\s+" }
            ],
            string: [{
                    token: "string.xml",
                    regex: "'",
                    push: [
                        { token: "string.xml", regex: "'", next: "pop" },
                        { defaultToken: "string.xml" }
                    ]
                }, {
                    token: "string.xml",
                    regex: '"',
                    push: [
                        { token: "string.xml", regex: '"', next: "pop" },
                        { defaultToken: "string.xml" }
                    ]
                }],
            attributes: [{
                    token: "entity.other.attribute-name.xml",
                    regex: "(?:[-_a-zA-Z0-9]+:)?[-_a-zA-Z0-9]+"
                }, {
                    token: "keyword.operator.attribute-equals.xml",
                    regex: "="
                }, {
                    include: "tag_whitespace"
                }, {
                    include: "attribute_value"
                }],
            attribute_value: [{
                    token: "string.attribute-value.xml",
                    regex: "'",
                    push: [
                        { token: "string.attribute-value.xml", regex: "'", next: "pop" },
                        { include: "attr_reference" },
                        { defaultToken: "string.attribute-value.xml" }
                    ]
                }, {
                    token: "string.attribute-value.xml",
                    regex: '"',
                    push: [
                        { token: "string.attribute-value.xml", regex: '"', next: "pop" },
                        { include: "attr_reference" },
                        { defaultToken: "string.attribute-value.xml" }
                    ]
                }]
        };
        if (this.constructor === XmlHighlightRules)
            this.normalizeRules();
    }
    embedTagRules(HighlightRules, prefix, tag) {
        this.$rules.tag.unshift({
            token: ["meta.tag.punctuation.tag-open.xml", "meta.tag." + tag + ".tag-name.xml"],
            regex: "(<)(" + tag + "(?=\\s|>|$))",
            next: [
                { include: "attributes" },
                { token: "meta.tag.punctuation.tag-close.xml", regex: "/?>", next: prefix + "start" }
            ]
        });
        this.$rules[tag + "-end"] = [
            { include: "attributes" },
            {
                token: "meta.tag.punctuation.tag-close.xml", regex: "/?>", next: "start",
                onMatch: function (value, currentState, stack) {
                    stack.splice(0);
                    return this.token;
                }
            }
        ];
        this.embedRules(HighlightRules, prefix, [{
                token: ["meta.tag.punctuation.end-tag-open.xml", "meta.tag." + tag + ".tag-name.xml"],
                regex: "(</)(" + tag + "(?=\\s|>|$))",
                next: tag + "-end"
            }, {
                token: "string.cdata.xml",
                regex: "<\\!\\[CDATA\\["
            }, {
                token: "string.cdata.xml",
                regex: "\\]\\]>"
            }]);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiWG1sSGlnaGxpZ2h0UnVsZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJYbWxIaWdobGlnaHRSdWxlcy50cyJdLCJuYW1lcyI6WyJYbWxIaWdobGlnaHRSdWxlcyIsIlhtbEhpZ2hsaWdodFJ1bGVzLmNvbnN0cnVjdG9yIiwiWG1sSGlnaGxpZ2h0UnVsZXMuZW1iZWRUYWdSdWxlcyJdLCJtYXBwaW5ncyI6IkFBb0RBLFlBQVksQ0FBQztPQUVOLGtCQUFrQixNQUFNLHNCQUFzQjtBQUVyRCwrQ0FBK0Msa0JBQWtCO0lBQzdEQSxZQUFZQSxTQUFtQkE7UUFDM0JDLE9BQU9BLENBQUNBO1FBQ1JBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBO1lBQ1ZBLEtBQUtBLEVBQUVBO2dCQUNIQSxFQUFFQSxLQUFLQSxFQUFFQSxrQkFBa0JBLEVBQUVBLEtBQUtBLEVBQUVBLGlCQUFpQkEsRUFBRUEsSUFBSUEsRUFBRUEsT0FBT0EsRUFBRUE7Z0JBQ3RFQTtvQkFDSUEsS0FBS0EsRUFBRUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxzQkFBc0JBLENBQUNBO29CQUMzREEsS0FBS0EsRUFBRUEsc0JBQXNCQSxFQUFFQSxJQUFJQSxFQUFFQSxVQUFVQSxFQUFFQSxlQUFlQSxFQUFFQSxJQUFJQTtpQkFDekVBO2dCQUNEQTtvQkFDSUEsS0FBS0EsRUFBRUEsQ0FBQ0EsNkJBQTZCQSxFQUFFQSx5QkFBeUJBLENBQUNBO29CQUNqRUEsS0FBS0EsRUFBRUEsd0JBQXdCQSxFQUFFQSxJQUFJQSxFQUFFQSx3QkFBd0JBO2lCQUNsRUE7Z0JBQ0RBLEVBQUVBLEtBQUtBLEVBQUVBLGFBQWFBLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLEVBQUVBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBO2dCQUMxREE7b0JBQ0lBLEtBQUtBLEVBQUVBLENBQUNBLG9CQUFvQkEsRUFBRUEsb0JBQW9CQSxDQUFDQTtvQkFDbkRBLEtBQUtBLEVBQUVBLDBCQUEwQkEsRUFBRUEsSUFBSUEsRUFBRUEsU0FB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WUFDekJBO2dCQUNJQSxLQUFLQSxFQUFFQSxvQ0FBb0NBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLEVBQUVBLE9BQU9BO2dCQUN4RUEsT0FBT0EsRUFBRUEsVUFBU0EsS0FBS0EsRUFBRUEsWUFBWUEsRUFBRUEsS0FBS0E7b0JBQ3hDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO2dCQUN0QixDQUFDO2FBQ0pBO1NBQ0pBLENBQUFBO1FBRURBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGNBQWNBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNyQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsdUNBQXVDQSxFQUFFQSxXQUFXQSxHQUFHQSxHQUFHQSxHQUFHQSxlQUFlQSxDQUFDQTtnQkFDckZBLEtBQUtBLEVBQUVBLE9BQU9BLEdBQUdBLEdBQUdBLEdBQUdBLGNBQWNBO2dCQUNyQ0EsSUFBSUEsRUFBRUEsR0FBR0EsR0FBR0EsTUFBTUE7YUFDckJBLEVBQUVBO2dCQUNLQSxLQUFLQSxFQUFFQSxrQkFBa0JBO2dCQUN6QkEsS0FBS0EsRUFBRUEsaUJBQWlCQTthQUMzQkEsRUFBRUE7Z0JBQ0NBLEtBQUtBLEVBQUVBLGtCQUFrQkE7Z0JBQ3pCQSxLQUFLQSxFQUFFQSxTQUFTQTthQUNuQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDWkEsQ0FBQ0E7QUFDTEYsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IFRleHRIaWdobGlnaHRSdWxlcyBmcm9tIFwiLi9UZXh0SGlnaGxpZ2h0UnVsZXNcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgWG1sSGlnaGxpZ2h0UnVsZXMgZXh0ZW5kcyBUZXh0SGlnaGxpZ2h0UnVsZXMge1xuICAgIGNvbnN0cnVjdG9yKG5vcm1hbGl6ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy4kcnVsZXMgPSB7XG4gICAgICAgICAgICBzdGFydDogW1xuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwic3RyaW5nLmNkYXRhLnhtbFwiLCByZWdleDogXCI8XFxcXCFcXFxcW0NEQVRBXFxcXFtcIiwgbmV4dDogXCJjZGF0YVwiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbjogW1wicHVuY3R1YXRpb24ueG1sLWRlY2wueG1sXCIsIFwia2V5d29yZC54bWwtZGVjbC54bWxcIl0sXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig8XFxcXD8pKHhtbCkoPz1bXFxcXHNdKVwiLCBuZXh0OiBcInhtbF9kZWNsXCIsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbjogW1wicHVuY3R1YXRpb24uaW5zdHJ1Y3Rpb24ueG1sXCIsIFwia2V5d29yZC5pbnN0cnVjdGlvbi54bWxcIl0sXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig8XFxcXD8pKFstX2EtekEtWjAtOV0rKVwiLCBuZXh0OiBcInByb2Nlc3NpbmdfaW5zdHJ1Y3Rpb25cIixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwiY29tbWVudC54bWxcIiwgcmVnZXg6IFwiPFxcXFwhLS1cIiwgbmV4dDogXCJjb21tZW50XCIgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuOiBbXCJ4bWwtcGUuZG9jdHlwZS54bWxcIiwgXCJ4bWwtcGUuZG9jdHlwZS54bWxcIl0sXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig8XFxcXCEpKERPQ1RZUEUpKD89W1xcXFxzXSlcIiwgbmV4dDogXCJkb2N0eXBlXCIsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgeyBpbmNsdWRlOiBcInRhZ1wiIH0sXG4gICAgICAgICAgICAgICAgeyB0b2tlbjogXCJ0ZXh0LmVuZC10YWctb3Blbi54bWxcIiwgcmVnZXg6IFwiPC9cIiB9LFxuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwidGV4dC50YWctb3Blbi54bWxcIiwgcmVnZXg6IFwiPFwiIH0sXG4gICAgICAgICAgICAgICAgeyBpbmNsdWRlOiBcInJlZmVyZW5jZVwiIH0sXG4gICAgICAgICAgICAgICAgeyBkZWZhdWx0VG9rZW46IFwidGV4dC54bWxcIiB9XG4gICAgICAgICAgICBdLFxuXG4gICAgICAgICAgICB4bWxfZGVjbDogW3tcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJlbnRpdHkub3RoZXIuYXR0cmlidXRlLW5hbWUuZGVjbC1hdHRyaWJ1dGUtbmFtZS54bWxcIixcbiAgICAgICAgICAgICAgICByZWdleDogXCIoPzpbLV9hLXpBLVowLTldKzopP1stX2EtekEtWjAtOV0rXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IFwia2V5d29yZC5vcGVyYXRvci5kZWNsLWF0dHJpYnV0ZS1lcXVhbHMueG1sXCIsXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIj1cIlxuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZTogXCJ3aGl0ZXNwYWNlXCJcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICAgIGluY2x1ZGU6IFwic3RyaW5nXCJcbiAgICAgICAgICAgICAgICB9LCB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuOiBcInB1bmN0dWF0aW9uLnhtbC1kZWNsLnhtbFwiLFxuICAgICAgICAgICAgICAgICAgICByZWdleDogXCJcXFxcPz5cIixcbiAgICAgICAgICAgICAgICAgICAgbmV4dDogXCJzdGFydFwiXG4gICAgICAgICAgICAgICAgfV0sXG5cbiAgICAgICAgICAgIHByb2Nlc3NpbmdfaW5zdHJ1Y3Rpb246IFtcbiAgICAgICAgICAgICAgICB7IHRva2VuOiBcInB1bmN0dWF0aW9uLmluc3RydWN0aW9uLnhtbFwiLCByZWdleDogXCJcXFxcPz5cIiwgbmV4dDogXCJzdGFydFwiIH0sXG4gICAgICAgICAgICAgICAgeyBkZWZhdWx0VG9rZW46IFwiaW5zdHJ1Y3Rpb24ueG1sXCIgfVxuICAgICAgICAgICAgXSxcblxuICAgICAgICAgICAgZG9jdHlwZTogW1xuICAgICAgICAgICAgICAgIHsgaW5jbHVkZTogXCJ3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICAgICAgICB7IGluY2x1ZGU6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICB7IHRva2VuOiBcInhtbC1wZS5kb2N0eXBlLnhtbFwiLCByZWdleDogXCI+XCIsIG5leHQ6IFwic3RhcnRcIiB9LFxuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwieG1sLXBlLnhtbFwiLCByZWdleDogXCJbLV9hLXpBLVowLTk6XStcIiB9LFxuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwicHVuY3R1YXRpb24uaW50LXN1YnNldFwiLCByZWdleDogXCJcXFxcW1wiLCBwdXNoOiBcImludF9zdWJzZXRcIiB9XG4gICAgICAgICAgICBdLFxuXG4gICAgICAgICAgICBpbnRfc3Vic2V0OiBbe1xuICAgICAgICAgICAgICAgIHRva2VuOiBcInRleHQueG1sXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHMrXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IFwicHVuY3R1YXRpb24uaW50LXN1YnNldC54bWxcIixcbiAgICAgICAgICAgICAgICAgICAgcmVnZXg6IFwiXVwiLFxuICAgICAgICAgICAgICAgICAgICBuZXh0OiBcInBvcFwiXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbjogW1wicHVuY3R1YXRpb24ubWFya3VwLWRlY2wueG1sXCIsIFwia2V5d29yZC5tYXJrdXAtZGVjbC54bWxcIl0sXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig8XFxcXCEpKFstX2EtekEtWjAtOV0rKVwiLFxuICAgICAgICAgICAgICAgICAgICBwdXNoOiBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgdG9rZW46IFwidGV4dFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXHMrXCJcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbjogXCJwdW5jdHVhdGlvbi5tYXJrdXAtZGVjbC54bWxcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWdleDogXCI+XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dDogXCJwb3BcIlxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgaW5jbHVkZTogXCJzdHJpbmdcIiB9XVxuICAgICAgICAgICAgICAgIH1dLFxuXG4gICAgICAgICAgICBjZGF0YTogW1xuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwic3RyaW5nLmNkYXRhLnhtbFwiLCByZWdleDogXCJcXFxcXVxcXFxdPlwiLCBuZXh0OiBcInN0YXJ0XCIgfSxcbiAgICAgICAgICAgICAgICB7IHRva2VuOiBcInRleHQueG1sXCIsIHJlZ2V4OiBcIlxcXFxzK1wiIH0sXG4gICAgICAgICAgICAgICAgeyB0b2tlbjogXCJ0ZXh0LnhtbFwiLCByZWdleDogXCIoPzpbXlxcXFxdXXxcXFxcXSg/IVxcXFxdPikpK1wiIH1cbiAgICAgICAgICAgIF0sXG5cbiAgICAgICAgICAgIGNvbW1lbnQ6IFtcbiAgICAgICAgICAgICAgICB7IHRva2VuOiBcImNvbW1lbnQueG1sXCIsIHJlZ2V4OiBcIi0tPlwiLCBuZXh0OiBcInN0YXJ0XCIgfSxcbiAgICAgICAgICAgICAgICB7IGRlZmF1bHRUb2tlbjogXCJjb21tZW50LnhtbFwiIH1cbiAgICAgICAgICAgIF0sXG5cbiAgICAgICAgICAgIHJlZmVyZW5jZTogW3tcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJjb25zdGFudC5sYW5ndWFnZS5lc2NhcGUucmVmZXJlbmNlLnhtbFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig/OiYjWzAtOV0rOyl8KD86JiN4WzAtOWEtZkEtRl0rOyl8KD86JlthLXpBLVowLTlfOlxcXFwuLV0rOylcIlxuICAgICAgICAgICAgfV0sXG5cbiAgICAgICAgICAgIGF0dHJfcmVmZXJlbmNlOiBbe1xuICAgICAgICAgICAgICAgIHRva2VuOiBcImNvbnN0YW50Lmxhbmd1YWdlLmVzY2FwZS5yZWZlcmVuY2UuYXR0cmlidXRlLXZhbHVlLnhtbFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig/OiYjWzAtOV0rOyl8KD86JiN4WzAtOWEtZkEtRl0rOyl8KD86JlthLXpBLVowLTlfOlxcXFwuLV0rOylcIlxuICAgICAgICAgICAgfV0sXG5cbiAgICAgICAgICAgIHRhZzogW3tcbiAgICAgICAgICAgICAgICB0b2tlbjogW1wibWV0YS50YWcucHVuY3R1YXRpb24udGFnLW9wZW4ueG1sXCIsIFwibWV0YS50YWcucHVuY3R1YXRpb24uZW5kLXRhZy1vcGVuLnhtbFwiLCBcIm1ldGEudGFnLnRhZy1uYW1lLnhtbFwiXSxcbiAgICAgICAgICAgICAgICByZWdleDogXCIoPzooPCl8KDwvKSkoKD86Wy1fYS16QS1aMC05XSs6KT9bLV9hLXpBLVowLTldKylcIixcbiAgICAgICAgICAgICAgICBuZXh0OiBbXG4gICAgICAgICAgICAgICAgICAgIHsgaW5jbHVkZTogXCJhdHRyaWJ1dGVzXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyB0b2tlbjogXCJtZXRhLnRhZy5wdW5jdHVhdGlvbi50YWctY2xvc2UueG1sXCIsIHJlZ2V4OiBcIi8/PlwiLCBuZXh0OiBcInN0YXJ0XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1dLFxuXG4gICAgICAgICAgICB0YWdfd2hpdGVzcGFjZTogW1xuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwidGV4dC50YWctd2hpdGVzcGFjZS54bWxcIiwgcmVnZXg6IFwiXFxcXHMrXCIgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIC8vIGZvciBkb2N0eXBlIGFuZCBwcm9jZXNzaW5nIGluc3RydWN0aW9uc1xuICAgICAgICAgICAgd2hpdGVzcGFjZTogW1xuICAgICAgICAgICAgICAgIHsgdG9rZW46IFwidGV4dC53aGl0ZXNwYWNlLnhtbFwiLCByZWdleDogXCJcXFxccytcIiB9XG4gICAgICAgICAgICBdLFxuXG4gICAgICAgICAgICAvLyBmb3IgZG9jdHlwZSBhbmQgcHJvY2Vzc2luZyBpbnN0cnVjdGlvbnNcbiAgICAgICAgICAgIHN0cmluZzogW3tcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcueG1sXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiJ1wiLFxuICAgICAgICAgICAgICAgIHB1c2g6IFtcbiAgICAgICAgICAgICAgICAgICAgeyB0b2tlbjogXCJzdHJpbmcueG1sXCIsIHJlZ2V4OiBcIidcIiwgbmV4dDogXCJwb3BcIiB9LFxuICAgICAgICAgICAgICAgICAgICB7IGRlZmF1bHRUb2tlbjogXCJzdHJpbmcueG1sXCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IFwic3RyaW5nLnhtbFwiLFxuICAgICAgICAgICAgICAgICAgICByZWdleDogJ1wiJyxcbiAgICAgICAgICAgICAgICAgICAgcHVzaDogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyB0b2tlbjogXCJzdHJpbmcueG1sXCIsIHJlZ2V4OiAnXCInLCBuZXh0OiBcInBvcFwiIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGRlZmF1bHRUb2tlbjogXCJzdHJpbmcueG1sXCIgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfV0sXG5cbiAgICAgICAgICAgIGF0dHJpYnV0ZXM6IFt7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwiZW50aXR5Lm90aGVyLmF0dHJpYnV0ZS1uYW1lLnhtbFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIig/OlstX2EtekEtWjAtOV0rOik/Wy1fYS16QS1aMC05XStcIlxuICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbjogXCJrZXl3b3JkLm9wZXJhdG9yLmF0dHJpYnV0ZS1lcXVhbHMueG1sXCIsXG4gICAgICAgICAgICAgICAgICAgIHJlZ2V4OiBcIj1cIlxuICAgICAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgaW5jbHVkZTogXCJ0YWdfd2hpdGVzcGFjZVwiXG4gICAgICAgICAgICAgICAgfSwge1xuICAgICAgICAgICAgICAgICAgICBpbmNsdWRlOiBcImF0dHJpYnV0ZV92YWx1ZVwiXG4gICAgICAgICAgICAgICAgfV0sXG5cbiAgICAgICAgICAgIGF0dHJpYnV0ZV92YWx1ZTogW3tcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcuYXR0cmlidXRlLXZhbHVlLnhtbFwiLFxuICAgICAgICAgICAgICAgIHJlZ2V4OiBcIidcIixcbiAgICAgICAgICAgICAgICBwdXNoOiBbXG4gICAgICAgICAgICAgICAgICAgIHsgdG9rZW46IFwic3RyaW5nLmF0dHJpYnV0ZS12YWx1ZS54bWxcIiwgcmVnZXg6IFwiJ1wiLCBuZXh0OiBcInBvcFwiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgaW5jbHVkZTogXCJhdHRyX3JlZmVyZW5jZVwiIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgZGVmYXVsdFRva2VuOiBcInN0cmluZy5hdHRyaWJ1dGUtdmFsdWUueG1sXCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IFwic3RyaW5nLmF0dHJpYnV0ZS12YWx1ZS54bWxcIixcbiAgICAgICAgICAgICAgICAgICAgcmVnZXg6ICdcIicsXG4gICAgICAgICAgICAgICAgICAgIHB1c2g6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgdG9rZW46IFwic3RyaW5nLmF0dHJpYnV0ZS12YWx1ZS54bWxcIiwgcmVnZXg6ICdcIicsIG5leHQ6IFwicG9wXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgaW5jbHVkZTogXCJhdHRyX3JlZmVyZW5jZVwiIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7IGRlZmF1bHRUb2tlbjogXCJzdHJpbmcuYXR0cmlidXRlLXZhbHVlLnhtbFwiIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1dXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKHRoaXMuY29uc3RydWN0b3IgPT09IFhtbEhpZ2hsaWdodFJ1bGVzKVxuICAgICAgICAgICAgdGhpcy5ub3JtYWxpemVSdWxlcygpO1xuICAgIH1cblxuICAgIGVtYmVkVGFnUnVsZXMoSGlnaGxpZ2h0UnVsZXMsIHByZWZpeCwgdGFnKSB7XG4gICAgICAgIHRoaXMuJHJ1bGVzLnRhZy51bnNoaWZ0KHtcbiAgICAgICAgICAgIHRva2VuOiBbXCJtZXRhLnRhZy5wdW5jdHVhdGlvbi50YWctb3Blbi54bWxcIiwgXCJtZXRhLnRhZy5cIiArIHRhZyArIFwiLnRhZy1uYW1lLnhtbFwiXSxcbiAgICAgICAgICAgIHJlZ2V4OiBcIig8KShcIiArIHRhZyArIFwiKD89XFxcXHN8PnwkKSlcIixcbiAgICAgICAgICAgIG5leHQ6IFtcbiAgICAgICAgICAgICAgICB7IGluY2x1ZGU6IFwiYXR0cmlidXRlc1wiIH0sXG4gICAgICAgICAgICAgICAgeyB0b2tlbjogXCJtZXRhLnRhZy5wdW5jdHVhdGlvbi50YWctY2xvc2UueG1sXCIsIHJlZ2V4OiBcIi8/PlwiLCBuZXh0OiBwcmVmaXggKyBcInN0YXJ0XCIgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLiRydWxlc1t0YWcgKyBcIi1lbmRcIl0gPSBbXG4gICAgICAgICAgICB7IGluY2x1ZGU6IFwiYXR0cmlidXRlc1wiIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdG9rZW46IFwibWV0YS50YWcucHVuY3R1YXRpb24udGFnLWNsb3NlLnhtbFwiLCByZWdleDogXCIvPz5cIiwgbmV4dDogXCJzdGFydFwiLFxuICAgICAgICAgICAgICAgIG9uTWF0Y2g6IGZ1bmN0aW9uKHZhbHVlLCBjdXJyZW50U3RhdGUsIHN0YWNrKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YWNrLnNwbGljZSgwKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9rZW47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICBdXG5cbiAgICAgICAgdGhpcy5lbWJlZFJ1bGVzKEhpZ2hsaWdodFJ1bGVzLCBwcmVmaXgsIFt7XG4gICAgICAgICAgICB0b2tlbjogW1wibWV0YS50YWcucHVuY3R1YXRpb24uZW5kLXRhZy1vcGVuLnhtbFwiLCBcIm1ldGEudGFnLlwiICsgdGFnICsgXCIudGFnLW5hbWUueG1sXCJdLFxuICAgICAgICAgICAgcmVnZXg6IFwiKDwvKShcIiArIHRhZyArIFwiKD89XFxcXHN8PnwkKSlcIixcbiAgICAgICAgICAgIG5leHQ6IHRhZyArIFwiLWVuZFwiXG4gICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcuY2RhdGEueG1sXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiPFxcXFwhXFxcXFtDREFUQVxcXFxbXCJcbiAgICAgICAgICAgIH0sIHtcbiAgICAgICAgICAgICAgICB0b2tlbjogXCJzdHJpbmcuY2RhdGEueG1sXCIsXG4gICAgICAgICAgICAgICAgcmVnZXg6IFwiXFxcXF1cXFxcXT5cIlxuICAgICAgICAgICAgfV0pO1xuICAgIH1cbn1cbiJdfQ==