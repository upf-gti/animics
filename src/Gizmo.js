import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ShaderChunk } from "./Utils.js";
import { CCDIKSolver, FABRIKSolver } from "./IKSolver.js"
import { IKHelper } from "./IKHelper.js"

class Gizmo {

    constructor(editor) {

        if(!editor)
        throw("No editor to attach Gizmo!");

        let transform = new TransformControls( editor.camera, editor.renderer.domElement );
        transform.setSpace( 'local' );
        transform.setMode( 'rotate' );

        transform.addEventListener( 'objectChange', e => {
            if(this.selectedBone != -1) {    
                this.updateBones();
                this.mustUpdate = true;
            }
        });

        transform.addEventListener( 'mouseUp', (e) =>{
            this._onTransformMouseUp();
            // this.editor.gui.updateBonePanel();
        } );
        
        transform.addEventListener( 'mouseDown', (e)=>{
            this._onTransformMouseDown();

        } );

        transform.addEventListener( 'dragging-changed', e => {
            const enabled = e.value;
            this.editor.controls.enabled = !enabled; // camera should not move when using gizmo
            this.raycastEnabled = !enabled; // neither should the raycasting work

            if(this.selectedBone == -1 || this.editor.state ){
                this.mustUpdate = false;
                return;
            }
            this.mustUpdate = enabled;
        });

        let scene = editor.scene;
        scene.add( transform.getHelper() );

        this.editor = editor;
        this.camera = editor.camera;
        this.scene = scene;
        this.transform = transform;
		this.raycaster = null;
        this.skeleton = null;
        this.selectedBone = -1;
        this.bonePoints = null;

        this.toolSelected = Gizmo.Tools.JOINT;
        this.jointMode = "rotate";
        this.jointSpace = "world";

        //ik tool 
        this.ikSelectedChain = null;
        this.ikTarget = null;
        this.ikSolver = null;
        this.ikMode = Gizmo.ToolIkModes.ONEBONE;

        this.mustUpdate = false;
        this.transformEnabled = false;
        this.raycastEnabled = true;
    }

    _onTransformMouseUp(){
        if(this.selectedBone == -1){
            return;
        }
        this.updateTracks();
    }

    _onTransformMouseDown(){
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
        
        this.selectedBone = this.skeleton.bones.length ? 0 : -1;
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( new Float32Array(this.skeleton.bones.length).fill(0.1), 1 ) );
        this.bonePoints = new THREE.Points( geometry, pointsShaderMaterial );
        this.bonePoints.name = "GizmoPoints";
        this.bonePoints.renderOrder = 1;
        this.scene.remove(this.scene.getObjectByName("GizmoPoints"));
        this.scene.add( this.bonePoints );
        
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Points.threshold = 0.05;
        
        this.bindEvents();

        this.ikInit();
        
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
        const boneIdx = this.ikSelectedChain.chain[0];
        this.skeleton.bones[ boneIdx ].updateMatrixWorld();
        this.skeleton.bones[ boneIdx ].parent.updateMatrixWorld();
        this.skeleton.bones[ boneIdx ].getWorldPosition( this.ikTarget.position );
    }
    
    _ikSetBone( boneIdx ){
        this.ikSolver.setChainEnablerAll( false );
        this.ikSelectedChain = null;
        
        let chainName = this.skeleton.bones[ boneIdx ].name;
        let enabled = false;

        if ( this.ikMode == Gizmo.ToolIkModes.LARGECHAIN ){
            enabled = this.ikSolver.setChainEnabler( chainName, true );
        } 

        if( !enabled ) { // Gizmo.ToolIkModes.ONEBONE
            chainName = "OneBoneIK_" + chainName;
            enabled = this.ikSolver.setChainEnabler( chainName, true );
        }
        
        if ( !enabled ){
            return false;
        }
        
        this.selectedBone = boneIdx;
        this.ikSelectedChain = this.ikSolver.getChain( chainName );
        this.ikSetTargetToBone();

        if( this.transformEnabled ){
            this.transform.detach();
            this.transform.attach( this.ikTarget );
        }

        return true;
    }

    _ikStop() {
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

    bindEvents() {

        if(!this.skeleton)
            throw("No skeleton");

        const transform = this.transform;
        const timeline = this.editor.gui.skeletonTimeline;
        const canvas = this.editor.renderer.domElement;

        canvas.addEventListener( 'mousemove', e => {

            if(!this.bonePoints || this.editor.state || !this.editor.currentKeyFrameClip || !this.raycastEnabled )
                return;

            const pointer = new THREE.Vector2(( e.offsetX / canvas.clientWidth ) * 2 - 1, -( e.offsetY / canvas.clientHeight ) * 2 + 1);
            this.raycaster.setFromCamera(pointer, this.camera);
            const intersections = this.raycaster.intersectObject( this.bonePoints );
            canvas.style.cursor = intersections.length ? "crosshair" : "default";
        });

        canvas.addEventListener( 'pointerdown', e => {

            if( (e.button != 0 && e.button != 2) || !this.bonePoints || this.editor.state || (!this.raycastEnabled && !e.ctrlKey))
                return;

            const pointer = new THREE.Vector2(( e.offsetX / canvas.clientWidth ) * 2 - 1, -( e.offsetY / canvas.clientHeight ) * 2 + 1);
            this.raycaster.setFromCamera(pointer, this.camera);
            const intersections = this.raycaster.intersectObject( this.bonePoints );
            if(!intersections.length)
                return;

            const intersection = intersections.length > 0 ? intersections[ 0 ] : null;

            if(intersection) {
                if ( e.button == 0 && intersection.index != this.selectedBone ){
                    this.setBoneByIdx( intersection.index );    
                    this.editor.setSelectedBone( this.skeleton.bones[this.selectedBone].name );
                }
                else if ( e.button == 2 ){
                    let idx = this.editor.gui.skeletonTimeline.selectedItems.indexOf( this.skeleton.bones[intersection.index].name );
                    if ( idx == -1 ){
                        this.editor.gui.skeletonTimeline.setSelectedItems( this.editor.gui.skeletonTimeline.selectedItems.concat( [this.skeleton.bones[intersection.index].name] ) );
                    }
                }
            }
        });

        canvas.addEventListener( 'keydown', e => {

            if ( !this.editor.currentKeyFrameClip || this.editor.animationMode != this.editor.animationModes.BODY ){
                return;
            }
            switch ( e.key ) {

                case 'q':
                    transform.setSpace( transform.space === 'local' ? 'world' : 'local' );
                    this.editor.gui.updateBonePanel();
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
                    this.setJointMode( "translate" );
                    this.editor.gui.updateBonePanel();
                    break;

                case 'e':
                    this.setTool( Gizmo.Tools.JOINT );
                    this.setJointMode( "rotate" );
                    this.editor.gui.updateBonePanel();
                    break;

                case 'r':
                    this.setTool( Gizmo.Tools.IK );
                    this.editor.gui.updateBonePanel();
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
    
    enableRaycast (){
        this.raycastEnabled = true;
    }
    disableRaycast (){
        this.raycastEnabled = false;
    }

    // displays the Gizmo
    enableTransform (){
        this.transformEnabled = true;
        if ( this.selectedBone != -1 ){
            if ( this.toolSelected == Gizmo.Tools.IK ){
                this.transform.attach( this.ikTarget );
            }else{
                this.transform.attach( this.skeleton.bones[this.selectedBone] );
            }
        }
    }

    // hides gizmo
    disableTransform (){
        this.transformEnabled = false;
        this.transform.detach();
        this._ikStop();
    }

    /** Enable raycast and transform */
    enableAll ( ) {
        this.enableRaycast();
        this.enableTransform();
    }

    /** Disable raycast and transform */
    disableAll ( ) {
        this.disableRaycast();
        this.disableTransform();
    }

    update(state, dt) {

        if(state) this.updateBones();

        if(!this.transformEnabled || this.selectedBone == -1) return;
                
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
                if ( track.dim != 4 || track.locked ){ continue; } // only quaternions

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
                this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx], this.editor.currentKeyFrameClip.skeletonAnimation );
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
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx], this.editor.currentKeyFrameClip.skeletonAnimation);
        }

    }

    setBone( name ) {

        let bone = this.skeleton.getBoneByName(name);
        if(!bone) {
            console.warn("No bone with name " + name);
            return;
        }

        const boneIdx = this.skeleton.bones.findIndex((bone) => bone.name == name);
        if(boneIdx > -1){
            this.setBoneByIdx( boneIdx );
        }
    }

    // needs to be a valid index. No checks are done
    setBoneByIdx( boneIdx ){
        this.selectedBone = boneIdx;
        this.setTool( this.toolSelected ); // if ik, do any preparations needed
        this.updateBoneColors();
    }


    setJointMode( mode ){
        this.jointMode = Gizmo.ModeLUT[mode] ?? "rotate";
        if ( this.toolSelected == Gizmo.Tools.JOINT ){
            this.transform.setMode( this.jointMode );
        }
    }

    setIkMode( mode ){
        this.ikMode = mode;
        if ( this.toolSelected == Gizmo.Tools.IK ){ 
            this.transform.setMode( "translate" ); // ik moves target, but rotates joints
            return this._ikSetBone( this.selectedBone );
        }
        return false;
    }

    setSpace( space ) {
        this.jointSpace = space;
        if ( this.toolSelected == Gizmo.Tools.JOINT ){
            this.transform.setSpace( space );
        }
    }

    setTool( tool ){
        const lastTool = this.toolSelected;
        this.toolSelected = Gizmo.Tools.JOINT;

        let ikResult = false;
        if ( tool == Gizmo.Tools.IK ){
            this.toolSelected = Gizmo.Tools.IK;
            ikResult = this.setIkMode( this.ikMode );
        }
        if ( !ikResult ){
            this.toolSelected = Gizmo.Tools.JOINT;
            this._ikStop();
            this.setJointMode( lastTool != this.toolSelected ? "rotate" : this.jointMode );
            this.transform.setSpace(this.jointSpace);
        }else{
            this.transform.setSpace("world");
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
};


// from generic key to Three.TransformControl compliant string
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

export { Gizmo };