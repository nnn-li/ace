export default class TextHighlightRules {
    $rules: any;
    $embeds: any;
    nextState: any;
    $keywordList: string[];
    constructor();
    addRules(rules: any, prefix?: any): void;
    getRules(): any;
    embedRules(HighlightRules: any, prefix: any, escapeRules: any, states?: any, append?: any): void;
    getEmbeds(): any;
    normalizeRules(): void;
    createKeywordMapper(map: any, defaultToken: any, ignoreCase?: any, splitChar?: any): (value: any) => any;
    getKeywords(): string[];
}
