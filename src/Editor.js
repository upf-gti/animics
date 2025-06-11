import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js' 
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { BVHExporter } from "./exporters/BVHExporter.js";
import { createAnimationFromRotations, createEmptySkeletonAnimation } from "./skeleton.js";
import { KeyframesGui, ScriptGui } from "./Gui.js";
import { Gizmo } from "./Gizmo.js";
import { UTILS } from "./Utils.js"
import { NN } from "./ML.js"
import { OrientationHelper } from "./libs/OrientationHelper.js";
import { AnimationRetargeting, findIndexOfBone, findIndexOfBoneByName } from './retargeting.js'
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
    static PERFORMS_PATH = "https://performs.gti.upf.edu/";
    
    constructor( animics ) {
        
        this.character = "ReadyVictor";

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
        await this.initCharacters();

        if( settings.pendingResources ) {
            UTILS.makeLoading("Loading files...");
        }
        else {
            UTILS.makeLoading("Preparing scene...");
        }

        this.gui.init(showGuide);

        await this.processPendingResources(settings.pendingResources);

        this.enable();
        this.bindEvents();
        
        this.animate();
        
        
        if(settings.capture) {
            this.captureVideo();
        }
        else {
            UTILS.hideLoading();
        }

        window.onbeforeunload =  (e) => {
            e.preventDefault();
            e.returnValue = "";
            window.stop();
            return "Be sure you have exported the animation. If you exit now, your data will be lost."
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

    async initCharacters() {
      
        // Load current character
        await this.loadCharacter(this.character);
        
        // while(!this.loadedCharacters[this.character] ) {
        //     await new Promise(r => setTimeout(r, 1000));            
        // }        

    }

    async loadCharacter(characterName) {

        let modelName = characterName.split("/");
        UTILS.makeLoading("Loading GLTF [" + modelName[modelName.length - 1] +"]...")

        // Load the target model (Eva)
        return new Promise( resolve => {
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
                        resolve();
                    })
                }
                else {
                    this.loadedCharacters[characterName].blendshapesManager = new BlendshapesManager(skinnedMeshes, morphTargets, this.mapNames);
                    this.changeCharacter(characterName);
                    resolve();
                }
    
            });
        })
    }

    async changeCharacter(characterName) {
        // Check if the character is already loaded
        if( !this.loadedCharacters[characterName] ) {
            console.warn(characterName + " not loaded");
            await this.loadCharacter(characterName);
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
    
                            const playElement = this.gui.menubar.getButton("Play");
                            if ( playElement ){ 
                                playElement.children[0].children[0].click();
                            }
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

        const dt = this.clock.getDelta();
        if (this.enabled){
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

        if ( this.currentTime > (this.startTimeOffset + this.activeTimeline.duration) ) {
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
			this.gui.menubar.getButton("Play").setState(false);
            this.activeTimeline.setState(false);
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

        this.onSetTime(t);
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
    
    // TODO FIX WITH NEW SYSTEM OF MULTICLIP
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
                    const boundAnim = this.boundAnimations[animation.name][this.currentCharacter.name];
                    let animSaveName = animation.saveName;
                    
                    let tracks = []; 
                    if(boundAnim.mixerBodyAnimation) {
                        tracks = tracks.concat( boundAnim.mixerBodyAnimation.tracks );
                    }
                    if(boundAnim.mixerFaceAnimation) {
                        tracks = tracks.concat( boundAnim.mixerFaceAnimation.tracks );
                    }
                    if(boundAnim.mixerAnimation) {
                        tracks = tracks.concat( boundAnim.mixerAnimation.tracks );
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
            {
                let skeleton = this.currentCharacter.skeletonHelper.skeleton;
                const fileType = "text/plain";

                for( let a in animsToExport ) { // can be an array of loadedAnimations, or an object with animations (loadedAnimations itself)
                    const animation = animsToExport[a];
                    const boundAnim = this.boundAnimations[animation.name][this.currentCharacter.name];
                                        
                    // Check if it already has extension
                    let clipName = name || animation.saveName;

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
                const json = this.generateBML();
                if( !json ) {
                    return [];  
                }

                let clipName = (name || json.name) + '.bml';
                const fileType = "application/json";
                if( download ) {
                    UTILS.download(JSON.stringify(json), clipName, fileType);
                }
                else {
                    files.push( {name: clipName, data: UTILS.dataToFile(JSON.stringify(json), clipName, fileType)} );
                }
                break;
    
        }
        // bvhexport sets avatar to bindpose. Avoid user seeing this
        this.bindAnimationToCharacter(this.currentAnimation);
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
                setTimeout(() => this._realizer.postMessage(data, "*"), 1000); // wait a while to have the page loaded (onloaded has CORS error)                
            }
            else {
                this._realizer.focus();                
                this._realizer.postMessage(data, "*");
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
    onPlay() {} // Abstract
    onStop() {} // Abstract
    onPause() {} // Abstract
    onSetTime() {} // Abstract
    clearAllTracks() {} // Abstract
    updateMixerAnimation(animation, idx, replace = false) {}
    setTimeline(type) {};

    processPendingResources(resources) {} // Abstract
}


/**
 * This editor uses loadedAnimations to store loaded files and video-animations. 
 * The global animations are stored in boundAnimations, each avatar having its own animationClip as keyframes are meaningful only to a single avatar
 */
class KeyframeEditor extends Editor { 
    
    constructor( animics ) {
                
        super(animics);

        this.currentKeyFrameClip = null; // animation shown in the keyframe timelines

        this.animationInferenceModes = {NN: 0, M3D: 1}; // either use ML or mediapipe 3d approach to generate an animation (see buildanimation and bindanimation)
        this.inferenceMode = new URLSearchParams(window.location.search).get("inference") == "NN" ? this.animationInferenceModes.NN : this.animationInferenceModes.M3D;

        this.defaultTranslationSnapValue = 0.1;
        this.defaultRotationSnapValue = 30; // Degrees
        this.defaultScaleSnapValue = 1;

        this.showSkeleton = true;
        this.gizmo = null;

        this.applyRotation = false; // head and eyes rotation
        this.selectedAU = "Brow Left";
        this.selectedBone = null;
        
        if ( this.inferenceMode == this.animationInferenceModes.NN ){
            this.nn = new NN("data/ML/model.json");
            this.nnSkeleton = null;
        }

        this.retargeting = null;
        
        this.mapNames = {characterMap: json.faceController.blendshapeMap, mediapipeMap: MapNames.mediapipe, parts:  MapNames.parts};

        // Create GUI
        this.gui = new KeyframesGui(this);

        this.animationModes = {GLOBAL: 0, BODY: 1, FACEBS: 2, FACEAU: 3 };
        this.animationMode = this.animationModes.BODY;

        this.localStorage = [{ id: "Local", type:"folder", children: [ {id: "clips", type:"folder", children: []}]}];
    }

    onKeyDown( event ) {
        switch( event.key ) {

            case 'w': case 'W': // Show/hide propagation window
                if ( !document.activeElement || document.activeElement.value === undefined ){
                    this.gui.propagationWindow.toggleEnabler();
                    if( this.gui.propagationWindow.enabler ){
                        this.gui.skeletonTimeline.unSelectAllKeyFrames();
                        this.gui.auTimeline.unSelectAllKeyFrames();
                        this.gui.bsTimeline.unSelectAllKeyFrames();
                    }
                }
            break;

            case 'e': case 'E': // Export animation/s
                if( event.ctrlKey ) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.gui.showExportAnimationsDialog("Export animations", ( info ) => {
                        this.export( this.getAnimationsToExport(), info.format );
                    }, {formats: ["BVH", "BVH extended", "GLB"], selectedFormat: "BVH extended"});
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
    }

    redo() {
        if ( !this.activeTimeline.historyRedo.length ){
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `No more changes to Redo. Remaining Redo steps: ${this.activeTimeline.historyRedo.length} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }else{
            LX.toast(`${this.activeTimeline.timelineTitle} Redo`, `Remaining Redo steps: ${this.activeTimeline.historyRedo.length-1} / ${this.activeTimeline.historyMaxSteps}`, { timeout: 5000 });
        }
        this.activeTimeline.redo();
    }

    async initCharacters() {
        // Create gizmo
        this.gizmo = new Gizmo(this);

        // Load current character
        await this.loadCharacter(this.character);
        
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

        this.gui.globalTimeline.setAnimationClip( this.boundAnimations[name][this.currentCharacter.name], false );
        this.currentAnimation = name;
        this.currentKeyFrameClip = null;
        this.globalAnimMixerManagement(mixer, this.boundAnimations[name][this.currentCharacter.name], true);
        this.gui.createSidePanel();
        this.gui.globalTimeline.updateHeader(); // a bit of an overkill

        return alreadyExisted;
    }

    renameGlobalAnimation( currentName, newName, findSuitableName = false ){

        const characterName = this.currentCharacter.name;

        if (findSuitableName){
            let count = 1;
            let countName = newName;
            while( this.boundAnimations[countName] && this.boundAnimations[countName][characterName] ){
                countName = newName + ` (${count++})`;
            }
            newName = countName;
        }else{
            if (this.boundAnimations[newName] && this.boundAnimations[newName][characterName]){
                return null;
            }
        }

        if ( !this.boundAnimations[newName] ){
            this.boundAnimations[newName] = {};
        }

        const bound = this.boundAnimations[currentName];
        this.boundAnimations[newName] = bound;
        for( let avatarname in bound ){
            bound[avatarname].id = newName;
        }
        delete this.boundAnimations[currentName];

        if ( this.currentAnimation == currentName ){
            this.currentAnimation = newName;
        }

        this.gui.globalTimeline.updateHeader(); // a bit of an overkill

        return newName;
    }

    async processPendingResources( resources ) {
        this.setGlobalAnimation("new animation"); // TODO remove

        if( !resources ) {
            this.selectedBone = this.currentCharacter.skeletonHelper.bones[0].name;
            
            // this.setGlobalAnimation( "new animation" );
            this.loadAnimation("new animation", {} );
            return true;
        }
        
        const loaded = await this.loadFiles(resources);
        if( !loaded ) {
            await this.processPendingResources();
            this.gui.highlightSelector();
        }
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
                                for(let f = 0; f < file.animation.length; f++ ) {
                                    // TODO uncomment
                                    // const globalAnim = this.createGlobalAnimation( file.animation[f].name, 1 ); // find new name if it already exists
                                    // this.setGlobalAnimation( globalAnim.id );
                                    this.loadAnimation( file.animation[f].name, file.animation[f] );
                                }
                                resolve(file.animation[0]);
                            }
                            else {
                                // TODO uncomment
                                // const globalAnim = this.createGlobalAnimation( file.name, 1 ); // find new name if it already exists
                                // this.setGlobalAnimation( globalAnim.id );
                                this.loadAnimation( file.name, file.animation );
                                resolve(file.animation);
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
                for( let i = 0; i < animations.length; i++ ) {
                    // TODO uncomment
                    // const globalAnim = this.createGlobalAnimation( animations[i].name, 1 ); // find new name if it already exists
                    // this.setGlobalAnimation( globalAnim.id );
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

        // TODO uncomment
        // const globalAnim = this.createGlobalAnimation( animation.name, 1 ); // find new name if it already exists
        // this.setGlobalAnimation( globalAnim.name );
        this.buildAnimation(animation);        
    }

    /**Create face and body animations from mediapipe and load character*/
    buildAnimation(data, bindToCurrentGlobal = true) {

        // ensure unique name
        let count = 1;
        let countName = data.name;
        while( this.loadedAnimations[countName] ){
            countName = data.name + ` (${count++})`;
        }
        data.name = countName;

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
    loadAnimation(name, animationData, bindToCurrentGlobal = true) {

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
            type: "bvh"
        };

        if ( bindToCurrentGlobal ){
            this.bindAnimationToCharacter(name);
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
    
                // world mediapipe bone direction to local space
                dirPred.subVectors( landmarkTrg, landmarkSrc );
                dirPred.applyQuaternion( invWorldQuat ).normalize();
    
                // avatar bone local space direction
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
            This would avoid unnecessary recomputations of constraints between different avatars.
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
            let invWorldQuat = new THREE.Quaternion();
    
            tempVec3_1.subVectors(handLandmarks[5], handLandmarks[0]).normalize();
            tempVec3_2.subVectors(handLandmarks[17], handLandmarks[0]).normalize();
            const handForward = (new THREE.Vector3()).addScaledVector(tempVec3_1,0.5).addScaledVector(tempVec3_2,0.5);
            const handNormal = (new THREE.Vector3()).crossVectors(tempVec3_2,tempVec3_1).normalize();
            const handSide = (new THREE.Vector3()).crossVectors(handNormal,handForward).normalize();
            if ( isLeft ){
                handNormal.multiplyScalar(-1);
                handSide.multiplyScalar(-1);
            }
    
            const prevForward = new THREE.Vector3();
            const prevNormal = new THREE.Vector3();
            const prevSide = new THREE.Vector3();
    
            const maxLateralDeviation = 0.174; // cos(80º)
    
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
                const quatLatDev = new THREE.Quaternion();
                quatLatDev.setFromAxisAngle( handNormal, Math.acos(meanSideDeviation) - Math.PI*0.5);
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
        
                    boneSrc.matrixWorld.decompose( tempVec3_1, invWorldQuat, tempVec3_1 );
                    invWorldQuat.invert();
        
                    // world mediapipe phalange direction
                    let v_phalange = new THREE.Vector3();
                    v_phalange.subVectors( handLandmarks[landmark+1], handLandmarks[landmark] ).normalize();
    
                    // fingers (no thumb)
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
    
                        // apply lateral deviation (not as simple as adding side*meanSideDeviation)
                        v_phalange.applyQuaternion(quatLatDev);
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
    
                    // world phalange direction to local space
                    v_phalange.applyQuaternion( invWorldQuat ).normalize();
        
                    // avatar bone local space direction
                    let phalange_p = boneTrg.position.clone().normalize();
        
                    // move bone to predicted direction
                    const rot = new THREE.Quaternion();
                    const twist = new THREE.Quaternion();
                    rot.setFromUnitVectors( phalange_p, v_phalange );
                    getTwistQuaternion( rot, phalange_p, twist ); // remove undesired twist from phalanges
                    boneSrc.quaternion.multiply( rot ).multiply( twist.invert() ).normalize();
                }// end of phalange for
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
     */
    bindAnimationToCharacter(animationName) {
        
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
                let retargeting = new AnimationRetargeting(skeleton, this.currentCharacter.skeletonHelper.skeleton, { trgEmbedWorldTransforms: true } ); // both skeletons use their native bind pose
                const oldDuration = bodyAnimation.duration;
                bodyAnimation = retargeting.retargetAnimation(bodyAnimation);
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
            this.validateFaceAnimationClip(faceAnimation);
            
            bsAnimation = this.currentCharacter.blendshapesManager.createBlendshapesAnimation( faceAnimation ); // blendhsapes timeline            
            bsAnimation.duration = faceAnimation.duration;
            bsAnimation = this.gui.bsTimeline.instantiateAnimationClip( bsAnimation ); // generate default animationclip or process the user's one;
        }
        
        const boundAnimation = {
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
            blendMode: THREE.NormalAnimationBlendMode
        }
        this.setKeyframeClipBlendMode( boundAnimation, THREE.NormalAnimationBlendMode, false );

        const mixer = this.currentCharacter.mixer;
        this.globalAnimMixerManagementSingleClip(mixer, boundAnimation);

        this.gui.globalTimeline.addClip(boundAnimation);
        
        this.setTime(this.currentTime); // update mixer state
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
    validateFaceAnimationClip( animation ) {

        let tracks = animation.tracks;
        let blendshapes = this.currentCharacter.morphTargets;

        let bsCheck = new Array(blendshapes.length);
        bsCheck.fill(false);

        const allMorphTargetDictionary = {};
        // ensure each track has at least one valid entry. Default to current avatar pose
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
        if(visibility && this.currentKeyFrameClip && this.currentKeyFrameClip.source.type == "video") {
            this.gui.showVideoOverlay(needsMirror);
            this.gui.computeVideoArea( this.currentKeyFrameClip.source.rect ?? { left:0, top:0, width: 1, height: 1 } );
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

        if ( this.currentTime > (this.startTimeOffset + this.activeTimeline.duration) ) {
            this.onAnimationEnded();
        }

        if ( this.currentCharacter.mixer && this.state ) {

            const tracks = this.gui.globalTimeline.animationClip.tracks;
            for(let i = 0; i < tracks.length; ++i ){
                const clips = tracks[i].clips;
                for(let c = 0; c < clips.length; ++c ){
                    this.computeKeyframeClipWeight(clips[c]);
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

    onSetTime( t ) {
        // Update video
        if( this.currentKeyFrameClip && this.currentKeyFrameClip.source.type == "video" ) {
            this.video.currentTime = this.video.startTime + t - this.currentKeyFrameClip.start;
        }
        
        this.globalAnimMixerManagement(this.currentCharacter.mixer, this.gui.globalTimeline.animationClip);

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
    setTimeline(type) {
       
        // hide previous timeline
        if(this.activeTimeline) {
            this.activeTimeline.hide();
        }

        switch(type) {
            case this.animationModes.FACEBS:
                this.animationMode = this.animationModes.FACEBS;
                this.activeTimeline = this.gui.bsTimeline;

                if( this.gizmo ) { 
                    this.gizmo.disable();
                }
                break;

            case this.animationModes.FACEAU:
                this.animationMode = this.animationModes.FACEAU;
                this.activeTimeline = this.gui.auTimeline;
                this.setSelectedActionUnit(this.selectedAU);                    
                
                if( this.gizmo ) { 
                    this.gizmo.disable();
                }
                break;
               
            case this.animationModes.BODY:
                this.animationMode = this.animationModes.BODY;
                this.activeTimeline = this.gui.skeletonTimeline;                
                this.setSelectedBone(this.selectedBone); // select bone in case of change of animation

                if( this.gizmo ) {
                    this.gizmo.enable();
                }
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
                if( this.gizmo ) { 
                    this.gizmo.disable();
                }
                this.video.sync = false;
                this.setVideoVisibility(false);
                break;
        }


        
        this.activeTimeline.setTime(this.currentTime - this.startTimeOffset, true);
        this.activeTimeline.show();
    }

    globalAnimMixerManagement(mixer, animation, rebuildActions = false){
        for( let t = 0; t < animation.tracks.length; ++t ){
            const track = animation.tracks[t];
            for( let c = 0; c < track.clips.length; ++c ){
                const clip = track.clips[c];
                this.globalAnimMixerManagementSingleClip(mixer, clip);
            }
        }
    }
    globalAnimMixerManagementSingleClip(mixer, clip, rebuildActions = false ){
        const actionBody = mixer.clipAction(clip.mixerBodyAnimation); // either create or fetch
        actionBody.reset().play();
        actionBody.clampWhenFinished = false;
        actionBody.loop = THREE.LoopOnce;
        actionBody.startAt(clip.start);
        const actionFace = mixer.clipAction(clip.mixerFaceAnimation); // either create or fetch
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

    computeKeyframeClipWeight(clip){
        let weight = 1;
        if( this.currentTime < clip.start || this.currentTime > (clip.start+clip.duration) ){
            weight =  0;
        }
        else if ( clip.fadeinType && this.currentTime < clip.fadein ){
            weight = ( this.currentTime - clip.start ) / (clip.fadein - clip.start);
            switch( clip.fadeinType ){
                case KeyframeEditor.FADETYPE_QUADRATIC:
                    weight = weight * weight;
                    break;
                case KeyframeEditor.FADETYPE_SINUSOID:
                    weight = Math.sin( weight * Math.PI - Math.PI * 0.5 ) * 0.5 + 0.5;
                    break;
            }
        }
        else if ( clip.fadeoutType && this.currentTime > clip.fadeout ){
            weight = ( this.currentTime - clip.fadeout ) / (clip.start + clip.duration - clip.fadeout);
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

            let bsNames = this.currentCharacter.blendshapesManager.mapNames.characterMap[eTrack.id];
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

    updateMixerAnimation( mixerAnimation, editedTracksIdxs, editedAnimation = this.activeTimeline.animationClip ) {
        // for bones editedAnimation is the timeline skeletonAnimation
        // for blendshapes editedAnimation is the timeline bsAnimation
        const mixer = this.currentCharacter.mixer;
    
        if( !mixer._actions.length ) {
            return;
        }
    
        const action = mixer.clipAction(mixerAnimation);
        const isFaceAnim = mixerAnimation.name == "faceAnimation";

        for( let i = 0; i < editedTracksIdxs.length; i++ ) {
            const eIdx = editedTracksIdxs[i];
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
    
        
        this.setTime( this.currentTime );
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
                delta.premultiply(newValue);
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

    generateBVH( boundAnim, skeleton ) {
        let bvhPose = "";
        let bodyAction = this.currentCharacter.mixer.existingAction(boundAnim.mixerBodyAnimation);
        
        if( !bodyAction && boundAnim.mixerBodyAnimation ) {
            bodyAction = this.currentCharacter.mixer.clipAction(boundAnim.mixerBodyAnimation);     
        }
        
        bvhPose = BVHExporter.export(bodyAction, skeleton, this.animationFrameRate);
        
        return bvhPose;
    }

    generateBVHE( boundAnim, skeleton ) {
        const bvhPose = this.generateBVH( boundAnim, skeleton );
        let bvhFace = "";
        let faceAction = this.currentCharacter.mixer.existingAction(boundAnim.mixerFaceAnimation);

        if( faceAction ) {
            bvhFace += BVHExporter.exportMorphTargets(faceAction, this.currentCharacter.morphTargets, this.animationFrameRate);            
        }
        return bvhPose + bvhFace;
    }
}

/**
 * This editor uses loadedAnimations to store global animations  
 * The boundAnimations variable stores only the mixer clips for each avatar. As BML is universal, there is no need for each avatar to hold its own bml animation
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
                        this.export( this.getAnimationsToExport(), info.format );
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

    async initCharacters()
    {
        // Load current character
        await this.loadCharacter(this.character);

        // while(!this.loadedCharacters[this.character] || !this.loadedCharacters[this.character].bmlManager.ECAcontroller) {
        //     await new Promise(r => setTimeout(r, 1000));            
        // }  
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
                            this.activeTimeline.setTime(0, true);
                            this.clipName = animation.name;
                            this.gui.loadBMLClip( animation );
                            this.loadAnimation( file.name, animation );

                            resolve(file.animation);
                            UTILS.hideLoading();
                        }
                        else {
                            UTILS.hideLoading()
                            this.gui.prompt = new LX.Dialog("Import animation" , ( panel ) => {
                                panel.addTextArea("", "There is already an animation. What do you want to do?", null, {disabled: true,  className: "nobg"});
                                panel.sameLine(3);
                                panel.addButton(null, "Replace", () => { 
                                    this.clearAllTracks(false);
                                    this.clipName = animation.name;
                                    this.activeTimeline.setTime(0, true);
                                    this.gui.loadBMLClip( animation );
                                    this.loadAnimation( file.name, animation );
                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();
                                }, { buttonClass: "accept" });

                                panel.addButton(null, "Concatenate", () => { 
                                    this.gui.loadBMLClip( animation );
                                    this.gui.prompt.close();
                                    resolve(file.animation);
                                    UTILS.hideLoading();

                                }, { buttonClass: "accept" });

                                panel.addButton(null, "Cancel", () => { 
                                    this.gui.prompt.close();
                                    resolve();
                                    UTILS.hideLoading();
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
     * ScriptEditor: fetches a loaded animation and applies it to the character. The first time an animation is bound, it is processed and saved. Afterwards, this functino just changes between existing animations 
     * @param {String} animationName 
    */    
    bindAnimationToCharacter( animationName ) {
        
        const animation = this.loadedAnimations[animationName];
        if( !animation ) {
            console.warn(animationName + " not found");
            return false;
        }

        if ( animationName != this.currentAnimation ) {
            this.gui.clipsTimeline.setTime(0, true);
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