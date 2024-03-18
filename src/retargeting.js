import * as THREE from 'https://cdn.skypack.dev/three@0.136';


// asymetric and/or negative scaling of objects is not properly supported 
class AnimationRetargeting {

    /**
     * Retargets animations and/or current poses from one skeleton to another. 
     * Both skeletons must have the same bind pose (same orientation for each mapped bone) in order to properly work.
     * Use optional parameters to adjust the bind pose.
     * @param srcSkeleton Skeleton of source avatar. Its bind pose must be the same as trgSkeleton. The original skeleton is cloned and can be safely modified
     * @param trgSkeleton Same as srcSkeleton but for the target avatar
     * @param options.srcUseCurrentPose Bool. If true, the current pose of the srcSkeleton will be used as the bind pose for the retargeting. Otherwise, skeleton's actual bind pose is used
     * @param options.trgUseCurrentPose Same as srcUseCurrentPose but for the target avatar 
     * @param options.srcEmbedWorldTransforms Bool. Retargeting only takes into account transforms from the actual bone objects. 
     * If set to true, external (parent) transforms are computed and embedded into the root joint. 
     * Afterwards, parent transforms/matrices can be safely modified and will not affect in retargeting.
     * Useful when it is easier to modify the container of the skeleton rather than the actual skeleton in order to align source and target poses
     * @param options.trgEmbedWorldTransforms Same as srcEmbedWorldTransforms but for the target avatar
     * @param options.boneNameMap String-to-string mapping between src and trg through bone names. Only supports one-to-one mapping
     */
    constructor( srcSkeleton, trgSkeleton, options = null ){
        if (!options){ options = {}; }

        this.srcSkeleton = srcSkeleton; // original ref
        if ( !srcSkeleton.boneInverses ){ // find its skeleton
            srcSkeleton.traverse( (o) => { if( o.isSkinnedMesh ){ this.srcSkeleton = o.skeleton; } } );
        }
        this.trgSkeleton = trgSkeleton; // original ref
        if ( !trgSkeleton.boneInverses ){ // find its skeleton
            trgSkeleton.traverse( (o) => { if( o.isSkinnedMesh ){ this.trgSkeleton = o.skeleton; } } );
        }
        this.srcBindPose = this.cloneRawSkeleton( this.srcSkeleton, options.srcUseCurrentPose, options.srcEmbedWorldTransforms ); // returns pure skeleton, without any object model applied 
        this.trgBindPose = this.cloneRawSkeleton( this.trgSkeleton, options.trgUseCurrentPose, options.trgEmbedWorldTransforms ); // returns pure skeleton, without any object model applied
        this.boneMap = this.computeBoneMap( this.srcSkeleton, this.trgSkeleton, options.boneNameMap ); // { idxMap: [], nameMape:{} }

        this.precomputedQuats = this.precomputeRetargetingQuats();
    }

    /**
     * creates a Transform object with identity values
     * @returns Transform
     */
    _newTransform(){ return { p: new THREE.Vector3(0,0,0), q: new THREE.Quaternion(0,0,0,1), s: new THREE.Vector3(1,1,1) }; }

    /**
     * Deep clone of the skeleton. New bones are generated. Skeleton's parent objects will not be linked to the cloned one
     * Returned skeleton has new attributes: 
     *  - Always: .parentIndices, .transformsWorld, .transformsWorldInverses
     *  - embedWorld == true:  .transformsWorldEmbedded
     * @param {THREE.Skeleton} skeleton 
     * @returns {THREE.Skeleton}
     */
    cloneRawSkeleton( skeleton, useCurrentPose = false, embedWorld = false ){
        let bones = skeleton.bones;
        let resultBones = new Array( bones.length );
        let parentIndices = new Int16Array( bones.length );

        // bones[0].clone( true ); // recursive
        for( let i = 0; i < bones.length; ++i ){
            resultBones[i] = bones[i].clone();
            resultBones[i].parent = null;
        }
        
        for( let i = 0; i < bones.length; ++i ){
            let parentIdx = findIndexOfBone( skeleton, bones[i].parent )
            if ( parentIdx > -1 ){ resultBones[ parentIdx ].add( resultBones[ i ] ); }
            parentIndices[i] = parentIdx;
        }

        resultBones[0].updateWorldMatrix( false, true ); // assume 0 is root. Update all global matrices (root does not have any parent)

        // generate skeleton
        let resultSkeleton;
        if ( useCurrentPose ){
            resultSkeleton = new THREE.Skeleton( resultBones ); // will automatically compute the inverses from the matrixWorld of each bone
        }else{
            let boneInverses = new Array( skeleton.boneInverses.length );
            for( let i = 0; i < boneInverses.length; ++i ){ boneInverses[i] = skeleton.boneInverses[i].clone(); }
            resultSkeleton = new THREE.Skeleton( resultBones, boneInverses );
            resultSkeleton.pose();
            // forceBindPoseQuats( resultSkeleton );
        }

        resultSkeleton.parentIndices = parentIndices; // add this attribute to the THREE.Skeleton class
        
        // precompute transforms (forward and inverse) from world matrices
        let transforms = new Array( skeleton.bones.length );
        let transformsInverses = new Array( skeleton.bones.length );
        for( let i = 0; i < transforms.length; ++i ){
            let t = this._newTransform();
            resultSkeleton.bones[i].matrixWorld.decompose( t.p, t.q, t.s );
            transforms[i] = t;
            
            t = this._newTransform();
            resultSkeleton.boneInverses[i].decompose( t.p, t.q, t.s );
            transformsInverses[i] = t;
        }
        resultSkeleton.transformsWorld = transforms;
        resultSkeleton.transformsWorldInverses = transformsInverses;

        // embedded transform
        if ( embedWorld && bones[0].parent ){
            let embedded = { forward: this._newTransform(), inverse: this._newTransform() };
            let t = embedded.forward;
            bones[0].parent.updateWorldMatrix( true, false );
            bones[0].parent.matrixWorld.decompose( t.p, t.q, t.s );
            t = embedded.inverse;
            skeleton.bones[0].parent.matrixWorld.clone().invert().decompose( t.p, t.q, t.s );
            resultSkeleton.transformsWorldEmbedded = embedded;
        }

        return resultSkeleton;
    }


    /**
     * Maps bones from one skeleton to another given boneMap. 
     * Given a null bonemap, an automap is performed
     * @param {THREE.Skeleton} srcSkeleton 
     * @param {THREE.Skeleton} trgSkeleton 
     * @param {object} boneMap { string: string }
     * @returns {object} { idxMap: [], nameMape: {} }
     */
    computeBoneMap( srcSkeleton, trgSkeleton, boneMap = null ){
        let srcBones = srcSkeleton.bones;
        let trgBones = trgSkeleton.bones;
        let result = {
            idxMap: new Int16Array( srcBones.length ),
            nameMap: {}
        }
        result.idxMap.fill( -1 ); // default to no map;

        if ( boneMap ){
            for ( let srcName in boneMap ){
                let idx = findIndexOfBoneByName( srcSkeleton, srcName );    
                if ( idx < 0 ){ continue; }
                let trgIdx = findIndexOfBoneByName( trgSkeleton, boneMap[ srcName ] ); // will return either a valid index or -1
                result.idxMap[ idx ] = trgIdx;
                result.nameMap[ srcName ] = boneMap[ srcName ];
            }
        }else{
            // automap
            for( let i = 0; i < srcBones.length; ++i ){
                let srcName = srcBones[i].name;
                if ( typeof( srcName ) !== "string" ){ continue; }
                srcName = srcName.toLowerCase().replace( "mixamorig", "" ).replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "" );
                if ( srcName.length < 1 ){ continue; }

                for( let j = 0; j < trgBones.length; ++j ){
                    let trgName = trgBones[j].name;
                    if ( typeof( trgName ) !== "string" ){ continue; }
                    trgName = trgName.toLowerCase().replace( "mixamorig", "" ).replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "" );
                    if ( srcName == trgName ){
                        result.idxMap[i] = j;
                        result.nameMap[ srcBones[i].name ] = trgBones[j].name; 
                    }
                }
            }
        }

        return result
    }

    precomputeRetargetingQuats(){
        //BASIC ALGORITHM --> trglocal = invTrgWorldParent * srcWorldParent * srcLocal * invSrcWorld * trgWorld
        // trglocal = invTrgWorldParent * invTrgEmbedded * srcEmbedded * srcWorldParent * srcLocal * invSrcWorld * invSrcEmbedded * trgEmbedded * trgWorld

        let left = new Array( this.srcBindPose.bones.length ); // invTrgWorldParent * invTrgEmbedded * srcEmbedded * srcWorldParent
        let right = new Array( this.srcBindPose.bones.length ); // invSrcWorld * invSrcEmbedded * trgEmbedded * trgWorld
        
        for( let srcIndex = 0; srcIndex < left.length; ++srcIndex ){
            let trgIndex = this.boneMap.idxMap[ srcIndex ];
            if( trgIndex < 0 ){ // not mapped, cannot precompute
                left[ srcIndex ] = null;
                right[ srcIndex ] = null;
                continue;
            }

            let resultQuat = new THREE.Quaternion(0,0,0,1);
            resultQuat.copy( this.trgBindPose.transformsWorld[ trgIndex ].q ); // trgWorld
            if ( this.trgBindPose.transformsWorldEmbedded ) { resultQuat.premultiply( this.trgBindPose.transformsWorldEmbedded.forward.q ); } // trgEmbedded
            if ( this.srcBindPose.transformsWorldEmbedded ) { resultQuat.premultiply( this.srcBindPose.transformsWorldEmbedded.inverse.q ); } // invSrcEmbedded
            resultQuat.premultiply( this.srcBindPose.transformsWorldInverses[ srcIndex ].q ); // invSrcWorld
            right[ srcIndex ] = resultQuat;

            resultQuat = new THREE.Quaternion(0,0,0,1);
            // srcWorldParent
            if ( this.srcBindPose.bones[ srcIndex ].parent ){ 
                let parentIdx = this.srcBindPose.parentIndices[ srcIndex ];
                resultQuat.premultiply( this.srcBindPose.transformsWorld[ parentIdx ].q ); 
            }

            if ( this.srcBindPose.transformsWorldEmbedded ) { resultQuat.premultiply( this.srcBindPose.transformsWorldEmbedded.forward.q ); } // srcEmbedded
            if ( this.trgBindPose.transformsWorldEmbedded ) { resultQuat.premultiply( this.trgBindPose.transformsWorldEmbedded.inverse.q ); } // invTrgEmbedded

            // invTrgWorldParent
            if ( this.trgBindPose.bones[ trgIndex ].parent ){ 
                let parentIdx = this.trgBindPose.parentIndices[ trgIndex ];
                resultQuat.premultiply( this.trgBindPose.transformsWorldInverses[ parentIdx ].q ); 
            } 
            left[ srcIndex ] = resultQuat
        }
        
        return { left: left, right: right };
    }

    /**
     * retargets the bone specified
     * @param {int} srcIndex MUST be a valid MAPPED bone. Otherwise it crashes
     * @param {THREE.Quaternion} srcLocalQuat 
     * @param {THREE.Quaternion} resultQuat if null, a new THREE.Quaternion is created
     * @returns resultQuat
     */
    _retargetQuaternion( srcIndex, srcLocalQuat, resultQuat = null ){
        if ( !resultQuat ){ resultQuat = new THREE.Quaternion(0,0,0,1); }
        //BASIC ALGORITHM --> trglocal = invTrgWorldParent * srcWorldParent * srcLocal * invSrcWorld * trgWorld
        // trglocal = invTrgWorldParent * invTrgEmbedded * srcEmbedded * srcWorldParent * srcLocal * invSrcWorld * invSrcEmbedded * trgEmbedded * trgWorld
        
        // In this order because resultQuat and srcLocalQuat might be the same Quaternion instance
        resultQuat.copy( srcLocalQuat ); // srcLocal
        resultQuat.premultiply( this.precomputedQuats.left[ srcIndex ] ); // invTrgWorldParent * invTrgEmbedded * srcEmbedded * srcWorldParent
        resultQuat.multiply( this.precomputedQuats.right[ srcIndex ] ); // invSrcWorld * invSrcEmbedded * trgEmbedded * trgWorld
        return resultQuat;
    }

    /**
     * Retargets the current whole (mapped) skeleton pose.
     * Currently, only quaternions are retargeted 
     */
    retargetPose(){      
        let m = this.boneMap.idxMap;
        for ( let i = 0; i < m.length; ++i ){
            if ( m[i] < 0 ){ continue; }
            this._retargetQuaternion( i, this.srcSkeleton.bones[ i ].quaternion, this.trgSkeleton.bones[ m[i] ].quaternion );
        }
    }

    /**
     * NOT IMPLEMENTED
     * assumes srcTrack IS a position track (VectorKeyframeTrack) with the proper values array and name (boneName.scale) 
     * @param {THREE.VectorKeyframeTrack} srcTrack 
     * @returns {THREE.VectorKeyframeTrack}
     */
    retargetPositionTrack( srcTrack ){
        let boneName = srcTrack.name.slice(0, srcTrack.name.length - 9 ); // remove the ".position"
        let boneIndex = findIndexOfBoneByName( this.srcSkeleton, boneName );
        if ( boneIndex < 0 || this.boneMap.idxMap[ boneIndex ] < 0 ){
            return null;
        } 
        // TODO

        // TODO missing interpolation mode. Assuming always linear. Also check if arrays are copied or referenced
        return new THREE.VectorKeyframeTrack( this.boneMap.nameMap[ boneName ] + ".position", srcTrack.times, srcTrack.values ); 
    }
    
    /**
     * assumes srcTrack IS a quaternion track with the proper values array and name (boneName.quaternion) 
     * @param {THREE.QuaternionKeyframeTrack} srcTrack 
     * @returns {THREE.QuaternionKeyframeTrack}
     */
    retargetQuaternionTrack( srcTrack ){
        let boneName = srcTrack.name.slice(0, srcTrack.name.length - 11 ); // remove the ".quaternion"
        let boneIndex = findIndexOfBoneByName( this.srcSkeleton, boneName );
        if ( boneIndex < 0 || this.boneMap.idxMap[ boneIndex ] < 0 ){
            return null;
        } 

        let quat = new THREE.Quaternion( 0,0,0,1 );
        let srcValues = srcTrack.values;
        let trgValues = new Float32Array( srcValues.length );
        for( let i = 0; i < srcValues.length; i+=4 ){
            quat.set( srcValues[i], srcValues[i+1], srcValues[i+2], srcValues[i+3] );
            this._retargetQuaternion( boneIndex, quat, quat );
            trgValues[i] = quat.x;
            trgValues[i+1] = quat.y;
            trgValues[i+2] = quat.z;
            trgValues[i+3] = quat.w;
        }

        // TODO missing interpolation mode. Assuming always linear
        return new THREE.QuaternionKeyframeTrack( this.boneMap.nameMap[ boneName ] + ".quaternion", srcTrack.times, trgValues ); 
    }

    /**
     * NOT IMPLEMENTEED
     * assumes srcTrack IS a scale track (VectorKeyframeTrack) with the proper values array and name (boneName.scale) 
     * @param {THREE.VectorKeyframeTrack} srcTrack 
     * @returns {THREE.VectorKeyframeTrack}
     */
    retargetScaleTrack( srcTrack ){
        let boneName = srcTrack.name.slice(0, srcTrack.name.length - 6 ); // remove the ".scale"
        let boneIndex = findIndexOfBoneByName( this.srcSkeleton, boneName );
        if ( boneIndex < 0 || this.boneMap.idxMap[ boneIndex ] < 0 ){
            return null;
        } 
        // TODO

        // TODO missing interpolation mode. Assuming always linear. Also check if arrays are copied or referenced
        return new THREE.VectorKeyframeTrack( this.boneMap.nameMap[ boneName ] + ".scale", srcTrack.times, srcTrack.values ); 
    }

    /**
     * Given a clip, all tracks with a mapped bone are retargeted.
     * Currently only quaternions are retargeted
     * @param {THREE.AnimationClip} anim 
     * @returns {THREE.AnimationClip}
     */
    retargetAnimation( anim ){
        let trgTracks = [];
        let srcTracks = anim.tracks;
        for( let i = 0; i < srcTracks.length; ++i ){
            let t = srcTracks[i];
            let newTrack = null;
            if ( t.name.endsWith( ".position" ) ){ newTrack = this.retargetPositionTrack( t ); } // ignore for now
            else if ( t.name.endsWith( ".quaternion" ) ){ newTrack = this.retargetQuaternionTrack( t ); }
            else if ( t.name.endsWith( ".scale" ) ){ newTrack = this.retargetScaleTrack( t ); } // ignore for now

            if ( newTrack ){ trgTracks.push( newTrack ); }
        } 

        // negative duration: automatically computes proper duration of animation based on tracks
        return new THREE.AnimationClip( anim.name, -1, trgTracks, anim.blendMode ); 
    }
}

// ---- HELPERS ----
// should be moved into a "utils" file 

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

// sets bind quaternions only. Warning: Not the best function to call every frame.
function forceBindPoseQuats( skeleton, skipRoot = false ){
    let bones = skeleton.bones;
    let inverses = skeleton.boneInverses;
    if ( inverses.length < 1 ){ return; }
    let boneMat = inverses[0].clone(); 
    let _ignoreVec3 = new THREE.Vector3();
    for( let i = 0; i < bones.length; ++i ){
        boneMat.copy( inverses[i] ); // World to Local
        boneMat.invert(); // Local to World

        // get only the local matrix of the bone (root should not need any change)
        let parentIdx = findIndexOfBone( skeleton, bones[i].parent );
        if ( parentIdx > -1 ){ boneMat.premultiply( inverses[ parentIdx ] ); }
        else{
            if ( skipRoot ){ continue; }
        }
       
        boneMat.decompose( _ignoreVec3, bones[i].quaternion, _ignoreVec3 );
        // bones[i].quaternion.setFromRotationMatrix( boneMat );
        bones[i].quaternion.normalize(); 
    }
}

export { AnimationRetargeting, findIndexOfBone, findIndexOfBoneByName, forceBindPoseQuats };