import * as ast from "../ast";
import { unexpectedValue, isArrayOfNumbers, flatten } from "../utils";
import { JEnv, JSValue } from "./environment";
import { JBox, ubox, boxmap, boxValue, unbox, fragmentBox, defragmentBox } from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { isNumber, isString } from "util";

export function eval2(expr: ast.ASTNode, input: JSValue, environment: JEnv): JSValue {
    let box = boxValue(input);
    let nexpr = elaboratePredicates(expr);
    environment.bind("$", input);
    let result = doEval(nexpr, box, environment);
    return unbox(result);
}

function doEval(expr: ast.ASTNode, input: JBox, environment: JEnv): JBox {
    switch (expr.type) {
        /* These are all leaf node types (have no children) */
        case "literal": {
            return boxValue(expr.value);
        }
        case "variable": {
            return evaluateVariable(expr, input, environment);
        }
        case "name": {
            return evaluateName(expr, input, environment);
        }
        case "wildcard": {
            return evaluateWildcard(expr, input, environment);
        }
        /* These are all operator nodes of some kind (they have children) */
        case "array": {
            return evaluateArray(expr, input, environment);
        }
        case "predicate": {
            return evaluatePredicate(expr, input, environment);
        }
        case "bind": {
            return evaluateBinding(expr, input, environment);
        }
        case "block": {
            return evaluateBlock(expr, input, environment);
        }
        case "path": {
            return evaluatePath(expr, input, environment);
        }
        case "binary": {
            return evaluateBinaryOperation(expr, input, environment);
        }
        case "unary":
        case "descendant":
        case "condition":
        case "regex":
        case "function":
        case "lambda":
        case "partial":
        case "apply":
        case "sort":
        case "group":
        case "transform": {
            throw new Error("AST node type '" + expr.type + "' is unimplemented");
        }
        /* istanbul ignore next */
        case "grouped-object":
        /* istanbul ignore next */
        case "proxy":
        /* istanbul ignore next */
        case "end":
        /* istanbul ignore next */
        case "error":
        /* istanbul ignore next */
        case "operator":
        /* istanbul ignore next */
        case "singleton": {
            /* istanbul ignore next */
            throw new Error("Raw AST node found in optimized tree");
        }
        /* istanbul ignore next */
        default:
            /* istanbul ignore next */
            return unexpectedValue<ast.ASTNode>(
                expr,
                expr,
                v => "Evaluate failed to handle case where expression type was " + v.type,
            );
    }
}

function evaluateVariable(expr: ast.VariableNode, input: JBox, environment: JEnv): JBox {
    /* Get the variable name */
    const varname = expr.value;
    /* If the variable name is empty, then just return the input */
    if (varname == "") return input;
    /* Otherwise, lookup the variable in the environment */
    let result = environment.lookup(varname);
    /* If not found, return an undefined value */
    if (result == undefined) return ubox;
    return boxValue(result);
}

function evaluatePath(expr: ast.PathNode, input: JBox, environment: JEnv): JBox {
    if (input.values == undefined) return ubox;
    if (expr.steps.length == 0) throw new Error("Path without zero steps...this shouldn't happen");

    let [step0, ...rest] = expr.steps;
    let res0 = doEval(step0, input, environment);

    return rest.reduce((prev, step) => evalOverValues(prev, step, environment), res0);
}

function evaluateName(expr: ast.NameNode, input: JBox, environment: JEnv): JBox {
    if (input.values === undefined) return ubox;
    return boxmap(input, elem => (typeof elem === "object" ? elem[expr.value] : undefined));
}

function evaluateWildcard(expr: ast.WildcardNode, input: JBox, environment: JEnv): JBox {
    if (input.values === undefined) return ubox;
    let val = input.scalar ? input.values[0] : input.values;
    if (val === undefined || val === null) return ubox;
    // We don't need to check if val is an object because Object.keys() works
    // for all values, it just returns an empty list for anything but an object.
    return boxValue(flatten(Object.keys(val).map((k, i) => val[k])));
}

function evaluatePredicate(expr: ast.PredicateNode, input: JBox, environment: JEnv): JBox {
    /* Loop over every value on the left hand side */
    /*   Evaluate predicate in the context of each value */
    /*   If the result is a number, promote to array of numbers */
    /*   If the result is an array of numbers, iterate over indices and push
           element in input with matching index */
    /*   If result is not an array of numbers, treat as truthy */

    let predicate = expr.condition;
    // First, evaluate the left hand side
    let lhs = doEval(expr.lhs, input, environment);

    // TODO: Simplify?
    let pvals = evalOverValues(lhs, predicate, environment);
    let vals: JSValue[] = [];

    pvals.values.forEach((pv: JSValue, ind: number) => {
        let res: JSValue = pv;
        let rev = ind - lhs.values.length;
        if (isNumber(pv)) {
            res = [pv];
        }
        if (isArrayOfNumbers(res)) {
            if ((res as number[]).findIndex(n => Math.floor(n) === ind || Math.floor(n) === rev) >= 0) {
                vals.push(lhs.values[ind]);
            }
        } else {
            if (!!res) {
                vals.push(lhs.values[ind]);
            }
        }
    });

    // vals = lhs.values.filter((x, ind) => {
    //     let pv = pvals.values[ind];
    //     let res: JSValue = pv;
    //     let rev = ind - lhs.values.length;
    //     if (isNumber(pv)) {
    //         res = [pv];
    //     }
    //     if (isArrayOfNumbers(res)) {
    //         if ((res as number[]).findIndex(n => Math.floor(n) === ind || Math.floor(n) === rev) >= 0) {
    //             return true;
    //         }
    //     } else {
    //         if (!!res) {
    //             return true;
    //         }
    //     }
    //     return false;
    // });
    return boxValue(vals);
}

function evaluateBinding(expr: ast.BindNode, input: JBox, environment: JEnv): JBox {
    let lhs = expr.lhs;
    let x = lhs;
    let val = doEval(expr.rhs, input, environment);
    environment.bind(x.value, unbox(val));
    return val;
}

export function evaluateBlock(expr: ast.BlockNode, input: JBox, enclosing: JEnv): JBox {
    let environment = new JEnv(enclosing);
    return expr.expressions.reduce((prev, e) => doEval(e, input, environment), ubox);
}

export function evaluateBinaryOperation(expr: ast.BinaryOperationNode, input: JBox, environment: JEnv): JBox {
    let lhs = unbox(doEval(expr.lhs, input, environment));
    let rhs = unbox(doEval(expr.rhs, input, environment));
    let value = expr.value;
    switch (value) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "%": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!isNumber(lhs) || !isNumber(rhs)) {
                throw new Error("Invalid operands for " + value);
            }
            switch (value) {
                case "+":
                    return boxValue(lhs + rhs);
                case "-":
                    return boxValue(lhs - rhs);
                case "*":
                    return boxValue(lhs * rhs);
                case "/":
                    return boxValue(lhs / rhs);
                case "%":
                    return boxValue(lhs % rhs);
                default:
                    return unexpectedValue<string>(
                        value,
                        value,
                        v => "Evaluate failed to handle case where binary operation was " + v,
                    );
            }
        }
        case "=":
        case "!=":
        case "<":
        case "<=":
        case ">":
        case ">=": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            if (!isNumber(lhs) && !isString(lhs)) {
                throw new Error("Invalid operand for LHS of " + value + " operator: " + JSON.stringify(lhs));
            }
            if (!isNumber(rhs) && !isString(rhs)) {
                throw new Error("Invalid operand for RHS of " + value + " operator: " + JSON.stringify(rhs));
            }
            switch (value) {
                case "=":
                    return boxValue(lhs === rhs);
                case "!=":
                    return boxValue(lhs !== rhs);
                case "<":
                    return boxValue(lhs < rhs);
                case "<=":
                    return boxValue(lhs <= rhs);
                case ">":
                    return boxValue(lhs > rhs);
                case ">=":
                    return boxValue(lhs >= rhs);
                default:
                    return unexpectedValue<string>(
                        value,
                        value,
                        v => "Evaluate failed to handle case where binary operation was " + v,
                    );
            }
        }
        case "&":
        case "and":
        case "or":
        case "..":
        case "in": {
            throw new Error("Operator " + expr.value + " unimplemented");
        }
        default:
            /* istanbul ignore next */
            return unexpectedValue<string>(
                value,
                value,
                v => "Evaluate failed to handle case where binary operation was " + v,
            );
    }
}

function evaluateArray(expr: ast.ArrayConstructorNode, input: JBox, environment: JEnv): JBox {
    let elems = expr.expressions.map(e => {
        let v = doEval(e, input, environment);
        return v.scalar ? v.values[0] : v.values;
    });
    return boxValue(elems);
}

export function evalOverValues(box: JBox, expr: ast.ASTNode, environment: JEnv): JBox {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.map(c => doEval(expr, c, environment));
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped);
}
