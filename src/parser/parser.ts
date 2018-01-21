import { operators } from "../constants";
import { parseSignature } from "../signatures";
import { tokenizer, Tokenizer, Token } from "../tokenizer";
import { isNumeric } from "../utils";
import { ast_optimize } from "./optimize";
import { ErrorCollector } from "./errors";
import * as ast from "./ast";
import * as nuds from "./nuds";
import * as leds from "./leds";

import { NUD, LED, Symbol, ParserState } from "./types";

// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6
export function parser(source, recover?: boolean) {
    var current: ParserState = {
        symbol: undefined,
        token: undefined,
        previousToken: undefined,
        error: undefined,
        advance: advance2,
        expression: expression2,
        handleError: handleError2,
    };
    var lexer: Tokenizer;

    var remainingTokens = () => {
        var remaining: Token[] = [];
        if (current.symbol.id !== "(end)") {
            remaining.push(current.token);
        }
        var nxt: Token = lexer(undefined);
        while (nxt !== null) {
            remaining.push(nxt);
            nxt = lexer(undefined);
        }
        return remaining;
    };

    function createTable(): { [id: string]: Symbol } {
        let symbol_table: { [id: string]: Symbol } = {};

        var getSymbol = (id, bp: number): Symbol => {
            bp = bp || 0;
            if (symbol_table.hasOwnProperty(id)) {
                let s = symbol_table[id];
                // TODO: Should this ever happen?!?  Aren't we overwriting something?!?
                if (bp >= s.lbp) {
                    s.lbp = bp;
                }
                return s;
            } else {
                let s: Symbol = {
                    id: id,
                    lbp: bp,
                    value: id,
                    nud: nuds.defaultNUD(recover, errors, remainingTokens),
                };
                symbol_table[id] = s;
                return s;
            }
        };

        // A terminal could be a 'literal', 'variable', 'name'
        var terminal = id => {
            var s = getSymbol(id, 0);
            s.nud = nuds.terminalNUD;
        };

        // match infix operators
        // <expression> <operator> <expression>
        // left associative
        // TODO: Add default values for bp and led
        var infix = (id: string, bp?: number, led?: LED) => {
            var bindingPower = bp || operators[id];
            var s = getSymbol(id, bindingPower);
            let defaultLED: LED = leds.infixDefaultLED(bindingPower);
            s.led = led || defaultLED;
            return s;
        };

        // match infix operators
        // <expression> <operator> <expression>
        // right associative
        // TODO: Add default values for bp and led
        var infixr = (id, bp?, led?: LED) => {
            var bindingPower = bp || operators[id];
            var s = getSymbol(id, bindingPower);
            let defaultLED: LED = leds.infixDefaultLED(bindingPower - 1); // subtract 1 from bindingPower for right associative operators
            s.led = led || defaultLED;
            return s;
        };

        // match prefix operators
        // <operator> <expression>
        var prefix = (id, nud?: NUD) => {
            var s = getSymbol(id, 0);
            let defaultNUD: NUD = nuds.prefixDefaultNUD(70);
            s.nud = nud || defaultNUD;
            return s;
        };

        terminal("(end)");
        terminal("(name)");
        terminal("(literal)");
        terminal("(regex)");
        getSymbol(":", 0);
        getSymbol(";", 0);
        getSymbol(",", 0);
        getSymbol(")", 0);
        getSymbol("]", 0);
        getSymbol("}", 0);
        getSymbol("..", 0); // range operator
        infix("."); // field reference
        infix("+"); // numeric addition
        infix("-"); // numeric subtraction
        infix("*"); // numeric multiplication
        infix("/"); // numeric division
        infix("%"); // numeric modulus
        infix("="); // equality
        infix("<"); // less than
        infix(">"); // greater than
        infix("!="); // not equal to
        infix("<="); // less than or equal
        infix(">="); // greater than or equal
        infix("&"); // string concatenation
        infix("and"); // Boolean AND
        infix("or"); // Boolean OR
        infix("in"); // is member of array
        terminal("and"); // the 'keywords' can also be used as terminals (field names)
        terminal("or"); //
        terminal("in"); //
        infixr(":="); // bind variable
        prefix("-"); // unary numeric negation
        infix("~>"); // function application

        infixr("(error)", 10, (state: ParserState, left: ast.ASTNode): ast.ErrorNode => {
            return {
                value: state.token.value,
                lhs: left,
                error: state.error,
                remaining: remainingTokens(),
                type: "error",
            };
        });

        // field wildcard (single level)
        prefix("*", nuds.wildcardNUD);

        // descendant wildcard (multi-level)
        prefix("**", nuds.descendantNUD);

        // function invocation
        infix("(", operators["("], leds.functionLED);

        // parenthesis - block expression
        prefix("(", nuds.blockNUD);

        // array constructor
        prefix("[", nuds.arrayNUD);

        // filter - predicate or array index
        infix("[", operators["["], leds.filterLED);

        // order-by
        infix("^", operators["^"], leds.orderByLED);

        // object constructor
        prefix("{", nuds.objectParserNUD);

        // object grouping
        infix("{", operators["{"], leds.objectParserLED);

        // if/then/else ternary operator ?:
        infix("?", operators["?"], (state: ParserState, left): ast.TernaryNode => {
            let initialToken = state.previousToken;
            let then = state.expression(0);
            let otherwise = undefined;
            if (state.symbol.id === ":") {
                // else condition
                state.advance(":");
                otherwise = state.expression(0);
            }
            return {
                value: initialToken.value,
                type: "condition",
                condition: left,
                then: then,
                else: otherwise,
            };
        });

        // object transformer
        prefix("|", nuds.transformerNUD);

        return symbol_table;
    }

    var errors = [];
    let symbol_table = createTable();

    var handleError2 = (err): void => {
        if (recover) {
            // tokenize the rest of the buffer and add it to an error token
            err.remaining = remainingTokens();
            errors.push(err);
            var symbol = symbol_table["(error)"];
            current.symbol = Object.create(symbol);
            current.previousToken = current.token;
            current.token = {
                type: "(error)",
                value: null,
                position: current.token.position,
            };
            current.error = err;
        } else {
            err.stack = new Error().stack;
            throw err;
        }
    };

    // TODO: Add types
    var advance2 = (id?: string, infix?: boolean): void => {
        if (id && current.symbol.id !== id) {
            var code;
            if (current.symbol.id === "(end)") {
                // unexpected end of buffer
                code = "S0203";
            } else {
                code = "S0202";
            }
            var err = {
                code: code,
                position: current.token.position,
                token: current.token.value,
                value: id,
            };
            return handleError2(err);
        }
        var next_token: Token = lexer(infix);
        if (next_token === null) {
            let symbol = symbol_table["(end)"];
            current.symbol = Object.create(symbol);
            current.previousToken = current.token;
            current.token = {
                type: "(end)",
                value: symbol.value,
                position: source.length,
            };
            current.error = undefined;
            return;
        }
        var value = next_token.value;
        var type = next_token.type;
        var symbol;
        switch (type) {
            case "name":
            case "variable":
                symbol = symbol_table["(name)"];
                break;
            case "operator":
                symbol = symbol_table[value];
                if (!symbol) {
                    return handleError2({
                        code: "S0204",
                        stack: new Error().stack,
                        position: next_token.position,
                        token: value,
                    });
                }
                break;
            case "string":
            case "number":
            case "value":
                type = "literal";
                symbol = symbol_table["(literal)"];
                break;
            case "regex":
                type = "regex";
                symbol = symbol_table["(regex)"];
                break;
            /* istanbul ignore next */
            default:
                return handleError2({
                    code: "S0205",
                    stack: new Error().stack,
                    position: next_token.position,
                    token: value,
                });
        }

        current.symbol = Object.create(symbol),
        current.previousToken = current.token,
        current.token = {
            value: value,
            type: type,
            position: next_token.position,
        };
        current.error = undefined;
        return;
    };

    // Pratt's algorithm
    var expression2 = (rbp: number): ast.ASTNode => {
        var c = current;
        let symbol = current.symbol;
        advance2(null, true);
        var left: ast.ASTNode = symbol.nud(current);
        while (rbp < current.symbol.lbp) {
            c = current;
            symbol = current.symbol;
            advance2();
            left = symbol.led(current, left);
        }
        return left;
    };

    current.advance = advance2;
    current.expression = expression2;
    current.handleError = handleError2;

    // now invoke the tokenizer and the parser and return the syntax tree
    lexer = tokenizer(source);
    advance2();
    // parse the tokens
    var expr = expression2(0);
    if (current.symbol.id !== "(end)") {
        var err = {
            code: "S0201",
            position: current.token.position,
            token: current.token.value,
        };
        handleError2(err);
    }

    // Decide if we want to collect errors and recover, or just throw an error
    let collect = recover ? err => errors.push(err) : undefined;
    expr = ast_optimize(expr, collect);

    if (errors.length > 0) {
        expr.errors = errors;
    }

    return expr;
}
