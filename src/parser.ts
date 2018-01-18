import { operators } from "./constants";
import { parseSignature } from './signatures';
import { tokenizer } from './tokenizer';
import { isNumeric } from './utils';

// This parser implements the 'Top down operator precedence' algorithm developed by Vaughan R Pratt; http://dl.acm.org/citation.cfm?id=512931.
// and builds on the Javascript framework described by Douglas Crockford at http://javascript.crockford.com/tdop/tdop.html
// and in 'Beautiful Code', edited by Andy Oram and Greg Wilson, Copyright 2007 O'Reilly Media, Inc. 798-0-596-51004-6

export function parser(source, recover?: boolean) {
    var node;
    var lexer;

    var symbol_table = {};
    var errors = [];

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

    var base_symbol = {
        nud: function(this: any) {
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
        },
    };

    // TODO: Add default value for bp
    var symbol = function(id, bp?) {
        var s = symbol_table[id];
        bp = bp || 0;
        if (s) {
            if (bp >= s.lbp) {
                s.lbp = bp;
            }
        } else {
            s = Object.create(base_symbol);
            s.id = s.value = id;
            s.lbp = bp;
            symbol_table[id] = s;
        }
        return s;
    };

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

    // tail call optimization
    // this is invoked by the post parser to analyse lambda functions to see
    // if they make a tail call.  If so, it is replaced by a thunk which will
    // be invoked by the trampoline loop during function application.
    // This enables tail-recursive functions to be written without growing the stack
    var tail_call_optimize = function(expr) {
        var result;
        if (expr.type === "function") {
            var thunk = { type: "lambda", thunk: true, arguments: [], position: expr.position, body: expr };
            result = thunk;
        } else if (expr.type === "condition") {
            // analyse both branches
            expr.then = tail_call_optimize(expr.then);
            if (typeof expr.else !== "undefined") {
                expr.else = tail_call_optimize(expr.else);
            }
            result = expr;
        } else if (expr.type === "block") {
            // only the last expression in the block
            var length = expr.expressions.length;
            if (length > 0) {
                expr.expressions[length - 1] = tail_call_optimize(expr.expressions[length - 1]);
            }
            result = expr;
        } else {
            result = expr;
        }
        return result;
    };

    // post-parse stage
    // the purpose of this is flatten the parts of the AST representing location paths,
    // converting them to arrays of steps which in turn may contain arrays of predicates.
    // following this, nodes containing '.' and '[' should be eliminated from the AST.
    var ast_optimize = function(expr) {
        var result;
        switch (expr.type) {
            case "binary":
                switch (expr.value) {
                    case ".":
                        var lstep = ast_optimize(expr.lhs);
                        result = { type: "path", steps: [] };
                        if (lstep.type === "path") {
                            Array.prototype.push.apply(result.steps, lstep.steps);
                        } else {
                            result.steps = [lstep];
                        }
                        var rest = ast_optimize(expr.rhs);
                        if (
                            rest.type === "function" &&
                            rest.procedure.type === "path" &&
                            rest.procedure.steps.length === 1 &&
                            rest.procedure.steps[0].type === "name" &&
                            result.steps[result.steps.length - 1].type === "function"
                        ) {
                            // next function in chain of functions - will override a thenable
                            result.steps[result.steps.length - 1].nextFunction = rest.procedure.steps[0].value;
                        }
                        if (rest.type !== "path") {
                            rest = { type: "path", steps: [rest] };
                        }
                        Array.prototype.push.apply(result.steps, rest.steps);
                        // any steps within a path that are literals, should be changed to 'name'
                        result.steps
                            .filter(function(step) {
                                return step.type === "literal";
                            })
                            .forEach(function(lit) {
                                lit.type = "name";
                            });
                        // any step that signals keeping a singleton array, should be flagged on the path
                        if (
                            result.steps.filter(function(step) {
                                return step.keepArray === true;
                            }).length > 0
                        ) {
                            result.keepSingletonArray = true;
                        }
                        // if first step is a path constructor, flag it for special handling
                        var firststep = result.steps[0];
                        if (firststep.type === "unary" && firststep.value === "[") {
                            firststep.consarray = true;
                        }
                        // if the last step is an array constructor, flag it so it doesn't flatten
                        var laststep = result.steps[result.steps.length - 1];
                        if (laststep.type === "unary" && laststep.value === "[") {
                            laststep.consarray = true;
                        }
                        break;
                    case "[":
                        // predicated step
                        // LHS is a step or a predicated step
                        // RHS is the predicate expr
                        result = ast_optimize(expr.lhs);
                        var step = result;
                        if (result.type === "path") {
                            step = result.steps[result.steps.length - 1];
                        }
                        if (typeof step.group !== "undefined") {
                            throw {
                                code: "S0209",
                                stack: new Error().stack,
                                position: expr.position,
                            };
                        }
                        if (typeof step.predicate === "undefined") {
                            step.predicate = [];
                        }
                        step.predicate.push(ast_optimize(expr.rhs));
                        break;
                    case "{":
                        // group-by
                        // LHS is a step or a predicated step
                        // RHS is the object constructor expr
                        result = ast_optimize(expr.lhs);
                        if (typeof result.group !== "undefined") {
                            throw {
                                code: "S0210",
                                stack: new Error().stack,
                                position: expr.position,
                            };
                        }
                        // object constructor - process each pair
                        result.group = {
                            lhs: expr.rhs.map(function(pair) {
                                return [ast_optimize(pair[0]), ast_optimize(pair[1])];
                            }),
                            position: expr.position,
                        };
                        break;
                    case "^":
                        // order-by
                        // LHS is the array to be ordered
                        // RHS defines the terms
                        result = { type: "sort", value: expr.value, position: expr.position };
                        result.lhs = ast_optimize(expr.lhs);
                        result.rhs = expr.rhs.map(function(terms) {
                            return {
                                descending: terms.descending,
                                expression: ast_optimize(terms.expression),
                            };
                        });
                        break;
                    case ":=":
                        result = { type: "bind", value: expr.value, position: expr.position };
                        result.lhs = ast_optimize(expr.lhs);
                        result.rhs = ast_optimize(expr.rhs);
                        break;
                    case "~>":
                        result = { type: "apply", value: expr.value, position: expr.position };
                        result.lhs = ast_optimize(expr.lhs);
                        result.rhs = ast_optimize(expr.rhs);
                        break;
                    default:
                        result = { type: expr.type, value: expr.value, position: expr.position };
                        result.lhs = ast_optimize(expr.lhs);
                        result.rhs = ast_optimize(expr.rhs);
                }
                break;
            case "unary":
                result = { type: expr.type, value: expr.value, position: expr.position };
                if (expr.value === "[") {
                    // array constructor - process each item
                    result.expressions = expr.expressions.map(function(item) {
                        return ast_optimize(item);
                    });
                } else if (expr.value === "{") {
                    // object constructor - process each pair
                    result.lhs = expr.lhs.map(function(pair) {
                        return [ast_optimize(pair[0]), ast_optimize(pair[1])];
                    });
                } else {
                    // all other unary expressions - just process the expression
                    result.expression = ast_optimize(expr.expression);
                    // if unary minus on a number, then pre-process
                    if (
                        expr.value === "-" &&
                        result.expression.type === "literal" &&
                        isNumeric(result.expression.value)
                    ) {
                        result = result.expression;
                        result.value = -result.value;
                    }
                }
                break;
            case "function":
            case "partial":
                result = { type: expr.type, name: expr.name, value: expr.value, position: expr.position };
                result.arguments = expr.arguments.map(function(arg) {
                    return ast_optimize(arg);
                });
                result.procedure = ast_optimize(expr.procedure);
                break;
            case "lambda":
                result = {
                    type: expr.type,
                    arguments: expr.arguments,
                    signature: expr.signature,
                    position: expr.position,
                };
                var body = ast_optimize(expr.body);
                result.body = tail_call_optimize(body);
                break;
            case "condition":
                result = { type: expr.type, position: expr.position };
                result.condition = ast_optimize(expr.condition);
                result.then = ast_optimize(expr.then);
                if (typeof expr.else !== "undefined") {
                    result.else = ast_optimize(expr.else);
                }
                break;
            case "transform":
                result = { type: expr.type, position: expr.position };
                result.pattern = ast_optimize(expr.pattern);
                result.update = ast_optimize(expr.update);
                if (typeof expr.delete !== "undefined") {
                    result.delete = ast_optimize(expr.delete);
                }
                break;
            case "block":
                result = { type: expr.type, position: expr.position };
                // array of expressions - process each one
                result.expressions = expr.expressions.map(function(item) {
                    return ast_optimize(item);
                });
                // TODO scan the array of expressions to see if any of them assign variables
                // if so, need to mark the block as one that needs to create a new frame
                break;
            case "name":
                result = { type: "path", steps: [expr] };
                if (expr.keepArray) {
                    result.keepSingletonArray = true;
                }
                break;
            case "literal":
            case "wildcard":
            case "descendant":
            case "variable":
            case "regex":
                result = expr;
                break;
            case "operator":
                // the tokens 'and' and 'or' might have been used as a name rather than an operator
                if (expr.value === "and" || expr.value === "or" || expr.value === "in") {
                    expr.type = "name";
                    result = ast_optimize(expr);
                } else if (expr.value === "?") {
                    /* istanbul ignore else */ // partial application
                    result = expr;
                } else {
                    throw {
                        code: "S0201",
                        stack: new Error().stack,
                        position: expr.position,
                        token: expr.value,
                    };
                }
                break;
            case "error":
                result = expr;
                if (expr.lhs) {
                    result = ast_optimize(expr.lhs);
                }
                break;
            default:
                var code = "S0206";
                /* istanbul ignore else */
                if (expr.id === "(end)") {
                    code = "S0207";
                }
                var err = {
                    code: code,
                    position: expr.position,
                    token: expr.value,
                };
                if (recover) {
                    errors.push(err);
                    return { type: "error", error: err };
                } else {
                    (err as any).stack = new Error().stack;
                    throw err;
                }
        }
        return result;
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
    expr = ast_optimize(expr);

    if (errors.length > 0) {
        expr.errors = errors;
    }

    return expr;
}
