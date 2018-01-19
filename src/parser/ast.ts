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
    type: "(error)";
    error: any;
}

export interface LiteralNode extends ASTNode {
    type: "(literal)";
}