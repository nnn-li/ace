export default class SAXParser {
    contentHandler: any;
    private _errorHandler;
    private _treeBuilder;
    private _tokenizer;
    private _scriptingEnabled;
    constructor();
    parseFragment(source: any, context: any): void;
    parse(source: any): void;
    scriptingEnabled: boolean;
    errorHandler: any;
}
