import * as vscode from 'vscode';

export function getConfiguration(parameter: string) {
    const config = vscode.workspace.getConfiguration();
    return config.get(parameter);
}

export function setConfiguration(parameter: string, value: any) {
    const config = vscode.workspace.getConfiguration();
    return config.update(parameter, value);
}
