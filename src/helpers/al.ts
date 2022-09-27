import { getProject, handleOpenFileCommand } from "./utils";
import { join } from "path";
import { writeContent } from "./fileSystem";
import * as vscode from 'vscode';
import resources from "../resources";

export class Helpers {

    private static wrapTextWith(orig: string, wrapper: string) {
        let result = orig;
        if (!orig.startsWith(wrapper)) {
            result = `${wrapper}${orig}`;
        }

        if (!orig.endsWith(wrapper)) {
            result = `${result}${wrapper}`;
        }
        return result;
    }

    public static singleQuote(orig?: string) {
        return Helpers.wrapTextWith(orig ? orig : '', `'`);
    }

    private static doubleQuote(orig?: string) {
        return Helpers.wrapTextWith(orig ? orig : '', `"`);
    }

    public static trimDoubleQuotes(orig: string) {
        return orig.split('"').filter(s => s !== '"').join('');
    }

    public static doubleQuoteIfHasSpecialChars(orig: string) {
        return Helpers.hasSpecialCharacters(orig) ? Helpers.doubleQuote(orig) : orig;
    }

    private static hasSpecialCharacters(orig: string) {
        return orig !== Helpers.removeSpecialChars(orig);
    }

    public static removeSpecialChars(orig: string) {
        return orig.replace(/[^0-9a-zA-Z]/g, '');
    }

    public static truncateTextToMaxSize(orig: string, maxSize: number): string {
        if (orig.length <= maxSize) {
            return orig;
        }
        return orig.substring(0, maxSize);
    }

    static readonly maxObjectNameLength = 30;

    public static truncateObjectNameToMaxLength(passedName: string) {
        let objName = Helpers.trimDoubleQuotes(passedName);
        return Helpers.doubleQuoteIfHasSpecialChars(Helpers.truncateTextToMaxSize(objName, Helpers.maxObjectNameLength));
    }
}

export class StringBuilder {
    private lines: string[];

    public constructor(content?: string | StringBuilder | (string | StringBuilder | null)[], indent?: number) {
        this.lines = [];
        if (content) {
            this.append(content, indent);
        }
    }

    public append(content: string | StringBuilder | (string | StringBuilder | null)[], indent?: number) {
        if (typeof content === 'string') {
            this.appendLine(content, indent);
            return;
        }
        if (content instanceof StringBuilder) {
            this.appendStringBuilder(content, indent);
            return;
        }
        // must be an array
        content.forEach(line => {
            if (typeof line === 'string') {
                this.appendLine(line, indent);
                return;
            }
            if (line instanceof StringBuilder) {
                this.appendStringBuilder(line, indent);
                return;
            }
            // do not process nulls
        });
    }

    public toString(): string {
        return this.lines.join('\r\n');
    }

    public lineCount() {
        return this.lines.length;
    }

    private appendLine(line: string, indent?: number) {
        this.lines.push(`${StringBuilder.spaces((indent ? indent : 0) * 4)}${line}`);
    }

    private appendLines(newLines: string[], indent?: number) {
        for (const line of newLines) {
            this.appendLine(line, indent);
        }
    }

    private appendStringBuilder(sb: StringBuilder, indent?: number) {
        this.appendLines(sb.lines, indent);
    }

    private static spaces(indent: number) {
        return ''.padStart(indent);
    }
}

export enum ObjectType {
    codeunit = 'codeunit',
    page = 'page',
    pageExtension = 'pageextension',
    table = 'table',
    tableExtension = 'tableextension',
}

export enum TriggerType {
    onAction = 'OnAction',
    onAfterGetCurrRecord = 'OnAfterGetCurrRecord',
    onDelete = 'OnDelete',
    onInit = 'OnInit',
    onInsert = 'OnInsert',
    onModify = 'OnModify',
    onOpenPage = 'OnOpenPage',
    onRename = 'OnRename',
    onRun = 'OnRun',
}

export enum PropertyType {
    applicationArea = `ApplicationArea`,
    caption = `Caption`,
    drillDownPageId = `DrillDownPageID`,
    editable = `Editable`,
    dataClassification = `DataClassification`,
    enabled = 'Enabled',
    externalName = `ExternalName`,
    image = "Image",
    lookupPageId = `LookupPageId`,
    pageType = `PageType`,
    promoted = `Promoted`,
    promotedCategory = `PromotedCategory`,
    tableRelation = `TableRelation`,
    toolTip = `ToolTip`,
    sourceTable = `SourceTable`,
    tableType = `TableType`,
    usageCategory = `UsageCategory`,
    visible = `Visible`,
}

export enum VarType {
    bigInteger = `BigInteger`,
    blob = `Blob`,
    boolean = `Boolean`,
    code = `Code`,
    codeunit = `Codeunit`,
    date = `Date`,
    dateFormula = `DateFormula`,
    dateTime = `DateTime`,
    decimal = `Decimal`,
    fieldRef = `FieldRef`,
    filterPageBuilder = `FilterPageBuilder`,
    guid = `Guid`,
    integer = `Integer`,
    label = 'Label',
    page = `Page`,
    record = `Record`,
    recordRef = `RecordRef`,
    text = `Text`,
    time = `Time`,
}

interface ISerializable {
    serialize(): StringBuilder | null
}

interface IExtension {
    readonly extends: string;
}

abstract class Base {
    readonly comments?: StringBuilder | string;

    protected constructor(alComm: Partial<Base>) {
        this.comments = alComm.comments;
    }

    protected seralizeAll<T extends ISerializable>(list: T[], newLinesSpacer?: boolean) {
        const result = new StringBuilder();
        list.forEach(item => {
            let content = item.serialize();
            if (content) {
                if (newLinesSpacer) {
                    result.append(``);
                }
                // for single line builders, add a semicolon at the end- valid for Vars, Properties etc.
                if (content.lineCount() === 1) {
                    content = new StringBuilder(`${content};`);
                }
                result.append(content);
            }
        });
        return result;
    }

}

type PartialProperty<T extends PropertyType> = Partial<Property<T>> & Required<Pick<Property<T>, 'type' | 'value'>>;
export class Property<T extends PropertyType> extends Base implements ISerializable {
    readonly type: T;
    readonly value: { toString: () => string };

    public constructor(alProp: PartialProperty<T>) {
        super(alProp);
        this.type = alProp.type;
        this.value = this.curateData(alProp.value);
    }

    serialize(): StringBuilder | null {
        return new StringBuilder(`${this.type} = ${this.value}`);
    }

    private curateData(v: { toString: () => string }) {
        switch (this.type) {
            case PropertyType.caption:
            case PropertyType.toolTip:
                return Helpers.singleQuote(v.toString());
            case PropertyType.sourceTable:
            case PropertyType.externalName:
                return Helpers.doubleQuoteIfHasSpecialChars(v.toString());
        }
        return v.toString();
    }
}

type VarWithNoSubTypes = {
    readonly type: VarType.bigInteger | VarType.blob | VarType.boolean | VarType.date | VarType.dateFormula | VarType.dateTime
    | VarType.decimal | VarType.fieldRef | VarType.filterPageBuilder | VarType.guid | VarType.integer | VarType.recordRef | VarType.time
};
type VarWithOptionalSubTypes = { readonly type: VarType.code | VarType.text } & { readonly subType?: number };
type VarForLabel = { readonly type: VarType.label } & { readonly subType: string } & { readonly labelComment?: string } & { readonly labelLocked?: boolean };
type VarForRecord = { readonly type: VarType.record } & { readonly subType: string | number } & { readonly temporary?: boolean };
type VarObject = { readonly type: VarType.codeunit | VarType.page } & { readonly subType: string | number };
type PartialVar = Partial<Base>
    & (VarWithNoSubTypes
        | VarWithOptionalSubTypes
        | VarForLabel
        | VarForRecord
        | VarObject);
export class Var extends Base implements ISerializable {
    readonly type: VarType;
    readonly subType?: string | number;
    readonly temporary?: boolean;
    readonly labelComment?: string;
    readonly labelLocked?: boolean;

    public constructor(alVar: PartialVar) {
        super(alVar);
        this.type = alVar.type;
        if ((alVar as any)['subType'] !== undefined) {
            this.subType = (alVar as Exclude<PartialVar, VarWithNoSubTypes>).subType;
        }
        if ((alVar as any)['temporary'] !== undefined) {
            this.temporary = (alVar as VarForRecord).temporary;
        }
        if ((alVar as any)['labelComment'] !== undefined) {
            this.labelComment = (alVar as VarForLabel).labelComment;
            this.labelLocked = (alVar as VarForLabel).labelLocked;
        }
    }

    serialize(): StringBuilder {
        switch (this.type) {
            case VarType.bigInteger:
            case VarType.blob:
            case VarType.boolean:
            case VarType.date:
            case VarType.dateFormula:
            case VarType.dateTime:
            case VarType.decimal:
            case VarType.fieldRef:
            case VarType.filterPageBuilder:
            case VarType.guid:
            case VarType.integer:
            case VarType.recordRef:
            case VarType.time:
                return new StringBuilder(`${this.type}`);
            case VarType.label:
                return new StringBuilder(`${this.type} '${this.subType}'${this.labelComment ? `, Comment = '${this.labelComment}'` : ''}${this.labelLocked ? `, Locked = true` : ''}`);
            case VarType.code:
            case VarType.text:
                return new StringBuilder(`${this.type}${this.subType ? `[${this.subType}]` : ''}`);
            case VarType.codeunit:
            case VarType.page:
            case VarType.record:
                return new StringBuilder(`${this.type} ${this.subType ? Helpers.doubleQuoteIfHasSpecialChars(this.subType.toString()) : ''}${this.temporary ? ' temporary' : ''}`);
            default:
                return new StringBuilder(`${this.type} ${this.subType ? this.subType : ''}`);
        }
    }
}

type PartialNamedVar = Required<Pick<NamedVar, 'name'>> & PartialVar; // Partial<NamedVar> &
export class NamedVar extends Var {
    readonly name: string;

    public constructor(alVar: PartialNamedVar) {
        super(alVar);
        this.name = Helpers.removeSpecialChars(alVar.name);
    }

    serialize(): StringBuilder {
        return new StringBuilder(`${this.name}: ${super.serialize()}`);
    }
}

export class Param extends NamedVar {
    readonly isVar?: boolean;

    public constructor(alVar: PartialNamedVar & Pick<Param, 'isVar'>) {
        super(alVar);
        this.isVar = alVar.isVar;
    }

    serialize(): StringBuilder {
        return new StringBuilder(`${this.isVar ? 'var ' : ''}${super.serialize()}`);
    }
}

abstract class Method extends Base implements ISerializable {
    readonly params?: Param[];
    readonly vars?: NamedVar[];
    readonly code?: StringBuilder;
    readonly returns?: NamedVar | Var;

    protected constructor(alMeth: Partial<Method>) {
        super(alMeth);
        this.params = alMeth.params;
        this.vars = alMeth.vars;
        this.code = alMeth.code;
        this.returns = alMeth.returns;
    }

    private getFlattenedParams(): string {
        let result = '';
        if (!this.params) {
            return result;
        }
        const paramTexts = this.params.map(param => `${param.serialize()}`);
        const semiColonizedParams = paramTexts.join('; ').trim();
        return semiColonizedParams;
    }

    serialize(): StringBuilder {
        return new StringBuilder([
            this.comments ? this.comments : null,
            this.preMethod(),
            `${this.headerName()}(${this.getFlattenedParams()})${this.returns ? `${this.returns instanceof Var ? `: ` : ``}${this.returns?.serialize()}` : ''}`,
            this.contentVars(),
            `begin`,
            this.code ? new StringBuilder(this.code, 1) : null,
            `end;`
        ]);
    }

    protected preMethod(): StringBuilder | null {
        return null;
    }

    protected abstract headerName(): string;

    private contentVars() {
        if (!this.vars) {
            return null;
        }
        return new StringBuilder([`var`, new StringBuilder(super.seralizeAll(this.vars), 1)]);
    }
}

type PartialEventSubscriber = Partial<EventSubscriber> & Required<Pick<EventSubscriber, 'objectType' | 'objectName' | 'eventName'>>;
export class EventSubscriber extends Base implements ISerializable {
    readonly objectType: ObjectType;
    readonly objectName: string;
    readonly eventName: string;
    readonly elementName?: string;
    readonly skipOnMissingLicense?: boolean;
    readonly skipOnMissingPermission?: boolean;

    public constructor(alEvt: PartialEventSubscriber) {
        super(alEvt);
        this.objectType = alEvt.objectType;
        this.objectName = alEvt.objectName;
        this.eventName = alEvt.eventName;
        this.elementName = alEvt.elementName;
        this.skipOnMissingLicense = alEvt.skipOnMissingLicense;
        this.skipOnMissingPermission = alEvt.skipOnMissingPermission;
    }

    serialize(): StringBuilder | null {
        return new StringBuilder(`[EventSubscriber(ObjectType::${this.objectType}, ${this.objectType}::${Helpers.doubleQuoteIfHasSpecialChars(this.objectName)}, ${Helpers.singleQuote(this.eventName)}, ${Helpers.singleQuote(this.elementName !== undefined ? this.elementName : '')}, ${this.skipOnMissingLicense !== undefined ? this.skipOnMissingLicense : false}, ${this.skipOnMissingPermission !== undefined ? this.skipOnMissingPermission : false})]`);
    }
}

type PartialProcedure = Partial<Procedure> & Required<Pick<Procedure, 'name'>>;
export class Procedure extends Method implements ISerializable {
    readonly name: string;
    readonly local?: boolean;
    readonly eventSubscriber?: EventSubscriber;

    public constructor(alProc: PartialProcedure) {
        super(alProc);
        this.name = Helpers.removeSpecialChars(alProc.name);
        this.local = alProc.local;
        this.eventSubscriber = alProc.eventSubscriber;
    }

    protected preMethod(): StringBuilder | null {
        return this.eventSubscriber ? this.eventSubscriber.serialize() : null;
    }

    protected headerName(): string {
        return `${(this.local === (true || undefined)) ? `local ` : ``}procedure ${this.name}`;
    }
}

type PartialTrigger<T extends TriggerType> = Partial<Trigger<T>> & Required<Pick<Trigger<T>, 'type'>>;
export class Trigger<T extends TriggerType> extends Method {
    readonly type: T;

    public constructor(alTrig: PartialTrigger<T>) {
        super(alTrig);
        this.type = alTrig.type;
    }

    protected headerName(): string {
        return `trigger ${this.type}`;
    }
}

type PartialAction = Partial<Action> & Required<Pick<Action, 'name'>>;
export class Action extends Base implements ISerializable {
    readonly name: string;
    readonly props?: Property<PropertyType.applicationArea |
        PropertyType.caption |
        PropertyType.image |
        PropertyType.enabled |
        PropertyType.promoted |
        PropertyType.promotedCategory |
        PropertyType.toolTip>[];
    readonly triggers?: Trigger<TriggerType.onAction>[];

    public constructor(alAc: PartialAction) {
        super(alAc);
        this.name = alAc.name;
        this.props = alAc.props;
        this.triggers = alAc.triggers;
    }

    serialize(): StringBuilder {
        return new StringBuilder([
            `action(${this.name})`,
            `{`,
            this.props ? new StringBuilder(super.seralizeAll(this.props), 1) : null,
            this.triggers ? new StringBuilder(super.seralizeAll(this.triggers, true), 1) : null,
            `}`
        ]);
    }
}

export enum PageGroupType {
    repeater = 'repeater',
    group = 'group'
};

type PartialPageGroup<T extends Action | PageField> = Partial<PageGroup<T>> & Required<Pick<PageGroup<T>, 'name' | 'items'>>;
abstract class PageGroup<T extends Action | PageField> extends Base implements ISerializable {
    readonly name: string;
    readonly items: T[];
    readonly type: PageGroupType;
    readonly groups?: PageGroup<T>[];
    readonly props?: Property<PropertyType.caption | PropertyType.image | PropertyType.toolTip | PropertyType.visible>[];

    public constructor(alGrp: PartialPageGroup<T>) {
        super(alGrp);
        this.name = alGrp.name;
        this.items = alGrp.items;
        this.type = alGrp.type ? alGrp.type : PageGroupType.group;
        this.groups = alGrp.groups;
        this.props = alGrp.props;
    }

    serialize(): StringBuilder {
        return new StringBuilder([
            this.comments ? this.comments : null,
            `${this.type}(${this.name})`,
            `{`,
            this.props ? new StringBuilder(super.seralizeAll(this.props), 1) : null,
            this.items ? new StringBuilder(super.seralizeAll(this.items, true), 1) : null,
            this.groups ? new StringBuilder(super.seralizeAll(this.groups, true), 1) : null,
            `}`
        ]);
    }
}

export class PageGroupAction extends PageGroup<Action> {
    readonly type: PageGroupType = PageGroupType.group;

    public constructor(alGrp: PartialPageGroup<Action>) {
        super(alGrp);
    }
}

export class PageGroupPageField extends PageGroup<PageField> {
    public constructor(alGrp: PartialPageGroup<PageField>) {
        super(alGrp);
    }
}

type PartialField = Partial<Field> & Required<Pick<Field, 'name'>>;
abstract class Field extends Base {
    readonly name: string;
    readonly props?: Property<PropertyType>[];

    public constructor(alField: PartialField) {
        super(alField);
        this.name = Helpers.doubleQuoteIfHasSpecialChars(alField.name);
        this.props = alField.props;
    }
}

type PartialPageField = PartialField & Partial<PageField> & Required<Pick<PageField, 'sourceExpression'>>;
export class PageField extends Field implements ISerializable {
    readonly sourceExpression: string;
    readonly props?: Property<PropertyType.applicationArea | PropertyType.caption | PropertyType.toolTip | PropertyType.visible>[];

    public constructor(alPageField: PartialPageField) {
        super(alPageField);
        this.sourceExpression = alPageField.sourceExpression;
    }

    serialize(): StringBuilder {
        return new StringBuilder([
            `field(${this.name}; ${this.sourceExpression})`,
            `{`,
            this.props ? new StringBuilder(super.seralizeAll(this.props), 1) : null,
            `}`
        ]);
    }
}

type PartialTableField = PartialField & Partial<TableField> & Required<Pick<TableField, 'id' | 'type'>>;
export class TableField extends Field implements ISerializable {
    readonly id: number;
    readonly type: Var;
    readonly props?: Property<PropertyType.dataClassification |
        PropertyType.caption |
        PropertyType.editable>[];

    public constructor(alTableField: PartialTableField) {
        super(alTableField);
        this.id = alTableField.id;
        this.type = alTableField.type;
    }

    serialize(): StringBuilder {
        return new StringBuilder([
            `field(${this.id}; ${this.name}; ${this.type.serialize().toString()})`,
            `{`,
            this.props ? new StringBuilder(super.seralizeAll(this.props), 1) : null,
            `}`
        ]);
    }
}

type PartialObjectBase<T extends ObjectType> = Partial<ObjectBase<T>> & Required<Pick<ObjectBase<T>, 'id' | 'name'>>;
abstract class ObjectBase<T extends ObjectType> extends Base implements ISerializable {
    readonly type: T;
    readonly id: number;
    readonly name: string;
    readonly props?: Property<PropertyType>[];
    readonly vars?: NamedVar[];
    readonly triggers?: Trigger<TriggerType>[];
    readonly procedures?: Procedure[];

    protected constructor(alObj: PartialObjectBase<T>) {
        super(alObj);
        this.type = alObj.type as T;
        this.id = alObj.id;
        let objName = Helpers.trimDoubleQuotes(alObj.name);
        if (objName.length > Helpers.maxObjectNameLength) {
            throw new Error(`The name of the ${this.type} being created is ${alObj.name} which is longer than the allowed limit. You may use the truncateNameToMaxSize() function to reduce the length.`);
        }
        this.name = Helpers.doubleQuoteIfHasSpecialChars(alObj.name);
        this.props = alObj.props;
        this.vars = alObj.vars;
        this.triggers = alObj.triggers;
        this.procedures = alObj.procedures;
    }

    serialize(): StringBuilder {
        const customContent = this.contentCustomSection();
        return new StringBuilder([
            new StringBuilder([
                `// This file contains AL code that has been generated programmatically using a tool.`,
                `// You are responsible for ensuring that it aligns with the best practices for`,
                `// AL development. The makers of the tool are not responsible for the consequences`,
                `// of executing this code in a production environment.`,
                this.comments ? this.comments : null]),
            `${this.type} ${this.id} ${this.name} ${this.extensionSuffix()}`,
            `{`,
            this.props ? new StringBuilder(super.seralizeAll(this.props), 1) : null,
            customContent === null ? null : new StringBuilder(customContent, 1),
            this.triggers ? new StringBuilder(super.seralizeAll(this.triggers, true), 1) : null,
            ``,
            this.vars ? new StringBuilder([`var`, new StringBuilder(super.seralizeAll(this.vars), 1)], 1) : null,
            this.procedures ? new StringBuilder(super.seralizeAll(this.procedures, true), 1) : null,
            `}`
        ]);
    }

    private extensionSuffix(): string {
        const instance: any = this;
        const checkIsExtension = (p: any): p is IExtension => p.hasOwnProperty('extends');
        if (checkIsExtension(instance)) {
            return `extends ${Helpers.doubleQuoteIfHasSpecialChars(instance.extends)}`;
        }
        return '';
    }

    protected contentCustomSection(): StringBuilder | null {
        return null;
    }

    public async writeToProject() {
        let generatedFile: string;

        return getProject()
            .then(p => {
                let fileToWrite = join(p.fsPath, `${Helpers.removeSpecialChars(this.name)}.${this.type}.al`);
                return writeContent(fileToWrite, this.serialize().toString());
            })
            .then(newFilePath => {
                generatedFile = newFilePath;
                console.log(`Code generated at ${newFilePath}.`);
                return vscode.window.showInformationMessage(`The ${this.type} ${this.name} has been written to a file.`, { detail: `${newFilePath}` }, resources.openFileLbl);
            })
            .then(res => handleOpenFileCommand(res, generatedFile));
    }
}

export class Codeunit extends ObjectBase<ObjectType.codeunit> {
    readonly type = ObjectType.codeunit;
    readonly triggers?: Trigger<TriggerType.onRun>[];

    public constructor(alCodeunit: Partial<Codeunit> & PartialObjectBase<ObjectType.codeunit>) {
        super(alCodeunit);
    }
}

type PartialPageBase<T extends ObjectType.page | ObjectType.pageExtension> = Partial<PageBase<T>> & PartialObjectBase<T>;
abstract class PageBase<T extends ObjectType.page | ObjectType.pageExtension> extends ObjectBase<T> {
    readonly props?: Property<PropertyType.applicationArea |
        PropertyType.caption |
        PropertyType.editable |
        PropertyType.pageType |
        PropertyType.sourceTable |
        PropertyType.usageCategory>[];
    readonly triggers?: Trigger<TriggerType.onInit | TriggerType.onOpenPage | TriggerType.onAfterGetCurrRecord>[];
    readonly fields?: PageField[];
    readonly fieldGroups?: PageGroup<PageField>[];
    readonly actions?: Action[];
    readonly actionGroups?: PageGroup<Action>[];

    public constructor(alPage: PartialPageBase<T>) {
        super(alPage);
        this.fields = alPage.fields;
        this.fieldGroups = alPage.fieldGroups;
        this.actions = alPage.actions;
        this.actionGroups = alPage.actionGroups;
    }

    protected contentCustomSection(): StringBuilder | null {
        return new StringBuilder([
            ``,
            `layout`,
            `{`,
            new StringBuilder(this.defaultLayoutArea(), 1),
            new StringBuilder(`{`, 1),
            this.fields ? new StringBuilder(super.seralizeAll(this.fields), 2) : null,
            this.fieldGroups ? new StringBuilder(super.seralizeAll(this.fieldGroups), 2) : null,
            new StringBuilder(`}`, 1),
            `}`,
            `actions`,
            `{`,
            new StringBuilder(this.defaultActionArea(), 1),
            new StringBuilder(`{`, 1),
            this.actions ? new StringBuilder(super.seralizeAll(this.actions), 2) : null,
            this.actionGroups ? new StringBuilder(super.seralizeAll(this.actionGroups), 2) : null,
            new StringBuilder(`}`, 1),
            `}`
        ]);
    }

    protected abstract defaultLayoutArea(): string;
    protected abstract defaultActionArea(): string;
}

export class Page extends PageBase<ObjectType.page> {
    readonly type = ObjectType.page;

    protected defaultLayoutArea(): string {
        return `area(content)`;
    }

    protected defaultActionArea(): string {
        return `area(processing)`;
    }
}

export class PageExtension extends PageBase<ObjectType.pageExtension> implements IExtension {
    readonly type = ObjectType.pageExtension;
    readonly extends: string;

    public constructor(alPageExt: PartialPageBase<ObjectType.pageExtension> & IExtension) {
        super(alPageExt);
        this.extends = alPageExt.extends;
    }

    protected defaultLayoutArea(): string {
        return `addlast(content)`;
    }

    protected defaultActionArea(): string {
        return `addlast(processing)`;
    }
}

type PartialTableBase<T extends ObjectType.table | ObjectType.tableExtension> = Partial<TableBase<T>> & PartialObjectBase<T>;
abstract class TableBase<T extends ObjectType.table | ObjectType.tableExtension> extends ObjectBase<T> {
    readonly triggers?: Trigger<TriggerType.onInsert | TriggerType.onModify | TriggerType.onDelete | TriggerType.onRename>[];
    readonly fields?: TableField[];

    public constructor(alPage: PartialTableBase<T>) {
        super(alPage);
        this.fields = alPage.fields;
    }

    protected contentCustomSection(): StringBuilder | null {
        return new StringBuilder([
            `fields`,
            `{`,
            this.fields ? new StringBuilder(super.seralizeAll(this.fields), 1) : null,
            `}`
        ]);
    }
}

export class TableExtension extends TableBase<ObjectType.tableExtension> implements IExtension {
    readonly type = ObjectType.tableExtension;
    readonly extends: string;

    public constructor(alTableExt: PartialTableBase<ObjectType.tableExtension> & IExtension) {
        super(alTableExt);
        this.extends = alTableExt.extends;
    }
}
