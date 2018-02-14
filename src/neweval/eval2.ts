import * as ast from "../ast";
import { unexpectedValue, isNumeric } from "../utils";
import { JEnv, JSValue } from "./environment";
import { Box, JBox, ubox, boxmap } from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { isNumber } from "util";

export function eval2(expr: ast.ASTNode, input: JSValue, environment: JEnv): JSValue {
    let box = boxValue(input);
    let nexpr = elaboratePredicates(expr);
    let result = doEval(nexpr, box, environment);
    return unbox(result);
}

function boxValue(input: JSValue): JBox {
    // TODO: Have to flatten here
    let values = input == undefined ? undefined : Array.isArray(input) ? (input as JSValue[]) : [input];
    let box: Box<JSValue> = { values: values, preserveSingleton: false };
    return box;
}

function unbox(result: JBox): JSValue {
    if (result.values == undefined) return undefined;
    if (result.values.length == 1 && !result.preserveSingleton) return result.values[0];
    return result.values;
}

function doEval(expr: ast.ASTNode, input: JBox, environment: JEnv): JBox {
    switch (expr.type) {
        case "variable": {
            return evaluateVariable(expr, input, environment);
        }
        case "path": {
            return evaluatePath(expr, input, environment);
        }
        case "name": {
            return evaluateName(expr, input, environment);
        }
        case "predicate": {
            return evaluatePredicate(expr, input, environment);
        }
        case "bind": {
            return evaluateBinding(expr, input, environment);
        }
        case "literal": {
            return boxValue(expr.value);
        }
        case "block": {
            return evaluateBlock(expr, input, environment);
        }
        case "binary": {
            return evaluateBinaryOperation(expr, input, environment);
        }
        case "array":
        case "unary":
        case "wildcard":
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
            /* istanbul ignore next */
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
    let ret: JBox = boxValue(input.values.map(elem => unbox(applySteps(expr.steps, boxValue(elem), environment))));
    return ret;
}

function applySteps(steps: ast.ASTNode[], elem: JBox, environment: JEnv): JBox {
    let result = elem;
    steps.forEach(step => (result = doEval(step, result, environment)));
    return result;
}

function evaluateName(expr: ast.NameNode, input: JBox, environment: JEnv): JBox {
    if (input.values == undefined) return ubox;
    return boxmap(input, elem => elem[expr.value]);
}

function evaluatePredicate(expr: ast.PredicateNode, input: JBox, environment: JEnv): JBox {
    let predicate = expr.condition;
    // First, evaluate the core value of the predicate
    let value = doEval(expr.lhs, input, environment);
    if (predicate.type === "literal" && isNumeric(predicate.value)) {
        let index = Math.floor(predicate.value);
        if (index < 0) index += value.values.length;
        if (index < 0 || index >= value.values.length) return ubox;
        return boxValue(value.values[index]);
    }
    throw new Error("Complex filters not yet implemented");
}

function evaluateBinding(expr: ast.BindNode, input: JBox, environment: JEnv): JBox {
    let lhs = expr.lhs;
    if (lhs.type==="variable") {
        let x = lhs;
        let val = doEval(expr.rhs, input, environment);
        environment.bind(x.value, unbox(val));
        return val;
    } else {
        throw new Error("Left hand side of binding must be a variable (at "+expr.lhs.position+")");
    }
}

export function evaluateBlock(expr: ast.BlockNode, input: JBox, enclosing: JEnv): JBox {
    let environment = new JEnv(enclosing);
    return expr.expressions.reduce((prev, e) => doEval(e, input, environment), ubox);
}

export function evaluateBinaryOperation(expr: ast.BinaryOperationNode, input: JBox, environment: JEnv): JBox {
    let lhs = unbox(doEval(expr.lhs, input, environment));
    let rhs = unbox(doEval(expr.rhs, input, environment));
    let value = expr.value;
    switch(value) {
        case "+": {
            if (isNumber(lhs) && isNumber(rhs)) {
                return boxValue(lhs+rhs)
            }
            throw new Error("Invalid operands for +");
        }
        case "-":
        case "*":
        case "/":
        case "%":
        case "=":
        case "!=":
        case "<":
        case "<=":
        case ">":
        case ">=":
        case "&":
        case "and":
        case "or":
        case "..":
        case "in": {
            throw new Error("Operator "+expr.value+" unimplemented");
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

