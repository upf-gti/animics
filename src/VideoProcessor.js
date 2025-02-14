import { LX } from 'lexgui';
import { MediaPipe } from "./mediapipe.js";

class VideoProcessor {
    constructor(animics) {
        this.ANIMICS = animics;
        // Helpers
        this.recording = false;

        // keyframe
        this.mediaRecorder = null
        this.recordedChunks = [];
        this.mediapipeOnlineEnabler = true;
        this.mediapipeOnlineVideo = null; // pointer to current Video. Indicate whether it is in a stage that allows online mediapipe or not (null)

        this.mode = "video";

        this.processorArea = new LX.Area({id: "processor-area", width: "100%", height: "100%"});
        const [leftArea, rightArea] = this.processorArea.split({sizes:["75%","25%"], minimizable: true});

        const [topArea, bottomArea] = leftArea.split({sizes:["calc(100% - 80px)", null], minimizable: false, resize: false, type: "vertical"});
        const [selectArea, videoEditorArea] = topArea.split({sizes: ["80px", null], minimizable: false, resize: false, type: "vertical" });
        
        // Create input selector widget (webcam or video)
        this.createSelectorInput(selectArea);

        // Add show/hide right panel button
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
        
        animics.mainArea.attach(this.processorArea);

        this.enabled = false;
    }

    processVideos(videos) {
        this.mode = "video";
        this.enable();
        return this.onLoadVideos( videos );
    }

    enable() {
        this.enabled = true;
        this.processorArea.root.classList.remove("hidden");
    }

    disable() {
        this.enabled = false;
        // This already disables events
        this.processorArea.root.classList.add("hidden");
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

            MediaPipe.processFrame(recordedVideo);
        }
        
        this.videoEditor.onVideoLoaded = async (video) => {
            MediaPipe.setOptions( { autoDraw: true } );
            if ( this.mediapipeOnlineEnabler ){ 
                MediaPipe.processVideoOnline(video, this.mode == "webcam"); // stop any current video process ("#inputVideo") and start processing this one ("#recording")
            }
            $('#loading').fadeOut();
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

        video.style.cssText+= "transform: rotateY(0deg);\
                            -webkit-transform:rotateY(0deg); /* Safari and Chrome */\
                            -moz-transform:rotateY(0deg); /* Firefox */"

        // this.videoEditor.onSetTime = options.onSetTime;
        // this.videoEditor.onDraw = options.onDraw;

        
        this.recordedVideo.style.width = this.canvasVideo.width + "px";
        this.recordedVideo.style.height = this.canvasVideo.height + "px";

        this.buttonsArea.addButton(null, "Convert to animation", (v) => {
            const {start, end} = this.videoEditor.getTrimedTimes();
            this.canvasVideo.classList.remove("hidden");
            this.recordedVideo.classList.remove("hidden");
            //TO DO
            // window.global.app.onVideoTrimmed(start, end)
            this.videoEditor.hideControls();
            this.processorArea.extend();
            resolve();
            // this.videoArea.sections[1].root.resize(["20%", "20%"])
        }, {width: "auto", className: "captureButton colored"});//, {width: "100px"});

        if(this.mode == "webcam") {
            this.buttonsArea.addButton(null, "Redo", (v) => {
                this.videoEditor.hideControls();
                let videoRec = this.recordedVideo;
                videoRec.classList.add("hidden");
               // TO DO
                // this.editor.getApp().onBeginCapture();
            }, {width: "50px", icon: "fa-solid fa-rotate-left", className: "captureButton"});
        }
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

    /**
     * 
     * @param {File} videos 
     */
    onLoadVideos( videoFiles ){
        if ( videoFiles && videoFiles.length == 1 ) {
            return this.onLoadSingleVideo(videoFiles[0]);
        }
        
        this.mediapipeOnlineVideo = null; // multiple-videos redirects to offline directly. No online mediapipe is required

        this.videoProcessingCommon = {
            onVideoProcessEndedFn: null,
            videosToProcess: [], // array of videoObj (same as in onVideoTrimmed)
            videosProcessed: 0
        };

        videoFiles = videoFiles ?? [];
        for( let i = 0; i < videoFiles.length; ++i ) {
            let url = "";
            if( typeof(videoFiles[i]) == 'string' && videoFiles[i].includes("blob:") ) {
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
        return new Promise((resolve) => {
            resolve();
        })
        // ------------- Show only the "processing video" elements -------------

        // // Hide capture buttons
        // document.getElementById("select-mode").innerHTML = "";
        // // let capture = document.getElementById("capture_btn");
        // // capture.style.display = "none";
       
        // if ( !this.videoProcessingCommon.videosToProcess.length ){
        //     let name = "NewAnimation_" + Math.floor(performance.now()).toString();
        //     this.editor.loadAnimation( name, null );
        //     this.editor.bindAnimationToCharacter( name );
        //     this.editor.startEdition();            
        // }

        // this.videoProcessingCommon.onVideoProcessEndedFn = () =>{
        //     let common = this.videoProcessingCommon;

        //     this.editor.buildAnimation( common.videosToProcess[common.videosProcessed] );
        //     common.videosProcessed++;
        //     if ( common.videosProcessed >= common.videosToProcess.length ) {
        //         let a = Object.keys( this.editor.loadedAnimations );
        //         // Creates the scene and loads the animation. Changes ui to edition

        //         let name = "";
        //         if ( !a.length ){
        //             let name = "NewAnimation_" + Math.floor(performance.now()).toString();
        //             this.editor.loadAnimation( name, null );
        //         }else{
        //             name = a[0];
        //         }
        //         this.editor.bindAnimationToCharacter( name );
        //         this.editor.startEdition();
        //     }
        //     else {
        //         UTILS.makeLoading("Processing video " + (this.videoProcessingCommon.videosProcessed +1) + "/" + this.videoProcessingCommon.videosToProcess.length.toString(), 0.5 )
        //         this.processVideo( common.videosToProcess[common.videosProcessed], common.onVideoProcessEndedFn )
        //     }
        // }
        
        // UTILS.makeLoading("Loading Mediapipe", 1 )
        // MediaPipe.start( false, () => {
        //     // directly to process stage
        //     UTILS.makeLoading("Processing video " + (this.videoProcessingCommon.videosProcessed+1) + "/" + this.videoProcessingCommon.videosToProcess.length.toString(), 0.5 )
        //     this.processVideo( this.videoProcessingCommon.videosToProcess[0], this.videoProcessingCommon.onVideoProcessEndedFn );
        // }, this.editor.gui.updateCaptureGUI.bind(this.editor.gui) );
        
    }

    onLoadSingleVideo( videoFile ) {
        if ( !videoFile ) { 
            return; 
        }

        // UTILS.makeLoading("Loading video...");

        let url = "";
        if( typeof(videoFile) == 'string' && videoFile.includes("blob:") )  {
            url = videoFile;
        }
        else {
            url = URL.createObjectURL(videoFile);
        }
        // let videoElement = this.editor;
        // videoElement.src = url;
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
        
        let that = this;
        // video.onloadedmetadata = ( function (e) {
        const promise = new Promise((resolve) => {
            video.onloadeddata = ( (e) => {
            
                const aspect = video.videoWidth / video.videoHeight;
                
                video.classList.remove("hidden");
                const height = video.parentElement ? video.parentElement.clientHeight : video.parent.root.clientHeight;
                const width = height * aspect;
                
                const canvasVideo = this.canvasVideo;
                canvasVideo.width  = width;
                canvasVideo.height = height;
    
                video.style.width = width + "px";
                video.style.height = height + "px";
    
                MediaPipe.start( false, () => {
                    // directly to trim stage
                    this.createTrimArea( resolve );                
        
                }, 
                this.updateSidePanel.bind(this)
            );
            } ).bind(video);
        })
        return promise;
    }
}

export { VideoProcessor }