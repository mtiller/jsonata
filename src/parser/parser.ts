import { operators } from "../constants";
import { parseSignature } from "../signatures";
import { tokenizer, Tokenizer, Token } from "../tokenizer";
import { isNumeric } from "../utils";
import { ast_optimize } from "./optimize";
import { ErrorCollector } from "./errors";
import * as ast from "./ast";

export type NUD = (self: NodeType) => ast.ASTNode;
export type LED = (self: NodeType, left: ast.ASTNode) => ast.ASTNode;

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

export interface NodeType {
    id: string;
    error?: any;
    type?: string;
    position?: number;
    value?: any;
    nud?: NUD;
    led?: LED;
    lbp?: number;
}
// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6
export function parser(source, recover?: boolean) {
    var current: { token: Token; symbol: Symbol };
    var node: NodeType;
    var lexer: Tokenizer;

    var remainingTokens = function() {
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

        let defaultNud: NUD = function(self: NodeType): ast.ErrorNode {
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
        };

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
                };
                symbol_table[id] = s;
                return s;
            }
        };

        // A terminal could be a 'literal', 'variable', 'name'
        var terminal = function(id) {
            var s = symbol(id, 0);
            s.nud = function(self: NodeType): ast.TerminalNode {
                switch (self.type) {
                    case "variable":
                        return {
                            type: "variable",
                            value: self.value,
                            position: self.position,
                        };
                    case "name":
                        return {
                            type: "name",
                            value: self.value,
                            position: self.position,
                        };
                    case "literal":
                        return {
                            type: "literal",
                            value: self.value,
                            position: self.position,
                        };
                    case "regex":
                        return {
                            type: "regex",
                            value: self.value,
                            position: self.position,
                        };
                    case "operator":
                        return {
                            type: "operator",
                            value: self.value,
                            position: self.position,
                        };
                    default:
                        /* istanbul ignore next */
                        if (self.id !== "(end)") {
                            throw new Error("Unexpected terminal: " + JSON.stringify(self));
                        }
                        return {
                            type: "end",
                            value: "(end)",
                            position: self.position,
                        }
                }
            };
        };

        // match infix operators
        // <expression> <operator> <expression>
        // left associative
        // TODO: Add default values for bp and led
        var infix = function(id: string, bp?: number, led?) {
            var bindingPower = bp || operators[id];
            var s = symbol(id, bindingPower);
            s.led =
                led ||
                function(self: NodeType, left): ast.BinaryNode {
                    let rhs = expression(bindingPower);
                    return {
                        value: self.value,
                        type: "binary",
                        lhs: left,
                        rhs: rhs,
                    };
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
                function(self: NodeType, left): ast.BinaryNode {
                    let rhs = expression(bindingPower - 1); // subtract 1 from bindingPower for right associative operators
                    return {
                        value: self.value,
                        type: "binary",
                        lhs: left,
                        rhs: rhs,
                    };
                };
            return s;
        };

        // match prefix operators
        // <operator> <expression>
        var prefix = function(id, nud?: NUD) {
            var s = symbol(id, 0);
            s.nud =
                nud ||
                function(self: NodeType): ast.UnaryNode {
                    return {
                        value: self.value,
                        type: "unary",
                        expression: expression(70),
                    };
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

        infixr("(error)", 10, function(self: NodeType, left: ast.ASTNode): ast.ErrorNode {
            return {
                value: self.value,
                lhs: left,
                error: node.error,
                remaining: remainingTokens(),
                type: "error",
            };
        });

        // field wildcard (single level)
        prefix("*", function(self: NodeType): ast.WildcardNode {
            return {
                value: self.value,
                type: "wildcard",
            };
        });

        // descendant wildcard (multi-level)
        prefix("**", function(self: NodeType): ast.DescendantNode {
            return {
                value: self.value,
                type: "descendant",
            };
        });

        // function invocation
        infix("(", operators["("], function(
            self: NodeType,
            left: ast.ASTNode,
        ): ast.FunctionInvocationNode | ast.LambdaDefinitionNode {
            // left is is what we are trying to invoke
            let type: "function" | "partial" = "function";
            let args = [];
            if (current.symbol.id !== ")") {
                for (;;) {
                    if (current.token.type === "operator" && current.symbol.id === "?") {
                        // partial function application
                        type = "partial";
                        args.push(node);
                        advance("?");
                    } else {
                        args.push(expression(0));
                    }
                    if (current.symbol.id !== ",") break;
                    advance(",");
                }
            }
            advance(")", true);

            // if the name of the function is 'function' or λ, then this is function definition (lambda function)
            let isLambda = left.type === "name" && (left.value === "function" || left.value === "\u03BB");

            if (!isLambda) {
                let alt: ast.FunctionInvocationNode = {
                    position: self.position,
                    value: self.value,
                    type: type,
                    arguments: args,
                    procedure: left,
                };
                return alt;
            }
            // all of the args must be VARIABLE tokens
            args.forEach(function(arg, index) {
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
            // is the next token a '<' - if so, parse the function signature
            let signature = undefined;
            if (current.symbol.id === "<") {
                var sigPos = current.token.position;
                var depth = 1;
                var sig = "<";
                let id = current.symbol.id;
                // TODO: Bug in typescript compiler?...doesn't recognize side effects in advance and impact on node value
                while (depth > 0 && id !== "{" && id !== "(end)") {
                    advance();
                    id = current.symbol.id;
                    if (id === ">") {
                        depth--;
                    } else if (id === "<") {
                        depth++;
                    }
                    sig += current.token.value;
                }
                advance(">");
                try {
                    signature = parseSignature(sig);
                } catch (err) {
                    // insert the position into this error
                    err.position = sigPos + err.offset;
                    // TODO: If recover is true, we need to force the return of an
                    // error node here.  In the tests, recover is never set so this
                    // always throws.
                    handleError(err);
                    /* istanbul ignore next */
                    throw err;
                }
            }
            // parse the function body
            advance("{");
            let body = expression(0);
            advance("}");
            return {
                value: self.value,
                type: "lambda",
                body: body,
                signature: signature,
                procedure: left,
                arguments: args,
            };
        });

        // parenthesis - block expression
        prefix("(", function(self: NodeType): ast.BlockNode {
            var expressions = [];
            while (current.symbol.id !== ")") {
                expressions.push(expression(0));
                if (current.symbol.id !== ";") {
                    break;
                }
                advance(";");
            }
            advance(")", true);
            return {
                value: self.value,
                type: "block",
                expressions: expressions,
            };
        });

        // array constructor
        prefix("[", function(self: NodeType): ast.UnaryNode {
            var a = [];
            if (current.symbol.id !== "]") {
                for (;;) {
                    var item = expression(0);
                    if (current.symbol.id === "..") {
                        let position = current.token.position;
                        let lhs = item;
                        // range operator
                        advance("..");
                        let rhs = expression(0);
                        var range: ast.BinaryNode = { type: "binary", value: "..", position: position, lhs: lhs, rhs: rhs };
                        item = range;
                    }
                    a.push(item);
                    if (current.symbol.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("]", true);
            // TODO: Should this be a different type...? (not unary)
            return {
                value: self.value,
                type: "unary",
                expressions: a,
            };
        });

        // filter - predicate or array index
        infix("[", operators["["], (self: NodeType, left: ast.ASTNode): ast.ASTNode | ast.BinaryNode => {
            if (current.symbol.id === "]") {
                // empty predicate means maintain singleton arrays in the output
                var step = left;
                while (step && step.type === "binary" && step.value === "[") {
                    let s = step as ast.BinaryNode;
                    step = s.lhs;
                }
                step.keepArray = true;
                advance("]");
                return left;
            } else {
                let rhs = expression(operators["]"]);
                advance("]", true);
                let ret: ast.BinaryNode = {
                    value: self.value,
                    type: "binary",
                    lhs: left,
                    rhs: rhs,
                };
                return ret;
            }
        });

        // order-by
        infix("^", operators["^"], function(self: NodeType, left: ast.ASTNode): ast.BinaryNode {
            advance("(");
            var terms = [];
            for (;;) {
                var term = {
                    descending: false,
                };
                if (current.symbol.id === "<") {
                    // ascending sort
                    advance("<");
                } else if (current.symbol.id === ">") {
                    // descending sort
                    term.descending = true;
                    advance(">");
                } else {
                    //unspecified - default to ascending
                }
                // TODO: Fix any cast
                (term as any).expression = expression(0);
                terms.push(term);
                if (current.symbol.id !== ",") {
                    break;
                }
                advance(",");
            }
            advance(")");
            return {
                position: self.position, // REQUIRED?!?
                value: self.value,
                type: "binary",
                lhs: left,
                rhs: terms, // TODO: Not an expression node...different node type recommended
            };
        });

        var objectParserNUD = function(self: NodeType): ast.UnaryNode {
            var a = [];
            /* istanbul ignore else */
            if (current.symbol.id !== "}") {
                for (;;) {
                    var n = expression(0);
                    advance(":");
                    var v = expression(0);
                    a.push([n, v]); // holds an array of name/value expression pairs
                    if (current.symbol.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("}", true);
            // NUD - unary prefix form
            return {
                value: self.value,
                type: "unary",
                lhs: a, // TODO: use expression
            };
        };

        var objectParserLED = function(self: NodeType, left: ast.ASTNode): ast.BinaryNode {
            var a = [];
            /* istanbul ignore else */
            if (current.symbol.id !== "}") {
                for (;;) {
                    var n = expression(0);
                    advance(":");
                    var v = expression(0);
                    a.push([n, v]); // holds an array of name/value expression pairs
                    if (current.symbol.id !== ",") {
                        break;
                    }
                    advance(",");
                }
            }
            advance("}", true);
            // LED - binary infix form
            return {
                value: self.value,
                type: "binary",
                lhs: left,
                rhs: a,
            };
        };

        // object constructor
        prefix("{", objectParserNUD);

        // object grouping
        infix("{", operators["{"], objectParserLED);

        // if/then/else ternary operator ?:
        infix("?", operators["?"], function(self: NodeType, left): ast.TernaryNode {
            let then = expression(0);
            let otherwise = undefined;
            if (current.symbol.id === ":") {
                // else condition
                advance(":");
                otherwise = expression(0);
            }
            return {
                value: self.value,
                type: "condition",
                condition: left,
                then: then,
                else: otherwise,
            };
        });

        // object transformer
        prefix("|", function(self: NodeType): ast.TransformNode {
            let expr = expression(0);
            advance("|");
            let update = expression(0);
            let del = undefined;
            if (current.symbol.id === ",") {
                advance(",");
                del = expression(0);
            }
            advance("|");
            return {
                value: self.value,
                type: "transform",
                pattern: expr,
                update: update,
                delete: del,
            };
        });

        return symbol_table;
    }

    var errors = [];
    let symbol_table = createTable();

    var handleError = function(err): void {
        if (recover) {
            // tokenize the rest of the buffer and add it to an error token
            err.remaining = remainingTokens();
            errors.push(err);
            var symbol = symbol_table["(error)"];
            node = Object.create(symbol);
            node.error = err;
            current = {
                symbol: Object.create(symbol),
                token: {
                    type: "(error)",
                    value: null,
                    position: current.token.position,
                },
            };
        } else {
            err.stack = new Error().stack;
            throw err;
        }
    };

    var advance = function(id?, infix?): void {
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
                token: node.value,
                value: id,
            };
            return handleError(err);
        }
        var next_token: Token = lexer(infix);
        if (next_token === null) {
            node = symbol_table["(end)"];
            node.position = source.length;
            current = {
                symbol: Object.create(symbol_table["(end)"]),
                token: {
                    type: "(end)",
                    value: null,
                    position: source.length,
                },
            };
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

        current = {
            symbol: Object.create(symbol),
            token: {
                value: value,
                type: type,
                position: next_token.position,
            },
        };
        node = Object.create(symbol);
        node.value = value;
        node.type = type;
        node.position = next_token.position;
        return;
    };

    // Pratt's algorithm
    var expression = function(rbp: number): ast.ASTNode {
        var left: ast.ASTNode;
        var t = node;
        var c = current;
        advance(null, true);
        let l = c.symbol.nud(t);
        left = l;
        while (rbp < current.symbol.lbp) {
            t = node;
            c = current;
            advance();
            left = c.symbol.led(t, left);
        }
        return left;
    };

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
