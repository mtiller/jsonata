import { operators } from "../constants";
import { parseSignature } from "../signatures";
import { tokenizer, Tokenizer, Token } from "../tokenizer";
import { isNumeric } from "../utils";
import { ast_optimize } from "./optimize";
import { ErrorCollector } from "./errors";
import * as ast from './ast';

export type ExprNode = any;

export type NUD = (self: any) => ExprNode;
export type LED = (self: any, left: any) => ExprNode;

export interface Symbol {
    id: string;
    lbp: number;
    nud: NUD;
    led?: LED;
    position?: number;
    value: any;
}

// export class ParserState {
//     lexer: Tokenizer;
//     constructor(source: string) {
//         this.lexer = tokenizer(source);
//     }
// }

// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6
export function parser(source, recover?: boolean) {
    var node: {
        id: string;
        error?: any;
        type?: string;
        position?: number;
        value?: any;
        nud?: NUD;
        led?: LED;
        lbp?: number;
    };
    var lexer: Tokenizer;

    var remainingTokens = function() {
        var remaining: Token[] = [];
        if (node.id !== "(end)") {
            remaining.push({ type: node.type, value: node.value, position: node.position });
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

        let defaultNud: NUD = function(self: any) {
                // error - symbol has been invoked as a unary operator
                var err: any = {
                    code: "S0211",
                    token: self.value,
                    position: self.position,
                };

                if (recover) {
                    err.remaining = remainingTokens();
                    err.type = "error";
                    errors.push(err);
                    return err;
                } else {
                    err.stack = new Error().stack;
                    throw err;
                }            
        }

        var symbol = function(id, bp: number): Symbol {
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
                    nud: defaultNud,
                }
                symbol_table[id] = s;
                return s;
            }
        };

        var terminal = function(id) {
            var s = symbol(id, 0);
            s.nud = function(self: any) {
                return {
                    ...self,
                };
            };
        };

        // match infix operators
        // <expression> <operator> <expression>
        // left associative
        // TODO: Add default values for bp and led
        var infix = function(id, bp?, led?) {
            var bindingPower = bp || operators[id];
            var s = symbol(id, bindingPower);
            s.led =
                led ||
                function(self: any, left) {
                    self.lhs = left;
                    self.rhs = expression(bindingPower);
                    self.type = "binary";
                    return self;
                };
            return s;
        };

        // match infix operators
        // <expression> <operator> <expression>
        // right associative
        // TODO: Add default values for bp and led
        var infixr = function(id, bp?, led?: LED) {
            var bindingPower = bp || operators[id];
            var s = symbol(id, bindingPower);
            s.led =
                led ||
                function(self: any, left) {
                    self.lhs = left;
                    self.rhs = expression(bindingPower - 1); // subtract 1 from bindingPower for right associative operators
                    self.type = "binary";
                    return self;
                };
            return s;
        };

        // match prefix operators
        // <operator> <expression>
        var prefix = function(id, nud?: (self: any) => any) {
            var s = symbol(id, 0);
            s.nud =
                nud ||
                function(self: any) {
                    self.expression = expression(70);
                    self.type = "unary";
                    return self;
                };
            return s;
        };

        terminal("(end)");
        terminal("(name)");
        terminal("(literal)");
        terminal("(regex)");
        symbol(":", 0);
        symbol(";", 0);
        symbol(",", 0);
        symbol(")", 0);
        symbol("]", 0);
        symbol("}", 0);
        symbol("..", 0); // range operator
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

        infixr("(error)", 10, function(self: any, left) {
            self.lhs = left;

            self.error = node.error;
            self.remaining = remainingTokens();
            self.type = "error";
            return self;
        });

        // field wildcard (single level)
        prefix("*", function(self: any): ast.WildcardNode {
            self.type = "wildcard";
            return self;
        });

        // descendant wildcard (multi-level)
        prefix("**", function(self: any) {
            self.type = "descendant";
            return self;
        });

        // function invocation
        infix("(", operators["("], function(self: any, left) {
            // left is is what we are trying to invoke
            self.procedure = left;
            self.type = "function";
            self.arguments = [];
            if (node.id !== ")") {
                for (;;) {
                    if (node.type === "operator" && node.id === "?") {
                        // partial function application
                        self.type = "partial";
                        self.arguments.push(node);
                        advance("?");
                    } else {
                        self.arguments.push(expression(0));
                    }
                    if (node.id !== ",") break;
                    advance(",");
                }
            }
            advance(")", true);
            // if the name of the function is 'function' or λ, then this is function definition (lambda function)
            if (left.type === "name" && (left.value === "function" || left.value === "\u03BB")) {
                // all of the args must be VARIABLE tokens
                self.arguments.forEach(function(arg, index) {
                    if (arg.type !== "variable") {
                        return handleError({
                            code: "S0208",
                            stack: new Error().stack,
                            position: arg.position,
                            token: arg.value,
                            value: index + 1,
                        });
                    }
                });
                self.type = "lambda";
                // is the next token a '<' - if so, parse the function signature
                if (node.id === "<") {
                    var sigPos = node.position;
                    var depth = 1;
                    var sig = "<";
                    // TODO: Bug in typescript compiler?...doesn't recognize side effects in advance and impact on node value
                    while (depth > 0 && (node.id as string) !== "{" && (node.id as string) !== "(end)") {
                        var tok = advance();
                        if (tok.id === ">") {
                            depth--;
                        } else if (tok.id === "<") {
                            depth++;
                        }
                        sig += tok.value;
                    }
                    advance(">");
                    try {
                        self.signature = parseSignature(sig);
                    } catch (err) {
                        // insert the position into this error
                        err.position = sigPos + err.offset;
                        return handleError(err);
                    }
                }
                // parse the function body
                advance("{");
                self.body = expression(0);
                advance("}");
            }
            return self;
        });

        // parenthesis - block expression
        prefix("(", function(self: any) {
            var expressions = [];
            while (node.id !== ")") {
                expressions.push(expression(0));
                if (node.id !== ";") {
                    break;
                }
                advance(";");
            }
            advance(")", true);
            self.type = "block";
            self.expressions = expressions;
            return self;
        });

        // array constructor
        prefix("[", function(self: any) {
            var a = [];
            if (node.id !== "]") {
                for (;;) {
                    var item = expression(0);
                    if (node.id === "..") {
                        // range operator
                        var range = { type: "binary", value: "..", position: node.position, lhs: item };
                        advance("..");
                        // TODO: Fix any cast
                        (range as any).rhs = expression(0);
                        item = range;
                    }
                    a.push(item);
                    if (node.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("]", true);
            self.expressions = a;
            self.type = "unary";
            return self;
        });

        // filter - predicate or array index
        infix("[", operators["["], function(self: any, left) {
            if (node.id === "]") {
                // empty predicate means maintain singleton arrays in the output
                var step = left;
                while (step && step.type === "binary" && step.value === "[") {
                    step = step.lhs;
                }
                step.keepArray = true;
                advance("]");
                return left;
            } else {
                self.lhs = left;
                self.rhs = expression(operators["]"]);
                self.type = "binary";
                advance("]", true);
                return self;
            }
        });

        // order-by
        infix("^", operators["^"], function(self: any, left) {
            advance("(");
            var terms = [];
            for (;;) {
                var term = {
                    descending: false,
                };
                if (node.id === "<") {
                    // ascending sort
                    advance("<");
                } else if (node.id === ">") {
                    // descending sort
                    term.descending = true;
                    advance(">");
                } else {
                    //unspecified - default to ascending
                }
                // TODO: Fix any cast
                (term as any).expression = expression(0);
                terms.push(term);
                if (node.id !== ",") {
                    break;
                }
                advance(",");
            }
            advance(")");
            self.lhs = left;
            self.rhs = terms;
            self.type = "binary";
            return self;
        });

        var objectParser = function(self: any, left?) {
            var a = [];
            if (node.id !== "}") {
                for (;;) {
                    var n = expression(0);
                    advance(":");
                    var v = expression(0);
                    a.push([n, v]); // holds an array of name/value expression pairs
                    if (node.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("}", true);
            if (typeof left === "undefined") {
                // NUD - unary prefix form
                self.lhs = a;
                self.type = "unary";
            } else {
                // LED - binary infix form
                self.lhs = left;
                self.rhs = a;
                self.type = "binary";
            }
            return self;
        };

        // object constructor
        prefix("{", objectParser);

        // object grouping
        infix("{", operators["{"], objectParser);

        // if/then/else ternary operator ?:
        infix("?", operators["?"], function(self: any, left) {
            self.type = "condition";
            self.condition = left;
            self.then = expression(0);
            if (node.id === ":") {
                // else condition
                advance(":");
                self.else = expression(0);
            }
            return self;
        });

        // object transformer
        prefix("|", function(self: any) {
            self.type = "transform";
            self.pattern = expression(0);
            advance("|");
            self.update = expression(0);
            if (node.id === ",") {
                advance(",");
                self.delete = expression(0);
            }
            advance("|");
            return self;
        });

        return symbol_table;
    }

    var errors = [];
    let symbol_table = createTable();

    var handleError = function(err) {
        if (recover) {
            // tokenize the rest of the buffer and add it to an error token
            err.remaining = remainingTokens();
            errors.push(err);
            var symbol = symbol_table["(error)"];
            node = Object.create(symbol);
            node.error = err;
            node.type = "(error)";
            return node;
        } else {
            err.stack = new Error().stack;
            throw err;
        }
    };

    var advance = function(id?, infix?) {
        if (id && node.id !== id) {
            var code;
            if (node.id === "(end)") {
                // unexpected end of buffer
                code = "S0203";
            } else {
                code = "S0202";
            }
            var err = {
                code: code,
                position: node.position,
                token: node.value,
                value: id,
            };
            return handleError(err);
        }
        var next_token: Token = lexer(infix);
        if (next_token === null) {
            node = symbol_table["(end)"];
            node.position = source.length;
            return node;
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
                    return handleError({
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
                return handleError({
                    code: "S0205",
                    stack: new Error().stack,
                    position: next_token.position,
                    token: value,
                });
        }

        node = Object.create(symbol);
        node.value = value;
        node.type = type;
        node.position = next_token.position;
        return node;
    };

    // Pratt's algorithm
    var expression = function(rbp) {
        var left;
        var t = node;
        advance(null, true);
        left = t.nud(t);
        while (rbp < node.lbp) {
            t = node;
            advance();
            left = t.led(t, left);
        }
        return left;
    };

    // now invoke the tokenizer and the parser and return the syntax tree
    lexer = tokenizer(source);
    advance();
    // parse the tokens
    var expr = expression(0);
    if (node.id !== "(end)") {
        var err = {
            code: "S0201",
            position: node.position,
            token: node.value,
        };
        handleError(err);
    }

    // Decide if we want to collect errors and recover, or just throw an error
    let collect = recover ? err => errors.push(err) : undefined;
    expr = ast_optimize(expr, collect);

    if (errors.length > 0) {
        expr.errors = errors;
    }

    return expr;
}
