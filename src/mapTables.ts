import { format } from 'util';
import * as vscode from 'vscode';
import { FieldMappingPanel } from './mapFieldsPanel';
import resources from "./resources";
import { SymbolManager } from './symbols';
import { getPackagesPath, getProject, getDataverseEntityName, showQuickPick } from './helpers/utils';
import { sorter } from './helpers/string';

export class Mapper {
    public input: {
        projectPath?: vscode.Uri,
        packagesPath?: vscode.Uri,
        cdsEntity?: string,
        proxyTableName?: string,
        mappedToTable?: string
    };

    private symbols: SymbolManager;

    public constructor(private context: vscode.ExtensionContext) {
        this.input = {};
        this.symbols = new SymbolManager(context);
    }

    public async getInputs() {
        return getProject()
            .then(p => {
                this.input.projectPath = p;
                return getPackagesPath(p);
            })
            .then(p => {
                this.input.packagesPath = p;
                return this.getEntity();
            })
            .then(() => {
                return this.populateTableToMapTo();
            });
    }

    private async getEntity() {
        if (this.input.cdsEntity) {
            return;
        }

        return getDataverseEntityName(this.symbols, this.input.projectPath?.fsPath as string, this.input.packagesPath?.fsPath as string)
            .then(entity => {
                this.input.cdsEntity = entity.entity;
                this.input.proxyTableName = entity.proxy;
            });
    }

    private async populateTableToMapTo() {
        if (this.input.mappedToTable) {
            return;
        }
        return showQuickPick({
            title: format(resources.selectMappToTableLbl, this.input.cdsEntity),
            placeHolder: 'Select table, for example: Employee'
        },
            () => this.findInternalTables())
            .then(choice => {
                if (choice) {
                    this.input.mappedToTable = choice.label;
                    return;
                }
                throw new Error(resources.badMappedToTableErr);
            });
    }

    private async findInternalTables(): Promise<vscode.QuickPickItem[]> {
        return this.symbols.initialize(this.input.packagesPath?.fsPath as string, this.input.projectPath?.fsPath as string)
            .then(() => this.symbols.getTablesNotMappedToDataverse())
            .then(r => {
                return r
                    .sort(sorter(x => x.name))
                    .map(item => ({ label: item.name, description: item.publisher }));
            });
    }

    public async showPanel() {
        return new FieldMappingPanel(this.context, this.input.cdsEntity as string, this.input.mappedToTable as string, this.input.proxyTableName as string, this.symbols);
    }

}