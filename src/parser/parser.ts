import { operators } from "../constants";
import { parseSignature } from "../signatures";
import { tokenizer } from "../tokenizer";
import { isNumeric } from "../utils";
import { ast_optimize } from "./optimize";
import { ErrorCollector } from "./errors";

export type ExprNode = any;

export interface Symbol {
    id: string;
    lbp: number;
    nud: () => ExprNode;
    led?: (left: any) => ExprNode;
    value: any;
    position?: number;
}

// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6
export function parser(source, recover?: boolean) {
    var node;
    var lexer;

    var remainingTokens = function() {
        var remaining = [];
        if (node.id !== "(end)") {
            remaining.push({ type: node.type, value: node.value, position: node.position });
        }
        var nxt = lexer();
        while (nxt !== null) {
            remaining.push(nxt);
            nxt = lexer();
        }
        return remaining;
    };

    function createTable(): { [id: string]: Symbol } {
        let symbol_table: { [id: string]: Symbol } = {};

        class BaseSymbol implements Symbol {
            led?: (left: any) => ExprNode = undefined;

            constructor(public id: string, public lbp: number, public value: any, public position?: number) {}
            nud() {
                // error - symbol has been invoked as a unary operator
                var err: any = {
                    code: "S0211",
                    token: this.value,
                    position: this.position,
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
        }

        // TODO: Get rid of default?
        var symbol = function(id, bp: number = 0) {
            bp = bp || 0;
            if (symbol_table.hasOwnProperty(id)) {
                let s = symbol_table[id];
                // TODO: Should this ever happen?!?  Aren't we overwriting something?!?
                if (bp >= s.lbp) {
                    s.lbp = bp;
                }
                return s;
            } else {
                let s = new BaseSymbol(id, bp, id);
                symbol_table[id] = s;
                return s;
            }
        };

        var terminal = function(id) {
            var s = symbol(id, 0);
            s.nud = function() {
                return this;
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
                function(this: any, left) {
                    this.lhs = left;
                    this.rhs = expression(bindingPower);
                    this.type = "binary";
                    return this;
                };
            return s;
        };

        // match infix operators
        // <expression> <operator> <expression>
        // right associative
        // TODO: Add default values for bp and led
        var infixr = function(id, bp?, led?) {
            var bindingPower = bp || operators[id];
            var s = symbol(id, bindingPower);
            s.led =
                led ||
                function(this: any, left) {
                    this.lhs = left;
                    this.rhs = expression(bindingPower - 1); // subtract 1 from bindingPower for right associative operators
                    this.type = "binary";
                    return this;
                };
            return s;
        };

        // match prefix operators
        // <operator> <expression>
        var prefix = function(id, nud?) {
            var s = symbol(id);
            s.nud =
                nud ||
                function(this: any) {
                    this.expression = expression(70);
                    this.type = "unary";
                    return this;
                };
            return s;
        };

        terminal("(end)");
        terminal("(name)");
        terminal("(literal)");
        terminal("(regex)");
        symbol(":");
        symbol(";");
        symbol(",");
        symbol(")");
        symbol("]");
        symbol("}");
        symbol(".."); // range operator
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

        infixr("(error)", 10, function(this: any, left) {
            this.lhs = left;

            this.error = node.error;
            this.remaining = remainingTokens();
            this.type = "error";
            return this;
        });

        // field wildcard (single level)
        prefix("*", function(this: any) {
            this.type = "wildcard";
            return this;
        });

        // descendant wildcard (multi-level)
        prefix("**", function(this: any) {
            this.type = "descendant";
            return this;
        });

        // function invocation
        infix("(", operators["("], function(this: any, left) {
            // left is is what we are trying to invoke
            this.procedure = left;
            this.type = "function";
            this.arguments = [];
            if (node.id !== ")") {
                for (;;) {
                    if (node.type === "operator" && node.id === "?") {
                        // partial function application
                        this.type = "partial";
                        this.arguments.push(node);
                        advance("?");
                    } else {
                        this.arguments.push(expression(0));
                    }
                    if (node.id !== ",") break;
                    advance(",");
                }
            }
            advance(")", true);
            // if the name of the function is 'function' or λ, then this is function definition (lambda function)
            if (left.type === "name" && (left.value === "function" || left.value === "\u03BB")) {
                // all of the args must be VARIABLE tokens
                this.arguments.forEach(function(arg, index) {
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
                this.type = "lambda";
                // is the next token a '<' - if so, parse the function signature
                if (node.id === "<") {
                    var sigPos = node.position;
                    var depth = 1;
                    var sig = "<";
                    while (depth > 0 && node.id !== "{" && node.id !== "(end)") {
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
                        this.signature = parseSignature(sig);
                    } catch (err) {
                        // insert the position into this error
                        err.position = sigPos + err.offset;
                        return handleError(err);
                    }
                }
                // parse the function body
                advance("{");
                this.body = expression(0);
                advance("}");
            }
            return this;
        });

        // parenthesis - block expression
        prefix("(", function(this: any) {
            var expressions = [];
            while (node.id !== ")") {
                expressions.push(expression(0));
                if (node.id !== ";") {
                    break;
                }
                advance(";");
            }
            advance(")", true);
            this.type = "block";
            this.expressions = expressions;
            return this;
        });

        // array constructor
        prefix("[", function(this: any) {
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
            this.expressions = a;
            this.type = "unary";
            return this;
        });

        // filter - predicate or array index
        infix("[", operators["["], function(this: any, left) {
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
                this.lhs = left;
                this.rhs = expression(operators["]"]);
                this.type = "binary";
                advance("]", true);
                return this;
            }
        });

        // order-by
        infix("^", operators["^"], function(this: any, left) {
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
            this.lhs = left;
            this.rhs = terms;
            this.type = "binary";
            return this;
        });

        var objectParser = function(this: any, left) {
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
                this.lhs = a;
                this.type = "unary";
            } else {
                // LED - binary infix form
                this.lhs = left;
                this.rhs = a;
                this.type = "binary";
            }
            return this;
        };

        // object constructor
        prefix("{", objectParser);

        // object grouping
        infix("{", operators["{"], objectParser);

        // if/then/else ternary operator ?:
        infix("?", operators["?"], function(this: any, left) {
            this.type = "condition";
            this.condition = left;
            this.then = expression(0);
            if (node.id === ":") {
                // else condition
                advance(":");
                this.else = expression(0);
            }
            return this;
        });

        // object transformer
        prefix("|", function(this: any) {
            this.type = "transform";
            this.pattern = expression(0);
            advance("|");
            this.update = expression(0);
            if (node.id === ",") {
                advance(",");
                this.delete = expression(0);
            }
            advance("|");
            return this;
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
        var next_token = lexer(infix);
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
        left = t.nud();
        while (rbp < node.lbp) {
            t = node;
            advance();
            left = t.led(left);
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
