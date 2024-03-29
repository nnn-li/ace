/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
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

import TextHighlightRules from "./TextHighlightRules";

export default class XmlHighlightRules extends TextHighlightRules {
    constructor(normalize?: boolean) {
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
            // for doctype and processing instructions
            whitespace: [
                { token: "text.whitespace.xml", regex: "\\s+" }
            ],

            // for doctype and processing instructions
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
                onMatch: function(value, currentState, stack) {
                    stack.splice(0);
                    return this.token;
                }
            }
        ]

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
