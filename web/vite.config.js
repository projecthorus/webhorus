import { dirname, join, resolve } from "path";
import { globSync } from 'glob';
import { defineConfig } from 'vite'
import { fileURLToPath } from "url";
import { VitePWA } from 'vite-plugin-pwa'
import prebundleWorkers from "vite-plugin-prebundle-workers";
import { readFile, writeFile } from "fs";

export default defineConfig({

    worker: {
        format: "es"
      },
    root: resolve(import.meta.dirname, 'src'),
    server: {
        host: '0.0.0.0'
    },
    assetsInclude: ["**/*.whl", "**/*.zip", "**/*.wasm","pyodide/pyodide-lock.json"],
    resolve: {
        alias: {
            '~whl': resolve(import.meta.dirname,"src/whl"),
            '~bootstrap': resolve(import.meta.dirname, 'node_modules/bootstrap'),
            '~leaflet': resolve(import.meta.dirname, 'node_modules/leaflet'),
            '~radioreceiver': resolve(import.meta.dirname, 'node_modules/radioreceiver'),
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler', // or "modern"
                silenceDeprecations: [ 'color-functions', 'global-builtin', 'import', 'if-function']
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
                hashCharacters: "hex" // base64 causes -_ which python doesn't like parsing in the whl files
            },
            preserveEntrySignatures: true
        },
        sourcemap: true
    },
    optimizeDeps: {

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
                    enabled: false,
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