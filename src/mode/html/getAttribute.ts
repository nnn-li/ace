export default function getAttribute(node: Node, name: string): Attr {
    for (var i = 0; i < node.attributes.length; i++) {
        var attribute = node.attributes[i];
        if (attribute.nodeName === name) {
            return attribute;
        }
    }
    return null;
}