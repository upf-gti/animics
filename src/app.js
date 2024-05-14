import { MediaPipe } from "./mediapipe.js";
import { KeyframeEditor, ScriptEditor } from "./editor.js";
import { VideoUtils } from "./video.js";
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';
import { LX } from 'lexgui';
import { UTILS } from "./utils.js";

class App {
    
    constructor() {
        
        // Helpers
        this.recording = false;

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
                    video.autoplay = true;
                    video.name = "camVideo_" + Math.floor( performance.now()*1000 ).toString() + ".mp4";

                    videoCanvas.classList.remove("active");  
                                
                    // destroys inputVideo camera stream, if any
                    let inputVideo = document.getElementById("inputVideo");
                    inputVideo.pause();
                    if( inputVideo.srcObject ){ inputVideo.srcObject.getTracks().forEach(a => a.stop()); }
                    inputVideo.srcObject = null;
                                       
                    // Show modal to redo or load the animation in the scene
                    that.processVideo(true, {blendshapesResults: MediaPipe.blendshapes, landmarksResults: MediaPipe.landmarks});

                    console.log("Stopped recording");
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
            MediaPipe.processVideoOnline( document.getElementById("inputVideo") );
            $('#loading').fadeOut();
            
        }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui));

    }

    onLoadVideo( videoFile ) {
        this.mediaRecorder = null;
        this.editor.mode = this.editor.eModes.video;

        let url = "";
        if(typeof(videoFile) == 'string' && videoFile.includes("blob:"))
            url = videoFile;
        else
            url = URL.createObjectURL(videoFile);

        // let videoElement = document.getElementById("inputVideo");
        // videoElement.src = url;
        let video = document.getElementById("recording");
        video.src = url; 
        video.muted = true;

        // set video file name to dom element
        if ( videoFile.name ){ video.name = videoFile.name; }
        else{ video.name = "video_" + Math.floor( performance.now()*1000 ).toString() + videoFile.type.replace("video/", "." ); }
        
        let that = this;
        video.addEventListener( "loadedmetadata", function (e) {
            // this === videoElement
            let videoCanvas = document.getElementById("outputVideo");
            
            let aspect = this.videoWidth/this.videoHeight;

            let height = 802;
            let width = height*aspect;

            videoCanvas.width  = width;
            videoCanvas.height = height;

            MediaPipe.start( false, () => {
                that.processVideo( false, { blendshapesResults:[], landmarksResults:[] } );
                $('#loading').fadeOut();
    
            }, that.editor.gui.updateCaptureGUI.bind(that.editor.gui) );
        }, false );

    }

    // after video has been trimmed by VideoUtils and has been unbinded
    onVideoTrimmed(startTime, endTime){
        const videoObj = {
            name: document.getElementById("recording").name,
            videoBlob: document.getElementById("recording").src,
            startTime: startTime,
            endTime: endTime,
            dt: 1/25,
            landmarks: null,
            blendshapes: null,
        }

        // Hide trim stage buttons
        let trimBtn = document.getElementById("trim_btn");
        trimBtn.classList.add("hidden");
        let redoBtn = document.getElementById("redo_btn");
        redoBtn.classList.add("hidden");


        // stops any processVideoOnline and starts processing video with these parameters
        UTILS.makeLoading("Processing video", 0.5 )
        MediaPipe.setOptions( { autoDraw: true } );
        MediaPipe.processVideoOffline( document.getElementById("recording"), videoObj.startTime, videoObj.endTime, videoObj.dt, () =>{
            videoObj.landmarks = MediaPipe.landmarks;
            videoObj.blendshapes = MediaPipe.blendshapes;

            document.getElementById("recording").style.cssText+= "transform: rotateY(0deg);\
            -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
            -moz-transform:rotateY(0deg); /* Firefox */"
    
            // Creates the scene and loads the animation. Changes ui to edition
            this.editor.trimTimes = [videoObj.startTime, videoObj.endTime];
            this.editor.buildAnimation( {landmarks: videoObj.landmarks, blendshapes: videoObj.blendshapes} );
        } )
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
        //TODO move to beginCapture
        
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

                capture.innerHTML = " <i class='fa fa-stop' style= 'margin:5px; font-size:initial;'></i>"//"Stop" + " <i class='bi bi-stop-fill'></i>"
                document.getElementById("select-mode").innerHTML = "";
                capture.classList.add("stop");
                videoCanvas.classList.add("active");

                if(this.mediaRecorder){ this.mediaRecorder.start(); }
                console.log("Started recording");                
            }
            else { // stop video recording
                
                this.recording = false;
                MediaPipe.stopVideoProcessing();
                if(this.mediaRecorder){ this.mediaRecorder.stop(); }
                
                
            }
        };    
    }
    
    async processVideo(live, results) {
        let captureDiv = document.getElementById("capture");
        $(captureDiv).removeClass("hidden");

        // TRIM VIDEO - be sure that only the sign is recorded
        let canvas = document.getElementById("outputVideo");

        let video = document.getElementById("recording");
        video.classList.remove("hidden");
        video.style.width = canvas.offsetWidth + "px";
        video.style.height = canvas.offsetHeight + "px";
        video.width = canvas.offsetWidth;
        video.height = canvas.offsetHeight;
        video.play();
        if(live){
            video.style.cssText+= "transform: rotateY(180deg);\
                            -webkit-transform:rotateY(180deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(180deg); /* Firefox */"
        }else{
            video.style.cssText+= "transform: rotateY(0deg);\
                            -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(0deg); /* Firefox */"
        }

        // Hide capture buttons
        document.getElementById("select-mode").innerHTML = "";
        let capture = document.getElementById("capture_btn");
        capture.style.display = "none";
        capture.disabled = true;
        capture.classList.remove("stop");
    
        // draw mediapipe results with trimming buttons on top.
        await VideoUtils.bind(video, canvas, ()=>{
            // (re)start process video online
            MediaPipe.setOptions( { autoDraw: false } );
            MediaPipe.processVideoOnline(video); // stop any current video process ("#inputVideo") and start processing this one ("#recording")

            // Show trim stage buttons
            let trimBtn = document.getElementById("trim_btn");
            trimBtn.style.display = "block";
            let redoBtn = document.getElementById("redo_btn");
            redoBtn.style.display = "block";

        });
        VideoUtils.onSetTime = this.editor.updateCaptureDataTime.bind(this.editor, results);
        VideoUtils.onRender = () => { if ( MediaPipe.currentVideoProcessing ){ MediaPipe.drawCurrentResults(); } }

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