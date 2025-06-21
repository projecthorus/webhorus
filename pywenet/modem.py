from _drs232_ldpc_cffi import ffi as drs232_ffi
from _drs232_ldpc_cffi.lib import MAX_ITER, CODELENGTH, NUMBERPARITYBITS, NUMBERROWSHCOLS, MAX_ROW_WEIGHT, MAX_COL_WEIGHT, H_rows, H_cols, sd_to_llr, run_ldpc_decoder
from _fsk_cffi import ffi
from _fsk_cffi.lib import fsk_create, fsk_demod_sd, fsk_nin, fsk_get_demod_stats, fsk_demod, fsk_create_hbr, fsk_set_est_limits
import enum
import logging
from crc import Calculator,  Configuration
import collections


BYTES_PER_PACKET = 256
CRC_BYTES = 2
PARITY_BYTES = 65



def crc16(data):
    calculator = Calculator(Configuration(
        16, 0x1021,0xffff
    ),True)
    return calculator.checksum(data)

class Modem():
    def __init__(self,
                 samplerate=115177*8,
                 symbolrate=115177,
                 P=None,
                 mode=2,
                 rs232_framing=True
                 ):

        if P == None:
            P = samplerate//symbolrate
        logging.debug(f"Samplerate: {samplerate}")
        logging.debug(f"Symbolrate: {symbolrate}")
        logging.debug(f"P: {P}")
        self.fsk = fsk_create_hbr(
            samplerate,
            symbolrate,
            P,
            mode,
            1200,
            400
        )
        
        self.drs232_ldpc = DRS232_LDPC(rs232_framing=rs232_framing)

    @property
    def nin(self):
        return fsk_nin(self.fsk)

    @property
    def nbits(self):
        return self.fsk.Nbits

    @property
    def stats(self):
        modem_stats = ffi.new("struct MODEM_STATS *")
        fsk_get_demod_stats(self.fsk, modem_stats)
        return modem_stats

    def demodulate(self, samples):
        if len(samples) != self.nin * 2 * 4:
            raise ValueError(
                "Expected data isn't long enough for what the modem is requesting")

        modbuf = ffi.from_buffer("COMP[]", samples)

        sdbuf = ffi.new("float[]", self.nbits)

        fsk_demod_sd(self.fsk, sdbuf, modbuf)
        


        packets = self.drs232_ldpc.write(sdbuf)
    
        return packets



class DRS232_STATE(enum.Enum):
    LOOK_FOR_UW = 0
    COLLECT_PACKET = 1


class DRS232_LDPC():
    def __init__(self, rs232_framing=True):
        self.ldpc = drs232_ffi.new("struct LDPC *")
        self.ldpc.max_iter = MAX_ITER
        self.ldpc.dec_type = 0
        self.ldpc.q_scale_factor = 1
        self.ldpc.r_scale_factor = 1
        self.ldpc.CodeLength = CODELENGTH
        self.ldpc.NumberParityBits = NUMBERPARITYBITS
        self.ldpc.NumberRowsHcols = NUMBERROWSHCOLS
        self.ldpc.max_row_weight = MAX_ROW_WEIGHT
        self.ldpc.max_col_weight = MAX_COL_WEIGHT
        self.ldpc.H_rows = H_rows
        self.ldpc.H_cols = H_cols
        self.state = DRS232_STATE.LOOK_FOR_UW
        self.bitbuffer = 0
        self.rs232_framing = rs232_framing
        if rs232_framing:
            self.bits_per_byte = 10
            # UW pattern we look for, including start/stop bits 
            self.uw = 0b0110101011010110011101111011110100000001
            self.uw_allowed_errors = 5
            self.uw_mask = pow(2,40)-1
            logging.debug("RS232 mode")
        else:
            self.bits_per_byte = 8
            self.uw = 0b10101011110011011110111100000001 # note this is reversed
            self.uw_allowed_errors = 4
            self.uw_mask  = pow(2,32)-1
            logging.debug("Native mode")
        self.symbols_per_packet = (BYTES_PER_PACKET+CRC_BYTES+PARITY_BYTES)*self.bits_per_byte

        
        self.symbol_buf_no_rs232 = [0.0]*self.symbols_per_packet
        self.symbol_buf= [0.0]*self.symbols_per_packet
        self.llr = drs232_ffi.new("float[]", self.symbols_per_packet)
        self.unpacked_packet = drs232_ffi.new("uint8_t[]", CODELENGTH)
        self.parityCheckCount = drs232_ffi.new("int *")
        self.packet = drs232_ffi.new("uint8_t[]", BYTES_PER_PACKET+CRC_BYTES)
        self.count_packet = 0
        self.count_packet_error = 0

    """Processes a bit"""
    def write(self, sdbuf):
        packets = []
        for symbol in sdbuf:

            if self.state == DRS232_STATE.LOOK_FOR_UW:
                bit = symbol < 0
                self.bitbuffer = (self.bitbuffer << 1 | bit) & self.uw_mask

                # check if we match uw
                errors = (self.bitbuffer ^ self.uw).bit_count()

                if errors <= self.uw_allowed_errors:
                    self.ind = 0
                    self.state = DRS232_STATE.COLLECT_PACKET
                    
                    logging.debug("Next state COLLECT_PACKET")
                continue
                    
            
            if self.state == DRS232_STATE.COLLECT_PACKET:
                self.symbol_buf[self.ind] = symbol
                self.ind += 1

                if self.ind == self.symbols_per_packet:
                    # enough bits, remove rs232 sync symbols
                    
                    if self.rs232_framing:
                        k=0
                        for i in range(0,self.symbols_per_packet,self.bits_per_byte):
                            for j in range(8):
                                self.symbol_buf_no_rs232[k+j] = self.symbol_buf[i+7-j+1]
                            k += 8
                    else:
                        self.symbol_buf_no_rs232 = self.symbol_buf
                    

                    sd_to_llr(self.llr, self.symbol_buf_no_rs232, CODELENGTH)
                    _iter = run_ldpc_decoder(self.ldpc, self.unpacked_packet, self.llr, self.parityCheckCount)

                    for i in range(BYTES_PER_PACKET+CRC_BYTES):
                        abyte = 0
                        for j in range(8):
                            abyte |= self.unpacked_packet[8*i+j] << (7-j)
                        self.packet[i] = abyte
                    
                    self.count_packet += 1
                    
                    _packet = bytes(ffi.buffer(self.packet))
                    rx_checksum = crc16(_packet[:BYTES_PER_PACKET]).to_bytes(2,"little")
                    tx_checksum = _packet[BYTES_PER_PACKET:BYTES_PER_PACKET+2]

                    if self.count_packet % 40 == 0:
                        logging.info(f"packets: {self.count_packet} packet_errors:{self.count_packet_error} PER: {self.count_packet_error/self.count_packet if self.count_packet > 0 else "."} iter: {_iter}")

                    self.state = DRS232_STATE.LOOK_FOR_UW
                    logging.debug("Next state LOOK_FOR_UW")
                    if (rx_checksum == tx_checksum):
                        logging.debug("rx packet")
                        packets.append(_packet)
                    else:
                        logging.debug("checksum failed")
                        logging.debug(rx_checksum)
                        logging.debug(tx_checksum)
                        self.count_packet_error += 1
        return packets