import * as ast from "../ast";
import { unexpectedValue, isArrayOfNumbers } from "../utils";
import { JEnv, JSValue } from "./environment";
import { JBox, ubox, boxmap, boxValue, unbox } from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { isNumber } from "util";

export function eval2(expr: ast.ASTNode, input: JSValue, environment: JEnv): JSValue {
    let box = boxValue(input);
    let nexpr = elaboratePredicates(expr);
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
    let lhs = doEval(expr.lhs, input, environment);
    // Then evaluate the predicate
    let pval = doEval(predicate, lhs, environment);
    if (isArrayOfNumbers(pval.values)) {
        let indices = pval.values
        .map((x) => Math.floor(x as number))
        .map((x) => x < 0 ? x+lhs.values.length : x);
        return boxValue(indices.map((i) => lhs.values[i]));
    }
    // Treat pvals as truthy values indicating whether to keep the i_th element
    // in the left hand side.
    return boxValue(lhs.values.filter((x, i) => !!pval.values[i]));
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

function evaluateArray(expr: ast.ArrayConstructorNode, input: JBox, environment: JEnv): JBox {
    let elems = expr.expressions.map((e) => {
        let v = doEval(e, input, environment);
        return v.scalar ? v.values[0] : v.values;
    });
    return {
        values: elems,
        scalar: false,
        preserveSingleton: false,
    }
}