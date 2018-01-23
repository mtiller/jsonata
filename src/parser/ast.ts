import { Token } from "../tokenizer";
import { Signature } from '../signatures';

export interface BaseNode {
    type: string;
    value: any;
    position: number;
    keepArray?: boolean;
    // TODO: This is only added to the root expression node...should probably be a separate return value from parser
    errors?: string[];
}

export interface WildcardNode extends BaseNode {
    type: "wildcard";
}

export interface DescendantNode extends BaseNode {
    type: "descendant";
}

export interface ErrorFields {
    code: string;
}

export interface ErrorNode extends BaseNode {
    type: "error";
    // TODO: refine
    error: ErrorFields;
    // TODO: refine
    lhs: ASTNode;
    remaining: Token[];
}

export interface VariableNode extends BaseNode {
    type: "variable";
}

export interface NameNode extends BaseNode {
    type: "name";
}
export interface LiteralNode extends BaseNode {
    type: "literal";
}

export interface RegexNode extends BaseNode {
    type: "regex";
}

export interface OperatorNode extends BaseNode {
    type: "operator";
}

export interface EndNode extends BaseNode {
    type: "end";
    value: string;
}

export type TerminalNode = VariableNode | NameNode | LiteralNode | RegexNode | OperatorNode | EndNode;

export interface UnaryNode extends BaseNode {
    type: "unary";
    expression?: ASTNode;
    lhs?: ASTNode[];
    expressions?: ASTNode[];
    position: number;
}

export interface BinaryNode extends BaseNode {
    type: "binary";
    value: "+" | "[" | ".." | "." | "[" | ":=" | "~>" | "{" | "^" // TODO: There must be more?!?
    lhs: ASTNode;
    rhs: ASTNode | ASTNode[]; // ASTNode if operator is "." | "[" | ":=" | "~>", ASTNode[] if operator is "{" | "^"
}

export interface SortTerm {
    descending: boolean;
    expression: ASTNode;
}

export interface SortNode extends BaseNode {
    type: "sort";
    lhs: ASTNode;
    rhs: SortTerm[];
}

export interface TernaryNode extends BaseNode {
    type: "condition";
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode;
    position: number;
}

export interface BlockNode extends BaseNode {
    type: "block";
    expressions: ASTNode[];
}

export interface TransformNode extends BaseNode {
    type: "transform";
    // TODO: Refine these
    pattern: ASTNode;
    update: ASTNode;
    delete?: ASTNode;
}

export interface FunctionInvocationNode extends BaseNode {
    type: "function" | "partial";
    //name: string;
    procedure: ASTNode;
    arguments: ASTNode[];
}

export interface LambdaDefinitionNode extends BaseNode {
    type: "lambda";
    body: ASTNode;
    signature: Signature;
    procedure: ASTNode;
    arguments: ASTNode[];
}

export type ASTNode =
    | WildcardNode
    | DescendantNode
    | ErrorNode
    | LiteralNode
    | NameNode
    | VariableNode
    | RegexNode
    | OperatorNode
    | UnaryNode
    | BinaryNode
    | SortNode
    | TernaryNode
    | BlockNode
    | TransformNode
    | FunctionInvocationNode
    | LambdaDefinitionNode
    | EndNode;

// TODO: Add synthetic ast nodes (rename ASTNode to RawAstNode or something)
export type OptimizedASTNode = ASTNode;