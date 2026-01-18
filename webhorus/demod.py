import _horus_api_cffi
import argparse
import datetime
import horusdemodlib.payloads
import horusdemodlib.decoder
import horusdemodlib.utils
import traceback
import logging

horusdemodlib.decoder.horusdemodlib.payloads.HORUS_PAYLOAD_LIST = horusdemodlib.payloads.init_payload_id_list()
horusdemodlib.decoder.horusdemodlib.payloads.HORUS_CUSTOM_FIELDS = horusdemodlib.payloads.init_custom_field_list()
from horusdemodlib.delegates import fix_datetime

from dataclasses import dataclass

horus_api = _horus_api_cffi.lib

SNR_SAMPLES = 10


def stuct_to_dict(data):
    try:
        if data.__module__ == '_cffi_backend':
            data = list(data)
            data = [ 
                x
                if type(x).__module__ != '_cffi_backend'
                else stuct_to_dict(x) 
                for x in data
            ]
            return data
    except:
        pass
    return {
        x: data.__getattribute__(x)
        if type(data.__getattribute__(x)).__module__ != '_cffi_backend'
        else stuct_to_dict(data.__getattribute__(x)) 
        for x in dir(data)
    }

@dataclass
class Frame():
    data: bytes
    crc_pass: bool
    stats: dict

class Demod():
    def __init__(
            self,
            libpath=f"",
            mode=horus_api.HORUS_MODE_BINARY_V1,
            rate=100,
            tone_spacing=-1,
            stereo_iq=False,
            verbose=False,
            callback=None,
            sample_rate=48000,
            freq_est_lower=100,
            freq_est_upper=4000
    ):
        self.stereo_iq = stereo_iq
        self.snr_samples = []

        for x in range(8,50):
            if (sample_rate/rate)%x == 0:
                p = x
                print(f"Found P value: {p}")
                break
        else:
            raise("Could not find suitable P value")

        # open modem
        self.hstates = horus_api.horus_open_advanced_sample_rate(
            mode, rate, tone_spacing, sample_rate, p
        )

        horus_api.horus_set_freq_est_limits(self.hstates,freq_est_lower,freq_est_upper)

        # set verbose
        horus_api.horus_set_verbose(self.hstates, verbose)

    @property
    def sample_rate(self):
        return horus_api.horus_get_Fs(self.hstates)

    @property
    def max_demod_in(self):
        return horus_api.horus_get_max_demod_in(self.hstates)
    @property
    def max_ascii_out(self):
        return horus_api.horus_get_max_ascii_out_len(self.hstates)
    
    @property
    def mfsk(self):
        return horus_api.horus_get_mFSK(self.hstates)
    
    @property
    def nin(self):
        return horus_api.horus_nin(self.hstates)
    
    @property
    def crc_ok(self):
        return horus_api.horus_crc_ok(self.hstates)
    
    @property
    def modem_stats(self):
        stats = _horus_api_cffi.ffi.new("struct MODEM_STATS *")
        horus_api.horus_get_modem_extended_stats(self.hstates, stats)
        return stuct_to_dict(stats)
    
    @property
    def mode(self):
        mode = horus_api.horus_get_mode(self.hstates)
        return mode
    
    @property
    def packet_version(self):
        return self.hstates.version

    @property
    def snr(self):
        return max(self.snr_samples)

    # in case someone wanted to use `with` style. I'm not sure if closing the modem does a lot.
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def close(self) -> None:
        """
        Closes Horus modem.
        """
        horus_api.horus_close(self.hstates)

    def demodulate(self, audio_in):
        audio_id_data = _horus_api_cffi.ffi.new("char[]",audio_in)
        data_in = _horus_api_cffi.ffi.cast( # cast bytes to short
            "short *",
            audio_id_data
        )
        data_out = _horus_api_cffi.ffi.new("char[]", self.max_ascii_out)
        valid = horus_api.horus_rx(
            self.hstates,
            data_out,
            data_in,
            self.stereo_iq
        )
        data_out_bytes = bytes(_horus_api_cffi.ffi.buffer(data_out))
        crc = bool(self.crc_ok)
        data_out_bytes = data_out_bytes.split(b"\x00")[0]
        if self.mode not in [
            horus_api.HORUS_MODE_RTTY_7N1,
            horus_api.HORUS_MODE_RTTY_7N2,
            horus_api.HORUS_MODE_RTTY_8N2,
        ]:
            try:
                data_out_bytes = bytes.fromhex(data_out_bytes.decode("ascii"))
            except ValueError:
                logging.debug(data_out_bytes)
                pass


        self.snr_samples.append(self.modem_stats['snr_est'])
        self.snr_samples = self.snr_samples[-SNR_SAMPLES:]
        if valid:
            return Frame(
                data=data_out_bytes,
                crc_pass=crc,
                stats=self.modem_stats
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
                    prog='horus demod')
    parser.add_argument('filename') 
    args = parser.parse_args()

    from pprint import pprint
    with Demod() as demod:
        with open(args.filename, "rb") as f:
            while audio_in := f.read(demod.nin*2):
                data = demod.demodulate(audio_in)
                if data and data.crc_pass:
                    print("---")
                    try:
                        packet = horusdemodlib.decoder.decode_packet(
                            data.data
                        )
                        pprint(packet)
                        pprint(horusdemodlib.utils.telem_to_sondehub(packet,check_time=False))
                    except:
                        print(data.data)
                        print(traceback.format_exc())
                    
                    
                    