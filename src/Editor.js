import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from './exporters/GLTFExporter.js' 
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { BVHExporter } from "./exporters/BVHExporter.js";
import { createAnimationFromRotations, createEmptySkeletonAnimation } from "./skeleton.js";
import { KeyframesGui, ScriptGui } from "./Gui.js";
import { Gizmo } from "./Gizmo.js";
import { UTILS } from "./Utils.js"
import { NN } from "./ML.js"
import { OrientationHelper } from "./libs/OrientationHelper.js";
import { AnimationRetargeting, findIndexOfBone, findIndexOfBoneByName, applyTPose } from './retargeting.js'
import { BMLController } from "./controller.js"
import { BlendshapesManager } from "./blendshapes.js"
import { sigmlStringToBML } from './libs/bml/SigmlToBML.js';
import mlSavitzkyGolay from 'https://cdn.skypack.dev/ml-savitzky-golay';

import { LX } from "lexgui"

// const MapNames = await import('../data/mapnames.json', {assert: { type: 'json' }});
const MapNames = await (await fetch('./data/mapnames.json')).json();
let json = null
try {
    const response = await fetch('https://resources.gti.upf.edu/3Dcharacters/ReadyVictor/ReadyVictor.json');
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    json = await response.json();
    console.log(json);
  } catch (error) {
    console.error(error.message);
  }
// Correct negative blenshapes shader of ThreeJS
// THREE.ShaderChunk[ 'morphnormal_vertex' ] = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n	    objectNormal += getMorph( gl_VertexID, i, 1, 2 ) * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
// THREE.ShaderChunk[ 'morphtarget_pars_vertex' ] = "#ifdef USE_MORPHTARGETS\n	uniform float morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		uniform sampler2DArray morphTargetsTexture;\n		uniform vec2 morphTargetsTextureSize;\n		vec3 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset, const in int stride ) {\n			float texelIndex = float( vertexIndex * stride + offset );\n			float y = floor( texelIndex / morphTargetsTextureSize.x );\n			float x = texelIndex - y * morphTargetsTextureSize.x;\n			vec3 morphUV = vec3( ( x + 0.5 ) / morphTargetsTextureSize.x, y / morphTargetsTextureSize.y, morphTargetIndex );\n			return texture( morphTargetsTexture, morphUV ).xyz;\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
// THREE.ShaderChunk[ 'morphtarget_vertex' ] = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			#ifndef USE_MORPHNORMALS\n				transformed += getMorph( gl_VertexID, i, 0, 1 ) * morphTargetInfluences[ i ];\n			#else\n				transformed += getMorph( gl_VertexID, i, 0, 2 ) * morphTargetInfluences[ i ];\n			#endif\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif"; 


class Editor {
    static RESOURCES_PATH = "https://resources.gti.upf.edu/3Dcharacters/";
    static PERFORMS_PATH = "https://performs.gti.upf.edu";
    static ATELIER_PATH = "https://atelier.gti.upf.edu";
    
    constructor( animics ) {
        
        this.character = "";

        this.currentCharacter = null;
        this.loadedCharacters = {};
                
        this.currentTime = 0; // global time 
        this.startTimeOffset = 0; // global start time of sub animations, useful for keyframe mode. Script ignores it

        this.loadedAnimations = {}; // loaded animations from mediapipe&NN or BVH
        this.boundAnimations = {}; // global animations for each character, containing its mixer animations
        this.currentAnimation = ""; // current bound animation
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
        this.playbackRate = 1;

        this.delayedResizeID = null;
        this.delayedResizeTime = 500; //ms

        this.ANIMICS = animics;
        this.remoteFileSystem = animics.remoteFileSystem;

        this.enabled = true;
        
        // Only used in KeyframeEditor. But it might be useful in ScriptEditor for having a video reference in the future
        this.video = document.createElement( "video" );
        this.video.startTime = 0;
        this.video.sync = false; // If TRUE, synchronize video with animation. BVH/e always FALSE
        this.video.muted = true;


        this.editorArea = new LX.Area({id: "editor-area", width: "100%", height: "100%"});
        animics.mainArea.attach(this.editorArea);

        this.theme = {
            dark: { background: 0x272727, grid: 0x272727, gridOpacity: 0.2 }, 
            light: { background: 0xa0a0a0, grid: 0xffffff, gridOpacity: 0.8 }
        }

        this._realizer = {
            window: null,
            status: false, // if there is a window, whether it is ready to receive data properly
            pendingData: [],
        }
        
        this.characterOptions = {
            "Eva": [Editor.RESOURCES_PATH+'Eva_Low/Eva_Low.glb', Editor.RESOURCES_PATH+'Eva_Low/Eva_Low.json', 0, Editor.RESOURCES_PATH+'Eva_Low/Eva_Low.png'],
            "Witch": [Editor.RESOURCES_PATH+'Eva_Witch/Eva_Witch.glb', Editor.RESOURCES_PATH+'Eva_Witch/Eva_Witch.json', 0, Editor.RESOURCES_PATH+'Eva_Witch/Eva_Witch.png'],
            "Kevin": [Editor.RESOURCES_PATH+'Kevin/Kevin.glb', Editor.RESOURCES_PATH+'Kevin/Kevin.json', 0, Editor.RESOURCES_PATH+'Kevin/Kevin.png'],
            "Ada": [Editor.RESOURCES_PATH+'Ada/Ada.glb', Editor.RESOURCES_PATH+'Ada/Ada.json',0, Editor.RESOURCES_PATH+'Ada/Ada.png'],
            "Victor": [Editor.RESOURCES_PATH+'ReadyVictor/ReadyVictor.glb', Editor.RESOURCES_PATH+'ReadyVictor/ReadyVictor.json',0, Editor.RESOURCES_PATH+'ReadyVictor/ReadyVictor.png'],
            "Ready Eva": ['https://models.readyplayer.me/66e30a18eca8fb70dcadde68.glb', Editor.RESOURCES_PATH+'ReadyEva/ReadyEva_v3.json',0, 'https://models.readyplayer.me/66e30a18eca8fb70dcadde68.png?background=68,68,68'],
        }

        this.mapNames = {characterMap: json.faceController.blendshapeMap, mediapipeMap: MapNames.mediapipe, parts:  MapNames.parts};
    }

    enable() {
        this.enabled = true;
        this.editorArea.root.classList.remove("hidden");
        this.resize();
        this.activeTimeline.show();
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
        
        const modelToLoad = [Editor.RESOURCES_PATH + 'Eva_Low/Eva_Low.glb', Editor.RESOURCES_PATH + 'Eva_Low/Eva_Low.json', (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), 0 ), "Eva" ];
        await this.initCharacters(modelToLoad);

        if( settings.pendingResources ) {
            UTILS.makeLoading("Loading files...");
        }
        else {
            UTILS.makeLoading("Preparing scene...");
        }

        this.gui.init(showGuide);


        this.enable();
        this.bindEvents();

        this.animate();
        
        window.onbeforeunload =  (e) => {
            e.preventDefault();
            e.returnValue = "";
            window.stop();
            return "Be sure you have exported the animation. If you exit now, your data will be lost."
        }

        await this.processPendingResources(settings);

        if( !settings.capture ){
            UTILS.hideLoading();
        }
    }    

    createScene() {

        const canvasArea = this.gui.canvasArea;
        const [CANVAS_WIDTH, CANVAS_HEIGHT] = canvasArea.size;

        const theme = "dark";
        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(this.theme[theme].background);
        // scene.fog = new THREE.Fog( 0xa0a0a0, 10, 50 );

        // const grid = new THREE.GridHelper(300, 300, 0x101010, 0x555555 );
        const grid = new THREE.GridHelper( 10, 10 );
        grid.name = "Grid";
        grid.material.color.set( this.theme[theme].grid);
        grid.material.opacity = this.theme[theme].gridOpacity;
        scene.add(grid);

        const groundGeo = new THREE.PlaneGeometry(10, 10);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.2 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;
        this.ground = ground;
        scene.add( ground );
        
        // Lights
        const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x8d8d8d, 1 );
        hemiLight.position.set( 0, 20, 0 );
        scene.add( hemiLight );
       
        // Left spotlight
        const spotLight = new THREE.SpotLight( 0xffffff, 9 );
        spotLight.position.set(-2,2,2);
        spotLight.penumbra = 1;
        spotLight.castShadow = false;
        scene.add( spotLight );
        
        // Right spotlight
        const spotLight2 = new THREE.SpotLight( 0xffffff, 9 );
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
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.LinearToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;

        canvasArea.root.appendChild(renderer.domElement);
        canvasArea.onresize = (bounding) => this.delayedResize(bounding.width, bounding.height);
        renderer.domElement.id = "webgl-canvas";
        renderer.domElement.setAttribute("tabIndex", 1);

        // Camera
        const camera = new THREE.PerspectiveCamera(60, pixelRatio, 0.01, 1000);
        camera.position.set(0, 1.303585797450244, 1.4343282767035261);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.minDistance = 0.5;
        controls.maxDistance = 5;
        controls.target.set(0, 1.0667066120801934, -0.017019104933513607);
        controls.update();  

        // Orientation helper
        const orientationHelper = new OrientationHelper( camera, controls, { className: 'orientation-helper-dom' }, {
            px: '+X', nx: '-X', pz: '+Z', nz: '-Z', py: '+Y', ny: '-Y'
        });

        canvasArea.root.appendChild(orientationHelper.domElement);
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

    async initCharacters(modelToLoad) {
      
        // Load current character
        await this.loadCharacter(modelToLoad[0], modelToLoad[1], modelToLoad[2], modelToLoad[3]);
        
        // while(!this.loadedCharacters[this.character] ) {
        //     await new Promise(r => setTimeout(r, 1000));            
        // }        

    }

    async loadCharacter(modelFilePath, configFile, modelRotation, characterName, callback = null, onerror = null) {

        if(modelFilePath.includes("models.readyplayer.me")) {
            modelFilePath+= "?morphTargets=ARKit"
        }

        this.character = characterName;

        UTILS.makeLoading("Loading GLTF [" + this.character +"]...")
        //Editor.RESOURCES_PATH + characterName + "/" + characterName + ".glb"
        // Load the target model (Eva)
        return new Promise( resolve => {
            this.loaderGLB.load(modelFilePath, async (gltf) => {
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
                        if (o.name == "Body") {
                            o.name == "BodyMesh";
                        }
                        if(o.morphTargetDictionary)
                        {
                            morphTargets[o.name] = o.morphTargetDictionary;
                            skinnedMeshes[o.name] = o;
                        }
                        if(o.name == "Classic_short") {
                            if( o.children.length > 1 ){ 
                                o.children[1].renderOrder = 1; 
                            }
                        }
                        if(o.name.includes("Eyelashes")) {
                            o.castShadow = false;
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
               
                if (configFile) {
                    // Read the file if it's a URL
                    if(typeof(configFile) == 'string') {                    
                        const response = await fetch( configFile );
                        
                        if(response.ok) {
                            const text = await response.text()                       
                            
                            let config = JSON.parse( text );
                            const rawConfig = JSON.parse( text );
                            config._filename = configFile;
                            this.loadedCharacters[characterName].config = config;
                            this.loadedCharacters[characterName].rawConfig = rawConfig;
                        }
                    }
                    else {
                        // Set the config file data if it's an object
                        const config = configFile;
                        this.loadedCharacters[characterName].config = config;
                        this.loadedCharacters[characterName].rawConfig = JSON.parse(JSON.stringify(config));

                        this.mapNames.characterMap = config.faceController.blendshapeMap;
                    }
                }

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
                    
                    this.loadedCharacters[characterName].bmlManager = new BMLController( this.loadedCharacters[characterName], this.loadedCharacters[characterName].config);
                    
                    // fetch( Editor.RESOURCES_PATH + characterName + "/" + characterName + ".json" ).then(response => response.text()).then( (text) => {
                    //     const config = JSON.parse( text );
                    //     this.loadedCharacters[characterName].bmlManager = new BMLController( this.loadedCharacters[characterName] , config);
                    //     this.changeCharacter(characterName);
                    //     resolve();
                    // })
                }
                else {
                    this.loadedCharacters[characterName].blendshapesManager = new BlendshapesManager(skinnedMeshes, morphTargets, {parts: this.mapNames.parts, mediapipeMap: this.mapNames.mediapipeMap, characterMap: (this.loadedCharacters[characterName].config ? this.loadedCharacters[characterName].config.faceController.blendshapeMap : this.mapNames.characterMap)});
                
                }
                
                await this.changeCharacter(characterName);
                
                resolve();
                if (callback) {
                    callback();
                }
                
            });
        })
    }

    updateCharacter(config) {
        this.currentCharacter.skeletonHelper.skeleton.pose();
        if( this.isScriptMode() ) {
            this.currentCharacter.bmlManager = new BMLController( this.currentCharacter, config);
            this.currentCharacter.bmlManager.ECAcontroller.start();
            this.currentCharacter.bmlManager.ECAcontroller.reset();
        }               
    }

    async changeCharacter(characterName) {
        // Check if the character is already loaded
        if( !this.loadedCharacters[characterName] ) {
            console.warn(characterName + " not loaded");
            const modelToLoad = this.characterOptions[characterName];
            await this.loadCharacter(modelToLoad[0], modelToLoad[1], modelToLoad[2], characterName);
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
        this.setPlaybackRate(this.playbackRate);

        // Gizmo stuff
        if(this.gizmo) {
            this.gizmo.begin(this.currentCharacter.skeletonHelper);            
        }
        this.gui.createCharactersPanel();
        // this.gui.setKeyframeClip(null);
        // this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
        
        for(let anim in this.boundAnimations) {
            if(this.boundAnimations[anim] && !this.boundAnimations[anim][characterName]) {
                const characters = Object.keys(this.boundAnimations[anim]);
                const animation = this.boundAnimations[anim][characters[0]];
                this.setGlobalAnimation(anim);
            }
            this.updateMixerAnimation( this.loadedAnimations[this.getCurrentAnimation().name].scriptAnimation );
        }
        
        this.gui.createSidePanel();
        UTILS.hideLoading();
    }

    retargetAnimation(source, bodyAnimation) {
      
        const currentCharacter = this.currentCharacter;
        this.currentCharacter.skeletonHelper.skeleton.pose();
        const skeleton = applyTPose(this.currentCharacter.skeletonHelper.skeleton).skeleton;
        if(skeleton)
        {
            currentCharacter.skeletonHelper.skeleton = skeleton;
        }
        else {
            console.warn("T-pose can't be applyied to the TARGET. Automap falied.")
        }

        let sourceCharacter = source.skeleton;
       
        
        if( bodyAnimation ) {
        
            let tracks = [];
            const otherTracks = []; // blendshapes
            // Remove position changes (only keep i == 0, hips)
            for (let i = 0; i < bodyAnimation.tracks.length; i++) {

                if(bodyAnimation.tracks[i].constructor.name == THREE.NumberKeyframeTrack.name ) {
                    otherTracks.push(bodyAnimation.tracks[i]);
                    continue;
                }
                if(i && bodyAnimation.tracks[i].name.includes('position')) {
                    continue;
                }
                tracks.push(bodyAnimation.tracks[i]);
                tracks[tracks.length - 1].name = tracks[tracks.length - 1].name.replace(".bones", "");//tracks[tracks.length - 1].name.replace( /[\[\]`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "").replace(".bones", "");
            }

            //tracks.forEach( b => { b.name = b.name.replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "") } );
            bodyAnimation.tracks = tracks;            
            
            
            sourceCharacter.pose();
            const skeleton = applyTPose(sourceCharacter).skeleton;
            if(skeleton)
            {
                sourceCharacter = skeleton;
            }
            else {
                console.warn("T-pose can't be applyied to the SOURCE. Automap falied.")
            }            
            
            const retargeting = new AnimationRetargeting(sourceCharacter, currentCharacter.model, { srcEmbedWorldTransforms: true, trgEmbedWorldTransforms: true, srcPoseMode: AnimationRetargeting.BindPoseModes.CURRENT, trgPoseMode: AnimationRetargeting.BindPoseModes.CURRENT } ); // TO DO: change trgUseCurrentPose param
            return retargeting.retargetAnimation(bodyAnimation);
        }
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
                    else if( Array.isArray(data.animation.data) ) {
                        data.animation.behaviours = data.animation.data;
                    }
                }
                else if( extension.includes( "bml" ) || extension.includes("json") ) {
                    data.animation = JSON.parse( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                    else if( Array.isArray(data.animation.data) ) {
                        data.animation.behaviours = data.animation.data;
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

            const innerParse = async (event) => {
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
                else if(type.includes('glb')) {
                    data.animation = await new Promise( (resolve, reject) => {
                        this.loaderGLB.load( content, (glb) => {
                            const model = glb.scene;
                            let skeleton = null;

                            model.traverse( object => {
                                if ( object.skeleton ) { 
                                    skeleton = object.skeleton;
                                    return;
                                }
                            })

                            const animations = [];
                            for( let i = 0; i < glb.animations.length; i++ ) {
                                const animation = glb.animations[i];
                                const bodyTracks = [];
                                const faceTracks = [];

                                for( let t = 0; t < animation.tracks.length; t++ ) {
                                    const track = animation.tracks[t];
                                    if( track.constructor != THREE.NumberKeyframeTrack ) {
                                        // Tracks that don't affect morph targets can be left as-is.
                                        bodyTracks.push(track);
                                        continue;
                                    }
                                    const times = track.times;
                                    
                                    const sourceTrackBinding = THREE.PropertyBinding.parseTrackName( track.name );
                                    if( !sourceTrackBinding.propertyIndex ) {
                                        // this track affects all morph targets together (are merged)

                                        const sourceTrackNode = THREE.PropertyBinding.findNode( model, sourceTrackBinding.nodeName );
                                        const targetCount = sourceTrackNode.morphTargetInfluences.length;

                                        for( let morphTarget in sourceTrackNode.morphTargetDictionary ) {
                                            
                                            const morphTargetIdx = sourceTrackNode.morphTargetDictionary[morphTarget];
                                            const values = new track.ValueBufferType( track.times.length );
                                            for ( let j = 0; j < times.length; j ++ ) {

                                                values[j] = track.values[j * targetCount + morphTargetIdx];
                                            }
                                            faceTracks.push( new THREE.NumberKeyframeTrack(track.name + "[" + morphTarget + "]", times, values, track.getInterpolation()))
                                        }
                                    }
                                    else {
                                        faceTracks.push(track);
                                    }
                                }
                                const skeletonAnim = new THREE.AnimationClip("bodyAnimation", animation.duration, bodyTracks, animation.blendMode);
                                const blendshapesAnim = new THREE.AnimationClip("faceAnimation", animation.duration, faceTracks, animation.blendMode);
                                animations.push( { name: animation.name, skeletonAnim: { clip: skeletonAnim, skeleton} , blendshapesAnim: { clip: blendshapesAnim } })
                            }
                            resolve(animations)
                        })})
                }
                else if( type.includes('sigml') ) {
                    data.animation = sigmlStringToBML( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                    else if( Array.isArray(data.animation.data) ) {
                        data.animation.behaviours = data.animation.data;
                    }
                }
                else if( type.includes( "bml" ) || type.includes("json") ) {
                    data.animation = JSON.parse( content );
                    if( Array.isArray(data.animation) ) {
                        data.animation = { behaviours: data.animation };
                    }
                    else if( Array.isArray(data.animation.data) ) {
                        data.animation.behaviours = data.animation.data;
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
            const type = content.type || UTILS.getExtension(content.name).toLowerCase();
            if(content instanceof Blob || content instanceof File) {
                const reader = new FileReader();
                if(content instanceof Blob && type.includes("glb") ) {
                    reader.readAsDataURL(content);
                }
                else {
                    reader.readAsText(content);                
                }
                reader.onloadend = innerParse;
            }
            else {
                innerParse(content, data)
            }
        }
    }

    setPlaybackRate(v){    
        v = Math.max( 0.0001, v );
        this.playbackRate = v;
        this.currentCharacter.mixer.timeScale = v;

        LX.emit("@on_set_speed", v ); // skipcallbacks, only visual update
    }

    bindEvents() {

        // Cancel default browser listener
        document.addEventListener( "keydown", (e) => {
            if( e.ctrlKey && ( e.key == "o" || e.key == "O" ) ) {
                e.preventDefault();
            }
            if( e.ctrlKey && ( e.key == "s" || e.key == "S" ) ) {
                e.preventDefault();
            }
        });

        this.editorArea.root.ondrop = async (e) => {
			e.preventDefault();
			e.stopPropagation();
	
			const files = e.dataTransfer.files;
            if( !files.length ) {
                return;
            }
			await this.loadFiles(files);
            this.gui.highlightSelector();

        };

        this.editorArea.root.addEventListener( 'keydown', (e) => {
            switch ( e.key ) {
                case " ": // Spacebar - Play/Stop animation 
                    if( !e.ctrlKey ){
                        if(e.target.constructor.name != 'HTMLInputElement') {
                            e.preventDefault();
                            e.stopImmediatePropagation();
    
                            this.gui.menubar.getButton("Play").swap(); // click()
                        }
                    }
                break;

                case "Escape": // Close open dialogs/prompts
                    this.gui.closeDialogs();                    
                break;

                case 'z': case 'Z': // Undo
                    if( e.ctrlKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        this.undo();
                    }
                    break;

                case 'y': case 'Y': // Redo
                    if( e.ctrlKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        this.redo();
                    }
                    break;
                
                case 's': case 'S': // Save animation/s to server
                    if( e.ctrlKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        
                        this.gui.createSaveDialog();
                    }
                    break;
                
                case 'a': case 'A': // Select 
                    if( e.ctrlKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        if( this.activeTimeline.selectAll ) {
                            this.activeTimeline.selectAll();
                        }
                    }
                    break;

                case 'o': case 'O': // Import file from disk
                    if( e.ctrlKey && !e.shiftKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        this.gui.importFiles();
                    }
                    break;

                case 'i': case 'i': // Open file from server
                    if( e.ctrlKey && !e.shiftKey ) {
                        e.preventDefault();
                        e.stopImmediatePropagation();

                        this.gui.createServerClipsDialog();
                    }
                break;
            }

            this.onKeyDown(e);
        } );
    }

    /** -------------------- UPDATES, RENDER AND EVENTS -------------------- */

    animate() {

        requestAnimationFrame(this.animate.bind(this));
        
        if (this.enabled){
            const dt = this.clock.getDelta();
            this.render();
            this.update(dt);
        }

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

        if ( (this.currentTime + (this.state * dt * this.playbackRate) ) >= (this.startTimeOffset + this.activeTimeline.duration) ) {
            this.onAnimationEnded();
        }

        if ( this.currentCharacter.mixer && this.state ) {
            this.currentCharacter.mixer.update( dt );
            this.currentTime = this.currentCharacter.mixer.time;
            this.activeTimeline.setTime( this.currentTime - this.startTimeOffset, true );
        }
    }

    onAnimationEnded() {

        if( this.animLoop ) {
            // user increased the duration of the animation. But the video is "trimmed" so it was paused at the endTime until the loop were reached
            if ( this.video.sync && this.video.paused ) { 
                this.video.play();
            }
            this.setTime(this.startTimeOffset, true);
        } 
        else {
            this.stop();
			this.gui.menubar.getButton("Play").setState(false, true);
            this.activeTimeline.setState(false, true);
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
        
        this.setTime( this.startTimeOffset );
        this.activeTimeline.setTime( 0 );

        this.onStop();
    }

    pause() {
        this.state = !this.state;
        if( this.state ) {
            this.onPlay();
        }
        else {
            this.onPause();
        }
    }

    // global time
    setTime( t, force ) {

        // Don't change time if playing
        if( this.state && !force ) {
            return;
        }

        const duration = this.activeTimeline.animationClip.duration;
        t = Math.clamp( t, this.startTimeOffset, this.startTimeOffset + duration - 0.001 );

        // mixer computes time * timeScale. We actually want to set the raw animation (track) time, without any timeScale 
        this.currentCharacter.mixer.setTime( t / this.currentCharacter.mixer.timeScale ); //already calls mixer.update
        this.currentCharacter.mixer.update(0); // BUG: for some reason this is needed. Otherwise, after sme timeline edition + optimization, weird things happen
        this.currentTime = t;
    }

    setAnimationLoop( loop ) {
        this.animLoop = loop;
        // animation loop is handled by update(). AnimationActions are on LoopRepeat Infinity by default
    }

    getCurrentBoundAnimation() {
        const boundAnim = this.boundAnimations[this.currentAnimation]; 
        return boundAnim ? boundAnim[this.currentCharacter.name] : null;
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
            animsToExport = [this.currentAnimation];
        }

        switch(type){
            case 'GLB':
                let options = {
                    binary: true,
                    animations: []
                };

                for(let a in animsToExport) {
                    const animationName = animsToExport[a];
                    const boundAnim = this.boundAnimations[animationName][this.currentCharacter.name];
                    
                    let tracks = []; 
                    if(boundAnim.mixerAnimation) { // script Editor
                        tracks = boundAnim.mixerAnimation.tracks;
                    }else{
                        tracks = this.generateExportAnimationData(boundAnim).tracks;
                    }

                    options.animations.push( new THREE.AnimationClip( animationName, -1, tracks ) );
                }
                let model = this.currentCharacter.mixer._root.getObjectByName('Armature');

                this.GLTFExporter.parse(model, 
                    ( gltf ) => UTILS.download(gltf, (name || "animations") + '.glb', 'arraybuffer' ), // called when the gltf has been generated
                    ( error ) => { console.log( 'An error happened:', error ); }, // called when there is an error in the generation
                    options
                );
                break;
            
            case 'BVH': case 'BVH extended': 
            {
                let skeleton = this.currentCharacter.skeletonHelper.skeleton;
                const fileType = "text/plain";

                for( let a in animsToExport ) { // can be an array of loadedAnimations, or an object with animations (loadedAnimations itself)
                    const animationName = animsToExport[a];
                    const boundAnim = this.boundAnimations[animationName][this.currentCharacter.name];
                                        
                    // Check if it already has extension
                    let clipName = animationName;

                    let bvh = "";
                    // Add the extension
                    if(type == 'BVH') {
                        bvh = this.generateBVH( boundAnim, skeleton );
                        clipName += '.bvh';
                    }
                    else if(type == 'BVH extended') {
                        bvh = this.generateBVHE( boundAnim, skeleton );
                        clipName += '.bvhe';
                    }

                    if(download) {
                        UTILS.download(bvh, clipName, fileType );
                    }
                    else {
                        files.push({name: clipName, data: UTILS.dataToFile(bvh, clipName, fileType)});
                    }
                }
                break;
            }
            default:
                for( let a in animsToExport ) { // can be an array of loadedAnimations, or an object with animations (loadedAnimations itself)
                    const animationName = animsToExport[a];

                    const json = this.generateBML(animationName);
                    if( !json ) {
                        continue;  
                    }

                    let clipName = (json.name || animationName || name ) + '.bml';
                    const fileType = "application/json";
                    if( download ) {
                        UTILS.download(JSON.stringify(json), clipName, fileType);
                    }
                    else {
                        files.push( {name: clipName, data: UTILS.dataToFile(JSON.stringify(json), clipName, fileType)} );
                    }
                }
                break;
    
        }
        // bvhexport sets avatar to bindpose. Avoid user seeing this
        this.setGlobalAnimation(this.currentAnimation);
        return files;
    }

    /**
     * 
     * @param {String} filename 
     * @param {String or Object} data file data
     * @param {String} type (folder) data type: "clips", "signs", "presets"
     * @param {String} location where the file has to be saved: it can be "server" or "local"
     * @param {*} callback 
     */
    uploadData(filename, data, type, location, callback) {
        const extension = filename.split(".")[1];

        if(location == "server") {
            if(data.constructor.name == "Object") {
                data = JSON.stringify(data, null, 4);
            }
    
            this.uploadFileToServer(filename, data, type, (v) => {
                const unit = this.remoteFileSystem.session.user.username;
                this.remoteFileSystem.repository.map( item => {
                    if(item.id == unit) {
                        for(let i = 0; i < item.children.length; i++) {
                            if( item.children[i].id == type ) {
                                item.children[i].children = v;
                                break;
                            }
                        }
                    }
                })
                
                if( callback ) {
                    callback(v);
                }
            });   
            
        }
        else {
            this.localStorage[0].children.map ( child => {
                if( child.id == type ) {
                    child.children.push({filename: filename, id: filename, folder: type, type: extension, data: data});
                }
            })            
            
            if( callback ) {
                callback(filename);
            }
        }
    }

    uploadFileToServer(filename, data, type, callback = () => {}) {
        const session = this.remoteFileSystem.session;
        const username = session.user.username;
        const folder = "animics/"+ type;

        // Check if the file already exists
        session.getFileInfo(username + "/" + folder + "/" + filename, async (file) => {

            if( file && file.size ) {
              
                LX.prompt("Do you want to overwrite the file?", "File already exists", async () => {
                        const files = await this.remoteFileSystem.uploadFile(folder, filename, new File([data], filename ), []);
                        callback(files);
                    }, 
                    {
                        input: false,
                        on_cancel: () => {
                        LX.prompt("Rename the file", "Save file", async (v) => {
                            if(v === "" || !v) {
                                alert("You have to write a name.");
                                return;
                            }
                            const files = await this.remoteFileSystem.uploadFile(folder, v, new File([data], v ), []);
                            callback(files);
                        }, {input: filename, accept: "Yes"} )
                    }
                } )                
            }
            else {
                const files = await this.remoteFileSystem.uploadFile(folder, filename, new File([data], filename ), []);
                callback(files);
            }
        },
        () => {
            //create folder
        });    
    }

    showPreview() {
                
        const openPreview = (data) => {

            if( !this._realizer.window || this._realizer.window.closed  ) {
                this._realizer.window = window.open(Editor.PERFORMS_PATH + `?autoplay=true?srcReferencePose=2&trgReferencePose=2&avatar=${this.characterOptions[this.currentCharacter.name][0]}&config=${this.characterOptions[this.currentCharacter.name][1]}`, "Preview");
                this._realizer.status = false;
                this._realizer.pendingData.push(data);
                this._realizer.openAttemptCount = 0;
                const waitTime = 500; // ms
                const maxTries = 100;
                window.onmessage = (event) =>{ 
                    if (event.origin == Editor.PERFORMS_PATH){ // URL.parse is an overkill, but better be safe, in case performs path changes later on
                        if ( typeof(event.data) == "object" && event.data.appStatus ){

                            for( let i = 0; i < this._realizer.pendingData.length; ++i){
                                this._realizer.window.postMessage(this._realizer.pendingData[i], "*");
                            }

                            this._realizer.window.focus();
                            this._realizer.pendingData.length = 0;
                            this._realizer.status = true;
                            window.onmessage = null;
                        }
                    }
                }

                // cannot check status on onmessage because app might not be responsive yet. Need a loop here
                let wait = () => {
                    if ( this._realizer.status ){ // message was already completed
                        return;
                    }
                    
                    if ( this._realizer.openAttemptCount++ > maxTries ){ // something went wrong
                        window.onmessage = null;
                        this._realizer.window = null;
                        this._realizer.status = false;
                        return;
                    }

                    this._realizer.window.postMessage({askingStatus: true}, "*");
                    setTimeout(wait, waitTime);
                }

                wait();
                return;
            }
            else if ( !this._realizer.status ){
                // there is an open attempt going on. Push the data and wait for it to complete. 
                this._realizer.pendingData.push(data); 
            }
            else { // window is open and functional
                this._realizer.window.focus();
                this._realizer.window.postMessage(data, "*");
            }
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
            this.gui.showExportAnimationsDialog("Preview animations", (info) => {
                const files = this.export(info.selectedAnimations, "BVH extended", false);
                const data = {type: "bvhe", data: files};
                openPreview(data);
            })            
        }        
    }


    isScriptMode() {
        return this.constructor == ScriptEditor;
    }
    
    openAtelier(name, model, config, fromFile = true, rotation = 0) {
            
        let rawConfig = config;
        
        const atelierData = [name, model, rawConfig, rotation];        
              
        const sendData = (data) => {

            if( !this._atelier || this._atelier.closed ) {
                this._atelier = window.open(Editor.ATELIER_PATH, "Atelier");
                setTimeout(() => sendData(data), 1000); // wait a while to have the page loaded (onloaded has CORS error)                
            }
            else {
                this._atelier.focus();                
                setTimeout(() => this._atelier.postMessage(data, "*"), 1000);
            }
        }
        sendData(JSON.stringify(atelierData));
    }

    onKeyDown( event ) {} // Abstract
    redo() {}
    undo() {}
    onPlay() {} // Abstract
    onStop() {} // Abstract
    onPause() {} // Abstract
    clearAllTracks() {} // Abstract
    updateMixerAnimation(animation, idx, replace = false) {}
    setTimeline(type) {};

    processPendingResources(resources) {} // Abstract
}


/**
 * This editor uses loadedAnimations to store loaded files and video-animations. 
 * The global animations are stored in boundAnimations, each character having its own animationClip as keyframes are meaningful only to a single character
 */
class KeyframeEditor extends Editor { 
    
    constructor( animics ) {
                
        super(animics);
        
        this.animationModes = {GLOBAL: 0, BODY: 1, FACEBS: 2, FACEAU: 3 };
        this.animationMode = this.animationModes.BODY;

        this.currentKeyFrameClip = null; // animation shown in the keyframe timelines

        this.animationInferenceModes = {NN: 0, M3D: 1}; // either use ML or mediapipe 3d approach to generate an animation (see buildanimation and bindanimation)
        this.inferenceMode = new URLSearchParams(window.location.search).get("inference") == "NN" ? this.animationInferenceModes.NN : this.animationInferenceModes.M3D;

        this.defaultTranslationSnapValue = 0.1;
        this.defaultRotationSnapValue = 30; // Degrees
        this.defaultScaleSnapValue = 1;

        this.showSkeleton = false;
        this.gizmo = null;

        this.applyRotation = false; // head and eyes rotation
        this.selectedAU = "Brow Left";
        this.selectedBone = null;
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.nn = new NN("data/ML/model.json");
            this.nnSkeleton = null;
        }

        this.retargeting = null;

        // Create GUI
        this.gui = new KeyframesGui(this);

        this.localStorage = [{ id: "Local", type:"folder", children: [ {id: "clips", type:"folder", children: []}]}];

        this._clipsUniqueIDSeed = 0;
    }

    generateClipUniqueID(){
        return this._clipsUniqueIDSeed++;
    }


    onKeyDown( event ) {
        switch( event.key ) {

            case 'w': case 'W': // Show/hide propagation window
                if ( !document.activeElement || document.activeElement.value === undefined ){
                    this.gui.propagationWindow.toggleEnabler();
                    if( this.gui.propagationWindow.enabler ){
                        this.gui.skeletonTimeline.deselectAllKeyFrames();
                        this.gui.auTimeline.deselectAllKeyFrames();
                        this.gui.bsTimeline.deselectAllKeyFrames();
                    }
                }
            break;

            case 'e': case 'E': // Export animation/s
                if( event.ctrlKey ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.gui.showExportAnimationsDialog("Export animations", ( info ) => {
                        this.export( info.selectedAnimations, info.format );
                    }, {formats: ["BVH", "BVH extended", "GLB"], selectedFormat: "BVH extended"});
                }
            break;

        }
    }
    
    undo() {  
        if ( !this.activeTimeline.historyUndo.length ){
            LX.toast(`${this.activeTimeline.timelineTitle} Undo`, `No more changes to undo. Remaining Undo steps: ${this.activeTimeline.historyUndo.length} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
            return;
        }else{
            LX.toast(`${this.activeTimeline.timelineTitle} Undo`, `Remaining Undo steps: ${this.activeTimeline.historyUndo.length-1} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }

        const lastSelection = this.gui.globalTimeline.lastClipsSelected.length == 1 ? this.gui.globalTimeline.lastClipsSelected[0] : null;

        this.activeTimeline.undo();
        if( this.activeTimeline == this.gui.globalTimeline && this.activeTimeline.historyRedo.length ){
            const mixer = this.currentCharacter.mixer;
            while(mixer._actions.length){
                mixer.uncacheClip(mixer._actions[0]._clip);
            }
            this.globalAnimMixerManagement( mixer, this.activeTimeline.animationClip, false );
            const steps = this.activeTimeline.historyRedo[ this.activeTimeline.historyRedo.length -1 ];
            for( let i = 0; i < steps.length; ++i){
                const track = this.activeTimeline.animationClip.tracks[ steps[i].trackIdx ];
                track.clips.forEach((c,i) =>{
                    this.currentKeyFrameClip = { blendMode: c.blendMode }; // start hack
                    this.updateMixerAnimation( c.mixerBodyAnimation, null, c.skeletonAnimation, false );
                    this.updateMixerAnimation( c.mixerFaceAnimation, null, c.bsAnimation, false );
                    this.currentKeyFrameClip = null; // end hack
                })
            }
        }

        // keep side panel visible with the selected clip
        if ( lastSelection ){
            const tracks = this.gui.globalTimeline.animationClip.tracks;
            if( tracks[lastSelection[0]].clips.length > lastSelection[1] && tracks[lastSelection[0]].clips[lastSelection[1]].uid == lastSelection[2].uid ){
                this.gui.globalTimeline.selectClip( lastSelection[0], lastSelection[1] ); // already calls createSidePinel in callback
            }
			else{
				const targetId = lastSelection[2].uid;
				let lost = true;
				for( let t = 0; t < tracks.length; ++t ){
					for( let c = 0; c < tracks[t].clips.length; ++c ){
						if ( tracks[t].clips[c].uid == targetId ){
							this.gui.globalTimeline.selectClip( t, c ); // already calls createSidePinel in callback
							t = tracks.length; // end loop
							lost = false;
							break;
						}
					}
				}
				if ( lost ){
					this.gui.createSidePanel(); // empty panel				
				}
			}
        }

        this.setTime(this.currentTime);
    }

    redo() {
        if ( !this.activeTimeline.historyRedo.length ){
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `No more changes to Redo. Remaining Redo steps: ${this.activeTimeline.historyRedo.length} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
            return;
        }else{
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `Remaining Redo steps: ${this.activeTimeline.historyRedo.length-1} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }

        const lastSelection = this.gui.globalTimeline.lastClipsSelected.length == 1 ? this.gui.globalTimeline.lastClipsSelected[0] : null;

        this.activeTimeline.redo();
        if( this.activeTimeline == this.gui.globalTimeline && this.activeTimeline.historyUndo.length ){
            const mixer = this.currentCharacter.mixer;
            while(mixer._actions.length){
                mixer.uncacheClip(mixer._actions[0]._clip);
            }
            this.globalAnimMixerManagement( mixer, this.activeTimeline.animationClip, false );
            const steps = this.activeTimeline.historyUndo[ this.activeTimeline.historyUndo.length -1 ];
            for( let i = 0; i < steps.length; ++i){
                const track = this.activeTimeline.animationClip.tracks[ steps[i].trackIdx ];
                track.clips.forEach((c,i) =>{
                    this.currentKeyFrameClip = { blendMode: c.blendMode }; // start hack
                    this.updateMixerAnimation( c.mixerBodyAnimation, null, c.skeletonAnimation, false );
                    this.updateMixerAnimation( c.mixerFaceAnimation, null, c.bsAnimation, false );
                    this.currentKeyFrameClip = null; // end hack
                })
            }
        }

        // keep side panel visible with the selected clip
        if ( lastSelection ){
            const tracks = this.gui.globalTimeline.animationClip.tracks;
            if( tracks[lastSelection[0]].clips.length > lastSelection[1] && tracks[lastSelection[0]].clips[lastSelection[1]].uid == lastSelection[2].uid ){
                this.gui.globalTimeline.selectClip( lastSelection[0], lastSelection[1] ); // already calls createSidePinel in callback
            }
			else{
				const targetId = lastSelection[2].uid;
				let lost = true;
				for( let t = 0; t < tracks.length; ++t ){
					for( let c = 0; c < tracks[t].clips.length; ++c ){
						if ( tracks[t].clips[c].uid == targetId ){
							this.gui.globalTimeline.selectClip( t, c ); // already calls createSidePinel in callback
							t = tracks.length; // end loop
							lost = false;
							break;
						}
					}
				}
				if ( lost ){
					this.gui.createSidePanel(); // empty panel				
				}
			}
        }

        this.setTime(this.currentTime);
    }

    async initCharacters( modelToLoad ) {
        // Create gizmo
        this.gizmo = new Gizmo(this);

        // Load current character
        await this.loadCharacter(modelToLoad[0], modelToLoad[1], modelToLoad[2], modelToLoad[3]);
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ) {
            this.loadNNSkeleton();
        }

        while(!this.loadedCharacters[this.character] || ( !this.nnSkeleton && this.inferenceMode == this.animationInferenceModes.NN ) ) {
            await new Promise(r => setTimeout(r, 1000));            
        }        
        this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
        this.setBoneSize(0.12);
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

    async changeCharacter(characterName) {
        // Check if the character is already loaded
        if( !this.loadedCharacters[characterName] ) {
            console.warn(characterName + " not loaded");
            const modelToLoad = this.characterOptions[characterName];
            await this.loadCharacter(modelToLoad[0], modelToLoad[1], modelToLoad[2], characterName);
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
        this.setPlaybackRate(this.playbackRate);

        // Gizmo stuff
        if(this.gizmo) {
            this.gizmo.begin(this.currentCharacter.skeletonHelper);            
        }

        this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
        
        for(let anim in this.boundAnimations) {
            if(this.boundAnimations[anim] && !this.boundAnimations[anim][characterName]) {
                const characters = Object.keys(this.boundAnimations[anim]);
                const animation = this.boundAnimations[anim][characters[0]];
                
                const newAnimation = Object.assign({}, animation);
                const tracks = [];
                
                for(let i = 0; i < animation.tracks.length; i++) {
                    const track = animation.tracks[i];
                    const clips = [];
                    for( let j = 0; j < track.clips.length; j++) {
                        const clip = track.clips[j];
                        const newClip = Object.assign({}, clip);
                        newClip.uid = this.generateClipUniqueID();

						// Retarget body animation
                        if(clip.mixerBodyAnimation) {
                            newClip.mixerBodyAnimation = this.retargetAnimation(this.loadedCharacters[characters[0]].skeletonHelper, clip.mixerBodyAnimation);
							newClip.mixerBodyAnimation.duration = clip.skeletonAnimation.duration;
                            // Set keyframe animation to the timeline and get the timeline-formated one
                            newClip.skeletonAnimation = this.gui.skeletonTimeline.instantiateAnimationClip( newClip.mixerBodyAnimation );                
                            newClip.skeletonAnimation.name = "bodyAnimation";  // timeline
                        }
                        if(clip.auAnimation) {
                           
                            newClip.auAnimation = this.gui.auTimeline.instantiateAnimationClip( newClip.auAnimation, true );                            
                            newClip.mixerFaceAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimationFromAU( newClip.auAnimation ); // blendhsapes timeline            
							newClip.mixerFaceAnimation.duration = clip.auAnimation.duration;
                            newClip.bsAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimation(newClip.mixerFaceAnimation);
                            newClip.bsAnimation.duration = newClip.auAnimation.duration;
                            newClip.bsAnimation = this.gui.bsTimeline.instantiateAnimationClip( newClip.bsAnimation ); // generate default animationclip or process the user's one;
                        }
                        clips.push(newClip);
                    }
                    const newTrack = Object.assign({}, track);
                    newTrack.clips = clips;
                    tracks.push(newTrack);
                }
                newAnimation.tracks = tracks;
                this.boundAnimations[anim][characterName] = newAnimation;

            }
            this.gui.createCharactersPanel();
            this.setGlobalAnimation(anim);
        }
        this.gui.createSidePanel();
        UTILS.hideLoading();
    }

    /**
     * 
     * @param {string} name 
     * @param {int} mode
     *      -1: overwrite any existing animation with that name for the current character
     *      0: exact unique name. If it already exists, it does not create an animation
     *      1: adds an incrementing number if a match is found for that animation for that character 
     */
    createGlobalAnimation( name, mode = 0 ){

        const characterName = this.currentCharacter.name;

        if (mode == 1){
            let count = 1;
            let countName = name;
            while( this.boundAnimations[countName] && this.boundAnimations[countName][characterName] ){
                countName = name + ` (${count++})`;
            }
            name = countName;
        }
        else if (mode == 0){
            if (this.boundAnimations[name] && this.boundAnimations[name][characterName]){
                return null;
            }
        }

        if ( !this.boundAnimations[name] ){
            this.boundAnimations[name] = {};
        }
        const animationClip = this.gui.globalTimeline.instantiateAnimationClip({ id: name });
        this.boundAnimations[name][characterName] = animationClip;

        return animationClip;
    }

    setGlobalAnimation( name ){
        let alreadyExisted = true;
        if (!this.boundAnimations[name] || !this.boundAnimations[name][this.currentCharacter.name]){
            this.createGlobalAnimation(name, -1);
            alreadyExisted = false;
        }

        const mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();
        while( mixer._actions.length ){
            mixer.uncacheClip( mixer._actions[0]._clip );
        }

        this.currentCharacter.skeletonHelper.skeleton.pose(); // this is needed so mixer does Bind Pose when no actions are played

        this.gui.globalTimeline.setAnimationClip( this.boundAnimations[name][this.currentCharacter.name], false );
        this.currentAnimation = name;
        this.currentKeyFrameClip = null;
        this.globalAnimMixerManagement(mixer, this.boundAnimations[name][this.currentCharacter.name], false);
        this.setTimeline(this.animationModes.GLOBAL);
        this.gui.createSidePanel();
        this.gui.globalTimeline.updateHeader(); // a bit of an overkill
        this.setTime(this.currentTime); // update mixer
		this.gui.globalTimeline.visualOriginTime = - ( this.gui.globalTimeline.xToTime(100) - this.gui.globalTimeline.xToTime(0) ); // set horizontal scroll to 100 pixels 

        return alreadyExisted;
    }

    renameGlobalAnimation( currentName, newName, findSuitableName = false ){

        if (findSuitableName){
            let count = 1;
            let countName = newName;
            while( this.boundAnimations[countName] ){
                countName = newName + ` (${count++})`;
            }
            newName = countName;
        }else{
            if ( this.boundAnimations[newName] ){
                return null;
            }
        }

        if ( !this.boundAnimations[newName] ){
            this.boundAnimations[newName] = {};
        }

        const bound = this.boundAnimations[currentName];
        this.boundAnimations[newName] = bound;
        for( let charactername in bound ){
            bound[charactername].id = newName;
        }
        delete this.boundAnimations[currentName];

        if ( this.currentAnimation == currentName ){
            this.currentAnimation = newName;
        }

        this.gui.globalTimeline.updateHeader(); // a bit of an overkill

        return newName;
    }

    async processPendingResources( settings = {} ) {

        if ( settings.capture ){
            const loadedName = await this.captureVideo(false);
            if( loadedName ){
                this.setGlobalAnimation(loadedName); // assume no animation exists. It is automatically created
                this.bindAnimationToCharacter(loadedName);
                return true;
            }
        }
        
        if( !settings.pendingResources ) {
            this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
            
            this.setGlobalAnimation("New Animation");
            this.loadAnimation("Empty clip", {}, true, false ); // load and bind
            return true;
        }
        
        const loaded = await this.loadFiles(settings.pendingResources);
        if( !loaded ) {
            await this.processPendingResources();
            this.gui.highlightSelector();
        }
        return true;
    }

    async loadFiles(files) {
        const animExtensions = ['bvh','bvhe', 'glb'];
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
                            if( file.animation.constructor == Array ) { //glb animations
                                let animationNames = [];
                                for(let f = 0; f < file.animation.length; f++ ) {
                                    animationNames.push( this.loadAnimation( file.animation[f].name, file.animation[f], false) ); // only load. Do not bind
                                }
                                resolve(animationNames);
                            }
                            else {
                                let name = this.loadAnimation( file.name, file.animation, false ); // only load. Do not bind
                                resolve([name]);
                            }
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
                let animationNames = [];
                for( let i = 0; i < animations.length; i++ ) {
                    animationNames.push( this.buildAnimation(animations[i], false) ); // only load. Do not bind
                }
                resolve(animationNames);
            })
            promises.push(promise);
        }
        if( !promises.length ) {
            
            LX.popup("The file is empty or has an incorrect format.", "Ops! Animation Load Issue!", {timeout: 9000, position: [ "10px", "50px"] });           
            UTILS.hideLoading();
        }

        return Promise.all( promises ).then((results) =>{
            let allNames = [];
            for( let i = 0; i < results.length; ++i ){
                allNames = allNames.concat(results[i]);
            }
            if ( allNames.length ){
                this.gui.showInsertModeAnimationDialog(allNames);
            }
            return allNames
        });
    }

    async captureVideo( showInsertDialog = true ) {
        const animation = await this.ANIMICS.processWebcam();
        if( !animation ) {
            return null;
        }

        let animationName = this.buildAnimation(animation, false); // only load. Do not bind
        if ( showInsertDialog ){
            this.gui.showInsertModeAnimationDialog([animationName]);
        }

        return animationName;
    }

    /**Create face and body animations from mediapipe and load character*/
    buildAnimation(data, bindToCurrentGlobal = true) {

        // get extension of videos so exporting will be easier
        let videoExtensionIdx = data.name.lastIndexOf(".");
        let videoExtension;
        if( videoExtensionIdx == -1 || videoExtensionIdx == (data.name.length-1)){
            videoExtension = ".webm";
            videoExtension = data.name.length;
        }else{
            videoExtension = data.name.slice(videoExtensionIdx);
        }
        data.name = data.name.slice(0, videoExtensionIdx);

        // ensure unique name
        let count = 1;
        let countName = data.name;
        while( this.loadedAnimations[countName] ){
            countName = data.name + ` (${count++})`;
        }
        data.name = countName;

        this.loadedAnimations[data.name] = data;
        this.loadedAnimations[data.name].type = "video";
        this.loadedAnimations[data.name].videoExtension = videoExtension;
        this.loadedAnimations[data.name].export = true;

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
            this.loadedAnimations[data.name].originalBodyAnimation = landmarks; // array of objects of type { FLM, PLM, LLM, RLM, PWLM, LWLM, RWLM }. Not an animation clip
            this.loadedAnimations[data.name].bodyAnimation = this.smoothMediapipeLandmarks( landmarks ); // array of objects of type { FLM, PLM, LLM, RLM, PWLM, LWLM, RWLM }. Not an animation clip
            // TO DO consider exposing the smoothing as an option to the user. This would require moving the smoothing from mediapipe to the quat/pos tracks themselves 
           
        }
        
        // Create face animation from mediapipe action units
        let faceAnimation = this.currentCharacter.blendshapesManager.createAnimationFromActionUnits("faceAnimation", blendshapes); // faceAnimation is an action units clip
        if ( !faceAnimation.tracks.length ) {
            faceAnimation = this.currentCharacter.blendshapesManager.createAnimationFromActionUnits("faceAnimation", null); // create an animation with default action units
        }
        this.loadedAnimations[data.name].faceAnimation = faceAnimation; // action units THREEjs AnimationClip

        if ( bindToCurrentGlobal ){   
            this.bindAnimationToCharacter(data.name);
        }

        return data.name;
    }

    // load animation from bvh or bvhe file
    loadAnimation(name, animationData, bindToCurrentGlobal = true, addToLoadedList = true) {

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
        else{ // Otherwise create empty body animation
            this.currentCharacter.skeletonHelper.skeleton.pose();
            bodyAnimation = createEmptySkeletonAnimation("bodyAnimation", this.currentCharacter.skeletonHelper.bones);
            skeleton = this.currentCharacter.skeletonHelper.skeleton;
        }

        // If it has face animation, it means that comes from BVHe
        if ( animationData && animationData.blendshapesAnim ) {
            animationData.blendshapesAnim.name = "faceAnimation";       
            faceAnimation = animationData.blendshapesAnim.clip;
            // // Convert morph target animation (threejs with character morph target names) into Mediapipe Action Units animation
            // faceAnimation = this.currentCharacter.blendshapesManager.createAUAnimation(faceAnimation);
        }
        else { // Otherwise, create empty face animation
            // faceAnimation = THREE.AnimationClip.CreateFromMorphTargetSequence('BodyMesh', this.currentCharacter.model.getObjectByName("BodyMesh").geometry.morphAttributes.position, 24, false);
            faceAnimation = this.currentCharacter.blendshapesManager.createEmptyAnimation("faceAnimation");
            faceAnimation.duration = bodyAnimation.duration;
            faceAnimation.from = "";
        }
        
        // fix duration of body and face animations 
        let duration = 1;
        if ( animationData && ( animationData.skeletonAnim || animationData.blendshapesAnim ) ){ // empty animation? default duration to 1
            duration = Math.max(bodyAnimation.duration, faceAnimation.duration);
        }
        bodyAnimation.duration = duration;
        faceAnimation.duration = duration;

        
        let fileExtension = name.lastIndexOf(".");
        if ( fileExtension != -1 ){
            fileExtension = name.slice(fileExtension);
        }else{
            fileExtension = "unknown";
        }

        // ensure unique name
        let count = 1;
        let countName = name;
        while( this.loadedAnimations[countName] ){
            countName = name + ` (${count++})`;
        }
        name = countName;

        this.loadedAnimations[name] = {
            name: name,
            bodyAnimation: bodyAnimation ?? new THREE.AnimationClip( "bodyAnimation", 1, [] ), // THREEjs AnimationClip
            faceAnimation: faceAnimation ?? new THREE.AnimationClip( "faceAnimation", 1, [] ), // THREEjs AnimationClip
            skeleton: skeleton ?? this.currentCharacter.skeletonHelper.skeleton,
            fileExtension: fileExtension,
            type: "bvh"
        };

        if ( bindToCurrentGlobal ){
            this.bindAnimationToCharacter(name);
        }

        if ( !addToLoadedList ){
            delete this.loadedAnimations[name];
            // not deleting it from sources of bound animations. TODO decide if this is a bug or feature
        }

        return name;
    }

    /**
     * 
     * @param {array of Mediapipe landmarks} inLandmarks each entry of the array is a frame containing an object with information about the mediapipe output { FLM, PLM, LLM, RLM, PWLM, LWLM, RWLM }
     * @returns {array of Mediapipe landmarks} same heriarchy as inLandmarks but smoothed
     */
    smoothMediapipeLandmarks( inLandmarks,  ){
        let outLandmarks = JSON.parse(JSON.stringify(inLandmarks));

        let arrayToSmoothX = new Array( inLandmarks.length );
        let arrayToSmoothY = new Array( inLandmarks.length );
        let arrayToSmoothZ = new Array( inLandmarks.length );

        let attributesToSmooth = [ "PWLM", "LWLM", "RWLM" ];
        
        for( let group of attributesToSmooth ){

            let initialValues = null;
            for( let f = 0; f < inLandmarks.length; ++f ){
                if ( !inLandmarks[f][group] ){ continue; }
                initialValues = inLandmarks[f][group];
                break;
            }
            if ( !initialValues ){
                return outLandmarks;
            }

            // for each landmark
            for(let l = 0; l < initialValues.length; ++l ){

                
                //for each frame get the value to smooth (or a default one)
                let values = initialValues[l]; // default values in case there is no landmark estimation for a frame
                for( let f = 0; f < inLandmarks.length; ++f ){

                    if (outLandmarks[f] && outLandmarks[f][group] ){
                        values = outLandmarks[f][group][l];  // found a valid landmark, set it as default
                    }
                    arrayToSmoothX[f] = values.x;
                    arrayToSmoothY[f] = values.y;
                    arrayToSmoothZ[f] = values.z;

                }

                const smoothX = mlSavitzkyGolay(arrayToSmoothX, 1, { windowSize: 9, polynomial: 3, derivative: 0, pad: 'pre', padValue: 'replicate' }); //https://www.skypack.dev/view/ml-savitzky-golay
                const smoothY = mlSavitzkyGolay(arrayToSmoothY, 1, { windowSize: 9, polynomial: 3, derivative: 0, pad: 'pre', padValue: 'replicate' }); //https://www.skypack.dev/view/ml-savitzky-golay
                const smoothZ = mlSavitzkyGolay(arrayToSmoothZ, 1, { windowSize: 9, polynomial: 3, derivative: 0, pad: 'pre', padValue: 'replicate' }); //https://www.skypack.dev/view/ml-savitzky-golay

                //for each frame, set smoothed values
                for( let f = 0; f < inLandmarks.length; ++f ){
                    if (outLandmarks[f] && outLandmarks[f][group] ){
                        let values = outLandmarks[f][group][l];
                        values.x = smoothX[f];
                        values.y = smoothY[f];
                        values.z = smoothZ[f];
                    }

                } 
            } // end of landmark
        } // end of attribute

        return outLandmarks;
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
            let boneHeadTop = boneHead; // head top, must be a children of head
            for(let i = 0; i < boneHead.children.length; i++) {
                if(boneHead.children[i].name.toLowerCase().includes('eye')) {
                    continue;
                }
                boneHeadTop = boneHead.children[i];
                break;
            }
            boneHead.updateWorldMatrix( true, false );
            // character bone local space direction
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
    
                // world mediapipe bone direction to local space
                dirPred.subVectors( landmarkTrg, landmarkSrc );
                dirPred.applyQuaternion( invWorldQuat ).normalize();
    
                // character bone local space direction
                dirBone.copy( boneTrg.position ).normalize();
    
                // move bone to predicted direction
                qq.setFromUnitVectors( dirBone, dirPred );
                boneSrc.quaternion.multiply( qq );
                getTwistQuaternion( qq, dirBone, twist ); // remove undesired twist from bone
                boneSrc.quaternion.multiply( twist.invert() ).normalize();
            }
        }

        function computeQuatHand( skeleton, handLandmarks, isLeft = false ){
            if ( !handLandmarks ){ return; }
            //handlandmarks is an array of {x,y,z,visiblity} (mediapipe)

            const boneHand = isLeft? skeleton.bones[ 12 ] : skeleton.bones[ 36 ];
            const boneMid = isLeft? skeleton.bones[ 21 ] : skeleton.bones[ 45 ];
            // const boneThumbd = isLeft? skeleton.bones[ 13 ] : skeleton.bones[ 53 ];
            const bonePinky = isLeft? skeleton.bones[ 29 ] : skeleton.bones[ 37 ];
            const boneIndex = isLeft? skeleton.bones[ 17 ] : skeleton.bones[ 49 ];
    
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

        /* TODO
            Consider moving the constraints direclty into the mediapipe landmarks. 
            This would avoid unnecessary recomputations of constraints between different characters.
            Changes would be baked already in the mediapipe landmarks
        */       
        function computeQuatPhalange( skeleton, bindQuats, handLandmarks, isLeft = false ){
            if ( !handLandmarks ){ return; }
            //handlandmarks is an array of {x,y,z,visiblity} (mediapipe)

            const bonePhalanges = isLeft ? 
            [ 13,14,15,16,    17,18,19,20,    21,22,23,24,    25,26,27,28,    29,30,31,32 ] :
            [ 53,54,55,56,    49,50,51,52,    45,46,47,48,    41,42,43,44,    37,38,39,40 ];
    
            let tempVec3_1 = new THREE.Vector3();
            let tempVec3_2 = new THREE.Vector3();
            const invWorldQuat = new THREE.Quaternion();
    
            tempVec3_1.subVectors(handLandmarks[5], handLandmarks[0]).normalize();
            tempVec3_2.subVectors(handLandmarks[17], handLandmarks[0]).normalize();
            const handForward = (new THREE.Vector3()).addScaledVector(tempVec3_1,0.5).addScaledVector(tempVec3_2,0.5); // direction of fingers
            const handNormal = (new THREE.Vector3()).crossVectors(tempVec3_2,tempVec3_1).normalize(); // on right hand and left hand, direction from back of hand outwards
            const handSide = (new THREE.Vector3()).crossVectors(handNormal,handForward).normalize(); // on right hand, direction from center of hand to thumb side. On left hand, direction form center of hand to pinky side
            if ( isLeft ){
                handNormal.multiplyScalar(-1);
                handSide.multiplyScalar(-1);
            }
    
            const prevForward = new THREE.Vector3();
            const prevNormal = new THREE.Vector3();
            const prevSide = new THREE.Vector3();
    
            const maxLateralDeviation = Math.cos(60 * Math.PI/180);
            const latDevQuat = new THREE.Quaternion();
            const latDevNormal = new THREE.Vector3();

            // for each finger (and thumb)
            for( let f = 1; f < handLandmarks.length; f+=4){
    
                // fingers can slightly move laterally. Compute the mean lateral movement of the finger
                let meanSideDeviation = 0;
                tempVec3_1.subVectors(handLandmarks[f+1], handLandmarks[f+0]).normalize();
                meanSideDeviation += handSide.dot(tempVec3_1) * 1/3;
                const fingerBend = handNormal.dot(tempVec3_1);
                tempVec3_1.subVectors(handLandmarks[f+2], handLandmarks[f+1]).normalize();
                meanSideDeviation += handSide.dot(tempVec3_1) * 1/3;
                tempVec3_1.subVectors(handLandmarks[f+3], handLandmarks[f+2]).normalize();
                meanSideDeviation += handSide.dot(tempVec3_1) * 1/3;
                
                if (Math.abs(meanSideDeviation) > maxLateralDeviation){
                    meanSideDeviation = (meanSideDeviation < 0) ? -maxLateralDeviation : maxLateralDeviation;
                }
                if ( fingerBend < 0){ // the more the finger is bended, the less it can be moved sideways
                    meanSideDeviation *= 1+fingerBend;
                }
                // end of lateral computations
    
                // phalanges can bend. Thus, reference vectors need to be with respect to the last phalange (or the base of the hand)
                prevForward.copy(handForward);
                prevSide.copy(handSide);
                prevNormal.copy(handNormal);
    
                // for each phalange of each finger (and thumb)
                for( let i = 0; i < 3; ++i){
                    const boneSrc = skeleton.bones[ bonePhalanges[ f + i-1 ] ];
                    const boneTrg = skeleton.bones[ bonePhalanges[ f + i ] ];
                    const landmark = f + i;
                    boneSrc.quaternion.copy( bindQuats[ bonePhalanges[ f+i-1 ] ] );
                    boneSrc.updateWorldMatrix( true, false );
                
                    // world mediapipe phalange direction
                    let v_phalange = new THREE.Vector3();
                    v_phalange.subVectors( handLandmarks[landmark+1], handLandmarks[landmark] ).normalize();
    
                    // fingers (no thumb). All lateral deviation is removed and added later on
                    if ( f > 4 ){
                        // remove all lateral deviation (later will add the allowed one)
                        v_phalange.addScaledVector(handSide, -v_phalange.dot(handSide));
                        if (v_phalange.length() < 0.0001 ){
                            v_phalange.copy(prevForward);
                        }else{
                            v_phalange.normalize();
                        }
    
                        // prevForward and prevNormal do not have any lateral deviation
                        const dotForward = v_phalange.dot(prevForward);
                        const dotNormal = v_phalange.dot(prevNormal);
                        
                        // finger cannot bend uppwards
                        if (dotNormal > 0){
                            v_phalange.copy( prevForward );
                        }else{
                            const limitForward = -0.76; // cos 40º
                            const limitNormal = -0.64; // sin 40º
                            // too much bending, restrict it (set default bended direction)
                            if ( dotForward < limitForward ){ 
                                v_phalange.set(0,0,0);
                                v_phalange.addScaledVector( prevForward, limitForward);
                                v_phalange.addScaledVector( prevNormal, limitNormal);
                            }
                        }
        
                        v_phalange.normalize();
                
                        prevNormal.crossVectors( v_phalange, handSide ).normalize();
                        prevForward.copy(v_phalange); // without any lateral deviation

                        // store lateral deviation rotation axis. As the finger could be bent, the fingerNormal and handNormal do not necessarily match. 
                        if ( i == 0 ){
                            latDevNormal.copy( prevNormal );
                        }
                    }
                    else {
                        // thumb
                        if (i==0){
                            // base of thumb
                            const dotthumb = v_phalange.dot(handNormal);
                            const mint = -0.45;
                            const maxt = 0.0;
                            if ( dotthumb > maxt || dotthumb < mint ){
                                const clampDot = Math.max(mint, Math.min(maxt, dotthumb));
                                v_phalange.addScaledVector(handNormal, -dotthumb + clampDot);
                            }
                            prevForward.copy(handForward);
                            prevSide.copy(handNormal); // swap
                            prevNormal.copy(handSide); // swap
                            if ( isLeft ){
                                prevNormal.multiplyScalar(-1);                            
                            }
                        }
                        else{
                            // other thumb bones
                            // remove lateral deviation
                            v_phalange.addScaledVector(prevSide, -v_phalange.dot(prevSide));
                            
                            // cannot bend on that direction
                            const dotNormal = v_phalange.dot(prevNormal);
                            if (dotNormal > 0){
                                v_phalange.addScaledVector(prevNormal, -dotNormal)
                            }        
                        }
    
                        v_phalange.normalize();
        
                        if (v_phalange.length() < 0.0001 ){
                            v_phalange.copy(prevForward);
                        }
        
                        // update previous directions with the current ones
                        if ( isLeft ){
                            prevNormal.crossVectors( v_phalange, prevSide ).normalize();
                            prevSide.crossVectors( prevNormal, v_phalange ).normalize();
                            prevForward.copy(v_phalange);
                        }else{
                            prevNormal.crossVectors( prevSide, v_phalange ).normalize();
                            prevSide.crossVectors( v_phalange, prevNormal ).normalize();
                            prevForward.copy(v_phalange);
                        }
                    }
    

                    boneSrc.matrixWorld.decompose( tempVec3_1, invWorldQuat, tempVec3_1 );
                    invWorldQuat.invert();
                    // world phalange direction to local space
                    v_phalange.applyQuaternion( invWorldQuat ).normalize();
        
                    // character bone local space direction
                    let phalange_p = boneTrg.position.clone().normalize();
        
                    // move bone to predicted direction
                    const rot = new THREE.Quaternion();
                    const twist = new THREE.Quaternion();
                    rot.setFromUnitVectors( phalange_p, v_phalange );
                    getTwistQuaternion( rot, phalange_p, twist ); // remove undesired twist from phalanges
                    boneSrc.quaternion.multiply( rot ).multiply( twist.invert() ).normalize();
                }// end of phalange for

                // add lateral deviation for fingers, only on the base bone. Right now, fingers are all in the plane ( Normal x Forward )
                if( f > 4 ){
					const boneSrc = skeleton.bones[ bonePhalanges[ f-1 ] ];
					boneSrc.updateMatrixWorld(true);
					let q = new THREE.Quaternion();
					boneSrc.matrixWorld.decompose(tempVec3_1, q, tempVec3_1);
					latDevNormal.applyQuaternion( q.invert() );
					latDevQuat.setFromAxisAngle( latDevNormal, (Math.PI-Math.acos(meanSideDeviation)) - Math.PI*0.5);
					boneSrc.quaternion.multiply(latDevQuat);
				}
            } // end of finger 'for'
        };

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
     * KeyframeEditor: fetches a loaded animation and applies it to the character.
     * @param {String} animationName 
     * @param {Object} targetGlobalAnimation where to add the animation. If null, the current global animation is used
     */
    bindAnimationToCharacter(animationName, targetGlobalAnimation = null) {
        
        const animation = this.loadedAnimations[animationName];
        let faceAnimation = null;
        let bodyAnimation = null;

        if( !animation ) {
            console.warn(animationName + " not found");
            return false;
        }

        bodyAnimation = animation.bodyAnimation;        
        let skeletonAnimation = null;
        
        const otherTracks = []; // blendshapes     

        if(bodyAnimation) {
            if ( animation.type == "video" && this.inferenceMode == this.animationInferenceModes.M3D ){ // mediapipe3d animation inference algorithm
                bodyAnimation = this.createBodyAnimationFromWorldLandmarks( animation.bodyAnimation, this.currentCharacter.skeletonHelper.skeleton );
            } 
            else { // bvh (and old ML system) retarget an existing animation
                const tracks = [];
                // Remove position changes (only keep i == 0, hips)
                for (let i = 0; i < bodyAnimation.tracks.length; i++) {
                    if(bodyAnimation.tracks[i].constructor == THREE.NumberKeyframeTrack ) {
                        otherTracks.push(bodyAnimation.tracks[i]);
                        continue;
                    }
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
                // let retargeting = new AnimationRetargeting(skeleton, this.currentCharacter.skeletonHelper.skeleton, { trgEmbedWorldTransforms: true, srcPoseMode: options.srcPoseMode, trgPoseMode: options.trgPoseMode, srcEmbedWorldTransforms: options.srcEmbedWorldTransforms } ); // both skeletons use their native bind pose
                const oldDuration = bodyAnimation.duration;
                // bodyAnimation = retargeting.retargetAnimation(bodyAnimation);
                bodyAnimation = this.retargetAnimation({skeleton}, bodyAnimation);  
                bodyAnimation.duration = oldDuration;
            }

            this.validateBodyAnimationClip(bodyAnimation);

            // set track value dimensions. Necessary for the timeline
            for( let i = 0; i < bodyAnimation.tracks.length; ++i ){
                let t = bodyAnimation.tracks[i]; 
                if ( t.name.endsWith(".quaternion") ){ t.dim = 4; }
                else{ t.dim = 3; }
            }
            // Set keyframe animation to the timeline and get the timeline-formated one
            skeletonAnimation = this.gui.skeletonTimeline.instantiateAnimationClip( bodyAnimation );

            bodyAnimation.name = "bodyAnimation";   // mixer
            skeletonAnimation.name = "bodyAnimation";  // timeline

            if(otherTracks.length) { // comes from a bvhe
                faceAnimation = new THREE.AnimationClip("faceAnimation", bodyAnimation.duration, otherTracks);
            }
        }
            
        if( animation.faceAnimation ) {
            faceAnimation = faceAnimation ? animation.faceAnimation.tracks.concat(faceAnimation.tracks) : animation.faceAnimation;
        }      
        let auAnimation = null;
        let bsAnimation = null;

        if(faceAnimation) {
                            
            if(animation.type == "video") {
                const parsedAnimation = this.currentCharacter.blendshapesManager.createThreejsAnimation(animation.blendshapes);
                faceAnimation = parsedAnimation.bsAnimation;
                auAnimation = parsedAnimation.auAnimation || faceAnimation;
            }
            else {
                // Convert morph target animation (threejs with character morph target names) into Mediapipe Action Units animation
                auAnimation = this.currentCharacter.blendshapesManager.createAUAnimation(faceAnimation);
                if( !auAnimation.tracks.length ) {
                    auAnimation = this.currentCharacter.blendshapesManager.createAUAnimation(faceAnimation, MapNames.rpm);
                }
                if( !auAnimation.tracks.length ) {
                    auAnimation = this.currentCharacter.blendshapesManager.createAUAnimation(faceAnimation, MapNames.Eva);
                }
            }
            // set track value dimensions. Necessary for the timeline, although it should automatically default to 1
            for( let i = 0; i < auAnimation.tracks.length; ++i ){
                auAnimation.tracks[i].dim = 1;
            }

            auAnimation.duration = faceAnimation.duration;
            // Set keyframe animation to the timeline and get the timeline-formated one.
            auAnimation = this.gui.auTimeline.instantiateAnimationClip( auAnimation );

            faceAnimation.name = "faceAnimation";   // mixer
            auAnimation.name = "faceAnimation";  // action units timeline
            faceAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimationFromAU( auAnimation ); 
            this.validateFaceAnimationClip(faceAnimation);
            
            // bsAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimation( faceAnimation ); // blendhsapes timeline            
            bsAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimation(faceAnimation);
            bsAnimation.duration = faceAnimation.duration;
            bsAnimation = this.gui.bsTimeline.instantiateAnimationClip( bsAnimation ); // generate default animationclip or process the user's one;

        }
        
        const boundAnimation = {
            uid: this.generateClipUniqueID(), // do not change this value
            source: animation,
            skeletonAnimation, auAnimation, bsAnimation, // from gui timeline. Main data
            mixerBodyAnimation: bodyAnimation, mixerFaceAnimation: faceAnimation, // for threejs mixer. ALWAYS relies on timeline data

            start: 0,
            duration: skeletonAnimation.duration,
            fadeinType: KeyframeEditor.FADETYPE_NONE,
            fadeoutType: KeyframeEditor.FADETYPE_NONE,
            weight: 1, // not the current weight, but the overall weight the clip should have when playing

            id: animationName,
            clipColor: LX.getThemeColor("global-color-accent"),
            blendMode: THREE.NormalAnimationBlendMode,
            active: true
        }

        if ( targetGlobalAnimation ){
            const currentGlobal = this.gui.globalTimeline.animationClip; // this.currentAnimation might be null, but timeline always has a defualt animation
            this.gui.globalTimeline.setAnimationClip(targetGlobalAnimation, false);
            this.gui.globalTimeline.addClip(boundAnimation);
            this.gui.globalTimeline.setAnimationClip(currentGlobal, false);
        }else{
            this.gui.globalTimeline.addClip(boundAnimation);
            
            const mixer = this.currentCharacter.mixer;
            this.setKeyframeClipBlendMode( boundAnimation, THREE.NormalAnimationBlendMode, false );
            this.globalAnimMixerManagementSingleClip(mixer, boundAnimation);

        }

        
        this.setTime(this.currentTime); // update mixer state
        return boundAnimation;
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

        // ensure each track has at least one valid entry. Default to current character pose
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
    validateFaceAnimationClip( animation ) {

        let tracks = animation.tracks;
        let blendshapes = this.currentCharacter.morphTargets;

        let bsCheck = new Array(blendshapes.length);
        bsCheck.fill(false);

        const allMorphTargetDictionary = {};
        // ensure each track has at least one valid entry. Default to current character pose
        for( let i = 0; i < tracks.length; ++i ){
            const track = tracks[i];
            const {propertyIndex, nodeName} = THREE.PropertyBinding.parseTrackName( track.name );
            if(allMorphTargetDictionary[propertyIndex]) {
                allMorphTargetDictionary[propertyIndex][nodeName] = track;
            }
            else {
                allMorphTargetDictionary[propertyIndex] = { [nodeName] : track };
            }
        }

        const defaultTimes = animation && animation.tracks.length ? animation.tracks[0].times : [0];
        const morphTargetDictionary = this.currentCharacter.morphTargets;

        for( let mesh in morphTargetDictionary ) {
            const dictionary = morphTargetDictionary[mesh];
            for( let morph in dictionary ) {
                let newTrack = null;
                if( allMorphTargetDictionary[morph]) {
                        if(allMorphTargetDictionary[morph][mesh]) {
                            continue;
                        }                    
                    const keys = Object.keys(allMorphTargetDictionary[morph]);
                    const track = allMorphTargetDictionary[morph][keys[0]];
                    newTrack = new THREE.NumberKeyframeTrack( mesh + ".morphTargetInfluences[" + morph + "]", track.times, track.values);
                }
                else {
                    const values = [];
                    values.length = defaultTimes.length;
                    values.fill(0);
                    newTrack = new THREE.NumberKeyframeTrack( mesh + ".morphTargetInfluences[" + morph + "]", defaultTimes.slice(), values);
                    allMorphTargetDictionary[morph] = { [mesh] : newTrack};
                }

                tracks.push(newTrack);
            }
        }
    }

    setVideoVisibility( visibility, needsMirror = false ){ // TO DO
        if(visibility && this.currentKeyFrameClip && this.currentKeyFrameClip.source && this.currentKeyFrameClip.source.type == "video") {
            this.gui.showVideoOverlay(needsMirror);
            this.gui.computeVideoArea( this.currentKeyFrameClip.source.rect );
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

        this.playbackRate = v;
        this.currentCharacter.mixer.timeScale = v;

        LX.emit("@on_set_speed", v ); // skipcallbacks, only update
    }

    setBoneSize(newSize) {
        const geometry = this.gizmo.bonePoints.geometry;
        const positionAttribute = geometry.getAttribute( 'position' );
        this.gizmo.bonePoints.geometry.setAttribute( 'size', new THREE.Float32BufferAttribute( new Array(positionAttribute.count).fill(newSize), 1 ) );
        this.gizmo.raycaster.params.Points.threshold = newSize/10;
    }

    // OVERRIDE
    update( dt ) {

        if ( (this.currentTime + (this.state * dt * this.playbackRate) ) >= (this.startTimeOffset + this.activeTimeline.duration) ) {
            this.onAnimationEnded();
        }

        if ( this.currentCharacter.mixer && this.state ) {

            const tracks = this.gui.globalTimeline.animationClip.tracks;
            for(let i = 0; i < tracks.length; ++i ){
                const clips = tracks[i].clips;
                for(let c = 0; c < clips.length; ++c ){
                    this.computeKeyframeClipWeight(clips[c], this.currentTime);
                }
            }

            this.currentCharacter.mixer.update( dt );
            this.currentTime = this.currentCharacter.mixer.time;
            this.activeTimeline.setTime( this.currentTime - this.startTimeOffset, true );
        }


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
        this.gui.propagationWindow.setTime( this.currentTime - this.startTimeOffset );
    }

    setTime( t, force ) {

        // Don't change time if playing
        if( this.state && !force ) {
            return;
        }

        const duration = this.activeTimeline.animationClip.duration;
        t = Math.clamp( t, this.startTimeOffset, this.startTimeOffset + duration - 0.001 );

        this.currentTime = t;
        this.globalAnimMixerManagement(this.currentCharacter.mixer, this.gui.globalTimeline.animationClip); // already deals with currentkeyframeclip

        // mixer computes time * timeScale. We actually want to set the raw animation (track) time, without any timeScale 
        this.currentCharacter.mixer.setTime( t / this.currentCharacter.mixer.timeScale ); //already calls mixer.update
        this.currentCharacter.mixer.update(0); // BUG: for some reason this is needed. Otherwise, after sme timeline edition + optimization, weird things happen

        // Update video
        if( this.currentKeyFrameClip && this.currentKeyFrameClip.source && this.currentKeyFrameClip.source.type == "video" ) {
            this.video.currentTime = this.video.startTime + t - this.currentKeyFrameClip.start;
        }
        
        this.gizmo.updateBones();
    }

    clearAllTracks() {
        if( !this.activeTimeline.animationClip ) {
            return;
        }

        const timeline = this.activeTimeline;
        const visibleElements = timeline.getVisibleItems();
        for( let i = 0; i < visibleElements.length; ++i ) {

            const track = visibleElements[i].treeData.trackData; 
            if( !track ) { // is a group title
                continue;
            }

            timeline.clearTrack(track.trackIdx);
            if ( timeline != this.gui.globalTimeline ){
                switch( this.animationMode ) {
                    case this.animationModes.BODY:
                        this.updateMixerAnimation(this.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx]);
                        break;
                    case this.animationModes.FACEAU:
                        this.updateBlendshapesAnimation(this.currentKeyFrameClip.bsAnimation, [id]);
                        break;
                    case this.animationModes.FACEBS:
                        this.updateMixerAnimation(this.currentKeyFrameClip.mixerFaceAnimation, [track.trackIdx]);
                        this.updateActionUnitsAnimation(this.currentKeyFrameClip.auAnimation, [id]);
                        break;
                }
            }
        }
    }
    
    /**
     * hides/show timelines depending on the type sent (BODY, FACE). DOES NOT set the character.mixer animations
     * @param {animationModes} type 
     * @returns 
     */
    setTimeline(type = this.animationModes.GLOBAL) {
       
        // hide previous timeline
        if(this.activeTimeline) {
            this.activeTimeline.hide();
        }
        const lastMode = this.animationMode;
        switch(type) {
            case this.animationModes.FACEBS:
                this.activeTimeline = this.gui.bsTimeline;
                this.animationMode = this.animationModes.FACEBS;
                if( lastMode != this.animationModes.FACEAU ) {
                    // this.gui.createSidePanel();  
                }
                this.gizmo.disable();
                break;

            case this.animationModes.FACEAU:
                this.activeTimeline = this.gui.auTimeline;
                this.animationMode = this.animationModes.FACEAU;
                if( lastMode != this.animationModes.FACEBS ) {
                    // this.gui.createSidePanel();  
                }  
                this.setSelectedActionUnit(this.selectedAU);           
                this.gizmo.disable();
                
                break;
               
            case this.animationModes.BODY:
                this.animationMode = this.animationModes.BODY;
                this.activeTimeline = this.gui.skeletonTimeline;
                // this.gui.createSidePanel();          
                this.setSelectedBone(this.selectedBone); // select bone in case of change of animation
                if( this.gui.canvasAreaOverlayButtons ) {
                    this.gui.canvasAreaOverlayButtons.buttons["Skeleton"].setState(true);
                }
                this.gizmo.enable();

                break;
                
            default:
                this.gui.skeletonTimeline.hide();
                this.gui.auTimeline.hide();
                this.gui.bsTimeline.hide();
                this.gui.globalTimeline.setTime(this.currentTime, true);
                this.gui.globalTimeline.show();
                this.startTimeOffset = 0;
                this.currentKeyFrameClip = null;
                this.activeTimeline = this.gui.globalTimeline;
                // this.gui.createSidePanel();
                if( this.gui.canvasAreaOverlayButtons ) {
                    this.gui.canvasAreaOverlayButtons.buttons["Skeleton"].setState(false);
                }
                this.gizmo.disable();
                
                this.video.sync = false;
                this.setVideoVisibility(false);
                break;
        }


        this.activeTimeline.setState(this.state, true); // skipcallback
        this.activeTimeline.setTime(this.currentTime - this.startTimeOffset, true);
        this.activeTimeline.show();
    }

    globalAnimMixerManagement(mixer, animation, useCurrentKeyframeClipRules = true){

        // when selecting a clip, only certain neighbouring animations should played
        if ( useCurrentKeyframeClipRules && this.currentKeyFrameClip ){
            const currentClip = this.currentKeyFrameClip;

            if ( currentClip.blendMode == THREE.AdditiveAnimationBlendMode ){
                // add all animations
                for( let t = 0; t < animation.tracks.length; ++t ){
                    const track = animation.tracks[t];
                    for( let c = 0; c < track.clips.length; ++c ){
                        const clip = track.clips[c];
                        this.globalAnimMixerManagementSingleClip(mixer, clip);
                    }
                }
                
                // stop actions that are additive. Keep only the selectedKeyFrameClip and all normalBlend animations 
                for( let i = 0; i < mixer._actions.length; ++i ){
                    const actionClip = mixer._actions[i]._clip;
                    if ( actionClip.blendMode == THREE.AdditiveAnimationBlendMode ){
                        if ( currentClip.mixerBodyAnimation != actionClip && 
                             currentClip.mixerFaceAnimation != actionClip ){
                                mixer._actions[i].stop();
                        }else{
                            mixer._actions[i].setEffectiveWeight(1); // the current Clip must not have intensities != 1. Otherwise delta Quat computation is not correct (mixer applies slerp(basePose, pose, weight) )
                        }
                        
                    } 
                }
            }else{

                // Normal animations are shown alone. Disable all other clip
                for( let i = 0; i < mixer._actions.length; ++i ){
                    const actionClip = mixer._actions[i]._clip;
                    if ( currentClip.mixerBodyAnimation != actionClip && 
                         currentClip.mixerFaceAnimation != actionClip ){
                            mixer._actions[i].stop();
                    
                    }
                }
                const weight = currentClip.weight;
                currentClip.weight = 1; // hack, Delta Quat computations need to be with weight == 1. Mixer computes pose using slerp(basePose, pose, weight)
                this.globalAnimMixerManagementSingleClip(mixer, currentClip);
                currentClip.weight = weight; // end hack
            }

            return;
        }

        // Displaying globalTimeline. Show all animations in their natural order and state
        for( let t = 0; t < animation.tracks.length; ++t ){
            const track = animation.tracks[t];
            for( let c = 0; c < track.clips.length; ++c ){
                const clip = track.clips[c];
                this.globalAnimMixerManagementSingleClip(mixer, clip);
            }
        }
    }
    globalAnimMixerManagementSingleClip(mixer, clip){
        const actionBody = mixer.clipAction(clip.mixerBodyAnimation); // either create or fetch
        const actionFace = mixer.clipAction(clip.mixerFaceAnimation); // either create or fetch
        
        if ( !clip.active ){
            actionBody.stop();
            actionFace.stop();
            return;
        }

        actionBody.reset().play();
        actionBody.clampWhenFinished = false;
        actionBody.loop = THREE.LoopOnce;
        actionBody.startAt(clip.start);

        actionFace.reset().play();
        actionFace.clampWhenFinished = false;
        actionFace.loop = THREE.LoopOnce;
        actionFace.startAt(clip.start);
        
        this.computeKeyframeClipWeight(clip);
    }

    static FADETYPE_NONE = 0;
    static FADETYPE_LINEAR = 1;
    static FADETYPE_QUADRATIC = 2;
    static FADETYPE_SINUSOID = 3;

    computeKeyframeClipWeight(clip, time = this.currentTime){
        let weight = 1;
        if( time < clip.start || time > (clip.start+clip.duration) ){
            weight =  0;
        }
        else if ( clip.fadeinType && time < clip.fadein ){
            weight = ( time - clip.start ) / (clip.fadein - clip.start);
            switch( clip.fadeinType ){
                case KeyframeEditor.FADETYPE_QUADRATIC:
                    weight = weight * weight;
                    break;
                case KeyframeEditor.FADETYPE_SINUSOID:
                    weight = Math.sin( weight * Math.PI - Math.PI * 0.5 ) * 0.5 + 0.5;
                    break;
            }
        }
        else if ( clip.fadeoutType && time > clip.fadeout ){
            weight = ( time - clip.fadeout ) / (clip.start + clip.duration - clip.fadeout);
            switch( clip.fadeoutType ){
                case KeyframeEditor.FADETYPE_QUADRATIC:
                    weight = weight * weight;
                    break;
                case KeyframeEditor.FADETYPE_SINUSOID:
                    weight = Math.sin( weight * Math.PI - Math.PI * 0.5 ) * 0.5 + 0.5;
                    break;
            }
            weight = 1-weight;
        }
        this.currentCharacter.mixer.clipAction( clip.mixerBodyAnimation ).setEffectiveWeight( weight * clip.weight );
        this.currentCharacter.mixer.clipAction( clip.mixerFaceAnimation ).setEffectiveWeight( weight * clip.weight );
    }

    setKeyframeClipBlendMode(clip, threejsBlendMode, updateMixer = true){
        if( updateMixer ){
            // uncache all actions of this clip, if they exist, before changing blendmode
            this.currentCharacter.mixer.uncacheClip(clip.mixerBodyAnimation); 
            this.currentCharacter.mixer.uncacheClip(clip.mixerFaceAnimation); 
        }
        const blendMode = threejsBlendMode ?? THREE.NormalAnimationBlendMode;
        clip.mixerBodyAnimation.blendMode = blendMode; 
        clip.mixerFaceAnimation.blendMode = blendMode;
        clip.blendMode = blendMode;

        if ( updateMixer ){
            this.globalAnimMixerManagementSingleClip(this.currentCharacter.mixer, clip);
        }
    }

    /**
     * 
     * @param {KeyFramestimeline} timeline will fetch the clip from the timeline.  
     * @param {Number} trackIdx if -1, updates the currently visible tracks only 
     * @returns 
     */
    updateFacePropertiesPanel(timeline, trackIdx = -1) {
        
        // update all visible tracks
        if(trackIdx == -1) {

            // timeline.selectedItems has ungrouped tracks and gorup names, but not tracks in the group. They must be fetched with tracksPerGroup
            // visibleItems contains ungrouped tracks, group ids and grouped tracks. If group id, no trackData will be present
            const visibleItems = timeline.getVisibleItems(); 
            for( let i = 0; i < visibleItems.length; ++i ){
                const track = visibleItems[i].treeData.trackData;
                if ( !track ){
                    continue;
                }
                const frame = timeline.getNearestKeyFrame(track, timeline.currentTime);
                if ( frame > -1 ){
                    LX.emit("@on_change_" + track.id, track.values[frame]);
                }
            }

            return;
        }

        // update only selected (or nearby) keyframe
        const track = timeline.animationClip.tracks[trackIdx];
        let frame = 0;
        if(timeline.lastKeyFramesSelected.length && timeline.lastKeyFramesSelected[0][0] == trackIdx) {
            frame = timeline.lastKeyFramesSelected[0][1];
        } 
        else {            
            frame = timeline.getNearestKeyFrame(track, timeline.currentTime);
        }

        if( frame > -1 ){
            LX.emit("@on_change_" + track.id, track.values[frame]);
        }
    }

    updateActionUnitsAnimation( auAnimation, editedTracksIdxs, editedAnimation = this.activeTimeline.animationClip ) {
        
        const auEditedTracksIdxs = [];
        for( let j = 0; j < editedTracksIdxs.length; j++ ) {
            const eIdx = editedTracksIdxs[j];
            const eTrack = editedAnimation.tracks[eIdx];        

            for( let t = 0; t < auAnimation.tracks.length; t++ ) {
                if( auAnimation.tracks[t].data && auAnimation.tracks[t].data.blendshapes.includes(eTrack.id) ) {
                    auEditedTracksIdxs.push(t);
                    auAnimation.tracks[t].values = new Float32Array(eTrack.values);
                    auAnimation.tracks[t].times = new Float32Array(eTrack.times);
                    //LX.emit("@on_cahnge"+ auAnimation.tracks[t].id);
                    //this.gui.updateActionUnitsPanel(auAnimation, t);
                    // break; // do not break, need to check all meshes that contain this blendshape
                }
            }           
        }
    }

    updateBlendshapesAnimation( bsAnimation, editedTracksIdxs, editedAnimation = this.activeTimeline.animationClip ) {
        let mapTrackIdxs = {};
        const bsEditedTracksIdxs = [];
        for( let j = 0; j < editedTracksIdxs.length; j++ ) {
            const eIdx = editedTracksIdxs[j];
            const eTrack = editedAnimation.tracks[eIdx];
            mapTrackIdxs[eIdx] = [];

            let bsNames = this.currentCharacter.config ? this.currentCharacter.config.faceController.blendshapeMap[eTrack.id] : this.currentCharacter.blendshapesManager.mapNames.characterMap[eTrack.id];
            if ( !bsNames ){ 
                continue; 
            }
            if(typeof(bsNames) == 'string') {
                bsNames = [[bsNames, 1.0]];
            }

            for( let b = 0; b < bsNames.length; b++ ) {
                for( let t = 0; t < bsAnimation.tracks.length; t++ ) {
                    if( bsNames[b].includes(bsAnimation.tracks[t].id) ) {
                        mapTrackIdxs[eIdx].push(t);
                        bsAnimation.tracks[t].values = new Float32Array(eTrack.values.map(v => v * bsNames[b][1]));
                        bsAnimation.tracks[t].times = new Float32Array(eTrack.times);
                        bsAnimation.tracks[t].active = eTrack.active;
                        bsEditedTracksIdxs.push(t);
                        const track = bsAnimation.tracks[t];
                        const frame = this.activeTimeline.getNearestKeyFrame(track, this.activeTimeline.currentTime);
                        LX.emit("@on_change_"+ track.id, track.values[frame]* bsNames[b][1]);
                        // break; // do not break, need to check all meshes that contain this blendshape
                    }
                }
            }
        }        
        this.updateMixerAnimation(this.currentKeyFrameClip.mixerFaceAnimation, bsEditedTracksIdxs, bsAnimation);
    }

       /**
     * This function updates the mixer animation actions so the edited tracks are assigned to the interpolants.
     * WARNING It uses the editedAnimation tracks directly, without cloning them.
     * Modifying the values/times of editedAnimation will also modify the values of mixer
     * @param {animation} editedAnimation for body it is the timeline skeletonAnimation. For face it is the timeline bsAnimation with the updated blendshape values
     * @param {Array of Numbers} trackIdxs
     * @returns 
     */

    updateMixerAnimation( mixerAnimation, editedTracksIdxs, editedAnimation = this.activeTimeline.animationClip, callSetTime = true ) {
        // for bones editedAnimation is the timeline skeletonAnimation
        // for blendshapes editedAnimation is the timeline bsAnimation
        const mixer = this.currentCharacter.mixer;
    
        if( !mixer._actions.length ) {
            return;
        }
    
        const action = mixer.clipAction(mixerAnimation);
        const isFaceAnim = mixerAnimation.name == "faceAnimation";

        const numEditedTracks = editedTracksIdxs ? editedTracksIdxs.length : editedAnimation.tracks.length;

        for( let i = 0; i < numEditedTracks; i++ ) {
            const eIdx = editedTracksIdxs ? editedTracksIdxs[i] : i;
            const eTrack = editedAnimation.tracks[eIdx]; // track of the edited animation
            
            let mIdxs = [ eIdx ];
            if( eTrack.data && eTrack.data.tracksIds ) { // if the edited animation is the BS animation, the tracks have to be mapped
                mIdxs = eTrack.data.tracksIds;
            }
            
            if( eTrack.locked || !mIdxs.length ) {
                continue;
            }

            for( let t = 0; t < mIdxs.length; t++ ) {

                const trackId = mIdxs[t];
                const interpolant = action._interpolants[trackId];                                           
                
                // THREEJS mixer uses interpolants to drive animations. _clip is only used on animationAction creation. 
                // _clip is the same clip (pointer) sent in mixer.clipAction. 

                const track = mixerAnimation.tracks[trackId];
                if( eTrack.active && eTrack.times.length ) {
                    interpolant.parameterPositions = track.times = new Float32Array(eTrack.times);
                    interpolant.sampleValues = track.values = new Float32Array(eTrack.values);
                }
                else {
                    interpolant.parameterPositions = track.times = [0];
                    if ( isFaceAnim ) {
                        interpolant.sampleValues = track.values = [0];
                    }
                    else {

                        if ( this.currentKeyFrameClip.blendMode == THREE.AdditiveAnimationBlendMode ){
                            if( track.dim == 4 ) {
                                interpolant.sampleValues = track.values = [0,0,0,1];
                            }
                            else {
                                interpolant.sampleValues = track.values = [0,0,0];
                            }
                        }else{
                            // TO DO optimize if necessary
                            let skeleton =this.currentCharacter.skeletonHelper.skeleton;
                            let invMats = this.currentCharacter.skeletonHelper.skeleton.boneInverses;
                            let boneIdx = findIndexOfBoneByName(skeleton, eTrack.groupId);
                            let parentIdx = findIndexOfBone(skeleton, skeleton.bones[boneIdx].parent);
                            let localBind = invMats[boneIdx].clone().invert();
    
                            if ( parentIdx > -1 ) { 
                                localBind.premultiply(invMats[parentIdx]); 
                            }
                            let p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
                            localBind.decompose( p,q,s );
                            // assuming quats and position only. Missing Scale
                            if( track.dim == 4 ) {
                                interpolant.sampleValues = track.values = q.toArray();//[0,0,0,1];
                            }
                            else if ( track.id == "position" ){
                                interpolant.sampleValues = track.values = p.toArray();//[0,0,0];
                            }
                            else{
                                interpolant.sampleValues = track.values = s.toArray();//[0,0,0];
                            }
                        }
                    } 

                }
            }
        }
    
        if ( callSetTime ){
            this.setTime( this.currentTime );
        }

        return;               
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
    
        this.selectedBone = name;

        this.gui.skeletonTimeline.setSelectedItems( [this.selectedBone] );

        // selectkeyframe at current keyframe if possible
        const track = this.gui.skeletonTimeline.animationClip.tracksPerGroup[this.selectedBone][0];
        if ( track ){
            const keyframe = this.gui.skeletonTimeline.getCurrentKeyFrame(track, this.gui.skeletonTimeline.currentTime, 0.1 );
            if ( keyframe > -1 ){
                this.gui.skeletonTimeline.processSelectionKeyFrame( track.trackIdx, keyframe, false );
            }
        }

        this.gizmo.setBone(name);
        this.gizmo.mustUpdate = true;

        this.gui.updateSkeletonPanel();
        if ( this.gui.treeWidget ){ 
            this.gui.treeWidget.innerTree.select(this.selectedBone);
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

        this.gui.auTimeline.setSelectedItems([au]);
        if(this.selectedAU == au) {
            return;
        }
        this.selectedAU = au;
        this.setTime(this.currentTime);
        
    }

/**
     * propagates the newValue using the editor.gui.propagationWindow attributes
     * It computes delta values which are weighted and added to each keyframe inside the window
     * @param {obj} timeline 
     * @param {int} trackIdx 
     * @param {quat || vec3 || number} newValue
     * @param {boolean} isDelta whether newValue is a delta or the final value. The latter will compute the proper delta based on the track's information 
     */
    propagateEdition( timeline, trackIdx, newValue, isDelta = false ){
        const propWindow = this.gui.propagationWindow;
        const time = propWindow.time;
        const track = timeline.animationClip.tracks[trackIdx];
        const values = track.values;
        const times = track.times;
        
        // which keyframes need to be modified
        let minFrame = timeline.getNearestKeyFrame(track, time - propWindow.leftSide, 1);
        let maxFrame = timeline.getNearestKeyFrame(track, time + propWindow.rightSide, -1);
        minFrame = minFrame == -1 ? times.length : minFrame;
        maxFrame = maxFrame == -1 ? 0 : maxFrame;
        
        let delta = newValue;

        if ( !isDelta ){
            let prevFrame = timeline.getNearestKeyFrame(track, time, -1);
            let postFrame = timeline.getNearestKeyFrame(track, time, 1);
            prevFrame = prevFrame == -1 ? 0 : prevFrame; // assuming length > 0 
            postFrame = postFrame == -1 ? prevFrame : postFrame; // assuming length > 0 

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
                delta.multiply(newValue); // computing delta in local space ( newValue = prevpose * delta )
            }
            else if ( track.dim == 3 ){
                delta = new THREE.Vector3();
                delta.x = newValue.x -( values[prevFrame*3] * (1-t) + values[postFrame*3] * t ); 
                delta.y = newValue.y -( values[prevFrame*3+1] * (1-t) + values[postFrame*3+1] * t ); 
                delta.z = newValue.z -( values[prevFrame*3+2] * (1-t) + values[postFrame*3+2] * t ); 
            }
            else if ( track.dim == 1 ){
                delta = newValue - (values[prevFrame] * (1-t) + values[postFrame] * t);
            }
        }
        
        let gradIdx = -1;
        let maxGradient=[1.0001, 0];
        let g0 = [0,0];
        let g1 = propWindow.gradient[0];
        const minTime = time - propWindow.leftSide;
        for( let i = minFrame; i <= maxFrame; ++i ){
            let t = (times[i] - minTime) / (propWindow.leftSide + propWindow.rightSide); // normalize time in window 
            
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
  
    // expects delta in local space ( newValue = prevPose * delta )
    _applyDeltaQuaternion( track, keyframe, delta, t ){
        const dim = track.dim;
        const newDelta = new THREE.Quaternion();
        const source = new THREE.Quaternion();

        // nlerp( {0,0,0,1}, deltaQuat, t )
        let neighbourhood = delta.w < 0 ? -1 : 1;
        newDelta.x = neighbourhood * delta.x * t;
        newDelta.y = neighbourhood * delta.y * t;
        newDelta.z = neighbourhood * delta.z * t;
        newDelta.w = (1-t) + neighbourhood * delta.w * t;
        newDelta.normalize();

        source.set(track.values[keyframe * dim], track.values[keyframe * dim + 1], track.values[keyframe * dim + 2], track.values[keyframe * dim + 3]);
        source.multiply( newDelta );

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
    updateBlendshapesProperties(name, value, callback) {
        if( this.state ){ return false; }

        value = Number(value);
        const time = this.activeTimeline.currentTime;

        const visibleItems = this.activeTimeline.getVisibleItems();
        for(let i = 0; i < visibleItems.length; i++) {
            const track = visibleItems[i].treeData.trackData;
            if (!track){
                continue;
            }
            if(track.id == name && track.active && !track.locked ){

                if ( track.times.length <= 0){ continue; }

                if ( this.gui.propagationWindow.enabler ){
                    this.propagateEdition(this.activeTimeline, track.trackIdx, value);

                    // Update animation action (mixer) interpolants.
                    callback( [track.trackIdx] );
                    
                }
                else{
                    const frameIdx = this.activeTimeline.getCurrentKeyFrame(track, time, 0.01)
                    if ( frameIdx > -1 ){
                        // Update Action Unit keyframe value of timeline animation
                        track.values[frameIdx] = value; // activeTimeline.animationClip == auAnimation               
                        track.edited[frameIdx] = true;               

                        // Update animation action (mixer) interpolants.
                        callback( [track.trackIdx] );
                    } 
                }
                return true;
            }
        }
        
    }

    /** ------------------------ Generate formatted data --------------------------*/

    /**
     * Computes the AnimationClip that would result from boundAnim through the animationFrameRate
     * Removes all clips from the mixer. User should call setGlobalAnimation(this.currentAnimation) after this funciton is called
     *  WARNING: the clip generated reuses the times array for all tracks. Any modification to that array will change for all tracks
     * @param {object} boundAnim 
     * @param {int} flags default exports body and face (0x03)
     *      0x01: include body
     *      0x02: include face (morphtargets)
     *           
     * @returns THREE.AnimationClip
     */
    generateExportAnimationData( boundAnim, flags = 0x03 ){
        const mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();
        while( mixer._actions.length ){
            mixer.uncacheClip( mixer._actions[0]._clip );
        }

        this.currentCharacter.skeletonHelper.skeleton.pose(); // set default pose for the mixer

		this.currentTime = 0; // manual set of time for clip management. WARNING: this creates a mismatch with UI
        this.globalAnimMixerManagement( mixer, boundAnim, false ); // set clips. Ignore currentSelecteKeyframeClip

        mixer.setTime( 0 );
        mixer.timeScale = 1;
        // remove unnecessary clips. 
        // TODO: A lot of hardcoding and unnecessary extra work.
        if ( flags != 0x03 ){
            for( let i = 0; i < mixer._actions.length; ++i ){
                if (!(flags & 0x01) && mixer._actions[i]._clip.name == "bodyAnimation" ){
                    mixer._actions[i].stop();
                }
                if (!(flags & 0x02) && mixer._actions[i]._clip.name == "faceAnimation" ){
                    mixer._actions[i].stop();
                }
            }
        }
        mixer.update( 0 );
        
        const numTimestamps = Math.floor( boundAnim.duration * this.animationFrameRate );
        
        let times = new Float32Array(numTimestamps);
        times.forEach( (v,i,arr) =>{ times[i] = i / this.animationFrameRate; } );

        let values = [];
        for( let i = 0; i < mixer._bindings.length; ++i ){
            const b = mixer._bindings[i].binding;
            if ( b.resolvedProperty.isVector3 ){
                values.push( new Float32Array(numTimestamps * 3) );
            }
            else if ( b.resolvedProperty.isQuaternion ){
                values.push( new Float32Array(numTimestamps * 4) );
            }
            else{
                values.push( new Float32Array(numTimestamps) );
            }
        }

        for( let t = 0; t < numTimestamps; ++t ){
            for( let i = 0; i < mixer._bindings.length; ++i ){
                const b = mixer._bindings[i].binding;
                const v = values[i];
                if ( b.resolvedProperty.isVector3 ){
                    let index = t * 3;
                    v[index++] = b.resolvedProperty.x;
                    v[index++] = b.resolvedProperty.y;
                    v[index] = b.resolvedProperty.z;
                }
                else if ( b.resolvedProperty.isQuaternion ){
                    let index = t * 4;
                    v[index++] = b.resolvedProperty.x;
                    v[index++] = b.resolvedProperty.y;
                    v[index++] = b.resolvedProperty.z;
                    v[index] = b.resolvedProperty.w;
                }
                else{
                    v[t] = b.resolvedProperty[b.propertyIndex];
                }
            }

            const dt = 1.0 / this.animationFrameRate;
			const tracks = boundAnim.tracks;
            for(let i = 0; i < tracks.length; ++i ){
                const clips = tracks[i].clips;
                for(let c = 0; c < clips.length; ++c ){
                    this.computeKeyframeClipWeight(clips[c], mixer.time + dt );
                }
            }
            mixer.update( dt );
        }

        // WARNING: reusing times array. Any modification to that array will change for all tracks
        let tracks = [];
        for( let i = 0; i < mixer._bindings.length; ++i ){
            const b = mixer._bindings[i].binding;
            if ( b.resolvedProperty.isVector3 ){
                tracks.push( new THREE.VectorKeyframeTrack(b.path, times, values[i]) );
            }
            else if ( b.resolvedProperty.isQuaternion ){
                tracks.push( new THREE.QuaternionKeyframeTrack(b.path, times, values[i]) );
            }
            else{
                tracks.push( new THREE.NumberKeyframeTrack(b.path, times, values[i]) );
            }
        }

        mixer.timeScale = this.playbackRate;
        
        // better to do this outside, so exporting several animations is more efficient
        // this.setGlobalAnimation( this.currentAnimation );

        return new THREE.AnimationClip(boundAnim.id, -1, tracks);
    }

    generateBVH( boundAnim, skeleton ) {
        let bvhPose = "";
        const bodyClip = this.generateExportAnimationData( boundAnim, 0x01 );
        const bodyAction = this.currentCharacter.mixer.clipAction( bodyClip );
        
        bvhPose = BVHExporter.export(bodyAction, skeleton, this.animationFrameRate);
        
        return bvhPose;
    }

    generateBVHE( boundAnim, skeleton ) {
        const bvhPose = this.generateBVH( boundAnim, skeleton );
        let bvhFace = "";
        // TODO probably could optimize this. It it is doing the generation twice
        const faceClip = this.generateExportAnimationData( boundAnim, 0x02 );
        const faceAction = this.currentCharacter.mixer.clipAction( faceClip );

        bvhFace += BVHExporter.exportMorphTargets(faceAction, this.currentCharacter.morphTargets, this.animationFrameRate);            

        return bvhPose + bvhFace;
    }
}

/**
 * This editor uses loadedAnimations to store global animations  
 * The boundAnimations variable stores only the mixer clips for each character. As BML is universal, there is no need for each character to hold its own bml animation
 */
class ScriptEditor extends Editor { 
    constructor( animics ) {
        super(animics);

        this.dominantHand = "Right";
        
        this.onDrawTimeline = null;
	    this.onDrawSettings = null;

        // Create GUI
        this.gui = new ScriptGui(this);
        this.localStorage = [{ id: "Local", type:"folder", children: [ {id: "presets", type:"folder", children: []}, {id: "signs", type:"folder", children: []}]} ];
    }

    onKeyDown( event ) {
        switch( event.key ) {
            case 'e': case 'E': // Export animation/s
                if( event.ctrlKey ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.gui.showExportAnimationsDialog("Export animations", ( info ) => {
                        this.export( info.selectedAnimations, info.format );
                    }, {formats: ["BVH", "BVH extended", "GLB"], selectedFormat: "BVH extended"});
                }
            break;

            case 'b': case 'B': // Add behaviour clips
                if( event.ctrlKey ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.gui.createClipsDialog();
                }
            break;
        }
    }

    undo() {
        
        if ( !this.activeTimeline.historyUndo.length ){
            LX.toast(`${this.activeTimeline.timelineTitle} Undo`, `No more changes to undo. Remaining Undo steps: ${this.activeTimeline.historyUndo.length} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }else{
            LX.toast(`${this.activeTimeline.timelineTitle} Undo`, `Remaining Undo steps: ${this.activeTimeline.historyUndo.length-1} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }
        this.activeTimeline.undo();
        this.gui.updateClipPanel();
    }

    redo() {
        if ( !this.activeTimeline.historyRedo.length ){
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `No more changes to Redo. Remaining Redo steps: ${this.activeTimeline.historyRedo.length} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }else{
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `Remaining Redo steps: ${this.activeTimeline.historyRedo.length-1} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }

        this.activeTimeline.redo();
        this.gui.updateClipPanel();
    }

    async initCharacters( modelToLoad ) {
    
        // Load current character
        await this.loadCharacter(modelToLoad[0], modelToLoad[1], modelToLoad[2], modelToLoad[3]);
    }

    setGlobalAnimation( name ){

        if( !this.loadedAnimations[name] ){
            return false;
        }

        const mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();
        while( mixer._actions.length ){
            mixer.uncacheClip( mixer._actions[0]._clip );
        }

        this.gui.clipsTimeline.deselectAllElements();

        this.gui.clipsTimeline.setAnimationClip( this.loadedAnimations[name].scriptAnimation, false );
        this.currentAnimation = name;

        if (!this.boundAnimations[name] || !this.boundAnimations[name][this.currentCharacter]){
            this.bindAnimationToCharacter( name );
        }else{
            this.updateMixerAnimation( this.loadedAnimations[name].scriptAnimation );
        }

        this.gui.createSidePanel();
        this.gui.clipsTimeline.updateHeader();
        this.gui.clipsTimeline.visualOriginTime = - ( this.gui.clipsTimeline.xToTime(100) - this.gui.clipsTimeline.xToTime(0) ); // set horizontal scroll to 100 pixels 


        return true;
    }

    renameGlobalAnimation( currentName, newName, findSuitableName = false ){

        if (findSuitableName){
            let count = 1;
            let countName = newName;
            while( this.boundAnimations[countName] ){ // boundAnimations and loadedAnimations should have the same keys: the animation names
                countName = newName + ` (${count++})`;
            }
            newName = countName;
        }else{
            if (this.boundAnimations[newName] ){
                return null;
            }
        }

        if ( !this.boundAnimations[newName] ){
            this.boundAnimations[newName] = {};
        }

        const bound = this.boundAnimations[currentName];
        this.boundAnimations[newName] = bound;
        for( let charactername in bound ){
            bound[charactername].id = newName;
        }
        delete this.boundAnimations[currentName];


        this.loadedAnimations[newName] = this.loadedAnimations[currentName];
        this.loadedAnimations[newName].name = newName;
        this.loadedAnimations[newName].scriptAnimation.id = newName;
        delete this.loadedAnimations[currentName];


        if ( this.currentAnimation == currentName ){
            this.currentAnimation = newName;
        }

        return newName;
    }

    async processPendingResources( settings = {} ) {
        if( !settings.pendingResources ) {
            this.loadAnimation("new animation", {});
            return true;
        }
        
        // TO DO
        const loaded = await this.loadFiles(settings.pendingResources);
        if( !loaded ) {
            await this.processPendingResources();
        }
    }

    async loadFiles( files ) {
        const formats = ['json', 'bml', 'sigml'];
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
                            const lastAnimation = this.currentAnimation;
                            delete this.loadedAnimations[lastAnimation];
                            delete this.boundAnimations[lastAnimation];
                            this.loadAnimation( file.name, animation );
                            resolve(file.animation);
                            UTILS.hideLoading();
                        }
                        else {
                            UTILS.hideLoading()
                            this.gui.prompt = new LX.Dialog("Import animation" , ( panel ) => {
                                panel.addTextArea("", "There is already an animation. What do you want to do?", null, {hideName: true, disabled: true, resize: false, fitHeight: true, className: "nobg"});
                                panel.sameLine(3);
                                panel.addButton(null, "New animation", () => { 
                                    this.loadAnimation( file.name, animation );
                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();
                                }, { buttonClass: "accent", width: "33%" });

                                panel.addButton(null, "Concatenate", () => { 
                                    this.gui.loadBMLClip( animation );
                                    this.updateMixerAnimation( this.loadedAnimations[this.currentAnimation].scriptAnimation );
                                    this.setTime(this.currentTime); // force a mixer.update
                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();

                                }, { buttonClass: "accent", width: "33%" });

                                panel.addButton(null, "Cancel", () => { 
                                    this.gui.prompt.close();
                                    resolve();
                                    UTILS.hideLoading();
                                }, { width: "33%" });
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

        let extensionIdx = name.lastIndexOf(".");
        if ( extensionIdx != -1 ){
            name = name.substr(0, extensionIdx);
        }

        let count = 1;
        let countName = name;
        while ( this.loadedAnimations[countName] ){
            countName = name + ` (${count++})`;
        }
        name = countName;

        // implicit setglobalAnimation
        const animationClip = this.gui.clipsTimeline.setAnimationClip({id: name}, true); //generate empty animation 
        this.gui.loadBMLClip(animationData); // process bml and add clips

        this.loadedAnimations[name] = {
            name: name,
            export: true,
            scriptAnimation: animationClip, 
            type: "script"
        };
        this.gui.clipsTimeline.updateHeader();
        this.setGlobalAnimation( name );        
    }

    /**
     * ScriptEditor: fetches a loaded animation and applies it to the character. The first time an animation is bound, it is processed and saved. Afterwards, this functino just changes between existing animations 
     * @param {String} animationName 
    */    
    bindAnimationToCharacter( animationName ) {
        
        const animation = this.loadedAnimations[animationName];
        if( !animation ) {
            console.warn(animationName + " not found");
            return false;
        }

        if( !this.boundAnimations[animationName] ) {
            this.boundAnimations[animationName] = {};
        }
        
        this.boundAnimations[animationName][this.currentCharacter.name] = { 
            mixerAnimation: null,

            source: animation,
            id: animationName,
        };
    
        this.updateMixerAnimation( animation.scriptAnimation );
        this.gui.updateAnimationPanel();
        return true;
    }

    /**
     * Updates current mixer and mixerAnimation with the timeline animationClip
     * @param {ClipTimeline animationClip} animation 
     */
    updateMixerAnimation(animation) {
        // Remove current animation clip
        let mixer = this.currentCharacter.mixer;
        mixer.stopAllAction();

        while (mixer._actions.length) {
            mixer.uncacheAction(mixer._actions[0]._clip); // removes action
        }

        let mixerAnimation = this.currentCharacter.bmlManager.createAnimationFromBML(animation, this.animationFrameRate);
        mixerAnimation.name = this.currentAnimation;
        mixer.clipAction(mixerAnimation).setEffectiveWeight(1.0).play();
        mixer.setTime(this.currentTime / mixer.timeScale);
        
        this.boundAnimations[this.currentAnimation][this.currentCharacter.name].mixerAnimation = mixerAnimation;    
    }
    
    updateTracks() {

        const animationData = this.getCurrentAnimation();
        animationData.scriptAnimation = this.activeTimeline.animationClip;
       
        this.updateMixerAnimation(animationData.scriptAnimation);
    }

    clearAllTracks( showConfirmation = true ) {
        if( !this.activeTimeline.animationClip ) {
            return;
        }
        
        const clearTracks = () => {
            for( let i = 0; i < this.activeTimeline.animationClip.tracks.length; ++i ) {

                const track = this.activeTimeline.animationClip.tracks[i];
                this.activeTimeline.clearTrack(track.trackIdx);
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

    generateBML( animationName = null ) {
        const animation = animationName ? this.loadedAnimations[animationName] : this.getCurrentAnimation();
        const data = animation.scriptAnimation;

        const json =  {
            behaviours: [],
            //indices: [],
            name : animation ? animation.name : "BML animation",
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
                        json.behaviours.push( clips );
                    }
                }
            }
        }

        return json;
    }
    
    generateBVH( boundAnim, skeleton ) {
        const action = this.currentCharacter.mixer.clipAction(boundAnim.mixerAnimation);
        if(!action) {
            return "";
        }
        return BVHExporter.export(action, skeleton, this.animationFrameRate); 
    }

    generateBVHE( boundAnim, skeleton) {
        const bvhPose = this.generateBVH( boundAnim, skeleton );
        const action = this.currentCharacter.mixer.clipAction(boundAnim.mixerAnimation);
        
        let bvhFace = "";
        if( action ) {
            bvhFace += BVHExporter.exportMorphTargets(action, this.currentCharacter.morphTargets, this.animationFrameRate);            
        }
        return bvhPose + bvhFace;
    }

}

export { KeyframeEditor, ScriptEditor }