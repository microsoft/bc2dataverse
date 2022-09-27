import { tmpdir } from 'os';
import { join } from "path";

export const extName = 'bc2dataverse';

// Config property names
export const configPropPackagesPathName = `${extName}.packagesPath`;
export const configPropDataverseServiceUrlName = `${extName}.dataverseServiceUrl`;
export const configPropSymbolRefExtractedPath = `${extName}.symbolRefJsonRelativePath`;

// AL Language extension
export const alExtensionId = 'ms-dynamics-smb.al'; // the name of the alExtension installed
export const alProxyGenExeFileName = 'altpgen.exe';
export const alAppFileExtension = '.app';

// Field mapping html
export const htmlGenMappingsFuncName = 'createMappings';
export const htmlFieldRowSuffix = '-row';
export const htmlFieldNameSuffix = '-name';
export const htmlSyncTypeSuffix = '-syncType';
export const htmlSelectFieldSuffix = '-selectField';
export const htmlConstantValSuffix = '-constant';
export const htmlProxyFieldSelectDefault = "Select a field";
export const htmlConstantValDefault = "Enter a constant value";
export const htmlProxyFieldDataListId = "proxyFieldList";

// Mapping generation
export const coupledToCRMFieldLbl = 'Coupled to CRM';
export const coupledToDataverseFieldLbl = 'Coupled to Dataverse';

// Symbol references
export const SymbolRefRootFolder = join(tmpdir(), extName);
export const AppPackageExtracterExe = 'AppPackageExtracter.exe';