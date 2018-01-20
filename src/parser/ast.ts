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
    expression?: any;
    // TODO: Used by objectParser (should get rid of this eventually)
    lhs?: any;
    // TODO: Used by array constructor
    expressions?: any;
}

export interface BinaryNode extends ASTNode {
    type: "binary";
    value: string; // Could be refined
    lhs: any;
    rhs: any;
    position?: number; // Required for sort operator!?!
}

export interface BlockNode extends ASTNode {
    type: "block";
    // TODO: refine
    expressions: any[];
}

export interface TernaryNode extends ASTNode {
    type: "condition",
    condition: any;
    then: any;
    else: any;
}

export interface TransformNode extends ASTNode {
    type: "transform",
    // TODO: Refine these
    pattern: any;
    update: any;
    delete?: any;
}

export interface FunctionInvocation extends ASTNode {
    type: "function" | "partial";
    procedure: any;
    arguments: any;
    position: number;
}

export interface LambdaDefinition extends ASTNode {
    type: "lambda";
    procedure: any;
    arguments: any;
    body: any;
}