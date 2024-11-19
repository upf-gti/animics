import * as THREE from 'three';
import { ShaderChunk } from "./utils.js";
import { TransformControls } from './controls/TransformControls.js';
import { CCDIKSolver, FABRIKSolver } from "./IKSolver.js"
import { IKHelper } from "./IKHelper.js"


let DEG2RAD = Math.PI / 180;
let RAD2DEG = 180 / Math.PI;

class Gizmo {

    constructor(editor) {

        if(!editor)
        throw("No editor to attach Gizmo!");

        this.raycastEnabled = true;
        this.undoSteps = [];

        let transform = new TransformControls( editor.camera, editor.renderer.domElement );
        window.trans = transform;
        transform.setSpace( 'local' );
        transform.setMode( 'rotate' );

        transform.addEventListener( 'objectChange', e => {
            if(this.selectedBone != null) {    
                this.updateBones();
            }
        });

        transform.addEventListener( 'mouseUp', e => {
            if(this.selectedBone === null || this.selectedBone === undefined){
                return;
            }
            this.updateTracks();
            const bone = this.skeleton.bones[this.selectedBone] ? this.skeleton.bones[this.selectedBone].name : "";
            this.editor.gui.updateSkeletonPanel({itemSelected: bone});
        } );

        transform.addEventListener( 'dragging-changed', e => {
            const enabled = e.value;
            this.editor.controls.enabled = !enabled;
            this.raycastEnabled = !enabled;//!this.raycastEnabled;
            
            this.mustUpdate = enabled;
            
            if(this.selectedBone === null || this.selectedBone === undefined){
                return;
            }

            if(enabled) {
                if ( this.toolSelected == Gizmo.Tools.IK ){
                    if ( !this.ikSelectedChain ){
                        return; 
                    }
       
                    let step = [];
                    let chain = this.ikSelectedChain.chain;
                    for ( let i = 1; i < chain.length; ++i){ // effector does not change
                        const bone = this.skeleton.bones[chain[i]];
                        step.push( {
                            boneId: chain[i],
                            pos: bone.position.toArray(),
                            quat: bone.quaternion.toArray(),
                        } );
                    }
                    if ( step.length > 0 ){                      
                        this.undoSteps.push( step );
                    }
                }else{
                    const bone = this.skeleton.bones[this.selectedBone];
            
                    this.undoSteps.push( [ {
                        boneId: this.selectedBone,
                        pos: bone.position.toArray(),
                        quat: bone.quaternion.toArray(),
                    } ] );
                }
            }
        });

        let scene = editor.scene;
        scene.add( transform );

        this.camera = editor.camera;
        this.scene = scene;
        this.transform = transform;
		this.raycaster = null;
        this.skeleton = null;
        this.selectedBone = null;
        this.bonePoints = null;
        this.editor = editor;

        //ik tool 
        this.ikSelectedChain = null;
        this.ikTarget = null;
        this.ikSolver = null;
        // this.ikHelper = null;
        this.ikMode = Gizmo.ToolIkModes.ONEBONE; // this.mode should be the one, but it is used for other purposes in the editor. So we need this variable.


        // propagation quats
        this.tempQuat0 = new THREE.Quaternion;
        this.tempQuat1 = new THREE.Quaternion;

        // Update in first iteration
        this.mustUpdate = false; //true; 

        this.toolSelected = Gizmo.Tools.JOINT;
        this.mode = "rotate";

        this.enabled = true;
    }

    begin(skeletonHelper) {
        
        //Change skeleton helper lines colors
        let colorArray = skeletonHelper.geometry.attributes.color.array;
        for(let i = 0; i < colorArray.length; i+=6) { 
            colorArray[i+3] = 58/256; 
            colorArray[i+4] = 161/256; 
            colorArray[i+5] = 156/256;
        }
        skeletonHelper.geometry.attributes.color.array = colorArray;
        skeletonHelper.material.linewidth = 3;

        this.skeleton = skeletonHelper.skeleton;
        this.ikInit();

        // point cloud for bones
        const pointsShaderMaterial = new THREE.ShaderMaterial( {
            uniforms: {
                color: { value: new THREE.Color( 0xffffff ) },
                pointTexture: { value: new THREE.TextureLoader().load( 'data/imgs/disc.png' ) },
                alphaTest: { value: 0.9 }
            },
            depthTest: false,
            vertexShader: ShaderChunk["Point"].vertexshader,
            fragmentShader: ShaderChunk["Point"].fragmentshader
        });

        
        let vertices = [];
        
        for(let bone of this.skeleton.bones) {
            let tempVec = new THREE.Vector3();
            bone.getWorldPosition(tempVec);
            vertices.push( tempVec );
        }
        
        this.selectedBone = vertices.length ? 0 : null;
        
        const geometry = new THREE.BufferGeometry();
        geometry.setFromPoints(vertices);
        
        const positionAttribute = geometry.getAttribute( 'position' );
        const size = 0.5;
        geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( new Array(positionAttribute.count).fill(size), 1 ) );

        this.bonePoints = new THREE.Points( geometry, pointsShaderMaterial );
        this.bonePoints.name = "GizmoPoints";
        this.bonePoints.renderOrder = 1;
        this.scene.remove(this.scene.getObjectByName("GizmoPoints"));
        this.scene.add( this.bonePoints );
        
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.05;
        
        this.bindEvents();
        
        // First update to get bones in place
        this.update(true, 0.0);

        if(this.selectedBone != null) 
            this.updateBoneColors();

    }

    ikInit() {
        this.ikTarget = new THREE.Object3D();
        this.ikTarget.name = "ikTarget";
        let scene = this.editor.scene;
        scene.add( this.ikTarget );

        this.ikSolver = new CCDIKSolver( this.skeleton );
        this.ikSolver.setIterations( 1 );
        this.ikSolver.setSquaredDistanceThreshold( 0.000001 );
        this.ikSolver.constraintsEnabler = false;

        // this.ikHelper = new IKHelper();
        // this.ikHelper.begin(this.ikSolver, scene);
        // this.ikHelper.setVisualisationScale( 2 );
        // this.ikHelper.setVisibilityFlags( IKHelper.VISIBILITYFLAGS.CONSTRAINTS );
        // window.ikSolver = this.ikSolver;
        // window.ikHelper = this.ikHelper;
        // window.addEventListener( "keydown", (e) => { if (e.key == "a"){ this.ikHelper.setVisibility( !this.ikHelper.visible ); }});


        this.ikSelectedChain = null;
        this._ikCreateChains( "LeftEye", "Head" );
        this._ikCreateChains( "RightEye", "Head" );
        this._ikCreateChains( "HeadTop_End", "Neck" );
        this._ikCreateChains( "Neck", "Spine" );        
        this._ikCreateChains( "LeftShoulder", "Spine" );
        this._ikCreateChains( "RightShoulder", "Spine" );
        this._ikCreateChains( "LeftHand", "LeftArm" ); //"LeftShoulder" );
        this._ikCreateChains( "RightHand", "RightArm" ); //"RightShoulder" );
        this._ikCreateChains( "LeftHandThumb4",  "LeftHand");
        this._ikCreateChains( "LeftHandIndex4",  "LeftHand");
        this._ikCreateChains( "LeftHandMiddle4", "LeftHand");
        this._ikCreateChains( "LeftHandRing4",   "LeftHand");
        this._ikCreateChains( "LeftHandPinky4",  "LeftHand");
        this._ikCreateChains( "RightHandThumb4",  "RightHand");
        this._ikCreateChains( "RightHandIndex4",  "RightHand");
        this._ikCreateChains( "RightHandMiddle4", "RightHand");
        this._ikCreateChains( "RightHandRing4",   "RightHand");
        this._ikCreateChains( "RightHandPinky4",  "RightHand");
        this._ikCreateChains( "LeftToe_End", "LeftUpLeg" );
        this._ikCreateChains( "RightToe_End", "RightUpLeg" );
        
        // TO DO: these chains could be removed. On update check if oneBone mode and manually compute the quaternion. IkSolver is not really needed
        for( let i = 0; i < this.skeleton.bones.length; ++i ){
            let b = this.skeleton.bones[i];
            if ( !b.parent || !b.parent.isBone ){
                continue;
            }
            this._ikCreateChains( b.name, b.parent.name, "OneBoneIK_" + b.name, false );
        }
        this.ikSolver.setChainEnablerAll( false );
    }

    _ikCreateChains( effectorName, rootName, chainName = null, ignoreSingleLinks = true ){
        let bones = this.skeleton.bones;
        let effector = this.skeleton.getBoneByName( effectorName );
        let root = this.skeleton.getBoneByName( rootName );
        
        if ( !effector ){ // find similarly named bone
            for ( let i= 0; i < bones.length; ++i ){
                if( bones[i].name.includes(effectorName) ){ 
                    effector = bones[i]; 
                    break;
                }
            } 
        }
        if ( !root ){ // bind similarly named bone
            for ( let i= 0; i < bones.length; ++i ){
                if( bones[i].name.includes(rootName) ){ 
                    root = bones[i]; 
                    break;
                }
            } 
        }
        if ( !effector || !root ){  return; }

        let chain = []
        let constraints = [];
        let bone = effector;
        while ( true ){
            let i = bones.indexOf( bone );
            if ( i < 0 ){ console.warn("IK chain: Skeleton root was reached before chain root "); break; }
            
            chain.push( i );

            // set constraints
        //     let sign = bone.name.includes("Left") ? 1 : (-1);

        //     if ( bone.name.includes("Shoulder") ){ // clavicula
        //         /*Left */ if ( sign > 0 ){ constraints.push({ type: 2, axis:[0,0,1], polar:[0, 35 * DEG2RAD ], azimuth:[60 * DEG2RAD, 180 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } );  }
        //         /*Right*/ else{ constraints.push({ type: 2, axis:[0,0,1], polar:[0, 35 * DEG2RAD ], azimuth:[ 0 * DEG2RAD, 120 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); }
        //     }
        //     else if ( bone.name.includes("ForeArm") ){ // forearm/elbow
        //         constraints.push({ type: 1, axis:[1, sign * 1,0], min: (30 * DEG2RAD), max: (180 * DEG2RAD), twist:[290 * DEG2RAD, 90 * DEG2RAD] } );
        //     }
        //     else if( bone.name.includes("Arm") ){ // actual shoulder
        //         constraints.push({ type: 2, axis:[ sign * (-0.9),-0.8,1], polar:[0, 80 * DEG2RAD ], azimuth:[ 0 * DEG2RAD, 359.999 * DEG2RAD], twist:[-90 * DEG2RAD, 45 * DEG2RAD] });
        //     }
        //     else if ( bone.name.includes("Pinky") || bone.name.includes("Ring") || bone.name.includes("Middle") || bone.name.includes("Index") ){
        //         if ( bone.name.includes("2") ){ constraints.push( { type: 1, axis:[-1,0,0], min: (240 * DEG2RAD), max: (360 * DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); }
        //         else{ constraints.push( { type: 1, axis:[-1,0,0], min: (270 * DEG2RAD), max: (360 * DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); }
        //     }
        //     else if ( bone.name.includes("Thumb") ){
        //         if ( bone.name.includes("1")){ constraints.push( { type: 1, axis:[-0.2, sign * (-1),0], min: (310 * DEG2RAD), max: ( 10* DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); }
        //         else{ constraints.push( { type: 1, axis:[-0.2, sign * (-1),0],  min: (280 * DEG2RAD), max: (360 * DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); }
        //     }
        //     else if ( bone.name.includes("Hand") ){ // fingers are tested before
        //         /*Left */ if ( sign > 0 ){ constraints.push( { type: 2, axis:[0,-1,0], polar:[25 * DEG2RAD, 155 * DEG2RAD], azimuth: [60 * DEG2RAD, 140 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] });}
        //         /*Right*/ else{ constraints.push( { type: 2, axis:[0,-1,0], polar:[25 * DEG2RAD, 155 * DEG2RAD], azimuth: [45 * DEG2RAD, 125 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] }); }
        //     }

        //     else if ( bone.name.includes("Head") ){ // headEnd will not have constraint. It is ignored during the createChain
        //         // set the same constraint space regardless of different bind bones
        //         if (effectorName.includes("Eye") ){ constraints.push( { type: 2, axis:[0,0.5,1], polar:[0, 60 * DEG2RAD ], azimuth:[185 * DEG2RAD, 345 * DEG2RAD], twist:[-45 * DEG2RAD, 45 * DEG2RAD] } );  }
        //         else{ constraints.push({ type: 2, axis:[0,0.5,1], polar:[0, 60 * DEG2RAD ], azimuth:[ 225 * DEG2RAD, 315 * DEG2RAD], twist:[-67 * DEG2RAD, 67 * DEG2RAD] } ); }
        //     }
        //     else if ( bone.name.includes("Neck") ){
        //         constraints.push({ type: 2, axis:[0,0.6,1], polar:[0, 68 * DEG2RAD ], azimuth:[ 210 * DEG2RAD, 330 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } );
        //     }
        //     else if( bone.name.includes("Spine") ){
        //         constraints.push({ type: 2, axis:[0,-0.2,1], polar:[0, 45 * DEG2RAD ], azimuth:[ 35 * DEG2RAD, 135 * DEG2RAD], twist:[-30 * DEG2RAD, 30 * DEG2RAD] } );
        //     }

        //     else if( bone.name.includes("UpLeg") ){ //leg-hip
        //         /*Left */ if ( sign > 0 ) { constraints.push( { type: 2, axis:[0,1,0], polar:[40 * DEG2RAD, 123 * DEG2RAD ], azimuth:[ 160 * DEG2RAD, 300 * DEG2RAD], twist:[-45 * DEG2RAD, 45 * DEG2RAD] } ); }
        //         /*Right*/ else { constraints.push({ type: 2, axis:[-1,0.7,0], polar:[40 * DEG2RAD, 123 * DEG2RAD ], azimuth:[ -30 * DEG2RAD, 112 * DEG2RAD], twist:[-45 * DEG2RAD, 45 * DEG2RAD] } ); }
        //     }
        //     else if( bone.name.includes("Leg") ){ // knee
        //         constraints.push({ type: 1, axis:[1,0,0], min: (40 * DEG2RAD), max: (180 * DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); 
        //     }
        //     else if (bone.name.includes("Foot") ){ // ankle
        //         constraints.push({ type: 2, axis:[0,-1,0], polar:[35 * DEG2RAD, 116 * DEG2RAD ], azimuth:[ 62 * DEG2RAD, 115 * DEG2RAD], twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } );   
        //     }
        //     else if (bone.name.includes("ToeBase") ){ // toe articulation
        //         constraints.push({ type: 1, axis:[1,0,0], min: (145 * DEG2RAD), max: (190 * DEG2RAD), twist:[0 * DEG2RAD, 0.001 * DEG2RAD] } ); 
        //     }
        //     else{
        //         constraints.push(null);
        //     }

            if ( bone == root ){ break; }
            bone = bone.parent;
        }

        effector = bones[ chain[0] ];
        // constraints[0] = null;
        while ( effector != root ){
            let name = chainName ?? effector.name;
            if ( ignoreSingleLinks && chain.length < 3 ){ break; } // do not include 2 joint chains (1 bone ik)
            if( ! this.ikSolver.getChain( name ) ){
                this.ikSolver.createChain( chain, constraints, this.ikTarget, name );
            }
            chain.splice(0,1);
            //constraints.splice(0,1);
            effector = bones[ chain[0] ];
        }
    }

    ikSetTargetToBone (){
        if( !this.ikSelectedChain ){ return; }
        this.skeleton.bones[ this.selectedBone ].updateMatrixWorld();
        this.skeleton.bones[ this.selectedBone ].parent.updateMatrixWorld();
        this.skeleton.bones[ this.selectedBone ].getWorldPosition( this.ikTarget.position );
    }
    
    ikSetBone( boneIdx ){
        this.ikSolver.setChainEnablerAll( false );
        this.transform.detach();
        this.ikSelectedChain = null;
        
        let chainName = this.skeleton.bones[ boneIdx ].name;
        let enabled = false;

        if ( this.ikMode == Gizmo.ToolIkModes.LARGECHAIN ){
            enabled = this.ikSolver.setChainEnabler( chainName, true );
        } 
        else { // Gizmo.ToolIkModes.ONEBONE
            chainName = "OneBoneIK_" + chainName;
            enabled = this.ikSolver.setChainEnabler( chainName, true );
        }
        
        if ( !enabled ){
            return false;
        }

        this.ikSelectedChain = this.ikSolver.getChain( chainName );

        this.ikSetTargetToBone();
        this.transform.attach( this.ikTarget );
        return true;
    }

    ikStop() {
        this.ikSelectedChain = null;
    }

    hasBoneIkChain( bone, mode ){
        if ( !this.ikSolver ) { return false; }

        if ( mode == Gizmo.ToolIkModes.LARGECHAIN ){
            return !!this.ikSolver.getChain( bone.name );
        }
        
        //( mode == Gizmo.ToolIkModes.ONEBONE ){
        return !!this.ikSolver.getChain( "OneBoneIK_" + bone.name );
    }

    stop() {
        this.transform.detach();
        this.ikStop();
    }

    bindEvents() {

        if(!this.skeleton)
            throw("No skeleton");

        let transform = this.transform;
        let timeline = this.editor.gui.keyFramesTimeline;

        const canvas = document.getElementById("webgl-canvas");

        canvas.addEventListener( 'mousemove', e => {

            if(!this.bonePoints || this.editor.state)
            return;

            const pointer = new THREE.Vector2(( e.offsetX / canvas.clientWidth ) * 2 - 1, -( e.offsetY / canvas.clientHeight ) * 2 + 1);
            this.raycaster.setFromCamera(pointer, this.camera);
            const intersections = this.raycaster.intersectObject( this.bonePoints );
            canvas.style.cursor = intersections.length ? "crosshair" : "default";
        });

        canvas.addEventListener( 'pointerdown', e => {

            if(!this.enabled || e.button != 0 || !this.bonePoints || this.editor.state || (!this.raycastEnabled && !e.ctrlKey))
            return;

            const pointer = new THREE.Vector2(( e.offsetX / canvas.clientWidth ) * 2 - 1, -( e.offsetY / canvas.clientHeight ) * 2 + 1);
            this.raycaster.setFromCamera(pointer, this.camera);
            const intersections = this.raycaster.intersectObject( this.bonePoints );
            if(!intersections.length)
                return;

            const intersection = intersections.length > 0 ? intersections[ 0 ] : null;

            if(intersection) {
                this._setBoneById( intersection.index );
                
                let boneName = this.skeleton.bones[this.selectedBone].name;
                this.editor.gui.onSelectItem(boneName);
            }
        });

        canvas.addEventListener( 'keydown', e => {

            switch ( e.key ) {

                case 'q':
                    transform.setSpace( transform.space === 'local' ? 'world' : 'local' );
                    this.editor.gui.updateSkeletonPanel();
                    break;

                case 'Shift':
                    transform.setTranslationSnap( this.editor.defaultTranslationSnapValue );
                    transform.setRotationSnap( THREE.MathUtils.degToRad( this.editor.defaultRotationSnapValue ) );
                    break;

                case 'w':
                    const bone = this.skeleton.bones[this.selectedBone];
                    if(timeline.getNumTracks(bone) < 2) // only rotation
                        return;
                    this.setTool( Gizmo.Tools.JOINT );
                    this.setMode( "translate" );
                    this.editor.gui.updateSkeletonPanel();
                    break;

                case 'e':
                    this.setTool( Gizmo.Tools.JOINT );
                    this.setMode( "rotate" );
                    this.editor.gui.updateSkeletonPanel();
                    break;

                case 'r':
                    this.setTool( Gizmo.Tools.IK );
                    this.editor.gui.updateSkeletonPanel();
                    break;
    
                // case 'x':
                //     transform.showX = ! transform.showX;
                //     break;

                // case 'y':
                //     transform.showY = ! transform.showY;
                //     break;

                case 'z':
                    if(e.ctrlKey && this.editor.mode != this.editor.editionModes.SCRIPT){

                        if(!this.undoSteps.length)
                            return;
                        
                        const step = this.undoSteps.pop();
                        for ( let i = 0; i < step.length; ++i){
                            let bone = this.skeleton.bones[step[i].boneId];
                            bone.position.fromArray( step[i].pos );
                            bone.quaternion.fromArray( step[i].quat );
                        }
                        this.updateBones();
                        if ( this.toolSelected == Gizmo.Tools.IK ){ // reset target position
                            this.ikSetTargetToBone( );
                        }
                        this.updateTracks(); // commit results into timeline with propagation
                    }
                    // else{
                    //     transform.showZ = ! transform.showZ;
                    // }
                    break;
            }

        });

        window.addEventListener( 'keyup', function ( event ) {

            switch ( event.key ) {

                case 'Shift': // Shift
                    transform.setTranslationSnap( null );
                    transform.setRotationSnap( null );
                    break;
            }
        });
    }
    
    enable ( ) {
        this.enabled = true;
    }

    disable ( ) {
        this.enabled = false;
        this.stop();
    }

    update(state, dt) {

        if(!this.enabled) return;
        if(state) this.updateBones(dt);

        //this.ikHelper.update();

        if(this.selectedBone == null ){ return; }
        
        if ( !this.mustUpdate ){
            if ( this.toolSelected == Gizmo.Tools.IK ){ // make target follow bone when not directly using it
                this.ikSetTargetToBone();
            }
            return;
        }

        if ( this.ikSelectedChain ){
            this.ikSolver.update(); 
            this.updateBones();
        }
        //this.transform.attach( this.skeletonHelper.bones[this.selectedBone] );
        //this.mustUpdate = false; 
    }

    updateBones( ) {

        if(!this.bonePoints)
            return;

        let vertices = [];

        this.skeleton.bones[0].updateWorldMatrix(true, true); // update every bone's world matrix just once

        for(let bone of this.skeleton.bones) {
            let wpos = new THREE.Vector3();
            wpos.setFromMatrixPosition( bone.matrixWorld );
            vertices.push( wpos );
        }

        this.bonePoints.geometry.setFromPoints(vertices);
        this.bonePoints.geometry.computeBoundingSphere();
    }

    updateBoneColors() {
        const geometry = this.bonePoints.geometry;
        const positionAttribute = geometry.getAttribute( 'position' );
        const colors = [];
        const color = new THREE.Color(0x364964); // new THREE.Color(0.9, 0.9, 0.3);
        const colorSelected = new THREE.Color(0x5f88c9);

        for ( let i = 0, l = positionAttribute.count; i < l; i ++ ) {
            (i != this.selectedBone ? color : colorSelected).toArray( colors, i * 3 );
        }

        geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
    }


    /**
     * propagates the delta change across the neighbouring keyframes, using the editor.gui.propagationWindow attributes
     * It does not change the keyframe's value
     * @param {obj} track 
     * @param {int} keyframe 
     * @param {quat || vec3} delta 
     */
    propagateEdition( track, keyframe, delta ){
        const propWindow = this.editor.gui.propagationWindow;
        const keyframeTime = track.times[keyframe];
       
        for( let i = keyframe - 1; i > -1; --i ){
            if( track.times[i] < keyframeTime-propWindow.leftSide ){ break; }
            track.dim == 4 ?
                this._applyDeltaQuaternion( track, i, delta,  1-(keyframeTime - track.times[i])/propWindow.leftSide ) :
                this._applyDeltaPosition( track, i, delta,  1-(keyframeTime - track.times[i])/propWindow.leftSide );
        }
        for( let i = keyframe + 1; i < track.times.length; ++i ){
            if( track.times[i] > keyframeTime+propWindow.rightSide ){ break; }
            track.dim == 4 ? 
                this._applyDeltaQuaternion( track, i, delta,  1-(track.times[i]- keyframeTime)/propWindow.rightSide ) :
                this._applyDeltaPosition( track, i, delta,  1-(track.times[i]- keyframeTime)/propWindow.rightSide );
        }
    }
  
    _applyDeltaQuaternion( track, keyframe, delta, t ){
        const dim = track.dim;
        const newDelta = this.tempQuat0;
        const source = this.tempQuat1;

        // nlerp( {0,0,0,1}, deltaQuat, t )
        let neighbourhood = delta.w < 0 ? -1 : 1;
        newDelta.x = neighbourhood * delta.x * t;
        newDelta.y = neighbourhood * delta.y * t;
        newDelta.z = neighbourhood * delta.z * t;
        newDelta.w = (1-t) + neighbourhood * delta.w * t;
        newDelta.normalize();

        source.set(track.values[keyframe * dim], track.values[keyframe * dim + 1], track.values[keyframe * dim + 2], track.values[keyframe * dim + 3]);
        source.premultiply( newDelta );

        // write result
        track.values[keyframe * dim] = source.x;
        track.values[keyframe * dim+1] = source.y;
        track.values[keyframe * dim+2] = source.z;
        track.values[keyframe * dim+3] = source.w;
        track.edited[keyframe] = true;
    }

    _applyDeltaPosition( track, keyframe, delta, t ){
        track.values[keyframe*track.dim] += delta.x * t;
        track.values[keyframe*track.dim+1] += delta.y * t;
        track.values[keyframe*track.dim+2] += delta.z * t;
        track.edited[keyframe] = true;
    }

    /**
     * Commits current selected bone changes with propagation (if enabled)
     * @returns 
     */
    updateTracks() {

        let timeline = this.editor.gui.keyFramesTimeline;
        let keyType = Gizmo.ModeToKeyType[ this.editor.getGizmoMode() ];

        if(timeline.getNumKeyFramesSelected() != 1)
            return;

        let [name, localTrackIndex, keyFrameIndex] = timeline.lastKeyFramesSelected[0];
        let track = timeline.getTrack(timeline.lastKeyFramesSelected[0]);

        // Don't store info if we are using wrong mode for that track
        if(keyType != track.type)
            return;

        if ( this.skeleton.bones[this.selectedBone].name != name ) { return; } 
        let bone = this.skeleton.bones[this.selectedBone]; 
        
       
        if ( this.toolSelected == Gizmo.Tools.IK ){
            if ( !this.ikSelectedChain ){ return; }
            
            const effectorFrameTime = this.editor.activeTimeline.animationClip.tracks[ track.clipIdx ].times[ keyFrameIndex ];
            const chain = this.ikSelectedChain.chain;
            const deltaQuaternion = new THREE.Quaternion();
            
            for( let i = 1; i < chain.length; ++i ){
                const boneToProcess = this.skeleton.bones[chain[i]];
                const quaternionTrackIdx = ( timeline.getNumTracks(boneToProcess) > 1 ) ? 1 : 0;
                
                const track = timeline.getTrack([boneToProcess.name, quaternionTrackIdx]);
                if ( track.dim != 4 ){ continue; } // only quaternions
                
                const tValues = track.values; 

                // find nearest frame or create one if too far
                let frame = timeline.getCurrentKeyFrame( track, effectorFrameTime, 0.008 );
                if ( frame == -1 ){ 
                    frame = timeline.addKeyFrame( track, boneToProcess.quaternion.toArray(), effectorFrameTime );

                    // compute source quaternion that will be used by deltaQuaternion later
                    if(this.editor.gui.propagationWindow.enabler && track.times.length > 1){
                        
                        let prevIdx = frame == 0 ? -1 : (frame-1);
                        let nextIdx = frame == (track.times.length-1) ? prevIdx : (frame+1);
                        if( prevIdx < 0 ){ prevIdx = nextIdx; }

                        this.tempQuat0.set( tValues[prevIdx*4], tValues[prevIdx*4+1], tValues[prevIdx*4+2], tValues[prevIdx*4+3] );
                        this.tempQuat1.set( tValues[nextIdx*4], tValues[nextIdx*4+1], tValues[nextIdx*4+2], tValues[nextIdx*4+3] );
                        let t = prevIdx == nextIdx ? 
                                    1 : 
                                    (effectorFrameTime - track.times[prevIdx]) / (track.times[nextIdx]- track.times[nextIdx]);
                        nlerpQuats(deltaQuaternion, this.tempQuat0, this.tempQuat1, t ); // returns approx source value
                    }
                }
                else{ 
                    const start = 4 * frame;
                    deltaQuaternion.set( tValues[start], tValues[start+1], tValues[start+2], tValues[start+3] ); // source value
                    tValues[start] =  boneToProcess.quaternion.x;
                    tValues[start+1] =boneToProcess.quaternion.y;
                    tValues[start+2] =boneToProcess.quaternion.z;
                    tValues[start+3] =boneToProcess.quaternion.w;
                }
                
                track.edited[ frame ] = true;
                                
                if( this.editor.gui.propagationWindow.enabler ){ 
                    deltaQuaternion.invert(); // invert source value
                    deltaQuaternion.premultiply( boneToProcess.quaternion );  // deltaQuat = newQuat * inv(sourceQuat) = deltaQuat * sourceQuat * inv(sourceQuat) 
                    this.propagateEdition(track, frame, deltaQuaternion);
                }

                // Update animation interpolants
                this.editor.updateAnimationAction(this.editor.activeTimeline.animationClip, track.clipIdx );
            }
        }
        else{
            let start = track.dim * keyFrameIndex;
            let values = bone[ track.type ].toArray();
    
            if(!values)
                return;
    
            track = this.editor.activeTimeline.animationClip.tracks[ track.clipIdx ];
            track.edited[ keyFrameIndex ] = true;

            const source = track.dim == 4 ? 
                            new THREE.Quaternion(track.values[start], track.values[start+1], track.values[start+2], track.values[start+3]) : 
                            new THREE.Vector3( track.values[start], track.values[start+1], track.values[start+2]);

            // supports position and quaternion types
            for( let i = 0; i < values.length; ++i ) {
                track.values[ start + i ] = values[i];
            }

            if( this.editor.gui.propagationWindow.enabler ){ 
                const delta = track.dim == 4 ? new THREE.Quaternion(values[0], values[1], values[2], values[3]) : new THREE.Vector3(values[0], values[1], values[2]);
                track.dim == 4 ? delta.multiply( source.invert() ) : delta.sub(source); 
                this.propagateEdition(track, keyFrameIndex, delta);
            }

            // Update animation interpolants
            this.editor.updateAnimationAction( this.editor.activeTimeline.animationClip, track.clipIdx );
        }

    }

    setBone( name ) {

        let bone = this.skeleton.getBoneByName(name);
        if(!bone) {
            console.warn("No bone with name " + name);
            return;
        }

        const boneId = this.skeleton.bones.findIndex((bone) => bone.name == name);
        if(boneId > -1){
            this._setBoneById( boneId );
        }
    }
    _setBoneById( boneId ){
        this.selectedBone = boneId;

        this.setTool( this.toolSelected ); // attach and prepare bone
        this.updateBoneColors();
    }

    setMode( mode ) {
        if ( this.toolSelected == Gizmo.Tools.JOINT ){ 
            this.mode = mode;
            this.transform.setMode( mode );
            return true;
        }

        if ( this.toolSelected == Gizmo.Tools.IK ){ 
            this.mode = "rotate";
            this.ikMode = mode; 
            this.transform.setMode( "translate" ); // ik moves target, but rotates joints
            return this.ikSetBone( this.selectedBone );
        }

        return false;
    }

    setSpace( space ) {
        this.transform.setSpace( space );
    }

    setTool( tool ){
        let lastTool = this.toolSelected;
        this.toolSelected = Gizmo.Tools.JOINT;

        let ikResult = false;
        if ( tool == Gizmo.Tools.IK ){
            this.toolSelected = Gizmo.Tools.IK;
            ikResult = this.setMode( lastTool != this.toolSelected ? Gizmo.ToolIkModes.ONEBONE : this.ikMode );
        }
        if ( !ikResult ){
            this.toolSelected = Gizmo.Tools.JOINT;
            this.ikStop();
            this.transform.attach( this.skeleton.bones[this.selectedBone] );
            this.setMode( lastTool != this.toolSelected ? "rotate" : this.mode );
        }
    }

    showOptions( inspector ) {
        inspector.addNumber( "Translation snap", this.editor.defaultTranslationSnapValue, (v) => {
            this.editor.defaultTranslationSnapValue = v;
            this.editor.updateGizmoSnap();
        }, { min: 0, max: 5, step: 0.01});
        inspector.addNumber( "Rotation snap", this.editor.defaultRotationSnapValue, (v) => {
            this.editor.defaultRotationSnapValue = v;
            this.editor.updateGizmoSnap();
        }, { min: 0, max: 180, step: 0.1});
        inspector.addNumber( "Size", this.editor.getGizmoSize(), (v) => {
            this.editor.setGizmoSize(v);
        }, { min: 0.2, max: 2, step: 0.1});
        inspector.addTitle("Bone markers")
        inspector.addNumber( "Size", this.editor.getBoneSize(), (v) => {
            this.editor.setBoneSize(v);
        }, { min: 0.01, max: 2, step: 0.01 });

        const depthTestEnabled = this.bonePoints.material.depthTest;
        inspector.addCheckbox( "Depth test", depthTestEnabled, (v) => { this.bonePoints.material.depthTest = v; })
    }

    onGUI(mode) {
        if(mode == 'position')
            mode = 'translate';
        else if (mode == 'rotation' || mode == 'quaternion')
            mode = 'rotate';

        if(this.mode != mode) 
            this.setMode(mode);
        this.updateBones();
        this.updateTracks();
    }
    
};

Gizmo.ModeToKeyType = {
    'Translate': 'position',
    'Rotate': 'quaternion',
    'Scale': 'scale'
};

Gizmo.Tools = {
    JOINT : 0,
    IK : 1
}

Gizmo.ToolIkModes = {
    LARGECHAIN: 0,
    ONEBONE: 1
}

function nlerpQuats( destQuat, qa, qb, t ){
    let bsign = ( qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w ) < 0 ? -1 : 1;    
    destQuat.x = qa.x * (1-t) + bsign * qb.x * t;
    destQuat.y = qa.y * (1-t) + bsign * qb.y * t;
    destQuat.z = qa.z * (1-t) + bsign * qb.z * t;
    destQuat.w = qa.w * (1-t) + bsign * qb.w * t;
    destQuat.normalize();
    return destQuat;
}

export { Gizmo };