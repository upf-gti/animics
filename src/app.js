import { MediaPipe } from "./mediapipe.js";
import { KeyframeEditor, ScriptEditor } from "./editor.js";
import { VideoUtils } from "./video.js";
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';
import { LX } from 'lexgui';

class App {
    
    constructor() {
        
        // Helpers
        this.recording = false;
        this.startTime = 0;
        this.duration = 0;

        this.mediaRecorder = null
        this.chunks = [];
    }

    init( settings ) {

        settings = settings || {};
    
        const mode = settings.mode ?? 'script';

        switch(mode) {
            case 'capture': 
                this.editor = new KeyframeEditor(this, mode);
                this.onBeginCapture();
                break;
            case 'video': 
                this.video = settings.data;
                this.editor = new KeyframeEditor(this, "video");
                this.onLoadVideo( settings.data );
                break;
            case 'bvh': case 'bvhe':
                this.editor = new KeyframeEditor(this, "video");
                this.onLoadAnimation( settings.data );
                break;
            case 'bml': case 'json': case 'sigml': case 'script':
                this.editor = new ScriptEditor(this, 'script');
                this.onScriptProject( settings.data, mode );
                break;
            default:
                alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml', 'json'\n\tKeyframe animation: 'bvh', 'bvhe'");
                return;
                break;    
        }
        this.editor.init();
        window.addEventListener("resize", this.onResize.bind(this));
    }

    isRecording() {
        return this.recording;
    }

    setIsRecording( value ) {
        this.recording = !!value;
    }

    //Start mediapipe recording 
    onBeginCapture() {
        this.mediaRecorder = null;
        const on_error = (err = null) => {
            alert("Cannot access the camera. Check it is properly connected and not being used by any other application. You may want to upload a video instead.")
            console.error("Error  " + err.name + ": " + err.message);            
            window.location.reload();
        } 
        
        let that = this;
                
        // prepare the device to capture the video
        if (navigator.mediaDevices) {
            console.log("UserMedia supported");
                    
            let constraints = { "video": true, "audio": false, width: 1280, height: 720 };
            navigator.mediaDevices.getUserMedia(constraints)
            .then( (stream) => {

                let videoElement = document.getElementById("inputVideo"); // this video will hold the camera stream
                let videoCanvas = document.getElementById("outputVideo"); // this canvas will output image, landmarks (and edges)

                if(!videoElement.srcObject){ videoElement.srcObject = stream; }

                videoElement.addEventListener( "loadedmetadata", function (e) {
                    // this === videoElement
                    console.log(this.videoWidth)
                    console.log(this.videoHeight);
                    
                    let aspect = this.videoWidth/this.videoHeight;
                    
                    let height = 802;
                    let width = height*aspect;
                    
                    videoCanvas.width  = width;
                    videoCanvas.height = height;
                }, false );
                
                // setup mediarecorder but do not start it yet (setEvents deals with starting/stopping the recording)
                that.mediaRecorder = new MediaRecorder(videoElement.srcObject);
                that.chunks = [];
                
                that.mediaRecorder.ondataavailable = function (e) {
                    that.chunks.push(e.data);
                }

                that.mediaRecorder.onstop = function (e) {

                    let video = document.getElementById("recording");
                    video.controls = false;
                    video.loop = true;
                    
                    let blob = new Blob(that.chunks, { "type": "video/mp4; codecs=avc1" });
                    let videoURL = URL.createObjectURL(blob);
                    video.src = videoURL;
                    console.log("Recording correctly saved");
                }
                
                videoElement.play()
            })
            .catch( on_error );            
        }
        else {
            on_error();
        }
    
        // Run mediapipe to extract landmarks. Not recording yet, but providing feedback to the user
        MediaPipe.start( true, () => {
            this.setEvents(true);
            $('#loading').fadeOut();
            
        }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui));

    }

    onLoadVideo( videoFile ) {
        this.mediaRecorder = null;
        this.editor.mode = this.editor.eModes.video;
        this.setEvents();

        let url = "";
        if(typeof(videoFile) == 'string' && videoFile.includes("blob:"))
            url = videoFile;
        else
            url = URL.createObjectURL(videoFile);

        let videoElement = document.getElementById("inputVideo");
        videoElement.src = url;
        let video = document.getElementById("recording");
        video.src = url; 
        
        videoElement.addEventListener( "loadedmetadata", function (e) {
            // this === videoElement
            let videoCanvas = document.getElementById("outputVideo");
            
            let aspect = this.videoWidth/this.videoHeight;

            let height = 802;
            let width = height*aspect;

            videoCanvas.width  = width;
            videoCanvas.height = height;
        }, false );

        MediaPipe.start( false, () => {
            $('#loading').fadeOut();
        }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui) );
    }

    onRecordLandmarks(startTime, endTime) {

        let videoRec = document.getElementById("recording");

        // const updateFrame = (now, metadata) => {
            
        //     // Do something with the frame.
        //     const canvasElement = document.getElementById("outputVideo");
        //     const canvasCtx = canvasElement.getContext("2d");
    
        //     let landmarks = MediaPipe.landmarks; //[frame];
    
        //     canvasCtx.save();
        //     canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
        //     drawConnectors(canvasCtx, landmarks.PLM, POSE_CONNECTIONS,
        //                     {color: '#00FF00', lineWidth: 4});
        //     drawLandmarks(canvasCtx, landmarks.PLM,
        //                     {color: '#FF0000', lineWidth: 2});
        //     canvasCtx.restore();
            
        //     // Re-register the callback to be notified about the next frame.
        //     videoRec.requestVideoFrameCallback(updateFrame);
        // };
        // // Initially register the callback to be notified about the first frame.
        // videoRec.requestVideoFrameCallback(updateFrame);

        // Creates the scene and loads the animation
        this.editor.trimTimes = [startTime, endTime];
        this.editor.buildAnimation( {landmarks: MediaPipe.landmarks, blendshapes: MediaPipe.blendshapes} );
    }

    onLoadAnimation( animation ) {
        this.editor.startEdition();

        const name = animation.name;
        this.editor.clipName = name;
        this.editor.loadAnimation( animation );
    }

    onScriptProject(dataFile, mode) {
        
        if(dataFile)
        {
            const fr = new FileReader();
          
            fr.readAsText( dataFile );
            fr.onload = e => { 
                let data = e.currentTarget.result;
                if(mode == 'sigml') {
                    data = sigmlStringToBML(e.currentTarget.result);
                    data.behaviours = data.data;
                    delete data.data;
                } else {
                    data = JSON.parse(e.currentTarget.result);
                }
                let anim = data;
                this.editor.clipName = anim.name;
                this.editor.loadModel(anim);    
            };
    
        }
        else {
            this.editor.clipName = "";
            this.editor.loadModel();    
        }

        // this.editor.loadAnimation( animation );
    }

    setEvents(live) {

        // Adjust video canvas
        let captureDiv = document.getElementById("capture");
        $(captureDiv).removeClass("hidden");
        let videoCanvas = document.getElementById("outputVideo");
        let videoElement = document.getElementById("inputVideo");
        
        // configurate buttons
        let capture = document.getElementById("capture_btn");
        capture.onclick = () => {
            
            if (!this.recording) { // start video recording
                
                this.recording = true;

                if(!live) {
                    videoElement.loop = false;
                    videoElement.currentTime = 0;
                    videoElement.onended = () => {
                        capture.click(); // automatically end capture once video ended
                    }
                }

                capture.innerHTML = " <i class='fa fa-stop' style= 'margin:5px; font-size:initial;'></i>"//"Stop" + " <i class='bi bi-stop-fill'></i>"
                document.getElementById("select-mode").innerHTML = "";
                capture.classList.add("stop");
                videoCanvas.classList.add("active");

                MediaPipe.startRecording();
                if(this.mediaRecorder){ this.mediaRecorder.start(); }
                this.startTime = Date.now();
                console.log("Started recording");                
            }
            else { // stop video recording
                
                this.recording = false;

                if(!live) {
                    videoElement.onended = undefined;
                    videoElement.loop = true;
                }

                if(this.mediaRecorder){ this.mediaRecorder.stop(); }
                
                videoCanvas.classList.remove("active");  
                
                MediaPipe.stopRecording();
                let endTime = Date.now();
                this.duration = endTime - this.startTime;
                // Show modal to redo or load the animation in the scene

                this.processVideo(live, {blendshapesResults: MediaPipe.blendshapes, landmarksResults: MediaPipe.landmarks});

                // destroys inputVideo camera stream, if any
                videoElement.pause();
                if(videoElement.srcObject){
                    videoElement.srcObject.getTracks().forEach(a => a.stop());
                }
                videoElement.srcObject = null;
        
                console.log("Stopped recording");
            }
        };    
    }
    
    async processVideo(live, results) {
                       
        // TRIM VIDEO - be sure that only the sign is recorded
        let canvas = document.getElementById("outputVideo");

        let video = document.getElementById("recording");
        video.classList.remove("hidden");
        video.style.width = canvas.offsetWidth + "px";
        video.style.height = canvas.offsetHeight + "px";
        video.width = canvas.offsetWidth;
        video.height = canvas.offsetHeight;
        if(!live){
            video.style.cssText+= "transform: rotateY(0deg);\
                            -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(0deg); /* Firefox */"
        }
        // Hidde bottom buttons
        let capture = document.getElementById("capture_btn");
        capture.style.display = "none";
        capture.disabled = true;
        capture.classList.remove("stop");

        await VideoUtils.bind(video, canvas);
        VideoUtils.onSetTime = this.editor.updateCaptureDataTime.bind(this.editor, results);

        let trimBtn = document.getElementById("trim_btn");
        trimBtn.style.display = "block";
        let redoBtn = document.getElementById("redo_btn");
        redoBtn.style.display = "block";
    }


    async storeAnimation() {

        const innerStore = async () => {

            // CHECK THE INPUT FILE !!!!TODO!!!!
            let file = undefined;
            //If BML animation --> put languege
            LX.prompt("Have you finished editing your animation? Remember that uploading the animation to the database implies that it will be used in the synthesis of the 3D avatar used in SignON European project.", "Upload animation", (v) => this.editor.export("", v), {input: this.editor.clipName} ) 
            this.editor.gui.prompt = LX.prompt( "Have you finished editing your animation? Remember that uploading the animation to the database implies that it will be used in the synthesis of the 3D avatar used in SignON European project.", "Upload animation", async () => {
                // Check if are files loaded
                if (file) {
                    // Log the user
                    await this.FS.login();

                    // folder, data, filename, metadata
                    await this.FS.uploadData("animations", file, file.name || "animics animation", "");

                    // Log out the user
                    this.FS.logout();

                    // For now this is used in timeline_maanager
                    // refactor!!
                    window.storeAnimation = this.storeAnimation;
                }
                else {
                    console.log("Not upload. Not BVH found.");
   
                }

            this.editor.gui.prompt.close();
         }, {input: false})
    }


        this.editor.gui.prompt = LX.prompt( "Please, enter the name of the sign performed and the language. (Example: Dog in Irish Sign Language &#8594; dog_ISL)", "Animation name", async (name) => {
            if(name == "") {
                alert("You can't upload an animation without name");
                this.storeAnimation();
                return;
            }
            this.editor.clipName = name;
            
            await innerStore();

        }, { input:this.editor.clipName, title: "Sign Name", width: 350 } );
    }

    onResize() {
        this.editor.resize();
    }
}

export { App };