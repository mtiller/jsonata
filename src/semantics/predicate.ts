import { Box, filterOverValues, BoxType, JSValue, unbox } from "./box";
import { isArrayOfNumbers } from "../utils";

export function evaluatePredicate(lhs: Box, preds: Box[]): Box {
    /* Construct a predicate function that we can filter this list based on */
    let predicate = filterPredicate(preds);
    /* Use the predicate closure to filter the values in LHS */
    return filterOverValues(lhs, predicate);
}

/**
 * This function returns a closure that we can use to filter a Box[].
 * @param predicate The AST node for the predicate expression
 * @param environment The environment in which the evaluation is done.
 */
function filterPredicate(vals: Box[]) {
    return (item: Box, ind: number, lhs: Box[]) => {
        // Perform the evaluation of the predicate in the context of the value
        // it applies to
        //let pv = doEval(predicate, item, environment, options);
        let pv = vals[ind];
        // Get the array of JS values associated with the predicate evaluation
        let res: JSValue[] = [];
        switch (pv.type) {
            case BoxType.Value: {
                res = pv.values;
                break;
            }
            case BoxType.Array: {
                res = pv.values;
                break;
            }
            default:
                break;
        }
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
