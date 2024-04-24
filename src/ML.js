import mlSavitzkyGolay from 'https://cdn.skypack.dev/ml-savitzky-golay';
import { TFModel } from "./libs/tensorFlowWrap.module.js";
import * as THREE from "three";
import { UTILS } from "./utils.js"

class NN {

    constructor( path ) {

        this.model = new TFModel( path );
    }

    loadLandmarks(landmarks, onLoad, onError) {

        this.nnDeltas = [];

        // Prepare landmarks for the NN (PLM + RLM + LLM)
        let firstNonNull = null;
        let lastNonNull = null;
        let timeOffset = [0, 0];

        this.landmarksNN = landmarks.map((v, idx) => {

            const dt = v.dt * 0.001;

            if (v.PLM !== undefined && v.RLM !== undefined && v.LLM !== undefined) {
                lastNonNull = idx;
                if (!firstNonNull) 
                    firstNonNull = idx;
            } else {
                if (!firstNonNull) {
                    // Add delta to start time
                    timeOffset[0] += dt;
                } else {
                    // Sub delta to end time
                    timeOffset[1] -= dt;
                }
            }

            if (v.PLM == undefined)
                v.PLM = new Array(25).fill(0).map((x) => ({x: undefined, y: undefined, z: undefined, visibility: undefined}));
            if (v.RLM == undefined)
                v.RLM = new Array(21).fill(0).map((x) => ({x: undefined, y: undefined, z: undefined, visibility: undefined}));
            if (v.LLM == undefined)
                v.LLM = new Array(21).fill(0).map((x) => ({x: undefined, y: undefined, z: undefined, visibility: undefined}));
            
            let vec1 = v.PLM.slice(0, -8).concat(v.RLM, v.LLM);
            let vec2 = vec1.map((x) => {return Object.values(x).slice(0, -2);}); // remove z and visibility
            
            this.nnDeltas.push( dt );

            return vec2.flat(1);
        });

        if (!firstNonNull || !lastNonNull) {
            let err = 'Missing landmarks error';
            if(onError)
                onError(err)
            throw(err);

        } 

        this.landmarksNN    = this.landmarksNN.slice(firstNonNull, lastNonNull + 1);
        this.nnDeltas       = this.nnDeltas.slice(firstNonNull, lastNonNull + 1);

        // First frame begins in 0
        this.nnDeltas[0] = 0;

        if(onLoad) 
            onLoad( timeOffset )
    }

    getFrameDelta(idx) {
        return this.nnDeltas[ idx ];
    }

    getQuaternions() {

        let landmarks = this.landmarksNN;
        let blankFrames = [];
        let quatData = [];

        for (let i = 0; i < landmarks.length; i++) {
            let outputNN = this.model.predictSampleSync( landmarks[i] );
            
            // Solve normalization problem
            for (let j = 0; j < outputNN.length; j+=4)
            {
                let val = new THREE.Quaternion(outputNN[j], outputNN[j+1], outputNN[j+2], outputNN[j+3]);
                val.normalize();
                outputNN[j] = val.x;
                outputNN[j+1] = val.y;
                outputNN[j+2] = val.z;
                outputNN[j+3] = val.w;
            }
            
            if (outputNN.includes(NaN)) blankFrames.push(i); // track lost frames
            
            quatData.push([0, 0.952298, 0, ... outputNN]); // add netral position to hip
        }
                                        
        // Linear interpolation to solves blank frames
        blankFrames = UTILS.consecutiveRanges(blankFrames);
        for (let range of blankFrames) {
            if (typeof range == 'number') {
                let frame = quatData[range];
                let prevFrame = quatData[range - 1];
                let nextFrame = quatData[range + 1];
                quatData[range] = frame.map( (v, idx) => {
                    let a = prevFrame[idx];
                    let b = nextFrame[idx];
                    return THREE.Math.lerp(a, b, 0.5);
                } );
            } else {
                let [x0, x1] = [... range];
                let n = x1 - x0 + 1; // Count middle frames
                let divisions = 1 / (n + 1); // Divide 1 by num of frames + 1
                let prevFrame = quatData[x0 - 1];
                let nextFrame = quatData[x1 + 1];

                // Compute lerp for all frames
                for (let i = x0; i <= x1; i++) {
                    let frame = quatData[i];
                    quatData[i] = frame.map( (v, idx) => {
                        let a = prevFrame[idx];
                        let b = nextFrame[idx];
                        return THREE.Math.lerp(a, b, divisions);
                    } );
                    divisions += divisions;
                }
            }
        }

        // Noise correction (Savitzky Golay filter)
        let aux = quatData;
        for (let coord = 3; coord < aux[0].length; coord++) {
            let data = [];
            aux.forEach( (frame) => { data.push(frame[coord]); }); // get the data of each coord per frame
            try {

                let ans = mlSavitzkyGolay(data, 1, { windowSize: 9, polynomial: 3, derivative: 0, pad: 'pre', padValue: 'replicate' }); //https://www.skypack.dev/view/ml-savitzky-golay
                quatData.forEach( (frame, idx) => { frame[coord] = ans[idx]; }); // replace with the posto data
            }
            catch {
                alert("Recording needs to last longer. Repeat it, please.")
                window.location.reload();
                break;
   
            }
        }

        return quatData;
    }
};

export { NN };