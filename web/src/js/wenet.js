import { Radio } from "@jtarrio/webrtlsdr/radio/radio";
import { RTL2832U_Provider } from "@jtarrio/webrtlsdr/rtlsdr/rtl2832u";
import { Demodulator } from "@jtarrio/webrtlsdr/demod/demodulator";
import { ComplexDownsampler } from "@jtarrio/webrtlsdr/dsp/resamplers";
import { concatenateReceivers } from "@jtarrio/webrtlsdr/radio/sample_receiver"

var axis_mapping = [];

var last_callsign;

var latency = 0;

function updatePlotsWenet(data) {
    var axis_ids = []
    var plot_data = []


    for (const [field_name, _value] of Object.entries(data)) {
        if (
            field_name != "checksum" &&
            field_name != "sequence_number" &&
            field_name != "payload_id" &&
            field_name != "longitude" &&
            field_name != "latitude"
        ) {
            if (last_callsign) {
                var field_name_payload = last_callsign + field_name 
                if (!(axis_mapping.includes(field_name_payload))) {
                    axis_mapping.push(field_name_payload)
                    globalThis.Plotly.addTraces('plots', { y: [], x: [], name: field_name_payload, mode: 'lines' })
                }
                var axis_id = axis_mapping.indexOf(field_name_payload)
                axis_ids.push(axis_id)
                plot_data.push([_value])
            }
        }

    }

    var plot_time = data.timestamp

    globalThis.Plotly.extendTraces('plots', { y: plot_data, x: [...Array(plot_data.length)].map(() => [plot_time]) }, axis_ids, 256)
}


function addFrameWeNet(data) {


    const fieldTable = document.createElement("table")
    fieldTable.classList = "table card-text"



    function toFixedIfNecessary(value, dp) {
        return +parseFloat(value).toFixed(dp);
    }

    for (const [_key, _value] of Object.entries(data)) {
        const field = document.createElement("tr")
        fieldTable.appendChild(field)
        const fieldName = document.createElement("th")
        field.appendChild(fieldName)
        const titleCase = (str) => str.replace(/\b\S/g, t => t.toUpperCase());
        fieldName.innerText = titleCase(_key.replace("_", " "))
        const fieldValue = document.createElement("td")
        if (_key == "latitude" || _key == "longitude") {
            const geoLink = document.createElement("a")
            geoLink.innerText = toFixedIfNecessary(parseFloat(_value), 4)
            geoLink.href = `geo:${data["latitude"]},${data["longitude"]}`
            fieldValue.appendChild(geoLink)
        } else {
            fieldValue.innerText = toFixedIfNecessary(parseFloat(_value), 4)

        }
        field.appendChild(fieldValue)


    }

    let card_div = document.getElementById("wenetgps")
    if (card_div == null) {
        const frames_div = document.getElementById("frames")
        const card = document.createElement("div")
        card.id = "wenetgps"
        card.classList = "card text-dark bg-light me-3"


        const cardTitle = document.createElement("div")
        cardTitle.classList = "card-header h6"
        cardTitle.innerText = data.timestamp
        card.appendChild(cardTitle)

        const cardBody = document.createElement("div")
        cardBody.classList = "card-body"
        card.appendChild(cardBody)


        cardBody.appendChild(fieldTable)
        frames_div.prepend(card)
    } else {
        const cardBody = card_div.getElementsByClassName("card-body")[0]
        cardBody.innerHTML = ""
        cardBody.appendChild(fieldTable)

        const cardTitle = card_div.getElementsByClassName("card-header")[0]
        cardTitle.innerText = data.timestamp
    }
}

function addImage(data, callsign, id) {
    last_callsign = callsign;
    let card_div = document.getElementById(callsign + "-" + id)
    const frames_div = document.getElementById("frames")
    if (card_div == null) {

        const card = document.createElement("div")
        card.id = callsign + "-" + id
        card.classList = "card text-dark bg-light me-3"
        const cardTitle = document.createElement("div")
        cardTitle.classList = "card-header h6"
        cardTitle.innerText = "[" + id + "] " + callsign
        card.appendChild(cardTitle)
        const cardBody = document.createElement("div")
        cardBody.classList = "card-body"
        cardBody.addEventListener("click", globalThis.toggleBigImage, false)
        card.appendChild(cardBody)
        const img = document.createElement("img")
        img.src = "data:image/jpeg;base64," + btoa(data.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        cardBody.appendChild(img)

        let telem_card = document.getElementById("wenetgps")
        if (telem_card) {
            telem_card.after(card)
        } else {
            frames_div.prepend(card)
        }

    } else {
        card_div.getElementsByClassName("card-body")[0].getElementsByTagName("img")[0].src = "data:image/jpeg;base64," + btoa(data.reduce((data, byte) => data + String.fromCharCode(byte), ''));
    }
    document.title = "webwenet - " + callsign
}

function addText(data) {
    log_entry(data, "primary")
}

var worker


var rtl

var last_sent

function getSampleRate(){
    if (document.getElementById("wenet_version").value == '1') {
        return 921416;
    } else if (document.getElementById("wenet_version").value == '2') {
        return 960000;
    }
    throw "Invalid Wenet version"
}

function getBaudRate(){
    if (document.getElementById("wenet_version").value == '1') {
        return 115177;
    } else if (document.getElementById("wenet_version").value == '2') {
        return 96000;
    }
    throw "Invalid Wenet version"
}

function start_wenet() {
    globalThis.spectrum_layout.shapes = []

    worker = new Worker(new URL('./wenet-worker.js', import.meta.url), { type: "module" });

    if (globalThis.audioContext) {
        globalThis.audioContext.suspend() // stop any running audio
    }
    if (globalThis.analyserUpdate){
        clearInterval(globalThis.analyserUpdate)
    }

    document.getElementById("alert").textContent = ""
    
   


    worker.onmessage = function (event) {
        if (event.data.type == "start") {
            console.log("wenet worker loaded - sending config")
            if (document.getElementById("wenet_version").value == "2"){
                var rs232_frame = false
                log_entry("Starting wenet in i2s mode")
            } else {
                var rs232_frame = true
                log_entry("Starting wenet in rs232 mode")
            }
            

            worker.postMessage({
                "config": {
                    "rs232_framing": rs232_frame,
                    "samplerate": getSampleRate(),
                    "baudrate": getBaudRate()
                }
            });
            return
        }
        if (event.data.type == "image") {
            addImage(...event.data.args)
            return
        }
        if (event.data.type == "log") {
            addText(event.data.args)
            return
        }
        if (event.data.type == "gps") {
            addFrameWeNet(event.data.args)
            updatePlotsWenet(event.data.args)
            if (last_callsign) {
                globalThis.updateMarker(
                    {
                        "payload_id": last_callsign,
                        "latitude": event.data.args.latitude,
                        "longitude": event.data.args.longitude,
                    }
                )
            }

            return
        }
        if (event.data.type == "snr") {
            globalThis.Plotly.extendTraces('snr', {
                y: [[event.data.args]],
                x: [[new Date().toISOString()]]
            }, [0], 256)
            return
        }
        if (event.data.type == "fft") {
            const fft = event.data.fft
            const spectrum_data = {
                y: [fft], 
                x: [[...Array(fft.length).keys()].map(x => ((x * (getSampleRate() / 2 / fft.length)) + (rtl.getFrequency())) / 1000 / 1000)]
            };
            globalThis.Plotly.update('spectrum',
                spectrum_data, globalThis.spectrum_layout
            )
            return
        }
        if (event.data.type == "time") {
            latency = new Date() - event.data.time
            document.getElementById("wenet_latency").innerText = latency + " ms"
            if (latency > 1000) {
                document.getElementById("wenet_latency").style.color = "red"
                document.getElementById("alert").textContent = "Can't keep up; Dropping samples"
            } else {
                document.getElementById("wenet_latency").style.color = "black"
                document.getElementById("alert").textContent = ""
            }

            if (event.data.time.getTime() == last_sent.getTime()) {
                // got the last message back, reset latency to 0 to reset any delay
                // this is a bit of a hack to keep slow clients working by only sending chunks (2s?) of RF to the modem
                latency = 0
            }

            return
        }
        if (event.data.type == "f_est") {
            globalThis.spectrum_layout.annotations = event.data.args.map(
                (x) => {
                    return {
                        x: (x + rtl.getFrequency()) / 1000 / 1000,
                        y: 0,
                        yref: "paper",
                        ayref: "paper",
                        ay: 1000,
                        showarrow: true,
                        arrowside: "none",
                        arrowwidth: 0.5,
                        arrowcolor: "grey"

                    }
                }
            )
            return
        }
        console.error("Unhandled message")
    }

    class wenet {
        constructor() {
            this.started = false
        }
        setSampleRate(rate) {
        }
        receiveSamples(I, Q, frequency) {

            var max = Math.max(...(I.map(x => Math.abs(x))), ...(Q.map(x => Math.abs(x))))
            var dBFS = 20 * Math.log10(max);
            globalThis.updatedbfs(dBFS)


            if (this.started == false || 
                (!(document.getElementById("audio_start").hasAttribute("disabled")) && document.getElementById("radioWenet").checked)) {
                document.getElementById("audio_start").setAttribute("disabled", "disabled");
                document.getElementById("audio_start").classList.add("btn-outline-success")
                document.getElementById("audio_start").innerText = "Running"
                this.started = true
            }

            if (latency < 2000) {

                var buffer = []
                for (var x = 0; x < I.length; x++) {
                    buffer.push(I[x]);
                    buffer.push(Q[x]);
                }

                last_sent = new Date()

                var sh;

                if (document.getElementById("upload_sondehub").checked){
                    sh = {}
                    sh.uploader_callsign = document.getElementById("callsign").value
                    sh.uploader_radio = document.getElementById("uploader_radio").value
                    sh.uploader_antenna = document.getElementById("uploader_antenna").value
                    sh.software_name = "webhorus"
                    sh.software_version = `${globalThis.VERSION} ${navigator.userAgent}`
                }
                if (document.getElementById("uploader_position").checked 
                && document.getElementById("uploader_lat").value 
                &&  document.getElementById("uploader_lon").value
                && document.getElementById("uploader_alt").value){
                    sh.uploader_position = [
                        parseFloat(document.getElementById("uploader_lat").value),
                        parseFloat(document.getElementById("uploader_lon").value),
                       parseFloat(document.getElementById("uploader_alt").value)
                    ]
                }

                worker.postMessage({
                    "buffer": buffer,
                    "time": last_sent,
                    "sh": sh,
                    "freq": rtl.getFrequency()
                })
            }


        }
        andThen(next) {
            return concatenateReceivers(this, next)
        }

    }

    if (!(rtl)) {
        rtl = new Radio(
            new RTL2832U_Provider(),
            new wenet(),
            getSampleRate(), // sample rate
        )

        rtl.addEventListener("radio", (e) => console.log(e.detail.exception));
    }

    rtlFreq()
    updateGain()
    updatePPM()
    updateBiasT()

    rtl.start()

}

function updateBiasT() {
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

document.getElementById("rtlbiast").addEventListener("change",()=>{
    updateBiasT()
})


function updatePPM() {
    const ppm = parseFloat(document.getElementById("ppm").value)
    if (rtl) {
            rtl.setFrequencyCorrection(ppm)
            log_entry(`Setting RTL PPM: ` + ppm, "light")
    }
}

function updateGain() {
    const gain = parseFloat(document.getElementById("gain").value)
    if (gain == -0.5) {
        document.getElementById("gaindb").value = `Auto gain control`
    } else {
        document.getElementById("gaindb").value = `${gain} dB`
    }
    if (rtl) {
        if (gain == -0.5) {
            rtl.setGain(null)
            log_entry(`Setting RTL Gain: agc`, "light")
        } else {
            rtl.setGain(gain)
            log_entry(`Setting RTL Gain: ${gain}`, "light")
        }
    }
}
document.getElementById("gain").addEventListener("change",()=>{
    updateGain()
})
document.getElementById("ppm").addEventListener("change",()=>{
    updatePPM()
})

function rtlFreq() {
    const rtl_freq = (document.getElementById("rtl_freq").value * 1000000) - (getBaudRate() * (8/4 - 0.25)/1)
    
    
    if (rtl) {
        rtl.setFrequency(rtl_freq)
        log_entry(`Setting RTL Freq: ${rtl_freq}`, "light")
    }
}
document.getElementById("rtl_freq").addEventListener("change",()=>{
    rtlFreq()
})

function stop_wenet() {
    if (rtl){
        rtl.stop()
    }
    if (worker){
        worker.terminate()
        worker = undefined
    
        document.getElementById("audio_start").removeAttribute("disabled");
        document.getElementById("audio_start").classList.remove("btn-outline-success")
        document.getElementById("audio_start").innerText = "Start"
        document.getElementById("dbfs").classList = "progress-bar"
        document.getElementById("dbfs").style.width = "0%"
        document.getElementById("dbfstext").innerText = "-999 dBFS"
    }

}



export { start_wenet, stop_wenet }