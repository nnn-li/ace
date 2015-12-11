define(["require", "exports"], function (require, exports) {
    exports.asciiIdentifierStartTable = [];
    for (var i = 0; i < 128; i++) {
        exports.asciiIdentifierStartTable[i] =
            i === 36 ||
                i >= 65 && i <= 90 ||
                i === 95 ||
                i >= 97 && i <= 122; // a-z
    }
    exports.asciiIdentifierPartTable = [];
    for (var i = 0; i < 128; i++) {
        exports.asciiIdentifierPartTable[i] =
            exports.asciiIdentifierStartTable[i] ||
                i >= 48 && i <= 57; // 0-9
    }
});
