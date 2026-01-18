import { dirname, join, resolve } from "path";
import { defineConfig } from 'vite'
import { fileURLToPath } from "url";
import copy from 'rollup-plugin-copy'
import { VitePWA } from 'vite-plugin-pwa'
import prebundleWorkers from "vite-plugin-prebundle-workers";


const PYODIDE_EXCLUDE = [
    "!**/*.{md,html}",
    "!**/*.d.ts",
    "!**/*.whl",
    "!**/node_modules",
];

export function viteStaticCopyPyodide() {
    const pyodideDir = "node_modules/pyodide";
    return  {
                src: [join(pyodideDir, "*")].concat(PYODIDE_EXCLUDE),
                dest: "src/dist/assets/",
            }
        
}
export default defineConfig({
    // define: {
    //     globalThis: 'window'
    // },
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
    resolve: {
        alias: {
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
        minify: false,
        rollupOptions: {
            treeshake: false,
            output: {
                //'inlineDynamicImports': false,
                //'preserveModules': true,
                'preserveModulesRoot': 'src',

            },
            preserveEntrySignatures: true
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis'
            }
        },
        exclude: ["pyodide", "loadPyodide"],
        noDiscovery: true
    },
    plugins: [

        copy(
            {
                targets: [
            
                    viteStaticCopyPyodide()
                ],
                verbose: true,
                hook: 'writeBundle'
            }
        ), 
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
                        {
                        urlPattern: /assets\/.*/,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "horus-0.2.1-cache",
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