import { Box, boxValue, BoxFlags, JSValue, ubox } from "./box";

export class JEnv {
    protected bindings: { [key: string]: Box } = {};
    constructor(public enclosing?: JEnv) {}
    bind(name: string, value: JSValue, options: Partial<BoxFlags> = {}) {
        this.bindings[name] = boxValue(value, options);
    }
    bindBox(name: string, box: Box) {
        this.bindings[name] = box;
    }
    merge(bindings: { [key: string]: JSValue }, options: Partial<BoxFlags> = {}) {
        Object.keys(bindings).forEach(key => (this.bindings[key] = boxValue(bindings[key], options)));
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
