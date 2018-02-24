export type JSValue = number | string | boolean | object | Function;
import { ProcedureDetails, FunctionDetails } from "./procs";
import { unexpectedValue } from "../utils";

export enum BoxType {
    Lambda = "lambda",
    Function = "function",
    Value = "value",
    Array = "array",
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

export interface ArrayBox extends BoxFlags {
    type: BoxType.Array;
    values: JSValue[];
}

export interface BoxFlags {
    scalar: boolean; // Started life as a scalar (for cases when `1` and `[1]` should be treated differently)
    preserve: boolean; // i.e., do not flatten
}
// export interface Box extends BoxFlags {
//     values: JSValue[] | undefined;
// }

export type Box = ValueBox | FunctionBox | LambdaBox | ArrayBox;

export const ubox: ValueBox = { values: undefined, scalar: true, preserve: false, type: BoxType.Value };
export type BoxPredicate = (item: Box, index: number, boxes: Box[]) => boolean;

export function boxmap(box: Box, f: (v: JSValue) => JSValue): Box {
    if (box.values == undefined) return ubox;
    switch (box.type) {
        case BoxType.Array: {
            let vals = box.values.map(v => f(v)).filter(x => x !== undefined);
            return boxArray(vals);
        }
        case BoxType.Value: {
            let vals = box.values.map(v => f(v)).filter(x => x !== undefined);
            if (vals.length == 1) return boxValue(vals[0]);
            return boxValue(vals);
        }
        case BoxType.Lambda:
        case BoxType.Function:
            return ubox;
        default:
            return unexpectedValue<Box>(
                box,
                box,
                v => "Evaluate failed to handle case where expression type was " + v.type,
            );
    }
}

/**
 * This function takes a box full of values and creates a box for each
 * value contained in the original box.
 * @param box
 */
export function fragmentBox(box: Box): Box[] {
    if (box.values === undefined) return [];
    switch (box.type) {
        case BoxType.Array:
        case BoxType.Value:
            return box.values.map(v => boxValue(v));
        case BoxType.Lambda:
        case BoxType.Function:
            return [box];
        default:
            return unexpectedValue<Box>(box, box, v => "Tried to fragment unknown box type: " + v.type);
    }
}

/**
 * This function takes an array of boxes and defragments their values
 * into a single set of values.  This involves concatenating all the
 * individual values together and then flattening all of them into
 * a single value array and then boxing that up.
 * @param box
 */
export function defragmentBox(box: Box[], array: boolean = false): Box {
    let values = box.reduce((prev, box) => {
        if (box.preserve) return [...prev, box.values];
        return [...prev, ...box.values];
    }, []);
    // Create a new box
    if (array) {
        return boxArray(values);
    } else {
        if (values.length == 1) return boxValue(values[0]);
        return boxValue(values);
    }
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

export function boxArray(input: JSValue[]): Box {
    // TODO: Remove eventually
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    let values = input;
    return {
        values: values, // Remove any undefined values
        scalar: false,
        preserve: true,
        type: BoxType.Array,
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

export function mapOverValues(box: Box, f: (input: Box) => Box, array: boolean = false): Box {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = fragments.map(f);
    // Now defragment back to a single boxed value
    return defragmentBox(mapped, array);
}
export function filterOverValues(box: Box, predicate: BoxPredicate, array: boolean = false): Box {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.filter(predicate);
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped, array);
}
