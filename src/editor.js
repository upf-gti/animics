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
        
        this.editionModes = {CAPTURE: 0, VIDEO: 1, SCRIPT: 2};
        // this.mode = this.editionModes[mode];

        this.delayedResizeID = null;
        this.delayedResizeTime = 500; //ms

        this.currentTime = 0;

        this.ANIMICS = animics;

        this.editorArea = new LX.Area({id: "editor-area", width: "100%", height: "100%"});

        // TO DO: ATTACH AREA TO MAINAREA
        animics.mainArea.attach(this.editorArea);
    }

    //Create canvas scene
    async init() {

        this.createScene();
        await this.initCharacters();

        this.bindEvents();
        
        window.onbeforeunload =  (e) => {
            if(!this.currentAnimation || !this.loadedAnimations[this.currentAnimation]) {
                return;
            }
            e.preventDefault();
            e.returnValue = ""
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

    async initCharacters()
    {
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
                fetch( Editor.RESOURCES_PATH + characterName + "/" + characterName + ".json" ).then(response => response.text()).then( (text) => {
                    let config = JSON.parse( text );
                    this.loadedCharacters[characterName].bmlManager = new BMLController( this.loadedCharacters[characterName] , config);
                })
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
        $('#loading').fadeOut();
    }

    setPlaybackRate(v){    
        v = Math.max( 0.0001, v );
        this.currentCharacter.mixer.timeScale = v;
    }

    bindEvents() {

        this.editorArea.root.ondrop = (e) => {
			e.preventDefault();
			e.stopPropagation();
	
			const files = e.dataTransfer.files;
            if(!files.length) {
                return;
            }
			this.loadFiles(files);
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

                        // TO DO: Implement it for Keyframe and Script editors
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
                        // TO DO: Implement it for Keyframe and Script editors
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
                        // if(this.mode == this.editionModes.SCRIPT) {
                        //     if(e.altKey) {
                        //         if(this.gui.createNewPresetDialog)
                        //             this.gui.createNewPresetDialog();
                        //     }
                        //     else {
                        //         if(this.gui.createNewSignDialog)
                        //             this.gui.createNewSignDialog();
                        //     }
                        // }
                        // else {
                        //     if(this.gui.createSaveDialog) {
                        //         this.gui.createSaveDialog();
                        //     }
                        // }
                        
                        // TO DO: Implement it for Keyframe and Script editors
                        // Save to server // TO DO: CREATE FUNCTION FOR KEYFRAMEMODE
                        this.save();
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
                        if(this.activeTimeline.selectAll)
                            this.activeTimeline.selectAll();
                    }
                    break;
                // TO DO: Move to onKeyDown of Keyframe Editor
                case 'w': case 'W': // Show/hide propagation window
                    if ( (!document.activeElement || document.activeElement.value === undefined) && this.gui.propagationWindow ){
                        this.gui.propagationWindow.toggleEnabler();
                        if( this.gui.propagationWindow.enabler ){
                            this.gui.keyFramesTimeline.unSelectAllKeyFrames();
                            this.gui.curvesTimeline.unSelectAllKeyFrames();
                        }
                    }
                    break;

                case 'i': case 'I': // Import file from disk
                    if(e.ctrlKey && !e.shiftKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        // TO DO:
                        this.importFiles();
                        // this.gui.importFile();
                    }
                    break;

                case 'o': case 'O': // Open file from server
                if(e.ctrlKey && !e.shiftKey) {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    //TO DO:
                    this.openFiles();
                    // if(this.mode == this.editionModes.SCRIPT) {
                    //     this.gui.createClipsDialog();
                    // }
                    // else {
                    //     this.gui.createServerClipsDialog();
                    // }
                }
                break;
            }

            this.onKeyDown(e);
        } );
    }
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
        if(this.video) {
            this.video.startTime = 0;
        }

        this.animationModes = {FACE: 0, BODY: 1};
        this.animationMode = this.animationModes.BODY;

        this.refreshRepository = false;
        this.localStorage = {clips: {id: "Local", type:"folder", children: []}};
    }
    
    setPlaybackRate(v){
        v = Math.min( 16, Math.max( 0.1, v ) );
        if(this.video) {
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

}

class ScriptEditor extends Editor { 
    constructor( animics ) {
        super(animics);

    }
}

export { KeyframeEditor, ScriptEditor }