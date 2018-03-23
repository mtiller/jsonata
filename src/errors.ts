export interface PlainError<T extends string> {
    code: T;
}

export interface TokenError<T extends string> extends PlainError<T> {
    token: string;
}

export interface ValueError {
    value: any;
}

export interface SecondValueError {
    value2: any;
}

export interface ExponentError {
    exp: number;
}

export interface IndexError {
    value: any;
}

export interface TypeError {
    type: string;
}

export type S0101 = PlainError<"S0101">;
export type S0102 = TokenError<"S0102">;
export type S0103 = TokenError<"S0103">;
export type S0104 = PlainError<"S0104">;
export type S0105 = PlainError<"S0105">;

export type S0201 = TokenError<"S0201">;
export type S0202 = TokenError<"S0202"> & ValueError;
export type S0203 = PlainError<"S0203"> & ValueError;
export type S0204 = TokenError<"S0204">;
export type S0205 = TokenError<"S0205">;
export type S0206 = TokenError<"S0206">;
export type S0207 = PlainError<"S0207">;
export type S0208 = PlainError<"S0208"> & ValueError;
export type S0209 = PlainError<"S0209">;
export type S0210 = PlainError<"S0210">;
export type S0211 = TokenError<"S0211">;

export type S0301 = PlainError<"S0301">;
export type S0302 = PlainError<"S0302">;
export type S0401 = PlainError<"S0401">;
export type S0402 = PlainError<"S0402">;
export type S0500 = PlainError<"S0500">;

export type T0410 = TokenError<"T0410"> & IndexError;
export type T0411 = TokenError<"T0411"> & IndexError;
export type T0412 = TokenError<"T0412"> & IndexError & TypeError;

export type D1001 = PlainError<"D1001"> & ValueError;
export type D1002 = PlainError<"D1002"> & ValueError;

export type T1003 = PlainError<"T1003"> & ValueError;
export type D1004 = PlainError<"D1004">;
export type T1005 = TokenError<"T1005">;
export type T1006 = PlainError<"T1006">;
export type T1007 = TokenError<"T1007">;
export type T1008 = PlainError<"T1008">;
export type D1009 = PlainError<"D1009"> & ValueError;

export type T2001 = TokenError<"T2001">;
export type T2002 = TokenError<"T2002">;
export type T2003 = PlainError<"T2003">;
export type T2004 = PlainError<"T2004">;
export type D2005 = PlainError<"D2005">;
export type T2006 = PlainError<"T2006">;
export type T2007 = PlainError<"T2007"> & ValueError & SecondValueError;
export type T2008 = PlainError<"T2008">;
export type T2009 = PlainError<"T2009"> & ValueError & SecondValueError;
export type T2010 = TokenError<"T2010">;
export type T2011 = PlainError<"T2011"> & ValueError;
export type T2012 = PlainError<"T2012"> & ValueError;
export type T2013 = PlainError<"T2013">;

export type D3001 = PlainError<"D3001">;
export type D3010 = PlainError<"D3010">;
export type D3011 = PlainError<"D3011">;
export type D3012 = PlainError<"D3012">;
export type D3020 = PlainError<"D3020">;
export type D3030 = PlainError<"D3030"> & ValueError;
export type D3040 = PlainError<"D3040">;
export type D3050 = PlainError<"D3050">;

export type D3060 = PlainError<"D3060"> & ValueError;
export type D3061 = PlainError<"D3061"> & ValueError & ExponentError;

export type D3070 = PlainError<"D3070">;

export type D3080 = PlainError<"D3080">;
export type D3081 = PlainError<"D3081">;
export type D3082 = PlainError<"D3082">;
export type D3083 = PlainError<"D3083">;
export type D3084 = PlainError<"D3084">;
export type D3085 = PlainError<"D3085">;
export type D3086 = PlainError<"D3086">;
export type D3087 = PlainError<"D3087">;
export type D3088 = PlainError<"D3088">;
export type D3089 = PlainError<"D3089">;

export type D3090 = PlainError<"D3090">;
export type D3091 = PlainError<"D3091">;
export type D3092 = PlainError<"D3092">;
export type D3093 = PlainError<"D3093">;

export type D3100 = PlainError<"D3100"> & ValueError;
export type D3110 = PlainError<"D3110"> & ValueError;

export type ErrorData =
    | S0101
    | S0102
    | S0103
    | S0104
    | S0105
    | S0201
    | S0202
    | S0203
    | S0204
    | S0205
    | S0206
    | S0207
    | S0208
    | S0209
    | S0210
    | S0211
    | S0301
    | S0302
    | S0402
    | S0401
    | S0500
    | T0410
    | T0411
    | T0412
    | D1001
    | D1002
    | T1003
    | D1004
    | T1005
    | T1006
    | T1007
    | T1008
    | D1009
    | T2001
    | T2002
    | T2003
    | T2004
    | D2005
    | T2006
    | T2007
    | T2008
    | T2009
    | T2010
    | T2011
    | T2012
    | T2013
    | D3001
    | D3010
    | D3011
    | D3012
    | D3020
    | D3030
    | D3040
    | D3050
    | D3060
    | D3061
    | D3070
    | D3080
    | D3081
    | D3082
    | D3083
    | D3084
    | D3085
    | D3086
    | D3087
    | D3088
    | D3089
    | D3090
    | D3091
    | D3092
    | D3093
    | D3100
    | D3110;

export function error(data: ErrorData): {} {
    return { ...data, stack: new Error().stack };
    // TODO: Try { ...new Error(), ...data }; ?
}
