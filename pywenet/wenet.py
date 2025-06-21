from .modem import Modem
from .ssdv import SSDV
import logging
from rx import WenetPackets
from rx.WenetPackets import WENET_PACKET_TYPES, packet_to_string, ssdv_packet_info, ssdv_packet_string
import traceback
import base64
class Wenet():
    def __init__(self, samplerate=115177*8, partialupdate=1, rs232_framing=True, baudrate=115177):
        logging.debug(f"Sample rate: {samplerate}")
        logging.debug(f"Baudrate {baudrate}")
        if rs232_framing:
            self.wenet = Modem(samplerate,baudrate)
        else:
            logging.debug("Starting modem for i2s")
            self.wenet = Modem(samplerate,baudrate,rs232_framing=False)
            
        self.current_image = -1
        self.current_callsign = ""
        self.current_text_message = -1
        self.current_packet_count = 0
        self.img_data = SSDV()


        self.partialupdate=partialupdate
        self.upload_buffer = []
        

    
    @property
    def nin(self):
        return self.wenet.nin
    
    def log_packet(self, packet):
        logging.debug(packet_to_string(packet))
        return packet_to_string(packet)
    def write(self,data: bytes):
        packets = self.wenet.demodulate(data)
        if packets:
            for packet in packets:
                    
                # try:
                    packet = packet[:-2] # remove crc
                    packet_type = WenetPackets.decode_packet_type(packet)
                    if packet_type == WENET_PACKET_TYPES.IDLE:
                        continue
                    elif packet_type == WENET_PACKET_TYPES.TEXT_MESSAGE:
                        return ["log",self.log_packet(packet)]
                        
                    elif packet_type == WENET_PACKET_TYPES.SEC_PAYLOAD_TELEMETRY:
                        self.log_packet(packet)
                    elif packet_type == WENET_PACKET_TYPES.GPS_TELEMETRY: # this goes to sondehub
                        logging.debug(WenetPackets.gps_telemetry_decoder(packet))
                        return(["gps",WenetPackets.gps_telemetry_decoder(packet)])
                    elif packet_type == WENET_PACKET_TYPES.ORIENTATION_TELEMETRY:
                        return ["log",self.log_packet(packet)]
                    elif packet_type == WENET_PACKET_TYPES.IMAGE_TELEMETRY:
                        return ["log",self.log_packet(packet)]

                    elif packet_type == WENET_PACKET_TYPES.SSDV:
                        packet_info = ssdv_packet_info(packet)
                        packet_as_string = ssdv_packet_string(packet)
                        return_image= None

                        if packet_info['error'] != 'None':
                            logging.error(packet_info['error'])
                            continue
                        self.upload_buffer.append(base64.b64encode(packet).decode('ascii')) # this really should be decoupled from here but its an easy solution for the moment


                        if (packet_info['image_id'] != self.current_image) or (packet_info['callsign'] != self.current_callsign) :
                            # Attempt to decode current image if we have enough packets.
                            logging.debug("New image - ID #%d" % packet_info['image_id'])
                            if self.current_packet_count > 0:

                                image_output = self.img_data.image
                                return_image = ["image", [image_output, self.current_callsign, self.current_image, self.upload_buffer]]
                                
                                self.img_data = SSDV()
                            else:
                                logging.debug("Not enough packets to decode previous image.")

                            # Now set up for the new image.
                            self.current_image = packet_info['image_id']
                            self.current_callsign = packet_info['callsign']
                            self.current_packet_count = 1

                            self.img_data = SSDV()
                            self.img_data.add_packet(packet)

                        else:
                            self.img_data.add_packet(packet)
                            self.current_packet_count += 1

                            if self.current_packet_count % self.partialupdate == 0:

                                image_output = self.img_data.image
                                return_image = ["image", [image_output, self.current_callsign, self.current_image, self.upload_buffer]]
                                self.upload_buffer = []
                        if return_image:
                            return return_image
                # except KeyboardInterrupt:
                #     raise KeyboardInterrupt
                # except:
                #     logging.error("Error while processing packet")
                #     print(traceback.format_exception())