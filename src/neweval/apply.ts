import { doEval } from "./eval2";
import { EvaluationOptions } from "./options";
import { ProcedureDetails } from "./procs";
import { unbox, boxValue, BoxType, Box, boxLambda, ubox, boxArray, boxFunction } from "./box";
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
            let self = unbox(context);
            let validatedArgs = validateArguments(details.signature, args, context);
            let val = details.implementation.apply(self, validatedArgs.map(unbox));
            if (Array.isArray(val) && val.length == 0) return boxArray(val);
            return boxValue(val);
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
    let ucon = unbox(context);
    var validatedArgs = signature.validate(uargs, ucon);
    // When boxing and unboxing for functions, we preserve [] as an array
    // vs. returning undefined.
    // TODO: Create a special "box" function for marshaling and unmarshaling
    // for functions (this logic appears elsewhere so isn't DRY).
    // Such a function should marshal lambdas as FUNCTIONS (closures) so there
    // is no need to handle them specially inside the function.
    return validatedArgs.map(x => (Array.isArray(x) && x.length == 0 ? boxArray(x) : boxValue(x)));
}

/**
 * Partially apply procedure
 *
 * The goal of this function is to bind all known variables to the environment
 * and provide information (in the lambda box returned) about how many arguments
 * remain unevaluated.
 *
 * @param {Object} proc - Procedure
 * @param {Array} args - Arguments
 * @returns {{lambda: boolean, input: *, environment: {bind, lookup}, arguments: Array, body: *}} Result of partially applied procedure
 */
export function partialApplyProcedure(
    details: ProcedureDetails,
    args: Array<ast.ASTNode>,
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
) {
    // create a closure, bind the supplied parameters and return a function that takes the remaining (?) parameters
    let env = new JEnv(options, details.environment);
    //var env = createFrame(proc.environment);
    let unevaluated: Array<ast.ASTNode> = [];

    details.arguments.forEach((param, index) => {
        let arg = args[index];
        if (arg && arg.type === "operator" && arg.value === "?") {
            unevaluated.push(param);
        } else {
            if (arg) {
                let val = doEval(arg, input, environment, options);
                env.bindBox(param.value, val);
            } else {
                env.bindBox(param.value, ubox);
            }
        }
    });

    return boxLambda({
        input: details.input,
        environment: env,
        options: options,
        arguments: unevaluated,
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
    args: ast.ASTNode[],
    input: Box,
    environment: JEnv,
    options: EvaluationOptions,
): Box {
    // This method is called when we a native function is partially evaluated.
    // What this means is that **some** arguments of the native function have already
    // been specified and bound but others are "unbound".

    // We can determine whether an argument is bound or not by looping over the arguments
    // (they are found in the `args` variable).  Any argument that is of type 'operator'
    // is "unbound", all others are bound.

    // To address this partial evaluation, we create a new function that accepts
    // as arguments values for the unbound variables.  We then combine these values
    // for the unbound variables with the current values for the bound variables.

    // The variable 'pargs' here are the positional (unnamed) arguments that we
    // will shortly match up with the unbound variables.  Internally, we construct
    // the full set of arguments, 'fargs', that we will pass to the underlying
    // native function, 'f', by iterating over the 'args' and either
    let rest = (...pargs: any[]) => {
        let pos = 0;
        let fargs = args.map(arg => {
            if (arg.type === "operator") {
                return pargs[pos++];
            } else {
                let bval = doEval(arg, input, environment, options);
                // TODO: Use special FFI unbox?
                return unbox(bval);
            }
        });
        args.forEach(arg => {
            if (arg.type === "operator") {
                fargs.push(pargs[pos]);
                pos++;
            } else {
                let bval = doEval(arg, input, environment, options);
                fargs.push(unbox(bval));
            }
        });
        let ret = f(...fargs);
        return ret;
    };

    return boxFunction({
        implementation: rest,
        signature: undefined,
    });
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
        if (index >= args.length) {
            // This happens if not enough arguments are provided
            // console.log(
            //     `Received ${args.length} arguments to procedure ${details.body} when ${
            //         details.arguments.length
            //     } were expected`,
            // );
            // In this case, we just assume the unprovided arguments are undefined
            env.bindBox(param.value, ubox);
        } else {
            env.bindBox(param.value, args[index]);
        }
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
