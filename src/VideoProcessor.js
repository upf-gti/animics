import { LX } from 'lexgui';
import 'lexgui/extensions/VideoEditor.js';
import { MediaPipe } from "./Mediapipe.js";
import { UTILS } from './Utils.js';

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
        this.recordedVideo = null;
        this.canvasVideo = null; 
        
        this.createView();

        animics.mainArea.attach(this.processorArea);

        this.mediapipe = new MediaPipe(this.canvasVideo);
        this.mediapipe.onresults = ( results ) => this.updateSidePanel( results );
        
        this.disable();

        this.currentResolve = null;
    }

    /** Internal function */
    createView() {
        // main area of the video processor
        this.processorArea = new LX.Area({id: "processor-area", width: "100%", height: "100%"});
        //split main area. Left: video editor area, Right: helper/info panel (distance to the camera, blendhsapes' weights, etc)
        const [leftArea, rightArea] = this.processorArea.split({sizes:["75%","25%"], minimizable: true});
        // split left area. Top: video editor + selector. Bottom: buttons.
        const [remainingArea, bottomArea] = leftArea.split({sizes:["calc(100% - 80px)", null], minimizable: false, resize: false, type: "vertical"});
        const [topArea, videoEditorArea] = remainingArea.split({sizes:["10px", null], minimizable: false, resize: false, type: "vertical"});

        videoEditorArea.root.classList.add("content-center");
        // Add show/hide right panel button (expand/reduce panel area)
        const ob = videoEditorArea.addOverlayButtons([{
            selectable: true,
            selected: true,
            icon: "PanelLeftClose",
            name: "Estimator",
            callback: (v, e) => {
                if(this.processorArea.splitExtended) {
                    this.processorArea.reduce();
                }
                else {
                    this.processorArea.extend();
                }

                setTimeout( this.videoEditor.resize.bind(), 200 ); // extend & reduce have a transition of 0.1 seconds. Ensure last resize done is the real final size
            }
        }], {float: 'tvr'});        
        ob.buttons.Estimator.root.parentElement.style.zIndex = 101; // hack, videoEditor cropArea has zindex 100

        this.createVideoArea(videoEditorArea);
        this.createSidePanel(rightArea);

        // Capture panel buttons
        this.buttonsPanel = bottomArea.addPanel({id:"capture-buttons", width: "100%", height: "100%", style: {display: "flex", "flex-direction": "row", "justify-content": "center", "align-content": "flex-start", "flex-wrap": "wrap"}});  
        
        // return button
        const arrowButton = window.bbb = new LX.Button("ReturnToEditor",null, () => this.cancelProcess(), {
            icon: "ArrowLeftCircle",
            width: "3.5rem",
            height: "3.5rem",
            hideName: true,
            title: "Return to editor",
            className: 'overlay-left overlay-top',
            buttonClass: 'bg-none'
        })

        // hack to make the icon as big as the button. Nothing else was working
        let item = arrowButton.root.getElementsByTagName("svg")[0];
        while (item != arrowButton.root ){
            item.style.width = "100%";
            item.style.height = "100%";
            item = item.parentElement;
        }
        videoEditorArea.root.appendChild( arrowButton.root );
    }

    enable() {
        this.enabled = true;
        this.processorArea.root.classList.remove("hidden");
    }

    disable() {
        this.enabled = false;
        this.currentResolve = null;
        this.videoEditor.stopUpdates();
        this.mediapipe.stopVideoProcessing();
        // This already disables events
        this.processorArea.root.classList.add("hidden");

        this.recording = false;
        if( this.mediaRecorder ) {
            this.mediaRecorder.stop();
        }

        // destroys inputVideo camera stream, if any
        const inputVideo = this.inputVideo;
        inputVideo.pause();
        if( inputVideo.srcObject ) {
            inputVideo.srcObject.getTracks().forEach(a => a.stop());
        }
        inputVideo.srcObject = null;
    }

    /** Internal function */
    cancelProcess() {

        this.currentResolve( null );
        this.disable();
    }

    /** Internal function */
    createVideoArea( area ) {

        /* Create video area*/
        const videoArea = new LX.Area("video-area");        
        /* Add video editor with the video into the area*/
        const inputVideo = this.inputVideo = document.createElement("video");
        inputVideo.id = "inputVideo";
        inputVideo.classList.add("hidden");
        inputVideo.classList.add("mirror");
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
        canvasVideo.style.position = "absolute";
        canvasVideo.classList.add("border-animation");

        videoArea.attach(canvasVideo);
        videoArea.root.classList.add( "items-center" );
        // const [leftArea, rightArea] = area.split({sizes:["75%","25%"], minimizable: true});

        this.videoEditor = new LX.VideoEditor(area, {videoArea, inputVideo, crop: true, loop: true, controlsLayout: 1});
        this.videoEditor.hideControls();
        this.videoEditor.onResize = (size) => {
            let width = size[0];
            let height = size[1];
            let aspectRatio = recordedVideo.videoHeight / recordedVideo.videoWidth;
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
            recordedVideo.style.width = canvasVideo.style.width = width + "px";
            recordedVideo.style.height = canvasVideo.style.height = height + "px";

            // avoid mediapipe process frame until last resize
            if ( this._delayedProcessFrame ){
                clearTimeout( this._delayedProcessFrame );
            }
            this._delayedProcessFrame = setTimeout( () =>{
                this.mediapipe.processFrame(recordedVideo);
                delete this._delayedProcessFrame;
            }, 500 );
            
        }
        
        this.videoEditor.onVideoLoaded = async (video) => {
            // changing to trimming stage
            // stop any current video process ("#inputVideo") and start processing this one ("#recording") which does not need mirror in mediapipe
            UTILS.hideLoading();

            this.mediapipe.setOptions( { autoDraw: true } );
            if ( this.mediapipeOnlineEnabler ) { 
                this.mediapipe.processVideoOnline(video) //this.mode == "webcam"); 
            }            
        }

        // on mouse up of the croparea
        this.videoEditor.onCropArea = ( rect ) => {
            rect = {x: this.videoEditor.cropArea.normCoords.x,
                y: this.videoEditor.cropArea.normCoords.y, 
                width: this.videoEditor.cropArea.normCoords.w,
                height: this.videoEditor.cropArea.normCoords.h
            };
            this.mediapipe.cropRect = rect;
            if ( this.mediapipeOnlineEnabler ) { 
                this.mediapipe.processFrame(recordedVideo, rect);
            } 
        }
    }

    /** Internal function */
    createSidePanel(area, options = {}) {
        if ( this.sidePanel ){
            this.sidePanel.clear(); // remove signals from previous components
        }
        
        /* Create right panel */
        LX.makeContainer( ["auto", "50px"], "text-xl p-4", "Estimator", area );
        const panel = this.sidePanel = area.addPanel({ className: "p-4"});
            
        if(panel.root.id) {
            panel.addTitle(panel.root.id);
        }
        
        panel.addToggle("Preview Pose Estimation", true, (value, event) => {
            this.enableMediapipeOnline( value );
        }, {label: "", title: "Previewing the estimation has a great impact on performance. Disable it to get a smoother experience on less powerful devices.", skipReset: true, nameWidth: "50%"});
        
        // Create expanded AU info area    
        
        panel.branch("User positioning");
        panel.addTextArea(null, 'Position yourself centered on the image with the hands and troso visible. If the conditions are not met, reposition yourself or the camera.', null, { disabled: true, className: "auto", fitHeight: true }) 
        panel.addProgress('Distance to the camera', 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, id: 'progressbar-torso'});
        panel.addProgress('Left Hand visibility', 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, id: 'progressbar-lefthand'});
        panel.addProgress('Right Hand visibility', 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, id: 'progressbar-righthand'});
        panel.merge();

        panel.addSeparator();

        panel.branch("Blendshapes weights");
        const bs = ["BrowDownLeft", "BrowDownRight", "BrowInnerUp", "BrowOuterUpLeft", "BrowOuterUpRight", "CheekPuff", "CheekSquintLeft", "CheekSquintRight", "EyeBlinkLeft", "EyeBlinkRight", "EyeLookDownLeft", "EyeLookDownRight", "EyeLookInLeft", "EyeLookInRight", "EyeLookOutLeft", "EyeLookOutRight", "EyeLookUpLeft", "EyeLookUpRight", "EyeSquintLeft", "EyeSquintRight", "EyeWideLeft", "EyeWideRight", "JawForward", "JawLeft", "JawOpen", "JawRight", "MouthClose", "MouthDimpleLeft", "MouthDimpleRight", "MouthFrownLeft", "MouthFrownRight", "MouthFunnel", "MouthLeft", "MouthLowerDownLeft", "MouthLowerDownRight", "MouthPressLeft", "MouthPressRight", "MouthPucker", "MouthRight", "MouthRollLower", "MouthRollUpper", "MouthShrugLower", "MouthShrugUpper", "MouthSmileLeft", "MouthSmileRight", "MouthStretchLeft", "MouthStretchRight", "MouthUpperUpLeft", "MouthUpperUpRight", "NoseSneerLeft", "NoseSneerRight"];


        for( let i = 0; i < bs.length; i++ ) {
        
            const name = bs[i];
            panel.addProgress(name, 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, editable: options.editable, showNumber: options.showNumber, signal: "@on_change_au_" + name, className: "px-4"});
        }
        panel.root.style.maxHeight = "calc(100% - 57px)";
        panel.root.style.overflowY = "scroll";
        panel.root.style.flexWrap = "wrap";
        panel.merge();
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
            this.mediapipe.processVideoOnline( this.mediapipeOnlineVideo, { mirror: this.mediapipeOnlineVideo == this.inputVideo && this.mode == "webcam" } );
            this.canvasVideo.classList.remove("hidden");
        }
        else{
            this.mediapipe.stopVideoProcessing();
            this.canvasVideo.classList.add("hidden");
        }

        this.videoEditor.resizeCropArea( this.videoEditor.cropArea.normCoords.w, this.videoEditor.cropArea.normCoords.h, true ); // update hidden elements crop area 
    }

    /** Internal function
     * @param {{}} [options={}] enable_redo: true/false to add redo button
     */
    async createTrimArea( options = {} ) {
        // TRIM VIDEO - be sure that only the sign is recorded
        const recordedVideo = this.mediapipeOnlineVideo = this.recordedVideo;
        const canvasVideo = this.canvasVideo;
        const inputVideo = this.inputVideo;

        this.videoEditor.showCropArea();
        this.videoEditor.showControls();

        recordedVideo.classList.remove("hidden");
        inputVideo.classList.add("hidden");
        recordedVideo.style.width = canvasVideo.width + "px";
        recordedVideo.style.height = canvasVideo.height + "px";

        this.videoEditor.video = recordedVideo;
        await this.videoEditor.loadVideo();
        
        this.videoEditor.moveCropArea( 0, 0, true );
        this.videoEditor.resizeCropArea( 1, 1, true );
        
        this.buttonsPanel.clear();

        this.mediapipe.mirrorCanvas = false; // we want the raw video. The mirror was only to make it easy to record for the user

        if(options.enable_redo) {
            this.buttonsPanel.addButton(null, "Redo", async () => {
         
                this.recording = false;
                this.mediapipeOnlineVideo = this.inputVideo; 
    
                this.mediapipe.stopVideoProcessing();
                this.videoEditor.hideControls();
                this.prepareWebcamRecording();
    
            }, {id:"stop_capture_btn", width: "100px", icon: "RotateCcw", title: "Redo Video", buttonClass: "outline"});
        }

        this.buttonsPanel.addButton(null, "Convert to animation", async (v) => {
            canvasVideo.classList.remove("hidden");
            recordedVideo.classList.remove("hidden");
            
            this.buttonsPanel.clear();
            this.videoEditor.hideControls();
            
            const animation = await this.generateRawAnimation(recordedVideo, this.videoEditor.getTrimedTimes())
            
            this.videoEditor.unbind();
            this.processorArea.reduce();
            this.currentResolve(animation);
            this.currentResolve = null;
        }, {width: "auto", buttonClass: "primary"});//, {width: "100px"});

        this.videoEditor.resize();

    }

    /** Internal function */
    createCaptureArea() {
        this.buttonsPanel.clear();

        this.videoEditor.hideCropArea();
        
        // Remove border style
        const canvasVideo = this.canvasVideo;
        canvasVideo.classList.remove("active");
        canvasVideo.classList.remove("hidden");

        const inputVideo = this.inputVideo;
        inputVideo.classList.remove("hidden");
        inputVideo.classList.add("mirror");

        const recordedVideo = this.recordedVideo;
        recordedVideo.classList.add("hidden");
        recordedVideo.classList.remove("mirror");

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
                this.buttonsPanel.addButton(null, "Cancel", () => {
                    this.recording = false;
                    if( this.mediaRecorder ) {
                        this.mediaRecorder.stop();
                    }

                    this.createCaptureArea();

                }, {id:"stop_capture_btn", width: "100px", icon: "RotateCcw", title: "Cancel Recording", buttonClass: "outline"});

                this.buttonsPanel.addButton(null, "Stop", () => {
                    
                    this.mediapipe.stopVideoProcessing();
                    if( this.mediaRecorder ) {
                        this.mediaRecorder.stop();
                    }
                    else {
                        this.recording = false;
                    }
                }, {id:"stop_capture_btn", width: "100px", icon: "Stop@solid", title:"Stop Recording", buttonClass: "primary"});
            
            }
        }, {id:"start_capture_btn", width: "150px", buttonClass: "primary"});
      
    }

    /** Internal function */
    updateSidePanel( results ) {
        // update blendshape inspector both in capture and edition stages

        const {landmarksResults, blendshapesResults} = results;       

        if(landmarksResults) {
            this.sidePanel.get('Distance to the camera').onSetValue( landmarksResults.distanceToCamera ?? 0 );
            this.sidePanel.get('Left Hand visibility').onSetValue( landmarksResults.leftHandVisibility ?? 0 );
            this.sidePanel.get('Right Hand visibility').onSetValue( landmarksResults.rightHandVisibility ?? 0 );
        }        

        if( blendshapesResults ) {

            for( let i in blendshapesResults ) {                
                let value = blendshapesResults[i];
                value = value.toFixed(2);
                const widget = this.sidePanel.get(i);
                if( !widget ) {
                    continue;
                }
                widget.onSetValue(value);
            }
        }
    }
    
    /**
     * @description Processes an array of videos and generates the raw animations. Called from Animics.
     * @param {Array of File or URL} videos
    */
    async processVideos( videos ) {
        this.mode = "video";
        this.enable();

        const canvasVideo = this.canvasVideo;
        
        const animations = [];
        for(let i = 0; i < videos.length; i++) {
            UTILS.makeLoading(videos.length == 1 ? "Loading video..." : ("Loading video " + (i + 1) + "/ " + videos.length));
            // Redirect to trim area if only 1 video has to be processed. Otherwise, directly generate animation.
            const animation = await this.onLoadVideo( videos[i], videos.length == 1 );
            // If user cancelled process
            if( !animation ) {
                return null;
            }
            const cropRectCoords = this.videoEditor.cropArea.normCoords; 
           
            animation.rect = {
                left: cropRectCoords.x, 
                right: cropRectCoords.x + cropRectCoords.w, 
                top: cropRectCoords.y, 
                bottom: cropRectCoords.y + cropRectCoords.h, 
                width: cropRectCoords.w, 
                height: cropRectCoords.h
            };
            UTILS.hideLoading();
            animations.push( animation );
        }
        return animations;
    }

    /**
     * Internal function
     * @description Processes a single video with/out trim stage
     * @param {File or URL} videoFile 
     * @param {boolean} [trimStage=true] If true, it redirects to trim stage after loading the video. Otherwise, directly generates the animation data
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
        
        const promise = new Promise((resolve) => {
            this.currentResolve = resolve;
            
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
                    UTILS.makeLoading("Loading Pose Estimator...");
                    await this.mediapipe.init();
                }
                
                if(trimStage) {
                    // directly to trim stage
                    this.currentResolve = resolve;
                    this.createTrimArea( {enable_redo: false} );
                }
                else {
                    this.videoEditor.moveCropArea( 0, 0, true );
                    this.videoEditor.resizeCropArea( 1, 1, true );
                    const animation = await this.generateRawAnimation(video);
                    this.currentResolve(animation);
                    this.currentResolve = null;
                }
                

            } ).bind(video);
        })
        return promise;
    }
    
    /**
     * @description Generates raw animation given a video
     * @param { VideoElement } video 
     * @param { Object } [times={}] {start: , end:} Trimmed times
    */
    generateRawAnimation( video, times = {} ) {
        UTILS.makeLoading("Processing video [ " + video.name + " ]", 0.7 )

        const animationData = {
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
            let cropRectCoords = this.videoEditor.cropArea.normCoords;

            const rect = {x: cropRectCoords.x, y: cropRectCoords.y, width: cropRectCoords.w, height: cropRectCoords.h};

            this.mediapipe.processVideoOffline( video, { startTime: animationData.startTime, endTime: animationData.endTime, dt: animationData.dt, callback: () =>{
                animationData.landmarks = this.mediapipe.landmarks;
                animationData.blendshapes = this.mediapipe.blendshapes;
                animationData.rawData = this.mediapipe.rawData;
                
                this.inputVideo.onloadedmetadata = null;
             
                video.onloadedmetadata = null;
                video.onloadeddata = null;
                video.onended = null;
                video.autoplay = false;
                video.pause();
    
                resolve(animationData);
                UTILS.hideLoading();
    
            }, mirror: false /*animationData.live*/, rect} )
           
        })        
        return promise;    
    }
    
    /**
     * @description Creates and processes a webcam recorded video and generates a raw animation. Called from Animics.
    */
    async processWebcam() {
        this.mode = "webcam";

        if( !this.mediapipe.loaded ) {
            UTILS.makeLoading("Loading Pose Estimator...");
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

            try {
                await this.prepareWebcamRecording();
                
                const animation = await this.onWebcamCaptured();
                              
                // If user cancelled process
                if( !animation ) {
                    return null;
                }
                const cropRectNormCoords = this.videoEditor.cropArea.normCoords;
            
                animation.rect = {
                    left: cropRectNormCoords.x,
                    right: cropRectNormCoords.x + cropRectNormCoords.w,
                    top: cropRectNormCoords.y,
                    bottom: cropRectNormCoords.y + cropRectNormCoords.h,
                    width: cropRectNormCoords.w,
                    height: cropRectNormCoords.h
                };
                UTILS.hideLoading();
                return animation;              
            } 
            catch( error ) {
                on_error();
            }            
        }
        else {
            on_error();
        }
    }
    
    /** Internal function
     * @description Set the webcam stream to the video element and create the mediarecorder, enables mediapipe. Called from processWebcam() and on redo the capture.
    */
    async prepareWebcamRecording() {

        this.createCaptureArea();
        this.enable();

        const constraints = { video: true, audio: false, width: 1280, height: 720 };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const inputVideo = this.inputVideo; // this video will hold the camera stream
        const canvasVideo = this.canvasVideo; // this canvas will output image, landmarks (and edges)
        const recordedVideo = this.recordedVideo;

        if( !inputVideo.srcObject ) {
            inputVideo.srcObject = stream;
        }

        inputVideo.onloadedmetadata = ( (e) => {

            inputVideo.play();
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
        let onstop = null;
        if(this.mediaRecorder) {
            onstop = this.mediaRecorder.onstop;
        }
        this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm; codecs="vp8"'}); 
        this.mediaRecorder.onstop = onstop;
        // this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm; codecs="av01.2.19H.12.0.000.09.16.09.1"'});
        // this.mediaRecorder = new MediaRecorder(inputVideo.srcObject, {mimeType: 'video/webm'});
        this.recordedChunks = [];
            
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        }
    }

    /** Internal function
    * @description Processes a webcam video with/out trim stage
    * @param {boolean} [trimStage=true] If true, it redirects to trim stage after loading the video. Otherwise, directly generates the animation data
    */
    onWebcamCaptured( trimStage = true ) {
        const inputVideo = this.inputVideo; // this video will hold the camera stream
        const canvasVideo = this.canvasVideo; // this canvas will output image, landmarks (and edges)
        const recordedVideo = this.recordedVideo;

        return new Promise( resolve => {
            this.currentResolve = resolve;
            this.mediaRecorder.onstop = async (e) => {
            
                if( !this.recording ) {
                    return;
                }

                this.recording = false;
                recordedVideo.controls = false;
                recordedVideo.loop = true;
                
                const blob = new Blob(this.recordedChunks, { type: "video/webm" });
                const videoURL = URL.createObjectURL(blob);
                recordedVideo.src = videoURL;
                recordedVideo.name = "camVideo_" + Math.floor( performance.now()*1000 ).toString() + ".webm";

                canvasVideo.classList.remove("active");  
                            
                // destroys inputVideo camera stream, if any
                inputVideo.pause();
                if( inputVideo.srcObject ) {
                    inputVideo.srcObject.getTracks().forEach(a => a.stop());
                }
                inputVideo.srcObject = null;
                
                if(trimStage) {
                    // directly to trim stage

                    const anim = UTILS.makeLoading( "Generating video...");
                    anim.onfinish = () => {
                        this.currentResolve = resolve;
                        this.createTrimArea({enable_redo: true} );
                    }

                }
                else {
                    const animation = await this.generateRawAnimation(video);
                    this.currentResolve(animation);
                    this.currentResolve = null;
                }

                console.log("Stopped recording");
            }
            
            inputVideo.play();
        })
      }
}

export { VideoProcessor }