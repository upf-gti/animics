import * as THREE from "three";
import { OrbitControls } from "./controls/OrbitControls.js";
import { BVHLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/BVHLoader.js';
import { BVHExporter } from "./exporters/BVHExporter.js";
import { createSkeleton, createAnimation, createAnimationFromRotations, updateThreeJSSkeleton, injectNewLandmarks, postProcessAnimation } from "./skeleton.js";
import { KeyframesGui, ScriptGui } from "./gui.js";
import { Gizmo } from "./gizmo.js";
import { UTILS } from "./utils.js"
import { NN } from "./ML.js"
import { OrientationHelper } from "./libs/OrientationHelper.js";
import { AnimationRetargeting } from './retargeting.js'
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from './exporters/GLTFExporoter.js' 
import { BMLController } from "./controller2.js"
import { BlendshapesManager } from "./blendshapes.js"
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';

import { FileSystem } from "./libs/filesystem.js";

import { LX } from "lexgui"

// const MapNames = await import('../data/mapnames.json', {assert: { type: 'json' }});
const MapNames = await (await fetch('./data/mapnames.json')).json();
// Correct negative blenshapes shader of ThreeJS
THREE.ShaderChunk[ 'morphnormal_vertex' ] = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n	    objectNormal += getMorph( gl_VertexID, i, 1, 2 ) * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_pars_vertex' ] = "#ifdef USE_MORPHTARGETS\n	uniform float morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		uniform sampler2DArray morphTargetsTexture;\n		uniform vec2 morphTargetsTextureSize;\n		vec3 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset, const in int stride ) {\n			float texelIndex = float( vertexIndex * stride + offset );\n			float y = floor( texelIndex / morphTargetsTextureSize.x );\n			float x = texelIndex - y * morphTargetsTextureSize.x;\n			vec3 morphUV = vec3( ( x + 0.5 ) / morphTargetsTextureSize.x, y / morphTargetsTextureSize.y, morphTargetIndex );\n			return texture( morphTargetsTexture, morphUV ).xyz;\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_vertex' ] = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			#ifndef USE_MORPHNORMALS\n				transformed += getMorph( gl_VertexID, i, 0, 1 ) * morphTargetInfluences[ i ];\n			#else\n				transformed += getMorph( gl_VertexID, i, 0, 2 ) * morphTargetInfluences[ i ];\n			#endif\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif";

class Editor {
    
    constructor(app, mode) {
        
        this.character = "EVA";

        this.clock = new THREE.Clock();
        this.BVHloader = new BVHLoader();
        this.GLTFloader = new GLTFLoader();
        this.GLTFExporter = new GLTFExporter();

        this.help = null;
        this.camera = null;
        this.controls = null;
        this.scene = null;
        this.boneUseDepthBuffer = true;
        this.optimizeThreshold = 0.01;

        this.renderer = null;
        this.state = false; // defines how the animation starts (moving/static)
        this.mixer = null;
        
        this.showGUI = true;
        this.showSkin = true; // defines if the model skin has to be rendered
        this.animLoop = true;
        
        this.eModes = {capture: 0, video: 1, script: 2};
        this.mode = this.eModes[mode];
        
        this.animation = null; //ThreeJS animation (only bones in keyframing mode) : {values: [], times: []}
        this.morphTargets = {};

        // Keep "private"
        this.__app = app;

        // Create the fileSystem and log the user
        this.FS = new FileSystem("signon", "signon", () => console.log("Auto login of guest user"));
        this.FS.login().then(this.getUnits.bind(this))

    }

    getApp() {
        return this.__app;
    }

    //Create canvas scene
    init() {

        this.initScene();

        document.addEventListener( 'keydown', (e) => {
            switch ( e.key ) {
                case " ": // Spacebar
                    if(e.target.constructor.name != 'HTMLInputElement') {

                        e.preventDefault();
                        e.stopImmediatePropagation();
                        document.querySelector("[title = Play]").children[0].click()
                    }
                    break;
                // case "Delete":
                //     e.preventDefault();
                //     // e.stopImmediatePropagation();
                //     // this.activeTimeline.deleteKeyFrame(e, null);
                //     if(this.activeTimeline.deleteKeyFrame) {
                //         e.multipleSelection = this.activeTimeline.lastKeyFramesSelected.length > 1;
                //         this.activeTimeline.deleteKeyFrame(e);
                //     }
                //     if(this.activeTimeline.deleteClip) {
                //         e.multipleSelection = this.activeTimeline.lastClipsSelected.length > 1;
                //         this.activeTimeline.deleteClip(e, null, this.gizmo.updateTracks.bind(this.gizmo));
                //     }
                    
                //     break;
                case "Escape":
                    this.gui.closeDialogs();
                    
                break;
                case 'z': case 'Z': 
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.activeTimeline.undo) {
                            this.activeTimeline.undo();
                            this.gui.updateClipPanel();
                        }
                    }
                    break;
                
                case 's': case 'S':
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(e.altKey) {
                            if(this.gui.createNewPresetDialog)
                                this.gui.createNewPresetDialog();
                        }
                        else {
                            if(this.gui.createNewSignDialog)
                                this.gui.createNewSignDialog();
                        }
                    }
                    break;

                case 'e': case 'E':
                    if(e.ctrlKey) {
                        if(e.altKey) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            LX.prompt("File name", "Export GLB", (v) => this.export("GLB", v), {input: this.clipName, required: true} )     
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
                case 'i': case 'I':
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        this.gui.importFile();
                    }
                    break;
            }
            this.onKeyDown(e);
        } );

        // window.addEventListener("beforeunload", (e) => {
        //     if(!this.animation.tracks.length)
        //         return;
        //     e.preventDefault();
        //     e.cancelBubble = true;
        //     e.stopPropagation();
        //     e.returnValue = "Exit"
        //     window.stop();
        //     return this.gui.promptExit();
        // })
        window.onbeforeunload =  (e) => {
            if(!this.animation.tracks.length)
                return;
            e.preventDefault();
            e.returnValue = ""
            window.stop();
            return "Be sure you have exported the animation. If you exit now, your data will be lost."
        }
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
        canvasArea.onresize = (bounding) => this.resize(bounding.width, bounding.height);
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


    startEdition() {
        this.gui.initEditionGUI();
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

        if(this.currentTime > this.activeTimeline.duration) {
            this.currentTime = this.activeTimeline.currentTime = 0.0;
            this.onAnimationEnded();
        }
        if (this.mixer && this.state) {

            this.mixer.update(dt);
            this.currentTime = this.activeTimeline.currentTime = this.mixer.time;
            LX.emit( "@on_current_time_" + this.activeTimeline.constructor.name, this.currentTime );
            if(this.onUpdateAnimationTime)
                this.onUpdateAnimationTime();
        }
       
        this.gizmo.update(this.state, dt);
    }

    // Play all animations
    play() {
        this.state = true;
        this.activeTimeline.active = false;
        if(this.onPlay)
            this.onPlay();
    }

    // Stop all animations 
    stop() {

        this.state = false;
        
        let t = 0.0;
        this.setTime(0);
        this.activeTimeline.active = true;
        this.activeTimeline.currentTime = t;
        this.activeTimeline.onSetTime(t);
        
       if(this.onStop)
            this.onStop();
    }

    pause() {
        this.state = !this.state;
        this.activeTimeline.active = !this.activeTimeline.active;
        if(!this.state && this.mixer._actions[0])
            this.mixer._actions[0].paused = false;

        if(this.onPause)
            this.onPause();
    }
    
    setTime(t, force) {

        // Don't change time if playing
        // this.gui.currentTime = t;
        if(this.state && !force)
            return;

        this.mixer.setTime(t*this.mixer.timeScale);
        this.mixer.update(0);
    }

    clearAllTracks() {

    }

    // cleanTracks(excludeList) {

    //     if(!this.activeTimeline.animationClip)
    //         return;

    //     for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

    //         const track = this.activeTimeline.animationClip.tracks[i];
    //         let type = 'number';
    //         if(this.activeTimeline.getTrackName && track.name) {

    //             let [boneName, type] = this.activeTimeline.getTrackName(track.name);
    
    //             if(excludeList && excludeList.indexOf( boneName ) != -1)
    //                 continue;
    //         }
    //         let currentTrack = this.animation.tracks[track.idx];
    //         track.times = new Float32Array( [currentTrack.times[0]] );

    //         let n = 1;
    //         if(type != 'number')
    //             n = type === 'quaternion' ? 4 : 3;
    //         track.values = track.values.slice(0, n );

    //         this.updateAnimationAction(this.activeTimeline.animationClip,i);
    //         if(this.activeTimeline.onPreProcessTrack)
    //             this.activeTimeline.onPreProcessTrack( track, track.idx );
    //     }
    // }

    // emptyTracks() {
    //     if(!this.activeTimeline.animationClip)
    //         return;

    //     for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

    //         const track = this.activeTimeline.animationClip.tracks[i];
    //         if(this.activeTimeline.selectedItems && this.activeTimeline.selectedItems.indexOf(track.name)< 0 && this.mode != this.eModes.script)
    //             continue;
    //         let idx = this.mode == this.eModes.script ? track.idx : track.clipIdx;
    //         let value = null;
    //         if(this.mode != this.eModes.script) {
                
    //             if(track.dim == 1)
    //                 value = 0;
    //             else
    //                 value = [0,0,0,1];
    //         } 

    //         this.activeTimeline.cleanTrack(idx, value);
    //         // if(value != null) {
    //         //     this.activeTimeline.addKeyFrame(track, value, 0);
    //         // }
                
    //         this.updateAnimationAction(this.activeTimeline.animationClip, idx, false);
    //         if(this.activeTimeline.onPreProcessTrack)
    //             this.activeTimeline.onPreProcessTrack( track, track.idx );
    //     }
    //     this.updateTracks();
    // }

    optimizeTrack(trackIdx, threshold = this.optimizeThreshold) {
        this.optimizeThreshold = this.activeTimeline.optimizeThreshold;
        const track = this.animation.tracks[trackIdx];
        track.optimize( this.optimizeThreshold );
        this.updateAnimationAction(this.animation, trackIdx);
    }

    optimizeTracks(tracks) {

        if(!this.activeTimeline.animationClip)
            return;

        for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {
            const track = this.activeTimeline.animationClip.tracks[i];
            if(track.optimize) {

                track.optimize( this.optimizeThreshold );
                this.updateAnimationAction(this.animation, i);
    
                // this.gui.keyFramesTimeline.onPreProcessTrack( track, i );
            }
        }
        this.activeTimeline.draw();
    }

    updateAnimationAction(animation, idx, replace = false) {
        if(!this.bodyAnimation) 
            return;
        const mixer = this.mixer;

        if(!mixer._actions.length) 
            return;

        if(typeof idx == 'number')
            idx = [idx];

        if(replace) {
            this.animation.tracks = [];
            for(let i = 0; i < animation.tracks.length; i++) {
                const track = animation.tracks[i];
                if(track.active) {
                    switch(track.type) {
                        case "position":
                            this.animation.tracks.push(new THREE.VectorKeyframeTrack(track.fullname, track.times, track.values));
                            break;
                        case "quaternion":
                            this.animation.tracks.push(new THREE.QuaternionKeyframeTrack(track.fullname, track.times, track.values));
                            break;
                        case "scale":
                            this.animation.tracks.push(new THREE.VectorKeyframeTrack(track.fullname, track.times, track.values));
                            break;
                        default:
                            this.animation.tracks.push(new THREE.NumberKeyframeTrack(track.fullname, track.times, track.values));
                            break;
                    } 
                }
            }
            for(let i = 0; i< mixer._actions.length; i++) {
                if(mixer._actions[i]._clip.name == animation.name) {
                    this.mixer.uncacheClip(mixer._actions[i]._clip)
                    this.mixer.uncacheAction(mixer._actions[i])
                    this.mixer.clipAction(this.animation).play();
                }
            }
            
            if(this.bodyAnimation.name == animation.name)
                this.bodyAnimation = animation;
            else if(this.faceAnimation.name == animation.name)
                this.faceAnimation = animation;
        }
        else {
            let valueDeletedInfo = null;
            for(let i = 0; i< mixer._actions.length; i++) {
                if(mixer._actions[i]._clip.name == animation.name) {
                    for(let j = 0; j < idx.length; j++) {
    
                        const track = animation.tracks[idx[j]];
                        if(!track.active)
                            continue;

                        if( mixer._actions[i]._interpolants[idx[j]].parameterPositions.length > track.times.length )
                            valueDeletedInfo = track;

                        // Update times
                        mixer._actions[i]._interpolants[idx[j]].parameterPositions = track.times;
                        // Update values
                        mixer._actions[i]._interpolants[idx[j]].sampleValues = track.values;

                        
                    }
                    if(this.bodyAnimation.name == animation.name)
                        this.bodyAnimation = animation;
                    else if(this.faceAnimation.name == animation.name) {
                        this.faceAnimation = animation;
                        
                        //update timeline animation track if a value is deleted
                        if(this.auAnimation.name == animation.name && valueDeletedInfo) {

                            for(let a = 0; a < this.auAnimation.tracks.length; a++) {
                                if(this.auAnimation.tracks[a].name == valueDeletedInfo.fullname) {
                                    this.auAnimation.tracks[a].values = valueDeletedInfo.values;
                                    this.auAnimation.tracks[a].times = valueDeletedInfo.times;
                                }
                            }
                        }
                    }
                    return;
                }
            }
        }

    }

    removeAnimationData(animation, trackIdx, timeIdx) {
        
        if(this.activeTimeline.constructor.name == 'CurvesTimeline'){
            let track = animation.tracks[trackIdx];
            this.blendshapesArray[timeIdx][track.type] = 0;
        }
        this.updateAnimationAction(animation, trackIdx);
        
    }

    setAnimationLoop(loop) {
        
        for(let i = 0; i < this.mixer._actions.length; i++) {

            if(loop)
                this.mixer._actions[i].loop = THREE.LoopOnce;
            else
                this.mixer._actions[i].loop = THREE.LoopRepeat;
        }
        this.gizmo.updateTracks();
    }

    setAnimation(type) {
        if(this.activeTimeline) {
            this.activeTimeline.hide()
        }
        switch(type) {
            case "Face":
                this.activeTimeline = this.gui.curvesTimeline;
                if(!this.selectedAU) return;
                this.gizmo.stop();
                this.activeTimeline.setAnimationClip( this.auAnimation );
                this.activeTimeline.show();
                this.setSelectedActionUnit(this.selectedAU);
                
                break;
            case "Body":
                this.activeTimeline = this.gui.keyFramesTimeline;
                this.activeTimeline.setAnimationClip( this.bodyAnimation );
                this.activeTimeline.show();            
                break;

             default:
                this.activeTimeline = this.gui.clipsTimeline;
                this.activeTimeline.show();
                break;
        }
    }

    

    onAnimationEnded() {

        if(this.animLoop) {
            this.setTime(0.0, true);
        } else {
            this.mixer.setTime(0);
            this.mixer._actions[0].paused = true;
            let stateBtn = document.querySelector("[title=Play]");
            stateBtn.children[0].click();

            if( this.video ) {
                this.video.pause();
                this.video.currentTime = this.video.startTime;
            }
        }
    }


    resize(width = this.gui.canvasArea.root.clientWidth, height = this.gui.canvasArea.root.clientHeight) {
        
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        // this.renderer.setPixelRatio(aspect);
        this.renderer.setSize(width, height);

        this.gui.resize(width, height);
    }

    export(type = null, name) {
        switch(type){
            case 'BVH':
                BVHExporter.export(this.mixer._actions[0], this.skeletonHelper, this.bodyAnimation);
                break;
            case 'GLB':
                let options = {
                    binary: true,
                    animations: []
                };
                for(let i = 0; i < this.mixer._actions.length; i++) {
                    options.animations.push(this.mixer._actions[i]._clip);
                }
                let model = this.mixer._root.getChildByName('Armature');
                this.GLTFExporter.parse(model, 
                    ( gltf ) => BVHExporter.download(gltf, (name || this.clipName) + '.glb', 'arraybuffer' ), // called when the gltf has been generated
                    ( error ) => { console.log( 'An error happened:', error ); }, // called when there is an error in the generation
                options
            );
                break;
            case 'BVH extended':
                let LOCAL_STORAGE = 1;
                if(this.mode == this.eModes.script) {
                    BVHExporter.export(this.mixer._actions[0], this.skeletonHelper, this.animation, LOCAL_STORAGE );
                    BVHExporter.exportMorphTargets(this.mixer._actions[0], this.morphTargets.BodyMesh, this.animation, LOCAL_STORAGE);
                }
                else {
                    BVHExporter.export(this.mixer._actions[0], this.skeletonHelper, this.bodyAnimation, LOCAL_STORAGE);
                    BVHExporter.exportMorphTargets(this.mixer._actions[1], this.morphTargets.BodyMesh, this.animation, LOCAL_STORAGE);
                }
                
                let bvh = window.localStorage.getItem("bvhskeletonpreview");
                bvh += window.localStorage.getItem("bvhblendshapespreview");
                BVHExporter.download(bvh, (name || this.clipName) + ".bvhe")
                break;

            default:
                let json = this.exportBML();
                if(!json) return;
                BVHExporter.download(JSON.stringify(json), (name || this.clipName) + '.bml', "application/json");
                console.log(type + " ANIMATION EXPORTATION IS NOT YET SUPPORTED");
                break;
        }
    }

    showPreview() {
        
        let url = "";
        if(this.mode == this.eModes.capture || this.mode == this.eModes.video) {

            BVHExporter.copyToLocalStorage(this.mixer._actions[0], this.skeletonHelper, this.bodyAnimation);
            url = "https://webglstudio.org/users/arodriguez/demos/animationLoader/?load=bvhskeletonpreview";
        }
        else{
            url = "https://webglstudio.org/projects/signon/performs";
            let json = this.exportBML();
            if(!json) return;
            const sendData = () => {
                if(this.performsApp && this.performsApp.ECAcontroller)
                    this.realizer.postMessage(JSON.stringify([{type: "bml", data: json.behaviours}]));
                else {
                    setTimeout(sendData, 1000)
                }
            }
           
            if(!this.realizer || this.realizer.closed) {
                this.realizer = window.open(url, "Preview");
                this.realizer.onload = (e, d) => {
                    this.performsApp = e.currentTarget.global.app;
                    sendData();
                }
    
                this.realizer.addEventListener("beforeunload", () => {
                    this.realizer = null
                });
            }
            else 
                sendData();

           
        }

    }

    login(session, callback) {
        this.FS.login(session.user, session.password, callback);
    }

    logout(callback) {
        const units = Object.keys(this.FS.getSession().units);
        let repo = {signs:[], presets: []};
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

    getUnits() {
        const session = this.FS.getSession();
        session.getUnits( (units) => {
            for(let i = 0; i < units.length; i++) {
                if(units[i].name == "signon")
                    continue;
                if(this.repository.signs.length)
                    this.repository.signs.push({id:units[i].name == "signon" ? "Public": units[i].name , type:"folder", children: [], unit: units[i].name});
                if(this.repository.presets.length)
                this.repository.presets.push({id:units[i].name == "signon" ? "Public": units[i].name , type:"folder", children: [], unit: units[i].name});
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
            data = JSON.stringify(data, null, 4);
    
            this.uploadFile(filename, data, type, (v) => {
                this["refresh" + (type == "signs" ? "Signs":"Presets") +"Repository"] = true; 
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
                
        super(app);

        this.defaultTranslationSnapValue = 1;
        this.defaultRotationSnapValue = 30; // Degrees
        this.defaultScaleSnapValue = 1;

        this.showSkeleton = true;
        this.skeletonHelper = null;
        this.skeleton = null;
        
        this.bodyAnimation = null;
        this.faceAnimation = null; //ThreeJS BS animation (used for the mixer): {values: [], times: []}
        this.auAnimation = null; //ThreeJS mediapipe AU animation (used for the timeline): [ {AU1: w1_0, AU2: w2_0, ...}, {AU1: w1_1, AU2: w2_1, ...}, ... ]
        this.landmarksArray = [];
        this.blendshapesArray = [];
        this.applyRotation = false; // head and eyes rotation
        this.selectedAU = "Brow Left";
        // this.nn = new NN("data/ML/model.json");
        this.nn = new NN("data/ML/body_model_04/model.json", "data/ML/hands_model_04/model.json");
        this.retargeting = null;
        this.video = app.video;
        
        this.mapNames = MapNames.map_llnames[this.character];
        this.mode = this.eModes[mode];
        this.gui = new KeyframesGui(this);

        this.video = document.getElementById("recording");
        this.video.startTime = 0;
 
    }

    onKeyDown(e) {

    }
    /** -------------------- CREATE ANIMATIONS FROM MEDIAPIPE -------------------- */

    /**Create face and body animations from mediapipe and load character*/
    buildAnimation(data) {

        let {landmarks, blendshapes} = data;
        // Remove loop mode for the display video
        this.video.sync = true;
        this.video.loop = false;

        // Trim
        this.landmarksArray = this.processLandmarks( landmarks );
        this.blendshapesArray = this.processBlendshapes( blendshapes );

        // Mode for loading the animation
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);

        if ( urlParams.get('load') == 'hard') {
    
            this.GLTFloader.load( 'models/Eva_Y.glb', (glb) => {

                let model = glb.scene;
                model.name = this.character;
                model.castShadow = true;
                
                model.traverse( (object) => {
                    if ( object.isMesh || object.isSkinnedMesh ) {
                        object.material.side = THREE.FrontSide;
                        object.frustumCulled = false;
                        object.castShadow = true;
                        object.receiveShadow = true;

                        if (object.name == "Eyelashes")
                            object.castShadow = false;
                        else if (object.name == "Body")
                            object.name == "BodyMesh";

                        if(object.material.map)
                            object.material.map.anisotropy = 16; 

                        this.help = object.skeleton;
                        if(object.morphTargetDictionary)
                            this.morphTargets[object.name] = object.morphTargetDictionary;
                        
                    } else if (object.isBone) {
                        object.scale.set(1.0, 1.0, 1.0);
                    }
                } );

                model.position.set(0, 0.75, 0);
                model.rotateOnAxis (new THREE.Vector3(1,0,0), -Math.PI/2);
                model.getObjectByName("mixamorig_RightHand").scale.set( 0.85, 0.85, 0.85 );
                model.getObjectByName("mixamorig_LeftHand").scale.set( 0.85, 0.85, 0.85 );
                this.skeletonHelper = new THREE.SkeletonHelper(model);

                updateThreeJSSkeleton(this.help.bones);
                this.skeletonHelper.visible = true;
                this.skeletonHelper.name = "SkeletonHelper";
                this.skeletonHelper.skeleton = this.skeleton = createSkeleton();
                
                this.scene.add(this.skeletonHelper);
                this.scene.add(model);
                

                // load the actual animation to play
                this.mixer = new THREE.AnimationMixer( model );
                this.BVHloader.load( 'models/ISL Thanks final.bvh' , (result) => {
                    this.bodyAnimation = result.clip;
                    for (let i = 0; i < result.clip.tracks.length; i++) {
                        this.bodyAnimation.tracks[i].name = this.bodyAnimation.tracks[i].name.replaceAll(/[\]\[]/g,"").replaceAll(".bones","");

                    }
                    this.gizmo = new Gizmo(this);
                    this.gizmo.begin(this.skeletonHelper);
                    this.gui.loadKeyframeClip(this.bodyAnimation, () => this.gui.init());
                    this.animation = this.bodyAnimation;
                    this.mixer.clipAction( this.bodyAnimation ).setEffectiveWeight( 1.0 ).play();
                    this.mixer.update(0);
                    this.setBoneSize(0.05);
                    this.animate();
                    $('#loading').fadeOut();
                } );
            } );

        } 
        else {// -- default -- if ( urlParams.get('load') == 'NN' ) {
            UTILS.makeLoading("")
            this.bodyAnimation = createAnimationFromRotations(this.clipName, this.nn);
            //postProcessAnimation(this.bodyAnimation, this.landmarksArray);
            if (urlParams.get('skin') && urlParams.get('skin') == 'false') {
                this.loadAnimationWithSkeleton(this.bodyAnimation);
            }
            else {
                this.BVHloader.load( 'models/kateBVH.bvh', (result) => {
                    // loader does not correctly compute the skeleton boneInverses and matrixWorld 
                    result.skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
                    result.skeleton = new THREE.Skeleton( result.skeleton.bones ); // will automatically compute boneInverses
                    
                    result.skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } ); // bodyAnimation have different names than bvh skeleton
                    result.clip = this.bodyAnimation;
                    this.loadAnimationWithSkin(result);
                });
            }
        }
        this.gui.showVideo = true;
    }

    processLandmarks( landmarks ) {
        
        const [startTime, endTime] = this.trimTimes;

        // Video is non duration-complete
        if(endTime) {

            let totalDt = 0;
            let index = 1;
    
            // remove starting frames
            while( totalDt < startTime ) {
                const lm = landmarks[index];
                totalDt += lm.dt * 0.001;
                index++;
            }
    
            if(totalDt > 0) {
                landmarks = landmarks.slice(index - 1);
            }
    
            // remove ending frames
            index = 1;
            while( totalDt < endTime && index < landmarks.length ) {
                const lm = landmarks[index];
                totalDt += lm.dt * 0.001;
                index++;
            }
    
            landmarks = landmarks.slice(0, index - 1);
        }

        this.nn.loadLandmarks( landmarks, 
            offsets => {
                this.trimTimes[0] += offsets[0];
                this.trimTimes[1] += offsets[1];

                this.video.startTime = this.trimTimes[0];
                this.video.onended = function() {
                    this.currentTime = this.startTime;
                    this.play();
                };
            },
            (err) => {
                alert(err, "Try it again."); 
                window.location.reload();
            } 
        );
        return landmarks;
    }

    processBlendshapes( blendshapes ) {
        
        const [startTime, endTime] = this.trimTimes;

        // Video is non duration-complete
        if(endTime) {

            let totalDt = 0;
            let index = 1;
    
            // remove starting frames
            while( totalDt < startTime ) {
                const bs = blendshapes[index];
                totalDt += bs.dt * 0.001;
                index++;
            }
    
            if(totalDt > 0) {
                blendshapes = blendshapes.slice(index - 1);
            }
    
            // remove ending frames
            index = 1;
            while( totalDt < endTime && index < blendshapes.length ) {
                const bs = blendshapes[index];
                totalDt += bs.dt * 0.001;
                index++;
            }
    
            blendshapes = blendshapes.slice(0, index - 1);
        }

        return blendshapes;
    }

    loadAnimation( animation ) {

        const extension = UTILS.getExtension(animation.name);
    
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        
        const innerOnLoad = result => {
            if(urlParams.get('skin') && urlParams.get('skin') == 'true' || extension == 'bvhe') {
                
                this.loadAnimationWithSkin(result);

            } else if(!result.skeleton) {

                this.loadAnimationWithSkin(result.skeletonAnim, result.blendshapesAnim);

            } else {
                
                this.loadAnimationWithSkeleton(result);
            }
        };

        var reader = new FileReader();
        reader.onload = (e) => {
            const text = e.currentTarget.result;
            let data = null;
            if(extension.includes('bvh'))
                data = this.BVHloader.parse( text );
            else
                data = this.BVHloader.parseExtended( text );
            innerOnLoad(data);
        };
        reader.readAsText(animation);
    }

    loadAnimationWithSkin(skeletonAnim, blendshapesAnim = null) {
        
        if(skeletonAnim && skeletonAnim.skeleton ) {
            skeletonAnim.clip.name = UTILS.removeExtension(this.clipName || skeletonAnim.clip.name);
            this.bodyAnimation = skeletonAnim.clip;
            let tracks = [];
            
            // remove position changes (only keep i == 0, hips)
            for (let i = 0; i < this.bodyAnimation.tracks.length; i++) {
                if(i && this.bodyAnimation.tracks[i].name.includes('position')) {
                    continue;
                }
                tracks.push( this.bodyAnimation.tracks[i] );
            }

            this.bodyAnimation.tracks = tracks;
        }
        
        // Load the target model (Eva) 
        UTILS.loadGLTF("https://webglstudio.org/3Dcharacters/Eva/Eva.glb", (gltf) => {
            let model = gltf.scene;
            model.name = this.character;
            model.visible = true;
            
            let skinnedMeshes = {};
            model.traverse( o => {
                if (o.isMesh || o.isSkinnedMesh) {
                    o.castShadow = true;
                    o.receiveShadow = true;
                    o.frustumCulled = false;
                    if ( o.skeleton ){ 
                        this.skeleton = o.skeleton;
                    }
                    if (o.name == "Body")
                            o.name == "BodyMesh";
                    if(o.morphTargetDictionary)
                    {
                        this.morphTargets[o.name] = o.morphTargetDictionary;
                        skinnedMeshes[o.name] = o;
                    }
                    o.material.side = THREE.FrontSide;
                    
                }
            } );
            
            // correct model
            model.position.set(0,0.85,0);
            model.rotateOnAxis(new THREE.Vector3(1,0,0), -Math.PI/2);
            model.getObjectByName("mixamorig_RightHand").scale.set( 0.85, 0.85, 0.85 );
            model.getObjectByName("mixamorig_LeftHand").scale.set( 0.85, 0.85, 0.85 );
            this.skeletonHelper = new THREE.SkeletonHelper(model);
            this.skeletonHelper.name = "SkeletonHelper";

            //Create animations
            this.mixer = new THREE.AnimationMixer(model);
            //Create body animation from mediapipe landmarks
            if(this.bodyAnimation)
            {
                // trgUseCurrentPose: use current Bone obj quats,pos, and scale
                // trgEmbedWorldTransform: take into account external rotations like bones[0].parent.quaternion and model.quaternion
                let retargeting = new AnimationRetargeting( skeletonAnim.skeleton, model, { trgUseCurrentPose: true, trgEmbedWorldTransforms:true } );
                this.bodyAnimation = retargeting.retargetAnimation(this.bodyAnimation);
                
                this.validateAnimationClip();
                this.mixer.clipAction(this.bodyAnimation).setEffectiveWeight(1.0).play();
                this.mixer.setTime(0); // resets and automatically calls a this.mixer.update
            }
            this.skeletonHelper.skeleton = this.skeleton; //= createSkeleton();

            //Create face animation from mediapipe blendshapes
            this.blendshapesManager = new BlendshapesManager(skinnedMeshes, this.morphTargets, this.mapNames);
            let anim = this.blendshapesManager.createAnimationFromBlendshapes("au-animation", this.blendshapesArray);
            this.faceAnimation = anim[0];
            this.auAnimation = anim[1];

            if( blendshapesAnim )
                this.mixer.clipAction(blendshapesAnim.clip).setEffectiveWeight(1.0).play();
            else if(this.faceAnimation )
                this.mixer.clipAction(this.faceAnimation).setEffectiveWeight(1.0).play();

            // guizmo stuff
            this.scene.add( model );
            this.scene.add( this.skeletonHelper );
            //this.scene.add( this.retargeting.srcSkeletonHelper );
            this.gizmo = new Gizmo(this);
            this.gizmo.begin(this.skeletonHelper);
                    
            this.startEdition();// this.onBeginEdition();
            this.gui.loadKeyframeClip(this.bodyAnimation, () => this.gui.init());
            this.animation = this.bodyAnimation;
      
            this.setBoneSize(0.05);
            this.animate();
            if(this.bodyAnimation )
                $('#loading').fadeOut();
        });   
    }

    loadAnimationWithSkeleton(animation) {
        this.bodyAnimation = animation.clip || animation || this.bodyAnimation;
        this.BVHloader.load( 'models/kateBVH.bvh' , (result) => {
            result.skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } );
            // loader does not correctly compute the skeleton boneInverses and matrixWorld 
            result.skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
            result.skeleton = new THREE.Skeleton( result.skeleton.bones ); // will automatically compute boneInverses
            
            let skeleton = result.skeleton;
            // skeleton.bones.map(x => x.scale.set(0.1, 0.1, 0.1));
            skeleton.bones[0].scale.set(0.1,0.1,0.1)
            skeleton.bones[0].position.set(0,0.85,0)
            this.skeletonHelper = new THREE.SkeletonHelper( skeleton.bones[0] );
            this.skeletonHelper.skeleton = this.skeleton = skeleton;
            this.skeletonHelper.name = "SkeletonHelper";
            // this.skeletonHelper.position.set(0, 0.85, 0);

            let boneContainer = new THREE.Group();
            boneContainer.add( skeleton.bones[0] );
            boneContainer.rotateOnAxis( new THREE.Vector3(1,0,0), Math.PI/2 );
            // boneContainer.position.set(0, 0.85, 0);

            this.scene.add( boneContainer );
            this.scene.add(skeleton.bones[0])
            this.scene.add( this.skeletonHelper );

            this.mixer = new THREE.AnimationMixer( this.skeletonHelper );
            this.gui.loadKeyframeClip(this.bodyAnimation, () => this.gui.init());
            this.animation = this.bodyAnimation;

            this.mixer.clipAction( this.bodyAnimation ).setEffectiveWeight( 1.0 ).play();
            
            this.mixer.update(0);
            this.gizmo.begin(this.skeletonHelper);
            this.setBoneSize(0.05);
            this.animate();
            $('#loading').fadeOut();
        } );
    }

    /** Validate body animation clip created using ML */
    validateAnimationClip() {

        let newTracks = [];
        let tracks = this.bodyAnimation.tracks;
        let bones = this.skeleton.bones;
        let bonesNames = [];
        tracks.map((v) => { bonesNames.push(v.name.split(".")[0])});

        for(let i = 0; i < bones.length; i++)
        {
            
            let name = bones[i].name;
            if(bonesNames.indexOf( name ) > -1)
                continue
            let times = [tracks[0].times[0]];
            let values = [bones[i].quaternion.x, bones[i].quaternion.y, bones[i].quaternion.z, bones[i].quaternion.w];
            
            let track = new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, values);
            newTracks.push(track);
            
        }
        this.bodyAnimation.tracks = [...this.bodyAnimation.tracks, ...newTracks] ;
    }


    onUpdateAnimationTime() {
        
        this.updateBoneProperties();
        this.updateCaptureDataTime();
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

        this.gizmo.updateBones(t);
        if(this.video.sync) {
            this.video.pause();
            this.video.currentTime = this.video.startTime;
        }
    }

    onPause() {
        if(this.state) {
            
            if(this.video.sync) {
                try{
                    this.video.paused ? this.video.pause() : 0;    
                }catch(ex) {
                   console.error("video warning");
                }
            }
        } else {

            this.state = false;
            if(this.video.sync) {
                this.video.pause();
            }
           
        }
        this.gui.setBoneInfoState( !this.state );
    }

    setTime(t, force) {

        // Don't change time if playing

        if(this.state && !force)
            return;
            
        this.onUpdateAnimationTime();
        this.gizmo.updateBones();
        
        this.mixer.setTime(t* this.mixer.timeScale);
        this.mixer.update(0);

        // Update video
        this.video.currentTime = this.video.startTime + t;
        if(this.state && force) {
            try{
                this.video.play();
            }catch(ex) {
                console.error("video warning");
            }
        }
    }

    /** -------------------- BONES INTERACTION -------------------- */
    getSelectedBone() {
        const idx = this.gizmo.selectedBone;
        return idx == undefined ? idx : this.skeletonHelper.bones[ idx ];
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
    
        if(this.activeTimeline.name == "Action Units") {
            this.setAnimation("Body");
        }

        this.gizmo.setBone(name);
        this.gizmo.mustUpdate = true;
    }

    updateBoneProperties() {
                            
        const bone = this.skeletonHelper.bones[this.gizmo.selectedBone];
        if(!bone)
        return;
        
        for( const p in this.boneProperties ) {
            // @eg: p as position, element.setValue( bone.position.toArray() )
            this.boneProperties[p].copy( bone[p]);
        }
    }

    /** -------------------- GIZMO INTERACTION -------------------- */
    hasGizmoSelectedBoneIk() { 
        return !!this.gizmo.ikSolver && !!this.gizmo.ikSolver.getChain( this.gizmo.skeleton.bones[this.gizmo.selectedBone].name );
    }
    
    getGizmoTool() { 
        return ( this.gizmo.toolSelected == Gizmo.Tools.ik ) ? "Follow" : "Joint"; 
    }

    setGizmoTool( tool ) { 
        if ( tool == "Follow" ){ this.gizmo.setTool( Gizmo.Tools.ik ); }
        else { this.gizmo.setTool( Gizmo.Tools.joint ); }
    }

    getGizmoMode() {
        return UTILS.firstToUpperCase( this.gizmo.mode );
    }

    setGizmoMode( mode ) {
        if(!mode.length)
        throw("Invalid Gizmo mode");
        
        this.gizmo.setMode( mode.toLowerCase() );
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
        
        if(this.activeTimeline.name != "Action Units")
            this.setAnimation("Face");

        this.selectedAU = au;
        this.activeTimeline.setSelectedItems([au]);
        this.setTime(this.activeTimeline.currentTime);
        
    }

    
    updateBlendshapesProperties(name, value) {
        value = Number(value);
        let tracksIdx = [];                    
        for(let i = 0; i < this.activeTimeline.tracksDrawn.length; i++) {
            let info = this.activeTimeline.tracksDrawn[i][0];
            if(info.type == name && info.active){
                i = info.clipIdx;
                let idx = this.activeTimeline.getCurrentKeyFrame(this.activeTimeline.animationClip.tracks[i], this.activeTimeline.currentTime, 0.01)
                this.activeTimeline.animationClip.tracks[i].values[idx] = value;
                this.auAnimation.tracks[i].values[idx] = value;
                this.blendshapesArray[idx][name] = value;
                let map = this.blendshapesManager.getBlendshapesMap(name);
                for(let j = 0; j < map.length; j++){
                    for(let t = 0; t < this.faceAnimation.tracks.length; t++) {
                        
                        if(this.faceAnimation.tracks[t].name == map[j]) {
                            this.faceAnimation.tracks[t].values[idx] = value;
                            this.faceAnimation.tracks[t].active = info.active;
                            tracksIdx.push(t);
                            break;
                        }
                    }
                }
                // Update animation interpolants
                this.updateAnimationAction(this.faceAnimation, tracksIdx );
                return true;
            }
        }
    }

    updateCaptureDataTime(data, t) {
        let timeAcc = 0;
        let bs = null, lm = null;
        let idx = -1;

        if(data) {
            
            for(let i = 0; i < data.blendshapesResults.length; i++) {
                timeAcc += data.blendshapesResults[i].dt*0.001;
                if(timeAcc <= t) {
                    idx = i             
                }
            }
            if(idx >= 0) {
                bs = data.blendshapesResults[idx];
                if(data.landmarksResults)
                    lm = data.landmarksResults[idx];
            }
        }
        else {
            bs = {};
            t = t != undefined ? t : this.activeTimeline.currentTime;
            for(let i = 0; i < this.activeTimeline.animationClip.tracks.length; i++) {
                
                const track = this.activeTimeline.animationClip.tracks[i];
                if(track.name == this.selectedAU) {
                    let tidx = null;
                    let tidxend = null;
                    let dt = track.times[1] - track.times[0];
                    for(let j = 0; j < track.times.length; j++) {
                        if(track.times[j] <= t + 0.01) {
                            tidx = j;
                        }
                        else if(track.times[j] > t){
                            tidxend = j;
                            break;
                        }
                    }
                    // let tidx = this.activeTimeline.getCurrentKeyFrame(track, this.activeTimeline.currentTime, 0.01);
                    if(tidx < 0 || tidx == undefined)
                        continue;
                    let f = (Math.abs(t - track.times[tidx]) / (track.times[tidxend] - track.times[tidx]) );
                    let value = (1 - f)*track.values[tidx] + f*track.values[tidxend];
                    bs[track.type] = value;

                }
            }
        }
        this.gui.updateCaptureGUI({blendshapesResults: bs, landmarksResults: lm}, false)
    }

    cleanTracks() {
        if(!this.activeTimeline.animationClip)
            return;

        for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

            const track = this.activeTimeline.animationClip.tracks[i];
            if(this.activeTimeline.selectedItems && this.activeTimeline.selectedItems.indexOf(track.name)< 0 && this.mode != this.eModes.script)
                continue;
            let idx =  track.clipIdx;
            let value = null;
                
            if(track.dim == 1)
                value = 0;
            else
                value = [0,0,0,1];

            this.activeTimeline.cleanTrack(idx, value);
            this.updateAnimationAction(this.activeTimeline.animationClip, idx, true);
            if(this.activeTimeline.onPreProcessTrack)
                this.activeTimeline.onPreProcessTrack( track, track.idx );
        } 

            
    }
}

class ScriptEditor extends Editor{
    
    constructor(app) {
                
        super(app);
        // -------------------- SCRIPT MODE --------------------
        this.gizmo = null;        
        this.dominantHand = "Right";
        
        this.blendshapesManager = null;

        this.onDrawTimeline = null;
	    this.onDrawSettings = null;

        this.activeTimeline = null;
        // ------------------------------------------------------
        this.mode = this.eModes.script;
        this.gui = new ScriptGui(this);  
        // this.getDictionaries();
        this.refreshSignsRepository = false;
        this.refreshPresetsRepository = false;
        this.repository = {signs: [], presets: []};
        this.localStorage = {signs: {id: "Local", type:"folder", children: []}, presets: {id: "Local", type:"folder", children: []}}

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

    loadModel(clip) {
        // Load the target model (Eva) 
        UTILS.loadGLTF("https://webglstudio.org/3Dcharacters/Eva/Eva.glb", (gltf) => {
            let model = gltf.scene;
            model.name = this.character;
            model.visible = true;
            
            let skinnedMeshes = {};
             model.traverse( (object) => {
                    if ( object.isMesh || object.isSkinnedMesh ) {
                        object.material.side = THREE.FrontSide;
                        object.frustumCulled = false;
                        object.castShadow = true;
                        object.receiveShadow = true;

                        if (object.name == "Eyelashes")
                            object.castShadow = false;
                        else if (object.name == "Body")
                            object.name == "BodyMesh";
                        if(object.material.map)
                            object.material.map.anisotropy = 16; 

                        this.help = object.skeleton;
                        if(object.morphTargetDictionary ) {

                            this.morphTargets[object.name] = object.morphTargetDictionary;
                            skinnedMeshes[object.name] = object;
                        }
                        
                    } else if (object.isBone) {
                        object.scale.set(1.0, 1.0, 1.0);
                    }
                } );
            
            // correct model
            // model.position.set(0, 0.75, 0);            
            model.rotateOnAxis(new THREE.Vector3(1,0,0), -Math.PI/2);
            model.getObjectByName("mixamorig_RightHand").scale.set( 0.85, 0.85, 0.85 );
            model.getObjectByName("mixamorig_LeftHand").scale.set( 0.85, 0.85, 0.85 );
            this.skeletonHelper = new THREE.SkeletonHelper(model);
            this.skeletonHelper.name = "SkeletonHelper";

            //Create animations
            this.mixer = new THREE.AnimationMixer(model);
            
            this.skeletonHelper.skeleton = this.help; //= createSkeleton();

            //Create face animation from mediapipe blendshapes
            // this.blendshapesManager = new BlendshapesManager(skinnedMeshes, this.morphTargets, this.mapNames);
            
            // guizmo stuff
            this.scene.add( model );
            // this.scene.add( this.skeletonHelper );
            //this.scene.add( this.retargeting.srcSkeletonHelper );
            
            // this.gui.createScriptTimeline();
            // this.gui.updateMenubar();// this.onBeginEdition();
            // Behaviour Planner
            this.eyesTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xffff00 , depthWrite: false }) );
            this.eyesTarget.name = "eyesTarget";
            this.eyesTarget.position.set(0, 2.5, 15); 
            this.headTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0xff0000 , depthWrite: false }) );
            this.headTarget.name = "headTarget";
            this.headTarget.position.set(0, 2.5, 15); 
            this.neckTarget = new THREE.Object3D(); //THREE.Mesh( new THREE.SphereGeometry(0.5, 16, 16), new THREE.MeshPhongMaterial({ color: 0x00fff0 , depthWrite: false }) );
            this.neckTarget.name = "neckTarget";
            this.neckTarget.position.set(0, 2.5, 15); 

            this.scene.add(this.eyesTarget);
            this.scene.add(this.headTarget);
            this.scene.add(this.neckTarget);
            
            model.eyesTarget = this.eyesTarget;
            model.headTarget = this.headTarget;
            model.neckTarget = this.neckTarget;
            
            this.animation = clip || {duration:0, tracks:[]};
            this.setAnimation();
            this.gui.loadBMLClip(this.animation, () => this.gui.init());
          
            this.gizmo = new BMLController(this, skinnedMeshes, this.morphTargets);
            this.gizmo.onUpdateTracks = () => {
                if(this.mixer._actions.length) {
                    this.mixer.stopAllAction();
                    this.mixer.uncacheAction(this.mixer._actions[this.mixer._actions.length - 1]);
                    this.mixer._actions.pop();
                }
                this.mixer.clipAction( this.animation  ).setEffectiveWeight( 1.0 ).play();
                this.setTime(this.activeTimeline.currentTime);
            }
            this.activeTimeline.onUpdateTrack = this.gizmo.updateTracks.bind(this.gizmo);
            this.gizmo.begin(this.activeTimeline);
            this.animate();
            $('#loading').fadeOut();
            
        });   
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
                this.animation = anim;
                this.gui.loadBMLClip(this.animation);
            }
            else {
                this.gui.prompt = new LX.Dialog("Import animation" , (p) => {
                    p.addText("", "There is already an animation. What do you want to do?", null, {disabled: true});
                    p.sameLine(3);
                    p.addButton(null, "Replace", () => { 
                        this.clearAllTracks(false);
                        this.clipName = anim.name;
                        this.animation = anim;
                        this.activeTimeline.currentTime = 0;
                        this.gui.loadBMLClip(this.animation);
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
    
    updateTracks(tracks) {

        if(!this.gizmo)
            return;
        this.gizmo.updateTracks();

        if(tracks) {
            for(let t = 0; t < tracks.length; t++) {
                let [trackIdx, clipIdx] = tracks[t];
                let clip = this.activeTimeline.animationClip.tracks[trackIdx].clips[clipIdx].toJSON();
                if(this.animation.tracks.length == trackIdx)
                    this.animation.tracks.push([clip]);
                else
                    this.animation.tracks[trackIdx][clipIdx] = clip;
            }
        }
        // else if(trackIdx != null) {
        //     for(let i = 0; i < this.activeTimeline.animationClip.tracks[trackIdx].clips.length; i++) {

        //         this.animation.tracks[trackIdx][i] = this.activeTimeline.animationClip.tracks[trackIdx].clips[i];
        //     }
        // }
         else {
            for(let idx = 0; idx < this.activeTimeline.animationClip.tracks.length; idx++) {
                for(let i = 0; i < this.activeTimeline.animationClip.tracks[idx].clips.length; i++) {

                    this.animation.tracks[idx][i] = this.activeTimeline.animationClip.tracks[idx].clips[i].toJSON();
                }
            }
        }
        this.mixer.update(0);

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

        let json =  {
            behaviours: [],
            //indices: [],
            name : this.clipName || "BML animation",
            duration: this.animation.duration,
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
            alert("You can't export an animation with empty tracks.")
            return;
        }
       
        for(let i = 0; i < this.activeTimeline.animationClip.tracks.length; i++ ) {
            for(let j = 0; j < this.activeTimeline.animationClip.tracks[i].clips.length; j++) {
                let data = this.activeTimeline.animationClip.tracks[i].clips[j];
                let type = ANIM[data.constructor.name];
                if(data.toJSON) data = data.toJSON();
                if(data)
                {
                    if(data.type == "glossa") {
                        let actions = { faceLexeme: [], gaze: [], head: [], gesture: [], speech: []};
                       
                        for(let action in actions) {
                            if(data[action])
                                json.behaviours = [...json.behaviours, ...data[action]];
                            //json.indices.push(type.id);
                        }
                    }
                    else {

                        json.behaviours.push( data );
                        //json.indices.push(type.id);
                    }
                }
                
                
            }
        }

        return json;
    }

    createServerFolders() {
        const session = this.FS.getSession();
        this.FS.createFolder( session.user.username + "/animics/presets/", (v, r) => {console.log(v)} );
        this.FS.createFolder( session.user.username + "/animics/signs/", (v, r) => {console.log(v)} );
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