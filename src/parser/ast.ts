import { Token } from '../tokenizer';

export interface ASTNode {
    id: string; // Symbol id this came from
    type: string;
    value: any;
}

export interface WildcardNode extends ASTNode {
    type: "wildcard";
}

export interface DescendantNode extends ASTNode {
    type: "descendant";
}

export interface ErrorNode extends ASTNode {
    type: "error";
    // TODO: refine
    error: any;
    // TODO: refine
    lhs: any;
    remaining: Token[],
}

export interface LiteralNode extends ASTNode {
    type: "literal";
    value: string;
}

export interface NameNode extends ASTNode {
    type: "name";
    value: string;
}

export interface VariableNode extends ASTNode {
    type: "variable";
    value: string;
}

export type TerminalNode = LiteralNode | NameNode | VariableNode;

export interface UnaryNode extends ASTNode {
    type: "unary";
    // TODO: refine
    expression: any;
}

export interface BinaryNode extends ASTNode {
    type: "binary";
    value: string; // Could be refined
    lhs: any;
    rhs: any;
}

export interface BlockNode extends ASTNode {
    type: "block";
    // TODO: refine
    expressions: any[];
}