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

        // keyframe
        this.mediaRecorder = null
        this.recordedChunks = [];
        this.mediapipeOnlineEnabler = true;
        this.mediapipeOnlineVideo = null; // pointer to current Video. Indicate whether it is in a stage that allows online mediapipe or not (null)
    }

    init( settings ) {

        settings = settings || {};
    
        const mode = settings.mode ?? 'script';
        let callback;
        switch(mode) {
            case 'capture': 
                this.editor = new KeyframeEditor(this, "CAPTURE");
                callback = this.onBeginCapture.bind(this);
                break;
            case 'video': 
                this.video = settings.data;
                this.editor = new KeyframeEditor(this, "VIDEO");
                callback = this.onLoadVideos.bind(this, settings.data );
                break;
            case 'bvh': case 'bvhe':
                this.editor = new KeyframeEditor(this, "VIDEO");
                callback = this.onLoadAnimations.bind(this, settings.data );
                break;
            case 'bml': case 'json': case 'sigml': case 'script':
                this.editor = new ScriptEditor(this, 'SCRIPT');
                callback = this.onScriptProject.bind(this, settings.data );
                break;
            default:
                alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml', 'json'\n\tKeyframe animation: 'bvh', 'bvhe'");
                return;
                break;    
        }
        this.editor.init(callback);
        window.addEventListener("resize", this.onResize.bind(this));
    }

    isRecording() {
        return this.recording;
    }

    setIsRecording( value ) {
        this.recording = !!value;
    }

    // online Mediapipe might make the pc slow. Allow user to disable it. (video processing is not affected. It is offline Mediapipe)
    enableMediapipeOnline( bool ){
        // check app stage
        if ( !this.mediapipeOnlineVideo ){ this.mediapipeOnlineEnabler = false; return; }
        
        // still in video recording or trimming stages. Online toggle is allowed
        this.mediapipeOnlineEnabler = !!bool;
        if ( this.mediapipeOnlineEnabler ) {
            MediaPipe.processVideoOnline( this.mediapipeOnlineVideo, this.editor.mode == this.editor.editionModes.CAPTURE )
            this.mediapipeOnlineVideo.classList.add("hidden");
            this.editor.gui.canvasVideo.classList.remove("hidden");
        }
        else{
            MediaPipe.stopVideoProcessing();
            this.mediapipeOnlineVideo.classList.remove("hidden");
            this.editor.gui.canvasVideo.classList.add("hidden");
        }
    }
        

    //Start mediapipe recording 
    onBeginCapture() {
        this.mediaRecorder = null;
        this.mediapipeOnlineVideo = this.editor.gui.inputVideo; 

        const on_error = (err = null) => {
            alert("Cannot access the camera. Check it is properly connected and not being used by any other application. You may want to upload a video instead.")
            console.error("Error  " + err.name + ": " + err.message);            
            window.location.reload();
        } 
        
        let that = this;

        // prepare the device to capture the video
        if (navigator.mediaDevices) {
            console.log("UserMedia supported");
            UTILS.makeLoading("Loading webcam...");

            let constraints = { video: true, audio: false, width: 1280, height: 720 };
            navigator.mediaDevices.getUserMedia(constraints)
            .then( (stream) => {

                let that = this;
                let videoElement = this.editor.gui.inputVideo; // this video will hold the camera stream
                let videoCanvas = this.editor.gui.canvasVideo; // this canvas will output image, landmarks (and edges)
                let videoRecording = this.editor.gui.recordedVideo;

                if(!videoElement.srcObject){ videoElement.srcObject = stream; }

                videoElement.onloadedmetadata = ( function(e) {
                    // this === videoElement
                    console.log(this.videoWidth)
                    console.log(this.videoHeight);
                    
                    let aspect = this.videoWidth/this.videoHeight;
                    
                    let height = videoElement.parentElement.clientHeight;
                    let width = height * aspect;
                    videoCanvas.width  =  videoRecording.style.width = width;
                    videoCanvas.height =  videoRecording.style.height = height;
                    
                    $('#loading').fadeOut();
                } ).bind(videoElement);
                
                // setup mediarecorder but do not start it yet (setEvents deals with starting/stopping the recording)
                // adding codec solves the "incorrect frames added at random times" issue
                that.mediaRecorder = new MediaRecorder(videoElement.srcObject, {mimeType: 'video/webm; codecs="vp8"'}); 
                // that.mediaRecorder = new MediaRecorder(videoElement.srcObject, {mimeType: 'video/webm; codecs="av01.2.19H.12.0.000.09.16.09.1"'});
                // that.mediaRecorder = new MediaRecorder(videoElement.srcObject, {mimeType: 'video/webm'});
                that.recordedChunks = [];
                
                that.mediaRecorder.ondataavailable = function (e) {
                    if (e.data.size > 0) {
                        that.recordedChunks.push(e.data);
                    }
                }

                that.mediaRecorder.onstop = function (e) {

                    let video = that.editor.gui.recordedVideo;
                    video.controls = false;
                    video.loop = true;
                    
                    let blob = new Blob(that.recordedChunks, { type: "video/webm" });
                    let videoURL = URL.createObjectURL(blob);
                    video.src = videoURL;
                    video.name = "camVideo_" + Math.floor( performance.now()*1000 ).toString() + ".webm";

                    videoCanvas.classList.remove("active");  
                                
                    // destroys inputVideo camera stream, if any
                    let inputVideo = that.editor.gui.inputVideo;
                    inputVideo.pause();
                    if( inputVideo.srcObject ){ inputVideo.srcObject.getTracks().forEach(a => a.stop()); }
                    inputVideo.srcObject = null;
                                       
                    // Trim stage. Show modal to redo or load the animation in the scene
                    that.videoToTrimStage(true, {blendshapesResults: MediaPipe.blendshapes, landmarksResults: MediaPipe.landmarks});

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

            this.editor.gui.startCaptureButtons(() => {
                if (!this.recording) { // start video recording
                    
                    this.recording = true;

                    if(this.mediaRecorder){ this.mediaRecorder.start(); }
                    console.log("Started recording");
                    this.editor.gui.stopCaptureButtons(() => {
                        this.recording = false;
                        MediaPipe.stopVideoProcessing();
                        if(this.mediaRecorder){ this.mediaRecorder.stop(); }
                    })
                }               
            })

            if ( this.mediapipeOnlineEnabler ){
                MediaPipe.processVideoOnline( this.editor.gui.inputVideo, this.editor.mode == this.editor.editionModes.CAPTURE );
            }
           
            
        }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui));

    }

    onLoadSingleVideo( videoFile ) {
        if ( !videoFile ){ 
            return; 
        }
        UTILS.makeLoading("Loading video...");

        let url = "";
        if(typeof(videoFile) == 'string' && videoFile.includes("blob:"))
            url = videoFile;
        else
            url = URL.createObjectURL(videoFile);

        // let videoElement = this.editor;
        // videoElement.src = url;
        this.mediapipeOnlineVideo = this.editor.gui.recordedVideo; 
        let video = this.editor.gui.recordedVideo;
        video.src = url; 
        video.muted = true;

        // set video file name to dom element
        if ( videoFile.name ){ video.name = videoFile.name; }
        else{ video.name = "video_" + Math.floor( performance.now()*1000 ).toString() + videoFile.type.replace("video/", "." ); }
        
        let that = this;
        // video.onloadedmetadata = ( function (e) {
        video.onloadeddata = ( function (e) {
            // this === videoElement
            let videoCanvas = that.editor.gui.canvasVideo;
            video.classList.remove("hidden");

            let aspect = this.videoWidth/this.videoHeight;
            
            // let height = 802;
            // let width = height*aspect;
            
            // videoCanvas.width  = width;
            // videoCanvas.height = height;
            
            let height = video.parentElement.clientHeight;
            let width = height*aspect;
            videoCanvas.width  = width;
            videoCanvas.height = height;

            video.style.width = width + "px";
            video.style.height = height + "px";

            MediaPipe.start( false, () => {
                // directly to trim stage
                that.videoToTrimStage( false, { blendshapesResults:[], landmarksResults:[] } );                
    
            }, that.editor.gui.updateCaptureGUI.bind(that.editor.gui) );
        } ).bind(video);
    }

    /**
     * 
     * @param {File} videos 
     */
    onLoadVideos( videoFiles ){
        if ( videoFiles && videoFiles.length == 1 ){
            this.onLoadSingleVideo(videoFiles[0]);
            return;
        }
        
        this.mediapipeOnlineVideo = null; // multiple-videos redirects to offline directly. No online mediapipe is required

        this.videoProcessingCommon = {
            onVideoProcessEndedFn: null,
            videosToProcess: [], // array of videoObj (same as in onVideoTrimmed)
            videosProcessed: 0
        };
        videoFiles = videoFiles ?? [];
        for( let i = 0; i < videoFiles.length; ++i ){
            let url = "";
            if(typeof(videoFiles[i]) == 'string' && videoFiles[i].includes("blob:")){
                url = videoFiles[i];
            }
            else {
                url = URL.createObjectURL(videoFiles[i]);
            }
    
            this.videoProcessingCommon.videosToProcess.push( {
                name: videoFiles[i].name,
                videoURL: url,
                startTime: 0,
                endTime: -1,
                dt: 1/25,
                landmarks: null,
                blendshapes: null,
                live: false // whether it is a recording from live input. Used to mirror canvas
            } );
        }

        // ------------- Show only the "processing video" elements -------------

        // // Hide capture buttons
        document.getElementById("select-mode").innerHTML = "";
        // let capture = document.getElementById("capture_btn");
        // capture.style.display = "none";
       
        if ( !this.videoProcessingCommon.videosToProcess.length ){
            let name = "NewAnimation_" + Math.floor(performance.now()).toString();
            this.editor.loadAnimation( name, null );
            this.editor.bindAnimationToCharacter( name );
            this.editor.startEdition();            
        }

        this.videoProcessingCommon.onVideoProcessEndedFn = () =>{
            let common = this.videoProcessingCommon;

            this.editor.buildAnimation( common.videosToProcess[common.videosProcessed] );
            common.videosProcessed++;
            if ( common.videosProcessed >= common.videosToProcess.length ) {
                let a = Object.keys( this.editor.loadedAnimations );
                // Creates the scene and loads the animation. Changes ui to edition

                let name = "";
                if ( !a.length ){
                    let name = "NewAnimation_" + Math.floor(performance.now()).toString();
                    this.editor.loadAnimation( name, null );
                }else{
                    name = a[0];
                }
                this.editor.bindAnimationToCharacter( name );
                this.editor.startEdition();
            }
            else {
                UTILS.makeLoading("Processing video " + (this.videoProcessingCommon.videosProcessed +1) + "/" + this.videoProcessingCommon.videosToProcess.length.toString(), 0.5 )
                this.processVideo( common.videosToProcess[common.videosProcessed], common.onVideoProcessEndedFn )
            }
        }
        
        UTILS.makeLoading("Loading Mediapipe", 1 )
        MediaPipe.start( false, () => {
            // directly to process stage
            UTILS.makeLoading("Processing video " + (this.videoProcessingCommon.videosProcessed+1) + "/" + this.videoProcessingCommon.videosToProcess.length.toString(), 0.5 )
            this.processVideo( this.videoProcessingCommon.videosToProcess[0], this.videoProcessingCommon.onVideoProcessEndedFn );
        }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui) );
        
    }

    // after video has been trimmed by VideoUtils and has been unbound
    onVideoTrimmed(startTime, endTime){
        this.mediapipeOnlineVideo = null; 
        
        const videoObj = {
            name: this.editor.gui.recordedVideo.name,
            videoURL: this.editor.gui.recordedVideo.src,
            startTime: startTime,
            endTime: endTime,
            dt: 1/25,
            landmarks: null,
            blendshapes: null,
            live: this.editor.mode == this.editor.editionModes.CAPTURE
        }


        UTILS.makeLoading("Processing video", 0.5 )
        this.processVideo( videoObj, () =>{
            this.editor.buildAnimation( videoObj );
            this.editor.bindAnimationToCharacter( videoObj.name );
            this.editor.startEdition();
        } )
    }

    /**
     * send video obj (custom obj) with name, url, start/end times so mediapipe can process it. 
     * @param {*} videoObj 
     * @param {*} onEnded 
     */
    processVideo( videoObj, onEnded = null ){ 
        this.mediapipeOnlineVideo = null; 
       
        let domVideo = this.editor.gui.recordedVideo;
        let that = this;
        domVideo.onloadedmetadata = ( function (e) {
            // this === videoElement
            let videoCanvas = that.editor.gui.canvasVideo;
            
            let aspect = this.videoWidth/this.videoHeight;

                    
            let height = domVideo.parentElement.clientHeight;
            let width = height * aspect;
            videoCanvas.width  = width;
            videoCanvas.height = height;

            domVideo.style.width  = width + "px";
            domVideo.style.height = height + "px";
            
        } ).bind(domVideo); 

        domVideo.onloadeddata = ( (videoObj, onEnded) =>{
            videoObj.endTime = videoObj.endTime < -0.001 ? domVideo.duration : videoObj.endTime;
            // stops any processVideoOnline (and offline) and starts processing video with these parameters
            MediaPipe.setOptions( { autoDraw: true } );
            MediaPipe.processVideoOffline( this.editor.gui.recordedVideo, videoObj.startTime, videoObj.endTime, videoObj.dt, () =>{
                videoObj.landmarks = MediaPipe.landmarks;
                videoObj.blendshapes = MediaPipe.blendshapes;
    
                this.editor.gui.inputVideo.onloadedmetadata = null;
                
                let videoRecording = this.editor.gui.recordedVideo;
                // undo any mirroring of the video
                videoRecording.style.cssText+= "transform: rotateY(0deg);\
                -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
                -moz-transform:rotateY(0deg); /* Firefox */"
                videoRecording.onloadedmetadata = null;
                videoRecording.onloadeddata = null;
                videoRecording.onended = null;
                videoRecording.autoplay = false;
                videoRecording.pause();

                if (onEnded){ 
                    onEnded(); 
                }

            }, videoObj.live )
        } ).bind( this, videoObj, onEnded );

        domVideo.src = videoObj.videoURL;

    }

    async videoToTrimStage(live, results) { 
        // TRIM VIDEO - be sure that only the sign is recorded
        this.mediapipeOnlineVideo = this.editor.gui.recordedVideo; 
        
        let captureDiv = document.getElementById("capture");
        $(captureDiv).removeClass("hidden");

        let canvas = this.editor.gui.canvasVideo;
        let video = this.editor.gui.recordedVideo;
        video.classList.remove("hidden");
        // video.style.width = canvas.offsetWidth + "px";
        // video.style.height = canvas.offsetHeight + "px";
        // video.width = canvas.offsetWidth;
        // video.height = canvas.offsetHeight;
       
        if(live) {
            video.style.cssText+= "transform: rotateY(180deg);\
                            -webkit-transform:rotateY(180deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(180deg); /* Firefox */"
        }
        else{
            video.style.cssText+= "transform: rotateY(0deg);\
                            -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(0deg); /* Firefox */"
        }
        
        // Replace GUI to trim interface
        this.editor.gui.createTrimArea(video, canvas, null, { 
            onSetTime: (t) => { 
            },
            onDraw: () => {
               
            },
            onVideoLoaded: async (v) => {
                // (re)start process video online but let VideoUtils manage the render
                MediaPipe.setOptions( { autoDraw: true } );
                if ( this.mediapipeOnlineEnabler ){ 
                    MediaPipe.processVideoOnline(video, this.editor.mode == this.editor.editionModes.CAPTURE); // stop any current video process ("#inputVideo") and start processing this one ("#recording")
                }
                $('#loading').fadeOut();
            }
        });
    }


    async onLoadAnimations( animationFiles ) {
        this.filesProcessed = 0;
        this.filesData = animationFiles;

        const innerErrorOnFileProcessing = (idx, e) => {
            console.warn( this.filesData[idx].name + " could not be processed correctly" );
            this.filesProcessed++; // this only works if NOT multi-threaded
        }

        const innerFileProcess = (idx, e) => { 
            const text = e.currentTarget.result;
            const file = this.filesData[idx];
            const extension = UTILS.getExtension(file.name).toLowerCase();
            let data = null;
            if(extension.includes('bvh')) {
                data = { skeletonAnim: this.editor.BVHloader.parse( text ) };
            }
            else {
                data = this.editor.BVHloader.parseExtended( text );
            }

            this.editor.loadAnimation( file.name, data );
            this.filesProcessed++; // this only works if NOT multi-threaded                    
        }

        // launch all file reads. TO DO: check if this explodes on multiple larges filereads. Check if synchronous one-at-a-time is better
        for( let i = 0; i < this.filesData.length; ++i){
            const fr = this.filesData[i].fr = new FileReader();                
            fr.readAsText( this.filesData[i] );
            fr.onabort = fr.onerror = innerErrorOnFileProcessing.bind(this, i); // just in case
            fr.onload = innerFileProcess.bind(this, i); // each file reader is assigned to its filesData index
        }

        // wait until every file has been read and loaded into the editor
        while(this.filesProcessed < this.filesData.length) {
            await new Promise(r => setTimeout(r, 500));            
        }        

        if (this.filesData.length == 0){
            let name = "Animation" + Math.floor(performance.now()).toString();
            this.editor.loadAnimation(name, null );
            this.editor.bindAnimationToCharacter(name);
        }else{
            this.editor.bindAnimationToCharacter(this.filesData[0].name)
        }
        this.editor.startEdition(!this.filesData.length);
    }

    
    async onScriptProject(scriptFiles) {
        if (!scriptFiles || !scriptFiles.length){
            let name = "New animation";
            this.editor.loadAnimation(name, null );
            this.editor.bindAnimationToCharacter(name);
            this.editor.startEdition(true);
            return;
        }

        this.filesProcessed = 0;
        this.filesData = scriptFiles;

        const innerErrorOnFileProcessing = (idx, e) => {
            console.warn( this.filesData[idx].name + " could not be processed correctly" );
            this.filesProcessed++; // this only works if NOT multi-threaded
        }

        const innerFileProcess = (idx, e) => { 
            let data = null;
            const file = this.filesData[idx];
            const extension = UTILS.getExtension(file.name).toLowerCase();
            
            try{
                if(extension == 'sigml') {
                    data = sigmlStringToBML(e.currentTarget.result);
                    data.behaviours = data.data;
                    delete data.data;
                } else {
                    data = JSON.parse(e.currentTarget.result);
                    if ( Array.isArray(data) ) {
                        data = { behaviours: data };
                    }
                }    
            } catch( error ){
                innerErrorOnFileProcessing(idx, error);
                return;
            }

            this.filesProcessed++; // this only works if NOT multi-threaded                    
            let animation = data;
            this.editor.loadAnimation( file.name, animation );
        }

        // launch all file reads. TO DO: check if this explodes on multiple larges filereads. Check if synchronous one-at-a-time is better
        for( let i = 0; i < this.filesData.length; ++i){
            const fr = this.filesData[i].fr = new FileReader();                
            fr.readAsText( this.filesData[i] );
            fr.onabort = fr.onerror = innerErrorOnFileProcessing.bind(this, i); // just in case
            fr.onload = innerFileProcess.bind(this, i); // each file reader is assigned to its filesData index
        }

        // wait until every file has been read and loaded into the editor
        while(this.filesProcessed < this.filesData.length) {
            await new Promise(r => setTimeout(r, 500));            
        }        

        this.editor.bindAnimationToCharacter(this.filesData[0].name)
        this.editor.startEdition(!this.filesData.length);
    }

    async storeAnimation() {

        const innerStore = async () => {

            // CHECK THE INPUT FILE !!!!TODO!!!!
            let file = undefined;
            //If BML animation --> put languege
            LX.prompt("Have you finished editing your animation? Remember that uploading the animation to the database implies that it will be used in the synthesis of the 3D avatar used in SignON European project.", "Upload animation", (v) => this.editor.export(null, "", v), {input: this.editor.clipName} ) 
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