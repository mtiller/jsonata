import { doEval } from "./eval2";
import { EvaluationOptions } from "./options";
import { ProcedureDetails } from "./procs";
import { unbox, boxValue, BoxType, Box, boxLambda } from "./box";
import { JEnv } from "./environment";
import { Signature } from "../signatures";
import { unexpectedValue } from "../utils";
import * as ast from "../ast";

/**
 * Apply procedure or function
 * @param {Object} proc - Procedure
 * @param {Array} args - Arguments
 * @param {Object} self - Self
 * @returns {*} Result of procedure
 */
export function apply(proc: Box, args: Box[], context: Box, options: EvaluationOptions): Box {
    let result = applyInner(proc, args, context, options);

    // As long as this is a lambda AND it has a thunk, we continue in this loop.
    // First we establish if it is a lambda (which allows us to extract the
    // ProcedureDetails) and then we determine if it is a thunk.
    while (result.type === BoxType.Lambda) {
        let details = result.details;
        if (details.thunk) {
            let body = details.body;
            if (typeof body !== "function" && (body.type === "function" || body.type === "partial")) {
                let node = body;
                // trampoline loop - this gets invoked as a result of tail-call optimization
                // the function returned a tail-call thunk
                // unpack it, evaluate its arguments, and apply the tail call
                var next = doEval(node.procedure, details.input, details.environment, options);
                let evaluatedArgs = node.arguments.map(x => doEval(x, details.input, details.environment, options));

                result = applyInner(next, evaluatedArgs, context, options);
            } else {
                throw {
                    code: "T1006",
                    stack: new Error().stack,
                };
            }
        } else {
            // Turns out it wasn't a thunk, so just return what we have.
            break;
        }
    }
    return result;
}

/**
 * Apply procedure (ProcedureDetails) or function
 * @param {Object} proc - Procedure
 * @param {Array} args - Arguments
 * @param {Object} self - Self
 * @returns {*} Result of procedure
 */
function applyInner(proc: Box, args: Box[], context: Box, options: EvaluationOptions): Box {
    switch (proc.type) {
        case BoxType.Lambda: {
            let details = proc.details;
            let validatedArgs = validateArguments(details.signature, args, context);
            return applyProcedure(details, validatedArgs, options);
        }
        case BoxType.Function: {
            let details = proc.details;
            let validatedArgs = validateArguments(details.signature, args, context);
            let self = unbox(context);
            return boxValue(details.implementation.apply(self, validatedArgs.map(unbox)));
        }
        case BoxType.Array:
        case BoxType.Value: {
            let validatedArgs = args.map(arg => unbox(arg));
            let f = unbox(proc);
            let self = unbox(context);
            if (typeof f === "function") {
                return boxValue(f.apply(self, validatedArgs));
            } else {
                throw {
                    code: "T1006",
                    stack: new Error().stack,
                };
            }
        }
        case BoxType.Void:
            throw {
                code: "T1006",
                stack: new Error().stack,
            };
        default: {
            return unexpectedValue<Box>(
                proc,
                proc,
                v => "applyInner failed to handle case where result type was " + v.type,
            );
        }
    }
}

/**
 * Validate the arguments against the signature validator (if it exists)
 * @param {Function} signature - validator function
 * @param {Array} args - function arguments
 * @param {*} context - context value
 * @returns {Array} - validated arguments
 */
function validateArguments(signature: Signature, args: Box[], context: Box): Box[] {
    if (typeof signature === "undefined") {
        // nothing to validate
        return args;
    }
    // TODO: Need a version of signature.validate that takes boxes because
    // unboxing and reboxing may not work properly for arrays, functions and procedures.
    let uargs = args.map(v => unbox(v));
    var validatedArgs = signature.validate(uargs, unbox(context));
    return validatedArgs.map(x => boxValue(x));
}

/**
 * Partially apply procedure
 * @param {Object} proc - Procedure
 * @param {Array} args - Arguments
 * @returns {{lambda: boolean, input: *, environment: {bind, lookup}, arguments: Array, body: *}} Result of partially applied procedure
 */
export function partialApplyProcedure(
    details: ProcedureDetails,
    unevaluatedArgs: ast.ASTNode[],
    evaluatedArgs: ast.ASTNode[],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
) {
    // create a closure, bind the supplied parameters and return a function that takes the remaining (?) parameters
    let env = new JEnv(options, details.environment);
    //var env = createFrame(proc.environment);

    // Add arguments that should be evaluated to the environment
    evaluatedArgs.forEach(earg => env.bind(earg.value, doEval(earg, input, environment, options)));
    return boxLambda({
        input: details.input,
        environment: env,
        options: options,
        arguments: unevaluatedArgs,
        body: details.body,
        signature: undefined,
        thunk: false,
    });
}

/**
 * Partially apply native function
 * @param {Function} f: Function - Native function
 * @param {Array} args - Arguments
 * @returns {{lambda: boolean, input: *, environment: {bind, lookup}, arguments: Array, body: *}} Result of partially applying native function
 */
export function partialApplyNativeFunction(
    f: Function,
    unevaluatedArgs: ast.ASTNode[],
    evaluatedArgs: ast.ASTNode[],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    // create a lambda function that wraps and invokes the native function
    // get the list of declared arguments from the native function
    // this has to be picked out from the toString() value

    const sigArgs = getNativeFunctionArguments(f);

    let proc: ProcedureDetails = {
        body: (f as any) as ast.ASTNode,
        input: input,
        arguments: sigArgs.map((arg): ast.VariableNode => ({ type: "variable", value: arg, position: 0 })),
        signature: undefined,
        environment: environment,
        options: options,
        thunk: false,
    };

    return partialApplyProcedure(proc, unevaluatedArgs, evaluatedArgs, input, environment, options);
}

/**
 * Apply procedure
 * @param {Object} proc - Procedure
 * @param {Array} args - Arguments
 * @returns {*} Result of procedure
 */
function applyProcedure(details: ProcedureDetails, args: Box[], options: EvaluationOptions): Box {
    let env = new JEnv(options, details.environment);

    details.arguments.forEach((param, index) => {
        env.bindBox(param.value, args[index]);
    });
    if (typeof details.body === "function") {
        // this is a lambda that wraps a native function - generated by partially evaluating a native
        return applyNativeFunction(details.body, env);
    } else {
        return doEval(details.body, details.input, env, options);
    }
}

/**
 * Apply native function
 * @param {Object} proc - Procedure
 * @param {Object} env - Environment
 * @returns {*} Result of applying native function
 */
function applyNativeFunction(f: Function, env: JEnv): Box {
    var sigArgs = getNativeFunctionArguments(f);
    // generate the array of arguments for invoking the function - look them up in the environment
    let args = sigArgs.map(sigArg => unbox(env.lookup(sigArg.trim())));

    return boxValue(f.apply(null, args));
}

/**
 * Get native function arguments
 * @param {Function} func - Function
 * @returns {*|Array} Native function arguments
 */
function getNativeFunctionArguments(func: Function): string[] {
    var signature = func.toString();
    var sigParens = /\(([^)]*)\)/.exec(signature)[1]; // the contents of the parens
    var sigArgs = sigParens.split(",");
    return sigArgs;
}
