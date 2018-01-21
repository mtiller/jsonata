import { operators } from "../constants";
import { parseSignature } from "../signatures";
import { tokenizer, Tokenizer, Token } from "../tokenizer";
import { isNumeric } from "../utils";
import { ast_optimize } from "./optimize";
import { ErrorCollector } from "./errors";
import { createTable } from './symbols';
import * as ast from "./ast";
import * as nuds from "./nuds";
import * as leds from "./leds";

import { NUD, LED, Symbol, ParserState, SymbolTable } from "./types";

function remainingTokens(current: ParserState, lexer: Tokenizer): Token[] {
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
}

function handleError(current: ParserState, lexer: Tokenizer, recover: boolean, errors: string[], symbol_table: SymbolTable, err: any): void {
    if (recover) {
        // tokenize the rest of the buffer and add it to an error token
        err.remaining = remainingTokens(current, lexer);
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
}

// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6
export function parser(source, recover?: boolean) {
    var current: ParserState = {} as ParserState;
    var lexer: Tokenizer;

    var errors = [];
    let symbol_table = createTable(recover, errors, () => remainingTokens(current, lexer));

    var advance = (id?: string, infix?: boolean): void => {
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
            return handleError(current, lexer, recover, errors, symbol_table, err);
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
                    return handleError(current, lexer, recover, errors, symbol_table, {
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
                return handleError(current, lexer, recover, errors, symbol_table, {
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
    var expression = (rbp: number): ast.ASTNode => {
        var c = current;
        let symbol = current.symbol;
        advance(null, true);
        var left: ast.ASTNode = symbol.nud(current);
        while (rbp < current.symbol.lbp) {
            c = current;
            symbol = current.symbol;
            advance();
            left = symbol.led(current, left);
        }
        return left;
    };

    current.advance = advance;
    current.expression = expression;
    current.handleError = (err) => handleError(current, lexer, recover, errors, symbol_table, err);

    // now invoke the tokenizer and the parser and return the syntax tree
    lexer = tokenizer(source);
    advance();
    // parse the tokens
    var expr = expression(0);
    if (current.symbol.id !== "(end)") {
        var err = {
            code: "S0201",
            position: current.token.position,
            token: current.token.value,
        };
        handleError(current, lexer, recover, errors, symbol_table, err);
    }

    // Decide if we want to collect errors and recover, or just throw an error
    let collect = recover ? err => errors.push(err) : undefined;
    expr = ast_optimize(expr, collect);

    if (errors.length > 0) {
        expr.errors = errors;
    }

    return expr;
}
