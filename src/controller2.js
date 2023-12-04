import * as THREE from 'three';
import { BehaviourManager } from './libs/bml/BML.js'
import { CharacterController } from './libs/bml/CharacterController.js';

class BMLController {

    constructor(editor, skinnedMeshes, morphTargetDictionary) {

        if(!editor)
        throw("No editor to attach Controller!");

        this.undoSteps = [];

        this.editor = editor;
        fetch( "src/libs/bml/EvaHandsEyesFixedConfig.json" ).then(response => response.text()).then( (text) =>{
            let config = JSON.parse( text );
            let ECAcontroller = this.ECAcontroller = new CharacterController( {character: editor.scene.getObjectByName(editor.character), characterConfig: config} );
            ECAcontroller.start();
            ECAcontroller.reset();
            this.updateTracks();
        })
        
        this.bmlManager = new BehaviourManager();
        // Update in first iteration
        this.mustUpdate = false; //true; 
        if(!editor.morphTargets)
            console.warn("No morph targets to attach Controller!");
        
        this.skinnedMeshes = skinnedMeshes;
        this.morphTargetDictionary = morphTargetDictionary;
        this.morphDictionary = editor.morphTargets;
        this.morphTargets = [];
        this.morphTargets.length = Object.keys(this.morphDictionary).length; 

    }

    begin(timeline) {
        
        this.bindEvents(timeline);
    
        this.updateTracks();

    }

    stop() {

    }

    bindEvents(timeline) {

        this.timeline = timeline || this.editor.activeTimeline;
        if(!timeline)
            return;

        let canvas = this.timeline.canvas;
        if(!canvas)
            canvas = this.editor.activeTimeline.canvas;

        canvas.onkeyup = (e) => {

            switch ( e.key ) {

                case 'z' : case 'Z':
                    if(e.ctrlKey){

                        if(!this.undoSteps.length)
                            return;
                        
                        const step = this.undoSteps.pop();
                        for ( let i = 0; i < step.length; ++i){
                           //undo step
                        }
                        //update timeline
                        
                    }
                    break;
            }

        };
    }

    update(state, dt) {

        //if(state) this.updateBlendShapes(dt);

    }

    updateBlendShapes( dt ) {
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

    updateTracks(trackIdx) {

        let timeline = this.timeline || this.editor.activeTimeline;
        if(!timeline.animationClip || !this.ECAcontroller)
            return;
        
        this.ECAcontroller.reset();

        //convert each clip to BML json format
        let json = { faceLexeme: [], gaze: [], head: [], gesture: [], speech: [], control: "0"};

        for(let i = 0; i < timeline.animationClip.tracks.length; i++){
            let track = timeline.animationClip.tracks[i];
            for(let j = 0; j < track.clips.length; j++){
                let clip = track.clips[j];
                
                    var data = ANIM.clipToJSON( timeline.animationClip.tracks[i].clips[j] );
                    if(data)
                    {
                        data[3].end = data[3].end || data[3].start + data[3].duration;
                        if(data[3].type == "glossa") {
                            for(let actions in json) {
                                if(data[3][actions])
                                    json[actions] = [...json[actions], ...data[3][actions]];
                            }
                        }
                        else
                            json[data[3].type].push( data[3] );
                    }
            
               
            }
        }    

        //send bml instructions to character controller to apply them
        this.ECAcontroller.time = 0;
        this.ECAcontroller.processMsg(json);
        this.lexemes = [];

        //manage bml blocks sync
        let dt = 1.0/timeline.framerate;
        let times = [];
        let values = {};
        let transformations = {};

        for(let time = 0; time < timeline.duration; time+= dt){
            times.push(time);

            this.ECAcontroller.update(dt, time);

            //get computed bs weights
            for(let skinnedMesh in this.morphDictionary) {
                let bs = [];
                this.ECAcontroller.facialController._morphTargets[skinnedMesh].morphTargetInfluences.map( x => bs.push(x));
                if(!values[skinnedMesh])
                    values[skinnedMesh] = [];
                values[skinnedMesh].push(bs);
            }
            //get computed position and rotation of each bone
            this.ECAcontroller.bodyController.skeleton.bones.map( x => {
                if(!transformations[x.name]) 
                    transformations[x.name] = { position:[], quaternion:[] }; 
                transformations[x.name].position = transformations[x.name].position.concat( x.position.toArray() );
                transformations[x.name].quaternion = transformations[x.name].quaternion.concat( x.quaternion.toArray() )
            });
        }

        let tracks = [];

        //create clip animation from computed weights, positions and rotations by character controller

        //convert blendshapes' weights to animation clip
        for(let skinnedMesh in this.morphDictionary) {
        
            for(let morph in this.morphDictionary[skinnedMesh]){
                let i = this.morphDictionary[skinnedMesh][morph];
                let v = [];
                if(!values[skinnedMesh]) {
                    console.error("Character skinned mesh not found:", skinnedMesh);
                    continue
                }
                
                values[skinnedMesh].forEach(element => {
                    v.push(element[i]);
                });
                const mesh = this.skinnedMeshes[skinnedMesh];
                
                tracks.push(new THREE.NumberKeyframeTrack(mesh.name + '.morphTargetInfluences['+ morph +']', times, v));                
                
            }
        }

        //concatenate skeletal animation tracks to blendshapes tracks
        for(let bone in transformations) {
           
            tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, transformations[bone].quaternion));      
        }
       
        //set current animation to the model
        this.editor.animation = new THREE.AnimationClip("nmf", timeline.duration, tracks);
        console.log(this.editor.animation )
      
        if(this.onUpdateTracks)
            this.onUpdateTracks();

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