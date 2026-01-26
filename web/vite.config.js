import { dirname, join, resolve } from "path";
import { globSync } from 'glob';
import { defineConfig } from 'vite'
import { fileURLToPath } from "url";
import { VitePWA } from 'vite-plugin-pwa'
import prebundleWorkers from "vite-plugin-prebundle-workers";
import { readFile, writeFile } from "fs";

export default defineConfig({
    esbuild: {
        supported: {
          'top-level-await': true //browsers can handle top-level-await features
        },
    },
    worker: {
        format: "es"
      },
    root: resolve(__dirname, 'src'),
    server: {
        host: '0.0.0.0'
    },
    assetsInclude: ["**/*.whl", "**/*.zip", "**/*.wasm","pyodide/pyodide-lock.json"],
    resolve: {
        alias: {
            '~webhorus': resolve(__dirname,globSync("src/whl/webhorus*-cp3*-*pyodide*wasm32.whl")[0]),
            '~bitstruct': resolve(__dirname,globSync("src/whl/bitstruct*-cp3*-*pyodide*wasm32.whl")[0]),
            '~asn1tools': resolve(__dirname,globSync("src/whl/asn1tools*-none-any.whl")[0]),
            '~bootstrap': resolve(__dirname, 'node_modules/bootstrap'),
            '~leaflet': resolve(__dirname, 'node_modules/leaflet'),
            '~radioreceiver': resolve(__dirname, 'node_modules/radioreceiver'),
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler', // or "modern"
                silenceDeprecations: ['mixed-decls', 'color-functions', 'global-builtin', 'import']
            }
        }
    },

    build: {
        minify: true,
        rollupOptions: {
            treeshake: true,
            output: {
                'preserveModulesRoot': 'src',
                sourcemap: true,
            },
            preserveEntrySignatures: true
        },
        sourcemap: true
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis'
            },
        }
    },
    plugins: [
        {
            // This is a big hack so that we can have nice hashed assets for all the pyodide resources
            // we don't use indexurl so we abuse that as our pyodide.asm.wasm path
            // and replace out the "pyodide.asm.wasm" addition. It seems to add a / at the end of we also need
            // to substring that out.
            name: 'monkeypatch-pyodide',
            config(options) {
                    readFile("node_modules/pyodide/pyodide.js", 'utf8', function (err,data) {
                        if (err) {
                            throw err
                        }
                        var result = data.replace('e+"pyodide.asm.wasm"', 'e.substring(0,e.length-1)');

                        writeFile("node_modules/pyodide/pyodide.js", result, 'utf8', function (err) {
                            if (err) throw err;
                        });
                    }); 
                    readFile("node_modules/pyodide/pyodide.mjs", 'utf8', function (err,data) {
                        if (err) {
                            throw err
                        }
                        var result = data.replace('e+"pyodide.asm.wasm"', 'e.substring(0,e.length-1)');

                        writeFile("node_modules/pyodide/pyodide.mjs", result, 'utf8', function (err) {
                            if (err) throw err;
                        });
                    }); 
                }
                
        },
        VitePWA(
            {
                registerType: 'autoUpdate',
                injectRegister: 'auto',
                devOptions: {
                    enabled: true,
                    type: 'module',
                },
                workbox: {
                    globPatterns: ["**/*.{js,css,html,png,whl,wasm,zip,py,ico,svg,json}"],
                    globIgnores: ["sw.js","workbox-*.js"],
                    maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
                    runtimeCaching: [
                        {
                          urlPattern: /^https:\/\/raw.githubusercontent.com\/projecthorus\/horusdemodlib\/master\/.*/,
                          handler: "NetworkFirst",
                          options: {
                            cacheName: "horus-custom-cache",
                          },
                        },
                      ],
                },
                manifest: {
                    "name": "webhorus",
                    "short_name": "webhorus",
                    "description": "web based version of horus-ui",
                    id: "/",
                    launch_handler: { "client_mode":["auto"]},
                    orientation: "any",
                    "categories": ["utilities", "weather"],
                    "dir": "ltr",
                    "prefer_related_applications": false,
                    includeAssets: ["**/*"],
                    "icons": [
                      {
                        "src": "web-app-manifest-192x192.png",
                        "sizes": "192x192",
                        "type": "image/png",
                        "purpose": "maskable"
                      },
                      {
                        "src": "web-app-manifest-512x512.png",
                        "sizes": "512x512",
                        "type": "image/png",
                        "purpose": "maskable"
                      },
                      {
                        "src": "web-app-manifest-512x512.png",
                        "sizes": "512x512",
                        "type": "image/png",
                        "purpose": "any"
                      }
                    ],
                    "screenshots":[
                        {
                            "src": "pwa_wide.png",
                            "sizes": "2170x1600",
                            form_factor: "wide"
                        },
                        {
                            "src": "pwa_tall.png",
                            "sizes": "1500x2668",
                            "form_factor": "narrow"
                        }
                    ],
                    "theme_color": "#5DB2E0",
                    "background_color": "#5DB2E0",
                    "display": "standalone"
                  }
            }
        )
    ]
}
)