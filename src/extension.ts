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
	const ajv = new AJV({
		loadSchema: (uri: string): PromiseLike<boolean | object> => {
			const path = uri.split(Path.sep).slice(0,-1).join(Path.sep);
			const name = uri.split(Path.sep).pop();
			if (schemaObj.$id.includes(path)) {
				let refFilePath = schemaDoc.fileName.split(Path.sep).slice(0,-1).join(Path.sep) + Path.sep + name;
				// тут хзы
				if (!refFilePath.endsWith('.json')) {
					refFilePath += '.json';
				}
				return new Promise((resolve, reject) => {
						vscode.workspace.openTextDocument(refFilePath)
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
