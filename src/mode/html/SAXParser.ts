import SAXTreeBuilder from './SAXTreeBuilder';
import Tokenizer from './Tokenizer';
import TreeParser from './TreeParser';

export default class SAXParser {
    contentHandler;
    errorHandler;
    _errorHandler;
    _treeBuilder: SAXTreeBuilder;
    _tokenizer: Tokenizer;
    _scriptingEnabled: boolean
    constructor() {
        this.contentHandler = null;
        this._errorHandler = null;
        this._treeBuilder = new SAXTreeBuilder();
        this._tokenizer = new Tokenizer(this._treeBuilder);
        this._scriptingEnabled = false;

    }
    parseFragment(source, context) {
        this._treeBuilder.setFragmentContext(context);
        this._tokenizer.tokenize(source);
        var fragment = this._treeBuilder.getFragment();
        if (fragment) {
            new TreeParser(this.contentHandler).parse(fragment);
        }
    }
    parse(source) {
        this._tokenizer.tokenize(source);
        var document = this._treeBuilder.document;
        if (document) {
            new TreeParser(this.contentHandler).parse(document);
        }
    }
}