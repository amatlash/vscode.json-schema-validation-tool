import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as Path from 'path';
import * as AJV from 'ajv';

let created_files: any = [];

const resolvePath = (filePath: string): string => {
	if (filePath[0] === '~') {
		const homePath = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
		return Path.join(process.env[homePath] || '', filePath.slice(1));
	} else {
		return Path.resolve(filePath);
	}
};

const onError = (e: any) => vscode.window.showErrorMessage(e.message);

const tempdir = resolvePath(os.tmpdir());

const resolveSchemaRefs = async (schemaDoc: vscode.TextDocument) => {
	let schemaObj: any;
	try {
		schemaObj = JSON.parse(schemaDoc.getText());
	} catch (e) {
		throw new Error(`Файл "${schemaDoc.fileName.split(Path.sep).pop()}" не является валидным JSON `);
	}
	const getFilePath = (mainPath: string, mainID: string, adID: string):string => {
		const mainPathArray = mainPath.split(Path.sep);
		const mainIDArray = mainID.split('/');
		const adIDArray = adID.split('/');

		const mainIDPaths = mainIDArray.reduce((result:any, fileName:string, index:number) => {
			if (result.same.length === index) {
				if (fileName === adIDArray[index]) {
					result.same.push(fileName);
					return result;
				}
			}
			result.specific.push(fileName);
			return result;
		}, {
			same: [],
			specific: []
		});
		const adIDPaths = adIDArray.reduce((result:any, fileName:string, index:number) => {
			if (result.same.length === index) {
				if (fileName === mainIDArray[index]) {
					result.same.push(fileName);
					return result;
				}
			}
			result.specific.push(fileName);
			return result;
		}, {
			same: [],
			specific: []
		});
		const samePathArray = mainPathArray.map(path => path);
		samePathArray.splice(mainPathArray.length - mainIDPaths.specific.length, mainIDPaths.specific.length, ...adIDPaths.specific);
		return samePathArray.join(Path.sep);
	};
	const ajv = new AJV({
		format: false,
		loadSchema: (uri: string): PromiseLike<boolean | object> => {
			const path = uri.split(Path.sep).slice(0,-1).join(Path.sep);
			const name = uri.split(Path.sep).pop();
			let filePath = getFilePath(schemaDoc.fileName, schemaObj.$id, uri);
			if (filePath) {
				// тут хзы
				if (!filePath.endsWith('.json')) {
					filePath += '.json';
				}
				return new Promise((resolve, reject) => {
						vscode.workspace.openTextDocument(filePath)
						.then((dataDoc) => {
							const text = dataDoc.getText();
							let subschema;
							try {
								subschema = JSON.parse(dataDoc.getText());
								if (!ajv.validateSchema(schemaObj)) {
									throw new Error(ajv.errorsText());
								}
							} catch (e) {
								throw new Error(`Файл "${schemaDoc.fileName.split(Path.sep).pop()}" не является валидным JSON схемом гык) `);
							}
							resolve(subschema);
						});
					});
			} else {
				throw new Error(`Не нашел: ${uri}`);
			}
			return new Promise(() => {});
		}
	});
	if (!ajv.validateSchema(schemaObj)) {
		throw new Error(ajv.errorsText());
	}
	try {
		const validate = await ajv.compileAsync(schemaObj);
		return { validate, ajv };
	} catch (e) {
		throw new Error(e);
	}
};

export function activate(context: vscode.ExtensionContext) {
	let dataAndSchemaSets: Array<any> = [];

	vscode.workspace.onDidSaveTextDocument(eventDocument => {
		dataAndSchemaSets
			.filter(set => set.schemaDoc === eventDocument || set.dataDoc === eventDocument)
			.forEach(set => {
				resolveSchemaRefs(set.schemaDoc)
					.then(({ validate, ajv }) => {
						vscode.window.showInformationMessage('Схема собрана корректно');
						let data;
						try {
							data = JSON.parse(set.dataDoc.getText());
						} catch (e) {
							throw new Error(`${set.dataDoc.fileName.split(Path.sep).pop()} не является валидным JSON `);
						}
						validate(data);
						if (validate.errors?.length) {
							vscode.window.showErrorMessage(ajv.errorsText(validate.errors));
						} else {
							vscode.window.showInformationMessage('Данные валидны');
						}
					})
					.catch(err => {
						vscode.window.showErrorMessage(`Ошибка сборки схемы: ${err.message}`);
					});
			});
	});

	const clearSets = vscode.commands.registerCommand('json-schema-validation-tool.clearSets', () => {
		dataAndSchemaSets = [];
	});
	
	const applyJsonData = vscode.commands.registerCommand('json-schema-validation-tool.applyJsonData', () => {
		dataAndSchemaSets = [];
		if (vscode.window.activeTextEditor) {
			const currentEditor: vscode.TextEditor = vscode.window.activeTextEditor;
			const document: vscode.TextDocument = currentEditor.document;
			if (document.languageId === 'json') {
				const dataFileName = document.fileName.split(Path.sep).pop()?.split('.')[0] + '_data';
				const filePath = `${tempdir}${Path.sep}${dataFileName}.json`;
				fs.writeFile(filePath, '{\n\t\n}', onError);
				vscode.workspace.openTextDocument(filePath)
					.then((dataDoc) => {
						vscode.window.showTextDocument(dataDoc);
						dataAndSchemaSets.push({
							schemaDoc: document,
							dataDoc
						});
					});
			} else {
				vscode.window.showErrorMessage('Файл не .JSON');
			}
		} else {
			vscode.window.showErrorMessage('Не открыто ни одного редактора.');
		}
	});
	context.subscriptions.push(applyJsonData, clearSets);
}

export function deactivate() {}
