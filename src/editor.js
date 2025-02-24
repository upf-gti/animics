import * as THREE from "three";
import { OrbitControls } from "./controls/OrbitControls.js";
import { BVHLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/BVHLoader.js';
import { BVHExporter } from "./exporters/BVHExporter.js";
import { createAnimationFromRotations, createEmptyAnimation } from "./skeleton.js";
import { KeyframesGui, ScriptGui } from "./gui.js";
import { Gizmo } from "./gizmo.js";
import { UTILS } from "./utils.js"
import { NN } from "./ML.js"
import { OrientationHelper } from "./libs/OrientationHelper.js";
import { AnimationRetargeting, findIndexOfBone, findIndexOfBoneByName } from './retargeting.js'
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from './exporters/GLTFExporoter.js' 
import { BMLController } from "./controller.js"
import { BlendshapesManager } from "./blendshapes.js"
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';

import { LX } from "lexgui"
import { Quaternion, Vector3 } from "./libs/three.module.js";

// const MapNames = await import('../data/mapnames.json', {assert: { type: 'json' }});
const MapNames = await (await fetch('./data/mapnames.json')).json();
// Correct negative blenshapes shader of ThreeJS
THREE.ShaderChunk[ 'morphnormal_vertex' ] = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n	    objectNormal += getMorph( gl_VertexID, i, 1, 2 ) * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_pars_vertex' ] = "#ifdef USE_MORPHTARGETS\n	uniform float morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		uniform sampler2DArray morphTargetsTexture;\n		uniform vec2 morphTargetsTextureSize;\n		vec3 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset, const in int stride ) {\n			float texelIndex = float( vertexIndex * stride + offset );\n			float y = floor( texelIndex / morphTargetsTextureSize.x );\n			float x = texelIndex - y * morphTargetsTextureSize.x;\n			vec3 morphUV = vec3( ( x + 0.5 ) / morphTargetsTextureSize.x, y / morphTargetsTextureSize.y, morphTargetIndex );\n			return texture( morphTargetsTexture, morphUV ).xyz;\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_vertex' ] = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			#ifndef USE_MORPHNORMALS\n				transformed += getMorph( gl_VertexID, i, 0, 1 ) * morphTargetInfluences[ i ];\n			#else\n				transformed += getMorph( gl_VertexID, i, 0, 2 ) * morphTargetInfluences[ i ];\n			#endif\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif"; 


class Editor {
    static RESOURCES_PATH = "https://webglstudio.org/3Dcharacters/";
    static PERFORMS_PATH = "https://webglstudio.org/projects/signon/performs";
    
    constructor( animics ) {
        
        this.character = "Eva";

        this.currentCharacter = null;
        this.loadedCharacters = {};
                
        this.currentAnimation = "";
        this.loadedAnimations = {}; // loaded animations from mediapipe&NN or BVH
        this.bindedAnimations = {}; // loaded retargeted animations binded to characters
        this.animationFrameRate = 30;

        this.clock = new THREE.Clock();
        this.BVHloader = new BVHLoader();
        this.loaderGLB = new GLTFLoader();
        this.GLTFExporter = new GLTFExporter();

        this.help = null;
        this.camera = null;
        this.controls = null;
        this.scene = null;
        this.orientationHelper = null;
        
        this.boneUseDepthBuffer = true;

        this.renderer = null;
        this.state = false; // defines how the animation starts (moving/static)
        
        this.showGUI = true;
        this.showSkin = true; // defines if the model skin has to be rendered
        this.animLoop = true;

        this.delayedResizeID = null;
        this.delayedResizeTime = 500; //ms

        this.currentTime = 0;

        this.ANIMICS = animics;
        this.remoteFileSystem = animics.remoteFileSystem;

        this.enabled = true;
        
        // Only used in KeyframeEditor. But it might be useful in ScriptEditor for having a video reference in the future
        this.video = document.createElement( "video" );
        this.video.startTime = 0;
        this.video.sync = false; // If TRUE, synchronize video with animation. BVH/e always FALSE

        this.editorArea = new LX.Area({id: "editor-area", width: "100%", height: "100%"});
        animics.mainArea.attach(this.editorArea);
    }

    enable() {
        this.enabled = true;
        this.editorArea.root.classList.remove("hidden");
    }

    disable() {
        this.enabled = false;
        // This already disables events
        this.editorArea.root.classList.add("hidden");
    }

    //Create canvas scene
    async init(settings, showGuide = true) {
        
        this.createScene();
        this.disable()
        await this.initCharacters();

        if( settings.pendingResources ) {
            UTILS.makeLoading("Loading files...");
        }
        else {
            UTILS.makeLoading("Preparing scene...");
        }

        await this.processPendingResources(settings.pendingResources);
        this.gui.init(showGuide);
        
        this.enable();
        this.bindEvents();
        
        UTILS.hideLoading();

        this.animate();

        window.onbeforeunload =  (e) => {
            if(!this.currentAnimation || !this.loadedAnimations[this.currentAnimation]) {
                return;
            }
            e.preventDefault();
            e.returnValue = "";
            window.stop();
            return "Be sure you have exported the animation. If you exit now, your data will be lost."
        }
    }    

    createScene() {

        const canvasArea = this.gui.canvasArea;
        const [CANVAS_WIDTH, CANVAS_HEIGHT] = canvasArea.size;

        // Create scene
        const scene = new THREE.Scene();
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

        // Left spotlight
        const spotLight = new THREE.SpotLight( 0xffffff, 0.5 );
        spotLight.position.set(-2,2,2);
        spotLight.penumbra = 1;
        spotLight.castShadow = false;
        scene.add( spotLight );
        
        // Right spotlight
        const spotLight2 = new THREE.SpotLight( 0xffffff, 0.5 );
        spotLight2.position.set(1, 3, 1.5);
        spotLight2.penumbra = 1;
        spotLight2.castShadow = true;
        spotLight2.shadow.bias = -0.0001;
        spotLight2.shadow.mapSize.width = 2048;
        spotLight2.shadow.mapSize.height = 2048;
        scene.add( spotLight2 );
        
        const spotLightTarget = new THREE.Object3D();
        spotLightTarget.position.set(0, 1.5, 0); 
        scene.add( spotLightTarget );
        spotLight.target = spotLightTarget;
        spotLight2.target = spotLightTarget;

        // Create 3D renderer
        const pixelRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
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
        const camera = new THREE.PerspectiveCamera(60, pixelRatio, 0.1, 1000);
        camera.position.set(-0.1175218614251044, 1.303585797450244, 1.4343282767035261);
        
        window.camera = camera;
        const controls = new OrbitControls(camera, renderer.domElement);
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

    async initCharacters() {
      
        // Load current character
        this.loadCharacter(this.character);
        
        while(!this.loadedCharacters[this.character] ) {
            await new Promise(r => setTimeout(r, 1000));            
        }        

    }

    loadCharacter(characterName) {

        let modelName = characterName.split("/");
        UTILS.makeLoading("Loading GLTF [" + modelName[modelName.length - 1] +"]...")
        // Load the target model (Eva) 
        this.loaderGLB.load(Editor.RESOURCES_PATH + characterName + "/" + characterName + ".glb", (gltf) => {
            const model = gltf.scene;
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
           
            if( this.isScriptMode() ) {
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
                fetch( Editor.RESOURCES_PATH + characterName + "/" + characterName + ".json" ).then(response => response.text()).then( (text) => {
                    const config = JSON.parse( text );
                    this.loadedCharacters[characterName].bmlManager = new BMLController( this.loadedCharacters[characterName] , config);
                    this.changeCharacter(characterName);
                })
            }
            else {
                this.loadedCharacters[characterName].blendshapesManager = new BlendshapesManager(skinnedMeshes, morphTargets, this.mapNames);
                this.changeCharacter(characterName);
            }

        });   
    }

    changeCharacter(characterName) {
        // Check if the character is already loaded
        if( !this.loadedCharacters[characterName] ) {
            console.warn(characterName + " not loaded");
            this.loadCharacter(characterName);
            return;
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
        
        UTILS.hideLoading();
    }

    fileToAnimation (data, callback)  {
        
        if(data.fullpath) {
            const extension = UTILS.getExtension(data.fullpath).toLowerCase();
            LX.request({ url: this.remoteFileSystem.root + data.fullpath, dataType: 'text/plain', success: ( content ) => {
                if( content == "{}" )  {
                    callback({content});
                    return;
                }
                const bytesize = content => new Blob([ content ]).size;
                data.bytesize = bytesize();
                data.content = content;

                if( extension.includes('bvhe') ) {
                    data.animation = this.BVHloader.parseExtended( content );
                }
                else if( extension.includes('bvh') ) {
                    data.animation = { skeletonAnim: this.BVHloader.parse( content ) };
                }
                else if( extension.includes('sigml') ) {
                    data.animation = sigmlStringToBML( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                }
                else if( extension.includes( "bml" ) || extension.includes("json") ) {
                    data.animation = JSON.parse( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                }
                else {
                    data.animation = null; // TO DO FOR GLB AND GLTF
                }

                if( callback ) {
                    callback(data);
                }
            } });
        }
        else {

            const innerParse = (event) => {
                const content = event.srcElement ? event.srcElement.result : event;
                data.content = content;
                if( content == "{}" )  {
                    callback(null);
                    return;
                }
                const type = data.type || UTILS.getExtension(data.name).toLowerCase();
                
                if(type.includes('bvhe')) {
                    data.animation = this.BVHloader.parseExtended( content );
                }
                else if(type.includes('bvh')) {
                    data.animation = { skeletonAnim: this.BVHloader.parse( content ) };
                }
                else if( type.includes('sigml') ) {
                    data.animation = sigmlStringToBML( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                }
                else if( type.includes( "bml" ) || type.includes("json") ) {
                    data.animation = JSON.parse( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
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

    setPlaybackRate(v){    
        v = Math.max( 0.0001, v );
        this.currentCharacter.mixer.timeScale = v;
    }

    bindEvents() {

        // Cancel default browser listener
        document.addEventListener( "keydown", (e) => {
            if( e.ctrlKey && ( e.key == "o" || e.key == "O" ) ) {
                e.preventDefault();
            }
        });

        this.editorArea.root.ondrop = async (e) => {
			e.preventDefault();
			e.stopPropagation();
	
			const files = e.dataTransfer.files;
            if(!files.length) {
                return;
            }
			await this.loadFiles(files);
        };

        this.editorArea.root.addEventListener( 'keydown', (e) => {
            switch ( e.key ) {
                case " ": // Spacebar - Play/Stop animation       
                    if(e.target.constructor.name != 'HTMLInputElement') {

                        e.preventDefault();
                        e.stopImmediatePropagation();
                        let playElement = this.editorArea.root.querySelector("[title = Play]");
                        if ( playElement ){ 
                            playElement.children[0].click();
                        }
                    }
                break;

                case "Escape": // Close open dialogs/prompts
                    this.gui.closeDialogs();                    
                break;

                case 'z': case 'Z': // Undo
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        // TO DO: Implement it for Script editors
                        this.undo();

                        // if(this.activeTimeline.undo) {
                        //     this.activeTimeline.undo();

                        //     if(this.mode == this.editionModes.SCRIPT) {
                        //         this.gui.updateClipPanel();
                        //     }
                        // }
                    }
                    break;

                case 'y': case 'Y': // Redo
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        // TO DO: Implement it for Script editors
                        this.redo();
                        // if(this.activeTimeline.redo) {
                        //     this.activeTimeline.redo();
                        //     if(this.mode == this.editionModes.SCRIPT) {
                        //         this.gui.updateClipPanel();
                        //     }
                        // }
                    }
                    break;
                
                case 's': case 'S': // Save animation/s to server
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        
                        this.gui.createSaveDialog();
                    }
                    break;

                case 'e': case 'E': // Export animation/s
                    if(e.ctrlKey) {
                        if(e.altKey) {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                            LX.prompt("File name", "Export GLB", (v) => this.export(null, "GLB", true, v), {input: this.clipName, required: true} )     
                        }
                    }
                    break;

                case 'a': case 'A': // Select 
                    if(e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        if(this.activeTimeline.selectAll) {
                            this.activeTimeline.selectAll();
                        }
                    }
                    break;
               

                case 'o': case 'O': // Import file from disk
                    if(e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        this.gui.importFiles();
                    }
                    break;
            }

            this.onKeyDown(e);
        } );
    }

    /** -------------------- UPDATES, RENDER AND EVENTS -------------------- */

    animate() {

        requestAnimationFrame(this.animate.bind(this));

        this.render();
        this.update(this.clock.getDelta());

    }

    render() {

        if(!this.renderer) {
            return;
        }

        this.renderer.render(this.scene, this.camera);
        if(this.activeTimeline)
            this.gui.drawTimeline(this.activeTimeline);            

    }

    update( dt ) {

        if ( this.currentTime > this.activeTimeline.duration ) {
            this.currentTime = this.activeTimeline.currentTime = 0.0;
            this.onAnimationEnded();
        }

        if ( this.currentCharacter.mixer && this.state ) {
            this.currentCharacter.mixer.update( dt );
            this.currentTime = this.currentCharacter.mixer.time;
            this.activeTimeline.setTime( this.currentTime, true );
        }
       
        this.onUpdate( dt );
    }

    onAnimationEnded() {

        if( this.animLoop ) {
            // user increased the duration of the animation. But the video is "trimmed" so it was paused at the endTime until the loop were reached
            if ( this.video.sync && this.video.paused ) { 
                this.video.play();
            }
            this.setTime(0.0, true);
        } 
        else {
            this.currentCharacter.mixer.setTime(0);
            this.currentCharacter.mixer._actions[0].paused = true;
            const stateBtn = document.querySelector("[title=Play]");
            stateBtn.children[0].click();

            if( this.video.sync ) {
                this.video.pause();
                this.video.currentTime = this.video.startTime;
            }
        }
    }

    // Play all animations
    play() {
        this.state = true;
        this.onPlay();
    }

    // Stop all animations 
    stop() {
        this.state = false;
        
        let t = 0.0;
        this.setTime( 0 );
        this.activeTimeline.currentTime = t;
        this.activeTimeline.onSetTime( t );
        
        this.onStop();
    }

    pause() {
        this.state = !this.state;
        // this.activeTimeline.active = !this.activeTimeline.active;
        if( this.state ) {
            this.onPlay();
        }
        else {
            this.onPause();
        }
    }

    setTime( t, force ) {

        // Don't change time if playing
        // this.gui.currentTime = t;
        if( this.state && !force ) {
            return;
        }

        const duration = this.activeTimeline.animationClip.duration;
        
        t = Math.clamp( t, 0, duration - 0.001 );
        // mixer computes time * timeScale. We actually want to set the raw animation (track) time, without any timeScale 
        this.currentCharacter.mixer.setTime( t / this.currentCharacter.mixer.timeScale ); //already calls mixer.update
        this.currentCharacter.mixer.update(0); // BUG: for some reason this is needed. Otherwise, after sme timeline edition + optimization, weird things happen
        this.currentTime = t;

        this.onSetTime(t);
    }

    setAnimationLoop( loop ) {
            
        for(let i = 0; i < this.currentCharacter.mixer._actions.length; i++) {

            if( loop ) {
                this.currentCharacter.mixer._actions[i].loop = THREE.LoopOnce;
            }
            else {
                this.currentCharacter.mixer._actions[i].loop = THREE.LoopRepeat;
            }
        }
    }

    getCurrentBindedAnimation() {
        const bindedAnim = this.bindedAnimations[this.currentAnimation]; 
        return bindedAnim ? bindedAnim[this.currentCharacter.name] : null;
    }

    getCurrentAnimation() {
        return this.loadedAnimations[this.currentAnimation];
    }

    getAnimationsToExport() {
        const toExport = [];
        for(let animationName in this.loadedAnimations) {
            const animation = this.loadedAnimations[animationName];

            if( animation.export ){
                toExport.push(animation);
            }
        }
        return toExport;
    }

    resize( width = this.gui.canvasArea.root.clientWidth, height = this.gui.canvasArea.root.clientHeight ) {
        
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height); // SLOW AND MIGHT CRASH THE APP

        this.gui.resize(width, height);
    }

    // Waits until delayedResizeTime to actually resize webGL. New calls reset timeout. To avoid slow resizing and crashes.
    delayedResize( width = this.gui.canvasArea.root.clientWidth, height = this.gui.canvasArea.root.clientHeight ) {
        if ( this.delayedResizeID ) {
            clearTimeout(this.delayedResizeID); this.delayedResizeID = null;
        }
        this.delayedResizeID = setTimeout( () => { this.delayedResizeID = null; this.resize(width, height); }, this.delayedResizeTime );

        this.renderer.domElement.style.width = width + "px";
        this.renderer.domElement.style.height = height + "px";
        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
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
                                        
                    // Check if it already has extension
                    let clipName = name || animation.saveName;

                    let bvh = "";
                    // Add the extension
                    if(type == 'BVH') {
                        bvh = this.generateBVH( bindedAnim, skeleton );
                        clipName += '.bvh';
                    }
                    else if(type == 'BVH extended') {
                        bvh = this.generateBVHE( bindedAnim, skeleton );
                        clipName += '.bvhe';
                    }

                    if(download) {
                        UTILS.download(bvh, clipName, "text/plain" );
                    }
                    else {
                        files.push({name: clipName, data: UTILS.dataToFile(bvh, clipName, "text/plain")});
                    }
                }
                break;

            default:
                const json = this.generateBML();
                if( !json ) {
                    return;  
                } 
                UTILS.download(JSON.stringify(json), (name || json.name) + '.bml', "application/json");
                console.log(type + " ANIMATION EXPORTATION IS NOT YET SUPPORTED");
                break;
    
        }
        // bvhexport sets avatar to bindpose. Avoid user seeing this
        this.bindAnimationToCharacter(this.currentAnimation);
        return files;
    }

    uploadData(filename, data, type, location, callback) {
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
        const session = this.remoteFileSystem.session;
        const username = session.user.username;
        const folder = "animics/"+ type;

        session.getFileInfo(username + "/" + folder + "/" + filename, (file) => {

            if( file && file.size ) {
              
                LX.prompt("Do you want to overwrite the file?", "File already exists", () => {
                    this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then( () => callback(filename));
                    }, 
                    {input: false, on_cancel: () => {
                        LX.prompt("Rename the file", "Save file", (v) => {
                            if(v === "" || !v) {
                                alert("You have to write a name.");
                                return;
                            }
                            this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + v, new File([data], filename ), []).then( () => callback(v));
                        }, {input: filename, accept: "Yes"} )
                    }
                } )                
            }
            else {
                this.remoteFileSystem.uploadFile(username + "/" + folder + "/" + filename, new File([data], filename ), []).then(() => callback(filename));
            }
        },
        () => {
            //create folder
        });
    }

    showPreview() {
        
        const sendData = (msg) => {
            if(this.performsApp)
                this._realizer.postMessage(msg);
            else {
                setTimeout(sendData.bind(this, msg), 1000)
            }
        }
        
        const openPreview = (data) => {
            if( !this._realizer || this._realizer.closed ) {
                this._realizer = window.open(Editor.PERFORMS_PATH, "Preview");
                this._realizer.onload = (e, d) => {
                    this.performsApp = e.currentTarget.global.app;
                    sendData(data);
                }
    
                this._realizer.addEventListener("beforeunload", () => {
                    this._realizer = null
                });
            }
            else {
                sendData(data);       
            }
            this._realizer.focus();
        }
         
        if( this.isScriptMode() ) {
            
            const json = this.generateBML();
            if(!json)  {
                return;
            }

            const data = JSON.stringify([{type: "bml", data: json.behaviours}]);
            openPreview(data);
        }
        else {
            this.gui.showExportAnimationsDialog("Preview animations", () => {
                const files = this.export(this.getAnimationsToExport(), "BVH extended", false);
                const data = {type: "bvhe", data: files};
                openPreview(data);
            })            
        }        
    }

    isScriptMode() {
        return this.constructor == ScriptEditor;
    }

    onKeyDown( event ) {} // Abstract
    redo() {}
    undo() {}
    onUpdate( dt ) {} // Abstract
    onPlay() {} // Abstract
    onStop() {} // Abstract
    onPause() {} // Abstract
    onSetTime() {} // Abstract
    clearAllTracks() {} // Abstract
    updateAnimationAction(animation, idx, replace = false) {}
    setTimeline(type) {};

    processPendingResources(resources) {} // Abstract
}

class KeyframeEditor extends Editor { 
    
    constructor( animics ) {
                
        super(animics);

        this.animationInferenceModes = {NN: 0, M3D: 1}; // either use ML or mediapipe 3d approach to generate an animation (see buildanimation and bindanimation)
        this.inferenceMode = new URLSearchParams(window.location.search).get("inference") == "NN" ? this.animationInferenceModes.NN : this.animationInferenceModes.M3D;

        this.defaultTranslationSnapValue = 0.1;
        this.defaultRotationSnapValue = 30; // Degrees
        this.defaultScaleSnapValue = 1;

        this.showSkeleton = true;
        this.gizmo = null;

        this.applyRotation = false; // head and eyes rotation
        this.selectedAU = "Brow Left";
        this.selectedBone = "mixamorig_Hips";
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.nn = new NN("data/ML/model.json");
            this.nnSkeleton = null;
        }

        this.retargeting = null;
        
        this.mapNames = MapNames.map_llnames[this.character];

        // Create GUI
        this.gui = new KeyframesGui(this);

        this.animationModes = {FACE: 0, BODY: 1};
        this.animationMode = this.animationModes.BODY;

        this.localStorage = {clips: {id: "Local", type:"folder", children: []}};
    }

    onKeyDown ( event ) {
        switch( event.key ) {

            case 'w': case 'W': // Show/hide propagation window
                if ( !document.activeElement || document.activeElement.value === undefined ){
                    this.gui.propagationWindow.toggleEnabler();
                    if( this.gui.propagationWindow.enabler ){
                        this.gui.keyFramesTimeline.unSelectAllKeyFrames();
                        this.gui.curvesTimeline.unSelectAllKeyFrames();
                    }
                }
            break;
            case 'i': case 'i': // Open file from server
                if(event.ctrlKey && !event.shiftKey) {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    this.gui.createServerClipsDialog();                    
                }
            break;
        }
    }
    
    undo() {
        
        if(this.activeTimeline.undo) {
            this.activeTimeline.undo();
        }
    }

    redo() {
        if(this.activeTimeline.redo) {
            this.activeTimeline.redo();
        }
    }

    async initCharacters() {
        // Create gizmo
        this.gizmo = new Gizmo(this);

        // Load current character
        this.loadCharacter(this.character);
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ) {
            this.loadNNSkeleton();
        }

        while(!this.loadedCharacters[this.character] || ( !this.nnSkeleton && this.inferenceMode == this.animationInferenceModes.NN ) ) {
            await new Promise(r => setTimeout(r, 1000));            
        }        

        this.setBoneSize(0.05);
    }
    
    loadNNSkeleton() {
        this.BVHloader.load( 'data/models/kateBVH.bvh', (result) => {
            // loader does not correctly compute the skeleton boneInverses and matrixWorld 
            result.skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
            result.skeleton = new THREE.Skeleton( result.skeleton.bones ); // will automatically compute boneInverses
            
            result.skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } ); // bodyAnimation have different names than bvh skeleton
            
            this.nnSkeleton = result.skeleton;
        });
    }

    async processPendingResources( resources ) {
        if( !resources ) {
            let animation = {clip : createEmptyAnimation("bodyAnimation", this.currentCharacter.skeletonHelper.bones), skeleton: this.currentCharacter.skeletonHelper};
            this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
            this.loadAnimation("new animation", { skeletonAnim : animation});
            return true;
        }
        
        // TO DO
        const loaded = await this.loadFiles(resources);
        if( !loaded ) {
            await this.processPendingResources();
        }
    }

    async loadFiles(files) {
        const animExtensions = ['bvh','bvhe'];
        const resultFiles = [];
        const promises = [];


        for(let i = 0; i < files.length; ++i){
            UTILS.makeLoading("Loading animation: " + files[i].name );
            // MIME type is video
            if( files[i].type.startsWith("video/") ) {
                resultFiles.push( files[i] );
                continue;
            }
            // other valid file formats
            const extension = UTILS.getExtension(files[i].name).toLowerCase();                   
            if( animExtensions.includes(extension) ) {
                    const promise = new Promise((resolve) => {
                        this.fileToAnimation(files[i], (file) => {
                            this.loadAnimation( file.name, file.animation );
                            resolve(file.animation);
                            UTILS.hideLoading();
                        });
                    })
                    promises.push( promise );
            }
            else {
                alert(extension + ": Format not supported.\n\nFormats accepted:\n\t'bml', 'sigml', 'json'\n\t");
            }
        }

        if( resultFiles.length ) {
            
            const animations = await this.ANIMICS.processVideos(resultFiles);
            if( !animations ) {
                return false;
            }

            const promise = new Promise((resolve) => {
                for( let i = 0; i < animations.length; i++ ) {
                    this.buildAnimation(animations[i]);
                }
                resolve();
            })
            promises.push(promise);
        }
        if( !promises.length ) {
            
            LX.popup("The file is empty or has an incorrect format.", "Ops! Animation Load Issue!", {timeout: 9000, position: [ "10px", "50px"] });           
            UTILS.hideLoading();
        }

        return Promise.all( promises );
    }

    async captureVideo() {
        
        const animation = await this.ANIMICS.processWebcam();
        if( !animation ) {
            return;
        }
        this.buildAnimation(animation);
        
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
        else {
            this.loadedAnimations[data.name].bodyAnimation = landmarks; // array of objects of type { FLM, PLM, LLM, RLM, PWLM, LWLM, RWLM }. Not an animation clip
        }
        
        // Create face animation from mediapipe action units
        let faceAnimation = this.currentCharacter.blendshapesManager.createAnimationFromActionUnits("faceAnimation", blendshapes); // faceAnimation is an action units clip
        this.loadedAnimations[data.name].faceAnimation = faceAnimation; // action units THREEjs AnimationClip

        this.bindAnimationToCharacter(data.name);
    }

    // load animation from bvh or bvhe file
    loadAnimation(name, animationData) {

        let skeleton = null;
        let bodyAnimation = null;
        let faceAnimation = null;
        if ( animationData && animationData.skeletonAnim ){
            skeleton = animationData.skeletonAnim.skeleton;
            skeleton.bones.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()|+\-=?;:'"<>\{\}\\\/]/gi, "") } );
            // loader does not correctly compute the skeleton boneInverses and matrixWorld 
            skeleton.bones[0].updateWorldMatrix( false, true ); // assume 0 is root
            skeleton = new THREE.Skeleton( skeleton.bones ); // will automatically compute boneInverses
            
            animationData.skeletonAnim.clip.tracks.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()|+\-=?;:'"<>\{\}\\\/]/gi, "") } );     
            animationData.skeletonAnim.clip.name = "bodyAnimation";
            bodyAnimation = animationData.skeletonAnim.clip;
        }
        // If it has face animation, it means that comes from BVHe
        if ( animationData && animationData.blendshapesAnim ) {
            animationData.blendshapesAnim.name = "faceAnimation";       
            faceAnimation = animationData.blendshapesAnim.clip;
            // // Convert morph target animation (threejs with character morph target names) into Mediapipe Action Units animation
            // faceAnimation = this.currentCharacter.blendshapesManager.createMediapipeAnimation(faceAnimation);
        }
        else { // Otherwise, create empty animation
            // faceAnimation = THREE.AnimationClip.CreateFromMorphTargetSequence('BodyMesh', this.currentCharacter.model.getObjectByName("BodyMesh").geometry.morphAttributes.position, 24, false);
            faceAnimation = this.currentCharacter.blendshapesManager.createEmptyAnimation("faceAnimation");
            faceAnimation.duration = bodyAnimation.duration;
            faceAnimation.from = "";
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
        
        const animation = this.loadedAnimations[animationName];
        if( !animation ) {
            console.warn(animationName + " not found");
            return false;
        }

        this.currentAnimation = animationName;

        if ( animationName != this.currentAnimation ) {
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
                        tracks[tracks.length - 1].name = tracks[tracks.length - 1].name.replace( /[\[\]`~!@#$%^&*()|+\-=?;:'"<>\{\}\\\/]/gi, "").replace(".bones", "");
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
                                
                if(animation.type == "video") {
                    auAnimation = faceAnimation;
                    faceAnimation = this.currentCharacter.blendshapesManager.createBlendShapesAnimation(animation.blendshapes);
                }
                else {
                    // Convert morph target animation (threejs with character morph target names) into Mediapipe Action Units animation
                    auAnimation = this.currentCharacter.blendshapesManager.createMediapipeAnimation(faceAnimation);
                }
                // set track value dimensions. Necessary for the timeline, although it should automatically default to 1
                for( let i = 0; i < auAnimation.tracks.length; ++i ){
                    auAnimation.tracks[i].dim = 1;
                }

                auAnimation.duration = faceAnimation.duration;
                // Set keyframe animation to the timeline and get the timeline-formated one.
                auAnimation = this.gui.curvesTimeline.setAnimationClip( auAnimation, true );

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
        this.setTimeline(this.animationMode);
        this.gizmo.updateBones();
        // mixer.setTime(0);

        if ( animation.type == "video" ) {
            this.video.sync = true;
            this.setVideoVisibility(true);
            this.video.onloadeddata = () =>{
                this.video.currentTime = Math.max( this.video.startTime, Math.min( this.video.endTime, this.activeTimeline.currentTime ) );
                this.video.click();
                if ( this.activeTimeline.playing ){
                    this.video.play();
                }            
            }
            this.video.src = animation.videoURL;
            this.video.startTime = animation.startTime ?? 0;
            this.video.endTime = animation.endTime ?? 1;
        }
        else {
            
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

    setVideoVisibility( visibility, needsMirror = false ){ // TO DO
        //document.getElementById("capture").style.display = (visibility & this.video.sync) ? "" : "none";
        if(visibility && this.getCurrentAnimation().type == "video") {
            this.gui.showVideoOverlay(needsMirror);
        }
        else {
            this.gui.hideVideoOverlay();
        }
    }

    setPlaybackRate( v ) {
        v = Math.min( 16, Math.max( 0.1, v ) );
        if( this.video.sync ) {
            this.video.playbackRate = v; 
        }
        this.currentCharacter.mixer.timeScale = v;
    }

    setBoneSize(newSize) {
        const geometry = this.gizmo.bonePoints.geometry;
        const positionAttribute = geometry.getAttribute( 'position' );
        this.gizmo.bonePoints.geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( new Array(positionAttribute.count).fill(newSize), 1 ) );
        this.gizmo.raycaster.params.Points.threshold = newSize/10;
    }

    onUpdate(dt) {
        // the user increased the duration of the animation but the video is trimmed. Keep it paused at endTime until loop        
        if ( this.video.sync && this.video.currentTime >= this.video.endTime ) {
            this.video.pause(); // stop video on last frame until loop
        }
        this.gizmo.update(this.state, dt);        
    }

    onPlay() {
     
        this.gui.setBoneInfoState( false );
        if( this.video.sync ) {
            try {
                this.video.paused ? this.video.play() : 0;    
            }
            catch(ex) {
                console.error("video warning");
            }
        }
    }

    // Stop all animations 
    onStop() {

        this.gizmo.updateBones();
        if( this.video.sync ) {
            this.video.pause();
            this.video.currentTime = this.video.startTime;
        }
    }

    onPause() {
        this.state = false;
        if( this.video.sync ) {
            try{
                !this.video.paused ? this.video.pause() : 0;    
            }catch(ex) {
                console.error("video warning");
            }
        }
        this.gui.setBoneInfoState( !this.state );
        this.gui.propagationWindow.setTime( this.currentTime );
    }

    onSetTime( t ) {
        // Update video
        if( this.getCurrentAnimation().type == "video" ) {
            this.video.currentTime = this.video.startTime + t;
        }
        this.gizmo.updateBones();
    }

    clearAllTracks() {
        if( !this.activeTimeline.animationClip ) {
            return;
        }

        for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

            const track = this.activeTimeline.animationClip.tracks[i];
            if( this.activeTimeline.selectedItems.indexOf(track.name) < 0 ) {
                continue;
            }

            const idx = track.clipIdx; //index of track in the entire animation
            let value = null;
                
            if( track.dim == 1 ) {
                value = 0;        
            }
            else {
                value = [0,0,0,1];
            }            

            this.activeTimeline.clearTrack(idx, value);
                
            this.updateAnimationAction(this.activeTimeline.animationClip, idx);
            
            if(this.activeTimeline.onPreProcessTrack) {
                this.activeTimeline.onPreProcessTrack( track, track.idx );
            }
        }
    }
    
    /**
     * hides/show timelines depending on the type sent (BODY, FACE). DOES NOT set the character.mixer animations
     * @param {animationModes} type 
     * @returns 
     */
    setTimeline(type) {

        let currentTime = this.activeTimeline ? this.activeTimeline.currentTime : 0;
        
        // hide previous timeline
        if(this.activeTimeline && this.animationMode != type) {
            this.activeTimeline.hide();
        }

        switch(type) {
            case this.animationModes.FACE:
                this.animationMode = this.animationModes.FACE;
                this.gui.curvesTimeline.setSpeed( this.activeTimeline.speed ); // before activeTimeline is reassigned
                this.activeTimeline = this.gui.curvesTimeline;
                this.activeTimeline.setAnimationClip( this.getCurrentBindedAnimation().auAnimation, false );
                this.activeTimeline.show();
                currentTime = Math.min( currentTime, this.activeTimeline.animationClip.duration );
                if( !this.selectedAU ) {
                    return;
                }
                if( this.gizmo ) { 
                    this.gizmo.disable();
                }

                this.setSelectedActionUnit(this.selectedAU);                    
                break;
                
            case this.animationModes.BODY:
                this.animationMode = this.animationModes.BODY;
                this.gui.keyFramesTimeline.setSpeed( this.activeTimeline.speed ); // before activeTimeline is reassigned
                if( this.gizmo ) {
                    this.gizmo.enable();
                }

                this.activeTimeline = this.gui.keyFramesTimeline;
                this.activeTimeline.setAnimationClip( this.getCurrentBindedAnimation().skeletonAnimation, false );
                this.activeTimeline.show();

                currentTime = Math.min( currentTime, this.activeTimeline.animationClip.duration );
                this.setSelectedBone(this.selectedBone); // select bone in case of change of animation
                break;

            default:                   
                break;
        }
        
        this.activeTimeline.currentTime = currentTime;
        this.setTime(currentTime, true);
        this.activeTimeline.updateHeader();
    }

    /**
     * This function updates the mixer animation actions so the edited tracks are assigned to the interpolants.
     * WARNING It uses the editedAnimation tracks directly, without cloning them.
     * Modifying the values/times of editedAnimation will also modify the values of mixer
     * @param {animation} editedAnimation for body it is the timeline skeletonAnimation. For face it is the timeline auAnimation with the updated blendshape values
     * @param {Number or Array of Numbers} trackIdxs a -1 will force an update to all tracks
     * @returns 
     */
    updateAnimationAction( editedAnimation, trackIdxs ) {
        // for bones editedAnimation is the timeline skeletonAnimation
        // for blendshapes editedAnimation is the timeline auAnimation
        const mixer = this.currentCharacter.mixer;
    
        if( !mixer._actions.length ) {
            return;
        }
    
        if( typeof trackIdxs == 'number' ) {
            // get all indices
            if( trackIdxs == -1 ){ 
                trackIdxs = new Int32Array( editedAnimation.tracks.length );
                trackIdxs.forEach( (v,i) => trackIdxs[i] = i );
                // trackIdxs = Object.keys( editedAnimation.tracks ); // returns strings 
            }
            else{
                trackIdxs = [trackIdxs];
            }
        }
                     
        const isFaceAnim = editedAnimation.name == "faceAnimation";
        for( let i = 0; i< mixer._actions.length; i++ ) {
            if( mixer._actions[i]._clip.name == editedAnimation.name ) { // name == ("bodyAnimation" || "faceAnimation")
                const mixerClip = mixer._actions[i]._clip;
                let mapTrackIdxs = {};

                // If the editedAnimation is an auAnimation, the tracksIdx have to be mapped to the mixerAnimation tracks indices
                if( isFaceAnim ) {
                    for( let j = 0; j < trackIdxs.length; j++ ) {
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

                        for( let b = 0; b < bsNames.length; b++ ) {
                            for( let t = 0; t < mixerClip.tracks.length; t++ ) {
                                if( mixerClip.tracks[t].name.includes("[" + bsNames[b] + "]") ) {
                                    mapTrackIdxs[trackIdx].push(t);
                                    // break; // do not break, need to check all meshes that contain this blendshape
                                }
                            }
                        }
                    }                    
                }

                for( let j = 0; j < trackIdxs.length; j++ ) {
                    const trackIdx = trackIdxs[j];
                    const mapTrackIdx = mapTrackIdxs[trackIdx] || [trackIdx];
                    const track = editedAnimation.tracks[trackIdx];

                    if( track.locked || !mapTrackIdx.length ) {
                        continue;
                    }
                    
                    for( let t = 0; t < mapTrackIdx.length; t++ ) {

                        const interpolant = mixer._actions[i]._interpolants[mapTrackIdx[t]];                                           
                       
                        // THREEJS mixer uses interpolants to drive animations. _clip is only used on animationAction creation. 
                        // _clip is the same clip (pointer) sent in mixer.clipAction. 

                        if( track.active ) {
                            interpolant.parameterPositions = mixerClip.tracks[mapTrackIdx[t]].times = track.times;
                            interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = track.values; 
                        }
                        else {
                            interpolant.parameterPositions = mixerClip.tracks[mapTrackIdx[t]].times = [0];
                            if ( isFaceAnim ) {
                                interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = [0];
                            }
                            else {
                                // TODO optimize if necessary
                                let skeleton =this.currentCharacter.skeletonHelper.skeleton;
                                let invMats = this.currentCharacter.skeletonHelper.skeleton.boneInverses;
                                let boneIdx = findIndexOfBoneByName(skeleton, track.name);
                                let parentIdx = findIndexOfBone(skeleton, skeleton.bones[boneIdx].parent);
                                let localBind = invMats[boneIdx].clone().invert();

                                if ( parentIdx > -1 ) { 
                                    localBind.premultiply(invMats[parentIdx]); 
                                }
                                let p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
                                localBind.decompose( p,q,s );
                                // assuming quats and position only. Missing Scale
                                if( track.dim == 4 ) {
                                    interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = q.toArray();//[0,0,0,1];
                                }
                                else {
                                    interpolant.sampleValues = mixerClip.tracks[mapTrackIdx[t]].values = p.toArray();//[0,0,0];
                                }
                            } 

                        }
                    }
                }
                
                this.setTime( this.activeTimeline.currentTime );
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
            this.setTimeline(this.animationModes.BODY);
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
            this.setTimeline(this.animationModes.FACE);
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

    /** ------------------------ Generate formatted data --------------------------*/

    generateBVH( bindedAnim, skeleton ) {
        let bvhPose = "";
        let bodyAction = this.currentCharacter.mixer.existingAction(bindedAnim.mixerBodyAnimation);
        
        if( !bodyAction && bindedAnim.mixerBodyAnimation ) {
            bodyAction = this.currentCharacter.mixer.clipAction(bindedAnim.mixerBodyAnimation);     
        }
        
        bvhPose = BVHExporter.export(bodyAction, skeleton, this.animationFrameRate);
        
        return bvhPose;
    }

    generateBVHE( bindedAnim, skeleton ) {
        const bvhPose = this.generateBVH( bindedAnim, skeleton );
        let bvhFace = "";
        let faceAction = this.currentCharacter.mixer.existingAction(bindedAnim.mixerFaceAnimation);

        if( faceAction ) {
            bvhFace += BVHExporter.exportMorphTargets(faceAction, this.currentCharacter.morphTargets, this.animationFrameRate);            
        }
        return bvhPose + bvhFace;
    }
}

class ScriptEditor extends Editor { 
    constructor( animics ) {
        super(animics);

        this.dominantHand = "Right";
        
        this.onDrawTimeline = null;
	    this.onDrawSettings = null;

        // Create GUI
        this.gui = new ScriptGui(this);
    }

    async initCharacters()
    {
        // Load current character
        this.loadCharacter(this.character);

        while(!this.loadedCharacters[this.character] || !this.loadedCharacters[this.character].bmlManager.ECAcontroller) {
            await new Promise(r => setTimeout(r, 1000));            
        }  
    }

    async processPendingResources( resources ) {
        if( !resources ) {
            this.loadAnimation("New animation", {});
            return true;
        }
        
        // TO DO
        const loaded = await this.loadFiles(resources);
        if( !loaded ) {
            await this.processPendingResources();
        }
    }

    async loadFiles( files ) {
        const formats = ['json', 'bml', 'sigml'];
        const resultFiles = [];
        const promises = [];
        
        for(let i = 0; i < files.length; ++i){
            const extension = UTILS.getExtension(files[i].name).toLowerCase();
            UTILS.makeLoading("Loading animation: " + files[i].name );
            
            if( formats.includes(extension) ) {
                const promise = new Promise( (resolve) => {
                    this.fileToAnimation( files[i], (file) => {

                        let empty = true;
                        if( this.activeTimeline.animationClip.tracks.length ) {
                            for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; i++ ) {
                                if( this.activeTimeline.animationClip.tracks[i].clips.length ){
                                    empty = false;
                                    break;
                                }
                            }   
                        }
                        const animation = file.animation;

                        if( empty ) {
                            this.activeTimeline.currentTime = 0;
                            this.clipName = animation.name;
                            this.gui.loadBMLClip( animation );
                            this.loadAnimation( file.name, animation );

                            resolve(file.animation);
                            UTILS.hideLoading();
                        }
                        else {
                            UTILS.hideLoading()
                            this.gui.prompt = new LX.Dialog("Import animation" , ( panel ) => {
                                panel.addText("", "There is already an animation. What do you want to do?", null, {disabled: true});
                                panel.sameLine(3);
                                panel.addButton(null, "Replace", () => { 
                                    this.clearAllTracks(false);
                                    this.clipName = animation.name;
                                    this.activeTimeline.currentTime = 0;
                                    this.gui.loadBMLClip( animation );
                                    this.loadAnimation( file.name, animation );
                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();
                                }, { buttonClass: "accept" });

                                panel.addButton(null, "Concatenate", () => { 
                                    this.gui.loadBMLClip( animation );
                                    this.loadAnimation( file.name, animation );

                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();
                                }, { buttonClass: "accept" });
                                panel.addButton(null, "Cancel", () => { 
                                    this.gui.prompt.close();
                                    UTILS.hideLoading();
                                    resolve();
                                });
                            })
                        }
                    } );
                })
                promises.push( promise );
            }
            else {
                alert(extension + ": Format not supported.\n\nFormats accepted:\n\t'bml', 'sigml', 'json'\n\t");
            }
        }
        if( !promises.length ) {
            
            LX.popup("The file is empty or has an incorrect format.", "Ops! Animation Load Issue!", {timeout: 9000, position: [ "10px", "50px"] });           
            UTILS.hideLoading();
        }

        return Promise.all( promises );
    }

    loadAnimation(name, animationData) { 

        let saveName = "";

        if ( name ) {
            let extensionIdx = name.lastIndexOf(".");
            if ( extensionIdx == -1 ){ // no extension
                extensionIdx = name.length; 
            }
            saveName = name.slice(0,extensionIdx);
        }

        this.loadedAnimations[name] = {
            name: name,
            saveName: saveName,
            export: true,
            inputAnimation: animationData, // bml file imported. This needs to be converted by the timeline's setAnimationClip.
            scriptAnimation: null, // if null, bind will take care. 
            type: "script"
        };

        this.bindAnimationToCharacter( name );
    }

    /**
     * ScriptEditor: fetches a loaded animation and applies it to the character. The first time an animation is binded, it is processed and saved. Afterwards, this functino just changes between existing animations 
     * @param {String} animationName 
    */    
    bindAnimationToCharacter( animationName ) {
        
        const animation = this.loadedAnimations[animationName];
        if( !animation ) {
            console.warn(animationName + " not found");
            return false;
        }

        if ( animationName != this.currentAnimation ) {
            this.gui.clipsTimeline.currentTime = 0;
            this.gui.clipsTimeline.unSelectAllClips();
            this.gui.clipsTimeline.unHoverAll();
        }

        this.currentAnimation = animationName;

        // create timeline animation for the first time
        if ( !animation.scriptAnimation ){
            this.gui.clipsTimeline.setAnimationClip(null, true); //generate empty animation 
            animation.scriptAnimation = this.gui.clipsTimeline.animationClip;
            this.gui.loadBMLClip(animation.inputAnimation); // process bml and add clips
            delete animation.inputAnimation;
        }
        
        animation.scriptAnimation.name = animationName;
        
        if( !this.bindedAnimations[animationName] ) {
            this.bindedAnimations[animationName] = {};
        }
        this.bindedAnimations[animationName][this.currentCharacter.name] = { mixerAnimation: null };
    
        this.updateAnimationAction( animation.scriptAnimation );
        this.setTimeline();
        this.gui.updateAnimationPanel();
        return true;
    }

    /**
     * set timeline to active timeline (show timeline) 
     * @returns 
     */
    setTimeline() {

        const currentTime = this.activeTimeline ? this.activeTimeline.currentTime : 0;
        this.activeTimeline = this.gui.clipsTimeline;
        this.activeTimeline.currentTime = currentTime;
        this.setTime(currentTime, true);
        this.activeTimeline.updateHeader();
    }

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

        const animationData = this.getCurrentAnimation();
        animationData.scriptAnimation = this.activeTimeline.animationClip;
       
        this.updateAnimationAction(animationData.scriptAnimation);
    }

    clearAllTracks( showConfirmation = true ) {
        if( !this.activeTimeline.animationClip ) {
            return;
        }
        
        const clearTracks = () => {
            for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

                const track = this.activeTimeline.animationClip.tracks[i];
                const idx = track.idx;
                
                this.activeTimeline.clearTrack(idx);
            
                if( this.activeTimeline.onPreProcessTrack ) {
                    this.activeTimeline.onPreProcessTrack( track, track.idx );
                }
            }
            this.updateTracks();
            this.gui.updateClipPanel();
        }
        
        if( showConfirmation ) {
            this.gui.showClearTracksConfirmation(clearTracks);
        }
        else {
            clearTracks();
        }
    }

    generateBML() {
        const animation = this.getCurrentAnimation();
        const data = animation.scriptAnimation;

        const json =  {
            behaviours: [],
            //indices: [],
            name : animation ? animation.saveName : "BML animation",
            duration: data ? data.duration : 0,
        }

        let empty = true;
        if( data ) {
            for( let i = 0; i < data.tracks.length; i++ ) {
                if( data.tracks[i].clips.length ){
                    empty = false;
                    break;
                }
            }   
        }
        if( empty ) {
            alert("You can't export an animation with empty tracks.")
            return null;
        }
       
        for( let i = 0; i < data.tracks.length; i++ ) {
            for(let j = 0; j < data.tracks[i].clips.length; j++) {
                let clips = data.tracks[i].clips[j];
                if( clips.toJSON ) {
                    clips = clips.toJSON();
                }
                if( clips ) {
                    if( clips.type == "glossa") {
                        const actions = { faceLexeme: [], gaze: [], head: [], gesture: [], speech: []};
                       
                        for( let action in actions ) {
                            if( clips[action] ) {
                                json.behaviours = json.behaviours.concat( clips[action]);
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
    
    generateBVH( bindedAnim, skeleton ) {
        const action = this.currentCharacter.mixer.clipAction(bindedAnim.mixerAnimation);
        if(!action) {
            return "";
        }
        return BVHExporter.export(action, skeleton, this.animationFrameRate); 
    }

    generateBVHE( bindedAnim, skeleton) {
        const bvhPose = this.generateBVH( bindedAnim, skeleton );
        const action = this.currentCharacter.mixer.clipAction(bindedAnim.mixerAnimation);
        
        let bvhFace = "";
        if( action ) {
            bvhFace += BVHExporter.exportMorphTargets(action, this.currentCharacter.morphTargets, this.animationFrameRate);            
        }
        return bvhPose + bvhFace;
    }

}

export { KeyframeEditor, ScriptEditor }