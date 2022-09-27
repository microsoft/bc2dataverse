import * as fs from "fs";
import * as vscode from 'vscode';
import resources from "../resources";
import * as path from "path";
import { format } from "util";
import { throwCustomError } from "./errors";

export async function existsInFileSystemSync(filename: string, checkIfDirectory?: boolean): Promise<boolean> {
    try {
        const stats = fs.statSync(filename);
        return (checkIfDirectory ? stats.isDirectory() : stats.isFile());
    } catch {
        return false;
    }
}

export async function folderContainsSync(foldername: string, fileExtension: string): Promise<boolean> {
    const actualExtension = createFileExtension(fileExtension);
    const files = fs.readdirSync(foldername);
    return files.find(e => e.toLowerCase().endsWith(actualExtension)) !== undefined;
}

export async function readFileContent(filePath: string) {
    return fs.readFileSync(filePath);
}

export function findLastModifiedFile(foldername: string, fileExtension: string) {
    let lastModification: number | undefined;
    let lastModifiedFile: vscode.Uri | undefined;
    try {
        doForAllFiles(foldername, fileExtension, (stats, fullPath) => {
            let modifiedAt = stats.mtime.getTime();
            if ((lastModification === undefined) || (modifiedAt > lastModification)) {
                lastModifiedFile = vscode.Uri.file(fullPath);
                lastModification = modifiedAt;
            };
        });
        // const actualExtension = createFileExtension(fileExtension);
        // fs.readdirSync(foldername)
        //     .filter(p => p.toLowerCase().endsWith(actualExtension) && isFile(path.join(foldername, p)))
        //     .forEach((file) => {
        //         let fileFullPath = path.join(foldername, file);
        //         const stats = fs.statSync(fileFullPath);
        //         if (stats.isFile()) {
        //             let modifiedAt = stats.mtime.getTime();
        //             if ((lastModification === undefined) || (modifiedAt > lastModification)) {
        //                 lastModifiedFile = vscode.Uri.file(fileFullPath);
        //                 lastModification = modifiedAt;
        //             };
        //         }
        //     });
    }
    catch (error) {
        throwCustomError(error, format(resources.couldNotReadFolderContent, foldername));
    }
    if (lastModification === undefined) {
        // no files found
        throw new Error(format(resources.couldNotReadFolderContent, foldername));
    }
    return lastModifiedFile as vscode.Uri;
}

export async function getAllFilePaths(foldername: string, fileExtension: string) {
    // const actualExtension = createFileExtension(fileExtension);
    let result: string[] = [];
    try {
        doForAllFiles(foldername, fileExtension, (_stats, fullPath) => result.push(fullPath));
        // fs.readdirSync(foldername)
        //     .filter(s => s.toLowerCase().endsWith(actualExtension) && isFile(path.join(foldername, s)))
        //     .forEach(s => result.push(path.join(foldername, s)));
    }
    catch (err) {
        throwCustomError(err, format(resources.couldNotReadFolderContent, foldername));
    }
    return result;
}

export async function mkDirSync(folderPath: string) {
    fs.mkdirSync(folderPath, { recursive: true });
}

export async function writeContent(filePath: string, content: string) {
    return existsInFileSystemSync(filePath)
        .then(exists => {
            if (exists) {
                return vscode.window.showInformationMessage(`File ${filePath} already exists. Do you wish to overwrite?`, resources.yesLbl, resources.noLbl);
            }
            return resources.yesLbl;
        })
        .then(res => {
            if (res !== resources.yesLbl) {
                throw new Error(`Aborted writing to file ${filePath}.`);
            }
        })
        .then(() => {
            fs.writeFileSync(filePath, content);
        })
        .then(() => {
            return filePath;
        });
}

function doForAllFiles(foldername: string, fileExtension: string, doThis: (stats: fs.Stats, fullPath: string) => void) {
    const actualExtension = createFileExtension(fileExtension);
    fs.readdirSync(foldername)
        .filter(s => s.toLowerCase().endsWith(actualExtension))
        .forEach(s => {
            const fullFilePath = path.join(foldername, s);
            const fileStat = fs.statSync(fullFilePath);
            if (fileStat.isFile()) {
                doThis(fileStat, fullFilePath);
            }
        });
}

function createFileExtension(fileExtension: string) {
    return (fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`).toLowerCase();
}

