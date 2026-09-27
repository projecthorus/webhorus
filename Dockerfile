FROM python:3.13 AS base
RUN apt-get update
RUN pip install pyodide-build[resolve]

WORKDIR /webhorus
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /webhorus/emsdk
RUN bash -c 'PYODIDE_EMSCRIPTEN_VERSION=$(pyodide config get emscripten_version) && \
./emsdk install ${PYODIDE_EMSCRIPTEN_VERSION} && \
./emsdk activate ${PYODIDE_EMSCRIPTEN_VERSION}'

RUN mkdir -p /whl

COPY ./ /webhorus
WORKDIR /webhorus
RUN bash -c 'source /webhorus/emsdk/emsdk_env.sh && \
pyodide build --build-dependencies --no-skip-built-in-packages -v --outdir /whl/ && ls /whl/'

FROM scratch AS export
COPY --from=base /whl/*.whl /