"use strict";
import JavaScriptHighlightRules from "./JavaScriptHighlightRules";
export default class TypeScriptHighlightRiles extends JavaScriptHighlightRules {
    constructor(options) {
        super(options);
        var tsRules = [
            {
                token: ["keyword.operator.ts", "text", "variable.parameter.function.ts", "text"],
                regex: "\\b(module)(\\s*)([a-zA-Z0-9_?.$][\\w?.$]*)(\\s*\\{)"
            },
            {
                token: ["storage.type.variable.ts", "text", "keyword.other.ts", "text"],
                regex: "(super)(\\s*\\()([a-zA-Z0-9,_?.$\\s]+\\s*)(\\))"
            },
            {
                token: ["entity.name.function.ts", "paren.lparen", "paren.rparen"],
                regex: "([a-zA-Z_?.$][\\w?.$]*)(\\()(\\))"
            },
            {
                token: ["variable.parameter.function.ts", "text", "variable.parameter.function.ts"],
                regex: "([a-zA-Z0-9_?.$][\\w?.$]*)(\\s*:\\s*)([a-zA-Z0-9_?.$][\\w?.$]*)"
            },
            {
                token: ["keyword.operator.ts"],
                regex: "(?:\\b(constructor|declare|interface|as|AS|public|private|class|extends|export|super)\\b)"
            },
            {
                token: ["storage.type.variable.ts"],
                regex: "(?:\\b(this\\.|string\\b|bool\\b|number)\\b)"
            },
            {
                token: ["keyword.operator.ts", "storage.type.variable.ts", "keyword.operator.ts", "storage.type.variable.ts"],
                regex: "(class)(\\s+[a-zA-Z0-9_?.$][\\w?.$]*\\s+)(extends)(\\s+[a-zA-Z0-9_?.$][\\w?.$]*\\s+)?"
            },
            {
                token: "keyword",
                regex: "(?:super|export|class|extends|import)\\b"
            }
        ];
        var JSRules = new JavaScriptHighlightRules().getRules();
        JSRules.start = tsRules.concat(JSRules.start);
        this.$rules = JSRules;
    }
}
