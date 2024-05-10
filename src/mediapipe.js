import "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js";
import "https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js";
import "https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js";
import "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js";

// Mediapipe face blendshapes
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

import * as THREE from 'three'
import { UTILS } from "./utils.js"

const MediaPipe = {

    loaded: false,
    recording: false,
    currentTime: 0,
    previousTime: 0,
    bsCurrentTime: 0,
    bsPreviousTime: 0,
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
        const canvasCtx = canvasElement.getContext("2d");
        MediaPipe.stop();
        //Holistic 
        if(!this.holistic) {

            this.holistic = await new Holistic({locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
            }});
    
            this.holistic.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: true,
                smoothSegmentation: true,
                refineFaceLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
        }
        else {
            // this.holistic.reset();
        }
        this.holistic.onResults(((results) => {

            if (this.recording) // store MediaPipe data
            {
                this.currentTime = Date.now();
                var dt = this.currentTime - this.previousTime;
                this.fillLandmarks(results, dt);
            
                this.previousTime = this.currentTime;
            }
            
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

            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
            if(!this.recording) {
                canvasCtx.globalCompositeOperation = 'source-over';
            
                // const image = document.getElementById("source");
                // canvasCtx.globalAlpha = 0.6;
                // canvasCtx.drawImage(image, 0, 0, canvasElement.width, canvasElement.height);
                // canvasCtx.globalAlpha = 1;
                drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS,
                    {color: '#1a2025', lineWidth: 4}); //'#00FF00'
                drawLandmarks(canvasCtx, results.poseLandmarks,
                                {color: '#1a2025',fillColor: 'rgba(255, 255, 255, 1)', lineWidth: 2}); //'#00FF00'
                // drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION,
                //                 {color: '#C0C0C070', lineWidth: 1});
                drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS,
                                {color: '#1a2025', lineWidth: 4}); //#CC0000
                drawLandmarks(canvasCtx, results.leftHandLandmarks,
                                {color: '#1a2025',fillColor: 'rgba(58, 161, 156, 1)', lineWidth: 2}); //'#00FF00'
                drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS,
                                {color: '#1a2025', lineWidth: 4}); //#00CC00
                drawLandmarks(canvasCtx, results.rightHandLandmarks,
                                {color: '#1a2025',fillColor: 'rgba(196, 113, 35, 1)', lineWidth: 2});
                canvasCtx.globalCompositeOperation = 'source-in';
            }
            canvasCtx.restore();
            if(this.onresults)
                this.onresults({landmarksResults: results}, this.recording);

        }).bind(this));

        // Face blendshapes
        if(!this.faceLandmarker) {

            const filesetResolver = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
            );
    
            this.faceLandmarker = await FaceLandmarker.createFromOptions( filesetResolver, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            } );
        }

        this.loaded = false;

        videoElement.play();
        videoElement.controls = true;
        videoElement.loop = true;
        videoElement.muted = true;
        videoElement.requestVideoFrameCallback( this.sendVideo.bind(this, this.holistic, videoElement) );  
    },

    async sendVideo(holistic, videoElement){
        await holistic.send({image: videoElement});
        const faceResults = this.faceLandmarker.detectForVideo(videoElement, Date.now() );
        if(faceResults)
            this.onFaceResults(faceResults);
        videoElement.requestVideoFrameCallback(this.sendVideo.bind(this, holistic, videoElement));

        if(!this.loaded) {
            this.loaded = true;
            if(this.onload) this.onload();
        }
    },

    onFaceResults(results) {
        
        let faceBlendshapes = null;
        if (this.recording) // store MediaPipe data
        {
            this.bsCurrentTime = Date.now();
            var dt = this.bsCurrentTime - this.bsPreviousTime;
            faceBlendshapes = this.fillBlendshapes(results, dt, true);
            this.bsPreviousTime = this.bsCurrentTime;
            
        }
        else {
            faceBlendshapes = this.fillBlendshapes(results);
        }

        this.onresults({blendshapesResults: faceBlendshapes}, this.recording)
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
    },

    fillLandmarks(data, dt) {

        if(!data || data.poseLandmarks == undefined) {
            console.warn( "no landmark data at time " + dt/1000.0 );
            return;
        }
        const { poseLandmarks } = data;
        let distance = (poseLandmarks[23].visibility + poseLandmarks[24].visibility)*0.5;
        let leftHand = (poseLandmarks[15].visibility + poseLandmarks[17].visibility + poseLandmarks[19].visibility)/3;
        let rightHand = (poseLandmarks[16].visibility + poseLandmarks[18].visibility + poseLandmarks[20].visibility)/3;
      
        this.landmarks.push({"RLM": data.rightHandLandmarks, "LLM": data.leftHandLandmarks, "FLM": data.faceLandmarks, "PLM": data.poseLandmarks, "dt": dt, distanceToCamera: distance, rightHandVisibility: rightHand, leftHandVisibility: leftHand});
    },

 
    fillBlendshapes(data, dt = 0, fill = false) {
        const transform = new THREE.Object3D();
        let blends = {};
        if ( data.faceBlendshapes.length > 0  ) {

            const faceBlendshapes = data.faceBlendshapes[ 0 ].categories;
            for ( const blendshape of faceBlendshapes ) {

                const name =  blendshape.categoryName.charAt(0).toUpperCase() + blendshape.categoryName.slice(1);
                blends[name] = blendshape.score;

            }
            
            if(blends["LeftEyeYaw"] == null);
            {
                blends["LeftEyeYaw"] = (blends["EyeLookOutLeft"] - blends["EyeLookInLeft"])/2;
                blends["RightEyeYaw"] = - (blends["EyeLookOutRight"] - blends["EyeLookInRight"])/2;
                blends["LeftEyePitch"] = (blends["EyeLookDownLeft"] - blends["EyeLookUpLeft"])/2;
                blends["RightEyePitch"] = (blends["EyeLookDownRight"] - blends["EyeLookUpRight"])/2;
            }

        }

        if ( data.facialTransformationMatrixes.length > 0 ) {

            const facialTransformationMatrixes = data.facialTransformationMatrixes[ 0 ].data;

            transform.matrix.fromArray( facialTransformationMatrixes );
            transform.matrix.decompose( transform.position, transform.quaternion, transform.scale );

            blends["HeadYaw"] = - transform.rotation.y;
            blends["HeadPitch"] = - transform.rotation.x;
            blends["HeadRoll"] = - transform.rotation.z;
        }

        if(fill) {
            blends.dt = dt;
            this.blendshapes.push(blends)
        }

        return blends;
    }
}

export { MediaPipe };