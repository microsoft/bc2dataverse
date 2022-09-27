import { format } from "util";
import { join } from "path";
import * as vscode from 'vscode';
import * as consts from '../consts';
import resources from "../resources";
import { existsInFileSystemSync, folderContainsSync, writeContent } from "./fileSystem";
import { SymbolManager } from "../symbols";
import { sorter } from './string';
import * as config from "./config";
import { spawn } from "child_process";
import { throwCustomError } from "./errors";

export async function getProject(): Promise<vscode.Uri> {
    let folders = vscode.workspace.workspaceFolders;
    if (folders && folders[0]) {
        let usingFolder = folders[0].uri;
        // TODO: Check that you have permissions to read and write to this folder
        return usingFolder;
    }
    throw new Error('You need to be inside a valid AL workspace.');
}

export async function getPackagesPath(workspaceFolderUri: vscode.Uri): Promise<vscode.Uri> {
    let configuredCachePath = config.getConfiguration(consts.configPropPackagesPathName);

    if (configuredCachePath) {
        return vscode.Uri.file(configuredCachePath as string);
    }

    let defaultCachePath = join(workspaceFolderUri.fsPath, '.alpackages');
    return existsInFileSystemSync(defaultCachePath, true)
        .then(folderExists => {
            if (folderExists) {
                return folderContainsSync(defaultCachePath, consts.alAppFileExtension)
                    .then(containsFiles => {
                        if (containsFiles) {
                            return config.setConfiguration(consts.configPropPackagesPathName, defaultCachePath)
                                .then(() => vscode.Uri.file(defaultCachePath));
                        }
                        return getCustomPackagePath(workspaceFolderUri);
                    });
            }
            return getCustomPackagePath(workspaceFolderUri);
        });
}

async function getCustomPackagePath(workspaceFolderUri: vscode.Uri) {
    return vscode.window.showOpenDialog(
        {
            title: 'Enter the directory path where the symbols are placed.',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: workspaceFolderUri,
            openLabel: 'Select'
        })
        .then(folders_ => {
            if (!folders_) {
                throw new Error(resources.badPackagesPathErr);
            }
            let folder = folders_[0].fsPath;
            return folderContainsSync(folder, consts.alAppFileExtension)
                .then(ok => {
                    if (ok) {
                        return config.setConfiguration(consts.configPropPackagesPathName, folder)
                            .then(() => vscode.Uri.file(folder));
                    }
                    throw new Error(format('The chosen folder does not have any %s file. Have you downloaded symbols?', consts.alAppFileExtension));
                });
        });
}

export async function getDataverseEntityName(symbols: SymbolManager, projectPath: string, packagePath: string) {
    return showQuickPick({
        title: resources.askDataverseEntityNameLbl,
        placeHolder: 'worker'
    },
        () => findDataverseEntityNames(symbols, projectPath, packagePath))
        .then(choice => {
            if (choice) {
                return { entity: choice.label, proxy: choice.description };
            }
            throw new Error(resources.badDataverseEntityNameErr);
        });
}

async function findDataverseEntityNames(symbols: SymbolManager, projectPath: string, packagePath: string): Promise<vscode.QuickPickItem[]> {
    return symbols.initialize(packagePath, projectPath)
        .then(() => symbols.getDataverseEntities())
        .then(r => {
            const sortedEntities = r.sort(sorter(x => x.dataverseEntity));
            const entities = sortedEntities.map(item => ({ label: item.dataverseEntity, description: item.proxyTable, detail: item.publisher }));
            if (entities.length === 0) {
                throw new Error(`No proxy table linked to any Dataverse entity found. Did you compile your project?`);
            }
            return entities;
        });
}

export async function showQuickPick(input: { title: string, placeHolder: string },
    getItems: () => vscode.QuickPickItem[] | Promise<vscode.QuickPickItem[]>) {
    return vscode.window.showQuickPick(
        getItems(),
        {
            canPickMany: false,
            ignoreFocusOut: true,
            title: input.title,
            placeHolder: input.placeHolder,
            matchOnDescription: true,
            matchOnDetail: true
        });
}

export async function showInputBox(input: { title: string, prompt: string, placeHolder: string }, validateInput?: (v: string) => string | null) {
    return vscode.window.showInputBox(
        {
            title: input.title,
            prompt: input.prompt,
            placeHolder: input.placeHolder,
            ignoreFocusOut: true,
            validateInput: validateInput
        });
}

export async function handleOpenFileCommand(commandLbl: string | undefined, filePathToOpen: string) {
    let result: vscode.TextEditor | PromiseLike<vscode.TextEditor> | undefined = undefined;
    switch (commandLbl) {
        case resources.openFileLbl:
            result = vscode.workspace.openTextDocument(vscode.Uri.file(filePathToOpen))
                .then(file => vscode.window.showTextDocument(file));
            break;
        case undefined:
            result = vscode.window.activeTextEditor; // bail out
            break;
        default:
            throw new Error(`Unexpected command: ${commandLbl}.`);
    }
    return result;
}

export async function runWithProgress<T>(title: string, todo: (progress: vscode.Progress<{ message?: string, increment?: number }>, token: vscode.CancellationToken) => Promise<T>, cancellable?: boolean) {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: cancellable === undefined ? true : cancellable,
            title: title
        },
        async (progress, token) => {
            return await todo(progress, token);
        });
}


export async function runProcess(command: string, args: string[], cwd?: string) {
    let out: string | undefined;
    let e: Error | undefined;
    let err: string | undefined;
    return runProcess_(command, args,
        o_ => { out = o_; },
        err_ => { err = err_; },
        e_ => { e = e_; },
        cwd)
        .then(() => {
            if (e) {
                throwCustomError(e, resources.unexpectedErrorOccuredMsg);
            }
            if (err) {
                throwCustomError(new Error(err), resources.unexpectedErrorOccuredMsg);
            }
            if (out) {
                let errors = out
                    .split('\r\n')
                    .filter(s => s.toLowerCase().includes('error'))
                    .join(';');
                if (errors) {
                    throwCustomError(new Error(out), errors);
                }
                return out;
            }
            throwCustomError(new Error(resources.noInfoFromProcessMsg), resources.unexpectedErrorOccuredMsg);
            return '';
        });
}

async function runProcess_(command: string, args: string[],
    onOutput: (out: string) => void,
    onStdErr: (stdErr: string) => void,
    onError: (e: Error) => void,
    cwd?: string) {
    let proc = spawn(command, args, { cwd: cwd });
    let out: string = '', err: string = '';

    proc.stderr.on('data', chunk => {
        err += chunk.toString();
    });

    proc.stdout.on('data', chunk => {
        out += chunk.toString();
    });

    proc.on('error', (err) => {
        onError(err);
    });

    proc.on('exit', () => {
        onOutput(out);
        onStdErr(err);
    });

    await new Promise((res) => {
        proc.on('close', res);
    })
}

