import mlSavitzkyGolay from 'https://cdn.skypack.dev/ml-savitzky-golay';
import { TFModel } from "./libs/tensorFlowWrap.module.js";
import * as THREE from "three";
import { UTILS } from "./utils.js"

class NN {

    constructor( bodyPath, handsPath ) {

        // this.model = new TFModel( path );
        this.bodyModel = new TFModel( bodyPath );
        this.handsModel = new TFModel( handsPath );
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

    frame6DToQuat( frame, out=null ) {
        let numQuats = Math.ceil( frame.length / 6 ); // avoid rounding errors
        if (out == null) {
            out = new Array(numQuats * 4).fill(0);
        }
        for (let i = 0; i < numQuats; i++) {    
            let x = frame.slice(i * 6, i * 6 + 3);
            let y = frame.slice(i * 6 + 3, i * 6 + 6);
            let xNorm = Math.sqrt( x[0] * x[0] + x[1] * x[1] + x[2] * x[2] ); // normalize
            x = x.map(val => val / xNorm);

            // gram-schmidt
            let dotProduct_raw = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; // dot product xNorm * yRaw
            y[0] = y[0] - dotProduct_raw * x[0];
            y[1] = y[1] - dotProduct_raw * x[1];
            y[2] = y[2] - dotProduct_raw * x[2];
            let yNorm = Math.sqrt( y[0] * y[0] + y[1] * y[1] + y[2] * y[2] ); // normalize
            y = y.map(val => val / yNorm);
            
            let z = [ x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0] ]; // cross product
            let zNorm = Math.sqrt( z[0] * z[0] + z[1] * z[1] + z[2] * z[2] );
            if (zNorm < 0.0000001) { console.log("frame6DToQuat error: invalid z" ); }
            else { z = z.map(val => val / zNorm); }
            
            let matrix = new THREE.Matrix3();
            matrix.set(x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]);
            let rot = new THREE.Matrix4();
            rot.setFromMatrix3(matrix); // 3x3 to Matrix4
            let quat = new THREE.Quaternion();
            quat.setFromRotationMatrix(rot);

            let dotTest= quat.x*quat.x + quat.y*quat.y + quat.z*quat.z +quat.w*quat.w;  
            if( dotTest  < 0.999 ){ print("problems", quat.toArray())}
            quat.normalize();
            out.splice(i * 4, 4, ...quat.toArray());
        }
        return out
    }

    frameQuatTo6D( frame, out=null ) {
        let numQuats = Math.ceil( frame.length / 4); // avoid rounding errors
        if (out == null) {
            out = new Array(numQuats * 4).fill(0);
        }
        for (let i = 0; i < numQuats; i++) {
            let quat = new THREE.Quaternion( frame[i*4 + 0], frame[i*4 + 1], frame[i*4 + 2], frame[i*4 + 3]);
            let rot = new THREE.Matrix4();
            rot.makeRotationFromQuaternion(quat);
            let idx = i*6
            out[ idx + 0 ] = rot.elements[0]; // [0][0]
            out[ idx + 1 ] = rot.elements[1]; // [1][0]
            out[ idx + 2 ] = rot.elements[2]; // [2][0]
            out[ idx + 3 ] = rot.elements[4]; // [0][1]
            out[ idx + 4 ] = rot.elements[5]; // [1][1]
            out[ idx + 5 ] = rot.elements[6]; // [2][1]
        }
        return out
    }

    unifyDatasetBodyParts( body_array, hands_array, size_of_entry = 6 ) {
        let result = new Array(size_of_entry * 44).fill(0);
        
        let frame = body_array;
        result.splice(0, 10 * size_of_entry, ...frame.slice(0, 10 * size_of_entry));
        result.splice(25 * size_of_entry, 4 * size_of_entry, ...frame.slice(10 * size_of_entry));
        
        frame = hands_array;
        result.splice(10 * size_of_entry, 15 * size_of_entry, ...frame.slice(0, 15 * size_of_entry));
        result.splice(29 * size_of_entry, result.length - 29 * size_of_entry, ...frame.slice(15 * size_of_entry));
        return result
    }

    getQuaternions() {

        let landmarks = this.landmarksNN;
        let blankFrames = [];
        let quatData = [];


        console.log( JSON.stringify(landmarks) )

        for (let i = 0; i < landmarks.length; i++) {
            // let outputNN = this.model.predictSampleSync( landmarks[i] );
            let bodyOutputNN = this.bodyModel.predictSampleSync( landmarks[i] );
            let handsOutputNN = this.handsModel.predictSampleSync( landmarks[i] );
            
            // Solve normalization problem
            // for (let j = 0; j < outputNN.length; j+=4)
            // {
            //     let val = new THREE.Quaternion(outputNN[j], outputNN[j+1], outputNN[j+2], outputNN[j+3]);
            //     val.normalize();
            //     outputNN[j] = val.x;
            //     outputNN[j+1] = val.y;
            //     outputNN[j+2] = val.z;
            //     outputNN[j+3] = val.w;
            // }

            let outputNN = this.unifyDatasetBodyParts(bodyOutputNN, handsOutputNN);
            outputNN = this.frame6DToQuat(outputNN); // from 6d to quaternions
            

            if (!window.test) {
                window.test = outputNN
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

                let ans = mlSavitzkyGolay(data, 1, { windowSize: 9, polynomial: 3, derivative: 0, pad: 'post', padValue: 'symmetric' }); //https://www.skypack.dev/view/ml-savitzky-golay
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