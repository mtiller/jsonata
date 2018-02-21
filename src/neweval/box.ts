import { JSValue } from "./environment";

export interface BoxFlags {
    scalar: boolean; // Started life as a scalar (for cases when `1` and `[1]` should be treated differently)
    preserve: boolean; // i.e., do not flatten
    lambda: boolean; // i.e., is values[0] a lambda?
}
export interface Box<T> extends BoxFlags {
    values: T[] | undefined;
}

export const ubox: Box<JSValue> = { values: undefined, scalar: true, preserve: false, lambda: false };
export type JBox = Box<JSValue>;
export type BoxPredicate = (item: JBox, index: number, boxes: JBox[]) => boolean;

export function boxmap(box: JBox, f: (v: JSValue) => JSValue, options: Partial<BoxFlags> = {}): JBox {
    if (box.values == undefined) return { ...box };
    let vals = box.values.map(v => f(v)).filter(x => x !== undefined);
    if (vals.length == 1) return boxValue(vals[0], options);
    return boxValue(vals, options);
}

/**
 * This function takes a box full of values and creates a box for each
 * value contained in the original box.
 * @param box
 */
export function fragmentBox(box: JBox): JBox[] {
    if (box.values === undefined) return [];
    return box.values.map(v => boxValue(v));
}

/**
 * This function takes an array of boxes and defragments their values
 * into a single set of values.  This involves concatenating all the
 * individual values together and then flattening all of them into
 * a single value array and then boxing that up.
 * @param box
 */
export function defragmentBox(box: JBox[], options: Partial<BoxFlags> = {}): JBox {
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

export function boxValue(input: JSValue, options: Partial<BoxFlags> = {}): JBox {
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
            // TODO: Check if function?!?
            lambda: false,
            ...options,
        };
    } else {
        return {
            values: [input],
            scalar: true,
            preserve: false,
            // TODO: Check if function?!?
            lambda: false,
            ...options,
        };
    }
}

export function unbox(result: JBox): JSValue {
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

export function mapOverValues(box: JBox, f: (input: JBox) => JBox, options: Partial<BoxFlags> = {}): JBox {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = fragments.map(f);
    // Now defragment back to a single boxed value
    return defragmentBox(mapped, options);
}
export function filterOverValues(box: JBox, predicate: BoxPredicate, options: Partial<BoxFlags> = {}): JBox {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.filter(predicate);
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped, options);
}
