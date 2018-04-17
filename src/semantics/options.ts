export interface EvaluationOptions {
    legacyMode: boolean;
}

export function normalizeOptions(opts: Partial<EvaluationOptions>): EvaluationOptions {
    return {
        legacyMode: opts && !!opts.legacyMode,
    };
}
