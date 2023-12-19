import * as THREE  from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterController } from './CharacterController.js';
import { sigmlStringToBML } from './SigmlToBML.js';



// Correct negative blenshapes shader of ThreeJS
THREE.ShaderChunk[ 'morphnormal_vertex' ] = "#ifdef USE_MORPHNORMALS\n	objectNormal *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n	    objectNormal += getMorph( gl_VertexID, i, 1, 2 ) * morphTargetInfluences[ i ];\n		}\n	#else\n		objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];\n		objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];\n		objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];\n		objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_pars_vertex' ] = "#ifdef USE_MORPHTARGETS\n	uniform float morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];\n		uniform sampler2DArray morphTargetsTexture;\n		uniform vec2 morphTargetsTextureSize;\n		vec3 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset, const in int stride ) {\n			float texelIndex = float( vertexIndex * stride + offset );\n			float y = floor( texelIndex / morphTargetsTextureSize.x );\n			float x = texelIndex - y * morphTargetsTextureSize.x;\n			vec3 morphUV = vec3( ( x + 0.5 ) / morphTargetsTextureSize.x, y / morphTargetsTextureSize.y, morphTargetIndex );\n			return texture( morphTargetsTexture, morphUV ).xyz;\n		}\n	#else\n		#ifndef USE_MORPHNORMALS\n			uniform float morphTargetInfluences[ 8 ];\n		#else\n			uniform float morphTargetInfluences[ 4 ];\n		#endif\n	#endif\n#endif";
THREE.ShaderChunk[ 'morphtarget_vertex' ] = "#ifdef USE_MORPHTARGETS\n	transformed *= morphTargetBaseInfluence;\n	#ifdef MORPHTARGETS_TEXTURE\n		for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {\n			#ifndef USE_MORPHNORMALS\n				transformed += getMorph( gl_VertexID, i, 0, 1 ) * morphTargetInfluences[ i ];\n			#else\n				transformed += getMorph( gl_VertexID, i, 0, 2 ) * morphTargetInfluences[ i ];\n			#endif\n		}\n	#else\n		transformed += morphTarget0 * morphTargetInfluences[ 0 ];\n		transformed += morphTarget1 * morphTargetInfluences[ 1 ];\n		transformed += morphTarget2 * morphTargetInfluences[ 2 ];\n		transformed += morphTarget3 * morphTargetInfluences[ 3 ];\n		#ifndef USE_MORPHNORMALS\n			transformed += morphTarget4 * morphTargetInfluences[ 4 ];\n			transformed += morphTarget5 * morphTargetInfluences[ 5 ];\n			transformed += morphTarget6 * morphTargetInfluences[ 6 ];\n			transformed += morphTarget7 * morphTargetInfluences[ 7 ];\n		#endif\n	#endif\n#endif";

class App {

    constructor() {
        
        this.fps = 0;
        this.elapsedTime = 0; // clock is ok but might need more time control to dinamicaly change signing speed
        this.clock = new THREE.Clock();
        this.loaderGLB = new GLTFLoader();
        
        this.scene = null;
        this.renderer = null;
        this.camera = null;
        this.controls = null;
        this.cameraMode = 0;
        
        this.controllers = {}; // store avatar controllers
        this.model = null; // current selected
        this.ECAcontroller = null; // current selected
        this.eyesTarget = null;
        this.headTarget = null;
        this.neckTarget = null;
        
        this.msg = {};
        
        this.languageDictionaries = {}; // key = NGT, value = { glosses: {}, word2ARPA: {} }
        this.selectedLanguage = "NGT";
        
        this.signingSpeed = 1;
        this.backPlane = null;
        this.avatarShirt = null;
    }

    setSigningSpeed( value ){ this.signingSpeed = value; }
    getSigningSpeed( ){ return this.signingSpeed; }

    // returns value (hex) with the colour in sRGB space
    getBackPlaneColour(){
        if ( !this.backPlane ){ return 0; }   
        return this.backPlane.material.color.getHex(); // css works in sRGB
    }
    // value (hex colour) in sRGB space 
    setBackPlaneColour( value ){
        if ( !this.backPlane ){ return false; }
        this.backPlane.material.color.set( value );   
        return true;
    }
    
    // returns value (hex) with the colour in sRGB space
    getClothesColour(){
        if ( !this.avatarShirt ){ return 0; }   
        return this.avatarShirt.material.color.getHex(); // css works in sRGB
    }
    // value (hex colour) in sRGB space 
    setClothesColour( value ){
        if ( !this.avatarShirt ){ return false; }
        this.avatarShirt.material.color.set( value );   
        return true;
    }

    // entry point of data from the mobile app. "Synchronous"
    async processMessage( data ){
        // check there is a gloss to file dictionary
        if ( !this.languageDictionaries[ this.selectedLanguage ] || !this.languageDictionaries[ this.selectedLanguage ].glosses ){ return; }

        let glosses = [];
        // received data is a json in string format
        try{
            let json = data;
            if ( typeof( data ) == "string" ){ json = JSON.parse( data ); }

            let intermediateRepresentation = json.IntermediateRepresentation;
            if ( typeof( intermediateRepresentation ) == "string" ){ intermediateRepresentation = JSON.parse( json.IntermediateRepresentation ); }
            glosses = intermediateRepresentation.glosses;
        } catch ( error ){
            glosses = [];
        }

        // check whether there is something to do
        if ( !glosses || glosses.length < 1 ){
            // TODO DEFAULT SKIPPING SIGN MESSAGE
            return;
        }

        // for each gloss, fetch its sigml file, convert it into bml
        let orders = [];
        for( let i = 0; i < glosses.length; ++i ){
            let name = glosses[i];
            if ( typeof( name ) !== "string" ){ continue; }
            orders.push( { type: "glossName", data: name.toUpperCase() } );
        }

        // give the orders to the avatar controller 
        return this.processMessageRawBlocks( orders );
    }

    /* 
    * Given an array of blocks of type { type: "bml" || "sigml" || "glossName",  data: "" } where data contains the text instructions either in bml or sigml.
    * It computes the sequential union of all blocks.
    * Provides a way to feed the app with custom bmls, sigml 
    * Returns duration of the whole array, without delayTime
    */
    async processMessageRawBlocks( glosses = [], delayTime = 0 ){
        if ( !glosses ){ return null; }

        delayTime = parseFloat( delayTime );
        delayTime = isNaN( delayTime ) ? 0 : delayTime;
        let time = delayTime;
        let orders = []; // resulting bml instructions
        let glossesDictionary = this.languageDictionaries[ this.selectedLanguage ].glosses;
        
        let peakRelaxDuration = 0;
        let relaxEndDuration = 0;
        
        for( let i = 0; i < glosses.length; ++i ){
            let gloss = glosses[i];
            
            try{ 
                // if gloss name. First fetch file, update gloss data and continue
                if ( gloss.type == "glossName" ){
                    let glossFile = glossesDictionary[ gloss.data ];
                    if ( !glossFile ){  // skipping gloss
                        gloss = { type: "invalid" };
                    }
                    else{ 
                        await fetch( "./data/dictionaries/" + this.selectedLanguage + "/Glosses/" + glossFile ).then(x=>x.text()).then( (text) =>{ 
                            let extension = glossFile.split(".");
                            extension = extension[ extension.length - 1 ];
                            gloss = { type: extension, data: text };
                        } );    
                    }
                }

                if ( gloss.type == "bml" ){ // BML
                    let result = gloss.data;
                    if( typeof( result ) == "string" ){ result = JSON.parse( result ) };
                    if ( Array.isArray( result.behaviours ) ){ result = result.behaviours; }
                    if ( !Array.isArray( result ) ){ throw true; }

                    time = time - relaxEndDuration - peakRelaxDuration; // if not last, remove relax-end and peak-relax stages
                    let maxDuration = 0;
                    let maxRelax = 0;
                    for( let b = 0; b < result.length; ++b ){
                        let bml = result[b];
                        if( !isNaN( bml.start ) ){ bml.start += time; }
                        if( !isNaN( bml.ready ) ){ bml.ready += time; }
                        if( !isNaN( bml.attackPeak ) ){ bml.attackPeak += time; }
                        if( !isNaN( bml.relax ) ){ 
                            if ( maxRelax < bml.relax ){ maxRelax = bml.relax; } 
                            bml.relax += time;  
                        }
                        if( !isNaN( bml.end ) ){ 
                            if ( maxDuration < bml.end ){ maxDuration = bml.end; } 
                            bml.end += time; 
                        }
                    }
                    orders = orders.concat( result );
                    time += maxDuration; // time up to last end

                    peakRelaxDuration = 0;
                    relaxEndDuration = maxDuration - maxRelax;
                }
                else if ( gloss.type == "sigml" ){ // SiGML
                    time = time - relaxEndDuration - peakRelaxDuration; // if not last, remove relax-end and peak-relax stages
                    let result = sigmlStringToBML( gloss.data, time );
                    orders = orders.concat(result.data);
                    time += result.duration; 
                    peakRelaxDuration = result.peakRelaxDuration;
                    relaxEndDuration = result.relaxEndDuration;
                }
                else{
                    // TODO DEFAULT SKIPPING SIGN MESSAGE
                    time += 3; continue; 
                }
            }catch(e){ console.log( "parse error: " + gloss ); time += 3; }
        }

        // give the orders to the avatar controller 
        let msg = {
            type: "behaviours",
            data: orders
        };
        this.msg = JSON.parse(JSON.stringify(msg));
        this.ECAcontroller.processMsg( msg );

        return { duration: time - delayTime, peakRelaxDuration: peakRelaxDuration, relaxEndDuration: relaxEndDuration }; // duration
    }

    // loads dictionary for mouthing purposes. Not synchronous.
    loadMouthingDictionary( language ){
        let that = this;
               
        fetch("./data/dictionaries/" + language + "/IPA/ipa.txt").then(x => x.text()).then(function(text){ 

            let texts = text.split("\n");
            let IPADict = {}; // keys: plain text word,   value: ipa transcription
            let ARPADict = {}; // keys: plain text word,   value: arpabet transcription
            
            //https://www.researchgate.net/figure/1-Phonetic-Alphabet-for-IPA-and-ARPAbet-symbols_tbl1_2865098                
            let ipaToArpa =  {
                // symbols
                "'": "", // primary stress
                '.': " ", // syllable break
                
                // vowels
                'a': "a",   'ɑ': "a",   'ɒ': "a", 
                'œ': "@",   'ɛ': "E",   'ɔ': "c",
                'e': "e",   'ø': "e",   'ə': "x",   'o': "o",  
                'ɪ': "I",   'i': "i",   'y': "i",   'u': "u",   'ʉ': "u",

                // consonants
                'x': "k",   'j': "y",   't': "t",   'p': "p",   'l': "l",   'ŋ': "G", 
                'k': "k",   'b': "b",   's': "s",   'ʒ': "Z",   'm': "m",   'n': "n", 
                'v': "v",   'r': "r",   'ɣ': "g",   'f': "f",   'ʋ': "v",   'z': "z", 
                'h': "h",   'd': "d",   'ɡ': "g",   'ʃ': "S",   'ʤ': "J"
            };
            let errorPhonemes = {};


            for(let i = 0; i < texts.length; ++i){
                let a = texts[i].replace("\t", "").split("\/");
                if (a.length < 2 || a[0].length == 0 || a[1].length == 0 ){ continue; }

                IPADict[ a[0] ] = a[1];

                let ipa = a[1];
                let arpa = "";

                // convert each IPA character into correpsonding ARPABet
                for( let j = 0; j < ipa.length; ++j ){
                    if ( ipa[j] == 'ː' || ipa[j] == ":" ) { arpa += arpa[arpa.length-1]; continue; }
                    let s = ipaToArpa[ ipa[j] ];
                    if ( s != undefined ){ arpa += s; continue; }
                    errorPhonemes[ s ];
                }

                ARPADict[ a[0] ] = arpa; 

            }

            if ( Object.keys(errorPhonemes).length > 0 ){ console.error( "MOUTHING: loading phonetics: unmapped IPA phonemes to ARPABET: \n", errorPhonemes ); }

            that.languageDictionaries[ language ].word2ARPA = ARPADict;

        });
    }

    // convert plain text into phoneme encoding ARPABet-1-letter. Uses dictionaries previously loaded 
    wordsToArpa ( phrase, language = "NGT" ){
        
        if ( !this.languageDictionaries[ language ] || !this.languageDictionaries[ language ].word2ARPA ){
            console.warn( "missing word-ARPABET dictionary for " + language );
            return "";
        }
        let word2ARPA = this.languageDictionaries[ language ].word2ARPA;
        let words = phrase.replace(",", "").replace(".", "").split(" ");

        let result = "";
        let unmappedWords = [];
        for ( let i = 0; i < words.length; ++i ){
            let r = word2ARPA[ words[i] ] ;
            if ( r ){ result += " " + r; }
            else{ unmappedWords.push( words[i]); }
        }
        if ( unmappedWords.length > 0 ){ console.error("MOUTHING: phrase: ", phrase, "\nUnknown words: ",JSON.stringify(unmappedWords)); }
        return result;
    
    }

    loadLanguageDictionaries( language ){
        this.languageDictionaries[ language ] = { glosses: null, wordsToArpa: null };

        this.loadMouthingDictionary( language );

        fetch( "./data/dictionaries/" + language + "/Glosses/_glossesDictionary.txt").then( (x)=>x.text() ).then( (file) =>{
            let glossesDictionary = this.languageDictionaries[ language ].glosses = {};
            let lines = file.split("\n");
            for( let i = 0; i < lines.length; ++i ){
                if ( !lines[i] || lines[i].length < 1 ){ continue; }
                let map = lines[i].split("\t");
                if ( map.length < 2 ){ continue; }
                glossesDictionary[ map[0] ] = map[1].replace("\r", "").replace("\n", "");
            }
        } );

    }

    changeAvatar( avatarName ) {
        if ( this.model ) this.scene.remove( this.model ); // delete from scene current model
        this.scene.add( this.controllers[avatarName].character ); // add model to scene
        this.model = this.controllers[avatarName].character;
        this.ECAcontroller = this.controllers[avatarName];
        if( this.ECAcontroller ){ this.ECAcontroller.skeleton.bones[ this.ECAcontroller.characterConfig.boneMap["ShouldersUnion"] ].getWorldPosition( this.controls.target ); }
        this.controls.update();
        if ( this.gui ){ this.gui.refresh(); }
    }

    loadAvatar( modelFilePath, configFile, modelRotation, avatarName, callback = null ) {
        this.loaderGLB.load( modelFilePath, (glb) => {
            let model = glb.scene;
            model.quaternion.premultiply( modelRotation );
            model.castShadow = true;
            
            if(avatarName == "Witch") {
                model.traverse( (object) => {
                    if ( object.isMesh || object.isSkinnedMesh ) {
                        if(!object.name.includes("Hat"))
                           object.material.side = THREE.FrontSide;
                        object.frustumCulled = false;
                        object.castShadow = true;
                        object.receiveShadow = true;
                        if (object.name == "Eyelashes") // eva
                        object.castShadow = false;
                        if(object.material.map) 
                        object.material.map.anisotropy = 16;
                        if(object.name == "Hair") {
                            object.material.map = null;
                            object.material.color.set(0x6D1881);
                        }
                        if(object.name.includes("Bottom")) {
                            object.material.map = null;
                            object.material.color.set(0x000000);
                        }
                        if(object.name.includes("Top")) {
                            object.material.map = null;
                            object.material.color.set(0x000000);
                        }
                        if(object.name.includes("Shoes")) {
                            object.material.map = null;
                            object.material.color.set(0x19A7A3);
                        }
                } else if (object.isBone) {
                    object.scale.set(1.0, 1.0, 1.0);
                    }
                } );
            }else{
                model.traverse( (object) => {
                    if ( object.isMesh || object.isSkinnedMesh ) {
                        object.material.side = THREE.FrontSide;
                        object.frustumCulled = false;
                        object.castShadow = true;
                        object.receiveShadow = true;
                        if (object.name == "Eyelashes") // eva
                        object.castShadow = false;
                        if(object.material.map) 
                        object.material.map.anisotropy = 16;
                } else if (object.isBone) {
                    object.scale.set(1.0, 1.0, 1.0);
                    }
                } );
    
                this.avatarShirt = model.getObjectByName( "Tops" );
            }

            // correct hand's size
            let b = model.getObjectByName("mixamorig_RightHand"); if ( b ){ b.scale.set( 0.85, 0.85, 0.85 ); } // eva
            b = model.getObjectByName("mixamorig_LeftHand"); if ( b ){ b.scale.set( 0.85, 0.85, 0.85 ); } // eva
                        
            // this.scene.add( new THREE.SkeletonHelper( model ) );

            model.eyesTarget = this.eyesTarget;
            model.headTarget = this.headTarget;
            model.neckTarget = this.neckTarget;
            
            model.name = avatarName;
            
            const createController = () => {
                let ECAcontroller = new CharacterController( {character: model, characterConfig: configFile} );
                ECAcontroller.start();
                ECAcontroller.reset();
                ECAcontroller.processMsg( { control: 2 } ); // speaking mode
    
                this.controllers[avatarName] = ECAcontroller;
    
                if ( callback ){ callback(); }
            }

            if (typeof (configFile) == "object") { createController(); }
            else {
                fetch( configFile ).then(response => response.text()).then( (text) =>{
                    configFile = JSON.parse( text );
                    createController();
                })
            }
        });
    }

    init() {

        this.loadLanguageDictionaries( "NGT" );
        
        this.scene = new THREE.Scene();
        let sceneColor = 0x303030;
        this.scene.background = new THREE.Color( sceneColor );
        this.scene.fog = new THREE.Fog( sceneColor, 5, 50 );

        // renderer
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );

        this.renderer.toneMapping = THREE.LinearToneMapping;
        this.renderer.toneMappingExposure = 1;
        // this.renderer.shadowMap.enabled = false;
        document.body.appendChild( this.renderer.domElement );
        
        // camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 1000);
        this.controls = new OrbitControls( this.camera, this.renderer.domElement );
        this.controls.object.position.set( Math.sin(5*Math.PI/180), 1.5, Math.cos(5*Math.PI/180) );
        this.controls.target.set(0.0, 1.3, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        
        // IBL Light
        // var that = this;

        // new RGBELoader()
        //     .setPath( 'data/hdrs/' )
        //     .load( 'cafe.hdr', function ( texture ) {

        //         texture.mapping = THREE.EquirectangularReflectionMapping;

        //         // that.scene.background = texture;
        //         that.scene.environment = texture;

        //         that.renderer.render( that.scene, that.camera );
        // } );

        // include lights
        let hemiLight = new THREE.HemisphereLight( 0xffffff, 0xffffff, 0.5 );
        this.scene.add( hemiLight );

        let keySpotlight = new THREE.SpotLight( 0xffffff, 3.5, 0, 45 * (Math.PI/180), 0.5, 2 );
        keySpotlight.position.set( 0.5, 2, 2 );
        keySpotlight.target.position.set( 0, 1, 0 );
        // keySpotlight.castShadow = true;
        // keySpotlight.shadow.mapSize.width = 1024;
        // keySpotlight.shadow.mapSize.height = 1024;
        // keySpotlight.shadow.bias = 0.00001;
        this.scene.add( keySpotlight.target );
        this.scene.add( keySpotlight );

        let fillSpotlight = new THREE.SpotLight( 0xffffff, 2.0, 0, 45 * (Math.PI/180), 0.5, 2 );
        fillSpotlight.position.set( -0.5, 2, 1.5 );
        fillSpotlight.target.position.set( 0, 1, 0 );
        // fillSpotlight.castShadow = true;
        this.scene.add( fillSpotlight.target );
        this.scene.add( fillSpotlight );

        let dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
        dirLight.position.set( 1.5, 5, 2 );
        // dirLight.shadow.mapSize.width = 1024;
        // dirLight.shadow.mapSize.height = 1024;
        // dirLight.shadow.camera.left= -1;
        // dirLight.shadow.camera.right= 1;
        // dirLight.shadow.camera.bottom= -1;
        // dirLight.shadow.camera.top= 1;
        // dirLight.shadow.bias = 0.00001;
        // dirLight.castShadow = true;
        this.scene.add( dirLight );

        // add entities
        let ground = new THREE.Mesh( new THREE.PlaneGeometry( 300, 300 ), new THREE.MeshStandardMaterial( { color: 0x4f4f4f, depthWrite: true, roughness: 1, metalness: 0 } ) );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add( ground );
        
        const texture = new THREE.TextureLoader().load( "./data/imgs/performs.png");
        let logo = new THREE.Mesh( new THREE.PlaneGeometry(1, 0.3 ), new THREE.MeshStandardMaterial( {roughness: 1, metalness: 0, map: texture,  transparent: true, side: THREE.DoubleSide, depthWrite: false } ) );
        logo.position.set(2.6,0.3, -0.95);
        logo.receiveShadow = true;
        this.scene.add( logo );
        
        let backPlane = this.backPlane = new THREE.Mesh( new THREE.PlaneGeometry( 7, 7 ), new THREE.MeshStandardMaterial( {color: window.debugMode ? 0x4f4f9c : 0x175e36, side: THREE.DoubleSide, roughness: 1, metalness: 0} ) );
        backPlane.name = 'Chroma';
        backPlane.position.z = -1;
        backPlane.receiveShadow = true;
        this.scene.add( backPlane );

        // so the screen is not black while loading
        this.changeCameraMode( false ); //moved here because it needs the backplane to exist
        this.renderer.render( this.scene, this.camera );
        
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

        let modelFilePath = './data/EvaHandsEyesFixed.glb'; let configFilePath = './data/EvaConfig.json'; let modelRotation = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), -Math.PI/2 ); 
        this.loadAvatar(modelFilePath, configFilePath, modelRotation, "Eva", ()=>{
            this.changeAvatar( "Eva" );
            if ( typeof AppGUI != "undefined" ) { this.gui = new AppGUI( this ); }
            this.animate();
            $('#loading').fadeOut(); //hide();
            if ( this.pendingMessageReceived ){
                this.ECAcontroller.reset();
                this.processMessageRawBlocks( data );  
                delete this.pendingMessageReceived; 
            }
        });
        
        window.addEventListener( 'resize', this.onWindowResize.bind(this) );

        window.addEventListener( "message", (event) => {         
                let data = event.data;
                
                if ( typeof( data ) == "string" ){ 
                    try{ 
                        data =  JSON.parse( data ); 
                    }catch( e ){ console.error("Error while parsing an external message: ", event ); };
                }
                
                if ( !Array.isArray(data) ){ return; }
                
                if ( !this.ECAcontroller ){ this.pendingMessageReceived = event.data; return; }
                this.ECAcontroller.reset();
                this.processMessageRawBlocks( data ).then(()=>{ 
                    if ( !this.msg || !this.msg.data || !this.gui ){ return; }

                    this.gui.setBMLInputText( 
                        JSON.stringify(this.msg.data, function(key, val) {
                            return val.toFixed ? Number(val.toFixed(3)) : val;
                        }) 
                    );
                } );          
          

            },
            false,
        );


    }

    animate() {

        requestAnimationFrame( this.animate.bind(this) );

        let delta = this.clock.getDelta() 
        this.fps = Math.floor( 1.0 / ((delta>0)?delta:1000000) );
        
        delta *= this.signingSpeed;
        this.elapsedTime += delta;
        if ( this.ECAcontroller ) { this.ECAcontroller.update(delta, this.elapsedTime ); }

        this.renderer.render( this.scene, this.camera );
    }
    
    onWindowResize() {

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize( window.innerWidth, window.innerHeight );
    }

    toggleCameraMode(){ this.changeCameraMode( !this.cameraMode ); }
    changeCameraMode( mode ) {

        if ( mode ) {
            this.controls.enablePan = true;
            this.controls.minDistance = 0.1;
            this.controls.maxDistance = 10;
            this.controls.minAzimuthAngle = THREE.Infinity;
            this.controls.maxAzimuthAngle = THREE.Infinity;
            this.controls.minPolarAngle = 0.0;
            this.controls.maxPolarAngle = Math.PI;     
            this.setBackPlaneColour( 0x4f4f9c );
        } else {
            this.controls.enablePan = false;
            this.controls.minDistance = 0.7;
            this.controls.maxDistance = 2;
            this.controls.minAzimuthAngle = -2;
            this.controls.maxAzimuthAngle = 2;
            this.controls.minPolarAngle = 0.6;
            this.controls.maxPolarAngle = 2.1;
            this.setBackPlaneColour( 0x175e36 );
            if( this.ECAcontroller ){ this.ECAcontroller.skeleton.bones[ this.ECAcontroller.characterConfig.boneMap["ShouldersUnion"] ].getWorldPosition( this.controls.target ); }
        }
        this.controls.update();
        this.cameraMode = mode; 
    }

}


let app = new App();
app.init();
window.global = {app:app};

export { app} 