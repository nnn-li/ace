import TextHighlightRules from "./TextHighlightRules";
export default class DocCommentHighlightRules extends TextHighlightRules {
    constructor();
    static getStartRule(start: any): {
        token: string;
        regex: string;
        next: any;
    };
    static getEndRule(start: any): {
        token: string;
        regex: string;
        next: any;
    };
}
