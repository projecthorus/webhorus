// Import our custom CSS
import '../scss/style.scss'

// Import all of Bootstrap's JS
import * as bootstrap from 'bootstrap'


import * as Plotly from "plotly.js-dist-min";

import "leaflet";

import { Radio } from "@jtarrio/webrtlsdr/radio/radio";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr/rtl2832u";
import { Demodulator } from "@jtarrio/webrtlsdr/demod/demodulator";
import { ComplexDownsampler } from "@jtarrio/webrtlsdr/dsp/resamplers";
import { concatenateReceivers } from "@jtarrio/webrtlsdr/radio/sample_receiver"

import { start_wenet, stop_wenet } from "./wenet"

import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

// these only impact horus - not wenet
const rtl_sdr_rate = 256000; 
const ssb_bandwidth = 6000;
const rtl_offset = -3000; // we offset the dial frequency by this much so we can offer some adjustment range
const rtl_freq_est_lower = 1000;
const rtl_freq_est_upper = 5000;

globalThis.WF_MAX_ROWS = 50;
globalThis.WF_ZMIN = -150;
globalThis.wfZ = [];
globalThis.wfY = [];
globalThis.wfRow = 0;

const fftSize = 16384

var picked = false

var pickerMarker;
var mapPickerMap;
globalThis.geoload = function () {
    function browserPosition(position) {
        log_entry(`Received user location`, "light")
        if (pickerMarker == undefined) {
            pickerMarker = L.marker([position.coords.latitude, position.coords.longitude]).addTo(mapPickerMap);
            mapPickerMap.setView([position.coords.latitude, position.coords.longitude], 12)
        }
    }

    if (navigator.geolocation && pickerMarker == undefined) {
        navigator.geolocation.getCurrentPosition(browserPosition);
    }
}


function loadMapPicker() {
    mapPickerMap = L.map('location_picker', {worldCopyJump: true}).setView([-37.8136, 144.9631], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapPickerMap);

    document.getElementById('mapPickerModal').addEventListener("shown.bs.modal", (x) => {
        mapPickerMap.invalidateSize();
    });


    mapPickerMap.on('click', function (e) {
        if (pickerMarker) {
            mapPickerMap.removeLayer(pickerMarker);
        }
        pickerMarker = L.marker(e.latlng).addTo(mapPickerMap);
    });

    globalThis.saveLocation = function () {
        if (pickerMarker) {
            document.getElementById("uploader_lat").value = pickerMarker.getLatLng().lat
            document.getElementById("uploader_lon").value = pickerMarker.getLatLng().lng
            document.getElementById("wizard_uploader_lat").value = pickerMarker.getLatLng().lat
            document.getElementById("wizard_uploader_lon").value = pickerMarker.getLatLng().lng
            globalThis.saveSettings()
            globalThis.wizard.show()
        }
        pickerMarker.remove()
        pickerMarker = undefined
    }
    log_entry(`Map picker loaded`, "light")
}

var markers = {};
var tracks = {};

function loadTrackMap() {
    globalThis.trackMap = L.map('trackMap', {}).setView([-37.8136, 144.9631], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(globalThis.trackMap);
    log_entry(`Track map loaded`, "light")
    trackMap.invalidateSize();
}

import { loadPyodide } from "pyodide";
var settings_loaded = false;

globalThis.saveSettings = function () {
    if (settings_loaded){
        localStorage.setItem("sound_adapter", document.getElementById("sound_adapter").value)
        localStorage.setItem("callsign", document.getElementById("callsign").value)
        localStorage.setItem("uploader_radio", document.getElementById("uploader_radio").value)
        localStorage.setItem("uploader_antenna", document.getElementById("uploader_antenna").value)
        localStorage.setItem("uploader_lat", document.getElementById("uploader_lat").value)
        localStorage.setItem("uploader_lon", document.getElementById("uploader_lon").value)
        localStorage.setItem("uploader_alt", document.getElementById("uploader_alt").value)
        localStorage.setItem("fft_rate", document.getElementById("fft_rate").value)
        localStorage.setItem("upload_sondehub", document.getElementById("upload_sondehub").checked)
        localStorage.setItem("uploader_position", document.getElementById("uploader_position").checked)
        localStorage.setItem("rtlbiast", document.getElementById("rtlbiast").checked)
        localStorage.setItem("dial", document.getElementById("dial").value)
        localStorage.setItem("tone_spacing", document.getElementById("tone_spacing").value)
        localStorage.setItem("rtl_freq", document.getElementById("rtl_freq").value)
        localStorage.setItem("gain", document.getElementById("gain").value)
        localStorage.setItem("ppm", document.getElementById("ppm").value)
        localStorage.setItem("radio", document.querySelector('input[name="radioType"]:checked').value)
        localStorage.setItem("rtlaudio", document.getElementById("rtlaudio").checked)
        localStorage.setItem("wenet_version", document.getElementById("wenet_version").value)
        localStorage.setItem("baud", document.getElementById("baud").value)
        log_entry(`Saved settings`, "light")
        report_position()

        // send current fft rate to worker
        globalThis.set_worker_fft_rate()
    }
}

globalThis.loadSettings = function () {
    if (localStorage.getItem("callsign")) { 
        document.getElementById("callsign").value = localStorage.getItem("callsign") 
        document.getElementById("wizard_callsign").value  = localStorage.getItem("callsign") 
    }
    if (localStorage.getItem("uploader_radio")) { 
        document.getElementById("uploader_radio").value = localStorage.getItem("uploader_radio") 
        document.getElementById("wizard_uploader_radio").value = localStorage.getItem("uploader_radio") 
    }
    if (localStorage.getItem("uploader_antenna")) { 
        document.getElementById("uploader_antenna").value = localStorage.getItem("uploader_antenna") 
        document.getElementById("wizard_antenna").value = localStorage.getItem("uploader_antenna")
    }
    if (localStorage.getItem("uploader_lat")) { 
        document.getElementById("uploader_lat").value = localStorage.getItem("uploader_lat") 
        document.getElementById("wizard_uploader_lat").value = localStorage.getItem("uploader_lat") 
    }
    if (localStorage.getItem("uploader_lon")) { 
        document.getElementById("uploader_lon").value = localStorage.getItem("uploader_lon")
        document.getElementById("wizard_uploader_lon").value = localStorage.getItem("uploader_lon")

     }
    if (localStorage.getItem("uploader_alt")) { 
        document.getElementById("uploader_alt").value = localStorage.getItem("uploader_alt") 
        document.getElementById("wizard_uploader_alt").value = localStorage.getItem("uploader_alt")
    }
    if (localStorage.getItem("fft_rate")) { 
        document.getElementById("fft_rate").value = localStorage.getItem("fft_rate")
    }
    if (localStorage.getItem("upload_sondehub")) { document.getElementById("upload_sondehub").checked = (localStorage.getItem("upload_sondehub") == 'true') }
    if (localStorage.getItem("uploader_position")) { document.getElementById("uploader_position").checked = (localStorage.getItem("uploader_position") == 'true') }
    if (localStorage.getItem("dial")) { document.getElementById("dial").value = localStorage.getItem("dial") }
    if (localStorage.getItem("tone_spacing")) { document.getElementById("tone_spacing").value = localStorage.getItem("tone_spacing") }
    if (localStorage.getItem("rtl_freq")) { document.getElementById("rtl_freq").value = localStorage.getItem("rtl_freq") }
    if (localStorage.getItem("gain")) { 
        document.getElementById("gain").value = localStorage.getItem("gain")
        document.getElementById("wizard_gain").value = localStorage.getItem("gain")
    }
    if (localStorage.getItem("ppm")) { 
        document.getElementById("ppm").value = localStorage.getItem("ppm") ;
        document.getElementById("wizard_ppm").value = localStorage.getItem("ppm")
    }
    if (localStorage.getItem("rtlaudio")) { document.getElementById("rtlaudio").checked = (localStorage.getItem("rtlaudio") == 'true') }
    if (localStorage.getItem("rtlbiast")) { 
        document.getElementById("rtlbiast").checked = (localStorage.getItem("rtlbiast") == 'true') 
        document.getElementById("wizard_rtlbiast").checked = (localStorage.getItem("rtlbiast") == 'true') 
    }
    if (localStorage.getItem("wenet_version")) {document.getElementById("wenet_version").value = localStorage.getItem("wenet_version") }
    if (localStorage.getItem("baud")) {document.getElementById("baud").value = localStorage.getItem("baud") }
    
    if (localStorage.getItem("radio")) {
        const radio = localStorage.getItem("radio");
        document.getElementById(radio).click()
    }

    globalThis.updateRadio()
    globalThis.updateGain()
    globalThis.wizardUpdateGain()
    globalThis.updatePPM()
    globalThis.rtlaudio()
    globalThis.updateBiasT()

    log_entry(`Loaded settings`, "light")
}

globalThis.rtlaudio = function () {
    if (document.getElementById("radioRTL").checked && globalThis.rtlAudioNode) {
        if (document.getElementById("rtlaudio").checked) {
            globalThis.rtlAudioNode.connect(audioContext.destination)
        } else {
            try {
                globalThis.rtlAudioNode.disconnect(audioContext.destination)
            } catch (err) {
                console.error(err)
            }
        }
    } else {
        if (globalThis.rtlAudioNode) {
            try {
                globalThis.rtlAudioNode.disconnect(audioContext.destination)
            } catch (err) {
                console.error(err)
            }

        }

    }
}

globalThis.addFrame = function (data) {
    const frames_div = document.getElementById("frames")
    const card = document.createElement("div")
    card.classList = "card text-dark bg-light me-3"


    const cardTitle = document.createElement("div")
    cardTitle.classList = "card-header h6"
    cardTitle.innerText = "[" + data.sequence_number + "] " + data.time
    card.appendChild(cardTitle)

    const cardBody = document.createElement("div")
    cardBody.classList = "card-body"
    card.appendChild(cardBody)

    const fieldTable = document.createElement("table")
    fieldTable.classList = "table card-text"
    cardBody.appendChild(fieldTable)


    function toFixedIfNecessary(value, dp) {
        return +parseFloat(value).toFixed(dp);
    }

    for (let field_name of data.packet_format.fields.map((x) => x[0]).concat(data.custom_field_names)) {
        if (field_name != "custom" && field_name != "checksum" && field_name != "sequence_number" && field_name != "time") {
            const field = document.createElement("tr")
            fieldTable.appendChild(field)
            const fieldName = document.createElement("th")
            field.appendChild(fieldName)
            const titleCase = (str) => str.replace(/\b\S/g, t => t.toUpperCase());
            fieldName.innerText = titleCase(field_name.replaceAll("_", " "))
            const fieldValue = document.createElement("td")
            if (field_name == "latitude" || field_name == "longitude") {
                const geoLink = document.createElement("a")
                geoLink.innerText = toFixedIfNecessary(parseFloat(data[field_name]), 4)
                geoLink.href = `geo:${data["latitude"]},${data["longitude"]}`
                fieldValue.appendChild(geoLink)
            } 
            else if (field_name == "custom_data"){
                for (var key of Object.keys(data[field_name])) {
                    fieldValue.innerText  = fieldValue.innerText  + data[field_name][key].toString(16);
                }
            }
            else {
                if (field_name == "payload_id" || typeof data[field_name] != "number") {
                    fieldValue.innerText = data[field_name]
                } else {
                    fieldValue.innerText = toFixedIfNecessary(parseFloat(data[field_name]), 4)
                }
            }
            field.appendChild(fieldValue)
        }

    }

    frames_div.prepend(card)
    document.title = "webhorus - " + data['payload_id']
}




globalThis.updateMarker = function (data) {
    const position = L.latLng(data.latitude, data.longitude)
    // create marker if not exists, otherwise update
    if (data.payload_id in markers) {
        markers[data.payload_id].setLatLng(position)
    } else {
        markers[data.payload_id] = L.circleMarker(position)
        markers[data.payload_id].bindTooltip(data.payload_id);
        markers[data.payload_id].addTo(globalThis.trackMap);
    }

    // update tracks
    if (!(data.payload_id in tracks)) {
        tracks[data.payload_id] = L.polyline([position], { color: 'red' }).addTo(globalThis.trackMap);
    } else {
        tracks[data.payload_id].addLatLng(position)
    }

    globalThis.trackMap.panTo(position);
}

globalThis.rx_packet = function (packet, sh_format, stats, snr) {
    log_entry(JSON.stringify(packet.toJs()), "info")

    var freq_est = stats.toJs().f_est
    var freq_mean = freq_est.reduce((a, b) => a + b, 0) / freq_est.length

    log_entry(`Clock offset(ppm): ${stats.toJs().clock_offset}`, "light")

    var final_freq

    if (document.getElementById("radioRTL").checked) {
        final_freq = (globalThis.Radio.getFrequency() + freq_mean) / 1000000
    } else {
        if (document.getElementById("dial").value) {
            var dial_freq = parseFloat(document.getElementById("dial").value)
            if (!isNaN(dial_freq)) {
                dial_freq = dial_freq * 1000000
                final_freq = (freq_mean + dial_freq) / 1000000
            }
        }
    }


    if (sh_format) {
        var sh_packet = sh_format.toJs()
        if (final_freq) {
            sh_packet['frequency'] = final_freq
        }

        // Mark will want me to do some peak hold stuff here, but honestly that just seems like too much work.
        sh_packet['snr'] = snr
        log_entry(`Posting telm.`, "light")
        const response = fetch("https://api.v2.sondehub.org/amateur/telemetry", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify([sh_packet])
        }).then(response => {
            var sh_log_text = ""
            var sh_log_level = "info"
            if (response.headers.get('content-type') == 'application/json') {
                response.json().then(
                    body => {
                        if ('message' in body) {
                            sh_log_text = body.message
                        }
                        if ('errors' in body && body.errors.length > 0) {
                            sh_log_level = "danger"
                        } else if ('warnings' in body && body.warnings.length > 0) {
                            sh_log_level = "warning"
                        }
                        if ('errors' in body) {
                            for (var x in body.errors) {
                                sh_log_text = sh_log_text + "\n" + body.errors[x].error_message
                            }
                        }
                        if ('warnings' in body) {
                            for (var x in body.warnings) {
                                sh_log_text = sh_log_text + "\n" + body.warnings[x].warning_message
                            }
                        }
                        log_entry(sh_log_text, sh_log_level)
                    }
                )
            } else {
                response.text().then(
                    body => {
                        if (response.status >= 200 && response.status <= 299) {
                            sh_log_level = "info"
                        } else {
                            sh_log_level = "danger"
                        }
                        sh_log_text = body
                        log_entry(sh_log_text, sh_log_level)
                    }
                )
            }

        }).catch((error) => {
            log_entry("Error posting to sondehub: " + error.message, "danger")
        })

    } else {
        log_entry(`No SondeHub format so not posting.`, "light")
    }
    globalThis.addFrame(packet.toJs())
    globalThis.updateMarker(packet.toJs())
    updatePlots(packet.toJs())
}

var axis_mapping = []

function updatePlots(data) {
    var axis_ids = []
    var plot_data = []


    for (let field_name of data.packet_format.fields.map((x) => x[0]).concat(data.custom_field_names)) {
        if (typeof data[field_name] === "number"){
            if (field_name != "custom" &&
                field_name != "checksum" &&
                field_name != "sequence_number" &&
                field_name != "time" &&
                field_name != "payload_id" &&
                field_name != "longitude" &&
                field_name != "latitude"
            ) {
                var field_name_payload = field_name + "[" + data.payload_id + "]"
                if (!(axis_mapping.includes(field_name_payload))) {
                    axis_mapping.push(field_name_payload)
                    globalThis.Plotly.addTraces('plots', { y: [], x: [], name: field_name_payload, mode: 'lines' })
                }
                var axis_id = axis_mapping.indexOf(field_name_payload)
                axis_ids.push(axis_id)
                plot_data.push([data[field_name]])
            }
        }
    }

    var plot_time = data.time

    globalThis.Plotly.extendTraces('plots', { y: plot_data, x: [...Array(plot_data.length)].map(() => [plot_time]) }, axis_ids, 256)
}



globalThis.Plotly.newPlot('snr', [{
    y: [],
    x: [],
    mode: 'lines'
}], {
    autosize: true,
    margin: {
        l: 20,
        r: 0,
        b: 60,
        t: 5,
        pad: 0
    },
    title: {
        text: 'SNR (dB)',
        font: {
            size: "12"
        },
        yref: "paper",
        yanchor: "top",

    },
    yaxis: {
        tickfont: {
            size: "9"
        },
        autorange: true,
        range: [-2, 20],
        autorangeoptions: {
            include: [-2, 20]
        }
    }
}, { responsive: true, staticPlot: true });

globalThis.spectrum_layout = {
  autosize: true,
  margin: { l: 40, r: 40, b: 40, t: 20, pad: 0 },
  xaxis: {
    title: 'Frequency [Hz]',
    tickfont: { size: 12 }
  },
  yaxis: {
    title: 'Time',
    autorange: 'reversed',
    tickfont: { size: 12 }
  }
};

const turboColorscale = [
  [0.0,   '#30123b'],
  [0.1,   '#4145ab'],
  [0.2,   '#4673e0'],
  [0.3,   '#34a6dd'],
  [0.4,   '#1ed5b6'],
  [0.5,   '#32f17e'],
  [0.6,   '#90f539'],
  [0.7,   '#e4e61a'],
  [0.8,   '#fcb414'],
  [0.9,   '#f4630a'],
  [1.0,   '#b21b0a']
];

const traceWaterfall = {
  type: 'heatmap',
  x: [], y: [], z: [],
  colorscale: turboColorscale,
  showscale: false,
  xaxis: 'x2',
  yaxis: 'y2',
  zauto: false,
  zsmooth: false
};

globalThis.spectrum_layout.xaxis = {
  showticklabels: false,
  showgrid: false,
  zeroline: false,
  title: ''
};

globalThis.spectrum_layout.yaxis = {
  autorange: true,
  showticklabels: false,
  showgrid: false,
  zeroline: false
};

globalThis.Plotly.newPlot('spectrum', [traceWaterfall], globalThis.spectrum_layout, { responsive: true, staticPlot: true });

globalThis.Plotly.newPlot('plots', [], {
    autosize: true,
    margin: {
        l: 35,
        r: 0,
        b: 30,
        t: 20,
        pad: 0
    },
    yaxis: {

        autorange: true,

    }
}, { responsive: true });

globalThis.updateStats = function (stats) {
    const stats_js = stats.toJs()
    const freq_est = stats_js.f_est
    const freq_mean = freq_est.reduce((a, b) => a + b, 0) / freq_est.length

    // update spectrum annotations
    globalThis.spectrum_layout.annotations = freq_est.map((x) => {
        if (document.getElementById("radioRTL").checked) {
            x = rtl_offset + x
        }

        return {
            x: x,
            y: 1,
            yref: "paper",
            ay: 1.3,
            ax: 1,
            ayref: "paper",
            showarrow: true,
            arrowhead: 2,
            arrowsize: 1, 
            arrowcolor: "black"
        }

    })

    if (document.getElementById("radioRTL").checked) {
        globalThis.spectrum_layout.shapes = [
            {
                type: 'rect',
                yref: 'paper',
                x0: rtl_offset,
                y0: 0,
                x1: rtl_freq_est_lower + rtl_offset,
                y1: 1,
                fillcolor: '#d3d3d3',
                opacity: 0.5,
                line: {
                    width: 0
                }
            },
            {
                type: 'rect',
                yref: 'paper',
                x0: rtl_freq_est_upper + rtl_offset,
                y0: 0,
                x1: rtl_offset * -1,
                y1: 1,
                fillcolor: '#d3d3d3',
                opacity: 0.5,
                line: {
                    width: 0
                }
            }
        ]
    } else {
        globalThis.spectrum_layout.shapes = []
    }

    globalThis.Plotly.extendTraces('snr', {
        y: [[stats_js.snr_est]],
        x: [[new Date().toISOString()]]
    }, [0], 256)
}

globalThis.updateModem = function(){
    if (globalThis.audioContext) { // check if we are running - probably need a better way of doing this...
        if (document.getElementById("radioRTL").checked) {
            // starting the modem will replace the existing one
            globalThis.nin = globalThis.start_modem(globalThis.audioContext.sampleRate, parseInt(document.getElementById("baud").value), false, rtl_freq_est_lower, rtl_freq_est_upper)
        } else {
            globalThis.nin = globalThis.start_modem(globalThis.audioContext.sampleRate, parseInt(document.getElementById("baud").value))
        }
    }
}

globalThis.updateToneSpacing = function () {
    var tone_spacing = parseInt(document.getElementById("tone_spacing").value)
    if (isFinite(tone_spacing)) {
        log_entry(`Updating tone spacing: ${tone_spacing}`, "light")
        globalThis.updateModem()
        saveSettings()
    }
    
}

globalThis.updateBaudRate = function () {
    var baud = parseInt(document.getElementById("baud").value)
    log_entry(`Updating baudrate: ${baud}`, "light")
    globalThis.updateModem()
    saveSettings()

}

var VERSION

async function init_python() {
    log_entry("Starting python load", "light")


    await Promise.all([
        globalThis.pyodide.loadPackage("./assets/cffi-1.17.1-cp313-cp313-pyodide_2025_0_wasm32.whl"),
        globalThis.pyodide.loadPackage("./assets/pycparser-2.22-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/crc-7.1.0-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/idna-3.7-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/charset_normalizer-3.3.2-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/python_dateutil-2.9.0.post0-py2.py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/requests-2.32.3-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/six-1.16.0-py2.py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/urllib3-2.2.3-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/certifi-2024.12.14-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/webhorus-0.2.1-cp313-cp313-pyodide_2025_0_wasm32.whl"),
        globalThis.pyodide.loadPackage("./assets/pyparsing-3.1.2-py3-none-any.whl"),
        globalThis.pyodide.loadPackage("./assets/bitstruct-8.21.0-cp313-cp313-pyodide_2025_0_wasm32.whl"),
        globalThis.pyodide.loadPackage("./assets/asn1tools-0.167.0-py3-none-any.whl")
    ]);
    log_entry("Python packages loaded", "light")
    await globalThis.pyodide.runPythonAsync(`
        class r_get():
            def __init__(self,url,timeout):
                if url not in [PAYLOAD_ID_LIST_URL, HORUS_CUSTOM_FIELD_URL]:
                    raise ValueError("Not supported requests url")
                self.url = url
            @property
            def text(self):
                if self.url == PAYLOAD_ID_LIST_URL:
                    return payload_ids
                elif self.url == HORUS_CUSTOM_FIELD_URL:
                    return payload_formats

        import requests
        requests.get = r_get
        from horusdemodlib.payloads import PAYLOAD_ID_LIST_URL, HORUS_CUSTOM_FIELD_URL
        from pyodide.http import pyfetch
        payload_ids = ""
        try:
            payload_ids =  await (await pyfetch(PAYLOAD_ID_LIST_URL)).text()
        except:
            print("Issue fetching payload ids")
        payload_formats=""
        try:
            payload_formats = await (await pyfetch(HORUS_CUSTOM_FIELD_URL)).text()
        except:
            print("Issue fetching payload formats")
        `)
    globalThis.pyodide.runPython(await (await fetch("/py/main.py")).text());
    log_entry("main.py loaded", "light")

    globalThis.write_audio = globalThis.pyodide.runPython("write_audio")
    globalThis.fix_datetime = globalThis.pyodide.runPython("fix_datetime")
    globalThis.start_modem = globalThis.pyodide.runPython("start_modem")

    document.getElementById("audio_start").removeAttribute("disabled");
    document.getElementById("audio_start").innerText = "Start"
    globalThis.VERSION = pyodide.runPython("VERSION")
    log_entry(`webhorus ready. version: ${globalThis.VERSION}`, "light")

    globalThis.show_wizard();
    document.getElementById("loading").classList.add("d-none")
    document.getElementById("loaded").classList.remove("d-none")

    globalThis.payload_id_updater = setInterval(()=>{
        globalThis.pyodide.runPythonAsync(`
            payload_ids =  await (await pyfetch(PAYLOAD_ID_LIST_URL)).text()
            payload_formats = await (await pyfetch(HORUS_CUSTOM_FIELD_URL)).text()
        `);
        }
    ,1000*60*15)
}




async function add_constraints(constraint) {
    const stream = await navigator.mediaDevices.getUserMedia(constraint)
    const supported_constraints = await stream.getTracks()[0].getCapabilities()
    const wanted = ["echoCancellation", "autoGainControl", "noiseSuppression"]
    for (var x of wanted) {

        if (x in supported_constraints) {
            constraint.audio[x] = { "ideal": false }
        }
    }
    constraint.audio.deviceId = supported_constraints.deviceId

    return constraint
}


globalThis.snd_change = async function () {
    console.log("changing sound device")
    if (document.getElementById("sound_adapter").value != 'placeholder') {
        var constraint = {
            "audio": {
                "deviceId": { "exact": document.getElementById("sound_adapter").value },

            }
        }
    } else {
        var constraint = undefined
    }
    log_entry(`Changing sound device: ${JSON.stringify(constraint)}`, "light")
    startAudio(constraint)
    saveSettings()
}




var microphone_stream = null
var horusNode
var activeAnalyser

globalThis.updateRadio = function () {
    stop_wenet()
    const audio = document.getElementById("radioAudio").checked
    if (audio) {
        document.getElementById("audioSection").classList.remove("d-none")
        document.getElementById("rtlSection").classList.add("d-none")
    } else {
        document.getElementById("audioSection").classList.add("d-none")
        document.getElementById("rtlSection").classList.remove("d-none")
    }

    if (globalThis.microphone_stream) {
        log_entry(`Clearing existing input stream.`, "light")
        globalThis.microphone_stream.mediaStream.getTracks()[0].stop()
        globalThis.microphone_stream.disconnect()
    }

    if (globalThis.rtlAudioNode) {
        globalThis.rtlAudioNode.disconnect()
        globalThis.rtlAudioNode.port.onmessage = undefined
    }
    if (globalThis.Radio) {
        globalThis.Radio.stop()
    }
    if (globalThis.VERSION) { // only reset the start button if python has been loaded
        document.getElementById("audio_start").removeAttribute("disabled");
        document.getElementById("audio_start").classList.remove("btn-outline-success")
        document.getElementById("audio_start").innerText = "Start"
        document.getElementById("dbfs").classList = "progress-bar"
        document.getElementById("dbfs").style.width = "0%"
        document.getElementById("dbfstext").innerText = "-999 dBFS"
    }

    if (document.getElementById("radioWenet").checked){
        document.getElementById("rtlaudio").setAttribute("disabled", "disabled")
        document.getElementById("horusSection").classList.add("d-none")
        document.getElementById("wenetSection").classList.remove("d-none")
        globalThis.setPageTitle("webwenet")
    } else {
        document.getElementById("wenetSection").classList.add("d-none")
        document.getElementById("horusSection").classList.remove("d-none")
        document.getElementById("rtlaudio").removeAttribute("disabled")
        globalThis.setPageTitle("webhorus")
    }

    if (audio && document.getElementById("sound_adapter").value != 'placeholder') {
        globalThis.snd_change()
    }

    globalThis.rtlaudio()
}

globalThis.updatedbfs = function (dBFS) {
    if (document.getElementById("audio_start").innerText == "Running"){ // hack to only update the dbfs if we are in running mode
        var percent = (1 - (dBFS / -120)) * 100 // I don't even know. just trying to represent the level

        if (!isFinite(percent)) {
            percent = 0;
        }
        document.getElementById("dbfs").style.width = percent.toFixed(2) + "%"
        document.getElementById("dbfstext").innerText = dBFS.toFixed(2) + " dBFS"
        if (dBFS > -5) {
            document.getElementById("dbfs").classList = "progress-bar bg-danger"
        } else if (dBFS < -90) {
            document.getElementById("dbfs").classList = "progress-bar bg-danger"
        } else if (dBFS < -50) {
            document.getElementById("dbfs").classList = "progress-bar bg-warning"
        } else {
            document.getElementById("dbfs").classList = "progress-bar bg-success"
        }
    }
}

globalThis.updatePPM = function () {
    const ppm = parseFloat(document.getElementById("ppm").value)
    if (globalThis.Radio) {
            globalThis.Radio.setFrequencyCorrection(ppm)
            log_entry(`Setting RTL PPM: ` + ppm, "light")
    }
}

globalThis.updateGain = function () {
    const gain = parseFloat(document.getElementById("gain").value)
    if (gain == -0.5) {
        document.getElementById("gaindb").value = `Auto gain control`
    } else {
        document.getElementById("gaindb").value = `${gain} dB`
    }
    if (globalThis.Radio) {
        if (gain == -0.5) {
            globalThis.Radio.setGain(null)
            log_entry(`Setting RTL Gain: agc`, "light")
        } else {
            globalThis.Radio.setGain(gain)
            log_entry(`Setting RTL Gain: ${gain}`, "light")
        }
    }
}

globalThis.wizardUpdateGain = function () {
    const gain = parseFloat(document.getElementById("wizard_gain").value)
    if (gain == -0.5) {
        document.getElementById("wizard_gaindb").value = `Auto`
    } else {
        document.getElementById("wizard_gaindb").value = `${gain} dB`
    }
}

globalThis.updateBiasT = function () {
    if (globalThis.Radio) {
        if (document.getElementById("rtlbiast").checked){
            globalThis.Radio.enableBiasTee(true);
            log_entry("Bias T enabled", "light")
        } else {
            globalThis.Radio.enableBiasTee(false);
            log_entry("Bias T disabled", "light")
        }
    }
}

globalThis.rtlFreq = function () {
    const rtl_freq = parseFloat(document.getElementById("rtl_freq").value) * 1000000
    if (globalThis.Radio) {
        globalThis.Radio.setFrequency(rtl_freq + rtl_offset)
        log_entry(`Setting RTL Freq: ${rtl_freq}`, "light")
    }
}

globalThis.startAudio = async function (constraint) {
    document.getElementById("alert").textContent = ""
    document.getElementById("wenet_latency").innerText = ""
    if (document.getElementById("about-tab").classList.contains("active")) {
        document.getElementById("frames-tab").click() // simulate clicking on the receive tab since most users will want to see that when starting the modem
    }

    log_entry(`Starting audio`, "light")
    if (!(globalThis.audioContext)) {
        globalThis.audioContext = new AudioContext();
        await globalThis.audioContext.audioWorklet.addModule('/js/audio.js')
        await globalThis.audioContext.audioWorklet.addModule('/js/rtl_audio.js')
    }

    if (globalThis.microphone_stream) {
        log_entry(`Clearing existing input stream.`, "light")
        globalThis.microphone_stream.mediaStream.getTracks()[0].stop()
        globalThis.microphone_stream.disconnect()
    }

    if (globalThis.rtlAudioNode) {
        globalThis.rtlAudioNode.disconnect()
    }

    if (document.getElementById("radioAudio").checked) {
        stop_wenet()

        console.log("audio is starting up ...");

        if (constraint == undefined) {
            var audio_constraint = { audio: {} }
        } else {
            var audio_constraint = constraint
        }
        const audio_constraint_filters = await add_constraints(audio_constraint)
        log_entry(`Audio constraints: ${JSON.stringify(audio_constraint_filters)}`, "light")

        navigator.mediaDevices.getUserMedia(audio_constraint_filters).then((stream) => {
            if (constraint == undefined) {
                navigator.mediaDevices.enumerateDevices().then(devices => {
                    const saved_device = localStorage.getItem("sound_adapter")
                    const device_id_list = devices.map((device) => device.deviceId)


                    document.getElementById("sound_adapter").removeAttribute("disabled")
                    document.getElementById("snd_ph").remove()
                    for (var index in devices) {
                        if (devices[index].kind == 'audioinput') {
                            var snd_opt = document.createElement("option")
                            snd_opt.innerText = devices[index].label
                            snd_opt.value = devices[index].deviceId
                            document.getElementById("sound_adapter").appendChild(snd_opt)
                        }
                    }
                    document.getElementById("sound_adapter").value = audio_constraint_filters.audio.deviceId
                    if (saved_device && device_id_list.includes(saved_device)) {
                        log_entry(`Found saved sound adapter - changing to: ${saved_device}`, "light")
                        document.getElementById("sound_adapter").value = saved_device
                        snd_change()
                    } else {
                        start_microphone(stream);
                    }

                })
            } else {
                log_entry(`Selecting sound device: ${audio_constraint_filters.audio.deviceId}`, "light")
                document.getElementById("sound_adapter").value = audio_constraint_filters.audio.deviceId
                start_microphone(stream);
            }
        })
    } else if (document.getElementById("radioWenet").checked){
        start_wenet()
    } else {
        start_rtl()
    }


    function start_rtl() {
        stop_wenet()
        document.getElementById("wenet_latency").innerText = ""
        document.getElementById("alert").textContent = ""

        globalThis.rtlAudioNode = new AudioWorkletNode(globalThis.audioContext, 'rtlnode', { "numberOfInputs": 0, "numberOfOutputs": 1 })
        globalThis.rtlAudioNode.port.onmessage = (event) => {
            if (event.data) {
                globalThis.audioContext.resume()
            } else {
                if (document.getElementById("radioRTL").checked) {
                    globalThis.audioContext.suspend()
                }

            }
        }

        class rtlReceiver {
            constructor() {
                this.started = false
            }
            play(left, right) {
                if (this.started == false) {
                    document.getElementById("audio_start").setAttribute("disabled", "disabled");
                    document.getElementById("audio_start").classList.add("btn-outline-success")
                    document.getElementById("audio_start").innerText = "Running"
                    this.started = true
                }
                globalThis.rtlAudioNode.port.postMessage(left)
            }
        }

        class dbfsCalc {
            constructor() { }
            setSampleRate(rate) {

            }
            receiveSamples(I, Q, frequency) {
                var max = Math.max(...(I.map(x => Math.abs(x))), ...(Q.map(x => Math.abs(x))))
                var dBFS = 20 * Math.log10(max);
                globalThis.updatedbfs(dBFS)
            }
        }

        globalThis.rtl = new rtlReceiver()
        rtl.sampleRate = globalThis.audioContext.sampleRate

        globalThis.usbDemod = new Demodulator(rtl_sdr_rate)
        globalThis.usbDemod.setMode({
            scheme: "USB",
            bandwidth: ssb_bandwidth * 2,
            squelch: 0
        })

        globalThis.usbDemod.player = globalThis.rtl

        globalThis.Radio = new Radio(
            new RTL2832U_Provider(),
            globalThis.usbDemod.andThen(new dbfsCalc()),
            rtl_sdr_rate, // sample rate
        )

        globalThis.Radio.addEventListener("radio", (e) => {
            if(e.detail.exception){
                document.getElementById("audio_start").removeAttribute("disabled");
                document.getElementById("audio_start").classList.remove("btn-outline-success")
                document.getElementById("audio_start").innerText = "Start"
                document.getElementById("alert").textContent = e.detail.exception
            };
            console.log(e.detail.exception);console.log(e);
        });

        globalThis.Radio.setSampleRate(rtl_sdr_rate)

        globalThis.Radio.start()
        globalThis.rtlFreq()
        globalThis.updateGain()
        globalThis.updatePPM();
        globalThis.updateBiasT();

        globalThis.nin = globalThis.start_modem(globalThis.audioContext.sampleRate,parseInt(document.getElementById("baud").value), false, rtl_freq_est_lower, rtl_freq_est_upper)


        horusNode = new AudioWorkletNode(globalThis.audioContext, 'horus', {
            processorOptions: {
                nin: globalThis.nin
            }
        });



        globalThis.rtlAudioNode.connect(horusNode);

        horusNode.port.onmessage = (e) => {
            on_audio(e.data)
        }
        globalThis.audioContext.resume()

        // setup spectogram
        activeAnalyser = globalThis.audioContext.createAnalyser();
        activeAnalyser.chan
        activeAnalyser.fftSize = fftSize;
        activeAnalyser.smoothingTimeConstant = 0.25;
        globalThis.rtlAudioNode.connect(activeAnalyser);



        if (activeAnalyser) {
            let analyser = activeAnalyser;
            const maxdB = analyser.maxDecibels;
            const mindB = analyser.minDecibels;
            globalThis.bufferLength = analyser.frequencyBinCount;
            const step = (globalThis.audioContext.sampleRate / 2) / globalThis.bufferLength
            const x_values = [...Array(globalThis.bufferLength).keys()].map((x) => (x + 1) * step)

            // get closest index to x hz to limit plot size
            globalThis.max_index = x_values.reduce((prev, curr, index) => { if (curr < ssb_bandwidth) { return index } else { return prev } }, 0)
            globalThis.filtered_x_values = x_values.slice(0, globalThis.max_index).map((x) => rtl_offset + x)

            if (globalThis.analyserUpdate) {
                clearInterval(globalThis.analyserUpdate)
            }

            //Setup arrays to a full buffer to avoid squish
            const dummyData = Array(globalThis.max_index).fill(globalThis.WF_ZMIN - 1)
            globalThis.wfZ = []
            globalThis.wfY = []
            for (let i = 0; i < globalThis.WF_MAX_ROWS - 1; i++) {
                globalThis.wfZ.push(dummyData);
                globalThis.wfY.push(globalThis.wfRow++);
            }

           globalThis.analyserUpdate = setInterval(() => {
                const buf = new Float32Array(globalThis.bufferLength);
                analyser.getFloatFrequencyData(buf);

                const row = Array.from(buf.slice(0, globalThis.max_index), v =>
                    Number.isFinite(v) ? v : (globalThis.WF_ZMIN - 1)
                );


                // 2) Puffer pflegen
                globalThis.wfZ.push(row);
                globalThis.wfY.push(globalThis.wfRow++);
                if (globalThis.wfZ.length > globalThis.WF_MAX_ROWS) {
                    globalThis.wfZ.shift();
                    globalThis.wfY.shift();
                }

                globalThis.updateZScaleFromBuffer()


            }, 500);
            log_entry(`FFT Started`, "light")



        }

        globalThis.rtlaudio()
    }


    function on_audio(audio_buffer) {



        globalThis.nin = write_audio(audio_buffer)
        horusNode.port.postMessage(globalThis.nin)


    }



    function start_microphone(stream) {

        document.getElementById("audio_start").setAttribute("disabled", "disabled");
        document.getElementById("audio_start").classList.add("btn-outline-success")
        document.getElementById("audio_start").innerText = "Running"
        if (globalThis.microphone_stream) {
            log_entry(`Clearing existing input stream.`, "light")
            globalThis.microphone_stream.mediaStream.getTracks()[0].stop()
            globalThis.microphone_stream.disconnect()
        }
        log_entry(`Starting input stream`, "light")
        try {
            globalThis.microphone_stream = globalThis.audioContext.createMediaStreamSource(stream);
        } catch (err) {
            console.log(err)
            log_entry("Error opening audio device. For firefox users - ensure your default sound device is set to 48,000 sample rate in your OS settings", "danger")
        }

        log_entry(`Audio context sample rate: ${globalThis.audioContext.sampleRate}`, "light")

        globalThis.nin = globalThis.start_modem(globalThis.audioContext.sampleRate, parseInt(document.getElementById("baud").value))

        log_entry(`Initial nin: ${globalThis.nin}`, "light")

        horusNode = new AudioWorkletNode(globalThis.audioContext, 'horus', {
            processorOptions: {
                nin: globalThis.nin
            }
        });
        globalThis.microphone_stream.connect(horusNode);
        horusNode.port.onmessage = (e) => {
            on_audio(e.data)

            var max_audio = Math.max(...e.data)
            // update dbfs meter - and yes I know how silly it is that we are turning these back to floats....
            var dBFS = 20 * Math.log10(max_audio / 32767); // technically we are ignoring half the signal here, but lets assume its not too bias'd
            globalThis.updatedbfs(dBFS)
        }
        globalThis.audioContext.resume()

        // setup spectogram
        activeAnalyser = globalThis.audioContext.createAnalyser();
        activeAnalyser.chan
        activeAnalyser.fftSize = fftSize;
        activeAnalyser.smoothingTimeConstant = 0.25;
        globalThis.microphone_stream.connect(activeAnalyser);



        if (activeAnalyser) {
            let analyser = activeAnalyser;
            const maxdB = analyser.maxDecibels;
            const mindB = analyser.minDecibels;
            globalThis.bufferLength = analyser.frequencyBinCount;
            const step = (globalThis.audioContext.sampleRate / 2) / globalThis.bufferLength
            const x_values = [...Array(globalThis.bufferLength).keys()].map((x) => (x + 1) * step)

            // get closest index to 4k hz to limit plot size
            globalThis.max_index = x_values.reduce((prev, curr, index) => { if (curr < 4000) { return index } else { return prev } }, 0)
            globalThis.filtered_x_values = x_values.slice(0, globalThis.max_index)

            if (globalThis.analyserUpdate) {
                clearInterval(globalThis.analyserUpdate)
            }

            //Setup arrays to a full buffer to avoid squish
            const dummyData = Array(globalThis.max_index).fill(globalThis.WF_ZMIN - 1)
            globalThis.wfZ = []
            globalThis.wfY = []
            for (let i = 0; i < globalThis.WF_MAX_ROWS - 1; i++) {
                globalThis.wfZ.push(dummyData);
                globalThis.wfY.push(globalThis.wfRow++);
            }

            globalThis.analyserUpdate = setInterval(() => {
                const buf = new Float32Array(globalThis.bufferLength);
                analyser.getFloatFrequencyData(buf);

                const row = Array.from(buf.slice(0, globalThis.max_index), v =>
                    Number.isFinite(v) ? v : (globalThis.WF_ZMIN - 1)
                );

                globalThis.wfZ.push(row);
                globalThis.wfY.push(globalThis.wfRow++);
                if (globalThis.wfZ.length > globalThis.WF_MAX_ROWS) {
                    globalThis.wfZ.shift();
                    globalThis.wfY.shift();
                }

                globalThis.updateZScaleFromBuffer()


            }, 500);
            log_entry(`FFT Started`, "light")
        }
    }
};

globalThis.set_worker_fft_rate = function() {
    if (globalThis.worker){
        // send current fft rate to worker
        const val = parseInt(document.getElementById("fft_rate").value, 10);
        if (isFinite(val) && val > 50) {
            globalThis.worker.postMessage({ type: "setInterval", interval: val });
            console.log("FFT interval updated to", val, "ms");
        }
    }
}

function report_position() {
    const lat = parseFloat(document.getElementById("uploader_lat").value)
    const lon = parseFloat(document.getElementById("uploader_lon").value)
    const alt = parseFloat(document.getElementById("uploader_alt").value)
    if (
        document.getElementById("uploader_position").checked &&
        lat != 0 && isFinite(lat) &&
        lon != 0 && isFinite(lon)
    ) {
        var pos = [lat, lon]
        if (isFinite(alt)) {
            pos.push(alt)
        } else {
            pos.push(0)
        }

        const listener_body = {
            "software_name": "webhorus",
            "software_version": globalThis.VERSION + " " + navigator.userAgent,
            "uploader_callsign": document.getElementById("callsign").value,
            "uploader_position": pos,
            "uploader_radio": document.getElementById("uploader_radio").value,
            "uploader_antenna": document.getElementById("uploader_antenna").value,
            "mobile": false
        }
        log_entry(`Reporting station position ${lat},${lon},${alt}`, "light")
        const response = fetch("https://api.v2.sondehub.org/amateur/listeners", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(listener_body)
        }).then(response => {
            response.text().then(body => {
                log_entry("Reported station info: " + body, "info")
            })
        }).catch((error) => {
            log_entry("Error posting to sondehub: " + error.message, "danger")
        })
    }
}

globalThis.log_entry = function (message, level) {
    console.log(message)
    const rx_log = document.getElementById("rx_log");
    var log_entry = document.createElement("div");
    const _date = document.createElement("strong")
    _date.innerText = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
    log_entry.innerText = " " + message
    log_entry.classList.add("alert-" + level)
    log_entry.classList.add("alert")
    log_entry.prepend(_date)
    rx_log.prepend(log_entry)
}

globalThis.toggleBigImage = function (img) {
    if (this.tagName == "IMG"){
        if (this.parentNode.classList.contains("card-large-image")) {
            this.parentNode.classList.remove("card-large-image")
        } else {
            this.parentNode.classList.add("card-large-image")
        }
    } else {
        if (this.classList.contains("card-large-image")) {
            this.classList.remove("card-large-image")
        } else {
            this.classList.add("card-large-image")
        }
    }
   
}

globalThis.setPageTitle = function(title){
    document.getElementById("webtitle").textContent = title
    document.title = title
}

if (navigator.usb) {
    document.getElementById("radioRTL").removeAttribute("disabled")
    document.getElementById("radioWenet").removeAttribute("disabled")
    document.getElementById("wizard_rtlsdr").removeAttribute("disabled")

    if (navigator.userAgentData && navigator.userAgentData.platform == "Windows"){
        document.getElementById("wizard_windows_warning").classList.remove("d-none")
    }

    if (navigator.userAgentData && navigator.userAgentData.platform == "Linux"){
        document.getElementById("wizard_linux_warning").classList.remove("d-none")
    }

    // set defaults for wenet domain
    if (window.location.hostname == "wenet.sondehub.org" || window.location.hostname == "localhost"){
        document.getElementById("radioWenet").click()
        document.getElementById("rtl_freq").value = "443.5"
        globalThis.setPageTitle("webwenet")
    }
} 


globalThis.update_wenet = function(){
    if (globalThis.worker){
        start_wenet();
    }
}

globalThis.show_wizard = function(){
    if (window.location.hash.length > 1){
        var parm_string = window.location.hash.slice(1);
        var url_search_params = new URLSearchParams(parm_string)

        if (url_search_params.has('freq')){
            document.getElementById("wizard_freq").innerText=url_search_params.get("freq") + " MHz"
            document.getElementById("wizard_dial_freq").innerText=(parseFloat(url_search_params.get("freq"))-0.001).toFixed(3) + " MHz"
        } else {
            return
        }

        if (url_search_params.has('mode')){
            switch(url_search_params.get("mode")){
                case "horus":
                    document.getElementById("wizard_mode").innerText = "Horus Binary"
                    break;
                case "wenet_uart":
                    document.getElementById("wizard_soundcard").setAttribute("disabled","")
                    document.getElementById("wizard_mode").innerText = "Wenet Traditional"
                    if (!navigator.usb){
                        document.getElementById("wizard_no_usb").classList.remove("d-none")
                    }
                    break;
                case "wenet_i2s":
                    document.getElementById("wizard_soundcard").setAttribute("disabled","")
                    document.getElementById("wizard_mode").innerText = "Wenet v2"
                    if (!navigator.usb){
                        document.getElementById("wizard_no_usb").classList.remove("d-none")
                    }
                    break
                default:
                    return
            }
        } else {
            return
        }

        if (url_search_params.has('name')){
            document.getElementById("wizard_title").innerText  = url_search_params.get("name") + " - Configuration Wizard"
        }

        if (url_search_params.get("mode") == 'horus' && url_search_params.has('spacing')) {
            document.getElementById("wizard_tonespacing_enable").classList.remove("d-none")
            document.getElementById("wizard_tonespacing").innerText = url_search_params.get("spacing")
        } else if (url_search_params.get("mode") == 'horus'){
            document.getElementById("wizard_tonespacing_enable").classList.remove("d-none")
            document.getElementById("wizard_tonespacing").innerText = "270"
        }

        if (url_search_params.get("mode") == 'horus' && url_search_params.has('baud')) {
            document.getElementById("wizard_baud_enable").classList.remove("d-none")
            document.getElementById("wizard_baud").innerText = url_search_params.get("baud")
        } else if (url_search_params.get("mode") == 'horus'){
            document.getElementById("wizard_baud_enable").classList.remove("d-none")
            document.getElementById("wizard_baud").innerText = "100"
        }

        if(!document.getElementById("wizard_callsign").value){
            document.getElementById("wizard_callsign").value = "webhorus-" + Math.random().toString(36).slice(2, 8);
        }

        globalThis.wizard = new bootstrap.Modal(document.getElementById('wizard'), {})
        globalThis.wizard.show();
    }
}

globalThis.validateWizard = function(){
    if (document.getElementById("wizard_callsign").value){
        document.getElementById("wizard_start").removeAttribute("disabled")
        document.getElementById("wizard_callsign").classList.remove("is-invalid")
    } else {
        document.getElementById("wizard_start").setAttribute("disabled","")
        document.getElementById("wizard_callsign").classList.add("is-invalid")
    }
}

globalThis.saveWizard = function(){
    var parm_string = window.location.hash.slice(1);
    var url_search_params = new URLSearchParams(parm_string)

      switch(url_search_params.get("mode")){
        case "horus":
            if (document.getElementById("wizard_rtlsdr").checked){
                document.getElementById("radioRTL").click()
            } else {
                document.getElementById("radioAudio").click()
                localStorage.setItem("sound_adapter", document.getElementById("wizard_sound_devices").getElementsByClassName("active")[0].getAttribute("deviceid"))
            }
            break;
        case "wenet_uart":
            document.getElementById("radioWenet").click()
            document.getElementById("wenet_version").value=1
            break;
        case "wenet_i2s":
            document.getElementById("radioWenet").click()
            document.getElementById("wenet_version").value=2
            break
        default:
            return
    }

    document.getElementById("dial").value = (parseFloat(url_search_params.get("freq"))-0.001).toFixed(3)
    document.getElementById("rtl_freq").value = (parseFloat(url_search_params.get("freq"))-0.001).toFixed(3)

    if (url_search_params.get("mode") == 'horus' && url_search_params.has('spacing')) {
        document.getElementById("tone_spacing").value = url_search_params.get("spacing")
    } else if (url_search_params.get("mode") == 'horus'){
        document.getElementById("tone_spacing").value = "270"
    }

    if (url_search_params.get("mode") == 'horus' && url_search_params.has('baud')) {
        document.getElementById("baud").value = url_search_params.get("baud")
    } else if (url_search_params.get("mode") == 'horus'){
        document.getElementById("baud").value = "100"
    }

    document.getElementById("callsign").value =  document.getElementById("wizard_callsign").value 
    document.getElementById("uploader_antenna").value =  document.getElementById("wizard_antenna").value 
    document.getElementById("uploader_lat").value =  document.getElementById("wizard_uploader_lat").value 
    document.getElementById("uploader_lon").value =  document.getElementById("wizard_uploader_lon").value 
    document.getElementById("uploader_alt").value =  document.getElementById("wizard_uploader_alt").value 
    document.getElementById("uploader_radio").value =  document.getElementById("wizard_uploader_radio").value 
    document.getElementById("upload_sondehub").checked =  document.getElementById("wizard_upload_sondehub").checked 
    document.getElementById("uploader_position").checked =  document.getElementById("wizard_uploader_position").checked 

    document.getElementById("ppm").value =  document.getElementById("wizard_ppm").value 
    document.getElementById("gain").value =  document.getElementById("wizard_gain").value 
    document.getElementById("rtlbiast").checked =  document.getElementById("wizard_rtlbiast").checked 

    globalThis.wizard = undefined
    startAudio()
    
}

globalThis.setWizardSound = function(elm){
    document.getElementById("wizard_soundcard_label").innerText = this.innerText
    for(let x of document.getElementById("wizard_sound_devices").children){
        x.getElementsByTagName("a")[0].classList.remove("active")
    }
    this.classList.add("active")
    document.getElementById("wizard_rtlsdr").checked=false
    document.getElementById("wizard_soundcard").checked=true

    globalThis.validateWizard()
    document.getElementById("wizard_hidden").classList.remove("d-none")
    document.getElementById("wizard_receiver_model_input").classList.remove("d-none")
    
    

    var parm_string = window.location.hash.slice(1);
    var url_search_params = new URLSearchParams(parm_string)
    document.getElementById("wizard_instructions").innerText=`1. Set your receivers mode to USB (upper side band)
    2. Remove any filtering (NR, NB). If the radio has a "data" mode select that
    3. Set the frequency of the radio to ${(parseFloat(url_search_params.get("freq"))-0.001).toFixed(3)} MHz
    `
    document.getElementById("wizard_instructions").classList.remove("d-none")
    document.getElementById("wizard_rtl_config").classList.add("d-none")
}

globalThis.setWizardRTL = function(elm){
    globalThis.validateWizard()
    document.getElementById("wizard_hidden").classList.remove("d-none")
    document.getElementById("wizard_instructions").classList.add("d-none")
    document.getElementById("wizard_rtl_config").classList.remove("d-none")
    document.getElementById("wizard_receiver_model_input").classList.add("d-none")
}

globalThis.getWizardSoundDevices = function(){
    // check if we already have a setting
    var active_sound = document.getElementById("wizard_sound_devices").getElementsByClassName("active")
    var active_id
    if (active_sound.length > 0){
        active_id = document.getElementById("wizard_sound_devices").getElementsByClassName("active")[0].getAttribute("deviceid")
    }

   

    navigator.mediaDevices.getUserMedia({ audio: {} }).then((stream) => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            document.getElementById("wizard_sound_devices").innerHTML=""
            for (var index in devices) {
                if (devices[index].kind == 'audioinput') {
                    var snd_li = document.createElement("li")
                    var snd_opt = document.createElement("a")
                    snd_opt.classList.add("dropdown-item")
                    snd_opt.innerText = devices[index].label
                    snd_opt.setAttribute("deviceId", devices[index].deviceId)
                    if (active_id == devices[index].deviceId) {
                        snd_opt.classList.add("active")
                    }
                    snd_opt.onclick = globalThis.setWizardSound
                    snd_li.appendChild(snd_opt)
                    document.getElementById("wizard_sound_devices").appendChild(snd_li)
                }
            }
        }).catch((err)=>{
        var snd_li = document.createElement("li")
        snd_li.innerText = "Could not access sound"
        snd_li.classList.add("dropdown-item")
        document.getElementById("wizard_sound_devices").appendChild(snd_li)
    })
    }).catch((err)=>{
        var snd_li = document.createElement("li")
        snd_li.innerText = "Could not access sound"
        snd_li.classList.add("dropdown-item")
        document.getElementById("wizard_sound_devices").appendChild(snd_li)
    })
}

globalThis.updateZScaleFromBuffer = function() {
  const flat = globalThis.wfZ.flat();
  const sorted = [...flat].filter(Number.isFinite).sort((a,b)=>a-b);
  const p = q => sorted[Math.floor(q * (sorted.length - 1))];                  
  const p95 = p(0.95);                    
  const zmin = p95 - 15;
  const zmax = p95 + 2;

  globalThis.Plotly.restyle('spectrum', { 
        zmin: [zmin], 
        zmax: [zmax],
        x: [globalThis.filtered_x_values],
        y: [globalThis.wfY],
        z: [globalThis.wfZ],
    }, [0]);
}


globalThis.loadSettings();


settings_loaded = true
globalThis.pyodide = await loadPyodide();

loadMapPicker()
loadTrackMap()
init_python();
