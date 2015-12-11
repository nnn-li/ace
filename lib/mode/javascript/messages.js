"use strict";
function each(data, callback) {
    var keys = Object.keys(data);
    for (var i = 0, iLength = keys.length; i < iLength; i++) {
        var code = keys[i];
        var desc = data[code];
        callback(desc, code);
    }
}
var errorsMap = {
    E001: "Bad option: '{a}'.",
    E002: "Bad option value.",
    E003: "Expected a JSON value.",
    E004: "Input is neither a string nor an array of strings.",
    E005: "Input is empty.",
    E006: "Unexpected early end of program.",
    E007: "Missing \"use strict\" statement.",
    E008: "Strict violation.",
    E009: "Option 'validthis' can't be used in a global scope.",
    E010: "'with' is not allowed in strict mode.",
    E011: "'{a}' has already been declared.",
    E012: "const '{a}' is initialized to 'undefined'.",
    E013: "Attempting to override '{a}' which is a constant.",
    E014: "A regular expression literal can be confused with '/='.",
    E015: "Unclosed regular expression.",
    E016: "Invalid regular expression.",
    E017: "Unclosed comment.",
    E018: "Unbegun comment.",
    E019: "Unmatched '{a}'.",
    E020: "Expected '{a}' to match '{b}' from line {c} and instead saw '{d}'.",
    E021: "Expected '{a}' and instead saw '{b}'.",
    E022: "Line breaking error '{a}'.",
    E023: "Missing '{a}'.",
    E024: "Unexpected '{a}'.",
    E025: "Missing ':' on a case clause.",
    E026: "Missing '}' to match '{' from line {a}.",
    E027: "Missing ']' to match '[' from line {a}.",
    E028: "Illegal comma.",
    E029: "Unclosed string.",
    E030: "Expected an identifier and instead saw '{a}'.",
    E031: "Bad assignment.",
    E032: "Expected a small integer or 'false' and instead saw '{a}'.",
    E033: "Expected an operator and instead saw '{a}'.",
    E034: "get/set are ES5 features.",
    E035: "Missing property name.",
    E036: "Expected to see a statement and instead saw a block.",
    E037: null,
    E038: null,
    E039: "Function declarations are not invocable. Wrap the whole function invocation in parens.",
    E040: "Each value should have its own case label.",
    E041: "Unrecoverable syntax error.",
    E042: "Stopping.",
    E043: "Too many errors.",
    E044: null,
    E045: "Invalid for each loop.",
    E046: "A yield statement shall be within a generator function (with syntax: `function*`)",
    E047: null,
    E048: "{a} declaration not directly within block.",
    E049: "A {a} cannot be named '{b}'.",
    E050: "Mozilla requires the yield expression to be parenthesized here.",
    E051: null,
    E052: "Unclosed template literal.",
    E053: "Export declaration must be in global scope.",
    E054: "Class properties must be methods. Expected '(' but instead saw '{a}'.",
    E055: "The '{a}' option cannot be set after any executable code.",
    E056: "'{a}' was used before it was declared, which is illegal for '{b}' variables.",
    E057: "Invalid meta property: '{a}.{b}'.",
    E058: "Missing semicolon.",
    E059: "Incompatible values for the '{a}' and '{b}' linting options."
};
var warningsMap = {
    W001: "'hasOwnProperty' is a really bad name.",
    W002: "Value of '{a}' may be overwritten in IE 8 and earlier.",
    W003: "'{a}' was used before it was defined.",
    W004: "'{a}' is already defined.",
    W005: "A dot following a number can be confused with a decimal point.",
    W006: "Confusing minuses.",
    W007: "Confusing plusses.",
    W008: "A leading decimal point can be confused with a dot: '{a}'.",
    W009: "The array literal notation [] is preferable.",
    W010: "The object literal notation {} is preferable.",
    W011: null,
    W012: null,
    W013: null,
    W014: "Bad line breaking before '{a}'.",
    W015: null,
    W016: "Unexpected use of '{a}'.",
    W017: "Bad operand.",
    W018: "Confusing use of '{a}'.",
    W019: "Use the isNaN function to compare with NaN.",
    W020: "Read only.",
    W021: "Reassignment of '{a}', which is is a {b}. " +
        "Use 'var' or 'let' to declare bindings that may change.",
    W022: "Do not assign to the exception parameter.",
    W023: "Expected an identifier in an assignment and instead saw a function invocation.",
    W024: "Expected an identifier and instead saw '{a}' (a reserved word).",
    W025: "Missing name in function declaration.",
    W026: "Inner functions should be listed at the top of the outer function.",
    W027: "Unreachable '{a}' after '{b}'.",
    W028: "Label '{a}' on {b} statement.",
    W030: "Expected an assignment or function call and instead saw an expression.",
    W031: "Do not use 'new' for side effects.",
    W032: "Unnecessary semicolon.",
    W033: "Missing semicolon.",
    W034: "Unnecessary directive \"{a}\".",
    W035: "Empty block.",
    W036: "Unexpected /*member '{a}'.",
    W037: "'{a}' is a statement label.",
    W038: "'{a}' used out of scope.",
    W039: "'{a}' is not allowed.",
    W040: "Possible strict violation.",
    W041: "Use '{a}' to compare with '{b}'.",
    W042: "Avoid EOL escaping.",
    W043: "Bad escaping of EOL. Use option multistr if needed.",
    W044: "Bad or unnecessary escaping.",
    W045: "Bad number '{a}'.",
    W046: "Don't use extra leading zeros '{a}'.",
    W047: "A trailing decimal point can be confused with a dot: '{a}'.",
    W048: "Unexpected control character in regular expression.",
    W049: "Unexpected escaped character '{a}' in regular expression.",
    W050: "JavaScript URL.",
    W051: "Variables should not be deleted.",
    W052: "Unexpected '{a}'.",
    W053: "Do not use {a} as a constructor.",
    W054: "The Function constructor is a form of eval.",
    W055: "A constructor name should start with an uppercase letter.",
    W056: "Bad constructor.",
    W057: "Weird construction. Is 'new' necessary?",
    W058: "Missing '()' invoking a constructor.",
    W059: "Avoid arguments.{a}.",
    W060: "document.write can be a form of eval.",
    W061: "eval can be harmful.",
    W062: "Wrap an immediate function invocation in parens " +
        "to assist the reader in understanding that the expression " +
        "is the result of a function, and not the function itself.",
    W063: "Math is not a function.",
    W064: "Missing 'new' prefix when invoking a constructor.",
    W065: "Missing radix parameter.",
    W066: "Implied eval. Consider passing a function instead of a string.",
    W067: "Bad invocation.",
    W068: "Wrapping non-IIFE function literals in parens is unnecessary.",
    W069: "['{a}'] is better written in dot notation.",
    W070: "Extra comma. (it breaks older versions of IE)",
    W071: "This function has too many statements. ({a})",
    W072: "This function has too many parameters. ({a})",
    W073: "Blocks are nested too deeply. ({a})",
    W074: "This function's cyclomatic complexity is too high. ({a})",
    W075: "Duplicate {a} '{b}'.",
    W076: "Unexpected parameter '{a}' in get {b} function.",
    W077: "Expected a single parameter in set {a} function.",
    W078: "Setter is defined without getter.",
    W079: "Redefinition of '{a}'.",
    W080: "It's not necessary to initialize '{a}' to 'undefined'.",
    W081: null,
    W082: "Function declarations should not be placed in blocks. " +
        "Use a function expression or move the statement to the top of " +
        "the outer function.",
    W083: "Don't make functions within a loop.",
    W084: "Expected a conditional expression and instead saw an assignment.",
    W085: "Don't use 'with'.",
    W086: "Expected a 'break' statement before '{a}'.",
    W087: "Forgotten 'debugger' statement?",
    W088: "Creating global 'for' variable. Should be 'for (var {a} ...'.",
    W089: "The body of a for in should be wrapped in an if statement to filter " +
        "unwanted properties from the prototype.",
    W090: "'{a}' is not a statement label.",
    W091: null,
    W093: "Did you mean to return a conditional instead of an assignment?",
    W094: "Unexpected comma.",
    W095: "Expected a string and instead saw {a}.",
    W096: "The '{a}' key may produce unexpected results.",
    W097: "Use the function form of \"use strict\".",
    W098: "'{a}' is defined but never used.",
    W099: null,
    W100: "This character may get silently deleted by one or more browsers.",
    W101: "Line is too long.",
    W102: null,
    W103: "The '{a}' property is deprecated.",
    W104: "'{a}' is available in ES{b} (use 'esversion: {b}') or Mozilla JS extensions (use moz).",
    W105: "Unexpected {a} in '{b}'.",
    W106: "Identifier '{a}' is not in camel case.",
    W107: "Script URL.",
    W108: "Strings must use doublequote.",
    W109: "Strings must use singlequote.",
    W110: "Mixed double and single quotes.",
    W112: "Unclosed string.",
    W113: "Control character in string: {a}.",
    W114: "Avoid {a}.",
    W115: "Octal literals are not allowed in strict mode.",
    W116: "Expected '{a}' and instead saw '{b}'.",
    W117: "'{a}' is not defined.",
    W118: "'{a}' is only available in Mozilla JavaScript extensions (use moz option).",
    W119: "'{a}' is only available in ES{b} (use 'esversion: {b}').",
    W120: "You might be leaking a variable ({a}) here.",
    W121: "Extending prototype of native object: '{a}'.",
    W122: "Invalid typeof value '{a}'",
    W123: "'{a}' is already defined in outer scope.",
    W124: "A generator function shall contain a yield statement.",
    W125: "This line contains non-breaking spaces: http://jshint.com/doc/options/#nonbsp",
    W126: "Unnecessary grouping operator.",
    W127: "Unexpected use of a comma operator.",
    W128: "Empty array elements require elision=true.",
    W129: "'{a}' is defined in a future version of JavaScript. Use a " +
        "different variable name to avoid migration issues.",
    W130: "Invalid element after rest element.",
    W131: "Invalid parameter after rest parameter.",
    W132: "`var` declarations are forbidden. Use `let` or `const` instead.",
    W133: "Invalid for-{a} loop left-hand-side: {b}.",
    W134: "The '{a}' option is only available when linting ECMAScript {b} code.",
    W135: "{a} may not be supported by non-browser environments.",
    W136: "'{a}' must be in function scope.",
    W137: "Empty destructuring.",
    W138: "Regular parameters should not come after default parameters."
};
var infoMap = {
    I001: "Comma warnings can be turned off with 'laxcomma'.",
    I002: null,
    I003: "ES5 option is now set per default"
};
export var errors = {};
export var warnings = {};
export var info = {};
each(errorsMap, function (desc, code) {
    errors[code] = { code: code, desc: desc };
});
each(warningsMap, function (desc, code) {
    warnings[code] = { code: code, desc: desc };
});
each(infoMap, function (desc, code) {
    info[code] = { code: code, desc: desc };
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVzc2FnZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbW9kZS9qYXZhc2NyaXB0L21lc3NhZ2VzLnRzIl0sIm5hbWVzIjpbImVhY2giXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLGNBQWMsSUFBZ0MsRUFBRSxRQUE4QztJQUMxRkEsSUFBSUEsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDN0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEdBQUdBLE9BQU9BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1FBQ3REQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3pCQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVELElBQUksU0FBUyxHQUErQjtJQUV4QyxJQUFJLEVBQUUsb0JBQW9CO0lBQzFCLElBQUksRUFBRSxtQkFBbUI7SUFHekIsSUFBSSxFQUFFLHdCQUF3QjtJQUM5QixJQUFJLEVBQUUsb0RBQW9EO0lBQzFELElBQUksRUFBRSxpQkFBaUI7SUFDdkIsSUFBSSxFQUFFLGtDQUFrQztJQUd4QyxJQUFJLEVBQUUsbUNBQW1DO0lBQ3pDLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLHFEQUFxRDtJQUMzRCxJQUFJLEVBQUUsdUNBQXVDO0lBRzdDLElBQUksRUFBRSxrQ0FBa0M7SUFDeEMsSUFBSSxFQUFFLDRDQUE0QztJQUNsRCxJQUFJLEVBQUUsbURBQW1EO0lBR3pELElBQUksRUFBRSx5REFBeUQ7SUFDL0QsSUFBSSxFQUFFLDhCQUE4QjtJQUNwQyxJQUFJLEVBQUUsNkJBQTZCO0lBR25DLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLGtCQUFrQjtJQUN4QixJQUFJLEVBQUUsa0JBQWtCO0lBQ3hCLElBQUksRUFBRSxvRUFBb0U7SUFDMUUsSUFBSSxFQUFFLHVDQUF1QztJQUM3QyxJQUFJLEVBQUUsNEJBQTRCO0lBQ2xDLElBQUksRUFBRSxnQkFBZ0I7SUFDdEIsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixJQUFJLEVBQUUsK0JBQStCO0lBQ3JDLElBQUksRUFBRSx5Q0FBeUM7SUFDL0MsSUFBSSxFQUFFLHlDQUF5QztJQUMvQyxJQUFJLEVBQUUsZ0JBQWdCO0lBQ3RCLElBQUksRUFBRSxrQkFBa0I7SUFHeEIsSUFBSSxFQUFFLCtDQUErQztJQUNyRCxJQUFJLEVBQUUsaUJBQWlCO0lBQ3ZCLElBQUksRUFBRSw0REFBNEQ7SUFDbEUsSUFBSSxFQUFFLDZDQUE2QztJQUNuRCxJQUFJLEVBQUUsMkJBQTJCO0lBQ2pDLElBQUksRUFBRSx3QkFBd0I7SUFDOUIsSUFBSSxFQUFFLHNEQUFzRDtJQUM1RCxJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLHdGQUF3RjtJQUM5RixJQUFJLEVBQUUsNENBQTRDO0lBQ2xELElBQUksRUFBRSw2QkFBNkI7SUFDbkMsSUFBSSxFQUFFLFdBQVc7SUFDakIsSUFBSSxFQUFFLGtCQUFrQjtJQUN4QixJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRSx3QkFBd0I7SUFDOUIsSUFBSSxFQUFFLG1GQUFtRjtJQUN6RixJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRSw0Q0FBNEM7SUFDbEQsSUFBSSxFQUFFLDhCQUE4QjtJQUNwQyxJQUFJLEVBQUUsaUVBQWlFO0lBQ3ZFLElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLDRCQUE0QjtJQUNsQyxJQUFJLEVBQUUsNkNBQTZDO0lBQ25ELElBQUksRUFBRSx1RUFBdUU7SUFDN0UsSUFBSSxFQUFFLDJEQUEyRDtJQUNqRSxJQUFJLEVBQUUsOEVBQThFO0lBQ3BGLElBQUksRUFBRSxtQ0FBbUM7SUFDekMsSUFBSSxFQUFFLG9CQUFvQjtJQUMxQixJQUFJLEVBQUUsOERBQThEO0NBQ3ZFLENBQUM7QUFFRixJQUFJLFdBQVcsR0FBK0I7SUFDMUMsSUFBSSxFQUFFLHdDQUF3QztJQUM5QyxJQUFJLEVBQUUsd0RBQXdEO0lBQzlELElBQUksRUFBRSx1Q0FBdUM7SUFDN0MsSUFBSSxFQUFFLDJCQUEyQjtJQUNqQyxJQUFJLEVBQUUsZ0VBQWdFO0lBQ3RFLElBQUksRUFBRSxvQkFBb0I7SUFDMUIsSUFBSSxFQUFFLG9CQUFvQjtJQUMxQixJQUFJLEVBQUUsNERBQTREO0lBQ2xFLElBQUksRUFBRSw4Q0FBOEM7SUFDcEQsSUFBSSxFQUFFLCtDQUErQztJQUNyRCxJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLElBQUk7SUFDVixJQUFJLEVBQUUsaUNBQWlDO0lBQ3ZDLElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLDBCQUEwQjtJQUNoQyxJQUFJLEVBQUUsY0FBYztJQUNwQixJQUFJLEVBQUUseUJBQXlCO0lBQy9CLElBQUksRUFBRSw2Q0FBNkM7SUFDbkQsSUFBSSxFQUFFLFlBQVk7SUFDbEIsSUFBSSxFQUFFLDRDQUE0QztRQUNsRCx5REFBeUQ7SUFDekQsSUFBSSxFQUFFLDJDQUEyQztJQUNqRCxJQUFJLEVBQUUsZ0ZBQWdGO0lBQ3RGLElBQUksRUFBRSxpRUFBaUU7SUFDdkUsSUFBSSxFQUFFLHVDQUF1QztJQUM3QyxJQUFJLEVBQUUsb0VBQW9FO0lBQzFFLElBQUksRUFBRSxnQ0FBZ0M7SUFDdEMsSUFBSSxFQUFFLCtCQUErQjtJQUNyQyxJQUFJLEVBQUUsd0VBQXdFO0lBQzlFLElBQUksRUFBRSxvQ0FBb0M7SUFDMUMsSUFBSSxFQUFFLHdCQUF3QjtJQUM5QixJQUFJLEVBQUUsb0JBQW9CO0lBQzFCLElBQUksRUFBRSxnQ0FBZ0M7SUFDdEMsSUFBSSxFQUFFLGNBQWM7SUFDcEIsSUFBSSxFQUFFLDRCQUE0QjtJQUNsQyxJQUFJLEVBQUUsNkJBQTZCO0lBQ25DLElBQUksRUFBRSwwQkFBMEI7SUFDaEMsSUFBSSxFQUFFLHVCQUF1QjtJQUM3QixJQUFJLEVBQUUsNEJBQTRCO0lBQ2xDLElBQUksRUFBRSxrQ0FBa0M7SUFDeEMsSUFBSSxFQUFFLHFCQUFxQjtJQUMzQixJQUFJLEVBQUUscURBQXFEO0lBQzNELElBQUksRUFBRSw4QkFBOEI7SUFDcEMsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixJQUFJLEVBQUUsc0NBQXNDO0lBQzVDLElBQUksRUFBRSw2REFBNkQ7SUFDbkUsSUFBSSxFQUFFLHFEQUFxRDtJQUMzRCxJQUFJLEVBQUUsMkRBQTJEO0lBQ2pFLElBQUksRUFBRSxpQkFBaUI7SUFDdkIsSUFBSSxFQUFFLGtDQUFrQztJQUN4QyxJQUFJLEVBQUUsbUJBQW1CO0lBQ3pCLElBQUksRUFBRSxrQ0FBa0M7SUFDeEMsSUFBSSxFQUFFLDZDQUE2QztJQUNuRCxJQUFJLEVBQUUsMkRBQTJEO0lBQ2pFLElBQUksRUFBRSxrQkFBa0I7SUFDeEIsSUFBSSxFQUFFLHlDQUF5QztJQUMvQyxJQUFJLEVBQUUsc0NBQXNDO0lBQzVDLElBQUksRUFBRSxzQkFBc0I7SUFDNUIsSUFBSSxFQUFFLHVDQUF1QztJQUM3QyxJQUFJLEVBQUUsc0JBQXNCO0lBQzVCLElBQUksRUFBRSxrREFBa0Q7UUFDeEQsNERBQTREO1FBQzVELDJEQUEyRDtJQUMzRCxJQUFJLEVBQUUseUJBQXlCO0lBQy9CLElBQUksRUFBRSxtREFBbUQ7SUFDekQsSUFBSSxFQUFFLDBCQUEwQjtJQUNoQyxJQUFJLEVBQUUsZ0VBQWdFO0lBQ3RFLElBQUksRUFBRSxpQkFBaUI7SUFDdkIsSUFBSSxFQUFFLCtEQUErRDtJQUNyRSxJQUFJLEVBQUUsNENBQTRDO0lBQ2xELElBQUksRUFBRSwrQ0FBK0M7SUFDckQsSUFBSSxFQUFFLDhDQUE4QztJQUNwRCxJQUFJLEVBQUUsOENBQThDO0lBQ3BELElBQUksRUFBRSxxQ0FBcUM7SUFDM0MsSUFBSSxFQUFFLDBEQUEwRDtJQUNoRSxJQUFJLEVBQUUsc0JBQXNCO0lBQzVCLElBQUksRUFBRSxpREFBaUQ7SUFDdkQsSUFBSSxFQUFFLGtEQUFrRDtJQUN4RCxJQUFJLEVBQUUsbUNBQW1DO0lBQ3pDLElBQUksRUFBRSx3QkFBd0I7SUFDOUIsSUFBSSxFQUFFLHdEQUF3RDtJQUM5RCxJQUFJLEVBQUUsSUFBSTtJQUNWLElBQUksRUFBRSx3REFBd0Q7UUFDOUQsZ0VBQWdFO1FBQ2hFLHFCQUFxQjtJQUNyQixJQUFJLEVBQUUscUNBQXFDO0lBQzNDLElBQUksRUFBRSxrRUFBa0U7SUFDeEUsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixJQUFJLEVBQUUsNENBQTRDO0lBQ2xELElBQUksRUFBRSxpQ0FBaUM7SUFDdkMsSUFBSSxFQUFFLCtEQUErRDtJQUNyRSxJQUFJLEVBQUUsc0VBQXNFO1FBQzVFLHlDQUF5QztJQUN6QyxJQUFJLEVBQUUsaUNBQWlDO0lBQ3ZDLElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLGdFQUFnRTtJQUN0RSxJQUFJLEVBQUUsbUJBQW1CO0lBQ3pCLElBQUksRUFBRSx3Q0FBd0M7SUFDOUMsSUFBSSxFQUFFLCtDQUErQztJQUNyRCxJQUFJLEVBQUUsMENBQTBDO0lBQ2hELElBQUksRUFBRSxrQ0FBa0M7SUFDeEMsSUFBSSxFQUFFLElBQUk7SUFDVixJQUFJLEVBQUUsa0VBQWtFO0lBQ3hFLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLElBQUk7SUFDVixJQUFJLEVBQUUsbUNBQW1DO0lBQ3pDLElBQUksRUFBRSx3RkFBd0Y7SUFDOUYsSUFBSSxFQUFFLDBCQUEwQjtJQUNoQyxJQUFJLEVBQUUsd0NBQXdDO0lBQzlDLElBQUksRUFBRSxhQUFhO0lBQ25CLElBQUksRUFBRSwrQkFBK0I7SUFDckMsSUFBSSxFQUFFLCtCQUErQjtJQUNyQyxJQUFJLEVBQUUsaUNBQWlDO0lBQ3ZDLElBQUksRUFBRSxrQkFBa0I7SUFDeEIsSUFBSSxFQUFFLG1DQUFtQztJQUN6QyxJQUFJLEVBQUUsWUFBWTtJQUNsQixJQUFJLEVBQUUsZ0RBQWdEO0lBQ3RELElBQUksRUFBRSx1Q0FBdUM7SUFDN0MsSUFBSSxFQUFFLHVCQUF1QjtJQUM3QixJQUFJLEVBQUUsNEVBQTRFO0lBQ2xGLElBQUksRUFBRSwwREFBMEQ7SUFDaEUsSUFBSSxFQUFFLDZDQUE2QztJQUNuRCxJQUFJLEVBQUUsOENBQThDO0lBQ3BELElBQUksRUFBRSw0QkFBNEI7SUFDbEMsSUFBSSxFQUFFLDBDQUEwQztJQUNoRCxJQUFJLEVBQUUsdURBQXVEO0lBQzdELElBQUksRUFBRSwrRUFBK0U7SUFDckYsSUFBSSxFQUFFLGdDQUFnQztJQUN0QyxJQUFJLEVBQUUscUNBQXFDO0lBQzNDLElBQUksRUFBRSw0Q0FBNEM7SUFDbEQsSUFBSSxFQUFFLDREQUE0RDtRQUNsRSxvREFBb0Q7SUFDcEQsSUFBSSxFQUFFLHFDQUFxQztJQUMzQyxJQUFJLEVBQUUseUNBQXlDO0lBQy9DLElBQUksRUFBRSxpRUFBaUU7SUFDdkUsSUFBSSxFQUFFLDJDQUEyQztJQUNqRCxJQUFJLEVBQUUsc0VBQXNFO0lBQzVFLElBQUksRUFBRSx1REFBdUQ7SUFDN0QsSUFBSSxFQUFFLGtDQUFrQztJQUN4QyxJQUFJLEVBQUUsc0JBQXNCO0lBQzVCLElBQUksRUFBRSw4REFBOEQ7Q0FDdkUsQ0FBQztBQUVGLElBQUksT0FBTyxHQUErQjtJQUN0QyxJQUFJLEVBQUUsbURBQW1EO0lBQ3pELElBQUksRUFBRSxJQUFJO0lBQ1YsSUFBSSxFQUFFLG1DQUFtQztDQUM1QyxDQUFDO0FBRUYsV0FBVyxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQ3ZCLFdBQVcsUUFBUSxHQUFHLEVBQUUsQ0FBQztBQUN6QixXQUFXLElBQUksR0FBRyxFQUFFLENBQUM7QUFFckIsSUFBSSxDQUFDLFNBQVMsRUFBRSxVQUFTLElBQVksRUFBRSxJQUFZO0lBQy9DLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO0FBQzlDLENBQUMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxDQUFDLFdBQVcsRUFBRSxVQUFTLElBQVksRUFBRSxJQUFZO0lBQ2pELFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO0FBQ2hELENBQUMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRSxVQUFTLElBQVksRUFBRSxJQUFZO0lBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO0FBQzVDLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbmZ1bmN0aW9uIGVhY2goZGF0YTogeyBbY29kZTogc3RyaW5nXTogc3RyaW5nIH0sIGNhbGxiYWNrOiAoZGVzYzogc3RyaW5nLCBjb2RlOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGRhdGEpO1xuICAgIGZvciAodmFyIGkgPSAwLCBpTGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBpTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNvZGUgPSBrZXlzW2ldO1xuICAgICAgICB2YXIgZGVzYyA9IGRhdGFbY29kZV07XG4gICAgICAgIGNhbGxiYWNrKGRlc2MsIGNvZGUpO1xuICAgIH1cbn1cblxudmFyIGVycm9yc01hcDogeyBbY29kZTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG4gICAgLy8gSlNIaW50IG9wdGlvbnNcbiAgICBFMDAxOiBcIkJhZCBvcHRpb246ICd7YX0nLlwiLFxuICAgIEUwMDI6IFwiQmFkIG9wdGlvbiB2YWx1ZS5cIixcblxuICAgIC8vIEpTSGludCBpbnB1dFxuICAgIEUwMDM6IFwiRXhwZWN0ZWQgYSBKU09OIHZhbHVlLlwiLFxuICAgIEUwMDQ6IFwiSW5wdXQgaXMgbmVpdGhlciBhIHN0cmluZyBub3IgYW4gYXJyYXkgb2Ygc3RyaW5ncy5cIixcbiAgICBFMDA1OiBcIklucHV0IGlzIGVtcHR5LlwiLFxuICAgIEUwMDY6IFwiVW5leHBlY3RlZCBlYXJseSBlbmQgb2YgcHJvZ3JhbS5cIixcblxuICAgIC8vIFN0cmljdCBtb2RlXG4gICAgRTAwNzogXCJNaXNzaW5nIFxcXCJ1c2Ugc3RyaWN0XFxcIiBzdGF0ZW1lbnQuXCIsXG4gICAgRTAwODogXCJTdHJpY3QgdmlvbGF0aW9uLlwiLFxuICAgIEUwMDk6IFwiT3B0aW9uICd2YWxpZHRoaXMnIGNhbid0IGJlIHVzZWQgaW4gYSBnbG9iYWwgc2NvcGUuXCIsXG4gICAgRTAxMDogXCInd2l0aCcgaXMgbm90IGFsbG93ZWQgaW4gc3RyaWN0IG1vZGUuXCIsXG5cbiAgICAvLyBDb25zdGFudHNcbiAgICBFMDExOiBcIid7YX0nIGhhcyBhbHJlYWR5IGJlZW4gZGVjbGFyZWQuXCIsXG4gICAgRTAxMjogXCJjb25zdCAne2F9JyBpcyBpbml0aWFsaXplZCB0byAndW5kZWZpbmVkJy5cIixcbiAgICBFMDEzOiBcIkF0dGVtcHRpbmcgdG8gb3ZlcnJpZGUgJ3thfScgd2hpY2ggaXMgYSBjb25zdGFudC5cIixcblxuICAgIC8vIFJlZ3VsYXIgZXhwcmVzc2lvbnNcbiAgICBFMDE0OiBcIkEgcmVndWxhciBleHByZXNzaW9uIGxpdGVyYWwgY2FuIGJlIGNvbmZ1c2VkIHdpdGggJy89Jy5cIixcbiAgICBFMDE1OiBcIlVuY2xvc2VkIHJlZ3VsYXIgZXhwcmVzc2lvbi5cIixcbiAgICBFMDE2OiBcIkludmFsaWQgcmVndWxhciBleHByZXNzaW9uLlwiLFxuXG4gICAgLy8gVG9rZW5zXG4gICAgRTAxNzogXCJVbmNsb3NlZCBjb21tZW50LlwiLFxuICAgIEUwMTg6IFwiVW5iZWd1biBjb21tZW50LlwiLFxuICAgIEUwMTk6IFwiVW5tYXRjaGVkICd7YX0nLlwiLFxuICAgIEUwMjA6IFwiRXhwZWN0ZWQgJ3thfScgdG8gbWF0Y2ggJ3tifScgZnJvbSBsaW5lIHtjfSBhbmQgaW5zdGVhZCBzYXcgJ3tkfScuXCIsXG4gICAgRTAyMTogXCJFeHBlY3RlZCAne2F9JyBhbmQgaW5zdGVhZCBzYXcgJ3tifScuXCIsXG4gICAgRTAyMjogXCJMaW5lIGJyZWFraW5nIGVycm9yICd7YX0nLlwiLFxuICAgIEUwMjM6IFwiTWlzc2luZyAne2F9Jy5cIixcbiAgICBFMDI0OiBcIlVuZXhwZWN0ZWQgJ3thfScuXCIsXG4gICAgRTAyNTogXCJNaXNzaW5nICc6JyBvbiBhIGNhc2UgY2xhdXNlLlwiLFxuICAgIEUwMjY6IFwiTWlzc2luZyAnfScgdG8gbWF0Y2ggJ3snIGZyb20gbGluZSB7YX0uXCIsXG4gICAgRTAyNzogXCJNaXNzaW5nICddJyB0byBtYXRjaCAnWycgZnJvbSBsaW5lIHthfS5cIixcbiAgICBFMDI4OiBcIklsbGVnYWwgY29tbWEuXCIsXG4gICAgRTAyOTogXCJVbmNsb3NlZCBzdHJpbmcuXCIsXG5cbiAgICAvLyBFdmVyeXRoaW5nIGVsc2VcbiAgICBFMDMwOiBcIkV4cGVjdGVkIGFuIGlkZW50aWZpZXIgYW5kIGluc3RlYWQgc2F3ICd7YX0nLlwiLFxuICAgIEUwMzE6IFwiQmFkIGFzc2lnbm1lbnQuXCIsIC8vIEZJWE1FOiBSZXBocmFzZVxuICAgIEUwMzI6IFwiRXhwZWN0ZWQgYSBzbWFsbCBpbnRlZ2VyIG9yICdmYWxzZScgYW5kIGluc3RlYWQgc2F3ICd7YX0nLlwiLFxuICAgIEUwMzM6IFwiRXhwZWN0ZWQgYW4gb3BlcmF0b3IgYW5kIGluc3RlYWQgc2F3ICd7YX0nLlwiLFxuICAgIEUwMzQ6IFwiZ2V0L3NldCBhcmUgRVM1IGZlYXR1cmVzLlwiLFxuICAgIEUwMzU6IFwiTWlzc2luZyBwcm9wZXJ0eSBuYW1lLlwiLFxuICAgIEUwMzY6IFwiRXhwZWN0ZWQgdG8gc2VlIGEgc3RhdGVtZW50IGFuZCBpbnN0ZWFkIHNhdyBhIGJsb2NrLlwiLFxuICAgIEUwMzc6IG51bGwsXG4gICAgRTAzODogbnVsbCxcbiAgICBFMDM5OiBcIkZ1bmN0aW9uIGRlY2xhcmF0aW9ucyBhcmUgbm90IGludm9jYWJsZS4gV3JhcCB0aGUgd2hvbGUgZnVuY3Rpb24gaW52b2NhdGlvbiBpbiBwYXJlbnMuXCIsXG4gICAgRTA0MDogXCJFYWNoIHZhbHVlIHNob3VsZCBoYXZlIGl0cyBvd24gY2FzZSBsYWJlbC5cIixcbiAgICBFMDQxOiBcIlVucmVjb3ZlcmFibGUgc3ludGF4IGVycm9yLlwiLFxuICAgIEUwNDI6IFwiU3RvcHBpbmcuXCIsXG4gICAgRTA0MzogXCJUb28gbWFueSBlcnJvcnMuXCIsXG4gICAgRTA0NDogbnVsbCxcbiAgICBFMDQ1OiBcIkludmFsaWQgZm9yIGVhY2ggbG9vcC5cIixcbiAgICBFMDQ2OiBcIkEgeWllbGQgc3RhdGVtZW50IHNoYWxsIGJlIHdpdGhpbiBhIGdlbmVyYXRvciBmdW5jdGlvbiAod2l0aCBzeW50YXg6IGBmdW5jdGlvbipgKVwiLFxuICAgIEUwNDc6IG51bGwsXG4gICAgRTA0ODogXCJ7YX0gZGVjbGFyYXRpb24gbm90IGRpcmVjdGx5IHdpdGhpbiBibG9jay5cIixcbiAgICBFMDQ5OiBcIkEge2F9IGNhbm5vdCBiZSBuYW1lZCAne2J9Jy5cIixcbiAgICBFMDUwOiBcIk1vemlsbGEgcmVxdWlyZXMgdGhlIHlpZWxkIGV4cHJlc3Npb24gdG8gYmUgcGFyZW50aGVzaXplZCBoZXJlLlwiLFxuICAgIEUwNTE6IG51bGwsXG4gICAgRTA1MjogXCJVbmNsb3NlZCB0ZW1wbGF0ZSBsaXRlcmFsLlwiLFxuICAgIEUwNTM6IFwiRXhwb3J0IGRlY2xhcmF0aW9uIG11c3QgYmUgaW4gZ2xvYmFsIHNjb3BlLlwiLFxuICAgIEUwNTQ6IFwiQ2xhc3MgcHJvcGVydGllcyBtdXN0IGJlIG1ldGhvZHMuIEV4cGVjdGVkICcoJyBidXQgaW5zdGVhZCBzYXcgJ3thfScuXCIsXG4gICAgRTA1NTogXCJUaGUgJ3thfScgb3B0aW9uIGNhbm5vdCBiZSBzZXQgYWZ0ZXIgYW55IGV4ZWN1dGFibGUgY29kZS5cIixcbiAgICBFMDU2OiBcIid7YX0nIHdhcyB1c2VkIGJlZm9yZSBpdCB3YXMgZGVjbGFyZWQsIHdoaWNoIGlzIGlsbGVnYWwgZm9yICd7Yn0nIHZhcmlhYmxlcy5cIixcbiAgICBFMDU3OiBcIkludmFsaWQgbWV0YSBwcm9wZXJ0eTogJ3thfS57Yn0nLlwiLFxuICAgIEUwNTg6IFwiTWlzc2luZyBzZW1pY29sb24uXCIsXG4gICAgRTA1OTogXCJJbmNvbXBhdGlibGUgdmFsdWVzIGZvciB0aGUgJ3thfScgYW5kICd7Yn0nIGxpbnRpbmcgb3B0aW9ucy5cIlxufTtcblxudmFyIHdhcm5pbmdzTWFwOiB7IFtjb2RlOiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcbiAgICBXMDAxOiBcIidoYXNPd25Qcm9wZXJ0eScgaXMgYSByZWFsbHkgYmFkIG5hbWUuXCIsXG4gICAgVzAwMjogXCJWYWx1ZSBvZiAne2F9JyBtYXkgYmUgb3ZlcndyaXR0ZW4gaW4gSUUgOCBhbmQgZWFybGllci5cIixcbiAgICBXMDAzOiBcIid7YX0nIHdhcyB1c2VkIGJlZm9yZSBpdCB3YXMgZGVmaW5lZC5cIixcbiAgICBXMDA0OiBcIid7YX0nIGlzIGFscmVhZHkgZGVmaW5lZC5cIixcbiAgICBXMDA1OiBcIkEgZG90IGZvbGxvd2luZyBhIG51bWJlciBjYW4gYmUgY29uZnVzZWQgd2l0aCBhIGRlY2ltYWwgcG9pbnQuXCIsXG4gICAgVzAwNjogXCJDb25mdXNpbmcgbWludXNlcy5cIixcbiAgICBXMDA3OiBcIkNvbmZ1c2luZyBwbHVzc2VzLlwiLFxuICAgIFcwMDg6IFwiQSBsZWFkaW5nIGRlY2ltYWwgcG9pbnQgY2FuIGJlIGNvbmZ1c2VkIHdpdGggYSBkb3Q6ICd7YX0nLlwiLFxuICAgIFcwMDk6IFwiVGhlIGFycmF5IGxpdGVyYWwgbm90YXRpb24gW10gaXMgcHJlZmVyYWJsZS5cIixcbiAgICBXMDEwOiBcIlRoZSBvYmplY3QgbGl0ZXJhbCBub3RhdGlvbiB7fSBpcyBwcmVmZXJhYmxlLlwiLFxuICAgIFcwMTE6IG51bGwsXG4gICAgVzAxMjogbnVsbCxcbiAgICBXMDEzOiBudWxsLFxuICAgIFcwMTQ6IFwiQmFkIGxpbmUgYnJlYWtpbmcgYmVmb3JlICd7YX0nLlwiLFxuICAgIFcwMTU6IG51bGwsXG4gICAgVzAxNjogXCJVbmV4cGVjdGVkIHVzZSBvZiAne2F9Jy5cIixcbiAgICBXMDE3OiBcIkJhZCBvcGVyYW5kLlwiLFxuICAgIFcwMTg6IFwiQ29uZnVzaW5nIHVzZSBvZiAne2F9Jy5cIixcbiAgICBXMDE5OiBcIlVzZSB0aGUgaXNOYU4gZnVuY3Rpb24gdG8gY29tcGFyZSB3aXRoIE5hTi5cIixcbiAgICBXMDIwOiBcIlJlYWQgb25seS5cIixcbiAgICBXMDIxOiBcIlJlYXNzaWdubWVudCBvZiAne2F9Jywgd2hpY2ggaXMgaXMgYSB7Yn0uIFwiICtcbiAgICBcIlVzZSAndmFyJyBvciAnbGV0JyB0byBkZWNsYXJlIGJpbmRpbmdzIHRoYXQgbWF5IGNoYW5nZS5cIixcbiAgICBXMDIyOiBcIkRvIG5vdCBhc3NpZ24gdG8gdGhlIGV4Y2VwdGlvbiBwYXJhbWV0ZXIuXCIsXG4gICAgVzAyMzogXCJFeHBlY3RlZCBhbiBpZGVudGlmaWVyIGluIGFuIGFzc2lnbm1lbnQgYW5kIGluc3RlYWQgc2F3IGEgZnVuY3Rpb24gaW52b2NhdGlvbi5cIixcbiAgICBXMDI0OiBcIkV4cGVjdGVkIGFuIGlkZW50aWZpZXIgYW5kIGluc3RlYWQgc2F3ICd7YX0nIChhIHJlc2VydmVkIHdvcmQpLlwiLFxuICAgIFcwMjU6IFwiTWlzc2luZyBuYW1lIGluIGZ1bmN0aW9uIGRlY2xhcmF0aW9uLlwiLFxuICAgIFcwMjY6IFwiSW5uZXIgZnVuY3Rpb25zIHNob3VsZCBiZSBsaXN0ZWQgYXQgdGhlIHRvcCBvZiB0aGUgb3V0ZXIgZnVuY3Rpb24uXCIsXG4gICAgVzAyNzogXCJVbnJlYWNoYWJsZSAne2F9JyBhZnRlciAne2J9Jy5cIixcbiAgICBXMDI4OiBcIkxhYmVsICd7YX0nIG9uIHtifSBzdGF0ZW1lbnQuXCIsXG4gICAgVzAzMDogXCJFeHBlY3RlZCBhbiBhc3NpZ25tZW50IG9yIGZ1bmN0aW9uIGNhbGwgYW5kIGluc3RlYWQgc2F3IGFuIGV4cHJlc3Npb24uXCIsXG4gICAgVzAzMTogXCJEbyBub3QgdXNlICduZXcnIGZvciBzaWRlIGVmZmVjdHMuXCIsXG4gICAgVzAzMjogXCJVbm5lY2Vzc2FyeSBzZW1pY29sb24uXCIsXG4gICAgVzAzMzogXCJNaXNzaW5nIHNlbWljb2xvbi5cIixcbiAgICBXMDM0OiBcIlVubmVjZXNzYXJ5IGRpcmVjdGl2ZSBcXFwie2F9XFxcIi5cIixcbiAgICBXMDM1OiBcIkVtcHR5IGJsb2NrLlwiLFxuICAgIFcwMzY6IFwiVW5leHBlY3RlZCAvKm1lbWJlciAne2F9Jy5cIixcbiAgICBXMDM3OiBcIid7YX0nIGlzIGEgc3RhdGVtZW50IGxhYmVsLlwiLFxuICAgIFcwMzg6IFwiJ3thfScgdXNlZCBvdXQgb2Ygc2NvcGUuXCIsXG4gICAgVzAzOTogXCIne2F9JyBpcyBub3QgYWxsb3dlZC5cIixcbiAgICBXMDQwOiBcIlBvc3NpYmxlIHN0cmljdCB2aW9sYXRpb24uXCIsXG4gICAgVzA0MTogXCJVc2UgJ3thfScgdG8gY29tcGFyZSB3aXRoICd7Yn0nLlwiLFxuICAgIFcwNDI6IFwiQXZvaWQgRU9MIGVzY2FwaW5nLlwiLFxuICAgIFcwNDM6IFwiQmFkIGVzY2FwaW5nIG9mIEVPTC4gVXNlIG9wdGlvbiBtdWx0aXN0ciBpZiBuZWVkZWQuXCIsXG4gICAgVzA0NDogXCJCYWQgb3IgdW5uZWNlc3NhcnkgZXNjYXBpbmcuXCIsIC8qIFRPRE8oY2FpdHApOiByZW1vdmUgVzA0NCAqL1xuICAgIFcwNDU6IFwiQmFkIG51bWJlciAne2F9Jy5cIixcbiAgICBXMDQ2OiBcIkRvbid0IHVzZSBleHRyYSBsZWFkaW5nIHplcm9zICd7YX0nLlwiLFxuICAgIFcwNDc6IFwiQSB0cmFpbGluZyBkZWNpbWFsIHBvaW50IGNhbiBiZSBjb25mdXNlZCB3aXRoIGEgZG90OiAne2F9Jy5cIixcbiAgICBXMDQ4OiBcIlVuZXhwZWN0ZWQgY29udHJvbCBjaGFyYWN0ZXIgaW4gcmVndWxhciBleHByZXNzaW9uLlwiLFxuICAgIFcwNDk6IFwiVW5leHBlY3RlZCBlc2NhcGVkIGNoYXJhY3RlciAne2F9JyBpbiByZWd1bGFyIGV4cHJlc3Npb24uXCIsXG4gICAgVzA1MDogXCJKYXZhU2NyaXB0IFVSTC5cIixcbiAgICBXMDUxOiBcIlZhcmlhYmxlcyBzaG91bGQgbm90IGJlIGRlbGV0ZWQuXCIsXG4gICAgVzA1MjogXCJVbmV4cGVjdGVkICd7YX0nLlwiLFxuICAgIFcwNTM6IFwiRG8gbm90IHVzZSB7YX0gYXMgYSBjb25zdHJ1Y3Rvci5cIixcbiAgICBXMDU0OiBcIlRoZSBGdW5jdGlvbiBjb25zdHJ1Y3RvciBpcyBhIGZvcm0gb2YgZXZhbC5cIixcbiAgICBXMDU1OiBcIkEgY29uc3RydWN0b3IgbmFtZSBzaG91bGQgc3RhcnQgd2l0aCBhbiB1cHBlcmNhc2UgbGV0dGVyLlwiLFxuICAgIFcwNTY6IFwiQmFkIGNvbnN0cnVjdG9yLlwiLFxuICAgIFcwNTc6IFwiV2VpcmQgY29uc3RydWN0aW9uLiBJcyAnbmV3JyBuZWNlc3Nhcnk/XCIsXG4gICAgVzA1ODogXCJNaXNzaW5nICcoKScgaW52b2tpbmcgYSBjb25zdHJ1Y3Rvci5cIixcbiAgICBXMDU5OiBcIkF2b2lkIGFyZ3VtZW50cy57YX0uXCIsXG4gICAgVzA2MDogXCJkb2N1bWVudC53cml0ZSBjYW4gYmUgYSBmb3JtIG9mIGV2YWwuXCIsXG4gICAgVzA2MTogXCJldmFsIGNhbiBiZSBoYXJtZnVsLlwiLFxuICAgIFcwNjI6IFwiV3JhcCBhbiBpbW1lZGlhdGUgZnVuY3Rpb24gaW52b2NhdGlvbiBpbiBwYXJlbnMgXCIgK1xuICAgIFwidG8gYXNzaXN0IHRoZSByZWFkZXIgaW4gdW5kZXJzdGFuZGluZyB0aGF0IHRoZSBleHByZXNzaW9uIFwiICtcbiAgICBcImlzIHRoZSByZXN1bHQgb2YgYSBmdW5jdGlvbiwgYW5kIG5vdCB0aGUgZnVuY3Rpb24gaXRzZWxmLlwiLFxuICAgIFcwNjM6IFwiTWF0aCBpcyBub3QgYSBmdW5jdGlvbi5cIixcbiAgICBXMDY0OiBcIk1pc3NpbmcgJ25ldycgcHJlZml4IHdoZW4gaW52b2tpbmcgYSBjb25zdHJ1Y3Rvci5cIixcbiAgICBXMDY1OiBcIk1pc3NpbmcgcmFkaXggcGFyYW1ldGVyLlwiLFxuICAgIFcwNjY6IFwiSW1wbGllZCBldmFsLiBDb25zaWRlciBwYXNzaW5nIGEgZnVuY3Rpb24gaW5zdGVhZCBvZiBhIHN0cmluZy5cIixcbiAgICBXMDY3OiBcIkJhZCBpbnZvY2F0aW9uLlwiLFxuICAgIFcwNjg6IFwiV3JhcHBpbmcgbm9uLUlJRkUgZnVuY3Rpb24gbGl0ZXJhbHMgaW4gcGFyZW5zIGlzIHVubmVjZXNzYXJ5LlwiLFxuICAgIFcwNjk6IFwiWyd7YX0nXSBpcyBiZXR0ZXIgd3JpdHRlbiBpbiBkb3Qgbm90YXRpb24uXCIsXG4gICAgVzA3MDogXCJFeHRyYSBjb21tYS4gKGl0IGJyZWFrcyBvbGRlciB2ZXJzaW9ucyBvZiBJRSlcIixcbiAgICBXMDcxOiBcIlRoaXMgZnVuY3Rpb24gaGFzIHRvbyBtYW55IHN0YXRlbWVudHMuICh7YX0pXCIsXG4gICAgVzA3MjogXCJUaGlzIGZ1bmN0aW9uIGhhcyB0b28gbWFueSBwYXJhbWV0ZXJzLiAoe2F9KVwiLFxuICAgIFcwNzM6IFwiQmxvY2tzIGFyZSBuZXN0ZWQgdG9vIGRlZXBseS4gKHthfSlcIixcbiAgICBXMDc0OiBcIlRoaXMgZnVuY3Rpb24ncyBjeWNsb21hdGljIGNvbXBsZXhpdHkgaXMgdG9vIGhpZ2guICh7YX0pXCIsXG4gICAgVzA3NTogXCJEdXBsaWNhdGUge2F9ICd7Yn0nLlwiLFxuICAgIFcwNzY6IFwiVW5leHBlY3RlZCBwYXJhbWV0ZXIgJ3thfScgaW4gZ2V0IHtifSBmdW5jdGlvbi5cIixcbiAgICBXMDc3OiBcIkV4cGVjdGVkIGEgc2luZ2xlIHBhcmFtZXRlciBpbiBzZXQge2F9IGZ1bmN0aW9uLlwiLFxuICAgIFcwNzg6IFwiU2V0dGVyIGlzIGRlZmluZWQgd2l0aG91dCBnZXR0ZXIuXCIsXG4gICAgVzA3OTogXCJSZWRlZmluaXRpb24gb2YgJ3thfScuXCIsXG4gICAgVzA4MDogXCJJdCdzIG5vdCBuZWNlc3NhcnkgdG8gaW5pdGlhbGl6ZSAne2F9JyB0byAndW5kZWZpbmVkJy5cIixcbiAgICBXMDgxOiBudWxsLFxuICAgIFcwODI6IFwiRnVuY3Rpb24gZGVjbGFyYXRpb25zIHNob3VsZCBub3QgYmUgcGxhY2VkIGluIGJsb2Nrcy4gXCIgK1xuICAgIFwiVXNlIGEgZnVuY3Rpb24gZXhwcmVzc2lvbiBvciBtb3ZlIHRoZSBzdGF0ZW1lbnQgdG8gdGhlIHRvcCBvZiBcIiArXG4gICAgXCJ0aGUgb3V0ZXIgZnVuY3Rpb24uXCIsXG4gICAgVzA4MzogXCJEb24ndCBtYWtlIGZ1bmN0aW9ucyB3aXRoaW4gYSBsb29wLlwiLFxuICAgIFcwODQ6IFwiRXhwZWN0ZWQgYSBjb25kaXRpb25hbCBleHByZXNzaW9uIGFuZCBpbnN0ZWFkIHNhdyBhbiBhc3NpZ25tZW50LlwiLFxuICAgIFcwODU6IFwiRG9uJ3QgdXNlICd3aXRoJy5cIixcbiAgICBXMDg2OiBcIkV4cGVjdGVkIGEgJ2JyZWFrJyBzdGF0ZW1lbnQgYmVmb3JlICd7YX0nLlwiLFxuICAgIFcwODc6IFwiRm9yZ290dGVuICdkZWJ1Z2dlcicgc3RhdGVtZW50P1wiLFxuICAgIFcwODg6IFwiQ3JlYXRpbmcgZ2xvYmFsICdmb3InIHZhcmlhYmxlLiBTaG91bGQgYmUgJ2ZvciAodmFyIHthfSAuLi4nLlwiLFxuICAgIFcwODk6IFwiVGhlIGJvZHkgb2YgYSBmb3IgaW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gYW4gaWYgc3RhdGVtZW50IHRvIGZpbHRlciBcIiArXG4gICAgXCJ1bndhbnRlZCBwcm9wZXJ0aWVzIGZyb20gdGhlIHByb3RvdHlwZS5cIixcbiAgICBXMDkwOiBcIid7YX0nIGlzIG5vdCBhIHN0YXRlbWVudCBsYWJlbC5cIixcbiAgICBXMDkxOiBudWxsLFxuICAgIFcwOTM6IFwiRGlkIHlvdSBtZWFuIHRvIHJldHVybiBhIGNvbmRpdGlvbmFsIGluc3RlYWQgb2YgYW4gYXNzaWdubWVudD9cIixcbiAgICBXMDk0OiBcIlVuZXhwZWN0ZWQgY29tbWEuXCIsXG4gICAgVzA5NTogXCJFeHBlY3RlZCBhIHN0cmluZyBhbmQgaW5zdGVhZCBzYXcge2F9LlwiLFxuICAgIFcwOTY6IFwiVGhlICd7YX0nIGtleSBtYXkgcHJvZHVjZSB1bmV4cGVjdGVkIHJlc3VsdHMuXCIsXG4gICAgVzA5NzogXCJVc2UgdGhlIGZ1bmN0aW9uIGZvcm0gb2YgXFxcInVzZSBzdHJpY3RcXFwiLlwiLFxuICAgIFcwOTg6IFwiJ3thfScgaXMgZGVmaW5lZCBidXQgbmV2ZXIgdXNlZC5cIixcbiAgICBXMDk5OiBudWxsLFxuICAgIFcxMDA6IFwiVGhpcyBjaGFyYWN0ZXIgbWF5IGdldCBzaWxlbnRseSBkZWxldGVkIGJ5IG9uZSBvciBtb3JlIGJyb3dzZXJzLlwiLFxuICAgIFcxMDE6IFwiTGluZSBpcyB0b28gbG9uZy5cIixcbiAgICBXMTAyOiBudWxsLFxuICAgIFcxMDM6IFwiVGhlICd7YX0nIHByb3BlcnR5IGlzIGRlcHJlY2F0ZWQuXCIsXG4gICAgVzEwNDogXCIne2F9JyBpcyBhdmFpbGFibGUgaW4gRVN7Yn0gKHVzZSAnZXN2ZXJzaW9uOiB7Yn0nKSBvciBNb3ppbGxhIEpTIGV4dGVuc2lvbnMgKHVzZSBtb3opLlwiLFxuICAgIFcxMDU6IFwiVW5leHBlY3RlZCB7YX0gaW4gJ3tifScuXCIsXG4gICAgVzEwNjogXCJJZGVudGlmaWVyICd7YX0nIGlzIG5vdCBpbiBjYW1lbCBjYXNlLlwiLFxuICAgIFcxMDc6IFwiU2NyaXB0IFVSTC5cIixcbiAgICBXMTA4OiBcIlN0cmluZ3MgbXVzdCB1c2UgZG91YmxlcXVvdGUuXCIsXG4gICAgVzEwOTogXCJTdHJpbmdzIG11c3QgdXNlIHNpbmdsZXF1b3RlLlwiLFxuICAgIFcxMTA6IFwiTWl4ZWQgZG91YmxlIGFuZCBzaW5nbGUgcXVvdGVzLlwiLFxuICAgIFcxMTI6IFwiVW5jbG9zZWQgc3RyaW5nLlwiLFxuICAgIFcxMTM6IFwiQ29udHJvbCBjaGFyYWN0ZXIgaW4gc3RyaW5nOiB7YX0uXCIsXG4gICAgVzExNDogXCJBdm9pZCB7YX0uXCIsXG4gICAgVzExNTogXCJPY3RhbCBsaXRlcmFscyBhcmUgbm90IGFsbG93ZWQgaW4gc3RyaWN0IG1vZGUuXCIsXG4gICAgVzExNjogXCJFeHBlY3RlZCAne2F9JyBhbmQgaW5zdGVhZCBzYXcgJ3tifScuXCIsXG4gICAgVzExNzogXCIne2F9JyBpcyBub3QgZGVmaW5lZC5cIixcbiAgICBXMTE4OiBcIid7YX0nIGlzIG9ubHkgYXZhaWxhYmxlIGluIE1vemlsbGEgSmF2YVNjcmlwdCBleHRlbnNpb25zICh1c2UgbW96IG9wdGlvbikuXCIsXG4gICAgVzExOTogXCIne2F9JyBpcyBvbmx5IGF2YWlsYWJsZSBpbiBFU3tifSAodXNlICdlc3ZlcnNpb246IHtifScpLlwiLFxuICAgIFcxMjA6IFwiWW91IG1pZ2h0IGJlIGxlYWtpbmcgYSB2YXJpYWJsZSAoe2F9KSBoZXJlLlwiLFxuICAgIFcxMjE6IFwiRXh0ZW5kaW5nIHByb3RvdHlwZSBvZiBuYXRpdmUgb2JqZWN0OiAne2F9Jy5cIixcbiAgICBXMTIyOiBcIkludmFsaWQgdHlwZW9mIHZhbHVlICd7YX0nXCIsXG4gICAgVzEyMzogXCIne2F9JyBpcyBhbHJlYWR5IGRlZmluZWQgaW4gb3V0ZXIgc2NvcGUuXCIsXG4gICAgVzEyNDogXCJBIGdlbmVyYXRvciBmdW5jdGlvbiBzaGFsbCBjb250YWluIGEgeWllbGQgc3RhdGVtZW50LlwiLFxuICAgIFcxMjU6IFwiVGhpcyBsaW5lIGNvbnRhaW5zIG5vbi1icmVha2luZyBzcGFjZXM6IGh0dHA6Ly9qc2hpbnQuY29tL2RvYy9vcHRpb25zLyNub25ic3BcIixcbiAgICBXMTI2OiBcIlVubmVjZXNzYXJ5IGdyb3VwaW5nIG9wZXJhdG9yLlwiLFxuICAgIFcxMjc6IFwiVW5leHBlY3RlZCB1c2Ugb2YgYSBjb21tYSBvcGVyYXRvci5cIixcbiAgICBXMTI4OiBcIkVtcHR5IGFycmF5IGVsZW1lbnRzIHJlcXVpcmUgZWxpc2lvbj10cnVlLlwiLFxuICAgIFcxMjk6IFwiJ3thfScgaXMgZGVmaW5lZCBpbiBhIGZ1dHVyZSB2ZXJzaW9uIG9mIEphdmFTY3JpcHQuIFVzZSBhIFwiICtcbiAgICBcImRpZmZlcmVudCB2YXJpYWJsZSBuYW1lIHRvIGF2b2lkIG1pZ3JhdGlvbiBpc3N1ZXMuXCIsXG4gICAgVzEzMDogXCJJbnZhbGlkIGVsZW1lbnQgYWZ0ZXIgcmVzdCBlbGVtZW50LlwiLFxuICAgIFcxMzE6IFwiSW52YWxpZCBwYXJhbWV0ZXIgYWZ0ZXIgcmVzdCBwYXJhbWV0ZXIuXCIsXG4gICAgVzEzMjogXCJgdmFyYCBkZWNsYXJhdGlvbnMgYXJlIGZvcmJpZGRlbi4gVXNlIGBsZXRgIG9yIGBjb25zdGAgaW5zdGVhZC5cIixcbiAgICBXMTMzOiBcIkludmFsaWQgZm9yLXthfSBsb29wIGxlZnQtaGFuZC1zaWRlOiB7Yn0uXCIsXG4gICAgVzEzNDogXCJUaGUgJ3thfScgb3B0aW9uIGlzIG9ubHkgYXZhaWxhYmxlIHdoZW4gbGludGluZyBFQ01BU2NyaXB0IHtifSBjb2RlLlwiLFxuICAgIFcxMzU6IFwie2F9IG1heSBub3QgYmUgc3VwcG9ydGVkIGJ5IG5vbi1icm93c2VyIGVudmlyb25tZW50cy5cIixcbiAgICBXMTM2OiBcIid7YX0nIG11c3QgYmUgaW4gZnVuY3Rpb24gc2NvcGUuXCIsXG4gICAgVzEzNzogXCJFbXB0eSBkZXN0cnVjdHVyaW5nLlwiLFxuICAgIFcxMzg6IFwiUmVndWxhciBwYXJhbWV0ZXJzIHNob3VsZCBub3QgY29tZSBhZnRlciBkZWZhdWx0IHBhcmFtZXRlcnMuXCJcbn07XG5cbnZhciBpbmZvTWFwOiB7IFtjb2RlOiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcbiAgICBJMDAxOiBcIkNvbW1hIHdhcm5pbmdzIGNhbiBiZSB0dXJuZWQgb2ZmIHdpdGggJ2xheGNvbW1hJy5cIixcbiAgICBJMDAyOiBudWxsLFxuICAgIEkwMDM6IFwiRVM1IG9wdGlvbiBpcyBub3cgc2V0IHBlciBkZWZhdWx0XCJcbn07XG5cbmV4cG9ydCB2YXIgZXJyb3JzID0ge307XG5leHBvcnQgdmFyIHdhcm5pbmdzID0ge307XG5leHBvcnQgdmFyIGluZm8gPSB7fTtcblxuZWFjaChlcnJvcnNNYXAsIGZ1bmN0aW9uKGRlc2M6IHN0cmluZywgY29kZTogc3RyaW5nKSB7XG4gICAgZXJyb3JzW2NvZGVdID0geyBjb2RlOiBjb2RlLCBkZXNjOiBkZXNjIH07XG59KTtcblxuZWFjaCh3YXJuaW5nc01hcCwgZnVuY3Rpb24oZGVzYzogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIHtcbiAgICB3YXJuaW5nc1tjb2RlXSA9IHsgY29kZTogY29kZSwgZGVzYzogZGVzYyB9O1xufSk7XG5cbmVhY2goaW5mb01hcCwgZnVuY3Rpb24oZGVzYzogc3RyaW5nLCBjb2RlOiBzdHJpbmcpIHtcbiAgICBpbmZvW2NvZGVdID0geyBjb2RlOiBjb2RlLCBkZXNjOiBkZXNjIH07XG59KTtcbiJdfQ==