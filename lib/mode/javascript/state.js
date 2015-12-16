"use strict";
import NameStack from "./name-stack";
export var state = {
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
    nameStack: new NameStack(),
    tokens: { prev: null, next: null, curr: null },
    inClassBody: false,
    ignoredLines: {},
    isStrict: function () {
        return this.directive["use strict"] || this.inClassBody ||
            this.option.module || this.option.strict === "implied";
    },
    inMoz: function () {
        return this.option.moz;
    },
    inES6: function (strict) {
        if (strict) {
            return this.option.esversion === 6;
        }
        return this.option.moz || this.option.esversion >= 6;
    },
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
        this.cache = {};
        this.ignoredLines = {};
        this.forinifcheckneeded = false;
        this.nameStack = new NameStack();
        this.inClassBody = false;
    }
};
