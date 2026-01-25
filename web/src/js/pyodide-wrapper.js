import 'pyodide/pyodide.asm.js';
// @ts-ignore
import pyodideStdLib from 'pyodide/python_stdlib.zip';
import pyodideLockFile from 'pyodide/pyodide-lock.json?url';


import { loadPyodide } from "pyodide";

import cffi from "../whl/cffi-1.17.1-cp313-cp313-pyodide_2025_0_wasm32.whl"
import pycparser from "../whl/pycparser-2.22-py3-none-any.whl"
import idna from '../whl/idna-3.7-py3-none-any.whl'
import charset_normalizer from '../whl/charset_normalizer-3.3.2-py3-none-any.whl'
import python_dateutil from '../whl/python_dateutil-2.9.0.post0-py2.py3-none-any.whl'
import requests from '../whl/requests-2.32.3-py3-none-any.whl'
import six from '../whl/six-1.16.0-py2.py3-none-any.whl'
import urllib3 from '../whl/urllib3-2.2.3-py3-none-any.whl'
import certifi from '../whl/certifi-2024.12.14-py3-none-any.whl'
import webhorus from '~webhorus'
import pyparsing from '../whl/pyparsing-3.1.2-py3-none-any.whl'
import bitstruct from '~bitstruct'
import asn1tools from '~asn1tools'

export {pyodide};

let pyodide = await loadPyodide({
    stdLibURL: pyodideStdLib,
    lockFileURL: pyodideLockFile
}).catch(() => {
    document.getElementById("loadingtext").innerText = "Error loading  pyodide. Attempting to refresh."
    setTimeout(()=>{
        location.reload();
    }, 5000)

});

await Promise.all([
    pyodide.loadPackage(cffi),
    pyodide.loadPackage(pycparser),
    pyodide.loadPackage(idna),
    pyodide.loadPackage(charset_normalizer),
    pyodide.loadPackage(python_dateutil),
    pyodide.loadPackage(requests),
    pyodide.loadPackage(six),
    pyodide.loadPackage(urllib3),
    pyodide.loadPackage(certifi),
    pyodide.loadPackage(webhorus),
    pyodide.loadPackage(pyparsing),
    pyodide.loadPackage(bitstruct),
    pyodide.loadPackage(asn1tools)
]).catch(() => {
    document.getElementById("loadingtext").innerText = "Error loading  packages. Attempting to refresh."
    setTimeout(()=>{
        location.reload();
    }, 5000)
    
})
