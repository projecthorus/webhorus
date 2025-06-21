import logging
from .wenet import Wenet
# for showing the image
import cv2
import numpy as np
 
import time

logging.basicConfig()
logging.getLogger().setLevel(logging.INFO)

cv2.namedWindow("img", cv2.WINDOW_NORMAL)

def show_image(image_output):
    cv2.imshow("img",cv2.imdecode(np.frombuffer(image_output,dtype=np.uint8),cv2.IMREAD_COLOR))
    cv2.waitKey(1) 
def gps(data):
    print(data)


# rtl_sdr -f 443300000 -s 960000 -g 1 - | csdr convert_u8_f > ~/Downloads/test2.bin

wenet = Wenet(
    960000, partialupdate=50, rs232_framing=False
    )

#wenet = Wenet()

#with open("/Users/mwheeler/Downloads/wenet_921416_threshold_decode.f32","rb") as f:
with open("/Users/mwheeler/Downloads/test2.bin","rb") as f:
    while data := f.read(wenet.nin*2*4):
        output = wenet.write(data)
        if output:
            if output:
                print(output[0])
                if output[0] == 'image':
                    show_image(output[1][0])
