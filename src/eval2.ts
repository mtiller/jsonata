import * as ast from './ast';
import { unexpectedValue } from './utils';
import { JEnv, JSValue } from './environment';
import { Box, JBox, ubox } from './box';

export function eval2(expr: ast.ASTNode, input: JSValue, environment: JEnv): JSValue {
    let box = boxValue(input);
    let result = doEval(expr, box, environment);
    return unbox(result);
}

function boxValue(input: JSValue): JBox {
    let values = input == undefined ? undefined : (Array.isArray(input) ? (input as JSValue[]) : [input]);
    let box: Box<JSValue> = { values: values, preserveSingleton: false }; 
    return box;  
}

function unbox(result: JBox): JSValue {
    if (result.values==undefined) return undefined;
    if (result.values.length==1 && !result.preserveSingleton) return result.values[0];
    return result.values;    
}

function doEval(expr: ast.ASTNode, input: JBox, environment: JEnv): JBox {
    switch(expr.type) {
        case "variable": {
            return evaluateVariable(expr, input, environment);
        }
        case "path": {
            return evaluatePath(expr, input, environment);
        }
        case "name": {
            return evaluateName(expr, input, environment);
        }
        case "binary":
        case "array":
        case "unary":
        case "literal":
        case "wildcard":
        case "descendant":
        case "condition":
        case "block":
        case "bind":
        case "regex":
        case "function":
        case "lambda":
        case "partial":
        case "apply":
        case "sort":
        case "group":
        case "transform": {
            /* istanbul ignore next */
            throw new Error("AST node type '"+expr.type+"' is unimplemented");
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
            return unexpectedValue<ast.ASTNode>(expr, expr, (v) => "Evaluate failed to handle case where expression type was "+v.type);
    }
}

function evaluateVariable(expr: ast.VariableNode, input: JBox, environment: JEnv): JBox {
    /* Get the variable name */
    const varname = expr.value;

    /* If the variable name is empty, then just return the input */
    if (varname=="") return input;

    /* Otherwise, lookup the variable in the environment */
    let result = environment.lookup(varname);

    /* If not found, return an undefined value */
    if (result==undefined) return ubox;

    /* Otherwise, return a value */
    return {
        values: [result],
        preserveSingleton: true,
    }
}

function evaluatePath(expr: ast.PathNode, input: JBox, environment: JEnv): JBox {
    if (input.values==undefined) return undefined;
    let ret = input.values.map((elem) => unbox(applySteps(expr.steps, boxValue(elem), environment)));
    return boxValue(ret);
}

function applySteps(steps: ast.ASTNode[], elem: JBox, environment: JEnv): JBox {
    let result = elem;
    steps.forEach((step) => result = doEval(step, result, environment));
    return result;
}

function evaluateName(expr: ast.NameNode, input: JBox, environment: JEnv): JBox {
    if (input.values==undefined) return undefined;
    return boxmap(input, (elem) => elem[expr.value]);
}

function boxmap(box: JBox, f: (v: JSValue) => JSValue): JBox {
    if (box.values==undefined) return { ...box };
    let vals = box.values.map((v) => f(v));
    return { ...box, values: vals };
}