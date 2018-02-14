import { BaseNode } from './base';
import { ASTNode } from './index';

export interface PathNode extends BaseNode {
    type: "path";
    steps: ASTNode[];
    keepSingletonArray: boolean;
}

export interface BindNode extends BaseNode {
    type: "bind";
    lhs: ASTNode;
    rhs: ASTNode;
}

export interface ApplyNode extends BaseNode {
    type: "apply";
    lhs: ASTNode;
    rhs: ASTNode;
}

export interface PredicateNode extends BaseNode {
    type: "predicate";
    value: "[";
    condition: ASTNode;
    lhs: ASTNode;
}
