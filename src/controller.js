import * as THREE from 'three';
import { BehaviourManager } from './libs/bml/BML.js'
import { CharacterController } from './libs/bml/CharacterController.js';

class BMLController {

    constructor(currentCharacter, config) {
        
        let ECAcontroller = this.ECAcontroller = new CharacterController( {character: currentCharacter.model, characterConfig: config} );
        ECAcontroller.start({autoblink: false});
        ECAcontroller.reset();
    
        
        this.bmlManager = new BehaviourManager();
        // Update in first iteration
        if(!currentCharacter.morphTargets)
            console.warn("No morph targets to attach Controller!");
        
        this.skinnedMeshes = currentCharacter.skinnedMeshes;
        this.morphTargetDictionary = currentCharacter.morphTargets;
        this.morphTargets = [];
        this.morphTargets.length = Object.keys(this.morphTargetDictionary).length; 
    }

    updateBlendShapes( dt ) { //TO DO: Remove?
         // FacialExpr lexemes
         for (let k = 0; k < this.lexemes.length; k++) {
            let lexeme = this.lexemes[k];
            if (lexeme.transition) {
                lexeme.updateLexemesBSW(dt);
                // accumulate blendshape values
                for (let i = 0; i < lexeme.indicesLex.length; i++) {
                    for (let j = 0; j < lexeme.indicesLex[i].length; j++) {
                        let value = lexeme.currentLexBSW[i][j];
                        let index = lexeme.indicesLex[i][j];
                        this.morphTargets[index] += value; // denominator of biased average
                    }
                }
            }

            // remove lexeme if finished
            if (lexeme && !lexeme.transition) {
                this.lexemes.splice(k, 1);
                --k;
            }
        }
             
    }

    createAnimationFromBML(scriptAnimation, framerate = 30) {

        if(!scriptAnimation || !this.ECAcontroller)
            return;
        
        // Convert each internal action clip to readable ECA controller BML json format
        let json = { faceLexeme: [], gaze: [], head: [], gesture: [], speech: [], control: "0"};

        for(let i = 0; i < scriptAnimation.tracks.length; i++) {

            let track = scriptAnimation.tracks[i];
            if(!track.active) {
                continue;
            }

            for(let j = 0; j < track.clips.length; j++){                
                
                let data = ANIM.clipToJSON( scriptAnimation.tracks[i].clips[j] );
                if(data)
                {
                    data[3].end = data[3].end || data[3].start + data[3].duration;
                    if(data[3].type == "glossa") {
                        for(let actions in json) {
                            if(data[3][actions])
                                json[actions] = json[actions].concat(data[3][actions]);
                        }
                    }
                    else {
                        json[data[3].type].push( data[3] );
                    }
                }           
            }
        }    

        // Send BML instructions to character controller to apply them
        this.ECAcontroller.reset();
        this.ECAcontroller.time = 0;
        this.ECAcontroller.processMsg(json);
        
        // Manage bml blocks sync
        let dt = 1.0 / framerate;
        let times = [];
        let values = {};
        let transformations = {};

        for(let time = 0; time < scriptAnimation.duration; time+= dt){
            
            times.push(time);
            this.ECAcontroller.update(dt, time);

            // Get computed BS weights
            for(let skinnedMesh in this.morphTargetDictionary) {
                if ( !this.ECAcontroller.facialController._morphTargets[skinnedMesh] ){ // mesh not mapped in the config
                    continue;
                }
                if(!values[skinnedMesh]){
                    values[skinnedMesh] = [];
                }
                let bs = this.ECAcontroller.facialController._morphTargets[skinnedMesh].morphTargetInfluences.slice();
                values[skinnedMesh].push(bs);
            }

            // Get computed position and rotation of each bone
            this.ECAcontroller.bodyController.skeleton.bones.map( x => {
                if(!transformations[x.name]) 
                    transformations[x.name] = { position:[], quaternion:[] }; 
                transformations[x.name].position = transformations[x.name].position.concat( x.position.toArray() );
                transformations[x.name].quaternion = transformations[x.name].quaternion.concat( x.quaternion.toArray() )
            });
        }

        let tracks = [];
        
        if(scriptAnimation.duration || scriptAnimation.tracks.length) {
            // Create threejs tracks for computed bs weights by character controller
            for(let skinnedMesh in this.morphTargetDictionary) {              
                if(!values[skinnedMesh]) {
                    continue
                }

                for(let morph in this.morphTargetDictionary[skinnedMesh]){
                    let morphIdx = this.morphTargetDictionary[skinnedMesh][morph];
                    let v = new Float32Array( values[skinnedMesh].length );
                    
                    values[skinnedMesh].forEach( (element,timeIdx) => {
                        v[timeIdx] = element[morphIdx];
                    });
                    const mesh = this.skinnedMeshes[skinnedMesh];
                    
                    tracks.push(new THREE.NumberKeyframeTrack(mesh.name + '.morphTargetInfluences['+ morph +']', times, v));                
                }
            }
            // Create threejs tracks for computed bones' positions and rotations by character controller
            for(let bone in transformations) {           
                tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, transformations[bone].quaternion));      
            }
        }    
           
        // Create threejs animation clip from created tracks
        const animation = new THREE.AnimationClip(scriptAnimation.id, scriptAnimation.duration, tracks);
        console.log(animation);
              
        return animation;
    }
    
    reset() {
  
        for(let mesh of this.skinnedMeshes)
        {
            mesh.morphTargetInfluences.fill(0);
        }

        this.editor.skeletonHelper.skeleton.pose()
    }
    //on update values on gui inspector
    onGUI() {

        this.updateBlendShapes();
        this.updateTracks();
    }
    
};

export { BMLController };