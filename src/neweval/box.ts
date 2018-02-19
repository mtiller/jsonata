import { JSValue } from "./environment";
import { flatten } from "../utils";

export interface Box<T> {
    values: T[] | undefined;
    scalar: boolean;
    preserveSingleton: boolean;
}

export const ubox: Box<JSValue> = { values: undefined, scalar: true, preserveSingleton: false };
export type JBox = Box<JSValue>;

export function boxmap(box: JBox, f: (v: JSValue) => JSValue): JBox {
    if (box.values == undefined) return { ...box };
    let vals = box.values.map(v => f(v)).filter(x => x !== undefined);
    return boxValue(vals);
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
export function defragmentBox(box: JBox[]): JBox {
    // Merge all values together
    let values = flatten(box.map(n => n.values));
    // Create a new box
    return boxValue(values);
}
export function unboxValues(boxes: JBox[]): JBox {
    return boxValue(flatten(boxes.map(box => box.values)));
}

function isBox(val: any): boolean {
    if (typeof val !== "object") return false;
    return val.hasOwnProperty("scalar") && val.hasOwnProperty("values");
}

export function boxValue(input: JSValue): JBox {
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
            preserveSingleton: false,
        };
    } else {
        return {
            values: [input],
            scalar: true,
            preserveSingleton: false,
        };
    }
}

export function unbox(result: JBox, preserveSingleton?: boolean): JSValue {
    // TODO: Remove eventually
    if (!isBox(result)) {
        throw new Error("Trying to unbox non-box");
    }
    if (result.values == undefined) return undefined;
    if (result.values.length === 0) return undefined;
    if (result.values.length == 1 && (!preserveSingleton || !result.preserveSingleton)) return result.values[0];
    return result.values;
}

export function mapOverValues(box: JBox, f: (input: JBox) => JBox): JBox {
    // Break all values out into individual boxes
    let fragments = fragmentBox(box);
    // Map over each box
    let mapped = fragments.map(f);
    // Now defragment back to a single boxed value
    return defragmentBox(mapped);
}
export function filterOverValues(box: JBox, predicate: (item: JBox, index: number, boxes: JBox[]) => boolean): JBox {
    let fragments = fragmentBox(box);
    // Eval each boxed value
    let mapped = fragments.filter(predicate);
    // Defragment values back into a single boxed collection of values
    return defragmentBox(mapped);
}
