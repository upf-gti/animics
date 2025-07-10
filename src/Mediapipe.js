import { DrawingUtils, HolisticLandmarker, FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13';
import * as THREE from 'three'

class MediaPipe {
    static PROCESSING_EVENT_TYPES = { NONE: 0, SEEK: 1, VIDEOFRAME: 2, ANIMATIONFRAME: 3 };
    
    constructor( canvas, onload, onresults, onerror ) {

        this.canvas = canvas;
        // Webcam and MediaPipe Set-up
        this.canvasCtx = canvas.getContext("2d");
        
        this.onload = onload;
        this.onresults = onresults;
        this.onerror = onerror;

        this.loaded = false;
        this.recording = false;
        this.currentResults = null;
        this.landmarks = [];
        this.blendshapes = [];
        this.rawData = [];

        this.mirrorCanvas = false;
        this.cropRect = null; //{ x:0, y:0, width: 1, height: 1 }; normalized coordinates
    }

    async init () {

        if( this.loaded ) {
            return new Promise(resolve => resolve());
        }

        const initImage = await createImageBitmap(this.canvas);
        const loadingPromises = [];
        const vision = await FilesetResolver.forVisionTasks( "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.13/wasm" );
        
        if(!this.faceLandmarker) {
            const p = FaceLandmarker.createFromOptions(
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
            ).then(
                (faceLandmarker) =>{
                    this.faceLandmarker = faceLandmarker;
                    return this.faceLandmarker.detectForVideo(initImage, performance.now());
                }
            );
            loadingPromises.push(p);

        }

        if(!this.handDetector){
            const p = HandLandmarker.createFromOptions(
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
            ).then( 
                (handDetector)=>{
                    this.handDetector = handDetector;
                    return this.handDetector.detectForVideo(initImage, performance.now());
                } 
            );
            loadingPromises.push(p);
        }
            
        if(!this.poseDetector){
            const p = PoseLandmarker.createFromOptions(
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
            ).then(
                (poseDetector) => {
                    this.poseDetector = poseDetector;
                    return this.poseDetector.detectForVideo(initImage, performance.now());
                }
            );
            loadingPromises.push(p);
        }

        await Promise.all( loadingPromises );

        if (!this.drawingUtils){ 
            this.drawingUtils = new DrawingUtils( this.canvasCtx ); 
            this.drawingUtils.autoDraw = true;
        }
        
        this.currentVideoProcessing = null;
        
        this.loaded = true; // using awaits
        if ( this.onload ) {
            this.onload();
        }
    }

    setOptions( o ) {
        if( o.hasOwnProperty("autoDraw") ) {
            this.drawingUtils.autoDraw = !!o.autoDraw;
        }
    }

    drawCurrentResults() {
        if ( this.currentResults ) {
            this.drawResults( this.currentResults );
        }
    }

    drawResults( results ) {
        const canvasCtx = this.canvasCtx;
        const canvasElement = this.canvas;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        // Only overwrite existing pixels.
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.fillStyle = '#00FF00';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        // Only overwrite missing pixels.
        canvasCtx.globalCompositeOperation = 'destination-atop';

        if(this.mirrorCanvas){
            // Mirror canvas
            canvasCtx.translate(canvasElement.width, 0);
            canvasCtx.scale(-1, 1);    
            // -------------
        }

        if ( results.image ) {
            canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
        }
        canvasCtx.globalCompositeOperation = 'source-over';
    
       
        const lm = results.landmarksResults;

        if ( lm.PLM ) {
            const PLM = [ ...lm.PLM]; // clone array
            // Convert to original image space
            if( results.rect ) {
                for( let i = 0; i < PLM.length; i++ ) {
                    //PLM are normalized landmakrs
                    let x = PLM[i].x * results.rect.width; 
                    x += results.rect.x;
                    x /= results.image.width;
                    PLM[i].x = x;

                    let y = PLM[i].y * results.rect.height;
                    y += results.rect.y;
                    y /= results.image.height;
                    PLM[i].y = y;
                }
            }

            this.drawingUtils.drawConnectors( PLM, PoseLandmarker.POSE_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //'#00FF00'
            this.drawingUtils.drawLandmarks( PLM, {color: '#1a2025',fillColor: 'rgba(255, 255, 255, 1)', lineWidth: 2}); //'#00FF00'
        }
        // drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
        if ( lm.LLM ) {
            const LLM = [ ...lm.LLM]; // clone array
            // Convert to original image space
            if( results.rect ) {
                for( let i = 0; i < LLM.length; i++ ) {
                    //LLM are normalized landmakrs
                    let x = LLM[i].x * results.rect.width; 
                    x += results.rect.x;
                    x /= results.image.width;
                    LLM[i].x = x;

                    let y = LLM[i].y * results.rect.height;
                    y += results.rect.y;
                    y /= results.image.height;
                    LLM[i].y = y;
                }
            }
            this.drawingUtils.drawConnectors( LLM, HandLandmarker.HAND_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //#CC0000
            this.drawingUtils.drawLandmarks( LLM, {color: '#1a2025',fillColor: 'rgba(58, 161, 156, 1)', lineWidth: 2}); //'#00FF00'
        }
        if ( lm.RLM ) {
            const RLM = [ ...lm.RLM]; // clone array
            // Convert to original image space
            if( results.rect ) {
                for( let i = 0; i < RLM.length; i++ ) {
                    //RLM are normalized landmakrs
                    let x = RLM[i].x * results.rect.width; 
                    x += results.rect.x;
                    x /= results.image.width;
                    RLM[i].x = x;

                    let y = RLM[i].y * results.rect.height;
                    y += results.rect.y;
                    y /= results.image.height;
                    RLM[i].y = y;
                }
            }
            this.drawingUtils.drawConnectors( RLM, HandLandmarker.HAND_CONNECTIONS, {color: '#1a2025', lineWidth: 4}); //#00CC00
            this.drawingUtils.drawLandmarks( RLM, {color: '#1a2025',fillColor: 'rgba(196, 113, 35, 1)', lineWidth: 2});
        }
        
        canvasCtx.globalCompositeOperation = 'source-in';
        canvasCtx.restore();
    }

    async processFrame(videoElement, rect) {
        // take same image for face, pose, hand detectors and ui 
        if ( !videoElement.duration ) {
            return;
        }

        // it does not care whether the videolement has some css mirroring it. It takes the raw video
        const originalImage = await createImageBitmap(videoElement);
        let croppedImage = originalImage;
        
        if( rect ) {
            let {x, y, width, height} = rect;
            
            x *= videoElement.videoWidth;
            y *= videoElement.videoHeight;
            width*= videoElement.videoWidth;
            height *= videoElement.videoHeight;

            rect = {x, y, width, height};
            croppedImage = await createImageBitmap( videoElement, x, y, width, height, {resizeWidth: width, resizeHeight: height, resizeQuality:"high"} );
        }

        const time = performance.now()//Date.now();

        // it would probably be more optimal to use hollistic. But it does not return certain types of values 
        const detectionsFace = this.faceLandmarker.detectForVideo(croppedImage, time);
        const detectionsPose = this.poseDetector.detectForVideo(croppedImage, time);
        const detectionsHands = this.handDetector.detectForVideo(croppedImage, time);
        // let holistic_results = this.holisticLandmarker.detectForVideo(videoElement,time);
        
        //miliseconds
        const dt = this.currentResults ? Math.max( ( videoElement.currentTime - this.currentResults.currentTime ) * 1000, 0 ) : 0; 
        
        const results = {
            dt: dt, // miliseconds
            currentTime: videoElement.currentTime, //seconds. Both a video and a stream update videoElement.currentTime
            image: originalImage, // display same image that was used for inference
            blendshapesResults: this.processBlendshapes( detectionsFace, dt ),
            landmarksResults: this.processLandmarks( detectionsFace, detectionsPose, detectionsHands, dt ),
            rect // cropped area rect
        }      

        if ( this.drawingUtils.autoDraw ) {
            this.drawResults( results );
        }

        // TODO: consider keeping the image until this.currentResults is modified. This way, the image used in mediapipe can be displayed at any time
        delete results.image;
        croppedImage.close();
        originalImage.close();

        if ( this.recording ) {
            if ( results.landmarksResults.PWLM ) { 
                let ps = results.landmarksResults.PWLM; 
                for( let i = 0; i < ps.length; ++i ) {
                    ps[i].y *= -1; ps[i].z *= -1;
                }
            }
            if ( results.landmarksResults.LWLM ) { 
                let ps = results.landmarksResults.LWLM; 
                for( let i = 0; i < ps.length; ++i ) {
                    ps[i].y *= -1; ps[i].z *= -1;
                }
            }
            if ( results.landmarksResults.RWLM ) { 
                let ps = results.landmarksResults.RWLM; 
                for( let i = 0; i < ps.length; ++i ) {
                    ps[i].y *= -1; ps[i].z *= -1;
                }
            }
            this.landmarks.push( results.landmarksResults );
            this.blendshapes.push( results.blendshapesResults );
            detectionsFace.dt = dt;
            detectionsPose.dt = dt;
            detectionsHands.dt = dt;
            this.rawData.push({detectionsFace, detectionsPose, detectionsHands});
        }

        this.currentResults = results;
        
        if ( this.onresults ) {
            this.onresults( results, this.recording);
        }
    }

    processLandmarks( faceData, poseData, handsData, dt = 0 ) {

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

        if ( handsData ) {
            for ( let i = 0; i < handsData.handednesses.length; ++i ) {
                let h = handsData.handednesses[i][0];
                let landmarks = handsData.landmarks[ i ]
                let worldLandmarks = handsData.worldLandmarks[ i ];
                if ( h.categoryName == 'Left' ) {
                    results.LLM = landmarks; results.LWLM = worldLandmarks;
                }
                else {
                    results.RLM = landmarks; results.RWLM = worldLandmarks;
                }
            }
        }

        if ( faceData && faceData.faceLandmarks.length ) {
            results.FLM = faceData.faceLandmarks[0];
        }

        if ( poseData && poseData.landmarks.length ) {
            const landmarks = poseData.landmarks[0];
            const worldLandmarks = poseData.worldLandmarks[0];
            results.PLM = landmarks;
            results.PWLM = worldLandmarks;
            results.distanceToCamera = (landmarks[23].visibility + landmarks[24].visibility)*0.5;
            results.leftHandVisibility = !!results.LLM * (landmarks[15].visibility + landmarks[17].visibility + landmarks[19].visibility)/3;
            results.rightHandVisibility = !!results.RLM * (landmarks[16].visibility + landmarks[18].visibility + landmarks[20].visibility)/3;
        }
                
        return results;
    }
 
    processBlendshapes( faceData, dt = 0 ) {
        let blends = {};
        if ( faceData.faceBlendshapes.length > 0  ) {
            const faceBlendshapes = faceData.faceBlendshapes[ 0 ].categories;
            for ( const blendshape of faceBlendshapes ) {
                const name =  blendshape.categoryName.charAt(0).toUpperCase() + blendshape.categoryName.slice(1);
                blends[name] = blendshape.score;
            }
            
            if(blends["LeftEyeYaw"] == null) {
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
    }

    /**
     * sets mediapipe to process videoElement on each rendered frame. It does not automatically start recording. 
     * Hardware capabilities affect the rate at which frames can be displayed and processed
     */
    async processVideoOnline( videoElement, options = {} ){ //mirror = false ){
        this.mirrorCanvas = !!options.mirror;
        this.cropRect = options.rect ?? null;

        this.stopVideoProcessing(); // stop previous video processing, if any
        
        this.currentVideoProcessing = {
            videoElement: videoElement,
            currentTime: -1,
            isOffline: false,
            listenerBind: null,
            listenerID: null,
            listenerType: null
        }

        const listener = async () => {
            let cvp = this.currentVideoProcessing;
            if( !cvp ) {
                return;
            }
            let videoElement = cvp.videoElement;
            
            if ( videoElement.requestVideoFrameCallback ) {
                cvp.listenerID = videoElement.requestVideoFrameCallback( cvp.listenerBind ); // ID needed to cancel
            }
            else{
                cvp.listenerID = window.requestAnimationFrame( cvp.listenerBind ); // ID needed to cancel
            }

            // update only if sufficient time has passed to avoid processing a paused video
            if ( Math.abs( videoElement.currentTime - cvp.currentTime ) > 0.001 ) { 
                cvp.currentTime = videoElement.currentTime;
                await this.processFrame( videoElement, this.cropRect ); 
            } 
            else {
                this.drawCurrentResults();
            }
        }

        const listenerBind = this.currentVideoProcessing.listenerBind = listener.bind(this);

        if ( videoElement.requestVideoFrameCallback ) { // not available on firefox
            this.currentVideoProcessing.listenerID = videoElement.requestVideoFrameCallback( listenerBind ); // ID needed to cancel
            this.currentVideoProcessing.listenerType = MediaPipe.PROCESSING_EVENT_TYPES.VIDEOFRAME;
        }
        else {
            this.currentVideoProcessing.listenerID = window.requestAnimationFrame( listenerBind ); // ID needed to cancel
            this.currentVideoProcessing.listenerType = MediaPipe.PROCESSING_EVENT_TYPES.ANIMATIONFRAME;
        }

        // force a processFrame whenever the video is available. video.readyState Bug fix
        const temp = videoElement.currentTime;
        videoElement.currentTime = -1;
        videoElement.currentTime = temp;
    }
    
    /**
     * sets mediapipe to process videoElement from [startTime, endTime] at each dt. It automatically starts recording
     * @param {HTMLVideoElement*} videoElement
     * @param {Object} [options={}] :
     * @param {Number} startTime seconds
     * @param {Number} endTime seconds
     * @param {Number} dt seconds. Default to 0.04 = 1/25 = 25 fps
     * @param {Function} callback
     * @param {Boolean} mirror whether to flip horizontally (mirroring) the canvas. Useful for seeing correctly a webcam video
     * @param {Object} rect Cropped area {x,y,w,h} 
     */
    async processVideoOffline( videoElement,  options = {} ) { // dt=seconds, default 25 fps
        // PROBLEMS: still reading speed (browser speed). Captures frames at specified fps (dt) instead of the actual available video frames
        // PROS: Ensures current time has loaded correctly before sending to mediapipe. Better support than requestVideoCallback
        let startTime = options.startTime > -1 ? options.startTime : -1;
        let endTime = options.endTime || -1;
        let dt = options.dt || 0.04;
        const onEnded = options.callback;
        this.cropRect = options.rect ?? null;

        this.mirrorCanvas = options.mirror || false;
        this.stopVideoProcessing(); // stop previous video processing, if any

        // Hacky solution for video duration bug. Some videos do not have duration in metadata and browser has to discover it while playing/decoding the video
        // If it enters, there will probably be issues with the currentTime vs frame shown
        while( videoElement.duration === Infinity ) {
            videoElement.currentTime = 1000000 * Math.random();
            await new Promise(r => setTimeout(r, 1000)); 
        }

        videoElement.pause();
        startTime = Math.max( Math.min( videoElement.duration, startTime ), 0 );
        if ( endTime < -0.001 ) { 
            endTime = videoElement.duration; 
        }
        endTime = Math.max( Math.min( videoElement.duration, endTime ), startTime );
        dt = Math.max( dt, 0.001 );
        
        const listener = async () => {
            let cvp = this.currentVideoProcessing;

            await this.processFrame(cvp.videoElement, this.cropRect);
 
            cvp.currentTime = cvp.currentTime + cvp.dt;
            if (cvp.currentTime <= cvp.endTime){
                cvp.videoElement.currentTime = cvp.currentTime;
            }
            else {
                this.stopRecording();
                this.stopVideoProcessing();
                if ( cvp.onEnded ){ cvp.onEnded(); }
            }
        };
        
        this.startRecording();
        const listenerBind = listener.bind(this);
        videoElement.addEventListener( "seeked", listenerBind, false );
        videoElement.currentTime = -1; // this solves a htmlvideo bug. If removed, some videos will alwasy show currentTime=duration (god knows why).
        videoElement.currentTime = startTime;

        this.currentVideoProcessing = {
            videoElement: videoElement,
            currentTime: startTime,
            isOffline: true,
            startTime: startTime,
            endTime: endTime,
            dt: dt,
            onEnded: typeof( onEnded ) === 'function' ? onEnded : null,
            listenerBind: listenerBind,
            listenerID: listenerBind,
            listenerType: MediaPipe.PROCESSING_EVENT_TYPES.SEEK
        }
    }

    stopVideoProcessing() {
        if ( !this.currentVideoProcessing ) {
            return;
        }
        
        switch( this.currentVideoProcessing.listenerType ) {
            case MediaPipe.PROCESSING_EVENT_TYPES.SEEK:
                this.currentVideoProcessing.videoElement.removeEventListener( "seeked", this.currentVideoProcessing.listenerID, false );
                break;
            case MediaPipe.PROCESSING_EVENT_TYPES.VIDEOFRAME:
                this.currentVideoProcessing.videoElement.cancelVideoFrameCallback( this.currentVideoProcessing.listenerID );
                break;
            case MediaPipe.PROCESSING_EVENT_TYPES.ANIMATIONFRAME:
                window.cancelAnimationFrame( this.currentVideoProcessing.listenerID );
                break;
        }

        this.currentVideoProcessing = null;
    }

    startRecording() {
        this.recording = true;
        this.landmarks = [];
        this.blendshapes = [];
        this.rawData = [];
    }

    stopRecording() {
        this.recording = false;
        // Correct first dt of landmarks
        if ( this.landmarks.length ){ this.landmarks[0].dt = 0; }
        if ( this.blendshapes.length ){ this.blendshapes[0].dt = 0; }
    }
}

export { MediaPipe };