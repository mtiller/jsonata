import { flatten } from "../src/utils";

describe("Test flatten", () => {
    let cases = [
        { original: [], flat: [] },
        { original: [1, 2, 3], flat: [1, 2, 3] },
        { original: [1, [2, 3]], flat: [1, 2, 3] },
        { original: [1, 2, 3], flat: [1, 2, 3] },
        { original: [[1, 2]], flat: [1, 2] },
        { original: [[[1, 2]]], flat: [1, 2] },
    ];
    cases.forEach(c => {
        test(JSON.stringify(c.original) + " should flatten to " + JSON.stringify(c.flat), () => {
            expect(flatten(c.original)).toEqual(c.flat);
        });
    });
});
