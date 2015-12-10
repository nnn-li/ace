define(["require", "exports", './SAXTreeBuilder', './Tokenizer', './TreeParser'], function (require, exports, SAXTreeBuilder_1, Tokenizer_1, TreeParser_1) {
    var SAXParser = (function () {
        function SAXParser() {
            this.contentHandler = null;
            this._errorHandler = null;
            this._treeBuilder = new SAXTreeBuilder_1.default();
            this._tokenizer = new Tokenizer_1.default(this._treeBuilder);
            this._scriptingEnabled = false;
        }
        SAXParser.prototype.parseFragment = function (source, context) {
            this._treeBuilder.setFragmentContext(context);
            this._tokenizer.tokenize(source);
            var fragment = this._treeBuilder.getFragment();
            if (fragment) {
                new TreeParser_1.default(this.contentHandler).parse(fragment);
            }
        };
        SAXParser.prototype.parse = function (source) {
            this._tokenizer.tokenize(source);
            var document = this._treeBuilder.document;
            if (document) {
                new TreeParser_1.default(this.contentHandler).parse(document);
            }
        };
        Object.defineProperty(SAXParser.prototype, "scriptingEnabled", {
            get: function () {
                return this._scriptingEnabled;
            },
            set: function (scriptingEnabled) {
                this._scriptingEnabled = scriptingEnabled;
                this._treeBuilder.scriptingEnabled = scriptingEnabled;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(SAXParser.prototype, "errorHandler", {
            get: function () {
                return this._errorHandler;
            },
            set: function (errorHandler) {
                this._errorHandler = errorHandler;
                this._treeBuilder.errorHandler = errorHandler;
            },
            enumerable: true,
            configurable: true
        });
        return SAXParser;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = SAXParser;
});
