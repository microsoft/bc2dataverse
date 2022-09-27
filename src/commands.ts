import { ProxyGen } from "./proxyGen";
import resources from "./resources";
import { format } from "util";
import * as vscode from 'vscode';
import { Mapper } from "./mapTables";
import { catchAndShowError } from "./helpers/errors";
import { ListPageGen } from "./listPage";
import { handleOpenFileCommand, runWithProgress } from "./helpers/utils";

export async function start() {
    let pg = new ProxyGen();
    return pg
        .createInputObject()
        .then(() => {
            console.log('Inputs for proxy generation: ', pg.input);
            return runWithProgress(`Generating the proxy table for ${pg.input.entityName}...`, pg.runProxyGenTool(), false);
        })
        .then(() => {
            let msg = format(resources.proxyTableGeneratedMsg, pg.input.entityName);
            console.log(msg);
            return vscode.window.showInformationMessage(`${msg} If you wish to map the newly created proxy table to an existing Business Central table, please compile your project and launch the command ${resources.mapToBCTableLbl}.`, resources.openFileLbl);
        })
        .then(res => handleOpenFileCommand(res, (pg.output as vscode.Uri).fsPath))
        .catch(e => catchAndShowError(e));
}

export async function generateListPage(context: vscode.ExtensionContext) {
    const pageGen = new ListPageGen(context);
    return pageGen
        .getInputs()
        .then(() => pageGen.createListPage())
        .catch(e => catchAndShowError(e));
}

export async function generateMappings(context: vscode.ExtensionContext) {
    let mapper = new Mapper(context);
    return mapper
        .getInputs()
        .then(() => mapper.showPanel())
        .catch(e => catchAndShowError(e));
}

