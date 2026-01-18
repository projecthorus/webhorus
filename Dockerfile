FROM python:3.13 AS base
RUN apt-get update
RUN pip install pyodide-build

WORKDIR /webhorus
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /webhorus/emsdk
RUN bash -c 'PYODIDE_EMSCRIPTEN_VERSION=$(pyodide config get emscripten_version) && \
./emsdk install ${PYODIDE_EMSCRIPTEN_VERSION} && \
./emsdk activate ${PYODIDE_EMSCRIPTEN_VERSION}'

RUN mkdir -p /webhorus/web/src/public/assets/

WORKDIR /asn1tools
ADD https://github.com/eerimoq/asn1tools.git#0.167.0 /asn1tools
RUN bash -c 'source /webhorus/emsdk/emsdk_env.sh && \
pyodide build --outdir /webhorus/web/src/public/assets/'

WORKDIR /bitstruct
ADD https://github.com/eerimoq/bitstruct.git#8.21.0 /bitstruct
RUN bash -c 'source /webhorus/emsdk/emsdk_env.sh && \
pyodide build --outdir /webhorus/web/src/public/assets/'

COPY ./ /webhorus
WORKDIR /webhorus
RUN bash -c 'source /webhorus/emsdk/emsdk_env.sh && \
pyodide build --outdir /webhorus/web/src/public/assets/ && ls /webhorus/web/src/public/assets/'

FROM scratch AS export
COPY --from=base /webhorus/web/src/public/assets/webhorus*.whl /
COPY --from=base /webhorus/web/src/public/assets/asn1tools*.whl /
COPY --from=base /webhorus/web/src/public/assets/bitstruct*.whl /