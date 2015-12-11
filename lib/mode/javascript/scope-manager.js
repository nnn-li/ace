"use strict";
import EventEmitter from './EventEmitter';
var marker = {};
function has(obj, name) {
    return obj.hasOwnProperty(name);
}
function slice(array, start = 0, end = array.length) {
    return array.slice(start, end);
}
function findLastIndex(xs, callback) {
    for (var i = xs.length - 1; i >= 0; i--) {
        var x = xs[i];
        if (callback(x)) {
            return i;
        }
    }
    return -1;
}
export var scopeManager = function (state, predefined, exported, declared) {
    var _current;
    var _scopeStack = [];
    function _newScope(type) {
        _current = {
            "(labels)": Object.create(null),
            "(usages)": Object.create(null),
            "(breakLabels)": Object.create(null),
            "(parent)": _current,
            "(type)": type,
            "(params)": (type === "functionparams" || type === "catchparams") ? [] : null
        };
        _scopeStack.push(_current);
    }
    _newScope("global");
    _current["(predefined)"] = predefined;
    var _currentFunctBody = _current;
    var usedPredefinedAndGlobals = Object.create(null);
    var impliedGlobals = Object.create(null);
    var unuseds = [];
    var emitter = new EventEmitter();
    function warning(code, token, unused1, unused2) {
        emitter.emit("warning", {
            code: code,
            token: token,
            data: slice(arguments, 2)
        });
    }
    function error(code, token, unused) {
        emitter.emit("warning", {
            code: code,
            token: token,
            data: slice(arguments, 2)
        });
    }
    function _setupUsages(labelName) {
        if (!_current["(usages)"][labelName]) {
            _current["(usages)"][labelName] = {
                "(modified)": [],
                "(reassigned)": [],
                "(tokens)": []
            };
        }
    }
    var _getUnusedOption = function (unused_opt) {
        if (unused_opt === undefined) {
            unused_opt = state.option.unused;
        }
        if (unused_opt === true) {
            unused_opt = "last-param";
        }
        return unused_opt;
    };
    var _warnUnused = function (name, tkn, type, unused_opt) {
        var line = tkn.line;
        var chr = tkn.from;
        var raw_name = tkn.raw_text || name;
        unused_opt = _getUnusedOption(unused_opt);
        var warnable_types = {
            "vars": ["var"],
            "last-param": ["var", "param"],
            "strict": ["var", "param", "last-param"]
        };
        if (unused_opt) {
            if (warnable_types[unused_opt] && warnable_types[unused_opt].indexOf(type) !== -1) {
                warning("W098", { line: line, from: chr }, raw_name);
            }
        }
        if (unused_opt || type === "var") {
            unuseds.push({
                name: name,
                line: line,
                character: chr
            });
        }
    };
    function _checkForUnused() {
        if (_current["(type)"] === "functionparams") {
            _checkParams();
            return;
        }
        var curentLabels = _current["(labels)"];
        for (var labelName in curentLabels) {
            if (curentLabels[labelName]) {
                if (curentLabels[labelName]["(type)"] !== "exception" &&
                    curentLabels[labelName]["(unused)"]) {
                    _warnUnused(labelName, curentLabels[labelName]["(token)"], "var");
                }
            }
        }
    }
    function _checkParams() {
        var params = _current["(params)"];
        if (!params) {
            return;
        }
        var param = params.pop();
        var unused_opt;
        while (param) {
            var label = _current["(labels)"][param];
            unused_opt = _getUnusedOption(state.funct["(unusedOption)"]);
            if (param === "undefined")
                return;
            if (label["(unused)"]) {
                _warnUnused(param, label["(token)"], "param", state.funct["(unusedOption)"]);
            }
            else if (unused_opt === "last-param") {
                return;
            }
            param = params.pop();
        }
    }
    function _getLabel(labelName) {
        for (var i = _scopeStack.length - 1; i >= 0; --i) {
            var scopeLabels = _scopeStack[i]["(labels)"];
            if (scopeLabels[labelName]) {
                return scopeLabels;
            }
        }
    }
    function usedSoFarInCurrentFunction(labelName) {
        for (var i = _scopeStack.length - 1; i >= 0; i--) {
            var current = _scopeStack[i];
            if (current["(usages)"][labelName]) {
                return current["(usages)"][labelName];
            }
            if (current === _currentFunctBody) {
                break;
            }
        }
        return false;
    }
    function _checkOuterShadow(labelName, token, unused) {
        if (state.option.shadow !== "outer") {
            return;
        }
        var isGlobal = _currentFunctBody["(type)"] === "global", isNewFunction = _current["(type)"] === "functionparams";
        var outsideCurrentFunction = !isGlobal;
        for (var i = 0; i < _scopeStack.length; i++) {
            var stackItem = _scopeStack[i];
            if (!isNewFunction && _scopeStack[i + 1] === _currentFunctBody) {
                outsideCurrentFunction = false;
            }
            if (outsideCurrentFunction && stackItem["(labels)"][labelName]) {
                warning("W123", token, labelName);
            }
            if (stackItem["(breakLabels)"][labelName]) {
                warning("W123", token, labelName);
            }
        }
    }
    function _latedefWarning(type, labelName, token) {
        if (state.option.latedef) {
            if ((state.option.latedef === true && type === "function") ||
                type !== "function") {
                warning("W003", token, labelName);
            }
        }
    }
    var scopeManagerInst = {
        on: function (names, listener) {
            names.split(" ").forEach(function (name) {
                emitter.on(name, listener);
            });
        },
        isPredefined: function (labelName) {
            return !this.has(labelName) && has(_scopeStack[0]["(predefined)"], labelName);
        },
        stack: function (type) {
            var previousScope = _current;
            _newScope(type);
            if (!type && previousScope["(type)"] === "functionparams") {
                _current["(isFuncBody)"] = true;
                _current["(context)"] = _currentFunctBody;
                _currentFunctBody = _current;
            }
        },
        unstack: function () {
            var subScope = _scopeStack.length > 1 ? _scopeStack[_scopeStack.length - 2] : null;
            var isUnstackingFunctionBody = _current === _currentFunctBody, isUnstackingFunctionParams = _current["(type)"] === "functionparams", isUnstackingFunctionOuter = _current["(type)"] === "functionouter";
            var i, j;
            var currentUsages = _current["(usages)"];
            var currentLabels = _current["(labels)"];
            var usedLabelNameList = Object.keys(currentUsages);
            if (currentUsages.__proto__ && usedLabelNameList.indexOf("__proto__") === -1) {
                usedLabelNameList.push("__proto__");
            }
            for (i = 0; i < usedLabelNameList.length; i++) {
                var usedLabelName = usedLabelNameList[i];
                var usage = currentUsages[usedLabelName];
                var usedLabel = currentLabels[usedLabelName];
                if (usedLabel) {
                    var usedLabelType = usedLabel["(type)"];
                    if (usedLabel["(useOutsideOfScope)"] && !state.option.funcscope) {
                        var usedTokens = usage["(tokens)"];
                        if (usedTokens) {
                            for (j = 0; j < usedTokens.length; j++) {
                                if (usedLabel["(function)"] === usedTokens[j]["(function)"]) {
                                    error("W038", usedTokens[j], usedLabelName);
                                }
                            }
                        }
                    }
                    _current["(labels)"][usedLabelName]["(unused)"] = false;
                    if (usedLabelType === "const" && usage["(modified)"]) {
                        for (j = 0; j < usage["(modified)"].length; j++) {
                            error("E013", usage["(modified)"][j], usedLabelName);
                        }
                    }
                    if ((usedLabelType === "function" || usedLabelType === "class") &&
                        usage["(reassigned)"]) {
                        for (j = 0; j < usage["(reassigned)"].length; j++) {
                            if (!usage["(reassigned)"][j].ignoreW021) {
                                warning("W021", usage["(reassigned)"][j], usedLabelName, usedLabelType);
                            }
                        }
                    }
                    continue;
                }
                if (isUnstackingFunctionOuter) {
                    state.funct["(isCapturing)"] = true;
                }
                if (subScope) {
                    if (!subScope["(usages)"][usedLabelName]) {
                        subScope["(usages)"][usedLabelName] = usage;
                        if (isUnstackingFunctionBody) {
                            subScope["(usages)"][usedLabelName]["(onlyUsedSubFunction)"] = true;
                        }
                    }
                    else {
                        var subScopeUsage = subScope["(usages)"][usedLabelName];
                        subScopeUsage["(modified)"] = subScopeUsage["(modified)"].concat(usage["(modified)"]);
                        subScopeUsage["(tokens)"] = subScopeUsage["(tokens)"].concat(usage["(tokens)"]);
                        subScopeUsage["(reassigned)"] =
                            subScopeUsage["(reassigned)"].concat(usage["(reassigned)"]);
                        subScopeUsage["(onlyUsedSubFunction)"] = false;
                    }
                }
                else {
                    if (typeof _current["(predefined)"][usedLabelName] === "boolean") {
                        delete declared[usedLabelName];
                        usedPredefinedAndGlobals[usedLabelName] = marker;
                        if (_current["(predefined)"][usedLabelName] === false && usage["(reassigned)"]) {
                            for (j = 0; j < usage["(reassigned)"].length; j++) {
                                if (!usage["(reassigned)"][j].ignoreW020) {
                                    warning("W020", usage["(reassigned)"][j]);
                                }
                            }
                        }
                    }
                    else {
                        if (usage["(tokens)"]) {
                            for (j = 0; j < usage["(tokens)"].length; j++) {
                                var undefinedToken = usage["(tokens)"][j];
                                if (!undefinedToken.forgiveUndef) {
                                    if (state.option.undef && !undefinedToken.ignoreUndef) {
                                        warning("W117", undefinedToken, usedLabelName);
                                    }
                                    if (impliedGlobals[usedLabelName]) {
                                        impliedGlobals[usedLabelName].line.push(undefinedToken.line);
                                    }
                                    else {
                                        impliedGlobals[usedLabelName] = {
                                            name: usedLabelName,
                                            line: [undefinedToken.line]
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!subScope) {
                Object.keys(declared)
                    .forEach(function (labelNotUsed) {
                    _warnUnused(labelNotUsed, declared[labelNotUsed], "var");
                });
            }
            if (subScope && !isUnstackingFunctionBody &&
                !isUnstackingFunctionParams && !isUnstackingFunctionOuter) {
                var labelNames = Object.keys(currentLabels);
                for (i = 0; i < labelNames.length; i++) {
                    var defLabelName = labelNames[i];
                    var defLabel = currentLabels[defLabelName];
                    if (!defLabel["(blockscoped)"] && defLabel["(type)"] !== "exception") {
                        var shadowed = subScope["(labels)"][defLabelName];
                        if (shadowed) {
                            shadowed["(unused)"] &= defLabel["(unused)"];
                        }
                        else {
                            defLabel["(useOutsideOfScope)"] =
                                _currentFunctBody["(type)"] !== "global" &&
                                    !this.funct.has(defLabelName, { excludeCurrent: true });
                            subScope["(labels)"][defLabelName] = defLabel;
                        }
                        delete currentLabels[defLabelName];
                    }
                }
            }
            _checkForUnused();
            _scopeStack.pop();
            if (isUnstackingFunctionBody) {
                _currentFunctBody = _scopeStack[findLastIndex(_scopeStack, function (scope) {
                    return scope["(isFuncBody)"] || scope["(type)"] === "global";
                })];
            }
            _current = subScope;
        },
        addParam: function (labelName, token, type) {
            type = type || "param";
            if (type === "exception") {
                var previouslyDefinedLabelType = this.funct.labeltype(labelName);
                if (previouslyDefinedLabelType && previouslyDefinedLabelType !== "exception") {
                    if (!state.option.node) {
                        warning("W002", state.tokens.next, labelName);
                    }
                }
            }
            if (has(_current["(labels)"], labelName)) {
                _current["(labels)"][labelName].duplicated = true;
            }
            else {
                _checkOuterShadow(labelName, token, type);
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": token,
                    "(unused)": true
                };
                _current["(params)"].push(labelName);
            }
            if (has(_current["(usages)"], labelName)) {
                var usage = _current["(usages)"][labelName];
                if (usage["(onlyUsedSubFunction)"]) {
                    _latedefWarning(type, labelName, token);
                }
                else {
                    warning("E056", token, labelName, type);
                }
            }
        },
        validateParams: function () {
            if (_currentFunctBody["(type)"] === "global") {
                return;
            }
            var isStrict = state.isStrict();
            var currentFunctParamScope = _currentFunctBody["(parent)"];
            if (!currentFunctParamScope["(params)"]) {
                return;
            }
            currentFunctParamScope["(params)"].forEach(function (labelName) {
                var label = currentFunctParamScope["(labels)"][labelName];
                if (label && label.duplicated) {
                    if (isStrict) {
                        warning("E011", label["(token)"], labelName);
                    }
                    else if (state.option.shadow !== true) {
                        warning("W004", label["(token)"], labelName);
                    }
                }
            });
        },
        getUsedOrDefinedGlobals: function () {
            var list = Object.keys(usedPredefinedAndGlobals);
            if (usedPredefinedAndGlobals.__proto__ === marker &&
                list.indexOf("__proto__") === -1) {
                list.push("__proto__");
            }
            return list;
        },
        getImpliedGlobals: function () {
            var values = values(impliedGlobals);
            var hasProto = false;
            if (impliedGlobals.__proto__) {
                hasProto = values.some(function (value) {
                    return value.name === "__proto__";
                });
                if (!hasProto) {
                    values.push(impliedGlobals.__proto__);
                }
            }
            return values;
        },
        getUnuseds: function () {
            return unuseds;
        },
        has: function (labelName, unused) {
            return Boolean(_getLabel(labelName));
        },
        labeltype: function (labelName) {
            var scopeLabels = _getLabel(labelName);
            if (scopeLabels) {
                return scopeLabels[labelName]["(type)"];
            }
            return null;
        },
        addExported: function (labelName) {
            var globalLabels = _scopeStack[0]["(labels)"];
            if (has(declared, labelName)) {
                delete declared[labelName];
            }
            else if (has(globalLabels, labelName)) {
                globalLabels[labelName]["(unused)"] = false;
            }
            else {
                for (var i = 1; i < _scopeStack.length; i++) {
                    var scope = _scopeStack[i];
                    if (!scope["(type)"]) {
                        if (has(scope["(labels)"], labelName) &&
                            !scope["(labels)"][labelName]["(blockscoped)"]) {
                            scope["(labels)"][labelName]["(unused)"] = false;
                            return;
                        }
                    }
                    else {
                        break;
                    }
                }
                exported[labelName] = true;
            }
        },
        setExported: function (labelName, token) {
            this.block.use(labelName, token);
        },
        addlabel: function (labelName, opts) {
            var type = opts.type;
            var token = opts.token;
            var isblockscoped = type === "let" || type === "const" || type === "class";
            var isexported = (isblockscoped ? _current : _currentFunctBody)["(type)"] === "global" &&
                has(exported, labelName);
            _checkOuterShadow(labelName, token, type);
            if (isblockscoped) {
                var declaredInCurrentScope = _current["(labels)"][labelName];
                if (!declaredInCurrentScope && _current === _currentFunctBody &&
                    _current["(type)"] !== "global") {
                    declaredInCurrentScope = !!_currentFunctBody["(parent)"]["(labels)"][labelName];
                }
                if (!declaredInCurrentScope && _current["(usages)"][labelName]) {
                    var usage = _current["(usages)"][labelName];
                    if (usage["(onlyUsedSubFunction)"]) {
                        _latedefWarning(type, labelName, token);
                    }
                    else {
                        warning("E056", token, labelName, type);
                    }
                }
                if (declaredInCurrentScope) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow === "outer") {
                    if (scopeManagerInst.funct.has(labelName)) {
                        warning("W004", token, labelName);
                    }
                }
                scopeManagerInst.block.add(labelName, type, token, !isexported);
            }
            else {
                var declaredInCurrentFunctionScope = scopeManagerInst.funct.has(labelName);
                if (!declaredInCurrentFunctionScope && usedSoFarInCurrentFunction(labelName)) {
                    _latedefWarning(type, labelName, token);
                }
                if (scopeManagerInst.funct.has(labelName, { onlyBlockscoped: true })) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow !== true) {
                    if (declaredInCurrentFunctionScope && labelName !== "__proto__") {
                        if (_currentFunctBody["(type)"] !== "global") {
                            warning("W004", token, labelName);
                        }
                    }
                }
                scopeManagerInst.funct.add(labelName, type, token, !isexported);
                if (_currentFunctBody["(type)"] === "global") {
                    usedPredefinedAndGlobals[labelName] = marker;
                }
            }
        },
        funct: {
            labeltype: function (labelName, options) {
                var onlyBlockscoped = options && options.onlyBlockscoped;
                var excludeParams = options && options.excludeParams;
                var currentScopeIndex = _scopeStack.length - (options && options.excludeCurrent ? 2 : 1);
                for (var i = currentScopeIndex; i >= 0; i--) {
                    var current = _scopeStack[i];
                    if (current["(labels)"][labelName] &&
                        (!onlyBlockscoped || current["(labels)"][labelName]["(blockscoped)"])) {
                        return current["(labels)"][labelName]["(type)"];
                    }
                    var scopeCheck = excludeParams ? _scopeStack[i - 1] : current;
                    if (scopeCheck && scopeCheck["(type)"] === "functionparams") {
                        return null;
                    }
                }
                return null;
            },
            hasBreakLabel: function (labelName) {
                for (var i = _scopeStack.length - 1; i >= 0; i--) {
                    var current = _scopeStack[i];
                    if (current["(breakLabels)"][labelName]) {
                        return true;
                    }
                    if (current["(type)"] === "functionparams") {
                        return false;
                    }
                }
                return false;
            },
            has: function (labelName, options) {
                return Boolean(this.labeltype(labelName, options));
            },
            add: function (labelName, type, tok, unused) {
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": tok,
                    "(blockscoped)": false,
                    "(function)": _currentFunctBody,
                    "(unused)": unused
                };
            }
        },
        block: {
            isGlobal: function () {
                return _current["(type)"] === "global";
            },
            use: function (labelName, token) {
                var paramScope = _currentFunctBody["(parent)"];
                if (paramScope && paramScope["(labels)"][labelName] &&
                    paramScope["(labels)"][labelName]["(type)"] === "param") {
                    if (!scopeManagerInst.funct.has(labelName, { excludeParams: true, onlyBlockscoped: true })) {
                        paramScope["(labels)"][labelName]["(unused)"] = false;
                    }
                }
                if (token && (state.ignored.W117 || state.option.undef === false)) {
                    token.ignoreUndef = true;
                }
                _setupUsages(labelName);
                if (token) {
                    token["(function)"] = _currentFunctBody;
                    _current["(usages)"][labelName]["(tokens)"].push(token);
                }
            },
            reassign: function (labelName, token) {
                token.ignoreW020 = state.ignored.W020;
                token.ignoreW021 = state.ignored.W021;
                this.modify(labelName, token);
                _current["(usages)"][labelName]["(reassigned)"].push(token);
            },
            modify: function (labelName, token) {
                _setupUsages(labelName);
                _current["(usages)"][labelName]["(modified)"].push(token);
            },
            add: function (labelName, type, tok, unused) {
                _current["(labels)"][labelName] = {
                    "(type)": type,
                    "(token)": tok,
                    "(blockscoped)": true,
                    "(unused)": unused
                };
            },
            addBreakLabel: function (labelName, opts) {
                var token = opts.token;
                if (scopeManagerInst.funct.hasBreakLabel(labelName)) {
                    warning("E011", token, labelName);
                }
                else if (state.option.shadow === "outer") {
                    if (scopeManagerInst.funct.has(labelName)) {
                        warning("W004", token, labelName);
                    }
                    else {
                        _checkOuterShadow(labelName, token);
                    }
                }
                _current["(breakLabels)"][labelName] = token;
            }
        }
    };
    return scopeManagerInst;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NvcGUtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tb2RlL2phdmFzY3JpcHQvc2NvcGUtbWFuYWdlci50cyJdLCJuYW1lcyI6WyJoYXMiLCJzbGljZSIsImZpbmRMYXN0SW5kZXgiLCJfbmV3U2NvcGUiLCJ3YXJuaW5nIiwiZXJyb3IiLCJfc2V0dXBVc2FnZXMiLCJfY2hlY2tGb3JVbnVzZWQiLCJfY2hlY2tQYXJhbXMiLCJfZ2V0TGFiZWwiLCJ1c2VkU29GYXJJbkN1cnJlbnRGdW5jdGlvbiIsIl9jaGVja091dGVyU2hhZG93IiwiX2xhdGVkZWZXYXJuaW5nIl0sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7T0FFTixZQUFZLE1BQU0sZ0JBQWdCO0FBS3pDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUVoQixhQUFhLEdBQU8sRUFBRSxJQUFZO0lBQzlCQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFBQTtBQUNuQ0EsQ0FBQ0E7QUFFRCxlQUFrQixLQUFVLEVBQUUsS0FBSyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU07SUFDdkRDLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO0FBQ25DQSxDQUFDQTtBQUVELHVCQUEwQixFQUFPLEVBQUUsUUFBMkI7SUFDMURDLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFD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QkFDeEMsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQ3RDLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7d0JBQ0osaUJBQWlCLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUN4QyxDQUFDO2dCQUNMLENBQUM7Z0JBQ0QsUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUNqRCxDQUFDO1NBQ0o7S0FDSixDQUFDO0lBQ0YsTUFBTSxDQUFDLGdCQUFnQixDQUFDO0FBQzVCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIlwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgRXZlbnRFbWl0dGVyIGZyb20gJy4vRXZlbnRFbWl0dGVyJztcblxuLy8gVXNlZCB0byBkZW5vdGUgbWVtYmVyc2hpcCBpbiBsb29rdXAgdGFibGVzIChhIHByaW1pdGl2ZSB2YWx1ZSBzdWNoIGFzIGB0cnVlYFxuLy8gd291bGQgYmUgc2lsZW50bHkgcmVqZWN0ZWQgZm9yIHRoZSBwcm9wZXJ0eSBuYW1lIFwiX19wcm90b19fXCIgaW4gc29tZVxuLy8gZW52aXJvbm1lbnRzKVxudmFyIG1hcmtlciA9IHt9O1xuXG5mdW5jdGlvbiBoYXMob2JqOiB7fSwgbmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIG9iai5oYXNPd25Qcm9wZXJ0eShuYW1lKVxufVxuXG5mdW5jdGlvbiBzbGljZTxUPihhcnJheTogVFtdLCBzdGFydCA9IDAsIGVuZCA9IGFycmF5Lmxlbmd0aCk6IFRbXSB7XG4gICAgcmV0dXJuIGFycmF5LnNsaWNlKHN0YXJ0LCBlbmQpO1xufVxuXG5mdW5jdGlvbiBmaW5kTGFzdEluZGV4PFQ+KHhzOiBUW10sIGNhbGxiYWNrOiAoeDogVCkgPT4gYm9vbGVhbik6IG51bWJlciB7XG4gICAgZm9yICh2YXIgaSA9IHhzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIHZhciB4ID0geHNbaV07XG4gICAgICAgIGlmIChjYWxsYmFjayh4KSkge1xuICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIC0xO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBzY29wZSBtYW5hZ2VyIHRoYXQgaGFuZGxlcyB2YXJpYWJsZXMgYW5kIGxhYmVscywgc3RvcmluZyB1c2FnZXNcbiAqIGFuZCByZXNvbHZpbmcgd2hlbiB2YXJpYWJsZXMgYXJlIHVzZWQgYW5kIHVuZGVmaW5lZFxuICovXG5leHBvcnQgdmFyIHNjb3BlTWFuYWdlciA9IGZ1bmN0aW9uKHN0YXRlLCBwcmVkZWZpbmVkLCBleHBvcnRlZCwgZGVjbGFyZWQpIHtcblxuICAgIHZhciBfY3VycmVudDtcbiAgICB2YXIgX3Njb3BlU3RhY2sgPSBbXTtcblxuICAgIGZ1bmN0aW9uIF9uZXdTY29wZSh0eXBlKSB7XG4gICAgICAgIF9jdXJyZW50ID0ge1xuICAgICAgICAgICAgXCIobGFiZWxzKVwiOiBPYmplY3QuY3JlYXRlKG51bGwpLFxuICAgICAgICAgICAgXCIodXNhZ2VzKVwiOiBPYmplY3QuY3JlYXRlKG51bGwpLFxuICAgICAgICAgICAgXCIoYnJlYWtMYWJlbHMpXCI6IE9iamVjdC5jcmVhdGUobnVsbCksXG4gICAgICAgICAgICBcIihwYXJlbnQpXCI6IF9jdXJyZW50LFxuICAgICAgICAgICAgXCIodHlwZSlcIjogdHlwZSxcbiAgICAgICAgICAgIFwiKHBhcmFtcylcIjogKHR5cGUgPT09IFwiZnVuY3Rpb25wYXJhbXNcIiB8fCB0eXBlID09PSBcImNhdGNocGFyYW1zXCIpID8gW10gOiBudWxsXG4gICAgICAgIH07XG4gICAgICAgIF9zY29wZVN0YWNrLnB1c2goX2N1cnJlbnQpO1xuICAgIH1cblxuICAgIF9uZXdTY29wZShcImdsb2JhbFwiKTtcbiAgICBfY3VycmVudFtcIihwcmVkZWZpbmVkKVwiXSA9IHByZWRlZmluZWQ7XG5cbiAgICB2YXIgX2N1cnJlbnRGdW5jdEJvZHkgPSBfY3VycmVudDsgLy8gdGhpcyBpcyB0aGUgYmxvY2sgYWZ0ZXIgdGhlIHBhcmFtcyA9IGZ1bmN0aW9uXG5cbiAgICB2YXIgdXNlZFByZWRlZmluZWRBbmRHbG9iYWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICB2YXIgaW1wbGllZEdsb2JhbHMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIHZhciB1bnVzZWRzID0gW107XG4gICAgdmFyIGVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbiAgICBmdW5jdGlvbiB3YXJuaW5nKGNvZGU6IHN0cmluZywgdG9rZW4sIHVudXNlZDE/LCB1bnVzZWQyPykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgIGNvZGU6IGNvZGUsXG4gICAgICAgICAgICB0b2tlbjogdG9rZW4sXG4gICAgICAgICAgICBkYXRhOiBzbGljZSg8YW55PmFyZ3VtZW50cywgMilcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IoY29kZTogc3RyaW5nLCB0b2tlbiwgdW51c2VkPykge1xuICAgICAgICBlbWl0dGVyLmVtaXQoXCJ3YXJuaW5nXCIsIHtcbiAgICAgICAgICAgIGNvZGU6IGNvZGUsXG4gICAgICAgICAgICB0b2tlbjogdG9rZW4sXG4gICAgICAgICAgICBkYXRhOiBzbGljZSg8YW55PmFyZ3VtZW50cywgMilcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX3NldHVwVXNhZ2VzKGxhYmVsTmFtZSkge1xuICAgICAgICBpZiAoIV9jdXJyZW50W1wiKHVzYWdlcylcIl1bbGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdID0ge1xuICAgICAgICAgICAgICAgIFwiKG1vZGlmaWVkKVwiOiBbXSxcbiAgICAgICAgICAgICAgICBcIihyZWFzc2lnbmVkKVwiOiBbXSxcbiAgICAgICAgICAgICAgICBcIih0b2tlbnMpXCI6IFtdXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIF9nZXRVbnVzZWRPcHRpb24gPSBmdW5jdGlvbih1bnVzZWRfb3B0KSB7XG4gICAgICAgIGlmICh1bnVzZWRfb3B0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHVudXNlZF9vcHQgPSBzdGF0ZS5vcHRpb24udW51c2VkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVudXNlZF9vcHQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHVudXNlZF9vcHQgPSBcImxhc3QtcGFyYW1cIjtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bnVzZWRfb3B0O1xuICAgIH07XG5cbiAgICB2YXIgX3dhcm5VbnVzZWQgPSBmdW5jdGlvbihuYW1lLCB0a24sIHR5cGUsIHVudXNlZF9vcHQ/KSB7XG4gICAgICAgIHZhciBsaW5lID0gdGtuLmxpbmU7XG4gICAgICAgIHZhciBjaHIgPSB0a24uZnJvbTtcbiAgICAgICAgdmFyIHJhd19uYW1lID0gdGtuLnJhd190ZXh0IHx8IG5hbWU7XG5cbiAgICAgICAgdW51c2VkX29wdCA9IF9nZXRVbnVzZWRPcHRpb24odW51c2VkX29wdCk7XG5cbiAgICAgICAgdmFyIHdhcm5hYmxlX3R5cGVzID0ge1xuICAgICAgICAgICAgXCJ2YXJzXCI6IFtcInZhclwiXSxcbiAgICAgICAgICAgIFwibGFzdC1wYXJhbVwiOiBbXCJ2YXJcIiwgXCJwYXJhbVwiXSxcbiAgICAgICAgICAgIFwic3RyaWN0XCI6IFtcInZhclwiLCBcInBhcmFtXCIsIFwibGFzdC1wYXJhbVwiXVxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh1bnVzZWRfb3B0KSB7XG4gICAgICAgICAgICBpZiAod2FybmFibGVfdHlwZXNbdW51c2VkX29wdF0gJiYgd2FybmFibGVfdHlwZXNbdW51c2VkX29wdF0uaW5kZXhPZih0eXBlKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzA5OFwiLCB7IGxpbmU6IGxpbmUsIGZyb206IGNociB9LCByYXdfbmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpbmNvbnNpc3RlbnQgLSBzZWUgZ2gtMTg5NFxuICAgICAgICBpZiAodW51c2VkX29wdCB8fCB0eXBlID09PSBcInZhclwiKSB7XG4gICAgICAgICAgICB1bnVzZWRzLnB1c2goe1xuICAgICAgICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgICAgICAgbGluZTogbGluZSxcbiAgICAgICAgICAgICAgICBjaGFyYWN0ZXI6IGNoclxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIHRoZSBjdXJyZW50IHNjb3BlIGZvciB1bnVzZWQgaWRlbnRpZmllcnNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBfY2hlY2tGb3JVbnVzZWQoKSB7XG4gICAgICAgIC8vIGZ1bmN0aW9uIHBhcmFtcyBhcmUgaGFuZGxlZCBzcGVjaWFsbHlcbiAgICAgICAgLy8gYXNzdW1lIHRoYXQgcGFyYW1ldGVycyBhcmUgdGhlIG9ubHkgdGhpbmcgZGVjbGFyZWQgaW4gdGhlIHBhcmFtIHNjb3BlXG4gICAgICAgIGlmIChfY3VycmVudFtcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbnBhcmFtc1wiKSB7XG4gICAgICAgICAgICBfY2hlY2tQYXJhbXMoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgY3VyZW50TGFiZWxzID0gX2N1cnJlbnRbXCIobGFiZWxzKVwiXTtcbiAgICAgICAgZm9yICh2YXIgbGFiZWxOYW1lIGluIGN1cmVudExhYmVscykge1xuICAgICAgICAgICAgaWYgKGN1cmVudExhYmVsc1tsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgaWYgKGN1cmVudExhYmVsc1tsYWJlbE5hbWVdW1wiKHR5cGUpXCJdICE9PSBcImV4Y2VwdGlvblwiICYmXG4gICAgICAgICAgICAgICAgICAgIGN1cmVudExhYmVsc1tsYWJlbE5hbWVdW1wiKHVudXNlZClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgX3dhcm5VbnVzZWQobGFiZWxOYW1lLCBjdXJlbnRMYWJlbHNbbGFiZWxOYW1lXVtcIih0b2tlbilcIl0sIFwidmFyXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB0aGUgY3VycmVudCBzY29wZSBmb3IgdW51c2VkIHBhcmFtZXRlcnNcbiAgICAgKiBNdXN0IGJlIGNhbGxlZCBpbiBhIGZ1bmN0aW9uIHBhcmFtZXRlciBzY29wZVxuICAgICAqL1xuICAgIGZ1bmN0aW9uIF9jaGVja1BhcmFtcygpIHtcbiAgICAgICAgdmFyIHBhcmFtcyA9IF9jdXJyZW50W1wiKHBhcmFtcylcIl07XG5cbiAgICAgICAgaWYgKCFwYXJhbXMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwYXJhbSA9IHBhcmFtcy5wb3AoKTtcbiAgICAgICAgdmFyIHVudXNlZF9vcHQ7XG5cbiAgICAgICAgd2hpbGUgKHBhcmFtKSB7XG4gICAgICAgICAgICB2YXIgbGFiZWwgPSBfY3VycmVudFtcIihsYWJlbHMpXCJdW3BhcmFtXTtcblxuICAgICAgICAgICAgdW51c2VkX29wdCA9IF9nZXRVbnVzZWRPcHRpb24oc3RhdGUuZnVuY3RbXCIodW51c2VkT3B0aW9uKVwiXSk7XG5cbiAgICAgICAgICAgIC8vICd1bmRlZmluZWQnIGlzIGEgc3BlY2lhbCBjYXNlIGZvciAoZnVuY3Rpb24od2luZG93LCB1bmRlZmluZWQpIHsgLi4uIH0pKCk7XG4gICAgICAgICAgICAvLyBwYXR0ZXJucy5cbiAgICAgICAgICAgIGlmIChwYXJhbSA9PT0gXCJ1bmRlZmluZWRcIilcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIGlmIChsYWJlbFtcIih1bnVzZWQpXCJdKSB7XG4gICAgICAgICAgICAgICAgX3dhcm5VbnVzZWQocGFyYW0sIGxhYmVsW1wiKHRva2VuKVwiXSwgXCJwYXJhbVwiLCBzdGF0ZS5mdW5jdFtcIih1bnVzZWRPcHRpb24pXCJdKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodW51c2VkX29wdCA9PT0gXCJsYXN0LXBhcmFtXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHBhcmFtID0gcGFyYW1zLnBvcCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZHMgdGhlIHJlbGV2YW50IGxhYmVsJ3Mgc2NvcGUsIHNlYXJjaGluZyBmcm9tIG5lYXJlc3Qgb3V0d2FyZHNcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSB0aGUgc2NvcGUgdGhlIGxhYmVsIHdhcyBmb3VuZCBpblxuICAgICAqL1xuICAgIGZ1bmN0aW9uIF9nZXRMYWJlbChsYWJlbE5hbWUpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IF9zY29wZVN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgICB2YXIgc2NvcGVMYWJlbHMgPSBfc2NvcGVTdGFja1tpXVtcIihsYWJlbHMpXCJdO1xuICAgICAgICAgICAgaWYgKHNjb3BlTGFiZWxzW2xhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2NvcGVMYWJlbHM7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1c2VkU29GYXJJbkN1cnJlbnRGdW5jdGlvbihsYWJlbE5hbWUpIHtcbiAgICAgICAgLy8gdXNlZCBzbyBmYXIgaW4gdGhpcyB3aG9sZSBmdW5jdGlvbiBhbmQgYW55IHN1YiBmdW5jdGlvbnNcbiAgICAgICAgZm9yICh2YXIgaSA9IF9zY29wZVN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgY3VycmVudCA9IF9zY29wZVN0YWNrW2ldO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGN1cnJlbnQgPT09IF9jdXJyZW50RnVuY3RCb2R5KSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9jaGVja091dGVyU2hhZG93KGxhYmVsTmFtZSwgdG9rZW4sIHVudXNlZD8pIHtcblxuICAgICAgICAvLyBvbmx5IGNoZWNrIGlmIHNoYWRvdyBpcyBvdXRlclxuICAgICAgICBpZiAoc3RhdGUub3B0aW9uLnNoYWRvdyAhPT0gXCJvdXRlclwiKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaXNHbG9iYWwgPSBfY3VycmVudEZ1bmN0Qm9keVtcIih0eXBlKVwiXSA9PT0gXCJnbG9iYWxcIixcbiAgICAgICAgICAgIGlzTmV3RnVuY3Rpb24gPSBfY3VycmVudFtcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbnBhcmFtc1wiO1xuXG4gICAgICAgIHZhciBvdXRzaWRlQ3VycmVudEZ1bmN0aW9uID0gIWlzR2xvYmFsO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IF9zY29wZVN0YWNrLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc3RhY2tJdGVtID0gX3Njb3BlU3RhY2tbaV07XG5cbiAgICAgICAgICAgIGlmICghaXNOZXdGdW5jdGlvbiAmJiBfc2NvcGVTdGFja1tpICsgMV0gPT09IF9jdXJyZW50RnVuY3RCb2R5KSB7XG4gICAgICAgICAgICAgICAgb3V0c2lkZUN1cnJlbnRGdW5jdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG91dHNpZGVDdXJyZW50RnVuY3Rpb24gJiYgc3RhY2tJdGVtW1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIzXCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHN0YWNrSXRlbVtcIihicmVha0xhYmVscylcIl1bbGFiZWxOYW1lXSkge1xuICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMTIzXCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gX2xhdGVkZWZXYXJuaW5nKHR5cGUsIGxhYmVsTmFtZSwgdG9rZW4pIHtcbiAgICAgICAgaWYgKHN0YXRlLm9wdGlvbi5sYXRlZGVmKSB7XG4gICAgICAgICAgICAvLyBpZiBlaXRoZXIgbGF0ZWRlZiBpcyBzdHJpY3QgYW5kIHRoaXMgaXMgYSBmdW5jdGlvblxuICAgICAgICAgICAgLy8gICAgb3IgdGhpcyBpcyBub3QgYSBmdW5jdGlvblxuICAgICAgICAgICAgaWYgKChzdGF0ZS5vcHRpb24ubGF0ZWRlZiA9PT0gdHJ1ZSAmJiB0eXBlID09PSBcImZ1bmN0aW9uXCIpIHx8XG4gICAgICAgICAgICAgICAgdHlwZSAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDNcIiwgdG9rZW4sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgc2NvcGVNYW5hZ2VySW5zdCA9IHtcblxuICAgICAgICBvbjogZnVuY3Rpb24obmFtZXMsIGxpc3RlbmVyKSB7XG4gICAgICAgICAgICBuYW1lcy5zcGxpdChcIiBcIikuZm9yRWFjaChmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgICAgICAgICAgZW1pdHRlci5vbihuYW1lLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBpc1ByZWRlZmluZWQ6IGZ1bmN0aW9uKGxhYmVsTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuICF0aGlzLmhhcyhsYWJlbE5hbWUpICYmIGhhcyhfc2NvcGVTdGFja1swXVtcIihwcmVkZWZpbmVkKVwiXSwgbGFiZWxOYW1lKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogVGVsbCB0aGUgbWFuYWdlciB3ZSBhcmUgZW50ZXJpbmcgYSBuZXcgYmxvY2sgb2YgY29kZVxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gW3R5cGVdIC0gVGhlIHR5cGUgb2YgdGhlIGJsb2NrLiBWYWxpZCB2YWx1ZXMgYXJlXG4gICAgICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICBcImZ1bmN0aW9ucGFyYW1zXCIsIFwiY2F0Y2hwYXJhbXNcIiBhbmRcbiAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgICAgIFwiZnVuY3Rpb25vdXRlclwiXG4gICAgICAgICAqL1xuICAgICAgICBzdGFjazogZnVuY3Rpb24odHlwZSkge1xuICAgICAgICAgICAgdmFyIHByZXZpb3VzU2NvcGUgPSBfY3VycmVudDtcbiAgICAgICAgICAgIF9uZXdTY29wZSh0eXBlKTtcblxuICAgICAgICAgICAgaWYgKCF0eXBlICYmIHByZXZpb3VzU2NvcGVbXCIodHlwZSlcIl0gPT09IFwiZnVuY3Rpb25wYXJhbXNcIikge1xuXG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIoaXNGdW5jQm9keSlcIl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGNvbnRleHQpXCJdID0gX2N1cnJlbnRGdW5jdEJvZHk7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnRGdW5jdEJvZHkgPSBfY3VycmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICB1bnN0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIGpzaGludCBwcm90bzogdHJ1ZVxuICAgICAgICAgICAgdmFyIHN1YlNjb3BlID0gX3Njb3BlU3RhY2subGVuZ3RoID4gMSA/IF9zY29wZVN0YWNrW19zY29wZVN0YWNrLmxlbmd0aCAtIDJdIDogbnVsbDtcbiAgICAgICAgICAgIHZhciBpc1Vuc3RhY2tpbmdGdW5jdGlvbkJvZHkgPSBfY3VycmVudCA9PT0gX2N1cnJlbnRGdW5jdEJvZHksXG4gICAgICAgICAgICAgICAgaXNVbnN0YWNraW5nRnVuY3Rpb25QYXJhbXMgPSBfY3VycmVudFtcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbnBhcmFtc1wiLFxuICAgICAgICAgICAgICAgIGlzVW5zdGFja2luZ0Z1bmN0aW9uT3V0ZXIgPSBfY3VycmVudFtcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbm91dGVyXCI7XG5cbiAgICAgICAgICAgIHZhciBpLCBqO1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRVc2FnZXMgPSBfY3VycmVudFtcIih1c2FnZXMpXCJdO1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRMYWJlbHMgPSBfY3VycmVudFtcIihsYWJlbHMpXCJdO1xuICAgICAgICAgICAgdmFyIHVzZWRMYWJlbE5hbWVMaXN0ID0gT2JqZWN0LmtleXMoY3VycmVudFVzYWdlcyk7XG5cbiAgICAgICAgICAgIGlmIChjdXJyZW50VXNhZ2VzLl9fcHJvdG9fXyAmJiB1c2VkTGFiZWxOYW1lTGlzdC5pbmRleE9mKFwiX19wcm90b19fXCIpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHVzZWRMYWJlbE5hbWVMaXN0LnB1c2goXCJfX3Byb3RvX19cIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB1c2VkTGFiZWxOYW1lTGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciB1c2VkTGFiZWxOYW1lID0gdXNlZExhYmVsTmFtZUxpc3RbaV07XG5cbiAgICAgICAgICAgICAgICB2YXIgdXNhZ2UgPSBjdXJyZW50VXNhZ2VzW3VzZWRMYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgIHZhciB1c2VkTGFiZWwgPSBjdXJyZW50TGFiZWxzW3VzZWRMYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICh1c2VkTGFiZWwpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHVzZWRMYWJlbFR5cGUgPSB1c2VkTGFiZWxbXCIodHlwZSlcIl07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZWRMYWJlbFtcIih1c2VPdXRzaWRlT2ZTY29wZSlcIl0gJiYgIXN0YXRlLm9wdGlvbi5mdW5jc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB1c2VkVG9rZW5zID0gdXNhZ2VbXCIodG9rZW5zKVwiXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1c2VkVG9rZW5zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVzZWRUb2tlbnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gS2VlcCB0aGUgY29uc2lzdGVuY3kgb2YgaHR0cHM6Ly9naXRodWIuY29tL2pzaGludC9qc2hpbnQvaXNzdWVzLzI0MDlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVzZWRMYWJlbFtcIihmdW5jdGlvbilcIl0gPT09IHVzZWRUb2tlbnNbal1bXCIoZnVuY3Rpb24pXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcihcIlcwMzhcIiwgdXNlZFRva2Vuc1tqXSwgdXNlZExhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBtYXJrIHRoZSBsYWJlbCB1c2VkXG4gICAgICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGxhYmVscylcIl1bdXNlZExhYmVsTmFtZV1bXCIodW51c2VkKVwiXSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIGZvciBtb2RpZnlpbmcgYSBjb25zdFxuICAgICAgICAgICAgICAgICAgICBpZiAodXNlZExhYmVsVHlwZSA9PT0gXCJjb25zdFwiICYmIHVzYWdlW1wiKG1vZGlmaWVkKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVzYWdlW1wiKG1vZGlmaWVkKVwiXS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yKFwiRTAxM1wiLCB1c2FnZVtcIihtb2RpZmllZClcIl1bal0sIHVzZWRMYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgZm9yIHJlLWFzc2lnbmluZyBhIGZ1bmN0aW9uIGRlY2xhcmF0aW9uXG4gICAgICAgICAgICAgICAgICAgIGlmICgodXNlZExhYmVsVHlwZSA9PT0gXCJmdW5jdGlvblwiIHx8IHVzZWRMYWJlbFR5cGUgPT09IFwiY2xhc3NcIikgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgIHVzYWdlW1wiKHJlYXNzaWduZWQpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVzYWdlW1wiKHJlYXNzaWduZWQpXCJdW2pdLmlnbm9yZVcwMjEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMjFcIiwgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl1bal0sIHVzZWRMYWJlbE5hbWUsIHVzZWRMYWJlbFR5cGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNVbnN0YWNraW5nRnVuY3Rpb25PdXRlcikge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5mdW5jdFtcIihpc0NhcHR1cmluZylcIl0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzdWJTY29wZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBub3QgZXhpdGluZyB0aGUgZ2xvYmFsIHNjb3BlLCBzbyBjb3B5IHRoZSB1c2FnZSBkb3duIGluIGNhc2UgaXRzIGFuIG91dCBvZiBzY29wZSB1c2FnZVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN1YlNjb3BlW1wiKHVzYWdlcylcIl1bdXNlZExhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YlNjb3BlW1wiKHVzYWdlcylcIl1bdXNlZExhYmVsTmFtZV0gPSB1c2FnZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc1Vuc3RhY2tpbmdGdW5jdGlvbkJvZHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVtcIih1c2FnZXMpXCJdW3VzZWRMYWJlbE5hbWVdW1wiKG9ubHlVc2VkU3ViRnVuY3Rpb24pXCJdID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzdWJTY29wZVVzYWdlID0gc3ViU2NvcGVbXCIodXNhZ2VzKVwiXVt1c2VkTGFiZWxOYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YlNjb3BlVXNhZ2VbXCIobW9kaWZpZWQpXCJdID0gc3ViU2NvcGVVc2FnZVtcIihtb2RpZmllZClcIl0uY29uY2F0KHVzYWdlW1wiKG1vZGlmaWVkKVwiXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVVzYWdlW1wiKHRva2VucylcIl0gPSBzdWJTY29wZVVzYWdlW1wiKHRva2VucylcIl0uY29uY2F0KHVzYWdlW1wiKHRva2VucylcIl0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3ViU2NvcGVVc2FnZVtcIihyZWFzc2lnbmVkKVwiXSA9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ViU2NvcGVVc2FnZVtcIihyZWFzc2lnbmVkKVwiXS5jb25jYXQodXNhZ2VbXCIocmVhc3NpZ25lZClcIl0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgc3ViU2NvcGVVc2FnZVtcIihvbmx5VXNlZFN1YkZ1bmN0aW9uKVwiXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBpcyBleGl0aW5nIGdsb2JhbCBzY29wZSwgc28gd2UgZmluYWxpc2UgZXZlcnl0aGluZyBoZXJlIC0gd2UgYXJlIGF0IHRoZSBlbmQgb2YgdGhlIGZpbGVcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBfY3VycmVudFtcIihwcmVkZWZpbmVkKVwiXVt1c2VkTGFiZWxOYW1lXSA9PT0gXCJib29sZWFuXCIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBkZWNsYXJlZCB0b2tlbiwgc28gd2Uga25vdyBpdCBpcyB1c2VkXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZGVjbGFyZWRbdXNlZExhYmVsTmFtZV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG5vdGUgaXQgYXMgdXNlZCBzbyBpdCBjYW4gYmUgcmVwb3J0ZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIHVzZWRQcmVkZWZpbmVkQW5kR2xvYmFsc1t1c2VkTGFiZWxOYW1lXSA9IG1hcmtlcjtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgZm9yIHJlLWFzc2lnbmluZyBhIHJlYWQtb25seSAoc2V0IHRvIGZhbHNlKSBwcmVkZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoX2N1cnJlbnRbXCIocHJlZGVmaW5lZClcIl1bdXNlZExhYmVsTmFtZV0gPT09IGZhbHNlICYmIHVzYWdlW1wiKHJlYXNzaWduZWQpXCJdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IHVzYWdlW1wiKHJlYXNzaWduZWQpXCJdLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdXNhZ2VbXCIocmVhc3NpZ25lZClcIl1bal0uaWdub3JlVzAyMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMjBcIiwgdXNhZ2VbXCIocmVhc3NpZ25lZClcIl1bal0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGFiZWwgdXNhZ2UgaXMgbm90IHByZWRlZmluZWQgYW5kIHdlIGhhdmUgbm90IGZvdW5kIGEgZGVjbGFyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNvIHJlcG9ydCBhcyB1bmRlY2xhcmVkXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodXNhZ2VbXCIodG9rZW5zKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB1c2FnZVtcIih0b2tlbnMpXCJdLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciB1bmRlZmluZWRUb2tlbiA9IHVzYWdlW1wiKHRva2VucylcIl1bal07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGl0cyBub3QgYSBmb3JnaXZlbiB1bmRlZmluZWQgKGUuZy4gdHlwb2YgeClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF1bmRlZmluZWRUb2tlbi5mb3JnaXZlVW5kZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHVuZGVmIGlzIG9uIGFuZCB1bmRlZiB3YXMgb24gd2hlbiB0aGUgdG9rZW4gd2FzIGRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5vcHRpb24udW5kZWYgJiYgIXVuZGVmaW5lZFRva2VuLmlnbm9yZVVuZGVmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcxMTdcIiwgdW5kZWZpbmVkVG9rZW4sIHVzZWRMYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltcGxpZWRHbG9iYWxzW3VzZWRMYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1wbGllZEdsb2JhbHNbdXNlZExhYmVsTmFtZV0ubGluZS5wdXNoKHVuZGVmaW5lZFRva2VuLmxpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBsaWVkR2xvYmFsc1t1c2VkTGFiZWxOYW1lXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogdXNlZExhYmVsTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZTogW3VuZGVmaW5lZFRva2VuLmxpbmVdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgZXhpdGluZyB0aGUgZ2xvYmFsIHNjb3BlLCB3ZSBjYW4gd2FybiBhYm91dCBkZWNsYXJlZCBnbG9iYWxzIHRoYXQgaGF2ZW4ndCBiZWVuIHVzZWQgeWV0XG4gICAgICAgICAgICBpZiAoIXN1YlNjb3BlKSB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXMoZGVjbGFyZWQpXG4gICAgICAgICAgICAgICAgICAgIC5mb3JFYWNoKGZ1bmN0aW9uKGxhYmVsTm90VXNlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX3dhcm5VbnVzZWQobGFiZWxOb3RVc2VkLCBkZWNsYXJlZFtsYWJlbE5vdFVzZWRdLCBcInZhclwiKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIHRoaXMgaXMgbm90IGEgZnVuY3Rpb24gYm91bmRhcnksIHRyYW5zZmVyIGZ1bmN0aW9uLXNjb3BlZCBsYWJlbHMgdG9cbiAgICAgICAgICAgIC8vIHRoZSBwYXJlbnQgYmxvY2sgKGEgcm91Z2ggc2ltdWxhdGlvbiBvZiB2YXJpYWJsZSBob2lzdGluZykuIFByZXZpb3VzbHlcbiAgICAgICAgICAgIC8vIGV4aXN0aW5nIGxhYmVscyBpbiB0aGUgcGFyZW50IGJsb2NrIHNob3VsZCB0YWtlIHByZWNlZGVuY2Ugc28gdGhhdCB0aGluZ3MgYW5kIHN0dWZmLlxuICAgICAgICAgICAgaWYgKHN1YlNjb3BlICYmICFpc1Vuc3RhY2tpbmdGdW5jdGlvbkJvZHkgJiZcbiAgICAgICAgICAgICAgICAhaXNVbnN0YWNraW5nRnVuY3Rpb25QYXJhbXMgJiYgIWlzVW5zdGFja2luZ0Z1bmN0aW9uT3V0ZXIpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGFiZWxOYW1lcyA9IE9iamVjdC5rZXlzKGN1cnJlbnRMYWJlbHMpO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsYWJlbE5hbWVzLmxlbmd0aDsgaSsrKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlZkxhYmVsTmFtZSA9IGxhYmVsTmFtZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIHZhciBkZWZMYWJlbCA9IGN1cnJlbnRMYWJlbHNbZGVmTGFiZWxOYW1lXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWRlZkxhYmVsW1wiKGJsb2Nrc2NvcGVkKVwiXSAmJiBkZWZMYWJlbFtcIih0eXBlKVwiXSAhPT0gXCJleGNlcHRpb25cIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNoYWRvd2VkID0gc3ViU2NvcGVbXCIobGFiZWxzKVwiXVtkZWZMYWJlbE5hbWVdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBEbyBub3Qgb3ZlcndyaXRlIGEgbGFiZWwgaWYgaXQgZXhpc3RzIGluIHRoZSBwYXJlbnQgc2NvcGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGJlY2F1c2UgaXQgaXMgc2hhcmVkIGJ5IGFkamFjZW50IGJsb2Nrcy4gQ29weSB0aGUgYHVudXNlZGBcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByb3BlcnR5IHNvIHRoYXQgYW55IHJlZmVyZW5jZXMgZm91bmQgd2l0aGluIHRoZSBjdXJyZW50IGJsb2NrXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcmUgY291bnRlZCB0b3dhcmQgdGhhdCBoaWdoZXItbGV2ZWwgZGVjbGFyYXRpb24uXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2hhZG93ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaGFkb3dlZFtcIih1bnVzZWQpXCJdICY9IGRlZkxhYmVsW1wiKHVudXNlZClcIl07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBcIkhvaXN0XCIgdGhlIHZhcmlhYmxlIHRvIHRoZSBwYXJlbnQgYmxvY2ssIGRlY29yYXRpbmcgdGhlIGxhYmVsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc28gdGhhdCBmdXR1cmUgcmVmZXJlbmNlcywgdGhvdWdoIHRlY2huaWNhbGx5IHZhbGlkLCBjYW4gYmVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZXBvcnRlZCBhcyBcIm91dC1vZi1zY29wZVwiIGluIHRoZSBhYnNlbmNlIG9mIHRoZSBgZnVuY3Njb3BlYFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9wdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmTGFiZWxbXCIodXNlT3V0c2lkZU9mU2NvcGUpXCJdID1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRG8gbm90IHdhcm4gYWJvdXQgb3V0LW9mLXNjb3BlIHVzYWdlcyBpbiB0aGUgZ2xvYmFsIHNjb3BlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF9jdXJyZW50RnVuY3RCb2R5W1wiKHR5cGUpXCJdICE9PSBcImdsb2JhbFwiICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdoZW4gYSBoaWdoZXIgc2NvcGUgY29udGFpbnMgYSBiaW5kaW5nIGZvciB0aGUgbGFiZWwsIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBsYWJlbCBpcyBhIHJlLWRlY2xhcmF0aW9uIGFuZCBzaG91bGQgbm90IHByb21wdCBcInVzZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3V0LW9mLXNjb3BlXCIgd2FybmluZ3MuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICF0aGlzLmZ1bmN0LmhhcyhkZWZMYWJlbE5hbWUsIHsgZXhjbHVkZUN1cnJlbnQ6IHRydWUgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJTY29wZVtcIihsYWJlbHMpXCJdW2RlZkxhYmVsTmFtZV0gPSBkZWZMYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGN1cnJlbnRMYWJlbHNbZGVmTGFiZWxOYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgX2NoZWNrRm9yVW51c2VkKCk7XG5cbiAgICAgICAgICAgIF9zY29wZVN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgaWYgKGlzVW5zdGFja2luZ0Z1bmN0aW9uQm9keSkge1xuICAgICAgICAgICAgICAgIF9jdXJyZW50RnVuY3RCb2R5ID0gX3Njb3BlU3RhY2tbZmluZExhc3RJbmRleChfc2NvcGVTdGFjaywgZnVuY3Rpb24oc2NvcGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgZnVuY3Rpb24gb3IgaWYgZ2xvYmFsICh3aGljaCBpcyBhdCB0aGUgYm90dG9tIHNvIGl0IHdpbGwgb25seSByZXR1cm4gdHJ1ZSBpZiB3ZSBjYWxsIGJhY2spXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzY29wZVtcIihpc0Z1bmNCb2R5KVwiXSB8fCBzY29wZVtcIih0eXBlKVwiXSA9PT0gXCJnbG9iYWxcIjtcbiAgICAgICAgICAgICAgICB9KV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIF9jdXJyZW50ID0gc3ViU2NvcGU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBhIHBhcmFtIHRvIHRoZSBjdXJyZW50IHNjb3BlXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsYWJlbE5hbWVcbiAgICAgICAgICogQHBhcmFtIHtUb2tlbn0gdG9rZW5cbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IFt0eXBlPVwicGFyYW1cIl0gcGFyYW0gdHlwZVxuICAgICAgICAgKi9cbiAgICAgICAgYWRkUGFyYW06IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdG9rZW4sIHR5cGUpIHtcbiAgICAgICAgICAgIHR5cGUgPSB0eXBlIHx8IFwicGFyYW1cIjtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09IFwiZXhjZXB0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiBkZWZpbmVkIGluIHRoZSBjdXJyZW50IGZ1bmN0aW9uXG4gICAgICAgICAgICAgICAgdmFyIHByZXZpb3VzbHlEZWZpbmVkTGFiZWxUeXBlID0gdGhpcy5mdW5jdC5sYWJlbHR5cGUobGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAocHJldmlvdXNseURlZmluZWRMYWJlbFR5cGUgJiYgcHJldmlvdXNseURlZmluZWRMYWJlbFR5cGUgIT09IFwiZXhjZXB0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYW5kIGhhcyBub3QgYmVlbiB1c2VkIHlldCBpbiB0aGUgY3VycmVudCBmdW5jdGlvbiBzY29wZVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLm9wdGlvbi5ub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwMlwiLCBzdGF0ZS50b2tlbnMubmV4dCwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVGhlIHZhcmlhYmxlIHdhcyBkZWNsYXJlZCBpbiB0aGUgY3VycmVudCBzY29wZVxuICAgICAgICAgICAgaWYgKGhhcyhfY3VycmVudFtcIihsYWJlbHMpXCJdLCBsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdLmR1cGxpY2F0ZWQgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgLy8gVGhlIHZhcmlhYmxlIHdhcyBkZWNsYXJlZCBpbiBhbiBvdXRlciBzY29wZVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIHNjb3BlIGhhcyB0aGUgdmFyaWFibGUgZGVmaW5lZCwgaXQncyBhIHJlLWRlZmluaXRpb24gZXJyb3JcbiAgICAgICAgICAgICAgICBfY2hlY2tPdXRlclNoYWRvdyhsYWJlbE5hbWUsIHRva2VuLCB0eXBlKTtcblxuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCIodHlwZSlcIjogdHlwZSxcbiAgICAgICAgICAgICAgICAgICAgXCIodG9rZW4pXCI6IHRva2VuLFxuICAgICAgICAgICAgICAgICAgICBcIih1bnVzZWQpXCI6IHRydWVcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIocGFyYW1zKVwiXS5wdXNoKGxhYmVsTmFtZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChoYXMoX2N1cnJlbnRbXCIodXNhZ2VzKVwiXSwgbGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgIHZhciB1c2FnZSA9IF9jdXJyZW50W1wiKHVzYWdlcylcIl1bbGFiZWxOYW1lXTtcbiAgICAgICAgICAgICAgICAvLyBpZiBpdHMgaW4gYSBzdWIgZnVuY3Rpb24gaXQgaXMgbm90IG5lY2Vzc2FyaWx5IGFuIGVycm9yLCBqdXN0IGxhdGVkZWZcbiAgICAgICAgICAgICAgICBpZiAodXNhZ2VbXCIob25seVVzZWRTdWJGdW5jdGlvbilcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgX2xhdGVkZWZXYXJuaW5nKHR5cGUsIGxhYmVsTmFtZSwgdG9rZW4pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgaXMgYSBjbGVhciBpbGxlZ2FsIHVzYWdlIGZvciBibG9jayBzY29wZWQgdmFyaWFibGVzXG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDU2XCIsIHRva2VuLCBsYWJlbE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICB2YWxpZGF0ZVBhcmFtczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvLyBUaGlzIG1ldGhvZCBvbmx5IGNvbmNlcm5zIGVycm9ycyBmb3IgZnVuY3Rpb24gcGFyYW1ldGVyc1xuICAgICAgICAgICAgaWYgKF9jdXJyZW50RnVuY3RCb2R5W1wiKHR5cGUpXCJdID09PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgaXNTdHJpY3QgPSBzdGF0ZS5pc1N0cmljdCgpO1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRGdW5jdFBhcmFtU2NvcGUgPSBfY3VycmVudEZ1bmN0Qm9keVtcIihwYXJlbnQpXCJdO1xuXG4gICAgICAgICAgICBpZiAoIWN1cnJlbnRGdW5jdFBhcmFtU2NvcGVbXCIocGFyYW1zKVwiXSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY3VycmVudEZ1bmN0UGFyYW1TY29wZVtcIihwYXJhbXMpXCJdLmZvckVhY2goZnVuY3Rpb24obGFiZWxOYW1lKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxhYmVsID0gY3VycmVudEZ1bmN0UGFyYW1TY29wZVtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV07XG5cbiAgICAgICAgICAgICAgICBpZiAobGFiZWwgJiYgbGFiZWwuZHVwbGljYXRlZCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNTdHJpY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDExXCIsIGxhYmVsW1wiKHRva2VuKVwiXSwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5vcHRpb24uc2hhZG93ICE9PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwNFwiLCBsYWJlbFtcIih0b2tlbilcIl0sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXRVc2VkT3JEZWZpbmVkR2xvYmFsczogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAvLyBqc2hpbnQgcHJvdG86IHRydWVcbiAgICAgICAgICAgIHZhciBsaXN0ID0gT2JqZWN0LmtleXModXNlZFByZWRlZmluZWRBbmRHbG9iYWxzKTtcblxuICAgICAgICAgICAgLy8gSWYgYF9fcHJvdG9fX2AgaXMgdXNlZCBhcyBhIGdsb2JhbCB2YXJpYWJsZSBuYW1lLCBpdHMgZW50cnkgaW4gdGhlXG4gICAgICAgICAgICAvLyBsb29rdXAgdGFibGUgbWF5IG5vdCBiZSBlbnVtZXJhdGVkIGJ5IGBPYmplY3Qua2V5c2AgKGRlcGVuZGluZyBvbiB0aGVcbiAgICAgICAgICAgIC8vIGVudmlyb25tZW50KS5cbiAgICAgICAgICAgIGlmICh1c2VkUHJlZGVmaW5lZEFuZEdsb2JhbHMuX19wcm90b19fID09PSBtYXJrZXIgJiZcbiAgICAgICAgICAgICAgICBsaXN0LmluZGV4T2YoXCJfX3Byb3RvX19cIikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgbGlzdC5wdXNoKFwiX19wcm90b19fXCIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbGlzdDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogR2V0cyBhbiBhcnJheSBvZiBpbXBsaWVkIGdsb2JhbHNcbiAgICAgICAgICogQHJldHVybnMge0FycmF5Ljx7IG5hbWU6IHN0cmluZywgbGluZTogQXJyYXkuPG51bWJlcj59Pn1cbiAgICAgICAgICovXG4gICAgICAgIGdldEltcGxpZWRHbG9iYWxzOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIGpzaGludCBwcm90bzogdHJ1ZVxuICAgICAgICAgICAgdmFyIHZhbHVlcyA9IHZhbHVlcyhpbXBsaWVkR2xvYmFscyk7XG4gICAgICAgICAgICB2YXIgaGFzUHJvdG8gPSBmYWxzZTtcblxuICAgICAgICAgICAgLy8gSWYgYF9fcHJvdG9fX2AgaXMgYW4gaW1wbGllZCBnbG9iYWwgdmFyaWFibGUsIGl0cyBlbnRyeSBpbiB0aGUgbG9va3VwXG4gICAgICAgICAgICAvLyB0YWJsZSBtYXkgbm90IGJlIGVudW1lcmF0ZWQgYnkgYF8udmFsdWVzYCAoZGVwZW5kaW5nIG9uIHRoZVxuICAgICAgICAgICAgLy8gZW52aXJvbm1lbnQpLlxuICAgICAgICAgICAgaWYgKGltcGxpZWRHbG9iYWxzLl9fcHJvdG9fXykge1xuICAgICAgICAgICAgICAgIGhhc1Byb3RvID0gdmFsdWVzLnNvbWUoZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm5hbWUgPT09IFwiX19wcm90b19fXCI7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWhhc1Byb3RvKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGltcGxpZWRHbG9iYWxzLl9fcHJvdG9fXyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdmFsdWVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXR1cm5zIGEgbGlzdCBvZiB1bnVzZWQgdmFyaWFibGVzXG4gICAgICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgICAgICovXG4gICAgICAgIGdldFVudXNlZHM6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHVudXNlZHM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaGFzOiBmdW5jdGlvbihsYWJlbE5hbWUsIHVudXNlZD8pIHtcbiAgICAgICAgICAgIHJldHVybiBCb29sZWFuKF9nZXRMYWJlbChsYWJlbE5hbWUpKTtcbiAgICAgICAgfSxcblxuICAgICAgICBsYWJlbHR5cGU6IGZ1bmN0aW9uKGxhYmVsTmFtZSkge1xuICAgICAgICAgICAgLy8gcmV0dXJucyBhIGxhYmVscyB0eXBlIG9yIG51bGwgaWYgbm90IHByZXNlbnRcbiAgICAgICAgICAgIHZhciBzY29wZUxhYmVscyA9IF9nZXRMYWJlbChsYWJlbE5hbWUpO1xuICAgICAgICAgICAgaWYgKHNjb3BlTGFiZWxzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlTGFiZWxzW2xhYmVsTmFtZV1bXCIodHlwZSlcIl07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogZm9yIHRoZSBleHBvcnRlZCBvcHRpb25zLCBpbmRpY2F0aW5nIGEgdmFyaWFibGUgaXMgdXNlZCBvdXRzaWRlIHRoZSBmaWxlXG4gICAgICAgICAqL1xuICAgICAgICBhZGRFeHBvcnRlZDogZnVuY3Rpb24obGFiZWxOYW1lKSB7XG4gICAgICAgICAgICB2YXIgZ2xvYmFsTGFiZWxzID0gX3Njb3BlU3RhY2tbMF1bXCIobGFiZWxzKVwiXTtcbiAgICAgICAgICAgIGlmIChoYXMoZGVjbGFyZWQsIGxhYmVsTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGRlY2xhcmVkIHRva2VuLCBzbyB3ZSBrbm93IGl0IGlzIHVzZWRcbiAgICAgICAgICAgICAgICBkZWxldGUgZGVjbGFyZWRbbGFiZWxOYW1lXTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzKGdsb2JhbExhYmVscywgbGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgIGdsb2JhbExhYmVsc1tsYWJlbE5hbWVdW1wiKHVudXNlZClcIl0gPSBmYWxzZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBfc2NvcGVTdGFjay5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc2NvcGUgPSBfc2NvcGVTdGFja1tpXTtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgYHNjb3BlLih0eXBlKWAgaXMgbm90IGRlZmluZWQsIGl0IGlzIGEgYmxvY2sgc2NvcGVcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY29wZVtcIih0eXBlKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhcyhzY29wZVtcIihsYWJlbHMpXCJdLCBsYWJlbE5hbWUpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIXNjb3BlW1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXVtcIihibG9ja3Njb3BlZClcIl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY29wZVtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV1bXCIodW51c2VkKVwiXSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGV4cG9ydGVkW2xhYmVsTmFtZV0gPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBNYXJrIGFuIGluZGVudGlmaWVyIGFzIGVzNiBtb2R1bGUgZXhwb3J0ZWRcbiAgICAgICAgICovXG4gICAgICAgIHNldEV4cG9ydGVkOiBmdW5jdGlvbihsYWJlbE5hbWUsIHRva2VuKSB7XG4gICAgICAgICAgICB0aGlzLmJsb2NrLnVzZShsYWJlbE5hbWUsIHRva2VuKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogYWRkcyBhbiBpbmRlbnRpZmllciB0byB0aGUgcmVsZXZhbnQgY3VycmVudCBzY29wZSBhbmQgY3JlYXRlcyB3YXJuaW5ncy9lcnJvcnMgYXMgbmVjZXNzYXJ5XG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsYWJlbE5hbWVcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IG9wdHNcbiAgICAgICAgICogQHBhcmFtIHtTdHJpbmd9IG9wdHMudHlwZSAtIHRoZSB0eXBlIG9mIHRoZSBsYWJlbCBlLmcuIFwicGFyYW1cIiwgXCJ2YXJcIiwgXCJsZXQsIFwiY29uc3RcIiwgXCJmdW5jdGlvblwiXG4gICAgICAgICAqIEBwYXJhbSB7VG9rZW59IG9wdHMudG9rZW4gLSB0aGUgdG9rZW4gcG9pbnRpbmcgYXQgdGhlIGRlY2xhcmF0aW9uXG4gICAgICAgICAqL1xuICAgICAgICBhZGRsYWJlbDogZnVuY3Rpb24obGFiZWxOYW1lLCBvcHRzKSB7XG5cbiAgICAgICAgICAgIHZhciB0eXBlID0gb3B0cy50eXBlO1xuICAgICAgICAgICAgdmFyIHRva2VuID0gb3B0cy50b2tlbjtcbiAgICAgICAgICAgIHZhciBpc2Jsb2Nrc2NvcGVkID0gdHlwZSA9PT0gXCJsZXRcIiB8fCB0eXBlID09PSBcImNvbnN0XCIgfHwgdHlwZSA9PT0gXCJjbGFzc1wiO1xuICAgICAgICAgICAgdmFyIGlzZXhwb3J0ZWQgPSAoaXNibG9ja3Njb3BlZCA/IF9jdXJyZW50IDogX2N1cnJlbnRGdW5jdEJvZHkpW1wiKHR5cGUpXCJdID09PSBcImdsb2JhbFwiICYmXG4gICAgICAgICAgICAgICAgaGFzKGV4cG9ydGVkLCBsYWJlbE5hbWUpO1xuXG4gICAgICAgICAgICAvLyBvdXRlciBzaGFkb3cgY2hlY2sgKGlubmVyIGlzIG9ubHkgb24gbm9uLWJsb2NrIHNjb3BlZClcbiAgICAgICAgICAgIF9jaGVja091dGVyU2hhZG93KGxhYmVsTmFtZSwgdG9rZW4sIHR5cGUpO1xuXG4gICAgICAgICAgICAvLyBpZiBpcyBibG9jayBzY29wZWQgKGxldCBvciBjb25zdClcbiAgICAgICAgICAgIGlmIChpc2Jsb2Nrc2NvcGVkKSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgZGVjbGFyZWRJbkN1cnJlbnRTY29wZSA9IF9jdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXTtcbiAgICAgICAgICAgICAgICAvLyBmb3IgYmxvY2sgc2NvcGVkIHZhcmlhYmxlcywgcGFyYW1zIGFyZSBzZWVuIGluIHRoZSBjdXJyZW50IHNjb3BlIGFzIHRoZSByb290IGZ1bmN0aW9uXG4gICAgICAgICAgICAgICAgLy8gc2NvcGUsIHNvIGNoZWNrIHRoZXNlIHRvby5cbiAgICAgICAgICAgICAgICBpZiAoIWRlY2xhcmVkSW5DdXJyZW50U2NvcGUgJiYgX2N1cnJlbnQgPT09IF9jdXJyZW50RnVuY3RCb2R5ICYmXG4gICAgICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKHR5cGUpXCJdICE9PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlY2xhcmVkSW5DdXJyZW50U2NvcGUgPSAhIV9jdXJyZW50RnVuY3RCb2R5W1wiKHBhcmVudClcIl1bXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGlmIGl0cyBub3QgYWxyZWFkeSBkZWZpbmVkICh3aGljaCBpcyBhbiBlcnJvciwgc28gaWdub3JlKSBhbmQgaXMgdXNlZCBpbiBURFpcbiAgICAgICAgICAgICAgICBpZiAoIWRlY2xhcmVkSW5DdXJyZW50U2NvcGUgJiYgX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB1c2FnZSA9IF9jdXJyZW50W1wiKHVzYWdlcylcIl1bbGFiZWxOYW1lXTtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgaXRzIGluIGEgc3ViIGZ1bmN0aW9uIGl0IGlzIG5vdCBuZWNlc3NhcmlseSBhbiBlcnJvciwganVzdCBsYXRlZGVmXG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2FnZVtcIihvbmx5VXNlZFN1YkZ1bmN0aW9uKVwiXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgX2xhdGVkZWZXYXJuaW5nKHR5cGUsIGxhYmVsTmFtZSwgdG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhpcyBpcyBhIGNsZWFyIGlsbGVnYWwgdXNhZ2UgZm9yIGJsb2NrIHNjb3BlZCB2YXJpYWJsZXNcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJFMDU2XCIsIHRva2VuLCBsYWJlbE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBzY29wZSBoYXMgdGhlIHZhcmlhYmxlIGRlZmluZWQsIGl0cyBhIHJlLWRlZmluaXRpb24gZXJyb3JcbiAgICAgICAgICAgICAgICBpZiAoZGVjbGFyZWRJbkN1cnJlbnRTY29wZSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAxMVwiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUub3B0aW9uLnNoYWRvdyA9PT0gXCJvdXRlclwiKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgc2hhZG93IGlzIG91dGVyLCBmb3IgYmxvY2sgc2NvcGUgd2Ugd2FudCB0byBkZXRlY3QgYW55IHNoYWRvd2luZyB3aXRoaW4gdGhpcyBmdW5jdGlvblxuICAgICAgICAgICAgICAgICAgICBpZiAoc2NvcGVNYW5hZ2VySW5zdC5mdW5jdC5oYXMobGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2FybmluZyhcIlcwMDRcIiwgdG9rZW4sIGxhYmVsTmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzY29wZU1hbmFnZXJJbnN0LmJsb2NrLmFkZChsYWJlbE5hbWUsIHR5cGUsIHRva2VuLCAhaXNleHBvcnRlZCk7XG5cbiAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICB2YXIgZGVjbGFyZWRJbkN1cnJlbnRGdW5jdGlvblNjb3BlID0gc2NvcGVNYW5hZ2VySW5zdC5mdW5jdC5oYXMobGFiZWxOYW1lKTtcblxuICAgICAgICAgICAgICAgIC8vIGNoZWNrIGZvciBsYXRlIGRlZmluaXRpb24sIGlnbm9yZSBpZiBhbHJlYWR5IGRlY2xhcmVkXG4gICAgICAgICAgICAgICAgaWYgKCFkZWNsYXJlZEluQ3VycmVudEZ1bmN0aW9uU2NvcGUgJiYgdXNlZFNvRmFySW5DdXJyZW50RnVuY3Rpb24obGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICBfbGF0ZWRlZldhcm5pbmcodHlwZSwgbGFiZWxOYW1lLCB0b2tlbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gZGVmaW5pbmcgd2l0aCBhIHZhciBvciBhIGZ1bmN0aW9uIHdoZW4gYSBibG9jayBzY29wZSB2YXJpYWJsZSBvZiB0aGUgc2FtZSBuYW1lXG4gICAgICAgICAgICAgICAgLy8gaXMgaW4gc2NvcGUgaXMgYW4gZXJyb3JcbiAgICAgICAgICAgICAgICBpZiAoc2NvcGVNYW5hZ2VySW5zdC5mdW5jdC5oYXMobGFiZWxOYW1lLCB7IG9ubHlCbG9ja3Njb3BlZDogdHJ1ZSB9KSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAxMVwiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLm9wdGlvbi5zaGFkb3cgIT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gbm93IHNpbmNlIHdlIGRpZG4ndCBnZXQgYW55IGJsb2NrIHNjb3BlIHZhcmlhYmxlcywgdGVzdCBmb3IgdmFyL2Z1bmN0aW9uXG4gICAgICAgICAgICAgICAgICAgIC8vIHNoYWRvd2luZ1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGVjbGFyZWRJbkN1cnJlbnRGdW5jdGlvblNjb3BlICYmIGxhYmVsTmFtZSAhPT0gXCJfX3Byb3RvX19cIikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2pzaGludC9qc2hpbnQvaXNzdWVzLzI0MDBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChfY3VycmVudEZ1bmN0Qm9keVtcIih0eXBlKVwiXSAhPT0gXCJnbG9iYWxcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhcm5pbmcoXCJXMDA0XCIsIHRva2VuLCBsYWJlbE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc2NvcGVNYW5hZ2VySW5zdC5mdW5jdC5hZGQobGFiZWxOYW1lLCB0eXBlLCB0b2tlbiwgIWlzZXhwb3J0ZWQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKF9jdXJyZW50RnVuY3RCb2R5W1wiKHR5cGUpXCJdID09PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHVzZWRQcmVkZWZpbmVkQW5kR2xvYmFsc1tsYWJlbE5hbWVdID0gbWFya2VyO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBmdW5jdDoge1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBSZXR1cm5zIHRoZSBsYWJlbCB0eXBlIGdpdmVuIGNlcnRhaW4gb3B0aW9uc1xuICAgICAgICAgICAgICogQHBhcmFtIGxhYmVsTmFtZVxuICAgICAgICAgICAgICogQHBhcmFtIHtPYmplY3Q9fSBvcHRpb25zXG4gICAgICAgICAgICAgKiBAcGFyYW0ge0Jvb2xlYW49fSBvcHRpb25zLm9ubHlCbG9ja3Njb3BlZCAtIG9ubHkgaW5jbHVkZSBibG9jayBzY29wZWQgbGFiZWxzXG4gICAgICAgICAgICAgKiBAcGFyYW0ge0Jvb2xlYW49fSBvcHRpb25zLmV4Y2x1ZGVQYXJhbXMgLSBleGNsdWRlIHRoZSBwYXJhbSBzY29wZVxuICAgICAgICAgICAgICogQHBhcmFtIHtCb29sZWFuPX0gb3B0aW9ucy5leGNsdWRlQ3VycmVudCAtIGV4Y2x1ZGUgdGhlIGN1cnJlbnQgc2NvcGVcbiAgICAgICAgICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGxhYmVsdHlwZTogZnVuY3Rpb24obGFiZWxOYW1lLCBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9ubHlCbG9ja3Njb3BlZCA9IG9wdGlvbnMgJiYgb3B0aW9ucy5vbmx5QmxvY2tzY29wZWQ7XG4gICAgICAgICAgICAgICAgdmFyIGV4Y2x1ZGVQYXJhbXMgPSBvcHRpb25zICYmIG9wdGlvbnMuZXhjbHVkZVBhcmFtcztcbiAgICAgICAgICAgICAgICB2YXIgY3VycmVudFNjb3BlSW5kZXggPSBfc2NvcGVTdGFjay5sZW5ndGggLSAob3B0aW9ucyAmJiBvcHRpb25zLmV4Y2x1ZGVDdXJyZW50ID8gMiA6IDEpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBjdXJyZW50U2NvcGVJbmRleDsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBfc2NvcGVTdGFja1tpXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAoIW9ubHlCbG9ja3Njb3BlZCB8fCBjdXJyZW50W1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXVtcIihibG9ja3Njb3BlZClcIl0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY3VycmVudFtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV1bXCIodHlwZSlcIl07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdmFyIHNjb3BlQ2hlY2sgPSBleGNsdWRlUGFyYW1zID8gX3Njb3BlU3RhY2tbaSAtIDFdIDogY3VycmVudDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjb3BlQ2hlY2sgJiYgc2NvcGVDaGVja1tcIih0eXBlKVwiXSA9PT0gXCJmdW5jdGlvbnBhcmFtc1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIFJldHVybnMgaWYgYSBicmVhayBsYWJlbCBleGlzdHMgaW4gdGhlIGZ1bmN0aW9uIHNjb3BlXG4gICAgICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbGFiZWxOYW1lXG4gICAgICAgICAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaGFzQnJlYWtMYWJlbDogZnVuY3Rpb24obGFiZWxOYW1lKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IF9zY29wZVN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdXJyZW50ID0gX3Njb3BlU3RhY2tbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRbXCIoYnJlYWtMYWJlbHMpXCJdW2xhYmVsTmFtZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50W1wiKHR5cGUpXCJdID09PSBcImZ1bmN0aW9ucGFyYW1zXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBSZXR1cm5zIGlmIHRoZSBsYWJlbCBpcyBpbiB0aGUgY3VycmVudCBmdW5jdGlvbiBzY29wZVxuICAgICAgICAgICAgICogU2VlIHNjb3BlTWFuYWdlci5mdW5jdC5sYWJlbFR5cGUgZm9yIG9wdGlvbnNcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgaGFzOiBmdW5jdGlvbihsYWJlbE5hbWU6IHN0cmluZywgb3B0aW9ucz8pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gQm9vbGVhbih0aGlzLmxhYmVsdHlwZShsYWJlbE5hbWUsIG9wdGlvbnMpKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQWRkcyBhIG5ldyBmdW5jdGlvbiBzY29wZWQgdmFyaWFibGVcbiAgICAgICAgICAgICAqIHNlZSBibG9jay5hZGQgZm9yIGJsb2NrIHNjb3BlZFxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBhZGQ6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdHlwZSwgdG9rLCB1bnVzZWQpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgICAgIFwiKHR5cGUpXCI6IHR5cGUsXG4gICAgICAgICAgICAgICAgICAgIFwiKHRva2VuKVwiOiB0b2ssXG4gICAgICAgICAgICAgICAgICAgIFwiKGJsb2Nrc2NvcGVkKVwiOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgXCIoZnVuY3Rpb24pXCI6IF9jdXJyZW50RnVuY3RCb2R5LFxuICAgICAgICAgICAgICAgICAgICBcIih1bnVzZWQpXCI6IHVudXNlZFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgYmxvY2s6IHtcblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBpcyB0aGUgY3VycmVudCBibG9jayBnbG9iYWw/XG4gICAgICAgICAgICAgKiBAcmV0dXJucyBCb29sZWFuXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGlzR2xvYmFsOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gX2N1cnJlbnRbXCIodHlwZSlcIl0gPT09IFwiZ2xvYmFsXCI7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICB1c2U6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdG9rZW4pIHtcblxuICAgICAgICAgICAgICAgIC8vIGlmIHJlc29sdmVzIHRvIGN1cnJlbnQgZnVuY3Rpb24gcGFyYW1zLCB0aGVuIGRvIG5vdCBzdG9yZSB1c2FnZSBqdXN0IHJlc29sdmVcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIGJlY2F1c2UgZnVuY3Rpb24oYSkgeyB2YXIgYTsgYSA9IGE7IH0gd2lsbCByZXNvbHZlIHRvIHRoZSBwYXJhbSwgbm90XG4gICAgICAgICAgICAgICAgLy8gdG8gdGhlIHVuc2V0IHZhclxuICAgICAgICAgICAgICAgIC8vIGZpcnN0IGNoZWNrIHRoZSBwYXJhbSBpcyB1c2VkXG4gICAgICAgICAgICAgICAgdmFyIHBhcmFtU2NvcGUgPSBfY3VycmVudEZ1bmN0Qm9keVtcIihwYXJlbnQpXCJdO1xuICAgICAgICAgICAgICAgIGlmIChwYXJhbVNjb3BlICYmIHBhcmFtU2NvcGVbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdICYmXG4gICAgICAgICAgICAgICAgICAgIHBhcmFtU2NvcGVbXCIobGFiZWxzKVwiXVtsYWJlbE5hbWVdW1wiKHR5cGUpXCJdID09PSBcInBhcmFtXCIpIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyB0aGVuIGNoZWNrIGl0cyBub3QgZGVjbGFyZWQgYnkgYSBibG9jayBzY29wZSB2YXJpYWJsZVxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlTWFuYWdlckluc3QuZnVuY3QuaGFzKGxhYmVsTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgZXhjbHVkZVBhcmFtczogdHJ1ZSwgb25seUJsb2Nrc2NvcGVkOiB0cnVlIH0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJhbVNjb3BlW1wiKGxhYmVscylcIl1bbGFiZWxOYW1lXVtcIih1bnVzZWQpXCJdID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgKHN0YXRlLmlnbm9yZWQuVzExNyB8fCBzdGF0ZS5vcHRpb24udW5kZWYgPT09IGZhbHNlKSkge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbi5pZ25vcmVVbmRlZiA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgX3NldHVwVXNhZ2VzKGxhYmVsTmFtZSk7XG5cbiAgICAgICAgICAgICAgICBpZiAodG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW5bXCIoZnVuY3Rpb24pXCJdID0gX2N1cnJlbnRGdW5jdEJvZHk7XG4gICAgICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKHVzYWdlcylcIl1bbGFiZWxOYW1lXVtcIih0b2tlbnMpXCJdLnB1c2godG9rZW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHJlYXNzaWduOiBmdW5jdGlvbihsYWJlbE5hbWUsIHRva2VuKSB7XG4gICAgICAgICAgICAgICAgdG9rZW4uaWdub3JlVzAyMCA9IHN0YXRlLmlnbm9yZWQuVzAyMDtcbiAgICAgICAgICAgICAgICB0b2tlbi5pZ25vcmVXMDIxID0gc3RhdGUuaWdub3JlZC5XMDIxO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5tb2RpZnkobGFiZWxOYW1lLCB0b2tlbik7XG5cbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIih1c2FnZXMpXCJdW2xhYmVsTmFtZV1bXCIocmVhc3NpZ25lZClcIl0ucHVzaCh0b2tlbik7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBtb2RpZnk6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdG9rZW4pIHtcblxuICAgICAgICAgICAgICAgIF9zZXR1cFVzYWdlcyhsYWJlbE5hbWUpO1xuXG4gICAgICAgICAgICAgICAgX2N1cnJlbnRbXCIodXNhZ2VzKVwiXVtsYWJlbE5hbWVdW1wiKG1vZGlmaWVkKVwiXS5wdXNoKHRva2VuKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQWRkcyBhIG5ldyB2YXJpYWJsZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBhZGQ6IGZ1bmN0aW9uKGxhYmVsTmFtZSwgdHlwZSwgdG9rLCB1bnVzZWQpIHtcbiAgICAgICAgICAgICAgICBfY3VycmVudFtcIihsYWJlbHMpXCJdW2xhYmVsTmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgICAgIFwiKHR5cGUpXCI6IHR5cGUsXG4gICAgICAgICAgICAgICAgICAgIFwiKHRva2VuKVwiOiB0b2ssXG4gICAgICAgICAgICAgICAgICAgIFwiKGJsb2Nrc2NvcGVkKVwiOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBcIih1bnVzZWQpXCI6IHVudXNlZFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBhZGRCcmVha0xhYmVsOiBmdW5jdGlvbihsYWJlbE5hbWUsIG9wdHMpIHtcbiAgICAgICAgICAgICAgICB2YXIgdG9rZW4gPSBvcHRzLnRva2VuO1xuICAgICAgICAgICAgICAgIGlmIChzY29wZU1hbmFnZXJJbnN0LmZ1bmN0Lmhhc0JyZWFrTGFiZWwobGFiZWxOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiRTAxMVwiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc3RhdGUub3B0aW9uLnNoYWRvdyA9PT0gXCJvdXRlclwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzY29wZU1hbmFnZXJJbnN0LmZ1bmN0LmhhcyhsYWJlbE5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nKFwiVzAwNFwiLCB0b2tlbiwgbGFiZWxOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9jaGVja091dGVyU2hhZG93KGxhYmVsTmFtZSwgdG9rZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIF9jdXJyZW50W1wiKGJyZWFrTGFiZWxzKVwiXVtsYWJlbE5hbWVdID0gdG9rZW47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBzY29wZU1hbmFnZXJJbnN0O1xufTtcbiJdfQ==