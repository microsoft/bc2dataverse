import * as vscode from 'vscode';
import * as consts from './consts';
import { SymbolManager } from './symbols';
import * as al from './helpers/al';
import { sorter } from "./helpers/string";
import { catchAndShowError } from './helpers/errors';
import { readFileSync } from 'fs';
import { join } from 'path';

enum SyncDirection {
    both,
    toBC,
    toDataverse
}

interface IFieldMapping { // This is the type that is returned from the javascript for the web view panel
    bcField: string,
    syncDirection: SyncDirection,
    syncFrom: {
        source: 'proxyField' | 'constant',
        value: string
    }
}

interface ICodeGenInput {
    cdsEntity: string;
    bcTable: string;
    proxyTable: string;
    mappings: IFieldMapping[];
    symbols: SymbolManager;
}

enum SyncInteractionType {
    noSync = "No sync",
    biDirectional = "Bi- directional sync",
    toBC = "From Dataverse only",
    toDataverse = "To Dataverse only",
    constant = "Fill constant value"
}


export class FieldMappingPanel {
    private panel: vscode.WebviewPanel;
    private bcTable: string;
    private proxyTable: string;
    private bcTableFields;
    private proxyTableFields;

    public constructor(private context: vscode.ExtensionContext, private cdsEntity: string, bcTableName: string, proxyTableName: string, symbols: SymbolManager) { // TODO move all private properties to constructor for all classes
        this.bcTable = bcTableName;
        this.proxyTable = proxyTableName;
        this.panel = vscode.window.createWebviewPanel('fieldMappings', 'Map Dataverse fields',
            { viewColumn: vscode.ViewColumn.One },
            { enableScripts: true });

        this.bcTableFields = symbols.getTableFields(this.bcTable);
        this.proxyTableFields = symbols.getTableFields(this.proxyTable);

        this.panel.webview.html = this.getHtml().toString();

        this.panel.webview.onDidReceiveMessage(
            message => {
                this.panel.dispose(); // close the panel, so user does not make further inputs

                switch (message.command) {
                    case `${consts.htmlGenMappingsFuncName}`:
                        try {
                            const input: ICodeGenInput = {
                                cdsEntity: this.cdsEntity,
                                bcTable: this.bcTable,
                                proxyTable: this.proxyTable,
                                mappings: this.curateMappings(message.mappings),
                                symbols: symbols
                            };
                            const promises: Promise<vscode.TextEditor | undefined>[] = [
                                new Promise(() => {
                                    return new MappingCreator(input)
                                        .run()
                                        .catch(e => catchAndShowError(e));
                                }),
                                new Promise(() => {
                                    return new CoupledToCDSFieldAdder(input)
                                        .run()
                                        .catch(e => catchAndShowError(e));
                                }),
                                new Promise(() => {
                                    return new BCTablePageExtension(input)
                                        .run()
                                        .catch(e => catchAndShowError(e));
                                })
                            ];
                            Promise.all(promises);
                        }
                        catch (err) {
                            catchAndShowError(err);
                        }
                        return;
                    default:
                        console.warn(`Unknown request from webview: ${JSON.stringify(message)}`);
                }
            });
    }

    private getHtml() {
        const filePath: vscode.Uri = vscode.Uri.file(join(this.context.extensionPath, 'out', 'defineMappings.html'));
        return readFileSync(filePath.fsPath, 'utf-8')
            .replaceAll("${consts.htmlGenMappingsFuncName}", consts.htmlGenMappingsFuncName)
            .replaceAll("${this.proxyTable}", this.proxyTable)
            .replaceAll("${this.bcTable}", this.bcTable)
            .replaceAll("${this.getMappedRows()}", this.getMappedRows())
            .replaceAll("${this.getProxyFieldListAsOptions()}", this.getProxyFieldListAsOptions())
            .replaceAll("${consts.htmlGenMappingsFuncName}", consts.htmlGenMappingsFuncName)
            .replaceAll("${SyncInteractionType.noSync}", SyncInteractionType.noSync)
            .replaceAll("${SyncInteractionType.biDirectional}", SyncInteractionType.biDirectional)
            .replaceAll("${SyncInteractionType.toBC}", SyncInteractionType.toBC)
            .replaceAll("${SyncInteractionType.toDataverse}", SyncInteractionType.toDataverse)
            .replaceAll("${SyncInteractionType.constant}", SyncInteractionType.constant)
            .replaceAll("${consts.htmlFieldRowSuffix}", consts.htmlFieldRowSuffix)
            .replaceAll("${consts.htmlFieldNameSuffix}", consts.htmlFieldNameSuffix)
            .replaceAll("${consts.htmlSyncTypeSuffix}", consts.htmlSyncTypeSuffix)
            .replaceAll("${consts.htmlSelectFieldSuffix}", consts.htmlSelectFieldSuffix)
            .replaceAll("${consts.htmlConstantValSuffix}", consts.htmlConstantValSuffix)
            .replaceAll("${consts.htmlConstantValDefault}", consts.htmlConstantValDefault)
            .replaceAll("${consts.htmlProxyFieldDataListId}", consts.htmlProxyFieldDataListId);
    }

    private getMappedRows() {
        let result: string = '';
        this.bcTableFields
            .sort(sorter(x => x.name))
            .forEach(field => {
                result += ` <tr id="${field.name}${consts.htmlFieldRowSuffix}">
                                <td id="${field.name}${consts.htmlFieldNameSuffix}">${field.name}</td>
                                <td>${this.getSyncInteractionSelect(field.name)}</td>
                                <td>${this.getDataSource(field.name)}</td>
                            </tr>`;
            });
        return result;
    }

    private getSyncInteractionSelect(bcFieldName: string) {
        return `<select id="${bcFieldName}${consts.htmlSyncTypeSuffix}" onchange="onSyncInteractionTypeChanged(this)">
                    <option value="${SyncInteractionType.noSync}">${SyncInteractionType.noSync}</option>
                    <option value="${SyncInteractionType.biDirectional}">${SyncInteractionType.biDirectional}</option>
                    <option value="${SyncInteractionType.toBC}">${SyncInteractionType.toBC}</option>
                    <option value="${SyncInteractionType.toDataverse}">${SyncInteractionType.toDataverse}</option>
                    <option value="${SyncInteractionType.constant}">${SyncInteractionType.constant}</option>
                </select>`;
    }

    private getDataSource(bcFieldName: string) {
        return `<input list="${consts.htmlProxyFieldDataListId}" id="${bcFieldName}${consts.htmlSelectFieldSuffix}" placeholder="${consts.htmlProxyFieldSelectDefault}" />
                <input type="text" id="${bcFieldName}${consts.htmlConstantValSuffix}" placeholder="${consts.htmlConstantValDefault}" />`;
    }

    private getProxyFieldListAsOptions() {
        let result = '';
        this.proxyTableFields
            // TODO: filter for the field being of the same type as the bc field
            .sort(sorter(x => x.name))
            .forEach(field => {
                result += `<option value="${field.name}">
                            ${field.publisher}
                           </option>`;
            });
        return result;
    }

    private curateMappings(mappings_: any[]) {
        let mappings: IFieldMapping[];
        try {
            mappings = mappings_.map(m => ({
                bcField: m.bcField,
                syncFrom: {
                    source: m.syncFrom.source,
                    value: m.syncFrom.value
                },
                syncDirection: this.getSyncDirectionFrom(m)
            }));
        }
        catch {
            throw new Error('Received the field mappings in an invalid format.');
        }

        let hasDupes = (getValueToCompare: (mapping: IFieldMapping) => any, workOnMappings: IFieldMapping[]) => {
            let duplicateVal: any;
            return {
                result: workOnMappings.some((v, idx) => {
                    if (idx === workOnMappings.length - 1) // at last element
                    {
                        return false;
                    }
                    for (let i = idx + 1; i < workOnMappings.length; i++) {
                        if (getValueToCompare(workOnMappings[i]) === getValueToCompare(v)) {
                            duplicateVal = getValueToCompare(v);
                            return true;
                        }
                    }
                    return false;
                }),
                value: duplicateVal
            };
        };

        // unique bcField
        let dupes = hasDupes(m => m.bcField, mappings);
        if (dupes.result) {
            throw new Error(`The ${dupes.value} field in the Business Central table has been mapped more than once.`);
        }

        // unique proxyField
        dupes = hasDupes(m => m.syncFrom.value, mappings.filter(m => m.syncFrom.source === 'proxyField'));
        if (dupes.result) {
            throw new Error(`The ${dupes.value} field in the proxy table has been mapped more than once.`);
        }

        if (mappings.length === 0) {
            throw new Error('No field mappings specified.');
        }

        return mappings;
    }

    private getSyncDirectionFrom(m: any): SyncDirection {
        switch (m.syncFrom.source) {
            case 'constant':
                return SyncDirection.toBC;
            case 'proxyField':
                switch (m.syncDirection) {
                    case SyncInteractionType.biDirectional:
                        return SyncDirection.both;
                    case SyncInteractionType.toBC:
                        return SyncDirection.toBC;
                    case SyncInteractionType.toDataverse:
                        return SyncDirection.toDataverse;
                }
        }
        return SyncDirection.both;
    }
}

class MappingCreator {
    public constructor(readonly input: ICodeGenInput) { }

    public async run() {
        const mappingName = `${al.Helpers.removeSpecialChars(this.input.bcTable.toUpperCase())}-${al.Helpers.removeSpecialChars(this.input.proxyTable.toUpperCase())}`;
        const mappingFuncName = `Add${al.Helpers.removeSpecialChars(`${this.input.bcTable}${this.input.cdsEntity}`)}Mapping`;

        const bcTableName = al.Helpers.doubleQuoteIfHasSpecialChars(this.input.bcTable);
        let bcTablePageName = this.input.symbols.findPage([this.input.symbols.predicatePageOnSourceTable(this.input.bcTable), this.input.symbols.predicatePageIsCardPage()]);
        if (bcTablePageName === undefined) {
            bcTablePageName = this.input.symbols.findPage([this.input.symbols.predicatePageOnSourceTable(this.input.bcTable), this.input.symbols.predicatePageIsListPage()]);
            if (bcTablePageName === undefined) {
                throw new Error(`No page based on the ${this.input.bcTable} table found.`);
            }
        }
        const shortBCTableName = al.Helpers.removeSpecialChars(this.input.bcTable);

        const proxyTableName = al.Helpers.doubleQuoteIfHasSpecialChars(this.input.proxyTable);
        const shortProxyTableName = al.Helpers.removeSpecialChars(this.input.proxyTable);
        const proxyListPageName = this.input.symbols.findPage([this.input.symbols.predicatePageOnSourceTable(this.input.proxyTable), this.input.symbols.predicatePageIsListPage()]);
        if (proxyListPageName === undefined) {
            throw new Error(`No list page based on the ${this.input.proxyTable} table found. Did you generate the list page and then compile it?`);
        }
        const shortProxyListPageName = al.Helpers.removeSpecialChars(proxyListPageName);
        const primaryKeyFieldProxyTable = al.Helpers.doubleQuoteIfHasSpecialChars(this.input.symbols.getPrimaryKeyField(this.input.proxyTable) as string);

        return new al.Codeunit({
            comments: `// This codeunit maps the ${this.input.bcTable} table to the ${this.input.proxyTable} table based on the Dataverse entity ${this.input.cdsEntity}.`,
            id: this.input.symbols.getTableId(this.input.proxyTable) as number,
            name: al.Helpers.truncateObjectNameToMaxLength(`${this.input.proxyTable}-${this.input.bcTable} Map`),
            vars: [
                new al.NamedVar({ name: 'IntegrationTablePrefixTok', type: al.VarType.label, subType: 'Dataverse', labelComment: 'Product name', labelLocked: true }),
                new al.NamedVar({ name: 'JobQueueEntryNameTok', type: al.VarType.label, subType: '%1 - %2 synchronization job.', labelComment: '%1 = The Integration Table Name to synchronized (ex. CUSTOMER), %2 = CRM product name' })
            ],
            procedures: [
                new al.Procedure({
                    eventSubscriber: new al.EventSubscriber({
                        objectType: al.ObjectType.codeunit,
                        objectName: 'CRM Setup Defaults',
                        eventName: 'OnGetCDSTableNo'
                    }),
                    local: true,
                    name: 'HandleOnGetCDSTableNo',
                    comments: `// Declare that the ${this.input.proxyTable} table is mapped to the ${this.input.bcTable} table.`,
                    params: [
                        new al.Param({ name: 'BCTableNo', type: al.VarType.integer }),
                        new al.Param({ isVar: true, name: 'CDSTableNo', type: al.VarType.integer }),
                        new al.Param({ isVar: true, name: 'handled', type: al.VarType.boolean }),
                    ],
                    code: new al.StringBuilder([
                        `if BCTableNo = DATABASE::${bcTableName} then begin`,
                        new al.StringBuilder(`CDSTableNo := DATABASE::${proxyTableName};`, 1),
                        new al.StringBuilder(`handled := true;`, 1),
                        `end;`
                    ])
                }),

                new al.Procedure({
                    eventSubscriber: new al.EventSubscriber({
                        objectType: al.ObjectType.codeunit,
                        objectName: 'Lookup CRM Tables',
                        eventName: 'OnLookupCRMTables'
                    }),
                    local: true,
                    comments: `// Provide lookup functionality for the ${this.input.proxyTable} table that opens the page to show its contents.`,
                    name: 'HandleOnLookupCRMTables',
                    params: [
                        new al.Param({ name: 'CRMTableID', type: al.VarType.integer }),
                        new al.Param({ name: 'NAVTableId', type: al.VarType.integer }),
                        new al.Param({ name: 'SavedCRMId', type: al.VarType.guid }),
                        new al.Param({ name: 'CRMId', type: al.VarType.guid, isVar: true }),
                        new al.Param({ name: 'IntTableFilter', type: al.VarType.text }),
                        new al.Param({ name: 'Handled', type: al.VarType.boolean, isVar: true }),
                    ],
                    code: new al.StringBuilder([
                        `if CRMTableID = Database::${proxyTableName} then`,
                        new al.StringBuilder(`Handled := Lookup${shortProxyTableName}(SavedCRMId, CRMId, IntTableFilter);`, 1)
                    ])
                }),
                new al.Procedure({
                    local: true,
                    name: `Lookup${shortProxyTableName}`,
                    params: [
                        new al.Param({ name: 'SavedCRMId', type: al.VarType.guid }),
                        new al.Param({ name: 'CRMId', type: al.VarType.guid, isVar: true }),
                        new al.Param({ name: 'IntTableFilter', type: al.VarType.text }),
                    ],
                    returns: new al.Var({ type: al.VarType.boolean }),
                    vars: [
                        new al.NamedVar({ name: shortProxyTableName, type: al.VarType.record, subType: this.input.proxyTable }),
                        new al.NamedVar({ name: `Original${shortProxyTableName}`, type: al.VarType.record, subType: this.input.proxyTable }),
                        new al.NamedVar({ name: shortProxyListPageName, type: al.VarType.page, subType: proxyListPageName }),
                    ],
                    code: new al.StringBuilder([
                        new al.StringBuilder(`if not IsNullGuid(CRMId) then begin`),
                        new al.StringBuilder(`if ${shortProxyTableName}.Get(CRMId) then`, 1),
                        new al.StringBuilder(`${shortProxyListPageName}.SetRecord(${shortProxyTableName});`, 2),
                        new al.StringBuilder(`if not IsNullGuid(SavedCRMId) then`, 1),
                        new al.StringBuilder(`if Original${shortProxyTableName}.Get(SavedCRMId) then`, 2),
                        new al.StringBuilder(`${shortProxyListPageName}.SetCurrentlyCoupled${shortProxyTableName}(Original${shortProxyTableName});`, 3),
                        new al.StringBuilder(`end;`),
                        new al.StringBuilder(``),
                        new al.StringBuilder(`${shortProxyTableName}.SetView(IntTableFilter);`),
                        new al.StringBuilder(`${shortProxyListPageName}.SetTableView(${shortProxyTableName});`),
                        new al.StringBuilder(`${shortProxyListPageName}.LookupMode(true);`),
                        new al.StringBuilder(`if ${shortProxyListPageName}.RunModal = ACTION::LookupOK then begin`),
                        new al.StringBuilder(`${shortProxyListPageName}.GetRecord(${shortProxyTableName});`, 1),
                        new al.StringBuilder(`CRMId := ${shortProxyTableName}.${primaryKeyFieldProxyTable};`, 1),
                        new al.StringBuilder(`exit(true);`, 1),
                        new al.StringBuilder(`end;`),
                        new al.StringBuilder(`exit(false);`),
                    ]),
                }),

                new al.Procedure({
                    local: true,
                    eventSubscriber: new al.EventSubscriber({
                        objectType: al.ObjectType.codeunit,
                        objectName: 'CRM Setup Defaults',
                        eventName: 'OnAddEntityTableMapping'
                    }),
                    name: 'HandleOnAddEntityTableMapping',
                    params: [
                        new al.Param({ name: 'TempNameValueBuffer', type: al.VarType.record, subType: 'Name/Value Buffer', isVar: true, temporary: true })
                    ],
                    vars: [
                        new al.NamedVar({ name: 'CRMSetupDefaults', type: al.VarType.codeunit, subType: 'CRM Setup Defaults' })
                    ],
                    code: new al.StringBuilder([
                        `CRMSetupDefaults.AddEntityTableMapping('${this.input.cdsEntity}', Database::${bcTableName}, TempNameValueBuffer);`,
                        `CRMSetupDefaults.AddEntityTableMapping('${this.input.cdsEntity}', Database::${proxyTableName}, TempNameValueBuffer);`,
                    ])
                }),

                new al.Procedure({
                    local: true,
                    eventSubscriber: new al.EventSubscriber({
                        objectType: al.ObjectType.codeunit,
                        objectName: 'CDS Setup Defaults',
                        eventName: 'OnAfterResetConfiguration'
                    }),
                    name: 'HandleOnAfterResetConfiguration',
                    params: [
                        new al.Param({ name: 'CDSConnectionSetup', type: al.VarType.record, subType: "CDS Connection Setup" })
                    ],
                    code: new al.StringBuilder([
                        `${mappingFuncName}('${al.Helpers.truncateTextToMaxSize(mappingName, 20)}', true); ${mappingName.length > 20 ? `// truncated to 20 characters from ${mappingName}` : ''}`
                    ])
                }),

                new al.Procedure({
                    local: true,
                    name: mappingFuncName,
                    params: [
                        new al.Param({ name: 'IntegrationTableMappingName', type: al.VarType.code, subType: 20 }),
                        new al.Param({ name: 'ShouldRecreateJobQueueEntry', type: al.VarType.boolean }),
                    ],
                    vars: [
                        new al.NamedVar({ name: 'IntegrationTableMapping', type: al.VarType.record, subType: 'Integration Table Mapping' }),
                        new al.NamedVar({ name: 'IntegrationFieldMapping', type: al.VarType.record, subType: 'Integration FIeld Mapping' }),
                        new al.NamedVar({ name: shortProxyTableName, type: al.VarType.record, subType: proxyTableName }),
                        new al.NamedVar({ name: shortBCTableName, type: al.VarType.record, subType: bcTableName })
                    ],
                    code: new al.StringBuilder([
                        new al.StringBuilder(`InsertIntegrationTableMapping(`),
                        new al.StringBuilder(`IntegrationTableMapping, IntegrationTableMappingName,`, 1),
                        new al.StringBuilder(`Database::${bcTableName}, Database::${proxyTableName},`, 1),
                        new al.StringBuilder(`${shortProxyTableName}.FieldNo(${primaryKeyFieldProxyTable}), ${shortProxyTableName}.FieldNo(ModifiedOn),`, 1),
                        new al.StringBuilder(`'', '', true);`, 1),
                        ``,
                        `${shortProxyTableName}.Reset();`,
                        `// Add filters on the ${this.input.proxyTable} table before sync`,
                        `IntegrationTableMapping.SetIntegrationTableFilter(`,
                        new al.StringBuilder(`GetTableFilterFromView(Database::${proxyTableName}, ${shortProxyTableName}.TableCaption(), ${shortProxyTableName}.GetView()));`, 1),
                        `IntegrationTableMapping.Modify();`,
                        ``,
                        this.fieldMappingCode(shortBCTableName),
                        ``,
                        `RecreateJobQueueEntryFromIntTableMapping(IntegrationTableMapping, 30, ShouldRecreateJobQueueEntry, 720);`
                    ])
                }),

                new al.Procedure({
                    local: true,
                    name: 'GetTableFilterFromView',
                    params: [
                        new al.Param({ name: 'TableID', type: al.VarType.integer }),
                        new al.Param({ name: 'Caption', type: al.VarType.text }),
                        new al.Param({ name: 'View', type: al.VarType.text })
                    ],
                    returns: new al.Var({ type: al.VarType.text }),
                    vars: [
                        new al.NamedVar({ name: 'FilterBuilder', type: al.VarType.filterPageBuilder })
                    ],
                    code: new al.StringBuilder([
                        `FilterBuilder.AddTable(Caption, TableID);`,
                        `FilterBuilder.SetView(Caption, View);`,
                        `exit(FilterBuilder.GetView(Caption, true));`
                    ])
                }),

                new al.Procedure({
                    local: true,
                    name: 'InsertIntegrationFieldMapping',
                    params: [
                        new al.Param({ name: 'IntegrationTableMappingName', type: al.VarType.code, subType: 20 }),
                        new al.Param({ name: 'TableFieldNo', type: al.VarType.integer }),
                        new al.Param({ name: 'IntegrationTableFieldNo', type: al.VarType.integer }),
                        new al.Param({ name: 'SyncDirection', type: al.VarType.integer }),
                        new al.Param({ name: 'ConstValue', type: al.VarType.text }),
                        new al.Param({ name: 'ValidateField', type: al.VarType.boolean }),
                        new al.Param({ name: 'ValidateIntegrationTableField', type: al.VarType.boolean })
                    ],
                    vars: [
                        new al.NamedVar({ name: 'IntegrationFieldMapping', type: al.VarType.record, subType: "Integration Field Mapping" })
                    ],
                    code: new al.StringBuilder([
                        `IntegrationFieldMapping.CreateRecord(IntegrationTableMappingName, TableFieldNo, IntegrationTableFieldNo, SyncDirection,`,
                        new al.StringBuilder(`ConstValue, ValidateField, ValidateIntegrationTableField);`, 1)
                    ])
                }),

                new al.Procedure({
                    local: true,
                    name: 'InsertIntegrationTableMapping',
                    params: [
                        new al.Param({ name: 'IntegrationTableMapping', type: al.VarType.record, subType: "Integration Table Mapping", isVar: true }),
                        new al.Param({ name: 'MappingName', type: al.VarType.code, subType: 20 }),
                        new al.Param({ name: 'TableNo', type: al.VarType.integer }),
                        new al.Param({ name: 'IntegrationTableNo', type: al.VarType.integer }),
                        new al.Param({ name: 'IntegrationTableUIDFieldNo', type: al.VarType.integer }),
                        new al.Param({ name: 'IntegrationTableModifiedFieldNo', type: al.VarType.integer }),
                        new al.Param({ name: 'TableConfigTemplateCode', type: al.VarType.code, subType: 10 }),
                        new al.Param({ name: 'IntegrationTableConfigTemplateCode', type: al.VarType.code, subType: 10 }),
                        new al.Param({ name: 'SynchOnlyCoupledRecords', type: al.VarType.boolean })
                    ],
                    code: new al.StringBuilder([
                        `IntegrationTableMapping.CreateRecord(MappingName, TableNo, IntegrationTableNo, IntegrationTableUIDFieldNo,`,
                        new al.StringBuilder(`IntegrationTableModifiedFieldNo, TableConfigTemplateCode, IntegrationTableConfigTemplateCode,`, 1),
                        new al.StringBuilder(`SynchOnlyCoupledRecords, IntegrationTableMapping.Direction::${this.getTableSyncDirection()}, IntegrationTablePrefixTok);`, 1)
                    ])
                }),

                new al.Procedure({
                    local: true,
                    name: 'RecreateJobQueueEntryFromIntTableMapping',
                    params: [
                        new al.Param({ name: 'IntegrationTableMapping', type: al.VarType.record, subType: "Integration Table Mapping" }),
                        new al.Param({ name: "IntervalInMinutes", type: al.VarType.integer }),
                        new al.Param({ name: 'ShouldRecreateJobQueueEntry', type: al.VarType.boolean }),
                        new al.Param({ name: 'InactivityTimeoutPeriod', type: al.VarType.integer })
                    ],
                    vars: [
                        new al.NamedVar({ name: 'JobQueueEntry', type: al.VarType.record, subType: "Job Queue Entry" })
                    ],
                    code: new al.StringBuilder([
                        `JobQueueEntry.SetRange("Object Type to Run", JobQueueEntry."Object Type to Run"::Codeunit);`,
                        `JobQueueEntry.SetRange("Object ID to Run", Codeunit::"Integration Synch. Job Runner");`,
                        `JobQueueEntry.SetRange("Record ID to Process", IntegrationTableMapping.RecordId);`,
                        `JobQueueEntry.DeleteTasks();`,
                        ``,
                        `JobQueueEntry.InitRecurringJob(IntervalInMinutes);`,
                        `JobQueueEntry."Object Type to Run" := JobQueueEntry."Object Type to Run"::Codeunit;`,
                        `JobQueueEntry."Object ID to Run" := Codeunit::"Integration Synch. Job Runner";`,
                        `JobQueueEntry."Record ID to Process" := IntegrationTableMapping.RecordId;`,
                        `JobQueueEntry."Run in User Session" := false;`,
                        `JobQueueEntry.Description :=`,
                        new al.StringBuilder(`CopyStr(StrSubstNo(JobQueueEntryNameTok, IntegrationTableMapping.Name, 'Dataverse'), 1, MaxStrLen(JobQueueEntry.Description));`, 1),
                        `JobQueueEntry."Maximum No. of Attempts to Run" := 10;`,
                        `JobQueueEntry.Status := JobQueueEntry.Status::Ready;`,
                        `JobQueueEntry."Rerun Delay (sec.)" := 30;`,
                        `JobQueueEntry."Inactivity Timeout Period" := InactivityTimeoutPeriod;`,
                        `if ShouldRecreateJobQueueEntry then`,
                        new al.StringBuilder(`Codeunit.Run(Codeunit::"Job Queue - Enqueue", JobQueueEntry)`, 1),
                        `else`,
                        new al.StringBuilder(`JobQueueEntry.Insert(true);`, 1)
                    ])
                }),

                new al.Procedure({
                    eventSubscriber: new al.EventSubscriber({
                        objectType: al.ObjectType.codeunit,
                        objectName: 'Integration Rec. Synch. Invoke',
                        eventName: 'OnBeforeTransferRecordFields'
                    }),
                    local: true,
                    name: 'ChangeFieldDataOnBeforeTransferRecordFields',
                    params: [
                        new al.Param({ name: 'SourceRecordRef', type: al.VarType.recordRef }),
                        new al.Param({ name: 'DestinationRecordRef', type: al.VarType.recordRef, isVar: true })
                    ],
                    vars: [
                        new al.NamedVar({ name: shortProxyTableName, type: al.VarType.record, subType: proxyTableName }),
                        new al.NamedVar({ name: shortBCTableName, type: al.VarType.record, subType: bcTableName })
                    ],
                    code: new al.StringBuilder(this.getFieldTransformationCode(bcTableName, shortBCTableName, proxyTableName, shortProxyTableName))
                })
            ]
        })
            .writeToProject();
    }

    private fieldMappingCode(shortBCTableName: string): al.StringBuilder {
        const result = new al.StringBuilder();
        this.input.mappings
            .forEach(m => {
                let fieldNoText, constantValueText, syncDirectionText: string;
                if (m.syncFrom.source === 'constant') {
                    fieldNoText = '0';
                    constantValueText = m.syncFrom.value;
                    syncDirectionText = this.integrationDirection(SyncDirection.toBC);
                } else {
                    fieldNoText = `${al.Helpers.removeSpecialChars(this.input.proxyTable)}.FieldNo(${al.Helpers.doubleQuoteIfHasSpecialChars(m.syncFrom.value)})`;
                    constantValueText = '';
                    syncDirectionText = this.integrationDirection(m.syncDirection);
                }

                result.append([
                    `// Map ${m.syncFrom.source} ${m.syncFrom.value} to ${m.bcField}`,
                    `InsertIntegrationFieldMapping(IntegrationTableMappingName, ${shortBCTableName}.FieldNo(${al.Helpers.doubleQuoteIfHasSpecialChars(m.bcField)}),`,
                    new al.StringBuilder(`${fieldNoText}, IntegrationTableMapping.Direction::${syncDirectionText}, '${constantValueText}', true, false);`, 1)
                ]);
            });
        return result;
    }

    private integrationDirection(syncDirection: SyncDirection) {
        switch (syncDirection) {
            case SyncDirection.toBC:
                return `FromIntegrationTable`;
            case SyncDirection.toDataverse:
                return `ToIntegrationTable`;
            case SyncDirection.both:
                return `Bidirectional`;
        }
    }

    private getTableSyncDirection() {
        if (this.input.mappings.some(m => m.syncDirection === SyncDirection.both)) {
            return this.integrationDirection(SyncDirection.both);
        }
        const fieldMappingsToBCExist = this.input.mappings.some(m => m.syncDirection === SyncDirection.toBC);
        const fieldMappingsToDataverseExist = this.input.mappings.some(m => m.syncDirection === SyncDirection.toDataverse);
        if (fieldMappingsToBCExist) {
            if (fieldMappingsToDataverseExist) {
                return this.integrationDirection(SyncDirection.both);
            }
            return this.integrationDirection(SyncDirection.toBC);
        }
        if (fieldMappingsToDataverseExist) {
            return this.integrationDirection(SyncDirection.toDataverse);
        }
        return this.integrationDirection(SyncDirection.both); // default
    }

    private getFieldTransformationCode(bcTableName: string, shortBCTableName: string, proxyTableName: string, shortProxyTableName: string) {
        const result = [];
        const syncDir = this.getTableSyncDirection();
        if ((syncDir === 'Bidirectional') || (syncDir === 'ToIntegrationTable')) {
            result.push('// Initialize before moving data from the Business Central table to the Dataverse');
            result.push(`if (SourceRecordRef.Number = Database::${bcTableName}) and (DestinationRecordRef.Number = Database::${proxyTableName}) then begin`);
            result.push(new al.StringBuilder(`SourceRecordRef.SetTable(${shortBCTableName});`, 1));
            result.push(new al.StringBuilder(`DestinationRecordRef.SetTable(${shortProxyTableName});`, 1));
            result.push(new al.StringBuilder(`// initialize or transform ${proxyTableName} fields`, 1));
            result.push(new al.StringBuilder(`// ${shortProxyTableName}.field := value;`, 1));
            result.push(new al.StringBuilder(`DestinationRecordRef.GetTable(${shortProxyTableName});`, 1));
            result.push(`end;`);
        }
        if ((syncDir === 'Bidirectional') || (syncDir === 'FromIntegrationTable')) {
            result.push('// Initialize before moving data from the Dataverse to the Business Central table');
            result.push(`if (SourceRecordRef.Number = Database::${proxyTableName}) and (DestinationRecordRef.Number = Database::${bcTableName}) then begin`);
            result.push(new al.StringBuilder(`SourceRecordRef.SetTable(${shortProxyTableName});`, 1));
            result.push(new al.StringBuilder(`DestinationRecordRef.SetTable(${shortBCTableName});`, 1));
            result.push(new al.StringBuilder(`// initialize or transform ${bcTableName} fields`, 1));
            result.push(new al.StringBuilder(`// ${shortBCTableName}.field := value;`, 1));
            result.push(new al.StringBuilder(`DestinationRecordRef.GetTable(${shortBCTableName});`, 1));
            result.push(`end;`);
        }
        return result;
    }
}

class CoupledToCDSFieldAdder {
    public constructor(readonly input: ICodeGenInput) { }

    private async coupledFieldExists() {
        return this.input.symbols
            .getTableFields(this.input.bcTable)
            .find(item => item.name === consts.coupledToCRMFieldLbl) !== undefined;
    }

    public async run() {
        return this.coupledFieldExists()
            .then(exists => {
                if (exists) {
                    console.warn(`A field with name ${consts.coupledToCRMFieldLbl} already exists on the ${this.input.proxyTable} table.`);
                    return;
                }
                return new al.TableExtension({
                    comments: new al.StringBuilder([
                        `// This table extension adds the ${consts.coupledToCRMFieldLbl} field to the ${this.input.bcTable} table`,
                        `// to maintain its coupling status with the ${this.input.proxyTable} table.`]),
                    id: this.input.symbols.getTableId(this.input.proxyTable) as number,
                    name: al.Helpers.truncateObjectNameToMaxLength(`${this.input.bcTable} Ext`),
                    extends: this.input.bcTable,
                    fields: [
                        new al.TableField({
                            id: this.input.symbols.getTableId(this.input.proxyTable) as number,
                            name: consts.coupledToCRMFieldLbl,
                            type: new al.Var({
                                type: al.VarType.boolean
                            }),
                            props: [
                                new al.Property({ type: al.PropertyType.dataClassification, value: 'SystemMetadata' }),
                                new al.Property({ type: al.PropertyType.caption, value: consts.coupledToDataverseFieldLbl }),
                                new al.Property({ type: al.PropertyType.editable, value: 'false' })
                            ]
                        })
                    ],
                    procedures: [
                        new al.Procedure({
                            comments: `// Call this procedure to initialize the ${consts.coupledToCRMFieldLbl} field if the records had already been coupled before.`,
                            local: false,
                            name: 'SetCoupledFlags',
                            vars: [
                                new al.NamedVar({
                                    name: 'CRMIntegrationRecord',
                                    type: al.VarType.record,
                                    subType: 'CRM Integration Record'
                                }),
                                new al.NamedVar({
                                    name: 'CRMIntegrationManagement',
                                    type: al.VarType.codeunit,
                                    subType: 'CRM Integration Management'
                                })
                            ],
                            code: new al.StringBuilder([
                                `CRMIntegrationRecord.SetRange("Table ID", Database::${al.Helpers.doubleQuoteIfHasSpecialChars(this.input.bcTable)});`,
                                `if CRMIntegrationRecord.FindSet() then`,
                                new al.StringBuilder('repeat', 1),
                                new al.StringBuilder('CRMIntegrationManagement.SetCoupledFlag(CRMIntegrationRecord, true);', 2),
                                new al.StringBuilder('until CRMIntegrationRecord.Next() = 0;', 1),
                            ])
                        })
                    ]
                })
                    .writeToProject();
            });
    }
}

class BCTablePageExtension {
    public constructor(readonly input: ICodeGenInput) { }

    public async run() {
        const bcTableCardPageName = this.input.symbols.findPage([this.input.symbols.predicatePageOnSourceTable(this.input.bcTable)]);
        if (bcTableCardPageName === undefined) {
            console.warn(`Skipping creating page extension as card page not found on table ${this.input.bcTable}.`);
            return;
        }

        const shortTableName = al.Helpers.removeSpecialChars(this.input.proxyTable);
        return new al.PageExtension({
            id: this.input.symbols.getTableId(this.input.proxyTable) as number,
            name: al.Helpers.truncateObjectNameToMaxLength(`${this.input.bcTable} Ext`),
            extends: bcTableCardPageName,
            comments: `// Manage couplings and synchronization for the ${this.input.bcTable} records.`,
            actionGroups: [
                new al.PageGroupAction({
                    name: `ActionGroupDataverse`,
                    props: [
                        new al.Property({ type: al.PropertyType.caption, value: `Dataverse` }),
                        new al.Property({ type: al.PropertyType.visible, value: `DataverseIntegrationEnabled` }),
                    ],
                    items: [
                        new al.Action({
                            name: `GoTo${shortTableName}`,
                            props: [
                                new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                                new al.Property({ type: al.PropertyType.caption, value: this.input.cdsEntity }),
                                new al.Property({ type: al.PropertyType.enabled, value: `DataverseIsCoupledToRecord` }),
                                new al.Property({ type: al.PropertyType.image, value: `CoupledCustomer` }),
                                new al.Property({ type: al.PropertyType.toolTip, value: `Open the coupled Dataverse ${this.input.cdsEntity}.` })
                            ],
                            triggers: [
                                new al.Trigger({
                                    type: al.TriggerType.onAction,
                                    code: new al.StringBuilder([
                                        `CRMIntegrationManagement.ShowCRMEntityFromRecordID(Rec.RecordId);`
                                    ])
                                })
                            ]
                        }),

                        new al.Action({
                            name: `CDSSynchronizeNow`,
                            props: [
                                new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                                new al.Property({ type: al.PropertyType.caption, value: `Synchronize` }),
                                new al.Property({ type: al.PropertyType.image, value: `Refresh` }),
                                new al.Property({ type: al.PropertyType.toolTip, value: `Send or get updated data to or from Microsoft Dataverse.` }),
                                new al.Property({ type: al.PropertyType.enabled, value: `DataverseIsCoupledToRecord` })
                            ],
                            triggers: [
                                new al.Trigger({
                                    type: al.TriggerType.onAction,
                                    code: new al.StringBuilder([
                                        `CRMIntegrationManagement.UpdateOneNow(Rec.RecordId);`
                                    ])
                                })
                            ]
                        }),

                        new al.Action({
                            name: `ShowLog`,
                            props: [
                                new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                                new al.Property({ type: al.PropertyType.caption, value: `Synchronization Log` }),
                                new al.Property({ type: al.PropertyType.image, value: `Log` }),
                                new al.Property({ type: al.PropertyType.toolTip, value: `View integration synchronization jobs for the ${this.input.bcTable} table.` }),
                            ],
                            triggers: [
                                new al.Trigger({
                                    type: al.TriggerType.onAction,
                                    code: new al.StringBuilder([
                                        `CRMIntegrationManagement.ShowLog(Rec.RecordId);`
                                    ])
                                })
                            ]
                        }),
                    ],

                    groups: [
                        new al.PageGroupAction({
                            name: `Coupling`,
                            props: [
                                new al.Property({ type: al.PropertyType.caption, value: `Coupling` }),
                                new al.Property({ type: al.PropertyType.image, value: `LinkAccount` }),
                                new al.Property({ type: al.PropertyType.toolTip, value: `Create, change, or delete a coupling between the Business Central record and a Microsoft Dataverse row.` })
                            ],
                            items: [
                                new al.Action({
                                    name: `ManageDataverseCoupling`,
                                    props: [
                                        new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                                        new al.Property({ type: al.PropertyType.caption, value: `Set Up Coupling` }),
                                        new al.Property({ type: al.PropertyType.image, value: `LinkAccount` }),
                                        new al.Property({ type: al.PropertyType.toolTip, value: `Create or modify the coupling to the Microsoft Dataverse ${this.input.cdsEntity}.` }),
                                    ],
                                    triggers: [
                                        new al.Trigger({
                                            type: al.TriggerType.onAction,
                                            code: new al.StringBuilder([
                                                `CRMIntegrationManagement.DefineCoupling(Rec.RecordId);`
                                            ])
                                        })
                                    ]
                                }),

                                new al.Action({
                                    name: `DeleteDataverseCoupling`,
                                    props: [
                                        new al.Property({ type: al.PropertyType.applicationArea, value: `All` }),
                                        new al.Property({ type: al.PropertyType.caption, value: `Delete Coupling` }),
                                        new al.Property({ type: al.PropertyType.image, value: `UnLinkAccount` }),
                                        new al.Property({ type: al.PropertyType.enabled, value: `DataverseIsCoupledToRecord` }),
                                        new al.Property({ type: al.PropertyType.toolTip, value: `Delete the coupling to the Microsoft Dataverse ${this.input.cdsEntity}.` }),
                                    ],
                                    triggers: [
                                        new al.Trigger({
                                            type: al.TriggerType.onAction,
                                            code: new al.StringBuilder([
                                                `CRMCouplingManagement.RemoveCoupling(Rec.RecordId);`
                                            ])
                                        })
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ],
            triggers: [
                new al.Trigger({
                    type: al.TriggerType.onOpenPage,
                    code: new al.StringBuilder(`DataverseIntegrationEnabled := CRMIntegrationManagement.IsCDSIntegrationEnabled();`)
                }),
                new al.Trigger({
                    type: al.TriggerType.onAfterGetCurrRecord,
                    code: new al.StringBuilder([
                        `if DataverseIntegrationEnabled then`,
                        new al.StringBuilder(`DataverseIsCoupledToRecord := CRMCouplingManagement.IsRecordCoupledToCRM(Rec.RecordId);`, 1)
                    ])
                })
            ],
            vars: [
                new al.NamedVar({ name: `CRMIntegrationManagement`, type: al.VarType.codeunit, subType: `CRM Integration Management` }),
                new al.NamedVar({ name: `CRMCouplingManagement`, type: al.VarType.codeunit, subType: `CRM Coupling Management` }),
                new al.NamedVar({ name: `DataverseIntegrationEnabled`, type: al.VarType.boolean }),
                new al.NamedVar({ name: `DataverseIsCoupledToRecord`, type: al.VarType.boolean }),
            ]
        })
            .writeToProject();
    }
}
