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
    details: ProcedureDetails<any>;
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
            return [ubox];
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
    // Of we are just defragging a bunch of Void boxes, then the result is void unless
    // we are specifically creating an array value in which case the result
    // should be an empty array.
    if (boxes.every(x => x.type == BoxType.Void)) return array ? boxArray([]) : ubox;

    // Because of the previous line, we know that at least one of the boxes we are
    // folding over contains values.
    let values = boxes.reduce((prev: Array<any> | undefined, box) => {
        switch (box.type) {
            case BoxType.Void:
                return prev;
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

export function flattenBox(box: Box): Box {
    return defragmentBox(fragmentBox(box));
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

export function boxLambda(input: ProcedureDetails<any>): Box {
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
    if (input && ["input", "environment", "body"].every(prop => input.hasOwnProperty(prop))) {
        return {
            type: BoxType.Lambda,
            details: input as ProcedureDetails<any>,
        };
    }
    if (input && input.hasOwnProperty("implementation") && input.hasOwnProperty("signature")) {
        return {
            type: BoxType.Function,
            details: input as FunctionDetails,
        };
    }
    if (input && typeof input === "function") {
        return {
            type: BoxType.Function,
            details: {
                implementation: input as Function,
                signature: null,
            },
        };
    }
    if (Array.isArray(input)) {
        let values = input.filter(x => x !== undefined);
        if (values.length == 0) return ubox;
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
            // Not sure how this could happen either.
            // TODO: Remove
            if (result.values == undefined) return undefined;
            // This should not happen because boxing an empty array should
            // result in a ubox.
            // TODO: Throw exception
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
            return result.details.implementation;
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
    // If there are no values to loop over, then just return
    if (box === ubox) return;
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    fragments.forEach(f);
}

export async function asyncMapOverValues(box: Box, f: (input: Box) => Promise<Box>, lastStep: boolean): Promise<Box> {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = await Promise.all(fragments.map(f));

    // If there was only one box in the mapped set and it contains an array with
    // a single element, then we preserve it as an array by making it a BoxType.Array.
    // Why? Because that is how v1.5+ does it.
    // TODO: Use this only in legacy mode?!?
    if (lastStep && mapped.length == 1) {
        let first = mapped[0];
        // if (first.type == BoxType.Array && first.values.length == 1) return boxArray([first.values[0]]);
        if (first.type == BoxType.Value && first.values.length == 1 && !first.scalar) {
            return first;
        }
    }
    // Now defragment back to a single boxed value
    return defragmentBox(mapped, false);
}

export function mapOverValues(box: Box, f: (input: Box) => Box, lastStep: boolean): Box {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = fragments.map(f);

    // If there was only one box in the mapped set and it contains an array with
    // a single element, then we preserve it as an array by making it a BoxType.Array.
    // Why? Because that is how v1.5+ does it.
    // TODO: Use this only in legacy mode?!?
    if (lastStep && mapped.length == 1) {
        let first = mapped[0];
        // if (first.type == BoxType.Array && first.values.length == 1) return boxArray([first.values[0]]);
        if (first.type == BoxType.Value && first.values.length == 1 && !first.scalar) {
            return first;
        }
    }
    // Now defragment back to a single boxed value
    return defragmentBox(mapped, false);
}

export function filterOverValues(box: Box, predicate: BoxPredicate, array: boolean = false): Box {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.filter(predicate);
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped, array);
}

export function sortBox(box: Box, comparator: (a: Box, b: Box) => number): Box {
    let fragments = fragmentBox(box);
    fragments.sort(comparator);
    return defragmentBox(fragments);
}

export function boxContainsFunction(arg: Box) {
    switch (arg.type) {
        case BoxType.Function:
        case BoxType.Lambda:
            return true;
        case BoxType.Value:
            return typeof unbox(arg) === "function";
        default:
            return false;
    }
}
