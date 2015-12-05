var asserts = require('./asserts');
var astnodes = require('./astnodes');
var base = require('./base');
var numericLiteral = require('./numericLiteral');
var tables = require('./tables');
var Tokenizer = require('./Tokenizer');
var ParseTables = tables.ParseTables;
var SYM = ParseTables.sym;
var TOK = Tokenizer.Tokens;
var LONG_THRESHOLD = Math.pow(2, 53);
function syntaxError(message, fileName, lineNumber) {
    asserts.assert(base.isString(message), "message must be a string");
    asserts.assert(base.isString(fileName), "fileName must be a string");
    asserts.assert(base.isNumber(lineNumber), "lineNumber must be a number");
    var e = new SyntaxError(message);
    e['fileName'] = fileName;
    e['lineNumber'] = lineNumber;
    return e;
}
var Compiling = (function () {
    function Compiling(encoding, filename) {
        this.c_encoding = encoding;
        this.c_filename = filename;
    }
    return Compiling;
})();
function NCH(n) {
    asserts.assert(n !== undefined);
    if (n.children === null)
        return 0;
    return n.children.length;
}
function CHILD(n, i) {
    asserts.assert(n !== undefined);
    asserts.assert(i !== undefined);
    return n.children[i];
}
function REQ(n, type) {
    asserts.assert(n.type === type, "node wasn't expected type");
}
function strobj(s) {
    asserts.assert(typeof s === "string", "expecting string, got " + (typeof s));
    return s;
}
function numStmts(n) {
    switch (n.type) {
        case SYM.single_input:
            if (CHILD(n, 0).type === TOK.T_NEWLINE)
                return 0;
            else
                return numStmts(CHILD(n, 0));
        case SYM.file_input:
            var cnt = 0;
            for (var i = 0; i < NCH(n); ++i) {
                var ch = CHILD(n, i);
                if (ch.type === SYM.stmt)
                    cnt += numStmts(ch);
            }
            return cnt;
        case SYM.stmt:
            return numStmts(CHILD(n, 0));
        case SYM.compound_stmt:
            return 1;
        case SYM.simple_stmt:
            return Math.floor(NCH(n) / 2);
        case SYM.suite:
            if (NCH(n) === 1)
                return numStmts(CHILD(n, 0));
            else {
                var cnt = 0;
                for (var i = 2; i < NCH(n) - 1; ++i)
                    cnt += numStmts(CHILD(n, i));
                return cnt;
            }
        default:
            asserts.fail("Non-statement found");
    }
    return 0;
}
function forbiddenCheck(c, n, x, lineno) {
    if (x === "None")
        throw syntaxError("assignment to None", c.c_filename, lineno);
    if (x === "True" || x === "False")
        throw syntaxError("assignment to True or False is forbidden", c.c_filename, lineno);
}
function setContext(c, e, ctx, n) {
    asserts.assert(ctx !== astnodes.AugStore && ctx !== astnodes.AugLoad);
    var s = null;
    var exprName = null;
    switch (e.constructor) {
        case astnodes.Attribute:
        case astnodes.Name:
            if (ctx === astnodes.Store)
                forbiddenCheck(c, n, e.attr, n.lineno);
            e.ctx = ctx;
            break;
        case astnodes.Subscript:
            e.ctx = ctx;
            break;
        case astnodes.List:
            e.ctx = ctx;
            s = e.elts;
            break;
        case astnodes.Tuple:
            if (e.elts.length === 0)
                throw syntaxError("can't assign to ()", c.c_filename, n.lineno);
            e.ctx = ctx;
            s = e.elts;
            break;
        case astnodes.Lambda:
            exprName = "lambda";
            break;
        case astnodes.Call:
            exprName = "function call";
            break;
        case astnodes.BoolOp:
        case astnodes.BinOp:
        case astnodes.UnaryOp:
            exprName = "operator";
            break;
        case astnodes.GeneratorExp:
            exprName = "generator expression";
            break;
        case astnodes.Yield:
            exprName = "yield expression";
            break;
        case astnodes.ListComp:
            exprName = "list comprehension";
            break;
        case astnodes.Dict:
        case astnodes.Num:
        case astnodes.Str:
            exprName = "literal";
            break;
        case astnodes.Compare:
            exprName = "comparison expression";
            break;
        case astnodes.IfExp:
            exprName = "conditional expression";
            break;
        default:
            asserts.fail("unhandled expression in assignment");
    }
    if (exprName) {
        throw syntaxError("can't " + (ctx === astnodes.Store ? "assign to" : "delete") + " " + exprName, c.c_filename, n.lineno);
    }
    if (s) {
        for (var i = 0; i < s.length; ++i) {
            setContext(c, s[i], ctx, n);
        }
    }
}
var operatorMap = {};
(function () {
    operatorMap[TOK.T_VBAR] = astnodes.BitOr;
    operatorMap[TOK.T_VBAR] = astnodes.BitOr;
    operatorMap[TOK.T_CIRCUMFLEX] = astnodes.BitXor;
    operatorMap[TOK.T_AMPER] = astnodes.BitAnd;
    operatorMap[TOK.T_LEFTSHIFT] = astnodes.LShift;
    operatorMap[TOK.T_RIGHTSHIFT] = astnodes.RShift;
    operatorMap[TOK.T_PLUS] = astnodes.Add;
    operatorMap[TOK.T_MINUS] = astnodes.Sub;
    operatorMap[TOK.T_STAR] = astnodes.Mult;
    operatorMap[TOK.T_SLASH] = astnodes.Div;
    operatorMap[TOK.T_DOUBLESLASH] = astnodes.FloorDiv;
    operatorMap[TOK.T_PERCENT] = astnodes.Mod;
}());
function getOperator(n) {
    asserts.assert(operatorMap[n.type] !== undefined);
    return operatorMap[n.type];
}
function astForCompOp(c, n) {
    REQ(n, SYM.comp_op);
    if (NCH(n) === 1) {
        n = CHILD(n, 0);
        switch (n.type) {
            case TOK.T_LESS: return astnodes.Lt;
            case TOK.T_GREATER: return astnodes.Gt;
            case TOK.T_EQEQUAL: return astnodes.Eq;
            case TOK.T_LESSEQUAL: return astnodes.LtE;
            case TOK.T_GREATEREQUAL: return astnodes.GtE;
            case TOK.T_NOTEQUAL: return astnodes.NotEq;
            case TOK.T_NAME:
                if (n.value === "in")
                    return astnodes.In_;
                if (n.value === "is")
                    return astnodes.Is;
        }
    }
    else if (NCH(n) === 2) {
        if (CHILD(n, 0).type === TOK.T_NAME) {
            if (CHILD(n, 1).value === "in")
                return astnodes.NotIn;
            if (CHILD(n, 0).value === "is")
                return astnodes.IsNot;
        }
    }
    asserts.fail("invalid comp_op");
}
function seqForTestlist(c, n) {
    asserts.assert(n.type === SYM.testlist ||
        n.type === SYM.listmaker ||
        n.type === SYM.testlist_gexp ||
        n.type === SYM.testlist_safe ||
        n.type === SYM.testlist1);
    var seq = [];
    for (var i = 0; i < NCH(n); i += 2) {
        asserts.assert(CHILD(n, i).type === SYM.IfExpr || CHILD(n, i).type === SYM.old_test);
        seq[i / 2] = astForExpr(c, CHILD(n, i));
    }
    return seq;
}
function astForSuite(c, n) {
    REQ(n, SYM.suite);
    var seq = [];
    var pos = 0;
    var ch;
    if (CHILD(n, 0).type === SYM.simple_stmt) {
        n = CHILD(n, 0);
        var end = NCH(n) - 1;
        if (CHILD(n, end - 1).type === TOK.T_SEMI)
            end -= 1;
        for (var i = 0; i < end; i += 2)
            seq[pos++] = astForStmt(c, CHILD(n, i));
    }
    else {
        for (var i = 2; i < NCH(n) - 1; ++i) {
            ch = CHILD(n, i);
            REQ(ch, SYM.stmt);
            var num = numStmts(ch);
            if (num === 1) {
                seq[pos++] = astForStmt(c, ch);
            }
            else {
                ch = CHILD(ch, 0);
                REQ(ch, SYM.simple_stmt);
                for (var j = 0; j < NCH(ch); j += 2) {
                    if (NCH(CHILD(ch, j)) === 0) {
                        asserts.assert(j + 1 === NCH(ch));
                        break;
                    }
                    seq[pos++] = astForStmt(c, CHILD(ch, j));
                }
            }
        }
    }
    asserts.assert(pos === numStmts(n));
    return seq;
}
function astForExceptClause(c, exc, body) {
    REQ(exc, SYM.except_clause);
    REQ(body, SYM.suite);
    if (NCH(exc) === 1)
        return new astnodes.ExceptHandler(null, null, astForSuite(c, body), exc.lineno, exc.col_offset);
    else if (NCH(exc) === 2)
        return new astnodes.ExceptHandler(astForExpr(c, CHILD(exc, 1)), null, astForSuite(c, body), exc.lineno, exc.col_offset);
    else if (NCH(exc) === 4) {
        var e = astForExpr(c, CHILD(exc, 3));
        setContext(c, e, astnodes.Store, CHILD(exc, 3));
        return new astnodes.ExceptHandler(astForExpr(c, CHILD(exc, 1)), e, astForSuite(c, body), exc.lineno, exc.col_offset);
    }
    asserts.fail("wrong number of children for except clause");
}
function astForTryStmt(c, n) {
    var nc = NCH(n);
    var nexcept = (nc - 3) / 3;
    var body, orelse = [], finally_ = null;
    REQ(n, SYM.try_stmt);
    body = astForSuite(c, CHILD(n, 2));
    if (CHILD(n, nc - 3).type === TOK.T_NAME) {
        if (CHILD(n, nc - 3).value === "finally") {
            if (nc >= 9 && CHILD(n, nc - 6).type === TOK.T_NAME) {
                orelse = astForSuite(c, CHILD(n, nc - 4));
                nexcept--;
            }
            finally_ = astForSuite(c, CHILD(n, nc - 1));
            nexcept--;
        }
        else {
            orelse = astForSuite(c, CHILD(n, nc - 1));
            nexcept--;
        }
    }
    else if (CHILD(n, nc - 3).type !== SYM.except_clause) {
        throw syntaxError("malformed 'try' statement", c.c_filename, n.lineno);
    }
    if (nexcept > 0) {
        var handlers = [];
        for (var i = 0; i < nexcept; ++i)
            handlers[i] = astForExceptClause(c, CHILD(n, 3 + i * 3), CHILD(n, 5 + i * 3));
        var exceptSt = new astnodes.TryExcept(body, handlers, orelse, n.lineno, n.col_offset);
        if (!finally_)
            return exceptSt;
        body = [exceptSt];
    }
    asserts.assert(finally_ !== null);
    return new astnodes.TryFinally(body, finally_, n.lineno, n.col_offset);
}
function astForDottedName(c, n) {
    REQ(n, SYM.dotted_name);
    var lineno = n.lineno;
    var col_offset = n.col_offset;
    var id = strobj(CHILD(n, 0).value);
    var e = new astnodes.Name(id, astnodes.Load, lineno, col_offset);
    for (var i = 2; i < NCH(n); i += 2) {
        id = strobj(CHILD(n, i).value);
        e = new astnodes.Attribute(e, id, astnodes.Load, lineno, col_offset);
    }
    return e;
}
function astForDecorator(c, n) {
    REQ(n, SYM.decorator);
    REQ(CHILD(n, 0), TOK.T_AT);
    REQ(CHILD(n, NCH(n) - 1), TOK.T_NEWLINE);
    var nameExpr = astForDottedName(c, CHILD(n, 1));
    var d;
    if (NCH(n) === 3)
        return nameExpr;
    else if (NCH(n) === 5)
        return new astnodes.Call(nameExpr, [], [], null, null, n.lineno, n.col_offset);
    else
        return astForCall(c, CHILD(n, 3), nameExpr);
}
function astForDecorators(c, n) {
    REQ(n, SYM.decorators);
    var decoratorSeq = [];
    for (var i = 0; i < NCH(n); ++i)
        decoratorSeq[i] = astForDecorator(c, CHILD(n, i));
    return decoratorSeq;
}
function astForDecorated(c, n) {
    REQ(n, SYM.decorated);
    var decoratorSeq = astForDecorators(c, CHILD(n, 0));
    asserts.assert(CHILD(n, 1).type === SYM.funcdef || CHILD(n, 1).type === SYM.classdef);
    var thing = null;
    if (CHILD(n, 1).type === SYM.funcdef)
        thing = astForFuncdef(c, CHILD(n, 1), decoratorSeq);
    else if (CHILD(n, 1).type === SYM.classdef)
        thing = astForClassdef(c, CHILD(n, 1), decoratorSeq);
    if (thing) {
        thing.lineno = n.lineno;
        thing.col_offset = n.col_offset;
    }
    return thing;
}
function astForWithVar(c, n) {
    REQ(n, SYM.with_var);
    return astForExpr(c, CHILD(n, 1));
}
function astForWithStmt(c, n) {
    var suiteIndex = 3;
    asserts.assert(n.type === SYM.with_stmt);
    var contextExpr = astForExpr(c, CHILD(n, 1));
    if (CHILD(n, 2).type === SYM.with_var) {
        var optionalVars = astForWithVar(c, CHILD(n, 2));
        setContext(c, optionalVars, astnodes.Store, n);
        suiteIndex = 4;
    }
    return new astnodes.With_(contextExpr, optionalVars, astForSuite(c, CHILD(n, suiteIndex)), n.lineno, n.col_offset);
}
function astForExecStmt(c, n) {
    var expr1;
    var globals = null, locals = null;
    var nchildren = NCH(n);
    asserts.assert(nchildren === 2 || nchildren === 4 || nchildren === 6);
    REQ(n, SYM.exec_stmt);
    var expr1 = astForExpr(c, CHILD(n, 1));
    if (nchildren >= 4)
        globals = astForExpr(c, CHILD(n, 3));
    if (nchildren === 6)
        locals = astForExpr(c, CHILD(n, 5));
    return new astnodes.Exec(expr1, globals, locals, n.lineno, n.col_offset);
}
function astForIfStmt(c, n) {
    REQ(n, SYM.if_stmt);
    if (NCH(n) === 4)
        return new astnodes.If_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), [], n.lineno, n.col_offset);
    var s = CHILD(n, 4).value;
    var decider = s.charAt(2);
    if (decider === 's') {
        return new astnodes.If_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), astForSuite(c, CHILD(n, 6)), n.lineno, n.col_offset);
    }
    else if (decider === 'i') {
        var nElif = NCH(n) - 4;
        var hasElse = false;
        var orelse = [];
        if (CHILD(n, nElif + 1).type === TOK.T_NAME && CHILD(n, nElif + 1).value.charAt(2) === 's') {
            hasElse = true;
            nElif -= 3;
        }
        nElif /= 4;
        if (hasElse) {
            orelse = [
                new astnodes.If_(astForExpr(c, CHILD(n, NCH(n) - 6)), astForSuite(c, CHILD(n, NCH(n) - 4)), astForSuite(c, CHILD(n, NCH(n) - 1)), CHILD(n, NCH(n) - 6).lineno, CHILD(n, NCH(n) - 6).col_offset)];
            nElif--;
        }
        for (var i = 0; i < nElif; ++i) {
            var off = 5 + (nElif - i - 1) * 4;
            orelse = [
                new astnodes.If_(astForExpr(c, CHILD(n, off)), astForSuite(c, CHILD(n, off + 2)), orelse, CHILD(n, off).lineno, CHILD(n, off).col_offset)];
        }
        return new astnodes.If_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), orelse, n.lineno, n.col_offset);
    }
    asserts.fail("unexpected token in 'if' statement");
}
function astForExprlist(c, n, context) {
    REQ(n, SYM.ExprList);
    var seq = [];
    for (var i = 0; i < NCH(n); i += 2) {
        var e = astForExpr(c, CHILD(n, i));
        seq[i / 2] = e;
        if (context)
            setContext(c, e, context, CHILD(n, i));
    }
    return seq;
}
function astForDelStmt(c, n) {
    REQ(n, SYM.del_stmt);
    return new astnodes.Delete_(astForExprlist(c, CHILD(n, 1), astnodes.Del), n.lineno, n.col_offset);
}
function astForGlobalStmt(c, n) {
    REQ(n, SYM.GlobalStmt);
    var s = [];
    for (var i = 1; i < NCH(n); i += 2) {
        s[(i - 1) / 2] = strobj(CHILD(n, i).value);
    }
    return new astnodes.Global(s, n.lineno, n.col_offset);
}
function astForNonLocalStmt(c, n) {
    REQ(n, SYM.NonLocalStmt);
    var s = [];
    for (var i = 1; i < NCH(n); i += 2) {
        s[(i - 1) / 2] = strobj(CHILD(n, i).value);
    }
    return new astnodes.NonLocal(s, n.lineno, n.col_offset);
}
function astForAssertStmt(c, n) {
    REQ(n, SYM.assert_stmt);
    if (NCH(n) === 2)
        return new astnodes.Assert(astForExpr(c, CHILD(n, 1)), null, n.lineno, n.col_offset);
    else if (NCH(n) === 4)
        return new astnodes.Assert(astForExpr(c, CHILD(n, 1)), astForExpr(c, CHILD(n, 3)), n.lineno, n.col_offset);
    asserts.fail("improper number of parts to assert stmt");
}
function aliasForImportName(c, n) {
    loop: while (true) {
        switch (n.type) {
            case SYM.import_as_name:
                var str = null;
                var name = strobj(CHILD(n, 0).value);
                if (NCH(n) === 3)
                    str = CHILD(n, 2).value;
                return new astnodes.Alias(name, str == null ? null : strobj(str));
            case SYM.dotted_as_name:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue loop;
                }
                else {
                    var a = aliasForImportName(c, CHILD(n, 0));
                    asserts.assert(!a.asname);
                    a.asname = strobj(CHILD(n, 2).value);
                    return a;
                }
            case SYM.dotted_name:
                if (NCH(n) === 1)
                    return new astnodes.Alias(strobj(CHILD(n, 0).value), null);
                else {
                    var str = '';
                    for (var i = 0; i < NCH(n); i += 2)
                        str += CHILD(n, i).value + ".";
                    return new astnodes.Alias(strobj(str.substr(0, str.length - 1)), null);
                }
            case TOK.T_STAR:
                return new astnodes.Alias(strobj("*"), null);
            default:
                throw syntaxError("unexpected import name", c.c_filename, n.lineno);
        }
        break;
    }
}
function astForImportStmt(c, n) {
    REQ(n, SYM.import_stmt);
    var lineno = n.lineno;
    var col_offset = n.col_offset;
    n = CHILD(n, 0);
    if (n.type === SYM.import_name) {
        n = CHILD(n, 1);
        REQ(n, SYM.dotted_as_names);
        var aliases = [];
        for (var i = 0; i < NCH(n); i += 2)
            aliases[i / 2] = aliasForImportName(c, CHILD(n, i));
        return new astnodes.Import_(aliases, lineno, col_offset);
    }
    else if (n.type === SYM.import_from) {
        var mod = null;
        var ndots = 0;
        var nchildren;
        for (var idx = 1; idx < NCH(n); ++idx) {
            if (CHILD(n, idx).type === SYM.dotted_name) {
                mod = aliasForImportName(c, CHILD(n, idx));
                idx++;
                break;
            }
            else if (CHILD(n, idx).type !== TOK.T_DOT)
                break;
            ndots++;
        }
        ++idx;
        switch (CHILD(n, idx).type) {
            case TOK.T_STAR:
                n = CHILD(n, idx);
                nchildren = 1;
                break;
            case TOK.T_LPAR:
                n = CHILD(n, idx + 1);
                nchildren = NCH(n);
                break;
            case SYM.import_as_names:
                n = CHILD(n, idx);
                nchildren = NCH(n);
                if (nchildren % 2 === 0)
                    throw syntaxError("trailing comma not allowed without surrounding parentheses", c.c_filename, n.lineno);
                break;
            default:
                throw syntaxError("Unexpected node-type in from-import", c.c_filename, n.lineno);
        }
        var aliases = [];
        if (n.type === TOK.T_STAR)
            aliases[0] = aliasForImportName(c, n);
        else
            for (var i = 0; i < NCH(n); i += 2)
                aliases[i / 2] = aliasForImportName(c, CHILD(n, i));
        var modname = mod ? mod.name : "";
        return new astnodes.ImportFrom(strobj(modname), aliases, ndots, lineno, col_offset);
    }
    throw syntaxError("unknown import statement", c.c_filename, n.lineno);
}
function astForTestlistGexp(c, n) {
    asserts.assert(n.type === SYM.testlist_gexp || n.type === SYM.argument);
    if (NCH(n) > 1 && CHILD(n, 1).type === SYM.gen_for)
        return astForGenexp(c, n);
    return astForTestlist(c, n);
}
function astForListcomp(c, n) {
    function countListFors(c, n) {
        var nfors = 0;
        var ch = CHILD(n, 1);
        count_list_for: while (true) {
            nfors++;
            REQ(ch, SYM.list_for);
            if (NCH(ch) === 5)
                ch = CHILD(ch, 4);
            else
                return nfors;
            count_list_iter: while (true) {
                REQ(ch, SYM.list_iter);
                ch = CHILD(ch, 0);
                if (ch.type === SYM.list_for)
                    continue count_list_for;
                else if (ch.type === SYM.list_if) {
                    if (NCH(ch) === 3) {
                        ch = CHILD(ch, 2);
                        continue count_list_iter;
                    }
                    else
                        return nfors;
                }
                break;
            }
            break;
        }
    }
    function countListIfs(c, n) {
        var nifs = 0;
        while (true) {
            REQ(n, SYM.list_iter);
            if (CHILD(n, 0).type === SYM.list_for)
                return nifs;
            n = CHILD(n, 0);
            REQ(n, SYM.list_if);
            nifs++;
            if (NCH(n) == 2)
                return nifs;
            n = CHILD(n, 2);
        }
    }
    REQ(n, SYM.listmaker);
    asserts.assert(NCH(n) > 1);
    var elt = astForExpr(c, CHILD(n, 0));
    var nfors = countListFors(c, n);
    var listcomps = [];
    var ch = CHILD(n, 1);
    for (var i = 0; i < nfors; ++i) {
        REQ(ch, SYM.list_for);
        var forch = CHILD(ch, 1);
        var t = astForExprlist(c, forch, astnodes.Store);
        var expression = astForTestlist(c, CHILD(ch, 3));
        var lc;
        if (NCH(forch) === 1)
            lc = new astnodes.Comprehension(t[0], expression, []);
        else
            lc = new astnodes.Comprehension(new astnodes.Tuple(t, astnodes.Store, ch.lineno, ch.col_offset), expression, []);
        if (NCH(ch) === 5) {
            ch = CHILD(ch, 4);
            var nifs = countListIfs(c, ch);
            var ifs = [];
            for (var j = 0; j < nifs; ++j) {
                REQ(ch, SYM.list_iter);
                ch = CHILD(ch, 0);
                REQ(ch, SYM.list_if);
                ifs[j] = astForExpr(c, CHILD(ch, 1));
                if (NCH(ch) === 3)
                    ch = CHILD(ch, 2);
            }
            if (ch.type === SYM.list_iter)
                ch = CHILD(ch, 0);
            lc.ifs = ifs;
        }
        listcomps[i] = lc;
    }
    return new astnodes.ListComp(elt, listcomps, n.lineno, n.col_offset);
}
function astForUnaryExpr(c, n) {
    if (CHILD(n, 0).type === TOK.T_MINUS && NCH(n) === 2) {
        var pfactor = CHILD(n, 1);
        if (pfactor.type === SYM.UnaryExpr && NCH(pfactor) === 1) {
            var ppower = CHILD(pfactor, 0);
            if (ppower.type === SYM.PowerExpr && NCH(ppower) === 1) {
                var patom = CHILD(ppower, 0);
                if (patom.type === SYM.AtomExpr) {
                    var pnum = CHILD(patom, 0);
                    if (pnum.type === TOK.T_NUMBER) {
                        pnum.value = "-" + pnum.value;
                        return astForAtomExpr(c, patom);
                    }
                }
            }
        }
    }
    var expression = astForExpr(c, CHILD(n, 1));
    switch (CHILD(n, 0).type) {
        case TOK.T_PLUS: return new astnodes.UnaryOp(astnodes.UAdd, expression, n.lineno, n.col_offset);
        case TOK.T_MINUS: return new astnodes.UnaryOp(astnodes.USub, expression, n.lineno, n.col_offset);
        case TOK.T_TILDE: return new astnodes.UnaryOp(astnodes.Invert, expression, n.lineno, n.col_offset);
    }
    asserts.fail("unhandled UnaryExpr");
}
function astForForStmt(c, n) {
    var seq = [];
    REQ(n, SYM.for_stmt);
    if (NCH(n) === 9)
        seq = astForSuite(c, CHILD(n, 8));
    var nodeTarget = CHILD(n, 1);
    var _target = astForExprlist(c, nodeTarget, astnodes.Store);
    var target;
    if (NCH(nodeTarget) === 1)
        target = _target[0];
    else
        target = new astnodes.Tuple(_target, astnodes.Store, n.lineno, n.col_offset);
    return new astnodes.For_(target, astForTestlist(c, CHILD(n, 3)), astForSuite(c, CHILD(n, 5)), seq, n.lineno, n.col_offset);
}
function astForCall(c, n, func) {
    REQ(n, SYM.arglist);
    var nargs = 0;
    var nkeywords = 0;
    var ngens = 0;
    for (var i = 0; i < NCH(n); ++i) {
        var ch = CHILD(n, i);
        if (ch.type === SYM.argument) {
            if (NCH(ch) === 1)
                nargs++;
            else if (CHILD(ch, 1).type === SYM.gen_for)
                ngens++;
            else
                nkeywords++;
        }
    }
    if (ngens > 1 || (ngens && (nargs || nkeywords)))
        throw syntaxError("Generator expression must be parenthesized if not sole argument", c.c_filename, n.lineno);
    if (nargs + nkeywords + ngens > 255)
        throw syntaxError("more than 255 arguments", c.c_filename, n.lineno);
    var args = [];
    var keywords = [];
    nargs = 0;
    nkeywords = 0;
    var vararg = null;
    var kwarg = null;
    for (var i = 0; i < NCH(n); ++i) {
        var ch = CHILD(n, i);
        if (ch.type === SYM.argument) {
            if (NCH(ch) === 1) {
                if (nkeywords)
                    throw syntaxError("non-keyword arg after keyword arg", c.c_filename, n.lineno);
                if (vararg)
                    throw syntaxError("only named arguments may follow *expression", c.c_filename, n.lineno);
                args[nargs++] = astForExpr(c, CHILD(ch, 0));
            }
            else if (CHILD(ch, 1).type === SYM.gen_for)
                args[nargs++] = astForGenexp(c, ch);
            else {
                var e = astForExpr(c, CHILD(ch, 0));
                if (e.constructor === astnodes.Lambda)
                    throw syntaxError("lambda cannot contain assignment", c.c_filename, n.lineno);
                else if (e.constructor !== astnodes.Name)
                    throw syntaxError("keyword can't be an expression", c.c_filename, n.lineno);
                var key = e.id;
                forbiddenCheck(c, CHILD(ch, 0), key, n.lineno);
                for (var k = 0; k < nkeywords; ++k) {
                    var tmp = keywords[k].arg;
                    if (tmp === key)
                        throw syntaxError("keyword argument repeated", c.c_filename, n.lineno);
                }
                keywords[nkeywords++] = new astnodes.Keyword(key, astForExpr(c, CHILD(ch, 2)));
            }
        }
        else if (ch.type === TOK.T_STAR)
            vararg = astForExpr(c, CHILD(n, ++i));
        else if (ch.type === TOK.T_DOUBLESTAR)
            kwarg = astForExpr(c, CHILD(n, ++i));
    }
    return new astnodes.Call(func, args, keywords, vararg, kwarg, func.lineno, func.col_offset);
}
function astForTrailer(c, n, leftExpr) {
    REQ(n, SYM.trailer);
    if (CHILD(n, 0).type === TOK.T_LPAR) {
        if (NCH(n) === 2)
            return new astnodes.Call(leftExpr, [], [], null, null, n.lineno, n.col_offset);
        else
            return astForCall(c, CHILD(n, 1), leftExpr);
    }
    else if (CHILD(n, 0).type === TOK.T_DOT)
        return new astnodes.Attribute(leftExpr, strobj(CHILD(n, 1).value), astnodes.Load, n.lineno, n.col_offset);
    else {
        REQ(CHILD(n, 0), TOK.T_LSQB);
        REQ(CHILD(n, 2), TOK.T_RSQB);
        n = CHILD(n, 1);
        if (NCH(n) === 1)
            return new astnodes.Subscript(leftExpr, astForSlice(c, CHILD(n, 0)), astnodes.Load, n.lineno, n.col_offset);
        else {
            var simple = true;
            var slices = [];
            for (var j = 0; j < NCH(n); j += 2) {
                var slc = astForSlice(c, CHILD(n, j));
                if (slc.constructor !== astnodes.Index)
                    simple = false;
                slices[j / 2] = slc;
            }
            if (!simple) {
                return new astnodes.Subscript(leftExpr, new astnodes.ExtSlice(slices), astnodes.Load, n.lineno, n.col_offset);
            }
            var elts = [];
            for (var j = 0; j < slices.length; ++j) {
                var slc = slices[j];
                asserts.assert(slc.constructor === astnodes.Index && slc.value !== null && slc.value !== undefined);
                elts[j] = slc.value;
            }
            var e = new astnodes.Tuple(elts, astnodes.Load, n.lineno, n.col_offset);
            return new astnodes.Subscript(leftExpr, new astnodes.Index(e), astnodes.Load, n.lineno, n.col_offset);
        }
    }
}
function astForFlowStmt(c, n) {
    var ch;
    REQ(n, SYM.flow_stmt);
    ch = CHILD(n, 0);
    switch (ch.type) {
        case SYM.break_stmt: return new astnodes.Break_(n.lineno, n.col_offset);
        case SYM.continue_stmt: return new astnodes.Continue_(n.lineno, n.col_offset);
        case SYM.yield_stmt:
            return new astnodes.Expr(astForExpr(c, CHILD(ch, 0)), n.lineno, n.col_offset);
        case SYM.return_stmt:
            if (NCH(ch) === 1)
                return new astnodes.Return_(null, n.lineno, n.col_offset);
            else
                return new astnodes.Return_(astForTestlist(c, CHILD(ch, 1)), n.lineno, n.col_offset);
        case SYM.raise_stmt:
            if (NCH(ch) === 1)
                return new astnodes.Raise(null, null, null, n.lineno, n.col_offset);
            else if (NCH(ch) === 2)
                return new astnodes.Raise(astForExpr(c, CHILD(ch, 1)), null, null, n.lineno, n.col_offset);
            else if (NCH(ch) === 4)
                return new astnodes.Raise(astForExpr(c, CHILD(ch, 1)), astForExpr(c, CHILD(ch, 3)), null, n.lineno, n.col_offset);
            else if (NCH(ch) === 6)
                return new astnodes.Raise(astForExpr(c, CHILD(ch, 1)), astForExpr(c, CHILD(ch, 3)), astForExpr(c, CHILD(ch, 5)), n.lineno, n.col_offset);
        default:
            asserts.fail("unexpected flow_stmt");
    }
    asserts.fail("unhandled flow statement");
}
function astForArguments(c, n) {
    var ch;
    var vararg = null;
    var kwarg = null;
    if (n.type === SYM.parameters) {
        if (NCH(n) === 2)
            return new astnodes.Arguments([], null, null, []);
        n = CHILD(n, 1);
    }
    REQ(n, SYM.varargslist);
    var args = [];
    var defaults = [];
    var foundDefault = false;
    var i = 0;
    var j = 0;
    var k = 0;
    while (i < NCH(n)) {
        ch = CHILD(n, i);
        switch (ch.type) {
            case SYM.fpdef:
                var complexArgs = 0;
                var parenthesized = false;
                handle_fpdef: while (true) {
                    if (i + 1 < NCH(n) && CHILD(n, i + 1).type === TOK.T_EQUAL) {
                        defaults[j++] = astForExpr(c, CHILD(n, i + 2));
                        i += 2;
                        foundDefault = true;
                    }
                    else if (foundDefault) {
                        if (parenthesized && !complexArgs)
                            throw syntaxError("parenthesized arg with default", c.c_filename, n.lineno);
                        throw syntaxError("non-default argument follows default argument", c.c_filename, n.lineno);
                    }
                    if (NCH(ch) === 3) {
                        ch = CHILD(ch, 1);
                        if (NCH(ch) !== 1) {
                            throw syntaxError("tuple parameter unpacking has been removed", c.c_filename, n.lineno);
                        }
                        else {
                            parenthesized = true;
                            ch = CHILD(ch, 0);
                            asserts.assert(ch.type === SYM.fpdef);
                            continue handle_fpdef;
                        }
                    }
                    if (CHILD(ch, 0).type === TOK.T_NAME) {
                        forbiddenCheck(c, n, CHILD(ch, 0).value, n.lineno);
                        var id = strobj(CHILD(ch, 0).value);
                        args[k++] = new astnodes.Name(id, astnodes.Param, ch.lineno, ch.col_offset);
                    }
                    i += 2;
                    if (parenthesized)
                        throw syntaxError("parenthesized argument names are invalid", c.c_filename, n.lineno);
                    break;
                }
                break;
            case TOK.T_STAR:
                forbiddenCheck(c, CHILD(n, i + 1), CHILD(n, i + 1).value, n.lineno);
                vararg = strobj(CHILD(n, i + 1).value);
                i += 3;
                break;
            case TOK.T_DOUBLESTAR:
                forbiddenCheck(c, CHILD(n, i + 1), CHILD(n, i + 1).value, n.lineno);
                kwarg = strobj(CHILD(n, i + 1).value);
                i += 3;
                break;
            default:
                asserts.fail("unexpected node in varargslist");
        }
    }
    return new astnodes.Arguments(args, vararg, kwarg, defaults);
}
function astForFuncdef(c, n, decoratorSeq) {
    REQ(n, SYM.funcdef);
    var name = strobj(CHILD(n, 1).value);
    forbiddenCheck(c, CHILD(n, 1), CHILD(n, 1).value, n.lineno);
    var args = astForArguments(c, CHILD(n, 2));
    var body = astForSuite(c, CHILD(n, 4));
    return new astnodes.FunctionDef(name, args, body, decoratorSeq, n.lineno, n.col_offset);
}
function astForClassBases(c, n) {
    asserts.assert(NCH(n) > 0);
    REQ(n, SYM.testlist);
    if (NCH(n) === 1)
        return [astForExpr(c, CHILD(n, 0))];
    return seqForTestlist(c, n);
}
function astForClassdef(c, n, decoratorSeq) {
    REQ(n, SYM.classdef);
    forbiddenCheck(c, n, CHILD(n, 1).value, n.lineno);
    var classname = strobj(CHILD(n, 1).value);
    if (NCH(n) === 4)
        return new astnodes.ClassDef(classname, [], astForSuite(c, CHILD(n, 3)), decoratorSeq, n.lineno, n.col_offset);
    if (CHILD(n, 3).type === TOK.T_RPAR)
        return new astnodes.ClassDef(classname, [], astForSuite(c, CHILD(n, 5)), decoratorSeq, n.lineno, n.col_offset);
    var bases = astForClassBases(c, CHILD(n, 3));
    var s = astForSuite(c, CHILD(n, 6));
    return new astnodes.ClassDef(classname, bases, s, decoratorSeq, n.lineno, n.col_offset);
}
function astForLambdef(c, n) {
    var args;
    var expression;
    if (NCH(n) === 3) {
        args = new astnodes.Arguments([], null, null, []);
        expression = astForExpr(c, CHILD(n, 2));
    }
    else {
        args = astForArguments(c, CHILD(n, 1));
        expression = astForExpr(c, CHILD(n, 3));
    }
    return new astnodes.Lambda(args, expression, n.lineno, n.col_offset);
}
function astForGenexp(c, n) {
    asserts.assert(n.type === SYM.testlist_gexp || n.type === SYM.argument);
    asserts.assert(NCH(n) > 1);
    function countGenFors(c, n) {
        var nfors = 0;
        var ch = CHILD(n, 1);
        count_gen_for: while (true) {
            nfors++;
            REQ(ch, SYM.gen_for);
            if (NCH(ch) === 5)
                ch = CHILD(ch, 4);
            else
                return nfors;
            count_gen_iter: while (true) {
                REQ(ch, SYM.gen_iter);
                ch = CHILD(ch, 0);
                if (ch.type === SYM.gen_for)
                    continue count_gen_for;
                else if (ch.type === SYM.gen_if) {
                    if (NCH(ch) === 3) {
                        ch = CHILD(ch, 2);
                        continue count_gen_iter;
                    }
                    else
                        return nfors;
                }
                break;
            }
            break;
        }
        asserts.fail("logic error in countGenFors");
    }
    function countGenIfs(c, n) {
        var nifs = 0;
        while (true) {
            REQ(n, SYM.gen_iter);
            if (CHILD(n, 0).type === SYM.gen_for)
                return nifs;
            n = CHILD(n, 0);
            REQ(n, SYM.gen_if);
            nifs++;
            if (NCH(n) == 2)
                return nifs;
            n = CHILD(n, 2);
        }
    }
    var elt = astForExpr(c, CHILD(n, 0));
    var nfors = countGenFors(c, n);
    var genexps = [];
    var ch = CHILD(n, 1);
    for (var i = 0; i < nfors; ++i) {
        REQ(ch, SYM.gen_for);
        var forch = CHILD(ch, 1);
        var t = astForExprlist(c, forch, astnodes.Store);
        var expression = astForExpr(c, CHILD(ch, 3));
        var ge;
        if (NCH(forch) === 1)
            ge = new astnodes.Comprehension(t[0], expression, []);
        else
            ge = new astnodes.Comprehension(new astnodes.Tuple(t, astnodes.Store, ch.lineno, ch.col_offset), expression, []);
        if (NCH(ch) === 5) {
            ch = CHILD(ch, 4);
            var nifs = countGenIfs(c, ch);
            var ifs = [];
            for (var j = 0; j < nifs; ++j) {
                REQ(ch, SYM.gen_iter);
                ch = CHILD(ch, 0);
                REQ(ch, SYM.gen_if);
                expression = astForExpr(c, CHILD(ch, 1));
                ifs[j] = expression;
                if (NCH(ch) === 3)
                    ch = CHILD(ch, 2);
            }
            if (ch.type === SYM.gen_iter)
                ch = CHILD(ch, 0);
            ge.ifs = ifs;
        }
        genexps[i] = ge;
    }
    return new astnodes.GeneratorExp(elt, genexps, n.lineno, n.col_offset);
}
function astForWhileStmt(c, n) {
    REQ(n, SYM.while_stmt);
    if (NCH(n) === 4)
        return new astnodes.While_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), [], n.lineno, n.col_offset);
    else if (NCH(n) === 7)
        return new astnodes.While_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), astForSuite(c, CHILD(n, 6)), n.lineno, n.col_offset);
    asserts.fail("wrong number of tokens for 'while' stmt");
}
function astForAugassign(c, n) {
    REQ(n, SYM.augassign);
    n = CHILD(n, 0);
    switch (n.value.charAt(0)) {
        case '+': return astnodes.Add;
        case '-': return astnodes.Sub;
        case '/':
            if (n.value.charAt(1) === '/')
                return astnodes.FloorDiv;
            return astnodes.Div;
        case '%': return astnodes.Mod;
        case '<': return astnodes.LShift;
        case '>': return astnodes.RShift;
        case '&': return astnodes.BitAnd;
        case '^': return astnodes.BitXor;
        case '|': return astnodes.BitOr;
        case '*':
            if (n.value.charAt(1) === '*')
                return astnodes.Pow;
            return astnodes.Mult;
        default: asserts.fail("invalid augassign");
    }
}
function astForBinop(c, n) {
    var result = new astnodes.BinOp(astForExpr(c, CHILD(n, 0)), getOperator(CHILD(n, 1)), astForExpr(c, CHILD(n, 2)), n.lineno, n.col_offset);
    var nops = (NCH(n) - 1) / 2;
    for (var i = 1; i < nops; ++i) {
        var nextOper = CHILD(n, i * 2 + 1);
        var newoperator = getOperator(nextOper);
        var tmp = astForExpr(c, CHILD(n, i * 2 + 2));
        result = new astnodes.BinOp(result, newoperator, tmp, nextOper.lineno, nextOper.col_offset);
    }
    return result;
}
function astForTestlist(c, n) {
    asserts.assert(NCH(n) > 0);
    if (n.type === SYM.testlist_gexp) {
        if (NCH(n) > 1) {
            asserts.assert(CHILD(n, 1).type !== SYM.gen_for);
        }
    }
    else {
        asserts.assert(n.type === SYM.testlist || n.type === SYM.testlist_safe || n.type === SYM.testlist1);
    }
    if (NCH(n) === 1) {
        return astForExpr(c, CHILD(n, 0));
    }
    else {
        return new astnodes.Tuple(seqForTestlist(c, n), astnodes.Load, n.lineno, n.col_offset);
    }
}
function astForExprStmt(c, n) {
    REQ(n, SYM.ExprStmt);
    if (NCH(n) === 1)
        return new astnodes.Expr(astForTestlist(c, CHILD(n, 0)), n.lineno, n.col_offset);
    else if (CHILD(n, 1).type === SYM.augassign) {
        var ch = CHILD(n, 0);
        var expr1 = astForTestlist(c, ch);
        switch (expr1.constructor) {
            case astnodes.GeneratorExp: throw syntaxError("augmented assignment to generator expression not possible", c.c_filename, n.lineno);
            case astnodes.Yield: throw syntaxError("augmented assignment to yield expression not possible", c.c_filename, n.lineno);
            case astnodes.Name:
                var varName = expr1.id;
                forbiddenCheck(c, ch, varName, n.lineno);
                break;
            case astnodes.Attribute:
            case astnodes.Subscript:
                break;
            default:
                throw syntaxError("illegal expression for augmented assignment", c.c_filename, n.lineno);
        }
        setContext(c, expr1, astnodes.Store, ch);
        ch = CHILD(n, 2);
        var expr2;
        if (ch.type === SYM.testlist)
            expr2 = astForTestlist(c, ch);
        else
            expr2 = astForExpr(c, ch);
        return new astnodes.AugAssign(expr1, astForAugassign(c, CHILD(n, 1)), expr2, n.lineno, n.col_offset);
    }
    else {
        REQ(CHILD(n, 1), TOK.T_EQUAL);
        var targets = [];
        for (var i = 0; i < NCH(n) - 2; i += 2) {
            var ch = CHILD(n, i);
            if (ch.type === SYM.YieldExpr)
                throw syntaxError("assignment to yield expression not possible", c.c_filename, n.lineno);
            var e = astForTestlist(c, ch);
            setContext(c, e, astnodes.Store, CHILD(n, i));
            targets[i / 2] = e;
        }
        var value = CHILD(n, NCH(n) - 1);
        var expression;
        if (value.type === SYM.testlist)
            expression = astForTestlist(c, value);
        else
            expression = astForExpr(c, value);
        return new astnodes.Assign(targets, expression, n.lineno, n.col_offset);
    }
}
function astForIfexpr(c, n) {
    asserts.assert(NCH(n) === 5);
    return new astnodes.IfExp(astForExpr(c, CHILD(n, 2)), astForExpr(c, CHILD(n, 0)), astForExpr(c, CHILD(n, 4)), n.lineno, n.col_offset);
}
function parsestr(c, s) {
    var decodeUtf8 = function (s) { return decodeURI(s); };
    var decodeEscape = function (s, quote) {
        var len = s.length;
        var ret = '';
        for (var i = 0; i < len; ++i) {
            var c = s.charAt(i);
            if (c === '\\') {
                ++i;
                c = s.charAt(i);
                if (c === 'n')
                    ret += "\n";
                else if (c === '\\')
                    ret += "\\";
                else if (c === 't')
                    ret += "\t";
                else if (c === 'r')
                    ret += "\r";
                else if (c === 'b')
                    ret += "\b";
                else if (c === 'f')
                    ret += "\f";
                else if (c === 'v')
                    ret += "\v";
                else if (c === '0')
                    ret += "\0";
                else if (c === '"')
                    ret += '"';
                else if (c === '\'')
                    ret += '\'';
                else if (c === '\n') { }
                else if (c === 'x') {
                    var d0 = s.charAt(++i);
                    var d1 = s.charAt(++i);
                    ret += String.fromCharCode(parseInt(d0 + d1, 16));
                }
                else if (c === 'u' || c === 'U') {
                    var d0 = s.charAt(++i);
                    var d1 = s.charAt(++i);
                    var d2 = s.charAt(++i);
                    var d3 = s.charAt(++i);
                    ret += String.fromCharCode(parseInt(d0 + d1, 16), parseInt(d2 + d3, 16));
                }
                else {
                    ret += "\\" + c;
                }
            }
            else {
                ret += c;
            }
        }
        return ret;
    };
    var quote = s.charAt(0);
    var rawmode = false;
    if (quote === 'u' || quote === 'U') {
        s = s.substr(1);
        quote = s.charAt(0);
    }
    else if (quote === 'r' || quote === 'R') {
        s = s.substr(1);
        quote = s.charAt(0);
        rawmode = true;
    }
    asserts.assert(quote !== 'b' && quote !== 'B', "todo; haven't done b'' strings yet");
    asserts.assert(quote === "'" || quote === '"' && s.charAt(s.length - 1) === quote);
    s = s.substr(1, s.length - 2);
    if (s.length >= 4 && s.charAt(0) === quote && s.charAt(1) === quote) {
        asserts.assert(s.charAt(s.length - 1) === quote && s.charAt(s.length - 2) === quote);
        s = s.substr(2, s.length - 4);
    }
    if (rawmode || s.indexOf('\\') === -1) {
        return strobj(decodeUtf8(s));
    }
    return strobj(decodeEscape(s, quote));
}
function parsestrplus(c, n) {
    REQ(CHILD(n, 0), TOK.T_STRING);
    var ret = "";
    for (var i = 0; i < NCH(n); ++i) {
        var child = CHILD(n, i);
        try {
            ret = ret + parsestr(c, child.value);
        }
        catch (x) {
            throw syntaxError("invalid string (possibly contains a unicode character)", c.c_filename, child.lineno);
        }
    }
    return ret;
}
function parsenumber(c, s, lineno) {
    var end = s.charAt(s.length - 1);
    if (end === 'j' || end === 'J') {
        throw syntaxError("complex numbers are currently unsupported", c.c_filename, lineno);
    }
    if (s.indexOf('.') !== -1) {
        return numericLiteral.floatAST(s);
    }
    var tmp = s;
    var value;
    var radix = 10;
    var neg = false;
    if (s.charAt(0) === '-') {
        tmp = s.substr(1);
        neg = true;
    }
    if (tmp.charAt(0) === '0' && (tmp.charAt(1) === 'x' || tmp.charAt(1) === 'X')) {
        tmp = tmp.substring(2);
        value = parseInt(tmp, 16);
        radix = 16;
    }
    else if ((s.indexOf('e') !== -1) || (s.indexOf('E') !== -1)) {
        return numericLiteral.floatAST(s);
    }
    else if (tmp.charAt(0) === '0' && (tmp.charAt(1) === 'b' || tmp.charAt(1) === 'B')) {
        tmp = tmp.substring(2);
        value = parseInt(tmp, 2);
        radix = 2;
    }
    else if (tmp.charAt(0) === '0') {
        if (tmp === "0") {
            value = 0;
        }
        else {
            if (end === 'l' || end === 'L') {
                return numericLiteral.longAST(s.substr(0, s.length - 1), 8);
            }
            else {
                radix = 8;
                tmp = tmp.substring(1);
                if ((tmp.charAt(0) === 'o') || (tmp.charAt(0) === 'O')) {
                    tmp = tmp.substring(1);
                }
                value = parseInt(tmp, 8);
            }
        }
    }
    else {
        if (end === 'l' || end === 'L') {
            return numericLiteral.longAST(s.substr(0, s.length - 1), radix);
        }
        else {
            value = parseInt(tmp, radix);
        }
    }
    if (value > LONG_THRESHOLD && Math.floor(value) === value && (s.indexOf('e') === -1 && s.indexOf('E') === -1)) {
        return numericLiteral.longAST(s, 0);
    }
    if (end === 'l' || end === 'L') {
        return numericLiteral.longAST(s.substr(0, s.length - 1), radix);
    }
    else {
        if (neg) {
            return numericLiteral.intAST(-value);
        }
        else {
            return numericLiteral.intAST(value);
        }
    }
}
function astForSlice(c, n) {
    REQ(n, SYM.subscript);
    var ch = CHILD(n, 0);
    var lower = null;
    var upper = null;
    var step = null;
    if (ch.type === TOK.T_DOT)
        return new astnodes.Ellipsis();
    if (NCH(n) === 1 && ch.type === SYM.IfExpr)
        return new astnodes.Index(astForExpr(c, ch));
    if (ch.type === SYM.IfExpr)
        lower = astForExpr(c, ch);
    if (ch.type === TOK.T_COLON) {
        if (NCH(n) > 1) {
            var n2 = CHILD(n, 1);
            if (n2.type === SYM.IfExpr)
                upper = astForExpr(c, n2);
        }
    }
    else if (NCH(n) > 2) {
        var n2 = CHILD(n, 2);
        if (n2.type === SYM.IfExpr)
            upper = astForExpr(c, n2);
    }
    ch = CHILD(n, NCH(n) - 1);
    if (ch.type === SYM.sliceop) {
        if (NCH(ch) === 1) {
            ch = CHILD(ch, 0);
            step = new astnodes.Name(strobj("None"), astnodes.Load, ch.lineno, ch.col_offset);
        }
        else {
            ch = CHILD(ch, 1);
            if (ch.type === SYM.IfExpr)
                step = astForExpr(c, ch);
        }
    }
    return new astnodes.Slice(lower, upper, step);
}
function astForAtomExpr(c, n) {
    var ch = CHILD(n, 0);
    switch (ch.type) {
        case TOK.T_NAME:
            return new astnodes.Name(strobj(ch.value), astnodes.Load, n.lineno, n.col_offset);
        case TOK.T_STRING:
            return new astnodes.Str(parsestrplus(c, n), n.lineno, n.col_offset);
        case TOK.T_NUMBER:
            return new astnodes.Num(parsenumber(c, ch.value, n.lineno), n.lineno, n.col_offset);
        case TOK.T_LPAR:
            ch = CHILD(n, 1);
            if (ch.type === TOK.T_RPAR)
                return new astnodes.Tuple([], astnodes.Load, n.lineno, n.col_offset);
            if (ch.type === SYM.YieldExpr)
                return astForExpr(c, ch);
            if (NCH(ch) > 1 && CHILD(ch, 1).type === SYM.gen_for)
                return astForGenexp(c, ch);
            return astForTestlistGexp(c, ch);
        case TOK.T_LSQB:
            ch = CHILD(n, 1);
            if (ch.type === TOK.T_RSQB)
                return new astnodes.List([], astnodes.Load, n.lineno, n.col_offset);
            REQ(ch, SYM.listmaker);
            if (NCH(ch) === 1 || CHILD(ch, 1).type === TOK.T_COMMA)
                return new astnodes.List(seqForTestlist(c, ch), astnodes.Load, n.lineno, n.col_offset);
            else
                return astForListcomp(c, ch);
        case TOK.T_LBRACE:
            ch = CHILD(n, 1);
            var size = Math.floor((NCH(ch) + 1) / 4);
            var keys = [];
            var values = [];
            for (var i = 0; i < NCH(ch); i += 4) {
                keys[i / 4] = astForExpr(c, CHILD(ch, i));
                values[i / 4] = astForExpr(c, CHILD(ch, i + 2));
            }
            return new astnodes.Dict(keys, values, n.lineno, n.col_offset);
        case TOK.T_BACKQUOTE:
            throw syntaxError("backquote not supported, use repr()", c.c_filename, n.lineno);
        default:
            asserts.fail("unhandled atom", ch.type);
    }
}
function astForPowerExpr(c, n) {
    REQ(n, SYM.PowerExpr);
    var e = astForAtomExpr(c, CHILD(n, 0));
    if (NCH(n) === 1)
        return e;
    for (var i = 1; i < NCH(n); ++i) {
        var ch = CHILD(n, i);
        if (ch.type !== SYM.trailer)
            break;
        var tmp = astForTrailer(c, ch, e);
        tmp.lineno = e.lineno;
        tmp.col_offset = e.col_offset;
        e = tmp;
    }
    if (CHILD(n, NCH(n) - 1).type === SYM.UnaryExpr) {
        var f = astForExpr(c, CHILD(n, NCH(n) - 1));
        e = new astnodes.BinOp(e, astnodes.Pow, f, n.lineno, n.col_offset);
    }
    return e;
}
function astForExpr(c, n) {
    LOOP: while (true) {
        switch (n.type) {
            case SYM.IfExpr:
            case SYM.old_test:
                if (CHILD(n, 0).type === SYM.LambdaExpr || CHILD(n, 0).type === SYM.old_LambdaExpr)
                    return astForLambdef(c, CHILD(n, 0));
                else if (NCH(n) > 1)
                    return astForIfexpr(c, n);
            case SYM.OrExpr:
            case SYM.AndExpr:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue LOOP;
                }
                var seq = [];
                for (var i = 0; i < NCH(n); i += 2)
                    seq[i / 2] = astForExpr(c, CHILD(n, i));
                if (CHILD(n, 1).value === "and")
                    return new astnodes.BoolOp(astnodes.And, seq, n.lineno, n.col_offset);
                asserts.assert(CHILD(n, 1).value === "or");
                return new astnodes.BoolOp(astnodes.Or, seq, n.lineno, n.col_offset);
            case SYM.NotExpr:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue LOOP;
                }
                else {
                    return new astnodes.UnaryOp(astnodes.Not, astForExpr(c, CHILD(n, 1)), n.lineno, n.col_offset);
                }
            case SYM.ComparisonExpr:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue LOOP;
                }
                else {
                    var ops = [];
                    var cmps = [];
                    for (var i = 1; i < NCH(n); i += 2) {
                        ops[(i - 1) / 2] = astForCompOp(c, CHILD(n, i));
                        cmps[(i - 1) / 2] = astForExpr(c, CHILD(n, i + 1));
                    }
                    return new astnodes.Compare(astForExpr(c, CHILD(n, 0)), ops, cmps, n.lineno, n.col_offset);
                }
            case SYM.ArithmeticExpr:
            case SYM.GeometricExpr:
            case SYM.ShiftExpr:
            case SYM.BitwiseOrExpr:
            case SYM.BitwiseXorExpr:
            case SYM.BitwiseAndExpr:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue LOOP;
                }
                return astForBinop(c, n);
            case SYM.YieldExpr:
                var exp = null;
                if (NCH(n) === 2) {
                    exp = astForTestlist(c, CHILD(n, 1));
                }
                return new astnodes.Yield(exp, n.lineno, n.col_offset);
            case SYM.UnaryExpr:
                if (NCH(n) === 1) {
                    n = CHILD(n, 0);
                    continue LOOP;
                }
                return astForUnaryExpr(c, n);
            case SYM.PowerExpr:
                return astForPowerExpr(c, n);
            default:
                asserts.fail("unhandled expr", "n.type: %d", n.type);
        }
        break;
    }
}
function astForPrintStmt(c, n) {
    var start = 1;
    var dest = null;
    REQ(n, SYM.print_stmt);
    if (NCH(n) >= 2 && CHILD(n, 1).type === TOK.T_RIGHTSHIFT) {
        dest = astForExpr(c, CHILD(n, 2));
        start = 4;
    }
    var seq = [];
    for (var i = start, j = 0; i < NCH(n); i += 2, ++j) {
        seq[j] = astForExpr(c, CHILD(n, i));
    }
    var nl = (CHILD(n, NCH(n) - 1)).type === TOK.T_COMMA ? false : true;
    return new astnodes.Print(dest, seq, nl, n.lineno, n.col_offset);
}
function astForStmt(c, n) {
    if (n.type === SYM.stmt) {
        asserts.assert(NCH(n) === 1);
        n = CHILD(n, 0);
    }
    if (n.type === SYM.simple_stmt) {
        asserts.assert(numStmts(n) === 1);
        n = CHILD(n, 0);
    }
    if (n.type === SYM.small_stmt) {
        REQ(n, SYM.small_stmt);
        n = CHILD(n, 0);
        switch (n.type) {
            case SYM.ExprStmt: return astForExprStmt(c, n);
            case SYM.print_stmt: return astForPrintStmt(c, n);
            case SYM.del_stmt: return astForDelStmt(c, n);
            case SYM.pass_stmt: return new astnodes.Pass(n.lineno, n.col_offset);
            case SYM.flow_stmt: return astForFlowStmt(c, n);
            case SYM.import_stmt: return astForImportStmt(c, n);
            case SYM.GlobalStmt: return astForGlobalStmt(c, n);
            case SYM.NonLocalStmt: return astForNonLocalStmt(c, n);
            case SYM.exec_stmt: return astForExecStmt(c, n);
            case SYM.assert_stmt: return astForAssertStmt(c, n);
            default: asserts.fail("unhandled small_stmt");
        }
    }
    else {
        var ch = CHILD(n, 0);
        REQ(n, SYM.compound_stmt);
        switch (ch.type) {
            case SYM.if_stmt: return astForIfStmt(c, ch);
            case SYM.while_stmt: return astForWhileStmt(c, ch);
            case SYM.for_stmt: return astForForStmt(c, ch);
            case SYM.try_stmt: return astForTryStmt(c, ch);
            case SYM.with_stmt: return astForWithStmt(c, ch);
            case SYM.funcdef: return astForFuncdef(c, ch, []);
            case SYM.classdef: return astForClassdef(c, ch, []);
            case SYM.decorated: return astForDecorated(c, ch);
            default: asserts.assert("unhandled compound_stmt");
        }
    }
}
function astFromParse(n, filename) {
    var c = new Compiling("utf-8", filename);
    var stmts = [];
    var ch;
    var k = 0;
    switch (n.type) {
        case SYM.file_input:
            for (var i = 0; i < NCH(n) - 1; ++i) {
                var ch = CHILD(n, i);
                if (n.type === TOK.T_NEWLINE)
                    continue;
                REQ(ch, SYM.stmt);
                var num = numStmts(ch);
                if (num === 1) {
                    stmts[k++] = astForStmt(c, ch);
                }
                else {
                    ch = CHILD(ch, 0);
                    REQ(ch, SYM.simple_stmt);
                    for (var j = 0; j < num; ++j) {
                        stmts[k++] = astForStmt(c, CHILD(ch, j * 2));
                    }
                }
            }
            return new astnodes.Module(stmts);
        case SYM.eval_input:
            asserts.fail("todo;");
        case SYM.single_input:
            asserts.fail("todo;");
        default:
            asserts.fail("todo;");
    }
}
exports.astFromParse = astFromParse;
function astDump(node) {
    var _format = function (node) {
        if (node === null) {
            return "None";
        }
        else if (node.prototype && node.prototype._astname !== undefined && node.prototype._isenum) {
            return node.prototype._astname + "()";
        }
        else if (node._astname !== undefined) {
            var fields = [];
            for (var i = 0; i < node._fields.length; i += 2) {
                var a = node._fields[i];
                var b = node._fields[i + 1](node);
                fields.push([a, _format(b)]);
            }
            var attrs = [];
            for (var i = 0; i < fields.length; ++i) {
                var field = fields[i];
                attrs.push(field[0] + "=" + field[1].replace(/^\s+/, ''));
            }
            var fieldstr = attrs.join(',');
            return node._astname + "(" + fieldstr + ")";
        }
        else if (base.isArrayLike(node)) {
            var elems = [];
            for (var i = 0; i < node.length; ++i) {
                var x = node[i];
                elems.push(_format(x));
            }
            var elemsstr = elems.join(',');
            return "[" + elemsstr.replace(/^\s+/, '') + "]";
        }
        else {
            var ret;
            if (node === true)
                ret = "True";
            else if (node === false)
                ret = "False";
            else
                ret = "" + node;
            return ret;
        }
    };
    var visitNode = function (node) {
        switch (node.constructor) {
            case astnodes.Module:
                {
                    var module = node;
                    return "Module(body=" + visitStmts(module.body) + ")";
                }
                break;
            default: {
            }
        }
    };
    var visitStmts = function (stmts) {
        return "[" + stmts.map(function (stmt) { return visitStmt(stmt); }).join(', ') + "]";
    };
    var visitStmt = function (stmt) {
        switch (stmt.constructor) {
            case astnodes.FunctionDef:
                {
                    var functionDef = stmt;
                    return "FunctionDef(name=" + functionDef.name + ", lineno=" + functionDef.lineno + ", col_offset=" + functionDef.col_offset + ", body=" + visitStmts(functionDef.body) + ")";
                }
                break;
            case astnodes.Assign: {
                var assign = stmt;
                return "Assign(targets=" + visitExprs(assign.targets) + ", value=" + visitExpr(assign.value) + ", lineno=" + assign.lineno + ", col_offset=" + assign.col_offset + ")";
            }
            case astnodes.Pass:
                {
                    var pass = stmt;
                    return "Pass()";
                }
                break;
            default: {
            }
        }
    };
    var visitExprs = function (exprs) {
        return "[" + exprs.map(function (expr) { return visitExpr(expr); }).join(', ') + "]";
    };
    var visitExpr = function (expr) {
        switch (expr.constructor) {
            case astnodes.Name:
                {
                    var name = expr;
                    return "Name(id=" + name.id + ", lineno=" + name.lineno + ", col_offset=" + name.col_offset + ")";
                }
                break;
            case astnodes.Num:
                {
                    var num = expr;
                    return "Num()";
                }
                break;
            default: {
            }
        }
    };
    return visitNode(node);
}
exports.astDump = astDump;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9tb2RlL3B5dGhvbi9idWlsZGVyLnRzIl0sIm5hbWVzIjpbInN5bnRheEVycm9yIiwiQ29tcGlsaW5nIiwiQ29tcGlsaW5nLmNvbnN0cnVjdG9yIiwiTkNIIiwiQ0hJTEQiLCJSRVEiLCJzdHJvYmoiLCJudW1TdG10cyIsImZvcmJpZGRlbkNoZWNrIiwic2V0Q29udGV4dCIsImdldE9wZXJhdG9yIiwiYXN0Rm9yQ29tcE9wIiwic2VxRm9yVGVzdGxpc3QiLCJhc3RGb3JTdWl0ZSIsImFzdEZvckV4Y2VwdENsYXVzZSIsImFzdEZvclRyeVN0bXQiLCJhc3RGb3JEb3R0ZWROYW1lIiwiYXN0Rm9yRGVjb3JhdG9yIiwiYXN0Rm9yRGVjb3JhdG9ycyIsImFzdEZvckRlY29yYXRlZCIsImFzdEZvcldpdGhWYXIiLCJhc3RGb3JXaXRoU3RtdCIsImFzdEZvckV4ZWNTdG10IiwiYXN0Rm9ySWZTdG10IiwiYXN0Rm9yRXhwcmxpc3QiLCJhc3RGb3JEZWxTdG10IiwiYXN0Rm9yR2xvYmFsU3RtdCIsImFzdEZvck5vbkxvY2FsU3RtdCIsImFzdEZvckFzc2VydFN0bXQiLCJhbGlhc0ZvckltcG9ydE5hbWUiLCJhc3RGb3JJbXBvcnRTdG10IiwiYXN0Rm9yVGVzdGxpc3RHZXhwIiwiYXN0Rm9yTGlzdGNvbXAiLCJhc3RGb3JMaXN0Y29tcC5jb3VudExpc3RGb3JzIiwiYXN0Rm9yTGlzdGNvbXAuY291bnRMaXN0SWZzIiwiYXN0Rm9yVW5hcnlFeHByIiwiYXN0Rm9yRm9yU3RtdCIsImFzdEZvckNhbGwiLCJhc3RGb3JUcmFpbGVyIiwiYXN0Rm9yRmxvd1N0bXQiLCJhc3RGb3JBcmd1bWVudHMiLCJhc3RGb3JGdW5jZGVmIiwiYXN0Rm9yQ2xhc3NCYXNlcyIsImFzdEZvckNsYXNzZGVmIiwiYXN0Rm9yTGFtYmRlZiIsImFzdEZvckdlbmV4cCIsImFzdEZvckdlbmV4cC5jb3VudEdlbkZvcnMiLCJhc3RGb3JHZW5leHAuY291bnRHZW5JZnMiLCJhc3RGb3JXaGlsZVN0bXQiLCJhc3RGb3JBdWdhc3NpZ24iLCJhc3RGb3JCaW5vcCIsImFzdEZvclRlc3RsaXN0IiwiYXN0Rm9yRXhwclN0bXQiLCJhc3RGb3JJZmV4cHIiLCJwYXJzZXN0ciIsInBhcnNlc3RycGx1cyIsInBhcnNlbnVtYmVyIiwiYXN0Rm9yU2xpY2UiLCJhc3RGb3JBdG9tRXhwciIsImFzdEZvclBvd2VyRXhwciIsImFzdEZvckV4cHIiLCJhc3RGb3JQcmludFN0bXQiLCJhc3RGb3JTdG10IiwiYXN0RnJvbVBhcnNlIiwiYXN0RHVtcCJdLCJtYXBwaW5ncyI6IkFBQUEsSUFBTyxPQUFPLFdBQVcsV0FBVyxDQUFDLENBQUM7QUFDdEMsSUFBTyxRQUFRLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFDeEMsSUFBTyxJQUFJLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFDaEMsSUFBTyxjQUFjLFdBQVcsa0JBQWtCLENBQUMsQ0FBQztBQUVwRCxJQUFPLE1BQU0sV0FBVyxVQUFVLENBQUMsQ0FBQztBQUNwQyxJQUFPLFNBQVMsV0FBVyxhQUFhLENBQUMsQ0FBQztBQVUxQyxJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDO0FBQ3JDLElBQUksR0FBRyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUM7QUFDMUIsSUFBSSxHQUFHLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQU0zQixJQUFJLGNBQWMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztBQU9yQyxxQkFBcUIsT0FBZSxFQUFFLFFBQWdCLEVBQUUsVUFBa0I7SUFDdEVBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLDBCQUEwQkEsQ0FBQ0EsQ0FBQ0E7SUFDbkVBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFB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QUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7b0JBQ3JCQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUM1QkEsQ0FBQ0E7WUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDZkEsS0FBS0EsR0FBR0EsQ0FBQ0EsSUFBSUE7WUFDVEEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLEtBQUtBLEdBQUdBLENBQUNBLGFBQWFBO1lBQ2xCQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxLQUFLQSxHQUFHQSxDQUFDQSxXQUFXQTtZQUNoQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLEtBQUtBLEdBQUdBLENBQUNBLEtBQUtBO1lBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNiQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNaQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDL0JBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNB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QSxLQUFLQSxHQUFHQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUM3SEEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDSkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDaENBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2hDQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVELElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUNyQixDQUFDO0lBQ0csV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO0lBQ3pDLFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztJQUN6QyxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDaEQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO0lBQzNDLFdBQVcsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQztJQUMvQyxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7SUFDaEQsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDO0lBQ3ZDLFdBQVcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQztJQUN4QyxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDeEMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDO0lBQ3hDLFdBQVcsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQztJQUNuRCxXQUFXLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUM7QUFDOUMsQ0FBQyxFQUFHLENBQUMsQ0FBQztBQUVOLHFCQUFxQixDQUFjO0lBQy9CQyxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUNsREEsTUFBTUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7QUFDL0JBLENBQUNBO0FBRUQsc0JBQXNCLENBQVksRUFBRSxDQUFjO0lBSTlDQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDaEJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBO1lBQ3BDQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUN2Q0EsS0FBS0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDdkNBLEtBQUtBLEdBQUdBLENBQUNBLFdBQVdBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQzFDQSxLQUFLQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUM3Q0EsS0FBS0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDM0NBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BO2dCQUNYQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQTtvQkFBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQTtvQkFBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDakRBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3REQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQTtnQkFBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDMURBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7QUFDcENBLENBQUNBO0FBRUQsd0JBQXdCLENBQVksRUFBRSxDQUFjO0lBRWhEQyxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQTtRQUNsQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsU0FBU0E7UUFDeEJBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLGFBQWFBO1FBQzVCQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxhQUFhQTtRQUM1QkEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDOUJBLElBQUlBLEdBQUdBLEdBQW9CQSxFQUFFQSxDQUFDQTtJQUM5QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDakNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ3JGQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1Q0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7QUFDZkEsQ0FBQ0E7QUFFRCxxQkFBcUIsQ0FBWSxFQUFFLENBQWM7SUFFN0NDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO0lBQ2xCQSxJQUFJQSxHQUFHQSxHQUFvQkEsRUFBRUEsQ0FBQ0E7SUFDOUJBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO0lBQ1pBLElBQUlBLEVBQUVBLENBQUNBO0lBQ1BBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUdoQkEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3RDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNiQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUMzQkEsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ2xDQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFWkEsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO2dCQUN6QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7b0JBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDMUJBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO3dCQUNsQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO29CQUNEQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0NBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3BDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtBQUNmQSxDQUFDQTtBQUVELDRCQUE0QixDQUFZLEVBQUUsR0FBZ0IsRUFBRSxJQUFpQjtJQUV6RUMsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLEdBQUdBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO0lBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNmQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUNwR0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQzVIQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2hEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUN6SEEsQ0FBQ0E7SUFDREEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsNENBQTRDQSxDQUFDQSxDQUFDQTtBQUMvREEsQ0FBQ0E7QUFFRCx1QkFBdUIsQ0FBWSxFQUFFLENBQWM7SUFDL0NDLElBQUlBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ2hCQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUMzQkEsSUFBSUEsSUFBSUEsRUFBRUEsTUFBTUEsR0FBR0EsRUFBRUEsRUFBRUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFFdkNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3JCQSxJQUFJQSxHQUFHQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFJbERBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDZEEsQ0FBQ0E7WUFFREEsUUFBUUEsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLE9BQU9BLEVBQUVBLENBQUNBO1FBQ2RBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBR0ZBLE1BQU1BLEdBQUdBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFDQSxPQUFPQSxFQUFFQSxDQUFDQTtRQUNkQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuREEsTUFBTUEsV0FBV0EsQ0FBQ0EsMkJBQTJCQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMzRUEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDZEEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDbEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE9BQU9BLEVBQUVBLEVBQUVBLENBQUNBO1lBQzVCQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xGQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUV0RkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFJcEJBLElBQUlBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUVEQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNsQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7QUFDM0VBLENBQUNBO0FBR0QsMEJBQTBCLENBQVksRUFBRSxDQUFjO0lBQ2xEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDdEJBLElBQUlBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBO0lBQzlCQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNuQ0EsSUFBSUEsQ0FBQ0EsR0FBUUEsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDdEVBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO1FBQ2pDQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDekVBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0FBQ2JBLENBQUNBO0FBRUQseUJBQXlCLENBQVksRUFBRSxDQUFjO0lBRWpEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN0QkEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDM0JBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3pDQSxJQUFJQSxRQUFRQSxHQUFHQSxnQkFBZ0JBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ2hEQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNOQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ25GQSxJQUFJQTtRQUNBQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtBQUNwREEsQ0FBQ0E7QUFFRCwwQkFBMEIsQ0FBWSxFQUFFLENBQWM7SUFDbERDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3ZCQSxJQUFJQSxZQUFZQSxHQUFvQkEsRUFBRUEsQ0FBQ0E7SUFDdkNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1FBQzNCQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN0REEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7QUFDeEJBLENBQUNBO0FBRUQseUJBQXlCLENBQVksRUFBRSxDQUFjO0lBQ2pEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN0QkEsSUFBSUEsWUFBWUEsR0FBR0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwREEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFFdEZBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO0lBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNqQ0EsS0FBS0EsR0FBR0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDeERBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBO1FBQ3ZDQSxLQUFLQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUN6REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUkEsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEtBQUtBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBO0lBQ3BDQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtBQUNqQkEsQ0FBQ0E7QUFFRCx1QkFBdUIsQ0FBWSxFQUFFLENBQWM7SUFDL0NDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3JCQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUN0Q0EsQ0FBQ0E7QUFFRCx3QkFBd0IsQ0FBWSxFQUFFLENBQWM7SUFFaERDLElBQUlBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBO0lBQ25CQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN6Q0EsSUFBSUEsV0FBV0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BDQSxJQUFJQSxZQUFZQSxHQUFHQSxhQUFhQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqREEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsWUFBWUEsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxZQUFZQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtBQUN2SEEsQ0FBQ0E7QUFFRCx3QkFBd0IsQ0FBWSxFQUFFLENBQWM7SUFDaERDLElBQUlBLEtBQW9CQSxDQUFDQTtJQUN6QkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsRUFBRUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDbENBLElBQUlBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3ZCQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxLQUFLQSxDQUFDQSxJQUFJQSxTQUFTQSxLQUFLQSxDQUFDQSxJQUFJQSxTQUFTQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUd0RUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDdEJBLElBQUlBLEtBQUtBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNmQSxPQUFPQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN6Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDaEJBLE1BQU1BLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3hDQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxPQUFPQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtBQUM3RUEsQ0FBQ0E7QUFFRCxzQkFBc0IsQ0FBWSxFQUFFLENBQWM7SUFJOUNDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUNuQkEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDMUJBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzNCQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUVwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDMUJBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FDbkJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzFCQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMzQkEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDM0JBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2QkEsSUFBSUEsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLElBQUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxJQUFJQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUdoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekZBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO1lBQ2ZBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBO1FBRVhBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLE1BQU1BLEdBQUdBO2dCQUNMQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUNaQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNuQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDcENBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQ3BDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUMzQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1pBLENBQUNBO1FBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzdCQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQ0EsTUFBTUEsR0FBR0E7Z0JBQ0xBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQ1pBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLEVBQzVCQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNqQ0EsTUFBTUEsRUFDTkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFDcEJBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUNuQkEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDMUJBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzNCQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0E7SUFDREEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esb0NBQW9DQSxDQUFDQSxDQUFDQTtBQUN2REEsQ0FBQ0E7QUFFRCx3QkFBd0IsQ0FBWSxFQUFFLENBQWMsRUFBRSxPQUFPO0lBQ3pEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUNyQkEsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDYkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNmQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxPQUFPQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN4REEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7QUFDZkEsQ0FBQ0E7QUFFRCx1QkFBdUIsQ0FBWSxFQUFFLENBQWM7SUFDL0NDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3JCQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtBQUN0R0EsQ0FBQ0E7QUFFRCwwQkFBMEIsQ0FBWSxFQUFFLENBQWM7SUFDbERDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNYQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNqQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEs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QSxDQUFDQSxDQUFDQTtvQkFDYkEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzVCQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0RUEsS0FBS0EsR0FBR0EsQ0FBQ0EsY0FBY0E7Z0JBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hCQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQTtnQkFDbEJBLENBQUNBO2dCQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDRkEsSUFBSUEsQ0FBQ0EsR0FBR0Esa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0NBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMxQkEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3JDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsQ0FBQ0E7WUFDTEEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0E7Z0JBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQy9EQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFFRkEsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7b0JBQ2JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBO3dCQUM5QkEsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0E7b0JBQ25DQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDM0VBLENBQUNBO1lBQ0xBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BO2dCQUNYQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNqREE7Z0JBQ0lBLE1BQU1BLFdBQVdBLENBQUNBLHdCQUF3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUVBLENBQUNBO1FBQ0RBLEtBQUtBLENBQUNBO0lBQ1ZBLENBQUNBO0FBQ0xBLENBQUNBO0FBRUQsMEJBQTBCLENBQVksRUFBRSxDQUFjO0lBQ2xEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUN4QkEsSUFBSUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDdEJBLElBQUlBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBO0lBQzlCQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2hCQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUM1QkEsSUFBSUEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDakJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBO1lBQzlCQSxPQUFPQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxFQUFFQSxNQUFNQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUM3REEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2ZBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2RBLElBQUlBLFNBQVNBLENBQUNBO1FBRWRBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDekNBLEdBQUdBLEdBQUdBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDTkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ3RDQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxFQUFFQSxDQUFDQTtRQUNaQSxDQUFDQTtRQUNEQSxFQUFFQSxHQUFHQSxDQUFDQTtRQUNOQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6QkEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUE7Z0JBRVhBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNsQkEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLEtBQUtBLENBQUNBO1lBQ1ZBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BO2dCQUVYQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsR0FBR0EsQ0FBQ0EsZUFBZUE7Z0JBRXBCQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDbEJBLFNBQVNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxNQUFNQSxXQUFXQSxDQUFDQSw0REFBNERBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1R0EsS0FBS0EsQ0FBQ0E7WUFDVkE7Z0JBQ0lBLE1BQU1BLFdBQVdBLENBQUNBLHFDQUFxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDekZBLENBQUNBO1FBQ0RBLElBQUlBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUN0QkEsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0Esa0JBQWtCQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxQ0EsSUFBSUE7WUFDQUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7Z0JBQzlCQSxPQUFPQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzVEQSxJQUFJQSxPQUFPQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNsQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsT0FBT0EsRUFBRUEsS0FBS0EsRUFBRUEsTUFBTUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDeEZBLENBQUNBO0lBQ0RBLE1BQU1BLFdBQVdBLENBQUNBLDBCQUEwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7QUFDMUVBLENBQUNBO0FBRUQsNEJBQTRCLENBQVksRUFBRSxDQUFjO0lBQ3BEQyxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxhQUFhQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUN4RUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDL0NBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQzlCQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtB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LENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3RCQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMzQkEsSUFBSUEsR0FBR0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLElBQUlBLEtBQUtBLEdBQUdBLGFBQWFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ2hDQSxJQUFJQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNuQkEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDckJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1FBQzdCQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUN0QkEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekJBLElBQUlBLENBQUNBLEdBQUdBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2pEQSxJQUFJQSxVQUFVQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqREEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLEVBQUVBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLFVBQVVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQzFEQSxJQUFJQTtZQUNBQSxFQUFFQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxFQUFFQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxVQUFVQSxDQUFDQSxFQUFFQSxVQUFVQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVySEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxJQUFJQSxHQUFHQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMvQkEsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDYkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQzVCQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JCQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO29CQUNkQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0E7UUFDakJBLENBQUNBO1FBQ0RBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ3RCQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtBQUN6RUEsQ0FBQ0E7QUFFRCx5QkFBeUIsQ0FBWSxFQUFFLENBQWM7SUFDakRHLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE9BQU9BLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ25EQSxJQUFJQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsU0FBU0EsSUFBSUEsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLElBQUlBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxJQUFJQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDckRBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDM0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUM3QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7d0JBQzlCQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDcENBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUNMQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEQSxJQUFJQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1Q0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ2hHQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNqR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsRUFBRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDdkdBLENBQUNBO0lBRURBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0E7QUFDeENBLENBQUNBO0FBRUQsdUJBQXVCLENBQVksRUFBRSxDQUFjO0lBQy9DQyxJQUFJQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNiQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsR0FBR0EsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdENBLElBQUlBLFVBQVVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQzdCQSxJQUFJQSxPQUFPQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxVQUFVQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUM1REEsSUFBSUEsTUFBTUEsQ0FBQ0E7SUFDWEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3hCQSxJQUFJQTtRQUNBQSxNQUFNQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUVqRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFDM0JBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzlCQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMzQkEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7QUFDckNBLENBQUNBO0FBRUQsb0JBQW9CLENBQVksRUFBRSxDQUFjLEVBQUUsSUFBbUI7SUFNakVDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3BCQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNkQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNsQkEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDOUJBLElBQUlBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQzNCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDcERBLElBQUlBO2dCQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLE1BQU1BLFdBQVdBLENBQUNBLGlFQUFpRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDakhBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLFNBQVNBLEdB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O1lBQ2xDQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM3Q0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7QUFDaEdBLENBQUNBO0FBRUQsdUJBQXVCLENBQUMsRUFBRSxDQUFjLEVBQUUsUUFBdUI7SUFLN0RDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDbkZBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3BEQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNwQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsUUFBUUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDOUdBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzdCQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM3QkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ2JBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ2hIQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUtGQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNsQkEsSUFBSUEs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UUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLEtBQUtBLEdBQUdBLENBQUNBLGFBQWFBLEVBQUVBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQzlFQSxLQUFLQSxHQUFHQSxDQUFDQSxVQUFVQTtZQUNmQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNsRkEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0E7WUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNkQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUM5REEsSUFBSUE7Z0JBQ0FBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQzdGQSxLQUFLQSxHQUFHQSxDQUFDQSxVQUFVQTtZQUNmQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDZEEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDL0ZBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FDckJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzNCQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMzQkEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FDckJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzNCQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMzQkEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDM0JBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3BDQTtZQUNJQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLENBQUNBO0lBQzdDQSxDQUFDQTtJQUNEQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSwwQkFBMEJBLENBQUNBLENBQUNBO0FBQzdDQSxDQUFDQTtBQUVELHlCQUF5QixDQUFZLEVBQUUsQ0FBYztJQUtqREMsSUFBSUEsRUFBRUEsQ0FBQ0E7SUFDUEEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDbEJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO0lBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDdERBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUNEQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUV4QkEsSUFBSUEsSUFBSUEsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDZEEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFLbEJBLElBQUlBLFlBQVlBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ3pCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNWQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNWQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNWQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNoQkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakJBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLEtBQUtBLEdBQUdBLENBQUNBLEtBQUtBO2dCQUNWQSxJQUFJQSxXQUFXQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDcEJBLElBQUlBLGFBQWFBLEdBQVlBLEtBQUtBLENBQUNBO2dCQUNuQ0EsWUFBWUEsRUFBRUEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7b0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDekRBLFFBQVFBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUMvQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQ1BBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBO29CQUN4QkEsQ0FBQ0E7b0JBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO3dCQUdwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7NEJBQzlCQSxNQUFNQSxXQUFXQSxDQUFDQSxnQ0FBZ0NBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNoRkEsTUFBTUEsV0FBV0EsQ0FBQ0EsK0NBQStDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFDL0ZBLENBQUNBO29CQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDaEJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO3dCQUVsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQ2hCQSxNQUFNQSxXQUFXQSxDQUFDQSw0Q0FBNENBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUM1RkEsQ0FBQ0E7d0JBQ0RBLElBQUlBLENBQUNBLENBQUNBOzRCQUlGQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQTs0QkFDckJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBOzRCQUNsQkEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7NEJBQ3RDQSxRQUFRQSxDQUFDQSxZQUFZQSxDQUFDQTt3QkFDMUJBLENBQUNBO29CQUNMQSxDQUFDQTtvQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ25DQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDbkRBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO3dCQUNwQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2hGQSxDQUFDQTtvQkFDREEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ1BBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO3dCQUNkQSxNQUFNQSxXQUFXQSxDQUFDQSwwQ0FBMENBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMxRkEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQTtnQkFDWEEsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BFQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDdkNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNQQSxLQUFLQSxDQUFDQTtZQUNWQSxLQUFLQSxHQUFHQSxDQUFDQSxZQUFZQTtnQkFDakJBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDUEEsS0FBS0EsQ0FBQ0E7WUFDVkE7Z0JBQ0lBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGdDQUFnQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0FBQ2pFQSxDQUFDQTtBQUVELHVCQUF1QixDQUFZLEVBQUUsQ0FBYyxFQUFFLFlBQTZCO0lBRTlFQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUNwQkEsSUFBSUEsSUFBSUEsR0FBR0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDckNBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQzVEQSxJQUFJQSxJQUFJQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMzQ0EsSUFBSUEsSUFBSUEsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0FBQzVGQSxDQUFDQTtBQUVELDBCQUEwQixDQUFZLEVBQUUsQ0FBYztJQUNsREMsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDM0JBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN4Q0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDaENBLENBQUNBO0FBRUQsd0JBQXdCLENBQVksRUFBRSxDQUFjLEVBQUUsWUFBWTtJQUM5REMsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDckJBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2xEQSxJQUFJQSxTQUFTQSxHQUFXQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNsREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsRUFBRUEsRUFBRUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDbkhBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2hDQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxFQUFFQSxFQUFFQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUVuSEEsSUFBSUEsS0FBS0EsR0FBR0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM3Q0EsSUFBSUEsQ0FBQ0EsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDcENBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLEVBQUVBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0FBQzVGQSxDQUFDQTtBQUVELHVCQUF1QixDQUFZLEVBQUUsQ0FBYztJQUMvQ0MsSUFBSUEsSUFBSUEsQ0FBQ0E7SUFDVEEsSUFBSUEsVUFBVUEsQ0FBQ0E7SUFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsSUFBSUEsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDbERBLFVBQVVBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQzVDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxJQUFJQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2Q0EsVUFBVUEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEVBQUVBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0FBQ3pFQSxDQUFDQTtBQUVELHNCQUFzQixDQUFZLEVBQUUsQ0FBYztJQUc5Q0MsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsYUFBYUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDeEVBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO0lBRTNCQSxzQkFBc0JBLENBQVlBLEVBQUVBLENBQWNBO1FBQzlDQyxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyQkEsYUFBYUEsRUFBRUEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7WUFDekJBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1JBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDZEEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBO2dCQUNBQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNqQkEsY0FBY0EsRUFBRUEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7Z0JBQzFCQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDdEJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7b0JBQ3hCQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQTtnQkFDM0JBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ2hCQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDbEJBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBO29CQUM1QkEsQ0FBQ0E7b0JBQ0RBLElBQUlBO3dCQUNBQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDckJBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUNEQSxLQUFLQSxDQUFDQTtRQUNWQSxDQUFDQTtRQUNEQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSw2QkFBNkJBLENBQUNBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQUVERCxxQkFBcUJBLENBQVlBLEVBQUVBLENBQWNBO1FBQzdDRSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNiQSxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7Z0JBQ2pDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxFQUFFQSxDQUFDQTtZQUNQQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BCQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVERixJQUFJQSxHQUFHQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNyQ0EsSUFBSUEsS0FBS0EsR0FBR0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDL0JBLElBQUlBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO0lBQ2pCQSxJQUFJQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDN0JBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3JCQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBLFVBQVVBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdDQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUNQQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqQkEsRUFBRUEsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsVUFBVUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLElBQUlBO1lBQ0FBLEVBQUVBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLFVBQVVBLENBQUNBLEVBQUVBLFVBQVVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3JIQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLElBQUlBLEdBQUdBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQzlCQSxJQUFJQSxHQUFHQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNiQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDNUJBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUN0QkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xCQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEJBLFVBQVVBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN6Q0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0E7Z0JBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtvQkFDZEEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBO2dCQUN6QkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBO1FBQ2pCQSxDQUFDQTtRQUNEQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7QUFDM0VBLENBQUNBO0FBRUQseUJBQXlCLENBQVksRUFBRSxDQUFjO0lBRWpERyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUN2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDcEhBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2xCQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUM3SUEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EseUNBQXlDQSxDQUFDQSxDQUFDQTtBQUM1REEsQ0FBQ0E7QUFFRCx5QkFBeUIsQ0FBWSxFQUFFLENBQWM7SUFDakRDLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3RCQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNoQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeEJBLEtBQUtBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1FBQzlCQSxLQUFLQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM5QkEsS0FBS0EsR0FBR0E7WUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBO1lBQzlEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN4QkEsS0FBS0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDOUJBLEtBQUtBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2pDQSxLQUFLQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNqQ0EsS0FBS0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDakNBLEtBQUtBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2pDQSxLQUFLQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNoQ0EsS0FBS0EsR0FBR0E7WUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3pEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUN6QkEsU0FBU0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtJQUMvQ0EsQ0FBQ0E7QUFDTEEsQ0FBQ0E7QUFFRCxxQkFBcUIsQ0FBWSxFQUFFLENBQWM7SUFLN0NDLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQzNCQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMxQkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDeEJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzFCQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUM1QkEsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1FBQzVCQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuQ0EsSUFBSUEsV0FBV0EsR0FBR0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLEdBQUdBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdDQSxNQUFNQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxXQUFXQSxFQUFFQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUNoR0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7QUFFbEJBLENBQUNBO0FBRUQsd0JBQXdCLENBQVksRUFBRSxDQUFjO0lBS2hEQyxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxhQUFhQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN4R0EsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQzNGQSxDQUFDQTtBQUVMQSxDQUFDQTtBQUVELHdCQUF3QixDQUFZLEVBQUUsQ0FBYztJQUNoREMsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDckJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ2JBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3JGQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxQ0EsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLElBQUlBLEtBQUtBLEdBQUdBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2xDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsS0FBS0EsUUFBUUEsQ0FBQ0EsWUFBWUEsRUFBRUEsTUFBTUEsV0FBV0EsQ0FBQ0EsMkRBQTJEQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNuSUEsS0FBS0EsUUFBUUEsQ0FBQ0EsS0FBS0EsRUFBRUEsTUFBTUEsV0FBV0EsQ0FBQ0EsdURBQXVEQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN4SEEsS0FBS0EsUUFBUUEsQ0FBQ0EsSUFBSUE7Z0JBQ2RBLElBQUlBLE9BQU9BLEdBQW1CQSxLQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDeENBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUN6Q0EsS0FBS0EsQ0FBQ0E7WUFDVkEsS0FBS0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDeEJBLEtBQUtBLFFBQVFBLENBQUNBLFNBQVNBO2dCQUNuQkEsS0FBS0EsQ0FBQ0E7WUFDVkE7Z0JBQ0lBLE1BQU1BLFdBQVdBLENBQUNBLDZDQUE2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDakdBLENBQUNBO1FBQ0RBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBRXpDQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQkEsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDekJBLEtBQUtBLEdBQUdBLGNBQWNBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQTtZQUNBQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUU5QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDekdBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBRUZBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlCQSxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNqQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFBQ0EsTUFBTUEsV0FBV0EsQ0FBQ0EsNkNBQTZDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN4SEEsSUFBSUEsQ0FBQ0EsR0FBR0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlDQSxPQUFPQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN2QkEsQ0FBQ0E7UUFDREEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLFVBQVVBLENBQUNBO1FBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBO1lBQzVCQSxVQUFVQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMxQ0EsSUFBSUE7WUFDQUEsVUFBVUEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDdENBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEVBQUVBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQzVFQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVELHNCQUFzQixDQUFZLEVBQUUsQ0FBYztJQUM5Q0MsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDN0JBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQ3JCQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMxQkEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDMUJBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEVBQzFCQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtBQUNoQ0EsQ0FBQ0E7QUFNRCxrQkFBa0IsQ0FBWSxFQUFFLENBQVM7SUFJckNDLElBQUlBLFVBQVVBLEdBQUdBLFVBQVNBLENBQUNBLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQSxDQUFDLENBQUMsQ0FBQ0E7SUFDckRBLElBQUlBLFlBQVlBLEdBQUdBLFVBQVNBLENBQUNBLEVBQUVBLEtBQUtBO1FBQ2hDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDbkIsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQ2IsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsRUFBRSxDQUFDLENBQUM7Z0JBQ0osQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDM0IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDakMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUksQ0FBQztnQkFDaEMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQUMsR0FBRyxJQUFJLElBQUks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QUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxLQUFLQSxHQUFHQSxFQUFFQSxvQ0FBb0NBLENBQUNBLENBQUNBO0lBRXJGQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNuRkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFOUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xFQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNyRkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDMUNBLENBQUNBO0FBS0Qsc0JBQXNCLENBQVksRUFBRSxDQUFjO0lBQzlDQyxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUMvQkEsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDYkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7UUFDOUJBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hCQSxJQUFJQSxDQUFDQTtZQUNEQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FDQUE7UUFBQUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsTUFBTUEsV0FBV0EsQ0FBQ0Esd0RBQXdEQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM1R0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7QUFDZkEsQ0FBQ0E7QUFFRCxxQkFBcUIsQ0FBWSxFQUFFLENBQUMsRUFBRSxNQUFjO0lBQ2hEQyxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUVqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLE1BQU1BLFdBQVdBLENBQUNBLDJDQUEyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDekZBLENBQUNBO0lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hCQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFHREEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDWkEsSUFBSUEsS0FBS0EsQ0FBQ0E7SUFDVkEsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDZkEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3RCQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUVBLEdBQUdBLEdBQUdBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZCQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMxQkEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFMURBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVqRkEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNkQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFZEEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoRUEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNWQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNyREEsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFDREEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBRUZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNwRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO0lBQ0xBLENBQUNBO0lBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLGNBQWNBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTVHQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO0lBQ3BFQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNOQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO0lBQ0xBLENBQUNBO0FBQ0xBLENBQUNBO0FBRUQscUJBQXFCLENBQVksRUFBRSxDQUFjO0lBQzdDQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUV0QkEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDckJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO0lBQ2pCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUNqQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3RCQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtJQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDdkNBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ2pEQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN2QkEsS0FBS0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxJQUFJQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLElBQUlBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUN2QkEsS0FBS0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBRURBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO0lBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxRQUFRQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxFQUFFQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUN0RkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO2dCQUN2QkEsSUFBSUEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0FBQ2xEQSxDQUFDQTtBQUVELHdCQUF3QixDQUFZLEVBQUUsQ0FBYztJQUNoREMsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDckJBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ2RBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BO1lBRVhBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3RGQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQTtZQUNiQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUN4RUEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUE7WUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDeEZBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BO1lBQ1hBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDdkJBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ3pFQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDMUJBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQzdCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFDakRBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1lBQy9CQSxNQUFNQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3JDQSxLQUFLQSxHQUFHQSxDQUFDQSxNQUFNQTtZQUNYQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3ZCQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUN4RUEsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBO2dCQUNuREEsTUFBTUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsUUFBUUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7WUFDM0ZBLElBQUlBO2dCQUNBQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNyQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUE7WUFFYkEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pDQSxJQUFJQSxJQUFJQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNkQSxJQUFJQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNoQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ2xDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxDQUFDQTtZQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUNuRUEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0E7WUFDaEJBLE1BQU1BLFdBQVdBLENBQUNBLHFDQUFxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDckZBO1lBQ0lBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDaERBLENBQUNBO0FBQ0xBLENBQUNBO0FBRUQseUJBQXlCLENBQVksRUFBRSxDQUFjO0lBQ2pEQyxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN0QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0lBQzNCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUM5QkEsSUFBSUEsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBO1lBQ3hCQSxLQUFLQSxDQUFDQTtRQUNWQSxJQUFJQSxHQUFHQSxHQUFHQSxhQUFhQSxDQUFDQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDdEJBLEdBQUdBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBO1FBQzlCQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQTtJQUNaQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5Q0EsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLFFBQVFBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3ZFQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUNiQSxDQUFDQTtBQUVELG9CQUFvQixDQUFZLEVBQUUsQ0FBYztJQUM1Q0MsSUFBSUEsRUFBRUEsT0FBT0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDaEJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1lBQ2hCQSxLQUFLQSxHQUFHQSxDQUFDQSxRQUFRQTtnQkFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsVUFBVUEsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7b0JBQy9FQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDekNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNoQkEsTUFBTUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFbENBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1lBQ2hCQSxLQUFLQSxHQUFHQSxDQUFDQSxPQUFPQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2ZBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUNoQkEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7Z0JBQ2xCQSxDQUFDQTtnQkFDREEsSUFBSUEsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBQ2JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBO29CQUM5QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQTtvQkFDNUJBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO2dCQUMxRUEsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxNQUFNQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUN6RUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNmQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEJBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBO2dCQUNsQkEsQ0FBQ0E7Z0JBQ0RBLElBQUlBLENBQUNBLENBQUNBO29CQUNGQSxNQUFNQSxDQUFDQSxJQUFJQSxR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QSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUEsR0FBR0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbENBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO0lBQ2RBLENBQUNBO0lBQ0RBLElBQUlBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBO0lBQ2JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1FBQ2pEQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0E7SUFDREEsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsT0FBT0EsR0FBR0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDcEVBLE1BQU1BLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO0FBQ3JFQSxDQUFDQTtBQUVELG9CQUFvQixDQUFZLEVBQUUsQ0FBYztJQUM1Q0MsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdEJBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQzdCQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLEdBQUdBLENBQUNBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNoQkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsS0FBS0EsR0FBR0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLEtBQUtBLEdBQUdBLENB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QUk7Z0JBQUUsQ0FBQztvQkFDakIsSUFBSSxJQUFJLEdBQWlDLElBQUksQ0FBQztvQkFDOUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsRUFBRSxHQUFHLFdBQVcsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLGVBQWUsR0FBRyxJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQztnQkFDdEcsQ0FBQztnQkFDRyxLQUFLLENBQUM7WUFDVixLQUFLLFFBQVEsQ0FBQyxHQUFHO2dCQUFFLENBQUM7b0JBQ2hCLElBQUksR0FBRyxHQUErQixJQUFJLENBQUM7b0JBQzNDLE1BQU0sQ0FBQyxPQUFPLENBQUM7Z0JBQ25CLENBQUM7Z0JBQ0csS0FBSyxDQUFDO1lBQ1YsU0FBUyxDQUFDO1lBQ1YsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDLENBQUNBO0lBRUZBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0FBQzNCQSxDQUFDQTtBQXZHZSxlQUFPLFVBdUd0QixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGFzc2VydHMgPSByZXF1aXJlKCcuL2Fzc2VydHMnKTtcbmltcG9ydCBhc3Rub2RlcyA9IHJlcXVpcmUoJy4vYXN0bm9kZXMnKTtcbmltcG9ydCBiYXNlID0gcmVxdWlyZSgnLi9iYXNlJyk7XG5pbXBvcnQgbnVtZXJpY0xpdGVyYWwgPSByZXF1aXJlKCcuL251bWVyaWNMaXRlcmFsJyk7XG5pbXBvcnQgcGFyc2VyID0gcmVxdWlyZSgnLi9QYXJzZXInKTtcbmltcG9ydCB0YWJsZXMgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xuaW1wb3J0IFRva2VuaXplciA9IHJlcXVpcmUoJy4vVG9rZW5pemVyJyk7XG4vL1xuLy8gVGhpcyBpcyBwcmV0dHkgbXVjaCBhIHN0cmFpZ2h0IHBvcnQgb2YgYXN0LmMgZnJvbSBDUHl0aG9uIDIuNi41LlxuLy9cbi8vIFRoZSBwcmV2aW91cyB2ZXJzaW9uIHdhcyBlYXNpZXIgdG8gd29yayB3aXRoIGFuZCBtb3JlIEpTLWlzaCwgYnV0IGhhdmluZyBhXG4vLyBzb21ld2hhdCBkaWZmZXJlbnQgYXN0IHN0cnVjdHVyZSB0aGFuIGNweXRob24gbWFrZXMgdGVzdGluZyBtb3JlIGRpZmZpY3VsdC5cbi8vXG4vLyBUaGlzIHdheSwgd2UgY2FuIHVzZSBhIGR1bXAgZnJvbSB0aGUgYXN0IG1vZHVsZSBvbiBhbnkgYXJiaXRyYXJ5IHB5dGhvblxuLy8gY29kZSBhbmQga25vdyB0aGF0IHdlJ3JlIHRoZSBzYW1lIHVwIHRvIGFzdCBsZXZlbCwgYXQgbGVhc3QuXG4vL1xudmFyIFBhcnNlVGFibGVzID0gdGFibGVzLlBhcnNlVGFibGVzO1xudmFyIFNZTSA9IFBhcnNlVGFibGVzLnN5bTtcbnZhciBUT0sgPSBUb2tlbml6ZXIuVG9rZW5zO1xuXG4vKipcbiAqIEBjb25zdFxuICogQHR5cGUge251bWJlcn1cbiAqL1xudmFyIExPTkdfVEhSRVNIT0xEID0gTWF0aC5wb3coMiwgNTMpO1xuXG4vKipcbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlXG4gKiBAcGFyYW0ge3N0cmluZ30gZmlsZU5hbWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBsaW5lTnVtYmVyXG4gKi9cbmZ1bmN0aW9uIHN5bnRheEVycm9yKG1lc3NhZ2U6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyKSB7XG4gICAgYXNzZXJ0cy5hc3NlcnQoYmFzZS5pc1N0cmluZyhtZXNzYWdlKSwgXCJtZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdcIik7XG4gICAgYXNzZXJ0cy5hc3NlcnQoYmFzZS5pc1N0cmluZyhmaWxlTmFtZSksIFwiZmlsZU5hbWUgbXVzdCBiZSBhIHN0cmluZ1wiKTtcbiAgICBhc3NlcnRzLmFzc2VydChiYXNlLmlzTnVtYmVyKGxpbmVOdW1iZXIpLCBcImxpbmVOdW1iZXIgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICB2YXIgZSA9IG5ldyBTeW50YXhFcnJvcihtZXNzYWdlLyosIGZpbGVOYW1lKi8pO1xuICAgIGVbJ2ZpbGVOYW1lJ10gPSBmaWxlTmFtZTtcbiAgICBlWydsaW5lTnVtYmVyJ10gPSBsaW5lTnVtYmVyO1xuICAgIHJldHVybiBlO1xufVxuXG5jbGFzcyBDb21waWxpbmcge1xuICAgIHB1YmxpYyBjX2VuY29kaW5nOiBzdHJpbmc7XG4gICAgcHVibGljIGNfZmlsZW5hbWU6IHN0cmluZztcbiAgICBjb25zdHJ1Y3RvcihlbmNvZGluZzogc3RyaW5nLCBmaWxlbmFtZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuY19lbmNvZGluZyA9IGVuY29kaW5nO1xuICAgICAgICB0aGlzLmNfZmlsZW5hbWUgPSBmaWxlbmFtZTtcbiAgICB9XG59XG5cbi8qKlxuICogQHJldHVybiB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBOQ0gobjogcGFyc2VyLk5vZGUpOiBudW1iZXIge1xuICAgIGFzc2VydHMuYXNzZXJ0KG4gIT09IHVuZGVmaW5lZCk7XG4gICAgaWYgKG4uY2hpbGRyZW4gPT09IG51bGwpIHJldHVybiAwOyByZXR1cm4gbi5jaGlsZHJlbi5sZW5ndGg7XG59XG5cbmZ1bmN0aW9uIENISUxEKG46IHBhcnNlci5Ob2RlLCBpKTogcGFyc2VyLk5vZGUge1xuICAgIGFzc2VydHMuYXNzZXJ0KG4gIT09IHVuZGVmaW5lZCk7XG4gICAgYXNzZXJ0cy5hc3NlcnQoaSAhPT0gdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gbi5jaGlsZHJlbltpXTtcbn1cblxuZnVuY3Rpb24gUkVRKG46IHBhcnNlci5Ob2RlLCB0eXBlOiBudW1iZXIpIHtcbiAgICBhc3NlcnRzLmFzc2VydChuLnR5cGUgPT09IHR5cGUsIFwibm9kZSB3YXNuJ3QgZXhwZWN0ZWQgdHlwZVwiKTtcbn1cblxuZnVuY3Rpb24gc3Ryb2JqKHM6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgYXNzZXJ0cy5hc3NlcnQodHlwZW9mIHMgPT09IFwic3RyaW5nXCIsIFwiZXhwZWN0aW5nIHN0cmluZywgZ290IFwiICsgKHR5cGVvZiBzKSk7XG4gICAgLy8gVGhpcyBwcmV2aXVvc2x5IGNvbnN0cnVjdGVkIHRoZSBydW50aW1lIHJlcHJlc2VudGF0aW9uLlxuICAgIC8vIFRoYXQgbWF5IGhhdmUgaGFkIGFuIHN0cmluZyBpbnRlcm4gc2lkZSBlZmZlY3Q/XG4gICAgcmV0dXJuIHM7XG59XG5cbi8qKiBAcmV0dXJuIHtudW1iZXJ9ICovXG5mdW5jdGlvbiBudW1TdG10cyhuOiBwYXJzZXIuTm9kZSkge1xuICAgIHN3aXRjaCAobi50eXBlKSB7XG4gICAgICAgIGNhc2UgU1lNLnNpbmdsZV9pbnB1dDpcbiAgICAgICAgICAgIGlmIChDSElMRChuLCAwKS50eXBlID09PSBUT0suVF9ORVdMSU5FKVxuICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBudW1TdG10cyhDSElMRChuLCAwKSk7XG4gICAgICAgIGNhc2UgU1lNLmZpbGVfaW5wdXQ6XG4gICAgICAgICAgICB2YXIgY250ID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2ggPSBDSElMRChuLCBpKTtcbiAgICAgICAgICAgICAgICBpZiAoY2gudHlwZSA9PT0gU1lNLnN0bXQpXG4gICAgICAgICAgICAgICAgICAgIGNudCArPSBudW1TdG10cyhjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY250O1xuICAgICAgICBjYXNlIFNZTS5zdG10OlxuICAgICAgICAgICAgcmV0dXJuIG51bVN0bXRzKENISUxEKG4sIDApKTtcbiAgICAgICAgY2FzZSBTWU0uY29tcG91bmRfc3RtdDpcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICBjYXNlIFNZTS5zaW1wbGVfc3RtdDpcbiAgICAgICAgICAgIHJldHVybiBNYXRoLmZsb29yKE5DSChuKSAvIDIpOyAvLyBkaXYgMiBpcyB0byByZW1vdmUgY291bnQgb2YgO3NcbiAgICAgICAgY2FzZSBTWU0uc3VpdGU6XG4gICAgICAgICAgICBpZiAoTkNIKG4pID09PSAxKVxuICAgICAgICAgICAgICAgIHJldHVybiBudW1TdG10cyhDSElMRChuLCAwKSk7XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY250ID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMjsgaSA8IE5DSChuKSAtIDE7ICsraSlcbiAgICAgICAgICAgICAgICAgICAgY250ICs9IG51bVN0bXRzKENISUxEKG4sIGkpKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY250O1xuICAgICAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwiTm9uLXN0YXRlbWVudCBmb3VuZFwiKTtcbiAgICB9XG4gICAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIGZvcmJpZGRlbkNoZWNrKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUsIHgsIGxpbmVubzogbnVtYmVyKSB7XG4gICAgaWYgKHggPT09IFwiTm9uZVwiKSB0aHJvdyBzeW50YXhFcnJvcihcImFzc2lnbm1lbnQgdG8gTm9uZVwiLCBjLmNfZmlsZW5hbWUsIGxpbmVubyk7XG4gICAgaWYgKHggPT09IFwiVHJ1ZVwiIHx8IHggPT09IFwiRmFsc2VcIikgdGhyb3cgc3ludGF4RXJyb3IoXCJhc3NpZ25tZW50IHRvIFRydWUgb3IgRmFsc2UgaXMgZm9yYmlkZGVuXCIsIGMuY19maWxlbmFtZSwgbGluZW5vKTtcbn1cblxuLyoqXG4gKiBTZXQgdGhlIGNvbnRleHQgY3R4IGZvciBlLCByZWN1cnNpdmVseSB0cmF2ZXJzaW5nIGUuXG4gKlxuICogT25seSBzZXRzIGNvbnRleHQgZm9yIGV4cHIga2luZHMgdGhhdCBjYW4gYXBwZWFyIGluIGFzc2lnbm1lbnQgY29udGV4dCBhc1xuICogcGVyIHRoZSBhc2RsIGZpbGUuXG4gKi9cbmZ1bmN0aW9uIHNldENvbnRleHQoYzogQ29tcGlsaW5nLCBlLCBjdHg6IGFzdG5vZGVzLmV4cHJfY29udGV4dCwgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBhc3NlcnRzLmFzc2VydChjdHggIT09IGFzdG5vZGVzLkF1Z1N0b3JlICYmIGN0eCAhPT0gYXN0bm9kZXMuQXVnTG9hZCk7XG4gICAgdmFyIHMgPSBudWxsO1xuICAgIHZhciBleHByTmFtZSA9IG51bGw7XG5cbiAgICBzd2l0Y2ggKGUuY29uc3RydWN0b3IpIHtcbiAgICAgICAgY2FzZSBhc3Rub2Rlcy5BdHRyaWJ1dGU6XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuTmFtZTpcbiAgICAgICAgICAgIGlmIChjdHggPT09IGFzdG5vZGVzLlN0b3JlKSBmb3JiaWRkZW5DaGVjayhjLCBuLCBlLmF0dHIsIG4ubGluZW5vKTtcbiAgICAgICAgICAgIGUuY3R4ID0gY3R4O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuU3Vic2NyaXB0OlxuICAgICAgICAgICAgZS5jdHggPSBjdHg7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBhc3Rub2Rlcy5MaXN0OlxuICAgICAgICAgICAgZS5jdHggPSBjdHg7XG4gICAgICAgICAgICBzID0gZS5lbHRzO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuVHVwbGU6XG4gICAgICAgICAgICBpZiAoZS5lbHRzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcImNhbid0IGFzc2lnbiB0byAoKVwiLCBjLmNfZmlsZW5hbWUsIG4ubGluZW5vKTtcbiAgICAgICAgICAgIGUuY3R4ID0gY3R4O1xuICAgICAgICAgICAgcyA9IGUuZWx0cztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGFzdG5vZGVzLkxhbWJkYTpcbiAgICAgICAgICAgIGV4cHJOYW1lID0gXCJsYW1iZGFcIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGFzdG5vZGVzLkNhbGw6XG4gICAgICAgICAgICBleHByTmFtZSA9IFwiZnVuY3Rpb24gY2FsbFwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuQm9vbE9wOlxuICAgICAgICBjYXNlIGFzdG5vZGVzLkJpbk9wOlxuICAgICAgICBjYXNlIGFzdG5vZGVzLlVuYXJ5T3A6XG4gICAgICAgICAgICBleHByTmFtZSA9IFwib3BlcmF0b3JcIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGFzdG5vZGVzLkdlbmVyYXRvckV4cDpcbiAgICAgICAgICAgIGV4cHJOYW1lID0gXCJnZW5lcmF0b3IgZXhwcmVzc2lvblwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuWWllbGQ6XG4gICAgICAgICAgICBleHByTmFtZSA9IFwieWllbGQgZXhwcmVzc2lvblwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuTGlzdENvbXA6XG4gICAgICAgICAgICBleHByTmFtZSA9IFwibGlzdCBjb21wcmVoZW5zaW9uXCI7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBhc3Rub2Rlcy5EaWN0OlxuICAgICAgICBjYXNlIGFzdG5vZGVzLk51bTpcbiAgICAgICAgY2FzZSBhc3Rub2Rlcy5TdHI6XG4gICAgICAgICAgICBleHByTmFtZSA9IFwibGl0ZXJhbFwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgYXN0bm9kZXMuQ29tcGFyZTpcbiAgICAgICAgICAgIGV4cHJOYW1lID0gXCJjb21wYXJpc29uIGV4cHJlc3Npb25cIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGFzdG5vZGVzLklmRXhwOlxuICAgICAgICAgICAgZXhwck5hbWUgPSBcImNvbmRpdGlvbmFsIGV4cHJlc3Npb25cIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkIGV4cHJlc3Npb24gaW4gYXNzaWdubWVudFwiKTtcbiAgICB9XG4gICAgaWYgKGV4cHJOYW1lKSB7XG4gICAgICAgIHRocm93IHN5bnRheEVycm9yKFwiY2FuJ3QgXCIgKyAoY3R4ID09PSBhc3Rub2Rlcy5TdG9yZSA/IFwiYXNzaWduIHRvXCIgOiBcImRlbGV0ZVwiKSArIFwiIFwiICsgZXhwck5hbWUsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgIH1cblxuICAgIGlmIChzKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgc2V0Q29udGV4dChjLCBzW2ldLCBjdHgsIG4pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG52YXIgb3BlcmF0b3JNYXAgPSB7fTtcbihmdW5jdGlvbigpIHtcbiAgICBvcGVyYXRvck1hcFtUT0suVF9WQkFSXSA9IGFzdG5vZGVzLkJpdE9yO1xuICAgIG9wZXJhdG9yTWFwW1RPSy5UX1ZCQVJdID0gYXN0bm9kZXMuQml0T3I7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfQ0lSQ1VNRkxFWF0gPSBhc3Rub2Rlcy5CaXRYb3I7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfQU1QRVJdID0gYXN0bm9kZXMuQml0QW5kO1xuICAgIG9wZXJhdG9yTWFwW1RPSy5UX0xFRlRTSElGVF0gPSBhc3Rub2Rlcy5MU2hpZnQ7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfUklHSFRTSElGVF0gPSBhc3Rub2Rlcy5SU2hpZnQ7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfUExVU10gPSBhc3Rub2Rlcy5BZGQ7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfTUlOVVNdID0gYXN0bm9kZXMuU3ViO1xuICAgIG9wZXJhdG9yTWFwW1RPSy5UX1NUQVJdID0gYXN0bm9kZXMuTXVsdDtcbiAgICBvcGVyYXRvck1hcFtUT0suVF9TTEFTSF0gPSBhc3Rub2Rlcy5EaXY7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfRE9VQkxFU0xBU0hdID0gYXN0bm9kZXMuRmxvb3JEaXY7XG4gICAgb3BlcmF0b3JNYXBbVE9LLlRfUEVSQ0VOVF0gPSBhc3Rub2Rlcy5Nb2Q7XG59ICgpKTtcblxuZnVuY3Rpb24gZ2V0T3BlcmF0b3IobjogcGFyc2VyLk5vZGUpIHtcbiAgICBhc3NlcnRzLmFzc2VydChvcGVyYXRvck1hcFtuLnR5cGVdICE9PSB1bmRlZmluZWQpO1xuICAgIHJldHVybiBvcGVyYXRvck1hcFtuLnR5cGVdO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JDb21wT3AoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIC8qIGNvbXBfb3A6ICc8J3wnPid8Jz09J3wnPj0nfCc8PSd8Jzw+J3wnIT0nfCdpbid8J25vdCcgJ2luJ3wnaXMnXG4gICAgICAgICAgICAgICB8J2lzJyAnbm90J1xuICAgICovXG4gICAgUkVRKG4sIFNZTS5jb21wX29wKTtcbiAgICBpZiAoTkNIKG4pID09PSAxKSB7XG4gICAgICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICAgICAgc3dpdGNoIChuLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgVE9LLlRfTEVTUzogcmV0dXJuIGFzdG5vZGVzLkx0O1xuICAgICAgICAgICAgY2FzZSBUT0suVF9HUkVBVEVSOiByZXR1cm4gYXN0bm9kZXMuR3Q7XG4gICAgICAgICAgICBjYXNlIFRPSy5UX0VRRVFVQUw6IHJldHVybiBhc3Rub2Rlcy5FcTtcbiAgICAgICAgICAgIGNhc2UgVE9LLlRfTEVTU0VRVUFMOiByZXR1cm4gYXN0bm9kZXMuTHRFO1xuICAgICAgICAgICAgY2FzZSBUT0suVF9HUkVBVEVSRVFVQUw6IHJldHVybiBhc3Rub2Rlcy5HdEU7XG4gICAgICAgICAgICBjYXNlIFRPSy5UX05PVEVRVUFMOiByZXR1cm4gYXN0bm9kZXMuTm90RXE7XG4gICAgICAgICAgICBjYXNlIFRPSy5UX05BTUU6XG4gICAgICAgICAgICAgICAgaWYgKG4udmFsdWUgPT09IFwiaW5cIikgcmV0dXJuIGFzdG5vZGVzLkluXztcbiAgICAgICAgICAgICAgICBpZiAobi52YWx1ZSA9PT0gXCJpc1wiKSByZXR1cm4gYXN0bm9kZXMuSXM7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoTkNIKG4pID09PSAyKSB7XG4gICAgICAgIGlmIChDSElMRChuLCAwKS50eXBlID09PSBUT0suVF9OQU1FKSB7XG4gICAgICAgICAgICBpZiAoQ0hJTEQobiwgMSkudmFsdWUgPT09IFwiaW5cIikgcmV0dXJuIGFzdG5vZGVzLk5vdEluO1xuICAgICAgICAgICAgaWYgKENISUxEKG4sIDApLnZhbHVlID09PSBcImlzXCIpIHJldHVybiBhc3Rub2Rlcy5Jc05vdDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBhc3NlcnRzLmZhaWwoXCJpbnZhbGlkIGNvbXBfb3BcIik7XG59XG5cbmZ1bmN0aW9uIHNlcUZvclRlc3RsaXN0KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpOiBhc3Rub2Rlcy5leHByW10ge1xuICAgIC8qIHRlc3RsaXN0OiB0ZXN0ICgnLCcgdGVzdCkqIFsnLCddICovXG4gICAgYXNzZXJ0cy5hc3NlcnQobi50eXBlID09PSBTWU0udGVzdGxpc3QgfHxcbiAgICAgICAgbi50eXBlID09PSBTWU0ubGlzdG1ha2VyIHx8XG4gICAgICAgIG4udHlwZSA9PT0gU1lNLnRlc3RsaXN0X2dleHAgfHxcbiAgICAgICAgbi50eXBlID09PSBTWU0udGVzdGxpc3Rfc2FmZSB8fFxuICAgICAgICBuLnR5cGUgPT09IFNZTS50ZXN0bGlzdDEpO1xuICAgIHZhciBzZXE6IGFzdG5vZGVzLmV4cHJbXSA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyBpICs9IDIpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQoQ0hJTEQobiwgaSkudHlwZSA9PT0gU1lNLklmRXhwciB8fCBDSElMRChuLCBpKS50eXBlID09PSBTWU0ub2xkX3Rlc3QpO1xuICAgICAgICBzZXFbaSAvIDJdID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCBpKSk7XG4gICAgfVxuICAgIHJldHVybiBzZXE7XG59XG5cbmZ1bmN0aW9uIGFzdEZvclN1aXRlKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpOiBhc3Rub2Rlcy5zdG10W10ge1xuICAgIC8qIHN1aXRlOiBzaW1wbGVfc3RtdCB8IE5FV0xJTkUgSU5ERU5UIHN0bXQrIERFREVOVCAqL1xuICAgIFJFUShuLCBTWU0uc3VpdGUpO1xuICAgIHZhciBzZXE6IGFzdG5vZGVzLnN0bXRbXSA9IFtdO1xuICAgIHZhciBwb3MgPSAwO1xuICAgIHZhciBjaDtcbiAgICBpZiAoQ0hJTEQobiwgMCkudHlwZSA9PT0gU1lNLnNpbXBsZV9zdG10KSB7XG4gICAgICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICAgICAgLyogc2ltcGxlX3N0bXQgYWx3YXlzIGVuZHMgd2l0aCBhbiBORVdMSU5FIGFuZCBtYXkgaGF2ZSBhIHRyYWlsaW5nXG4gICAgICAgICAqIFNFTUkuICovXG4gICAgICAgIHZhciBlbmQgPSBOQ0gobikgLSAxO1xuICAgICAgICBpZiAoQ0hJTEQobiwgZW5kIC0gMSkudHlwZSA9PT0gVE9LLlRfU0VNSSlcbiAgICAgICAgICAgIGVuZCAtPSAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVuZDsgaSArPSAyKSAvLyBieSAyIHRvIHNraXAgO1xuICAgICAgICAgICAgc2VxW3BvcysrXSA9IGFzdEZvclN0bXQoYywgQ0hJTEQobiwgaSkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDI7IGkgPCBOQ0gobikgLSAxOyArK2kpIHtcbiAgICAgICAgICAgIGNoID0gQ0hJTEQobiwgaSk7XG4gICAgICAgICAgICBSRVEoY2gsIFNZTS5zdG10KTtcbiAgICAgICAgICAgIHZhciBudW0gPSBudW1TdG10cyhjaCk7XG4gICAgICAgICAgICBpZiAobnVtID09PSAxKSB7XG4gICAgICAgICAgICAgICAgLy8gc21hbGxfc3RtdCBvciBjb21wb3VuZF9zdG10IHcvIG9ubHkgMSBjaGlsZFxuICAgICAgICAgICAgICAgIHNlcVtwb3MrK10gPSBhc3RGb3JTdG10KGMsIGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDApO1xuICAgICAgICAgICAgICAgIFJFUShjaCwgU1lNLnNpbXBsZV9zdG10KTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IE5DSChjaCk7IGogKz0gMikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoTkNIKENISUxEKGNoLCBqKSkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KGogKyAxID09PSBOQ0goY2gpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHNlcVtwb3MrK10gPSBhc3RGb3JTdG10KGMsIENISUxEKGNoLCBqKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGFzc2VydHMuYXNzZXJ0KHBvcyA9PT0gbnVtU3RtdHMobikpO1xuICAgIHJldHVybiBzZXE7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckV4Y2VwdENsYXVzZShjOiBDb21waWxpbmcsIGV4YzogcGFyc2VyLk5vZGUsIGJvZHk6IHBhcnNlci5Ob2RlKSB7XG4gICAgLyogZXhjZXB0X2NsYXVzZTogJ2V4Y2VwdCcgW3Rlc3QgWygnLCcgfCAnYXMnKSB0ZXN0XV0gKi9cbiAgICBSRVEoZXhjLCBTWU0uZXhjZXB0X2NsYXVzZSk7XG4gICAgUkVRKGJvZHksIFNZTS5zdWl0ZSk7XG4gICAgaWYgKE5DSChleGMpID09PSAxKVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkV4Y2VwdEhhbmRsZXIobnVsbCwgbnVsbCwgYXN0Rm9yU3VpdGUoYywgYm9keSksIGV4Yy5saW5lbm8sIGV4Yy5jb2xfb2Zmc2V0KTtcbiAgICBlbHNlIGlmIChOQ0goZXhjKSA9PT0gMilcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5FeGNlcHRIYW5kbGVyKGFzdEZvckV4cHIoYywgQ0hJTEQoZXhjLCAxKSksIG51bGwsIGFzdEZvclN1aXRlKGMsIGJvZHkpLCBleGMubGluZW5vLCBleGMuY29sX29mZnNldCk7XG4gICAgZWxzZSBpZiAoTkNIKGV4YykgPT09IDQpIHtcbiAgICAgICAgdmFyIGUgPSBhc3RGb3JFeHByKGMsIENISUxEKGV4YywgMykpO1xuICAgICAgICBzZXRDb250ZXh0KGMsIGUsIGFzdG5vZGVzLlN0b3JlLCBDSElMRChleGMsIDMpKTtcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5FeGNlcHRIYW5kbGVyKGFzdEZvckV4cHIoYywgQ0hJTEQoZXhjLCAxKSksIGUsIGFzdEZvclN1aXRlKGMsIGJvZHkpLCBleGMubGluZW5vLCBleGMuY29sX29mZnNldCk7XG4gICAgfVxuICAgIGFzc2VydHMuZmFpbChcIndyb25nIG51bWJlciBvZiBjaGlsZHJlbiBmb3IgZXhjZXB0IGNsYXVzZVwiKTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yVHJ5U3RtdChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKTogYW55IHtcbiAgICB2YXIgbmMgPSBOQ0gobik7XG4gICAgdmFyIG5leGNlcHQgPSAobmMgLSAzKSAvIDM7XG4gICAgdmFyIGJvZHksIG9yZWxzZSA9IFtdLCBmaW5hbGx5XyA9IG51bGw7XG5cbiAgICBSRVEobiwgU1lNLnRyeV9zdG10KTtcbiAgICBib2R5ID0gYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgMikpO1xuICAgIGlmIChDSElMRChuLCBuYyAtIDMpLnR5cGUgPT09IFRPSy5UX05BTUUpIHtcbiAgICAgICAgaWYgKENISUxEKG4sIG5jIC0gMykudmFsdWUgPT09IFwiZmluYWxseVwiKSB7XG4gICAgICAgICAgICBpZiAobmMgPj0gOSAmJiBDSElMRChuLCBuYyAtIDYpLnR5cGUgPT09IFRPSy5UX05BTUUpIHtcbiAgICAgICAgICAgICAgICAvKiB3ZSBjYW4gYXNzdW1lIGl0J3MgYW4gXCJlbHNlXCIsXG4gICAgICAgICAgICAgICAgICAgYmVjYXVzZSBuYyA+PSA5IGZvciB0cnktZWxzZS1maW5hbGx5IGFuZFxuICAgICAgICAgICAgICAgICAgIGl0IHdvdWxkIG90aGVyd2lzZSBoYXZlIGEgdHlwZSBvZiBleGNlcHRfY2xhdXNlICovXG4gICAgICAgICAgICAgICAgb3JlbHNlID0gYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgbmMgLSA0KSk7XG4gICAgICAgICAgICAgICAgbmV4Y2VwdC0tO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmaW5hbGx5XyA9IGFzdEZvclN1aXRlKGMsIENISUxEKG4sIG5jIC0gMSkpO1xuICAgICAgICAgICAgbmV4Y2VwdC0tO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLyogd2UgY2FuIGFzc3VtZSBpdCdzIGFuIFwiZWxzZVwiLFxuICAgICAgICAgICAgICAgb3RoZXJ3aXNlIGl0IHdvdWxkIGhhdmUgYSB0eXBlIG9mIGV4Y2VwdF9jbGF1c2UgKi9cbiAgICAgICAgICAgIG9yZWxzZSA9IGFzdEZvclN1aXRlKGMsIENISUxEKG4sIG5jIC0gMSkpO1xuICAgICAgICAgICAgbmV4Y2VwdC0tO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKENISUxEKG4sIG5jIC0gMykudHlwZSAhPT0gU1lNLmV4Y2VwdF9jbGF1c2UpIHtcbiAgICAgICAgdGhyb3cgc3ludGF4RXJyb3IoXCJtYWxmb3JtZWQgJ3RyeScgc3RhdGVtZW50XCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgIH1cblxuICAgIGlmIChuZXhjZXB0ID4gMCkge1xuICAgICAgICB2YXIgaGFuZGxlcnMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXhjZXB0OyArK2kpXG4gICAgICAgICAgICBoYW5kbGVyc1tpXSA9IGFzdEZvckV4Y2VwdENsYXVzZShjLCBDSElMRChuLCAzICsgaSAqIDMpLCBDSElMRChuLCA1ICsgaSAqIDMpKTtcbiAgICAgICAgdmFyIGV4Y2VwdFN0ID0gbmV3IGFzdG5vZGVzLlRyeUV4Y2VwdChib2R5LCBoYW5kbGVycywgb3JlbHNlLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcblxuICAgICAgICBpZiAoIWZpbmFsbHlfKVxuICAgICAgICAgICAgcmV0dXJuIGV4Y2VwdFN0O1xuXG4gICAgICAgIC8qIGlmIGEgJ2ZpbmFsbHknIGlzIHByZXNlbnQgdG9vLCB3ZSBuZXN0IHRoZSBUcnlFeGNlcHQgd2l0aGluIGFcbiAgICAgICAgICAgVHJ5RmluYWxseSB0byBlbXVsYXRlIHRyeSAuLi4gZXhjZXB0IC4uLiBmaW5hbGx5ICovXG4gICAgICAgIGJvZHkgPSBbZXhjZXB0U3RdO1xuICAgIH1cblxuICAgIGFzc2VydHMuYXNzZXJ0KGZpbmFsbHlfICE9PSBudWxsKTtcbiAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlRyeUZpbmFsbHkoYm9keSwgZmluYWxseV8sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xufVxuXG5cbmZ1bmN0aW9uIGFzdEZvckRvdHRlZE5hbWUoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLmV4cHIge1xuICAgIFJFUShuLCBTWU0uZG90dGVkX25hbWUpO1xuICAgIHZhciBsaW5lbm8gPSBuLmxpbmVubztcbiAgICB2YXIgY29sX29mZnNldCA9IG4uY29sX29mZnNldDtcbiAgICB2YXIgaWQgPSBzdHJvYmooQ0hJTEQobiwgMCkudmFsdWUpO1xuICAgIHZhciBlOiBhbnkgPSBuZXcgYXN0bm9kZXMuTmFtZShpZCwgYXN0bm9kZXMuTG9hZCwgbGluZW5vLCBjb2xfb2Zmc2V0KTtcbiAgICBmb3IgKHZhciBpID0gMjsgaSA8IE5DSChuKTsgaSArPSAyKSB7XG4gICAgICAgIGlkID0gc3Ryb2JqKENISUxEKG4sIGkpLnZhbHVlKTtcbiAgICAgICAgZSA9IG5ldyBhc3Rub2Rlcy5BdHRyaWJ1dGUoZSwgaWQsIGFzdG5vZGVzLkxvYWQsIGxpbmVubywgY29sX29mZnNldCk7XG4gICAgfVxuICAgIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JEZWNvcmF0b3IoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIC8qIGRlY29yYXRvcjogJ0AnIGRvdHRlZF9uYW1lIFsgJygnIFthcmdsaXN0XSAnKScgXSBORVdMSU5FICovXG4gICAgUkVRKG4sIFNZTS5kZWNvcmF0b3IpO1xuICAgIFJFUShDSElMRChuLCAwKSwgVE9LLlRfQVQpO1xuICAgIFJFUShDSElMRChuLCBOQ0gobikgLSAxKSwgVE9LLlRfTkVXTElORSk7XG4gICAgdmFyIG5hbWVFeHByID0gYXN0Rm9yRG90dGVkTmFtZShjLCBDSElMRChuLCAxKSk7XG4gICAgdmFyIGQ7XG4gICAgaWYgKE5DSChuKSA9PT0gMykgLy8gbm8gYXJnc1xuICAgICAgICByZXR1cm4gbmFtZUV4cHI7XG4gICAgZWxzZSBpZiAoTkNIKG4pID09PSA1KSAvLyBjYWxsIHdpdGggbm8gYXJnc1xuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkNhbGwobmFtZUV4cHIsIFtdLCBbXSwgbnVsbCwgbnVsbCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gYXN0Rm9yQ2FsbChjLCBDSElMRChuLCAzKSwgbmFtZUV4cHIpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JEZWNvcmF0b3JzKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBSRVEobiwgU1lNLmRlY29yYXRvcnMpO1xuICAgIHZhciBkZWNvcmF0b3JTZXE6IGFzdG5vZGVzLmV4cHJbXSA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyArK2kpXG4gICAgICAgIGRlY29yYXRvclNlcVtpXSA9IGFzdEZvckRlY29yYXRvcihjLCBDSElMRChuLCBpKSk7XG4gICAgcmV0dXJuIGRlY29yYXRvclNlcTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yRGVjb3JhdGVkKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBSRVEobiwgU1lNLmRlY29yYXRlZCk7XG4gICAgdmFyIGRlY29yYXRvclNlcSA9IGFzdEZvckRlY29yYXRvcnMoYywgQ0hJTEQobiwgMCkpO1xuICAgIGFzc2VydHMuYXNzZXJ0KENISUxEKG4sIDEpLnR5cGUgPT09IFNZTS5mdW5jZGVmIHx8IENISUxEKG4sIDEpLnR5cGUgPT09IFNZTS5jbGFzc2RlZik7XG5cbiAgICB2YXIgdGhpbmcgPSBudWxsO1xuICAgIGlmIChDSElMRChuLCAxKS50eXBlID09PSBTWU0uZnVuY2RlZilcbiAgICAgICAgdGhpbmcgPSBhc3RGb3JGdW5jZGVmKGMsIENISUxEKG4sIDEpLCBkZWNvcmF0b3JTZXEpO1xuICAgIGVsc2UgaWYgKENISUxEKG4sIDEpLnR5cGUgPT09IFNZTS5jbGFzc2RlZilcbiAgICAgICAgdGhpbmcgPSBhc3RGb3JDbGFzc2RlZihjLCBDSElMRChuLCAxKSwgZGVjb3JhdG9yU2VxKTtcbiAgICBpZiAodGhpbmcpIHtcbiAgICAgICAgdGhpbmcubGluZW5vID0gbi5saW5lbm87XG4gICAgICAgIHRoaW5nLmNvbF9vZmZzZXQgPSBuLmNvbF9vZmZzZXQ7XG4gICAgfVxuICAgIHJldHVybiB0aGluZztcbn1cblxuZnVuY3Rpb24gYXN0Rm9yV2l0aFZhcihjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgUkVRKG4sIFNZTS53aXRoX3Zhcik7XG4gICAgcmV0dXJuIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMSkpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JXaXRoU3RtdChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgLyogd2l0aF9zdG10OiAnd2l0aCcgdGVzdCBbIHdpdGhfdmFyIF0gJzonIHN1aXRlICovXG4gICAgdmFyIHN1aXRlSW5kZXggPSAzOyAvLyBza2lwIHdpdGgsIHRlc3QsIDpcbiAgICBhc3NlcnRzLmFzc2VydChuLnR5cGUgPT09IFNZTS53aXRoX3N0bXQpO1xuICAgIHZhciBjb250ZXh0RXhwciA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMSkpO1xuICAgIGlmIChDSElMRChuLCAyKS50eXBlID09PSBTWU0ud2l0aF92YXIpIHtcbiAgICAgICAgdmFyIG9wdGlvbmFsVmFycyA9IGFzdEZvcldpdGhWYXIoYywgQ0hJTEQobiwgMikpO1xuICAgICAgICBzZXRDb250ZXh0KGMsIG9wdGlvbmFsVmFycywgYXN0bm9kZXMuU3RvcmUsIG4pO1xuICAgICAgICBzdWl0ZUluZGV4ID0gNDtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5XaXRoXyhjb250ZXh0RXhwciwgb3B0aW9uYWxWYXJzLCBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCBzdWl0ZUluZGV4KSksIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JFeGVjU3RtdChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgdmFyIGV4cHIxOiBhc3Rub2Rlcy5leHByO1xuICAgIHZhciBnbG9iYWxzID0gbnVsbCwgbG9jYWxzID0gbnVsbDtcbiAgICB2YXIgbmNoaWxkcmVuID0gTkNIKG4pO1xuICAgIGFzc2VydHMuYXNzZXJ0KG5jaGlsZHJlbiA9PT0gMiB8fCBuY2hpbGRyZW4gPT09IDQgfHwgbmNoaWxkcmVuID09PSA2KTtcblxuICAgIC8qIGV4ZWNfc3RtdDogJ2V4ZWMnIGV4cHIgWydpbicgdGVzdCBbJywnIHRlc3RdXSAqL1xuICAgIFJFUShuLCBTWU0uZXhlY19zdG10KTtcbiAgICB2YXIgZXhwcjEgPSBhc3RGb3JFeHByKGMsIENISUxEKG4sIDEpKTtcbiAgICBpZiAobmNoaWxkcmVuID49IDQpXG4gICAgICAgIGdsb2JhbHMgPSBhc3RGb3JFeHByKGMsIENISUxEKG4sIDMpKTtcbiAgICBpZiAobmNoaWxkcmVuID09PSA2KVxuICAgICAgICBsb2NhbHMgPSBhc3RGb3JFeHByKGMsIENISUxEKG4sIDUpKTtcbiAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkV4ZWMoZXhwcjEsIGdsb2JhbHMsIGxvY2Fscywgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvcklmU3RtdChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKTogYXN0bm9kZXMuSWZfIHtcbiAgICAvKiBpZl9zdG10OiAnaWYnIHRlc3QgJzonIHN1aXRlICgnZWxpZicgdGVzdCAnOicgc3VpdGUpKlxuICAgICAgIFsnZWxzZScgJzonIHN1aXRlXVxuICAgICovXG4gICAgUkVRKG4sIFNZTS5pZl9zdG10KTtcbiAgICBpZiAoTkNIKG4pID09PSA0KVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLklmXyhcbiAgICAgICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMSkpLFxuICAgICAgICAgICAgYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgMykpLFxuICAgICAgICAgICAgW10sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuXG4gICAgdmFyIHMgPSBDSElMRChuLCA0KS52YWx1ZTtcbiAgICB2YXIgZGVjaWRlciA9IHMuY2hhckF0KDIpOyAvLyBlbFNlIG9yIGVsSWZcbiAgICBpZiAoZGVjaWRlciA9PT0gJ3MnKSB7XG4gICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuSWZfKFxuICAgICAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChuLCAxKSksXG4gICAgICAgICAgICBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCAzKSksXG4gICAgICAgICAgICBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCA2KSksXG4gICAgICAgICAgICBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICB9XG4gICAgZWxzZSBpZiAoZGVjaWRlciA9PT0gJ2knKSB7XG4gICAgICAgIHZhciBuRWxpZiA9IE5DSChuKSAtIDQ7XG4gICAgICAgIHZhciBoYXNFbHNlID0gZmFsc2U7XG4gICAgICAgIHZhciBvcmVsc2UgPSBbXTtcbiAgICAgICAgLyogbXVzdCByZWZlcmVuY2UgdGhlIGNoaWxkIG5FbGlmKzEgc2luY2UgJ2Vsc2UnIHRva2VuIGlzIHRoaXJkLCBub3RcbiAgICAgICAgICogZm91cnRoIGNoaWxkIGZyb20gdGhlIGVuZC4gKi9cbiAgICAgICAgaWYgKENISUxEKG4sIG5FbGlmICsgMSkudHlwZSA9PT0gVE9LLlRfTkFNRSAmJiBDSElMRChuLCBuRWxpZiArIDEpLnZhbHVlLmNoYXJBdCgyKSA9PT0gJ3MnKSB7XG4gICAgICAgICAgICBoYXNFbHNlID0gdHJ1ZTtcbiAgICAgICAgICAgIG5FbGlmIC09IDM7XG4gICAgICAgIH1cbiAgICAgICAgbkVsaWYgLz0gNDtcblxuICAgICAgICBpZiAoaGFzRWxzZSkge1xuICAgICAgICAgICAgb3JlbHNlID0gW1xuICAgICAgICAgICAgICAgIG5ldyBhc3Rub2Rlcy5JZl8oXG4gICAgICAgICAgICAgICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgTkNIKG4pIC0gNikpLFxuICAgICAgICAgICAgICAgICAgICBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCBOQ0gobikgLSA0KSksXG4gICAgICAgICAgICAgICAgICAgIGFzdEZvclN1aXRlKGMsIENISUxEKG4sIE5DSChuKSAtIDEpKSxcbiAgICAgICAgICAgICAgICAgICAgQ0hJTEQobiwgTkNIKG4pIC0gNikubGluZW5vLFxuICAgICAgICAgICAgICAgICAgICBDSElMRChuLCBOQ0gobikgLSA2KS5jb2xfb2Zmc2V0KV07XG4gICAgICAgICAgICBuRWxpZi0tO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuRWxpZjsgKytpKSB7XG4gICAgICAgICAgICB2YXIgb2ZmID0gNSArIChuRWxpZiAtIGkgLSAxKSAqIDQ7XG4gICAgICAgICAgICBvcmVsc2UgPSBbXG4gICAgICAgICAgICAgICAgbmV3IGFzdG5vZGVzLklmXyhcbiAgICAgICAgICAgICAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChuLCBvZmYpKSxcbiAgICAgICAgICAgICAgICAgICAgYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgb2ZmICsgMikpLFxuICAgICAgICAgICAgICAgICAgICBvcmVsc2UsXG4gICAgICAgICAgICAgICAgICAgIENISUxEKG4sIG9mZikubGluZW5vLFxuICAgICAgICAgICAgICAgICAgICBDSElMRChuLCBvZmYpLmNvbF9vZmZzZXQpXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLklmXyhcbiAgICAgICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMSkpLFxuICAgICAgICAgICAgYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgMykpLFxuICAgICAgICAgICAgb3JlbHNlLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICB9XG4gICAgYXNzZXJ0cy5mYWlsKFwidW5leHBlY3RlZCB0b2tlbiBpbiAnaWYnIHN0YXRlbWVudFwiKTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yRXhwcmxpc3QoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSwgY29udGV4dCkge1xuICAgIFJFUShuLCBTWU0uRXhwckxpc3QpO1xuICAgIHZhciBzZXEgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IE5DSChuKTsgaSArPSAyKSB7XG4gICAgICAgIHZhciBlID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCBpKSk7XG4gICAgICAgIHNlcVtpIC8gMl0gPSBlO1xuICAgICAgICBpZiAoY29udGV4dCkgc2V0Q29udGV4dChjLCBlLCBjb250ZXh0LCBDSElMRChuLCBpKSk7XG4gICAgfVxuICAgIHJldHVybiBzZXE7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckRlbFN0bXQoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIFJFUShuLCBTWU0uZGVsX3N0bXQpO1xuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuRGVsZXRlXyhhc3RGb3JFeHBybGlzdChjLCBDSElMRChuLCAxKSwgYXN0bm9kZXMuRGVsKSwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckdsb2JhbFN0bXQoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIFJFUShuLCBTWU0uR2xvYmFsU3RtdCk7XG4gICAgdmFyIHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IE5DSChuKTsgaSArPSAyKSB7XG4gICAgICAgIHNbKGkgLSAxKSAvIDJdID0gc3Ryb2JqKENISUxEKG4sIGkpLnZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5HbG9iYWwocywgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvck5vbkxvY2FsU3RtdChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgUkVRKG4sIFNZTS5Ob25Mb2NhbFN0bXQpO1xuICAgIHZhciBzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBOQ0gobik7IGkgKz0gMikge1xuICAgICAgICBzWyhpIC0gMSkgLyAyXSA9IHN0cm9iaihDSElMRChuLCBpKS52YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTm9uTG9jYWwocywgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckFzc2VydFN0bXQoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIC8qIGFzc2VydF9zdG10OiAnYXNzZXJ0JyB0ZXN0IFsnLCcgdGVzdF0gKi9cbiAgICBSRVEobiwgU1lNLmFzc2VydF9zdG10KTtcbiAgICBpZiAoTkNIKG4pID09PSAyKVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkFzc2VydChhc3RGb3JFeHByKGMsIENISUxEKG4sIDEpKSwgbnVsbCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgZWxzZSBpZiAoTkNIKG4pID09PSA0KVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkFzc2VydChhc3RGb3JFeHByKGMsIENISUxEKG4sIDEpKSwgYXN0Rm9yRXhwcihjLCBDSElMRChuLCAzKSksIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIGFzc2VydHMuZmFpbChcImltcHJvcGVyIG51bWJlciBvZiBwYXJ0cyB0byBhc3NlcnQgc3RtdFwiKTtcbn1cblxuZnVuY3Rpb24gYWxpYXNGb3JJbXBvcnROYW1lKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAvKlxuICAgICAgaW1wb3J0X2FzX25hbWU6IE5BTUUgWydhcycgTkFNRV1cbiAgICAgIGRvdHRlZF9hc19uYW1lOiBkb3R0ZWRfbmFtZSBbJ2FzJyBOQU1FXVxuICAgICAgZG90dGVkX25hbWU6IE5BTUUgKCcuJyBOQU1FKSpcbiAgICAqL1xuXG4gICAgbG9vcDogd2hpbGUgKHRydWUpIHtcbiAgICAgICAgc3dpdGNoIChuLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgU1lNLmltcG9ydF9hc19uYW1lOlxuICAgICAgICAgICAgICAgIHZhciBzdHI6IHN0cmluZyA9IG51bGw7XG4gICAgICAgICAgICAgICAgdmFyIG5hbWUgPSBzdHJvYmooQ0hJTEQobiwgMCkudmFsdWUpO1xuICAgICAgICAgICAgICAgIGlmIChOQ0gobikgPT09IDMpXG4gICAgICAgICAgICAgICAgICAgIHN0ciA9IENISUxEKG4sIDIpLnZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuQWxpYXMobmFtZSwgc3RyID09IG51bGwgPyBudWxsIDogc3Ryb2JqKHN0cikpO1xuICAgICAgICAgICAgY2FzZSBTWU0uZG90dGVkX2FzX25hbWU6XG4gICAgICAgICAgICAgICAgaWYgKE5DSChuKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBuID0gQ0hJTEQobiwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIGxvb3A7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYSA9IGFsaWFzRm9ySW1wb3J0TmFtZShjLCBDSElMRChuLCAwKSk7XG4gICAgICAgICAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KCFhLmFzbmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIGEuYXNuYW1lID0gc3Ryb2JqKENISUxEKG4sIDIpLnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBTWU0uZG90dGVkX25hbWU6XG4gICAgICAgICAgICAgICAgaWYgKE5DSChuKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5BbGlhcyhzdHJvYmooQ0hJTEQobiwgMCkudmFsdWUpLCBudWxsKTtcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gY3JlYXRlIGEgc3RyaW5nIG9mIHRoZSBmb3JtIGEuYi5jXG4gICAgICAgICAgICAgICAgICAgIHZhciBzdHIgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOQ0gobik7IGkgKz0gMilcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ciArPSBDSElMRChuLCBpKS52YWx1ZSArIFwiLlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkFsaWFzKHN0cm9iaihzdHIuc3Vic3RyKDAsIHN0ci5sZW5ndGggLSAxKSksIG51bGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhc2UgVE9LLlRfU1RBUjpcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkFsaWFzKHN0cm9iaihcIipcIiksIG51bGwpO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcInVuZXhwZWN0ZWQgaW1wb3J0IG5hbWVcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBhc3RGb3JJbXBvcnRTdG10KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBSRVEobiwgU1lNLmltcG9ydF9zdG10KTtcbiAgICB2YXIgbGluZW5vID0gbi5saW5lbm87XG4gICAgdmFyIGNvbF9vZmZzZXQgPSBuLmNvbF9vZmZzZXQ7XG4gICAgbiA9IENISUxEKG4sIDApO1xuICAgIGlmIChuLnR5cGUgPT09IFNZTS5pbXBvcnRfbmFtZSkge1xuICAgICAgICBuID0gQ0hJTEQobiwgMSk7XG4gICAgICAgIFJFUShuLCBTWU0uZG90dGVkX2FzX25hbWVzKTtcbiAgICAgICAgdmFyIGFsaWFzZXMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOQ0gobik7IGkgKz0gMilcbiAgICAgICAgICAgIGFsaWFzZXNbaSAvIDJdID0gYWxpYXNGb3JJbXBvcnROYW1lKGMsIENISUxEKG4sIGkpKTtcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5JbXBvcnRfKGFsaWFzZXMsIGxpbmVubywgY29sX29mZnNldCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKG4udHlwZSA9PT0gU1lNLmltcG9ydF9mcm9tKSB7XG4gICAgICAgIHZhciBtb2QgPSBudWxsO1xuICAgICAgICB2YXIgbmRvdHMgPSAwO1xuICAgICAgICB2YXIgbmNoaWxkcmVuO1xuXG4gICAgICAgIGZvciAodmFyIGlkeCA9IDE7IGlkeCA8IE5DSChuKTsgKytpZHgpIHtcbiAgICAgICAgICAgIGlmIChDSElMRChuLCBpZHgpLnR5cGUgPT09IFNZTS5kb3R0ZWRfbmFtZSkge1xuICAgICAgICAgICAgICAgIG1vZCA9IGFsaWFzRm9ySW1wb3J0TmFtZShjLCBDSElMRChuLCBpZHgpKTtcbiAgICAgICAgICAgICAgICBpZHgrKztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKENISUxEKG4sIGlkeCkudHlwZSAhPT0gVE9LLlRfRE9UKVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgbmRvdHMrKztcbiAgICAgICAgfVxuICAgICAgICArK2lkeDsgLy8gc2tpcCB0aGUgaW1wb3J0IGtleXdvcmRcbiAgICAgICAgc3dpdGNoIChDSElMRChuLCBpZHgpLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgVE9LLlRfU1RBUjpcbiAgICAgICAgICAgICAgICAvLyBmcm9tIC4uLiBpbXBvcnRcbiAgICAgICAgICAgICAgICBuID0gQ0hJTEQobiwgaWR4KTtcbiAgICAgICAgICAgICAgICBuY2hpbGRyZW4gPSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBUT0suVF9MUEFSOlxuICAgICAgICAgICAgICAgIC8vIGZyb20gLi4uIGltcG9ydCAoeCwgeSwgeilcbiAgICAgICAgICAgICAgICBuID0gQ0hJTEQobiwgaWR4ICsgMSk7XG4gICAgICAgICAgICAgICAgbmNoaWxkcmVuID0gTkNIKG4pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTWU0uaW1wb3J0X2FzX25hbWVzOlxuICAgICAgICAgICAgICAgIC8vIGZyb20gLi4uIGltcG9ydCB4LCB5LCB6XG4gICAgICAgICAgICAgICAgbiA9IENISUxEKG4sIGlkeCk7XG4gICAgICAgICAgICAgICAgbmNoaWxkcmVuID0gTkNIKG4pO1xuICAgICAgICAgICAgICAgIGlmIChuY2hpbGRyZW4gJSAyID09PSAwKVxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcInRyYWlsaW5nIGNvbW1hIG5vdCBhbGxvd2VkIHdpdGhvdXQgc3Vycm91bmRpbmcgcGFyZW50aGVzZXNcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwiVW5leHBlY3RlZCBub2RlLXR5cGUgaW4gZnJvbS1pbXBvcnRcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGFsaWFzZXMgPSBbXTtcbiAgICAgICAgaWYgKG4udHlwZSA9PT0gVE9LLlRfU1RBUilcbiAgICAgICAgICAgIGFsaWFzZXNbMF0gPSBhbGlhc0ZvckltcG9ydE5hbWUoYywgbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyBpICs9IDIpXG4gICAgICAgICAgICAgICAgYWxpYXNlc1tpIC8gMl0gPSBhbGlhc0ZvckltcG9ydE5hbWUoYywgQ0hJTEQobiwgaSkpO1xuICAgICAgICB2YXIgbW9kbmFtZSA9IG1vZCA/IG1vZC5uYW1lIDogXCJcIjtcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5JbXBvcnRGcm9tKHN0cm9iaihtb2RuYW1lKSwgYWxpYXNlcywgbmRvdHMsIGxpbmVubywgY29sX29mZnNldCk7XG4gICAgfVxuICAgIHRocm93IHN5bnRheEVycm9yKFwidW5rbm93biBpbXBvcnQgc3RhdGVtZW50XCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JUZXN0bGlzdEdleHAoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIGFzc2VydHMuYXNzZXJ0KG4udHlwZSA9PT0gU1lNLnRlc3RsaXN0X2dleHAgfHwgbi50eXBlID09PSBTWU0uYXJndW1lbnQpO1xuICAgIGlmIChOQ0gobikgPiAxICYmIENISUxEKG4sIDEpLnR5cGUgPT09IFNZTS5nZW5fZm9yKVxuICAgICAgICByZXR1cm4gYXN0Rm9yR2VuZXhwKGMsIG4pO1xuICAgIHJldHVybiBhc3RGb3JUZXN0bGlzdChjLCBuKTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yTGlzdGNvbXAoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIGZ1bmN0aW9uIGNvdW50TGlzdEZvcnMoYywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAgICAgdmFyIG5mb3JzID0gMDtcbiAgICAgICAgdmFyIGNoID0gQ0hJTEQobiwgMSk7XG4gICAgICAgIGNvdW50X2xpc3RfZm9yOiB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgbmZvcnMrKztcbiAgICAgICAgICAgIFJFUShjaCwgU1lNLmxpc3RfZm9yKTtcbiAgICAgICAgICAgIGlmIChOQ0goY2gpID09PSA1KVxuICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBuZm9ycztcbiAgICAgICAgICAgIGNvdW50X2xpc3RfaXRlcjogd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgICAgICBSRVEoY2gsIFNZTS5saXN0X2l0ZXIpO1xuICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDApO1xuICAgICAgICAgICAgICAgIGlmIChjaC50eXBlID09PSBTWU0ubGlzdF9mb3IpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIGNvdW50X2xpc3RfZm9yO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGNoLnR5cGUgPT09IFNZTS5saXN0X2lmKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChOQ0goY2gpID09PSAzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaCA9IENISUxEKGNoLCAyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIGNvdW50X2xpc3RfaXRlcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmZvcnM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb3VudExpc3RJZnMoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgICAgICB2YXIgbmlmcyA9IDA7XG4gICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICBSRVEobiwgU1lNLmxpc3RfaXRlcik7XG4gICAgICAgICAgICBpZiAoQ0hJTEQobiwgMCkudHlwZSA9PT0gU1lNLmxpc3RfZm9yKVxuICAgICAgICAgICAgICAgIHJldHVybiBuaWZzO1xuICAgICAgICAgICAgbiA9IENISUxEKG4sIDApO1xuICAgICAgICAgICAgUkVRKG4sIFNZTS5saXN0X2lmKTtcbiAgICAgICAgICAgIG5pZnMrKztcbiAgICAgICAgICAgIGlmIChOQ0gobikgPT0gMilcbiAgICAgICAgICAgICAgICByZXR1cm4gbmlmcztcbiAgICAgICAgICAgIG4gPSBDSElMRChuLCAyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIFJFUShuLCBTWU0ubGlzdG1ha2VyKTtcbiAgICBhc3NlcnRzLmFzc2VydChOQ0gobikgPiAxKTtcbiAgICB2YXIgZWx0ID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCAwKSk7XG4gICAgdmFyIG5mb3JzID0gY291bnRMaXN0Rm9ycyhjLCBuKTtcbiAgICB2YXIgbGlzdGNvbXBzID0gW107XG4gICAgdmFyIGNoID0gQ0hJTEQobiwgMSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZm9yczsgKytpKSB7XG4gICAgICAgIFJFUShjaCwgU1lNLmxpc3RfZm9yKTtcbiAgICAgICAgdmFyIGZvcmNoID0gQ0hJTEQoY2gsIDEpO1xuICAgICAgICB2YXIgdCA9IGFzdEZvckV4cHJsaXN0KGMsIGZvcmNoLCBhc3Rub2Rlcy5TdG9yZSk7XG4gICAgICAgIHZhciBleHByZXNzaW9uID0gYXN0Rm9yVGVzdGxpc3QoYywgQ0hJTEQoY2gsIDMpKTtcbiAgICAgICAgdmFyIGxjO1xuICAgICAgICBpZiAoTkNIKGZvcmNoKSA9PT0gMSlcbiAgICAgICAgICAgIGxjID0gbmV3IGFzdG5vZGVzLkNvbXByZWhlbnNpb24odFswXSwgZXhwcmVzc2lvbiwgW10pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBsYyA9IG5ldyBhc3Rub2Rlcy5Db21wcmVoZW5zaW9uKG5ldyBhc3Rub2Rlcy5UdXBsZSh0LCBhc3Rub2Rlcy5TdG9yZSwgY2gubGluZW5vLCBjaC5jb2xfb2Zmc2V0KSwgZXhwcmVzc2lvbiwgW10pO1xuXG4gICAgICAgIGlmIChOQ0goY2gpID09PSA1KSB7XG4gICAgICAgICAgICBjaCA9IENISUxEKGNoLCA0KTtcbiAgICAgICAgICAgIHZhciBuaWZzID0gY291bnRMaXN0SWZzKGMsIGNoKTtcbiAgICAgICAgICAgIHZhciBpZnMgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbmlmczsgKytqKSB7XG4gICAgICAgICAgICAgICAgUkVRKGNoLCBTWU0ubGlzdF9pdGVyKTtcbiAgICAgICAgICAgICAgICBjaCA9IENISUxEKGNoLCAwKTtcbiAgICAgICAgICAgICAgICBSRVEoY2gsIFNZTS5saXN0X2lmKTtcbiAgICAgICAgICAgICAgICBpZnNbal0gPSBhc3RGb3JFeHByKGMsIENISUxEKGNoLCAxKSk7XG4gICAgICAgICAgICAgICAgaWYgKE5DSChjaCkgPT09IDMpXG4gICAgICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoLnR5cGUgPT09IFNZTS5saXN0X2l0ZXIpXG4gICAgICAgICAgICAgICAgY2ggPSBDSElMRChjaCwgMCk7XG4gICAgICAgICAgICBsYy5pZnMgPSBpZnM7XG4gICAgICAgIH1cbiAgICAgICAgbGlzdGNvbXBzW2ldID0gbGM7XG4gICAgfVxuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTGlzdENvbXAoZWx0LCBsaXN0Y29tcHMsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JVbmFyeUV4cHIoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgIGlmIChDSElMRChuLCAwKS50eXBlID09PSBUT0suVF9NSU5VUyAmJiBOQ0gobikgPT09IDIpIHtcbiAgICAgICAgdmFyIHBmYWN0b3IgPSBDSElMRChuLCAxKTtcbiAgICAgICAgaWYgKHBmYWN0b3IudHlwZSA9PT0gU1lNLlVuYXJ5RXhwciAmJiBOQ0gocGZhY3RvcikgPT09IDEpIHtcbiAgICAgICAgICAgIHZhciBwcG93ZXIgPSBDSElMRChwZmFjdG9yLCAwKTtcbiAgICAgICAgICAgIGlmIChwcG93ZXIudHlwZSA9PT0gU1lNLlBvd2VyRXhwciAmJiBOQ0gocHBvd2VyKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIHZhciBwYXRvbSA9IENISUxEKHBwb3dlciwgMCk7XG4gICAgICAgICAgICAgICAgaWYgKHBhdG9tLnR5cGUgPT09IFNZTS5BdG9tRXhwcikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcG51bSA9IENISUxEKHBhdG9tLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBudW0udHlwZSA9PT0gVE9LLlRfTlVNQkVSKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwbnVtLnZhbHVlID0gXCItXCIgKyBwbnVtLnZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFzdEZvckF0b21FeHByKGMsIHBhdG9tKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciBleHByZXNzaW9uID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCAxKSk7XG4gICAgc3dpdGNoIChDSElMRChuLCAwKS50eXBlKSB7XG4gICAgICAgIGNhc2UgVE9LLlRfUExVUzogcmV0dXJuIG5ldyBhc3Rub2Rlcy5VbmFyeU9wKGFzdG5vZGVzLlVBZGQsIGV4cHJlc3Npb24sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBjYXNlIFRPSy5UX01JTlVTOiByZXR1cm4gbmV3IGFzdG5vZGVzLlVuYXJ5T3AoYXN0bm9kZXMuVVN1YiwgZXhwcmVzc2lvbiwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgIGNhc2UgVE9LLlRfVElMREU6IHJldHVybiBuZXcgYXN0bm9kZXMuVW5hcnlPcChhc3Rub2Rlcy5JbnZlcnQsIGV4cHJlc3Npb24sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIH1cblxuICAgIGFzc2VydHMuZmFpbChcInVuaGFuZGxlZCBVbmFyeUV4cHJcIik7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckZvclN0bXQoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLkZvcl8ge1xuICAgIHZhciBzZXEgPSBbXTtcbiAgICBSRVEobiwgU1lNLmZvcl9zdG10KTtcbiAgICBpZiAoTkNIKG4pID09PSA5KVxuICAgICAgICBzZXEgPSBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCA4KSk7XG4gICAgdmFyIG5vZGVUYXJnZXQgPSBDSElMRChuLCAxKTtcbiAgICB2YXIgX3RhcmdldCA9IGFzdEZvckV4cHJsaXN0KGMsIG5vZGVUYXJnZXQsIGFzdG5vZGVzLlN0b3JlKTtcbiAgICB2YXIgdGFyZ2V0O1xuICAgIGlmIChOQ0gobm9kZVRhcmdldCkgPT09IDEpXG4gICAgICAgIHRhcmdldCA9IF90YXJnZXRbMF07XG4gICAgZWxzZVxuICAgICAgICB0YXJnZXQgPSBuZXcgYXN0bm9kZXMuVHVwbGUoX3RhcmdldCwgYXN0bm9kZXMuU3RvcmUsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuXG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5Gb3JfKHRhcmdldCxcbiAgICAgICAgYXN0Rm9yVGVzdGxpc3QoYywgQ0hJTEQobiwgMykpLFxuICAgICAgICBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCA1KSksXG4gICAgICAgIHNlcSwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckNhbGwoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSwgZnVuYzogYXN0bm9kZXMuZXhwcikge1xuICAgIC8qXG4gICAgICBhcmdsaXN0OiAoYXJndW1lbnQgJywnKSogKGFyZ3VtZW50IFsnLCddfCAnKicgdGVzdCBbJywnICcqKicgdGVzdF1cbiAgICAgICAgICAgICAgIHwgJyoqJyB0ZXN0KVxuICAgICAgYXJndW1lbnQ6IFt0ZXN0ICc9J10gdGVzdCBbZ2VuX2Zvcl0gICAgICAgICMgUmVhbGx5IFtrZXl3b3JkICc9J10gdGVzdFxuICAgICovXG4gICAgUkVRKG4sIFNZTS5hcmdsaXN0KTtcbiAgICB2YXIgbmFyZ3MgPSAwO1xuICAgIHZhciBua2V5d29yZHMgPSAwO1xuICAgIHZhciBuZ2VucyA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOQ0gobik7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBDSElMRChuLCBpKTtcbiAgICAgICAgaWYgKGNoLnR5cGUgPT09IFNZTS5hcmd1bWVudCkge1xuICAgICAgICAgICAgaWYgKE5DSChjaCkgPT09IDEpIG5hcmdzKys7XG4gICAgICAgICAgICBlbHNlIGlmIChDSElMRChjaCwgMSkudHlwZSA9PT0gU1lNLmdlbl9mb3IpIG5nZW5zKys7XG4gICAgICAgICAgICBlbHNlIG5rZXl3b3JkcysrO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChuZ2VucyA+IDEgfHwgKG5nZW5zICYmIChuYXJncyB8fCBua2V5d29yZHMpKSlcbiAgICAgICAgdGhyb3cgc3ludGF4RXJyb3IoXCJHZW5lcmF0b3IgZXhwcmVzc2lvbiBtdXN0IGJlIHBhcmVudGhlc2l6ZWQgaWYgbm90IHNvbGUgYXJndW1lbnRcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgaWYgKG5hcmdzICsgbmtleXdvcmRzICsgbmdlbnMgPiAyNTUpXG4gICAgICAgIHRocm93IHN5bnRheEVycm9yKFwibW9yZSB0aGFuIDI1NSBhcmd1bWVudHNcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgdmFyIGFyZ3MgPSBbXTtcbiAgICB2YXIga2V5d29yZHMgPSBbXTtcbiAgICBuYXJncyA9IDA7XG4gICAgbmtleXdvcmRzID0gMDtcbiAgICB2YXIgdmFyYXJnID0gbnVsbDtcbiAgICB2YXIga3dhcmcgPSBudWxsO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gQ0hJTEQobiwgaSk7XG4gICAgICAgIGlmIChjaC50eXBlID09PSBTWU0uYXJndW1lbnQpIHtcbiAgICAgICAgICAgIGlmIChOQ0goY2gpID09PSAxKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5rZXl3b3JkcykgdGhyb3cgc3ludGF4RXJyb3IoXCJub24ta2V5d29yZCBhcmcgYWZ0ZXIga2V5d29yZCBhcmdcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgaWYgKHZhcmFyZykgdGhyb3cgc3ludGF4RXJyb3IoXCJvbmx5IG5hbWVkIGFyZ3VtZW50cyBtYXkgZm9sbG93ICpleHByZXNzaW9uXCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIGFyZ3NbbmFyZ3MrK10gPSBhc3RGb3JFeHByKGMsIENISUxEKGNoLCAwKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChDSElMRChjaCwgMSkudHlwZSA9PT0gU1lNLmdlbl9mb3IpXG4gICAgICAgICAgICAgICAgYXJnc1tuYXJncysrXSA9IGFzdEZvckdlbmV4cChjLCBjaCk7XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZSA9IGFzdEZvckV4cHIoYywgQ0hJTEQoY2gsIDApKTtcbiAgICAgICAgICAgICAgICBpZiAoZS5jb25zdHJ1Y3RvciA9PT0gYXN0bm9kZXMuTGFtYmRhKSB0aHJvdyBzeW50YXhFcnJvcihcImxhbWJkYSBjYW5ub3QgY29udGFpbiBhc3NpZ25tZW50XCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGUuY29uc3RydWN0b3IgIT09IGFzdG5vZGVzLk5hbWUpIHRocm93IHN5bnRheEVycm9yKFwia2V5d29yZCBjYW4ndCBiZSBhbiBleHByZXNzaW9uXCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHZhciBrZXkgPSAoPGFzdG5vZGVzLk5hbWU+ZSkuaWQ7XG4gICAgICAgICAgICAgICAgZm9yYmlkZGVuQ2hlY2soYywgQ0hJTEQoY2gsIDApLCBrZXksIG4ubGluZW5vKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IG5rZXl3b3JkczsgKytrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0bXAgPSBrZXl3b3Jkc1trXS5hcmc7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0bXAgPT09IGtleSkgdGhyb3cgc3ludGF4RXJyb3IoXCJrZXl3b3JkIGFyZ3VtZW50IHJlcGVhdGVkXCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBrZXl3b3Jkc1tua2V5d29yZHMrK10gPSBuZXcgYXN0bm9kZXMuS2V5d29yZChrZXksIGFzdEZvckV4cHIoYywgQ0hJTEQoY2gsIDIpKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2gudHlwZSA9PT0gVE9LLlRfU1RBUilcbiAgICAgICAgICAgIHZhcmFyZyA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgKytpKSk7XG4gICAgICAgIGVsc2UgaWYgKGNoLnR5cGUgPT09IFRPSy5UX0RPVUJMRVNUQVIpXG4gICAgICAgICAgICBrd2FyZyA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgKytpKSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuQ2FsbChmdW5jLCBhcmdzLCBrZXl3b3JkcywgdmFyYXJnLCBrd2FyZywgZnVuYy5saW5lbm8sIGZ1bmMuY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvclRyYWlsZXIoYywgbjogcGFyc2VyLk5vZGUsIGxlZnRFeHByOiBhc3Rub2Rlcy5leHByKTogYXN0bm9kZXMuZXhwciB7XG4gICAgLyogdHJhaWxlcjogJygnIFthcmdsaXN0XSAnKScgfCAnWycgc3Vic2NyaXB0bGlzdCAnXScgfCAnLicgTkFNRVxuICAgICAgIHN1YnNjcmlwdGxpc3Q6IHN1YnNjcmlwdCAoJywnIHN1YnNjcmlwdCkqIFsnLCddXG4gICAgICAgc3Vic2NyaXB0OiAnLicgJy4nICcuJyB8IHRlc3QgfCBbdGVzdF0gJzonIFt0ZXN0XSBbc2xpY2VvcF1cbiAgICAgKi9cbiAgICBSRVEobiwgU1lNLnRyYWlsZXIpO1xuICAgIGlmIChDSElMRChuLCAwKS50eXBlID09PSBUT0suVF9MUEFSKSB7XG4gICAgICAgIGlmIChOQ0gobikgPT09IDIpXG4gICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkNhbGwobGVmdEV4cHIsIFtdLCBbXSwgbnVsbCwgbnVsbCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBhc3RGb3JDYWxsKGMsIENISUxEKG4sIDEpLCBsZWZ0RXhwcik7XG4gICAgfVxuICAgIGVsc2UgaWYgKENISUxEKG4sIDApLnR5cGUgPT09IFRPSy5UX0RPVClcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5BdHRyaWJ1dGUobGVmdEV4cHIsIHN0cm9iaihDSElMRChuLCAxKS52YWx1ZSksIGFzdG5vZGVzLkxvYWQsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIGVsc2Uge1xuICAgICAgICBSRVEoQ0hJTEQobiwgMCksIFRPSy5UX0xTUUIpO1xuICAgICAgICBSRVEoQ0hJTEQobiwgMiksIFRPSy5UX1JTUUIpO1xuICAgICAgICBuID0gQ0hJTEQobiwgMSk7XG4gICAgICAgIGlmIChOQ0gobikgPT09IDEpXG4gICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlN1YnNjcmlwdChsZWZ0RXhwciwgYXN0Rm9yU2xpY2UoYywgQ0hJTEQobiwgMCkpLCBhc3Rub2Rlcy5Mb2FkLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvKiBUaGUgZ3JhbW1hciBpcyBhbWJpZ3VvdXMgaGVyZS4gVGhlIGFtYmlndWl0eSBpcyByZXNvbHZlZFxuICAgICAgICAgICAgICAgYnkgdHJlYXRpbmcgdGhlIHNlcXVlbmNlIGFzIGEgdHVwbGUgbGl0ZXJhbCBpZiB0aGVyZSBhcmVcbiAgICAgICAgICAgICAgIG5vIHNsaWNlIGZlYXR1cmVzLlxuICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHZhciBzaW1wbGUgPSB0cnVlO1xuICAgICAgICAgICAgdmFyIHNsaWNlczogYXN0bm9kZXMuc2xpY2VbXSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBOQ0gobik7IGogKz0gMikge1xuICAgICAgICAgICAgICAgIHZhciBzbGM6IGFzdG5vZGVzLnNsaWNlID0gYXN0Rm9yU2xpY2UoYywgQ0hJTEQobiwgaikpO1xuICAgICAgICAgICAgICAgIGlmIChzbGMuY29uc3RydWN0b3IgIT09IGFzdG5vZGVzLkluZGV4KVxuICAgICAgICAgICAgICAgICAgICBzaW1wbGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzbGljZXNbaiAvIDJdID0gc2xjO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzaW1wbGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlN1YnNjcmlwdChsZWZ0RXhwciwgbmV3IGFzdG5vZGVzLkV4dFNsaWNlKHNsaWNlcyksIGFzdG5vZGVzLkxvYWQsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGVsdHM6IGFzdG5vZGVzLmV4cHJbXSA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzbGljZXMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgICAgICAgICB2YXIgc2xjOiBhc3Rub2Rlcy5zbGljZSA9IHNsaWNlc1tqXTtcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmFzc2VydChzbGMuY29uc3RydWN0b3IgPT09IGFzdG5vZGVzLkluZGV4ICYmICg8YXN0bm9kZXMuSW5kZXg+c2xjKS52YWx1ZSAhPT0gbnVsbCAmJiAoPGFzdG5vZGVzLkluZGV4PnNsYykudmFsdWUgIT09IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgZWx0c1tqXSA9ICg8YXN0bm9kZXMuSW5kZXg+c2xjKS52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBlID0gbmV3IGFzdG5vZGVzLlR1cGxlKGVsdHMsIGFzdG5vZGVzLkxvYWQsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5TdWJzY3JpcHQobGVmdEV4cHIsIG5ldyBhc3Rub2Rlcy5JbmRleChlKSwgYXN0bm9kZXMuTG9hZCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFzdEZvckZsb3dTdG10KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICB2YXIgY2g6IHBhcnNlci5Ob2RlO1xuICAgIFJFUShuLCBTWU0uZmxvd19zdG10KTtcbiAgICBjaCA9IENISUxEKG4sIDApO1xuICAgIHN3aXRjaCAoY2gudHlwZSkge1xuICAgICAgICBjYXNlIFNZTS5icmVha19zdG10OiByZXR1cm4gbmV3IGFzdG5vZGVzLkJyZWFrXyhuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgY2FzZSBTWU0uY29udGludWVfc3RtdDogcmV0dXJuIG5ldyBhc3Rub2Rlcy5Db250aW51ZV8obi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgIGNhc2UgU1lNLnlpZWxkX3N0bXQ6XG4gICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkV4cHIoYXN0Rm9yRXhwcihjLCBDSElMRChjaCwgMCkpLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgY2FzZSBTWU0ucmV0dXJuX3N0bXQ6XG4gICAgICAgICAgICBpZiAoTkNIKGNoKSA9PT0gMSlcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlJldHVybl8obnVsbCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5SZXR1cm5fKGFzdEZvclRlc3RsaXN0KGMsIENISUxEKGNoLCAxKSksIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBjYXNlIFNZTS5yYWlzZV9zdG10OlxuICAgICAgICAgICAgaWYgKE5DSChjaCkgPT09IDEpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5SYWlzZShudWxsLCBudWxsLCBudWxsLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgICAgIGVsc2UgaWYgKE5DSChjaCkgPT09IDIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5SYWlzZShhc3RGb3JFeHByKGMsIENISUxEKGNoLCAxKSksIG51bGwsIG51bGwsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgZWxzZSBpZiAoTkNIKGNoKSA9PT0gNClcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlJhaXNlKFxuICAgICAgICAgICAgICAgICAgICBhc3RGb3JFeHByKGMsIENISUxEKGNoLCAxKSksXG4gICAgICAgICAgICAgICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQoY2gsIDMpKSxcbiAgICAgICAgICAgICAgICAgICAgbnVsbCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgICAgICBlbHNlIGlmIChOQ0goY2gpID09PSA2KVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuUmFpc2UoXG4gICAgICAgICAgICAgICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQoY2gsIDEpKSxcbiAgICAgICAgICAgICAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChjaCwgMykpLFxuICAgICAgICAgICAgICAgICAgICBhc3RGb3JFeHByKGMsIENISUxEKGNoLCA1KSksXG4gICAgICAgICAgICAgICAgICAgIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgYXNzZXJ0cy5mYWlsKFwidW5leHBlY3RlZCBmbG93X3N0bXRcIik7XG4gICAgfVxuICAgIGFzc2VydHMuZmFpbChcInVuaGFuZGxlZCBmbG93IHN0YXRlbWVudFwiKTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yQXJndW1lbnRzKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAvKiBwYXJhbWV0ZXJzOiAnKCcgW3ZhcmFyZ3NsaXN0XSAnKSdcbiAgICAgICB2YXJhcmdzbGlzdDogKGZwZGVmIFsnPScgdGVzdF0gJywnKSogKCcqJyBOQU1FIFsnLCcgJyoqJyBOQU1FXVxuICAgICAgICAgICAgfCAnKionIE5BTUUpIHwgZnBkZWYgWyc9JyB0ZXN0XSAoJywnIGZwZGVmIFsnPScgdGVzdF0pKiBbJywnXVxuICAgICovXG4gICAgdmFyIGNoO1xuICAgIHZhciB2YXJhcmcgPSBudWxsO1xuICAgIHZhciBrd2FyZyA9IG51bGw7XG4gICAgaWYgKG4udHlwZSA9PT0gU1lNLnBhcmFtZXRlcnMpIHtcbiAgICAgICAgaWYgKE5DSChuKSA9PT0gMikgLy8gKCkgYXMgYXJnbGlzdFxuICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5Bcmd1bWVudHMoW10sIG51bGwsIG51bGwsIFtdKTtcbiAgICAgICAgbiA9IENISUxEKG4sIDEpO1xuICAgIH1cbiAgICBSRVEobiwgU1lNLnZhcmFyZ3NsaXN0KTtcblxuICAgIHZhciBhcmdzID0gW107XG4gICAgdmFyIGRlZmF1bHRzID0gW107XG5cbiAgICAvKiBmcGRlZjogTkFNRSB8ICcoJyBmcGxpc3QgJyknXG4gICAgICAgZnBsaXN0OiBmcGRlZiAoJywnIGZwZGVmKSogWycsJ11cbiAgICAqL1xuICAgIHZhciBmb3VuZERlZmF1bHQgPSBmYWxzZTtcbiAgICB2YXIgaSA9IDA7XG4gICAgdmFyIGogPSAwOyAvLyBpbmRleCBmb3IgZGVmYXVsdHNcbiAgICB2YXIgayA9IDA7IC8vIGluZGV4IGZvciBhcmdzXG4gICAgd2hpbGUgKGkgPCBOQ0gobikpIHtcbiAgICAgICAgY2ggPSBDSElMRChuLCBpKTtcbiAgICAgICAgc3dpdGNoIChjaC50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFNZTS5mcGRlZjpcbiAgICAgICAgICAgICAgICB2YXIgY29tcGxleEFyZ3MgPSAwO1xuICAgICAgICAgICAgICAgIHZhciBwYXJlbnRoZXNpemVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaGFuZGxlX2ZwZGVmOiB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaSArIDEgPCBOQ0gobikgJiYgQ0hJTEQobiwgaSArIDEpLnR5cGUgPT09IFRPSy5UX0VRVUFMKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZhdWx0c1tqKytdID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCBpICsgMikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaSArPSAyO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmREZWZhdWx0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChmb3VuZERlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIGRlZiBmKCh4KT00KTogcGFzcyBzaG91bGQgcmFpc2UgYW4gZXJyb3IuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBkZWYgZigoeCwgKHkpKSk6IHBhc3Mgd2lsbCBqdXN0IGluY3VyIHRoZSB0dXBsZSB1bnBhY2tpbmcgd2FybmluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwYXJlbnRoZXNpemVkICYmICFjb21wbGV4QXJncylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcInBhcmVudGhlc2l6ZWQgYXJnIHdpdGggZGVmYXVsdFwiLCBjLmNfZmlsZW5hbWUsIG4ubGluZW5vKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwibm9uLWRlZmF1bHQgYXJndW1lbnQgZm9sbG93cyBkZWZhdWx0IGFyZ3VtZW50XCIsIGMuY19maWxlbmFtZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKE5DSChjaCkgPT09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gZGVmIGZvbygoeCkpOiBpcyBub3QgY29tcGxleCwgc3BlY2lhbCBjYXNlLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE5DSChjaCkgIT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcInR1cGxlIHBhcmFtZXRlciB1bnBhY2tpbmcgaGFzIGJlZW4gcmVtb3ZlZFwiLCBjLmNfZmlsZW5hbWUsIG4ubGluZW5vKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIGRlZiBmb28oKHgpKTogc2V0dXAgZm9yIGNoZWNraW5nIE5BTUUgYmVsb3cuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogTG9vcCBiZWNhdXNlIHRoZXJlIGNhbiBiZSBtYW55IHBhcmVucyBhbmQgdHVwbGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bnBhY2tpbmcgbWl4ZWQgaW4uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50aGVzaXplZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2ggPSBDSElMRChjaCwgMCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzZXJ0cy5hc3NlcnQoY2gudHlwZSA9PT0gU1lNLmZwZGVmKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBoYW5kbGVfZnBkZWY7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKENISUxEKGNoLCAwKS50eXBlID09PSBUT0suVF9OQU1FKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3JiaWRkZW5DaGVjayhjLCBuLCBDSElMRChjaCwgMCkudmFsdWUsIG4ubGluZW5vKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpZCA9IHN0cm9iaihDSElMRChjaCwgMCkudmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJnc1trKytdID0gbmV3IGFzdG5vZGVzLk5hbWUoaWQsIGFzdG5vZGVzLlBhcmFtLCBjaC5saW5lbm8sIGNoLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGkgKz0gMjtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhcmVudGhlc2l6ZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcInBhcmVudGhlc2l6ZWQgYXJndW1lbnQgbmFtZXMgYXJlIGludmFsaWRcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgVE9LLlRfU1RBUjpcbiAgICAgICAgICAgICAgICBmb3JiaWRkZW5DaGVjayhjLCBDSElMRChuLCBpICsgMSksIENISUxEKG4sIGkgKyAxKS52YWx1ZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIHZhcmFyZyA9IHN0cm9iaihDSElMRChuLCBpICsgMSkudmFsdWUpO1xuICAgICAgICAgICAgICAgIGkgKz0gMztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgVE9LLlRfRE9VQkxFU1RBUjpcbiAgICAgICAgICAgICAgICBmb3JiaWRkZW5DaGVjayhjLCBDSElMRChuLCBpICsgMSksIENISUxEKG4sIGkgKyAxKS52YWx1ZSwgbi5saW5lbm8pO1xuICAgICAgICAgICAgICAgIGt3YXJnID0gc3Ryb2JqKENISUxEKG4sIGkgKyAxKS52YWx1ZSk7XG4gICAgICAgICAgICAgICAgaSArPSAzO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmV4cGVjdGVkIG5vZGUgaW4gdmFyYXJnc2xpc3RcIik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5Bcmd1bWVudHMoYXJncywgdmFyYXJnLCBrd2FyZywgZGVmYXVsdHMpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JGdW5jZGVmKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUsIGRlY29yYXRvclNlcTogYXN0bm9kZXMuc3RtdFtdKSB7XG4gICAgLyogZnVuY2RlZjogJ2RlZicgTkFNRSBwYXJhbWV0ZXJzICc6JyBzdWl0ZSAqL1xuICAgIFJFUShuLCBTWU0uZnVuY2RlZik7XG4gICAgdmFyIG5hbWUgPSBzdHJvYmooQ0hJTEQobiwgMSkudmFsdWUpO1xuICAgIGZvcmJpZGRlbkNoZWNrKGMsIENISUxEKG4sIDEpLCBDSElMRChuLCAxKS52YWx1ZSwgbi5saW5lbm8pO1xuICAgIHZhciBhcmdzID0gYXN0Rm9yQXJndW1lbnRzKGMsIENISUxEKG4sIDIpKTtcbiAgICB2YXIgYm9keSA9IGFzdEZvclN1aXRlKGMsIENISUxEKG4sIDQpKTtcbiAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkZ1bmN0aW9uRGVmKG5hbWUsIGFyZ3MsIGJvZHksIGRlY29yYXRvclNlcSwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckNsYXNzQmFzZXMoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLmV4cHJbXSB7XG4gICAgYXNzZXJ0cy5hc3NlcnQoTkNIKG4pID4gMCk7XG4gICAgUkVRKG4sIFNZTS50ZXN0bGlzdCk7XG4gICAgaWYgKE5DSChuKSA9PT0gMSlcbiAgICAgICAgcmV0dXJuIFthc3RGb3JFeHByKGMsIENISUxEKG4sIDApKV07XG4gICAgcmV0dXJuIHNlcUZvclRlc3RsaXN0KGMsIG4pO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JDbGFzc2RlZihjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlLCBkZWNvcmF0b3JTZXEpIHtcbiAgICBSRVEobiwgU1lNLmNsYXNzZGVmKTtcbiAgICBmb3JiaWRkZW5DaGVjayhjLCBuLCBDSElMRChuLCAxKS52YWx1ZSwgbi5saW5lbm8pO1xuICAgIHZhciBjbGFzc25hbWU6IHN0cmluZyA9IHN0cm9iaihDSElMRChuLCAxKS52YWx1ZSk7XG4gICAgaWYgKE5DSChuKSA9PT0gNClcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5DbGFzc0RlZihjbGFzc25hbWUsIFtdLCBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCAzKSksIGRlY29yYXRvclNlcSwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgaWYgKENISUxEKG4sIDMpLnR5cGUgPT09IFRPSy5UX1JQQVIpXG4gICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuQ2xhc3NEZWYoY2xhc3NuYW1lLCBbXSwgYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgNSkpLCBkZWNvcmF0b3JTZXEsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuXG4gICAgdmFyIGJhc2VzID0gYXN0Rm9yQ2xhc3NCYXNlcyhjLCBDSElMRChuLCAzKSk7XG4gICAgdmFyIHMgPSBhc3RGb3JTdWl0ZShjLCBDSElMRChuLCA2KSk7XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5DbGFzc0RlZihjbGFzc25hbWUsIGJhc2VzLCBzLCBkZWNvcmF0b3JTZXEsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xufVxuXG5mdW5jdGlvbiBhc3RGb3JMYW1iZGVmKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpOiBhc3Rub2Rlcy5MYW1iZGEge1xuICAgIHZhciBhcmdzO1xuICAgIHZhciBleHByZXNzaW9uO1xuICAgIGlmIChOQ0gobikgPT09IDMpIHtcbiAgICAgICAgYXJncyA9IG5ldyBhc3Rub2Rlcy5Bcmd1bWVudHMoW10sIG51bGwsIG51bGwsIFtdKTtcbiAgICAgICAgZXhwcmVzc2lvbiA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMikpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYXJncyA9IGFzdEZvckFyZ3VtZW50cyhjLCBDSElMRChuLCAxKSk7XG4gICAgICAgIGV4cHJlc3Npb24gPSBhc3RGb3JFeHByKGMsIENISUxEKG4sIDMpKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5MYW1iZGEoYXJncywgZXhwcmVzc2lvbiwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckdlbmV4cChjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgLyogdGVzdGxpc3RfZ2V4cDogdGVzdCAoIGdlbl9mb3IgfCAoJywnIHRlc3QpKiBbJywnXSApXG4gICAgICAgYXJndW1lbnQ6IFt0ZXN0ICc9J10gdGVzdCBbZ2VuX2Zvcl0gICAgICAgIyBSZWFsbHkgW2tleXdvcmQgJz0nXSB0ZXN0ICovXG4gICAgYXNzZXJ0cy5hc3NlcnQobi50eXBlID09PSBTWU0udGVzdGxpc3RfZ2V4cCB8fCBuLnR5cGUgPT09IFNZTS5hcmd1bWVudCk7XG4gICAgYXNzZXJ0cy5hc3NlcnQoTkNIKG4pID4gMSk7XG5cbiAgICBmdW5jdGlvbiBjb3VudEdlbkZvcnMoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSkge1xuICAgICAgICB2YXIgbmZvcnMgPSAwO1xuICAgICAgICB2YXIgY2ggPSBDSElMRChuLCAxKTtcbiAgICAgICAgY291bnRfZ2VuX2Zvcjogd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIG5mb3JzKys7XG4gICAgICAgICAgICBSRVEoY2gsIFNZTS5nZW5fZm9yKTtcbiAgICAgICAgICAgIGlmIChOQ0goY2gpID09PSA1KVxuICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBuZm9ycztcbiAgICAgICAgICAgIGNvdW50X2dlbl9pdGVyOiB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIFJFUShjaCwgU1lNLmdlbl9pdGVyKTtcbiAgICAgICAgICAgICAgICBjaCA9IENISUxEKGNoLCAwKTtcbiAgICAgICAgICAgICAgICBpZiAoY2gudHlwZSA9PT0gU1lNLmdlbl9mb3IpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIGNvdW50X2dlbl9mb3I7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoY2gudHlwZSA9PT0gU1lNLmdlbl9pZikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoTkNIKGNoKSA9PT0gMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2ggPSBDSElMRChjaCwgMik7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBjb3VudF9nZW5faXRlcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmZvcnM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYXNzZXJ0cy5mYWlsKFwibG9naWMgZXJyb3IgaW4gY291bnRHZW5Gb3JzXCIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvdW50R2VuSWZzKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAgICAgdmFyIG5pZnMgPSAwO1xuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgICAgUkVRKG4sIFNZTS5nZW5faXRlcik7XG4gICAgICAgICAgICBpZiAoQ0hJTEQobiwgMCkudHlwZSA9PT0gU1lNLmdlbl9mb3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5pZnM7XG4gICAgICAgICAgICBuID0gQ0hJTEQobiwgMCk7XG4gICAgICAgICAgICBSRVEobiwgU1lNLmdlbl9pZik7XG4gICAgICAgICAgICBuaWZzKys7XG4gICAgICAgICAgICBpZiAoTkNIKG4pID09IDIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5pZnM7XG4gICAgICAgICAgICBuID0gQ0hJTEQobiwgMik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZWx0ID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCAwKSk7XG4gICAgdmFyIG5mb3JzID0gY291bnRHZW5Gb3JzKGMsIG4pO1xuICAgIHZhciBnZW5leHBzID0gW107XG4gICAgdmFyIGNoID0gQ0hJTEQobiwgMSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZm9yczsgKytpKSB7XG4gICAgICAgIFJFUShjaCwgU1lNLmdlbl9mb3IpO1xuICAgICAgICB2YXIgZm9yY2ggPSBDSElMRChjaCwgMSk7XG4gICAgICAgIHZhciB0ID0gYXN0Rm9yRXhwcmxpc3QoYywgZm9yY2gsIGFzdG5vZGVzLlN0b3JlKTtcbiAgICAgICAgdmFyIGV4cHJlc3Npb24gPSBhc3RGb3JFeHByKGMsIENISUxEKGNoLCAzKSk7XG4gICAgICAgIHZhciBnZTtcbiAgICAgICAgaWYgKE5DSChmb3JjaCkgPT09IDEpXG4gICAgICAgICAgICBnZSA9IG5ldyBhc3Rub2Rlcy5Db21wcmVoZW5zaW9uKHRbMF0sIGV4cHJlc3Npb24sIFtdKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZ2UgPSBuZXcgYXN0bm9kZXMuQ29tcHJlaGVuc2lvbihuZXcgYXN0bm9kZXMuVHVwbGUodCwgYXN0bm9kZXMuU3RvcmUsIGNoLmxpbmVubywgY2guY29sX29mZnNldCksIGV4cHJlc3Npb24sIFtdKTtcbiAgICAgICAgaWYgKE5DSChjaCkgPT09IDUpIHtcbiAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDQpO1xuICAgICAgICAgICAgdmFyIG5pZnMgPSBjb3VudEdlbklmcyhjLCBjaCk7XG4gICAgICAgICAgICB2YXIgaWZzID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG5pZnM7ICsraikge1xuICAgICAgICAgICAgICAgIFJFUShjaCwgU1lNLmdlbl9pdGVyKTtcbiAgICAgICAgICAgICAgICBjaCA9IENISUxEKGNoLCAwKTtcbiAgICAgICAgICAgICAgICBSRVEoY2gsIFNZTS5nZW5faWYpO1xuICAgICAgICAgICAgICAgIGV4cHJlc3Npb24gPSBhc3RGb3JFeHByKGMsIENISUxEKGNoLCAxKSk7XG4gICAgICAgICAgICAgICAgaWZzW2pdID0gZXhwcmVzc2lvbjtcbiAgICAgICAgICAgICAgICBpZiAoTkNIKGNoKSA9PT0gMylcbiAgICAgICAgICAgICAgICAgICAgY2ggPSBDSElMRChjaCwgMik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2gudHlwZSA9PT0gU1lNLmdlbl9pdGVyKVxuICAgICAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDApO1xuICAgICAgICAgICAgZ2UuaWZzID0gaWZzO1xuICAgICAgICB9XG4gICAgICAgIGdlbmV4cHNbaV0gPSBnZTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5HZW5lcmF0b3JFeHAoZWx0LCBnZW5leHBzLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yV2hpbGVTdG10KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAvKiB3aGlsZV9zdG10OiAnd2hpbGUnIHRlc3QgJzonIHN1aXRlIFsnZWxzZScgJzonIHN1aXRlXSAqL1xuICAgIFJFUShuLCBTWU0ud2hpbGVfc3RtdCk7XG4gICAgaWYgKE5DSChuKSA9PT0gNClcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5XaGlsZV8oYXN0Rm9yRXhwcihjLCBDSElMRChuLCAxKSksIGFzdEZvclN1aXRlKGMsIENISUxEKG4sIDMpKSwgW10sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIGVsc2UgaWYgKE5DSChuKSA9PT0gNylcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5XaGlsZV8oYXN0Rm9yRXhwcihjLCBDSElMRChuLCAxKSksIGFzdEZvclN1aXRlKGMsIENISUxEKG4sIDMpKSwgYXN0Rm9yU3VpdGUoYywgQ0hJTEQobiwgNikpLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICBhc3NlcnRzLmZhaWwoXCJ3cm9uZyBudW1iZXIgb2YgdG9rZW5zIGZvciAnd2hpbGUnIHN0bXRcIik7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckF1Z2Fzc2lnbihjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgUkVRKG4sIFNZTS5hdWdhc3NpZ24pO1xuICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICBzd2l0Y2ggKG4udmFsdWUuY2hhckF0KDApKSB7XG4gICAgICAgIGNhc2UgJysnOiByZXR1cm4gYXN0bm9kZXMuQWRkO1xuICAgICAgICBjYXNlICctJzogcmV0dXJuIGFzdG5vZGVzLlN1YjtcbiAgICAgICAgY2FzZSAnLyc6IGlmIChuLnZhbHVlLmNoYXJBdCgxKSA9PT0gJy8nKSByZXR1cm4gYXN0bm9kZXMuRmxvb3JEaXY7XG4gICAgICAgICAgICByZXR1cm4gYXN0bm9kZXMuRGl2O1xuICAgICAgICBjYXNlICclJzogcmV0dXJuIGFzdG5vZGVzLk1vZDtcbiAgICAgICAgY2FzZSAnPCc6IHJldHVybiBhc3Rub2Rlcy5MU2hpZnQ7XG4gICAgICAgIGNhc2UgJz4nOiByZXR1cm4gYXN0bm9kZXMuUlNoaWZ0O1xuICAgICAgICBjYXNlICcmJzogcmV0dXJuIGFzdG5vZGVzLkJpdEFuZDtcbiAgICAgICAgY2FzZSAnXic6IHJldHVybiBhc3Rub2Rlcy5CaXRYb3I7XG4gICAgICAgIGNhc2UgJ3wnOiByZXR1cm4gYXN0bm9kZXMuQml0T3I7XG4gICAgICAgIGNhc2UgJyonOiBpZiAobi52YWx1ZS5jaGFyQXQoMSkgPT09ICcqJykgcmV0dXJuIGFzdG5vZGVzLlBvdztcbiAgICAgICAgICAgIHJldHVybiBhc3Rub2Rlcy5NdWx0O1xuICAgICAgICBkZWZhdWx0OiBhc3NlcnRzLmZhaWwoXCJpbnZhbGlkIGF1Z2Fzc2lnblwiKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFzdEZvckJpbm9wKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAvKiBNdXN0IGFjY291bnQgZm9yIGEgc2VxdWVuY2Ugb2YgZXhwcmVzc2lvbnMuXG4gICAgICAgIEhvdyBzaG91bGQgQSBvcCBCIG9wIEMgYnkgcmVwcmVzZW50ZWQ/XG4gICAgICAgIEJpbk9wKEJpbk9wKEEsIG9wLCBCKSwgb3AsIEMpLlxuICAgICovXG4gICAgdmFyIHJlc3VsdCA9IG5ldyBhc3Rub2Rlcy5CaW5PcChcbiAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChuLCAwKSksXG4gICAgICAgIGdldE9wZXJhdG9yKENISUxEKG4sIDEpKSxcbiAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChuLCAyKSksXG4gICAgICAgIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIHZhciBub3BzID0gKE5DSChuKSAtIDEpIC8gMjtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IG5vcHM7ICsraSkge1xuICAgICAgICB2YXIgbmV4dE9wZXIgPSBDSElMRChuLCBpICogMiArIDEpO1xuICAgICAgICB2YXIgbmV3b3BlcmF0b3IgPSBnZXRPcGVyYXRvcihuZXh0T3Blcik7XG4gICAgICAgIHZhciB0bXAgPSBhc3RGb3JFeHByKGMsIENISUxEKG4sIGkgKiAyICsgMikpO1xuICAgICAgICByZXN1bHQgPSBuZXcgYXN0bm9kZXMuQmluT3AocmVzdWx0LCBuZXdvcGVyYXRvciwgdG1wLCBuZXh0T3Blci5saW5lbm8sIG5leHRPcGVyLmNvbF9vZmZzZXQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuXG59XG5cbmZ1bmN0aW9uIGFzdEZvclRlc3RsaXN0KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICAvKiB0ZXN0bGlzdF9nZXhwOiB0ZXN0ICgnLCcgdGVzdCkqIFsnLCddICovXG4gICAgLyogdGVzdGxpc3Q6IHRlc3QgKCcsJyB0ZXN0KSogWycsJ10gKi9cbiAgICAvKiB0ZXN0bGlzdF9zYWZlOiB0ZXN0ICgnLCcgdGVzdCkrIFsnLCddICovXG4gICAgLyogdGVzdGxpc3QxOiB0ZXN0ICgnLCcgdGVzdCkqICovXG4gICAgYXNzZXJ0cy5hc3NlcnQoTkNIKG4pID4gMCk7XG4gICAgaWYgKG4udHlwZSA9PT0gU1lNLnRlc3RsaXN0X2dleHApIHtcbiAgICAgICAgaWYgKE5DSChuKSA+IDEpIHtcbiAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KENISUxEKG4sIDEpLnR5cGUgIT09IFNZTS5nZW5fZm9yKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQobi50eXBlID09PSBTWU0udGVzdGxpc3QgfHwgbi50eXBlID09PSBTWU0udGVzdGxpc3Rfc2FmZSB8fCBuLnR5cGUgPT09IFNZTS50ZXN0bGlzdDEpO1xuICAgIH1cblxuICAgIGlmIChOQ0gobikgPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMCkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5UdXBsZShzZXFGb3JUZXN0bGlzdChjLCBuKSwgYXN0bm9kZXMuTG9hZCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgfVxuXG59XG5cbmZ1bmN0aW9uIGFzdEZvckV4cHJTdG10KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBSRVEobiwgU1lNLkV4cHJTdG10KTtcbiAgICBpZiAoTkNIKG4pID09PSAxKVxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkV4cHIoYXN0Rm9yVGVzdGxpc3QoYywgQ0hJTEQobiwgMCkpLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICBlbHNlIGlmIChDSElMRChuLCAxKS50eXBlID09PSBTWU0uYXVnYXNzaWduKSB7XG4gICAgICAgIHZhciBjaCA9IENISUxEKG4sIDApO1xuICAgICAgICB2YXIgZXhwcjEgPSBhc3RGb3JUZXN0bGlzdChjLCBjaCk7XG4gICAgICAgIHN3aXRjaCAoZXhwcjEuY29uc3RydWN0b3IpIHtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuR2VuZXJhdG9yRXhwOiB0aHJvdyBzeW50YXhFcnJvcihcImF1Z21lbnRlZCBhc3NpZ25tZW50IHRvIGdlbmVyYXRvciBleHByZXNzaW9uIG5vdCBwb3NzaWJsZVwiLCBjLmNfZmlsZW5hbWUsIG4ubGluZW5vKTtcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuWWllbGQ6IHRocm93IHN5bnRheEVycm9yKFwiYXVnbWVudGVkIGFzc2lnbm1lbnQgdG8geWllbGQgZXhwcmVzc2lvbiBub3QgcG9zc2libGVcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLk5hbWU6XG4gICAgICAgICAgICAgICAgdmFyIHZhck5hbWUgPSAoPGFzdG5vZGVzLk5hbWU+ZXhwcjEpLmlkO1xuICAgICAgICAgICAgICAgIGZvcmJpZGRlbkNoZWNrKGMsIGNoLCB2YXJOYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkF0dHJpYnV0ZTpcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuU3Vic2NyaXB0OlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcImlsbGVnYWwgZXhwcmVzc2lvbiBmb3IgYXVnbWVudGVkIGFzc2lnbm1lbnRcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgIH1cbiAgICAgICAgc2V0Q29udGV4dChjLCBleHByMSwgYXN0bm9kZXMuU3RvcmUsIGNoKTtcblxuICAgICAgICBjaCA9IENISUxEKG4sIDIpO1xuICAgICAgICB2YXIgZXhwcjI7XG4gICAgICAgIGlmIChjaC50eXBlID09PSBTWU0udGVzdGxpc3QpXG4gICAgICAgICAgICBleHByMiA9IGFzdEZvclRlc3RsaXN0KGMsIGNoKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZXhwcjIgPSBhc3RGb3JFeHByKGMsIGNoKTtcblxuICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkF1Z0Fzc2lnbihleHByMSwgYXN0Rm9yQXVnYXNzaWduKGMsIENISUxEKG4sIDEpKSwgZXhwcjIsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gbm9ybWFsIGFzc2lnbm1lbnRcbiAgICAgICAgUkVRKENISUxEKG4sIDEpLCBUT0suVF9FUVVBTCk7XG4gICAgICAgIHZhciB0YXJnZXRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pIC0gMjsgaSArPSAyKSB7XG4gICAgICAgICAgICB2YXIgY2ggPSBDSElMRChuLCBpKTtcbiAgICAgICAgICAgIGlmIChjaC50eXBlID09PSBTWU0uWWllbGRFeHByKSB0aHJvdyBzeW50YXhFcnJvcihcImFzc2lnbm1lbnQgdG8geWllbGQgZXhwcmVzc2lvbiBub3QgcG9zc2libGVcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgICAgICB2YXIgZSA9IGFzdEZvclRlc3RsaXN0KGMsIGNoKTtcbiAgICAgICAgICAgIHNldENvbnRleHQoYywgZSwgYXN0bm9kZXMuU3RvcmUsIENISUxEKG4sIGkpKTtcbiAgICAgICAgICAgIHRhcmdldHNbaSAvIDJdID0gZTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgdmFsdWUgPSBDSElMRChuLCBOQ0gobikgLSAxKTtcbiAgICAgICAgdmFyIGV4cHJlc3Npb247XG4gICAgICAgIGlmICh2YWx1ZS50eXBlID09PSBTWU0udGVzdGxpc3QpXG4gICAgICAgICAgICBleHByZXNzaW9uID0gYXN0Rm9yVGVzdGxpc3QoYywgdmFsdWUpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBleHByZXNzaW9uID0gYXN0Rm9yRXhwcihjLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuQXNzaWduKHRhcmdldHMsIGV4cHJlc3Npb24sIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXN0Rm9ySWZleHByKGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpIHtcbiAgICBhc3NlcnRzLmFzc2VydChOQ0gobikgPT09IDUpO1xuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuSWZFeHAoXG4gICAgICAgIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMikpLFxuICAgICAgICBhc3RGb3JFeHByKGMsIENISUxEKG4sIDApKSxcbiAgICAgICAgYXN0Rm9yRXhwcihjLCBDSElMRChuLCA0KSksXG4gICAgICAgIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xufVxuXG4vKipcbiAqIHMgaXMgYSBweXRob24tc3R5bGUgc3RyaW5nIGxpdGVyYWwsIGluY2x1ZGluZyBxdW90ZSBjaGFyYWN0ZXJzIGFuZCB1L3IvYlxuICogcHJlZml4ZXMuIFJldHVybnMgZGVjb2RlZCBzdHJpbmcgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBwYXJzZXN0cihjOiBDb21waWxpbmcsIHM6IHN0cmluZykge1xuICAgIC8vIHVuZXNjYXBlIGFuZCBlc2NhcGUgYXJlIGRlcHJlY2F0ZWQgc2luY2UgRUNNQVNjcmlwdCB2My4gXG4gICAgLy8gIHZhciBlbmNvZGVVdGY4ID0gZnVuY3Rpb24ocykgeyByZXR1cm4gdW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHMpKTsgfTtcbiAgICAvLyAgdmFyIGRlY29kZVV0ZjggPSBmdW5jdGlvbihzKSB7IHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoZXNjYXBlKHMpKTsgfTtcbiAgICB2YXIgZGVjb2RlVXRmOCA9IGZ1bmN0aW9uKHMpIHsgcmV0dXJuIGRlY29kZVVSSShzKSB9O1xuICAgIHZhciBkZWNvZGVFc2NhcGUgPSBmdW5jdGlvbihzLCBxdW90ZSkge1xuICAgICAgICB2YXIgbGVuID0gcy5sZW5ndGg7XG4gICAgICAgIHZhciByZXQgPSAnJztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgICAgICAgICAgdmFyIGMgPSBzLmNoYXJBdChpKTtcbiAgICAgICAgICAgIGlmIChjID09PSAnXFxcXCcpIHtcbiAgICAgICAgICAgICAgICArK2k7XG4gICAgICAgICAgICAgICAgYyA9IHMuY2hhckF0KGkpO1xuICAgICAgICAgICAgICAgIGlmIChjID09PSAnbicpIHJldCArPSBcIlxcblwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGMgPT09ICdcXFxcJykgcmV0ICs9IFwiXFxcXFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGMgPT09ICd0JykgcmV0ICs9IFwiXFx0XCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYyA9PT0gJ3InKSByZXQgKz0gXCJcXHJcIjtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjID09PSAnYicpIHJldCArPSBcIlxcYlwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGMgPT09ICdmJykgcmV0ICs9IFwiXFxmXCI7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYyA9PT0gJ3YnKSByZXQgKz0gXCJcXHZcIjtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjID09PSAnMCcpIHJldCArPSBcIlxcMFwiO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGMgPT09ICdcIicpIHJldCArPSAnXCInO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGMgPT09ICdcXCcnKSByZXQgKz0gJ1xcJyc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYyA9PT0gJ1xcbicpIC8qIGVzY2FwZWQgbmV3bGluZSwgam9pbiBsaW5lcyAqLyB7IH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjID09PSAneCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGQwID0gcy5jaGFyQXQoKytpKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGQxID0gcy5jaGFyQXQoKytpKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQoZDAgKyBkMSwgMTYpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoYyA9PT0gJ3UnIHx8IGMgPT09ICdVJykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZDAgPSBzLmNoYXJBdCgrK2kpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgZDEgPSBzLmNoYXJBdCgrK2kpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgZDIgPSBzLmNoYXJBdCgrK2kpO1xuICAgICAgICAgICAgICAgICAgICB2YXIgZDMgPSBzLmNoYXJBdCgrK2kpO1xuICAgICAgICAgICAgICAgICAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShwYXJzZUludChkMCArIGQxLCAxNiksIHBhcnNlSW50KGQyICsgZDMsIDE2KSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBMZWF2ZSBpdCBhbG9uZVxuICAgICAgICAgICAgICAgICAgICByZXQgKz0gXCJcXFxcXCIgKyBjO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldCArPSBjO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXQ7XG4gICAgfTtcblxuICAgIHZhciBxdW90ZSA9IHMuY2hhckF0KDApO1xuICAgIHZhciByYXdtb2RlID0gZmFsc2U7XG5cbiAgICBpZiAocXVvdGUgPT09ICd1JyB8fCBxdW90ZSA9PT0gJ1UnKSB7XG4gICAgICAgIHMgPSBzLnN1YnN0cigxKTtcbiAgICAgICAgcXVvdGUgPSBzLmNoYXJBdCgwKTtcbiAgICB9XG4gICAgZWxzZSBpZiAocXVvdGUgPT09ICdyJyB8fCBxdW90ZSA9PT0gJ1InKSB7XG4gICAgICAgIHMgPSBzLnN1YnN0cigxKTtcbiAgICAgICAgcXVvdGUgPSBzLmNoYXJBdCgwKTtcbiAgICAgICAgcmF3bW9kZSA9IHRydWU7XG4gICAgfVxuICAgIGFzc2VydHMuYXNzZXJ0KHF1b3RlICE9PSAnYicgJiYgcXVvdGUgIT09ICdCJywgXCJ0b2RvOyBoYXZlbid0IGRvbmUgYicnIHN0cmluZ3MgeWV0XCIpO1xuXG4gICAgYXNzZXJ0cy5hc3NlcnQocXVvdGUgPT09IFwiJ1wiIHx8IHF1b3RlID09PSAnXCInICYmIHMuY2hhckF0KHMubGVuZ3RoIC0gMSkgPT09IHF1b3RlKTtcbiAgICBzID0gcy5zdWJzdHIoMSwgcy5sZW5ndGggLSAyKTtcblxuICAgIGlmIChzLmxlbmd0aCA+PSA0ICYmIHMuY2hhckF0KDApID09PSBxdW90ZSAmJiBzLmNoYXJBdCgxKSA9PT0gcXVvdGUpIHtcbiAgICAgICAgYXNzZXJ0cy5hc3NlcnQocy5jaGFyQXQocy5sZW5ndGggLSAxKSA9PT0gcXVvdGUgJiYgcy5jaGFyQXQocy5sZW5ndGggLSAyKSA9PT0gcXVvdGUpO1xuICAgICAgICBzID0gcy5zdWJzdHIoMiwgcy5sZW5ndGggLSA0KTtcbiAgICB9XG5cbiAgICBpZiAocmF3bW9kZSB8fCBzLmluZGV4T2YoJ1xcXFwnKSA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIHN0cm9iaihkZWNvZGVVdGY4KHMpKTtcbiAgICB9XG4gICAgcmV0dXJuIHN0cm9iaihkZWNvZGVFc2NhcGUocywgcXVvdGUpKTtcbn1cblxuLyoqXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHBhcnNlc3RycGx1cyhjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKSB7XG4gICAgUkVRKENISUxEKG4sIDApLCBUT0suVF9TVFJJTkcpO1xuICAgIHZhciByZXQgPSBcIlwiO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgTkNIKG4pOyArK2kpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gQ0hJTEQobiwgaSk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXQgPSByZXQgKyBwYXJzZXN0cihjLCBjaGlsZC52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKHgpIHtcbiAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwiaW52YWxpZCBzdHJpbmcgKHBvc3NpYmx5IGNvbnRhaW5zIGEgdW5pY29kZSBjaGFyYWN0ZXIpXCIsIGMuY19maWxlbmFtZSwgY2hpbGQubGluZW5vKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmV0O1xufVxuXG5mdW5jdGlvbiBwYXJzZW51bWJlcihjOiBDb21waWxpbmcsIHMsIGxpbmVubzogbnVtYmVyKTogYW55IHtcbiAgICB2YXIgZW5kID0gcy5jaGFyQXQocy5sZW5ndGggLSAxKTtcblxuICAgIGlmIChlbmQgPT09ICdqJyB8fCBlbmQgPT09ICdKJykge1xuICAgICAgICB0aHJvdyBzeW50YXhFcnJvcihcImNvbXBsZXggbnVtYmVycyBhcmUgY3VycmVudGx5IHVuc3VwcG9ydGVkXCIsIGMuY19maWxlbmFtZSwgbGluZW5vKTtcbiAgICB9XG5cbiAgICBpZiAocy5pbmRleE9mKCcuJykgIT09IC0xKSB7XG4gICAgICAgIHJldHVybiBudW1lcmljTGl0ZXJhbC5mbG9hdEFTVChzKTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgaW50ZWdlcnMgb2YgdmFyaW91cyBiYXNlc1xuICAgIHZhciB0bXAgPSBzO1xuICAgIHZhciB2YWx1ZTtcbiAgICB2YXIgcmFkaXggPSAxMDtcbiAgICB2YXIgbmVnID0gZmFsc2U7XG4gICAgaWYgKHMuY2hhckF0KDApID09PSAnLScpIHtcbiAgICAgICAgdG1wID0gcy5zdWJzdHIoMSk7XG4gICAgICAgIG5lZyA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRtcC5jaGFyQXQoMCkgPT09ICcwJyAmJiAodG1wLmNoYXJBdCgxKSA9PT0gJ3gnIHx8IHRtcC5jaGFyQXQoMSkgPT09ICdYJykpIHtcbiAgICAgICAgLy8gSGV4XG4gICAgICAgIHRtcCA9IHRtcC5zdWJzdHJpbmcoMik7XG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodG1wLCAxNik7XG4gICAgICAgIHJhZGl4ID0gMTY7XG4gICAgfVxuICAgIGVsc2UgaWYgKChzLmluZGV4T2YoJ2UnKSAhPT0gLTEpIHx8IChzLmluZGV4T2YoJ0UnKSAhPT0gLTEpKSB7XG4gICAgICAgIC8vIEZsb2F0IHdpdGggZXhwb25lbnQgKG5lZWRlZCB0byBtYWtlIHN1cmUgZS9FIHdhc24ndCBoZXggZmlyc3QpXG4gICAgICAgIHJldHVybiBudW1lcmljTGl0ZXJhbC5mbG9hdEFTVChzKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodG1wLmNoYXJBdCgwKSA9PT0gJzAnICYmICh0bXAuY2hhckF0KDEpID09PSAnYicgfHwgdG1wLmNoYXJBdCgxKSA9PT0gJ0InKSkge1xuICAgICAgICAvLyBCaW5hcnlcbiAgICAgICAgdG1wID0gdG1wLnN1YnN0cmluZygyKTtcbiAgICAgICAgdmFsdWUgPSBwYXJzZUludCh0bXAsIDIpO1xuICAgICAgICByYWRpeCA9IDI7XG4gICAgfVxuICAgIGVsc2UgaWYgKHRtcC5jaGFyQXQoMCkgPT09ICcwJykge1xuICAgICAgICBpZiAodG1wID09PSBcIjBcIikge1xuICAgICAgICAgICAgLy8gWmVyb1xuICAgICAgICAgICAgdmFsdWUgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gT2N0YWwgKExlYWRpbmcgemVybywgYnV0IG5vdCBhY3R1YWxseSB6ZXJvKVxuICAgICAgICAgICAgaWYgKGVuZCA9PT0gJ2wnIHx8IGVuZCA9PT0gJ0wnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bWVyaWNMaXRlcmFsLmxvbmdBU1Qocy5zdWJzdHIoMCwgcy5sZW5ndGggLSAxKSwgOCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByYWRpeCA9IDg7XG4gICAgICAgICAgICAgICAgdG1wID0gdG1wLnN1YnN0cmluZygxKTtcbiAgICAgICAgICAgICAgICBpZiAoKHRtcC5jaGFyQXQoMCkgPT09ICdvJykgfHwgKHRtcC5jaGFyQXQoMCkgPT09ICdPJykpIHtcbiAgICAgICAgICAgICAgICAgICAgdG1wID0gdG1wLnN1YnN0cmluZygxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludCh0bXAsIDgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICAvLyBEZWNpbWFsXG4gICAgICAgIGlmIChlbmQgPT09ICdsJyB8fCBlbmQgPT09ICdMJykge1xuICAgICAgICAgICAgcmV0dXJuIG51bWVyaWNMaXRlcmFsLmxvbmdBU1Qocy5zdWJzdHIoMCwgcy5sZW5ndGggLSAxKSwgcmFkaXgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludCh0bXAsIHJhZGl4KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbnZlcnQgdG8gbG9uZ1xuICAgIGlmICh2YWx1ZSA+IExPTkdfVEhSRVNIT0xEICYmIE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSAmJiAocy5pbmRleE9mKCdlJykgPT09IC0xICYmIHMuaW5kZXhPZignRScpID09PSAtMSkpIHtcbiAgICAgICAgLy8gVE9ETzogRG9lcyByYWRpeCB6ZXJvIG1ha2Ugc2Vuc2U/XG4gICAgICAgIHJldHVybiBudW1lcmljTGl0ZXJhbC5sb25nQVNUKHMsIDApO1xuICAgIH1cblxuICAgIGlmIChlbmQgPT09ICdsJyB8fCBlbmQgPT09ICdMJykge1xuICAgICAgICByZXR1cm4gbnVtZXJpY0xpdGVyYWwubG9uZ0FTVChzLnN1YnN0cigwLCBzLmxlbmd0aCAtIDEpLCByYWRpeCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBpZiAobmVnKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVtZXJpY0xpdGVyYWwuaW50QVNUKC12YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbnVtZXJpY0xpdGVyYWwuaW50QVNUKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gYXN0Rm9yU2xpY2UoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLnNsaWNlIHtcbiAgICBSRVEobiwgU1lNLnN1YnNjcmlwdCk7XG5cbiAgICB2YXIgY2ggPSBDSElMRChuLCAwKTtcbiAgICB2YXIgbG93ZXIgPSBudWxsO1xuICAgIHZhciB1cHBlciA9IG51bGw7XG4gICAgdmFyIHN0ZXAgPSBudWxsO1xuICAgIGlmIChjaC50eXBlID09PSBUT0suVF9ET1QpXG4gICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuRWxsaXBzaXMoKTtcbiAgICBpZiAoTkNIKG4pID09PSAxICYmIGNoLnR5cGUgPT09IFNZTS5JZkV4cHIpXG4gICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuSW5kZXgoYXN0Rm9yRXhwcihjLCBjaCkpO1xuICAgIGlmIChjaC50eXBlID09PSBTWU0uSWZFeHByKVxuICAgICAgICBsb3dlciA9IGFzdEZvckV4cHIoYywgY2gpO1xuICAgIGlmIChjaC50eXBlID09PSBUT0suVF9DT0xPTikge1xuICAgICAgICBpZiAoTkNIKG4pID4gMSkge1xuICAgICAgICAgICAgdmFyIG4yID0gQ0hJTEQobiwgMSk7XG4gICAgICAgICAgICBpZiAobjIudHlwZSA9PT0gU1lNLklmRXhwcilcbiAgICAgICAgICAgICAgICB1cHBlciA9IGFzdEZvckV4cHIoYywgbjIpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKE5DSChuKSA+IDIpIHtcbiAgICAgICAgdmFyIG4yID0gQ0hJTEQobiwgMik7XG4gICAgICAgIGlmIChuMi50eXBlID09PSBTWU0uSWZFeHByKVxuICAgICAgICAgICAgdXBwZXIgPSBhc3RGb3JFeHByKGMsIG4yKTtcbiAgICB9XG5cbiAgICBjaCA9IENISUxEKG4sIE5DSChuKSAtIDEpO1xuICAgIGlmIChjaC50eXBlID09PSBTWU0uc2xpY2VvcCkge1xuICAgICAgICBpZiAoTkNIKGNoKSA9PT0gMSkge1xuICAgICAgICAgICAgY2ggPSBDSElMRChjaCwgMCk7XG4gICAgICAgICAgICBzdGVwID0gbmV3IGFzdG5vZGVzLk5hbWUoc3Ryb2JqKFwiTm9uZVwiKSwgYXN0bm9kZXMuTG9hZCwgY2gubGluZW5vLCBjaC5jb2xfb2Zmc2V0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNoID0gQ0hJTEQoY2gsIDEpO1xuICAgICAgICAgICAgaWYgKGNoLnR5cGUgPT09IFNZTS5JZkV4cHIpXG4gICAgICAgICAgICAgICAgc3RlcCA9IGFzdEZvckV4cHIoYywgY2gpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuU2xpY2UobG93ZXIsIHVwcGVyLCBzdGVwKTtcbn1cblxuZnVuY3Rpb24gYXN0Rm9yQXRvbUV4cHIoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLmV4cHIge1xuICAgIHZhciBjaCA9IENISUxEKG4sIDApO1xuICAgIHN3aXRjaCAoY2gudHlwZSkge1xuICAgICAgICBjYXNlIFRPSy5UX05BTUU6XG4gICAgICAgICAgICAvLyBBbGwgbmFtZXMgc3RhcnQgaW4gYXN0bm9kZXMuTG9hZCBjb250ZXh0LCBidXQgbWF5IGJlIGNoYW5nZWQgbGF0ZXJcbiAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTmFtZShzdHJvYmooY2gudmFsdWUpLCBhc3Rub2Rlcy5Mb2FkLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgY2FzZSBUT0suVF9TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLlN0cihwYXJzZXN0cnBsdXMoYywgbiksIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBjYXNlIFRPSy5UX05VTUJFUjpcbiAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTnVtKHBhcnNlbnVtYmVyKGMsIGNoLnZhbHVlLCBuLmxpbmVubyksIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBjYXNlIFRPSy5UX0xQQVI6IC8vIHZhcmlvdXMgdXNlcyBmb3IgcGFyZW5zXG4gICAgICAgICAgICBjaCA9IENISUxEKG4sIDEpO1xuICAgICAgICAgICAgaWYgKGNoLnR5cGUgPT09IFRPSy5UX1JQQVIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5UdXBsZShbXSwgYXN0bm9kZXMuTG9hZCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgICAgICBpZiAoY2gudHlwZSA9PT0gU1lNLllpZWxkRXhwcilcbiAgICAgICAgICAgICAgICByZXR1cm4gYXN0Rm9yRXhwcihjLCBjaCk7XG4gICAgICAgICAgICBpZiAoTkNIKGNoKSA+IDEgJiYgQ0hJTEQoY2gsIDEpLnR5cGUgPT09IFNZTS5nZW5fZm9yKVxuICAgICAgICAgICAgICAgIHJldHVybiBhc3RGb3JHZW5leHAoYywgY2gpO1xuICAgICAgICAgICAgcmV0dXJuIGFzdEZvclRlc3RsaXN0R2V4cChjLCBjaCk7XG4gICAgICAgIGNhc2UgVE9LLlRfTFNRQjogLy8gbGlzdCBvciBsaXN0Y29tcFxuICAgICAgICAgICAgY2ggPSBDSElMRChuLCAxKTtcbiAgICAgICAgICAgIGlmIChjaC50eXBlID09PSBUT0suVF9SU1FCKVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTGlzdChbXSwgYXN0bm9kZXMuTG9hZCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgICAgICBSRVEoY2gsIFNZTS5saXN0bWFrZXIpO1xuICAgICAgICAgICAgaWYgKE5DSChjaCkgPT09IDEgfHwgQ0hJTEQoY2gsIDEpLnR5cGUgPT09IFRPSy5UX0NPTU1BKVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTGlzdChzZXFGb3JUZXN0bGlzdChjLCBjaCksIGFzdG5vZGVzLkxvYWQsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybiBhc3RGb3JMaXN0Y29tcChjLCBjaCk7XG4gICAgICAgIGNhc2UgVE9LLlRfTEJSQUNFOlxuICAgICAgICAgICAgLyogZGljdG1ha2VyOiB0ZXN0ICc6JyB0ZXN0ICgnLCcgdGVzdCAnOicgdGVzdCkqIFsnLCddICovXG4gICAgICAgICAgICBjaCA9IENISUxEKG4sIDEpO1xuICAgICAgICAgICAgdmFyIHNpemUgPSBNYXRoLmZsb29yKChOQ0goY2gpICsgMSkgLyA0KTsgLy8gKyAxIGZvciBubyB0cmFpbGluZyBjb21tYSBjYXNlXG4gICAgICAgICAgICB2YXIga2V5cyA9IFtdO1xuICAgICAgICAgICAgdmFyIHZhbHVlcyA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOQ0goY2gpOyBpICs9IDQpIHtcbiAgICAgICAgICAgICAgICBrZXlzW2kgLyA0XSA9IGFzdEZvckV4cHIoYywgQ0hJTEQoY2gsIGkpKTtcbiAgICAgICAgICAgICAgICB2YWx1ZXNbaSAvIDRdID0gYXN0Rm9yRXhwcihjLCBDSElMRChjaCwgaSArIDIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuRGljdChrZXlzLCB2YWx1ZXMsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICBjYXNlIFRPSy5UX0JBQ0tRVU9URTpcbiAgICAgICAgICAgIHRocm93IHN5bnRheEVycm9yKFwiYmFja3F1b3RlIG5vdCBzdXBwb3J0ZWQsIHVzZSByZXByKClcIiwgYy5jX2ZpbGVuYW1lLCBuLmxpbmVubyk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ1bmhhbmRsZWQgYXRvbVwiLCBjaC50eXBlKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFzdEZvclBvd2VyRXhwcihjOiBDb21waWxpbmcsIG46IHBhcnNlci5Ob2RlKTogYXN0bm9kZXMuZXhwciB7XG4gICAgUkVRKG4sIFNZTS5Qb3dlckV4cHIpO1xuICAgIHZhciBlID0gYXN0Rm9yQXRvbUV4cHIoYywgQ0hJTEQobiwgMCkpO1xuICAgIGlmIChOQ0gobikgPT09IDEpIHJldHVybiBlO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgTkNIKG4pOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gQ0hJTEQobiwgaSk7XG4gICAgICAgIGlmIChjaC50eXBlICE9PSBTWU0udHJhaWxlcilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB2YXIgdG1wID0gYXN0Rm9yVHJhaWxlcihjLCBjaCwgZSk7XG4gICAgICAgIHRtcC5saW5lbm8gPSBlLmxpbmVubztcbiAgICAgICAgdG1wLmNvbF9vZmZzZXQgPSBlLmNvbF9vZmZzZXQ7XG4gICAgICAgIGUgPSB0bXA7XG4gICAgfVxuICAgIGlmIChDSElMRChuLCBOQ0gobikgLSAxKS50eXBlID09PSBTWU0uVW5hcnlFeHByKSB7XG4gICAgICAgIHZhciBmID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCBOQ0gobikgLSAxKSk7XG4gICAgICAgIGUgPSBuZXcgYXN0bm9kZXMuQmluT3AoZSwgYXN0bm9kZXMuUG93LCBmLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICB9XG4gICAgcmV0dXJuIGU7XG59XG5cbmZ1bmN0aW9uIGFzdEZvckV4cHIoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLmV4cHIge1xuICAgIExPT1A6IHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHN3aXRjaCAobi50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFNZTS5JZkV4cHI6XG4gICAgICAgICAgICBjYXNlIFNZTS5vbGRfdGVzdDpcbiAgICAgICAgICAgICAgICBpZiAoQ0hJTEQobiwgMCkudHlwZSA9PT0gU1lNLkxhbWJkYUV4cHIgfHwgQ0hJTEQobiwgMCkudHlwZSA9PT0gU1lNLm9sZF9MYW1iZGFFeHByKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXN0Rm9yTGFtYmRlZihjLCBDSElMRChuLCAwKSk7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoTkNIKG4pID4gMSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFzdEZvcklmZXhwcihjLCBuKTtcbiAgICAgICAgICAgIC8vIGZhbGx0aHJvdWdoXG4gICAgICAgICAgICBjYXNlIFNZTS5PckV4cHI6XG4gICAgICAgICAgICBjYXNlIFNZTS5BbmRFeHByOlxuICAgICAgICAgICAgICAgIGlmIChOQ0gobikgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IENISUxEKG4sIDApO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBMT09QO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgc2VxID0gW107XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBOQ0gobik7IGkgKz0gMilcbiAgICAgICAgICAgICAgICAgICAgc2VxW2kgLyAyXSA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgaSkpO1xuICAgICAgICAgICAgICAgIGlmIChDSElMRChuLCAxKS52YWx1ZSA9PT0gXCJhbmRcIilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5Cb29sT3AoYXN0bm9kZXMuQW5kLCBzZXEsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgICAgIGFzc2VydHMuYXNzZXJ0KENISUxEKG4sIDEpLnZhbHVlID09PSBcIm9yXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuQm9vbE9wKGFzdG5vZGVzLk9yLCBzZXEsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgY2FzZSBTWU0uTm90RXhwcjpcbiAgICAgICAgICAgICAgICBpZiAoTkNIKG4pID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWUgTE9PUDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuVW5hcnlPcChhc3Rub2Rlcy5Ob3QsIGFzdEZvckV4cHIoYywgQ0hJTEQobiwgMSkpLCBuLmxpbmVubywgbi5jb2xfb2Zmc2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIFNZTS5Db21wYXJpc29uRXhwcjpcbiAgICAgICAgICAgICAgICBpZiAoTkNIKG4pID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWUgTE9PUDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBvcHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNtcHMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBOQ0gobik7IGkgKz0gMikge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3BzWyhpIC0gMSkgLyAyXSA9IGFzdEZvckNvbXBPcChjLCBDSElMRChuLCBpKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbXBzWyhpIC0gMSkgLyAyXSA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgaSArIDEpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGFzdG5vZGVzLkNvbXBhcmUoYXN0Rm9yRXhwcihjLCBDSElMRChuLCAwKSksIG9wcywgY21wcywgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2FzZSBTWU0uQXJpdGhtZXRpY0V4cHI6XG4gICAgICAgICAgICBjYXNlIFNZTS5HZW9tZXRyaWNFeHByOlxuICAgICAgICAgICAgY2FzZSBTWU0uU2hpZnRFeHByOlxuICAgICAgICAgICAgY2FzZSBTWU0uQml0d2lzZU9yRXhwcjpcbiAgICAgICAgICAgIGNhc2UgU1lNLkJpdHdpc2VYb3JFeHByOlxuICAgICAgICAgICAgY2FzZSBTWU0uQml0d2lzZUFuZEV4cHI6XG4gICAgICAgICAgICAgICAgaWYgKE5DSChuKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBuID0gQ0hJTEQobiwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlIExPT1A7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBhc3RGb3JCaW5vcChjLCBuKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLllpZWxkRXhwcjpcbiAgICAgICAgICAgICAgICB2YXIgZXhwID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoTkNIKG4pID09PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGV4cCA9IGFzdEZvclRlc3RsaXN0KGMsIENISUxEKG4sIDEpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBhc3Rub2Rlcy5ZaWVsZChleHAsIG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgY2FzZSBTWU0uVW5hcnlFeHByOlxuICAgICAgICAgICAgICAgIGlmIChOQ0gobikgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgbiA9IENISUxEKG4sIDApO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZSBMT09QO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYXN0Rm9yVW5hcnlFeHByKGMsIG4pO1xuICAgICAgICAgICAgY2FzZSBTWU0uUG93ZXJFeHByOlxuICAgICAgICAgICAgICAgIHJldHVybiBhc3RGb3JQb3dlckV4cHIoYywgbik7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGFzc2VydHMuZmFpbChcInVuaGFuZGxlZCBleHByXCIsIFwibi50eXBlOiAlZFwiLCBuLnR5cGUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gYXN0Rm9yUHJpbnRTdG10KGM6IENvbXBpbGluZywgbjogcGFyc2VyLk5vZGUpOiBhc3Rub2Rlcy5QcmludCB7XG4gICAgdmFyIHN0YXJ0ID0gMTtcbiAgICB2YXIgZGVzdCA9IG51bGw7XG4gICAgUkVRKG4sIFNZTS5wcmludF9zdG10KTtcbiAgICBpZiAoTkNIKG4pID49IDIgJiYgQ0hJTEQobiwgMSkudHlwZSA9PT0gVE9LLlRfUklHSFRTSElGVCkge1xuICAgICAgICBkZXN0ID0gYXN0Rm9yRXhwcihjLCBDSElMRChuLCAyKSk7XG4gICAgICAgIHN0YXJ0ID0gNDtcbiAgICB9XG4gICAgdmFyIHNlcSA9IFtdO1xuICAgIGZvciAodmFyIGkgPSBzdGFydCwgaiA9IDA7IGkgPCBOQ0gobik7IGkgKz0gMiwgKytqKSB7XG4gICAgICAgIHNlcVtqXSA9IGFzdEZvckV4cHIoYywgQ0hJTEQobiwgaSkpO1xuICAgIH1cbiAgICB2YXIgbmwgPSAoQ0hJTEQobiwgTkNIKG4pIC0gMSkpLnR5cGUgPT09IFRPSy5UX0NPTU1BID8gZmFsc2UgOiB0cnVlO1xuICAgIHJldHVybiBuZXcgYXN0bm9kZXMuUHJpbnQoZGVzdCwgc2VxLCBubCwgbi5saW5lbm8sIG4uY29sX29mZnNldCk7XG59XG5cbmZ1bmN0aW9uIGFzdEZvclN0bXQoYzogQ29tcGlsaW5nLCBuOiBwYXJzZXIuTm9kZSk6IGFzdG5vZGVzLnN0bXQge1xuICAgIGlmIChuLnR5cGUgPT09IFNZTS5zdG10KSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KE5DSChuKSA9PT0gMSk7XG4gICAgICAgIG4gPSBDSElMRChuLCAwKTtcbiAgICB9XG4gICAgaWYgKG4udHlwZSA9PT0gU1lNLnNpbXBsZV9zdG10KSB7XG4gICAgICAgIGFzc2VydHMuYXNzZXJ0KG51bVN0bXRzKG4pID09PSAxKTtcbiAgICAgICAgbiA9IENISUxEKG4sIDApO1xuICAgIH1cbiAgICBpZiAobi50eXBlID09PSBTWU0uc21hbGxfc3RtdCkge1xuICAgICAgICBSRVEobiwgU1lNLnNtYWxsX3N0bXQpO1xuICAgICAgICBuID0gQ0hJTEQobiwgMCk7XG4gICAgICAgIHN3aXRjaCAobi50eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFNZTS5FeHByU3RtdDogcmV0dXJuIGFzdEZvckV4cHJTdG10KGMsIG4pO1xuICAgICAgICAgICAgY2FzZSBTWU0ucHJpbnRfc3RtdDogcmV0dXJuIGFzdEZvclByaW50U3RtdChjLCBuKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLmRlbF9zdG10OiByZXR1cm4gYXN0Rm9yRGVsU3RtdChjLCBuKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLnBhc3Nfc3RtdDogcmV0dXJuIG5ldyBhc3Rub2Rlcy5QYXNzKG4ubGluZW5vLCBuLmNvbF9vZmZzZXQpO1xuICAgICAgICAgICAgY2FzZSBTWU0uZmxvd19zdG10OiByZXR1cm4gYXN0Rm9yRmxvd1N0bXQoYywgbik7XG4gICAgICAgICAgICBjYXNlIFNZTS5pbXBvcnRfc3RtdDogcmV0dXJuIGFzdEZvckltcG9ydFN0bXQoYywgbik7XG4gICAgICAgICAgICBjYXNlIFNZTS5HbG9iYWxTdG10OiByZXR1cm4gYXN0Rm9yR2xvYmFsU3RtdChjLCBuKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLk5vbkxvY2FsU3RtdDogcmV0dXJuIGFzdEZvck5vbkxvY2FsU3RtdChjLCBuKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLmV4ZWNfc3RtdDogcmV0dXJuIGFzdEZvckV4ZWNTdG10KGMsIG4pO1xuICAgICAgICAgICAgY2FzZSBTWU0uYXNzZXJ0X3N0bXQ6IHJldHVybiBhc3RGb3JBc3NlcnRTdG10KGMsIG4pO1xuICAgICAgICAgICAgZGVmYXVsdDogYXNzZXJ0cy5mYWlsKFwidW5oYW5kbGVkIHNtYWxsX3N0bXRcIik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBjaCA9IENISUxEKG4sIDApO1xuICAgICAgICBSRVEobiwgU1lNLmNvbXBvdW5kX3N0bXQpO1xuICAgICAgICBzd2l0Y2ggKGNoLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgU1lNLmlmX3N0bXQ6IHJldHVybiBhc3RGb3JJZlN0bXQoYywgY2gpO1xuICAgICAgICAgICAgY2FzZSBTWU0ud2hpbGVfc3RtdDogcmV0dXJuIGFzdEZvcldoaWxlU3RtdChjLCBjaCk7XG4gICAgICAgICAgICBjYXNlIFNZTS5mb3Jfc3RtdDogcmV0dXJuIGFzdEZvckZvclN0bXQoYywgY2gpO1xuICAgICAgICAgICAgY2FzZSBTWU0udHJ5X3N0bXQ6IHJldHVybiBhc3RGb3JUcnlTdG10KGMsIGNoKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLndpdGhfc3RtdDogcmV0dXJuIGFzdEZvcldpdGhTdG10KGMsIGNoKTtcbiAgICAgICAgICAgIGNhc2UgU1lNLmZ1bmNkZWY6IHJldHVybiBhc3RGb3JGdW5jZGVmKGMsIGNoLCBbXSk7XG4gICAgICAgICAgICBjYXNlIFNZTS5jbGFzc2RlZjogcmV0dXJuIGFzdEZvckNsYXNzZGVmKGMsIGNoLCBbXSk7XG4gICAgICAgICAgICBjYXNlIFNZTS5kZWNvcmF0ZWQ6IHJldHVybiBhc3RGb3JEZWNvcmF0ZWQoYywgY2gpO1xuICAgICAgICAgICAgZGVmYXVsdDogYXNzZXJ0cy5hc3NlcnQoXCJ1bmhhbmRsZWQgY29tcG91bmRfc3RtdFwiKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzdEZyb21QYXJzZShuOiBwYXJzZXIuTm9kZSwgZmlsZW5hbWU6IHN0cmluZykge1xuICAgIHZhciBjID0gbmV3IENvbXBpbGluZyhcInV0Zi04XCIsIGZpbGVuYW1lKTtcblxuICAgIHZhciBzdG10cyA9IFtdO1xuICAgIHZhciBjaDogcGFyc2VyLk5vZGU7XG4gICAgdmFyIGsgPSAwO1xuICAgIHN3aXRjaCAobi50eXBlKSB7XG4gICAgICAgIGNhc2UgU1lNLmZpbGVfaW5wdXQ6XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IE5DSChuKSAtIDE7ICsraSkge1xuICAgICAgICAgICAgICAgIHZhciBjaCA9IENISUxEKG4sIGkpO1xuICAgICAgICAgICAgICAgIGlmIChuLnR5cGUgPT09IFRPSy5UX05FV0xJTkUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIFJFUShjaCwgU1lNLnN0bXQpO1xuICAgICAgICAgICAgICAgIHZhciBudW0gPSBudW1TdG10cyhjaCk7XG4gICAgICAgICAgICAgICAgaWYgKG51bSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBzdG10c1trKytdID0gYXN0Rm9yU3RtdChjLCBjaCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjaCA9IENISUxEKGNoLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgUkVRKGNoLCBTWU0uc2ltcGxlX3N0bXQpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG51bTsgKytqKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzdG10c1trKytdID0gYXN0Rm9yU3RtdChjLCBDSElMRChjaCwgaiAqIDIpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBuZXcgYXN0bm9kZXMuTW9kdWxlKHN0bXRzKTtcbiAgICAgICAgY2FzZSBTWU0uZXZhbF9pbnB1dDpcbiAgICAgICAgICAgIGFzc2VydHMuZmFpbChcInRvZG87XCIpO1xuICAgICAgICBjYXNlIFNZTS5zaW5nbGVfaW5wdXQ6XG4gICAgICAgICAgICBhc3NlcnRzLmZhaWwoXCJ0b2RvO1wiKTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIGFzc2VydHMuZmFpbChcInRvZG87XCIpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBUT0RPOiBXZSdyZSBub3QgZ2VuZXJhdGluZyBfYXN0bmFtZSwgX2lzZW51bSwgX2ZpZWxkcyBhbnltb3JlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXN0RHVtcChub2RlKSB7XG4gICAgdmFyIF9mb3JtYXQgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgIGlmIChub2RlID09PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gXCJOb25lXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobm9kZS5wcm90b3R5cGUgJiYgbm9kZS5wcm90b3R5cGUuX2FzdG5hbWUgIT09IHVuZGVmaW5lZCAmJiBub2RlLnByb3RvdHlwZS5faXNlbnVtKSB7XG4gICAgICAgICAgICByZXR1cm4gbm9kZS5wcm90b3R5cGUuX2FzdG5hbWUgKyBcIigpXCI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobm9kZS5fYXN0bmFtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YXIgZmllbGRzID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGUuX2ZpZWxkcy5sZW5ndGg7IGkgKz0gMikgLy8gaXRlcl9maWVsZHNcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICB2YXIgYSA9IG5vZGUuX2ZpZWxkc1tpXTsgLy8gZmllbGQgbmFtZVxuICAgICAgICAgICAgICAgIHZhciBiID0gbm9kZS5fZmllbGRzW2kgKyAxXShub2RlKTsgLy8gZmllbGQgZ2V0dGVyIGZ1bmNcbiAgICAgICAgICAgICAgICBmaWVsZHMucHVzaChbYSwgX2Zvcm1hdChiKV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGF0dHJzID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZpZWxkcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIHZhciBmaWVsZCA9IGZpZWxkc1tpXTtcbiAgICAgICAgICAgICAgICBhdHRycy5wdXNoKGZpZWxkWzBdICsgXCI9XCIgKyBmaWVsZFsxXS5yZXBsYWNlKC9eXFxzKy8sICcnKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZmllbGRzdHIgPSBhdHRycy5qb2luKCcsJyk7XG4gICAgICAgICAgICByZXR1cm4gbm9kZS5fYXN0bmFtZSArIFwiKFwiICsgZmllbGRzdHIgKyBcIilcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChiYXNlLmlzQXJyYXlMaWtlKG5vZGUpKSB7XG4gICAgICAgICAgICB2YXIgZWxlbXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgICAgIHZhciB4ID0gbm9kZVtpXTtcbiAgICAgICAgICAgICAgICBlbGVtcy5wdXNoKF9mb3JtYXQoeCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGVsZW1zc3RyID0gZWxlbXMuam9pbignLCcpO1xuICAgICAgICAgICAgcmV0dXJuIFwiW1wiICsgZWxlbXNzdHIucmVwbGFjZSgvXlxccysvLCAnJykgKyBcIl1cIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciByZXQ7XG4gICAgICAgICAgICBpZiAobm9kZSA9PT0gdHJ1ZSkgcmV0ID0gXCJUcnVlXCI7XG4gICAgICAgICAgICBlbHNlIGlmIChub2RlID09PSBmYWxzZSkgcmV0ID0gXCJGYWxzZVwiO1xuICAgICAgICAgICAgLy8gICAgICAgICAgZWxzZSBpZiAoU2suZmZpLmlzTG9uZyhub2RlKSkgcmV0ID0gU2suZmZpLnJlbWFwVG9Kcyhub2RlLnRwJHN0cigpKTtcbiAgICAgICAgICAgIC8vICAgICAgICAgIGVsc2UgaWYgKFNrLmJ1aWx0aW4uaXNTdHJpbmdQeShub2RlKSkgcmV0ID0gU2suYnVpbHRpbi5zdHJpbmdUb0pzKG5vZGUudHAkcmVwcigpKTtcbiAgICAgICAgICAgIGVsc2UgcmV0ID0gXCJcIiArIG5vZGU7XG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciB2aXNpdE5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgIHN3aXRjaCAobm9kZS5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Nb2R1bGU6IHtcbiAgICAgICAgICAgICAgICB2YXIgbW9kdWxlOiBhc3Rub2Rlcy5Nb2R1bGUgPSBub2RlO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIk1vZHVsZShib2R5PVwiICsgdmlzaXRTdG10cyhtb2R1bGUuYm9keSkgKyBcIilcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgdmlzaXRTdG10cyA9IGZ1bmN0aW9uKHN0bXRzOiBhc3Rub2Rlcy5zdG10W10pOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gXCJbXCIgKyBzdG10cy5tYXAoZnVuY3Rpb24oc3RtdCkgeyByZXR1cm4gdmlzaXRTdG10KHN0bXQpOyB9KS5qb2luKCcsICcpICsgXCJdXCI7XG4gICAgfTtcblxuICAgIHZhciB2aXNpdFN0bXQgPSBmdW5jdGlvbihzdG10OiBhc3Rub2Rlcy5zdG10KTogc3RyaW5nIHtcbiAgICAgICAgc3dpdGNoIChzdG10LmNvbnN0cnVjdG9yKSB7XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLkZ1bmN0aW9uRGVmOiB7XG4gICAgICAgICAgICAgICAgdmFyIGZ1bmN0aW9uRGVmOiBhc3Rub2Rlcy5GdW5jdGlvbkRlZiA9IDxhc3Rub2Rlcy5GdW5jdGlvbkRlZj5zdG10O1xuICAgICAgICAgICAgICAgIHJldHVybiBcIkZ1bmN0aW9uRGVmKG5hbWU9XCIgKyBmdW5jdGlvbkRlZi5uYW1lICsgXCIsIGxpbmVubz1cIiArIGZ1bmN0aW9uRGVmLmxpbmVubyArIFwiLCBjb2xfb2Zmc2V0PVwiICsgZnVuY3Rpb25EZWYuY29sX29mZnNldCArIFwiLCBib2R5PVwiICsgdmlzaXRTdG10cyhmdW5jdGlvbkRlZi5ib2R5KSArIFwiKVwiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5Bc3NpZ246IHtcbiAgICAgICAgICAgICAgICB2YXIgYXNzaWduOiBhc3Rub2Rlcy5Bc3NpZ24gPSA8YXN0bm9kZXMuQXNzaWduPnN0bXQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiQXNzaWduKHRhcmdldHM9XCIgKyB2aXNpdEV4cHJzKGFzc2lnbi50YXJnZXRzKSArIFwiLCB2YWx1ZT1cIiArIHZpc2l0RXhwcihhc3NpZ24udmFsdWUpICsgXCIsIGxpbmVubz1cIiArIGFzc2lnbi5saW5lbm8gKyBcIiwgY29sX29mZnNldD1cIiArIGFzc2lnbi5jb2xfb2Zmc2V0ICsgXCIpXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXNlIGFzdG5vZGVzLlBhc3M6IHtcbiAgICAgICAgICAgICAgICB2YXIgcGFzczogYXN0bm9kZXMuUGFzcyA9IDxhc3Rub2Rlcy5QYXNzPnN0bXQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIFwiUGFzcygpXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIHZpc2l0RXhwcnMgPSBmdW5jdGlvbihleHByczogYXN0bm9kZXMuZXhwcltdKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIFwiW1wiICsgZXhwcnMubWFwKGZ1bmN0aW9uKGV4cHIpIHsgcmV0dXJuIHZpc2l0RXhwcihleHByKTsgfSkuam9pbignLCAnKSArIFwiXVwiO1xuICAgIH07XG5cbiAgICB2YXIgdmlzaXRFeHByID0gZnVuY3Rpb24oZXhwcjogYXN0bm9kZXMuZXhwcik6IHN0cmluZyB7XG4gICAgICAgIHN3aXRjaCAoZXhwci5jb25zdHJ1Y3Rvcikge1xuICAgICAgICAgICAgY2FzZSBhc3Rub2Rlcy5OYW1lOiB7XG4gICAgICAgICAgICAgICAgdmFyIG5hbWU6IGFzdG5vZGVzLk5hbWUgPSA8YXN0bm9kZXMuTmFtZT5leHByO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIk5hbWUoaWQ9XCIgKyBuYW1lLmlkICsgXCIsIGxpbmVubz1cIiArIG5hbWUubGluZW5vICsgXCIsIGNvbF9vZmZzZXQ9XCIgKyBuYW1lLmNvbF9vZmZzZXQgKyBcIilcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgYXN0bm9kZXMuTnVtOiB7XG4gICAgICAgICAgICAgICAgdmFyIG51bTogYXN0bm9kZXMuTnVtID0gPGFzdG5vZGVzLk51bT5leHByO1xuICAgICAgICAgICAgICAgIHJldHVybiBcIk51bSgpXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIHZpc2l0Tm9kZShub2RlKTtcbn1cbiJdfQ==