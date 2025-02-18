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
        this.mediaRecorder = null
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
        this.buttonsArea = bottomArea.addPanel({id:"capture-buttons", width: "100%", height: "100%", style: {display: "flex", "flex-direction": "row", "justify-content": "center", "align-content": "flex-start", "flex-wrap": "wrap"}});        
     
        this.webcamArea = new LX.Area({id: "webcam-area", width: "100%", height: "100%"});
        this.videoArea = new LX.Area({id: "video-area", width: "100%", height: "100%"});        
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

    createVideoArea(area) {

        /* Create video area*/
        const videoArea = new LX.Area("video-area");        
        /* Add video editor with the video into the area*/
        const inputVideo = this.inputVideo = document.createElement("video");
        inputVideo.id = "inputVideo";
        inputVideo.classList.add("hidden");
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
            if ( this.mediapipeOnlineEnabler ){ 
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
                callback: (v, e) => { window.global.app.enableMediapipeOnline(true); }
            },
            {
                value: "Off",
                callback: (v, e) => { window.global.app.enableMediapipeOnline(false); }
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
        const video = this.mediapipeOnlineVideo = this.recordedVideo;
        
        this.videoEditor.video = video;
        this.videoEditor.showControls();
        this.videoEditor._loadVideo();
        this.buttonsArea.clear();

        video.classList.remove("hidden");

       
        // if( live ) {
        //     video.style.cssText+= "transform: rotateY(180deg);\
        //                     -webkit-transform:rotateY(180deg); /* Safari and Chrome */\
        //                     -moz-transform:rotateY(180deg); /* Firefox */"
        // }
        // else {
        //     video.style.cssText+= "transform: rotateY(0deg);\
        //                     -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
        //                     -moz-transform:rotateY(0deg); /* Firefox */"
        // }

        // video.style.cssText+= "transform: rotateY(0deg);\
        //                     -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
        //                     -moz-transform:rotateY(0deg); /* Firefox */"

        // this.videoEditor.onSetTime = options.onSetTime;
        // this.videoEditor.onDraw = options.onDraw;

        
        this.recordedVideo.style.width = this.canvasVideo.width + "px";
        this.recordedVideo.style.height = this.canvasVideo.height + "px";

        this.buttonsArea.addButton(null, "Convert to animation", async (v) => {
            this.canvasVideo.classList.remove("hidden");
            this.recordedVideo.classList.remove("hidden");
            const animation = await this.generateRawAnimation(this.recordedVideo, this.videoEditor.getTrimedTimes())
            //TO DO
            this.videoEditor.hideControls();
            this.processorArea.extend();
            resolve(animation);
            // this.videoArea.sections[1].root.resize(["20%", "20%"])
        }, {width: "auto", className: "captureButton colored"});//, {width: "100px"});

        // if( this.mode == "webcam" ) {
        //     this.buttonsArea.addButton(null, "Redo", (v) => {
        //         this.videoEditor.hideControls();
        //         let videoRec = this.recordedVideo;
        //         videoRec.classList.add("hidden");
        //        // TO DO
        //         // this.editor.getApp().onBeginCapture();
        //     }, {width: "50px", icon: "fa-solid fa-rotate-left", className: "captureButton"});
        // }
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
                    UTILS.hideLoading();
                }

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
}

export { VideoProcessor }