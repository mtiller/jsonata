import { Box, boxValue, JSValue, ubox, boxFunction } from "../semantics";
import * as funcs from "../functions";
import { defineFunction, FunctionDefinition } from "../signatures";
import * as sync from "./functions";
import { EvaluationOptions } from "./options";

export interface Environment<L> {
    lookup(name: string): L;
}

export class JEnv implements Environment<Box> {
    protected bindings: { [key: string]: Box } = {};
    constructor(protected options: EvaluationOptions, public enclosing?: Environment<Box>) {
        if (!enclosing) {
            // Functions are only bound at the root level (this allows them to
            // be redefined in enclosing scopes)
            this.bindFunction("sum", defineFunction(funcs.functionSum, "<a<n>:n>"));
            this.bindFunction("count", defineFunction(funcs.functionCount, "<a:n>"));
            this.bindFunction("max", defineFunction(funcs.functionMax, "<a<n>:n>"));
            this.bindFunction("min", defineFunction(funcs.functionMin, "<a<n>:n>"));
            this.bindFunction("average", defineFunction(funcs.functionAverage, "<a<n>:n>"));
            this.bindFunction("string", defineFunction(funcs.functionString, "<x-:s>"));
            this.bindFunction("substring", defineFunction(funcs.functionSubstring, "<s-nn?:s>"));
            this.bindFunction("substringBefore", defineFunction(funcs.functionSubstringBefore, "<s-s:s>"));
            this.bindFunction("substringAfter", defineFunction(funcs.functionSubstringAfter, "<s-s:s>"));
            this.bindFunction("lowercase", defineFunction(funcs.functionLowercase, "<s-:s>"));
            this.bindFunction("uppercase", defineFunction(funcs.functionUppercase, "<s-:s>"));
            this.bindFunction("length", defineFunction(funcs.functionLength, "<s-:n>"));
            this.bindFunction("trim", defineFunction(funcs.functionTrim, "<s-:s>"));
            this.bindFunction("pad", defineFunction(funcs.functionPad, "<s-ns?:s>"));
            this.bindFunction("join", defineFunction(funcs.functionJoin, "<a<s>s?:s>"));
            this.bindFunction("formatNumber", defineFunction(funcs.functionFormatNumber, "<n-so?:s>"));
            this.bindFunction("formatBase", defineFunction(funcs.functionFormatBase, "<n-n?:s>"));
            this.bindFunction("number", defineFunction(funcs.functionNumber, "<(ns)-:n>"));
            this.bindFunction("floor", defineFunction(funcs.functionFloor, "<n-:n>"));
            this.bindFunction("ceil", defineFunction(funcs.functionCeil, "<n-:n>"));
            this.bindFunction("round", defineFunction(funcs.functionRound, "<n-n?:n>"));
            this.bindFunction("abs", defineFunction(funcs.functionAbs, "<n-:n>"));
            this.bindFunction("sqrt", defineFunction(funcs.functionSqrt, "<n-:n>"));
            this.bindFunction("power", defineFunction(funcs.functionPower, "<n-n:n>"));
            this.bindFunction("random", defineFunction(funcs.functionRandom, "<:n>"));
            this.bindFunction("boolean", defineFunction(funcs.functionBoolean, "<x-:b>"));
            this.bindFunction("not", defineFunction(funcs.functionNot, "<x-:b>"));
            this.bindFunction("zip", defineFunction(funcs.functionZip, "<a+>"));
            this.bindFunction("keys", defineFunction(funcs.functionKeys, "<x-:a<s>>"));
            this.bindFunction("append", defineFunction(funcs.functionAppend, "<xx:a>"));
            this.bindFunction("exists", defineFunction(funcs.functionExists, "<x:b>"));
            this.bindFunction("spread", defineFunction(funcs.functionSpread, "<x-:a<o>>"));
            this.bindFunction("merge", defineFunction(funcs.functionMerge, "<a<o>:o>"));
            this.bindFunction("reverse", defineFunction(funcs.functionReverse, "<a:a>"));
            this.bindFunction("shuffle", defineFunction(funcs.functionShuffle, "<a:a>"));
            this.bindFunction("base64encode", defineFunction(funcs.functionBase64encode, "<s-:s>"));
            this.bindFunction("base64decode", defineFunction(funcs.functionBase64decode, "<s-:s>"));
            this.bindFunction("toMillis", defineFunction(funcs.functionToMillis, "<s-:n>"));
            this.bindFunction("fromMillis", defineFunction(funcs.functionFromMillis, "<n-:s>"));
            this.bindFunction("clone", defineFunction(funcs.functionClone, "<(oa)-:o>"));

            // We use special versions of these functions because we want them to take
            // regular expression literals.
            // this.bindFunction("split", defineFunction(sync.functionSplit, "<s-(sr)n?:a<s>>")); // TODO <s-(sf<s:o>)n?:a<s>>
            // this.bindFunction("contains", defineFunction(sync.functionContains, "<s-(sr):b>")); // TODO <s-(sf<s:o>):b>
            // this.bindFunction("match", defineFunction(sync.functionMatch, "<s-rn?:a<o>>"));
            this.bindFunction("split", defineFunction(funcs.functionSplit, "<s-(sf)n?:a<s>>")); // TODO <s-(sf<s:o>)n?:a<s>>
            this.bindFunction("contains", defineFunction(funcs.functionContains, "<s-(sf):b>")); // TODO <s-(sf<s:o>):b>
            this.bindFunction("match", defineFunction(funcs.functionMatch, "<s-fn?:a<o>>"));

            // We use special, purely synchronous version of these functions
            // TODO: No tests for this?!?
            this.bindFunction("map", defineFunction(sync.functionMap(options), "<af>"));
            this.bindFunction("replace", defineFunction(sync.functionReplace(options), "<s-(sf)(sf)n?:s>")); // TODO <s-(sf<s:o>)(sf<o:s>)n?:s>
            this.bindFunction("filter", defineFunction(sync.functionFilter(options), "<af>"));
            this.bindFunction("reduce", defineFunction(sync.functionFoldLeft(options), "<afj?:j>")); // TODO <f<jj:j>a<j>j?:j>
            this.bindFunction("each", defineFunction(sync.functionEach(options), "<o-f:a>"));

            // We use special versions of these functions because they
            // recursively evaluate their arguments.
            this.bindFunction("sort", defineFunction(sync.functionSort(options), "<af?:a>"));
            this.bindFunction("sift", defineFunction(sync.functionSift(options), "<o-f?:o>"));

            // Had to reimplement this since original version used evaluation
            this.bindFunction("lookup", defineFunction(sync.functionLookup, "<x-s:x>"));
        }
    }
    bindFunction(name: string, f: FunctionDefinition) {
        this.bindings[name] = boxFunction({
            implementation: f.implementation,
            signature: f.signature,
        });
    }
    bind(name: string, value: JSValue) {
        this.bindings[name] = boxValue(value);
    }
    bindBox(name: string, box: Box) {
        this.bindings[name] = box;
    }
    merge(bindings: { [key: string]: JSValue }) {
        Object.keys(bindings).forEach(key => (this.bindings[key] = boxValue(bindings[key])));
    }
    lookup(name: string): Box {
        if (this.bindings.hasOwnProperty(name)) {
            return this.bindings[name];
        }
        if (this.enclosing) {
            return this.enclosing.lookup(name);
        }
        // TODO: Throw exception instead?!?
        return ubox;
    }
    nested() {
        return new JEnv(this.options, this);
    }
}
