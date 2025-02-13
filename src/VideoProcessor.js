import { LX } from 'lexgui';

class VideoProcessor {
    constructor(animics) {
        this.ANIMICS = animics;

        this.webcamArea = new LX.Area({id: "webcam-area", width: "100%", height: "100%"});
        this.videoArea = new LX.Area({id: "video-area", width: "100%", height: "100%"});
        
    }
}

export { VideoProcessor }