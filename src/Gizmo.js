import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ShaderChunk } from "./Utils.js";
import { CCDIKSolver, FABRIKSolver } from "./IKSolver.js"
import { IKHelper } from "./IKHelper.js"

class Gizmo {

    constructor(editor) {

        if(!editor)
        throw("No editor to attach Gizmo!");

        this.raycastEnabled = true;
        let transform = new TransformControls( editor.camera, editor.renderer.domElement );
        window.trans = transform;
        transform.setSpace( 'local' );
        transform.setMode( 'rotate' );

        transform.addEventListener( 'objectChange', e => {
            if(this.selectedBone != -1) {    
                this.updateBones();
                this.mustUpdate = true;
            }
        });

        transform.addEventListener( 'mouseUp', e => {
            if(this.selectedBone == -1){
                return;
            }
            this.updateTracks();
            this.editor.gui.updateSkeletonPanel();
        } );
        
        transform.addEventListener( 'mouseDown', e => {

            if(this.selectedBone == -1){
                return;
            }

            /*
                Save current state of bones for this keyframeClip.
                Since multiple animation might be overlapping, quaternion/position/scale cannot be fetched directly from the scene and plugged in to the track.
                A delta must be computed and applied to the track. This also allows for normal and additive animations.

                This assumes that while gizmo is clicked, the selected keyframe and the propagation window cannot change. 
            */
            const mouseDownState = [];
            const chain = this.toolSelected == Gizmo.Tools.IK ? this.ikSelectedChain.chain : [this.selectedBone];
            for( let i = 0; i < chain.length; ++i ){
                const bone = this.skeleton.bones[chain[i]];
                mouseDownState.push({
                    boneIdx: chain[i],
                    quaternion: bone.quaternion.clone(),
                    position: bone.position.clone(),
                    scale: bone.scale.clone(),
                });
            }

            this.mouseDownState = mouseDownState;
        } );

        transform.addEventListener( 'dragging-changed', e => {
            const enabled = e.value;
            this.editor.controls.enabled = !enabled;
            this.raycastEnabled = !enabled;//!this.raycastEnabled;

            if(this.selectedBone == -1 || this.editor.state ){
                this.mustUpdate = false;
                return;
            }
            this.mustUpdate = enabled;
            
        });

        let scene = editor.scene;
        scene.add( transform.getHelper() );

        this.camera = editor.camera;
        this.scene = scene;
        this.transform = transform;
		this.raycaster = null;
        this.skeleton = null;
        this.selectedBone = -1;
        this.bonePoints = null;
        this.editor = editor;

        //ik tool 
        this.ikSelectedChain = null;
        this.ikTarget = null;
        this.ikSolver = null;
        // this.ikHelper = null;
        this.ikMode = Gizmo.ToolIkModes.ONEBONE; // this.mode should be the one, but it is used for other purposes in the editor. So we need this variable.

        this.mustUpdate = false; 

        this.toolSelected = Gizmo.Tools.JOINT;
        this.mode = "rotate";

        this.enabled = false;
    }

    begin(skeletonHelper) {
        
        //Change skeleton helper lines colors
        let colorArray = skeletonHelper.geometry.attributes.color.array;
        for(let i = 0; i < colorArray.length; i+=6) { 
            colorArray[i+3] = 0/250;//58/256; 
            colorArray[i+4] = 94/256;//161/256; 
            colorArray[i+5] = 166/256;//156/256;
        }
        skeletonHelper.geometry.attributes.color.array = colorArray;
        skeletonHelper.material.linewidth = 4;

        this.skeleton = skeletonHelper.skeleton;
        this.ikInit();

        // point cloud for bones
        const pointsShaderMaterial = new THREE.ShaderMaterial( {
            uniforms: {
                color: { value: new THREE.Color( 1.0, 1.0, 1.0) },
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
        
        this.selectedBone = vertices.length ? 0 : -1;
        
        const geometry = new THREE.BufferGeometry();
        geometry.setFromPoints(vertices);
        
        const positionAttribute = geometry.getAttribute( 'position' );
        const size = 0.1;
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

        if(this.selectedBone != -1) 
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
        let timeline = this.editor.gui.skeletonTimeline;

        const canvas = document.getElementById("webgl-canvas");

        canvas.addEventListener( 'mousemove', e => {

            if(!this.bonePoints || this.editor.state || !this.editor.currentKeyFrameClip )
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
                this.editor.setSelectedBone(boneName);
            }
        });

        canvas.addEventListener( 'keydown', e => {

            if ( !this.editor.currentKeyFrameClip ){
                return;
            }
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
                    if(timeline.getTracksGroup(bone.name).length < 2) // only rotation
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

        if(state) this.updateBones(dt);

        if(!this.enabled || this.selectedBone == -1) return;

        //this.ikHelper.update();
                
        if ( !this.mustUpdate ){
            if ( this.toolSelected == Gizmo.Tools.IK && !this.transform.dragging ){ // make target follow bone when not directly using it
                this.ikSetTargetToBone();
            }
            return;
        }

        if ( this.ikSelectedChain ){
            this.ikSolver.update(); 
            this.updateBones();
        }

        this.mustUpdate = false; 
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

        // CSS works in srgb. These colors are in srgb. At some point between three.136 and three.176, 
        // they made Color setHex (internal in the constructor) to default inputs as srgb and automatically transform them to linear.
        // bonepoints is using custom shaders, which do not apply gamma. This is why the color needs a convertLineaToSRGB to be chromatically correct  
        const color = new THREE.Color("#0170D9").convertLinearToSRGB();
        const colorSelected = new THREE.Color("#fc9f00").convertLinearToSRGB();

        for ( let i = 0, l = positionAttribute.count; i < l; i ++ ) {
            (i != this.selectedBone ? color : colorSelected).toArray( colors, i * 3 );
        }

        geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
    }

    /**
     * Commits current selected bone changes with propagation (if enabled)
     * @returns 
     */
    updateTracks() {

        const timeline = this.editor.gui.skeletonTimeline;
        const propWindow = this.editor.gui.propagationWindow;
        const keyType = Gizmo.ModeToKeyType[ this.editor.getGizmoMode() ];
        const bone = this.skeleton.bones[this.selectedBone]; 
        let track = null;
        let keyFrameIndex = -1; // only used if no propagation 

        if ( propWindow.enabler ){
            track = timeline.getTrack(keyType, bone.name);
            if ( !track ){ return; }
        }else{
            if(timeline.getNumKeyFramesSelected() != 1)
                return;
            
            const [trackIdx, keyFrame] = timeline.lastKeyFramesSelected[0];
            track = timeline.animationClip.tracks[trackIdx];
            // Don't store info if we are using wrong mode for that track
            if ( bone.name != track.groupId || keyType != track.id ) { return; }
            keyFrameIndex = keyFrame;
        }

       
        if ( this.toolSelected == Gizmo.Tools.IK ){
            if ( !this.ikSelectedChain ){ return; }
            
            const effectorFrameTime = propWindow.enabler ? propWindow.time : track.times[ keyFrameIndex ];
            const chain = this.ikSelectedChain.chain;
            
            const deltaQuat = new THREE.Quaternion();
            const tempQuat = new THREE.Quaternion();

            for( let i = 1; i < chain.length; ++i ){
                const boneToProcess = this.skeleton.bones[chain[i]];
                deltaQuat.copy(this.mouseDownState[i].quaternion).invert().multiply(boneToProcess.quaternion);

                const groupTracks = timeline.getTracksGroup(boneToProcess.name);
                const quaternionTrackIdx = ( timeline.getTracksGroup(boneToProcess.name).length > 1 ) ? 1 : 0; // localindex
                
                const track = groupTracks[quaternionTrackIdx];
                if ( track.dim != 4 ){ continue; } // only quaternions

                this.editor.gui.skeletonTimeline.saveState( track.trackIdx, i != 1 );

                let frame = timeline.getCurrentKeyFrame( track, effectorFrameTime, 0.008 );
                
                // if keyframe does not exist, create one with proper values
                if ( frame == -1 ){
                    frame = timeline.addKeyFrames( track.trackIdx, boneToProcess.quaternion.toArray(), [effectorFrameTime] )[0]; // ignore quaternion value. It is overwriten below
                    
                    const q1 = new THREE.Quaternion();
                    if ( track.times.length > 1 ){
                        // slerp between two keyframes
                        let prevframe = frame == 0 ? 1 : (frame-1);
                        let postframe = frame == (track.times.length-1) ? prevframe : (frame+1);

                        let t = track.times[postframe] - track.times[prevframe];
                        t = t <= 0.000001 ? 0 : ((effectorFrameTime-track.times[prevframe]) / t);

                        const q2 = new THREE.Quaternion();
                        q1.fromArray( track.values, prevframe * 4 );
                        q2.fromArray( track.values, postframe * 4 );
                        q1.slerp(q2, t);

                    }else{
                        // the new keyframe is the only one in this track. Set default values 
                        if( this.editor.currentKeyFrameClip.blendMode == THREE.NormalAnimationBlendMode ){
                            this.skeleton.boneInverses[chain[i]].clone().invert().decompose(new THREE.Vector3(),q1,new THREE.Vector3());
                        }else{
                            q1.set(0,0,0,1);
                        }
                    }

                    let curframe = frame * 4;
                    track.values[ curframe++ ] = q1.x;
                    track.values[ curframe++ ] = q1.y;
                    track.values[ curframe++ ] = q1.z;
                    track.values[ curframe ] = q1.w;
                }

                // add the delta to the current (and neigbhouring) keyframe
                if ( propWindow.enabler ){
                    this.editor.propagateEdition(this.editor.gui.skeletonTimeline, track.trackIdx, deltaQuat, true);
                }else{

                    const start = 4 * frame;
                    tempQuat.fromArray( track.values, start );
                    tempQuat.multiply( deltaQuat );
                    track.values[start] =   tempQuat.x;
                    track.values[start+1] = tempQuat.y;
                    track.values[start+2] = tempQuat.z;
                    track.values[start+3] = tempQuat.w;
                    track.edited[ frame ] = true;
                }

                // Update animation interpolants
                this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx] );
            }
        }
        else{
            
            this.editor.gui.skeletonTimeline.saveState( track.trackIdx );

            let deltaValue;
            if ( track.dim == 4 ){
                deltaValue = this.mouseDownState[0].quaternion.clone().invert().multiply(bone.quaternion); // deltaValue in localspace
            }else{ // dim == 3
                deltaValue = bone[ keyType ].clone().sub( this.mouseDownState[0][ keyType ] );
            }


            if ( propWindow.enabler ){
                this.editor.propagateEdition(this.editor.gui.skeletonTimeline, track.trackIdx, deltaValue, true);
            }else{
                const start = track.dim * keyFrameIndex;
                // supports position and quaternion types
                deltaValue = deltaValue.toArray();
                if ( track.dim == 4 ){
                    THREE.Quaternion.multiplyQuaternionsFlat( track.values, start, track.values, start, deltaValue, 0);
                }else{ // dim == 3
                    track.values[start] += deltaValue[0];
                    track.values[start + 1] += deltaValue[1];
                    track.values[start + 2] += deltaValue[2];
                }
    
                track.edited[keyFrameIndex] = true;
            }

            // Update animation interpolants
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx]);
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
            this.mode = Gizmo.ModeLUT[mode] ?? "rotate";
            this.transform.setMode( this.mode );
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


Gizmo.ModeLUT = {
    "translate": "translate",
    "position" : "translate",
    "scale": "scale",
    "rotate" : "rotate",
    "rotation" : "rotate",
    "quaternion" : "rotate"
}
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