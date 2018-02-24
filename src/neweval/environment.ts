import { Box, boxValue, JSValue, ubox } from "./box";

export class JEnv {
    protected bindings: { [key: string]: Box } = {};
    constructor(public enclosing?: JEnv) {}
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
        return new JEnv(this);
    }
}
