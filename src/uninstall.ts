import * as fs from 'fs';
import { SymbolRefRootFolder } from './consts';

try {
    console.log(`Recursively deleting ${SymbolRefRootFolder}...`);
    fs.rmSync(SymbolRefRootFolder, { recursive: true, force: true });
} catch {
    throw new Error(`The folder "${SymbolRefRootFolder}" could not be deleted. Please delete this folder manually.`);
}