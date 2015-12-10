define(["require", "exports"], function (require, exports) {
    function formatMessage(format, args) {
        return format.replace(new RegExp('{[0-9a-z-]+}', 'gi'), function (match) {
            return args[match.slice(1, -1)] || match;
        });
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = formatMessage;
});
