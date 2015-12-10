/**
 * This class takes a set of highlighting rules, and creates a tokenizer out of them. For more information, see [the wiki on extending highlighters](https://github.com/ajaxorg/ace/wiki/Creating-or-Extending-an-Edit-Mode#wiki-extendingTheHighlighter).
 * @class Tokenizer
 **/
/**
 * Constructs a new tokenizer based on the given rules and flags.
 * @param {Object} rules The highlighting rules
 *
 * @constructor
 **/
export default class Tokenizer {
    states: {
        caseInsensitive;
        defaultToken;
        onMatch;
        regex;
        splitRegex;
        token;
        tokenArray;
    }[][];
    private regExps;
    private matchMappings;
    private tokenArray;
    private splitRegex;
    private token;
    constructor(rules: any);
    private $setMaxTokenCount(m);
    private $applyToken(str);
    private $arrayTokens(str);
    private removeCapturingGroups(src);
    private createSplitterRegexp(src, flag);
    /**
    * Returns an object containing two properties: `tokens`, which contains all the tokens; and `state`, the current state.
    * @return {Object}
    **/
    getLineTokens(line: string, startState: any): {
        tokens: any[];
        state: any;
    };
}
