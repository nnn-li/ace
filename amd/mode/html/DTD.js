var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './ParentNode', './NodeType'], function (require, exports, ParentNode_1, NodeType_1) {
    var DTD = (function (_super) {
        __extends(DTD, _super);
        /**
         * The constructor.
         * @param locator the locator
         * @param name the name
         * @param publicIdentifier the public id
         * @param systemIdentifier the system id
         */
        function DTD(locator, name, publicIdentifier, systemIdentifier) {
            _super.call(this, locator);
            this.name = name;
            this.publicIdentifier = publicIdentifier;
            this.systemIdentifier = systemIdentifier;
            this.nodeType = NodeType_1.default.DTD;
        }
        /**
         *
         * @see nu.validator.saxtree.Node#visit(nu.validator.saxtree.TreeParser)
         */
        DTD.prototype.visit = function (treeParser) {
            treeParser.startDTD(this.name, this.publicIdentifier, this.systemIdentifier, this);
        };
        /**
         * @see nu.validator.saxtree.Node#revisit(nu.validator.saxtree.TreeParser)
         */
        DTD.prototype.revisit = function (treeParser) {
            treeParser.endDTD();
        };
        return DTD;
    })(ParentNode_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = DTD;
});
