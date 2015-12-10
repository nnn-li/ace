define(["require", "exports"], function (require, exports) {
    exports.ENABLE_ASSERTS = true;
    var AssertionError = (function () {
        function AssertionError(message, args) {
            this.name = 'AssertionError';
            this.message = message;
        }
        return AssertionError;
    })();
    exports.AssertionError = AssertionError;
    function doAssertFailure(defaultMessage, defaultArgs, givenMessage, givenArgs) {
        var message = 'Assertion failed';
        if (givenMessage) {
            message += ': ' + givenMessage;
            var args = givenArgs;
        }
        else if (defaultMessage) {
            message += ': ' + defaultMessage;
            args = defaultArgs;
        }
        // The '' + works around an Opera 10 bug in the unit tests. Without it,
        // a stack trace is added to var message above. With this, a stack trace is
        // not added until this line (it causes the extra garbage to be added after
        // the assertion message instead of in the middle of it).
        throw new AssertionError('' + message, args || []);
    }
    function assert(condition, message, args) {
        if (exports.ENABLE_ASSERTS && !condition) {
            doAssertFailure('', null, message, Array.prototype.slice.call(arguments, 2));
        }
        return condition;
    }
    exports.assert = assert;
    ;
});
