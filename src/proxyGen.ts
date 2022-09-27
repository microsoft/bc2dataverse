/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { format } from 'util';
import * as vscode from 'vscode';
import { join } from "path";
import * as consts from './consts';
import { findLastModifiedFile } from "./helpers/fileSystem";
import { assertAndThrowError, throwCustomError } from "./helpers/errors";
import { getProject, getPackagesPath, showInputBox, runProcess } from "./helpers/utils";
import * as config from "./helpers/config";
import resources from "./resources";

export class ProxyGen {
    public input: {
        project?: vscode.Uri,
        proxyGenFolder?: vscode.Uri,
        dataverseUrl?: string,
        packagesPath?: vscode.Uri,
        entityName?: string,
        baseObjectId?: number
    };
    public output?: vscode.Uri;

    public constructor() {
        this.input = {};
    }

    public async createInputObject() {
        return getProject()
            .then(a => {
                this.input.project = a;
                return this.getProxyGenPath();
            })
            .then(a => {
                this.input.proxyGenFolder = a;
                return this.getDataverseUrl();
            })
            .then(a => {
                this.input.dataverseUrl = a;
                return getPackagesPath(this.input.project as vscode.Uri);
            })
            .then(a => {
                this.input.packagesPath = a;
                return this.getDataverseEntityName();
            })
            .then(a => {
                this.input.entityName = a;
                return this.getBaseObjectId();
            })
            .then(a => {
                this.input.baseObjectId = a;
            });
    }

    private async getProxyGenPath(): Promise<vscode.Uri> {
        // assume that AL extension is already installed.
        const alExtPath = vscode.extensions.getExtension(consts.alExtensionId)?.extensionPath as string;
        let defaultPath = join(alExtPath, 'bin');
        console.info('Using default proxy gen path: ', defaultPath);
        return vscode.Uri.file(defaultPath);
    }

    private async getDataverseUrl(): Promise<string> {
        let url = config.getConfiguration(consts.configPropDataverseServiceUrlName);
        if (url) {
            return url as string;
        }
        return showInputBox({
            title: 'Dataverse url',
            placeHolder: 'https://myDataverseEnvironmentName.crm.dynamics.com',
            prompt: 'Enter the url for your dataverse environment'
        },
            val => {
                try {
                    let url = new URL(val);
                    return null;
                }
                catch
                {
                    return 'Not a valid url';
                }
            }
        )
            .then(value => {
                if (value) {
                    return config.setConfiguration(consts.configPropDataverseServiceUrlName, value)
                        .then(() => value);
                }
                throw new Error('Invalid or no dataverse url specified.');
            });
    }

    private async getDataverseEntityName(): Promise<string> {
        return showInputBox(
            {
                title: resources.dataverseEntityNameLbl,
                prompt: `${resources.askDataverseEntityNameLbl} Only one name should be specified here.`,
                placeHolder: 'worker'
            },
            val => {
                let trimmed = val.trim();
                if (trimmed.includes(',') || trimmed.includes(' ')) {
                    return 'Only one entity name is allowed!';
                }
                return null;
            })
            .then(value => {
                if (value) {
                    return value;
                }
                throw new Error('Invalid or no dataverse entity name specified.');
            });
    }

    private async getBaseObjectId(): Promise<number> {
        return showInputBox(
            {
                title: resources.baseObjectIdLbl,
                prompt: 'Enter the object id for the proxy table to be generated',
                placeHolder: '50000'
            },
            val => {
                if ((!val) || (isNaN(Number(val)))) {
                    return 'Enter an integer value.';
                }
                return null;
            })
            .then(value => Number(value));
    }

    public runProxyGenTool() {
        return async () => {
            // assertAndThrowError(input_.proxyGenFolder, resources.parameterNotSpecifiedErr, consts.configPropProxyGenPathName);
            assertAndThrowError(this.input.packagesPath, resources.parameterNotSpecifiedErr, consts.configPropPackagesPathName);
            assertAndThrowError(this.input.dataverseUrl, resources.parameterNotSpecifiedErr, consts.configPropDataverseServiceUrlName);
            assertAndThrowError(this.input.entityName, resources.parameterNotSpecifiedErr, resources.dataverseEntityNameLbl);
            assertAndThrowError(this.input.baseObjectId, resources.parameterNotSpecifiedErr, resources.baseObjectIdLbl);
            assertAndThrowError(this.input.project, resources.parameterNotSpecifiedErr, 'Project');

            const output = await runProcess(join("./", consts.alProxyGenExeFileName),
                [
                    `-project:"${this.input.project?.fsPath as string}"`,
                    `-packagecachepath:"${this.input.packagesPath?.fsPath as string}"`,
                    `-serviceuri:"${this.input.dataverseUrl as string}"`,
                    `-entities:${this.input.entityName}`,
                    `-baseid:${this.input.baseObjectId}`,
                    //'-tabletype:CDS' -- commented out as setting this to CDS does not bring in the required table relations
                ],
                this.input.proxyGenFolder?.fsPath as string);

            console.log(`Process done and output is empty: ${output === undefined}`);
            if (output) {
                if (output.split('\r\n')
                    .filter(s => s.includes('files written.'))
                    .length > 0) {
                    // find the last file written to project path
                    try {
                        this.output = findLastModifiedFile(this.input.project?.fsPath as string, '.al');
                        // TODO test that the file generated is a proxy for the entity.
                        return;
                    } catch (e) {
                        throwCustomError(e, resources.unexpectedErrorOccuredMsg);
                    };
                }
                throwCustomError(new Error(format(resources.proxyTableNotFoundMsg, this.input.entityName)), resources.unexpectedErrorOccuredMsg);
            }
        }
    }
}