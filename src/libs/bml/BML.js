import * as THREE  from 'three';
function quadraticBezierVec3( a, b, c, out, t ){
    let invT = 1.0 - t;
    let ta = invT * invT;
    let tb = 2 * t * invT;
    let tc = t * t;

    out.x = a.x * ta + b.x * tb + c.x * tc;
    out.y = a.y * ta + b.y * tb + c.y * tc;
    out.z = a.z * ta + b.z * tb + c.z * tc;
    return out;
}

function cubicBezierVec3( a, b, c, d, out, t ){
    let invT = 1.0 - t;
    let ta = invT * invT * invT;
    let tb = 3 * t * invT * invT;
    let tc = 3 * t * t * invT;
    let td = t * t * t;

    out.x = a.x * ta + b.x * tb + c.x * tc + d.x * td;
    out.y = a.y * ta + b.y * tb + c.y * tc + d.y * td;
    out.z = a.z * ta + b.z * tb + c.z * tc + d.z * td;
    return out;
}
// ------------ THREEJS Quaternions

// mirror THREE.Quaternion for avatars
function mirrorQuat( destQuat, srcQuat ){
    //destQuat.x = srcQuat.x;
    destQuat.y = -srcQuat.y;
    destQuat.z = -srcQuat.z;
    //destQuat.w = srcQuat.w;
}

function mirrorQuatSelf( q ){
    //q.x = -q.x;
    q.y = -q.y;
    q.z = -q.z;
    //q.w = q.w;
}

// nlerp THREE.Quaternion. Good for interpolation between similar/close quaternions. Cheaper than slerp
function nlerpQuats( destQuat, qa, qb, t ){
    // let bsign = ( qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w ) < 0 ? -1 : 1;    
    // destQuat.x = qa.x * (1-t) + bsign * qb.x * t;
    // destQuat.y = qa.y * (1-t) + bsign * qb.y * t;
    // destQuat.z = qa.z * (1-t) + bsign * qb.z * t;
    // destQuat.w = qa.w * (1-t) + bsign * qb.w * t;
    // missing neighbourhood
    destQuat.x = qa.x * (1-t) + qb.x * t;
    destQuat.y = qa.y * (1-t) + qb.y * t;
    destQuat.z = qa.z * (1-t) + qb.z * t;
    destQuat.w = qa.w * (1-t) + qb.w * t;
    destQuat.normalize();
}

// decompose a quaternion into twist and swing quaternions. (Twist before swing decomposition). Arguments cannot be the same instance of quaternion
function getTwistSwingQuaternions( q, normAxis, outTwist, outSwing ){
    //  R = [ Wr, Vr ] = S * T  source rotation
    // T = norm( [ Wr, proj(Vr) ] ) twist 
    // S = R * inv(T)
    let dot =  q.x * normAxis.x + q.y * normAxis.y + q.z * normAxis.z;
    outTwist.set( dot * normAxis.x, dot * normAxis.y, dot * normAxis.z, q.w )
    outTwist.normalize(); // already manages (0,0,0,0) quaternions by setting identity

    outSwing.copy( outTwist );
    outSwing.invert(); // actually computes the conjugate so quite cheap
    outSwing.premultiply( q );
    outSwing.normalize();
}

function getTwistQuaternion( q, normAxis, outTwist ){
    let dot =  q.x * normAxis.x + q.y * normAxis.y + q.z * normAxis.z;
    outTwist.set( dot * normAxis.x, dot * normAxis.y, dot * normAxis.z, q.w )
    outTwist.normalize(); // already manages (0,0,0,0) quaternions by setting identity
    return outTwist;
}

// symmetry bit0 = left-right, bit1 = up-down, bit2 = in-out symmetry
function stringToDirection( str, outV, symmetry = 0x00, accumulate = false ){
    outV.set(0,0,0);
    if ( typeof( str ) != "string" ){ return false; }

    str = str.toUpperCase();
    let success = false;

    // right hand system. If accumulate, count repetitions
    if ( str.includes( "L" ) ){ outV.x += 1 * ( accumulate ? ( str.split("L").length -1 ): 1 ); success = true; } 
    if ( str.includes( "R" ) ){ outV.x -= 1 * ( accumulate ? ( str.split("R").length -1 ): 1 ); success = true; }
    if ( str.includes( "U" ) ){ outV.y += 1 * ( accumulate ? ( str.split("U").length -1 ): 1 ); success = true; } 
    if ( str.includes( "D" ) ){ outV.y -= 1 * ( accumulate ? ( str.split("D").length -1 ): 1 ); success = true; }
    if ( str.includes( "O" ) ){ outV.z += 1 * ( accumulate ? ( str.split("O").length -1 ): 1 ); success = true; } 
    if ( str.includes( "I" ) ){ outV.z -= 1 * ( accumulate ? ( str.split("I").length -1 ): 1 ); success = true; }
 
    if ( symmetry & 0x01 ){ outV.x *= -1; }
    if ( symmetry & 0x02 ){ outV.y *= -1; }
    if ( symmetry & 0x04 ){ outV.z *= -1; }

    if ( !success ){ outV.set(0,0,0); }
    else if ( !accumulate ){ outV.normalize(); }
    return success;
}


// Skeleton

// O(n)
function findIndexOfBone( skeleton, bone ){
    if ( !bone ){ return -1;}
    let b = skeleton.bones;
    for( let i = 0; i < b.length; ++i ){
        if ( b[i] == bone ){ return i; }
    }
    return -1;
}

// O(nm)
function findIndexOfBoneByName( skeleton, name ){
    if ( !name ){ return -1; }
    let b = skeleton.bones;
    for( let i = 0; i < b.length; ++i ){
        if ( b[i].name == name ){ return i; }
    }
    return -1;
}

function getBindQuaternion( skeleton, boneIdx, outQuat ){
    let m1 = skeleton.boneInverses[ boneIdx ].clone().invert(); 
    let parentIdx = findIndexOfBone( skeleton, skeleton.bones[ boneIdx ].parent );
    if ( parentIdx > -1 ){
        let m2 = skeleton.boneInverses[ parentIdx ]; 
        m1.premultiply(m2);
    }
    outQuat.setFromRotationMatrix( m1 ).normalize();
    return outQuat;
}

// sets bind quaternions only. Warning: Not the best function to call every frame.
function forceBindPoseQuats( skeleton, skipRoot = false ){
    let bones = skeleton.bones;
    let inverses = skeleton.boneInverses;
    if ( inverses.length < 1 ){ return; }
    let boneMat = inverses[0].clone(); // to avoid including ThreeJS and new THREE.Matrix4()
    for( let i = 0; i < bones.length; ++i ){
        boneMat.copy( inverses[i] ); // World to Local
        boneMat.invert(); // Local to World

        // get only the local matrix of the bone (root should not need any change)
        let parentIdx = findIndexOfBone( skeleton, bones[i].parent );
        if ( parentIdx > -1 ){ boneMat.premultiply( inverses[ parentIdx ] ); }
        else{
            if ( skipRoot ){ continue; }
        }
       
        bones[i].quaternion.setFromRotationMatrix( boneMat );
        bones[i].quaternion.normalize(); 
    }
}

// @BehaviourManager

// Message gets to BehaviourManager -> then to facial control -> then to BehaviorRealizer

// Needs to synchronize BML actions of the same block
// [MERGE,APPEND,REPLACE,OVERWRITE]
// Warnings and feedback
// wait, synchronize, constraints, before, after

function BehaviourManager() {

	// BML instruction keys
	this.bmlKeys = ["blink", "gaze", "gazeShift", "face", "faceShift", "head", "headDirectonShift", "lg", "gesture", "posture", "animation"];

	// BML stack
	this.blinkStack = [];
	this.gazeStack = [];
	this.faceStack = [];
	this.headStack = [];
	this.headDirStack = [];
	this.speechStack = [];
	this.gestureStack = [];
	this.pointingStack = [];
	this.postureStack = [];

	this.lgStack = [];
	this.animationStack = [];

	this.BMLStacks = [ this.blinkStack, this.gazeStack, this.faceStack, this.headStack, this.headDirStack, this.speechStack, this.lgStack,
	this.gestureStack, this.pointingStack, this.postureStack, this.animationStack ];

	// Block stack
	this.stack = [];
}

BehaviourManager.prototype.reset = function (){
	// reset stacks
	this.blinkStack.length = 0
	this.gazeStack.length = 0;
	this.faceStack.length = 0;
	this.headStack.length = 0;
	this.headDirStack.length = 0;
	this.speechStack.length = 0;
	this.gestureStack.length = 0;
	this.pointingStack.length = 0;
	this.postureStack.length = 0;
	this.lgStack.length = 0;
	this.animationStack.length = 0;

	this.stack.length = 0;
}

// TODO: PROVIDE FEEDBACK AND WARNINGS
// BehaviourManager.prototype.update = function (actionCallback, time) {

// 	// Time now
// 	this.time = time;

// 	// Several blocks can be active (MERGE composition)
// 	for (let i = 0; i < this.stack.length; i++) {
// 		// If it is not active
// 		if (!this.stack[i].isActive) {
// 			// Block starts
// 			if (this.stack[i].startGlobalTime <= this.time) {
// 				this.stack[i].isActive = true;
// 			}
// 		}
// 		// Check if has ended
// 		if ( this.stack[i].isActive ) {
// 			if (this.stack[i].endGlobalTime <= this.time) {
// 				this.stack[i].isActive = false;
// 				// Remove
// 				this.removeFromStacks(this.stack[i]);
// 				this.stack.splice(i, 1);
// 				i--;
// 			}
// 		}
// 	}
	

// 	// Check active BML and blocks (from BMLStacks)
// 	for (let i = 0; i < this.BMLStacks.length; i++) {
// 		// Select bml instructions stack
// 		let stack = this.BMLStacks[i];
// 		for (let j = 0; j < stack.length; j++) {
// 			let bml = stack[j];

// 			// BML is not active
// 			if ( !bml.isActive ) {
// 				// Set BML to active
// 				if (bml.startGlobalTime <= this.time) {
// 					bml.isActive = true;
// 					actionCallback(bml.key, bml); // CALL BML INSTRUCTION
// 				}
// 			}
// 			// BML has finished
// 			else if (bml.isActive) {
// 				if (bml.endGlobalTime <= this.time) {
// 					bml.isActive = undefined;
// 					// Remove from bml stack
// 					stack.splice(j, 1);
// 					j--;
// 				}
// 			}
// 		}
// 	}
// }

// V2 update: stacks will only contain blocks/bmls that have not started yet
BehaviourManager.prototype.update = function (actionCallback, time) {
	// Time now
	this.time = time;

	// Several blocks can be active (MERGE composition)
	for (let i = 0; i < this.stack.length; i++) {
		// If it is not active
		if (!this.stack[i].isActive) {
			// Block starts
            if (this.stack[i].startGlobalTime <= this.time) {
				this.stack.splice(i, 1);
				i--;
			}
		}
	}
	

	// Check active BML and blocks (from BMLStacks)
	for (let i = 0; i < this.BMLStacks.length; i++) {
		// Select bml instructions stack
		let stack = this.BMLStacks[i];
		for (let j = 0; j < stack.length; j++) {
			let bml = stack[j];

			// Set BML to active
			if (bml.startGlobalTime <= this.time) {
				actionCallback(bml.key, bml); // CALL BML INSTRUCTION
				stack.splice(j, 1);
				j--;
			}
		}
	}
}

BehaviourManager.prototype.newBlock = function (block, time) {

	if (!block) {
		return;
	}

	// Time now
	if (time == 0) {
		time = 0.001;
	}
	this.time = time;

	// TODO: require
	// Fix and Sychronize (set missing timings) (should substitute "start:gaze1:end + 1.1" by a number)
	this.fixBlock(block);

	// Remove blocks with no content
	if (block.end == 0) {
		//console.error("Refused block.\n", JSON.stringify(block));
		return;
	}

	// Add to stack
	this.addToStack(block);

}

BehaviourManager.prototype.fixBlock = function (block) {
	// Define block start (in BML this is not specified, only in bml instructions, not in blocks)
	//block.start = block.start || 0.0;
	// Check if it is a number
	block.start = isNaN(block.start) ? 0 : block.start;

	// Define timings and find sync attributes (defaults in percentage unless start and end)
	// Blink
	if (block.blink)
		block.blink = this.fixBML(block.blink, "blink", block, { start: 0, attackPeak: 0.25, relax: 0.25, end: 0.5 });

	// Gaze
	if (block.gaze)
		block.gaze = this.fixBML(block.gaze, "gaze", block, { start: 0, ready: 0.33, relax: 0.66, end: 2.0 });

	// GazeShift
	if (block.gazeShift)
		block.gazeShift = this.fixBML(block.gazeShift, "gazeShift", block, { start: 0, end: 2.0 });

	// Head
	if (block.head)
		block.head = this.fixBML(block.head, "head", block, { start: 0, ready: 0.15, strokeStart: 0.15, stroke: 0.5, strokeEnd: 0.8, relax: 0.8, end: 2.0 });

	// HeadDirection
	if (block.headDirectionShift)
		block.headDirectionShift = this.fixBML(block.headDirectionShift, "headDirectionShift", block, { start: 0, end: 2.0 });

	// Face
	if (block.face)
		block.face = this.fixBML(block.face, "face", block, { start: 0, attackPeak: 0.4, relax: 0.6, end: 1 });
	// Face
	if (block.faceFACS)
		block.faceFACS = this.fixBML(block.faceFACS, "faceFACS", block, { start: 0, attackPeak: 0.4, relax: 0.6, end: 1 });

	// Face
	if (block.faceLexeme)
		block.faceLexeme = this.fixBML(block.faceLexeme, "faceLexeme", block, { start: 0, attackPeak: 0.4, relax: 0.6, end: 1 });

	// Face
	if (block.faceEmotion)
		block.face = this.fixBML(block.faceEmotion, "face", block, { start: 0, attackPeak: 0.4, relax: 0.6, end: 1 });

	// Face VA
	if (block.faceVA)
		block.face = this.fixBML(block.faceVA, "face", block, { start: 0, attackPeak: 0.4, relax: 0.6, end: 1 });

	// FaceShift
	if (block.faceShift)
		block.faceShift = this.fixBML(block.faceShift, "faceShift", block, { start: 0, end: 1 });

	// Speech (several instructions not implemented)
	if (block.speech)
		block.speech = this.fixBML(block.speech, "speech", block, { start: 0, end: 2.5 });

	// Language-generation
	if (block.lg)
		block.lg = this.fixBML(block.lg, "lg", block, { start: 0, end: 1 });

	// Posture
	if (block.posture)
		block.posture = this.fixBML(block.posture, "posture", block, { start: 0, ready: 0.3, strokeStart: 0.3, stroke: 0.4, strokeEnd: 0.6, relax: 0.7, end: 1.0 });

	// Gesture
	if (block.gesture)
		block.gesture = this.fixBML(block.gesture, "gesture", block, { start: 0, ready: 0.1, strokeStart: 0.2, stroke: 0.7, strokeEnd: 0.7, relax: 1.4, end: 1.5 });

	// Pointing
	if (block.pointing)
		block.pointing = this.fixBML(block.pointing, "pointing", block, { start: 0, ready: 0.3, strokeStart: 0.3, stroke: 0.4, strokeEnd: 0.6, relax: 0.7, end: 1.0 });

	// Animation
	if (block.animation)
		block.animation = this.fixBML(block.animation, "animation", block, { start: 0, end: 2.0 });

	// Find end of block
	block.end = this.findEndOfBlock(block);
}

BehaviourManager.prototype.fixBML = function (bml, key, block, sync) {
	// Error check
	if (!bml) {
		console.warn("BML instruction undefined or null:", key, bml);
		delete block[key];
		return;
	}

	// Several instructions inside
	if (bml.constructor === Array) {
		for (var i = 0; i < bml.length; i++)
			bml[i] = this.fixBML(bml[i], key, block, sync);
		return bml;
	}

	// Check if is it an object
	if (typeof bml !== "object" || bml === null)
		bml = {};

	// Define type (key)
	bml.key = key;

	// Define timings
	// START
	bml.start = isNaN(bml.start) ? 0.0 : bml.start;
	if (bml.start < 0) {
		bml.start = 0;
	}
	// END
	bml.end = isNaN(bml.end) ? (bml.start + sync.end) : bml.end;

	return bml;
}


BehaviourManager.prototype.findEndOfBlock = function (block) {

	let keys = Object.keys(block);
	let latestEnd = 0;

	for (let i = 0; i < keys.length; i++) {
		let bml = block[keys[i]];
		if (bml === null || bml === undefined) { continue; }
		else if ( !isNaN( bml.end ) ) // bml is just an instruction
			latestEnd = Math.max(bml.end, latestEnd);

		else if (bml.constructor === Array){ // several instructions inside class
			for (let j = 0; j < bml.length; j++) {
				if (bml[j] && !isNaN( bml[j].end ) )
					latestEnd = Math.max(bml[j].end, latestEnd);
			}
		}
	}

	return latestEnd;
}

BehaviourManager.prototype.addToStack = function (block) {
	// block composition defined in bml standard [MERGE, REPLACE, APPEND]. OVERWRITE is not included

	if (Object.prototype.toString.call(block.composition) === '[object String]')
		block.composition = block.composition.toUpperCase();

	
	if (this.stack.length == 0) {
		block.startGlobalTime = this.time + block.start;
		block.endGlobalTime = this.time + block.end;
		this.stack.push( block );
	}

	// OVERWRITE
	else if (block.composition == "OVERWRITE") { // Doens't make sense, only for individual stacks, not whole
		// Substitute in stack

		block.startGlobalTime = this.time + block.start;
		block.endGlobalTime = this.time + block.end;

		let last = this.stack[this.stack.length - 1];
		if (block.endGlobalTime < last.endGlobalTime) {
			this.stack[this.stack.length - 1] = block;
			this.stack.push(last);
		}
		else
			this.stack.push(block);
		
		// Add to bml stack (called at the end of function)
	}

	// APPEND
	else if (block.composition == "APPEND") {
		//The start time of the new block will be as soon as possible after the end time of all prior blocks.
		block.startGlobalTime = this.stack[this.stack.length - 1].endGlobalTime + block.start;
		block.endGlobalTime = this.stack[this.stack.length - 1].endGlobalTime + block.end;
		this.stack.push(block);
	}

	// REPLACE
	else if (block.composition == "REPLACE") {
		//The start time of the new block will be as soon as possible. The new block will completely replace all prior bml blocks. All behavior specified in earlier blocks will be ended and the ECA will revert to a neutral state before the new block starts.

		// Second action in the stack (if start != 0 waiting time?)
		block.startGlobalTime = (this.stack[0].isActive) ? this.stack[0].endGlobalTime : this.time;
		block.endGlobalTime = block.startGlobalTime + block.end;

		// Remove following blocks
		for (let i = (this.stack[0].isActive) ? 1: 0; i < this.stack.length; i++)
			this.removeFromStacks(this.stack[i]);

		this.stack.push( block );
	}

	// MERGE (default)
	else {
		// Add to block stack
		block.startGlobalTime = this.time + block.start;
		block.endGlobalTime = this.time + block.end;

		this.stack.push(block);

		// bubble sort. Lowest endGlobalTimes should be first, Biggest endGlobalTime should be the last
		if ( this.stack.length > 1 ){
			for ( let i = this.stack.length-2; i >= 0; --i ){
				let prev = this.stack[i];
				if ( prev.startGlobalTime > block.startGlobalTime ){
					this.stack[i] = block;
					this.stack[i+1] = prev;
				}
				else{ break; }
			}
		}		
	}

	// Add to stacks
	this.addToBMLStacks(block);
}

// Removes all bml instructions from stacks
BehaviourManager.prototype.removeFromStacks = function (block) {

	// Add delete variable in block to bml instructions
	let keys = Object.keys(block);
	for (let i = 0; i < keys.length; i++) { // Through bml instructions
		let bml = block[keys[i]];
		if (bml !== null || bml !== undefined) {
			if (typeof bml === "object"){ // bml is an instruction
				bml.del = true;
			}
			else if (bml.constructor === Array){ // bml is an array of bml instructions
				for (let j = 0; j < bml.length; j++){
					bml[j].del = true;
				}
			}

		}
	}

	// Remove from each stack all bml with del
	for (let i = 0; i < this.BMLStacks.length; i++) { // Through list of stacks
		for (let j = 0; j < this.BMLStacks[i].length; j++) {// Through stack
			if (this.BMLStacks[i][j].del) { // Find del variable in stack
				this.BMLStacks[i][j].isActive = undefined; // If reusing object
				this.BMLStacks[i].splice(j, 1); // Remove from stack
				j--;
			}
		}
	}
}

// Add bml actions to stacks with global timings
BehaviourManager.prototype.addToBMLStacks = function (block) {

	let globalStart = block.startGlobalTime;

	// Blink
	if (block.blink)
		this.processIntoBMLStack(block.blink, this.blinkStack, globalStart, block.composition);

	// Gaze
	if (block.gaze)
		this.processIntoBMLStack(block.gaze, this.gazeStack, globalStart, block.composition);
	if (block.gazeShift)
		this.processIntoBMLStack(block.gazeShift, this.gazeStack, globalStart, block.composition);

	// Head
	if (block.head)
		this.processIntoBMLStack(block.head, this.headStack, globalStart, block.composition);
	if (block.headDirectionShift)
		this.processIntoBMLStack(block.headDirectionShift, this.headDirStack, globalStart, block.composition);

	// Face
	if (block.faceLexeme)
		this.processIntoBMLStack(block.faceLexeme, this.faceStack, globalStart, block.composition);

	if (block.faceFACS)
		this.processIntoBMLStack(block.faceFACS, this.faceStack, globalStart, block.composition);

	if (block.face)
		this.processIntoBMLStack(block.face, this.faceStack, globalStart, block.composition);

	if (block.faceShift)
		this.processIntoBMLStack(block.faceShift, this.faceStack, globalStart, block.composition);

	// Speech
	if (block.speech)
		this.processIntoBMLStack(block.speech, this.speechStack, globalStart, block.composition);

	// Posture
	if (block.posture)
		this.processIntoBMLStack(block.posture, this.postureStack, globalStart, block.composition);

	// Gesture
	if (block.gesture)
		this.processIntoBMLStack(block.gesture, this.gestureStack, globalStart, block.composition);

	// Pointing
	if (block.pointing)
		this.processIntoBMLStack(block.pointing, this.pointingStack, globalStart, block.composition);

	// LG
	if (block.lg)
		this.processIntoBMLStack(block.lg, this.lgStack, globalStart, block.composition);

	// Animation
	if (block.animation)
		this.processIntoBMLStack(block.animation, this.animationStack, globalStart, block.composition);
}

// Add bml action to stack
BehaviourManager.prototype.processIntoBMLStack = function (bml, stack, globalStart, composition) {

	// Several instructions
	if (bml.constructor === Array) {
		for (let i = 0; i < bml.length; i++)
			this.processIntoBMLStack(bml[i], stack, globalStart, composition);
		return;
	}


	let merged = this.mergeBML(bml,stack,globalStart,  composition);
 	bml.del = !merged;

	// First, we check if the block fits between other blocks, thus all bml instructions
	// should fit in the stack.
	if (!merged)
		console.warn("Could not add to " + bml.key + " stack. \n");// + "BML: ", 

}


BehaviourManager.prototype.mergeBML = function(bml, stack, globalStart, composition){
	let merged = false;
	
	// Refs to another block (negative global timestamp)
	if (bml.start < 0)
		bml.start = (-bml.start) - globalStart; // The ref timestamp should be always bigger than globalStart

	if (bml.end < 0)
		bml.end = (-bml.end) - globalStart;

	bml.startGlobalTime = globalStart + bml.start;
	bml.endGlobalTime = globalStart + bml.end;

	// Check errors
	if (bml.start < 0) console.error("BML start is negative", bml.start, bml.key, globalStart);
	if (bml.end < 0) console.error("BML end is negative", bml.end, bml.key, globalStart);

	// Now change all attributes from timestamps to offsets with respect to startGlobalTime
	
	// Modify all sync attributes to remove non-zero starts (offsets)
	// Also fix refs to another block (negative global timestamp)
	bml.end -= bml.start;

	if ( !isNaN(bml.attackPeak) ) 
		bml.attackPeak = this.mergeBMLSyncFix(bml.attackPeak, bml.start, globalStart);
	if ( !isNaN(bml.ready) )
		bml.ready = this.mergeBMLSyncFix(bml.ready, bml.start, globalStart);
	if ( !isNaN(bml.strokeStart) )
		bml.strokeStart = this.mergeBMLSyncFix(bml.strokeStart, bml.start, globalStart);
	if ( !isNaN(bml.stroke) )
		bml.stroke = this.mergeBMLSyncFix(bml.stroke, bml.start, globalStart);
	if ( !isNaN(bml.strokeEnd) )
		bml.strokeEnd = this.mergeBMLSyncFix(bml.strokeEnd, bml.start, globalStart);
	if ( !isNaN(bml.relax))
		bml.relax = this.mergeBMLSyncFix(bml.relax, bml.start, globalStart);

	bml.start = 0;

	bml.composition = composition;


	let overwrite = composition === "OVERWRITE";
	let merge = composition === "MERGE";

	if ( !overwrite ) {
		stack.push( bml );
		// bubble sort the stack by endGlobalTime. First the lowest 
		for( let i = stack.length-2; i > 0; --i){
			if ( stack[i].startGlobalTime > bml.startGlobalTime ){
				stack[i+1] = stack[i];
				stack[i] = bml;
			}
			else { break; }
		}
		return true;
	}


	// OLD CODE
	// add to bml stack
	// Empty
	if (stack.length == 0) {
		stack.push( bml );
		return true;
	}
	else {
		// Fits between
		if (stack.length > 1) {

			//append at the end
			if (bml.startGlobalTime >= stack[stack.length - 1].endGlobalTime){
				stack.push(bml);
				merged = true;
			}
			// fit on the stack?
			else{
				for (let i = 0; i < stack.length-1; i++){
					if(merged) break;
					// Does it fit?
					if (bml.startGlobalTime >= stack[i].endGlobalTime && bml.endGlobalTime <= stack[i + 1].startGlobalTime || i == 0 && bml.endGlobalTime < stack[i].startGlobalTime) {
						let tmp = stack.splice(i, stack.length);
						stack.push(bml);
						stack = stack.concat(tmp);
						merged = true;
					}
					// If it doesn't fit remove if overwrite
					else if (overwrite) {
						// Remove from bml stack
						stack.splice(i, 1);
						i--;
					}
					else if(merge){
						stack.push(bml);
						merged = true;
					}
				}
			}
		}
		// End of stack (stack.length == 1)
		if (!merged || overwrite) {
			// End of stack
			if (stack[stack.length - 1].endGlobalTime <= bml.startGlobalTime) {
				if (!merged) {
					stack.push(bml);
					merged = true;
				}
			}
			else if (overwrite)
				stack.splice(stack.length - 1, 1);
			else if (bml.endGlobalTime < stack[0].startGlobalTime) {// Start of stack
				stack.push(bml);
				stack.reverse();
			}
		}
	}
	// After removing conflicting bml, add
	if (overwrite && !merged) {
		stack.push(bml);
		merged = true;
	}

	return merged;
}

// Fix ref to another block (negative global timestamp) and remove start offset
BehaviourManager.prototype.mergeBMLSyncFix = function (syncAttr, start, globalStart) {
	return ( syncAttr > start ) ? ( syncAttr - start ) : 0;

	// ORIGINAL FUNCTION BELOW

	// Ref to another block
	if (syncAttr < 0) syncAttr = (-syncAttr) - globalStart;
	// Remove offset
	syncAttr -= start;

	// Check error
	if (syncAttr < 0)
		console.error("BML sync attribute is negative.", syncAttr, start, globalStart);

	return syncAttr;
}

// Checks that all stacks are ordered according to the timeline (they should be as they are insterted in order)
BehaviourManager.prototype.check = function () {
	if (this.errorCheck(this.blinkStack)) console.error("Previous error is in blink stack");
	if (this.errorCheck(this.gazeStack)) console.error("Previous error is in gaze stack");
	if (this.errorCheck(this.faceStack)) console.error("Previous error is in face stack");
	if (this.errorCheck(this.headStack)) console.error("Previous error is in head stack");
	if (this.errorCheck(this.headDirStack)) console.error("Previous error is in headDir stack");
	if (this.errorCheck(this.speechStack)) console.error("Previous error is in speech stack");
	if (this.errorCheck(this.postureStack)) console.error("Previous error is in posture stack");
	if (this.errorCheck(this.gestureStack)) console.error("Previous error is in gesture stack");
	if (this.errorCheck(this.pointingStack)) console.error("Previous error is in pointing stack");
	if (this.errorCheck(this.lgStack)) console.error("Previous error is in lg stack");
	if (this.errorCheck(this.animationStack)) console.error("Previous error is in animation stack");
}

BehaviourManager.prototype.errorCheck = function (stack) {
	// Check timings
	for (let i = 0; i < stack.length - 1; i++) {
		if (stack[i].endGlobalTime > stack[i + 1].startGlobalTime) {
			console.error("Timing error in stack: ", stack);
			return true;
		}
	}
}

//@BehaviourPlanner
//Agent's communicative intentions specified using BML standard

//States
BehaviourPlanner.WAITING = 0;
BehaviourPlanner.PROCESSING = 1;
BehaviourPlanner.SPEAKING = 2;
BehaviourPlanner.LISTENING = 3;

function BehaviourPlanner() {
  this.reset();
}

BehaviourPlanner.prototype.reset = function () {
  this.conversation = "--- New dialogue---\n\n";
  this.state = BehaviourPlanner.WAITING;
  
  //For automatic state update
  this.stateTime = 0;
  this.nextBlockIn =  1 + Math.random() * 2;
  
  // Default facial state
  this.defaultValence = 0.4;
  this.currentArousal = 0;
  
  // Idle timings (blink and saccades)
  this.blinkIdle = 0.5 + Math.random()*6;
	this.blinkDur = Math.random()*0.5 + 0.15;
	this.blinkCountdown = 0;

	this.saccIdle = 0.5 + Math.random()*6;
	this.saccDur = Math.random() + 0.5;
	this.saccCountdown = 0;
}

//UPDATE
BehaviourPlanner.prototype.update = function(dt){

  this.stateTime += dt;
  
  // Automatic state update
  if (this.nextBlockIn < this.stateTime){
    this.stateTime = 0;
    return this.createBlock();
  }
  
  // Check if speech has finished to change to WAITING
  /*if (this.state == BehaviourPlanner.SPEAKING){
    if (BehaviourPlanner.BehaviorManager){
      if (BehaviourPlanner.BehaviorManager.lgStack.length == 0 && BehaviourPlanner.BehaviorManager.speechStack.length == 0)
        this.transition({control: BehaviourPlanner.WAITING});
    }
  }*/
  
  // Automatic blink and saccades
  return this.updateBlinksAndSaccades(dt);
}

//TRANSITION to nextState
BehaviourPlanner.prototype.transition = function(block){
  
  var nextState = block.control;
  
  if (nextState == this.state)
    return;
  
  var currentState = "waiting";
  
  switch(this.state){
    case BehaviourPlanner.WAITING:
      currentState = "waiting";
      break;
    case BehaviourPlanner.LISTENING:
      currentState = "listening";
      break;
      case BehaviourPlanner.SPEAKING:
      currentState = "speaking";
      break;
      case BehaviourPlanner.PROCESSING:
      currentState = "processing";
      break;
  }
  

  // Reset state time
  this.stateTime = 0;
  
  // TRANSITIONS
  switch(nextState){
  	
      // Waiting can only come after speaking
    case BehaviourPlanner.WAITING:
    	// Look at user for a while, then start gazing around
    	this.nextBlockIn = 2 + Math.random() * 4;
  		break;
  	
      // Can start speaking at any moment
    case BehaviourPlanner.LISTENING:
    	// Force to overwrite existing bml
    	block.composition = "MERGE";
    	/*if(this.state ==BehaviourPlanner.SPEAKING){
      	// Abort speech
      	this.abortSpeech();
    	}*/
    	// Look at user and default face
    	this.attentionToUser(block, true);
    	// Back-channelling
    	this.nextBlockIn = 0 +  Math.random()*2;
			break;
  
  		// Processing always after listening
    case BehaviourPlanner.PROCESSING:
    	this.nextBlockIn = 0;
  		break;
 	 		
      // Speaking always after processing
    case BehaviourPlanner.SPEAKING:
    	this.attentionToUser(block, true);
    	// Should I create random gestures during speech?
    	this.nextBlockIn = Math.random()*1;//2 + Math.random()*4;
  	break;
  }
  
  this.state = nextState;
  
}

//!!!!!!!!!!!!!!!!!!
/*BehaviourPlanner.prototype.abortSpeech = function(){
  // Cancel audio and lipsync in Facial
  if (BehaviourPlanner.Facial){
    var facial = BehaviourPlanner.Facial;
    if (!facial._audio.paused){
    	facial._audio.pause(); // Then paused is true and no facial actions
      // Go to neutral face? Here or somewhere else?
    }
  }
  // End all blocks in BMLManager
  if (BehaviourPlanner.BMLManager){
    var manager = BehaviourPlanner.BMLManager;
    for (var i =0 ; i < manager.stack.length; i++){
      manager.stack[i].endGlobalTime = 0;
    }
  }
}*/

//---------------------------AUTOMATIC------------------------------


//CREATEBLOCKs during a state (automatic)
BehaviourPlanner.prototype.createBlock = function(){
  
  var state = this.state;
  var block = {
    id: state, 
    composition: "MERGE"
  };
  
  switch(state)
  {
  // LISTENING
    case BehaviourPlanner.LISTENING:
      this.nextBlockIn = 1.5 + Math.random()*3;
      // head -> link with this.currentArousal
      if (Math.random() < 0.4)
      {
        block.head = {
          start: 0,
          end: 1.5 + Math.random()*2,
          lexeme: "NOD",
          amount: 0.05 + Math.random()*0.05,
          type:"head"
        }
      }

      // Esporadic raising eyebrows
      if (Math.random() < 0.5)
      {
        var start = Math.random();
        var end = start + 1 + Math.random();
        block.face = [{
          start: start,
          attackPeak: start + (end-start)*0.2,
          relax: start + (end-start)*0.5,
          end: end,
          lexeme: {
            lexeme: "BROW_RAISER", 
            amount: 0.1 + Math.random()*0.2
          },
          type:"face"
        },
          {
          start: start,
          attackPeak: start + (end-start)*0.2,
          relax: start + (end-start)*0.5,
          end: end,
          lexeme: {
            lexeme: "UPPER_LID_RAISER", 
            amount: 0.1 + Math.random()*0.2
        	},
          type:"face"
        }]
        
      }
      if(Math.random() < 0.2){
        var start = Math.random();
        var end = start + 1 + Math.random();
        var f = {
          start: start,
          attackPeak: start + (end-start)*0.2,
          relax: start + (end-start)*0.5,
          end: end,
          lexeme: {
            lexeme: "CHEEK_RAISER", 
            amount: 0.1 + Math.random()*0.2
        	},
          type:"face"
        }
        if(block.face)
          block.face.push(f)
        else
          block.face = f;
      }

      // Gaze should already be towards user

      break;
  
  // SPEAKING
    case BehaviourPlanner.SPEAKING:
      
      this.nextBlockIn = 2 + Math.random()*4;
      // Head
      if (Math.random() < 0.2){
        // Deviate head slightly
        if (Math.random() < 0.85)
        {
          var start = Math.random();
          var offsetDirections = ["CAMERA","DOWN_RIGHT", "DOWN_LEFT", "LEFT", "RIGHT"]; // Upper and sides
          var randOffset = offsetDirections[Math.floor(Math.random() * offsetDirections.length)];
          // block.headDirectionShift = {
          //   start: start,
          //   end: start + Math.random(),
          //   target: "CAMERA",
          //   offsetDirection: randOffset,
          //   offsetAngle: 1 + Math.random()*3,
          //   type:"headDirectionShift"
          // }
        }
      }
      // Esporadic raising eyebrows
      if (Math.random() < 0.7)
      {
        var start = Math.random();
        var end = start + 1.2 + Math.random()*0.5;
        block.face = {
          start: start,
          attackPeak: start + (end-start)*0.2,
          relax: start + (end-start)*0.5,
          end: end,
          lexeme: {
            lexeme: "BROW_RAISER", 
            amount: 0.1 + Math.random()*0.2
          },
           type:"face"
        }
      }
      // Redirect gaze to user
      if (Math.random() < 0.7)
      {
        // var start = Math.random();
        // var end = start + 0.5 + Math.random()*1;
        // block.gazeShift = {
        //   start: start,
        //   end: end,
        //   influence: "EYES",
        //   target: "CAMERA",
        //   type:"gazeShift"
        // }
        block.composition = "MERGE";
      }

    	break;
  
  
  // PROCESSING
    case BehaviourPlanner.PROCESSING:
      this.nextBlockIn = 2 + Math.random() * 2;
      // gaze
      var offsetDirections = ["UP_RIGHT", "UP_LEFT", "LEFT", "RIGHT"]; // Upper and sides
      var randOffset = offsetDirections[Math.floor(Math.random() * offsetDirections.length)];
      if(Math.random() < 0.8)
      {
        // block.gazeShift = {
        //   start: 0,
        //   end: 1 + Math.random(),
        //   influence: "EYES",
        //   target: "CAMERA",
        //   offsetDirection: randOffset,
        //   offsetAngle: 10 + 5*Math.random(),
        //   type:"gazeShift"
        // }
      }

      // head nods
      if (Math.random() < 0.3)
      {
        // block.head = {
        //   start: 0,
        //   end: 1.5 + Math.random()*2,
        //   lexeme: Math.random() < 0.2 ? "TILT" : "NOD",
        //   amount: 0.05 + Math.random()*0.1,
        //   type:"head"
        // }
      }

      // frown
      if (Math.random() < 0.6)
      {
        block.face = {
          start: 0,
          end: 1 + Math.random(),
          lexeme: [
            {
              lexeme: "BROW_LOWERER", 
              amount: 0.2 + Math.random()*0.5
            }
          ],
          type:"face"
        }
      }

      // press lips
      if (Math.random() < 0.3)
      {
        var lexeme = {
          lexeme: "LIP_PRESSOR",
          amount: 0.1 + 0.3 * Math.random()
        };
        if(block.face)
          block.face.lexeme.push(lexeme)
        else
          block.face = {
            start: 0,
            end: 1 + Math.random(),
            lexeme: lexeme
        }
          block.face.type="face"
      }
      break;
  
  // WAITING
    case BehaviourPlanner.WAITING:
      
      this.nextBlockIn = 2 + Math.random() * 3;
      // gaze
      var offsetDirections = ["CAMERA","DOWN", "DOWN_RIGHT", "DOWN_LEFT", "LEFT", "RIGHT"]; // Upper and sides
      var randOffset = offsetDirections[Math.floor(Math.random() * offsetDirections.length)];
      // block.gazeShift = {
      //   start: 0,
      //   end: 1 + Math.random(),
      //   target: "CAMERA",
      //   influence: Math.random()>0.5 ? "HEAD":"EYES",
      //   offsetDirection: offsetDirections[randOffset],
      //   offsetAngle: 5 + 5*Math.random(),
      //   type:"gazeShift"
      // }

      // Set to neutral face (VALENCE-AROUSAL)
      //block.faceShift = {start: 0, end: 2, valaro: [0,0], type:"faceShift"};
      block.composition = "MERGE"
     	break;
  }
  return block;
}

// -------------------- NEW BLOCK --------------------
// New block arrives. It could be speech or control.
BehaviourPlanner.prototype.newBlock = function(block){
  
  // State
  if ( block.control ){
    this.transition(block);
  }

	// If non-verbal -> inside mode-selection.nonverbal
	if (block.nonVerbal){
		// Add gesture (check arousal of message)
    if (block.nonVerbal.constructor === Array){ // It is always an array in server
      for (var i = 0; i < block.nonVerbal.length; i++){ // TODO -> relate nonVerbal with lg
        var act = block.nonVerbal[i].dialogueAct;
        block.gesture = {lexeme: act, start: 0, end: 2, type:"gesture"};
      }
    }
    
	}
}

// Automatic blink and saccades
// http://hal.univ-grenoble-alpes.fr/hal-01025241/document
BehaviourPlanner.prototype.updateBlinksAndSaccades = function(dt){
  // Minimum time between saccades 150ms
  // Commonly occurring saccades 5-10 deg durations 30-40ms
  // Saccade latency to visual target is 200ms (min 100 ms)
  // Frequency?
  
  // 10-30 blinks per minute during conversation (every two-six seconds)
  // 1.4 - 14 blinks per min during reading
  
  var block = null;
   
  // Saccade
  this.saccCountdown += dt;
  if (this.saccCountdown > this.saccIdle){
    // Random direction
    var opts = ["RIGHT", "LEFT", "DOWN","DOWN_RIGHT", "DOWN_LEFT", "UP", "UP_LEFT", "UP_RIGHT"]; // If you are looking at the eyes usually don't look at the hair
    var randDir = opts[Math.floor(Math.random()*opts.length)];
    
    // Fixed point to saccade around?
    var target = "CAMERA"//"EYESTARGET";
    if (this.state == BehaviourPlanner.LISTENING) 
      target = "CAMERA";
        
    if (!block) 
      block = {};
    
    // block.gaze = {
    //   start: 0,
    //   end: Math.random()*0.1+0.1,
    //   target: target, 
    //   influence: "EYES",
    //   offsetDirection: "CAMERA",
    //   offsetAngle: Math.random()*3 + 2,
    //   type:"gaze"
    // }
    
    this.saccCountdown = this.saccDur;
    if (this.state ==BehaviourPlanner.LISTENING || this.state == BehaviourPlanner.SPEAKING)
      this.saccIdle = this.saccDur + 2 + Math.random()*6;
    else
  		this.saccIdle = this.saccDur + 0.5 + Math.random()*6;
  	
    this.saccDur = Math.random()*0.5 + 0.5;
  }
  
  return block;
}


BehaviourPlanner.prototype.attentionToUser = function(block, overwrite){
  // If gazeShift already exists, modify
	var end = 0.5 + Math.random();
	var startHead = 0;
  var startGaze = startHead + Math.random()*0.5; // Late start
  
	// gazeShift
	// var gazeShift = {
  //   id: "gazeEnd",
	// 	start: startGaze,
	// 	end: end,
	// 	influence: "EYES",
	// 	target: "CAMERA",
  //   type:"gazeShift"
	// }
  
	// headDirectionShift
	var offsetDirections = ["CAMERA","DOWN", "DOWN_LEFT", "DOWN_RIGHT"]; // Submissive? Listening?
  var randOffset = offsetDirections[Math.floor(Math.random() * offsetDirections.length)];
	var startDir = -Math.random()*0.3;
	// var headDir = {
	// 	start: startHead,
	// 	end: end,
	// 	target: "CAMERA",
  //   offsetDirection: "CAMERA",
  //   offsetAngle: 2 + 5*Math.random(),
  //   type:"headDirectionShift"
	// }
  
  var faceVA = {
    start: startHead,
    end: end,
    valaro: [this.defaultValence, 0],
    type:"faceVA",
    shift : true
  }
  
  // Force and remove existing bml instructions
  if (overwrite)
  {
    //block.blink = blink;
    //block.faceVA = faceVA;
    // block.gazeShift = gazeShift;
    // block.headDirectionShift = headDir;
  } 
  else
  {
    //this.addToBlock(blink, block, "blink");
    //this.addToBlock(faceVA, block, "faceVA");
    // this.addToBlock(gazeShift, block, "gazeShift");
    // this.addToBlock(headDir, block, "headDirectionShift");
  }
}

BehaviourPlanner.prototype.addToBlock = function(bml, block, key){
  if (block[key])
  {
    // Add to array (TODO: overwrite, merge etc...)
    if (block[key].constructor === Array)
    {
      if (bml.constructor === Array)
        for (var i = 0; i<bml.length; i++)
          block[key].push(bml[i]);
      else
        block[key].push(bml);
    }
    // Transform object to array
    else {
      var tmpObj = block[key];
      block[key] = [];
      block[key].push(tmpObj);
      if (bml.constructor === Array)
        for (var i = 0; i<bml.length; i++)
          block[key].push(bml[i]);
       else
        block[key].push(bml);
    }
  } 
  // Doesn't exist yet
  else
    block[key] = bml;
  
}


// ---------------------------- NONVERBAL GENERATOR (for speech) ----------------------------
// Process language generation message
// Adds new bml instructions according to the dialogue act and speech
//BehaviourPlanner.prototype.processSpeechBlock = function (bmlLG, block, isLast){}

// Use longest word as prosody mark
//BehaviourPlanner.prototype.createBrowsUp = function (bmlLG){}

// Generate faceShifts at the end of speech
//BehaviourPlanner.prototype.createEndFace = function (bmlLG){}

// Create a head nod at the beggining
//BehaviourPlanner.prototype.createHeadNodStart = function (bmlLG){}

// Create gaze (one at start to look away and back to user)
//BehaviourPlanner.prototype.createGazeStart = function (bmlLG){}

// Look at the camera at the end
//BehaviourPlanner.prototype.createGazeEnd = function (bmlLG){}

// Change offsets of new bml instructions
//BehaviourPlanner.prototype.fixSyncStart = function (bml, offsetStart){}

// Add a pause between speeches
//BehaviourPlanner.prototype.addUtterancePause = function (bmlLG){}

//@BehaviorRealizer
let DEG2RAD = Math.PI / 180;
let RAD2DEG = 180 / Math.PI;

// --------------------- BLINK ---------------------
// BML
// <blink start attackPeak relax end amount>
function Blink() {
    
    this.start = 0;
    this.end = 0;
    this.elapsedTime = 0;
    this.initWs = [0, 0]; // initial pose of eyelids
    this.endWs = [0, 0]; // target pose of eyelids ( constantly changes during update )
    this.weights = [0, 0]; // current status

    this.needsInit = true;
    this.blinking = false;
    this.between = false;    
}

Blink.prototype.getEnd = function () {
    
    return 0.5; //1000; //Math.random()*1000;
}

Blink.prototype.initBlinking = function (cw0, cw1) {
    
    if( this.blinking ){ // forced a blink while already executing one
        this.initWs[0] = this.weights[0]; this.initWs[1] = this.weights[1];
    }else{
        this.initWs[0] = cw0; this.initWs[1] = cw1;
        this.weights[0] = cw0; this.weights[1] = cw1;
    }
    this.endWs[0] = cw0; this.endWs[1] = cw1;
    
    this.elapsedTime = 0;
    this.start = 0;
    let lowestWeight = Math.min(cw0, cw1);
    lowestWeight = Math.min(1, Math.max(0, lowestWeight));
    this.end = this.getEnd() * (1 - lowestWeight);
    this.end = Math.max(this.end, this.start); // just in case

    this.needsInit = false;
    this.blinking = true;
    this.between = false;
}

Blink.prototype.blink = function () {
    
    this.start = -1;
    this.elapsedTime = -1;
    this.needsInit = true;
    this.between = false;
    // this.blinking = true;
    // this.between = false;
}

Blink.prototype.update = function ( dt, currentWeight0, currentWeight1 ) {

    if ( this.needsInit ) {
        this.initBlinking( currentWeight0, currentWeight1 );
    }
    if ( this.blinking && dt > 0 ) {
        this.elapsedTime += dt;
        this.endWs[0] = currentWeight0;
        this.endWs[1] = currentWeight1;

        this.computeWeight( this.elapsedTime );

        if (this.elapsedTime > this.end ) { // schedule next blink
            this.blinking = false;
            this.between = true;
            setTimeout( this.blink.bind( this ), Math.random() * 3000 + 1500 );
            return;
        }
    }
}


//Paper --> Eye Movement Synthesis with 1/ f Pink Noise -- Andrew Duchowski∗, Sophie Jörg, Aubrey Lawson, Takumi Bolte, Lech Swirski  ́

// W(t) = -> a - (t/mu)^2 if t<=mu
//        -> b - e^(-w*log(t-mu+1)) otherwise
// where t = [0,100] normalized percent blink duration 
// mu = 37 when the lid should reach full closure
// a = 0.98 percent lid closure at the start of the blink
// b = 1.18 
// w = mu/100 parameters used to shape the asymptotic lid opening dunction

Blink.prototype.computeWeight = function (dt) {
    
    let t = (dt - this.start) / (this.end - this.start) * 100;
    t = Math.min(100, Math.max(0, t));
    let mu = 37;
    let a = 1;
    let b = 1.18;
    let c = mu / 100;
    let w = 0;
    let srcWs = null;
    if (t <= mu) {
        w = a - Math.pow(t / mu, 2);
        srcWs = this.initWs;
    } else {
        w = b - Math.pow(Math.E, (-c * Math.log2(t - mu + 1)));
        srcWs = this.endWs;
    }
    w = Math.min(1, Math.max(0, w));
    this.weights[0] = 1 - w * (1 - srcWs[0]);
    this.weights[1] = 1 - w * (1 - srcWs[1]);
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


// Static 
// first row = blendshape indices || second row = blendshape proportional amount (some blendshapes are slightly used, others are fully used)
FacialExpr.NMF = {}; // lookup table for lexeme-blendshape relation

// SignON actions units
// BROWS
FacialExpr.NMF.ARCH =                       [[1, 2, 0], [1, 1, 1]];
FacialExpr.NMF.BROW_LOWERER =               [[3, 4], [1,1]]; // AU4 brows down
FacialExpr.NMF.BROW_LOWERER_LEFT =          [[3], [1]]; // LAU4
FacialExpr.NMF.BROW_LOWERER_RIGHT =         [[4], [1]]; // RAU4 
FacialExpr.NMF.BROW_RAISER =                [[1, 2], [1,1]]; //  brow up
FacialExpr.NMF.BROW_RAISER_LEFT =           [[1], [1]]; // left brow up
FacialExpr.NMF.BROW_RAISER_RIGHT =          [[2], [1]]; // right brow up
FacialExpr.NMF.INNER_BROW_RAISER =          [[0], [1]]; // AU1 rows rotate outwards
FacialExpr.NMF.OUTER_BROW_RAISER =          [[1, 2], [1,1]]; // AU2 brows up (right)
// EYES
FacialExpr.NMF.SQUINT =                     [[49, 50], [1, 1]];
FacialExpr.NMF.BLINK =                      [[51, 52], [1, 1]]; // AU45 eyelids closed 
FacialExpr.NMF.EYES_CLOSED =                [[51, 52], [1, 1]]; // AU43 eyelids closed
FacialExpr.NMF.UPPER_LID_RAISER =           [[47, 48], [1,1]]; // AU5 negative eyelids closed /wide eyes
FacialExpr.NMF.UPPER_LID_RAISER_LEFT =      [[47], [1]]; // AU5 negative eyelids closed /wide eyes
FacialExpr.NMF.UPPER_LID_RAISER_RIGHT =     [[48], [1]]; // AU5 negative eyelids closed /wide eyes 
FacialExpr.NMF.LID_TIGHTENER =              [[51, 52, 49, 50], [0.2, 0.2, 0.8, 0.8]]; // AU7 or AU44 squint TODO NEW MAPPING: SQUINT + BLINK
FacialExpr.NMF.WINK_LEFT =                  [[53], [1]]; // AU46
FacialExpr.NMF.WINK_RIGHT =                 [[54], [1]]; // AU46
// CHEEKS
FacialExpr.NMF.CHEEK_RAISER =               [[41, 42], [1,1]]; // AU6 squint 
FacialExpr.NMF.CHEEK_SUCK =                 [[45, 46], [1, 1]]; // AU35
FacialExpr.NMF.CHEEK_SUCK_LEFT =            [[45], [1]]; // LAU35
FacialExpr.NMF.CHEEK_SUCK_RIGHT =           [[46], [1]]; // RAU35
FacialExpr.NMF.CHEEK_BLOW =                 [[43, 44], [1, 1]]; // AU33
FacialExpr.NMF.CHEEK_BLOW_LEFT =            [[43], [1]]; // LAU33
FacialExpr.NMF.CHEEK_BLOW_RIGHT =           [[44], [1]]; // RAU33
// NOSE
FacialExpr.NMF.NOSE_WRINKLER =              [[5, 6], [1, 1]]; // AU9
FacialExpr.NMF.NOSTRIL_DILATOR =            [[7], [1]];       // AU38 - nostril dilator
FacialExpr.NMF.NOSTRIL_COMPRESSOR =         [[8], [1]];       // AU39 - nostril compressor
// LIPS
FacialExpr.NMF.LIP_CORNER_DEPRESSOR =       [[15, 16], [1,1]]; // AU15 sad 
FacialExpr.NMF.LIP_CORNER_DEPRESSOR_LEFT =  [[15], [1]]; // LAU15 sad
FacialExpr.NMF.LIP_CORNER_DEPRESSOR_RIGHT = [[16], [1]]; // RAU15 sad
FacialExpr.NMF.LIP_CORNER_PULLER =          [[13, 14], [1,1]]; // AU12 happy
FacialExpr.NMF.LIP_CORNER_PULLER_LEFT =     [[13], [1]]; // LAU12 happy
FacialExpr.NMF.LIP_CORNER_PULLER_RIGHT =    [[14], [1]]; // RAU12 happy
FacialExpr.NMF.LIP_STRETCHER =               [[21, 22], [1,1]];// AU20
FacialExpr.NMF.LIP_FUNNELER =               [[23], [1]];     // AU22
FacialExpr.NMF.LIP_TIGHTENER =              [[19, 20, 24, 25], [1, 1, 0.3, 0.3]];     // AU23 TODO: PUCKERER + PRESSOR
FacialExpr.NMF.LIP_PUCKERER =               [[19, 20], [1,1]]; // AU18 mouth narrow
FacialExpr.NMF.LIP_PUCKERER_LEFT =          [[19], [1]]; // AU18L mouth narrow left
FacialExpr.NMF.LIP_PUCKERER_RIGHT =         [[20], [1]]; // AU18R mouth narrow right
FacialExpr.NMF.LIP_PRESSOR =                [[24, 25], [1,1]]; // AU24
FacialExpr.NMF.LIPS_PART =                  [[26], [1.0]]; //AU25
FacialExpr.NMF.LIP_SUCK =                   [[27, 28], [1,1]];// AU28
FacialExpr.NMF.LIP_SUCK_UPPER =             [[27], [1]];// AU28U upper lip in
FacialExpr.NMF.LIP_SUCK_LOWER =             [[28], [1]];// AU28D lower lip in 
FacialExpr.NMF.LOWER_LIP_DEPRESSOR =        [[17, 18], [1,1]]; // AU16
FacialExpr.NMF.LOWER_LIP_DEPRESSOR_LEFT =   [[17], [1]]; // LAU16
FacialExpr.NMF.LOWER_LIP_DEPRESSOR_RIGHT =  [[18], [1]]; // RAU16
FacialExpr.NMF.UPPER_LIP_RAISER =           [[11, 12], [1,1]]; // AU10
FacialExpr.NMF.UPPER_LIP_RAISER_LEFT =      [[11], [1]]; // AU10L
FacialExpr.NMF.UPPER_LIP_RAISER_RIGHT =     [[12], [1]]; // AU10R
FacialExpr.NMF.CHIN_RAISER =                [[40], [1]]; // AU17 mouth up
FacialExpr.NMF.DIMPLER =                    [[9, 10], [1, 1]]; // AU14
FacialExpr.NMF.DIMPLER_LEFT =               [[9], [1]]; // LAU14
FacialExpr.NMF.DIMPLER_RIGHT =              [[10], [1]]; // RAU14
FacialExpr.NMF.LIP_BITE =                   [[28, 35, 36], [1, 0.1, 0.05]]; // AU32
// MOUTH-JAW
FacialExpr.NMF.SMILE_TEETH =                [[13, 14, 35], [0.5, 0.5, 0.2]];
FacialExpr.NMF.SMILE_TEETH_WIDE =           [[13, 14, 35], [1, 1, 0.2]];
FacialExpr.NMF.SMILE_CLOSED =               [[13, 14], [1, 1]]; // same as LIP_CORNER_DEPRESSOR
FacialExpr.NMF.ROUND_OPEN =                 [[19, 20, 35], [0.7, 0.7, 0.7]];
FacialExpr.NMF.ROUND_CLOSED =               [[19, 20], [1, 1]]; // same as LIP_PUCKERER
FacialExpr.NMF.MOUTH_STRETCH =              [[35], [1]]; // AU27
FacialExpr.NMF.CLOSE_TIGHT =                [[28, 19, 20, 27], [1, 1, 1, 1]];
FacialExpr.NMF.JAW_DROP =                   [[36], [1]]; // AU26
FacialExpr.NMF.JAW_THRUST =                 [[37], [1]]; // AU29
FacialExpr.NMF.JAW_SIDEWAYS_LEFT =          [[38], [1]]; // AU30L
FacialExpr.NMF.JAW_SIDEWAYS_RIGHT =         [[39], [1]]; // AU30R
// TONGUE
FacialExpr.NMF.TONGUE_BULGE_LEFT =          [[32], [1]];       // LAU36
FacialExpr.NMF.TONGUE_BULGE_RIGHT =         [[33], [1]];       // RAU36
FacialExpr.NMF.TONGUE_UP =                  [[30], [1]];       // 
FacialExpr.NMF.TONGUE_SHOW =                [[31], [1]];       // AU19
FacialExpr.NMF.TONGUE_WIDE =                [[34], [1]];       // 
FacialExpr.NMF.LIP_WIPE =                   [[29], [1]];       // AU37
// NECK
FacialExpr.NMF.NECK_TIGHTENER =             [[55], [1]];       // AU21


// Constructor
function FacialExpr(faceData, shift) {
    
    this.transition = false;

    let lexemes = faceData.lexeme;

    // Init face lexemes 
    if ( !lexemes ) { return; }

    // faceLexeme
    if ( typeof (lexemes) == "string" ){ this.initFaceLexeme(faceData, shift, [faceData]); }
    else if( Array.isArray( lexemes ) ){ this.initFaceLexeme(faceData, shift, lexemes); } // Several lexemes inside face/faceShift (faceData.lexeme = [{}, {}]...)
    else if ( typeof( lexemes ) == "object" ){ this.initFaceLexeme(faceData, shift, [lexemes]); } // One lexeme object inside face/faceShift (faceData.lexeme = {lexeme:"RAISE_BROWS"; amount: 0.1})

}

// There can be several facelexemes working at the same time then? lexemes is an array of lexeme objects
FacialExpr.prototype.initFaceLexeme = function (faceData, shift, lexemes) {

    // Sync
    this.start = faceData.start || 0.0;
    this.end = faceData.end;

    if (!shift) {
        this.attackPeak = faceData.attackPeak || (this.end - this.start) * 0.25 + this.start;
        this.relax = faceData.relax || (this.end - this.attackPeak) / 2 + this.attackPeak;
    } else {
        this.end = faceData.end || faceData.attackPeak || 0.0;
        this.attackPeak = faceData.attackPeak || this.end;
        this.relax = 0;
    }

    // Initial blend shapes and targets
    // Choose the ones to interpolate
    this.indicesLex = [];
    this.targetLexBSW = [];
    this.currentLexBSW = [];

    let j = 0; // index of accepted lexemes
    for (let i = 0; i < lexemes.length; i++) {

        let lexemeStr = lexemes[i].lexeme;
        if (typeof (lexemeStr) !== "string") { lexemeStr = "NO_LEXEME"; }
        else{ lexemeStr = lexemeStr.toUpperCase(); }

        // does lexeme exist?
        if ( !FacialExpr.NMF[lexemeStr] ) {
            this.transition = false;
            this.time = this.end;
            console.warn("Facial lexeme not found:", lexemeStr, ". Please refer to the standard.");
            continue;
        }

        // FacialExpr.NMF[lexemeStr] returns array [ BlendshapeIndices, weights ]
        let indices = FacialExpr.NMF[lexemeStr][0]; // get only the blendshape indices
        let weights = FacialExpr.NMF[lexemeStr][1]; // get only the blendshape weights

        // Indices
        this.indicesLex[j] = indices;
        this.targetLexBSW[j] = [];
        this.currentLexBSW[j] = [];

        // ensure lexeme has an intensity
        let lexemeAmount = lexemes[i].amount;
        lexemeAmount = (isNaN(lexemeAmount) || lexemeAmount == null ) ? faceData.amount : lexemeAmount;
        lexemeAmount = (isNaN(lexemeAmount) || lexemeAmount == null ) ? 1 : lexemeAmount;

        // set initial and target blendshape values for this lexeme
        for (let e = 0; e < indices.length; ++e) {
            this.targetLexBSW[j][e] = lexemeAmount * weights[e];
            this.currentLexBSW[j][e] = 0;
        }

        j++;
    }

    // Start
    this.transition = true;
    this.time = 0;
}

FacialExpr.prototype.updateLexemesBSW = function (dt) {

    // Immediate change
    if (this.attackPeak == 0 && this.end == 0 && this.time == 0) {
        for (var i = 0; i < this.indicesLex.length; i++)
            for (var j = 0; j < this.indicesLex[i].length; j++)
                this.currentLexBSW[i][j] = this.targetLexBSW[i][j];

        // Increase time and exit
        this.time += dt;
        return;
    }

    // Time increase
    this.time += dt;

    // Wait for to reach start time
    if (this.time < this.start) { return; }

    let inter = 0;

    if (this.time < this.start) {
        // did not even start
        inter = 0;
    } else if (this.time < this.attackPeak) {
        // Trans 1 - intro
        inter = (this.time - this.start) / (this.attackPeak - this.start);
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;
    } else if (this.time < this.relax) {
        // Stay still from attackPeak to relax
        inter = 1;
    } else if (this.time < this.end) {
        // Trans 2 - outro
        inter = (this.time - this.relax) / (this.end - this.relax);
        inter = 1 - inter; // outro goes from target to 0
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;
    } else {
        // end
        inter = 0;
        this.transition = false;
    }

    // Interpolation
    for (var i = 0; i < this.indicesLex.length; i++) {
        for (var j = 0; j < this.indicesLex[i].length; j++) {
            this.currentLexBSW[i][j] = inter * this.targetLexBSW[i][j];
        }
    }
}


// ---------------------------------------- FacialEmotion ----------------------------------

// Variables for Valence Arousal

// Psyche Interpolation Table
/*FacialExpr.prototype._emotionsVAE = [0.000, 0.000,  0.000,  0.000,  0.000,  0.000,  0.000,  0.000,  0.000,  0.000,  0.000,
                            0.000,  1.000,  0.138,  1.00,  0.000,  0.675,  0.000,  0.056,  0.200,  0.116,  0.100,
                            0.500,  0.866,  0.000,  0.700,  0.000,  0.000,  0.000,  0.530,  0.000,  0.763,  0.000,
                            0.866,  0.500,  0.000,  1.000,  0.000,  0.000,  0.600,  0.346,  0.732,  0.779,  0.000,
                            1.000,  0.000,  0.065,  0.000,  0.344,  0.344,  0.700,  0.000,  0.000,  1.000,  -0.300,
                            0.866,  -0.500, 0.391,  0.570,  0.591,  0.462,  1.000,  0.000,  0.981,  0.077,  0.000,
                            0.500,  -0.866, 0.920,  0.527,  0.000,  0.757,  0.250,  0.989,  0.000,  0.366,  -0.600,
                            0.000,  -1.000, 0.527,  0.000,  0.441,  0.531,  0.000,  0.000,  1.000,  0.000,  0.600,
                            -0.707, -0.707, 1.000,  0.000,  0.000,  0.000,  0.500,  1.000,  0.000,  0.000,  0.600,
                            -1.000, 0.000,  0.995,  0.000,  0.225,  0.000,  0.000,  0.996,  0.000,  0.996,  0.200,
                            -0.707, 0.707,  0.138,  0.075,  0.000,  0.675,  0.300,  0.380,  0.050,  0.216,  0.300];*/

/* "valence", "arousal" ,"BLINK","CHEEK_RAISER", "LIP_CORNER_PULLER", "BROW_LOWERER", "DIMPLER", "OUTER_BROW_RAISER", "
UPPER_LID_RAISER", "JAW_DROP","LID_TIGHTENER", "LIP_STRETCHER","NOSE_WRINKLER", "LIP_CORNER_DEPRESSOR", "CHIN_RAISER", "LIP_CORNER_PULLER_RIGHT", "DIMPLER_RIGHT"*/
/*FacialExpr.prototype._emotionsVAE = [
  [0.95, 0.23 ,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0 ],//HAPPINESS
  [-0.81, -0.57, 0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0 ], //SADNESS
  [0.22, 0.98, 0,0,0,1,0,1,1,1,0,0,0,0,0,0,0,0 ], //SURPRISED
  [-0.25, 0.98 ,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0 ], //FEAR
  [-0.76, 0.64,0 , 0,0,0,1,0,1,0,1,0,1,0,0,0,0,0 ], //ANGER
  [-0.96, 0.23,0, 0,0,0,0,0,0,0,0,0,0,1,1,1,0,0 ], //DISGUST
  [-0.98, -0.21,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,1,1 ], //CONTEMPT
  [0, 0 ,0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 ] //NEUTRAL
  ]*/

// VAE - Valence, Arousal, Expression(s)
FacialEmotion.prototype._emotionsVAE = [
    [//ANGRY
        -0.76, 0.64,
        [FacialExpr.NMF.BROW_LOWERER, 0.9],
        [FacialExpr.NMF.UPPER_LID_RAISER, 0.1],
        [FacialExpr.NMF.LID_TIGHTENER, 0.25],
        [FacialExpr.NMF.LIP_CORNER_DEPRESSOR, 0.3],
        [FacialExpr.NMF.NOSE_WRINKLER, 0.2]
    ],
    [//HAPPY
        0.95, 0.23,
        [FacialExpr.NMF.CHEEK_RAISER, 0.4],
        [FacialExpr.NMF.BROW_RAISER, 0.1],
        [FacialExpr.NMF.SMILE_CLOSED, 0.75]
    ],
    [//SAD
        -0.81, -0.57,
        [FacialExpr.NMF.INNER_BROW_RAISER, 0.8],
        [FacialExpr.NMF.BROW_LOWERER, 0.5],
        [FacialExpr.NMF.LIP_CORNER_DEPRESSOR, 0.5],
    ],
    [//SURPRISED
        0.22, 0.98,
        [FacialExpr.NMF.INNER_BROW_RAISER, 0.5],
        [FacialExpr.NMF.OUTER_BROW_RAISER, 0.5],
        [FacialExpr.NMF.UPPER_LID_RAISER, 0.3],
        [FacialExpr.NMF.LIP_PUCKERER, 0.3],
        [FacialExpr.NMF.JAW_DROP, 0.35],
        [FacialExpr.NMF.MOUTH_STRETCH, 0.1]
    ],
    [//SACRED
        -0.25, 0.98,
        [FacialExpr.NMF.INNER_BROW_RAISER, 1.0],
        [FacialExpr.NMF.BROW_LOWERER, 0.5],
        [FacialExpr.NMF.UPPER_LID_RAISER, 0.3],
        [FacialExpr.NMF.LIP_STRETCHER, 0.3],
        [FacialExpr.NMF.JAW_DROP, 0.3]
    ],
    [//DISGUSTED
        -0.96, 0.23,
        [FacialExpr.NMF.NOSE_WRINKLER, 0.35],
        [FacialExpr.NMF.BROW_LOWERER, 0.35],
        [FacialExpr.NMF.SQUINT, 0.5],
        [FacialExpr.NMF.LIP_CORNER_DEPRESSOR, 0.2],
        [FacialExpr.NMF.UPPER_LIP_RAISER, 0.3],
        [FacialExpr.NMF.LOWER_LIP_DEPRESSOR, 0.1]
    ],
    [//CONTEMPT
        -0.98, -0.21,
        [FacialExpr.NMF.LIP_CORNER_PULLER_LEFT, 0.7],
        [FacialExpr.NMF.DIMPLER_LEFT, 0.5]
    ],
    [
        0,0
    ]
]

function FacialEmotion(sceneBSW) {
    
    // The aim of this class is to contain the current emotion of the avatar. It is intended to be reused
    this.gridSize = 100; // 100 x 100
    this.precomputeVAWeights(this.gridSize); // this could be done as a static...

    this.transition = false;
    this.time = 0;

    this.sceneBSW = sceneBSW;

    // generate arrays for current, init and target. Current and init will be constantly swapped on initFaceVAlaro
    this.initialVABSW = [];
    this.targetVABSW = [];
    this.currentVABSW = [];
    if (sceneBSW) {
        this.currentVABSW = this.sceneBSW.slice();
    }
    else {
        this.currentVABSW = this._emotionsVAE[0].slice(2); // first two elements of emotions are valence and arousal
    }
    this.currentVABSW.fill(0);
    this.initialVABSW = this.currentVABSW.slice();
    this.targetVABSW = this.currentVABSW.slice();
    this.defaultVABSW = this.currentVABSW.slice();
}

FacialEmotion.prototype.reset = function () {
    
    this.currentVABSW.fill(0);
    this.initialVABSW.fill(0);
    this.targetVABSW.fill(0);
    this.defaultVABSW.fill(0);
    this.transition = false;
    this.time = 0;
}

FacialEmotion.prototype.precomputeVAWeights = function (gridsize = 100) {
    
    // generates a grid of gridSize size, where for each point it determines which emotion is closer and its distance

    // each emotion's valaro as point
    let valAroPoints = [];
    for (let count = 0; count < this._emotionsVAE.length; count++) {
        let point = new THREE.Vector2(this._emotionsVAE[count][0], this._emotionsVAE[count][1]); 
        valAroPoints.push(point);
    }
    let num_points = valAroPoints.length;
    let pos = new THREE.Vector2();

    // create grid
    let total_nums = 2 * gridsize * gridsize;
    this._precomputed_weights = new Float32Array(total_nums);
    let values = this._precomputed_weights;
    this._precomputed_weights_gridsize = gridsize;

    // for each point in grid
    for (var y = 0; y < gridsize; ++y)
        for (var x = 0; x < gridsize; ++x) {
            let nearest = -1;
            let min_dist = 100000;
            //normalize
            pos.x = x / gridsize;
            pos.y = y / gridsize;
            // center coords
            pos.x = pos.x * 2 - 1;
            pos.y = pos.y * 2 - 1;

            // which emotion is closer to this point and its distance
            for (var i = 0; i < num_points; ++i) {
                let dist = pos.distanceToSquared(valAroPoints[i]); 
                if (dist > min_dist)
                    continue;
                nearest = i;
                min_dist = dist;
            }

            values[2 * (x + y * gridsize)] = nearest;
            values[2 * (x + y * gridsize) + 1] = min_dist;
        }

    return values;
}

FacialEmotion.prototype.initFaceValAro = function (faceData, shift) {

    // Valence and arousal
    //let valaro = faceData.valaro || [0.1, 0.1];
    this.valaro = new THREE.Vector2().fromArray(faceData.valaro || [0.1, 0.1]);
    if (faceData.emotion) {
        switch (faceData.emotion) {
            case "ANGER":
                this.valaro.fromArray(this._emotionsVAE[0].slice(0, 2));
                break;
            case "HAPPINESS":
                this.valaro.fromArray(this._emotionsVAE[1].slice(0, 2));
                break;
            case "SADNESS":
                this.valaro.fromArray(this._emotionsVAE[2].slice(0, 2));
                break;
            case "SURPRISE":
                this.valaro.fromArray(this._emotionsVAE[3].slice(0, 2));
                break;
            case "FEAR":
                this.valaro.fromArray(this._emotionsVAE[4].slice(0, 2));
                break;
            case "DISGUST":
                this.valaro.fromArray(this._emotionsVAE[5].slice(0, 2));
                break;
            case "CONTEMPT":
                this.valaro.fromArray(this._emotionsVAE[6].slice(0, 2));
                break;
            default: // "NEUTRAL"
                this.valaro.fromArray(this._emotionsVAE[7].slice(0, 2));
                break;
        }
    }

    // Normalize
    let magn = this.valaro.length();
    if ( magn > 1 ) {
        this.valaro.x /= magn;
        this.valaro.y /= magn;
    }

    // Sync
    this.start = faceData.start || 0.0;
    this.end = faceData.end;
    this.amount = faceData.amount || 1.0;
    if ( shift ) {
        this.attackPeak = faceData.attackPeak || this.end;
        this.relax = this.end = this.attackPeak + 1;//faceData.end || faceData.attackPeak || 0.0; // ignored "end" and "relax" on shift
    } else {
        this.attackPeak = faceData.attackPeak || (this.end - this.start) * 0.25 + this.start;
        this.relax = faceData.relax || (this.end - this.attackPeak) / 2 + this.attackPeak;
    }
    this.amount = isNaN(faceData.amount) ? 1 : faceData.amount;

    // Target blend shapes
    this.VA2BSW(this.valaro, shift);

    // Start
    this.transition = true;
    this.time = 0;
}

FacialEmotion.prototype.VA2BSW = function (valAro, shift) {

    let gridsize = this.gridSize;
    let blendValues = this.currentVABSW.slice();
    // blendValues.length = this._emotionsVAE[0].length - 2;
    blendValues.fill(0);

    // position in grid to check
    let pos = valAro.clone();

    //precompute VA points weight in the grid
    let values = this._precomputed_weights;

    // one entry for each emotion
    let weights = [];
    weights.length = this._emotionsVAE.length;
    weights.fill(0);

    let total_inside = 0;
    let pos2 = new THREE.Vector2(); 
    //for each position in grid, check if distance to pos is lower than distance to its nearest emotion
    for (let y = 0; y < gridsize; ++y) {
        for (let x = 0; x < gridsize; ++x) {
            //normalize
            pos2.x = x / gridsize;
            pos2.y = y / gridsize;
            //center
            pos2.x = pos2.x * 2 - 1;
            pos2.y = pos2.y * 2 - 1;

            let data_pos = (x + y * gridsize) * 2; // two values in each entry
            let point_index = values[data_pos];
            let point_distance = values[data_pos + 1];
            let is_inside = pos2.distanceToSquared(pos) < (point_distance + 0.001);//epsilon
            if (is_inside) {
                weights[point_index] += 1;
                total_inside++;
            }
        }
    }

    // average each emotion with respect to amount of points near this.valAro
    for (let i = 0; i < weights.length; ++i) {
        weights[i] /= total_inside;
        let emotion = this._emotionsVAE[i]; // [ val, aro, [FacialExpr.NMF.BROW_LOWERER, 0.5],[FacialExpr.NMF.BROW_LOWERER, 0.5],[FacialExpr.NMF.BROW_LOWERER, 0.5], .. ]
        for( let j = 2; j < emotion.length; j++ ){ 
            // [FacialExpr.NMF.BROW_LOWERER, 0.5]
            let expression = emotion[j][0]; // FacialExpr.NMF.BROW_LOWERER == [ [1,2], [1,1] ]
            let exprAmount = emotion[j][1];
            for( let k = 0; k < expression[0].length; k++ ){ // [1,2]
                blendValues[ expression[0][k] ] += expression[1][k] * exprAmount * weights[i]; 
            }
        }
    }

    // swap initial state and current state arrays
    for (let j = 0; j < blendValues.length; j++) {
        this.targetVABSW[j] = blendValues[j] * this.amount;
        this.initialVABSW[j] = this.currentVABSW[j]; // initial and current should be the same
        if ( shift ){ // change default pose if shift
            this.defaultVABSW[j] = this.targetVABSW[j]; 
        }
    }
}

FacialEmotion.prototype.updateVABSW = function (dt) {
    if( this.transition == false ){
        for (let j = 0; j < this.currentVABSW.length; j++)
            this.currentVABSW[j] = this.defaultVABSW[j];
        return;
    }
    
    // Time increase
    this.time += dt;

    // Wait for to reach start time
    if (this.time < this.start){
        return;
    }

    // Stay still during attackPeak to relax
    if (this.time > this.attackPeak && this.time < this.relax){
        return;
    }

    // End
    if (this.time >= this.end) {
        for (let j = 0; j < this.currentVABSW.length; j++)
            this.currentVABSW[j] = this.defaultVABSW[j];
        this.transition = false;
        return;
    }

    let inter = 0;
    // Trans 1
    if (this.time <= this.attackPeak) {
        inter = (this.time - this.start) / (this.attackPeak - this.start);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;
        // Interpolation
        for (let j = 0; j < this.targetVABSW.length; j++)
            this.currentVABSW[j] = this.initialVABSW[j] * (1 - inter) + this.targetVABSW[j] * inter;
        return;
    }

    // Trans 2
    if (this.time > this.relax && this.time < this.end) {
        inter = (this.time - this.relax) / (this.end - this.relax);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter) * 0.5 + 0.5;
        // Interpolation
        for (let j = 0; j < this.targetVABSW.length; j++)
           this.currentVABSW[j] = this.defaultVABSW[j] * (1 - inter) + this.targetVABSW[j] * inter;
        return;
    }
}


// --------------------- GAZE (AND HEAD SHIFT DIRECTION) ---------------------
// BML
// <gaze or gazeShift start ready* relax* end influence target offsetAngle offsetDirection>
// influence [EYES, HEAD, NECK, SHOULDER, WAIST, WHOLE, ...]
// offsetAngle relative to target
// offsetDirection (of offsetAngle) [RIGHT, LEFT, UP, DOWN, UP_RIGHT, UP_LEFT, DOWN_LEFT, DOWN_RIGHT]
// target [CAMERA, RIGHT, LEFT, UP, DOWN, UP_RIGHT, UP_LEFT, DOWN_LEFT, DOWN_RIGHT]
// Scene inputs: gazePositions (head and camera), lookAt objects

// Gaze manager (replace BML)
GazeManager.gazePositions = {   
    "RIGHT": new THREE.Vector3(-30, 2, 100), "LEFT": new THREE.Vector3(30, 2, 100),
    "UP": new THREE.Vector3(0, 20, 100), "DOWN": new THREE.Vector3(0, -20, 100),
    "UP_RIGHT": new THREE.Vector3(-30, 20, 100), "UP_LEFT": new THREE.Vector3(30, 20, 100),
    "DOWN_RIGHT": new THREE.Vector3(-30, -20, 100), "DOWN_LEFT": new THREE.Vector3(30, -20, 100),
    "FRONT": new THREE.Vector3(0, 2, 100), "CAMERA": new THREE.Vector3(0, 2, 100)
};

Gaze.prototype.gazeBS = {
    "RIGHT": { squint: 0, eyelids: 0 }, "LEFT": { squint: 0, eyelids: 0 },
    "UP": { squint: 0.3, eyelids: 0 }, "DOWN": { squint: 0, eyelids: 0.2 },
    "UP_RIGHT": { squint: 0.3, eyelids: 0 }, "UP_LEFT": { squint: 0.3, eyelids: 0 },
    "DOWN_RIGHT": { squint: 0, eyelids: 0.2 }, "DOWN_LEFT": { squint: 0, eyelids: 0.2 },
    "FRONT": { squint: 0, eyelids: 0 }, "CAMERA": { squint: 0, eyelids: 0 }, 
    "EYES_TARGET": { squint: 0, eyelids: 0 }, "HEAD_TARGET": { squint: 0, eyelids: 0 }, "NECK_TARGET": { squint: 0, eyelids: 0 }
};

// Constructor (lookAt objects and gazePositions)
function GazeManager(lookAtNeck, lookAtHead, lookAtEyes, gazePositions = null) {
    
    // Gaze positions
    this.gazePositions = gazePositions || GazeManager.gazePositions;

    // LookAt objects
    this.lookAtNeck = lookAtNeck;
    this.lookAtHead = lookAtHead;
    this.lookAtEyes = lookAtEyes;

    // Gaze Actions (could create here inital gazes and then recycle for memory efficiency)
    this.gazeActions = [null, null, null]; // eyes, head, neck
    this.gazeActions[0] = new Gaze(this.lookAtEyes, this.gazePositions, true);
    this.gazeActions[1] = new Gaze(this.lookAtHead, this.gazePositions, false);
    this.gazeActions[2] = new Gaze(this.lookAtNeck, this.gazePositions, false);
}

GazeManager.prototype.reset = function () {

    this.lookAtNeck.position.set(0, 2.5, 100);
    this.lookAtHead.position.set(0, 2.5, 100);
    this.lookAtEyes.position.set(0, 2.5, 100);

    this.gazeActions[0].transition = false;
    this.gazeActions[1].transition = false;
    this.gazeActions[2].transition = false;

    this.gazeActions[0].eyelidsW = 0;
    this.gazeActions[0].squintW = 0;
}

// gazeData with influence, sync attr, target, offsets...
GazeManager.prototype.newGaze = function (gazeData, shift, gazePositions, headOnly) {

    // Gaze positions
    this.gazePositions = gazePositions || this.gazePositions;

    // Influence check, to upper case
    gazeData.influence = stringToUpperCase(gazeData.influence, "Gaze influence", "HEAD");


    // NECK requires adjustment of HEAD and EYES
    // HEAD requires adjustment of EYES
    switch (gazeData.influence) {
        case "NECK":
            this.gazeActions[2].initGazeData(gazeData, shift);
        case "HEAD":
            this.gazeActions[1].initGazeData(gazeData, shift);
        case "EYES":
            if (!headOnly)
                this.gazeActions[0].initGazeData(gazeData, shift);
        default: break;
    }
}

GazeManager.prototype.update = function (dt) {

    // Gaze actions update
    for (let i = 0; i < this.gazeActions.length; i++) {
        // If gaze exists (could inizialize empty gazes)
        if (this.gazeActions[i] && this.gazeActions[i].transition) {
            this.gazeActions[i].update(dt);
        }
    }

    return {
        eyelids: this.gazeActions[0].eyelidsW,
        squint: this.gazeActions[0].squintW
    };
}


// --------------------- GAZE (AND HEAD SHIFT DIRECTION) ---------------------

// Memory allocation of temporal arrays. Used only for some computations in initGazeValues
Gaze.prototype._tempQ = new THREE.Quaternion();
Gaze.prototype.targetP = new THREE.Vector3();

// Constructor
function Gaze(lookAt, gazePositions, isEyes = false) {

    this.isEyes = isEyes;

    // Gaze positions
    if (gazePositions) {
        this.gazePositions = gazePositions;
    }

    // Scene variables
    this.cameraEye = gazePositions["CAMERA"] || new THREE.Vector3();
    this.headPos = gazePositions["HEAD"] || new THREE.Vector3();
    this.lookAt = lookAt;

    // make it deactivated
    this.transition = false;
    this.eyelidsW = 0;
    this.squintW = 0;

    // Define initial and end positions
    this.InP = null; 
    this.EndP = null;
    this.DefP = gazePositions["FRONT"].clone();
}

Gaze.prototype.initGazeData = function (gazeData, shift) {

    // Sync
    this.start = gazeData.start || 0.0;
    this.end = gazeData.end || 2.0;
    if (!shift) {
        this.ready = gazeData.ready || this.start + (this.end - this.start) / 3;
        this.relax = gazeData.relax || this.start + 2 * (this.end - this.start) / 3;
    } else {
        this.ready = this.end;
        this.relax = 0;
    }

    // Offset direction
    this.offsetDirection = stringToUpperCase(gazeData.offsetDirection, "Gaze offsetDirection", "RIGHT");

    // Target
    this.target = stringToUpperCase(gazeData.target, "Gaze target", "FRONT");

    // Angle
    this.offsetAngle = gazeData.offsetAngle || 0.0;

    // Start
    this.transition = true;
    this.time = 0;

    // Extension - Dynamic
    this.dynamic = gazeData.dynamic || false;

    //Blendshapes
    this.eyelidsW = 0;
    this.eyelidsInitW = 0;
    this.eyelidsFinW = gazeData.eyelidsWeight || this.gazeBS[this.target].eyelids;
    this.squintW = gazeData.squintWeight || 0;
    this.squintInitW = gazeData.squintWeight || 0;
    this.squintFinW = gazeData.squintWeight || this.gazeBS[this.target].squint;

    // Define initial values
    this.initGazeValues();
    if ( shift ){ this.DefP = this.EndP.clone(); }

}


Gaze.prototype.update = function (dt) {

    if ( !this.transition )
        return;
    
    // Time increase
    this.time += dt;

    // Wait for to reach start time
    if (this.time < this.start)
        return;

    // Stay still during ready to relax
    if (this.time > this.ready && this.time < this.relax)
        return;

    // Extension - Dynamic (offsets do not work here)
    if (this.dynamic) {
        this.EndP.copy(this.gazePositions[this.target]);
    }

    if ( this.time <= this.ready ){ 
        let inter = (this.time - this.start) / (this.ready - this.start); 
        inter = Math.sin(Math.PI * inter - Math.PI * 0.5) * 0.5 + 0.5;
        if (this.isEyes) {
            this.eyelidsW = this.eyelidsInitW * (1 - inter) + this.eyelidsFinW * (inter);
            this.squintW = this.squintInitW * (1 - inter) + this.squintFinW * (inter);
        }
        // lookAt pos change
        this.lookAt.position.lerpVectors(this.InP, this.EndP, inter);
        return;
    } 
    
    if ( this.time <= this.end ){
        let inter = (this.time - this.relax) / (this.end - this.relax);
        inter = Math.sin(Math.PI * inter - Math.PI * 0.5) * 0.5 + 0.5;
        if (this.isEyes) {
            this.eyelidsW = this.eyelidsFinW * (1 - inter) + this.eyelidsInitW * (inter);
            this.squintW = this.squintFinW * (1 - inter) + this.squintInitW * (inter);
        }
        // lookAt pos change
        this.lookAt.position.lerpVectors(this.EndP, this.DefP, inter);
        return;
    }

    // End
    if (this.time > this.end) {
        // Extension - Dynamic
        if (this.dynamic) {
            this.lookAt.position.copy(this.DefP);
        }
        else {
            this.transition = false;
            this.lookAt.position.copy(this.DefP);
            this.eyelidsW = this.eyelidsInitW;
            this.squintW = this.squintInitW;
        }
    }
}

Gaze.prototype.initGazeValues = function () {

    // Find target position (copy? for following object? if following object and offsetangle, need to recalculate all the time!)
    if (this.gazePositions && this.gazePositions[this.target]) {
        this.targetP.copy(this.gazePositions[this.target]);
    } else {
        this.targetP.set(0, 110, 100);
    }

    // Angle offset
    // Define offset angles (respective to head position?)
    // Move to origin
    let q = this._tempQ;
    let v = this.targetP.sub(this.headPos);
    let magn = v.length();
    v.normalize();
    this.eyelidsFinW = this.gazeBS[this.target].eyelids;
    this.squintFinW = this.gazeBS[this.target].squint;
    // Rotate vector and reposition
    switch (this.offsetDirection) {
        case "UP_RIGHT":
            q.setFromAxisAngle(v, -25 * DEG2RAD);
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.offsetAngle * DEG2RAD);
            v.applyQuaternion(q);

            if (this.isEyes) {
                this.squintFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;

        case "UP_LEFT":
            q.setFromAxisAngle(v, -75 * DEG2RAD);
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.offsetAngle * DEG2RAD);
            v.applyQuaternion(q);
            if (this.isEyes) {

                this.squintFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;

        case "DOWN_RIGHT":
            q.setFromAxisAngle(v, -25 * DEG2RAD);
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.offsetAngle * DEG2RAD);
            v.applyQuaternion(q);
            if (this.isEyes) {
                this.eyelidsFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;

        case "DOWN_LEFT":
            q.setFromAxisAngle(v, 75 * DEG2RAD);
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.offsetAngle * DEG2RAD);
            v.applyQuaternion(q);
            if (this.isEyes) {
                this.eyelidsFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;

        case "RIGHT":
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.offsetAngle * DEG2RAD);
            break;

        case "LEFT":
            v.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.offsetAngle * DEG2RAD);
            break;

        case "UP":
            v = new THREE.Vector3(1, 0, 0);
            q.setFromAxisAngle(v, -45 * DEG2RAD);
            v.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.offsetAngle * DEG2RAD);
            v.applyQuaternion(q);
            if (this.isEyes) {
                this.squintFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;
        case "DOWN":
            /* quat.setAxisAngle(q, v, 45*DEG2RAD);//quat.setAxisAngle(q, v, 90*DEG2RAD);
             vec3.rotateY(v,v, this.offsetAngle*DEG2RAD);
             vec3.transformQuat(v,v,q);*/

            // let c = v.clone();
            // c.cross(new THREE.Vector3(0,1,0));
            // let q = new THREE.Quaternion();
            // q.setFromAxisAngle(c, this.offsetAngle*DEG2RAD)
            // //q.setFromAxisAngle(new, 0)//45*DEG2RAD);
            // //c.applyAxisAngle(c, this.offsetAngle*DEG2RAD);
            // v.applyQuaternion(q);
            // v.normalize()
            if (this.isEyes) {
                this.eyelidsFinW *= Math.abs(this.offsetAngle / 30)
            }
            break;
    }
    
    // Move to head position and save modified target position
    v.addScaledVector(v, magn);
    v.addVectors(v, this.headPos);
    this.targetP.copy(v)

    if (!this.lookAt || !this.lookAt.position)
        return console.log("ERROR: lookAt not defined ", this.lookAt);

    // Define initial and end positions
    this.InP = this.lookAt.position.clone();
    this.EndP = this.targetP.clone(); // why copy? targetP shared with several?
}


// --------------------- HEAD ---------------------
// BML
// <head start ready strokeStart stroke strokeEnd relax end lexeme repetition amount>
// lexeme [NOD, SHAKE, TILT, TILT_LEFT, TILT_RIGHT, TILT_FORWARD, TILT_BACKWARD, FORWARD, BACKWARD]
// repetition cancels stroke attr
// amount how intense is the head nod? 0 to 1

// head nods will go slightly up -> position = ready&stroke_start and stroke_end&relax
// Should work together with gaze. Check how far is from the top-bottom angle limits or right-left angle limits
// Scene inputs: head bone node, neutral rotation and lookAtComponent rotation
// Combination of gaze and lookAtComponent:
//if (this.headBML.transition){
//  this._lookAtHeadComponent.applyRotation = false;
//  this.headBML.update(dt);
//} else
//  this._lookAtHeadComponent.applyRotation = true;

// Constructor
// headNode is to combine gaze rotations and head behavior
function HeadBML(headData, headNode, lookAtRot, limVert, limHor) {

    // Rotation limits (from lookAt component for example)
    this.limVert = Math.abs(limVert) || 20;
    this.limHor = Math.abs(limHor) || 30;

    // Scene variables
    this.headNode = headNode;
    this.lookAtRot = new THREE.Quaternion(lookAtRot.x, lookAtRot.y, lookAtRot.z, lookAtRot.w);

    // Init variables
    this.initHeadData(headData);
}

// Init variables
HeadBML.prototype.initHeadData = function (headData) {
    
    // start -> ready -> strokeStart -> stroke -> strokeEnd -> relax -> end

    headData.lexeme = stringToUpperCase(headData.lexeme, "Head lexeme", "NOD");

    // Lexeme, repetition and amount
    this.lexeme = headData.lexeme || "NOD";
    this.amount = headData.amount || 0.2;

    // Maximum rotation amplitude
    if (this.lexeme == "NOD" || this.lexeme == "TILT_LEFT" || this.lexeme == "TILT_RIGHT" || this.lexeme == "TILT_FORWARD" || this.lexeme == "TILT_BACKWARD" || this.lexeme == "FORWARD" || this.lexeme == "BACKWARD")
        this.maxDeg = this.limVert * 2;
    else
        this.maxDeg = this.limHor * 2;

    // Sync start ready strokeStart stroke strokeEnd relax end
    this.start = headData.start || 0;
    this.end = headData.end || 2.0;

    this.ready = headData.ready || headData.strokeStart || (this.end / 4);
    this.relax = headData.relax || headData.strokeEnd || (this.end * 3 / 4);

    this.strokeStart = headData.strokeStart || this.ready;
    this.strokeEnd = headData.strokeEnd || this.relax;


    this.repetition = (isNaN(headData.repetition)) ? 0 : Math.abs(headData.repetition);
    this.repeatedIndx = 0;

    // Modify stroke and strokeEnd with repetition
    this.strokeEnd = this.strokeStart + (this.strokeEnd - this.strokeStart) / (1 + this.repetition)
    this.stroke = (this.strokeStart + this.strokeEnd) / 2;

    // Start
    this.transition = true;
    this.phase = 0;
    this.time = 0;

    this.currentAngle = 0;
    // Define initial values
    this.initHeadValues();
}

HeadBML.prototype.initHeadValues = function () {

    // Head initial rotation
    this.inQ = this.headNode.quaternion.clone();

    // Compare rotations to know which side to rotate
    // Amount of rotation
    var neutralInv = this.lookAtRot.clone().invert();
    var rotAmount = neutralInv.clone();
    rotAmount.multiply(this.inQ);
    var eulerRot = new THREE.Euler().setFromQuaternion(rotAmount);

    // X -> right(neg) left(pos)
    // Z -> up(neg) down(pos)

    // in here we choose which side to rotate and how much according to limits
    // the lookAt component should be stopped here (or set to not modify node, only final lookAt quat output)
    this.strokeAxis = new THREE.Vector3(1, 0, 0);
    this.strokeDeg = 0; // degrees of stroke
    this.readyDeg = 0; // ready will have some inertia in the opposite direction of stroke 

    switch ( this.lexeme ) {
        case "NOD":
            // nod will always be downwards
            this.strokeAxis.set(1, 0, 0);
            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.5;

            // If the stroke rotation passes the limit, change readyDeg
            if (eulerRot.z * RAD2DEG + this.strokeDeg > this.limVert)
                this.readyDeg = this.strokeDeg - this.limVert + eulerRot.z * RAD2DEG;
            break;
        
        case "SHAKE":
            this.strokeAxis.set(0, 1, 0);

            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.5;

            // Sign (left rigth)
            this.RorL = Math.sign(eulerRot.y) ? Math.sign(eulerRot.y) : 1;
            this.readyDeg *= -this.RorL;
            this.strokeDeg *= -this.RorL;
            break;
    
        case "TILT":
            this.strokeAxis.set(0, 0, 1);
            this.strokeDeg = this.amount * 20;
            this.readyDeg = this.strokeDeg * 0.5;
            break;

        case "TILT_LEFT":
            this.strokeAxis.set(0, 0, 1);
            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;

        case "TILT_RIGHT":
            this.strokeAxis.set(0, 0, -1);
            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;
        
        case "TILT_FORWARD":
            this.strokeAxis.set(-1, 0, 0);
            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;

        case "TILT_BACKWARD":
            this.strokeAxis.set(1, 0, 0);
            this.strokeDeg = this.amount * this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;
            
        case "FORWARD":
            // nod will always be downwards
            this.strokeAxis.set(-1, 0, 0);
            this.strokeDeg = this.amount * this.maxDeg ;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;

        case "BACKWARD":
            // nod will always be downwards
            this.strokeAxis.set(1, 0, 0);
            this.strokeDeg = this.amount *  this.maxDeg;
            this.readyDeg = this.strokeDeg * 0.8;
            if(!this.repetition) {
                
                this.strokeStart = this.ready;
                this.strokeEnd = this.relax;
            }
            break;
    }

    this.currentStrokeQuat = new THREE.Quaternion(); this.currentStrokeQuat.setFromAxisAngle(this.strokeAxis, 0); // current state of rotation
}


HeadBML.prototype.update = function (dt) {

    // Time increase
    this.time += dt;
    let inter = 0;
    // Wait for to reach start time
    if (this.time < this.start)
        return;

    // Repetition -> Redefine strokeStart, stroke and strokeEnd before update
    if (this.time < this.relax && this.time >= this.strokeEnd && this.repeatedIndx < this.repetition) {
        this.repeatedIndx++;
        let timeRep = (this.strokeEnd - this.strokeStart);
        this.strokeStart = this.strokeEnd;
        this.strokeEnd += timeRep;
        this.stroke = (this.strokeEnd + this.strokeStart) / 2;

        this.phase = 0;
    }

    // Ready
    if (this.time <= this.ready) {
        inter = (this.time - this.start) / (this.ready - this.start);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;

        this.currentAngle = -this.readyDeg * inter;
        this.currentStrokeQuat.setFromAxisAngle(this.strokeAxis, this.currentAngle * DEG2RAD);
    }

    // StrokeStart
    else if (this.time > this.ready && this.time < this.strokeStart) {
        return;
    }

    // Stroke (phase 1)
    else if (this.time >= this.strokeStart && this.time <= this.stroke ) {
        inter = (this.time - this.strokeStart) / (this.stroke - this.strokeStart);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;

        if (this.phase != 1 ) {
            if(this.repeatedIndx >= this.repetition && this.lexeme != "TILT" && this.lexeme != "NOD" && this.lexeme != "SHAKE" )
                return;
            this.phase = 1;
        }

        this.currentAngle = -this.readyDeg + inter * this.strokeDeg;
        this.currentStrokeQuat.setFromAxisAngle(this.strokeAxis, this.currentAngle * DEG2RAD);
    }

    // Stroke (phase 2)
    else if (this.time > this.stroke && this.time <= this.strokeEnd && this.repeatedIndx < this.repetition) {
        inter = (this.time - this.stroke) / (this.strokeEnd - this.stroke);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;

        if (this.phase != 2) {
            this.phase = 2;
        }

        this.currentAngle = -this.readyDeg + ( 1 - inter ) * this.strokeDeg;
        this.currentStrokeQuat.setFromAxisAngle(this.strokeAxis, this.currentAngle * DEG2RAD);
    }
   
    // StrokeEnd (no repetition)
    else if (this.time >= this.strokeEnd && this.time < this.relax) {
        return;
    }

    // Relax -> Move towards lookAt final rotation
    else if (this.time > this.relax && this.time <= this.end) {
        inter = (this.time - this.relax) / (this.end - this.relax);
        // Cosine interpolation
        inter = Math.cos(Math.PI * inter + Math.PI) * 0.5 + 0.5;
        this.currentStrokeQuat.setFromAxisAngle(this.strokeAxis, (1-inter) * this.currentAngle * DEG2RAD);
    }

    // End
    else if (this.time > this.end) {
        this.currentStrokeQuat.set(0,0,0,1);
        this.transition = false
        return;
    }

}

// Turn to upper case and error check
var stringToUpperCase = function (item, textItem, def) {
    // To upper case
    if (Object.prototype.toString.call(item) === '[object String]')
        return item.toUpperCase();
    else { // No string
        //console.warn(textItem + " not defined properly.", item);
        return def;
    }
}

// --------------------- LIPSYNC MODULE --------------------

// // Switch to https if using this script
// if (window.location.protocol != "https:")
//     window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);

// // Audio context
// if (!Lipsync.AContext)
// Lipsync.AContext = new AudioContext();

// Audio sources

Lipsync.prototype.refFBins = [0, 500, 700, 3000, 6000];

// Constructor
function Lipsync(threshold, smoothness, pitch) {

    // Freq analysis bins, energy and lipsync vectors
    this.energy = [0, 0, 0, 0, 0, 0, 0, 0];
    this.BSW = [0, 0, 0]; //kiss,lipsClosed,jaw

    // Lipsync parameters
    this.threshold = threshold || 0.0;
    this.dynamics = 30;
    this.maxDB = -30;

    this.smoothness = smoothness || 0.6;
    this.pitch = pitch || 1;
    // Change freq bins according to pitch
    this.fBins = [];
    this.defineFBins(this.pitch);

    // Initialize buffers
    this.init();

    // Output .csv (debug)
    //this.outstr = "time, e0, e1, e2, e3, bs_kiss, bs_lips_closed, bs_jaw\n";

    this.working = false;
}

// Start mic input
Lipsync.prototype.start = function (URL) {

    // Audio context
    if (!Lipsync.AContext)
        Lipsync.AContext = new AudioContext();
    // Restart
    this.stopSample();

    thatLip = this;
    if (URL === undefined) {
        /* navigator.getUserMedia({audio: true}, function(stream) {
          thatLip.stream = stream;
          thatLip.sample = thatLip.context.createMediaStreamSource(stream);
          thatLip.sample.connect(thatLip.analyser);
          console.log("Mic sampling rate:", thatLip.context.sampleRate);
          thatLip.analyser.disconnect();
          thatLip.gainNode.disconnect();
          thatLip.working = true;
        }, function(e){console.error("ERROR: get user media: ", e);});*/
    } else {
        this.loadSample(URL);
    }
}

Lipsync.prototype.loadBlob = function (blob) {

    // Audio context
    if (Lipsync.AContext)
        Lipsync.AContext.resume();
    const fileReader = new FileReader()

    // Set up file reader on loaded end event
    fileReader.onloadend = () => {

        const arrayBuffer = fileReader.result;
        var that = this;
        this.context.decodeAudioData(arrayBuffer,
            function (buffer) {
                //LGAudio.cached_audios[URL] = buffer;
                that.stopSample();

                that.sample = Lipsync.AContext.createBufferSource();
                that.sample.buffer = buffer;
                console.log("Audio loaded");
                that.playSample();
            }, function (e) { console.log("Failed to load audio"); });
    };

    //Load blob
    fileReader.readAsArrayBuffer(getBlobURL(blob))
}

Lipsync.prototype.loadSample = function (inURL) {
    
    var URL = LS.RM.getFullURL(inURL);

    if (LGAudio.cached_audios[URL] && URL.indexOf("blob:") == -1) {
        this.stopSample();
        this.sample = Lipsync.AContext.createBufferSource();
        this.sample.buffer = LGAudio.cached_audios[URL];
        this.playSample();
    } else {
        var request = new XMLHttpRequest();
        request.open('GET', URL, true);
        request.responseType = 'arraybuffer';

        var that = this;
        request.onload = function () {
            that.context.decodeAudioData(request.response,
                function (buffer) {
                    LGAudio.cached_audios[URL] = buffer;
                    that.stopSample();
                    that.sample = Lipsync.AContext.createBufferSource();
                    that.sample.buffer = buffer;
                    console.log("Audio loaded");
                    that.playSample();
                }, function (e) { console.log("Failed to load audio"); });
        };

        request.send();
    }
}

Lipsync.prototype.playSample = function () {

    // Sample to analyzer
    this.sample.connect(this.analyser);
    // Analyzer to Gain
    this.analyser.connect(this.gainNode);
    // Gain to Hardware
    this.gainNode.connect(this.context.destination);
    // Volume
    this.gainNode.gain.value = 1;
    console.log("Sample rate: ", this.context.sampleRate);
    var that = this;
    this.working = true;
    this.sample.onended = function () { that.working = false; };
    // start
    this.sample.start(0);
    //this.sample.loop = true;

    // Output stream (debug)
    //this.timeStart = thiscene.time;
    //this.outstr = "time, e0, e1, e2, e3, bs_kiss, bs_lips_closed, bs_jaw\n";
}

// Update lipsync weights
Lipsync.prototype.update = function () {

    if (!this.working)
        return;

    // FFT data
    if (!this.analyser) {
        //if (this.gainNode){
        // Analyser
        this.analyser = this.context.createAnalyser();
        // FFT size
        this.analyser.fftSize = 1024;
        // FFT smoothing
        this.analyser.smoothingTimeConstant = this.smoothness;

        //}
        //else return;
    }

    // Short-term power spectrum
    this.analyser.getFloatFrequencyData(this.data);

    // Analyze energies
    this.binAnalysis();
    // Calculate lipsync blenshape weights
    this.lipAnalysis();
}

Lipsync.prototype.stop = function (dt) {
    
    // Immediate stop
    if (dt === undefined) {
        // Stop mic input
        this.stopSample();

        this.working = false;
    }
    // Delayed stop
    else {
        thatLip = this;
        setTimeout(thatLip.stop.bind(thatLip), dt * 1000);
    }
}

// Define fBins
Lipsync.prototype.defineFBins = function (pitch) {
    
    for (var i = 0; i < this.refFBins.length; i++)
        this.fBins[i] = this.refFBins[i] * pitch;
}

// Audio buffers and analysers
Lipsync.prototype.init = function () {

    // Audio context
    if (!Lipsync.AContext)
        Lipsync.AContext = new AudioContext();
    var context = this.context = Lipsync.AContext;
    // Sound source
    this.sample = context.createBufferSource();
    // Gain Node
    this.gainNode = context.createGain();
    // Analyser
    this.analyser = context.createAnalyser();
    // FFT size
    this.analyser.fftSize = 1024;
    // FFT smoothing
    this.analyser.smoothingTimeConstant = this.smoothness;
    // FFT buffer
    this.data = new Float32Array(this.analyser.frequencyBinCount);
}

// Analyze energies
Lipsync.prototype.binAnalysis = function () {

    // Signal properties
    var nfft = this.analyser.frequencyBinCount;
    var fs = this.context.sampleRate;

    var fBins = this.fBins;
    var energy = this.energy;

    // Energy of bins
    for (var binInd = 0; binInd < fBins.length - 1; binInd++) {
        // Start and end of bin
        var indxIn = Math.round(fBins[binInd] * nfft / (fs / 2));
        var indxEnd = Math.round(fBins[binInd + 1] * nfft / (fs / 2));

        // Sum of freq values
        energy[binInd] = 0;
        for (var i = indxIn; i < indxEnd; i++) {
            // Power Spectogram
            //var value = Math.pow(10, this.data[i]/10);
            // Previous approach
            var value = 0.5 + (this.data[i] + 20) / 140;
            if (value < 0) value = 0;
            energy[binInd] += value;
        }
        // Divide by number of sumples
        energy[binInd] /= (indxEnd - indxIn);
        // Logarithmic scale
        //energy[binInd] = 10*Math.log10(energy[binInd] + 1E-6);
        // Dynamic scaling
        //energy[binInd] = ( energy[binInd] - this.maxDB)/this.dynamics + 1 - this.threshold;
    }
}

// Calculate lipsyncBSW
Lipsync.prototype.lipAnalysis = function () {

    var energy = this.energy;

    if (energy !== undefined) {

        var value = 0;

        // Kiss blend shape
        // When there is energy in the 1 and 2 bin, blend shape is 0
        value = (0.5 - (energy[2])) * 2;
        if (energy[1] < 0.2)
            value = value * (energy[1] * 5)
        value = Math.max(0, Math.min(value, 1)); // Clip
        this.BSW[0] = value;

        // Lips closed blend shape
        value = energy[3] * 3;
        value = Math.max(0, Math.min(value, 1)); // Clip
        this.BSW[1] = value;

        // Jaw blend shape
        value = energy[1] * 0.8 - energy[3] * 0.8;
        value = Math.max(0, Math.min(value, 1)); // Clip
        this.BSW[2] = value;
    }
}

// Stops mic input
Lipsync.prototype.stopSample = function () {
    
    // If AudioBufferSourceNode has started
    if (this.sample)
        if (this.sample.buffer)
            this.sample.stop(0);

    // If microphone input
    if (this.stream) {
        var tracks = this.stream.getTracks();
        for (var i = 0; i < tracks.length; i++)
            if (tracks[i].kind = "audio")
                tracks[i].stop();
        this.stream = null;
    }
}

function getBlobURL(arrayBuffer) {
    var i, l, d, array;
    d = arrayBuffer;
    l = d.length;
    array = new Uint8Array(l);
    for (var i = 0; i < l; i++) {
        array[i] = d.charCodeAt(i);
    }
    var b = new Blob([array], { type: 'application/octet-stream' });
    // let blob = blobUtil.arrayBufferToBlob(arrayBuffer, "audio/wav")
    return b
}


// ------------------------ TEXT TO LIP --------------------------------------------

function Text2LipInterface() {
    
    let _ = new Text2Lip();

    this.start = _.start.bind( _ );
    this.stop = _.stop.bind( _ );
    this.pause = _.pause.bind( _ );
    this.resume = _.resume.bind( _ );

    this.update = _.update.bind( _ );

    this.setEvent = _.setEvent.bind( _ );
    this.setTables = _.setTables.bind( _ );
    this.setDefaultSpeed = _.setDefaultSpeed.bind( _ );
    this.setDefaultIntensity = _.setDefaultIntensity.bind( _ );
    this.setSourceBSWValues = _.setSourceBSWValues.bind( _ );

    this.getDefaultSpeed = _.getDefaultSpeed.bind( _ );
    this.getDefaultIntensity = _.getDefaultIntensity.bind( _ );
    this.getCurrentIntensity = _.getCurrentIntensity.bind( _ );


    this.getSentenceDuration = _.getSentenceDuration.bind( _ ); // THE ONLY REASON THIS IS NOT STATIC IS BECAUSE IT USES this.DEFAULT_SPEED   
    this.cleanQueueSentences = _.cleanQueueSentences.bind( _ );
    this.pushSentence = _.pushSentence.bind( _ );

    this.getBSW = function () { return _.BSW; }

    this.getCompactState = _.getCompactState.bind( _ );
    this.isWorking = _.isWorking.bind( _ );
    this.isPaused = _.isPaused.bind( _ );
    this.needsSentences = _.needsSentences.bind( _ );
    this.getNumSentences = _.getNumSentences.bind( _ );
    this.getMaxNumSentences = _.getMaxNumSentences.bind( _ );
}

function Text2Lip() {
    
    this.DEFAULT_SPEED = 8; // phonemes/s
    this.DEFAULT_INTENSITY = 0.5; // [0,1]

    // tables ( references )
    this.lowerBoundVisemes = null;
    this.upperBoundVisemes = null;
    this.coarts = null;
    this.ph2v = null;
    this.numShapes = 0;

    // manages display of a sentence
    this.working = false;
    this.paused = false;
    this.speed = this.DEFAULT_SPEED; // phonemes/s
    this.intensity = this.DEFAULT_INTENSITY; // [0,1]
    this.text = "";
    this.currTargetIdx = 0; // current target character (aka when t=1 during interpolation, this char is shown)
    this.currT = 0; // current time of interpolation
    this.useCoarticulation = true;
    this.delay = 0;

    // variables for managing list of sentences to display
    this.currSent = null;
    this.queueIdx = 0;
    this.queueSize = 0;
    this.sentenceQueue = new Array( Text2Lip.QUEUE_MAX_SIZE );
    this.sentenceIDCount = 1; // when pushing, a 0 will mean failure. Start IDs at 1

    // blendshape weights. User can use this to do mouthing
    this.BSW = new Float32Array( this.numShapes ); this.BSW.fill( 0 );

    // needed because of coarticulation
    this.currV = new Float32Array( this.numShapes ); this.currV.fill( 0 );
    this.targV = new Float32Array( this.numShapes ); this.targV.fill( 0 ); // next visem - target

    // event listeners
    this.onIdle = null;
    this.onSentenceEnd = null; // receives ended sentence
    this.onSentenceStart = null; // receives starting sentence

    // default setup
    this.setTables( T2LTABLES.PhonemeToViseme, T2LTABLES.Coarticulations, T2LTABLES.LowerBound, T2LTABLES.UpperBound );
}

Text2Lip.prototype.setDefaultSpeed = function ( speed ) {
    if ( typeof ( speed ) === 'number' && speed > 0.001 ) {
        this.DEFAULT_SPEED = speed;
        return true;
    }
    return false;
};

Text2Lip.prototype.setDefaultIntensity = function ( intensity ) {
    if ( typeof ( intensity ) === 'number' ) {
        this.DEFAULT_INTENSITY = Math.max( 0.0, Math.min( 1.0, intensity ) );
        return true;
    }
    return false;
};

Text2Lip.prototype.setSourceBSWValues = function ( values ) {
    // values is only a number
    if ( typeof ( values ) == "number" ) {
        for ( let i = 0; i < this.currV.length; ++i ) {
            this.currV[ i ] = values;
        }
        return;
    }

    // values is an array
    for ( let i = 0; i < this.BSW.length && i < values.length; ++i ) {
        let value = ( typeof ( values[ i ] ) == "number" ) ? values[ i ] : 0.0;
        this.currV[ i ] = value;
    }
}

Text2Lip.prototype.setEvent = function ( eventType, fun ) {
    if ( typeof ( fun ) !== 'function' ) { return false; }
    switch ( eventType ) {
        case "onIdle": this.onIdle = fun; break;
        case "onSentenceEnd": this.onSentenceEnd = fun; break;
        case "onSentenceStart": this.onSentenceStart = fun; break;
        default: return false;
    }
    return true;
}

Text2Lip.prototype.setTables = function ( phonemeToViseme, coarts, lowerBoundVisemes, upperBoundVisemes = null ) {
    this.lowerBoundVisemes = lowerBoundVisemes;
    this.upperBoundVisemes = ( upperBoundVisemes && upperBoundVisemes.length > 0 ) ? upperBoundVisemes : lowerBoundVisemes;
    this.coarts = coarts;
    this.ph2v = phonemeToViseme;

    this.numShapes = 0
    if ( lowerBoundVisemes && lowerBoundVisemes.length > 0 ) {
        this.numShapes = lowerBoundVisemes[ 0 ].length;
    }

    this.BSW = new Float32Array( this.numShapes ); this.BSW.fill( 0 );
    this.currV = new Float32Array( this.numShapes ); this.currV.fill( 0 );
    this.targV = new Float32Array( this.numShapes ); this.targV.fill( 0 ); // next visem - target
}

Text2Lip.prototype.getDefaultSpeed = function () { return this.DEFAULT_SPEED; }
Text2Lip.prototype.getDefaultIntensity = function () { return this.DEFAULT_INTENSITY; }
Text2Lip.prototype.getCurrentIntensity = function () { return this.getIntensityAtIndex( this.currTargetIdx ); }

Text2Lip.prototype.getIntensityAtIndex = function ( index ) {
    if ( this.currSent ) {
        if ( index >= 0 && index < this.currSent.text.length ) {
            let phInt = this.currSent.phInt;
            if ( phInt && index < phInt.length ) { return phInt[ index ]; }
            else if ( this.currSent.sentInt !== null ) { return this.currSent.sentInt; }
        }
    }
    return this.DEFAULT_INTENSITY;
}

/**
* 
* @param {*} phoneme 
* @param {Array} outResult if not null, result will be written to this array. Otherwise a new array is generated with the resulting values and returned 
* @returns returns outResult or a new Float32Array
*/
Text2Lip.prototype.getViseme = function ( phoneme, outResult = null, ) {
    // this handles properly undefined and nulls.
    if ( !( phoneme in this.ph2v ) ) { return this.lowerBoundVisemes[ 0 ]; } // assuming there are visemes
    let visIdx = this.ph2v[ phoneme ];
    if ( visIdx < 0 || visIdx >= this.lowerBoundVisemes.length ) { return this.lowerBoundVisemes[ 0 ]; } // assuming there are visemes

    let lower = this.lowerBoundVisemes[ visIdx ];
    let upper = this.upperBoundVisemes[ visIdx ];

    let result = ( outResult ) ? outResult : ( new Float32Array( this.numShapes ) );
    let intensity = this.intensity;
    for ( let i = 0; i < this.numShapes; i++ ) {
        result[ i ] = lower[ i ] * ( 1 - intensity ) + upper[ i ] * intensity;
    }
    return result;
}

/**
* 
* @param {*} phoneme 
* @returns returns a reference to the coart entry
*/
Text2Lip.prototype.getCoarts = function ( phoneme ) {
    // this handles properly undefined and nulls.
    if ( !( phoneme in this.ph2v ) ) { return this.coarts[ 0 ]; } // assuming there are coarts
    let visIdx = this.ph2v[ phoneme ];
    if ( visIdx < 0 || visIdx >= this.coarts.length ) { return this.coarts[ 0 ]; } // assuming there are visemes
    return this.coarts[ visIdx ];
}

/**
* 
* @param {*} phoneme 
* @param {*} phonemeAfter 
* @param {*} outResult  if not null, result will be written to this array. Otherwise a new array is generated with the resulting values and returned 
* @returns returns outResult or a new Float32Array
*/
Text2Lip.prototype.getCoarticulatedViseme = function ( phoneme, phonemeAfter, outResult = null ) {
    let rawTarget = this.getViseme( phoneme );
    let coartsW = this.getCoarts( phoneme ); // coarticulation weights of target phoneme

    //let visemePrev = this.currV; // phoneme before target
    let visemeAfter = this.getViseme( phonemeAfter ); // phoneme after target

    let result = ( outResult ) ? outResult : ( new Float32Array( this.numShapes ) );

    for ( let i = 0; i < this.numShapes; ++i ) {
        result[ i ] = ( 1.0 - coartsW[ i ] ) * rawTarget[ i ] + coartsW[ i ] * visemeAfter[ i ]//(0.2 * visemePrev[i] + 0.8 * visemeAfter[i]);
    }

    return result;
}

// constant
Text2Lip.QUEUE_MAX_SIZE = 32;

Text2Lip.prototype.start = function () {
    this.stop( false );
    this.working = true;
    this.paused = false;

    this.changeCurrentSentence( false );
}

Text2Lip.prototype.pause = function () { this.paused = this.working; } // can only be paused if working
Text2Lip.prototype.resume = function () { this.paused = false; }

/**
* stops update. No sentence is modified. However some variables are reseted, meaning the sentence being displayed currently will start from the beginning 
* if a start is called
* To completely clean the queue, call cleanQueueSentences or pass true as argument
* @param {Bool} cleanQueue if true, all pending sentences are cleared and will not be displayed. 
*/
Text2Lip.prototype.stop = function ( cleanQueue = false ) {
    this.working = false;
    this.paused = false;
    this.currTargetIdx = 0; // for a smooth intro
    this.currT = 0;

    this.BSW.fill( 0 );
    this.currV.fill( 0 );
    this.targV.fill( 0 );

    if ( !!cleanQueue ) // force to be boolean
        this.cleanQueueSentences();
}

/**
* returns a number 
* Bit 0: set when module is not working ( stopped )
* Bit 1: set when module is working but paused
* Bit 2: set when module does not have more sentences to compute. If working, it is idle, waiting for some push
* if the entire value is 0, the module is actively working
* @returns 
*/
Text2Lip.prototype.getCompactState = function () {
    let result = !this.working;
    result |= this.paused << 1;
    result |= ( !this.queueSize ) << 2;
    return result;
}

Text2Lip.prototype.isWorking = function () { return this.working; }
Text2Lip.prototype.isPaused = function () { return this.paused; }
Text2Lip.prototype.needsSentences = function () { return !this.queueSize; }
Text2Lip.prototype.getNumSentences = function () { return this.queueSize; }
Text2Lip.prototype.getMaxNumSentences = function () { return Text2Lip.QUEUE_MAX_SIZE; }

Text2Lip.prototype.update = function ( dt ) {
    if ( !this.working || this.paused || !this.currSent ) { return; }

    // check for sentence delay
    if ( this.delay > 0.001 ) {
        this.delay -= dt;

        if ( this.delay >= 0.0 ) {
            return;
        }
        dt = -this.delay;
        this.delay = 0;
        if ( dt < 0.001 ) return;
    }
    let durations = this.currSent.phT;

    let invSpeed = 1.0 / this.speed; // seconds / phoneme
    this.currT += dt;

    let p = 0;
    let t = 0;
    let useGeneralSpeed = true; // when durations array ends, it should continue with general speed
    // use specific phoneme durations
    if ( durations && this.currTargetIdx < durations.length ) {
        useGeneralSpeed = false;
        let durationIdx = this.currTargetIdx;
        while ( durationIdx < durations.length && durations[ durationIdx ] < this.currT ) {
            this.currT -= Math.max( 0.001, durations[ durationIdx ] );
            durationIdx++;
            p++;
        }
        useGeneralSpeed = durationIdx >= durations.length; // durations array has ended. Check general speed
        this.currT = Math.max( 0, this.currT ); // just in case
        t = ( durationIdx < durations.length ) ? ( this.currT / durations[ durationIdx ] ) : Math.max( 0.0, Math.min( 1.0, this.currT * this.speed ) ); // after phoneme ease-in, t will be clamped to 1 until phoneme change
        this.currTargetIdx = durationIdx;
    }

    // no more specific phoneme durations and there is enough time to check 
    if ( useGeneralSpeed ) {
        // use temporal p variable to avoid overwriting durations array result
        let general_p = Math.floor( this.currT * this.speed ); // complete phonemes 
        t = ( this.currT * this.speed ) - general_p;  // remaining piece of phoneme, used on interpolation
        this.currT -= general_p * invSpeed;
        this.currTargetIdx += general_p;
        p += general_p;
    }


    // t function modifier;
    //t = 0.5* Math.sin( t * Math.PI - Math.PI * 0.5 ) +0.5; // weird on slow phonemes

    // phoneme changed
    if ( p > 0 ) {

        // copy target values to source Viseme. Several phonemes may have passed during this frame. Take the last real target phoneme
        // let lastPhonemeIndex = Math.max( 0.0, Math.min( this.text.length - 1, this.currTargetIdx - 1 ) ); // currTargetIdx here is always > 0. text.length here is always > 0
        // this.intensity = this.getIntensityAtIndex( lastPhonemeIndex ); // get last real target viseme with correct intensity, in case more than 1 phoneme change in the same frame

        // let lastPhoneme = this.text[ lastPhonemeIndex ];
            
        // if ( this.useCoarticulation ){
        //     let lastPhonemeNext = ( lastPhonemeIndex == ( this.text.length - 1 ) ) ? null : ( this.text[ lastPhonemeIndex + 1 ] );
        //     this.getCoarticulatedViseme( lastPhoneme, lastPhonemeNext, this.currV );
        // }
        // else{
        //     this.getViseme( lastPhoneme, this.currV );
        // }
        for ( let i = 0; i < this.numShapes; ++i ) {
            this.currV[ i ] = this.BSW[ i ];
        }

        // end of sentence reached
        if ( this.currTargetIdx >= this.text.length ) {
            this.getViseme( this.text[ this.text.length-1 ], this.currV );
            for ( let i = 0; i < this.numShapes; ++i ) { this.BSW[ i ] = this.currV[ i ]; } // currV holds the last real target phoneme
            this.changeCurrentSentence();
            return;
        }

        this.intensity = this.getIntensityAtIndex( this.currTargetIdx ); // get intensity for next target

        if ( !this.useCoarticulation ) {
            this.getViseme( this.text[ this.currTargetIdx ], this.targV );
        }
        else {
            let targetPhoneme = this.text[ this.currTargetIdx ];
            let targetPhonemeNext = ( this.currTargetIdx == ( this.text.length - 1 ) ) ? null : this.text[ this.currTargetIdx + 1 ];
            this.getCoarticulatedViseme( targetPhoneme, targetPhonemeNext, this.targV );
        }
    }

    // final interpolation
    let BSW_0 = this.currV;
    let BSW_1 = this.targV;

    for ( let i = 0; i < this.numShapes; ++i ) {
        this.BSW[ i ] = ( 1.0 - t ) * BSW_0[ i ] + t * BSW_1[ i ];
    }
}

Text2Lip.prototype.cleanQueueSentences = function () {
    this.queueIdx = 0;
    this.currSent = null;
    this.queueSize = 0;
    this.sentenceQueue.fill( null );
}

/**
* sets all necessary parameters for the sentence indicated by queueIdx (if any).  
* @param {Bool} advanceIndex before setting paramters, index of sentence is incremented and amoun of sentences reduced, discarding the previous sentence
* @returns 
*/
Text2Lip.prototype.changeCurrentSentence = function ( advanceIndex = true ) {

    if ( advanceIndex ) { // when executing start(), do not advance 
        --this.queueSize;
        this.sentenceQueue[ this.queueIdx ] = null; // dereference obj
        this.queueIdx = ( this.queueIdx + 1 ) % Text2Lip.QUEUE_MAX_SIZE;

        // end events
        if ( this.currSent && this.onSentenceEnd ) { this.onSentenceEnd( this.currSent ); }
        if ( this.currSent.onEndEvent ) { this.currSent.onEndEvent(); }
    }

    if ( this.queueSize <= 0 ) {
        this.currT = 0;
        this.cleanQueueSentences();
        if ( this.onIdle ) { this.onIdle(); }
        return;
    }

    // parameters setup
    this.currSent = this.sentenceQueue[ this.queueIdx ];

    this.text = this.currSent.text;
    this.speed = this.currSent.speed;
    this.delay = this.currSent.delay;
    this.useCoarticulation = this.currSent.useCoart;

    this.currTargetIdx = 0;
    if ( !advanceIndex ) { this.currT = 0; } // reset timer only if called from start. Otherwise keep remaining time from previous sentence

    // target first phoneme
    this.intensity = this.getIntensityAtIndex( this.currTargetIdx ); // get target viseme with correct intensity

    if ( this.useCoarticulation ) {
        let targetPhoneme = this.text[ 0 ];
        let targetPhonemeNext = ( this.text.length > 1 ) ? this.text[ 1 ] : null;
        this.getCoarticulatedViseme( targetPhoneme, targetPhonemeNext, this.targV );
    }
    else {
        this.getViseme( this.text[ 0 ], this.targV );
    }

    // Start events
    if ( this.onSentenceStart ) { this.onSentenceStart( this.currSent ); } // generic start event
    if ( this.currSent.onStartEvent ) { this.currSent.onStartEvent(); }     // sentence specifici start event
}

/**
* Adds sentence to the queue.
WARNING!!!
Each sentence will have a smooth intro and outro. (from neutral to phoneme and from phoneme to neutral pose)
   - Intro time DOES NOT have to be accounted for on any timing
   - Outro time HAVE to be accounted for timings. If not included in sentT, the system will use default phoneme speed to transition to neutral. sentT should take it into account
Any value below 0.001 will be ignored.
* @param {string/array} text string of phonemes to display 
* @param {object} options object containing any of the optional string of phonemes to display.
* @param {Float32Array} phT (Optional) timing for each phoneme. Overrides sentT, speed and default speed.
* @param {Number} sentT (Optional): Number, timing (in seconds) of whole string. Overrides default speed and speed argument. Delay not included. Defaults to null.
* @param {Number} speed (Optional) phonemes/s of whole string. Overrides default speed. Delay not included.
* @param {Float32Array} phInt (Optional) intensity for each phoneme. Overrides sentInt and default intensity.
* @param {Number} sentInt (Optional) intensity of whole string. Overrides default intensity. Delay not included.
* @param {Boolean} useCoart (Optional) use coarticulation. Default to true.
* @param {Number} delay (Optional) delay to start playing this string. Delay starts at the end of the sentence it is being played now. If none, delay starts immediately.
* @param {Boolean} copyArrays (Optional) Whether to create new arrays and copy values or directly use the reference sent as argument. Defaults to false (only reference is used).
* @param {Boolean} outro (Optional) Whether to automatically include a final "." into the string to end in neutral pose. Defaults to false.
* @param {Function} onStartEvent (Optional) when sentence starts, this event is called after the generic onSentenceStart event.
* @param {Function} onEndEvent (Optional) when sentence ends, this event is called after the generic onSentenceEnd event.
* @returns the id number of the sentence if successful. 0 otherwise.
*/
Text2Lip.prototype.pushSentence = function ( text, options = {} ) {
    let phT = options.phT;
    let sentT = options.sentT;
    let speed = options.speed;
    let phInt = options.phInt;
    let sentInt = options.sentInt;
    let delay = options.delay;
    let outro = options.outro;
    let useCoart = options.useCoart;
    let copyArrays = options.copyArrays;
    let onEndEvent = options.onEndEvent;
    let onStartEvent = options.onStartEvent;

    if ( this.queueSize === Text2Lip.QUEUE_MAX_SIZE ) { return null; }
    if ( !text || !text.length ) { return null; }

    // clean input
    phT = phT ? new Float32Array( phT ) : null;
    phInt = phInt ? new Float32Array( phInt ) : null;

    if ( copyArrays ) {
        text = Array.from( text ); // create new array from
        if ( phT ) {
            let temp = new Float32Array( phT.length );
            temp.set( phT );
            phT = temp;
        }
        if ( phInt ) {
            let temp = new Float32Array( phInt.length );
            temp.set( phInt );
            phInt = temp;
        }
    }

    // put outro 
    if ( !!outro ) {
        if ( typeof ( text ) === 'string' ) { text = text + "."; }
        else { text.push( "." ); }
    }
    if ( text.length < 0 ) { return null; }


    let sentenceSpeed = this.DEFAULT_SPEED;
    if ( typeof ( speed ) === 'number' && !isNaN( speed ) && speed >= 0.001 ) { sentenceSpeed = speed; }
    if ( typeof ( sentT ) === 'number' && !isNaN( sentT ) && sentT >= 0.001 ) { sentenceSpeed = text.length / sentT; }
    if ( typeof ( delay ) !== 'number' || isNaN( delay ) || delay < 0 ) { delay = 0; }
    if ( typeof ( useCoart ) === 'undefined' ) { useCoart = true; } useCoart = !!useCoart;
    if ( !( onEndEvent instanceof Function ) ) { onEndEvent = null; }
    if ( !( onStartEvent instanceof Function ) ) { onStartEvent = null; }


    if ( typeof ( sentInt ) !== 'number' || isNaN( sentInt ) ) { sentInt = null; } // this allows for changing intensity while mouthing through setDefaulIntensity
    else { sentInt = Math.max( 0.0, Math.min( 1.0, sentInt ) ); }


    let id = this.sentenceIDCount++;
    let totalTime = this.getSentenceDuration( text, options ); // doing work twice, though...
    let sentenceObj = {
        id: id,
        totalTime: totalTime,
        text: text,
        phT: phT,
        speed: sentenceSpeed,
        phInt: phInt,
        sentInt: sentInt,
        useCoart: useCoart,
        delay: delay,
        onStartEvent: onStartEvent,
        onEndEvent: onEndEvent,
    }

    let indexPos = ( this.queueIdx + this.queueSize ) % Text2Lip.QUEUE_MAX_SIZE;
    this.sentenceQueue[ indexPos ] = sentenceObj; // only reference is copied
    this.queueSize++;

    // when working but idle because of no sentences, automatically play this new sentence
    if ( this.working && this.queueSize == 1 ) {
        this.changeCurrentSentence( false );
    }
    return { id: id, totalTime: totalTime };
};

/**
* Send the same info you would send to pushSentence.
* @param {string/array} text 
* @param {object} options 
* @returns in seconds
*/
Text2Lip.prototype.getSentenceDuration = function ( text, options ) {
    // THE ONLY REASON THIS IS NOT STAIC IS BECAUSE IT USES this.DEFAULT_SPEED   
    let phT = options.phT;
    let sentT = options.sentT;
    let speed = options.speed;
    let delay = options.delay;
    let outro = options.outro;

    if ( !text || !text.length ) { return 0; }
    if ( !( phT instanceof Float32Array ) ) phT = null;

    let textLength = text.length;
    if ( !!outro ) { textLength++; }
    let sentenceSpeed = this.DEFAULT_SPEED;
    if ( typeof ( speed ) === 'number' && !isNaN( speed ) && speed >= 0.001 ) sentenceSpeed = speed;
    if ( typeof ( sentT ) === 'number' && !isNaN( sentT ) && sentT >= 0.001 ) sentenceSpeed = textLength / sentT;

    if ( typeof ( delay ) !== 'number' || isNaN( delay ) || delay < 0 ) delay = 0;


    let totalTime = 0;
    totalTime += delay;

    if ( phT ) {
        let validEntries = ( phT.length >= textLength ) ? textLength : phT.length;
        for ( let i = 0; i < validEntries; ++i ) { totalTime += Math.max( phT[ i ], 0.001 ); }

        textLength -= validEntries;
    }

    // use sentence speed to compute time of phonemes with no phT
    totalTime += textLength * ( 1.0 / sentenceSpeed );

    return totalTime;
}

// TABLES ------------------------------

//[ "kiss", "upperLipClosed", "lowerLipClosed", "jawOpen", "tongueFrontUp", "tongueBackUp", "tongueOut" ],
let t2lLowerBound = [
  [ 0,     0,     0,     0,     0,     0,     0   ], // 0
  [ 0,     0,     0,     0,     0,     0,     0   ],
  [ 0.1,   0.15,  0,     0.2,   0,     0,     0   ],
  [ 0.0,   0.13,  0,     0.2,   0.2,   0,     0   ],
  [ 0,     0.08,  0,     0.1,   0.5,   0.5,   0   ], // 4
  [ 0.25,  0.15,  0.15,  0.2,   0,     0,     0   ],
  [ 0.35,  0.15,  0.15,  0.2,   0,     0,     0   ],
  [ 0.0,   0.15,  0,     0.1,   1,     0,     0   ],
  [ 0,     0.5,   0.2,   0.0,   0,     0,     0   ], // 8
  [ 0,     0.0,   0.2,   0.1,   0,     0,     0   ],
  [ 0.15,  0,     0,     0.13,  0.8,   0,     0   ],
  [ 0.0,   0,     0,     0.2,   0.0,   0.3,   0   ],
  [ 0.0,   0,     0,     0.1,   0.0,   1,     0   ], // 12
  [ 0.3,   0,     0,     0.1,   1,     0,     0   ],
  [ 0,     0,     0.0,   0.1,   0.35,  0,     0.3 ],
  [ 0.3,   0,     0,     0.13,   0.8,   0,     0  ],
];

let t2lUpperBound = [
  [ 0,     0,     0,     0,     0,     0,     0   ], // 0
  [ 0,     0,     0,     0,     0,     0,     0   ], 
  [ 0.1,   0.15,  0,     0.6,   0,     0,     0   ],
  [ 0.0,   0.13,  0,     0.3,   0.2,   0,     0   ],
  [ 0,     0.08,  0,     0.2,   0.6,   0.6,   0.2 ], // 4
  [ 0.45,  0.15,  0.15,  0.6,   0,     0,     0   ],
  [ 0.85,  0.3,   0.3,   0.3,   0,     0,     0   ],
  [ 0.0,   0.15,  0,     0.4,   1,     0,     0.5 ],
  [ 0,     1,     1,     0.0,   0,     0,     0   ], // 8
  [ 0,     0.0,   1,     0.4,   0,     0,     0   ],
  [ 0.15,  0,     0,     0.13,  0.8,   0,     0   ],
  [ 0.0,   0,     0,     0.4,   0.0,   0.3,   0   ],
  [ 0.1,   0,     0,     0.2,   0.0,   1,     0   ], // 12
  [ 0.3,   0,     0,     0.22,  1,     0,     0   ],
  [ 0,     0,     0.0,   0.4,   0.55,  0,     0.8 ],
  [ 0.3,   0,     0,     0.13,  0.8,   0,     0   ],
];

// coarticulation weights for each phoneme. 0= no modification to phoneme, 1=use phonemes arround to build viseme
let t2lCoarts = [
  [ 0,     0,     0,     0,     0,     0,     0   ], // 0
  [ 0.6,   0.6,   0.6,   0.6,   0.6,   0.6,   0.6 ],
  [ 0.2,   0.3,   0.3,   0.3,   0.1,   0.3,   0.5 ],
  [ 0.0,   0.3,   0.3,   0.3,   0.1,   0.3,   0.5 ],
  [ 0.1,   0.3,   0.3,   0.3,   0,     0,     0.5 ], // 4
  [ 0.2,   0.3,   0.3,   0.3,   0.3,   0.3,   0.5 ],
  [ 0.2,   0.3,   0.3,   0.3,   0.3,   0.3,   0.5 ],
  [ 1,     0.4,   0.4,   0.9,   0,     0.5,   0.5 ],
  [ 1,     0,     0,     0.0,   1,     0.8,   0.5 ], //8 
  [ 1,     0,     0,     0.2,   1,     0.5,   0.5 ],
  [ 1,     0.6,   0.6,   0.6,   0,     0.5,   0.5 ],
  [ 1,     1,     1,     0.7,   0.5,   0.5,   0.5 ],
  [ 0.7,   0.5,   0.5,   0.9,   0.6,   0,     0.5 ], //12
  [ 1,     1,     1,     0.5,   0,     0,     0.5 ],
  [ 1,     0.3,   0.3,   0.3,   0,     0.6,   0   ], 
  [ 0.5,   0.3,   0.3,   0.5,  0,     0,     0    ],

];

let t2lPh2v = {
    ".": 0, "_": 1, " ": 1,
    "a": 2,//"AA"	 
    "@": 2,//"AE"	 
    "A": 2,//"AH"	 
    "c": 5,//"AO"	 
    "W": 2,//"AW"	 
    "x": 2,//"AX"	 
    "Y": 2,//"AY"	 
    "E": 3,//"EH"	 
    "R": 3,//"ER"	 
    "e": 3,//"EY"	 
    "I": 4,//"IH"	 
    "X": 4,//"IX"	 
    "i": 4,//"IY"	 
    "o": 5,//"OW"	 
    "O": 5,//"OY"	 
    "U": 6,//"UH"	 
    "u": 6,//"UW"	 

    "b": 8,//"B"	
    "C": 15,//"CH"	 // ------------------------ Really needs a new viseme - 'SH'
    "d": 13,//"D"	
    "D": 13,//"DH"	
    "F": 13,//"DX"	
    "L": 7,//"EL"	
    "M": 8,//"EM"	
    "N": 7,//"EN"	
    "f": 9,//"F"	
    "g": 12,//"G"	
    "h": 11,//"H"	// reduced
    "J": 15,//"JH"	 // ------------------------- Really needs a new viseme 'ZH'
    "k": 12,//"K"	
    "l": 7,//"L"	
    "m": 8,//"M"	
    "n": 7,//"N"	
    "G": 12,//"NG"	// reduced
    "p": 8,//"P"	
    "Q": 2,//"Q"	 // -------------------------- What is this?
    "r": 7,//"R"	
    "s": 10,//"S"	
    "S": 15,//"SH"	 // ------------------------ Really needs a new viseme - 'CH'
    "t": 13,//"T"	
    "T": 14,//"TH"	
    "v": 9,//"V"	
    "w": 6,//"W"	
    "H": 6,//"WH"	
    "y": 4,//"Y"	
    "z": 10,//"Z"	
    "Z": 10,//"ZH"	 // ------------------------- Really needs a new viseme 'JH'
};

let T2LTABLES = {
    BlendshapeMapping: { kiss: 0, upperLipClosed: 1, lowerLipClosed: 2, jawOpen: 3, tongueFrontUp: 4, tongueBackUp: 5, tongueOut: 6 },
    LowerBound: t2lLowerBound,
    UpperBound: t2lUpperBound,
    Coarticulations: t2lCoarts,
    PhonemeToViseme : t2lPh2v,
}

/* ANIMATION */
AnimationManager.prototype.animations = {
    "IDLE": "evalls/projects/animations/animations_idle.wbin",
    "WAVE": "evalls/projects/animations/animations_waving.wbin",
    "NO": "evalls/projects/animations/animations_no.wbin",
    "BORED": "evalls/projects/animations/animations_bored.wbin",
    "ANGRY": "evalls/projects/animations/animations_angry.wbin",
    "HAPPY": "evalls/projects/animations/animations_happy.wbin",
    "PRAYING": "evalls/projects/animations/animations_praying.wbin",
    "CRAZY": "evalls/projects/animations/animations_crazy.wbin"
}

function AnimationManager(component, animations) {

    this.animManager = component;

    // Animations
    this.animations = animations || this.animations;
    this.playing = false;
}

// animationData with animationID, sync attr, speed
AnimationManager.prototype.newAnimation = function (animationData, animations) {
    
    this.currentAnim = {
        speed: this.animManager.playback_speed,
        animation: this.animManager.animation
    }

    this.playing = false;
    // Sync
    this.start = animationData.start || 0.0;
    this.speed = animationData.speed || 1.0;
    this.shift = animationData.shift;
    this.time = 0;
    var url = this.animations[animationData.name];
    this.animationName = url;
    var anim = LS.RM.getResource(this.animationName)

    if (!anim)
        LS.RM.load(this.animationName, null, this.setDuration.bind(this))
    else
        this.setDuration(anim)
}

AnimationManager.prototype.initValues = function () {
    
    this.time = 0;
}

AnimationManager.prototype.setDuration = function (anim) {
    
    this.duration = anim.takes.default.duration;
}

AnimationManager.prototype.update = function (dt) {

    if (this.time == 0)
        this.initValues();
    // Wait for to reach start time

    if (this.time < this.start) {
        return;
    }
    else if (this.time >= this.start && !this.playing) {
        this.animManager.playback_speed = this.speed;
        this.animManager.animation = this.animationName;
        this.playing = true;
    }
    else if (!this.shift && this.time >= this.duration && this.playing) {
        this.animManager.animation = this.currentAnim.animation;
        this.animManager.playback_speed = this.currentAnim.speed;
    }

    this.time += dt;
}



// selected fingers available for mainblend: 0=Not selected, otherwise selected. 1=raw mainblend, 2=mainblend in thumb combinations (hamnosys)
// Array of fingers 0=thumb 1=index 2=middle, 3=ring, 4=pinky
// Four values per finger (0=splay, 1=base, 2=mid, 3=tip)
let handshapes = {

    // basic handshapes    
    FIST:           { selected: [0,0,0,0,0], shape: [ [0,0.5,0,0],[0,1,1,1],[0,1,1,1],[0,1,1,1],[0,1,1,1] ] },
    FINGER_2:        { selected: [0,1,0,0,0], shape: [ [0.5,0.75,0.6,0.5],[0,0,0,0],[0,1,1,1],[0,1,1,1],[0,1,1,1] ] },
    FINGER_23:       { selected: [0,1,1,0,0], shape: [ [0.6,0.8,0.8,0.5],[0,0,0,0],[0,0,0,0],[0,1,1,1],[0,1,1,1] ] },
    FINGER_23_SPREAD: { selected: [0,1,1,0,0], shape: [ [0.6,0.8,0.8,0.5],[0.8,0,0,0],[-0.2,0,0,0],[0,1,1,1],[0,1,1,1] ] },
    FINGER_2345:     { selected: [0,1,1,1,1], shape: [ [0,0.5,0,0],[0.8,0,0,0],[0,0,0,0],[0.8,0,0,0],[0.8,0,0,0] ] },
    FLAT:           { selected: [0,1,1,1,1], shape: [ [0,0.5,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0] ] },
    // thumb combinations - could be reduced to only pinch. Cee are basically pinch but with selected fingers open
    PINCH_12:        { selected: [2,2,0,0,0], shape: [ [1, 0.56, 0.5, 0.22],[0,0.3,0.8,0.25],[0,1,1,1],[0,1,1,1],[0,1,1,1] ] },
    PINCH_12_OPEN:    { selected: [2,2,0,0,0], shape: [ [1, 0.56, 0.5, 0.22],[0,0.3,0.8,0.25],[0,0.4,0.2,0.2],[0,0.2,0.2,0.2],[0,0,0.2,0.2] ] },
    PINCH_ALL:       { selected: [2,2,2,2,2], shape: [ [1, 0.95, 0.1, 0.4],[0,0.67,0.44,0.56],[0,0.56,0.44,0.56],[0,0.67,0.33,0.33],[0,0.89,0.22,0.22] ] },
    CEE_12:          { selected: [3,3,0,0,0], shape: [ [1, 0.7, 0.1, 0.2],[0,0.41,0.51,0.21],[0,1,1,1],[0,1,1,1],[0,1,1,1] ] },
    CEE_12_OPEN:      { selected: [3,3,0,0,0], shape: [ [1, 0.7, 0.1, 0.2],[0,0.4,0.5,0.2],[0,0.4,0.2,0.2],[0,0.2,0.2,0.2],[0,0,0.2,0.2] ] },
    CEE_ALL:         { selected: [3,3,3,3,3], shape: [ [1, 0.7, 0.1, 0.2],[0,0.4,0.2,0.2],[0,0.4,0.2,0.2],[0,0.4,0.2,0.2],[0,0.4,0.2,0.2] ] }
};

let thumbshapes = {
    OUT:     [0,0,0,0], 
    DEFAULT: [0,0.5,0,0],
    TOUCH:   [0,0.5,0,0],
    OPPOSED: [1,1,0,0],
    ACROSS:  [0.5,0.77,0.55,0.77]
}


/* bending Mode:
    1 - all fingers use the same parameters
    2 - bending on a thumb combination. t= thumb, f=rest of fingers 
*/
let handBendings = {
    STRAIGHT: { 1: [0,0,0], 2:{ t:[0.45,0,0], f:[0,0,0] } }, 
    HALF_BENT: { 1: [0.5,0,0], 2:{ t:[8/9,0,0], f:[0.5,0,0] } }, 
    BENT:     { 1: [1,0,0], 2:{ t:[8/9,0,0], f:[1,0,0] } }, 
    ROUND:    { 1: [0.5,0.5,0.5], 2:{ t:[6/9,3/9,4/9], f:[5/9,6/9,9/9] } }, 
    HOOKED:   { 1: [0,1,1], 2:{ t:[8/9,1/9,8/9], f:[9/9,6/9,6/9] } }, 
    DOUBLE_BENT:  { 1: [1,1,0], 2:{ t:[8/9,1/9,8/9], f:[9/9,6/9,6/9] } }, 
    DOUBLE_HOOKED:{ 1: [1,1,1], 2:{ t:[8/9,1/9,8/9], f:[9/9,6/9,6/9] } },     
}


class HandShape {
    constructor( config, skeleton, isLeftHand = false ){
        this._tempQ_0 = new THREE.Quaternion(0,0,0,1);

        this.skeleton = skeleton;
        this.isLeftHand = !!isLeftHand;
        
        this.config = config;
        let boneMap = config.boneMap;
        let handName = ( this.isLeftHand ) ? "L" : "R";
        this.fingerIdxs = [ // base bone indexes. The used bones will be i (base finger), i+1 (mid finger) and i+2 (tip finger). 
            boneMap[ handName + "HandThumb" ], 
            boneMap[ handName + "HandIndex" ],
            boneMap[ handName + "HandMiddle" ], 
            boneMap[ handName + "HandRing" ], 
            boneMap[ handName + "HandPinky" ] 
        ];
        
        this.handshapes = config.handshapes ? config.handshapes : handshapes;
        this.thumbshapes = config.thumbshapes ? config.thumbshapes : thumbshapes;
        this.handBendings = config.handBendings ? config.handBendings : handBendings;

        this.fingerAxes = this._computeFingerAxesOfHand( isLeftHand );
        this.thumbAfterBindTwistAxis = (new THREE.Vector3()).copy(this.skeleton.bones[ this.fingerIdxs[0] + 1 ].position).applyQuaternion( this.fingerAxes.bindQuats[0] ).normalize();

        this.defG = [ [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0] ];
        this.srcG = [ [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0] ];
        this.trgG = [ [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0] ];
        this.curG = [ [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0] ];
        
        this.time = 0; // current time of transition
        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0; 
        this.end = 0;

        this.transition = false;
        

        this.reset();
    }

    _computeFingerAxesOfHand( isLeftHand = false ){
        // assumes character is in tpose
        let bones = this.skeleton.bones;
        let fingers = this.fingerIdxs;
        let bendAxis = new THREE.Vector3();
        let splayAxis = new THREE.Vector3();
        let fingerDir = new THREE.Vector3();

        let tempM3_0 = new THREE.Matrix3();
        let tempV3_0 = new THREE.Vector3();
        let tempV3_1 = new THREE.Vector3();

        let result = { bendAxes: [], splayAxes: [], bindQuats: [] };  // although called bindQuats, thumb does not have its actual bind
        this.bendRange = 4; // [1,9]
        
        // Z axis of avatar from mesh space to world space
        tempM3_0.setFromMatrix4( bones[ 0 ].matrixWorld.clone().multiply( this.skeleton.boneInverses[0] ) );
        let worldZ = this.config.axes[2].clone().applyMatrix3( tempM3_0 ).normalize();
        
        // thumb only
        let thumb = fingers[0];
        for ( let i = 0; i < 3; ++i ){
            tempM3_0.setFromMatrix4( bones[ thumb + i ].matrixWorld ).invert(); // World to Local
            tempV3_0.setFromMatrixPosition( bones[ thumb + i ].matrixWorld );
            tempV3_1.setFromMatrixPosition( bones[ thumb + i + 1 ].matrixWorld );
            fingerDir.subVectors( tempV3_1, tempV3_0 ).normalize(); // finger direction 
            bendAxis.crossVectors( worldZ, fingerDir ).normalize(); // assuming Tpose. Thumb is positioned different than other fingers
            let bendLocal = bendAxis.clone().applyMatrix3( tempM3_0 ); // from world to local space
            bendLocal.applyQuaternion( bones[ thumb + i ].quaternion ).normalize(); // from local to afterbind space
            let bindQuat = bones[ thumb + i ].quaternion.clone();

            if ( i == 0 ){
                splayAxis.crossVectors( bendAxis, fingerDir ).normalize(); // assuming Tpose
                if ( !isLeftHand ){ splayAxis.multiplyScalar( -1 ); }
                let splayLocal = splayAxis.clone().applyMatrix3( tempM3_0 ).normalize(); // from world to local space    
                splayLocal.applyQuaternion( bones[ thumb + i ].quaternion ).normalize(); // from local to afterbind space
                
                //assuming bones are in bind pose
                // compute quat so thumb is straight and parallel to fingers instead of whatever pose it is in the mesh
                let currentThumbDir = new THREE.Vector3();
                tempV3_0.setFromMatrixPosition( bones[ thumb ].matrixWorld );
                tempV3_1.setFromMatrixPosition( bones[ thumb + 1 ].matrixWorld );
                currentThumbDir.subVectors( tempV3_1, tempV3_0 ).normalize();

                let targetThumbDir = new THREE.Vector3();
                tempV3_0.setFromMatrixPosition( bones[ fingers[3] ].matrixWorld ); // middle finger - base joint
                tempV3_1.setFromMatrixPosition( bones[ fingers[3] + 2 ].matrixWorld ); // middle finger - pad joint
                targetThumbDir.subVectors( tempV3_1, tempV3_0 ).normalize();
                // targetThumbDir.multiplyScalar( Math.cos(60*Math.PI/180) ).addScaledVector( worldZ, Math.sin(60*Math.PI/180) );
                tempV3_0.crossVectors( targetThumbDir, worldZ ).normalize();
                tempV3_0.cross( targetThumbDir ).normalize();
                targetThumbDir.multiplyScalar( Math.cos(60*Math.PI/180) ).addScaledVector( tempV3_0, Math.sin(60*Math.PI/180) );
                
                let thumbProjection = { x: bendAxis.dot(currentThumbDir), y: splayAxis.dot(currentThumbDir), z: fingerDir.dot(currentThumbDir) };
                let targetProjection = { x: bendAxis.dot(targetThumbDir), y: splayAxis.dot(targetThumbDir), z: fingerDir.dot(targetThumbDir) };
                let thumbAngles = { elevation: - Math.asin( thumbProjection.y ), bearing: Math.atan2( thumbProjection.x, thumbProjection.z) };
                let targetAngles = { elevation: - Math.asin( targetProjection.y ), bearing: Math.atan2( targetProjection.x, targetProjection.z) };

                bindQuat.set(0,0,0,1);
                bindQuat.premultiply( this._tempQ_0.setFromAxisAngle( splayLocal, -thumbAngles.bearing    * (isLeftHand ? -1 : 1) ) );
                bindQuat.premultiply( this._tempQ_0.setFromAxisAngle( bendLocal,  -thumbAngles.elevation  * (isLeftHand ? -1 : 1) ) );
                bindQuat.premultiply( this._tempQ_0.setFromAxisAngle( bendLocal,   targetAngles.elevation * (isLeftHand ? -1 : 1) ) );
                bindQuat.premultiply( this._tempQ_0.setFromAxisAngle( splayLocal,  targetAngles.bearing   * (isLeftHand ? -1 : 1) ) );
                bindQuat.normalize();
                bindQuat.multiply( bones[ thumb + i ].quaternion );
 
                // recompute afterbind axes
                splayLocal.copy( splayAxis ).applyMatrix3( tempM3_0 ).applyQuaternion( bindQuat ).normalize(); // from world to afterbind space    
                bendLocal.copy( bendAxis ).applyMatrix3( tempM3_0 ).applyQuaternion( bindQuat ).normalize(); // from world to afterbind space
                result.splayAxes.push( splayLocal ); 
            }
            result.bendAxes.push( bendLocal );
            result.bindQuats.push( bindQuat );
        }

        // fingers - no thumb
        let bendBaseTweak = [0, -6*Math.PI/180, 0, 6*Math.PI/180, 7*Math.PI/180 ];
        for ( let f = 1; f < fingers.length; ++f ){
            // assuming Tpose
            tempV3_0.setFromMatrixPosition( bones[ fingers[f] ].matrixWorld );
            tempV3_1.setFromMatrixPosition( bones[ fingers[f] + 2 ].matrixWorld );
            fingerDir.subVectors( tempV3_1, tempV3_0 ).normalize();
            splayAxis.crossVectors( fingerDir, worldZ ).normalize(); 
            bendAxis.crossVectors( splayAxis, fingerDir ).normalize(); 
            for ( let i = 0; i < 3; ++i ){
                let bendLocal = bendAxis.clone(); 
                tempM3_0.setFromMatrix4( bones[ fingers[f] + i ].matrixWorld ).invert();
                if ( i == 0 ){
                    let splayLocal = splayAxis.clone(); 
                    splayLocal.applyMatrix3( tempM3_0 ); // from world to local space
                    splayLocal.applyQuaternion( bones[ fingers[f] + i ].quaternion ).normalize(); // from local to afterbind space
                    result.splayAxes.push(splayLocal);    

                    bendLocal.multiplyScalar( Math.cos( bendBaseTweak[f] ) ).addScaledVector( fingerDir, Math.sin( bendBaseTweak[f] ) ); // so fingers rotate a bit inwards
                }
                if ( isLeftHand ){ bendLocal.multiplyScalar( -1 ); }
                bendLocal.applyMatrix3( tempM3_0 ); // from world to local space
                bendLocal.applyQuaternion( bones[ fingers[f] + i ].quaternion ).normalize(); // from local to afterbind space 
                // let arrow = new THREE.ArrowHelper( bendLocal, new THREE.Vector3(0,0,0), 10, 0xff0000 ); bones[ fingers[f] + i ].add( arrow );
                result.bendAxes.push( bendLocal ); // from world to local space
                result.bindQuats.push( bones[ fingers[f] + i ].quaternion.clone() ); // assuming already in TPose
            }
        }

        return result;
    }
    
    reset() {

        for( let i = 0; i < this.defG.length; ++i ){
            this.defG[i].fill(0);
            this.srcG[i].fill(0);
            this.trgG[i].fill(0);
            this.curG[i].fill(0);
        }

        this.time = 1; this.start = 0; this.attackPeak = 0; this.relax = 0; this.end = 0;
        this.update( 1 ); // force position reset
    }
       
    // must always update bones. (this.transition would be useless)
    update( dt, fingerplayResult ) {
        
        if ( this.transition ) {
            this.time += dt;
            // wait in same pose
            // if ( this.time <= this.start ){ }
              
            // transition from start to peak
            if ( this.time > this.start && this.time <= this.attackPeak ){
                let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
                if ( t > 1){ t = 1; }
                t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
                
                for( let i = 0; i < this.curG.length; ++i ){
                    let curFinger = this.curG[i];
                    let srcFinger = this.srcG[i];
                    let trgFinger = this.trgG[i];
                    for( let j = 0; j < curFinger.length; ++j ){
                        curFinger[j] = srcFinger[j] * (1-t) + trgFinger[j] * t;
                    }
                }
            }
    
            // wait in peak
            else if ( this.time > this.attackPeak && this.time < this.relax ){ 
                for( let i = 0; i < this.curG.length; ++i ){
                    let curFinger = this.curG[i];
                    let trgFinger = this.trgG[i];
                    for( let j = 0; j < curFinger.length; ++j ){
                        curFinger[j] = trgFinger[j];
                    }
                }
            }

            // transition from peak to default position
            else if ( this.time >= this.relax ){
                let t = ( this.time - this.relax ) / ( this.end - this.relax );
                if ( t > 1){ t = 1; }
                t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
    
                for( let i = 0; i < this.curG.length; ++i ){
                    let curFinger = this.curG[i];
                    let defFinger = this.defG[i];
                    let trgFinger = this.trgG[i];
                    for( let j = 0; j < curFinger.length; ++j ){
                        curFinger[j] = trgFinger[j] * (1-t) + defFinger[j] * t;
                    }
                }

                if ( this.time >= this.end ){ this.transition = false; }
            }
            
        }

        // order of quaternion multiplication matter
        let bones = this.skeleton.bones;
        let bendAxes = this.fingerAxes.bendAxes; 
        let splayAxes = this.fingerAxes.splayAxes; 
        let fingers = this.fingerIdxs;
        let c = this.curG;   
        
        // all finger bends
        let thumbBase;
        let baseBend = thumbBase = Math.min( 1, Math.max( -0.2, c[0][1] + ( fingerplayResult ? fingerplayResult[0] : 0 ) ) );
        bones[ fingers[0]      ].quaternion.setFromAxisAngle(  bendAxes[0],  baseBend * Math.PI*0.5 ); 
        bones[ fingers[0] + 1  ].quaternion.setFromAxisAngle(  bendAxes[1],  c[0][2] * Math.PI*0.4 );
        bones[ fingers[0] + 2  ].quaternion.setFromAxisAngle(  bendAxes[2],  c[0][3] * Math.PI*0.4 );
        baseBend = Math.min( 1, Math.max( -0.2, c[1][1] +  ( fingerplayResult ? fingerplayResult[1] : 0 ) ) );
        bones[ fingers[1]      ].quaternion.setFromAxisAngle(  bendAxes[3],  baseBend * Math.PI*0.5 );
        bones[ fingers[1] + 1  ].quaternion.setFromAxisAngle(  bendAxes[4],  c[1][2] * Math.PI*0.6 );
        bones[ fingers[1] + 2  ].quaternion.setFromAxisAngle(  bendAxes[5],  c[1][3] * Math.PI*0.5 );
        baseBend = Math.min( 1, Math.max( -0.2, c[2][1] +  ( fingerplayResult ? fingerplayResult[2] : 0 ) ) );
        bones[ fingers[2]     ].quaternion.setFromAxisAngle(  bendAxes[6],  baseBend * Math.PI*0.5 );
        bones[ fingers[2] + 1 ].quaternion.setFromAxisAngle(  bendAxes[7],  c[2][2] * Math.PI*0.6 );
        bones[ fingers[2] + 2 ].quaternion.setFromAxisAngle(  bendAxes[8],  c[2][3] * Math.PI*0.5 );
        baseBend = Math.min( 1, Math.max( -0.2, c[3][1] +  ( fingerplayResult ? fingerplayResult[3] : 0 ) ) );
        bones[ fingers[3]       ].quaternion.setFromAxisAngle(  bendAxes[9],  baseBend * Math.PI*0.5 );
        bones[ fingers[3] + 1   ].quaternion.setFromAxisAngle(  bendAxes[10], c[3][2] * Math.PI*0.6 );
        bones[ fingers[3] + 2   ].quaternion.setFromAxisAngle(  bendAxes[11], c[3][3] * Math.PI*0.5 );
        baseBend = Math.min( 1, Math.max( -0.2, c[4][1] +  ( fingerplayResult ? fingerplayResult[4] : 0 ) ) );
        bones[ fingers[4]      ].quaternion.setFromAxisAngle(  bendAxes[12], baseBend * Math.PI*0.5 );
        bones[ fingers[4] + 1  ].quaternion.setFromAxisAngle(  bendAxes[13], c[4][2] * Math.PI*0.6 );
        bones[ fingers[4] + 2  ].quaternion.setFromAxisAngle(  bendAxes[14], c[4][3] * Math.PI*0.5 );

        // thumb splay is weird
        bones[ fingers[0] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle( splayAxes[ 0 ], c[ 0 ][ 0 ] * Math.PI * 0.2 ) );
        bones[ fingers[0] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle( this.thumbAfterBindTwistAxis, ( this.isLeftHand ? 1 : -1 ) * Math.max( 0, c[ 0 ][ 0 ] ) * thumbBase * Math.PI * 0.4 ) ); // finger rotates only if splay + base bend

        // other fingers splay
        bones[ fingers[1] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle(  splayAxes[1], this._computeSplayAngle( c[1] ) ) );
        bones[ fingers[2] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle(  splayAxes[2], this._computeSplayAngle( c[2] ) ) );
        bones[ fingers[3] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle(  splayAxes[3], -1 * this._computeSplayAngle( c[3] ) ) );
        bones[ fingers[4] ].quaternion.multiply( this._tempQ_0.setFromAxisAngle(  splayAxes[4], -1 * this._computeSplayAngle( c[4] ) - this._computeSplayAngle( c[3] ) ) );
        
        // apply bind quaternions
        for ( let i = 0; i < 5; ++i ){
            bones[ fingers[i]      ].quaternion.multiply(  this._tempQ_0.copy(this.fingerAxes.bindQuats[i*3]) );
            bones[ fingers[i] + 1  ].quaternion.multiply(  this._tempQ_0.copy(this.fingerAxes.bindQuats[i*3+1]) );
            bones[ fingers[i] + 2  ].quaternion.multiply(  this._tempQ_0.copy(this.fingerAxes.bindQuats[i*3+2]) );            
        }                
    }

    _computeSplayAngle( fingerInfo ){
        return fingerInfo[0] * ( 1 - Math.abs( fingerInfo[1] ) ) * 20*Math.PI/180;
    }
    

    _stringToMainBend( mainbend, handArray, selectedFingers ){        
        // thumb combinations + mainbend. Do not need to change splay
        // BENT  "bend1":"800" fingers:"900"
        // ROUND "bend1":"434" fingers:"569"
        // HOOKED "bend1":"818","bend2":"966" 
        // DOUBLE_HOOKED and DOUBLE_BENT do not exist in hamnosys. Assume HOOKED
        if ( typeof( mainbend ) == "string" ){ mainbend = mainbend.toUpperCase(); }
        let b = this.handBendings[ mainbend ];
        if ( !b ){ return; }

        // thumb combinations
        if ( selectedFingers[0] >= 2 ){
            let bt = b[2].t;
            handArray[0][1] = bt[0]; 
            handArray[0][2] = bt[1]; 
            handArray[0][3] = bt[2]; 
        }

        // rest of fingers
        for( let i = 1; i < 5; ++i ){
            let s = selectedFingers[i]; 
            if ( !s ){ continue; }
            let f = ( s > 1 ) ? b[2].f : b[1];
            handArray[i][1] = s == 3 ? ( f[0] * 0.8 ) : f[0]; 
            handArray[i][2] = f[1]; 
            handArray[i][3] = f[2]; 
        }
    }

    // selectMode: if str is not numbers,  0 does nothing, 1 same shapes as mainbend in basic handshape, 2 same as mainbend in thumbcombinations
    _stringToFingerBend( str, outFinger, selectMode = 0, bendRange = 4 ){
        if ( !str ){ return; }

        if ( str.toUpperCase ){ str = str.toUpperCase(); }
        let b = this.handBendings[ str ];
        if ( !b ){ 
            if ( typeof( str ) == "string" ){
                // strings of three int values 0-9
                for( let i = 0; (i < 3) && (i < str.length); ++i ){
                    let val = parseInt( str[i] );
                    if ( isNaN(val) ){ continue; }
                    outFinger[1+i] = val / bendRange;
                }
            }
            return;
        }

        if ( !selectMode ){ return; }
        let f = ( selectMode > 1 ) ? b[2].f : b[1];
        outFinger[1] = ( selectMode == 3 ) ? ( f[0] * 0.8 ) : f[0]; 
        outFinger[2] = f[1]; 
        outFinger[3] = f[2]; 
    }

    _stringToSplay( str, outFinger ){
        let val = str;
        if ( typeof val == "string" ){ 
            val = parseFloat( val );
        } 
        if ( isNaN(val) ){ return; }
        outFinger[0] = val;
    }

    // to avoid having duplicated code for main and second attributes. Fills outHand. Returns 0 on success, >0 otherwise
    _newGestureHandComposer( bml, outHand, isSecond ){

        let shapeName = isSecond ? bml.secondHandshape : bml.handshape;
        if ( shapeName.toUpperCase ){ shapeName = shapeName.toUpperCase(); }
        let g = this.handshapes[ shapeName ];
        if ( !g ){ 
            console.warn( "Gesture: HandShape incorrect handshape \"" + shapeName + "\"" );
            return 1;
        }
            
        // copy selected shape into buffers
        for( let i = 0; i < outHand.length; ++i ){
            let finger = outHand[i];
            let source = g.shape[i];
            for( let j = 0; j < finger.length; ++j ){ finger[j] = source[j]; }
        }
        
        let selectedFingers = g.selected;
        
        // special fingers override default
        let specFing = bml.specialFingers; // get special fingers
        if (specFing && !isSecond) {
            selectedFingers = [selectedFingers[0],0,0,0,0];
            specFing = specFing.split(''); // ['23'] -> ['2','3']
            for (let i = 0; i < specFing.length; i++) {
                let num = parseInt(specFing[i]) - 1;
                if (isNaN(num) || num > 4) { specFing.splice(i, 1); i--; continue; }
                selectedFingers[num] = (g.selected[0] ? g.selected[0] : 1); // depending on thumb, selected value is 1,2 or 3
                specFing[i] = num;
            } // str to num (['2', '3'] -> [2,3])
            
            if (!specFing.length) selectedFingers = g.selected; // abort special fingers, no finger was valid
            else {

                switch (bml.handshape) {
                    case "FIST":
                        for (let i = 1; i < selectedFingers.length; i++) {
                            if (!selectedFingers[i]) outHand[i] = [0,0,0,0]; // non-selected fingers into flat
                            selectedFingers[i] = 1 - selectedFingers[i];
                        }
                        break;
                        
                    case "FLAT": case "CEE_ALL": case "PINCH_ALL":
                        for (let i = 1; i < selectedFingers.length; i++) {
                            if (!selectedFingers[i]) outHand[i] = [0,1,1,1]; // non-selected fingers into fist
                        }
                        break;
                        
                    case "PINCH_12": case "PINCH_12_OPEN": case "CEE_12": case "CEE_12_OPEN":
                        for (let i = 0; i < specFing.length; i++) {
                            outHand[specFing[i]] = [...handshapes[(bml.handshape.includes("CEE_") ? "CEE_ALL" : "PINCH_ALL")].shape[specFing[i]]];
                        }
                        break;
                        
                    default:
                        // get default fingers (handshapes: fingerX)
                        let defFing = bml.handshape.match(/\d+/g); // ['FINGER_23_SPREAD'] -> ['23']
                        if (defFing) {
                            defFing = defFing[0].split(''); // ['23'] -> ['2','3']
                            defFing = defFing.map(function(str) {
                                return parseInt(str) - 1;
                            }); // str to num (['2', '3'] -> [2,3])
                            if(defFing[0] == 0) defFing.shift(); // avoid thumb
                            
                            // change handshape
                            for (let i = 0; i < specFing.length; i++) {                                
                                if (!defFing[i]) { 
                                    outHand[specFing[i]] = [...outHand[defFing[0]]]; // copy array as value not reference
                                }  // if more special fingers than default
                                else if (specFing[i] == defFing[i]) continue; // default and special are the same finger -> skip
                                else { outHand[specFing[i]] = [...outHand[defFing[i]]]; } // interchange finger config (eg: default=2, special=5)
                            }
                        }
                        break;

                    }
                    
                    // change default to open or fist
                    var isOpen = bml.handshape.includes("_OPEN", 5);
                    for (let i = 1; i < selectedFingers.length; i++) {
                        if (!selectedFingers[i]) { outHand[i] = (isOpen ? [0,0.2,0.2,0.2] : [0,1,1,1]); }
                    }
                    
                    // relocate thumb
                    if ( bml.handshape.includes("PINCH_") ) { outHand[0] = [...handshapes["PINCH_ALL"].shape[0]]; }
                    else if ( bml.handshape.includes("CEE_") ) { outHand[0] = [...handshapes["CEE_ALL"].shape[0]]; }
                }    
        }

        // apply mainbends if any
        this._stringToMainBend( isSecond ? bml.secondMainBend : bml.mainBend, outHand, selectedFingers );

        // modify with thumbshape
        let thumbshapeName = isSecond ? bml.secondThumbshape : bml.thumbshape;
        if ( typeof( thumbshapeName ) == "string" ){ thumbshapeName = thumbshapeName.toUpperCase(); }
        let thumbGest = this.thumbshapes[ thumbshapeName ];
        if ( thumbGest ){
            for( let i = 0; i < thumbGest.length; ++i ){ outHand[0][i] = thumbGest[i]; }        
        }

        // tco (thumb combination opening). Applicable to cee and pinch (select mode 2 and 3). 1=keep original, 0=open fingers
        let thumbCombinationOpening = parseFloat( isSecond ? bml.secondtco : bml.tco );
        thumbCombinationOpening = isNaN( thumbCombinationOpening ) ? 0 : Math.max(-1, Math.min(1, thumbCombinationOpening ) );
        for( let i = 0; i < outHand.length; ++i ){
            let finger = outHand[i];
            let fingerOpeningFactor = thumbCombinationOpening * (( i == 0 ) ? -0.25 : 1);
            for( let j = 0; j < finger.length; ++j ){ finger[j] = finger[j] * ( 1 - fingerOpeningFactor ); }
        }

        return 0;
    }

    /** 
     * bml info
     * start, attackPeak, relax, end
     * handshape: string from the handshape tables
     * secondHandshape (optional)
     * thumbshape: (optional) string from thumbshape table. 
     * secondThumbshape (optional)
     * mainBend: (optional) string from bend table. The 6 basic handshape are affected differently than the 6 thumb combination handshapes
     * secondMainBend (optional)
     * tco: (optional) "Thumb Combination Opening", from 0 (same aperture as default) to 1 (completely open hand). Only affects the 6 thumb combination handshapes
     * secondtco: (optional)
     * bend1, bend2, bend3, bend4, bend5: (optional) string from bend table or string of numbers from 0-9. Overwrites any bend applied before
     * splay1, splay2, splay3, splay4, splay5: (optional) string of numbers from 0-9 
     * mainSplay: (optional) affects all fingers except middle finger
    */
    newGestureBML( bml ){
              
        if ( this._newGestureHandComposer( bml, this.trgG, false ) ){ return false; }// something went wrong
        if ( bml.secondHandshape ){ 
            this._newGestureHandComposer( bml, this.srcG, true ); // use this.srcG as temporal buffer
            for( let i = 0; i < this.trgG.length; ++i ){
                for( let j = 0; j < this.trgG.length; ++j ){
                    this.trgG[i][j] = this.trgG[i][j] * 0.5 +  this.srcG[i][j] * 0.5;
                }
            }
        }

        // Jasigning uses numbers in a string for bend. Its range is 0-4. This realizer works with 0-9. Remap
        let bendRange = this.bendRange;
        if ( bml.bendRange ){
            let newBend = parseInt( bml.bendRange );
            bendRange = isNaN( bendRange ) ? bendRange : newBend; 
        }

        // specific bendings
        this._stringToFingerBend( bml.bend1, this.trgG[0], 1, bendRange ); // thumb
        this._stringToFingerBend( bml.bend2, this.trgG[1], 1, bendRange );
        this._stringToFingerBend( bml.bend3, this.trgG[2], 1, bendRange );
        this._stringToFingerBend( bml.bend4, this.trgG[3], 1, bendRange );
        this._stringToFingerBend( bml.bend5, this.trgG[4], 1, bendRange );

        // check if any splay attributes is present. ( function already checks if passed argument is valid )           
        this._stringToSplay( bml.splay1, this.trgG[0] ); // thumb
        this._stringToSplay( bml.splay2 ? bml.splay2 : bml.mainSplay, this.trgG[1] );
        this._stringToSplay( bml.splay3, this.trgG[2] ); // not affected by mainsplay, otherwise it feels weird
        this._stringToSplay( bml.splay4 ? bml.splay4 : bml.mainSplay, this.trgG[3] );
        this._stringToSplay( bml.splay5 ? bml.splay5 : bml.mainSplay, this.trgG[4] );

        // set default pose if necessary
        if ( bml.shift ){
            for( let i = 0; i < this.trgG.length; ++i ){
                let trgFinger = this.trgG[i];
                let defFinger = this.defG[i];
                for( let j = 0; j < trgFinger.length; ++j ){
                    defFinger[j] = trgFinger[j];
                }
            }
        }

        // copy current state into src
        for( let i = 0; i < this.trgG.length; ++i ){
            let srcFinger = this.srcG[i];
            let curFinger = this.curG[i];
            for( let j = 0; j < curFinger.length; ++j ){
                srcFinger[j] = curFinger[j];
            }
        }

        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0; 
            
        this.transition = true;

        return true;
    }

    setBendRange( value ){
        this.bendRange = isNaN( parseInt(value) ) ? 4 : value; 
    }
}








class ExtfidirPalmor { 
    constructor( config, skeleton, isLeftHand = false ){
        this.skeleton = skeleton;
        this.isLeftHand = !!isLeftHand;

        this.config = config;
        let boneMap = config.boneMap;
        let handName = ( isLeftHand ) ? "L" : "R";
        let bones = this.skeleton.bones;

        this.wristIdx = boneMap[ handName + "Wrist" ];
        this.wristBone = bones[ this.wristIdx ];
        this.forearmBone = bones[ boneMap[ handName + "Elbow" ] ];

        this.wristBindQuat = getBindQuaternion( this.skeleton, this.wristIdx, new THREE.Quaternion() );
        // before-bind axes
        this.twistAxisForearm = ( new THREE.Vector3() ).copy( bones[ boneMap[ handName + "Wrist" ] ].position ).normalize(),
        this.twistAxisWrist = ( new THREE.Vector3() ).copy( bones[ boneMap[ handName + "HandMiddle" ] ].position ).normalize(),
        this.bearingAxis = ( new THREE.Vector3() ).crossVectors( bones[ boneMap[ handName + "HandRing" ] ].position, bones[ boneMap[ handName + "HandIndex" ] ].position ).multiplyScalar( isLeftHand ? -1: 1 ).normalize()
        this.elevationAxis = ( new THREE.Vector3() ).crossVectors( this.bearingAxis, this.twistAxisWrist ).normalize(); // compute elevation
        this.bearingAxis.crossVectors( this.twistAxisWrist, this.elevationAxis ).normalize(); // compute bearing
  
        this.palmor = {
            srcAngle: 0, // aprox
            trgAngle: 0,
            defAngle: 0,
        };

        this.extfidir = {
            trgDir: new THREE.Vector3(0,-1,0),
            defDir: new THREE.Vector3(0,-1,0),
        };

        this.curAproxPalmor = 0;
        this.srcQuat = new THREE.Quaternion(0,0,0,1);
        this.curQuat = new THREE.Quaternion(0,0,0,1);
        
        this.time = 0; // current time of transition
        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0; 
        this.end = 0;
        this.transition = false;
        this.reset();

        this._tempMat3_0 = new THREE.Matrix3();
        this._tempV3_0 = new THREE.Vector3(); // world pos and cross products
        this._tempV3_1 = new THREE.Vector3(); // z axis
        this._tempV3_2 = new THREE.Vector3(); // x axis
        this._tempV3_3 = new THREE.Vector3(); // y axis
        this._tempQ_0 = new THREE.Quaternion();
    }

    reset() {
        // Force pose update to flat
        this.transition = false;
        this.curQuat.set(0,0,0,1);
        this.srcQuat.set(0,0,0,1);
        this.curAproxPalmor = 0;
        this.palmor.srcAngle = 0;
        this.palmor.trgAngle = 0;
        this.palmor.defAngle = 0;
        this.extfidir.trgDir.set(0,-1,0);
        this.extfidir.defDir.set(0,-1,0);
    }

    // compute the swing rotation so as to get the twistAxisWrist to point at a certain location. It finds the forearm twist correction
    _computeSwingFromCurrentPose( targetPoint, resultWristQuat ){
        let elevation = Math.atan2( targetPoint.y, Math.sqrt( targetPoint.x * targetPoint.x + targetPoint.z * targetPoint.z ) );
        let bearing = Math.atan2( targetPoint.x, targetPoint.z );
        
        // this solves ir
        if ( this.isLeftHand && bearing > 1.58825 ){ bearing -= Math.PI * 2; } 
        else if ( !this.isLeftHand && bearing < -1.58825 ){ bearing += Math.PI * 2; } 


        let wristBone = this.wristBone;
        wristBone.quaternion.copy( this.wristBindQuat );
        wristBone.updateWorldMatrix( true );

        let wToLMat3 = this._tempMat3_0.setFromMatrix4( wristBone.matrixWorld ).invert(); // gets only rotation (and scale)
        
        let worldZAxisToLocal = this._tempV3_1.set(0,0,1).applyMatrix3( wToLMat3 ).normalize();        
        let worldXAxisToLocal = this._tempV3_2.set(1,0,0).applyMatrix3( wToLMat3 ).normalize();        
        let worldYAxisToLocal = this._tempV3_3.crossVectors( worldZAxisToLocal, worldXAxisToLocal ).normalize();
        
        // make hand point out in world coordinates ( +Z )
        let angle = Math.acos( this.twistAxisWrist.dot( worldZAxisToLocal ) );
        let rotAx = this._tempV3_0;
        rotAx.crossVectors( this.twistAxisWrist, worldZAxisToLocal ).normalize();
        resultWristQuat.setFromAxisAngle( rotAx, angle );

        // adjust hand orientation so its palm is facing down in world coordinates ( 0,-1,0 )
        let newElevationAxis = this._tempV3_0.copy( this.elevationAxis ).applyQuaternion( resultWristQuat );
        angle = Math.acos( newElevationAxis.dot( worldXAxisToLocal ) );
        rotAx.crossVectors( newElevationAxis, worldXAxisToLocal ).normalize(); // should be worldZAxis, but sign might differ
        this._tempQ_0.setFromAxisAngle( rotAx, angle );
        resultWristQuat.premultiply( this._tempQ_0 );
      
        // now, add extfidir        
        let elevationRot = this._tempQ_0.setFromAxisAngle( worldXAxisToLocal, -elevation ); // -elevation because of how the axis is computed vs atan2
        resultWristQuat.premultiply( elevationRot );
        let bearingRot = this._tempQ_0.setFromAxisAngle( worldYAxisToLocal, bearing );
        resultWristQuat.premultiply( bearingRot );

        resultWristQuat.premultiply( this.wristBindQuat)

    }

    update(dt){
        this.wristBone.quaternion.copy( this.wristBindQuat );
        // if( !this.transition ){ return; }

        this.time += dt;
        if ( this.time < this.start ){ 
            this.wristBone.quaternion.copy( this.srcQuat );
        }
        else if ( this.time < this.attackPeak ){      
            this._computeSwingFromCurrentPose( this.extfidir.trgDir, this.curQuat );
            this._tempQ_0.setFromAxisAngle( this.twistAxisWrist, this.palmor.trgAngle );
            this.curQuat.multiply( this._tempQ_0 );
            let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
            nlerpQuats( this.curQuat, this.srcQuat, this.curQuat, t );
            //this.curQuat.slerpQuaternions( this.srcQuat, this.curQuat, t );

            this.curAproxPalmor = this.palmor.srcAngle * (1-t) + this.palmor.trgAngle * t;
            this.wristBone.quaternion.copy( this.curQuat );
        }
        else if ( this.time < this.relax ){ 
            this._computeSwingFromCurrentPose( this.extfidir.trgDir, this.curQuat );
            this._tempQ_0.setFromAxisAngle( this.twistAxisWrist, this.palmor.trgAngle );
            this.curQuat.multiply( this._tempQ_0 );
            this.wristBone.quaternion.copy( this.curQuat );
            this.curAproxPalmor = this.palmor.trgAngle;
        }
        else { 
            this._computeSwingFromCurrentPose( this.extfidir.trgDir, this.srcQuat );
            this._tempQ_0.setFromAxisAngle( this.twistAxisWrist, this.palmor.trgAngle );
            this.srcQuat.multiply( this._tempQ_0 );

            this._computeSwingFromCurrentPose( this.extfidir.defDir, this.curQuat );
            this._tempQ_0.setFromAxisAngle( this.twistAxisWrist, this.palmor.defAngle );
            this.curQuat.multiply( this._tempQ_0 );

            let t = ( this.time - this.relax ) / ( this.end - this.relax );
            if ( t > 1 ){ 
                t = 1; 
                this.transition = false;
            }
            nlerpQuats( this.curQuat, this.srcQuat, this.curQuat, t );
            //this.curQuat.slerpQuaternions( this.srcQuat, this.curQuat, t ); 
            this.wristBone.quaternion.copy( this.curQuat );
            this.curAproxPalmor = this.palmor.trgAngle * (1-t) + this.palmor.defAngle * t;

        }
    }


    /**
     * bml info
     * start, attackPeak, relax, end
     * extfidir: string from sides
     * secondExtfidir: (optional) string from sides. Will compute midpoint between extifidir and secondExtfidir
    */
    newGestureBMLExtfidir( bml, symmetry = false ){
        if( !bml.extfidir ){ return; }
        
        if( !stringToDirection( bml.extfidir, this.extfidir.trgDir, symmetry, true ) ){ 
            console.warn( "Gesture: Extfidir incorrect direction \"" + bml.extfidir + "\"" );
            return false; 
        }
        this.extfidir.trgDir.normalize();
        if( stringToDirection( bml.secondExtfidir, this._tempV3_0, symmetry, true ) ){
            this.extfidir.trgDir.lerpVectors( this.extfidir.trgDir, this._tempV3_0, 0.5 );
            this.extfidir.trgDir.normalize();
        }
        
        // set defualt point if necessary
        if( bml.shift ){
            this.extfidir.defDir.copy( this.extfidir.trgDir );
        }  
        return true;  
    }

    /**
     * bml info
     * start, attackPeak, relax, end
     * palmor: string from palmorRightTable
     * secondPalmor: (optional)
    */
    newGestureBMLPalmor( bml, symmetry = 0x00 ){
        if( !bml.palmor ){ return; }

        // TODO (?): solve atan2(0,-0) == up    
        let result = this._tempV3_0;
        if ( !stringToDirection( bml.palmor, result, symmetry, true ) ){ return false; }
        let angle = Math.atan2( result.x, -result.y ); // -y so down is angle=0º
        
        if ( stringToDirection( bml.secondPalmor, result, symmetry, true ) ){ 
            let secondAngle = Math.atan2( result.x, -result.y ); // -y so down is angle=0º
            // find shortest path between angle and secondAngle. 
            // TODO (?): simply interpolate result vectors instead of angles to avoid this if
            if( Math.abs( angle - secondAngle ) > Math.PI ){
                if( ( angle - secondAngle ) < 0 ){ secondAngle -= 2 * Math.PI; }
                else{ secondAngle += 2 * Math.PI; }
            }
            angle = ( angle + secondAngle ) * 0.5
        }
        if ( !this.isLeftHand && angle < -120 * Math.PI/180 ){ angle += Math.PI *2; }
        else if ( this.isLeftHand && angle > 120 * Math.PI/180 ){ angle -= Math.PI *2; }
        // if ( !this.isLeftHand && angle < -140 * Math.PI/180 ){ angle += Math.PI *2; }
        // else if ( this.isLeftHand && angle > 140 * Math.PI/180 ){ angle -= Math.PI *2; }
        
        this.palmor.trgAngle = angle;

        // set defualt pose if necessary
        if ( bml.shift ){
            this.palmor.defAngle = this.palmor.trgAngle;
        }

        return true;
    }

    newGestureBML( bml, symmetry = 0x00 ){

        this.srcQuat.copy( this.curQuat );
        this.palmor.srcAngle = this.curAproxPalmor;

        if ( !this.newGestureBMLExtfidir( bml, symmetry ) ){
            if ( this.time > this.relax ){ this.extfidir.trgDir.copy( this.extfidir.defDir ); }
            // this.extfidir.trgDir.copy( this.extfidir.defDir );
        }
        symmetry = (symmetry & 0xfe) | ( ( symmetry & 0x01 ) ^ ( this.extfidir.trgDir.z < 0 ? 0x01 : 0x00 ) );
        if ( !this.newGestureBMLPalmor( bml, symmetry ) ){
            if ( this.time > this.relax ){ this.palmor.trgAngle = this.palmor.defAngle; }
            // this.palmor.trgAngle = this.palmor.defAngle;
        }

        this.time = 0;
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.transition = true; 

        return true;
    }
}




class LocationBodyArm {
    constructor( config, skeleton, isLeftHand = false ) {
        this._tempV3_0 = new THREE.Vector3();
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
        
        this.skeleton = skeleton;
        this.config = config;
        this.bodyLocations = config.bodyLocations;
        this.handLocations = isLeftHand ? config.handLocationsL : config.handLocationsR;
        this.isLeftHand = !!isLeftHand;
        
        let boneMap = config.boneMap;
        let handName = isLeftHand ? "L" : "R";
        this.idx = {
            shoulder: boneMap[ handName + "Shoulder" ],
            arm: boneMap[ handName + "Arm" ],
            elbow: boneMap[ handName + "Elbow" ],
            wrist: boneMap[ handName + "Wrist" ]
        }
        
        // p : without offset. Raw location interpolation
        this.cur = { p: new THREE.Vector3(), offset: new THREE.Vector3() }; // { world point, elbow raise, offset due to previous motions+handconstellation }
        this.src = { p: new THREE.Vector3(), offset: new THREE.Vector3() }; // { world point, elbow raise, offset due to previous motions+handconstellation }
        this.trg = new THREE.Vector3();
        this.def = new THREE.Vector3();

        // if not null, this will be de point that tries to reach the target. Otherwise, the wrist is assumed
        this.contactFinger = null;
        this.keepUpdatingContact = false; // flag to enable constant update of target position. If disabled, contact is only updated during start-peak 
        this.contactUpdateDone = false; // internal flag to indicate final contact update into this.trg has been done. Always false when keepUpdatingContact == true

        this.time = 0; // current time of transition
        this.start = 0; 
        this.attackPeak = 0;
        this.relax = 0;
        this.end = 0;
        
        this.transition = false;

        
        this.worldArmSize = 0;
        this.skeleton.bones[ boneMap[ handName + "Arm" ] ].getWorldPosition( this._tempV3_0 );
        this.skeleton.bones[ boneMap[ handName + "Elbow" ] ].getWorldPosition( this._tempV3_1 );
        this.skeleton.bones[ boneMap[ handName + "Wrist" ] ].getWorldPosition( this._tempV3_2 );
        this.worldArmSize = this._tempV3_0.sub( this._tempV3_1 ).length() + this._tempV3_1.sub( this._tempV3_2 ).length();
        
        // set default poses
        this.reset();
    }

    reset(){
        this.transition = false;
        this.contactFinger = null;
        this.cur.p.set(0,0,0);
        this.def.set(0,0,0);

        this.keepUpdatingContact = false;
        this.contactUpdateDone = false;
    }

    update( dt ){
        // nothing to do
        if ( !this.transition ){ return; } 
        
        this.time += dt;
        
        // wait in same pose
        if ( this.time < this.start ){ 
            // this.cur.p.copy( this.src.p ); 
        }
        else if ( this.time >= this.end ){
            this.cur.p.copy( this.def );
            this.cur.offset.set(0,0,0); // just in case
            this.transition = false; // flag as "nothing to do"
        }
        else{
            let newTarget = this._tempV3_0.copy( this.trg );

            if ( this.contactFinger && !this.contactUpdateDone ){ // use some finger instead of the wrist
                this.contactFinger.updateWorldMatrix( true ); // self and parents
                
                this._tempV3_1.setFromMatrixPosition( this.contactFinger.matrixWorld );
                this._tempV3_2.setFromMatrixPosition( this.skeleton.bones[ this.idx.wrist ].matrixWorld );

                let dir = this._tempV3_1.sub( this._tempV3_2 );
                newTarget.sub( dir );

                // stop updating after peak, if keepUpdating is disabled. Hold last newTarget value as target
                if ( !this.keepUpdatingContact && this.time >= this.attackPeak ){
                    this.contactUpdateDone = true;
                    this.trg.copy( newTarget );
                }
            }
            
            
            // interpolations
            if ( this.time > this.attackPeak && this.time < this.relax ){ 
                this.cur.p.copy( newTarget );
                this.cur.offset.set(0,0,0);
            }            
            else if ( this.time <= this.attackPeak ){
                let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
                if ( t > 1){ t = 1; }
                t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
    
                this.cur.offset.copy( this.src.offset ).multiplyScalar( 1 - t );
                this.cur.p.lerpVectors( this.src.p, newTarget, t );
                
                // overwriting newTarget ( aka this._tempV3_0 ). Add curve on the z axis (slightly better visually)
                let extraZSizeFactor = Math.min( 1, newTarget.sub( this.src.p ).lengthSq() / (this.worldArmSize * this.worldArmSize * 0.5) );
                let extraZsize = this.worldArmSize * 0.3 * extraZSizeFactor; // depending on how far the next objective
                this.cur.p.z += 2 * extraZsize * t * (1-t); // bezier simplified     [ 0 | size | 0 ]
            }    
            else if ( this.time >= this.relax ){
                let t = ( this.time - this.relax ) / ( this.end - this.relax );
                if ( t > 1){ t = 1; }
                t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
    
                this.cur.offset.set(0,0,0);
                this.cur.p.lerpVectors( newTarget, this.def, t );

                // overwriting newTarget ( aka this._tempV3_0 ). Add curve on the z axis (slightly better visually)
                let extraZSizeFactor = Math.min( 1, newTarget.sub( this.def ).lengthSq() / (this.worldArmSize * this.worldArmSize * 0.5) );
                let extraZsize = this.worldArmSize * 0.3 * extraZSizeFactor; // depending on how far the next objective
                let extra =  2 * extraZsize * t * (1-t); // bezier simplified    [ 0 | size | 0 ]
                this.cur.p.z += extra;
            }
        }

    }


    // all second and main attributes do not get mixed until the end (jasigning)
    _newGestureLocationComposer( bml, symmetry, resultPos, isSecond = false ){
        let location = isSecond ? bml.secondLocationBodyArm : bml.locationBodyArm;

        // Symmetry should be only for sides
        // for symmetry - the left and right must be swapped
        // if ( ( symmetry & 0x01 ) && location ){ 
        //     if ( location[location.length-1] == "L" ){ location = location.slice(0, location.length-1) + "R"; } 
        //     else if( location[location.length-1] == "R" ){ location = location.slice(0, location.length-1) + "L"; } 
        // }
        if ( typeof( location ) != "string" ){ return false; }
        location = location.toUpperCase();

        if ( location == "EAR" || location == "EARLOBE" || location == "CHEEK" || location == "EYE" || location == "EYEBROW" || location == "SHOULDER" ){
            location += this.isLeftHand ? "_LEFT" : "_RIGHT";
        }
       
        let side = isSecond ? bml.secondSide : bml.side;
        if ( stringToDirection( side, this._tempV3_0, symmetry, true ) ){ // accumulate result and do not normalize
            // 0.5 and 1.5 to avoid rounding problems
            if ( this._tempV3_0.x < -1.5 ){ location += "_SideRR"; }
            else if ( this._tempV3_0.x < -0.5 ){ location += "_SideR"; }
            else if ( this._tempV3_0.x > 1.5 ){ location += "_SideLL"; }
            else if ( this._tempV3_0.x > 0.5 ){ location += "_SideL"; }
        }

        
        location = this.bodyLocations[ location ];
        if ( !location ){ return false; }
        location.getWorldPosition( resultPos );

        // TODO: expose distance modes? 
        // distance 
        let distance = isNaN( bml.distance ) ? 0 : bml.distance;
        distance += 0.05; // hack 
        
        if ( location.direction ){
            let m3 = ( new THREE.Matrix3() ).setFromMatrix4( location.matrixWorld );
            this._tempV3_0.copy( location.direction ).applyMatrix3( m3 ).normalize(); // from bone local space to world space direction 
        }else{
            // use avatar Z axis as distance
            this._tempV3_0.copy( this.config.axes[2] );
            // from mesh space to hips local space direction
            let m3 = ( new THREE.Matrix3() ).setFromMatrix4( this.skeleton.boneInverses[ this.config.boneMap.Hips ] );
            this._tempV3_0.applyMatrix3( m3 );
            // from hips local space to world space direction
            m3.setFromMatrix4( this.skeleton.bones[ this.config.boneMap.Hips ].matrixWorld );
            this._tempV3_0.applyMatrix3( m3 );
            this._tempV3_0.normalize();  
        }
        resultPos.addScaledVector( this._tempV3_0, this.worldArmSize * distance );
        
        return true;
    }
    /**
     * bml info
     * start, attackPeak, relax, end
     * locationBodyArm: string from bodyLocations
     * secondLocationBodyArm: (optional)
     * distance: (optional) [0,1] how far from the body to locate the hand. 0 = touch, 1 = arm extended (distance == arm size). 
     * side: (optional) rr, r, l, ll. If non-existant, defaults to center
     * secondSide: (optional)
     * 
     * displace: 26 directions
     * displaceDistance: metres
     * 
     * elbowRaise: (optional) in degrees. Positive values raise the elbow.
     * 
     * Following attributes describe which part of the hand will try to reach the locationBodyArm location 
     * srcContact: (optional) source contact location in a single variable. Strings must be concatenate as srcFinger + srcLocation + srcSide (whenever each variable is needed)
     * srcFinger: (optional) 1,2,3,4,5
     * srcLocation: (optional) string from handLocations (although no forearm, elbow, upperarm are valid inputs here)
     * srcSide: (optional) ULNAR, RADIAL, PALMAR, BACK. (ulnar == thumb side, radial == pinky side. Since hands are mirrored, this system is better than left/right)
     * keepUpdatingContact: (optional) once peak is reached, the location will be updated only if this is true. Default false
     *                  i.e: set to false; contact tip of index; reach destination. Afterwards, changing index finger state will not modify the location
     *                       set to true; contact tip of index; reach destination. Afterwards, changing index finger state (handshape) will make the location change depending on where the tip of the index is  
     * shift does not use contact locations
     */
    newGestureBML( bml, symmetry = 0x00, lastFrameWorldPosition = null ) {
        this.keepUpdatingContact = !!bml.keepUpdatingContact;
        this.contactUpdateDone = false;

        if ( !this._newGestureLocationComposer( bml, symmetry, this.trg, false ) ){
            console.warn( "Gesture: Location Arm no location found with name \"" + bml.locationBodyArm + "\"" );
            return false;
        };
        if( this._newGestureLocationComposer( bml, symmetry, this.src.p, true ) ){ // use src as temporal buffer
            this.trg.lerp( this.src.p, 0.5 );
        }

        // displacement
        if ( stringToDirection( bml.displace, this._tempV3_0, symmetry, true ) ){
            this._tempV3_0.normalize();
            let sideDist = parseFloat( bml.displaceDistance );
            sideDist = isNaN( sideDist ) ? 0 : sideDist;
            this.trg.x += this._tempV3_0.x * sideDist;
            this.trg.y += this._tempV3_0.y * sideDist;
            this.trg.z += this._tempV3_0.z * sideDist;
        }

        // source: Copy current arm state
        if ( lastFrameWorldPosition ){
            this.src.offset.subVectors( lastFrameWorldPosition, this.cur.p );
            this.src.p.copy( this.cur.p );
        }
        else{
            this.src.offset.copy( this.cur.offset );
            this.src.p.copy( this.cur.p );
        }
        
        // change arm's default pose if necesary
        if ( bml.shift ){
            this.def.copy( this.trg );
        }

        // in case the user selects a specific finger bone as end effector. Not affected by shift
        this.contactFinger = null;
        let srcFinger = parseInt( bml.srcFinger );
        let srcSide = bml.srcSide; 
        let srcLocation = bml.srcLocation;
        // check all-in-one variable first. Only hand locations allowed as contact
        
        let srcContact = typeof( bml.srcContact ) == "string" ? bml.srcContact.toUpperCase() : "";
        srcContact = this.handLocations[ srcContact ]; 
        if ( srcContact && !bml.srcContact.includes( "ARM" ) && !bml.srcContact.includes( "ELBOW" ) ){
            this.contactFinger = srcContact;
        }
        else if ( srcFinger || srcSide || srcLocation ){ 

            if ( isNaN( srcFinger ) || srcFinger < 1 || srcFinger > 5 ){ srcFinger = ""; }
            if ( typeof( srcLocation ) != "string" || srcLocation.length < 1){ srcLocation = ""; }
            else{ 
                srcLocation = ( srcFinger > 0 ? "_": "" ) + srcLocation.toUpperCase(); 
            }
            if ( typeof( srcSide ) != "string" || srcSide.length < 1 ){ srcSide = ""; }
            else{ 
                srcSide = "_" + srcSide.toUpperCase();
                if ( !isNaN( srcFinger ) ){ // jasigning...
                    if ( srcSide == "_RIGHT" ){ srcSide = "_" + (this.isLeftHand ? "RADIAL" : "ULNAR"); }
                    else if ( srcSide == "_LEFT" ){ srcSide = "_" + (this.isLeftHand ? "ULNAR" : "RADIAL"); }
                }
            }
            let srcName = srcFinger + srcLocation + srcSide; 
         
            // only hand locations allowed as contact
            if ( !srcName.includes( "ARM" ) && !srcName.includes( "ELBOW" ) ){
                this.contactFinger = this.handLocations[ srcName ];
            }
        }

        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0;
        this.transition = true;

        return true;
    }   
}



class HandConstellation {
    constructor( boneMap, skeleton, rightHandLocations, leftHandLocations ) {
        this.skeleton = skeleton;
        
        this.boneMap = boneMap;
       
       
        this.time = 0; // current time of transition
        this.start = 0; 
        this.attackPeak = 0;
        this.relax = 0;
        this.end = 0;
        
        this.transition = false;

        // assuming both arms are the same size approximately
        this.worldArmSize = 0;
        let v = new THREE.Vector3();
        let u = v.clone();
        let w = v.clone();
        this.skeleton.bones[ boneMap[ "RArm" ] ].getWorldPosition( v );
        this.skeleton.bones[ boneMap[ "RElbow" ] ].getWorldPosition( u );
        this.skeleton.bones[ boneMap[ "RWrist" ] ].getWorldPosition( w );
        this.worldArmSize = v.sub(u).length() + u.sub(w).length();


        this.handLocationsR = rightHandLocations;
        this.handLocationsL = leftHandLocations;

        this.prevOffsetL = new THREE.Vector3(); // in case a handconstellation enters before the previous one ends. Keep the old current offset
        this.prevOffsetR = new THREE.Vector3();
        this.curOffsetL = new THREE.Vector3(); // wrist position resulting from update
        this.curOffsetR = new THREE.Vector3(); // wrist position resulting form update

        // after reaching peak, user might choose to keep updating with real position or keep the peak value reached 
        this.keepUpdatingContact = false;
        this.peakOffsetL = new THREE.Vector3(0,0,0);
        this.peakOffsetR = new THREE.Vector3(0,0,0);
        this.peakUpdated = false;


        this.srcCurOffset = null; // pointer to curOffset L or R
        this.srcPoint = null;
        this.dstCurOffset = null; // pointer to curOffset L or R
        this.dstPoint = null;

        this.distanceVec = new THREE.Vector3(0,0,0);
        this.isBothHands = false; // whether to move only src hand to dst point or move both hands to their respective destination points 

        this.cancelledArmsFlag = 0x00; // 0x01 source cancelled, 0x02 destination cancelled (if both hands enabled)
        // set default poses
        this.reset();

        this._tempV3_0 = new THREE.Vector3();
        this._tempV3_1 = new THREE.Vector3();
        this._tempV3_2 = new THREE.Vector3();
    }

    reset(){
        this.transition = false;
        this.prevOffsetL.set(0,0,0);
        this.prevOffsetR.set(0,0,0);
        this.curOffsetL.set(0,0,0);
        this.curOffsetR.set(0,0,0);
        this.distanceVec.set(0,0,0);
        this.isBothHands = false;
        this.cancelledArmsFlag = 0x00;

        this.keepUpdatingContact = false;
        this.peakUpdated = false;
        this.peakOffsetL.set(0,0,0);
        this.peakOffsetR.set(0,0,0);
    }

    update( dt ){
        // nothing to do
        if ( !this.transition ){ return; } 

        this.time += dt;

        // wait in same pose
        if ( this.time < this.start ){ 
            return;
        }

        if ( this.keepUpdatingContact || !this.peakUpdated ){ 

            this.srcPoint.updateWorldMatrix( true ); // self and parents
            this.dstPoint.updateWorldMatrix( true ); // self and parents
            let srcWorldPoint = this._tempV3_0.setFromMatrixPosition( this.srcPoint.matrixWorld );
            let dstWorldPoint = this._tempV3_1.setFromMatrixPosition( this.dstPoint.matrixWorld );
            
            if ( this.isBothHands ){
                if ( this.cancelledArmsFlag & 0x01 ){ this.srcCurOffset.set(0,0,0); }
                else{
                    this.srcCurOffset.lerpVectors( srcWorldPoint, dstWorldPoint, 0.5 );
                    this.srcCurOffset.sub( srcWorldPoint );
                    this.srcCurOffset.addScaledVector( this.distanceVec, 0.5 );
                }
                
                if ( this.cancelledArmsFlag & 0x02 ){ this.dstCurOffset.set(0,0,0); }
                else{
                    this.dstCurOffset.lerpVectors( dstWorldPoint, srcWorldPoint, 0.5 );
                    this.dstCurOffset.sub( dstWorldPoint );
                    this.dstCurOffset.addScaledVector( this.distanceVec, -0.5 ); // same as subScaledVector but this function does not exist
                }
            }else{
                this.srcCurOffset.copy( dstWorldPoint );
                this.srcCurOffset.sub( srcWorldPoint );
                this.srcCurOffset.add( this.distanceVec );
                this.dstCurOffset.set(0,0,0);
            }

            // does not need to keep updating. Set this src and dst as final positions and flag as peak updated
            if ( this.time > this.attackPeak && !this.keepUpdatingContact && !this.peakUpdated ){
                this.peakOffsetL.copy( this.curOffsetL );
                this.peakOffsetR.copy( this.curOffsetR );
                this.peakUpdated = true;
            }
        }

        // reminder: srcCurOffset and dstCurOffset are pointers to curOffsetL and curOffsetR
        // now that final points are computed, interpolate from origin to target
        let t = 0;
        if ( this.time <= this.attackPeak ){
            t = ( this.time - this.start ) / ( this.attackPeak - this.start );
            if ( t > 1){ t = 1; }
            t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;

            this.curOffsetL.lerpVectors( this.prevOffsetL, this.curOffsetL, t );
            this.curOffsetR.lerpVectors( this.prevOffsetR, this.curOffsetR, t );

        }    
        else if ( this.time > this.attackPeak && this.time < this.relax ){ 
            // t = 1;
            // nothing else to update
        }            
        else if ( this.time >= this.relax){
            t = ( this.end - this.time ) / ( this.end - this.relax );
            if ( t > 1 ){ t = 1; }
            if ( t < 0 ){ t = 0; }
            t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
            
            if ( this.time >= this.end ){ this.transition = false; }

            if ( !this.keepUpdatingContact ){
                this.curOffsetL.copy( this.peakOffsetL );
                this.curOffsetR.copy( this.peakOffsetR );
            }
            this.curOffsetL.multiplyScalar( t );
            this.curOffsetR.multiplyScalar( t );

        }
        
    }

    cancelArm( arm = "R" ){
        if ( arm == "B" ){ this.reset(); }
        if ( this.isBothHands ){
            if ( arm == "R"){ 
                this.cancelledArmsFlag |= ( this.srcCurOffset == this.curOffsetR ) ? 0x01 : 0x02; 
                this.prevOffsetR.set(0,0,0); 
                this.curOffsetR.set(0,0,0); 
                this.peakOffsetR.set(0,0,0);
            }
            else if ( arm == "L"){ 
                this.cancelledArmsFlag |= ( this.srcCurOffset == this.curOffsetL ) ? 0x01 : 0x02; 
                this.prevOffsetL.set(0,0,0); 
                this.curOffsetL.set(0,0,0); 
                this.peakOffsetL.set(0,0,0);
            }
        }
        else{ // only one arm is working. Cancel only if it is the selected arm
            if ( arm == "R" && this.srcCurOffset == this.curOffsetR ){ this.reset(); }
            else if ( arm == "L" && this.srcCurOffset == this.curOffsetL ){ this.reset(); }
        }
    }


    _newGestureLocationComposer( bml, handLocations, hand = "R", isSource = true ){
        // check all-in-one variable first
        let compactContact = isSource ? bml.srcContact : bml.dstContact;
        if ( typeof( compactContact ) == "string" ){
            compactContact.toUpperCase();
            let result = handLocations[ compactContact ];
            if ( result ){ return result; }
        }

        // check decomposed variables
        let finger = parseInt( isSource ? bml.srcFinger : bml.dstFinger );
        let side = isSource ? bml.srcSide : bml.dstSide; 
        let location = isSource ? bml.srcLocation : bml.dstLocation;

        if ( isNaN( finger ) || finger < 1 || finger > 5 ){ finger = ""; }
        if ( typeof( location ) != "string" || location.length < 1){ location = ""; }
        else{ 
            location = ( finger > 0 ? "_" : "" ) + location.toUpperCase();
        }
        if ( typeof( side ) != "string" || side.length < 1 ){ side = ""; }
        else{ 
            side = side.toUpperCase();
            if ( !location.includes("ELBOW") && !location.includes("UPPER_ARM") ){ // jasigning...
                if ( side == "RIGHT" ){ side = (hand == "R" ? "ULNAR" : "RADIAL"); }
                else if ( side == "LEFT" ){ side = (hand == "R" ? "RADIAL" : "ULNAR"); }
            }
            side = "_" + side;
        }
        let name = finger + location + side; 

        let result = handLocations[ name ];
        if ( !result ){ result = handLocations[ "2_TIP" ]; }
        return result;
    }
    /**
     * bml info
     * start, attackPeak, relax, end
     * distance: [-ifinity,+ifninity] where 0 is touching and 1 is the arm size. Distance between endpoints. Right now only horizontal distance is applied
     * 
     * Location of the hand in the specified hand (or dominant hand)
     * srcContact: (optional) source contact location in a single variable. Strings must be concatenate as srcFinger + "_" +srcLocation + "_" +srcSide (whenever each variable is needed)
     * srcFinger: (optional) 1,2,3,4,5
     * srcLocation: (optional) string from handLocations (although no forearm, elbow, upperarm are valid inputs here)
     * srcSide: (optional) ULNAR, RADIAL, PALMAR, BACK. (ulnar == thumb side, radial == pinky side. Since hands are mirrored, this system is better than left/right)
     * 
     * Location of the hand in the unspecified hand (or non dominant hand)
     * dstContact: (optional) source contact location in a single variable. Strings must be concatenate as dstFinger + dstLocation + dstSide (whenever each variable is needed)
     * dstFinger: (optional) 1,2,3,4,5
     * dstLocation: (optional) string from handLocations (although no forearm, elbow, upperarm are valid inputs here)
     * dstSide: (optional) ULNAR, RADIAL, PALMAR, BACK 
     * 
     * keepUpdatingContact: (optional) once peak is reached, the location will be updated only if this is true. 
     *                  i.e: set to false; contact tip of index; reach destination. Afterwards, changing index finger state will not modify the location
     *                       set to true; contact tip of index; reach destination. Afterwards, changing index finger state (handshape) will make the location change depending on where the tip of the index is  

     */
    newGestureBML( bml, domHand = "R"  ) {
        this.keepUpdatingContact = !!bml.keepUpdatingContact;
        this.peakUpdated = false;
        this.cancelledArmsFlag = 0x00;
        let srcLocations = null;
        let dstLocations = null;
        let srcHand = "R";

        if ( bml.hand == "BOTH" ){ // src default to domhand
            this.isBothHands = true;
            srcHand = domHand == "L" ? "L" : "R";
        }else{
            this.isBothHands = false;
            if ( bml.hand == "RIGHT" ){ srcHand = "R"; }
            else if ( bml.hand == "LEFT" ){ srcHand = "L"; }
            else if ( bml.hand == "NON_DOMINANT" ){ srcHand = domHand == "L" ? "R" : "L"; }
            else{ srcHand = domHand == "L" ? "L" : "R"; }
        }

        // save current state as previous state. curOffset changes on each update
        this.prevOffsetL.copy( this.curOffsetL );
        this.prevOffsetR.copy( this.curOffsetR );


        // set pointers
        if ( srcHand == "L" ){
            this.srcCurOffset = this.curOffsetL;
            this.dstCurOffset = this.curOffsetR;
            srcLocations = this.handLocationsL; 
            dstLocations = this.handLocationsR;
        }else{
            this.srcCurOffset = this.curOffsetR;
            this.dstCurOffset = this.curOffsetL;
            srcLocations = this.handLocationsR;
            dstLocations = this.handLocationsL
        }
        this.srcPoint = this._newGestureLocationComposer( bml, srcLocations, srcHand, true );
        this.dstPoint = this._newGestureLocationComposer( bml, dstLocations, srcHand =="R" ? "L":"R", false );
        
        let distance = parseFloat( bml.distance );
        if ( isNaN( distance ) ){ this.distanceVec.set(0,0,0); }
        else{ 
            if ( !stringToDirection( bml.distanceDirection, this.distanceVec, 0x00, true) ){
                if ( this.srcCurOffset == this.curOffsetR ){ this.distanceVec.set( -1,0,0 ); }
                else{ this.distanceVec.set( 1,0,0 ); }
            }
            this.distanceVec.normalize();
            this.distanceVec.multiplyScalar( distance * this.worldArmSize );
        }

        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0;
        this.transition = true;

        return true;
    }   
}



let _tempVec3_0 = new THREE.Vector3(0,0,0);
let _tempVec3_1 = new THREE.Vector3(0,0,0);
let _tempQuat_0 = new THREE.Quaternion(0,0,0,1);
let _tempQuat_1 = new THREE.Quaternion(0,0,0,1);

class DirectedMotion {
    constructor(){
        this.finalOffset = new THREE.Vector3(0,0,0);        
        this.bezier = [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ]

        this.distance = 0.05; // metres
        this.curveSize = 0.5; // [0,1] curve curveSize

        this.zigzagDir = new THREE.Vector3(0,0,1);
        this.zigzagSize = 0.01; // metres. Complete amplitude. Motion will move half to dir and half to -dir
        this.zigzagSpeed = 2; // loops per second

        this.transition = false;
        this.time = 0;

        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0;
        this.end = 0;
    }

    reset(){
        this.transition = false;
        this.finalOffset.set(0,0,0);
    }

    update( dt ){
        if ( !this.transition ){ return; }
        
        this.time += dt;
        if ( this.time < this.start ){ return this.finalOffset; }

        else if ( this.time < this.attackPeak ){
            let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
            // t = Math.sin( Math.PI * t - Math.PI * 0.5 ) * 0.5 + 0.5; // commented because of sigml purposes
            cubicBezierVec3( this.bezier[0], this.bezier[1], this.bezier[2], this.bezier[3], this.finalOffset, t );

            let zigzagAttenuation = Math.min( 1,  Math.min( ( this.attackPeak - this.time ) / 0.15, ( this.time - this.start ) / 0.15 ) );  // min( full, outro, intro ). 0.15 seconds of intro and 0.5 of outro if possible
            let zigzagt = Math.sin( Math.PI * 2 * this.zigzagSpeed * ( this.time - this.start ) ) * this.zigzagSize * 0.5 * zigzagAttenuation;
            this.finalOffset.x = this.finalOffset.x + this.zigzagDir.x * zigzagt;
            this.finalOffset.y = this.finalOffset.y + this.zigzagDir.y * zigzagt;
            this.finalOffset.z = this.finalOffset.z + this.zigzagDir.z * zigzagt;
        }

        else if ( this.time < this.relax ){ 
            this.finalOffset.copy( this.bezier[3] );
        }

        else if ( this.time < this.end ){ // lerp to origin (0,0,0) 
            let t = ( this.time - this.relax ) / ( this.end - this.relax );
            // t = Math.sin( Math.PI * t - Math.PI * 0.5 ) * 0.5 + 0.5; // commented because of sigml purposes
            this.finalOffset.copy( this.bezier[3] );
            this.finalOffset.multiplyScalar( 1.0 - t );
        }

        else { this.transition = false; this.finalOffset.set(0,0,0); }

        return this.finalOffset;
    }

    /**
     * bml info
     * start, attackPeak, relax, end
     * direction: string from 26 directions
     * secondDirection: (optional)
     * distance: (optional) size in metres of the displacement. Default 0.2 m (20 cm)
     * curve: (optional) string from 6 basic directions. Default to none
     * secondCurve: (optional)
     * curveSize: (optional) number from [0,1] meaning the amplitude of the curve
     * zigzag: (optional) string from 26 directions
     * zigzagSize: (optional) amplitude of zigzag (from highest to lowest point) in metres. Default 0.01 m (1 cm)
     * zigzagSpeed: (optional) cycles per second. Default 2
     */
    newGestureBML( bml, symmetry ){
        this.finalOffset.set(0,0,0);
          
        this.distance = isNaN( bml.distance ) ? 0.2 : bml.distance; // metres
        this.curveSize = isNaN( bml.curveSize ) ? 0.5 : Math.max( 0, Math.min( 1, bml.curveSize ) );
        
        // THE FOLLOWING CODE TRIES TO MIMIC JASIGNING/HAMNOSYS BEHAVIOUR. IT COULD BE MUCH SIMPLER OTHERWISE

        // fetch curve direction and adjust curveSize if not present
        let curveDir = _tempVec3_0.set(0,0,0);
        if ( stringToDirection( bml.curve, curveDir, symmetry, true ) ){
            curveDir.z = 0;
            if ( stringToDirection( bml.secondCurve, _tempVec3_1, symmetry, true ) ){
                _tempVec3_1.z = 0;
                curveDir.lerp( _tempVec3_1, 0.5 );
            }
            if ( curveDir.lengthSq() > 0.00001 ){ curveDir.normalize(); }
        }
        curveDir.multiplyScalar( this.curveSize * 0.5 );

        // set default direction (+z), default curve direction (+y) and ajust with size and curve curveSize       
        this.bezier[0].set( 0, 0, 0 );
        this.bezier[1].set( curveDir.x, curveDir.y, 0 );
        this.bezier[2].set( curveDir.x, curveDir.y, this.distance );
        this.bezier[3].set( 0, 0, this.distance );
         
        // fetch direction and secondDirection
        let finalDir = _tempVec3_0;
        if ( !stringToDirection( bml.direction, finalDir, symmetry, true ) ){
            console.warn( "DirectedMotion has incorrect direction values" );
            return false;
        }
        if( finalDir.lengthSq() > 0.0001 ){ finalDir.normalize(); }
        if ( stringToDirection( bml.secondDirection, _tempVec3_1, symmetry, true ) ){
            if( _tempVec3_1.lengthSq() > 0.0001 ){ _tempVec3_1.normalize(); }
            finalDir.lerp( _tempVec3_1, 0.5 );
            if( finalDir.lengthSq() > 0.0001 ){ finalDir.normalize(); }
        }

        // default looks at +z. If direction falls in -z, change default to -z to avoid accidental left-right, up-down mirror
        if ( finalDir.z < 0 ){
            this.bezier[0].z *= -1;
            this.bezier[1].z *= -1;
            this.bezier[2].z *= -1;
            this.bezier[3].z *= -1;
        }
        
        // rotate default direction to match the user's one
        let lookAtQuat = _tempQuat_0;
        if ( Math.abs(finalDir.dot(this.bezier[3])) > 0.999 ){ lookAtQuat.set(0,0,0,1); }
        else{ 
            let angle = finalDir.angleTo( this.bezier[3] );
            _tempVec3_0.crossVectors( this.bezier[3], finalDir );
            _tempVec3_0.normalize();
            lookAtQuat.setFromAxisAngle( _tempVec3_0, angle );
        }
        this.bezier[0].applyQuaternion( lookAtQuat );
        this.bezier[1].applyQuaternion( lookAtQuat );
        this.bezier[2].applyQuaternion( lookAtQuat );
        this.bezier[3].applyQuaternion( lookAtQuat );

        // zig-zag
        if ( stringToDirection( bml.zigzag, this.zigzagDir ) ){
            this.zigzagSize = isNaN( bml.zigzagSize ) ? 0.01 : bml.zigzagSize; // metres
            this.zigzagSpeed = isNaN( bml.zigzagSpeed ) ? 2 : bml.zigzagSpeed; // rps
        }else{
            this.zigzagDir.set(0,0,0);
            this.zigzagSize = 0.0; // metres
            this.zigzagSpeed = 0; // rps
        }

        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0; 

        // flag to start 
        this.transition = true;

        return true;
    }
}

class CircularMotion {
    constructor(){
        this.yAxis = new THREE.Vector3(0,1,0);
        this.xAxis = new THREE.Vector3(1,0,0);
        this.startPoint = new THREE.Vector3(0,0,0);
        this.trgAngle = 0; // target delta angle
        this.srcAngle = 0; 

        this.finalOffset = new THREE.Vector3(0,0,0);
        
        this.zigzagDir = new THREE.Vector3(0,0,1);
        this.zigzagSize = 0.01; // metres. Complete amplitude. Motion will move half to dir and half to -dir
        this.zigzagSpeed = 2; // loops per second

        this.transition = false;
        this.time = 0;

        this.start = 0;
        this.end = 0;
    }

    reset(){
        this.transition = false;
        this.finalOffset.set(0,0,0);
    }

    update( dt ){
        if ( !this.transition ){ return this.finalOffset; }
        
        this.time += dt;
        if ( this.time < this.start ){ return this.finalOffset; }
        if ( this.time >= this.attackPeak && this.time <= this.relax ){ // necessary to update (at least once) or there might be a jump
            this.finalOffset.set(0,0,0);
            this.finalOffset.addScaledVector( this.xAxis, Math.cos( this.trgAngle ) );
            this.finalOffset.addScaledVector( this.yAxis, Math.sin( this.trgAngle ) );
            this.finalOffset.sub( this.startPoint );
            return this.finalOffset; 
        }
        if ( this.time >= this.relax && this.time <= this.end ){ 
            this.finalOffset.set(0,0,0);
            this.finalOffset.addScaledVector( this.xAxis, Math.cos( this.trgAngle ) );
            this.finalOffset.addScaledVector( this.yAxis, Math.sin( this.trgAngle ) );
            this.finalOffset.sub( this.startPoint );
            this.finalOffset.multiplyScalar( ( this.end - this.time ) / ( this.end - this.relax ) );
            return this.finalOffset;
        }
        if ( this.time >= this.end ){ 
            this.transition = false; 
            this.finalOffset.set(0,0,0); 
            return this.finalOffset;
        }

        //if ( time > start && time < attackpeak ) start attackpeak
        let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
        // t = Math.sin( Math.PI * t - Math.PI * 0.5 ) * 0.5 + 0.5;  // commented because of sigml purposes
        t = ( t > 1 ) ? 1 : t;
        
        // angle to rotate startPoint
        this.finalOffset.set(0,0,0);
        this.finalOffset.addScaledVector( this.xAxis, Math.cos( this.srcAngle * ( 1 - t ) + this.trgAngle * t ) );
        this.finalOffset.addScaledVector( this.yAxis, Math.sin( this.srcAngle * ( 1 - t ) + this.trgAngle * t ) );
        this.finalOffset.sub( this.startPoint );

        // zigzag 
        if ( Math.abs(this.zigzagSize) > 0.0001 ){
            let easing = Math.max( 0, Math.min( 1, Math.min( ( this.time - this.start ) / 0.5, ( this.attackPeak - this.time ) / 0.5 ) ) );
            let zigzagt = Math.sin( Math.PI * 2 * this.zigzagSpeed * ( this.time - this.start ) ) * this.zigzagSize * 0.5 * easing;
            this.finalOffset.x = this.finalOffset.x + this.zigzagDir.x * zigzagt;
            this.finalOffset.y = this.finalOffset.y + this.zigzagDir.y * zigzagt;
            this.finalOffset.z = this.finalOffset.z + this.zigzagDir.z * zigzagt;
        }
        return this.finalOffset;
    }

    /**
     * bml info
     * start, attackPeak, relax, end
     * direction: string from 26 directions. Axis of rotation
     * secondDirection: (optional)
     * distance: (optional) radius in metres of the circle.  Default 0.05 m (5 cm)
     * startAngle: (optional) where in the circle to start. 0º indicates up. Indicated in degrees. Default to 0º. [-infinity, +infinity]
     * endAngle: (optional) where in the circle to finish. 0º indicates up. Indicated in degrees. Default to 360º. [-infinity, +infinity]
     * ellipseAxisDirection: (optional) string from u,d,l,r directions (i,o are ignored).
     * ellipseAxisRatio: (optional) number in range [0,1]. Indicates the axis ratio of the ellipse ( minor / major ). Default to 1 (circle)
     * zigzag: (optional) string from 26 directions
     * zigzagSize: (optional) amplitude of zigzag (from highest to lowest point) in metres. Default 0.01 m (1 cm)
     * zigzagSpeed: (optional) cycles per second. Default 2
     */
    newGestureBML( bml, symmetry ){
        this.finalOffset.set(0,0,0);
        
        // assume normal axis = (0,0,1). Set the ellipse shape 2D (x,y)
        let distance = isNaN( bml.distance ) ? 0.05 : bml.distance;
        let axisRatio = parseFloat( bml.ellipseAxisRatio ); // minor / major
        if ( isNaN( axisRatio ) ){ axisRatio = 1; } // basically a circle

        if ( stringToDirection( bml.ellipseAxisDirection, _tempVec3_0, symmetry, true ) ){
            _tempVec3_0.z = 0;
            if ( _tempVec3_0.lengthSq() < 0.0001 ){ _tempVec3_0.set(1,0,0); }
            else{ _tempVec3_0.normalize(); }
        }else{
            _tempVec3_0.set(1,0,0);
        }
        this.xAxis.copy( _tempVec3_0 ).multiplyScalar( distance ); // set major axis
        this.yAxis.set( -this.xAxis.y, this.xAxis.x, 0 ).multiplyScalar( axisRatio ); // set minor axis

        // normal axis
        if ( !stringToDirection( bml.direction, _tempVec3_0, symmetry, true ) ){
            console.warn( "Gesture: Location Motion no direction found with name \"" + bml.direction + "\"" );
            return false;
        }
        if ( !stringToDirection( bml.secondDirection, _tempVec3_1, symmetry, true ) ){
            _tempVec3_1.copy( _tempVec3_0 );
        }
        _tempVec3_1.lerpVectors( _tempVec3_1, _tempVec3_0, 0.5 );
        if( _tempVec3_1.lengthSq() < 0.0001 ){ _tempVec3_1.copy( _tempVec3_0 ); }
        _tempVec3_1.normalize(); // final axis perpendicular to circle

        // reorient ellipse normal from (0,0,1) to whatever axis the user specified
        let elevation = Math.asin( _tempVec3_1.y );
        let bearing = Math.atan2( _tempVec3_1.x, _tempVec3_1.z );
        _tempQuat_0.setFromAxisAngle( _tempVec3_0.set(1,0,0), -elevation );
        _tempQuat_1.setFromAxisAngle( _tempVec3_0.set(0,1,0), bearing );
        _tempQuat_0.premultiply( _tempQuat_1 );
        this.xAxis.applyQuaternion( _tempQuat_0 );
        this.yAxis.applyQuaternion( _tempQuat_0 );
        
        // angle computations
        this.srcAngle = isNaN( bml.startAngle ) ? 0 : ( bml.startAngle * Math.PI / 180.0 );
        this.trgAngle = isNaN( bml.endAngle ) ? ( this.srcAngle + 2 * Math.PI ) : ( bml.endAngle * Math.PI / 180.0 );
        if( symmetry ){ // all symmetries mirror the same
            this.trgAngle *= -1;
            this.srcAngle *= -1;
        }
       
        this.startPoint.set(0,0,0);
        this.startPoint.addScaledVector( this.xAxis, Math.cos( this.srcAngle ) );
        this.startPoint.addScaledVector( this.yAxis, Math.sin( this.srcAngle ) );

        // zig-zag
        if ( stringToDirection( bml.zigzag, this.zigzagDir ) ){
            this.zigzagSize = isNaN( bml.zigzagSize ) ? 0.01 : bml.zigzagSize; // metres
            this.zigzagSpeed = isNaN( bml.zigzagSpeed ) ? 2 : bml.zigzagSpeed; // rps
        }else{
            this.zigzagDir.set(0,0,0);
            this.zigzagSize = 0.0; // metres
            this.zigzagSpeed = 0; // rps
        }

        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0; 

        // flag to start 
        this.transition = true;
        
        return true;
    }
}

class FingerPlay {
    constructor(){ 
        this.curBends = [ 0, 0, 0, 0, 0 ]; // thumb, index, middle, ring, pinky
        this.fingerEnabler = 0x00; // flags. bit0 = thumb, bit1 = index, bit2 = middle, bit3 = ring, bit4 = pinky
        
        this.transition = false;
        this.speed = 3;
        this.intensity = 0.3;
        
        
        this.clock = 0; // using cos operations. if a fingerplay overwrites another in play, need to be in the same phase  
        this.curUpdateIntensity = [0,0,0,0,0];
        this.srcUpdateIntensity = [0,0,0,0,0];
        
        this.time = 0;
        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0;
        this.end = 0;
    }

    reset(){
        this.transition = false;
        this.curBends.fill( 0 );
    }

    update( dt ){
        if ( !this.transition ){ return; }

        this.clock += dt;
        this.time += dt;
        let interpolator = 0;
        let introInterpolator = 1;
        if ( this.time < this.start ){ introInterpolator= 0; interpolator = 0; }
        else if ( this.time < this.attackPeak ){ 
            interpolator = ( this.time - this.start ) / ( this.attackPeak - this.start ); 
            introInterpolator = interpolator;
        }
        else if ( this.time < this.relax ){ interpolator = 1; }
        else if ( this.time < this.end ){ interpolator = ( this.end - this.time ) / ( this.end - this.relax ); }
        else {
            interpolator = 0; 
            this.transition = false;
        }

        let intensity = interpolator * this.intensity;

        // interpolation -- cos(t + X) where X is different for each finger
        this.curUpdateIntensity[0] = ( (this.fingerEnabler & 0x01 ? 1 : 0) * intensity ) + this.srcUpdateIntensity[0] * (1-introInterpolator);
        this.curBends[0] = ( Math.cos( Math.PI * 2 * this.speed * this.clock + Math.PI * 0.25 ) * 0.5 + 0.5 ) * this.curUpdateIntensity[0];

        this.curUpdateIntensity[1] = ( (this.fingerEnabler & 0x02 ? 1 : 0) * intensity ) + this.srcUpdateIntensity[1] * (1-introInterpolator);
        this.curBends[1] = ( Math.cos( Math.PI * 2 * this.speed * this.clock ) * 0.5 + 0.5 ) * this.curUpdateIntensity[1];

        this.curUpdateIntensity[2] = ( (this.fingerEnabler & 0x04 ? 1 : 0) * intensity ) + this.srcUpdateIntensity[2] * (1-introInterpolator);
        this.curBends[2] = ( Math.cos( Math.PI * 2 * this.speed * this.clock + Math.PI * 0.65 ) * 0.5 + 0.5 ) * this.curUpdateIntensity[2];

        this.curUpdateIntensity[3] = ( (this.fingerEnabler & 0x08 ? 1 : 0) * intensity ) + this.srcUpdateIntensity[3] * (1-introInterpolator); 
        this.curBends[3] = ( Math.cos( Math.PI * 2 * this.speed * this.clock + Math.PI * 1.05 ) * 0.5 + 0.5 ) * this.curUpdateIntensity[3];

        this.curUpdateIntensity[4] = ( (this.fingerEnabler & 0x10 ? 1 : 0) * intensity ) + this.srcUpdateIntensity[4] * (1-introInterpolator);
        this.curBends[4] =  ( Math.cos( Math.PI * 2 * this.speed * this.clock + Math.PI * 1.35 ) * 0.5 + 0.5 ) * this.curUpdateIntensity[4];
    }

     /**
     * bml info
     * start, attackPeak, relax, end
     * speed = (optional) oscillations per second. Default 3
     * intensity = (optional) [0,1]. Default 0.3
     * fingers = (optional) string with numbers. Each number present activates a finger. 1=thumb, 2=index, 3=middle, 4=ring, 5=pinky. I.E. "234" activates index, middle, ring but not pinky. Default all enabled
     * exemptedFingers = (optional) string with numbers. Blocks a finger from doing the finger play. Default all fingers move
     */
    newGestureBML( bml ){
        
        this.transition = true;
        this.speed = isNaN( bml.speed ) ? 3 : bml.speed;
        this.intensity = isNaN( bml.intensity ) ? 0.3 : bml.intensity;
        this.intensity = Math.min( 1, Math.max( -1, this.intensity ) ) * 0.5;

        // swap pointers
        let temp = this.srcUpdateIntensity; 
        this.srcUpdateIntensity = this.curUpdateIntensity;
        this.curUpdateIntensity = temp;

        this.fingerEnabler = 0x1f;
        if ( typeof( bml.fingers ) == 'string' ){
            // enable only the specified fingers (bits)
            this.fingerEnabler = 0x00; 
            for( let i = 0; i < bml.fingers.length; ++i ){
                let val = parseInt( bml.fingers[i] );
                if ( !isNaN( val ) ){ this.fingerEnabler |= 0x01 << (val-1); }
            }
            this.fingerEnabler &= 0x1f; // mask unused bits
        }
        if ( typeof( bml.exemptedFingers ) == 'string' ){
            // enable only the specified fingers (bits)
            for( let i = 0; i < bml.exemptedFingers.length; ++i ){
                let val = parseInt( bml.exemptedFingers[i] );
                if ( !isNaN( val ) ){ this.fingerEnabler &= ~(0x01 << (val-1)); }
            }
            this.fingerEnabler &= 0x1f; // mask unused bits
        }


        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0;

        return true;
    }

};



class WristMotion {
    constructor( config, skeleton, isLeftHand = false ){
        this.skeleton = skeleton;
        this.config = config;
        
        this.time = 0;
        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0;
        this.end = 0;
        this.transition = false;

        this.clock = 0; // using cos operations. if a wristmotion overwrites another in play, need to be in the same phase  
        this.curUpdateIntensity = [0,0,0]; // [ twist, nod, swing ]
        this.srcUpdateIntensity = [0,0,0];
        
        this.mode = 0; // FLAGS 0=NONE, 1=TWIST, 2=NOD, 4=SWING 
        this.intensity = 1;
        this.speed = 1;
        
        let handName = isLeftHand ? "L" : "R";
        this.wristBone = this.skeleton.bones[ config.boneMap[ handName + "Wrist" ] ];
        
        // ** compute axes based on skeleton T-pose shape. Avoids hardcoded axes **
        this.axes = [ new THREE.Vector3(0,0,1), new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0) ]; // twist, nod, swing. Axes in local space
        let wristBindMat = this.skeleton.boneInverses[ config.boneMap[ handName + "Wrist" ] ];
        let middleBindMat = this.skeleton.boneInverses[ config.boneMap[ handName + "HandMiddle" ] ];
        let indexBindMat = this.skeleton.boneInverses[ config.boneMap[ handName + "HandIndex" ] ];
        let ringBindMat = this.skeleton.boneInverses[ config.boneMap[ handName + "HandRing" ] ];
        
        // bind world positions
        let wristBindPos = (new THREE.Vector3()).setFromMatrixPosition( wristBindMat.clone().invert() );
        let middleBindDir = (new THREE.Vector3()).setFromMatrixPosition( middleBindMat.clone().invert() ).sub( wristBindPos ).normalize();
        let indexBindDir = (new THREE.Vector3()).setFromMatrixPosition( indexBindMat.clone().invert() ).sub( wristBindPos ).normalize();
        let ringBindDir = (new THREE.Vector3()).setFromMatrixPosition( ringBindMat.clone().invert() ).sub( wristBindPos ).normalize();

        this.axes[0].copy( middleBindDir ); // twist
        this.axes[2].crossVectors( ringBindDir, indexBindDir ).multiplyScalar( isLeftHand ? -1 : 1 ).normalize(); // temporal swing
        this.axes[1].crossVectors( this.axes[2], this.axes[0] ).normalize(); // nod
        this.axes[2].crossVectors( this.axes[0], this.axes[1] ); // ensure swing axis is perpendicular

        let wristBindWtoL = (new THREE.Matrix3()).setFromMatrix4( wristBindMat ); // just for direction vectors
        this.axes[0].applyMatrix3( wristBindWtoL ).normalize();
        this.axes[1].applyMatrix3( wristBindWtoL ).normalize();
        this.axes[2].applyMatrix3( wristBindWtoL ).normalize();
        
    }

    reset(){
        this.time = 0;
        this.mode = 0;
        this.transition = false;
    }

    update( dt ){
        if ( !this.transition ){ return; }

        this.clock += dt;
        this.time += dt;
        let interpolator = 0;
        let introInterpolator = 0;
        if ( this.time < this.start ){ interpolator = 0; }
        else if ( this.time < this.attackPeak ){ interpolator = ( this.time - this.start ) / ( this.attackPeak - this.start ); introInterpolator = 1.0-interpolator; }
        else if ( this.time < this.relax ){ interpolator = 1; }
        else if ( this.time < this.end ){ interpolator = ( this.end - this.time ) / ( this.end - this.relax ); }
        else {
            interpolator = 0; 
            this.mode = 0x00;
            this.transition = false;
        }
        
        let intensity = 0;
        let axis = _tempVec3_0;

        // TWIST
        axis.copy( this.axes[0] ).applyQuaternion( this.wristBone.quaternion ); // apply other rotations to ensure correct axis direction
        intensity = this.srcUpdateIntensity[0] * introInterpolator;
        if ( this.mode & 0x01 ){ intensity += this.intensity * interpolator };
        this.curUpdateIntensity[0] = intensity;
        _tempQuat_0.setFromAxisAngle( axis, Math.cos( 2 * Math.PI * this.speed * this.clock ) * intensity * ( Math.PI * 0.5 ) );
        this.wristBone.quaternion.premultiply( _tempQuat_0 );

        // NOD
        axis.copy( this.axes[1] ).applyQuaternion( this.wristBone.quaternion ); // apply other rotations to ensure correct axis direction
        intensity = this.srcUpdateIntensity[1] * introInterpolator;
        if ( this.mode & 0x02 ){ intensity += this.intensity * interpolator };
        this.curUpdateIntensity[1] = intensity;
        _tempQuat_0.setFromAxisAngle( axis, Math.cos( 2 * Math.PI * this.speed * this.clock ) * intensity * ( Math.PI * 0.5 ) );
        this.wristBone.quaternion.premultiply( _tempQuat_0 );
        
        // SWING
        axis.copy( this.axes[2] ).applyQuaternion( this.wristBone.quaternion ); // apply other rotations to ensure correct axis direction
        intensity = this.srcUpdateIntensity[2] * introInterpolator;
        if ( this.mode & 0x04 ){ intensity += this.intensity * interpolator };
        this.curUpdateIntensity[2] = intensity;
        _tempQuat_0.setFromAxisAngle( axis, Math.sin( 2 * Math.PI * this.speed * this.clock ) * intensity * ( Math.PI * 0.5 ) ); // PHASE of 90ª (sin instead of cos) with respect to NOD (see newGestureBML)
        this.wristBone.quaternion.premultiply( _tempQuat_0 );
    }

     /**
     * bml info
     * start, attackPeak, relax, end
     * mode = either a: 
     *          - string from [ "NOD", "NODDING", "SWING", "SWINGING", "TWIST", "TWISTING", "STIR_CW", "STIR_CCW", "ALL" ]
     *          - or a value from [ 0 = None, 1 = TWIST, 2 = NOD, SWING = 4 ]. 
     *            Several values can co-occur by using the OR (|) operator. I.E. ( 2 | 4 ) = STIR_CW
     *            Several values can co-occur by summing the values. I.E. ( 2 + 4 ) = STIR_CW
     * speed = (optional) oscillations per second. A negative values accepted. Default 3. 
     * intensity = (optional) [0,1]. Default 0.3
     */
    newGestureBML( bml ){
        
        this.speed = isNaN( bml.speed ) ? 3 : bml.speed;
        this.intensity = isNaN( bml.intensity ) ? 0.3 : bml.intensity;
        this.intensity = Math.min( 1, Math.max( 0, this.intensity ) );
        
        if ( typeof( bml.mode ) == "string" ){
            switch( bml.mode.toLowerCase() ){
                case "nod": case "nodding": this.mode = 0x02; break;
                case "swing": case "swinging": this.mode = 0x04; break;
                case "twist": case "twisting": this.mode = 0x01; break;
                case "stir_CW": case "stir_cw": this.mode = 0x06; break; // 0x02 | 0x04
                case "stir_CCW": case "stir_ccw":this.mode = 0x06; this.speed *= -1; break;
                case "all": this.mode = 0x07; break;
                default:
                    console.warn( "Gesture: No wrist motion called \"", bml.mode, "\" found" );
                    return false;
            }
        }
        else if ( isNaN( bml.mode ) ) {
            console.warn( "Gesture: No wrist motion called \"", bml.mode, "\" found" );
            return false;
        }
        else{
            this.mode = bml.mode & 0x07; // take only the necessary bits
        }

        // swap pointers
        let temp = this.curUpdateIntensity;
        this.curUpdateIntensity = this.srcUpdateIntensity;
        this.srcUpdateIntensity = temp;
        
        // check and set timings
        this.start = bml.start;
        this.attackPeak = bml.attackPeak;
        this.relax = bml.relax;
        this.end = bml.end;
        this.time = 0; 

        this.transition = true;
        
        return true;
    }
};
    

class BasicBMLValueInterpolator {
    constructor( config, skeleton, isLeftHand = false ){
        this.skeleton = skeleton;
        this.isLeftHand = !!isLeftHand;
        this.config = config;

        // store TWIST quaternions for forearm and hand (visally better than just forearm or wrist)
        this.defValue = 0;
        this.trgValue = 0;
        this.srcValue = 0;
        this.curValue = 0;

        this.time = 0; // current time of transition
        this.start = 0;
        this.attackPeak = 0;
        this.relax = 0; 
        this.end = 0;
        this.transition = false;
        
        // set default pose
        this.reset();
    }

    reset() {
        // Force pose update to flat
        this.transition = false;
        this.defValue = 0;
        this.curValue = 0;
    }

    update( dt ) {
        if ( !this.transition ){ return; } // no animation required
        
        this.time += dt;
        // wait in same pose
        if ( this.time < this.start ){ return; }
        if ( this.time > this.attackPeak && this.time < this.relax ){ 
            this.curValue = this.trgValue;
            return; 
        }
        
        if ( this.time <= this.attackPeak ){
            let t = ( this.time - this.start ) / ( this.attackPeak - this.start );
            if ( t > 1 ){ t = 1; }
            t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
            this.curValue = this.srcValue * ( 1 - t ) + this.trgValue * t;
            return;
        }

        if ( this.time >= this.relax ){
            let t = ( this.time - this.relax ) / ( this.end - this.relax );
            if ( t > 1 ){ t = 1; }
            t = Math.sin(Math.PI * t - Math.PI * 0.5) * 0.5 + 0.5;
            this.curValue = this.trgValue * ( 1 - t ) + this.defValue * t;

            if ( this.time > this.end ){ 
                this.transition = false;
            }
        }
        

    }


    /**
     * bml info
     * start, attackPeak, relax, end
     */
    newGestureBML( newTargetValue, start, attackPeak, relax, end, shift = false ){
        if( isNaN( newTargetValue ) || newTargetValue == null ){ return false; }

        // set source pose twist quaternions
        this.srcValue = this.curValue; 

        // set target pose
        this.trgValue = newTargetValue;

        // set defualt pose if necessary
        if ( shift ){
            this.defValue = this.trgValue;
        }

        // check and set timings
        this.start = start;
        this.attackPeak = attackPeak;
        this.relax = relax;
        this.end = end;
        this.time = 0; 
        
        this.transition = true;

        return true;
    }
}

class ElbowRaise extends BasicBMLValueInterpolator {
    newGestureBML ( bml ){
        let value = parseFloat( bml.elbowRaise ) * ( 90 * Math.PI / 180 ); // shoulderRaise = [0,1]. where 1 == 90 Degrees
        return super.newGestureBML( value, bml.start, bml.attackPeak, bml.relax, bml.end, bml.shift );
    }
}

class ShoulderRaise extends BasicBMLValueInterpolator {
    newGestureBML ( bml ){
        let value =  parseFloat( bml.shoulderRaise ) * ( 30 * Math.PI / 180 ); // shoulderRaise = [0,1]. where 1 == 30 Degrees
        return super.newGestureBML( value, bml.start, bml.attackPeak, bml.relax, bml.end, bml.shift );
    }
}

class ShoulderHunch extends BasicBMLValueInterpolator {
    newGestureBML ( bml ){
        let value = parseFloat( bml.shoulderHunch ) * ( 30 * Math.PI / 180 ); // shoulderRaise = [0,1]. where 1 == 30 Degrees
        return super.newGestureBML( value, bml.start, bml.attackPeak, bml.relax, bml.end, bml.shift );
    }
}

// this class should be different, but need to support jasigning
class BodyMovement {
    constructor ( config, skeleton ){
        this.config = config;
        this.skeleton = skeleton;

        // this should not be like this, but because of jasigning, create and destroy BasicBMLValueInterpolators and stack update results on each BodyMovement.update
        this.tiltFB = [];
        this.tiltLR = [];
        this.rotateLR = [];

        this.transition = false;

        this._tempQ_0 = new THREE.Quaternion();
        
        this.jointsData = { };
        this.jointsData.shouldersUnion = this.computeJointData( this.config.boneMap.ShouldersUnion, this.config.boneMap.Neck );
        this.jointsData.stomach = this.computeJointData( this.config.boneMap.Stomach, this.config.boneMap.ShouldersUnion );
        this.jointsData.belowStomach = this.computeJointData( this.config.boneMap.BelowStomach, this.config.boneMap.Stomach );
    }

    computeJointData( boneIdx, upAxisReferenceBoneIdx ){
        let bindQuat = (new THREE.Quaternion());
        getBindQuaternion( this.skeleton, boneIdx, bindQuat );

        // compute local axes of rotation based on bones boneIdx and upAxisReferenceBoneIdx.
        let xAxis = new THREE.Vector3();
        let yAxis = new THREE.Vector3();
        let zAxis = new THREE.Vector3();
        zAxis.setFromMatrixPosition( this.skeleton.boneInverses[ boneIdx ].clone().invert() ); // position of boneIdx in mesh coordinates
        yAxis.setFromMatrixPosition( this.skeleton.boneInverses[ upAxisReferenceBoneIdx ].clone().invert() ); // position of upAxisReferenceBoneIdx in mesh coordinates
        yAxis.subVectors( yAxis, zAxis ); // Y axis direction in mesh coordinates
        let m3 = (new THREE.Matrix3).setFromMatrix4( this.skeleton.boneInverses[ boneIdx ] ); // mesh to local, directions only
        yAxis.applyMatrix3( m3 ).normalize(); // Y axis, convert to local boneIdx coordinates
        zAxis.copy( this.config.axes[2] ).applyMatrix3( m3 ).normalize(); // Z convert mesh config front axis from mesh coords to local coords
        xAxis.crossVectors( yAxis, zAxis ).normalize(); // x
        zAxis.crossVectors( xAxis, yAxis ).normalize(); // Z ensure orthogonality

        return { idx: boneIdx, lastFrameQuat: new THREE.Quaternion(), bindQuat: bindQuat, beforeBindAxes: [ xAxis, yAxis, zAxis ] }; // tiltFB, rotateRL, tiltRL || x,y,z
    }

    reset (){
        this.transition = false;
        this.tiltFB = [];
        this.tiltLR = [];
        this.rotateLR = [];
        this.forceBindPose();
    }

    forceBindPose(){
        for( let part in this.jointsData ){
            this.skeleton.bones[ this.jointsData[ part ].idx ].quaternion.copy( this.jointsData[ part ].bindQuat );
        }
    }

    forceLastFramePose(){
        for( let part in this.jointsData ){
            this.skeleton.bones[ this.jointsData[ part ].idx ].quaternion.copy( this.jointsData[ part ].lastFrameQuat );
        }
    }

    update( dt, forceBearing, forceElevation, forceTilt ){
        if ( !this.transition ){ return; }

        let transition = false;

        let tiltFBAngle = 0; //forceElevation;
        for ( let i = 0; i < this.tiltFB.length; ++i ){
            let o = this.tiltFB[i];
            o.update( dt );
            if ( !o.transition ){ this.tiltFB.splice( i, 1 ); --i; }
            tiltFBAngle += o.curValue;
            transition |= o.transition;
        }

        let tiltLRAngle = 0; //forceTilt;
        for ( let i = 0; i < this.tiltLR.length; ++i ){
            let o = this.tiltLR[i];
            o.update( dt );
            if ( !o.transition ){ this.tiltLR.splice( i, 1 ); --i; }
            tiltLRAngle += o.curValue;
            transition |= o.transition;
        }

        let rotateLRAngle = 0; //forceBearing;
        for ( let i = 0; i < this.rotateLR.length; ++i ){
            let o = this.rotateLR[i];
            o.update( dt );
            if ( !o.transition ){ this.rotateLR.splice( i, 1 ); --i; }
            rotateLRAngle += o.curValue;
            transition |= o.transition;
        }

        this.transition = transition;
        let q = this._tempQ_0;

        for( let part in this.jointsData ){
            let data = this.jointsData[ part ];
            let bone = this.skeleton.bones[ data.idx ];
            bone.quaternion.setFromAxisAngle( data.beforeBindAxes[1], rotateLRAngle *0.3333 ); // y
            q.setFromAxisAngle( data.beforeBindAxes[0], tiltFBAngle *0.3333); // x
            bone.quaternion.premultiply( q );
            q.setFromAxisAngle( data.beforeBindAxes[2], tiltLRAngle *0.3333); // z
            bone.quaternion.premultiply( q );
            bone.quaternion.premultiply( data.bindQuat ); // probably should MULTIPLY bind quat (previously adjusting axes)
            bone.quaternion.normalize();
            this.jointsData[part].lastFrameQuat.copy( bone.quaternion );
        }
    }

    newGestureBML( bml ){
        let amount = parseFloat( bml.amount );
        if ( isNaN( amount ) ){ amount = 1; }
        amount = amount * 15 * Math.PI / 180;
        let dstBuffer = null;
        switch( bml.bodyMovement ){
            case "TILT_LEFT": case "TL": amount *= -1;
            case "TILT_RIGHT": case "TR": dstBuffer = this.tiltLR;
                break;
            case "TILT_BACKWARD": case "TB": amount *= -1;
            case "TILT_FORWARD": case "TF": dstBuffer = this.tiltFB;
                break;
            case "ROTATE_RIGHT": case "RR": amount *= -1;
            case "ROTATE_LEFT": case "RL": dstBuffer = this.rotateLR;
                break;
        }

        if ( dstBuffer ){
            let b = new BasicBMLValueInterpolator(this.config, this.skeleton );
            b.newGestureBML( amount, bml.start, bml.attackPeak, bml.relax, bml.end );
            dstBuffer.push( b );
            this.transition = true;
        }

        return true;
    }
}




export { quadraticBezierVec3, cubicBezierVec3, mirrorQuat, mirrorQuatSelf, nlerpQuats, getTwistSwingQuaternions, getTwistQuaternion, stringToDirection, findIndexOfBone, findIndexOfBoneByName, getBindQuaternion, forceBindPoseQuats, BehaviourManager, BehaviourPlanner, Blink, FacialExpr, FacialEmotion, GazeManager, Gaze, HeadBML, Lipsync, Text2LipInterface, T2LTABLES, HandShape, ExtfidirPalmor, LocationBodyArm, HandConstellation, DirectedMotion, CircularMotion, FingerPlay, WristMotion, ElbowRaise, ShoulderRaise, ShoulderHunch, BodyMovement} 