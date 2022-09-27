import * as consts from './consts';
import { format } from "util";
import resources from "./resources";
import { existsInFileSystemSync, getAllFilePaths, mkDirSync, readFileContent } from './helpers/fileSystem';
import { throwCustomError } from './helpers/errors';
import { PropertyType, ObjectType } from './helpers/al';
import * as vscode from 'vscode';
import { runProcess, runWithProgress } from './helpers/utils';
import { join } from 'path';
import { getConfiguration } from './helpers/config';
import { mkdirSync } from 'fs';

interface ALPublisher {
    appId: string,
    name: string,
    publisher: string
}

type ObjectDetail = {
    body: any,
    app: ALPublisher
};

export class SymbolManager //TODO extends vscode.Disposable and disposes objectMap
{
    private symbols: {
        [type: string]: {
            [name: string]: ObjectDetail
        }
    };
    private symbolRefFolderPath: string;
    private currentExtensionPath: string;

    private isInitialized: boolean = false;

    public constructor(context: vscode.ExtensionContext) {
        this.currentExtensionPath = context.extensionPath;
        this.symbols = {};

        const relativePath = getConfiguration(consts.configPropSymbolRefExtractedPath) as string;
        this.symbolRefFolderPath = join(consts.SymbolRefRootFolder, relativePath);
        this.createCacheFolder();
    }

    private async createCacheFolder() {
        await existsInFileSystemSync(this.symbolRefFolderPath)
            .then(exists => {
                if (!exists) {
                    try {
                        mkdirSync(this.symbolRefFolderPath, { recursive: true });
                    }
                    catch (e) {
                        throw new Error(`Could not create a new cache folder at ${this.symbolRefFolderPath}.`);
                    }
                }
            });
    }

    public async initialize(packagesPath: string, projectPath: string) {
        if (this.isInitialized) {
            return;
        }
        // TODO show progress bar during initialize
        let appPaths: string[] = [];
        return getAllFilePaths(packagesPath, consts.alAppFileExtension)
            .then(apps => {
                appPaths = appPaths.concat(apps);
                // include the apps in the project's working directory
                return getAllFilePaths(projectPath, consts.alAppFileExtension);
            })
            .then(apps => {
                appPaths = appPaths.concat(apps);
            })
            .then(() => {
                return runWithProgress(`Discovering symbols... `, async () => {
                    const symRefs = await this.readSymbolReferences(appPaths);
                    if (symRefs.length !== appPaths.length) {
                        throw new Error('Symbol references could not be generated for all packages.');
                    }

                    let promises: Promise<void>[] = [];
                    for (let i = 0; i < symRefs.length; i++) {
                        promises.push(this.fetchSymbols(symRefs[i], appPaths[i]));
                    }
                    await Promise.all(promises);
                });
            })
            .then(() => {
                this.isInitialized = true;
            });
    }

    private async readSymbolReferences(appPaths: string[]) {
        const delimitedPackagePaths: string = appPaths.join('|');
        return runProcess(join("./", consts.AppPackageExtracterExe), [
            `-packagesPath:"${delimitedPackagePaths}"`,
            `-cacheFolder:"${this.symbolRefFolderPath}"`,
            `-bcDllFolderPath:"${vscode.extensions.getExtension(consts.alExtensionId)?.extensionPath as string}\\bin"`,
            `-relativeFilePath:"/SymbolReference.json"`
        ], join(this.currentExtensionPath, 'bin'))
            .then(out => {
                const successPrefix = 'File extracted: ';
                const successes = out
                    .split('\r\n')
                    .filter(s => s.includes(successPrefix));
                if (successes.length === 0) {
                    throw new Error(`No symbols could be extracted from the app packages.`);
                }
                const result: string[] = [];
                successes
                    .forEach(s => result.push(s.substring(successPrefix.length)))
                return result;
            })

    }

    private async fetchSymbols(symbolRefFile: string, packagePath: string) {
        return readFileContent(symbolRefFile)
            .then(jsonBuf => {
                const buf = jsonBuf.toString();
                if (buf.length === 0) {
                    throw new Error(`Could not read symbols from ${packagePath}.`);
                }
                return JSON.parse(buf.trim()); // taking out the first newline character
            })
            .then(json => {
                return this.populateSymbols(json);
            })
            .catch(e => {
                throwCustomError(e, format(resources.couldNotReadFileContent, packagePath));
            });
    }

    private async populateSymbols(root: any) {
        if (!this.symbols[ObjectType.table]) {
            this.symbols[ObjectType.table] = {};
        }
        if (!this.symbols[ObjectType.tableExtension]) {
            this.symbols[ObjectType.tableExtension] = {};
        }
        if (!this.symbols[ObjectType.page]) {
            this.symbols[ObjectType.page] = {};
        }

        let extension: ALPublisher = {
            appId: root.AppId,
            name: root.Name,
            publisher: root.Publisher
        };

        if (root.Tables) {
            (root.Tables as any[]).forEach(t => {
                this.symbols[ObjectType.table][t.Name] = { body: t, app: extension };
            });
        }
        if (root.TableExtensions) {
            (root.TableExtensions as any[]).forEach(t => {
                this.symbols[ObjectType.tableExtension][t.Name] = { body: t, app: extension };
            });
        }
        if (root.Pages) {
            (root.Pages as any[]).forEach(t => {
                this.symbols[ObjectType.page][t.Name] = { body: t, app: extension };
            });
        }
        console.info(`Discovered ${Object.keys(this.symbols[ObjectType.table]).length} tables ${Object.keys(this.symbols[ObjectType.page]).length} pages and ${Object.keys(this.symbols[ObjectType.tableExtension]).length} table extensions.`);
    }

    private appToString(publisher: ALPublisher) {
        return `${publisher.name} [${publisher.publisher}]`;
    }

    /// Table related
    public getTableFields(tableName: string) {
        let result: { name: string, type: string, publisher: string }[] = [];
        let addFields = (publisher: string, fields: any[]) => {
            if (fields) {
                (fields as any[])
                    .forEach(field => {
                        result.push({ name: field.Name, type: field.TypeDefinition.Name, publisher: publisher });
                    });
            }
        };

        // first get the table primary fields
        const table = this.getObject(ObjectType.table, tableName) as ObjectDetail;
        addFields(this.appToString(table.app), this.getSubObjectIn(ObjectType.table, table => table.Fields, tableName));

        // then get the extension fields
        const tableExts = this.getObjects(ObjectType.tableExtension, [this.predicateTargetObjectMatch(tableName)]);
        tableExts
            .forEach(te => {
                addFields(te.publisher, this.getSubObjectIn(ObjectType.tableExtension, tabExt => tabExt.Fields, te.name));
            });
        return result;
    }

    public getPrimaryKeyField(tablename: string): string | undefined {
        return this.getSubObjectIn(ObjectType.table,
            table => {
                const keys = table.Keys;
                if (keys) {
                    const primaryKey = keys[0];
                    if (primaryKey) {
                        const fields = primaryKey.FieldNames;
                        if (fields) {
                            return fields[0];
                        }
                    }
                }
            },
            tablename);
    }

    public getTablesNotMappedToDataverse() {
        return this.getObjects(ObjectType.table, [this.predicateNot(this.predicateTableMappedToDataverse())]);
    }

    public getDataverseEntities() {
        const dataverseEntity = (table: any) => {
            const detail = this.getObject(ObjectType.table, table.Name) as ObjectDetail;
            return {
                dataverseEntity: this.subTableDataverseEntity()(table) as string,
                proxyTable: table.Name,
                publisher: this.appToString(detail?.app)
            };
        };
        return this.getSubObjects(ObjectType.table, dataverseEntity, [this.predicateTableMappedToDataverse(), this.predicatePropertyMatch(PropertyType.externalName)]);
    }

    private predicateTableMappedToDataverse() {
        return this.predicatePropertyMatch(PropertyType.tableType, 'CDS');
    }

    private subTableDataverseEntity() {
        return (table: any) => this.getProperty(PropertyType.externalName, table);
    }

    public getTableId(tableName: string): any | undefined {
        const table = this.getObject(ObjectType.table, tableName);
        if (table) {
            return this.subObjectId()(table.body);
        }
    }

    /// General Object related
    private getProperty(name: PropertyType, json: any): string | undefined {
        if (!json.Properties) {
            return undefined;
        }
        let props = (json.Properties as any[]);
        const prop = props.find(p => p.Name === name);
        if (prop !== undefined) {
            return prop.Value;
        }
        return undefined;
    }

    private getObject<T extends ObjectType>(objType: T, name: string): ObjectDetail | undefined {
        return this.symbols[objType][name];
    }

    private findObject<T extends ObjectType>(objType: T, predicates: ((json: any) => boolean)[]): string | undefined {
        return Object.keys(this.symbols[objType])
            .find(p => {
                for (const pr of predicates) {
                    if (!pr(this.symbols[objType][p].body)) {
                        return false;
                    }
                }
                return true;
            });
    }

    private getObjects<T extends ObjectType>(objType: T, predicates?: ((json: any) => boolean)[]): { name: string, publisher: string }[] {
        return Object.keys(this.symbols[objType])
            .filter(p => {
                if (predicates !== undefined) {
                    for (const pr of predicates) {
                        if (!pr(this.symbols[objType][p].body)) {
                            return false;
                        }
                    }
                }
                return true;
            })
            .map(p => ({ name: p, publisher: this.appToString((this.getObject(objType, p) as ObjectDetail).app) }));
    }

    // private findSubObject<T extends ObjectType>(objType: T, subObject: (json: any) => any, objPredicates: ((json: any) => boolean)[]): any | undefined {
    //     const obj = this.findObject(objType, objPredicates);
    //     if (obj !== undefined) {
    //         return subObject(obj);
    //     }
    // }

    private getSubObjects<T extends ObjectType, U>(objType: T, subObject: (json: any) => U, objPredicates?: ((json: any) => boolean)[]): U[] {
        return this.getObjects(objType, objPredicates)
            .map(o => subObject((this.getObject(objType, o.name) as ObjectDetail).body));
    }

    private getSubObjectIn<T extends ObjectType, U>(objType: T, subObject: (json: any) => U, objectName: string): U {
        return subObject((this.getObject(objType, objectName) as ObjectDetail).body);
    }

    public subObjectId() {
        return (objJson: any) => objJson.Id;
    }

    /**
     * Matches the value of a property in the json with a provided value, otherwise just checks for the property being present.
     * @param prop
     * @param expectedValue
     * @returns
     */
    private predicatePropertyMatch(prop: PropertyType, expectedValue?: any) {
        return (json: any) => {
            const val = this.getProperty(prop, json);
            if (val === undefined) {
                return false;
            }
            return expectedValue ? val.toString().toLowerCase() === expectedValue.toString().toLowerCase() : true;
        };
    }

    private predicateNot(predicate: (json: any) => boolean) {
        return (json: any) => !predicate(json);
    }

    private predicateTargetObjectMatch(expectedTarget: string) {
        return (json: any) => json.TargetObject.toLowerCase() === expectedTarget;
    }

    /// Page related
    public findPage(predicates: ((json: any) => boolean)[]): string | undefined {
        return this.findObject(ObjectType.page, predicates);
    }

    public predicatePageOnSourceTable(tablename: string) {
        return (json: any) => {
            if (this.predicatePropertyMatch(PropertyType.sourceTable, tablename)(json)) {
                return true;
            }
            const tableId = this.subObjectId()((this.getObject(ObjectType.table, tablename) as ObjectDetail).body);
            return this.predicatePropertyMatch(PropertyType.sourceTable, tableId)(json);
        };
    }

    public predicatePageIsListPage() {
        return this.predicatePropertyMatch(PropertyType.pageType, 'List');
    }

    public predicatePageIsCardPage() {
        return this.predicatePropertyMatch(PropertyType.pageType, 'Card');
    }
}