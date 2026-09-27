import pathlib
import os
import pywenet.fsk_build as fsk_build
import pywenet.drs232_ldpc_build as drs232_ldpc_build
import pywenet.ssdv_build as ssdv_build

def build(setup_kwargs):
    setup_kwargs.update(
        {"ext_modules": [
            fsk_build.ffibuilder.distutils_extension(),
            drs232_ldpc_build.ffibuilder.distutils_extension(),
            ssdv_build.ffibuilder.distutils_extension()
        ]},
    )
    