import 'pyodide/pyodide.asm.js';

// @ts-ignore
import pyodideStdLib from 'pyodide/python_stdlib.zip';
import pyodideLockFile from 'pyodide/pyodide-lock.json?url';
import pyodideWasm from 'pyodide/pyodide.asm.wasm?url';

import { loadPyodide } from "pyodide";

const whls = import.meta.glob("~whl/*.whl");

const python_modules = await Promise.all(
    Object.keys(whls).map(async (path) => {
    return await whls[path]().then((mod) => mod.default.split("?t=")[0]) // split hack to work around vite putting ?t= arg which breaks pyodide load in dev server
}))

export {pyodide};

let pyodide = await loadPyodide({
    stdLibURL: pyodideStdLib,
    lockFileURL: pyodideLockFile,
    indexURL: pyodideWasm,
    packages: python_modules
}).catch((err) => {
    console.error(err)
    document.getElementById("loadingtext").innerText = "Error loading  pyodide. Attempting to refresh."
    setTimeout(()=>{
        location.reload();
    }, 5000)

});
