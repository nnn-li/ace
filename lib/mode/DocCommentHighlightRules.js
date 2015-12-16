"use strict";
import TextHighlightRules from "./TextHighlightRules";
export default class DocCommentHighlightRules extends TextHighlightRules {
    constructor() {
        super();
        this.$rules = {
            "start": [{
                    token: "comment.doc.tag",
                    regex: "@[\\w\\d_]+"
                }, {
                    token: "comment.doc.tag",
                    regex: "\\bTODO\\b"
                }, {
                    defaultToken: "comment.doc"
                }]
        };
    }
    static getStartRule(start) {
        return {
            token: "comment.doc",
            regex: "\\/\\*(?=\\*)",
            next: start
        };
    }
    static getEndRule(start) {
        return {
            token: "comment.doc",
            regex: "\\*\\/",
            next: start
        };
    }
}
