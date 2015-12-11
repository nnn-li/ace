define(["require", "exports", "./name-stack"], function (require, exports, name_stack_1) {
    "use strict";
    exports.state = {
        option: {},
        cache: {},
        condition: void 0,
        directive: {},
        forinifcheckneeded: false,
        forinifchecks: void 0,
        funct: null,
        ignored: {},
        tab: "",
        lines: [],
        syntax: {},
        jsonMode: false,
        nameStack: new name_stack_1.default(),
        tokens: { prev: null, next: null, curr: null },
        inClassBody: false,
        ignoredLines: {},
        /**
         * Determine if the code currently being linted is strict mode code.
         */
        isStrict: function () {
            return this.directive["use strict"] || this.inClassBody ||
                this.option.module || this.option.strict === "implied";
        },
        // Assumption: chronologically ES3 < ES5 < ES6 < Moz
        inMoz: function () {
            return this.option.moz;
        },
        /**
         * @param {boolean} strict - When `true`, only consider ES6 when in
         *                           "esversion: 6" code.
         */
        inES6: function (strict) {
            if (strict) {
                return this.option.esversion === 6;
            }
            return this.option.moz || this.option.esversion >= 6;
        },
        /**
         * @param {boolean} strict - When `true`, return `true` only when
         *                           esversion is exactly 5
         */
        inES5: function (strict) {
            if (strict) {
                return (!this.option.esversion || this.option.esversion === 5) && !this.option.moz;
            }
            return !this.option.esversion || this.option.esversion >= 5 || this.option.moz;
        },
        reset: function () {
            this.tokens = {
                prev: null,
                next: null,
                curr: null
            };
            this.option = {};
            this.funct = null;
            this.ignored = {};
            this.directive = {};
            this.jsonMode = false;
            this.jsonWarnings = [];
            this.lines = [];
            this.tab = "";
            this.cache = {}; // Node.JS doesn't have Map. Sniff.
            this.ignoredLines = {};
            this.forinifcheckneeded = false;
            this.nameStack = new name_stack_1.default();
            this.inClassBody = false;
        }
    };
});
