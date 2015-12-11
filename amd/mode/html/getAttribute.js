define(["require", "exports"], function (require, exports) {
    function getAttribute(node, name) {
        for (var i = 0; i < node.attributes.length; i++) {
            var attribute = node.attributes[i];
            if (attribute.nodeName === name) {
                return attribute;
            }
        }
        return null;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = getAttribute;
});