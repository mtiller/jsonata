import * as ast from "../ast";
import { ProcedureDetails } from "./procs";
import { unexpectedValue, isArrayOfNumbers, flatten } from "../utils";
import { JEnv } from "./environment";
import {
    JSValue,
    Box,
    ubox,
    boxmap,
    boxValue,
    unbox,
    forEachValue,
    mapOverValues,
    filterOverValues,
    defragmentBox,
    boxLambda,
    BoxType,
    boxType,
} from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { isNumber, isString } from "util";
import { apply } from "./apply";

export function eval2(expr: ast.ASTNode, input: JSValue, environment: JEnv): JSValue {
    let box = boxValue(input);
    let nexpr = elaboratePredicates(expr);
    environment.bind("$", input);
    let result = doEval(nexpr, box, environment);
    return unbox(result);
}

export function doEval(expr: ast.ASTNode, input: Box, environment: JEnv): Box {
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
        case "lambda": {
            return evaluateLambda(expr, input, environment);
        }
        case "function": {
            return evaluateFunction(expr, input, environment);
        }
        case "unary": {
            switch (expr.value) {
                case "-":
                    return evaluateUnaryMinus(expr, input, environment);
                case "{":
                    return evaluateGroup_overwrite(expr.lhs, input, environment);
                default:
                    return unexpectedValue<ast.UnaryMinusNode | ast.UnaryObjectNode>(
                        expr,
                        expr,
                        v => "Unknown unary operators " + v.value,
                    );
            }
        }
        case "group": {
            let lhs = doEval(expr.lhs, input, environment);
            return evaluateGroup_overwrite(expr.groupings, lhs, environment);
        }
        case "descendant":
        case "condition":
        case "regex":
        case "partial":
        case "apply":
        case "sort":
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

function evaluateVariable(expr: ast.VariableNode, input: Box, environment: JEnv): Box {
    /* Get the variable name */
    const varname = expr.value;
    /* If the variable name is empty, then just return the input */
    if (varname == "") return input;
    /* Otherwise, lookup the variable in the environment */
    return environment.lookup(varname);
}

function evaluatePath(expr: ast.PathNode, input: Box, environment: JEnv): Box {
    //if (input.values == undefined) return ubox;
    if (expr.steps.length == 0) throw new Error("Path without zero steps...this shouldn't happen");

    let [step0, ...rest] = expr.steps;
    let res0 = doEval(step0, input, environment);

    return rest.reduce((prev, step) => {
        return mapOverValues(prev, c => doEval(step, c, environment));
    }, res0);
}

function evaluateName(expr: ast.NameNode, input: Box, environment: JEnv): Box {
    if (input.type === BoxType.Void) return ubox;
    return boxmap(input, elem => (typeof elem === "object" ? elem[expr.value] : undefined));
}

function evaluateWildcard(expr: ast.WildcardNode, input: Box, environment: JEnv): Box {
    if (input.type === BoxType.Void) return ubox;
    let val = unbox(input);
    if (val === undefined || val === null) return ubox;
    // We don't need to check if val is an object because Object.keys() works
    // for all values, it just returns an empty list for anything but an object.
    return boxValue(flatten(Object.keys(val).map((k, i) => val[k])));
}

function evaluatePredicate(expr: ast.PredicateNode, input: Box, environment: JEnv): Box {
    /* First, fragement all values in the left and side into their own box */
    let lhs = doEval(expr.lhs, input, environment);
    /* Construct a predicate function that we can filter this list based on */
    let predicate = filterPredicate(expr.condition, environment);
    /* Use the predicate closure to filter the values in LHS */
    return filterOverValues(lhs, predicate);
}

/**
 * This function returns a closure that we can use to filter a Box[].
 * @param predicate The AST node for the predicate expression
 * @param environment The environment in which the evaluation is done.
 */
function filterPredicate(predicate: ast.ASTNode, environment: JEnv) {
    return (item: Box, ind: number, lhs: Box[]) => {
        // Perform the evaluation of the predicate in the context of the value
        // it applies to
        let pv = doEval(predicate, item, environment);
        // Get the array of JS values associated with the predicate evaluation
        let res: JSValue[] = pv.type === BoxType.Value ? pv.values : [];
        // Compute the reverse index (negative number) for the item we evaluated
        let rev = ind - lhs.length;
        // Check if the predicate evaluated to an array of numbers?
        if (isArrayOfNumbers(res)) {
            // If so, floor all numbers and see our index or reverse index is in
            // the list of values.
            return res.map(Math.floor).some(n => n === ind || n === rev);
        } else {
            // If this isn't an array of numbers, treat the result of the predicate
            // evaluation as truthy in deciding whether we include the item or not.
            return !!unbox(pv);
        }
    };
}

function evaluateBinding(expr: ast.BindNode, input: Box, environment: JEnv): Box {
    let lhs = expr.lhs;
    let x = lhs;
    let val = doEval(expr.rhs, input, environment);
    environment.bindBox(x.value, val);
    return val;
}

export function evaluateBlock(expr: ast.BlockNode, input: Box, enclosing: JEnv): Box {
    let environment = new JEnv(enclosing);
    return expr.expressions.reduce((prev, e) => doEval(e, input, environment), ubox);
}

export function evaluateBinaryOperation(expr: ast.BinaryOperationNode, input: Box, environment: JEnv): Box {
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
        case "and":
        case "or": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            switch (value) {
                case "and":
                    return boxValue(!!lhs && !!rhs);
                case "or":
                    return boxValue(!!lhs || !!rhs);
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
        case "&": {
            if (lhs === undefined || rhs === undefined) return boxValue(false);
            if (!isNumber(lhs) && !isString(lhs)) {
                throw new Error("Invalid operand for LHS of " + value + " operator: " + JSON.stringify(lhs));
            }
            if (!isNumber(rhs) && !isString(rhs)) {
                throw new Error("Invalid operand for RHS of " + value + " operator: " + JSON.stringify(rhs));
            }
            let lhsv: string = lhs === undefined ? "" : "" + (lhs as any);
            let rhsv: string = rhs === undefined ? "" : "" + (rhs as any);
            return boxValue(lhsv + rhsv);
        }
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

function evaluateArray(expr: ast.ArrayConstructorNode, input: Box, environment: JEnv): Box {
    // Evaluate every expression and reconstitute them by flattening (where
    // allowed) but mark this result of all this as an array (preserve=true).
    let vals = expr.expressions.map(c => doEval(c, input, environment));
    return defragmentBox(vals, true);
}

function evaluateLambda(expr: ast.LambdaDefinitionNode, input: Box, environment: JEnv): Box {
    let procedure: ProcedureDetails = {
        input: input,
        environment: environment,
        arguments: expr.arguments,
        signature: expr.signature,
        body: expr.body,
        thunk: false,
    };
    if (expr.thunk === true) {
        procedure.thunk = true;
    }
    return boxLambda(procedure);
}

/**
 * Evaluate function against input data
 * @param {Object} expr - JSONata expression
 * @param {Object} input - Input data to evaluate against
 * @param {Object} environment - Environment
 * @param {Object} [applyto] - LHS of ~> operator
 * @returns {*} Evaluated input data
 */
function evaluateFunction(expr: ast.FunctionInvocationNode, input: Box, environment: JEnv): Box {
    // create the procedure
    // can't assume that expr.procedure is a lambda type directly
    // could be an expression that evaluates to a function (e.g. variable reference, parens expr etc.
    // evaluate it generically first, then check that it is a function.  Throw error if not.
    let proc = doEval(expr.procedure, input, environment);

    if (
        typeof proc === "undefined" &&
        expr.procedure.type === "path" &&
        environment.lookup(expr.procedure.steps[0].value)
    ) {
        // help the user out here if they simply forgot the leading $
        throw {
            code: "T1005",
            stack: new Error().stack,
            position: expr.position,
            token: expr.procedure.steps[0].value,
        };
    }

    let evaluatedArgs = expr.arguments.map(arg => doEval(arg, input, environment));

    // apply the procedure
    try {
        return apply(proc, evaluatedArgs, input);
    } catch (err) {
        // add the position field to the error
        err.position = expr.position;
        // and the function identifier
        err.token = expr.procedure.type === "path" ? expr.procedure.steps[0].value : expr.procedure.value;
        throw err;
    }
}

function evaluateUnaryMinus(expr: ast.UnaryMinusNode, input: Box, environment: JEnv): Box {
    let lhs = doEval(expr.expression, input, environment);
    if (lhs.type == BoxType.Void) return ubox;
    if (boxType(lhs, "number")) {
        let v = unbox(lhs) as number;
        return boxValue(-v);
    } else {
        throw {
            code: "D1002",
            stack: new Error().stack,
            position: expr.position,
            token: expr.value,
            value: unbox(lhs),
        };
    }
}

// This is an alternative that stores the value expression to be applied to each
// input value.  The problem with this is that it fails for object-constructor/case022.json.
export function evaluateGroup_overwrite(groupings: ast.ASTNode[][], input: Box, environment: JEnv): Box {
    let result: { [key: string]: Array<{ expr: ast.ASTNode; input: Box }> } = {};
    // We loop first over all inputs and for each input
    forEachValue(input, x => {
        // Next, we loop over the pairs of key and value
        groupings.forEach(grouping => {
            // TODO: Convert this array to an object so we can refer to this by
            // rather than by index.
            let keyExpr = grouping[0];
            let valueExpr = grouping[1];

            // Now, evaluate the key expression.
            let keyBox = doEval(keyExpr, x, environment);

            // If the key isn't a boxed scalar string, then this is an error
            // TODO: Perhaps just a single string value is enough...scalar too strict?
            if (!boxType(keyBox, "string")) {
                throw {
                    code: "T1003",
                    stack: new Error().stack,
                    position: grouping[0].position,
                    value: keyBox,
                };
            }
            // Extract the actual string value
            let key = unbox(keyBox) as string;
            // Figure out all current values for this key (or an empty array if we
            // don't have any
            result[key] = [{ expr: valueExpr, input: x }];
        });
    });
    // At this point, our result is a mapping from keys to Box[].  We need to first
    // defragment each Box[] into a Box and then unbox it.
    let ret = Object.keys(result).reduce((prev, key) => {
        let values = result[key].map(res => doEval(res.expr, res.input, environment));
        prev[key] = unbox(defragmentBox(values));
        return prev;
    }, {});
    // Take the resulting object and return it.
    return boxValue(ret);
}

// This is an alternative that stores the value expression to be applied to each
// input value.  The problem with this is that it fails for object-constructor/case022.json.
export function evaluateGroup_fix(groupings: ast.ASTNode[][], input: Box, environment: JEnv): Box {
    let result: { [key: string]: Array<{ expr: ast.ASTNode; input: Box }> } = {};
    // We loop first over all inputs and for each input
    forEachValue(input, x => {
        // Next, we loop over the pairs of key and value
        groupings.forEach(grouping => {
            // TODO: Convert this array to an object so we can refer to this by
            // rather than by index.
            let keyExpr = grouping[0];
            let valueExpr = grouping[1];

            // Now, evaluate the key expression.
            let keyBox = doEval(keyExpr, x, environment);

            // If the key isn't a boxed scalar string, then this is an error
            // TODO: Perhaps just a single string value is enough...scalar too strict?
            if (!boxType(keyBox, "string")) {
                throw {
                    code: "T1003",
                    stack: new Error().stack,
                    position: grouping[0].position,
                    value: keyBox,
                };
            }
            // Extract the actual string value
            let key = unbox(keyBox) as string;
            // Figure out all current values for this key (or an empty array if we
            // don't have any
            let cur = result[key] || [];
            result[key] = [...cur, { expr: valueExpr, input: x }];
        });
    });
    // At this point, our result is a mapping from keys to Box[].  We need to first
    // defragment each Box[] into a Box and then unbox it.
    let ret = Object.keys(result).reduce((prev, key) => {
        let values = result[key].map(res => doEval(res.expr, res.input, environment));
        prev[key] = unbox(defragmentBox(values));
        return prev;
    }, {});
    // Take the resulting object and return it.
    return boxValue(ret);
}

// This is wrong, it uses a single value expressions in the case of repeated
// keys (although it handles object-constructor/case022.json).
export function evaluateGroup_v15(groupings: ast.ASTNode[][], input: Box, environment: JEnv): Box {
    let result: { [key: string]: Box[] } = {};
    // We loop first over all inputs and for each input
    forEachValue(input, x => {
        // Next, we loop over the pairs of key and value
        groupings.forEach(grouping => {
            // TODO: Convert this array to an object so we can refer to this by
            // rather than by index.
            let keyExpr = grouping[0];
            let valueExpr = grouping[1];

            // Now, evaluate the key expression.
            let keyBox = doEval(keyExpr, x, environment);

            // If the key isn't a boxed scalar string, then this is an error
            // TODO: Perhaps just a single string value is enough...scalar too strict?
            if (!boxType(keyBox, "string")) {
                throw {
                    code: "T1003",
                    stack: new Error().stack,
                    position: grouping[0].position,
                    value: keyBox,
                };
            }
            // Extract the actual string value
            let key = unbox(keyBox) as string;
            // Figure out all current values for this key (or an empty array if we
            // don't have any
            let cur = result[key] || [];
            // Now add what we got here.
            let valueBox = doEval(valueExpr, x, environment);
            result[key] = [...cur, valueBox];
        });
    });
    // At this point, our result is a mapping from keys to Box[].  We need to first
    // defragment each Box[] into a Box and then unbox it.
    let ret = Object.keys(result).reduce((prev, key) => {
        prev[key] = unbox(defragmentBox(result[key]));
        return prev;
    }, {});
    // Take the resulting object and return it.
    return boxValue(ret);
}
