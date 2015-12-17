"use strict";
export default class NameStack {
    constructor() {
        this.pop = function () {
            this._stack.pop();
        };
        this._stack = [];
    }
    get length() {
        return this._stack.length;
    }
    push() {
        this._stack.push(null);
    }
    set(token) {
        this._stack[this.length - 1] = token;
    }
    infer() {
        var nameToken = this._stack[this.length - 1];
        var prefix = "";
        var type;
        if (!nameToken || nameToken.type === "class") {
            nameToken = this._stack[this.length - 2];
        }
        if (!nameToken) {
            return "(empty)";
        }
        type = nameToken.type;
        if (type !== "(string)" && type !== "(number)" && type !== "(identifier)" && type !== "default") {
            return "(expression)";
        }
        if (nameToken.accessorType) {
            prefix = nameToken.accessorType + " ";
        }
        return prefix + nameToken.value;
    }
}
