import { LX } from 'lexgui';
import { MediaPipe } from "./mediapipe.js";
import { UTILS } from './utils.js';

class VideoProcessor {
    constructor(animics) {
        this.ANIMICS = animics;
        
        // Helpers
        this.recording = false;
        this.mode = "video";
        this.enabled = false;

        // keyframe
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.mediapipeOnlineEnabler = true;
        this.mediapipeOnlineVideo = null; // pointer to current Video. Indicate whether it is in a stage that allows online mediapipe or not (null)

        this.inputVideo = null;
        this.recordingVideo = null;
        this.canvasVideo = null; 
        
        this.createView();

        animics.mainArea.attach(this.processorArea);

        this.mediapipe = new MediaPipe(this.canvasVideo);
        this.mediapipe.onresults = ( results ) => this.updateSidePanel( results );
        
        this.disable();
    }

    createView() {
        // main area of the video processor
        this.processorArea = new LX.Area({id: "processor-area", width: "100%", height: "100%"});
        //split main area. Left: video editor area, Right: helper/info panel (distance to the camera, blendhsapes' weights, etc)
        const [leftArea, rightArea] = this.processorArea.split({sizes:["75%","25%"], minimizable: true});
        // split left area. Top: video editor + selector. Bottom: buttons.
        const [topArea, bottomArea] = leftArea.split({sizes:["calc(100% - 80px)", null], minimizable: false, resize: false, type: "vertical"});
        this.menubar = topArea.addMenubar( m => {
            m.setButtonImage("Animics", "data/imgs/animics_logo.png", () => this.cancelProcess(), {float: "left"});   
        });
        // split top left area. Select area (top): video/webcam selector. Video editor area (bottom): video editor.
        const [selectArea, videoEditorArea] = topArea.split({sizes: ["80px", null], minimizable: false, resize: false, type: "vertical" });
        
        // Create input selector widget (webcam or video)
        this.createSelectorInput(selectArea);

        // Add show/hide right panel button (expand/reduce panel area)
        selectArea.addOverlayButtons([{
            selectable: true,
            selected: true,
            icon: "fa-solid fa-info",
            name: "Properties",
            callback: (v, e) => {
                if(this.processorArea.split_extended) {
                    this.processorArea.reduce();
                }
                else {
                    this.processorArea.extend();
                }
            }
        }], {float: 'tvr'});

        this.createVideoArea(videoEditorArea);
        this.createSidePanel(rightArea);

        // Capture panel buttons
        this.buttonsPanel = bottomArea.addPanel({id:"capture-buttons", width: "100%", height: "100%", style: {display: "flex", "flex-direction": "row", "justify-content": "center", "align-content": "flex-start", "flex-wrap": "wrap"}});  
    }

    enable() {
        this.enabled = true;
        this.processorArea.root.classList.remove("hidden");
    }

    disable() {
        this.enabled = false;
        this.videoEditor.stopUpdates();
        this.mediapipe.stopVideoProcessing();
        // This already disables events
        this.processorArea.root.classList.add("hidden");
    }

    cancelProcess() {

        this.ANIMICS.showEditor();
    }

    createSelectorInput(area) {
        const selectContainer = area.addPanel({id:"select-mode", height: "80px", weight: "50%"})

        selectContainer.sameLine();
        selectContainer.addComboButtons("Input:", [
            {
                value: 'webcam',
                id: 'webcam-input',
                callback: (value, event, name) => {
                    const inputEl = input.domEl.getElementsByTagName("input")[0];                    
                    inputEl.value = "";
                    input.domEl.classList.add("hidden");
                    if(this.mode == "webcam") {
                        return;
                    }
                    this.mode = "webcam";

                    if(this.videoEditor) {
                        this.videoEditor.unbind();
                        this.videoEditor.hideControls();
                    }
                    // TO DO
                    // this.editor.getApp().onBeginCapture();
                }
            },
            {
                value: 'video',
                id: 'video-input',
                callback: (value, event, name) => {
                    const inputEl = input.domEl.getElementsByTagName("input")[0];
                    input.domEl.classList.remove("hidden");
                    inputEl.value = "";
                    inputEl.click();
                    
                    this.mode = "video";
                }
            }
        ], { selected: this.mode, width: "180px" });

        const input = selectContainer.addFile( "File:", (value, event) => {

            if( !value ) { // user cancel import file
                this.mode = "webcam";
                document.getElementById("webcam-input").click();

                return;
            }

            if( !value.type.includes("video") ) {
                this.mode = "webcam";
                LX.message("Format not accepted");
                document.getElementById("webcam-input").click();

                return;
            }

            if( this.videoEditor ) {
                this.videoEditor.unbind();
                this.videoEditor.hideControls();
            }

            // delete camera stream 
            const inputVideo = this.inputVideo;
            inputVideo.pause();
            if( inputVideo.srcObject ) {
                inputVideo.srcObject.getTracks().forEach(a => a.stop());
            }
            inputVideo.srcObject = null;

            // load video
            if ( !Array.isArray( value ) ) {
                value = [value];
            }
            // TO DO
            // this.editor.getApp().onLoadVideos( value );

        }, { id: "video-input", placeholder: "No file selected", local: false, type: "buffer", read: false, width: "200px"} );
        
        selectContainer.endLine("center");
    }

    createVideoArea( area ) {

        /* Create video area*/
        const videoArea = new LX.Area("video-area");        
        /* Add video editor with the video into the area*/
        const inputVideo = this.inputVideo = document.createElement("video");
        inputVideo.id = "inputVideo";
        inputVideo.classList.add("hidden");
        inputVideo.classList.add("mirror");
        inputVideo.classList.add("border-animation");
        inputVideo.muted = true;
        videoArea.attach(inputVideo);

        /* Add the recording video in back in the area (hidden) */
        const recordedVideo = this.recordedVideo = document.createElement("video");
        recordedVideo.id = "recording";
        recordedVideo.classList.add("hidden");
        recordedVideo.muted = true;
        recordedVideo.style.position = "absolute";
        videoArea.attach(recordedVideo);
        
        /* Add the canvas where the Mediapipe results will be drawn*/
        const canvasVideo = this.canvasVideo = document.createElement("canvas");
        canvasVideo.id = "outputVideo";
        canvasVideo.classList.add("border-animation");
        canvasVideo.style.position = "absolute";
        videoArea.attach(canvasVideo);

        // const [leftArea, rightArea] = area.split({sizes:["75%","25%"], minimizable: true});

        this.videoEditor = new LX.VideoEditor(area, {videoArea, inputVideo})
        this.videoEditor.hideControls();
        this.videoEditor.onResize = (size) => {
            let width = size[0];
            let height = size[1];
            let aspectRatio = canvasVideo.height / canvasVideo.width;
            if(width != canvasVideo.width) {
                height = size[0] * aspectRatio;
                if(height > size[1])  {
                    height = size[1];
                    width = height / aspectRatio;
                }
            }
            else if (height != canvasVideo.height) {
                width = size[1] / aspectRatio;
                if(width > size[0])  {
                    width = size[0];
                    height = width * aspectRatio;
                }
            }
            canvasVideo.width  =  recordedVideo.width = width;
            canvasVideo.height =  recordedVideo.height = height;
            recordedVideo.style.width = width + "px";
            recordedVideo.style.height = height + "px";

            this.mediapipe.processFrame(recordedVideo);
        }
        
        this.videoEditor.onVideoLoaded = async (video) => {
            this.mediapipe.setOptions( { autoDraw: true } );
            if ( this.mediapipeOnlineEnabler ) { 
                this.mediapipe.processVideoOnline(video, this.mode == "webcam"); // stop any current video process ("#inputVideo") and start processing this one ("#recording")
            }            
        }
    }

    createSidePanel(area, options = {}) {
        /* Create right panel */
        const panel = this.sidePanel = area.addPanel({id:"Properties"});         
            
        if(panel.root.id) {
            panel.addTitle(panel.root.id);
        }

        panel.addTitle("Mediapipe");
        panel.addComboButtons(null, [
            {
                value: "On",
                callback: (v, e) => { this.enableMediapipeOnline(true); }
            },
            {
                value: "Off",
                callback: (v, e) => { this.enableMediapipeOnline(false); }
            }
        ], {selected: "On"});
                                

        // Create expanded AU info area    
        panel.addBlank();
        panel.addTitle("User positioning");
        panel.addTextArea(null, 'Position yourself centered on the image with the hands and troso visible. If the conditions are not met, reposition yourself or the camera.', null, { disabled: true, className: "auto" }) 
        
        panel.addProgress('Distance to the camera', 0, {min:0, max:1, id: 'progressbar-torso'});
        panel.addProgress('Left Hand visibility', 0, {min:0, max:1, id: 'progressbar-lefthand'});
        panel.addProgress('Right Hand visibility', 0, {min:0, max:1, id: 'progressbar-righthand'});
        
        panel.branch("Blendshapes weights");
        for( let name in this.ANIMICS.editor.mapNames ) {
    
            panel.addProgress(name, 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, editable: options.editable, showNumber: options.showNumber, signal: "@on_change_au_" + name});
        }
        panel.root.style.maxHeight = "calc(100% - 57px)";
        panel.root.style.overflowY = "scroll";
        panel.root.style.flexWrap = "wrap";
    }

    createTrimArea(resolve, options) {
        // TRIM VIDEO - be sure that only the sign is recorded
        const recordedVideo = this.mediapipeOnlineVideo = this.recordedVideo;
        const canvasVideo = this.canvasVideo;
        const inputVideo = this.inputVideo;

        this.videoEditor.video = recordedVideo;
        this.videoEditor.showControls();
        this.videoEditor._loadVideo();
        this.buttonsPanel.clear();

        recordedVideo.classList.remove("hidden");
        inputVideo.classList.add("hidden");
        
        recordedVideo.style.width = canvasVideo.width + "px";
        recordedVideo.style.height = canvasVideo.height + "px";

        this.buttonsPanel.addButton(null, "Convert to animation", async (v) => {
            canvasVideo.classList.remove("hidden");
            recordedVideo.classList.remove("hidden");
            
            this.buttonsPanel.clear();
            this.videoEditor.hideControls();
            
            const animation = await this.generateRawAnimation(recordedVideo, this.videoEditor.getTrimedTimes())
            
            this.videoEditor.unbind();
            this.processorArea.reduce();
            resolve(animation);
        }, {width: "auto", className: "captureButton colored"});//, {width: "100px"});

    }

    createCaptureAreea() {
        this.buttonsPanel.clear();
        
        // Remove border style
        const canvasVideo = this.canvasVideo;
        canvasVideo.classList.remove("active");
        canvasVideo.classList.remove("hidden");

        const inputVideo = this.inputVideo;
        inputVideo.classList.remove("hidden");

        const recordedVideo = this.recordedVideo;
        recordedVideo.classList.add("hidden");

        this.buttonsPanel.addButton(null, "Record", () => {
            // start video recording 
            if (!this.recording) {                   
                this.recording = true;

                if(this.mediaRecorder ) {
                    this.mediaRecorder.start();
                }
                console.log("Started recording");
                
                // Add border animation
                canvasVideo.classList.add("active");
                
                this.buttonsPanel.clear();
                this.buttonsPanel.addButton(null, "Stop", () => {
                    this.mediapipe.stopVideoProcessing();
                    if( this.mediaRecorder ) {
                        this.mediaRecorder.stop();
                    }
                    else {
                        this.recording = false;
                    }
                }, {id:"stop_capture_btn", width: "100px", icon: "fa-solid fa-stop", className: "captureButton colored"});
                
                this.buttonsPanel.addButton(null, "Cancel", () => {
                    this.recording = false;
                    if( this.mediaRecorder ) {
                        this.mediaRecorder.stop();
                    }

                    this.createCaptureAreea();

                }, {id:"stop_capture_btn", width: "100px", icon: "fa-solid fa-rotate-left", className: "captureButton colored"});
            }
        }, {id:"start_capture_btn", width: "100px", className: "captureButton colored"});
      
    }

    updateSidePanel( results ) {
        // update blendshape inspector both in capture and edition stages

        const {landmarksResults, blendshapesResults} = results;       

        if(landmarksResults) {
            this.sidePanel.get('Distance to the camera').onSetValue( landmarksResults.distanceToCamera ?? 0 );
            this.sidePanel.get('Left Hand visibility').onSetValue( landmarksResults.leftHandVisibility ?? 0 );
            this.sidePanel.get('Right Hand visibility').onSetValue( landmarksResults.rightHandVisibility ?? 0 );
        }        

        if( blendshapesResults ) {

            for(let i in blendshapesResults)
            {                
                let value = blendshapesResults[i];
                value = value.toFixed(2);
                const widget = this.sidePanel.get(i);
                if( !widget ) {
                    continue;
                }
                widget.onSetValue(value);
            // TO DO: emit @on_change_au_ + name
            }
        }
    }
        
    async processVideos(videos) {
        this.mode = "video";
        this.enable();

        const animations = [];
        for(let i = 0; i < videos.length; i++) {
            UTILS.makeLoading(videos.length == 1 ? "Loading video..." : ("Loading video " + (i + 1) + "/ " + videos.length));
            const animation = await this.onLoadVideo( videos[i], videos.length == 1 );
            UTILS.hideLoading();
            animations.push( animation );
        }
        return animations;
    }

    /**
     * @description Process single video with/out trim stage
     * @param {File or URL} videoFile 
    */
    onLoadVideo( videoFile, trimStage = true ) {
        if ( !videoFile ) { 
            return new Promise((resolve) => resolve()); 
        }

        let url = "";
        if( typeof(videoFile) == 'string' && videoFile.includes("blob:") )  {
            url = videoFile;
        }
        else {
            url = URL.createObjectURL(videoFile);
        }
       
        const video = this.mediapipeOnlineVideo = this.recordedVideo;
        video.src = url; 
        video.muted = true;

        // set video file name to dom element
        if ( videoFile.name ) {
            video.name = videoFile.name;
        }
        else {
            video.name = "video_" + Math.floor( performance.now()*1000 ).toString() + videoFile.type.replace("video/", "." );
        }
        
        // video.onloadedmetadata = ( function (e) {
        const promise = new Promise((resolve) => {
            video.onloadeddata = ( async (e) => {
            
                const aspect = video.videoWidth / video.videoHeight;
                
                video.classList.remove("hidden");
                const height = video.parentElement ? video.parentElement.clientHeight : video.parent.root.clientHeight;
                const width = height * aspect;
                
                const canvasVideo = this.canvasVideo;
                canvasVideo.width  = width;
                canvasVideo.height = height;
    
                video.style.width = width + "px";
                video.style.height = height + "px";

                if( !this.mediapipe.loaded ) {
                    UTILS.makeLoading("Loading MediaPipe...");
                    await this.mediapipe.init();
                }
                UTILS.hideLoading();
                
                if(trimStage) {
                    // directly to trim stage
                    this.createTrimArea( resolve );
                }
                else {
                    const animation = await this.generateRawAnimation(video);
                    resolve(animation);
                }
                

            } ).bind(video);
        })
        return promise;
    }

    generateRawAnimation( video, times = {} ) {
        UTILS.makeLoading("Processing video [ " + video.name + " ]", 0.7 )

        const videoObj = {
            name: video.name,
            videoURL: video.src,
            startTime: times.start || 0,
            endTime: times.end || video.duration,
            dt: 1/25,
            landmarks: null,
            blendshapes: null,
            live: this.mode == "webcam"
        }

        this.mediapipeOnlineVideo = null;

        this.mediapipe.setOptions( { autoDraw: true } );

        const promise = new Promise( resolve => {
            this.mediapipe.processVideoOffline( video, videoObj.startTime, videoObj.endTime, videoObj.dt, () =>{
                videoObj.landmarks = this.mediapipe.landmarks;
                videoObj.blendshapes = this.mediapipe.blendshapes;
    
                this.inputVideo.onloadedmetadata = null;
             
                video.onloadedmetadata = null;
                video.onloadeddata = null;
                video.onended = null;
                video.autoplay = false;
                video.pause();
    
                resolve(videoObj);
                UTILS.hideLoading();
    
            }, videoObj.live )
           
        })
        
        return promise;    
    }

    async processWebcam() {
        this.mode = "webcam";

        if( !this.mediapipe.loaded ) {
            UTILS.makeLoading("Loading MediaPipe...");
            await this.mediapipe.init();
            UTILS.hideLoading();
        }

        this.mediaRecorder = null;
        this.mediapipeOnlineVideo = this.inputVideo; 


        const on_error = (err = null) => {
            alert("Cannot access the camera. Check it is properly connected and not being used by any other application. You may want to upload a video instead.")
            console.error("Error  " + err.name + ": " + err.message);            
            window.location.reload();
        } 
        
        if( this.mediaRecorder && this.recording ) {
            this.mediaRecorder.stop();
            this.recording = false;
        }

        this.mediapipe.stopVideoProcessing();

        // prepare the device to capture the video
        if (navigator.mediaDevices) {
            console.log("UserMedia supported");
            UTILS.makeLoading("Loading webcam...");

            const constraints = { video: true, audio: false, width: 1280, height: 720 };
            try {
                this.createCaptureAreea();
                this.enable();
                
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                
                const inputVideo = this.inputVideo; // this video will hold the camera stream
                const canvasVideo = this.canvasVideo; // this canvas will output image, landmarks (and edges)
                const recordedVideo = this.recordedVideo;

                if( !inputVideo.srcObject ) {
                    inputVideo.srcObject = stream;
                }

                inputVideo.onloadedmetadata = ( (e) => {

                    console.log(inputVideo.videoWidth)
                    console.log(inputVideo.videoHeight);
                    
                    const aspect = inputVideo.videoWidth / inputVideo.videoHeight;
                    
                    const height = inputVideo.parentElement.clientHeight;
                    const width = height * aspect;

                    canvasVideo.width  =  recordedVideo.style.width = width;
                    canvasVideo.height =  recordedVideo.style.height = height;
                    this.enableMediapipeOnline( this.mediapipeOnlineEnabler );

                    UTILS.hideLoading();

                } );
                    
                // setup mediarecorder but do not start it yet (setEvents deals with starting/stopping the recording)
                // adding codec solves the "incorrect frames added at random times" issue
                this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm; codecs="vp8"'}); 
                // this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm; codecs="av01.2.19H.12.0.000.09.16.09.1"'});
                // this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm'});
                this.recordedChunks = [];
                    
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        this.recordedChunks.push(e.data);
                    }
                }
                return new Promise( resolve => {
                    this.mediaRecorder.onstop = (e) => {
                    
                        if( !this.recording ) {
                            return;
                        }

                        this.recording = false;
                        recordedVideo.controls = false;
                        recordedVideo.loop = true;
                        
                        let blob = new Blob(this.recordedChunks, { type: "video/webm" });
                        let videoURL = URL.createObjectURL(blob);
                        recordedVideo.src = videoURL;
                        recordedVideo.name = "camVideo_" + Math.floor( performance.now()*1000 ).toString() + ".webm";
    
                        canvasVideo.classList.remove("active");  
                                    
                        // destroys inputVideo camera stream, if any
                        inputVideo.pause();
                        if( inputVideo.srcObject ) {
                            inputVideo.srcObject.getTracks().forEach(a => a.stop());
                        }
                        inputVideo.srcObject = null;
                                            
                        // Trim stage. Show modal to redo or load the animation in the scene
                        this.createTrimArea( resolve );
    
                        console.log("Stopped recording");
                    }
                    
                    inputVideo.play();
                })
                
            } 
            catch( error ) {
                on_error();
            }            
        }
        else {
            on_error();
        }
    }

    // online Mediapipe might make the pc slow. Allow user to disable it. (video processing is not affected. It is offline Mediapipe)
    enableMediapipeOnline( bool ){
        // check app stage
        if ( !this.mediapipeOnlineVideo ) {
            this.mediapipeOnlineEnabler = false;
            return;
        }
        
        // still in video recording or trimming stages. Online toggle is allowed
        this.mediapipeOnlineEnabler = !!bool;
        if ( this.mediapipeOnlineEnabler ) {
            this.mediapipe.processVideoOnline( this.mediapipeOnlineVideo, this.mode == "webcam" )
            this.mediapipeOnlineVideo.classList.add("hidden");
            this.canvasVideo.classList.remove("hidden");
        }
        else{
            this.mediapipe.stopVideoProcessing();
            this.mediapipeOnlineVideo.classList.remove("hidden");
            this.canvasVideo.classList.add("hidden");
        }
    }
}

export { VideoProcessor }