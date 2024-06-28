import { DrawingUtils, HolisticLandmarker, FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13';


import * as THREE from 'three'
import { UTILS } from "./utils.js"

const MediaPipe = {
    PROCESSING_EVENT_TYPES: { NONE: 0, SEEK: 1, VIDEOFRAME: 2, ANIMATIONFRAME: 3 },

    loaded: false,
    recording: false,
    
    currentResults: null, 
    landmarks: [],
    blendshapes : [],
    async start( live, onload, onresults, onerror ) {

        UTILS.makeLoading("Loading MediaPipe...");

        this.live = live;
        this.landmarks = [];
        this.blendshapes = [];
        this.onload = onload;
        this.onresults = onresults;
        this.onerror = onerror;
        // Webcam and MediaPipe Set-up
        const videoElement = document.getElementById("inputVideo");
        const canvasElement = document.getElementById("outputVideo");
        this.canvasCtx = canvasElement.getContext("2d");
        
        const vision = await FilesetResolver.forVisionTasks( "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13/wasm" );
        
        if(!this.faceLandmarker) {
            this.faceLandmarker = await FaceLandmarker.createFromOptions(
                vision, 
                {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                        delegate: 'GPU'
                    },
                    outputFaceBlendshapes: true,
                    outputFacialTransformationMatrixes: true,
                    runningMode: 'VIDEO',
                    numFaces: 1
                }
            );
        }

        if(!this.handDetector){
            this.handDetector = await HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    numHands: 2,
                    runningMode: "VIDEO",
                    // minTrackingConfidence: 0.001,
                    // minPosePresenceConfidence: 0.001,
                    // minPoseDetectionConfidence: 0.001
                }
            );
        }
            
        if(!this.poseDetector){
            this.poseDetector = await PoseLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                        delegate:"GPU"
                    },
                    runningMode: "VIDEO",
                // minTrackingConfidence: 0.001,
                // minPosePresenceConfidence: 0.001,
                // minPoseDetectionConfidence: 0.001
                }
            );
        }

        if (!this.drawingUtils){ 
            this.drawingUtils = new DrawingUtils( this.canvasCtx ); 
            this.drawingUtils.autoDraw = true;
        }
        
        this.drawingUtils.autoDraw = false;
        await this.processFrame( document.getElementById("outputVideo") ); // force models to load on gpu
        this.drawingUtils.autoDraw = true;
        
        this.currentVideoProcessing = null;
        
        this.loaded = true; // using awaits
        if ( this.onload ){ this.onload(); }
        
        window.mediapipe = this;
        
        $('#loading').fadeOut();
    },

    setOptions( o ){
        if( o.hasOwnProperty("autoDraw") ){ this.drawingUtils.autoDraw = !!o.autoDraw; }
    },

    drawCurrentResults(){
        if ( this.currentResults ){ this.drawResults( this.currentResults ); }
    },

    drawResults( results ){
        const canvasCtx = this.canvasCtx;
        const canvasElement = canvasCtx.canvas;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        // Only overwrite existing pixels.
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.fillStyle = '#00FF00';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        // Only overwrite missing pixels.
        canvasCtx.globalCompositeOperation = 'destination-atop';

        if(this.live){
            // Mirror canvas
            canvasCtx.translate(canvasElement.width, 0);
            canvasCtx.scale(-1, 1);    
            // -------------
        }

        if ( results.image ){ canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height); }
        canvasCtx.globalCompositeOperation = 'source-over';
    
        // const image = document.getElementById("source");
        // canvasCtx.globalAlpha = 0.6;
        // canvasCtx.drawImage(image, 0, 0, canvasElement.width, canvasElement.height);
        // canvasCtx.globalAlpha = 1;
        const lm = results.landmarksResults;
        if ( lm.PLM ){
            this.drawingUtils.drawConnectors( lm.PLM, PoseLandmarker.POSE_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //'#00FF00'
            this.drawingUtils.drawLandmarks( lm.PLM, {color: '#1a2025',fillColor: 'rgba(255, 255, 255, 1)', lineWidth: 2}); //'#00FF00'
        }
        // drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
        if ( lm.LLM ){
            this.drawingUtils.drawConnectors( lm.LLM, HandLandmarker.HAND_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //#CC0000
            this.drawingUtils.drawLandmarks( lm.LLM, {color: '#1a2025',fillColor: 'rgba(58, 161, 156, 1)', lineWidth: 2}); //'#00FF00'
        }
        if ( lm.RLM ){
            this.drawingUtils.drawConnectors( lm.RLM, HandLandmarker.HAND_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //#00CC00
            this.drawingUtils.drawLandmarks( lm.RLM, {color: '#1a2025',fillColor: 'rgba(196, 113, 35, 1)', lineWidth: 2});
        }
        canvasCtx.globalCompositeOperation = 'source-in';

        canvasCtx.restore();
    },

    async processFrame(videoElement){
        // if ( !videoElement || videoElement.width < 0.001 || videoElement.height < 0.001 ){ return; }
        // take same image for face, pose, hand detectors and ui 
        if ( !videoElement.duration ){ return; }
        let image = await createImageBitmap( videoElement );

        const time = performance.now()//Date.now();
        // it would probably be more optimal to use hollistic. But it does not return certain types of values 
        const detectionsFace = this.faceLandmarker.detectForVideo(image, time);
        const detectionsPose = this.poseDetector.detectForVideo(image,time);
        const detectionsHands = this.handDetector.detectForVideo(image,time);
        // let holistic_results = this.holisticLandmarker.detectForVideo(videoElement,time);
        
        //miliseconds
        const dt = this.currentResults ? Math.max( ( videoElement.currentTime - this.currentResults.currentTime ) * 1000, 0 ) : 0; 
        
        const results = {
            dt: dt, // miliseconds
            currentTime: videoElement.currentTime, //seconds. Both a video and a stream update videoElement.currentTime
            image: image, // display same image that was used for inference
            blendshapesResults: this.processBlendshapes( detectionsFace, dt ),
            landmarksResults: this.processLandmarks( detectionsFace, detectionsPose, detectionsHands, dt )
        }      

        if ( this.drawingUtils.autoDraw ){ this.drawResults( results ); }

        // TODO: consider keeping the image until this.currentResults is modified. This way, the image used in mediapipe can be displayed at any time
        delete results.image;
        image.close();

        if ( this.recording ){
            if ( results.landmarksResults.PWLM ){ 
                let ps = results.landmarksResults.PWLM; 
                for( let i = 0; i < ps.length; ++i ){ ps[i].y *= -1; ps[i].z *= -1; }
            }
            if ( results.landmarksResults.LWLM ){ 
                let ps = results.landmarksResults.LWLM; 
                for( let i = 0; i < ps.length; ++i ){ ps[i].y *= -1; ps[i].z *= -1; }
            }
            if ( results.landmarksResults.RWLM ){ 
                let ps = results.landmarksResults.RWLM; 
                for( let i = 0; i < ps.length; ++i ){ ps[i].y *= -1; ps[i].z *= -1; }
            }
            this.landmarks.push( results.landmarksResults );
            this.blendshapes.push( results.blendshapesResults );
        }

        this.currentResults = results;
        
        if ( this.onresults ){
            this.onresults( results, this.recording);
        }
    },

    processLandmarks(faceData, poseData, handsData, dt = 0) {

        const results = {
            dt: dt, 
            FLM: null,

            RLM: null, // image 2d landmarks each landmarks with { x, y, z, visibility } 
            LLM: null, 
            PLM: null, 
            
            RWLM: null, // world 3d landmarks each landmarks with { x, y, z, visibility }
            LWLM: null, 
            PWLM: null, 
            distanceToCamera: 0,
            rightHandVisibility: 0, 
            leftHandVisibility: 0
        };

        if ( handsData ){
            for ( let i = 0; i < handsData.handednesses.length; ++i ){
                let h = handsData.handednesses[i][0];
                let landmarks = handsData.landmarks[ i ]
                let worldLandmarks = handsData.worldLandmarks[ i ];
                if ( h.categoryName == 'Left' ){ results.LLM = landmarks; results.LWLM = worldLandmarks; }
                else{ results.RLM = landmarks; results.RWLM = worldLandmarks; }
            }
        }

        if ( faceData && faceData.faceLandmarks.length ){
            results.FLM = faceData.faceLandmarks[0];
        }

        if ( poseData && poseData.landmarks.length ){
            const landmarks = poseData.landmarks[0];
            const worldLandmarks = poseData.worldLandmarks[0];
            results.PLM = landmarks;
            results.PWLM = worldLandmarks;
            results.distanceToCamera = (landmarks[23].visibility + landmarks[24].visibility)*0.5;
            results.leftHandVisibility = !!results.LLM * (landmarks[15].visibility + landmarks[17].visibility + landmarks[19].visibility)/3;
            results.rightHandVisibility = !!results.RLM * (landmarks[16].visibility + landmarks[18].visibility + landmarks[20].visibility)/3;
        }
                
        return results;
    },

 
    processBlendshapes(faceData, dt = 0) {
        let blends = {};
        if ( faceData.faceBlendshapes.length > 0  ) {
            const faceBlendshapes = faceData.faceBlendshapes[ 0 ].categories;
            for ( const blendshape of faceBlendshapes ) {
                const name =  blendshape.categoryName.charAt(0).toUpperCase() + blendshape.categoryName.slice(1);
                blends[name] = blendshape.score;
            }
            
            if(blends["LeftEyeYaw"] == null){
                blends["LeftEyeYaw"] = (blends["EyeLookOutLeft"] - blends["EyeLookInLeft"]) * 0.5;
                blends["RightEyeYaw"] = - (blends["EyeLookOutRight"] - blends["EyeLookInRight"]) * 0.5;
                blends["LeftEyePitch"] = (blends["EyeLookDownLeft"] - blends["EyeLookUpLeft"]) * 0.5;
                blends["RightEyePitch"] = (blends["EyeLookDownRight"] - blends["EyeLookUpRight"]) * 0.5;
            }
        }

        if ( faceData.facialTransformationMatrixes.length > 0 ) {
            const transform = new THREE.Object3D();
            transform.matrix.fromArray( faceData.facialTransformationMatrixes[ 0 ].data );
            transform.matrix.decompose( transform.position, transform.quaternion, transform.scale );

            blends["HeadYaw"] = - transform.rotation.y;
            blends["HeadPitch"] = - transform.rotation.x;
            blends["HeadRoll"] = - transform.rotation.z;
        }

        blends.dt = dt;
        return blends;
    },

    /**
     * sets mediapipe to process videoElement on each rendered frame. It does not automatically start recording. 
     * Hardware capabilities affect the rate at which frames can be displayed and processed
     */
    async processVideoOnline( videoElement, live = false ){
        this.live = live;
        this.stopVideoProcessing(); // stop previous video processing, if any
        
        this.currentVideoProcessing = {
            videoElement: videoElement,
            currentTime: videoElement.currentTime,
            isOffline: false,
            listenerBind: null,
            listenerID: null,
            listenerType: null
        }

        let listener = async () => {
            let videoElement = this.currentVideoProcessing.videoElement;
            
            if ( videoElement.requestVideoFrameCallback ){
                this.currentVideoProcessing.listenerID = videoElement.requestVideoFrameCallback( this.currentVideoProcessing.listenerBind ); // ID needed to cancel
            }
            else{
                this.currentVideoProcessing.listenerID = window.requestAnimationFrame( this.currentVideoProcessing.listenerBind ); // ID needed to cancel
            }

            // update only if sufficient time has passed to avoid processing a paused video
            if ( Math.abs( videoElement.currentTime - this.currentVideoProcessing.currentTime ) > 0.001 ){ 
                this.currentVideoProcessing.currentTime = videoElement.currentTime;
                await this.processFrame( videoElement ); 
            } 
            else {
                this.drawCurrentResults();
            }
        }

        let listenerBind = this.currentVideoProcessing.listenerBind = listener.bind(this);

        if ( videoElement.requestVideoFrameCallback ){ // not available on firefox
            this.currentVideoProcessing.listenerID = videoElement.requestVideoFrameCallback( listenerBind ); // ID needed to cancel
            this.currentVideoProcessing.listenerType = this.PROCESSING_EVENT_TYPES.VIDEOFRAME;
        }else{
            this.currentVideoProcessing.listenerID = window.requestAnimationFrame( listenerBind ); // ID needed to cancel
            this.currentVideoProcessing.listenerType = this.PROCESSING_EVENT_TYPES.ANIMATIONFRAME;
        }
    },
    
    /**
     * sets mediapipe to process videoElement from [startTime, endTime] at each dt. It automatically starts recording
     * @param {HTMLVideoElement*} videoElement 
     * @param {Number} startTime seconds
     * @param {Number} endTime seconds
     * @param {Number} dt seconds. Default to 0.04 = 1/25 = 25 fps
     * @param {Function} onEnded 
     */
    async processVideoOffline( videoElement,  startTime = -1, endTime = -1, dt = 0.04, onEnded = null, live = false ){ // dt=seconds, default 25 fps
        // PROBLEMS: still reading speed (browser speed). Captures frames at specified fps (dt) instead of the actual available video frames
        // PROS: Ensures current time has loaded correctly before sending to mediapipe. Better support than requestVideoCallback
        this.live = live;
        this.stopVideoProcessing(); // stop previous video processing, if any

        videoElement.pause();
        startTime = Math.max( Math.min( videoElement.duration, startTime ), 0 );
        if ( endTime < -0.001 ){ 
            endTime = videoElement.duration; 
        }
        endTime = Math.max( Math.min( videoElement.duration, endTime ), startTime );
        dt = Math.max( dt, 0.001 );
        
        let listener = async () => {
            let videoElement = this.currentVideoProcessing.videoElement;
            await this.processFrame(videoElement);
 
            let nextCurrentTime = videoElement.currentTime + this.currentVideoProcessing.dt;
            if (nextCurrentTime <= this.currentVideoProcessing.endTime){
                videoElement.currentTime = nextCurrentTime;
            }
            else {
                let cvp = this.currentVideoProcessing;
                this.stopRecording();
                this.stopVideoProcessing();
                if ( cvp.onEnded ){ cvp.onEnded(); }
            }
        };
        
        this.startRecording();
        let listenerBind = listener.bind(this);
        videoElement.addEventListener( "seeked", listenerBind, false );
        videoElement.currentTime = startTime;

        this.currentVideoProcessing = {
            videoElement: videoElement,
            isOffline: true,
            startTime: startTime,
            endTime: endTime,
            dt: dt,
            onEnded: typeof( onEnded ) === 'function' ? onEnded : null,
            listenerBind: listenerBind,
            listenerID: listenerBind,
            listenerType: this.PROCESSING_EVENT_TYPES.SEEK
        }
    },

    stopVideoProcessing(){
        if ( !this.currentVideoProcessing ){ return; }
        
        switch( this.currentVideoProcessing.listenerType ){
            case this.PROCESSING_EVENT_TYPES.SEEK:
                this.currentVideoProcessing.videoElement.removeEventListener( "seeked", this.currentVideoProcessing.listenerID, false );
                break;
            case this.PROCESSING_EVENT_TYPES.VIDEOFRAME:
                this.currentVideoProcessing.videoElement.cancelVideoFrameCallback( this.currentVideoProcessing.listenerID );
                break;
            case this.PROCESSING_EVENT_TYPES.ANIMATIONFRAME:
                window.cancelAnimationFrame( this.currentVideoProcessing.listenerID );
                break;
        }

        this.currentVideoProcessing = null;
    },

    startRecording() {
        this.recording = true;
        this.landmarks = [];
        this.blendshapes = [];
    },

    stopRecording() {
        this.recording = false;
        // Correct first dt of landmarks
        if ( this.landmarks.length ){ this.landmarks[0].dt = 0; }
        if ( this.blendshapes.length ){ this.blendshapes[0].dt = 0; }
    }
}

export { MediaPipe };