export type JSValue = number | string | boolean | object | Function;
import { ProcedureDetails, FunctionDetails } from "./procs";

export enum BoxType {
    Lambda = "lambda",
    Function = "function",
    Value = "value",
}

export interface LambdaBox extends BoxFlags {
    type: BoxType.Lambda;
    values: ProcedureDetails[];
}

export interface FunctionBox extends BoxFlags {
    type: BoxType.Function;
    values: FunctionDetails[];
}

export interface ValueBox extends BoxFlags {
    type: BoxType.Value;
    values: JSValue[];
}

export interface BoxFlags {
    scalar: boolean; // Started life as a scalar (for cases when `1` and `[1]` should be treated differently)
    preserve: boolean; // i.e., do not flatten
}
// export interface Box extends BoxFlags {
//     values: JSValue[] | undefined;
// }

export type Box = ValueBox | FunctionBox | LambdaBox;

export const ubox: ValueBox = { values: undefined, scalar: true, preserve: false, type: BoxType.Value };
export type BoxPredicate = (item: Box, index: number, boxes: Box[]) => boolean;

export function boxmap(box: Box, f: (v: JSValue) => JSValue, options: Partial<BoxFlags> = {}): Box {
    if (box.values == undefined) return ubox;
    if (box.type === BoxType.Value) {
        let vals = box.values.map(v => f(v)).filter(x => x !== undefined);
        if (vals.length == 1) return boxValue(vals[0], options);
        return boxValue(vals, options);
    }
    return ubox;
}

/**
 * This function takes a box full of values and creates a box for each
 * value contained in the original box.
 * @param box
 */
export function fragmentBox(box: Box): Box[] {
    if (box.values === undefined) return [];
    if (box.type === BoxType.Value) {
        return box.values.map(v => boxValue(v));
    }
    return [box];
}

/**
 * This function takes an array of boxes and defragments their values
 * into a single set of values.  This involves concatenating all the
 * individual values together and then flattening all of them into
 * a single value array and then boxing that up.
 * @param box
 */
export function defragmentBox(box: Box[], options: Partial<BoxFlags> = {}): Box {
    let values = box.reduce((prev, box) => {
        if (box.preserve) return [...prev, box.values];
        return [...prev, ...box.values];
    }, []);
    // Create a new box
    if (values.length == 1) return boxValue(values[0], options);
    return boxValue(values, options);
}

function isBox(val: any): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val !== "object") return false;
    return val.hasOwnProperty("scalar") && val.hasOwnProperty("values");
}

export function boxLambda(input: ProcedureDetails): Box {
    // TODO: Remove eventually
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    if (input === undefined) return ubox;
    return {
        values: [input],
        scalar: true,
        preserve: false,
        type: BoxType.Lambda,
    };
}

export function boxValue(input: JSValue, options: Partial<BoxFlags> = {}): ValueBox {
    // TODO: Remove eventually
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    if (input === undefined) return ubox;
    if (Array.isArray(input)) {
        let values = input.filter(x => x !== undefined);
        return {
            values: values, // Remove any undefined values
            scalar: false,
            preserve: false,
            type: BoxType.Value,
            ...options,
        };
    } else {
        return {
            values: [input],
            scalar: true,
            preserve: false,
            type: BoxType.Value,
            ...options,
        };
    }
}

export function unbox(result: Box): JSValue {
    // TODO: Remove eventually
    if (!isBox(result)) {
        throw new Error("Trying to unbox non-box");
    }
    if (result.scalar) {
        if (result.values == undefined) return undefined;
        if (result.values.length === 0) return undefined;
        if (result.values.length == 1 && !result.preserve) return result.values[0];
        // I don't think this should happen if something is marked scalar
        return result.values;
    } else {
        if (result.values.length === 0 && !result.preserve) return undefined;
        return result.values;
    }
}

export function mapOverValues(box: Box, f: (input: Box) => Box, options: Partial<BoxFlags> = {}): Box {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = fragments.map(f);
    // Now defragment back to a single boxed value
    return defragmentBox(mapped, options);
}
export function filterOverValues(box: Box, predicate: BoxPredicate, options: Partial<BoxFlags> = {}): Box {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.filter(predicate);
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped, options);
}
