declare module "ansi-escapes" {
    export function cursorTo ( x : number, y ?: number ) : string;
    export function cursorMove ( x : number, y ?: number ) : string;
    export function cursorUp ( count : number ) : string;
    export function cursorDown ( count : number ) : string;
    export function cursorForward ( count : number ) : string;
    export function cursorBackward ( count : number ) : string;
    export var cursorLeft : string;
    export var cursorSavePosition : string;
    export var cursorRestorePosition : string;
    export var cursorGetPosition : string;
    export var cursorNextLine : string;
    export var cursorPrevLine : string;
    export var cursorHide : string;
    export var cursorShow : string;
    export function eraseLines ( count : number ) : string;
    export var eraseEndLine : string;
    export var eraseStartLine : string;
    export var eraseLine : string;
    export var eraseDown : string;
    export var eraseUp : string;
    export var eraseScreen : string;
    export var scrollUp : string;
    export var scrollDown : string;
    export var clearTerminal : string;
    export var beep : string;
    export function link ( text : string, url : string ) : string;
    export function image ( input : Buffer, options ?: { width?: number, height?: number, preserveAspectRatio?: boolean } ) : string;
}