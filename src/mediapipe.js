import "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
import "https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js";
import "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js";

// Mediapipe face blendshapes
import { DrawingUtils, HolisticLandmarker, FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13';


import * as THREE from 'three'
import { UTILS } from "./utils.js"

const MediaPipe = {

    loaded: false,
    recording: false,
    currentTime: 0,
    
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
        MediaPipe.stop();
        
        const vision = await FilesetResolver.forVisionTasks( "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13/wasm" );

        if(!this.handDetector){
            this.handDetector = await HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: "../MediapipeModels/hand_landmarker.task",
                        // modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    numHands: 2,
                    runningMode: "VIDEO",
                    // minTrackingConfidence: 0.001,
                    // minPosePresenceConfidence: 0.001,
                    // minPoseDetectionConfidence: 0.001
                });
        }
        if(!this.faceLandmarker) {
            this.faceLandmarker = await FaceLandmarker.createFromOptions( vision, {
                baseOptions: {
                    //
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            } );
        }
            
        if(!this.poseDetector){
            this.poseDetector = await PoseLandmarker.createFromOptions(
                vision,
                {
                baseOptions: {
                    // modelAssetPath: "../MediapipeModels/pose_landmarker_heavy.task",
                    // modelAssetPath: "../MediapipeModels/pose_landmarker_full.task",
                    // modelAssetPath: "../MediapipeModels/pose_landmarker_lite.task",
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
                    delegate:"GPU"
                },
                runningMode: "VIDEO",
                // minTrackingConfidence: 0.001,
                // minPosePresenceConfidence: 0.001,
                // minPoseDetectionConfidence: 0.001
            });
        }
        this.drawingUtils = new DrawingUtils( this.canvasCtx );

        this.loaded = false;

        videoElement.play();
        videoElement.controls = true;
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.requestVideoFrameCallback( this.sendVideo.bind(this, videoElement) );  
        window.mediapipe = this;
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
        if(!this.recording) {
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
        }
        canvasCtx.restore();
    },

    async sendVideo(videoElement){
        videoElement.requestVideoFrameCallback(this.sendVideo.bind(this, videoElement));
        await this.processFrame( videoElement );

        if(!this.loaded) {
            this.loaded = true;
            if(this.onload) this.onload();
        }
    },

    async processFrame(videoElement){
        // take same image for face, pose, hand detectors and ui 
        this.canvasCtx.clearRect(0, 0, this.canvasCtx.canvas.width, this.canvasCtx.canvas.height);
        this.canvasCtx.drawImage(videoElement, 0, 0, this.canvasCtx.canvas.width, this.canvasCtx.canvas.height);
        let image = await createImageBitmap( this.canvasCtx.canvas );

        const time = performance.now()//Date.now();
        // it would probably be more optimal to use hollistic. But it does not return certain types of values 
        const detectionsFace = this.faceLandmarker.detectForVideo(image, time);
        const detectionsPose = this.poseDetector.detectForVideo(image,time);
        const detectionsHands = this.handDetector.detectForVideo(image,time);
        // let holistic_results = this.holisticLandmarker.detectForVideo(videoElement,time);
        
        //miliseconds
        const dt = this.currentResults ? ( ( videoElement.currentTime - this.currentResults.currentTime ) * 1000 ) : 0; 
        
        const results = {
            dt: dt, // miliseconds
            currentTime: videoElement.currentTime, //second. Both a video and a stream update videoElement.currentTime
            image: image, // display same image that was used for inference
            blendshapesResults: this.processBlendshapes( detectionsFace, dt ),
            landmarksResults: this.processLandmarks( detectionsFace, detectionsPose, detectionsHands, dt )
        }      

        this.drawResults( results );

        delete results.image;
        image.close();

        if ( this.recording ){
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
            RLM: null, 
            LLM: null, 
            FLM: null, 
            PLM: null, 
            distanceToCamera: 0,
            rightHandVisibility: 0, 
            leftHandVisibility: 0
        };

        if ( handsData ){
            for ( let i = 0; i < handsData.handednesses.length; ++i ){
                let h = handsData.handednesses[i][0];
                let landmarks = handsData.landmarks[ i ]; // handsData.worldLandmarks[ i ];
                if ( h.categoryName == 'Left' ){ results.LLM = landmarks; }
                else{ results.RLM = landmarks; }
            }
        }

        if ( faceData && faceData.faceLandmarks.length ){
            results.FLM = faceData.faceLandmarks[0];
        }

        if ( poseData && poseData.landmarks.length ){
            const lm = poseData.landmarks[0];
            results.PLM = lm;
            results.distanceToCamera = (lm[23].visibility + lm[24].visibility)*0.5;
            results.leftHandVisibility = !!results.LLM * (lm[15].visibility + lm[17].visibility + lm[19].visibility)/3;
            results.rightHandVisibility = !!results.RLM * (lm[16].visibility + lm[18].visibility + lm[20].visibility)/3;
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

    
    async processEntireVideo_V2( videoElement, startTime, endTime, dt = 0.04 ){
        // PROBLEMS: still reading speed (browser speed). Captures frames at specified fps, not at video's fps
        // Ensures current time has loaded correctly before sending to mediapipe. Better support than requestVideoCallback
        startTime = Math.max( Math.min( videoElement.duration, startTime ), 0 );
        endTime = Math.max( Math.min( videoElement.duration, endTime ), startTime );

        this.onStartRecording();

        let listener = async (videoElement, endTime, dt) => {
            await this.holistic.send({image: videoElement});
            const faceResults = this.faceLandmarker.detectForVideo(videoElement, Date.now() );
            if(faceResults){ this.onFaceResults(faceResults); }
            console.log( videoElement.currentTime );
            let val = videoElement.currentTime + dt;
            if (val < endTime){
                videoElement.currentTime = val;
            }
            else {
                this.onStopRecording();
                videoElement.removeEventListener("seeked", this.listenerBinded, false );
                for(let i = 0; i < this.landmarks.length; ++i ){
                    this.landmarks[i].dt = dt * 1000;
                    this.blendshapes[i].dt = dt * 1000;
                }
                console.log("asdfasdf");
                console.log((performance.now() - window.t) * 0.001 )
            }
        };
        this.listenerBinded = listener.bind(this, videoElement, endTime, dt );
        videoElement.addEventListener( "seeked", this.listenerBinded, false );
        videoElement.currentTime = startTime;
        window.t = performance.now()

    },

    stop() {
        
        // get reference of the video element the Camera is constructed on
        let $feed = $("#inputVideo")[0];

        // reset feed source 
        $feed.pause();
        if($feed.srcObject){
            // $feed.srcObject = $feed.captureStream();
            $feed.srcObject.getTracks().forEach(a => a.stop());
        }
        $feed.srcObject = null;
    },

    onStartRecording() {
        this.recording = true;
        this.landmarks = [];
        this.blendshapes = [];
        
    },

    onStopRecording() {
        this.recording = false;
        // Correct first dt of landmarks
        if ( this.landmarks.length ){ this.landmarks[0].dt = 0; }
        if ( this.blendshapes.length ){ this.blendshapes[0].dt = 0; }
    }
}

export { MediaPipe };