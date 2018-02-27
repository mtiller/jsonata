export type JSValue = number | string | boolean | object | Function;
import { ProcedureDetails, FunctionDetails } from "./procs";
import { unexpectedValue } from "../utils";

export enum BoxType {
    Void = "void",
    Lambda = "lambda",
    Function = "function",
    Value = "value",
    Array = "array",
}

export interface VoidBox extends BoxFlags {
    type: BoxType.Void;
}

export interface LambdaBox extends BoxFlags {
    type: BoxType.Lambda;
    details: ProcedureDetails;
}

export interface FunctionBox extends BoxFlags {
    type: BoxType.Function;
    details: FunctionDetails;
}

export interface ValueBox extends BoxFlags {
    type: BoxType.Value;
    scalar: boolean; // Started life as a scalar (for cases when `1` and `[1]` should be treated differently)
    values: JSValue[];
}

export interface ArrayBox extends BoxFlags {
    type: BoxType.Array;
    values: JSValue[];
}

export interface BoxFlags {}

export type Box = ValueBox | FunctionBox | LambdaBox | ArrayBox | VoidBox;

export const ubox: VoidBox = { type: BoxType.Void };
export type BoxPredicate = (item: Box, index: number, boxes: Box[]) => boolean;

export function boxmap(box: Box, f: (v: JSValue) => JSValue): Box {
    // if (box.values == undefined) return ubox;
    switch (box.type) {
        case BoxType.Void: {
            return ubox;
        }
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
    switch (box.type) {
        case BoxType.Void:
            return [];
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
 * @param boxes
 */
export function defragmentBox(boxes: Box[], array: boolean = false): Box {
    let values = boxes.reduce((prev, box) => {
        switch (box.type) {
            case BoxType.Void:
                return [];
            case BoxType.Array:
                return [...prev, box.values];
            case BoxType.Lambda:
                return [...prev, box.details];
            case BoxType.Function:
                return [...prev, box.details];
            case BoxType.Value:
                return [...prev, ...box.values];
            default:
                return unexpectedValue<Box>(box, box, v => "Couldn't defrag unknown box type " + v.type);
        }
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
    switch (val.type) {
        case BoxType.Void:
        case BoxType.Array:
        case BoxType.Value:
        case BoxType.Lambda:
        case BoxType.Function:
            return true;
        default:
            return false;
    }
}

export function boxFunction(input: FunctionDetails): Box {
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    if (input === undefined) return ubox;
    return {
        details: input,
        type: BoxType.Function,
    };
}

export function boxLambda(input: ProcedureDetails): Box {
    // TODO: Remove eventually
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    if (input === undefined) return ubox;
    return {
        details: input,
        type: BoxType.Lambda,
    };
}

export function boxArray(input: JSValue[]): ArrayBox {
    // TODO: Remove eventually
    if (isBox(input)) {
        throw new Error("Boxed value being boxed!?!");
    }
    let values = input;
    return {
        values: values, // Remove any undefined values
        type: BoxType.Array,
    };
}

export function boxValue(input: JSValue, options: Partial<BoxFlags> = {}): Box {
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
            type: BoxType.Value,
            ...options,
        };
    } else {
        return {
            values: [input],
            scalar: true,
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
    switch (result.type) {
        case BoxType.Value: {
            if (result.values == undefined) return undefined;
            if (result.values.length === 0) return undefined;
            return result.scalar ? result.values[0] : result.values;
        }
        case BoxType.Array: {
            return result.values;
        }
        case BoxType.Lambda: {
            return result.details;
        }
        case BoxType.Function: {
            return result.details;
        }
        case BoxType.Void: {
            return undefined;
        }
        default:
            return unexpectedValue<Box>(result, result, v => "Unboxed unexpected box type: " + v.type);
    }
}

export function unboxArray(result: Box): JSValue[] {
    // TODO: Remove eventually
    if (!isBox(result)) {
        throw new Error("Trying to unbox non-box");
    }
    switch (result.type) {
        case BoxType.Value: {
            return result.values;
        }
        case BoxType.Array: {
            return result.values;
        }
        case BoxType.Lambda: {
            return [result.details];
        }
        case BoxType.Function: {
            return [result.details];
        }
        case BoxType.Void: {
            return [];
        }
        default:
            return unexpectedValue<Box>(result, result, v => "Unboxed unexpected box type: " + v.type);
    }
}

export function boxType(box: Box, t: string) {
    let val = unbox(box);
    return typeof val === t;
}

export function reduceBox<T>(box: Box, f: (prev: T, frag: Box) => T, init: T): T {
    let fragments = fragmentBox(box);
    return fragments.reduce(f, init);
}

export function forEachValue(box: Box, f: (input: Box) => void): void {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    fragments.forEach(f);
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
