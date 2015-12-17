"use strict";
export var ENABLE_ASSERTS = true;
export class AssertionError {
    constructor(message, args) {
        this.name = 'AssertionError';
        this.message = message;
    }
}
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
    throw new AssertionError('' + message, args || []);
}
export function assert(condition, message, args) {
    if (ENABLE_ASSERTS && !condition) {
        doAssertFailure('', null, message, Array.prototype.slice.call(arguments, 2));
    }
    return condition;
}
;
