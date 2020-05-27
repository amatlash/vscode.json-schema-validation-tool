"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const Path = require("path");
const AJV = require("ajv");
let created_files = [];
const resolvePath = (filePath) => {
    if (filePath[0] === '~') {
        const homePath = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
        return Path.join(process.env[homePath] || '', filePath.slice(1));
    }
    else {
        return Path.resolve(filePath);
    }
};
const onError = (e) => vscode.window.showErrorMessage(e.message);
const tempdir = resolvePath(os.tmpdir());
const resolveSchemaRefs = (schemaDoc) => __awaiter(void 0, void 0, void 0, function* () {
    let schemaObj;
    try {
        schemaObj = JSON.parse(schemaDoc.getText());
    }
    catch (e) {
        throw new Error(`Файл "${schemaDoc.fileName.split(Path.sep).pop()}" не является валидным JSON `);
    }
    const ajv = new AJV({
        loadSchema: (uri) => {
            const path = uri.split(Path.sep).slice(0, -1).join(Path.sep);
            const name = uri.split(Path.sep).pop();
            if (schemaObj.$id.includes(path)) {
                let refFilePath = schemaDoc.fileName.split(Path.sep).slice(0, -1).join(Path.sep) + Path.sep + name;
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
                        }
                        catch (e) {
                            throw new Error(`Файл "${schemaDoc.fileName.split(Path.sep).pop()}" не является валидным JSON схемом гык) `);
                        }
                        resolve(subschema);
                    });
                });
            }
            return new Promise(() => { });
        }
    });
    if (!ajv.validateSchema(schemaObj)) {
        throw new Error(ajv.errorsText());
    }
    try {
        const validate = yield ajv.compileAsync(schemaObj);
        return { validate, ajv };
    }
    catch (e) {
        throw new Error(e);
    }
});
function activate(context) {
    let dataAndSchemaSets = [];
    vscode.workspace.onDidSaveTextDocument(eventDocument => {
        dataAndSchemaSets
            .filter(set => set.schemaDoc === eventDocument || set.dataDoc === eventDocument)
            .forEach(set => {
            resolveSchemaRefs(set.schemaDoc)
                .then(({ validate, ajv }) => {
                var _a;
                vscode.window.showInformationMessage('Схема собрана корректно');
                let data;
                try {
                    data = JSON.parse(set.dataDoc.getText());
                }
                catch (e) {
                    throw new Error(`${set.dataDoc.fileName.split(Path.sep).pop()} не является валидным JSON `);
                }
                validate(data);
                if ((_a = validate.errors) === null || _a === void 0 ? void 0 : _a.length) {
                    vscode.window.showErrorMessage(ajv.errorsText(validate.errors));
                }
                else {
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
        var _a;
        dataAndSchemaSets = [];
        if (vscode.window.activeTextEditor) {
            const currentEditor = vscode.window.activeTextEditor;
            const document = currentEditor.document;
            if (document.languageId === 'json') {
                const dataFileName = ((_a = document.fileName.split(Path.sep).pop()) === null || _a === void 0 ? void 0 : _a.split('.')[0]) + '_data';
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
            }
            else {
                vscode.window.showErrorMessage('Файл не .JSON');
            }
        }
        else {
            vscode.window.showErrorMessage('Не открыто ни одного редактора.');
        }
    });
    context.subscriptions.push(applyJsonData, clearSets);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map