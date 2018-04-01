import * as ast from "../ast";
import { ProcedureDetails } from "./procs";
import { unexpectedValue, isArrayOfNumbers, flatten, isArrayOfStrings } from "../utils";
import { JEnv } from "./environment";
import * as errors from "../errors";
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
    boxContainsFunction,
    defragmentBox,
    boxLambda,
    boxFunction,
    BoxType,
    boxType,
    boxArray,
    unboxArray,
    sortBox,
} from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { isNumber } from "util";
import { apply, partialApplyProcedure, partialApplyNativeFunction } from "./apply";
import { parseSignature } from "../signatures";
import { functionString } from "../functions";
import { EvaluationOptions, normalizeOptions } from "./options";

export function eval2(
    expr: ast.ASTNode,
    input: JSValue,
    environment: JEnv,
    opts: Partial<EvaluationOptions> = {},
): JSValue {
    let options = normalizeOptions(opts);
    let box = boxValue(input);
    let nexpr = elaboratePredicates(expr);
    environment.bind("$", input);
    let result = doEval(nexpr, box, environment, options);
    return unbox(result);
}

export function doEval(expr: ast.ASTNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
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
            return evaluateArray(expr, input, environment, options);
        }
        case "predicate": {
            return evaluatePredicate(expr, input, environment, options);
        }
        case "bind": {
            return evaluateBinding(expr, input, environment, options);
        }
        case "block": {
            return evaluateBlock(expr, input, environment, options);
        }
        case "path": {
            return evaluatePathCompat(expr, input, environment, options);
        }
        case "binary": {
            return evaluateBinaryOperation(expr, input, environment, options);
        }
        case "lambda": {
            return evaluateLambda(expr, input, environment);
        }
        case "function": {
            return evaluateFunction(expr, input, environment, options);
        }
        case "unary": {
            switch (expr.value) {
                case "-":
                    return evaluateUnaryMinus(expr, input, environment, options);
                case "{":
                    return evaluateGroup(expr.lhs, input, environment, options);
                default:
                    return unexpectedValue<ast.UnaryMinusNode | ast.UnaryObjectNode>(
                        expr,
                        expr,
                        v => "Unknown unary operators " + v.value,
                    );
            }
        }
        case "group": {
            let lhs = doEval(expr.lhs, input, environment, options);
            return evaluateGroup_overwrite(expr.groupings, lhs, environment, options);
        }
        case "condition": {
            let cond = doEval(expr.condition, input, environment, options);
            let c = unbox(cond);
            if (!!c) {
                return doEval(expr.then, input, environment, options);
            } else {
                return expr.else ? doEval(expr.else, input, environment, options) : ubox;
            }
        }
        case "apply": {
            return evaluateApplyExpression(expr, input, environment, options);
        }
        case "transform": {
            return evaluateTransform(expr, input, environment, options);
        }
        case "descendant": {
            return evaluateDescendant(expr, input, environment);
        }
        case "partial": {
            return evaluatePartialApplication(expr, input, environment, options);
        }
        case "sort": {
            return evaluateSort(expr, input, environment, options);
        }
        case "regex": {
            return evaluateRegex(expr, input, environment);
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
            throw new Error("Raw AST node of type " + expr.type + " found in optimized tree");
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

// function isVariable(expr: ast.ASTNode): boolean {
//     if (expr.type == "predicate") return isVariable(expr.lhs);
//     return expr.type == "variable";
// }

interface Path {
    head: Box;
    path: ast.ASTNode[];
}

function nonpredicateNode(node: ast.ASTNode): ast.ASTNode {
    if (node.type === "predicate") {
        return nonpredicateNode(node.lhs);
    }
    return node;
}

function extractSteps(expr: ast.PathNode, input: Box, environment: JEnv, options: EvaluationOptions): Path {
    let first = expr.steps[0];
    let rest = expr.steps.slice(1);
    if (options.legacyMode) {
        let nonpred = nonpredicateNode(first);
        // If first node is an array (constructor), then we should treat the array
        // as the effective input
        if (nonpred.type === "array" && nonpred.consarray) {
            return {
                head: doEval(first, input, environment, options),
                path: rest,
            };
        }
        // If the first is a variable, then we need to start our path with a
        // scalar input vector...
        if (nonpred.type === "variable") {
            return {
                head: boxArray([unbox(input)]),
                path: expr.steps,
            };
        }
        switch (input.type) {
            case BoxType.Void:
                return { head: boxArray([unbox(input)]), path: expr.steps };
            case BoxType.Array:
                return { head: input, path: expr.steps };
            case BoxType.Value: {
                if (input.values.length == 0) return { head: boxArray([unbox(input)]), path: expr.steps };
                return { head: input, path: expr.steps };
            }
            // ???
            default:
                return { head: input, path: expr.steps };
        }
    }

    throw new Error("Cannot evaluate non-legacy paths (yet)");
}

function evaluatePathCompat(expr: ast.PathNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    let path = extractSteps(expr, input, environment, options);

    let result = path.path.reduce(
        (prev, step, index) =>
            mapOverValues(
                prev,
                c => doEval(step, c, environment, options),
                step.type !== "array" && index == path.path.length - 1,
            ),
        path.head,
    );

    if (expr.keepSingletonArray) {
        result = boxArray(unboxArray(result));
    }
    return result;
}

function partition<T>(x: T[], pred: (x: T) => boolean) {
    return x.reduce(
        (prev, v) => {
            if (pred(v)) return { matched: [...prev.matched, v], unmatched: prev.unmatched };
            else return { matched: prev.matched, unmatched: [...prev.unmatched, v] };
        },
        { matched: [] as T[], unmatched: [] as T[] },
    );
}

function evaluatePartialApplication(
    expr: ast.FunctionInvocationNode,
    input: any,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    let part = partition(expr.arguments, arg => arg.type === "operator" && arg.value === "?");
    let unevaluatedArgs = part.matched;
    let evaluatedArgs = part.unmatched;
    // // evaluate the arguments
    // var evaluatedArgs = [];
    // for (var ii = 0; ii < expr.arguments.length; ii++) {
    //     var arg = expr.arguments[ii];
    //     if (arg.type === "operator" && arg.value === "?") {
    //         evaluatedArgs.push(arg);
    //     } else {
    //         evaluatedArgs.push(yield * evaluate(arg, input, environment));
    //     }
    // }
    // lookup the procedure
    let proc = doEval(expr.procedure, input, environment, options);
    //var proc = yield * evaluate(expr.procedure, input, environment);
    if (
        typeof proc === "undefined" &&
        expr.procedure.type === "path" &&
        environment.lookup(expr.procedure.steps[0].value)
    ) {
        // help the user out here if they simply forgot the leading $
        throw {
            code: "T1007",
            stack: new Error().stack,
            position: expr.position,
            token: expr.procedure.steps[0].value,
        };
    }

    switch (proc.type) {
        case BoxType.Lambda:
            return partialApplyProcedure(proc.details, unevaluatedArgs, evaluatedArgs, input, environment, options);
        case BoxType.Function:
            return partialApplyNativeFunction(
                proc.details.implementation,
                unevaluatedArgs,
                evaluatedArgs,
                input,
                environment,
                options,
            );
        case BoxType.Value:
            if (proc.scalar) {
                let val = proc.values[0];
                if (typeof val === "function") {
                    return partialApplyNativeFunction(val, unevaluatedArgs, evaluatedArgs, input, environment, options);
                }
            }
            throw errors.error({
                code: "T1008",
            });
        default:
            throw errors.error({
                code: "T1008",
            });
    }
    // if (isLambda(proc)) {
    //     result = partialApplyProcedure(proc, evaluatedArgs);
    // } else if (proc && proc._jsonata_function === true) {
    //     result = partialApplyNativeFunction(proc.implementation, evaluatedArgs);
    // } else if (typeof proc === "function") {
    //     result = partialApplyNativeFunction(proc, evaluatedArgs);
    // } else {
    //     throw {
    //         code: "T1008",
    //         stack: new Error().stack,
    //         position: expr.position,
    //         token: expr.procedure.type === "path" ? expr.procedure.steps[0].value : expr.procedure.value,
    //     };
    // }
    // return result;
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

function evaluatePredicate(expr: ast.PredicateNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    /* First, fragement all values in the left and side into their own box */
    let lhs = doEval(expr.lhs, input, environment, options);
    /* Construct a predicate function that we can filter this list based on */
    let predicate = filterPredicate(expr.condition, environment, options);
    /* Use the predicate closure to filter the values in LHS */
    return filterOverValues(lhs, predicate);
}

/**
 * This function returns a closure that we can use to filter a Box[].
 * @param predicate The AST node for the predicate expression
 * @param environment The environment in which the evaluation is done.
 */
function filterPredicate(predicate: ast.ASTNode, environment: JEnv, options: EvaluationOptions) {
    return (item: Box, ind: number, lhs: Box[]) => {
        // Perform the evaluation of the predicate in the context of the value
        // it applies to
        let pv = doEval(predicate, item, environment, options);
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

function evaluateBinding(expr: ast.BindNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    let lhs = expr.lhs;
    let x = lhs;
    let val = doEval(expr.rhs, input, environment, options);
    environment.bindBox(x.value, val);
    return val;
}

export function evaluateBlock(expr: ast.BlockNode, input: Box, enclosing: JEnv, options: EvaluationOptions): Box {
    let environment = new JEnv(enclosing);
    return expr.expressions.reduce((prev, e) => doEval(e, input, environment, options), ubox);
}

export function evaluateBinaryOperation(
    expr: ast.BinaryOperationNode,
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    let lhs = unbox(doEval(expr.lhs, input, environment, options));
    let rhs = unbox(doEval(expr.rhs, input, environment, options));
    let value = expr.value;
    switch (value) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "%": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!isNumber(lhs)) {
                throw errors.error({
                    code: "T2001",
                    token: value,
                });
            }
            if (!isNumber(rhs)) {
                throw errors.error({
                    code: "T2002",
                    token: value,
                });
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
            let ltype = typeof lhs;
            let rtype = typeof rhs;

            let validate = () => {
                // if aa or bb are not string or numeric values, then throw an error
                if (!(ltype === "string" || ltype === "number") || !(rtype === "string" || rtype === "number")) {
                    throw {
                        code: "T2010",
                        stack: new Error().stack,
                        value: !(ltype === "string" || ltype === "number") ? lhs : rhs,
                    };
                }

                //if aa and bb are not of the same type
                if (ltype !== rtype) {
                    throw {
                        code: "T2009",
                        stack: new Error().stack,
                        value: lhs,
                        value2: rhs,
                    };
                }
            };
            switch (value) {
                case "=":
                    return boxValue(lhs === rhs);
                case "!=":
                    return boxValue(lhs !== rhs);
                case "<":
                    validate();
                    return boxValue(lhs < rhs);
                case "<=":
                    validate();
                    return boxValue(lhs <= rhs);
                case ">":
                    validate();
                    return boxValue(lhs > rhs);
                case ">=":
                    validate();
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
            let lstr = lhs == undefined ? "" : functionString(lhs);
            let rstr = lhs == undefined ? "" : functionString(rhs);
            return boxValue(lstr + rstr);
        }
        case "..": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!isNumber(lhs))
                throw new Error("Invalid operand for LHS of " + value + " operator: " + JSON.stringify(lhs));
            if (!isNumber(rhs))
                throw new Error("Invalid operand for RHS of " + value + " operator: " + JSON.stringify(rhs));
            if (!Number.isInteger(lhs)) {
                throw {
                    code: "T2003",
                    stack: new Error().stack,
                    value: lhs,
                };
            }
            if (!Number.isInteger(rhs)) {
                throw {
                    code: "T2004",
                    stack: new Error().stack,
                    value: rhs,
                };
            }
            let lhsv = lhs as number;
            let rhsv = rhs as number;

            // if the lhs is greater than the rhs, return undefined
            if (lhsv > rhsv) return ubox;

            let result = new Array(rhs - lhs + 1);
            for (var item = lhs, index = 0; item <= rhs; item++, index++) {
                result[index] = item;
            }
            return boxValue(result);
        }
        case "in": {
            if (lhs === undefined || rhs === undefined) return ubox;
            if (!Array.isArray(rhs)) return boxValue(rhs === lhs);
            return boxValue(rhs.some(x => x === lhs));
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

function evaluateArray(expr: ast.ArrayConstructorNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    // Evaluate every expression and reconstitute them by flattening (where
    // allowed) but mark this result of all this as an array (preserve=true).
    let vals = expr.expressions.map(c => doEval(c, input, environment, options));
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
function evaluateFunction(
    expr: ast.FunctionInvocationNode,
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    // create the procedure
    // can't assume that expr.procedure is a lambda type directly
    // could be an expression that evaluates to a function (e.g. variable reference, parens expr etc.
    // evaluate it generically first, then check that it is a function.  Throw error if not.
    let proc = doEval(expr.procedure, input, environment, options);

    let uproc = unbox(proc);

    // If a) we couldn't evaluate the procedure expressiona and b) the procedure
    // was specified by a path and c) the first step in the path does exist, then
    // perhaps the user meant for the procedure to be a variable dereference and
    // simply forgot the leading $
    if (
        typeof uproc === "undefined" &&
        expr.procedure.type === "path" &&
        environment.lookup(expr.procedure.steps[0].value).type != BoxType.Void
    ) {
        // help the user out here if they simply forgot the leading $
        throw {
            code: "T1005",
            stack: new Error().stack,
            position: expr.position,
            token: expr.procedure.steps[0].value,
        };
    }

    let evaluatedArgs = expr.arguments.map(arg => doEval(arg, input, environment, options));

    // apply the procedure
    try {
        let ret = apply(proc, evaluatedArgs, input, options);
        return ret;
    } catch (err) {
        // add the position field to the error
        err.position = expr.position;
        // and the function identifier
        err.token = expr.procedure.type === "path" ? expr.procedure.steps[0].value : expr.procedure.value;
        throw err;
    }
}

function evaluateUnaryMinus(expr: ast.UnaryMinusNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    let lhs = doEval(expr.expression, input, environment, options);
    if (lhs.type == BoxType.Void) return ubox;
    if (boxType(lhs, "number")) {
        let v = unbox(lhs) as number;
        return boxValue(-v);
    } else {
        throw errors.error({
            code: "D1002",
            position: expr.position,
            token: expr.value,
            value: unbox(lhs),
        });
    }
}

// This is an alternative that stores the value expression to be applied to each
// input value.  The problem with this is that it fails for object-constructor/case022.json.
export function evaluateGroup_overwrite(
    groupings: ast.ASTNode[][],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
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
            let keyBox = doEval(keyExpr, x, environment, options);

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
        let values = result[key].map(res => doEval(res.expr, res.input, environment, options));
        prev[key] = unbox(defragmentBox(values));
        return prev;
    }, {});
    // Take the resulting object and return it.
    return boxValue(ret);
}

// This is an alternative that stores the value expression to be applied to each
// input value.  The problem with this is that it fails for object-constructor/case022.json.
export function evaluateGroup_fix(
    groupings: ast.ASTNode[][],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
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
            let keyBox = doEval(keyExpr, x, environment, options);

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
        let values = result[key].map(res => doEval(res.expr, res.input, environment, options));
        prev[key] = unbox(defragmentBox(values));
        return prev;
    }, {});
    // Take the resulting object and return it.
    return boxValue(ret);
}

interface KeyData {
    items: JSValue[];
    expr: ast.ASTNode;
    groupIndex: number;
}
// This is wrong, it uses a single value expressions in the case of repeated
// keys (although it handles object-constructor/case022.json).
export function evaluateGroup(
    groupings: ast.ASTNode[][],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    let result: { [key: string]: KeyData } = {};

    // TODO: More odd semantics from v1.5+
    if (input.type == BoxType.Void) {
        input = boxValue(null);
    }

    // We loop first over all inputs and for each input we evaluate the expression
    // for the keys in the object constructor.  Then, we make a record of all input
    // values associated with each key and the value expression we will use to
    // evaluate them.
    forEachValue(input, item => {
        let val = unbox(item);
        // Next, we loop over the pairs of key and value
        groupings.forEach((grouping, groupIndex) => {
            // TODO: Convert this array to an object so we can refer to this by
            // rather than by index.
            let keyExpr = grouping[0];
            let valueExpr = grouping[1];

            // Now, evaluate the key expression.
            let keyBox = doEval(keyExpr, item, environment, options);

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

            if (result.hasOwnProperty(key)) {
                let entry = result[key];

                if (entry.groupIndex != groupIndex) {
                    // this key has been generated by another expression in this group
                    // per issue #163 (https://github.com/jsonata-js/jsonata/issues/163),
                    // this is a semantic error.
                    throw {
                        code: "D1009",
                        stack: new Error().stack,
                        position: keyExpr.position,
                        value: key,
                    };
                }
                entry.items.push(val);
            } else {
                result[key] = {
                    items: [val],
                    expr: valueExpr,
                    groupIndex: groupIndex,
                };
            }
        });
    });

    let ret = Object.keys(result).reduce((prev, key) => {
        let entry = result[key];
        let input = boxValue(entry.items);
        let val = doEval(entry.expr, input, environment, options);
        prev[key] = unbox(val);
        return prev;
    }, {});

    // Take the resulting object and return it.
    return boxValue(ret);
}

function evaluateApplyExpression(expr: ast.ApplyNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    // If rhs is a function invocation, invoke it with the lhs as the first argument
    if (expr.rhs.type == "function") {
        // Construct a function with the LHS expression inserted as the first
        // argument and then return the result of evaluating it.
        let f: ast.FunctionInvocationNode = {
            type: "function",
            value: expr.rhs.value,
            position: expr.rhs.position,
            procedure: expr.rhs.procedure,
            arguments: [expr.lhs, ...expr.rhs.arguments],
            nextFunction: expr.rhs.nextFunction,
        };
        return doEval(f, input, environment, options);
    }

    // If we get here, we expect the rhs to evaluate to a function (vs. being a
    // function invocation).  So let's evaluate both the rhs and the lhs and
    // see what we get.
    let lhs = doEval(expr.lhs, input, environment, options);
    let func = doEval(expr.rhs, input, environment, options);

    // The value of func must be a function, if it isn't, we thrown an exception
    if (!boxContainsFunction(func)) {
        throw {
            code: "T2006",
            stack: new Error().stack,
            position: expr.position,
            value: func,
        };
    }

    if (boxContainsFunction(lhs)) {
        let inner = apply(lhs, [input], lhs, options);
        return apply(func, [inner], func, options);
    } else {
        // TODO: In v1.5, the third argument here is environment?!?
        return apply(func, [lhs], input, options);
    }
}

function evaluateTransform(expr: ast.TransformNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    let transformFunction = (args: Array<{}>): Array<{}> | {} => {
        if (args === undefined) return undefined;
        if (!Array.isArray(args)) args = [args];
        // We know, from the signature, that args will contain an array of objects.
        // So now we loop over each one.

        let ret = args.map(obj => {
            // Rebox a copy of the value.  We do this because we will mutate the object.
            let clone = boxValue(JSON.parse(JSON.stringify(obj)));

            // Find subobjects of obj that match our pattern in **the clone**
            let matches = doEval(expr.pattern, clone, environment, options);

            // Loop over each match.  Note that this part requires that the sub-object
            // contained in the matchbox is a **reference** to the matching portion
            // of the object in the clone variable.  This is because we **mutate this in place**.
            forEachValue(matches, (matchbox: Box) => {
                // Extract the matching object
                let match = unbox(matchbox);

                // Ensure the match is an object (this ch)
                if (typeof match != "object") {
                    // This check and associated exception don't appear in v1.5
                    // and yet the exerciser detects the error.  I don't understand
                    // exactly how that happens.
                    throw new Error("Expected object but got " + typeof match);
                }

                // Evaluate the update "patch" we want to apply
                let update = unbox(doEval(expr.update, matchbox, environment, options));
                if (update) {
                    if (typeof update != "object") {
                        // throw type error
                        throw {
                            code: "T2011",
                            stack: new Error().stack,
                            position: expr.update.position,
                            value: update,
                        };
                    }
                    Object.keys(update).forEach(key => (match[key] = update[key]));
                }
                if (expr.delete) {
                    let del = unbox(doEval(expr.delete, matchbox, environment, options)) as string[];
                    if (del) {
                        if (typeof del == "string") del = [del];
                        if (!isArrayOfStrings(del)) {
                            throw {
                                code: "T2012",
                                stack: new Error().stack,
                                position: expr.delete.position,
                                value: del,
                            };
                        }
                        del.forEach(str => {
                            delete match[str];
                        });
                    }
                }
            });
            // Remember that this has been mutated in place so we are returning
            // the mutated value.
            let ret = unbox(clone);
            return ret;
        });
        // TODO: This is to be consistent with how
        if (ret.length == 1) return ret[0];
        return ret;
    };
    let signature = parseSignature("<(oa):o>");
    return boxFunction({
        implementation: transformFunction,
        signature: signature,
    });
}

function evaluateDescendant(expr: ast.DescendantNode, input: Box, environment: JEnv): Box {
    switch (input.type) {
        case BoxType.Void:
        case BoxType.Lambda:
        case BoxType.Function:
            return ubox;
        case BoxType.Array:
        case BoxType.Value:
            let val = unbox(input);
            return boxValue(descendants(val));
    }
}

function descendants(val: any): Array<any> {
    if (Array.isArray(val)) {
        return val.reduce((prev, x) => [...prev, ...descendants(x)], []);
    } else {
        if (typeof val != "object") return [val];
        return Object.keys(val).reduce((prev, x) => [...prev, ...descendants(val[x])], [val]);
    }
}

function comparator(rhs: ast.SortTerm[], environment: JEnv, options: EvaluationOptions) {
    return (a: Box, b: Box): number => {
        for (let i = 0; i < rhs.length; i++) {
            let term = rhs[i];
            let aval = unbox(doEval(term.expression, a, environment, options));
            let bval = unbox(doEval(term.expression, b, environment, options));

            let atype = typeof aval;
            let btype = typeof bval;

            if (atype === "undefined") {
                if (btype === "undefined") continue;
                return 1;
            }
            if (btype === "undefined") return -1;

            // if aa or bb are not string or numeric values, then throw an error
            if (!(atype === "string" || atype === "number") || !(btype === "string" || btype === "number")) {
                throw errors.error({
                    code: "T2008",
                    value: !(atype === "string" || atype === "number") ? aval : bval,
                });
            }

            let scale = term.descending ? -1 : 1;
            //if aa and bb are not of the same type
            if (atype !== btype) {
                throw errors.error({
                    code: "T2007",
                    value: aval,
                    value2: bval,
                });
            }
            // both the same - move on to next term
            if (aval === bval) continue;
            return aval < bval ? -scale : scale;
        }
        // If no RHS terms, everything is equal
        return 0;
    };
}

function evaluateSort(expr: ast.SortNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    let lhs = doEval(expr.lhs, input, environment, options);
    let comp = comparator(expr.rhs, environment, options);
    return sortBox(lhs, comp);
}

function evaluateRegex(expr: ast.RegexNode, input: Box, environment: JEnv): Box {
    expr.value.lastIndex = 0;
    const closure = str => {
        var re = expr.value;
        var result;
        var match = re.exec(str);
        if (match !== null) {
            result = {
                match: match[0],
                start: match.index,
                end: match.index + match[0].length,
                groups: [],
            };
            if (match.length > 1) {
                for (var i = 1; i < match.length; i++) {
                    result.groups.push(match[i]);
                }
            }
            result.next = () => {
                if (re.lastIndex >= str.length) {
                    return undefined;
                } else {
                    var next = closure(str);
                    if (next && next.match === "" && re.lastIndex === expr.value.lastIndex) {
                        // matches zero length string; this will never progress
                        throw {
                            code: "D1004",
                            stack: new Error().stack,
                            position: expr.position,
                            value: expr.value.source,
                        };
                    }
                    return next;
                }
            };
        }

        return result;
    };
    return boxFunction({
        implementation: closure,
        signature: undefined,
    });
}
