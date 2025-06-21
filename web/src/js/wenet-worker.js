import { loadPyodide } from "pyodide";

let buffer = []
var wenet
var write_wenet
let payload_callsign

// Now load any packages we need, run the code, and send the result back.
const pyodide = await loadPyodide();
await Promise.all([
    pyodide.loadPackage("../assets/cffi-1.17.1-cp312-cp312-pyodide_2024_0_wasm32.whl"),
    pyodide.loadPackage("../assets/pycparser-2.22-py3-none-any.whl"),
    pyodide.loadPackage("../assets/crc-7.1.0-py3-none-any.whl"),
    pyodide.loadPackage("../assets/idna-3.7-py3-none-any.whl"),
    pyodide.loadPackage("../assets/charset_normalizer-3.3.2-py3-none-any.whl"),
    pyodide.loadPackage("../assets/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"),
    pyodide.loadPackage("../assets/requests-2.32.3-py3-none-any.whl"),
    pyodide.loadPackage("../assets/six-1.16.0-py2.py3-none-any.whl"),
    pyodide.loadPackage("../assets/urllib3-2.2.3-py3-none-any.whl"),
    pyodide.loadPackage("../assets/certifi-2024.12.14-py3-none-any.whl"),
    pyodide.loadPackage("../assets/webhorus-0.1.0-cp312-cp312-pyodide_2024_0_wasm32.whl")
])

var freq = 0;

console.log("wennet worker loaded")

const ssdv_url = "https://ssdv.habhub.org/api/v0/packets"

var sh_config
var gps_data = []

var samplerate
var rs232_framing

self.onmessage = async (event) => {
    
    if ("config" in event.data) {
        self.samplerate = event.data.config.samplerate
        self.rs232_framing = event.data.config.rs232_framing
        pyodide.runPython(`
            from js import postMessage
            from js import self
            from pywenet.wenet import Wenet
            import struct
            import logging
            logging.basicConfig()
            logging.getLogger().setLevel(logging.INFO)
            wenet = Wenet(
                samplerate=self.samplerate,
                rs232_framing=self.rs232_framing,
                partialupdate=25,
                )
            buffer = b''
            def write_wenet(audio):
                global buffer
                audio = audio.to_py(depth=1)
                audio = struct.pack(('f'*len(audio)), *audio)  
                buffer = buffer + audio
                outputs = []
                while len(buffer) >= wenet.nin * 2 * 4:
                    in_modem = buffer[:wenet.nin *2 * 4]
                    buffer = buffer[wenet.nin *2 * 4:]
                    
                    wenet_return = wenet.write(in_modem)
                    if wenet_return:
                        outputs.append(wenet_return)
                return outputs      
        `
        )

        wenet = pyodide.runPython(`wenet`);
        write_wenet = pyodide.runPython(`write_wenet`);
        console.log("Python ran.")
        return
    }
    if (write_wenet == undefined){
        return
    }
    sh_config = event.data.sh // update sondehub config from main thread
    freq = event.data.freq
    const wenet_returns = write_wenet(event.data.buffer)

    for (const element of wenet_returns.toJs({ dict_converter: Object.fromEntries })) {
        self.postMessage({ "type": element[0], "args": element[1] })

        // upload ssdv images
        if (element[0] == "image") { // posting to ssdv
            payload_callsign = element[1][1]
            if (event.data.sh) {
                var ssdv_payload = {
                    "type": "packets",
                    "packets": element[1][3].map((x) => {
                        return {
                            "type": "packet",
                            "packet": x,
                            "encoding": "base64",
                            "received": new Date().toISOString().split(".")[0] + "Z",
                            "receiver": sh_config.uploader_callsign
                        }
                    })
                }
                fetch(ssdv_url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(ssdv_payload)
                })
            }
        }
        if (element[0] == "gps") {
            const sh_gps_data = structuredClone(element[1])
            sh_gps_data.time_received = new Date().toISOString()
            gps_data.push(sh_gps_data)
        }
    }
    self.postMessage({ "type": "time", "time": event.data.time })

};
const sh_upload = setInterval(() => {
    if (sh_config) {
        if (payload_callsign && gps_data) {
            const to_sondehub = gps_data.map((gps_data) => {
                var sh_payload = structuredClone(sh_config)

                sh_payload.payload_callsign = payload_callsign + "-Wenet"
                sh_payload.datetime = gps_data['timestamp'] + "Z"
                sh_payload.lat = +gps_data['latitude'].toFixed(6)
                sh_payload.lon = +gps_data['longitude'].toFixed(6)
                sh_payload.alt = +gps_data['altitude'].toFixed(1)
                sh_payload.sats = gps_data['numSV']
                sh_payload.heading = +gps_data['heading'].toFixed(1)
                sh_payload.modulation = "Wenet"
                sh_payload.time_received = gps_data['time_received']
                if (snr) {
                    sh_payload.snr = snr
                }

                if (f_est){
                    sh_payload.frequency = ((freq+f_est[0]+f_est[1]/2)/1000/1000)
                }
                sh_payload.ascent_rate = +gps_data['ascent_rate'].toFixed(1)
                sh_payload.speed = +gps_data['ground_speed'].toFixed(1)
                if ("radio_temp" in gps_data && gps_data['radio_temp'] > -999.0) {
                    sh_payload.radio_temp = gps_data['radio_temp']
                }
                if ("cpu_temp" in gps_data && gps_data['cpu_temp'] > -999.0) {
                    sh_payload.cpu_temp = gps_data['cpu_temp']
                }

                sh_payload.cpu_speed = gps_data['cpu_speed']
                sh_payload.load_avg_1 = gps_data['load_avg_1']
                sh_payload.load_avg_5 = gps_data['load_avg_5']
                sh_payload.load_avg_15 = gps_data['load_avg_15']
                sh_payload.disk_percent = gps_data['disk_percent']

                if ("lens_position" in gps_data && gps_data['lens_position'] > -999.0) {
                    sh_payload.lens_position = gps_data['lens_position']
                }

                if ("sensor_temp" in gps_data && gps_data['sensor_temp'] > -999.0) {
                    sh_payload.sensor_temp = gps_data['sensor_temp']
                }

                if ("focus_fom" in gps_data && gps_data['focus_fom'] > -999.0) {
                    sh_payload.focus_fom = gps_data['focus_fom']
                }
                return sh_payload
            })
            const response = fetch("https://api.v2.sondehub.org/amateur/telemetry", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(to_sondehub)
            }).then(response => {
                response.text().then(body => {
                    // log_entry("Reported station info: " + body, "info")
                })
            }).catch((error) => {
                console.error("Error posting to sondehub: " + error.message)
            })
        }
    }

    gps_data = [] // discard gps data if no sondehub config

}, 10000) // every 10 seconds post to sondehub if we have data

var snr
var f_est

const modem_states = setInterval(() => {
    var fft = pyodide.runPython("list(wenet.wenet.fsk.fft_est[0:wenet.wenet.fsk.Ndft//2])").toJs()
    fft = fft.map((x) => Math.log10(x) * 10)
    snr = wenet.wenet.stats.snr_est
    f_est = [wenet.wenet.stats.f_est.get(0), wenet.wenet.stats.f_est.get(1)]
    self.postMessage({ "type": "snr", "args": snr })
    self.postMessage({ "type": "fft", "fft": fft })
    self.postMessage({ "type": "f_est", "args": f_est })
}, 1000)

self.postMessage({ "type": "start"})