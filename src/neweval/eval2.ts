import * as ast from "../ast";
import { FunctionDetails } from "./procs";
import { unexpectedValue, isArrayOfStrings } from "../utils";
import { JEnv } from "./environment";
import * as errors from "../errors";
import * as semantics from "../semantics";
import {
    JSValue,
    Box,
    ubox,
    boxValue,
    unbox,
    forEachValue,
    mapOverValues,
    boxContainsFunction,
    defragmentBox,
    boxLambda,
    boxFunction,
    BoxType,
    boxArray,
    unboxArray,
    fragmentBox,
} from "./box";
import { elaboratePredicates } from "../transforms/predwrap";
import { apply, partialApplyProcedure, partialApplyNativeFunction } from "./apply";
import { parseSignature } from "../signatures";
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

// TODO: Do not export!
export function doEval(expr: ast.ASTNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    switch (expr.type) {
        /* These are all leaf node types (have no children) */
        case "literal": {
            return boxValue(expr.value);
        }
        case "variable": {
            /* Get the variable name */
            const varname = expr.value;
            /* If the variable name is empty, then just return the input */
            if (varname == "") return input;
            /* Otherwise, lookup the variable in the environment */
            return environment.lookup(varname);
        }
        case "name": {
            return semantics.evaluateName(expr.value, input);
        }
        case "wildcard": {
            return semantics.evaluateWildcard(input);
        }
        /* These are all operator nodes of some kind (they have children) */
        case "array": {
            let vals = expr.expressions.map(c => doEval(c, input, environment, options));
            return defragmentBox(vals, true);
        }
        case "predicate": {
            let lhs = doEval(expr.lhs, input, environment, options);
            let vals = fragmentBox(lhs);
            let preds = vals.map(val => doEval(expr.condition, val, environment, options));
            return semantics.evaluatePredicate(lhs, preds);
        }
        case "bind": {
            let val = doEval(expr.rhs, input, environment, options);
            environment.bindBox(expr.lhs.value, val);
            return val;
        }
        case "block": {
            let nested = new JEnv(options, environment);
            return expr.expressions.reduce((prev, e) => doEval(e, input, nested, options), ubox);
        }
        case "path": {
            let first = doEval(expr.steps[0], input, environment, options);
            let nonpred = ast.nonpredicateNode(expr.steps[0]);
            let path = semantics.extractSteps(expr, input, first, nonpred, options.legacyMode);

            let cur = path.path.reduce((prev, step, index) => {
                let last = step.type !== "array" && index == path.path.length - 1;
                // If the "head" is a ubox, then we still do a "map over".  But if
                // any subsequent step yields a ubox, we are done because there is
                // nothing to map over (see object-constructor case0007 for an example).
                if (index > 0 && prev === ubox) return prev;
                return mapOverValues(prev, c => doEval(step, c, environment, options), last);
            }, path.head);

            if (expr.keepSingletonArray) {
                cur = boxArray(unboxArray(cur));
            }
            return cur;
        }
        case "binary": {
            let lhs = doEval(expr.lhs, input, environment, options);
            let rhs = doEval(expr.rhs, input, environment, options);
            let op = expr.value;
            return semantics.evaluateBinaryOperation(lhs, rhs, op);
        }
        case "lambda": {
            // TODO: Change to a boxFunction?  I tried this once and one issue I ran
            // into is that function invocations are wrapped in a thunk (argumentless
            // lambda).  I'm not sure why, but this is why apply(...) has a loop
            // and an applyInner call.  Ideally, we will need to keep lambda nodes,
            // but I'd like to get rid of lambda boxes and replace them with Javascript
            // closures so they can be invoked just like native functions with
            // all eval and validation stuff encapsulated in them.  But for now,
            // we get this... :-)
            return boxLambda({
                input: input,
                environment: environment,
                options: options,
                arguments: expr.arguments,
                signature: expr.signature,
                body: expr.body,
                thunk: expr.thunk === true,
            });
        }
        case "function": {
            // create the procedure
            // can't assume that expr.procedure is a lambda type directly
            // could be an expression that evaluates to a function (e.g. variable reference, parens expr etc.
            // evaluate it generically first, then check that it is a function.  Throw error if not.
            let proc = doEval(expr.procedure, input, environment, options);
            let evaluatedArgs = expr.arguments.map(arg => doEval(arg, input, environment, options));

            let headName: string | null = semantics.functionName(expr);

            // If a) we couldn't evaluate the procedure expressiona and b) the procedure
            // was specified by a path and c) the first step in the path does exist, then
            // perhaps the user meant for the procedure to be a variable dereference and
            // simply forgot the leading $
            if (proc === ubox && headName !== null && environment.lookup(headName).type != BoxType.Void) {
                // help the user out here if they simply forgot the leading $
                throw errors.error({
                    code: "T1005",
                    token: headName,
                });
            }

            // apply the procedure
            try {
                // TODO: Refactor function types so we return closures that call apply
                // rather than calling apply ourselves.
                let ret = apply(proc, evaluatedArgs, input, options);
                return ret;
            } catch (err) {
                // add the position field to the error
                err.position = expr.position;
                // and the function identifier
                err.token = headName || expr.procedure.value;
                throw err;
            }
        }
        case "unary": {
            let lhs = doEval(expr.expression, input, environment, options);
            return semantics.evaluateUnaryMinus(lhs, expr);
        }
        case "unary-group":
        case "group": {
            // Determine what the "input" value should be.
            let lhs =
                expr.type !== "unary-group" && expr.lhs !== null
                    ? doEval(expr.lhs, input, environment, options)
                    : input;

            // TODO: Hold over from from v1.5+ (legacyMode?)
            if (lhs.type == BoxType.Void) {
                lhs = boxValue(null);
            }

            // Break LHS into individual values
            let items = fragmentBox(lhs);

            // Evaluate all keys
            let data = items.map(item => ({
                item: item,
                keys: expr.groupings.map(grouping => doEval(grouping.key, item, environment, options)),
            }));

            let result = semantics.evaluateGroup(expr.groupings, data);

            let ret = Object.keys(result).reduce((prev, key) => {
                let entry = result[key];
                let inputs = defragmentBox(entry.itemIndices.map(i => data[i].item), true);
                let val = doEval(expr.groupings[entry.groupIndex].value, inputs, environment, options);
                prev[key] = unbox(val);
                return prev;
            }, {});

            // Take the resulting object and return it.
            return boxValue(ret);
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
            return semantics.evaluateDescendant(input);
        }
        case "partial": {
            return evaluatePartialApplication(expr, input, environment, options);
        }
        case "sort": {
            let lhs = doEval(expr.lhs, input, environment, options);
            let entries = fragmentBox(lhs);
            let ranked: semantics.Ranked = {
                terms: expr.rhs.length,
                descending: expr.rhs.map(rhs => rhs.descending),
                entries: entries.map((entry, entryIndex) => ({
                    values: expr.rhs.map(rhs => doEval(rhs.expression, entry, environment, options)),
                })),
            };
            let indexed = entries.map((e, index) => ({ index: index, value: e }));
            let comp = semantics.comparator(ranked);
            let sorted = indexed.sort(comp);
            return defragmentBox(sorted.map(e => e.value));
        }
        case "regex": {
            return semantics.evaluateRegex(expr.value, expr.position);
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
        case "singleton": {
            /* istanbul ignore next */
            throw new Error("Raw AST node of type " + expr.type + " found in optimized tree");
        }
        /* istanbul ignore next */
        case "operator": {
            /* istanbul ignore next */
            throw new Error("Attempted to evaluate symbolic AST 'operator' node");
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

function evaluatePartialApplication(
    expr: ast.FunctionInvocationNode,
    input: any,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    // lookup the procedure
    let proc = doEval(expr.procedure, input, environment, options);
    let uproc = unbox(proc);

    //var proc = yield * evaluate(expr.procedure, input, environment);
    if (
        typeof uproc === "undefined" &&
        expr.procedure.type === "path" &&
        environment.lookup(expr.procedure.steps[0].value).type != BoxType.Void
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
            return partialApplyProcedure(proc.details, expr.arguments, input, environment, options);
        case BoxType.Function:
            return partialApplyNativeFunction(proc.details.implementation, expr.arguments, input, environment, options);
        case BoxType.Value:
            if (proc.scalar) {
                let val = proc.values[0];
                // This shouldn't happen, boxValue shouldn't allow it.
                if (typeof val === "function") {
                    throw new Error("Got a ValueBox with a function inside?!");
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
}

function evaluateApplyExpression(expr: ast.ApplyNode, input: Box, environment: JEnv, options: EvaluationOptions): Box {
    // If rhs is a function invocation, invoke it with the lhs as the first argument
    if (expr.rhs.type == "function") {
        // Construct a function with the LHS expression inserted as the first
        // argument and then return the result of evaluating it.
        return doEval(semantics.prependArgument(expr.rhs, expr.lhs), input, environment, options);
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
        // Needs to be equivalent to: function($f, $g) { function($x){ $g($f($x)) } }

        let details: FunctionDetails = {
            implementation: x => {
                let inner = apply(lhs, [boxValue(x)], input, options);
                let ret = apply(func, [inner], input, options);
                // TODO: We need to handle arrays a funny way? (FFI related)
                // Should be done in apply(...)?
                return unbox(ret);
            },
            signature: undefined,
        };
        return boxFunction(details);
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

                // Ensure the match is an object
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
                        throw errors.error({
                            code: "T2011",
                            value: update,
                            position: expr.update.position,
                        });
                    }
                    Object.keys(update).forEach(key => (match[key] = update[key]));
                }
                if (expr.delete) {
                    let del = unbox(doEval(expr.delete, matchbox, environment, options)) as string[];
                    if (del) {
                        if (typeof del == "string") del = [del];
                        if (!isArrayOfStrings(del)) {
                            throw errors.error({
                                code: "T2012",
                                value: del,
                                position: expr.delete.position,
                            });
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
