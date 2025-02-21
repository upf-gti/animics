import * as THREE from "three";
import { OrbitControls } from "./controls/OrbitControls.js";
import { BVHLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/BVHLoader.js';
import { BVHExporter } from "./exporters/BVHExporter.js";
import { createAnimationFromRotations } from "./skeleton.js";
import { KeyframesGui, ScriptGui } from "./gui.js";
import { Gizmo } from "./gizmo.js";
import { UTILS } from "./utils.js"
import { NN } from "./ML.js"
import { OrientationHelper } from "./libs/OrientationHelper.js";
import { AnimationRetargeting, findIndexOfBone, findIndexOfBoneByName } from './retargeting.js'
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from './exporters/GLTFExporoter.js' 
import { BMLController } from "./controller.js"
import { BlendshapesManager, createAnimationFromActionUnits } from "./blendshapes.js"
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';

import { FileSystem } from "./libs/filesystem.js";

import { LX } from "lexgui"
import { Quaternion, Vector3 } from "./libs/three.module.js";

// const MapNames = await import('../data/mapnames.json', {assert: { type: 'json' }});
const MapNames = await (await fetch('./data/mapnames.json')).json();
// Correct negative blenshapes shader of ThreeJS
THREE.ShaderChunk[ 'morphnormal_vertex' ] = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n	    objectNormal += getMorph( gl_VertexID, i, 1, 2 ) * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_pars_vertex' ] = "#ifdef USE_MORPHTARGETS\n	uniform float morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		uniform sampler2DArray morphTargetsTexture;\n		uniform vec2 morphTargetsTextureSize;\n		vec3 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset, const in int stride ) {\n			float texelIndex = float( vertexIndex * stride + offset );\n			float y = floor( texelIndex / morphTargetsTextureSize.x );\n			float x = texelIndex - y * morphTargetsTextureSize.x;\n			vec3 morphUV = vec3( ( x + 0.5 ) / morphTargetsTextureSize.x, y / morphTargetsTextureSize.y, morphTargetIndex );\n			return texture( morphTargetsTexture, morphUV ).xyz;\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_vertex' ] = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			#ifndef USE_MORPHNORMALS\n				transformed += getMorph( gl_VertexID, i, 0, 1 ) * morphTargetInfluences[ i ];\n			#else\n				transformed += getMorph( gl_VertexID, i, 0, 2 ) * morphTargetInfluences[ i ];\n			#endif\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif"; 

class Editor {
    
    constructor(app, mode) {
        
        this.character = "Eva";

        this.currentCharacter = null;
        this.loadedCharacters = {};
                
        this.currentAnimation = "";
        this.loadedAnimations = {}; // loaded animations from mediapipe&NN or BVH
        this.bindedAnimations = {}; // loaded retargeted animations binded to characters
        this.animationFrameRate = 30;

        this.clock = new THREE.Clock();
        this.BVHloader = new BVHLoader();
        this.GLTFloader = new GLTFLoader();
        this.GLTFExporter = new GLTFExporter();

        this.help = null;
        this.camera = null;
        this.controls = null;
        this.scene = null;
        this.boneUseDepthBuffer = true;

        this.renderer = null;
        this.state = false; // defines how the animation starts (moving/static)
        
        this.showGUI = true;
        this.showSkin = true; // defines if the model skin has to be rendered
        this.animLoop = true;
        
        this.editionModes = {CAPTURE: 0, VIDEO: 1, SCRIPT: 2};
        this.mode = this.editionModes[mode];

        this.delayedResizeID = null;
        this.delayedResizeTime = 500; //ms

        this.currentTime = 0;

        // Keep "private"
        this.__app = app;

        // Create the fileSystem and log the user
        this.FS = new FileSystem("signon", "signon", (session) => {
            if(session) {
                this.FS.setSession(session);
                this.getUnits();

                const innerChangeLogin = () => {
                    if(this.gui && this.gui.menubar.items.length) {
                        this.gui.changeLoginButton(session.user.username);
                    }
                    else {
                        setTimeout( () => innerChangeLogin(), 2000)
                    }
                }
                if(session.user.username != "signon") {
                    innerChangeLogin();                    
                }
            }
            else {
                console.log("Auto login of guest user")
                this.FS.login().then(this.getUnits.bind(this))
            }
        });

        this.repository = {signs: [], presets:[], clips: []};
    }

    getApp() {
        return this.__app;
    }

    //Create canvas scene
    async init(callback) {

        this.initScene();
        await this.initCharacters();

        document.addEventListener( 'keydown', (e) => {
            switch ( e.key ) {
                case " ": // Spacebar                    
                    if(e.target.constructor.name != 'HTMLInputElement') {

                        e.preventDefault();
                        e.stopImmediatePropagation();
                        let playElement = document.querySelector("[title = Play]");
                        if ( playElement ){ playElement.children[0].click(); }
                    }
                    break;
                case "Escape":
                    this.gui.closeDialogs();
                    
                break;
                case 'z': case 'Z': 
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.activeTimeline.undo) {
                            this.activeTimeline.undo();
                            if(this.mode == this.editionModes.SCRIPT) {
                                this.gui.updateClipPanel();
                            }
                        }
                    }
                    break;
                case 'y': case 'Y': 
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.activeTimeline.redo) {
                            this.activeTimeline.redo();
                            if(this.mode == this.editionModes.SCRIPT) {
                                this.gui.updateClipPanel();
                            }
                        }
                    }
                    break;
                
                case 's': case 'S':
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.mode == this.editionModes.SCRIPT) {
                            if(e.altKey) {
                                if(this.gui.createNewPresetDialog)
                                    this.gui.createNewPresetDialog();
                            }
                            else {
                                if(this.gui.createNewSignDialog)
                                    this.gui.createNewSignDialog();
                            }
                        }
                        else {
                            if(this.gui.createSaveDialog) {
                                this.gui.createSaveDialog();
                            }
                        }
                    }
                    break;

                case 'e': case 'E':
                    if(e.ctrlKey) {
                        if(e.altKey) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            LX.prompt("File name", "Export GLB", (v) => this.export(null, "GLB", true, v), {input: this.clipName, required: true} )     
                        }
                    }
                    break;

                case 'a': case 'A':
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.activeTimeline.selectAll)
                            this.activeTimeline.selectAll();
                    }
                    break;
                case 'w':
                    if ( (!document.activeElement || document.activeElement.value === undefined) && this.gui.propagationWindow ){
                        this.gui.propagationWindow.toggleEnabler();
                        if( this.gui.propagationWindow.enabler ){
                            this.gui.keyFramesTimeline.unSelectAllKeyFrames();
                            this.gui.curvesTimeline.unSelectAllKeyFrames();
                        }
                    }
                    break;

                case 'i': case 'I':case 'o': case 'O':
                    if(e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        this.gui.importFile();
                    }
                    break;

                case 'o': case 'O':
                if(e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if(this.mode == this.editionModes.SCRIPT) {
                        this.gui.createClipsDialog();
                    }
                    else {
                        this.gui.createServerClipsDialog();
                    }
                }
                break;
            }
            this.onKeyDown(e);
        } );
       
        window.onbeforeunload =  (e) => {
            if(!this.currentAnimation || !this.loadedAnimations[this.currentAnimation])
                return;
            e.preventDefault();
            e.returnValue = ""
            window.stop();
            return "Be sure you have exported the animation. If you exit now, your data will be lost."
        }

        if(callback)
            callback();
    }    

    initScene() {

        let canvasArea = this.gui.canvasArea;
        const [CANVAS_WIDTH, CANVAS_HEIGHT] = canvasArea.size;

        // Create scene
        let scene = new THREE.Scene();
        scene.background = new THREE.Color( 0xa0a0a0 );
        scene.fog = new THREE.Fog( 0xa0a0a0, 10, 50 );
        window.scene = scene;

        const grid = new THREE.GridHelper(300, 300, 0x101010, 0x555555 );
        grid.name = "Grid";
        scene.add(grid);
        window.GridHelper = THREE.GridHelper;

        const ground = new THREE.Mesh( new THREE.PlaneGeometry( 100, 100 ), new THREE.MeshPhongMaterial( { color: 0x353535, depthWrite: false } ) );
        ground.rotation.x = - Math.PI / 2;
        ground.receiveShadow = true;
        scene.add( ground );
        
        // Lights
        const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x444444, 0.3 );
        hemiLight.position.set( 0, 20, 0 );
        scene.add( hemiLight );

        // const dirLight = new THREE.DirectionalLight( 0xffffff, 0.1 );
        // dirLight.position.set( 3, 30, -50 );
        // dirLight.castShadow = false;
        // scene.add( dirLight );

        // Left spotlight
        let spotLight = new THREE.SpotLight( 0xffffff, 0.5 );
        spotLight.position.set(-2,2,2);
        spotLight.penumbra = 1;
        spotLight.castShadow = false;
        scene.add( spotLight );
        
        // Right spotlight
        let spotLight2 = new THREE.SpotLight( 0xffffff, 0.5 );
        spotLight2.position.set(1, 3, 1.5);
        spotLight2.penumbra = 1;
        spotLight2.castShadow = true;
        spotLight2.shadow.bias = -0.0001;
        spotLight2.shadow.mapSize.width = 2048;
        spotLight2.shadow.mapSize.height = 2048;
        scene.add( spotLight2 );
        
        let spotLightTarget = new THREE.Object3D();
        spotLightTarget.position.set(0, 1.5, 0); 
        scene.add( spotLightTarget );
        spotLight.target = spotLightTarget;
        spotLight2.target = spotLightTarget;

        // Create 3D renderer
        const pixelRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
        let renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.gammaInput = true; // applies degamma to textures ( not applied to material.color and roughness, metalnes, etc. Only to colour textures )
        renderer.gammaOutput = true; // applies gamma after all lighting operations ( which are done in linear space )
        renderer.shadowMap.enabled = true;

        canvasArea.root.appendChild(renderer.domElement);
        canvasArea.onresize = (bounding) => this.delayedResize(bounding.width, bounding.height);
        renderer.domElement.id = "webgl-canvas";
        renderer.domElement.setAttribute("tabIndex", 1);

        // Camera
        let camera = new THREE.PerspectiveCamera(60, pixelRatio, 0.1, 1000);
        camera.position.set(-0.1175218614251044, 1.303585797450244, 1.4343282767035261);
        // let camera = new THREE.PerspectiveCamera(50, pixelRatio, 0.1, 1000);
        // camera.position.set( 6.447895542597849, 18.689446428667427, 148.6913892438352);
        window.camera = camera;
        let controls = new OrbitControls(camera, renderer.domElement);
        controls.minDistance = 0.5;
        controls.maxDistance = 5;
        controls.target.set(-0.20428114060514568, 1.0667066120801934, -0.017019104933513607);
        controls.update();  

        // Orientation helper
        const orientationHelper = new OrientationHelper( camera, controls, { className: 'orientation-helper-dom' }, {
            px: '+X', nx: '-X', pz: '+Z', nz: '-Z', py: '+Y', ny: '-Y'
        });

        canvasArea.root.appendChild(orientationHelper.domElement);
        orientationHelper.domElement.style.display = "none";
        orientationHelper.addEventListener("click", (result) => {
            const side = result.normal.multiplyScalar(4);
            if(side.x != 0 || side.z != 0) side.y =controls.target.y;
            camera.position.set(side.x, side.y, side.z);
            camera.setRotationFromQuaternion( new THREE.Quaternion() );
            controls.update();
        });
        
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.orientationHelper = orientationHelper;
    }

    loadCharacter(characterName) {
        // Load the target model (Eva) 
        UTILS.loadGLTF("https://webglstudio.org/3Dcharacters/" + characterName + "/" + characterName + ".glb", (gltf) => {
            let model = gltf.scene;
            model.name = characterName;
            model.visible = true;
            
            let skeleton;
            let morphTargets = {};
            let skinnedMeshes = {};
            this.loadedCharacters[characterName] = {}

            model.traverse( o => {
                if (o.isMesh || o.isSkinnedMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                    o.frustumCulled = false;
                    if ( o.skeleton ){ 
                        skeleton = o.skeleton;
                    }
                    if (o.name == "Body")
                            o.name == "BodyMesh";
                    if(o.morphTargetDictionary)
                    {
                        morphTargets[o.name] = o.morphTargetDictionary;
                        skinnedMeshes[o.name] = o;
                    }
                    o.material.side = THREE.FrontSide;                    
                }
            } );
            
            // Create skeleton helper
            let skeletonHelper = new THREE.SkeletonHelper(model);
            skeletonHelper.name = "SkeletonHelper";            
            skeletonHelper.skeleton = skeleton;

            // Create mixer for animation
            let mixer = new THREE.AnimationMixer(model);  
           
            // Add loaded data to the character
            this.loadedCharacters[characterName] = {
                name: characterName, model, morphTargets, skinnedMeshes, mixer, skeletonHelper
            };
           
            if(this.mode == this.editionModes.SCRIPT) {
                let eyesTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffff00 , depthWrite: false }) );
                eyesTarget.name = "eyesTarget";
                eyesTarget.position.set(0, 2.5, 15); 
                
                let headTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xff0000 , depthWrite: false }) );
                headTarget.name = "headTarget";
                headTarget.position.set(0, 2.5, 15); 
                
                let neckTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0x00fff0 , depthWrite: false }) );
                neckTarget.name = "neckTarget";
                neckTarget.position.set(0, 2.5, 15); 

                this.scene.add(eyesTarget);
                this.scene.add(headTarget);
                this.scene.add(neckTarget);
                
                model.eyesTarget = eyesTarget;
                model.headTarget = headTarget;
                model.neckTarget = neckTarget;

                skeletonHelper.visible = false;
                this.loadedCharacters[characterName].bmlManager = new BMLController( this.loadedCharacters[characterName] );
            }
            else {
                this.loadedCharacters[characterName].blendshapesManager = new BlendshapesManager(skinnedMeshes, morphTargets, this.mapNames);
            }

            this.changeCharacter(characterName);
        });   
    }

    changeCharacter(characterName) {
        // Check if the character is already loaded
        if( !this.loadedCharacters[characterName] ) {
            console.warn(characterName + " not loaded");
            this.loadCharacter(characterName);
        }

        // Remove current character from the scene
        if(this.currentCharacter) {
            this.scene.remove(this.currentCharacter.model);
            this.scene.remove(this.currentCharacter.skeletonHelper);
        }

        // Add current character to the scene
        this.currentCharacter = this.loadedCharacters[characterName];
        this.scene.add( this.currentCharacter.model );
        this.scene.add( this.currentCharacter.skeletonHelper );
        this.setPlaybackRate(this.activeTimeline.speed);

        // Gizmo stuff
        if(this.gizmo) {
            this.gizmo.begin(this.currentCharacter.skeletonHelper);            
        }
    }

    getCurrentBindedAnimation() {
        let bindedAnim = this.bindedAnimations[this.currentAnimation]; 
        return bindedAnim ? bindedAnim[this.currentCharacter.name] : null;
    }

    getCurrentAnimation() {
        return this.loadedAnimations[this.currentAnimation];
    }

    getAnimationsToExport() {
        let toExport = [];
        for(let animationName in this.loadedAnimations) {
            let animation = this.loadedAnimations[animationName];

            if( animation.export ){
                toExport.push(animation);
            }
        }
        return toExport;
    }

    startEdition(showGuide = true) {
        if(this.FS.session.user.username != "signon") {
            showGuide = false;
        }
        this.gui.init(showGuide);
        this.animate();
        $('#loading').fadeOut();

    }

    setPlaybackRate(v){
        if(this.mode == this.editionModes.SCRIPT){
            v = Math.max( 0.0001, v );
        }
        else{
            v = Math.min( 16, Math.max( 0.1, v ) );
            if(this.video) {
                this.video.playbackRate = v; 
            }
        }
        this.currentCharacter.mixer.timeScale = v;
    }

    /** -------------------- UPDATES, RENDER AND EVENTS -------------------- */

    animate() {

        requestAnimationFrame(this.animate.bind(this));

        this.render();
        this.update(this.clock.getDelta());

    }

    render() {

        if(!this.renderer)
            return;

        this.renderer.render(this.scene, this.camera);
        if(this.activeTimeline)
            this.gui.drawTimeline(this.activeTimeline);            

    }

    update(dt) {

        if (this.currentTime > this.activeTimeline.duration) {
            this.currentTime = this.activeTimeline.currentTime = 0.0;
            this.onAnimationEnded();
        }
        // the user increased the duration of the animation but the video is trimmed. Keep it paused at endTime until loop
        if (this.mode != this.editionModes.SCRIPT) {
            if (this.video.sync && this.video.currentTime >= this.video.endTime ) {
                this.video.pause(); // stop video on last frame until loop
            }
        }

        if (this.currentCharacter.mixer && this.state) {
            this.currentCharacter.mixer.update(dt);
            this.currentTime = this.currentCharacter.mixer.time;
            this.activeTimeline.setTime(this.currentTime, true);
        }
       
        if(this.gizmo) {
            this.gizmo.update(this.state, dt);
        }
    }

    // Play all animations
    play() {
        this.state = true;
        //this.activeTimeline.active = false;
        if(this.onPlay)
            this.onPlay();
    }

    // Stop all animations 
    stop() {

        this.state = false;
        
        let t = 0.0;
        this.setTime(0);
        // this.activeTimeline.active = true;
        this.activeTimeline.currentTime = t;
        this.activeTimeline.onSetTime(t);
        
       if(this.onStop)
            this.onStop();
    }

    pause() {
        this.state = !this.state;
        // this.activeTimeline.active = !this.activeTimeline.active;
        if(this.state){
            if(this.onPlay){ this.onPlay(); }
        }
        else{
            if(this.onPause){ this.onPause(); }
        }

    }
    
    setTime(t, force) {

        // Don't change time if playing
        // this.gui.currentTime = t;
        if(this.state && !force)
            return;

        let duration = 0;
        let bindedAnim = this.getCurrentBindedAnimation(); 
        if (!bindedAnim){
            return;
        }
        if(this.mode == this.editionModes.SCRIPT) {
            duration = bindedAnim.mixerAnimation.duration;
        }
        else {
            if(this.animationMode == this.animationModes.FACE) {
                duration = bindedAnim.mixerFaceAnimation.duration;
            }
            else {
                duration = bindedAnim.mixerBodyAnimation.duration;
            }
        }
        
        t = Math.clamp(t, 0, duration - 0.001);
        // mixer computes time * timeScale. We actually want to set the raw animation (track) time, without any timeScale 
        this.currentCharacter.mixer.setTime(t/this.currentCharacter.mixer.timeScale); //already calls mixer.update
        this.currentTime = t;
    }

    clearAllTracks() {
        if(!this.activeTimeline.animationClip)
            return;

        for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

            const track = this.activeTimeline.animationClip.tracks[i];
            if(this.mode != this.editionModes.SCRIPT && this.activeTimeline.selectedItems.indexOf(track.name) < 0 )
                continue;
            let idx = this.mode == this.editionModes.SCRIPT ? track.idx : track.clipIdx;
            let value = null;
            if(this.mode != this.editionModes.SCRIPT) {
                
                if(track.dim == 1)
                    value = 0;
                else
                    value = [0,0,0,1];
            } 

            this.activeTimeline.clearTrack(idx, value);
                
            this.updateAnimationAction(this.activeTimeline.animationClip, idx);
            if(this.activeTimeline.onPreProcessTrack)
                this.activeTimeline.onPreProcessTrack( track, track.idx );
        }
        //this.updateTracks();
    }

    optimizeTrack(trackIdx, threshold) {
    }

    optimizeTracks(animations, tracks) {
    }

    updateAnimationAction(animation, idx, replace = false) {
    }

    removeAnimationData(animation, trackIdx, timeIdx) {
        
        if(this.activeTimeline.constructor.name == 'CurvesTimeline'){
            let track = animation.tracks[trackIdx];
            // this.blendshapesArray[timeIdx][track.type] = 0;
        }
        this.updateAnimationAction(animation, trackIdx);
        
    }

    setAnimationLoop(loop) {
        
        for(let i = 0; i < this.currentCharacter.mixer._actions.length; i++) {

            if(loop)
                this.currentCharacter.mixer._actions[i].loop = THREE.LoopOnce;
            else
                this.currentCharacter.mixer._actions[i].loop = THREE.LoopRepeat;
        }

        // if(this.gizmo) {
        //     this.gizmo.updateTracks();
        // }

        // TO DO: Update BML tracks
    }

    /**
     * hides/show timelines depending on the type sent (BODY, FACE). DOES NOT set the character.mixer animations
     * @param {animationModes} type 
     * @returns 
     */
    setAnimation(type) {

        let currentTime = this.activeTimeline ? this.activeTimeline.currentTime : 0;

        if(this.mode == this.editionModes.SCRIPT) {
            this.activeTimeline = this.gui.clipsTimeline;
            this.activeTimeline.show();
        }
        else {
            if(this.activeTimeline && this.animationMode != type) {
                this.activeTimeline.hide();
            }

            switch(type) {
                case this.animationModes.FACE:
                    this.animationMode = this.animationModes.FACE;
                    this.gui.curvesTimeline.setSpeed( this.activeTimeline.speed ); // before activeTimeline is reassigned
                    this.activeTimeline = this.gui.curvesTimeline;
                    if(!this.selectedAU) return;
                    if (this.gizmo) { this.gizmo.disable(); }
                    this.activeTimeline.setAnimationClip( this.getCurrentBindedAnimation().auAnimation, false );
                    this.activeTimeline.show();
                    currentTime = Math.min( currentTime, this.activeTimeline.duration );
                    this.setSelectedActionUnit(this.selectedAU);                    
                    break;
                    
                case this.animationModes.BODY:
                    this.animationMode = this.animationModes.BODY;
                    this.gui.keyFramesTimeline.setSpeed( this.activeTimeline.speed ); // before activeTimeline is reassigned
                    this.activeTimeline = this.gui.keyFramesTimeline;
                    if (this.gizmo) { this.gizmo.enable(); }
                    this.activeTimeline.setAnimationClip( this.getCurrentBindedAnimation().skeletonAnimation, false );
                    this.activeTimeline.show();

                    currentTime = Math.min( currentTime, this.activeTimeline.duration );
                    this.activeTimeline.currentTime = currentTime;
                    this.setSelectedBone(this.selectedBone); // select bone in case of change of animation
                    break;

                default:                   
                    break;
            }
        }

        this.activeTimeline.currentTime = currentTime;
        this.setTime(currentTime, true);
        this.activeTimeline.updateHeader();

    }

    onAnimationEnded() {

        if(this.animLoop) {
            // user increased the duration of the animation. But the video is "trimmed" so it was paused at the endTime until the loop were reached
            if (this.mode != this.editionModes.SCRIPT && this.video.paused) { 
                this.video.play();
            }
            this.setTime(0.0, true);
        } else {
            this.currentCharacter.mixer.setTime(0);
            this.currentCharacter.mixer._actions[0].paused = true;
            let stateBtn = document.querySelector("[title=Play]");
            stateBtn.children[0].click();

            if( this.video ) {
                this.video.pause();
                this.video.currentTime = this.video.startTime;
            }
        }
    }

    delayedResize(width = this.gui.canvasArea.root.clientWidth, height = this.gui.canvasArea.root.clientHeight) {
        if ( this.delayedResizeID ){ clearTimeout(this.delayedResizeID); this.delayedResizeID = null; }
        this.delayedResizeID = setTimeout( ()=>{ this.delayedResizeID = null; this.resize(width, height); }, this.delayedResizeTime );

        // this.renderer.domElement.width = width + "px";
        // this.renderer.domElement.height = height + "px";
        this.renderer.domElement.style.width = width + "px";
        this.renderer.domElement.style.height = height + "px";
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.gui.resize(width, height);
    }

    resize(width = this.gui.canvasArea.root.clientWidth, height = this.gui.canvasArea.root.clientHeight) {
        
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        // this.renderer.setPixelRatio(aspect);
        this.renderer.setSize(width, height); // SLOW AND MIGHT CRASH THE APP

        this.gui.resize(width, height);
    }

    export(animsToExport = null, type = null, download = true, name = null) {
        let files = [];
        if(!animsToExport) {
            animsToExport = [this.getCurrentAnimation()];
        }

        switch(type){
            case 'GLB':
                let options = {
                    binary: true,
                    animations: []
                };

                for(let a in animsToExport) { // can be an array of loadedAnimations, or an object with animations (loadedAnimations itself)
                    const animation = animsToExport[a];
                    const bindedAnim = this.bindedAnimations[animation.name][this.currentCharacter.name];
                    let animSaveName = animation.saveName;
                    
                    let tracks = []; 
                    if(bindedAnim.mixerBodyAnimation) {
                        tracks = tracks.concat( bindedAnim.mixerBodyAnimation.tracks );
                    }
                    if(bindedAnim.mixerFaceAnimation) {
                        tracks = tracks.concat( bindedAnim.mixerFaceAnimation.tracks );
                    }
                    if(bindedAnim.mixerAnimation) {
                        tracks = tracks.concat( bindedAnim.mixerAnimation.tracks );
                    }

                    options.animations.push( new THREE.AnimationClip( animSaveName, -1, tracks ) );
                }
                let model = this.currentCharacter.mixer._root.getChildByName('Armature');

                this.GLTFExporter.parse(model, 
                    ( gltf ) => UTILS.download(gltf, (name || this.clipName || "animations") + '.glb', 'arraybuffer' ), // called when the gltf has been generated
                    ( error ) => { console.log( 'An error happened:', error ); }, // called when there is an error in the generation
                    options
                );
                break;
            
            case 'BVH': case 'BVH extended':
                let skeleton = this.currentCharacter.skeletonHelper.skeleton;
                
                for(let a in animsToExport) { // can be an array of loadedAnimations, or an object with animations (loadedAnimations itself)
                    const animation = animsToExport[a];
                    const bindedAnim = this.bindedAnimations[animation.name][this.currentCharacter.name];
                    let animSaveName = animation.saveName;
  
                    let bvhPose = null;
                    let bvhFace = null;
                    let bodyAction = this.currentCharacter.mixer.existingAction(bindedAnim.mixerBodyAnimation);
                    let faceAction = this.currentCharacter.mixer.existingAction(bindedAnim.mixerFaceAnimation);
                    
                    if(!bodyAction && bindedAnim.mixerBodyAnimation) {
                        bodyAction = this.currentCharacter.mixer.clipAction(bindedAnim.mixerBodyAnimation);     
                    }
                    if(!faceAction && bindedAnim.mixerFaceAnimation) {
                        faceAction = this.currentCharacter.mixer.clipAction(bindedAnim.mixerFaceAnimation);                        
                    }

                    if(this.mode == this.editionModes.SCRIPT) {
                        const action = this.currentCharacter.mixer.clipAction(bindedAnim.mixerAnimation);
                        if(!action) {
                            return;
                        }
                        bvhPose = BVHExporter.export(action, skeleton, this.animationFrameRate);
                        bvhFace = BVHExporter.exportMorphTargets(action, this.currentCharacter.morphTargets.BodyMesh, this.animationFrameRate);
                    } 
                    else {
                        bvhPose = BVHExporter.export(bodyAction, skeleton, this.animationFrameRate);
                        bvhFace = BVHExporter.exportMorphTargets(faceAction, this.currentCharacter.morphTargets.BodyMesh, this.animationFrameRate);
                    }
                    
                    // Check if it already has extension
                    let clipName = name || animSaveName;

                    // Add the extension
                    if(type == 'BVH') {
                        clipName += '.bvh';
                    }
                    else if(type == 'BVH extended') {
                        clipName += '.bvhe';
                    }

                    if(download) {
                        UTILS.download(bvhPose + bvhFace, clipName, "text/plain" );
                    }
                    else {
                        files.push({name: clipName, data: UTILS.dataToFile(bvhPose + bvhFace, clipName, "text/plain")});
                    }
                }                
                break;

            default:
                let json = this.exportBML();
                if(!json) return;
                UTILS.download(JSON.stringify(json), (name || json.name) + '.bml', "application/json");
                console.log(type + " ANIMATION EXPORTATION IS NOT YET SUPPORTED");
                break;
 
        }
        // bvhexport sets avatar to bindpose. Avoid user seeing this
        this.bindAnimationToCharacter(this.currentAnimation);
        return files;
    }

    showPreview() {
        
        const sendData = (msg) => {
            if(this.performsApp)
                this.realizer.postMessage(msg);
            else {
                setTimeout(sendData.bind(this, msg), 1000)
            }
        }
        
        const openPreview = (data) => {
            if(!this.realizer || this.realizer.closed) {
                this.realizer = window.open(url, "Preview");
                this.realizer.onload = (e, d) => {
                    this.performsApp = e.currentTarget.global.app;
                    sendData(data);
                }
    
                this.realizer.addEventListener("beforeunload", () => {
                    this.realizer = null
                });
            }
            else {
                sendData(data);       
            }  
        }
        let url = "https://webglstudio.org/projects/signon/performs"; 
        let data = [];
        if(this.mode == this.editionModes.SCRIPT) {
            
            const json = this.exportBML();
            if(!json)  {
                return;
            }

            data = JSON.stringify([{type: "bml", data: json.behaviours}]);
            openPreview(data);
        }
        else{
            this.gui.showExportAnimationsDialog(() => {
                const files = this.export(this.loadedAnimations, "BVH extended", false);
                data = {type: "bvhe", data: files};
                openPreview(data);
            })
            // let bvh = BVHExporter.export(this.currentCharacter.mixer._actions[0], this.currentCharacter.skeletonHelper, this.animationFrameRate);
            // window.localStorage.setItem('bvhskeletonpreview', bvh);
            // // window.localStorage.setItem('bvhblendshapespreview', bvh);
            // url = "https://webglstudio.org/users/arodriguez/demos/animationLoader/?load=bvhskeletonpreview";
        }

        
    }

    login(session, callback) {
        this.FS.login(session.user, session.password, callback);
    }

    logout(callback) {
        const units = Object.keys(this.FS.getSession().units);
        let repo = {signs:[], presets: [], clips: []};
        for(let folder in this.repository) {

            for(let i = 0; i < this.repository[folder].length; i++) {
                if(this.repository[folder][i].id == "Local" || this.repository[folder][i].id == "Public" ) {
                    repo[folder].push(this.repository[folder][i]);
                }
            }
        }
        this.repository = repo;
        this.FS.logout(callback);
    }
    
    createAccount(user,pass, email, on_complete, on_error) {
        this.FS.createAccount(user, pass, email, (valid, request) => {
            if(valid)
            {
                this.FS.getSession().setUserPrivileges("signon", user, "READ", function(status, resp){
                    console.log(resp);						

                    if(status)
                        console.log(resp);						
                });
                this.FS.login(user, pass, () => {
                    this.getUnits();
                
                    if(this.createServerFolders) {
                        this.createServerFolders();
                        
                    if(on_complete)
                        on_complete(request);
                    }
                });
            }
            else if(on_error)
                on_error(request);
        });
    }

    createServerFolders() {
        const session = this.FS.getSession();
        this.FS.createFolder( session.user.username + "/animics/presets/", (v, r) => {console.log(v)} );
        this.FS.createFolder( session.user.username + "/animics/signs/", (v, r) => {console.log(v)} );
        this.FS.createFolder( session.user.username + "/animics/clips/", (v, r) => {console.log(v)} );
    }


    getUnits() {
        const session = this.FS.getSession();
        session.getUnits( (units) => {
            for(let i = 0; i < units.length; i++) {
                if(units[i].name == "signon") {
                    continue;
                }
                if(this.repository.signs.length) {
                    this.repository.signs.push({id:units[i].name == "signon" ? "Public": units[i].name , type:"folder", children: [], unit: units[i].name});
                }
                if(this.repository.presets.length) {
                    this.repository.presets.push({id:units[i].name == "signon" ? "Public": units[i].name , type:"folder", children: [], unit: units[i].name});
                }
                if(this.repository.clips.length) {
                    this.repository.clips.push({id:units[i].name == "signon" ? "Public": units[i].name , type:"folder", children: [], unit: units[i].name});
                }
            }
        });
    }

    async getAllUnitsFolders(root, callback) {
        const session = this.FS.getSession();
        const units_number = Object.keys(session.units).length;
        let count = 0;
        for(let unit in session.units) {     
            //get all folders for empty units
            await session.getFolders(unit, async (folders) =>  {
                const mainFolder = folders.animics[root];
                let assets = [];
                if(mainFolder) {
                    for(let folder in mainFolder) {
                        assets.push({id: folder, type: "folder", folder: root, children: [], unit: unit})
                    }
                }
                this.repository[root].push({id: unit == "signon" ? "Public" : unit, type:"folder",  children: assets, unit: unit});
                count++;
                if(units_number == count) {
                    this.repository[root].push(this.localStorage[root]);
                    if(callback)
                        callback();
                }
            })
        }
    }

    //Get folders from each user unit
    async getFolders(root, callback) {
        const session = this.FS.getSession();
        let count = 0;
        for(let i = 0; i < this.repository[root].length; i++) {

            const unit = this.repository[root][i].id == "Public" ? "signon" : this.repository[root][i].id;
            const variable = "refresh" + (root == "signs" ? "Signs" : "Presets") + "Repository";
            //get all folders for empty units
            if(!(unit == "Local" || this.repository[root][i].children.length) || this[variable] && unit == session.user.username) {

                await session.getFolders(unit, async (folders) =>  {
                    const mainFolder = folders.animics[root];
                    let assets = [];
                    if(mainFolder) {
                        for(let folder in mainFolder) {
                            assets.push({id: folder, type: "folder", folder: root, children: [], unit: unit})
                        }
                    }
                    this.repository[root][i].children = assets;
                    count++;
                    if(this.repository[root].length == count) {   
                        if(callback)
                            callback();
                    }
                })
                
            } else {
                if(unit == "Local") {
                    this.repository[root][i] = this.localStorage[root];
                }
                count++;
                if(this.repository[root].length == count) {

                    if(callback)
                        callback();
                }
            }
        }
        
    }

    getFilesFromUnit(unit, path, callback) {
        this.FS.getFiles(unit, path).then(callback) ;
    }

    updateData(filename, data, type, location, callback) {
        const extension = filename.split(".")[1];

        if(location == "server") {
            if(data.constructor.name == "Object") {
                data = JSON.stringify(data, null, 4);
            }
    
            this.uploadFile(filename, data, type, (v) => {
                let refreshType = "Signs";
                if(type == "presets") {
                    refreshType = "Presets";
                }
                else if (type == "clips") {
                    refreshType = ""
                }
                this["refresh" + refreshType + "Repository"] = true; 
                if(callback) 
                    callback(v);
            });   
            
        }
        else {
            const id = filename.replace("." + extension, "");
            this.localStorage[type].children.push({filename: id, id: id, folder: type, type: extension, data: data});
            
            if(callback)
                callback(filename);
        }
    }

    uploadFile(filename, data, type, callback = () => {}) {
        const session = this.FS.getSession();
        const username = session.user.username;
        const folder = "animics/"+ type;

        session.getFileInfo(username + "/" + folder + "/" + filename, (file) => {

            if(file.size) {
                // files = files.filter(e => e.unit === username && e.filename === filename);

                // if(files.length)
                // {
                    LX.prompt("Do you want to overwrite the file?", "File already exists", () => {
                        this.FS.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then( () => callback(filename));
                    }, {input: false, on_cancel: () => {
                        LX.prompt("Rename the file", "Save file", (v) => {
                            if(v === "" || !v) {
                                alert("You have to write a name.");
                                return;
                            }
                            this.FS.uploadFile(username + "/" + folder + "/" + v, new File([data], filename ), []).then( () => callback(v));
                        }, {input: filename} )
                    }} )
                // }
                
            }else
            {
                this.FS.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then(() => callback(filename));
            }
        },
        () => {
            //create folder
        });
    }
    
    deleteData(fullpath, type, location, callback) {

        if(location == "server") {
    
            this.deleteFile(fullpath, (v) => {
                this["refresh" + (type == "signs" ? "Signs":"Presets") +"Repository"] = true; 
                if(callback) 
                    callback(v);
            });   
            
        }
        // else {
        //     const id = filename.replace("." + extension, "");
        //     this.localStorage[type].children.push({filename: id, id: id, folder: type, type: extension, data: data});
            
        //     if(callback)
        //         callback(true);
        // }
    }

    deleteFile(fullpath, callback = () => {}) {
        const session = this.FS.getSession();
        session.deleteFile( fullpath, (v) => {callback(v)}, (v) => {callback(v)} )
    }

};

class KeyframeEditor extends Editor{
    
    constructor(app, mode) {
                
        super(app, mode);

        this.animationInferenceModes = {NN: 0, M3D: 1}; // either use ML or mediapipe 3d approach to generate an animation (see buildanimation and bindanimation)
        this.inferenceMode = new URLSearchParams(window.location.search).get("inference") == "NN" ? this.animationInferenceModes.NN : this.animationInferenceModes.M3D;

        this.defaultTranslationSnapValue = 0.1;
        this.defaultRotationSnapValue = 30; // Degrees
        this.defaultScaleSnapValue = 1;

        this.showSkeleton = true;
        
        this.applyRotation = false; // head and eyes rotation
        this.selectedAU = "Brow Left";
        this.selectedBone = "mixamorig_Hips";
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.nn = new NN("data/ML/model.json");
            this.nnSkeleton = null;
        }

        this.retargeting = null;
        
        this.mapNames = MapNames.map_llnames[this.character];
        this.gui = new KeyframesGui(this);

        this.video = this.gui.recordedVideo;
        this.video.startTime = 0;
        this.animationModes = {FACE: 0, BODY: 1};
        this.animationMode = this.animationModes.BODY;

        this.refreshRepository = false;
        this.localStorage = {clips: {id: "Local", type:"folder", children: []}};
    }
    
    startEdition(showGuide = true) {
        if(this.FS.session.user.username != "signon") {
            showGuide = false;
        }
        this.gui.init(showGuide);
        this.animate();
        this.setAnimation(this.animationModes.BODY);
        $('#loading').fadeOut();
    }

    async initCharacters()
    {
        // Create gizmo
        this.gizmo = new Gizmo(this);

        // Load current character
        this.loadCharacter(this.character);
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.loadNNSkeleton();
        }

        while(!this.loadedCharacters[this.character] || ( !this.nnSkeleton && this.inferenceMode == this.animationInferenceModes.NN ) ) {
            await new Promise(r => setTimeout(r, 1000));            
        }        

        this.setBoneSize(0.05);
    }

    loadNNSkeleton() {
        this.BVHloader.load( 'models/kateBVH.bvh', (result) => {
            // loader does not correctly compute the skeleton boneInverses and matrixWorld 
            result.skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
            result.skeleton = new THREE.Skeleton( result.skeleton.bones ); // will automatically compute boneInverses
            
            result.skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } ); // bodyAnimation have different names than bvh skeleton
            
            this.nnSkeleton = result.skeleton;
        });
    }

    onKeyDown(e) {
   
    }
    /** -------------------- CREATE ANIMATIONS FROM MEDIAPIPE -------------------- */
    
    setVideoVisibility( visibility ){ // TO DO
        //document.getElementById("capture").style.display = (visibility & this.video.sync) ? "" : "none";
        if(visibility) {
            this.gui.showVideoOverlay();
        }
        else {
            this.gui.hideVideoOverlay();
        }
    }

    /**Create face and body animations from mediapipe and load character*/
    buildAnimation(data) {

        this.loadedAnimations[data.name] = data;
        this.loadedAnimations[data.name].type = "video";
        this.loadedAnimations[data.name].export = true;

        let extensionIdx = data.name.lastIndexOf(".");
        if ( extensionIdx == -1 ){ // no extension
            extensionIdx = data.name.length; 
        }
        this.loadedAnimations[data.name].saveName = data.name.slice(0,extensionIdx);

        let {landmarks, blendshapes} = data ?? {};

        // Remove loop mode for the display video
        this.video.sync = true;
        this.video.loop = false;

        // old ML solution
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.nn.loadLandmarks( landmarks, 
                offsets => {
                   
                },
                (err) => {
                    alert(err, "Try it again."); 
                    window.location.reload();
                } 
            );
            // this.landmarksArray = this.processLandmarks( landmarks );
            // this.blendshapesArray = this.processBlendshapes( blendshapes );
    
            UTILS.makeLoading("");
    
            // Create body animation from mediapipe landmakrs using ML
            this.loadedAnimations[data.name].bodyAnimation = createAnimationFromRotations("bodyAnimation", this.nn); // bones animation THREEjs AnimationClip
        }
        else{
            this.loadedAnimations[data.name].bodyAnimation = landmarks; // array of objects of type { FLM, PLM, LLM, RLM, PWLM, LWLM, RWLM }. Not an animation clip
        }
        
        // Create face animation from mediapipe action units
        let faceAnimation = createAnimationFromActionUnits("faceAnimation", blendshapes); // faceAnimation is an action units clip
        this.loadedAnimations[data.name].faceAnimation = faceAnimation; // action units THREEjs AnimationClip

        this.bindAnimationToCharacter(data.name);
    }

    // load animation from bvh file
    loadAnimation(name, animationData) {

        let skeleton = null;
        let bodyAnimation = null;
        let faceAnimation = null;
        if ( animationData && animationData.skeletonAnim ){
            skeleton = animationData.skeletonAnim.skeleton;
            skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } );
            // loader does not correctly compute the skeleton boneInverses and matrixWorld 
            skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
            skeleton = new THREE.Skeleton( skeleton.bones ); // will automatically compute boneInverses
            
            animationData.skeletonAnim.clip.tracks.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } );     
            animationData.skeletonAnim.clip.name = "bodyAnimation";
            bodyAnimation = animationData.skeletonAnim.clip;
        }
        
        if ( animationData && animationData.blendshapesAnim ){
            animationData.blendshapesAnim.name = "faceAnimation";       
            faceAnimation = animationData.blendshapesAnim;
        }
        else {
            let names = {}
            for(let name in this.currentCharacter.blendshapesManager.mapNames) {
                names[name] = 0;
            }
            names.dt = 0;
            let data = [names];
            faceAnimation = createAnimationFromActionUnits("faceAnimation", data); // faceAnimation is an action units clip
            faceAnimation.duration = bodyAnimation.duration;
        }
        
        let extensionIdx = name.lastIndexOf(".");
        if ( extensionIdx == -1 ){ // no extension
            extensionIdx = name.length; 
        }
        let saveName = name.slice(0,extensionIdx);

        this.loadedAnimations[name] = {
            name: name,
            saveName: saveName,
            export: true,
            bodyAnimation: bodyAnimation ?? new THREE.AnimationClip( "bodyAnimation", -1, [] ), // THREEjs AnimationClip
            faceAnimation: faceAnimation ?? new THREE.AnimationClip( "faceAnimation", -1, [] ), // THREEjs AnimationClip
            skeleton: skeleton ?? this.currentCharacter.skeletonHelper.skeleton,
            type: "bvh"
        };

        this.bindAnimationToCharacter(name);
    }

    // Array of objects. Each object is a frame with all world landmarks. See mediapipe.js detections
    createBodyAnimationFromWorldLandmarks( worldLandmarksArray, skeleton ){
        function getTwistQuaternion( q, normAxis, outTwist ){
            let dot =  q.x * normAxis.x + q.y * normAxis.y + q.z * normAxis.z;
            outTwist.set( dot * normAxis.x, dot * normAxis.y, dot * normAxis.z, q.w )
            outTwist.normalize(); // already manages (0,0,0,0) quaternions by setting identity
            return outTwist;
        }

        function computeSpine( skeleton, bindQuats, bodyLandmarks ){
            if ( !bodyLandmarks ){ return; }
            //bodyLandmarks is an array of {x,y,z,visiblity} (mediapipe)

            const boneHips = skeleton.bones[ 0 ];
            boneHips.quaternion.copy( bindQuats[ 0 ] );
            const boneSpine0 = skeleton.bones[ 1 ]; // connected to hips
            boneSpine0.quaternion.copy( bindQuats[ 1 ] );
            const boneSpine1 = skeleton.bones[ 2 ];
            boneSpine1.quaternion.copy( bindQuats[ 2 ] );
            const boneSpine2 = skeleton.bones[ 3 ];
            boneSpine2.quaternion.copy( bindQuats[ 3 ] );
            const boneLeftLeg = skeleton.bones[ 57 ]; // connected to hips
            const boneRightLeg = skeleton.bones[ 62 ]; // connected to hips
    

            boneHips.updateWorldMatrix( true, true );
    
            const landmarkHipsLeft = bodyLandmarks[ 23 ];
            const landmarkHipsRight = bodyLandmarks[ 24 ];
            const landmarkShoulderLeft = bodyLandmarks[ 11 ];
            const landmarkShoulderRight = bodyLandmarks[ 12 ];
            const landmarkHipsMid = new THREE.Vector3(0,0,0);
            const landmarkShoulderMid = new THREE.Vector3(0,0,0);
            let dirHipsPred = ( new THREE.Vector3() ).subVectors( landmarkHipsRight, landmarkHipsLeft ); 
            let dirShoulderPred = ( new THREE.Vector3() ).subVectors( landmarkShoulderRight, landmarkShoulderLeft ); 
            landmarkHipsMid.addScaledVector( dirHipsPred, 0.5).add( landmarkHipsLeft );
            landmarkShoulderMid.addScaledVector( dirShoulderPred, 0.5).add( landmarkShoulderLeft );
            let dirSpinePred = ( new THREE.Vector3() ).subVectors( landmarkShoulderMid, landmarkHipsMid ).normalize();
    
            const dirBone = new THREE.Vector3();
            const _ignoreVec3 = new THREE.Vector3();
            const invWorldQuat = new THREE.Quaternion();
            const qq = new THREE.Quaternion();
            const tempQuat = new THREE.Quaternion();
            
            // hips
            boneHips.matrixWorld.decompose( _ignoreVec3, invWorldQuat, _ignoreVec3 );
            invWorldQuat.invert();
    
            dirHipsPred.applyQuaternion( invWorldQuat ).normalize(); // world direction to local hips space
            dirBone.subVectors( boneRightLeg.position, boneLeftLeg.position ).normalize(); // Local hips space
            qq.setFromUnitVectors( dirBone, dirHipsPred ).normalize();
            let twist = getTwistQuaternion( qq, dirBone, tempQuat ); // remove unwanted roll forward/backward
            qq.multiply( twist.invert() );
            boneHips.quaternion.multiply( qq );
            invWorldQuat.premultiply( qq.invert() );

            // spine
            dirSpinePred.applyQuaternion( invWorldQuat ); // world direction to local hips space
            boneSpine2.updateWorldMatrix( true, false );
            dirBone.setFromMatrixPosition( boneSpine2.matrixWorld ); // world position of shoulders union
            dirBone.applyMatrix4( boneHips.matrixWorld.clone().invert() ); //world position to local direction hips space
            qq.setFromUnitVectors( dirBone, dirSpinePred ).normalize();
            // divide final rotation into for offset (one for each hips-spine bone) (nlerp with identityQuat)
            let f= 1.0/4.0;
            qq.x = qq.x * f;
            qq.y = qq.y * f;
            qq.z = qq.z * f;
            qq.w = qq.w * f + 1 * (1-f);
            qq.normalize();
            boneHips.quaternion.multiply(qq);
    
            // move qq from left_spine0_Quat to right_spine_Quat.  
            // Q = (hips * qq) * spine0Quat = hips * (qq * spine0Quat) = hips * spine0Quat * qq'
            qq.multiply( boneSpine0.quaternion ).premultiply( tempQuat.copy( boneSpine0.quaternion ).invert() );
            boneSpine0.quaternion.multiply( qq );
    
            // Q = (spine0Quat * qq') * spine1Quat = spine0Quat * (qq' * spine1Quat) = spine0Quat * spine1Quat * qq''
            qq.multiply( boneSpine1.quaternion ).premultiply( tempQuat.copy( boneSpine1.quaternion ).invert() );
            boneSpine1.quaternion.multiply( qq );

            // // Q = (spine1Quat * qq'') * spine2Quat = spine1Quat * (qq'' * spine2Quat) = spine1Quat * spine2Quat * qq'''
            // qq.multiply( boneSpine2.quaternion ).premultiply( tempQuat.copy( boneSpine2.quaternion ).invert() );
            // boneSpine2.quaternion.multiply( qq );
            boneSpine2.quaternion.premultiply( qq );
        }
    
        function computeQuatHead( skeleton, bindQuats, bodyLandmarks ){
            if ( !bodyLandmarks ){ return; }
            //bodyLandmarks is an array of {x,y,z,visiblity} (mediapipe)

            let tempVec3 = new THREE.Vector3();
            let qq = new THREE.Quaternion();

            const boneHead = skeleton.bones[ 5 ]; // head
            boneHead.quaternion.copy( bindQuats[ 5 ] );
            const boneHeadTop = skeleton.bones[ 8 ]; // head top, must be a children of head
            boneHead.updateWorldMatrix( true, false );
            // avatar bone local space direction
            let headBoneDir = boneHeadTop.position.clone().normalize();
    
            // world space
            let earsDirPred = (new THREE.Vector3()).subVectors( bodyLandmarks[8], bodyLandmarks[7] ).normalize();
            let earNoseDirPred = (new THREE.Vector3()).subVectors( bodyLandmarks[0], bodyLandmarks[7] ).normalize();
            let upHeadDirPred = (new THREE.Vector3()).crossVectors( earsDirPred, earNoseDirPred ).normalize(); // will change to local
            let forwardHeadDirPred = (new THREE.Vector3()).crossVectors( upHeadDirPred, earsDirPred ).normalize();
            
            boneHead.matrixWorld.decompose( tempVec3, qq, tempVec3 );
            qq.invert(); // invWorldQuat
            upHeadDirPred.applyQuaternion( qq ).normalize(); // local space
        
            // move head to predicted direction (SWING)
            qq.setFromUnitVectors( headBoneDir, upHeadDirPred );
            boneHead.quaternion.multiply( qq )
            getTwistQuaternion( qq, headBoneDir, qq ); // unwanted twist from the swing operation
            boneHead.quaternion.multiply( qq.invert() ).normalize(); // remove twist
            
            // compute head roll (TWIST)
            tempVec3.set(-1,0,0); // because of mediapipe points
            let angle = Math.acos( forwardHeadDirPred.dot( tempVec3 ) ); // computing in world space
            angle -= Math.PI/2;
            qq.setFromAxisAngle( headBoneDir, angle ); // angle does not which space is in
            boneHead.quaternion.multiply( qq ).normalize();
        }
    
        function computeQuatArm( skeleton, bodyLandmarks, isLeft = false ){
            if ( !bodyLandmarks ){ return; }
            //bodyLandmarks is an array of {x,y,z,visiblity} (mediapipe)

            let landmarks = isLeft? [ 11,13,15 ] : [ 12,14,16 ];
            let boneIdxs = isLeft? [ 10,11,12 ] : [ 34,35,36 ]; // [arm, elbow, wrist]
    
            let _ignoreVec3 = new THREE.Vector3();
            let invWorldQuat = new THREE.Quaternion();
            let dirPred = new THREE.Vector3();
            let dirBone = new THREE.Vector3();
            let qq = new THREE.Quaternion();
            let twist = new THREE.Quaternion();

            for( let i = 0; i < (landmarks.length-1); ++i ){
                let boneSrc = skeleton.bones[ boneIdxs[ i ] ];
                let boneTrg = skeleton.bones[ boneIdxs[ i+1 ] ];
                let landmarkSrc = bodyLandmarks[ landmarks[i] ];
                let landmarkTrg = bodyLandmarks[ landmarks[i+1] ];
                boneSrc.updateWorldMatrix( true, false );
    
                boneSrc.matrixWorld.decompose( _ignoreVec3, invWorldQuat, _ignoreVec3 );
                invWorldQuat.invert();
    
                // world mediapipe phalange direction to local space
                dirPred.subVectors( landmarkTrg, landmarkSrc );
                dirPred.applyQuaternion( invWorldQuat ).normalize();
    
                // avatar bone local space direction
                dirBone.copy( boneTrg.position ).normalize();
    
                // move bone to predicted direction
                qq.setFromUnitVectors( dirBone, dirPred );
                boneSrc.quaternion.multiply( qq );
                getTwistQuaternion( qq, dirBone, twist ); // remove twist from phalanges
                boneSrc.quaternion.multiply( twist.invert() ).normalize();
            }
        }

        function computeQuatHand( skeleton, handLandmarks, isLeft = false ){
            if ( !handLandmarks ){ return; }
            //handlandmarks is an array of {x,y,z,visiblity} (mediapipe)

            const boneHand = isLeft? skeleton.bones[ 12 ]:  skeleton.bones[ 36 ];
            const boneMid = isLeft? skeleton.bones[ 21 ]:  skeleton.bones[ 45 ];
            // const boneThumbd = isLeft? skeleton.bones[ 13 ]:  skeleton.bones[ 53 ];
            const bonePinky = isLeft? skeleton.bones[ 29 ]:  skeleton.bones[ 37 ];
            const boneIndex = isLeft? skeleton.bones[ 17 ]:  skeleton.bones[ 49 ];
    
            boneHand.updateWorldMatrix( true, false );
    
            let _ignoreVec3 = new THREE.Vector3();
            let invWorldQuat = new THREE.Quaternion();
            boneHand.matrixWorld.decompose( _ignoreVec3, invWorldQuat, _ignoreVec3 ); // get L to W quat
            invWorldQuat.invert(); // W to L
    
            // metacarpian middle finger 
            let mcMidPred = new THREE.Vector3(); 
            mcMidPred.subVectors( handLandmarks[9], handLandmarks[0] ); // world
            mcMidPred.applyQuaternion( invWorldQuat ).normalize(); // hand local space
            
            //swing (with unwanted twist)
            let dirBone = boneMid.position.clone().normalize();
            let qq = new THREE.Quaternion();
            qq.setFromUnitVectors( dirBone, mcMidPred );
            boneHand.quaternion.multiply( qq );
            invWorldQuat.premultiply( qq.invert() ); // update hand's world to local quat
    
            // twist
            let mcPinkyPred = (new THREE.Vector3()).subVectors( handLandmarks[17], handLandmarks[0] );
            let mcIndexPred = (new THREE.Vector3()).subVectors( handLandmarks[5], handLandmarks[0] );
            let palmDirPred = (new THREE.Vector3()).crossVectors(mcPinkyPred, mcIndexPred).normalize(); // world space
            palmDirPred.applyQuaternion( invWorldQuat ).normalize(); // local space
            let palmDirBone = (new THREE.Vector3()).crossVectors(bonePinky.position, boneIndex.position).normalize(); // local space. Cross product "does not care" about input sizes
            qq.setFromUnitVectors( palmDirBone, palmDirPred ).normalize();
            boneHand.quaternion.multiply( qq ).normalize();
        }
    
        function computeQuatPhalange( skeleton, bindQuats, handLandmarks, isLeft = false ){
            if ( !handLandmarks ){ return; }
            //handlandmarks is an array of {x,y,z,visiblity} (mediapipe)

            let bonePhalanges = isLeft ? 
            [ 13,14,15,16,    17,18,19,20,    21,22,23,24,    25,26,27,28,    29,30,31,32 ] :
            [ 53,54,55,56,    49,50,51,52,    45,46,47,48,    41,42,43,44,    37,38,39,40 ];
    
            let _ignoreVec3 = new THREE.Vector3();
            let invWorldQuat = new THREE.Quaternion();
            let phalangeDirPred = new THREE.Vector3();
            let phalangeDirBone = new THREE.Vector3();
            let qq = new THREE.Quaternion();
            let twist = new THREE.Quaternion();

            //handlandmarks[0] == wrist, handlandmarks[1:4] = thumb, handlandmarks[5:8] = index, etc 
            //bonePhalanges[0:3] = thumb, bonePhalanges[4:7] = index, etc 
            for(let i = 1; i < handLandmarks.length; ++i ){
                if ( i % 4 == 0 ){ continue; } // tip of fingers does not need quaternion
                
                let boneSrc = skeleton.bones[ bonePhalanges[ i-1 ] ];
                let boneTrg = skeleton.bones[ bonePhalanges[ i ] ];
                let landmark = i;
                boneSrc.quaternion.copy( bindQuats[ bonePhalanges[ i-1 ] ] );
                boneSrc.updateWorldMatrix( true, false );
    
                boneSrc.matrixWorld.decompose( _ignoreVec3, invWorldQuat, _ignoreVec3 );
                invWorldQuat.invert();
    
                // world mediapipe phalange direction to local space
                phalangeDirPred.subVectors( handLandmarks[landmark+1], handLandmarks[landmark] ); // world space
                phalangeDirPred.applyQuaternion( invWorldQuat ).normalize(); // local phalange direction space
    
                // avatar bone local space direction
                phalangeDirBone.copy( boneTrg.position ).normalize();
    
                // move bone to predicted direction
                qq.setFromUnitVectors( phalangeDirBone, phalangeDirPred );
                getTwistQuaternion( qq, phalangeDirBone, twist ); // remove twist from phalanges
                boneSrc.quaternion.multiply( qq ).multiply( twist.invert() ).normalize();
            }
        }

        skeleton.pose(); // bind pose

        let tracks = [];
        let bindQuats = [];
        for( let i = 0; i < skeleton.bones.length; ++i ){
            tracks.push( new Float32Array( worldLandmarksArray.length * 4 ) );
            bindQuats.push( skeleton.bones[i].quaternion.clone() );
        }
        let times = new Float32Array( worldLandmarksArray.length );
        let timeAcc = 0;

        // for each frame compute and update quaternions
        for( let i = 0; i < worldLandmarksArray.length; ++i ){
            let body = worldLandmarksArray[i].PWLM;
            let rightHand = worldLandmarksArray[i].RWLM;
            let leftHand = worldLandmarksArray[i].LWLM;

            computeSpine( skeleton, bindQuats, body );
            computeQuatHead( skeleton, bindQuats, body );

            // right arm-hands
            computeQuatArm( skeleton, body, false );
            computeQuatHand( skeleton, rightHand, false); 
            computeQuatPhalange( skeleton, bindQuats, rightHand, false );
            
            // left arm-hands
            computeQuatArm( skeleton, body, true );
            computeQuatHand( skeleton, leftHand, true ); 
            computeQuatPhalange( skeleton, bindQuats, leftHand, true );

            // remove hips delta rotation from legs (children of hips). Hardcoded for EVA 
            skeleton.bones[62].quaternion.copy( skeleton.bones[0].quaternion ).invert().multiply( bindQuats[0] ).multiply( bindQuats[62] );
            skeleton.bones[57].quaternion.copy( skeleton.bones[0].quaternion ).invert().multiply( bindQuats[0] ).multiply( bindQuats[57] );

            // store skeleton quat values
            for( let j = 0; j < skeleton.bones.length; ++j ){
                tracks[j].set( skeleton.bones[j].quaternion.toArray(), i * 4 );
            }

            // store timing
            if (i != 0){ timeAcc += worldLandmarksArray[i].dt/1000; }
            times[i] = timeAcc;  
        }

        // for each bone create a quat track
        for( let i = 0; i < skeleton.bones.length; ++i ){
            tracks[i] = new THREE.QuaternionKeyframeTrack( skeleton.bones[i].name + ".quaternion", times.slice(), tracks[i] );
        }

        return new THREE.AnimationClip( "animation", -1, tracks );
    }

    /**
     * KeyframeEditor: fetches a loaded animation and applies it to the character. The first time an animation is binded, it is processed and saved. Afterwards, this functino just changes between existing animations 
     * @param {String} animationName 
     */
    bindAnimationToCharacter(animationName) {
        
        let animation = this.loadedAnimations[animationName];
        if(!animation) {
            console.warn(animationName + " not found");
            return false;
        }

        this.currentAnimation = animationName;

        if ( animationName != this.currentAnimation ){
            this.gui.keyFramesTimeline.unSelectAllKeyFrames();
            this.gui.keyFramesTimeline.unHoverAll();
            this.gui.keyFramesTimeline.currentTime = 0;
            this.gui.curvesTimeline.unSelectAllKeyFrames();
            this.gui.curvesTimeline.unHoverAll();
            this.gui.curvesFramesTimeline.currentTime = 0;
        }

        // Remove current animation clip
        let mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();

        while(mixer._actions.length){
            mixer.uncacheClip(mixer._actions[0]._clip); // removes action
        }
        this.currentCharacter.skeletonHelper.skeleton.pose(); // for some reason, mixer.stopAllAction makes bone.position and bone.quaternions undefined. Ensure they have some values

        // if not yet binded, create it. Otherwise just change to the existing animation
        if ( !this.bindedAnimations[animationName] || !this.bindedAnimations[animationName][this.currentCharacter.name] ) {
            let bodyAnimation = animation.bodyAnimation;        
            let skeletonAnimation = null;
        
            if(bodyAnimation) {
                if ( animation.type == "video" && this.inferenceMode == this.animationInferenceModes.M3D ){ // mediapipe3d animation inference algorithm
                    bodyAnimation = this.createBodyAnimationFromWorldLandmarks( animation.bodyAnimation, this.currentCharacter.skeletonHelper.skeleton );
                } 
                else { // bvh (and old ML system) retarget an existing animation
                    let tracks = [];        
                    // Remove position changes (only keep i == 0, hips)
                    for (let i = 0; i < bodyAnimation.tracks.length; i++) {
                        if(i && bodyAnimation.tracks[i].name.includes('position')) {
                            continue;
                        }
                        tracks.push(bodyAnimation.tracks[i]);
                        tracks[tracks.length - 1].name = tracks[tracks.length - 1].name.replace( /[\[\]`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "").replace(".bones", "");
                    }

                    bodyAnimation.tracks = tracks;            
                    let skeleton = animation.skeleton ?? this.nnSkeleton;
                    
                    // Retarget NN animation              
                    // trgEmbedWorldTransform: take into account external rotations like the model (bone[0].parent) quaternion
                    let retargeting = new AnimationRetargeting(skeleton, this.currentCharacter.skeletonHelper.skeleton, { trgEmbedWorldTransforms: true } ); // both skeletons use their native bind pose
                    bodyAnimation = retargeting.retargetAnimation(bodyAnimation);                    
                }

                this.validateBodyAnimationClip(bodyAnimation);

                // set track value dimensions. Necessary for the timeline
                for( let i = 0; i < bodyAnimation.tracks.length; ++i ){
                    let t = bodyAnimation.tracks[i]; 
                    if ( t.name.endsWith(".quaternion") ){ t.dim = 4; }
                    else{ t.dim = 3; }
                }
                // Set keyframe animation to the timeline and get the timeline-formated one
                skeletonAnimation = this.gui.keyFramesTimeline.setAnimationClip( bodyAnimation, true );
                this.gui.keyFramesTimeline.setSelectedItems([this.currentCharacter.skeletonHelper.bones[0].name]);

                bodyAnimation.name = "bodyAnimation";   // mixer
                skeletonAnimation.name = "bodyAnimation";  // timeline
            }
                
            let faceAnimation = animation.faceAnimation;        
            let auAnimation = null;
            if(faceAnimation) {
                
                // set track value dimensions. Necessary for the timeline, although it should automatically default to 1
                for( let i = 0; i < faceAnimation.tracks.length; ++i ){
                    faceAnimation.tracks[i].dim = 1;
                }
                // Set keyframe animation to the timeline and get the timeline-formated one.
                auAnimation = this.gui.curvesTimeline.setAnimationClip( faceAnimation, true );
                // if(animation.type == "video" || animation.type == "video") {
                    faceAnimation = this.currentCharacter.blendshapesManager.createBlendShapesAnimation(animation.blendshapes);
                // }

                faceAnimation.name = "faceAnimation";   // mixer
                auAnimation.name = "faceAnimation";  // timeline
                this.validateFaceAnimationClip(faceAnimation);

            }
            
            if(!this.bindedAnimations[animationName]) {
                this.bindedAnimations[animationName] = {};
            }
            this.bindedAnimations[animationName][this.currentCharacter.name] = {
                source: animationName,
                skeletonAnimation, auAnimation, // from gui timeline. Main data
                mixerBodyAnimation: bodyAnimation, mixerFaceAnimation: faceAnimation // for threejs mixer. ALWAYS relies on timeline data
            }
        }

        // set mixer animations
        let bindedAnim = this.bindedAnimations[animationName][this.currentCharacter.name];
        mixer.clipAction(bindedAnim.mixerFaceAnimation).setEffectiveWeight(1.0).play(); // already handles nulls and undefineds
        mixer.clipAction(bindedAnim.mixerBodyAnimation).setEffectiveWeight(1.0).play();
        
        // set timeline animations
        this.setAnimation(this.animationMode);
        this.gizmo.updateBones();
        // mixer.setTime(0);

        if ( animation.type == "video" ){
            this.video.sync = true;
            this.setVideoVisibility(true);
            this.video.onloadeddata = () =>{
                this.video.currentTime = Math.max( this.video.startTime, Math.min( this.video.endTime, this.activeTimeline.currentTime ) );
                if ( this.activeTimeline.playing ){
                    this.video.play();
                }            
            }
            this.video.src = animation.videoURL;
            this.video.startTime = animation.startTime ?? 0;
            this.video.endTime = animation.endTime ?? 1;
        }else{
            this.video.sync = false;
            this.setVideoVisibility(false);
        }

        return true;
    }

    /** Validate body animation clip created using ML 
     * THREEJS AnimationClips CANNOT have tracks with 0 entries
    */
    validateBodyAnimationClip(clip) {

        let tracks = clip.tracks;
        let bones = this.currentCharacter.skeletonHelper.bones;

        let quatCheck = new Array(bones.length);
        quatCheck.fill(false);
        let posCheck = false; //root only

        // ensure each track has at least one valid entry. Default to current avatar pose
        for( let i = 0; i < tracks.length; ++i ){
            let t = tracks[i];
            let trackBoneName = t.name.substr(0, t.name.lastIndexOf("."));
            let boneIdx = findIndexOfBoneByName( this.currentCharacter.skeletonHelper.skeleton, trackBoneName );
            if ( boneIdx < 0 ){ continue; }
            let bone = bones[ boneIdx ];
            if ( !t.values.length || !t.times.length ){
                t.times = new Float32Array([0]);
                if ( t.name.endsWith(".position") ){ t.values = new Float32Array( bone.position.toArray() ); }
                else if ( t.name.endsWith(".quaternion") ){ t.values = new Float32Array( bone.quaternion.toArray() ); }
                else if ( t.name.endsWith(".scale") ){ t.values = new Float32Array( bone.scale.toArray() ); }
            }

            if ( t.name.endsWith(".quaternion") ){ quatCheck[boneIdx] = true; }
            if ( t.name.endsWith(".position") && boneIdx==0 ){ posCheck = true; }
        }

        // ensure every bone has its track
        if ( !posCheck ){
            let track = new THREE.VectorKeyframeTrack(bones[0].name + '.position', [0], bones[0].position.toArray());
            clip.tracks.push(track);
        }
        for( let i = 0; i < quatCheck.length; ++i ){
            if ( !quatCheck[i] ){
                let track = new THREE.QuaternionKeyframeTrack(bones[i].name + '.quaternion', [0], bones[i].quaternion.toArray());
                clip.tracks.push(track);    
            }
        }
    }

    /** Validate face animation clip created using Mediapipe 
     * THREEJS AnimationClips CANNOT have tracks with 0 entries
    */
    validateFaceAnimationClip(clip) {

        let tracks = clip.tracks;
        let blendshapes = this.currentCharacter.morphTargets;

        let bsCheck = new Array(blendshapes.length);
        bsCheck.fill(false);

        // ensure each track has at least one valid entry. Default to current avatar pose
        for( let i = 0; i < tracks.length; ++i ){
            let t = tracks[i];
            let trackBSName = t.name.substr(0, t.name.lastIndexOf("."));
            // Find blendshape index
            if ( !t.values.length || !t.times.length ){
                t.times = new Float32Array([0]);
                // if ( t.name.endsWith(".position") ){ t.values = new Float32Array( bone.position.toArray() ); }
                // else if ( t.name.endsWith(".quaternion") ){ t.values = new Float32Array( bone.quaternion.toArray() ); }
                // else if ( t.name.endsWith(".scale") ){ t.values = new Float32Array( bone.scale.toArray() ); }
            }

            // if ( t.name.endsWith(".quaternion") ){ quatCheck[boneIdx] = true; }
            // if ( t.name.endsWith(".position") && boneIdx==0 ){ posCheck = true; }
        }

        // ensure every blendshape has its track        
        // for( let i = 0; i < bsCheck.length; ++i ){
        //     if ( !bsCheck[i] ){
        //         let track = new THREE.QuaternionKeyframeTrack(bones[i].name + '.quaternion', [0], bones[i].quaternion.toArray());
        //         clip.tracks.push(track);    
        //     }
        // }
    }

    loadFiles(files) {
        const animExtensions = ['bvh','bvhe'];
        let resultFiles = [];
        let mode = "";
        // first valid file will determine the mode. Following files must be of the same format
        for(let i = 0; i < files.length; ++i){
            // MIME type is video
            if(files[i].type.startsWith("video/")) { 
                if (!mode) { mode = "video"; }
                
                if ( mode == "video" ){
                    resultFiles.push( files[i] );
                }
                continue;
            }
            // other valid file formats
            const extension = UTILS.getExtension(files[i].name).toLowerCase();
                            
            if(animExtensions.includes(extension)) { 
                if (!mode) { mode = "bvh"; }
                
                if ( mode == "bvh"){
                    const modal = this.gui.createAnimation();
                    resultFiles.push( files[i] );
                    this.fileToAnimation(files[i], (file) => {
                        this.loadAnimation( file.name, file.animation );
                        modal.close();
                    });
                }
            }
        }
    }

    onPlay() {
    
        
        this.gui.setBoneInfoState( false );
        if(this.video.sync) {
            try{
                this.video.paused ? this.video.play() : 0;    
            }catch(ex) {
                console.error("video warning");
            }
        }

    }

    // Stop all animations 
    onStop() {

        this.gizmo.updateBones();
        if(this.video.sync) {
            this.video.pause();
            this.video.currentTime = this.video.startTime;
        }
    }

    onPause() {
        this.state = false;
        if(this.video.sync) {
            try{
                !this.video.paused ? this.video.pause() : 0;    
            }catch(ex) {
                console.error("video warning");
            }
        }
        this.gui.setBoneInfoState( !this.state );
        this.gui.propagationWindow.setTime( this.currentTime );
    }

    setTime(t, force) {

        // Don't change time if playing

        if(this.state && !force)
            return;

        // mixer computes time * timeScale. We actually want to set the raw animation (track) time, without any timeScale 
        this.currentCharacter.mixer.setTime(t / this.currentCharacter.mixer.timeScale ); // already calls mixer.update
        this.currentCharacter.mixer.update(0); // BUG: for some reason this is needed. Otherwise, after sme timeline edition + optimization, weird things happen

        // Update video
        this.video.currentTime = this.video.startTime + t;
        this.currentTime = t;
        this.gizmo.updateBones();
    }

    /**
     * This function updates the mixer animation actions so the edited tracks are assigned to the interpolants.
     * WARNING It uses the editedAnimation tracks directly, without cloning them.
     * Modifying the values/times of editedAnimation will also modify the values of mixer
     * @param {animation} editedAnimation for body it is the timeline skeletonAnimation. For face it is the timeline auAnimation with the updated blendshape values
     * @param {Number or Array of Numbers} trackIdxs a -1 will force an update to all tracks
     * @returns 
     */
    updateAnimationAction(editedAnimation, trackIdxs) {
        // for bones editedAnimation is the timeline skeletonAnimation
        // for blendshapes editedAnimation is the timeline auAnimation
    
        if(this.animationMode == this.editionModes.SCRIPT) { 
            return;
        }
        
        const mixer = this.currentCharacter.mixer;
    
        if(!mixer._actions.length) {
            return;
        }
    
        if(typeof trackIdxs == 'number') {
            // get all indices
            if( trackIdxs == -1 ){ 
                trackIdxs = new Int32Array( editedAnimation.tracks.length );
                trackIdxs.forEach( (v,i) => trackIdxs[i] = i );
                // trackIdxs = Object.keys( editedAnimation.tracks ); // returns strings 
            }else{
                trackIdxs = [trackIdxs];
            }
        }
                     
        const isFaceAnim = editedAnimation.name == "faceAnimation";
        for(let i = 0; i< mixer._actions.length; i++) {
            if(mixer._actions[i]._clip.name == editedAnimation.name) { // name == ("bodyAnimation" || "faceAnimation")
                const mixerClip = mixer._actions[i]._clip;
                let mapTrackIdxs = {};

                // If the editedAnimation is an auAnimation, the tracksIdx have to be mapped to the mixerAnimation tracks indices
                if(isFaceAnim ) {
                    for(let j = 0; j < trackIdxs.length; j++) {
                        const trackIdx = trackIdxs[j];
                        const track = editedAnimation.tracks[trackIdx];
                        mapTrackIdxs[trackIdx] = [];

                        let bsNames = this.currentCharacter.blendshapesManager.mapNames[track.type];
                        if ( !bsNames ){ 
                            continue; 
                        }
                        if(typeof(bsNames) == 'string') {
                            bsNames = [bsNames];
                        }

                        for(let b = 0; b < bsNames.length; b++) {
                            for(let t = 0; t < mixerClip.tracks.length; t++) {
                                if(mixerClip.tracks[t].name.includes("[" + bsNames[b] + "]")) {
                                    mapTrackIdxs[trackIdx].push(t);
                                    // break; // do not break, need to check all meshes that contain this blendshape
                                }
                            }
                        }
                    }                    
                }

                for(let j = 0; j < trackIdxs.length; j++) {
                    const trackIdx = trackIdxs[j];
                    const mapTrackIdx = mapTrackIdxs[trackIdx] || [trackIdx];
                    const track = editedAnimation.tracks[trackIdx];
                    if(track.locked || !mapTrackIdx.length){
                        continue;
                    }
                    
                    for(let t = 0; t < mapTrackIdx.length; t++) {

                        const interpolant = mixer._actions[i]._interpolants[mapTrackIdx[t]];                                           
                       
                        // THREEJS mixer uses interpolants to drive animations. _clip is only used on animationAction creation. 
                        // _clip is the same clip (pointer) sent in mixer.clipAction. 

                        if (track.active){
                            interpolant.parameterPositions = mixerClip.tracks[mapTrackIdx[t]].times = track.times;
                            interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = track.values; 
                        }else{
                            interpolant.parameterPositions = mixerClip.tracks[mapTrackIdx[t]].times = [0];
                            if (isFaceAnim){
                                interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = [0];
                            }else{
                                // TODO optimize if necessary
                                let skeleton =this.currentCharacter.skeletonHelper.skeleton;
                                let invMats = this.currentCharacter.skeletonHelper.skeleton.boneInverses;
                                let boneIdx = findIndexOfBoneByName(skeleton, track.name);
                                let parentIdx = findIndexOfBone(skeleton, skeleton.bones[boneIdx].parent);
                                let localBind = invMats[boneIdx].clone().invert();
                                if ( parentIdx > -1 ){ 
                                    localBind.premultiply(invMats[parentIdx]); 
                                }
                                let p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
                                localBind.decompose( p,q,s );
                                // assuming quats and position only. Missing Scale
                                if(track.dim == 4){
                                    interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = q.toArray();//[0,0,0,1];
                                }else{
                                    interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = p.toArray();//[0,0,0];
                                }
                            } 

                        }
                    }
                }

                // mixer.stopAllAction();
                // mixer.uncacheAction(mixerClip);
                // mixer.clipAction(mixerClip).setEffectiveWeight(1.0).play();
                
                this.setTime(this.activeTimeline.currentTime);
                return;
            }
        }
        
    }    

    /** -------------------- BONES INTERACTION -------------------- */
    getSelectedBone() {
        const idx = this.gizmo.selectedBone;
        return idx == -1 ? undefined : this.currentCharacter.skeletonHelper.bones[ idx ];
    }

    setBoneSize(newSize) {
        const geometry = this.gizmo.bonePoints.geometry;
        const positionAttribute = geometry.getAttribute( 'position' );
        this.gizmo.bonePoints.geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( new Array(positionAttribute.count).fill(newSize), 1 ) );
        this.gizmo.raycaster.params.Points.threshold = newSize/10;
    }

    getBoneSize() {
        const geometry = this.gizmo.bonePoints.geometry;
        return geometry.getAttribute('size').array[0];
    }

    setSelectedBone( name ) {

        if(!this.gizmo)
        throw("No gizmo attached to scene");
    
        if(this.animationMode != this.animationModes.BODY) {
            this.setAnimation(this.animationModes.BODY);
            return; // will call again setSelectedBone
        }
        this.selectedBone = name;

        this.activeTimeline.setSelectedItems( [this.selectedBone] );

        // selectkeyframe at current keyframe if possible
        let track = this.activeTimeline.animationClip.tracksPerItem[this.selectedBone][0];
        let keyframe = this.activeTimeline.getCurrentKeyFrame(track, this.activeTimeline.currentTime, 0.1 );
        this.activeTimeline.processCurrentKeyFrame( {}, keyframe, track, null, false );

        this.gizmo.setBone(name);
        this.gizmo.mustUpdate = true;
        this.gui.updateSkeletonPanel();
        
        if ( this.gui.tree ){ 
            this.gui.tree.select(this.selectedBone)
        }
    }

    /** -------------------- GIZMO INTERACTION -------------------- */
    hasGizmoSelectedBoneIk( mode = null ) {
        if ( mode == null ) {
            return this.gizmo.hasBoneIkChain( this.gizmo.skeleton.bones[this.gizmo.selectedBone], Gizmo.ToolIkModes.LARGECHAIN ) || 
                   this.gizmo.hasBoneIkChain( this.gizmo.skeleton.bones[this.gizmo.selectedBone], Gizmo.ToolIkModes.ONEBONE ); 
        } 
        else{
            return this.gizmo.hasBoneIkChain( this.gizmo.skeleton.bones[this.gizmo.selectedBone], mode ); 
        }
    }
    
    getGizmoTool() { 
        return ( this.gizmo.toolSelected == Gizmo.Tools.IK ) ? "Follow" : "Joint"; 
    }

    setGizmoTool( tool ) { 
        if ( tool == "Follow" ){ this.gizmo.setTool( Gizmo.Tools.IK ); }
        else { this.gizmo.setTool( Gizmo.Tools.JOINT ); }
    }

    getGizmoMode() {
        return UTILS.firstToUpperCase( this.gizmo.mode );
    }

    setGizmoMode( mode ) {
        if(!mode.length)
        throw("Invalid Gizmo mode");
        
        this.gizmo.setMode( mode.toLowerCase() );
    }
    getGizmoIkMode(){
        return this.gizmo.ikMode == Gizmo.ToolIkModes.LARGECHAIN ? "Multiple" : "Single";
    }
    
    setGizmoIkMode( mode ){
        this.gizmo.setMode( mode == "Multiple" ? Gizmo.ToolIkModes.LARGECHAIN : Gizmo.ToolIkModes.ONEBONE ); //!!!!!! TO DO: setMode is being used with Joint and IK mode. This might create conflicts
    }

    getGizmoSpace() {
        return UTILS.firstToUpperCase( this.gizmo.transform.space );
    }

    setGizmoSpace( space ) {
        if(!space.length)
        throw("Invalid Gizmo mode");
        
        this.gizmo.setSpace( space.toLowerCase() );
    }

    getGizmoSize() {
        return this.gizmo.transform.size;
    }

    setGizmoSize( size ) {
        
        this.gizmo.transform.setSize( size );
    }

    isGizmoSnapActive() {

        if( this.getGizmoMode() === 'Translate' )
            return this.gizmo.transform.translationSnap != null;
        else if( this.getGizmoMode() === 'Rotate' )
            return this.gizmo.transform.rotationSnap != null;
        else
            return this.gizmo.transform.scaleSnap != null;

    }
    
    toggleGizmoSnap() {

        if( this.getGizmoMode() === 'Translate' )
            this.gizmo.transform.setTranslationSnap( this.isGizmoSnapActive() ? null : this.defaultTranslationSnapValue );
        else if( this.getGizmoMode() === 'Rotate' )
            this.gizmo.transform.setRotationSnap( this.isGizmoSnapActive() ? null : THREE.MathUtils.degToRad( this.defaultRotationSnapValue ) );
        else
            this.gizmo.transform.setScaleSnap( this.isGizmoSnapActive() ? null : this.defaultScaleSnapValue );
    }

    updateGizmoSnap() {
        
        if(!this.isGizmoSnapActive())
        return;
        this.gizmo.transform.setTranslationSnap( this.defaultTranslationSnapValue );
        this.gizmo.transform.setRotationSnap( THREE.MathUtils.degToRad( this.defaultRotationSnapValue ) );
        this.gizmo.transform.setScaleSnap( this.defaultScaleSnapValue );
    }

    /** -------------------- BLENDSHAPES INTERACTION -------------------- */
    getSelectedActionUnit() {
        return this.selectedAU;
    }

    setSelectedActionUnit(au) {

        if(this.animationMode != this.animationModes.FACE) {
            this.setAnimation(this.animationModes.FACE);
        }
        this.activeTimeline.setSelectedItems([au]);
        if(this.selectedAU == au) {
            return;
        }
        this.selectedAU = au;
        this.setTime(this.activeTimeline.currentTime);
        
    }


    /**
     * propagates the newValue using the editor.gui.propagationWindow attributes
     * It computes delta values which are weighted and added to each keyframe inside the window
     * @param {obj} timeline 
     * @param {int} trackIdx 
     * @param {quat || vec3 || number} newValue 
     */
    propagateEdition( timeline, trackIdx, newValue ){
        const propWindow = this.gui.propagationWindow;
        const time = propWindow.time;
        const track = timeline.animationClip.tracks[trackIdx];
        const values = track.values;
        const times = track.times;
        let prevFrame = timeline.getNearestKeyFrame(track, time, -1);
        let postFrame = timeline.getNearestKeyFrame(track, time, 1);
        prevFrame = prevFrame == -1 ? 0 : prevFrame; // assuming length > 0 
        postFrame = postFrame == -1 ? prevFrame : postFrame; // assuming length > 0 

        let minFrame = timeline.getNearestKeyFrame(track, time - propWindow.leftSide, 1);
        let maxFrame = timeline.getNearestKeyFrame(track, time + propWindow.rightSide, -1);
        minFrame = minFrame == -1 ? times.length : minFrame;
        maxFrame = maxFrame == -1 ? 0 : maxFrame;

        let delta;
        let t = prevFrame == postFrame ? 1 : (time-track.times[prevFrame])/(track.times[postFrame]-track.times[prevFrame]);
        if ( track.dim == 4 ){
            let prevQ = new THREE.Quaternion(values[prevFrame*4],values[prevFrame*4+1],values[prevFrame*4+2],values[prevFrame*4+3]);
            let postQ = new THREE.Quaternion(values[postFrame*4],values[postFrame*4+1],values[postFrame*4+2],values[postFrame*4+3]);
            delta = new THREE.Quaternion();

            //nlerp
            let bsign = ( prevQ.x * postQ.x + prevQ.y * postQ.y + prevQ.z * postQ.z + prevQ.w * postQ.w ) < 0 ? -1 : 1;    
            delta.x = prevQ.x * (1-t) + bsign * postQ.x * t;
            delta.y = prevQ.y * (1-t) + bsign * postQ.y * t;
            delta.z = prevQ.z * (1-t) + bsign * postQ.z * t;
            delta.w = prevQ.w * (1-t) + bsign * postQ.w * t;
            delta.normalize();

            delta.invert();
            delta.premultiply(newValue);
        }

        if ( track.dim == 3 ){
            delta = new THREE.Vector3();
            delta.x = newValue.x -( values[prevFrame*3] * (1-t) + values[postFrame*3] * t ); 
            delta.y = newValue.y -( values[prevFrame*3+1] * (1-t) + values[postFrame*3+1] * t ); 
            delta.z = newValue.z -( values[prevFrame*3+2] * (1-t) + values[postFrame*3+2] * t ); 
        }

        if ( track.dim == 1 ){
            delta = newValue - (values[prevFrame] * (1-t) + values[postFrame] * t);
        }

        let gradIdx = -1;
        let maxGradient=[1.0001, 0];
        let g0 = [0,0];
        let g1 = propWindow.gradient[0];
        const minTime = time - propWindow.leftSide;
        for( let i = minFrame; i <= maxFrame; ++i ){
            t = (times[i] - minTime) / (propWindow.leftSide + propWindow.rightSide); // normalize time in window 
            
            // find next valid gradient interval
            while( t > g1[0] ){
                g0 = g1;
                g1 = propWindow.gradient[++gradIdx]
                if ( !g1 ){ g1 = maxGradient; break; }
            }

            // compute delta factor
            t = (t - g0[0]) / (g1[0]-g0[0]);
            t = g0[1] * (1-t) + g1[1] * t;

            // apply delta with factor on frame 'i'
            switch( track.dim ){
                case 4: this._applyDeltaQuaternion( track, i, delta, t ); break;
                case 3: this._applyDeltaPosition( track, i, delta, t ); break;
                default:
                    values[i] = Math.min(1, Math.max(0, values[i] + delta * t )); 
                    break;
            }

            track.edited[i] = true;
        }
    }
  
    _applyDeltaQuaternion( track, keyframe, delta, t ){
        const dim = track.dim;
        const newDelta = new THREE.Quaternion;
        const source = new THREE.Quaternion;

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

    // Update blendshapes properties from the GUI
    updateBlendshapesProperties(name, value) {
        if( this.state ){ return false; }

        value = Number(value);
        // const auAnimation = this.getCurrentBindedAnimation().auAnimation; // activeTimeline.animationClip == auAnimation
        const time = this.activeTimeline.currentTime;

        for(let i = 0; i < this.activeTimeline.tracksDrawn.length; i++) {
            let info = this.activeTimeline.tracksDrawn[i][0];
            if(info.type == name && info.active && !info.locked ){
                const track = this.activeTimeline.animationClip.tracks[info.clipIdx];

                if ( track.times.length <= 0){ continue; }

                if ( this.gui.propagationWindow.enabler ){
                    this.propagateEdition(this.activeTimeline, track.clipIdx, value);

                    // Update animation action (mixer) interpolants.
                    this.updateAnimationAction(this.activeTimeline.animationClip, track.clipIdx );
                    
                }else{
                    const frameIdx = this.activeTimeline.getCurrentKeyFrame(track, time, 0.01)
                    if ( frameIdx > -1 ){
                        // Update Action Unit keyframe value of timeline animation
                        track.values[frameIdx] = value; // activeTimeline.animationClip == auAnimation               
                        track.edited[frameIdx] = true;               

                        // Update animation action (mixer) interpolants.
                        this.updateAnimationAction(this.activeTimeline.animationClip, track.clipIdx );
                    } 
                }
                return true;
            }
        }
    }
    
    fileToAnimation = (data, callback) => {
        
        if(data.fullpath) {
            const extension = UTILS.getExtension(data.fullpath).toLowerCase();
            LX.request({ url: this.FS.root + data.fullpath, dataType: 'text/plain', success: (f) => {
                const bytesize = f => new Blob([f]).size;
                data.bytesize = bytesize();
                if(extension.includes('bvhe')) {
                    data.animation = this.BVHloader.parseExtended( f );
                }
                else if(extension.includes('bvh')) {
                    data.animation = { skeletonAnim: this.BVHloader.parse( f ) };
                }
                else {
                    data.animation = null; // TO DO FOR GLB AND GLTF
                }
                if(callback)
                    callback(data);
            } });
        } else {

            const innerParse = (event) => {
                const content = event.srcElement ? event.srcElement.result : event;
                
                const type = data.type || UTILS.getExtension(data.name).toLowerCase();
                
                if(type.includes('bvhe')) {
                    data.animation = this.BVHloader.parseExtended( content );
                }
                else if(type.includes('bvh')) {
                    data.animation = { skeletonAnim: this.BVHloader.parse( content ) };
                }
                else {
                    data.animation = null; // TO DO FOR GLB AND GLTF
                }
                if(callback) {
                    callback(data)
                }
            }
            const content = data.data ? data.data : data;
            if(content.constructor.name == "Blob" || content.constructor.name == "File") {
                const reader = new FileReader();
                reader.readAsText(content);
                reader.onloadend = innerParse;
            }
            else {
                innerParse(content, data)
            }
        }
    }
}

class ScriptEditor extends Editor{
    
    constructor(app) {
                
        super(app, "SCRIPT");
        // -------------------- SCRIPT MODE --------------------
        this.gizmo = null;        
        this.dominantHand = "Right";
        
        this.onDrawTimeline = null;
	    this.onDrawSettings = null;
        
        this.gui = new ScriptGui(this);  
        this.activeTimeline = this.gui.clipsTimeline;
        // ------------------------------------------------------
        // this.getDictionaries();
        this.refreshSignsRepository = false;
        this.refreshPresetsRepository = false;
        this.localStorage = {signs: {id: "Local", type:"folder", children: []}, presets: {id: "Local", type:"folder", children: []}}

    }

    async initCharacters()
    {
    
        // Load current character
        this.loadCharacter(this.character);

        while(!this.loadedCharacters[this.character] || !this.loadedCharacters[this.character].bmlManager.ECAcontroller) {
            await new Promise(r => setTimeout(r, 1000));            
        }  
    }

    onKeyDown(e) {
        switch(e.key) {
            case 'l': case 'L':
                if(e.ctrlKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.gui.createSignsDialog();
                }
                break;
            case 'p': case 'P':
                if(e.ctrlKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.gui.createPresetsDialog();
                }
                break;
            case 'k': case 'K':
                if(e.ctrlKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.gui.createClipsDialog();
                }
                break;
            case 'e': case 'E':
                if(e.ctrlKey && !e.altKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.gui.createExportBMLDialog(); 
                }
        }
    }

    loadAnimation(name, animationData) { 

        let saveName;

        if ( name ){
            let extensionIdx = name.lastIndexOf(".");
            if ( extensionIdx == -1 ){ // no extension
                extensionIdx = name.length; 
            }
            saveName = name.slice(0,extensionIdx);
        }else{
            saveName = "";
        }

        this.loadedAnimations[name] = {
            name: name,
            saveName: saveName,
            export: true,
            inputAnimation: animationData, // bml file imported. This needs to be converted by the timeline's setAnimationClip.
            scriptAnimation: null, // if null, bind will take care. 
            type: "script"
        };
    }

    /**
     * ScriptEditor  
     * @param {String} animationName 
    */    
    bindAnimationToCharacter(animationName) {
        
        let animation = this.loadedAnimations[animationName];
        if(!animation) {
            console.warn(animationName + " not found");
            return false;
        }

        if ( animationName != this.currentAnimation ){
            this.gui.clipsTimeline.currentTime = 0;
            this.gui.clipsTimeline.unSelectAllClips();
            this.gui.clipsTimeline.unHoverAll();
        }
        this.currentAnimation = animationName;

        // create timeline animation for the first time
        if (!animation.scriptAnimation){
            this.gui.clipsTimeline.setAnimationClip(null, true); //generate empty animation 
            animation.scriptAnimation = this.gui.clipsTimeline.animationClip;
            this.gui.loadBMLClip(animation.inputAnimation); // process bml and add clips
            delete animation.inputAnimation;
        }
        
        animation.scriptAnimation.name = animationName;
        
        if(!this.bindedAnimations[animationName]) {
            this.bindedAnimations[animationName] = {};
        }
        this.bindedAnimations[animationName][this.currentCharacter.name] = { mixerAnimation: null };
    
        this.updateAnimationAction( animation.scriptAnimation );

        this.setAnimation();
        // mixer.setTime(0); // resets and automatically calls a this.mixer.update

        return true;
    }

    loadFile(file) {
        //load json (bml) file
        const extension = UTILS.getExtension(file.name);
        const formats = ['json', 'bml', 'sigml'];
        if(formats.indexOf(extension) < 0) {
            alert("Format not supported.\n\nFormats accepted:\n\t'bml', 'sigml', 'json'\n\t");
            return;
        }
        const fr = new FileReader();
        fr.readAsText( file );
        fr.onload = e => { 
            let anim = e.currentTarget.result;
            if(extension == 'sigml') {
                anim = sigmlStringToBML(anim);
                anim.behaviours = anim.data;
                delete anim.data;
            } else {
                anim = JSON.parse(anim);
            }
            let empty = true;
            if(this.activeTimeline.animationClip.tracks.length) {
                for(let i = 0; i < this.activeTimeline.animationClip.tracks.length; i++) {
                    if(this.activeTimeline.animationClip.tracks[i].clips.length){
                        empty = false;
                        break;
                    }
                }   
            }
            if(empty) {
                this.activeTimeline.currentTime = 0;
                this.clipName = anim.name;
                this.gui.loadBMLClip(anim);
            }
            else {
                this.gui.prompt = new LX.Dialog("Import animation" , (p) => {
                    p.addText("", "There is already an animation. What do you want to do?", null, {disabled: true});
                    p.sameLine(3);
                    p.addButton(null, "Replace", () => { 
                        this.clearAllTracks(false);
                        this.clipName = anim.name;
                        this.activeTimeline.currentTime = 0;
                        this.gui.loadBMLClip(anim);
                        this.gui.prompt.close();
                    }, { buttonClass: "accept" });
                    p.addButton(null, "Concatenate", () => { 
                        this.gui.loadBMLClip(anim);
                        this.gui.prompt.close() }, { buttonClass: "accept" });
                    p.addButton(null, "Cancel", () => { this.gui.prompt.close();} );
                })
            }
            this.gui.updateAnimationPanel();
        }
    }

    /** BML ANIMATION */ 
    
    /**
     * Updates current mixer and mixerAnimation with the timeline animationClip
     * @param {ClipTimeline animationClip} animation 
     */
    updateAnimationAction(animation) {
        // Remove current animation clip
        let mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();

        while (mixer._actions.length) {
            mixer.uncacheAction(mixer._actions[0]._clip); // removes action
        }

        let mixerAnimation = this.currentCharacter.bmlManager.createAnimationFromBML(animation, this.animationFrameRate);
        mixerAnimation.name = this.currentAnimation;
        mixer.clipAction(mixerAnimation).setEffectiveWeight(1.0).play();
        mixer.setTime(this.activeTimeline.currentTime);
        
        this.bindedAnimations[this.currentAnimation][this.currentCharacter.name].mixerAnimation = mixerAnimation;
}

    updateTracks() {

        let animationData = this.getCurrentAnimation();
        animationData.scriptAnimation = this.activeTimeline.animationClip;
       
        this.updateAnimationAction(animationData.scriptAnimation);
    }

    clearAllTracks(showConfirmation = true) {
        if(!this.activeTimeline.animationClip)
            return;

        const clearTracks = () => {
            for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

                const track = this.activeTimeline.animationClip.tracks[i];
                let idx = track.idx;
                
                this.activeTimeline.clearTrack(idx);
            
                if(this.activeTimeline.onPreProcessTrack)
                    this.activeTimeline.onPreProcessTrack( track, track.idx );
            }
            this.updateTracks();
            this.gui.updateClipPanel();
        }
        
        if(showConfirmation) 
            this.gui.showClearTracksConfirmation(clearTracks);
        else 
            clearTracks();
    }

    exportBML() {
        let currentAnim = this.getCurrentAnimation();
        let scriptAnim = currentAnim.scriptAnimation;

        let json =  {
            behaviours: [],
            //indices: [],
            name : currentAnim ? currentAnim.saveName : "BML animation",
            duration: scriptAnim ? scriptAnim.duration : 0,
        }

        let empty = true;
        if(scriptAnim) {
            for(let i = 0; i < scriptAnim.tracks.length; i++) {
                if(scriptAnim.tracks[i].clips.length){
                    empty = false;
                    break;
                }
            }   
        }
        if(empty) {
            alert("You can't export an animation with empty tracks.")
            return null;
        }
       
        for(let i = 0; i < scriptAnim.tracks.length; i++ ) {
            for(let j = 0; j < scriptAnim.tracks[i].clips.length; j++) {
                let data = scriptAnim.tracks[i].clips[j];
                if(data.toJSON) data = data.toJSON();
                if(data)
                {
                    if(data.type == "glossa") {
                        let actions = { faceLexeme: [], gaze: [], head: [], gesture: [], speech: []};
                       
                        for(let action in actions) {
                            if(data[action]){
                                json.behaviours = json.behaviours.concat(data[action]);
                            }
                        }
                    }
                    else {
                        json.behaviours.push( data );
                    }
                }              
            }
        }

        return json;
    }
    
    fileToBML = (data, callback) => {
        if(data.fullpath) {
            LX.request({ url: this.FS.root + data.fullpath, dataType: 'text/plain', success: (f) => {
                const bytesize = f => new Blob([f]).size;
                data.bytesize = bytesize();
                data.bml = data.type == "bml" ?  {data: JSON.parse(f)} : sigmlStringToBML(f);
                data.bml.behaviours = data.bml.data;               
                if(callback)
                    callback(data);
            } });
        } else {
            data.bml = data.type == "bml" ?  {data: (typeof data.data == "string") ? JSON.parse(data.data) : data.data } : sigmlStringToBML(data.data);
            data.bml.behaviours = data.bml.data;              
            if(callback)
                callback(data);
        }
    }
}
export { Editor, KeyframeEditor, ScriptEditor };