import { BehaviourPlanner, BehaviourManager, findIndexOfBoneByName, Blink, FacialExpr, FacialEmotion, GazeManager, Gaze, HeadBML, Lipsync, Text2LipInterface, T2LTABLES, LocationBodyArm, HandShape, ExtfidirPalmor, CircularMotion, DirectedMotion, FingerPlay, WristMotion, HandConstellation, ElbowRaise, ShoulderRaise, ShoulderHunch, BodyMovement, forceBindPoseQuats, getTwistQuaternion, nlerpQuats } from './BML.js';
import * as THREE  from 'three';
import { GeometricArmIK } from './IKSolver.js';
//@ECA controller

//States
CharacterController.prototype.WAITING = 0;
CharacterController.prototype.PROCESSING = 1;
CharacterController.prototype.SPEAKING = 2;
CharacterController.prototype.LISTENING = 3;

window.SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

function CharacterController(o) {

    this.time = 0;
    this.character = o.character;
    this.characterConfig = o.characterConfig;
    
    // get skeleton
    this.skeleton = null;
    this.character.traverse( ob => {
        if ( ob.isSkinnedMesh ) { this.skeleton = ob.skeleton; }
    } );
    o.skeleton = this.skeleton;

    /** BoneMap */
    // config has a generic name to bone name map. Transform it into a mapping of generic name to bone index (in skeleton). 
    for ( let p in this.characterConfig.boneMap ){
        this.characterConfig.boneMap[ p ] = findIndexOfBoneByName( this.skeleton, this.characterConfig.boneMap[ p ] );            
    }
    
    if (typeof BehaviourManager !== 'undefined') {
        this.BehaviourManager = new BehaviourManager();
    }else {
        console.error("Manager not included");
    }

    if (typeof BehaviourPlanner !== 'undefined') {
        this.BehaviourPlanner = new BehaviourPlanner();
        this.BehaviourPlanner.BehaviourManager = this.BehaviourManager;
    } else {
        console.error("Planner not included");
    }

    if (typeof FacialController !== 'undefined') {
        this.facialController = new FacialController(o);
    } else {
        console.error("FacialController module not found");
    }

    if ( typeof(BodyController) !== 'undefined'){ 
        this.bodyController = new BodyController( this.character, this.skeleton, this.characterConfig );
    } 

    this.automaticFlags = {
        blink: true,
        browRaise: true, // if false, planner update returned block will be ignored
    }
}

// options.blink, options.browRaise. Undefined flags will not change
CharacterController.prototype.setAutomaticFlags = function ( options ) {
    if ( !options ){ return; }
    if ( options.hasOwnProperty( "autoBlink" ) ){ 
        this.automaticFlags.blink = !!options.autoBlink;
        if ( this.facialController && this.facialController.autoBlink ){ 
            this.facialController.autoBlink.setAuto( this.automaticFlags.blink ); 
        }
    }
    if ( options.hasOwnProperty( "autoBrowRaise" ) ){ 
        this.automaticFlags.browRaise = !!options.autoBrowRaise;
    }
}

// options.blink, options.browRaise. Undefined flags will not change
CharacterController.prototype.start = function ( options ) {
    this.pendingResources = [];
    if ( this.facialController ){ this.facialController.start( options ); }
    this.setAutomaticFlags( options );
}

CharacterController.prototype.reset = function ( keepEmotion = false ) {
    this.pendingResources.length = 0;

    if ( this.facialController ){ this.facialController.reset( keepEmotion ); }

    if (this.BehaviourPlanner){ this.BehaviourPlanner.reset(); }

    if (this.BehaviourManager){ this.BehaviourManager.reset(); }

    if (this.bodyController){ this.bodyController.reset(); }

    this.endSpeakingTime = -1;
    this.speaking = false;

}

CharacterController.prototype.update = function (dt, et) {
    let newBlock = null;
    this.time = et;

    if ( this.facialController ){ this.facialController.update(dt); }

    if (this.bodyController){ this.bodyController.update(dt) }

    if (this.BehaviourPlanner){ newBlock = this.BehaviourPlanner.update(dt); }

    if (this.BehaviourManager){ this.BehaviourManager.update(this.processBML.bind(this), et); }

    if ( newBlock && this.automaticFlags.browRaise ){ this.BehaviourManager.newBlock(newBlock, et); }

    // lipsync stuff????
    if ( this.facialController ){
        if (this.BehaviourManager.lgStack.length && this.BehaviourManager.time <= this.BehaviourManager.lgStack[this.BehaviourManager.lgStack.length - 1].endGlobalTime) {
            this.endSpeakingTime = this.BehaviourManager.lgStack[this.BehaviourManager.lgStack.length - 1].endGlobalTime + 1
            this.speaking = true;
        }
        else if (this.endSpeakingTime > -1 && this.BehaviourManager.time <= this.endSpeakingTime || this.facialController.lipsyncModule.working) {
            this.speaking = true;
        }
        else {
            this.endSpeakingTime = -1;
            this.speaking = false;
        }
    }

}

// Process message
// Messages can come from inner processes. "fromWS" indicates if a reply to the server is required in BMLManager.js
CharacterController.prototype.processMsg = function (data, fromWS) {
    if ( !data ){ return; }
    // Update to remove aborted blocks
    if (!this.BehaviourManager)
        return;

    this.BehaviourManager.update(this.processBML.bind(this), this.time);

    // Add new block to stack
    //this.BehaviourManager.newBlock(msg, thiscene.time);
    if(typeof(data) == "string"){ data = JSON.parse(data); }
    if (data.type == "behaviours"){ data = data.data; }

    // Add new blocks to stack
    let msg = {};

    if (data.constructor == Array) {
        // start and end times of whole message
        let end = -1000000;
        let start = 1000000;

        for (let i = 0; i < data.length; i++) {

            if (data[i].type == "info")
                continue;

            // data based on duration. Fix timings from increments to timestamps
            if (!data[i].end && data[i].duration) {
                data[i].end = data[i].start + data[i].duration;
                if (data[i].attackPeak) data[i].attackPeak += data[i].start;
                if (data[i].ready) data[i].ready += data[i].start;
                if (data[i].strokeStart) data[i].strokeStart += data[i].start;
                if (data[i].stroke) data[i].stroke += data[i].start;
                if (data[i].strokeEnd) data[i].strokeEnd += data[i].start;
                if (data[i].relax) data[i].relax += data[i].start;
            }

            // include data of type into msg
            if (!msg[data[i].type]) {
                msg[data[i].type] = [];
            }
            msg[data[i].type].push(data[i]);

            // update start-end of msg
            if (data[i].end > end) end = data[i].end;
            if (data[i].start < start) start = data[i].start;
        }

        msg.start = start;
        msg.end = end;

        if (!msg.composition)
            msg.composition = "MERGE";

        if ( msg.speech && ( msg.speech.constructor == Object || msg.speech.length ) ) {
            msg.control = this.SPEAKING;
        }

        // Process block
        // manages transitions if necessary
        if (this.BehaviourPlanner) {
            this.BehaviourPlanner.newBlock(msg);
        }
        // add blocks to stacks
        this.BehaviourManager.newBlock(msg, this.time);
    }

    else if (data.constructor == Object) {
        msg = data;
        if ( (data.type == "state" || data.type == "control") && data.parameters) {
            msg.control = this[data.parameters.state.toUpperCase()];
        }
        else if (data.type == "info")
            return;

        if ( msg.speech && ( msg.speech.constructor == Object || msg.speech.length ) ) {
            msg.control = this.SPEAKING;
        }
        // Process block
        // manages transitions if necessary
        if (this.BehaviourPlanner) {
            this.BehaviourPlanner.newBlock(msg);
        }
        // add blocks to stacks
        this.BehaviourManager.newBlock(msg, this.time);
     }

    if (fromWS)
        msg.fromWS = fromWS;

    // Client id -> should be characterId?
    if (msg.clientId && !this.ws.id) {
        this.ws.id = msg.clientId;
        console.log("Client ID: ", msg.clientId);
        return;
    }

    // Load audio files
    if (msg.lg) {
        let hasToLoad = this.loadAudio(msg);
        if (hasToLoad) {
            this.pendingResources.push(msg);
            console.log("Needs to preload audio files.");
            return;
        }
    }

    if (!msg) {
        console.error("An undefined msg has been received.", msg);
        return;
    }

    // Update to remove aborted blocks
    if (!this.BehaviourManager)
        return;

    this.BehaviourManager.update(this.processBML.bind(this), this.time);

    if (!msg) {
        console.error("An undefined block has been created due to the update of BMLManager.", msg);
        return;
    }
}

// Process message
CharacterController.prototype.processBML = function (key, bml) {

    if ( ( !this.facialController && key != "gesture" ) || ( !this.bodyController && key == "gesture" ) )
        return;

    let thatFacial = this.facialController;

    switch (key) {
        case "blink":
            thatFacial.newBlink(bml);
            break;
        case "gaze":
            thatFacial.newGaze(bml, !!bml.shift); // !!shift make it bool (just in case)
            break;
        case "gazeShift":
            thatFacial.newGaze(bml, true);
            break;
        case "head":
            thatFacial.newHeadBML(bml);
            break;
        case "headDirectionShift":
            thatFacial.headDirectionShift(bml);
            break;
        case "face":
            thatFacial.newFA(bml, !!bml.shift); // !!shift make it bool (just in case)
            break;
        case "faceLexeme":
            thatFacial.newFA(bml, !!bml.shift); // !!shift make it bool (just in case)
            break;
        case "faceFACS":
            thatFacial.newFA(bml, false);
            break;
        case "faceEmotion":
            thatFacial.newFA(bml, !!bml.shift); // !!shift make it bool (just in case)
            break;
        case "faceVA":
            thatFacial.newFA(bml, !!bml.shift); // !!shift make it bool (just in case)
            break;
        case "faceShift":
            thatFacial.newFA(bml, true);
            break;
        case "speech":
            if (bml.phT)
                bml.phT = new Float32Array(Object.values(bml.phT));
            thatFacial.newTextToLip(bml);
            break;
        case "gesture":
            this.bodyController.newGesture( bml );
            break;
        case "animation":
            // TODO
            break;
        case "lg":
            thatFacial.newLipsync( bml );
            break;
    }
}

// Preloads audios to avoid loading time when added to BML stacks
CharacterController.prototype.loadAudio = function (block) {
    let output = false;
    if (block.lg.constructor === Array) {
        for (let i = 0; i < block.lg.length; i++) {
        if (!block.lg[i].audio) {
            block.lg[i].audio = new Audio();
            block.lg[i].audio.src = block.lg[i].url;
            output = true;
        }
        }
    }
    else {
        if (!block.lg.audio) {
            block.lg.audio = new Audio();
            block.lg.audio.src = block.lg.url;
            output = true;
        }
    }

    return output;
}
//@FacialController


function FacialController(config = null) {
    
    // define some properties
    this._gazePositions = {
        "RIGHT": new THREE.Vector3(-30, 2, 100), "LEFT": new THREE.Vector3(30, 2, 100),
        "UP": new THREE.Vector3(0, 20, 100), "DOWN": new THREE.Vector3(0, -20, 100),
        "UP_RIGHT": new THREE.Vector3(-30, 20, 100), "UP_LEFT": new THREE.Vector3(30, 20, 100),
        "DOWN_RIGHT": new THREE.Vector3(-30, -20, 100), "DOWN_LEFT": new THREE.Vector3(30, -20, 100),
        "FRONT": new THREE.Vector3(0, 2, 100), "CAMERA": new THREE.Vector3(0, 2, 100)
    };

    this._morphTargets = {}; // current avatar morph targets
    this._avatarParts = {}; // list of AU in each mesh of the avatar
    this._boneMap = {}; // bone name to index mapper
    this._mappingAU2BS = {}; // mappings of current (target) avatar BS to default (source) action units
    
    // default action units
    this._actionUnits = {
        "dictionary": {
                "Inner_Brow_Raiser": 0, "Outer_Brow_Raiser_Left": 1, "Outer_Brow_Raiser_Right": 2, "Brow_Lowerer_Left": 3, "Brow_Lowerer_Right": 4, "Nose_Wrinkler_Left": 5, "Nose_Wrinkler_Right": 6, "Nostril_Dilator": 7, "Nostril_Compressor": 8,
                "Dimpler_Left": 9, "Dimpler_Right": 10, "Upper_Lip_Raiser_Left": 11, "Upper_Lip_Raiser_Right": 12, "Lip_Corner_Puller_Left": 13, "Lip_Corner_Puller_Right": 14, "Lip_Corner_Depressor_Left": 15, "Lip_Corner_Depressor_Right": 16,
                "Lower_Lip_Depressor_Left": 17, "Lower_Lip_Depressor_Right": 18, "Lip_Puckerer_Left": 19, "Lip_Puckerer_Right": 20, "Lip_Stretcher_Left": 21, "Lip_Stretcher_Right": 22, "Lip_Funneler": 23, "Lip_Pressor_Left": 24, "Lip_Pressor_Right": 25,
                "Lips_Part": 26, "Lip_Suck_Upper": 27, "Lip_Suck_Lower": 28, "Lip_Wipe": 29, "Tongue_Up": 30, "Tongue_Show": 31, "Tongue_Bulge_Left": 32, "Tongue_Bulge_Right": 33, "Tongue_Wide": 34, "Mouth_Stretch": 35, "Jaw_Drop": 36, "Jaw_Thrust": 37,
                "Jaw_Sideways_Left": 38, "Jaw_Sideways_Right": 39, "Chin_Raiser": 40, "Cheek_Raiser_Left": 41, "Cheek_Raiser_Right": 42, "Cheek_Blow_Left": 43, "Cheek_Blow_Right": 44, "Cheek_Suck_Left": 45, "Cheek_Suck_Right": 46, "Upper_Lid_Raiser_Left": 47,
                "Upper_Lid_Raiser_Right": 48, "Squint_Left": 49, "Squint_Right": 50, "Blink_Left": 51, "Blink_Right": 52, "Wink_Left": 53, "Wink_Right": 54, "Neck_Tightener": 55
            },
        "influences": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    };

    this._eyeLidsAU = [51, 52]; // idx number of eyelids related AU - gaze and blink easy access
    this._squintAU = [49, 50]; // idx number of squint related AU - gaze and blink easy access
    
    // weighting factor for t2l interface
    this._t2lMap = {
        "kiss": ["Lip_Puckerer_Left", "Lip_Puckerer_Right"],
        "upperLipClosed": ["Lip_Suck_Upper"], 
        "lowerLipClosed": ["Lip_Suck_Lower"],
        "jawOpen": ["Mouth_Stretch"],
        "tongueFrontUp": ["Tongue_Up"],
        "tongueOut": ["Tongue_Show"],
    };

    // TODO: update a2l names ?
    this.lipsPressedBSName = "Jaw_Up";
    this.lowerLipINBSName = "Lip_Suck_Lower";
    this.lowerLipDownBSName = "Lower_Lip_Depressor_Left";
    this.mouthNarrowBSName = "MouthNarrow";
    this.mouthOpenBSName = "MouthOpen";
        
    this.lipsyncModule = new Lipsync();

    // if we have the state passed, then we restore the state
    if (config)
        this.configure(config);
}


FacialController.prototype.configure = function (o) {

    if (o.character) {
        this.character = o.character;
        this.skeleton = o.skeleton;
    }
    
    if (o.gazePositions) this._gazePositions = o.gazePositions;
    if (o.morphTargets) this._morphTargets = o.morphTargets;

    if(o.characterConfig) {
        this._mappingAU2BS = o.characterConfig.faceController.blendshapeMap;
        this._boneMap = o.characterConfig.boneMap;
        this._avatarParts = o.characterConfig.faceController.parts;
    }
}

FacialController.prototype.start = function ( options ) {

    this._morphTargets = {}; // map "name" of part to its scene obj
    for (const part in this._avatarParts) {
        let obj = this.character.getObjectByName(part);
        if ( !obj || !obj.morphTargetDictionary || !obj.morphTargetInfluences ){
            console.log( "FacialController: \"" + part + "\" object could not be found in the avatar" );
            delete this._avatarParts[ part ];
            continue;
        }
        this._morphTargets[part] = obj;

        if ( !Array.isArray( this._avatarParts[part] ) ){ // if not array of AU provided for this part, use all AUs
            this._avatarParts[part] = Object.keys(this._actionUnits.dictionary);
        }

    }
        
    this._facialAUAcc = this._actionUnits.influences.slice(); // clone array;
    this._facialAUFinal = this._actionUnits.influences.slice(); // clone array;

    if (!this._morphTargets) {
        console.error("Morph deformer not found");
        return;
    }
    
    this.resetFace();

    this._FacialLexemes = [];
    this.FA = new FacialEmotion(this._facialAUFinal);
    
    // Gaze
    // Get head bone node
    if (!this._boneMap.Head)
    console.error("Head bone node not found with id: ");
    else if (!this._gazePositions["HEAD"]) {
        let headNode = this.skeleton.bones[this._boneMap.Head];
        this._gazePositions["HEAD"] = headNode.getWorldPosition(new THREE.Vector3());
    }

    // Get lookAt nodes  
    let lookAtEyesNode = this.character.eyesTarget;
    let lookAtNeckNode = this.character.neckTarget;
    let lookAtHeadNode = this.character.headTarget;

    if (!this._gazePositions["EYESTARGET"]){ this._gazePositions["EYESTARGET"] = lookAtEyesNode.getWorldPosition(new THREE.Vector3()); }
    if (!this._gazePositions["HEADTARGET"]){ this._gazePositions["HEADTARGET"] = lookAtHeadNode.getWorldPosition(new THREE.Vector3()); }
    if (!this._gazePositions["NECKTARGET"]){ this._gazePositions["NECKTARGET"] = lookAtNeckNode.getWorldPosition(new THREE.Vector3()); }

    // Gaze manager
    this.gazeManager = new GazeManager(lookAtNeckNode, lookAtHeadNode, lookAtEyesNode, this._gazePositions);

    this.headBML = []; //null;

    this.autoBlink = new Blink( false );
    this.autoBlink.setAuto( ( options && options.hasOwnProperty( "autoBlink" ) ) ? options.autoBlink : true );
}

FacialController.prototype.reset = function ( keepEmotion = false ) {
    
    this.resetFace(); // blendshapes to 0
    
    if ( this.textToLip ) { this.textToLip.cleanQueueSentences( true ); }
    if ( this.lipsyncModule ) { this.lipsyncModule.stop(); }

    this._FacialLexemes.length = 0;
    if ( !keepEmotion ){ this.FA.reset(); } 

    this.gazeManager.reset();
    this.headBML.length = 0;

    if( this.blink ){ this.blink.reset(); }
}

FacialController.prototype.resetFace = function () {
    for (let i = 0; i < this._facialAUFinal.length; i++) {
        this._facialAUAcc[i] = 0;
        this._facialAUFinal[i] = 0;
        this._actionUnits.influences[i] = 0;
    }
}

/**  public update function (update inner BS and map them to current avatar) */ 
FacialController.prototype.update = function (dt) {

    // Update Facial BlendShapes
    this.innerUpdate(dt);

    // Map facialBS to current model BS
    let targetAccumulatedValues = {}; // store multiple value for each target
    
    for (let AUName in this._mappingAU2BS) {
        let avatarBSnames = this._mappingAU2BS[AUName]; // array of target avatar BS [names, factor]
        
        let idx = this._actionUnits.dictionary[AUName]; // index of source blendshape
        let value = this._actionUnits.influences[idx]; // value of source blendshape
        
        // map source value to all target BS
        for (let i = 0; i < avatarBSnames.length; i++) {
            let targetBSName = avatarBSnames[i][0];
            let targetBSFactor = avatarBSnames[i][1];
            
            if (!targetAccumulatedValues[targetBSName]) { targetAccumulatedValues[targetBSName] = []; }
            targetAccumulatedValues[targetBSName].push(value * targetBSFactor); // store the value in the array for this target
        }
    }
    
    // compute the mean influence value for each target
    for (let part in this._avatarParts) {
        // get AU names that influence current mesh (if null uses all AUs)
        let AUnames = this._avatarParts[part] ? this._avatarParts[part] : Object.keys(this._actionUnits.dictionary);
        for (let i = 0; i < AUnames.length; i++) {
            let avatarBSnames = this._mappingAU2BS[AUnames[i]] ? this._mappingAU2BS[AUnames[i]] : [];
            for (let i = 0; i < avatarBSnames.length; i++) {
                let targetBSName = avatarBSnames[i][0];
                let values = targetAccumulatedValues[targetBSName] ? targetAccumulatedValues[targetBSName] : [];
                let meanValue = 0;
                let acc = 0;
                let final = 0;

                // compute biased average
                for (let i = 0; i < values.length; i++) {
                    acc += Math.abs(values[i]);
                    final += values[i] * Math.abs(values[i]);
                }
                if (acc > 0.0001) meanValue = final / acc;
        
                // update the target blendshape with the mean value
                let targetIdx = this._morphTargets[part].morphTargetDictionary[targetBSName];
                if (targetIdx !== undefined) {
                    this._morphTargets[part].morphTargetInfluences[targetIdx] = meanValue;
                }
            }
        }
    }
}
    
//example of one method called for ever update event
FacialController.prototype.innerUpdate = function (dt) {

    // Update facial expression
    this.faceUpdate(dt);

    let lookAtEyes = this.character.eyesTarget.getWorldPosition(new THREE.Vector3());
    let lookAtHead = this.character.headTarget.getWorldPosition(new THREE.Vector3());
    let lookAtNeck = this.character.neckTarget.getWorldPosition(new THREE.Vector3());
    
    this.skeleton.bones[this._boneMap.Neck].lookAt(lookAtNeck);
    this.skeleton.bones[this._boneMap.Head].lookAt(lookAtHead);
    
    // HEAD (nod, shake, tilt, tiltleft, tiltright, forward, backward)
    let headQuat = this.skeleton.bones[this._boneMap.Head].quaternion; // Not a copy, but a reference
    let neckQuat = this.skeleton.bones[this._boneMap.Neck].quaternion; // Not a copy, but a reference
    for( let i = 0; i< this.headBML.length; ++i){
        let head = this.headBML[i];
        if( !head.transition ){
            this.headBML.splice(i,1);
            --i;
            continue;
        }
        head.update(dt);
        if(head.lexeme == "FORWARD" || head.lexeme == "BACKWARD") {
            neckQuat.multiply( head.currentStrokeQuat );
            headQuat.multiply( head.currentStrokeQuat.invert() );
            head.currentStrokeQuat.invert(); // inverting quats is cheap
        } 
        else
            headQuat.multiply( head.currentStrokeQuat );
    }

    this.skeleton.bones[this._boneMap.LEye].lookAt(lookAtEyes);
    this.skeleton.bones[this._boneMap.REye].lookAt(lookAtEyes);
}

// Update facial expressions
FacialController.prototype.faceUpdate = function (dt) {
    
    // reset accumulators for biased average
    this._facialAUAcc.fill(0);
    this._facialAUFinal.fill(0);
    
    // Text to lip
    if (this.textToLip && this.textToLip.getCompactState() == 0) { // when getCompactState==0 lipsync is working, not paused and has sentences to process
        this.textToLip.update(dt);
        let t2lBSW = this.textToLip.getBSW(); // reference, not a copy
        for (let i = 0; i < this.textToLipBSMapping.length; i++) {
            let mapping = this.textToLipBSMapping[i];
            let value = Math.min(1, Math.max(-1, t2lBSW[mapping[1]]));
            let index = mapping[0];
            // for this model, some blendshapes need to be negative
            this._facialAUAcc[index] += Math.abs(value); // denominator of biased average
            this._facialAUFinal[index] += value * Math.abs(value); // numerator of biased average
        }
    }

    // lipsync
    if (this.lipsyncModule && this.lipsyncModule.working) // audio to lip
    {
        this.lipsyncModule.update(dt);
        let facialLexemes = this.lipsyncModule.BSW;
        if (facialLexemes) {

            let smooth = 0.66;
            let BSAcc = this._facialAUAcc;
            let BSFin = this._facialAUFinal;
            let BS = this._actionUnits.influences; // for smoothing purposes
            let morphDict = this._actionUnits.dictionary;
            // search every morphTarget to find the proper ones
            let names = Object.keys(morphDict);
            for (let i = 0; i < names.length; i++) {

                let name = names[i];
                let bsIdx = morphDict[name];
                let value = 0;
                if (name.includes(this.mouthOpenBSName))
                    value = (1 - smooth) * BS[bsIdx] + smooth * facialLexemes[2];

                if (name.includes(this.lowerLipINBSName))
                    value = (1 - smooth) * BS[bsIdx] + smooth * facialLexemes[1];

                if (name.includes(this.lowerLipDownBSName))
                    value = (1 - smooth) * BS[bsIdx] + smooth * facialLexemes[1];

                if (name.includes(this.mouthNarrowBSName))
                    value = (1 - smooth) * BS[bsIdx] + smooth * facialLexemes[0] * 0.5;

                if (name.includes(this.lipsPressedBSName))
                    value = (1 - smooth) * BS[bsIdx] + smooth * facialLexemes[1];

                BSAcc[bsIdx] += Math.abs(value); // denominator of biased average
                BSFin[bsIdx] += value * Math.abs(value); // numerator of biased average

            }
        }
    }

    //FacialEmotion ValAro/Emotions
    this.FA.updateVABSW(dt);

    for (let j = 0; j < this.FA.currentVABSW.length; j++) {
        let value = this.FA.currentVABSW[j];
        this._facialAUAcc[j] += Math.abs(value); // denominator of biased average
        this._facialAUFinal[j] += value * Math.abs(value); // numerator of biased average
    }

    // FacialExpr lexemes
    for (let k = 0; k < this._FacialLexemes.length; k++) {
        let lexeme = this._FacialLexemes[k];
        if (lexeme.transition) {
            lexeme.updateLexemesBSW(dt);
            // accumulate blendshape values
            for (let i = 0; i < lexeme.indicesLex.length; i++) {
                for (let j = 0; j < lexeme.indicesLex[i].length; j++) {
                    let value = lexeme.currentLexBSW[i][j];
                    let index = lexeme.indicesLex[i][j];
                    this._facialAUAcc[index] += Math.abs(value); // denominator of biased average
                    this._facialAUFinal[index] += value * Math.abs(value); // numerator of biased average
                }
            }
        }

        // remove lexeme if finished
        if (!lexeme.transition) {
            this._FacialLexemes.splice(k, 1);
            --k;
        }
    }

    // Gaze
    if (this.gazeManager){
        let weights = this.gazeManager.update(dt);

        // eyelids update
        for(let i = 0; i< this._eyeLidsAU.length; i++){         
            this._facialAUAcc[ this._eyeLidsAU[i] ] += Math.abs(weights.eyelids);
            this._facialAUFinal[ this._eyeLidsAU[i] ] += weights.eyelids * Math.abs(weights.eyelids);
        }
        // squint update
        for(let i = 0; i< this._squintAU.length; i++){         
            this._facialAUAcc[ this._squintAU[i] ] += Math.abs(weights.squint);
            this._facialAUFinal[ this._squintAU[i] ] += weights.squint * Math.abs(weights.squint);
        }
    }


    // Second pass, compute mean (division)
    // result = ( val1 * |val1|/|sumVals| ) + ( val2 * |val2|/|sumVals| ) + ...
    // copy blendshape arrays back to real arrays and compute biased average  
    let target = this._facialAUFinal;
    let numerator = this._facialAUFinal;
    let acc = this._facialAUAcc;
    for (let i = 0; i < target.length; ++i) {
        if (acc[i] < 0.0001) { target[i] = 0; }
        else { target[i] = numerator[i] / acc[i]; }
    }

    // --- UPDATE POST BIASED AVERAGE --- 
    // this._facialAUFinal has all the valid values

    // Eye blink
    if ( this.autoBlink.state ) {
        this.autoBlink.update(dt, this._facialAUFinal[this._eyeLidsAU[0]], this._facialAUFinal[this._eyeLidsAU[1]]);
        this._facialAUFinal[this._eyeLidsAU[0]] = this.autoBlink.weights[0];
        this._facialAUFinal[this._eyeLidsAU[1]] = this.autoBlink.weights[1];
    }

    // "Render" final facial (body) blendshapes
    // copy blendshape arrays back to real arrays
    let tar = this._actionUnits.influences;
    let source = this._facialAUFinal;
    for (let i = 0; i < tar.length; ++i) {
        tar[i] = source[i];
    }

}


// ----------------------- TEXT TO LIP --------------------
// Create a Text to Lip mouthing
FacialController.prototype.newTextToLip = function (bml) {
    
    if (!this.textToLip) { // setup

        this.textToLip = new Text2LipInterface();
        this.textToLip.start(); // keep started but idle
        this.textToLipBSMapping = []; // array of [ MeshBSIndex, T2Lindex ]

        let t2lBSWMap = T2LTABLES.BlendshapeMapping;

        // map blendshapes to text2lip output
        for(const part in this._t2lMap) {
            for(let i = 0; i < this._t2lMap[part].length; i++) {
                // instead of looping through all BS, access directly the index of the desired blendshape
                let idx = this._actionUnits.dictionary[this._t2lMap[part][i]];
                if (idx) this.textToLipBSMapping.push([ idx, t2lBSWMap[part]]);
            }
        }
    }

    let text = bml.text;
    if ( text[ text.length - 1 ] != "." ){ text += "."; } 
    this.textToLip.cleanQueueSentences();
    this.textToLip.pushSentence(bml.text, bml); // use info object as options container also  
}


// --------------------- lipsync --------------------------------
// Create a Text to Lip mouthing
FacialController.prototype.newLipsync = function (bml) {
    
    if (!this.lipsyncModule)
        return;

    if (bml.audio)
        this.lipsyncModule.loadBlob(bml.audio);
    else if (bml.url)
        this.lipsyncModule.loadSample(bml.url);
}


// --------------------- FACIAL EXPRESSIONS ---------------------
// BML
// <face or faceShift start attackPeak relax* end* valaro
// <faceLexeme start attackPeak relax* end* lexeme amount
// <faceFacs not implemented>
// lexeme  [OBLIQUE_BROWS, RAISE_BROWS,
//      RAISE_LEFT_BROW, RAISE_RIGHT_BROW,LOWER_BROWS, LOWER_LEFT_BROW,
//      LOWER_RIGHT_BROW, LOWER_MOUTH_CORNERS,
//      LOWER_LEFT_MOUTH_CORNER,
//      LOWER_RIGHT_MOUTH_CORNER,
//      RAISE_MOUTH_CORNERS,
//      RAISE_RIGHT_MOUTH_CORNER,
//      RAISE_LEFT_MOUTH_CORNER, OPEN_MOUTH,
//      OPEN_LIPS, WIDEN_EYES, CLOSE_EYES]
//
// face/faceShift can contain several sons of type faceLexeme without sync attr
// valaro Range [-1, 1]

// TODO: THIS CAUSES PROBLEMS????
// Declare new facial expression
FacialController.prototype.newFA = function (faceData, shift) {
    
    // Use BSW of the agent
    for (let i = 0; i < this._facialAUFinal.length; i++) {
        this._facialAUFinal[i] = this._actionUnits.influences[i];
    }
    if (faceData.emotion || faceData.valaro) {
        this.FA.initFaceValAro(faceData, shift, this._facialAUFinal); // new FacialExpr (faceData, shift, this._facialAUFinal);
    }
    else if (faceData.lexeme) {
        this._FacialLexemes.push(new FacialExpr(faceData, shift, this._facialAUFinal));
    }

}

// --------------------- BLINK ---------------------
FacialController.prototype.newBlink = function ( bml ){
    this.autoBlink.blink();
}

// --------------------- GAZE ---------------------
// BML
// <gaze or gazeShift start ready* relax* end influence target influence offsetAngle offsetDirection>
// influence [EYES, HEAD, NECK, SHOULDER, WAIST, WHOLE, ...]
// offsetAngle relative to target
// offsetDirection (of offsetAngle) [RIGHT, LEFT, UP, DOWN, UP_RIGHT, UP_LEFT, DOWN_LEFT, DOWN_RIGHT]
// target [CAMERA, RIGHT, LEFT, UP, DOWN, UP_RIGHT, UP_LEFT, DOWN_LEFT, DOWN_RIGHT]

// "HEAD" position is added on Start

FacialController.prototype.newGaze = function (gazeData, shift, gazePositions = null) {

    // TODO: recicle gaze in gazeManager
    let blinkW = this._facialAUFinal[0]
    let eyelidsW = this._facialAUFinal[this._eyeLidsAU[0]]
    let squintW = this._facialAUFinal[this._squintAU[0]]
    gazeData.eyelidsWeight = eyelidsW;
    gazeData.squintWeight = squintW;
    gazeData.blinkWeight = blinkW;

    this.gazeManager.newGaze(gazeData, shift, gazePositions, !!gazeData.headOnly);

}

// BML
// <headDirectionShift start end target>
// Uses gazeBML
FacialController.prototype.headDirectionShift = function (headData, cmdId) {
    
    headData.end = headData.end || 2.0;
    headData.influence = "HEAD";
    this.newGaze(headData, true, null, true);
}

// --------------------- HEAD ---------------------
// BML
// <head start ready strokeStart stroke strokeEnd relax end lexeme repetition amount>
// lexeme [NOD, SHAKE, TILT, TILT_LEFT, TILT_RIGHT, FORWARD, BACKWARD]
// repetition cancels stroke attr
// amount how intense is the head nod? 0 to 1
// New head behavior
FacialController.prototype.newHeadBML = function (headData) {
    
    // work with indexes instead of names
    let node = headData.lexeme == "FORWARD" || headData.lexeme == "BACKWARD" ? this._boneMap.Neck : this._boneMap.Head;
    let bone = this.skeleton.bones[node]; // let bone = this.character.getObjectByName(node);
    if (bone) {
        this.headBML.push(new HeadBML(headData, bone, bone.quaternion.clone()));
    }
}





// characterConfig is modified by bodyController
class BodyController{
    
    constructor( character, skeleton, characterConfig ){
        this.character = character;
        this.skeleton = skeleton;
        this.computeConfig( characterConfig );

        // -------------- All modules --------------
        forceBindPoseQuats( this.skeleton, true ); // so all modules can setup things in bind pose already
        this.character.updateWorldMatrix( true, true );
        this.right = this._createArm( false );
        this.left = this._createArm( true );
        this.handConstellation = new HandConstellation( this.config.boneMap, this.skeleton, this.config.handLocationsR, this.config.handLocationsL );
        this.bodyMovement = new BodyMovement( this.config, this.skeleton );

        this.dominant = this.right;
        this.nonDominant = this.left;

        this._tempQ_0 = new THREE.Quaternion();
        this._tempQ_1 = new THREE.Quaternion();
        this._tempV3_0 = new THREE.Vector3();
        this._tempV3_1 = new THREE.Vector3();

        this.foreArmFactor = 0.6;
    }

    computeConfig( jsonConfig ){
        // reference, not a copy. All changes also affect the incoming characterConfig
        this.config = jsonConfig.bodyController; 

        this.config.boneMap = jsonConfig.boneMap; // reference, not a copy

        /** Main Avatar Axes in Mesh Coordinates */
        if ( this.config.axes ){ 
            for( let i = 0; i < this.config.axes.length; ++i ){ // probably axes are a simple js object {x:0,y:0,z:0}. Convert it to threejs
                this.config.axes[i] = new THREE.Vector3(  this.config.axes[i].x, this.config.axes[i].y, this.config.axes[i].z ); 
            }
        } else{ 
            // compute axes in MESH coordinates using the the Bind pose ( TPose mandatory )
            // MESH coordinates: the same in which the actual vertices are located, without any rigging or any matrix applied
            this.config.axes = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ]; // x,y,z
            let boneMap = this.config.boneMap;
            this.skeleton.bones[ boneMap.Hips ].updateWorldMatrix( true, true ); // parents and children also
    
            let a = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ boneMap.LShoulder ].clone().invert() );
            let b = (new THREE.Vector3()).setFromMatrixPosition( this.skeleton.boneInverses[ boneMap.RShoulder ].clone().invert() );
            this.config.axes[0].subVectors( a, b ).normalize(); // x
    
            a = a.setFromMatrixPosition( this.skeleton.boneInverses[ boneMap.BelowStomach ].clone().invert() );
            b = b.setFromMatrixPosition( this.skeleton.boneInverses[ boneMap.Hips ].clone().invert() );
            this.config.axes[1].subVectors( a, b ).normalize(); // y
            
            this.config.axes[2].crossVectors( this.config.axes[0], this.config.axes[1] ).normalize(); // z = cross( x, y )
            this.config.axes[1].crossVectors( this.config.axes[2], this.config.axes[0] ).normalize(); // y = cross( z, x )
        }

        /** Body and Hand Locations */
        // create location point objects and attach them to bones
        function locationToObjects( table, skeleton, symmetry = false ){
            let result = {};
            for( let name in table ){
                let l = table[ name ];
                
                let idx = findIndexOfBoneByName( skeleton, symmetry ? l[0].replace( "Right", "Left" ) : l[0] );
                if ( idx < 0 ){ continue; }
                
                let o = new THREE.Object3D();
                // let o = new THREE.Mesh( new THREE.SphereGeometry(0.3,16,16), new THREE.MeshStandardMaterial( { color: Math.random()*0xffffff }) );
                o.position.copy( l[1] ).applyMatrix4( skeleton.boneInverses[ idx ] ); // from mesh space to bone local space
                
                // check direction of distance vector 
                if ( l[2] ){
                    let m3 = new THREE.Matrix3();
                    m3.setFromMatrix4( skeleton.boneInverses[ idx ] );
                    o.direction = (new THREE.Vector3()).copy( l[2] ).applyMatrix3( m3 );
                }
                // o.position.copy( l[1] );
                // if ( symmetry ){ o.position.x *= -1; }
                o.name = name;
                skeleton.bones[ idx ].add( o );
                result[ name ] = o;
            }
            return result;   
        }
        this.config.bodyLocations = locationToObjects( this.config.bodyLocations, this.skeleton, false );
        this.config.handLocationsL = locationToObjects( this.config.handLocationsL ? this.config.handLocationsL : this.config.handLocationsR, this.skeleton, !this.config.handLocationsL ); // assume symmetric mesh/skeleton
        this.config.handLocationsR = locationToObjects( this.config.handLocationsR, this.skeleton, false ); // since this.config is being overwrite, generate left before right

        /** default elbow raise, shoulder raise, shoulder hunch */
        let correctedDefaultAngles = {
            elbowRaise: 0,
            shoulderRaise: [ 0, -5 * Math.PI/180, 45 * Math.PI/180 ], // always present angle, min angle, max angle
            shoulderHunch: [ 0, -10 * Math.PI/180, 55 * Math.PI/180 ], // always present angle, min angle, max angle
        }
        if ( typeof( this.config.elbowRaise ) == "number" ){ correctedDefaultAngles.elbowRaise = this.config.elbowRaise * Math.PI/180; }
        if ( Array.isArray( this.config.shoulderRaise ) ){ 
            for( let i = 0; i < 3 && i < this.config.shoulderRaise.length; ++i ){ 
                correctedDefaultAngles.shoulderRaise[i] = this.config.shoulderRaise[i] * Math.PI/180; 
            } 
            if ( correctedDefaultAngles.shoulderRaise[1] > 0 ){ correctedDefaultAngles.shoulderRaise[1] = 0; }
            if ( correctedDefaultAngles.shoulderRaise[2] < 0 ){ correctedDefaultAngles.shoulderRaise[2] = 0; }
        }
        if ( Array.isArray( this.config.shoulderHunch ) ){ 
            for( let i = 0; i < 3 && i < this.config.shoulderHunch.length; ++i ){ 
                correctedDefaultAngles.shoulderHunch[i] = this.config.shoulderHunch[i] * Math.PI/180; 
            } 
            if ( correctedDefaultAngles.shoulderHunch[1] > 0 ){ correctedDefaultAngles.shoulderHunch[1] = 0; }
            if ( correctedDefaultAngles.shoulderHunch[2] < 0 ){ correctedDefaultAngles.shoulderHunch[2] = 0; }
        }
        this.config.elbowRaise = correctedDefaultAngles.elbowRaise;
        this.config.shoulderRaise = correctedDefaultAngles.shoulderRaise;
        this.config.shoulderHunch = correctedDefaultAngles.shoulderHunch;

        /** finger angle ranges */
        let angleRanges = [ // in case of config...
            [ [ 0, 45*Math.PI/180 ] ],//[ [ 0, Math.PI * 0.2 ], [ 0, Math.PI * 0.5 ], [ 0, Math.PI * 0.4 ], [ 0, Math.PI * 0.4 ] ],  // [ splay, base, mid, high ]
            [ [ 0, 20*Math.PI/180 ], [ 0, Math.PI * 0.5 ], [ 0, Math.PI * 0.6 ], [ 0, Math.PI * 0.5 ] ], // [ splay, base, mid, high ]
            [ [ 0, 20*Math.PI/180 ], [ 0, Math.PI * 0.5 ], [ 0, Math.PI * 0.6 ], [ 0, Math.PI * 0.5 ] ], // [ splay, base, mid, high ]
            [ [ 0, 20*Math.PI/180 ], [ 0, Math.PI * 0.5 ], [ 0, Math.PI * 0.6 ], [ 0, Math.PI * 0.5 ] ], // [ splay, base, mid, high ]
            [ [ 0, 20*Math.PI/180 ], [ 0, Math.PI * 0.5 ], [ 0, Math.PI * 0.6 ], [ 0, Math.PI * 0.5 ] ], // [ splay, base, mid, high ]
        ];
        if ( Array.isArray( this.config.fingerAngleRanges ) ){
            let userAngleRanges = this.config.fingerAngleRanges;
            for( let i = 0; i < angleRanges.length && i < userAngleRanges.length; ++i ){ // for each finger available
                let fingerRanges = angleRanges[i];
                let userFingerRanges = userAngleRanges[i]
                if( !Array.isArray( userFingerRanges ) ){ continue; }
                for( let j = 0; j < fingerRanges.length && j < userFingerRanges.length; ++j ){ // for each range in the finger available
                    let range = fingerRanges[j];
                    let userRange = userFingerRanges[j];
                    if ( !Array.isArray( userRange ) || userRange.length < 2 ){ continue; }
                    let v = userRange[0] * Math.PI / 180; 
                    range[0] = isNaN( v ) ? range[0] : v; 
                    v = userRange[1] * Math.PI / 180; 
                    range[1] = isNaN( v ) ? range[1] : v; 
                }
            }
        }
        this.config.fingerAngleRanges = angleRanges;


    }
    _createArm( isLeftHand = false ){
        return {
            loc: new LocationBodyArm( this.config, this.skeleton, isLeftHand ),
            locMotions: [],
            extfidirPalmor: new ExtfidirPalmor( this.config, this.skeleton, isLeftHand ),
            wristMotion: new WristMotion( this.config, this.skeleton, isLeftHand ),
            handshape: new HandShape( this.config, this.skeleton, isLeftHand ),
            fingerplay: new FingerPlay(),
            elbowRaise: new ElbowRaise( this.config, this.skeleton, isLeftHand ),
            shoulderRaise: new ShoulderRaise( this.config, this.skeleton, isLeftHand ),
            shoulderHunch: new ShoulderHunch( this.config, this.skeleton, isLeftHand ),

            needsUpdate: false,
            ikSolver: new GeometricArmIK( this.skeleton, this.config, isLeftHand ),
            locUpdatePoint: new THREE.Vector3(0,0,0),
            _tempWristQuat: new THREE.Quaternion(0,0,0,1), // stores computed extfidir + palmor before any arm movement applied. Necessary for locBody + handConstellation

        };
    }

    _resetArm( arm ){
        arm.loc.reset();
        arm.locMotions = [];
        arm.wristMotion.reset();
        arm.handshape.reset();
        arm.fingerplay.reset();
        arm.elbowRaise.reset();
        arm.shoulderRaise.reset();
        arm.shoulderHunch.reset();
        arm.locUpdatePoint.set(0,0,0);
        arm.needsUpdate = false;

        arm.extfidirPalmor.reset();

    }
    
    reset(){

        this.bodyMovement.reset();
        this.handConstellation.reset();
        this._resetArm( this.right );
        this._resetArm( this.left );

        // this posture setting is quite hacky. To avoid dealing with handConstellation shift (not trivial)
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, locationBodyArm: "neutral", hand: "RIGHT", distance: 0.0251, srcContact:"HAND_PALMAR", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, locationBodyArm: "neutral", hand: "LEFT",  distance: 0.0251, srcContact:"HAND_PALMAR", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, handshape: "FLAT", mainBend: "ROUND", tco:0.5, hand: "RIGHT", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, handshape: "FLAT", mainBend: "ROUND", tco:0.75, hand: "LEFT", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, palmor: "l", hand: "RIGHT", shift: true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, palmor: "r", hand: "LEFT", shift: true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, extfidir: "dl", hand: "RIGHT", mode: "local", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, extfidir: "dr", hand: "LEFT", mode: "local", shift:true } );
        this.newGesture( { type: "gesture", start: 0, attackPeak: 0.1, relax:0.2, end: 0.3, handConstellation: true, hand: "right", srcContact: "2_mid_palmar", secondSrcContact: "2_pad_palmar", dstContact:"hand_ulnar" } );

        this.update( 0.15 );
        this.left.loc.def.copy( this.left.locUpdatePoint ); // hack
        this.right.loc.def.copy( this.right.locUpdatePoint ); // hack
        this.update( 1 );
    }

    setDominantHand( isRightHandDominant ){
        if( isRightHandDominant ){ this.dominant = this.right; this.nonDominant = this.left; }
        else{ this.dominant = this.left; this.nonDominant = this.right; }
    }

    _updateLocationMotions( dt, arm ){
        let computeFlag = false;

        let motions = arm.locMotions;
        let resultOffset = arm.locUpdatePoint;
        resultOffset.set(0,0,0);

        // check if any motion is active and update it
        for ( let i = 0; i < motions.length; ++i ){
            if ( motions[i].transition ){
                computeFlag = true;
                resultOffset.add( motions[i].update( dt ) );
            }else{
                motions.splice(i, 1); // removed motion that has already ended
                i--;
            }
        }
        return computeFlag; 
    }

    _updateArm( dt, arm ){
        let bones = this.skeleton.bones;

        // reset shoulder, arm, elbow. This way location body, motion and location hand can be safely computed
        bones[ arm.loc.idx.shoulder ].quaternion.set(0,0,0,1);
        bones[ arm.loc.idx.arm ].quaternion.set(0,0,0,1);
        bones[ arm.loc.idx.elbow ].quaternion.set(0,0,0,1);

        // overwrite finger rotations
        arm.fingerplay.update(dt); // motion, prepare offsets
        arm.handshape.update( dt, arm.fingerplay.transition ? arm.fingerplay.curBends : null );
      
        // wrist point and twist
        arm.extfidirPalmor.update(dt);

        // wristmotion. ADD rotation to wrist
        arm.wristMotion.update(dt); // wrist - add rotation

        // backup the current wrist quaternion, before any arm rotation is applied
        arm._tempWristQuat.copy( arm.extfidirPalmor.wristBone.quaternion );

        // update arm posture world positions but do not commit results to the bones, yet.
        arm.loc.update( dt );
        let motionsRequireUpdated = this._updateLocationMotions( dt, arm );

        arm.elbowRaise.update( dt );
        arm.shoulderRaise.update( dt );
        arm.shoulderHunch.update( dt );

        arm.needsUpdate = motionsRequireUpdated | arm.fingerplay.transition | arm.handshape.transition | arm.wristMotion.transition | arm.extfidirPalmor.transition | arm.loc.transition | arm.elbowRaise.transition | arm.shoulderRaise.transition | arm.shoulderHunch.transition;
    }

    update( dt ){
        if ( !this.bodyMovement.transition && !this.right.needsUpdate && !this.left.needsUpdate && !this.handConstellation.transition ){ return; }

        this.bodyMovement.forceBindPose();

        this._updateArm( dt, this.right );
        this._updateArm( dt, this.left );
        
        if ( this.handConstellation.transition ){ 
            // 2 iks, one for body positioning and a second for hand constellation + motion
            // if only points in hand were used in handConstellation, the first ik could be removed. But forearm-elbow-upperarm locations require 2 iks

            // compute locBody and fix wrist quaternion (forearm twist correction should not be required. Disable it and do less computations)
            // using loc.cur.p, without the loc.cur.offset. Compute handConstellation with raw locBody
            this.right.ikSolver.reachTarget( this.right.loc.cur.p, this.right.elbowRaise.curValue, this.right.shoulderRaise.curValue, this.right.shoulderHunch.curValue, false ); //ik without aesthetics. Aesthetics might modify 
            this.left.ikSolver.reachTarget( this.left.loc.cur.p, this.left.elbowRaise.curValue, this.left.shoulderRaise.curValue, this.left.shoulderHunch.curValue, false );
            this._fixArmQuats( this.right, false );
            this._fixArmQuats( this.left, false );

            // handconstellation update, add motions and ik
            this.handConstellation.update( dt );
            this.right.locUpdatePoint.add( this.handConstellation.curOffsetR ); // HandConstellation + motions
            this.left.locUpdatePoint.add( this.handConstellation.curOffsetL ); // HandConstellation + motions
        }

        // if only location body and motions. Do only 1 ik per arm
        this.right.locUpdatePoint.add( this.right.loc.cur.p );
        this.right.locUpdatePoint.add( this.right.loc.cur.offset );
        this.right.ikSolver.reachTarget( this.right.locUpdatePoint, this.right.elbowRaise.curValue, this.right.shoulderRaise.curValue, this.right.shoulderHunch.curValue, true ); // ik + aesthetics

        this.left.locUpdatePoint.add( this.left.loc.cur.p );
        this.left.locUpdatePoint.add( this.left.loc.cur.offset );
        this.left.ikSolver.reachTarget( this.left.locUpdatePoint, this.left.elbowRaise.curValue, this.left.shoulderRaise.curValue, this.left.shoulderHunch.curValue, true ); // ik + aesthetics
    
        this._fixArmQuats( this.right, true );   
        this._fixArmQuats( this.left, true );  
        
        this.bodyMovement.update( dt );
    }


    /* TODO
        do not take into account bind quats
        Upperarm twist correction, forearm twist correction, wrist correction
    */
    _fixArmQuats( arm, fixForearm = false ){
        let q0 = this._tempQ_0;
        let q1 = this._tempQ_1;
        let bones = this.skeleton.bones;
        let fa = arm.extfidirPalmor.twistAxisForearm;       // forearm axis
        let fq = arm.extfidirPalmor.forearmBone.quaternion; // forearm quat
        let wa = arm.extfidirPalmor.twistAxisWrist;         // wrist axis
        let wq = arm.extfidirPalmor.wristBone.quaternion;   // wrist quat

        // --- Wrist ---
        // wrist did not know about arm quaternions. Compensate them
        q0.copy( bones[ arm.loc.idx.shoulder ].quaternion );
        q0.multiply( bones[ arm.loc.idx.arm ].quaternion );
        q0.multiply( bones[ arm.loc.idx.elbow ].quaternion );
        q0.invert();
        wq.copy( arm._tempWristQuat ).premultiply( q0 );  
        
        if ( !fixForearm ){ return } // whether to correct forearm twisting also

        // --- Forearm ---       
        let poseV = this._tempV3_0;   
        poseV.copy( arm.extfidirPalmor.elevationAxis );
        getTwistQuaternion( wq, wa, q0 );
        poseV.applyQuaternion( q0 ); // add current twisting
        getTwistQuaternion( arm.ikSolver.bindQuats.wrist, wa, q0 );
        poseV.applyQuaternion( q0.invert() ); // do not take into account possible bind twisting (could be removed if avatar is ensured to not have any twist in bind)

        // get angle, angle sign and ajust edge cases
        let angle = Math.acos( poseV.dot( arm.extfidirPalmor.elevationAxis ) );
        this._tempV3_1.crossVectors( arm.extfidirPalmor.elevationAxis, poseV );
        if ( this._tempV3_1.dot( arm.extfidirPalmor.twistAxisWrist ) < 0 ){ angle *= -1; }
        if ( arm == this.right && angle < -2.61 ){ angle = Math.PI*2 + angle; } // < -150
        if ( arm == this.left && angle > 2.61 ){ angle = -Math.PI*2 + angle; } // > 150
        
        // do not apply all twist to forearm as it may look bad on the elbow (assuming one-bone forearm)
        angle *= this.foreArmFactor;
        q0.setFromAxisAngle( fa, angle );
        fq.multiply( q0 ); // forearm
        wq.premultiply( q0.invert() ); // wrist did not know about this twist, undo it
    }

    _newGestureArm( bml, arm, symmetry = 0x00 ){
        if ( bml.locationBodyArm ){ // when location change, cut directed and circular motions
            // this.bodyMovement.forceBindPose();
            arm.loc.newGestureBML( bml, symmetry, arm.locUpdatePoint );
            arm.locMotions = [];
            this.handConstellation.cancelArm( arm == this.right ? 'R' : 'L' );
            // this.bodyMovement.forceLastFramePose();
        }
        if ( bml.motion ){
            let m = null;
            let str = typeof( bml.motion ) == "string" ? bml.motion.toUpperCase() : "";
            if ( str == "FINGERPLAY"){ m = arm.fingerplay; }
            else if ( str == "WRIST"){ m = arm.wristMotion; }
            else if ( str == "DIRECTED"){ m = new DirectedMotion(); arm.locMotions.push(m); }
            else if ( str == "CIRCULAR"){ m = new CircularMotion(); arm.locMotions.push(m); }
            
            if( m ){ 
                m.newGestureBML( bml, symmetry );
            }
        }
        if ( bml.palmor || bml.extfidir ){
            arm.extfidirPalmor.newGestureBML( bml, symmetry );
        }
        if ( bml.handshape ){
            arm.handshape.newGestureBML( bml, symmetry );
        } 
        if ( bml.hasOwnProperty( "shoulderRaise" ) ){
            arm.shoulderRaise.newGestureBML( bml, symmetry );
        }
        if ( bml.hasOwnProperty( "shoulderHunch" ) ){
            arm.shoulderHunch.newGestureBML( bml, symmetry );
        }
        if ( bml.hasOwnProperty( "elbowRaise" ) ){
            arm.elbowRaise.newGestureBML( bml, symmetry );
        }

        arm.needsUpdate = true;
    }

    /**
    * lrSym: (optional) bool - perform a symmetric movement. Symmetry will be applied to non-dominant hand only
    * udSym: (optional) bool - perform a symmetric movement. Symmetry will be applied to non-dominant hand only
    * ioSym: (optional) bool - perform a symmetric movement. Symmetry will be applied to non-dominant hand only
    * hand: (optional) "RIGHT", "LEFT", "BOTH". Default right
    * shift: (optional) bool - make this the default position. Motions not affected
    */
    newGesture( bml ){

        bml.start = bml.start || 0;
        bml.end = bml.end || bml.relax || bml.attackPeak || (bml.start + 1);
        bml.attackPeak = bml.attackPeak || ( ( bml.end - bml.start ) * 0.25 + bml.start );
        bml.relax = bml.relax || ( (bml.end - bml.attackPeak) * 0.5 + bml.attackPeak );

        // symmetry: bit0 = lr, bit1 = ud, bit2 = io
        let symmetryFlags = ( !!bml.lrSym );
        symmetryFlags |= ( ( !!bml.udSym ) << 1 );
        symmetryFlags |= ( ( !!bml.ioSym ) << 2 );

        if ( typeof( bml.hand ) == "string" ){ bml.hand = bml.hand.toUpperCase(); }
        
        if ( bml.config ){
            let c = bml.config;
            if ( c.dominant ){ this.setDominantHand( c.dominant == "RIGHT" ); }
            if ( c.handshapeBendRange ){ 
                this.left.handshape.setBendRange( handshapeBendRange );
                this.right.handshape.setBendRange( handshapeBendRange );
            }
            //...
        }

        if ( bml.handConstellation ){
            this.handConstellation.newGestureBML( bml, this.dominant == this.right ? 'R' : 'L' );
        }

        if ( bml.bodyMovement ){
            this.bodyMovement.newGestureBML( bml );
        }

        switch ( bml.hand ){
            case "RIGHT" :             
                this._newGestureArm( bml, this.right, ( this.dominant == this.right ) ? 0x00 : symmetryFlags ); 
                break;
            case "LEFT" : 
                this._newGestureArm( bml, this.left, ( this.dominant == this.left ) ? 0x00 : symmetryFlags ); 
                break;
            case "BOTH" : 
                this._newGestureArm( bml, this.dominant, 0x00 ); 
                this._newGestureArm( bml, this.nonDominant, symmetryFlags ); 
                break;
            case "NON_DOMINANT" : 
                this._newGestureArm( bml, this.nonDominant, symmetryFlags ); 
                break;
            case "DOMINANT": 
            default:
                this._newGestureArm( bml, this.dominant, 0x00 ); 
                break;
        }

    }


}


export { CharacterController, FacialController, BodyController} 
