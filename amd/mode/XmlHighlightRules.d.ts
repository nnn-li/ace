import TextHighlightRules from "./TextHighlightRules";
export default class XmlHighlightRules extends TextHighlightRules {
    constructor(normalize?: boolean);
    embedTagRules(HighlightRules: any, prefix: any, tag: any): void;
}
