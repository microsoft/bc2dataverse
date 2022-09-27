import * as vscode from 'vscode';
import * as al from './helpers/al';
import { getPackagesPath, getProject, getDataverseEntityName } from './helpers/utils';
import { SymbolManager } from './symbols';

export class ListPageGen {
    public input: {
        projectPath?: vscode.Uri,
        packagesPath?: vscode.Uri,
        cdsEntity?: string,
        proxyTableName?: string,
    };

    private symbols: SymbolManager;

    public constructor(context: vscode.ExtensionContext) {
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
            });
    }

    public async createListPage() {
        return new ListPageCreator(this.input.cdsEntity as string, this.input.proxyTableName as string, this.symbols)
            .run();
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

    public static getValidNameForPage(proxyTable: string) {
        return al.Helpers.truncateObjectNameToMaxLength(`${proxyTable} List`);
    }
}

class ListPageCreator {
    entity: string;
    proxyTable: string;
    symbols: SymbolManager;

    public constructor(entity: string, proxyTable: string, symbols: SymbolManager) {
        this.entity = entity;
        this.proxyTable = proxyTable;
        this.symbols = symbols;
    }

    public async run() {
        return new al.Page({
            id: this.symbols.getTableId(this.proxyTable) as number,
            name: ListPageGen.getValidNameForPage(this.proxyTable),
            comments: `// This page shows the fields on the proxy table ${this.proxyTable}.`,
            props: [
                new al.Property({ type: al.PropertyType.pageType, value: 'List' }),
                new al.Property({ type: al.PropertyType.sourceTable, value: `${this.proxyTable}` }),
                new al.Property({ type: al.PropertyType.editable, value: false }),
                new al.Property({ type: al.PropertyType.applicationArea, value: 'All' }),
                new al.Property({ type: al.PropertyType.usageCategory, value: 'Lists' }),
                new al.Property({ type: al.PropertyType.caption, value: `CDS ${this.entity}` }),
            ],
            fieldGroups: [
                new al.PageGroupPageField({
                    comments: `// Please toggle the ${al.PropertyType.visible} property below to show the fields needed on the page.`,
                    type: al.PageGroupType.repeater,
                    name: 'General',
                    items: this.getPageFields()
                })
            ],
            actions: [
                new al.Action({
                    name: 'CreateFromDataverse',
                    props: [
                        new al.Property({ type: al.PropertyType.applicationArea, value: 'All' }),
                        new al.Property({ type: al.PropertyType.caption, value: 'Create in Business Central' }),
                        new al.Property({ type: al.PropertyType.promoted, value: true }),
                        new al.Property({ type: al.PropertyType.promotedCategory, value: 'Process' }),
                        new al.Property({ type: al.PropertyType.toolTip, value: `Generate the record from the coupled Microsoft Dataverse ${this.entity}.` }),
                    ],
                    triggers: [
                        new al.Trigger({
                            type: al.TriggerType.onAction,
                            vars: [
                                new al.NamedVar({ name: this.proxyTable, type: al.VarType.record, subType: this.proxyTable }),
                                new al.NamedVar({ name: 'CRM Integration Management', type: al.VarType.codeunit, subType: 'CRM Integration Management' })
                            ],
                            code: new al.StringBuilder([
                                `CurrPage.SetSelectionFilter(${al.Helpers.removeSpecialChars(this.proxyTable)});`,
                                `CRMIntegrationManagement.CreateNewRecordsFromCRM(${al.Helpers.removeSpecialChars(this.proxyTable)});`
                            ])
                        })
                    ]
                })],
            vars: [new al.NamedVar({ name: `CurrentlyCoupled${this.proxyTable}`, type: al.VarType.record, subType: `${this.proxyTable}` })],
            triggers: [
                new al.Trigger({ type: al.TriggerType.onInit, code: new al.StringBuilder([`Codeunit.Run(Codeunit::"CRM Integration Management");`]) })
            ],
            procedures: [
                new al.Procedure({
                    local: false,
                    name: `SetCurrentlyCoupled${al.Helpers.removeSpecialChars(this.proxyTable)}`,
                    params: [new al.Param({ name: this.proxyTable, type: al.VarType.record, subType: this.proxyTable })],
                    code: new al.StringBuilder([`CurrentlyCoupled${al.Helpers.removeSpecialChars(this.proxyTable)} := ${al.Helpers.removeSpecialChars(this.proxyTable)};`])
                })
            ]
        })
            .writeToProject();
    }

    private getPageFields(): al.PageField[] {
        let result: al.PageField[] = [];
        this.symbols
            .getTableFields(this.proxyTable)
            .forEach(f => {
                result.push(new al.PageField({
                    props: [
                        new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                        new al.Property({ type: al.PropertyType.caption, value: f.name }),
                        new al.Property({ type: al.PropertyType.toolTip, value: `Specifies the ${f.name} value of the ${this.proxyTable} record.` }),
                        new al.Property({ type: al.PropertyType.visible, value: false })
                    ],
                    name: al.Helpers.doubleQuoteIfHasSpecialChars(f.name),
                    sourceExpression: `Rec.${al.Helpers.doubleQuoteIfHasSpecialChars(f.name)}`
                }));
            });
        return result;
    }
}