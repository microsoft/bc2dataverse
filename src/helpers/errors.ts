import { format } from 'util';
import * as vscode from 'vscode';

export class CompositeError extends Error {
    public inner: any;

    public constructor(msg: string, inner: any) {
        super(msg);
        this.inner = inner;
    }
}

export function throwCustomError(err: any, msg: string) {
    console.warn(err);
    const e = new CompositeError(msg, err);
    e.inner = err;
    throw e;
}

export function catchAndShowError(e: any | CompositeError) {
    console.error(e);

    if (e instanceof CompositeError) {
        vscode.window.showErrorMessage(e.message, 'Show details')
            .then(s => {
                if (s === 'Show details') {
                    let details = e.inner.toString();
                    if (e.inner instanceof Error) {
                        details += `${e.inner.stack}`;
                    }
                    vscode.window.showInformationMessage(details, { modal: true });
                }
            });
        return;
    }

    if (e instanceof Error) {
        vscode.window.showErrorMessage(e.message, 'Show details')
            .then(s => {
                if (s === 'Show details') {
                    vscode.window.showInformationMessage(`${e.message}${e.stack}`, { modal: true });
                }
            });
        return;
    }

    vscode.window.showErrorMessage(e.message ? e.message : e);
}

export function assertAndThrowError(condition: any, message?: string, ...optionalParams: any[]) {
    if (!condition) {
        throw new Error(`Assertion failed: ${format(message, optionalParams)}`);
    }
}