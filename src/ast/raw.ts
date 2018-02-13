import { BaseNode } from './base';
import { ASTNode } from './index';
import { Token } from "../tokenizer";

export interface ProxyBinaryNode extends BaseNode {
    type: "proxy";
    value: "." | "[";
    lhs: ASTNode;
    rhs: ASTNode;
}

export interface EndNode extends BaseNode {
    type: "end";
    value: string;
}

export interface ErrorFields {
    code: string;
    position?: number;
    token?: string;
    stack?: string;
}

export interface ErrorNode extends BaseNode {
    type: "error";
    error: ErrorFields;
    lhs: ASTNode;
    remaining: Token[];
}

export interface OperatorNode extends BaseNode {
    type: "operator";
}

export interface SingletonArrayDecorator extends BaseNode {
    type: "singleton";
    next: ASTNode;
}

export interface GroupedObjectNode extends BaseNode {
    type: "grouped-object";
    value: "{";
    lhs: ASTNode;
    rhs: ASTNode[];
}
