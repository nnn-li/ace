import asserts = require('./asserts');
import astnodes = require('./astnodes');
import base = require('./base');
import numericLiteral = require('./numericLiteral');
import parser = require('./Parser');
import tables = require('./tables');
import Tokenizer = require('./Tokenizer');
//
// This is pretty much a straight port of ast.c from CPython 2.6.5.
//
// The previous version was easier to work with and more JS-ish, but having a
// somewhat different ast structure than cpython makes testing more difficult.
//
// This way, we can use a dump from the ast module on any arbitrary python
// code and know that we're the same up to ast level, at least.
//
var ParseTables = tables.ParseTables;
var SYM = ParseTables.sym;
var TOK = Tokenizer.Tokens;

/**
 * @const
 * @type {number}
 */
var LONG_THRESHOLD = Math.pow(2, 53);

/**
 * @param {string} message
 * @param {string} fileName
 * @param {number} lineNumber
 */
function syntaxError(message: string, fileName: string, lineNumber: number) {
    asserts.assert(base.isString(message), "message must be a string");
    asserts.assert(base.isString(fileName), "fileName must be a string");
    asserts.assert(base.isNumber(lineNumber), "lineNumber must be a number");
    var e = new SyntaxError(message/*, fileName*/);
    e['fileName'] = fileName;
    e['lineNumber'] = lineNumber;
    return e;
}

class Compiling {
    public c_encoding: string;
    public c_filename: string;
    constructor(encoding: string, filename: string) {
        this.c_encoding = encoding;
        this.c_filename = filename;
    }
}

/**
 * @return {number}
 */
function NCH(n: parser.Node): number {
    asserts.assert(n !== undefined);
    if (n.children === null) return 0; return n.children.length;
}

function CHILD(n: parser.Node, i): parser.Node {
    asserts.assert(n !== undefined);
    asserts.assert(i !== undefined);
    return n.children[i];
}

function REQ(n: parser.Node, type: number) {
    asserts.assert(n.type === type, "node wasn't expected type");
}

function strobj(s: string): string {
    asserts.assert(typeof s === "string", "expecting string, got " + (typeof s));
    // This previuosly constructed the runtime representation.
    // That may have had an string intern side effect?
    return s;
}

/** @return {number} */
function numStmts(n: parser.Node) {
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
            return Math.floor(NCH(n) / 2); // div 2 is to remove count of ;s
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

function forbiddenCheck(c: Compiling, n: parser.Node, x, lineno: number) {
    if (x === "None") throw syntaxError("assignment to None", c.c_filename, lineno);
    if (x === "True" || x === "False") throw syntaxError("assignment to True or False is forbidden", c.c_filename, lineno);
}

/**
 * Set the context ctx for e, recursively traversing e.
 *
 * Only sets context for expr kinds that can appear in assignment context as
 * per the asdl file.
 */
function setContext(c: Compiling, e, ctx: astnodes.expr_context, n: parser.Node) {
    asserts.assert(ctx !== astnodes.AugStore && ctx !== astnodes.AugLoad);
    var s = null;
    var exprName = null;

    switch (e.constructor) {
        case astnodes.Attribute:
        case astnodes.Name:
            if (ctx === astnodes.Store) forbiddenCheck(c, n, e.attr, n.lineno);
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
(function() {
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
} ());

function getOperator(n: parser.Node) {
    asserts.assert(operatorMap[n.type] !== undefined);
    return operatorMap[n.type];
}

function astForCompOp(c: Compiling, n: parser.Node) {
    /* comp_op: '<'|'>'|'=='|'>='|'<='|'<>'|'!='|'in'|'not' 'in'|'is'
               |'is' 'not'
    */
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
                if (n.value === "in") return astnodes.In_;
                if (n.value === "is") return astnodes.Is;
        }
    }
    else if (NCH(n) === 2) {
        if (CHILD(n, 0).type === TOK.T_NAME) {
            if (CHILD(n, 1).value === "in") return astnodes.NotIn;
            if (CHILD(n, 0).value === "is") return astnodes.IsNot;
        }
    }
    asserts.fail("invalid comp_op");
}

function seqForTestlist(c: Compiling, n: parser.Node): astnodes.expr[] {
    /* testlist: test (',' test)* [','] */
    asserts.assert(n.type === SYM.testlist ||
        n.type === SYM.listmaker ||
        n.type === SYM.testlist_gexp ||
        n.type === SYM.testlist_safe ||
        n.type === SYM.testlist1);
    var seq: astnodes.expr[] = [];
    for (var i = 0; i < NCH(n); i += 2) {
        asserts.assert(CHILD(n, i).type === SYM.IfExpr || CHILD(n, i).type === SYM.old_test);
        seq[i / 2] = astForExpr(c, CHILD(n, i));
    }
    return seq;
}

function astForSuite(c: Compiling, n: parser.Node): astnodes.stmt[] {
    /* suite: simple_stmt | NEWLINE INDENT stmt+ DEDENT */
    REQ(n, SYM.suite);
    var seq: astnodes.stmt[] = [];
    var pos = 0;
    var ch;
    if (CHILD(n, 0).type === SYM.simple_stmt) {
        n = CHILD(n, 0);
        /* simple_stmt always ends with an NEWLINE and may have a trailing
         * SEMI. */
        var end = NCH(n) - 1;
        if (CHILD(n, end - 1).type === TOK.T_SEMI)
            end -= 1;
        for (var i = 0; i < end; i += 2) // by 2 to skip ;
            seq[pos++] = astForStmt(c, CHILD(n, i));
    }
    else {
        for (var i = 2; i < NCH(n) - 1; ++i) {
            ch = CHILD(n, i);
            REQ(ch, SYM.stmt);
            var num = numStmts(ch);
            if (num === 1) {
                // small_stmt or compound_stmt w/ only 1 child
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

function astForExceptClause(c: Compiling, exc: parser.Node, body: parser.Node) {
    /* except_clause: 'except' [test [(',' | 'as') test]] */
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

function astForTryStmt(c: Compiling, n: parser.Node): any {
    var nc = NCH(n);
    var nexcept = (nc - 3) / 3;
    var body, orelse = [], finally_ = null;

    REQ(n, SYM.try_stmt);
    body = astForSuite(c, CHILD(n, 2));
    if (CHILD(n, nc - 3).type === TOK.T_NAME) {
        if (CHILD(n, nc - 3).value === "finally") {
            if (nc >= 9 && CHILD(n, nc - 6).type === TOK.T_NAME) {
                /* we can assume it's an "else",
                   because nc >= 9 for try-else-finally and
                   it would otherwise have a type of except_clause */
                orelse = astForSuite(c, CHILD(n, nc - 4));
                nexcept--;
            }

            finally_ = astForSuite(c, CHILD(n, nc - 1));
            nexcept--;
        }
        else {
            /* we can assume it's an "else",
               otherwise it would have a type of except_clause */
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

        /* if a 'finally' is present too, we nest the TryExcept within a
           TryFinally to emulate try ... except ... finally */
        body = [exceptSt];
    }

    asserts.assert(finally_ !== null);
    return new astnodes.TryFinally(body, finally_, n.lineno, n.col_offset);
}


function astForDottedName(c: Compiling, n: parser.Node): astnodes.expr {
    REQ(n, SYM.dotted_name);
    var lineno = n.lineno;
    var col_offset = n.col_offset;
    var id = strobj(CHILD(n, 0).value);
    var e: any = new astnodes.Name(id, astnodes.Load, lineno, col_offset);
    for (var i = 2; i < NCH(n); i += 2) {
        id = strobj(CHILD(n, i).value);
        e = new astnodes.Attribute(e, id, astnodes.Load, lineno, col_offset);
    }
    return e;
}

function astForDecorator(c: Compiling, n: parser.Node) {
    /* decorator: '@' dotted_name [ '(' [arglist] ')' ] NEWLINE */
    REQ(n, SYM.decorator);
    REQ(CHILD(n, 0), TOK.T_AT);
    REQ(CHILD(n, NCH(n) - 1), TOK.T_NEWLINE);
    var nameExpr = astForDottedName(c, CHILD(n, 1));
    var d;
    if (NCH(n) === 3) // no args
        return nameExpr;
    else if (NCH(n) === 5) // call with no args
        return new astnodes.Call(nameExpr, [], [], null, null, n.lineno, n.col_offset);
    else
        return astForCall(c, CHILD(n, 3), nameExpr);
}

function astForDecorators(c: Compiling, n: parser.Node) {
    REQ(n, SYM.decorators);
    var decoratorSeq: astnodes.expr[] = [];
    for (var i = 0; i < NCH(n); ++i)
        decoratorSeq[i] = astForDecorator(c, CHILD(n, i));
    return decoratorSeq;
}

function astForDecorated(c: Compiling, n: parser.Node) {
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

function astForWithVar(c: Compiling, n: parser.Node) {
    REQ(n, SYM.with_var);
    return astForExpr(c, CHILD(n, 1));
}

function astForWithStmt(c: Compiling, n: parser.Node) {
    /* with_stmt: 'with' test [ with_var ] ':' suite */
    var suiteIndex = 3; // skip with, test, :
    asserts.assert(n.type === SYM.with_stmt);
    var contextExpr = astForExpr(c, CHILD(n, 1));
    if (CHILD(n, 2).type === SYM.with_var) {
        var optionalVars = astForWithVar(c, CHILD(n, 2));
        setContext(c, optionalVars, astnodes.Store, n);
        suiteIndex = 4;
    }
    return new astnodes.With_(contextExpr, optionalVars, astForSuite(c, CHILD(n, suiteIndex)), n.lineno, n.col_offset);
}

function astForExecStmt(c: Compiling, n: parser.Node) {
    var expr1: astnodes.expr;
    var globals = null, locals = null;
    var nchildren = NCH(n);
    asserts.assert(nchildren === 2 || nchildren === 4 || nchildren === 6);

    /* exec_stmt: 'exec' expr ['in' test [',' test]] */
    REQ(n, SYM.exec_stmt);
    var expr1 = astForExpr(c, CHILD(n, 1));
    if (nchildren >= 4)
        globals = astForExpr(c, CHILD(n, 3));
    if (nchildren === 6)
        locals = astForExpr(c, CHILD(n, 5));
    return new astnodes.Exec(expr1, globals, locals, n.lineno, n.col_offset);
}

function astForIfStmt(c: Compiling, n: parser.Node): astnodes.If_ {
    /* if_stmt: 'if' test ':' suite ('elif' test ':' suite)*
       ['else' ':' suite]
    */
    REQ(n, SYM.if_stmt);
    if (NCH(n) === 4)
        return new astnodes.If_(
            astForExpr(c, CHILD(n, 1)),
            astForSuite(c, CHILD(n, 3)),
            [], n.lineno, n.col_offset);

    var s = CHILD(n, 4).value;
    var decider = s.charAt(2); // elSe or elIf
    if (decider === 's') {
        return new astnodes.If_(
            astForExpr(c, CHILD(n, 1)),
            astForSuite(c, CHILD(n, 3)),
            astForSuite(c, CHILD(n, 6)),
            n.lineno, n.col_offset);
    }
    else if (decider === 'i') {
        var nElif = NCH(n) - 4;
        var hasElse = false;
        var orelse = [];
        /* must reference the child nElif+1 since 'else' token is third, not
         * fourth child from the end. */
        if (CHILD(n, nElif + 1).type === TOK.T_NAME && CHILD(n, nElif + 1).value.charAt(2) === 's') {
            hasElse = true;
            nElif -= 3;
        }
        nElif /= 4;

        if (hasElse) {
            orelse = [
                new astnodes.If_(
                    astForExpr(c, CHILD(n, NCH(n) - 6)),
                    astForSuite(c, CHILD(n, NCH(n) - 4)),
                    astForSuite(c, CHILD(n, NCH(n) - 1)),
                    CHILD(n, NCH(n) - 6).lineno,
                    CHILD(n, NCH(n) - 6).col_offset)];
            nElif--;
        }

        for (var i = 0; i < nElif; ++i) {
            var off = 5 + (nElif - i - 1) * 4;
            orelse = [
                new astnodes.If_(
                    astForExpr(c, CHILD(n, off)),
                    astForSuite(c, CHILD(n, off + 2)),
                    orelse,
                    CHILD(n, off).lineno,
                    CHILD(n, off).col_offset)];
        }
        return new astnodes.If_(
            astForExpr(c, CHILD(n, 1)),
            astForSuite(c, CHILD(n, 3)),
            orelse, n.lineno, n.col_offset);
    }
    asserts.fail("unexpected token in 'if' statement");
}

function astForExprlist(c: Compiling, n: parser.Node, context) {
    REQ(n, SYM.ExprList);
    var seq = [];
    for (var i = 0; i < NCH(n); i += 2) {
        var e = astForExpr(c, CHILD(n, i));
        seq[i / 2] = e;
        if (context) setContext(c, e, context, CHILD(n, i));
    }
    return seq;
}

function astForDelStmt(c: Compiling, n: parser.Node) {
    REQ(n, SYM.del_stmt);
    return new astnodes.Delete_(astForExprlist(c, CHILD(n, 1), astnodes.Del), n.lineno, n.col_offset);
}

function astForGlobalStmt(c: Compiling, n: parser.Node) {
    REQ(n, SYM.GlobalStmt);
    var s = [];
    for (var i = 1; i < NCH(n); i += 2) {
        s[(i - 1) / 2] = strobj(CHILD(n, i).value);
    }
    return new astnodes.Global(s, n.lineno, n.col_offset);
}

function astForNonLocalStmt(c: Compiling, n: parser.Node) {
    REQ(n, SYM.NonLocalStmt);
    var s = [];
    for (var i = 1; i < NCH(n); i += 2) {
        s[(i - 1) / 2] = strobj(CHILD(n, i).value);
    }
    return new astnodes.NonLocal(s, n.lineno, n.col_offset);
}

function astForAssertStmt(c: Compiling, n: parser.Node) {
    /* assert_stmt: 'assert' test [',' test] */
    REQ(n, SYM.assert_stmt);
    if (NCH(n) === 2)
        return new astnodes.Assert(astForExpr(c, CHILD(n, 1)), null, n.lineno, n.col_offset);
    else if (NCH(n) === 4)
        return new astnodes.Assert(astForExpr(c, CHILD(n, 1)), astForExpr(c, CHILD(n, 3)), n.lineno, n.col_offset);
    asserts.fail("improper number of parts to assert stmt");
}

function aliasForImportName(c: Compiling, n: parser.Node) {
    /*
      import_as_name: NAME ['as' NAME]
      dotted_as_name: dotted_name ['as' NAME]
      dotted_name: NAME ('.' NAME)*
    */

    loop: while (true) {
        switch (n.type) {
            case SYM.import_as_name:
                var str: string = null;
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
                    // create a string of the form a.b.c
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

function astForImportStmt(c: Compiling, n: parser.Node) {
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
        ++idx; // skip the import keyword
        switch (CHILD(n, idx).type) {
            case TOK.T_STAR:
                // from ... import
                n = CHILD(n, idx);
                nchildren = 1;
                break;
            case TOK.T_LPAR:
                // from ... import (x, y, z)
                n = CHILD(n, idx + 1);
                nchildren = NCH(n);
                break;
            case SYM.import_as_names:
                // from ... import x, y, z
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

function astForTestlistGexp(c: Compiling, n: parser.Node) {
    asserts.assert(n.type === SYM.testlist_gexp || n.type === SYM.argument);
    if (NCH(n) > 1 && CHILD(n, 1).type === SYM.gen_for)
        return astForGenexp(c, n);
    return astForTestlist(c, n);
}

function astForListcomp(c: Compiling, n: parser.Node) {
    function countListFors(c, n: parser.Node) {
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

    function countListIfs(c: Compiling, n: parser.Node) {
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

function astForUnaryExpr(c: Compiling, n: parser.Node) {
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

function astForForStmt(c: Compiling, n: parser.Node): astnodes.For_ {
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

    return new astnodes.For_(target,
        astForTestlist(c, CHILD(n, 3)),
        astForSuite(c, CHILD(n, 5)),
        seq, n.lineno, n.col_offset);
}

function astForCall(c: Compiling, n: parser.Node, func: astnodes.expr) {
    /*
      arglist: (argument ',')* (argument [',']| '*' test [',' '**' test]
               | '**' test)
      argument: [test '='] test [gen_for]        # Really [keyword '='] test
    */
    REQ(n, SYM.arglist);
    var nargs = 0;
    var nkeywords = 0;
    var ngens = 0;
    for (var i = 0; i < NCH(n); ++i) {
        var ch = CHILD(n, i);
        if (ch.type === SYM.argument) {
            if (NCH(ch) === 1) nargs++;
            else if (CHILD(ch, 1).type === SYM.gen_for) ngens++;
            else nkeywords++;
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
                if (nkeywords) throw syntaxError("non-keyword arg after keyword arg", c.c_filename, n.lineno);
                if (vararg) throw syntaxError("only named arguments may follow *expression", c.c_filename, n.lineno);
                args[nargs++] = astForExpr(c, CHILD(ch, 0));
            }
            else if (CHILD(ch, 1).type === SYM.gen_for)
                args[nargs++] = astForGenexp(c, ch);
            else {
                var e = astForExpr(c, CHILD(ch, 0));
                if (e.constructor === astnodes.Lambda) throw syntaxError("lambda cannot contain assignment", c.c_filename, n.lineno);
                else if (e.constructor !== astnodes.Name) throw syntaxError("keyword can't be an expression", c.c_filename, n.lineno);
                var key = (<astnodes.Name>e).id;
                forbiddenCheck(c, CHILD(ch, 0), key, n.lineno);
                for (var k = 0; k < nkeywords; ++k) {
                    var tmp = keywords[k].arg;
                    if (tmp === key) throw syntaxError("keyword argument repeated", c.c_filename, n.lineno);
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

function astForTrailer(c, n: parser.Node, leftExpr: astnodes.expr): astnodes.expr {
    /* trailer: '(' [arglist] ')' | '[' subscriptlist ']' | '.' NAME
       subscriptlist: subscript (',' subscript)* [',']
       subscript: '.' '.' '.' | test | [test] ':' [test] [sliceop]
     */
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
            /* The grammar is ambiguous here. The ambiguity is resolved
               by treating the sequence as a tuple literal if there are
               no slice features.
            */
            var simple = true;
            var slices: astnodes.slice[] = [];
            for (var j = 0; j < NCH(n); j += 2) {
                var slc: astnodes.slice = astForSlice(c, CHILD(n, j));
                if (slc.constructor !== astnodes.Index)
                    simple = false;
                slices[j / 2] = slc;
            }
            if (!simple) {
                return new astnodes.Subscript(leftExpr, new astnodes.ExtSlice(slices), astnodes.Load, n.lineno, n.col_offset);
            }
            var elts: astnodes.expr[] = [];
            for (var j = 0; j < slices.length; ++j) {
                var slc: astnodes.slice = slices[j];
                asserts.assert(slc.constructor === astnodes.Index && (<astnodes.Index>slc).value !== null && (<astnodes.Index>slc).value !== undefined);
                elts[j] = (<astnodes.Index>slc).value;
            }
            var e = new astnodes.Tuple(elts, astnodes.Load, n.lineno, n.col_offset);
            return new astnodes.Subscript(leftExpr, new astnodes.Index(e), astnodes.Load, n.lineno, n.col_offset);
        }
    }
}

function astForFlowStmt(c: Compiling, n: parser.Node) {
    var ch: parser.Node;
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
                return new astnodes.Raise(
                    astForExpr(c, CHILD(ch, 1)),
                    astForExpr(c, CHILD(ch, 3)),
                    null, n.lineno, n.col_offset);
            else if (NCH(ch) === 6)
                return new astnodes.Raise(
                    astForExpr(c, CHILD(ch, 1)),
                    astForExpr(c, CHILD(ch, 3)),
                    astForExpr(c, CHILD(ch, 5)),
                    n.lineno, n.col_offset);
        default:
            asserts.fail("unexpected flow_stmt");
    }
    asserts.fail("unhandled flow statement");
}

function astForArguments(c: Compiling, n: parser.Node) {
    /* parameters: '(' [varargslist] ')'
       varargslist: (fpdef ['=' test] ',')* ('*' NAME [',' '**' NAME]
            | '**' NAME) | fpdef ['=' test] (',' fpdef ['=' test])* [',']
    */
    var ch;
    var vararg = null;
    var kwarg = null;
    if (n.type === SYM.parameters) {
        if (NCH(n) === 2) // () as arglist
            return new astnodes.Arguments([], null, null, []);
        n = CHILD(n, 1);
    }
    REQ(n, SYM.varargslist);

    var args = [];
    var defaults = [];

    /* fpdef: NAME | '(' fplist ')'
       fplist: fpdef (',' fpdef)* [',']
    */
    var foundDefault = false;
    var i = 0;
    var j = 0; // index for defaults
    var k = 0; // index for args
    while (i < NCH(n)) {
        ch = CHILD(n, i);
        switch (ch.type) {
            case SYM.fpdef:
                var complexArgs = 0;
                var parenthesized: boolean = false;
                handle_fpdef: while (true) {
                    if (i + 1 < NCH(n) && CHILD(n, i + 1).type === TOK.T_EQUAL) {
                        defaults[j++] = astForExpr(c, CHILD(n, i + 2));
                        i += 2;
                        foundDefault = true;
                    }
                    else if (foundDefault) {
                        /* def f((x)=4): pass should raise an error.
                           def f((x, (y))): pass will just incur the tuple unpacking warning. */
                        if (parenthesized && !complexArgs)
                            throw syntaxError("parenthesized arg with default", c.c_filename, n.lineno);
                        throw syntaxError("non-default argument follows default argument", c.c_filename, n.lineno);
                    }

                    if (NCH(ch) === 3) {
                        ch = CHILD(ch, 1);
                        // def foo((x)): is not complex, special case.
                        if (NCH(ch) !== 1) {
                            throw syntaxError("tuple parameter unpacking has been removed", c.c_filename, n.lineno);
                        }
                        else {
                            /* def foo((x)): setup for checking NAME below. */
                            /* Loop because there can be many parens and tuple
                               unpacking mixed in. */
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

function astForFuncdef(c: Compiling, n: parser.Node, decoratorSeq: astnodes.stmt[]) {
    /* funcdef: 'def' NAME parameters ':' suite */
    REQ(n, SYM.funcdef);
    var name = strobj(CHILD(n, 1).value);
    forbiddenCheck(c, CHILD(n, 1), CHILD(n, 1).value, n.lineno);
    var args = astForArguments(c, CHILD(n, 2));
    var body = astForSuite(c, CHILD(n, 4));
    return new astnodes.FunctionDef(name, args, body, decoratorSeq, n.lineno, n.col_offset);
}

function astForClassBases(c: Compiling, n: parser.Node): astnodes.expr[] {
    asserts.assert(NCH(n) > 0);
    REQ(n, SYM.testlist);
    if (NCH(n) === 1)
        return [astForExpr(c, CHILD(n, 0))];
    return seqForTestlist(c, n);
}

function astForClassdef(c: Compiling, n: parser.Node, decoratorSeq) {
    REQ(n, SYM.classdef);
    forbiddenCheck(c, n, CHILD(n, 1).value, n.lineno);
    var classname: string = strobj(CHILD(n, 1).value);
    if (NCH(n) === 4)
        return new astnodes.ClassDef(classname, [], astForSuite(c, CHILD(n, 3)), decoratorSeq, n.lineno, n.col_offset);
    if (CHILD(n, 3).type === TOK.T_RPAR)
        return new astnodes.ClassDef(classname, [], astForSuite(c, CHILD(n, 5)), decoratorSeq, n.lineno, n.col_offset);

    var bases = astForClassBases(c, CHILD(n, 3));
    var s = astForSuite(c, CHILD(n, 6));
    return new astnodes.ClassDef(classname, bases, s, decoratorSeq, n.lineno, n.col_offset);
}

function astForLambdef(c: Compiling, n: parser.Node): astnodes.Lambda {
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

function astForGenexp(c: Compiling, n: parser.Node) {
    /* testlist_gexp: test ( gen_for | (',' test)* [','] )
       argument: [test '='] test [gen_for]       # Really [keyword '='] test */
    asserts.assert(n.type === SYM.testlist_gexp || n.type === SYM.argument);
    asserts.assert(NCH(n) > 1);

    function countGenFors(c: Compiling, n: parser.Node) {
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

    function countGenIfs(c: Compiling, n: parser.Node) {
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

function astForWhileStmt(c: Compiling, n: parser.Node) {
    /* while_stmt: 'while' test ':' suite ['else' ':' suite] */
    REQ(n, SYM.while_stmt);
    if (NCH(n) === 4)
        return new astnodes.While_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), [], n.lineno, n.col_offset);
    else if (NCH(n) === 7)
        return new astnodes.While_(astForExpr(c, CHILD(n, 1)), astForSuite(c, CHILD(n, 3)), astForSuite(c, CHILD(n, 6)), n.lineno, n.col_offset);
    asserts.fail("wrong number of tokens for 'while' stmt");
}

function astForAugassign(c: Compiling, n: parser.Node) {
    REQ(n, SYM.augassign);
    n = CHILD(n, 0);
    switch (n.value.charAt(0)) {
        case '+': return astnodes.Add;
        case '-': return astnodes.Sub;
        case '/': if (n.value.charAt(1) === '/') return astnodes.FloorDiv;
            return astnodes.Div;
        case '%': return astnodes.Mod;
        case '<': return astnodes.LShift;
        case '>': return astnodes.RShift;
        case '&': return astnodes.BitAnd;
        case '^': return astnodes.BitXor;
        case '|': return astnodes.BitOr;
        case '*': if (n.value.charAt(1) === '*') return astnodes.Pow;
            return astnodes.Mult;
        default: asserts.fail("invalid augassign");
    }
}

function astForBinop(c: Compiling, n: parser.Node) {
    /* Must account for a sequence of expressions.
        How should A op B op C by represented?
        BinOp(BinOp(A, op, B), op, C).
    */
    var result = new astnodes.BinOp(
        astForExpr(c, CHILD(n, 0)),
        getOperator(CHILD(n, 1)),
        astForExpr(c, CHILD(n, 2)),
        n.lineno, n.col_offset);
    var nops = (NCH(n) - 1) / 2;
    for (var i = 1; i < nops; ++i) {
        var nextOper = CHILD(n, i * 2 + 1);
        var newoperator = getOperator(nextOper);
        var tmp = astForExpr(c, CHILD(n, i * 2 + 2));
        result = new astnodes.BinOp(result, newoperator, tmp, nextOper.lineno, nextOper.col_offset);
    }
    return result;

}

function astForTestlist(c: Compiling, n: parser.Node) {
    /* testlist_gexp: test (',' test)* [','] */
    /* testlist: test (',' test)* [','] */
    /* testlist_safe: test (',' test)+ [','] */
    /* testlist1: test (',' test)* */
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

function astForExprStmt(c: Compiling, n: parser.Node) {
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
                var varName = (<astnodes.Name>expr1).id;
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
        // normal assignment
        REQ(CHILD(n, 1), TOK.T_EQUAL);
        var targets = [];
        for (var i = 0; i < NCH(n) - 2; i += 2) {
            var ch = CHILD(n, i);
            if (ch.type === SYM.YieldExpr) throw syntaxError("assignment to yield expression not possible", c.c_filename, n.lineno);
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

function astForIfexpr(c: Compiling, n: parser.Node) {
    asserts.assert(NCH(n) === 5);
    return new astnodes.IfExp(
        astForExpr(c, CHILD(n, 2)),
        astForExpr(c, CHILD(n, 0)),
        astForExpr(c, CHILD(n, 4)),
        n.lineno, n.col_offset);
}

/**
 * s is a python-style string literal, including quote characters and u/r/b
 * prefixes. Returns decoded string object.
 */
function parsestr(c: Compiling, s: string) {
    // unescape and escape are deprecated since ECMAScript v3. 
    //  var encodeUtf8 = function(s) { return unescape(encodeURIComponent(s)); };
    //  var decodeUtf8 = function(s) { return decodeURIComponent(escape(s)); };
    var decodeUtf8 = function(s) { return decodeURI(s) };
    var decodeEscape = function(s, quote) {
        var len = s.length;
        var ret = '';
        for (var i = 0; i < len; ++i) {
            var c = s.charAt(i);
            if (c === '\\') {
                ++i;
                c = s.charAt(i);
                if (c === 'n') ret += "\n";
                else if (c === '\\') ret += "\\";
                else if (c === 't') ret += "\t";
                else if (c === 'r') ret += "\r";
                else if (c === 'b') ret += "\b";
                else if (c === 'f') ret += "\f";
                else if (c === 'v') ret += "\v";
                else if (c === '0') ret += "\0";
                else if (c === '"') ret += '"';
                else if (c === '\'') ret += '\'';
                else if (c === '\n') /* escaped newline, join lines */ { }
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
                    // Leave it alone
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

/**
 * @return {string}
 */
function parsestrplus(c: Compiling, n: parser.Node) {
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

function parsenumber(c: Compiling, s, lineno: number): any {
    var end = s.charAt(s.length - 1);

    if (end === 'j' || end === 'J') {
        throw syntaxError("complex numbers are currently unsupported", c.c_filename, lineno);
    }

    if (s.indexOf('.') !== -1) {
        return numericLiteral.floatAST(s);
    }

    // Handle integers of various bases
    var tmp = s;
    var value;
    var radix = 10;
    var neg = false;
    if (s.charAt(0) === '-') {
        tmp = s.substr(1);
        neg = true;
    }

    if (tmp.charAt(0) === '0' && (tmp.charAt(1) === 'x' || tmp.charAt(1) === 'X')) {
        // Hex
        tmp = tmp.substring(2);
        value = parseInt(tmp, 16);
        radix = 16;
    }
    else if ((s.indexOf('e') !== -1) || (s.indexOf('E') !== -1)) {
        // Float with exponent (needed to make sure e/E wasn't hex first)
        return numericLiteral.floatAST(s);
    }
    else if (tmp.charAt(0) === '0' && (tmp.charAt(1) === 'b' || tmp.charAt(1) === 'B')) {
        // Binary
        tmp = tmp.substring(2);
        value = parseInt(tmp, 2);
        radix = 2;
    }
    else if (tmp.charAt(0) === '0') {
        if (tmp === "0") {
            // Zero
            value = 0;
        }
        else {
            // Octal (Leading zero, but not actually zero)
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
        // Decimal
        if (end === 'l' || end === 'L') {
            return numericLiteral.longAST(s.substr(0, s.length - 1), radix);
        }
        else {
            value = parseInt(tmp, radix);
        }
    }

    // Convert to long
    if (value > LONG_THRESHOLD && Math.floor(value) === value && (s.indexOf('e') === -1 && s.indexOf('E') === -1)) {
        // TODO: Does radix zero make sense?
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

function astForSlice(c: Compiling, n: parser.Node): astnodes.slice {
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

function astForAtomExpr(c: Compiling, n: parser.Node): astnodes.expr {
    var ch = CHILD(n, 0);
    switch (ch.type) {
        case TOK.T_NAME:
            // All names start in astnodes.Load context, but may be changed later
            return new astnodes.Name(strobj(ch.value), astnodes.Load, n.lineno, n.col_offset);
        case TOK.T_STRING:
            return new astnodes.Str(parsestrplus(c, n), n.lineno, n.col_offset);
        case TOK.T_NUMBER:
            return new astnodes.Num(parsenumber(c, ch.value, n.lineno), n.lineno, n.col_offset);
        case TOK.T_LPAR: // various uses for parens
            ch = CHILD(n, 1);
            if (ch.type === TOK.T_RPAR)
                return new astnodes.Tuple([], astnodes.Load, n.lineno, n.col_offset);
            if (ch.type === SYM.YieldExpr)
                return astForExpr(c, ch);
            if (NCH(ch) > 1 && CHILD(ch, 1).type === SYM.gen_for)
                return astForGenexp(c, ch);
            return astForTestlistGexp(c, ch);
        case TOK.T_LSQB: // list or listcomp
            ch = CHILD(n, 1);
            if (ch.type === TOK.T_RSQB)
                return new astnodes.List([], astnodes.Load, n.lineno, n.col_offset);
            REQ(ch, SYM.listmaker);
            if (NCH(ch) === 1 || CHILD(ch, 1).type === TOK.T_COMMA)
                return new astnodes.List(seqForTestlist(c, ch), astnodes.Load, n.lineno, n.col_offset);
            else
                return astForListcomp(c, ch);
        case TOK.T_LBRACE:
            /* dictmaker: test ':' test (',' test ':' test)* [','] */
            ch = CHILD(n, 1);
            var size = Math.floor((NCH(ch) + 1) / 4); // + 1 for no trailing comma case
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

function astForPowerExpr(c: Compiling, n: parser.Node): astnodes.expr {
    REQ(n, SYM.PowerExpr);
    var e = astForAtomExpr(c, CHILD(n, 0));
    if (NCH(n) === 1) return e;
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

function astForExpr(c: Compiling, n: parser.Node): astnodes.expr {
    LOOP: while (true) {
        switch (n.type) {
            case SYM.IfExpr:
            case SYM.old_test:
                if (CHILD(n, 0).type === SYM.LambdaExpr || CHILD(n, 0).type === SYM.old_LambdaExpr)
                    return astForLambdef(c, CHILD(n, 0));
                else if (NCH(n) > 1)
                    return astForIfexpr(c, n);
            // fallthrough
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

function astForPrintStmt(c: Compiling, n: parser.Node): astnodes.Print {
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

function astForStmt(c: Compiling, n: parser.Node): astnodes.stmt {
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

export function astFromParse(n: parser.Node, filename: string) {
    var c = new Compiling("utf-8", filename);

    var stmts = [];
    var ch: parser.Node;
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

/**
 * TODO: We're not generating _astname, _isenum, _fields anymore.
 */
export function astDump(node) {
    var _format = function(node) {
        if (node === null) {
            return "None";
        }
        else if (node.prototype && node.prototype._astname !== undefined && node.prototype._isenum) {
            return node.prototype._astname + "()";
        }
        else if (node._astname !== undefined) {
            var fields = [];
            for (var i = 0; i < node._fields.length; i += 2) // iter_fields
            {
                var a = node._fields[i]; // field name
                var b = node._fields[i + 1](node); // field getter func
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
            if (node === true) ret = "True";
            else if (node === false) ret = "False";
            //          else if (Sk.ffi.isLong(node)) ret = Sk.ffi.remapToJs(node.tp$str());
            //          else if (Sk.builtin.isStringPy(node)) ret = Sk.builtin.stringToJs(node.tp$repr());
            else ret = "" + node;
            return ret;
        }
    };

    var visitNode = function(node) {
        switch (node.constructor) {
            case astnodes.Module: {
                var module: astnodes.Module = node;
                return "Module(body=" + visitStmts(module.body) + ")";
            }
                break;
            default: {
            }
        }
    };

    var visitStmts = function(stmts: astnodes.stmt[]): string {
        return "[" + stmts.map(function(stmt) { return visitStmt(stmt); }).join(', ') + "]";
    };

    var visitStmt = function(stmt: astnodes.stmt): string {
        switch (stmt.constructor) {
            case astnodes.FunctionDef: {
                var functionDef: astnodes.FunctionDef = <astnodes.FunctionDef>stmt;
                return "FunctionDef(name=" + functionDef.name + ", lineno=" + functionDef.lineno + ", col_offset=" + functionDef.col_offset + ", body=" + visitStmts(functionDef.body) + ")";
            }
                break;
            case astnodes.Assign: {
                var assign: astnodes.Assign = <astnodes.Assign>stmt;
                return "Assign(targets=" + visitExprs(assign.targets) + ", value=" + visitExpr(assign.value) + ", lineno=" + assign.lineno + ", col_offset=" + assign.col_offset + ")";
            }
            case astnodes.Pass: {
                var pass: astnodes.Pass = <astnodes.Pass>stmt;
                return "Pass()";
            }
                break;
            default: {
            }
        }
    };

    var visitExprs = function(exprs: astnodes.expr[]): string {
        return "[" + exprs.map(function(expr) { return visitExpr(expr); }).join(', ') + "]";
    };

    var visitExpr = function(expr: astnodes.expr): string {
        switch (expr.constructor) {
            case astnodes.Name: {
                var name: astnodes.Name = <astnodes.Name>expr;
                return "Name(id=" + name.id + ", lineno=" + name.lineno + ", col_offset=" + name.col_offset + ")";
            }
                break;
            case astnodes.Num: {
                var num: astnodes.Num = <astnodes.Num>expr;
                return "Num()";
            }
                break;
            default: {
            }
        }
    };

    return visitNode(node);
}
