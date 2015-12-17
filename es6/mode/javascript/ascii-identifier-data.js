export var asciiIdentifierStartTable = [];
for (var i = 0; i < 128; i++) {
    asciiIdentifierStartTable[i] =
        i === 36 ||
            i >= 65 && i <= 90 ||
            i === 95 ||
            i >= 97 && i <= 122;
}
export var asciiIdentifierPartTable = [];
for (var i = 0; i < 128; i++) {
    asciiIdentifierPartTable[i] =
        asciiIdentifierStartTable[i] ||
            i >= 48 && i <= 57;
}
