import * as THREE from 'three'

class BlendshapesManager {

    constructor(skinnedMeshes = {}, morphTargetDictionary, mapNames ) {

        this.mapNames = mapNames;
        this.skinnedMeshes = skinnedMeshes;
        this.morphTargetDictionary = morphTargetDictionary;
        
    }
    
    // Create THREEJS morph target animation given mediapipe data
    createThreejsAnimation (data, applyRotation = false) {

        let clipData = {};
        let times = [];
        if(!data) {
            let names = {}
            for(let area in this.mapNames.parts) {
                this.mapNames.parts[area].map(x => names[x] = 0);
                //names[name] = 0;
            }
            names.dt = 0;
            data = [names];
        }

        let isFirst = true;

        for ( let au in this.mapNames.mediapipeMap ) {
            for ( let idx = 0; idx < data.length; idx++ ) {
                const dt = data[idx].dt * 0.001;
                const weights = data[idx];
                if( isFirst ) {
                    if( times.length ){
                        times.push(times[idx-1] + dt);
                    }
                    else {
                        times.push(dt);
                    }
                }

                const map = this.mapNames.mediapipeMap[au];
                for( let i = 0; i < map.length; i++ ) {
                    const bs = map[i][0];
                    const  value = weights[bs] || 0;
                    if( !clipData[au] ) {
                        clipData[au] = [];
                        clipData[au].length = data.length;
                        clipData[au].fill(0);
                    }
                    
                    clipData[au][idx] = Math.max(clipData[au][idx], value* map[i][1] );
                }
            }
            isFirst = false;
        }

        if(applyRotation) {
            for (let idx = 0; idx < data.length; idx++) {
                if(!clipData["mixamorig_LeftEye"])
                {
                    clipData["mixamorig_LeftEye"] = [];
                    clipData["mixamorig_LeftEye"].length = data.length;
                    clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));
                }
                if(!clipData["mixamorig_Head"])
                {
                    clipData["mixamorig_Head"] = [];
                    clipData["mixamorig_Head"].length = data.length;
                    clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));
                }

                clipData["mixamorig_LeftEye"][idx].x = data[idx]["LeftEyePitch"];
                clipData["mixamorig_LeftEye"][idx].y = data[idx]["LeftEyeYaw"];

                clipData["mixamorig_RightEye"][idx].x = data[idx]["RightEyePitch"];
                clipData["mixamorig_RightEye"][idx].y = data[idx]["RightEyeYaw"];

                data[idx]["HeadPitch"];
                data[idx]["HeadRoll"];
                data[idx]["HeadYaw"];

                clipData["mixamorig_Head"][idx].x = data[idx]["HeadPitch"];
                clipData["mixamorig_Head"][idx].y = data[idx]["HeadYaw"];
                clipData["mixamorig_Head"][idx].z = data[idx]["HeadRoll"];
            }
        }


        const bsTracks = [];
        const auTracks = [];
        const done = {};
        for(let au in clipData)
        {

            if(typeof(clipData[au][0]) == 'object' )
            {
                let animData = []; 
                clipData[au].map((x) => {
                    let q = new THREE.Quaternion().setFromEuler(x);
                    animData.push(q.x);
                    animData.push(q.y);
                    animData.push(q.z);
                    animData.push(q.w);
                }, animData)
                bsTracks.push( new THREE.QuaternionKeyframeTrack(au + '.quaternion', times, data ));
            }
            else
            {
                
                for(let mesh in this.skinnedMeshes)
                {
                    let bs = this.mapNames.characterMap[au];
                    for(let i = 0; i < bs.length; i++) {
                        
                        const mtIdx = this.morphTargetDictionary[mesh][bs[i][0]];
                        if( mtIdx > -1 ) {
                            const trackName = this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ bs[i][0] + ']';
                            if(done[trackName] != undefined) {
                                for( let j = 0; j < bsTracks[done[trackName]].values.length; j++) {
                                    bsTracks[done[trackName]].values[j] += clipData[au][j] * bs[i][1];
                                }
                            }
                            else {
                                bsTracks.push( new THREE.NumberKeyframeTrack( trackName, times, clipData[au].map( v => v*bs[i][1] ) ) );
                                done[trackName] = bsTracks.length - 1;
                            }
                        }

                    }
                }
                const newName = this.getFormattedTrackName(au);
                if(!newName) {
                    continue;
                }
                auTracks.push( new THREE.NumberKeyframeTrack( newName, times, clipData[au] ) );
            }
        }    

        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;

        const bsAnimation = new THREE.AnimationClip( "threejsAnimation", length, bsTracks);
        const auAnimation = new THREE.AnimationClip( "threejsAnimation", length, auTracks);
        return {bsAnimation, auAnimation};
    }


    // Convert THREEJS morph target animation into AU names format
    createAUAnimation(animation, map = this.mapNames.characterMap) {
        const auTracks = [];
        const trackNames = [];

        // Extract time and values of each track
        for (let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            const {propertyIndex, propertyName, nodeName} = THREE.PropertyBinding.parseTrackName( track.name );
            // Check that it's a morph target
            if (propertyName =='morphTargetInfluences') {
                if( nodeName.includes( "Body" ) ) {
                    animation.tracks[i].name = animation.tracks[i].name.replace("Body.", "BodyMesh.");
                }
                else if( nodeName.includes( "Head" ) ) {

                }
                else {
                    continue;
                }

                const times = track.times;
                const values = track.values;
                
                // Search the AU mapped to this morph target
                for ( let actionUnit in map ) {
                    const mappedMorphs = map[actionUnit];
                    
                    // If the morph target is mapped to the AU, assign the weight
                    if ( Array.isArray(mappedMorphs) ) {
                        for(let j = 0; j < mappedMorphs.length; j++) {
                            if ( mappedMorphs[j].includes(propertyIndex) ) {
                                
                                const newName = this.getFormattedTrackName(actionUnit);
                                if(!newName) {
                                    continue;
                                }
                                const id = trackNames.indexOf( newName ) ;
                                if(id > -1) {
                                    auTracks[id].data.blendshapes.push(propertyIndex);
                                    continue;
                                }
                                trackNames.push(newName);
                                const newTrack = new THREE.NumberKeyframeTrack( newName, times, values.map(v => v * mappedMorphs[j][1]) );
                                newTrack.data = { blendshapes: [propertyIndex] };
                                auTracks.push( newTrack );
                                break;
                            }
                        }
                    } else if (mappedMorphs === propertyIndex) {

                        const newName = this.getFormattedTrackName(actionUnit);
                        if(!newName) {
                            continue;
                        }
                        const id = trackNames.indexOf( newName ) ;
                        if(id > -1) {
                            auTracks[id].data.blendshapes.push(propertyIndex);
                            continue;
                        }
                        trackNames.push(newName);
                        const newTrack = new THREE.NumberKeyframeTrack( newName, times, values );
                        newTrack.data = { blendshapes: [propertyIndex] };
                        auTracks.push( newTrack );
                        break;
                    }
                }
            }
        }

        const length = -1;

        return new THREE.AnimationClip( animation.name ?? "auAnimation", length, auTracks);
    }

    // Format morph target track name into "FaceArea.MediapipeAcitionUnit"
    getFormattedTrackName(name) {
        
        let bs = "";
        for( let part in this.mapNames.parts )
        {
            if( this.mapNames.parts[part].includes(name) )
            {
                bs = part + "." + name;
                return bs;
            }

        }
        return name;
    }

    getBlendshapesMap(name) {
        let map = this.mapNames[name];
        if(!map) return [];
        let bs = [];
        if(typeof map == 'string') {
            map = [map];
        }
    
        for(let mesh in this.skinnedMeshes) {

            for(let i = 0; i < map.length; i++) {
                bs.push(this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ map[i] + ']');
            }
        }
        return bs;
    }

    createEmptyAnimation(name) {
        const tracks = [];
        for(let mesh in this.morphTargetDictionary) {
            const morphTargets = this.morphTargetDictionary[mesh];
           for(let morphTarget in morphTargets) {            
                tracks.push( new THREE.NumberKeyframeTrack(mesh + '.morphTargetInfluences['+ morphTarget + ']', [0], [0] ));
           }
        }

        const length = -1;
        return new THREE.AnimationClip( name ?? "bsAnimation", length, tracks);
    }

    createEmptyAUAnimation(name) {
        let names = {}
        for(let area in this.mapNames.parts) {
            this.mapNames.parts[area].map(x => names[x] = 0);
            //names[name] = 0;
        }
        names.dt = 0;
        let data = [names];
        return this.createAnimationFromActionUnits(name, data);
    }

    createAnimationFromActionUnits(name, data) {

        let times = [];
        let auValues = {};
        
        if(!data) {
            let names = {}
            for(let name in this.mapNames) {
                names[name] = 0;
            }
            names.dt = 0;
            data = [names];
        }
    
        for (let idx = 0; idx < data.length; idx++) {
            
            let dt = data[idx].dt * 0.001;
            let weights = data[idx];
    
            if(times.length)
                times.push(times[idx-1] + dt);
            else
                times.push(dt);
                
            for(let i in weights)
            {
                var value = weights[i];
                if(!auValues[i])
                    auValues[i] = [value];
                else
                    auValues[i].push(value);
            }
        }
       
        let auTracks = [];
        for(let bs in auValues) {
            let bsname = this.getFormattedTrackName(bs);
            if ( bsname.length ){
                auTracks.push( new THREE.NumberKeyframeTrack(bsname, times, auValues[bs] ));
            }
        }
    
        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;
    
        let auAnimation = new THREE.AnimationClip( name ?? "auAnimation", length, auTracks);
        return auAnimation;
    }
 
    /**
     * Creates ThreeJS animationClip with morphTargetInfluences ( "mesh.morphTargetInfluences[bs]" ) for all mapped meshes, from action units ( "au" ) 
     * WARNING !! Assumes all input tracks are AU and have the SAME amount of keyframes, each in the SAME TIMESTAMP
     * @param {ThreeJs AnimationClip} animation action unit ("au")
     * @returns {ThreeJs AnimationClip} morph target animation ("mesh.morphTargetInfluences[bs]")
     */
    createMorphTargetsAnimationFromAU ( animation ) {

        const bsTracks = [];
        const done = {};
        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            for(let mesh in this.skinnedMeshes){
                let bs = this.mapNames.characterMap[track.id ?? track.name];
                if ( !bs ){ continue; }

                for(let i = 0; i < bs.length; i++) {
                    
                    const mtIdx = this.morphTargetDictionary[mesh][bs[i][0]];
                    if( mtIdx > -1 ) {
                        const trackName = this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ bs[i][0] + ']';
                        if(done[trackName] != undefined) {
                            for( let j = 0; j < bsTracks[done[trackName]].values.length; j++) {
                                bsTracks[done[trackName]].values[j] += track.values[j] * bs[i][1];
                            }
                        }
                        else {
                            bsTracks.push( new THREE.NumberKeyframeTrack( trackName, track.times, track.values.map( v => v*bs[i][1] ) ) );
                            done[trackName] = bsTracks.length - 1;
                        }
                    }

                }
            }          
        }
        
        const bsAnimation = new THREE.AnimationClip( "threejsAnimation", -1, bsTracks); // duration == -1 so it is automatically computed from the array of tracks
        return bsAnimation;
    }

     /**
     * Creates ThreeJS animationClip with blendshapes ( "bs" ) from morph target ("mesh.morphTargetInfluences[bs]") 
     * WRNING !! If several meshes contain the same MT, the first instance will be used
     * NOTE: Blendshape tracks will contain a data attribute mapping each blendshape to the source MT tracks
     * @param {ThreeJs AnimationClip} animation morph target animation ("mesh.morphTargetInfluences[bs]")
     * @returns {ThreeJs AnimationClip} blendshape animation ("bs"). All tracks have an additional "data" attribute with { skinnedMeshes, tracksIds }, mapping to the meshes names and the track idx inside the source morphTarget animation
     */
    createBlendshapesAnimationFromMorphTargets( animation ) {

        const tracks = [];
        const allMorphTargetDictionary = {};       

        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            
           const { propertyIndex, nodeName } = THREE.PropertyBinding.parseTrackName( track.name );
           
           if(allMorphTargetDictionary[propertyIndex]) {
               allMorphTargetDictionary[propertyIndex].skinnedMeshes.push(nodeName);
               allMorphTargetDictionary[propertyIndex].tracksIds.push(i);
               continue;
            }
            else {
                allMorphTargetDictionary[propertyIndex] = { skinnedMeshes: [nodeName], tracksIds: [i] };
                const newTrack = new THREE.NumberKeyframeTrack( propertyIndex, track.times.slice(), track.values.slice());
                newTrack.data = allMorphTargetDictionary[propertyIndex];
                tracks.push(newTrack);
            }
        }
        
        let bsAnimation = new THREE.AnimationClip( "bsAnimation", animation.duration ?? -1, tracks);
        return bsAnimation;
    }

    /**
     * Creates ThreeJS animationClip with blendshapes ( "bs" ) from action units ( "au" ). No meshes involved 
     * WARNING !! Assumes all input tracks are AU and have the SAME amount of keyframes, each in the SAME TIMESTAMP
     * @param {ThreeJs AnimationClip} auAnimation Action Unit animation ("au") 
     * @returns {ThreeJs AnimationClip} blendshape animation ("bs")
     */
    createBlendshapesAnimationFromAU ( auAnimation ) {

        const bsTracks = [];
        const done = {};
        for(let i = 0; i < auAnimation.tracks.length; i++) {
            const track = auAnimation.tracks[i];
            
            let bs = this.mapNames.characterMap[track.id ?? track.name];
            if( !bs ){ continue;}

            for(let i = 0; i < bs.length; i++) {
                const trackName = bs[i][0];

                // blendshape might be used by different action units
                if(done[trackName]){
                    const bst = bsTracks[done[trackName]];
                    for( let j = 0; j < bst.values.length; j++) {
                        bst.values[j] += track.values[j] * bs[i][1];
                    }
                }
                else {
                    bsTracks.push( new THREE.NumberKeyframeTrack( trackName, track.times.slice(), track.values.slice().map( v => v*bs[i][1] ) ) );
                    done[trackName] = bsTracks.length - 1;
                }
            }          
        }
        
        const bsAnimation = new THREE.AnimationClip( "bsAnimation", auAnimation.duration ?? -1, bsTracks);
        return bsAnimation;
    }

    /**
     * Creates ThreeJS animationClip with morphTargetInfluences ( "mesh.morphTargetInfluences[bs]" ) for all mapped meshes, from a blendshape animation ( "bs" )
     * Assumes all input tracks are AU and have the same amount of keyframes, each in the same timestamp
     *
     * @param {ThreeJs AnimationClip} animation blendshape animation ("bs") 
     * @returns {ThreeJs AnimationClip} morph target animation ("mesh.morphTargetInfluences[bs]")
     */ 
    createMorphTargetsAnimationFromBlendshapes ( animation ) {

        const bsTracks = [];
        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            const bsName = track.name ?? track.id;
            for(let mesh in this.skinnedMeshes) {
                if ( this.morphTargetDictionary[mesh][bsName] != undefined ){
                    const trackName = this.skinnedMeshes[mesh].name +'.morphTargetInfluences['+ bsName + ']';
                    bsTracks.push( new THREE.NumberKeyframeTrack( trackName, track.times.slice(), track.values.slice() ) );
                }
            }          
        }
        
        const bsAnimation = new THREE.AnimationClip( "morphtTargetAnimation", animation.duration ?? -1, bsTracks); // duration == -1 so it is automatically computed from the array of tracks
        return bsAnimation;
    }

    /**
     * Merge tracksToReplace tracks into targetAnimation. 
     * Matching blendshapes will be replaced by tracksToReplace
     * Unmatched blendshapes will be added to the animation
     *  
     * @param {ThreeJs AnimationClip} targetBsAnimation blendshapes animation "bs" 
     * @param {ThreeJs AnimationClip} tracksToReplace blendshapes ("bs") or morph targets ("mesh.morphTargetInfluences[bs]") animation
     * @param {object or null} options 
     *      - options.parseAsThreejsNamesNewTracks: whether to parse new tracks' name (MT) or not (BS). Default false
     *      - options.duplicateTracksToReplace: whether to duplicate arrays when replacing (or adding). Default true
     * @returns 
     */
    mergeTracksToBlendshapeToAnimation( targetBsAnimation, tracksToReplace, options = {} ){
        const parseAsThreejsNamesNewTracks = options.parseAsThreejsNamesNewTracks ?? false;
        const duplicate = options.duplicateTracksToReplace ?? true;

        let mappedBlendshapes = {};
        const newTracks = tracksToReplace.tracks;
        const targTracks = targetBsAnimation.tracks;
        const numTargTracks = targTracks.length; // original size, before any track push. Used to avoid checking pushed tracks
        for( let i = 0; i < newTracks.length; ++i){
            let blendshapeName = newTracks[i].name ?? newTracks[i].id;
            if ( parseAsThreejsNamesNewTracks ){
                blendshapeName = THREE.PropertyBinding.parseTrackName( blendshapeName ).propertyIndex;
            }

            // check if already done
            if ( mappedBlendshapes[blendshapeName] ){
                continue;
            }

            // check new tracks' blendshape exists in character 
            for ( let mesh in this.morphTargets ){
                if ( this.morphTargets[mesh][blendshapeName] == undefined ){ // track blendshape exists in the target character
                    blendshapeName = null;
                    break;
                }
            }
            if ( !blendshapeName ){ 
                continue; 
            }

            // find new blendshape in targetAnimations and replace arrays. Otherwise, create a new track
            const times = duplicate ? newTracks[i].times.slice() : newTracks[i].times;
            const values = duplicate ? newTracks[i].values.slice() : newTracks[i].values;

            let t = 0;
            for( t = 0; t < numTargTracks; ++t ){
                if ( (targTracks[t].name ?? targTracks[t].id) == blendshapeName ){
                    targTracks[t].times = times;
                    targTracks[t].values = values;
                    break;
                }
            }
            if ( t == targTracks.length ){ // no match was found. Simply add it to the animation
                targTracks.push( new THREE.NumberKeyframeTrack( blendshapeName, times, values ) );
            }

            mappedBlendshapes[blendshapeName] = targTracks[t];
        }

        return;
    }


    /* 
    */
   
    /**
      * Creates a ThreeJs.AnimationClip with AUs from blendshapes/morph targets. 
      * NOTE: The resulting tracks of the AU animation will have the same timestamps (each with their values) 
      * @param {ThreeJs AnimationClip} faceAnimation clip where tracks are of blendshapes ("bs") or morph targets ("mesh.morphTargetInfluences[bs]")
      * @param {Object} sourceMapping maps AU to blendshapes and their factors:  "AU" : [ ["bs1", 0.4], ["bs2", 0.1] ]
      * @param {Boolean} parseTrackNamesAsThreejs whether to parse track names or not
      * @returns 
      */
    static createAUAnimationFromBlendshapes( faceAnimation, sourceMapping, parseTrackNamesAsThreejs = true ){

        const tracks = faceAnimation.tracks;

        // get all blendshapes from animation. For a given blendshape, all meshes will follow the first track encountered. 
        let animBlendshapes = {};
        for( let i = 0; i < tracks.length; ++i){
            let blendshapeName = tracks[i].name ?? tracks[i].id;
            if ( parseTrackNamesAsThreejs ){
                blendshapeName = THREE.PropertyBinding.parseTrackName( blendshapeName ).propertyIndex;
            }

            if ( !animBlendshapes[blendshapeName] && tracks[i].times.length ){
                animBlendshapes[blendshapeName] = tracks[i];
            }
        }


        // match blendshapes from animation to the action units of the mapping. Not all blendshapes from an AU might exist
        let bsarray = []; // array of names of blendsapes that need to be taken into account for AU computations.
        let svdMappedAUs = []; // which action units need to be taken into account.
        for ( let actionUnit in sourceMapping ) {
            const mappedMorphs = sourceMapping[actionUnit];
            
            let mapped = false;
            for(let j = 0; j < mappedMorphs.length; j++) {
                const bsName = mappedMorphs[j][0];
                if (!animBlendshapes[bsName]){ // blendshape from AU does not exist in the animation
                    continue;
                }
                mapped = true;

                let idx = bsarray.indexOf( bsName ); // add blendshape to list only if it has not been added before
                if ( idx == -1 ){ 
                    bsarray.push( bsName );
                }
            }

            if ( mapped ){ // at least 1 blendshape was added 
                svdMappedAUs.push( actionUnit ); 
            }
        }

        /* Now we need to solve the Ax=b problem.
            A = [rows, cols] = [blendshapesMapped, AUs]
            x = AU weights
            b = blendshape weights
           SVD will be used to invert A.
        */

        // prepare matrix
        let matrix = [];
        // for each action unit mapped
        for ( let i = 0; i < svdMappedAUs.length; ++i ) {
            let arr = new Float32Array(bsarray.length);
            arr.fill( 0 );

            // for each blendshape in AU, set its factor
            const auBlendshapes = sourceMapping[ svdMappedAUs[i] ];
            for(let j = 0; j < auBlendshapes.length; j++) {
                let idx = bsarray.indexOf( auBlendshapes[j][0] );
                if (idx != -1){ arr[idx] = auBlendshapes[j][1]; }
            }

            matrix.push( arr );
        }

        // ml-matrix library
        // https://mljs.github.io/matrix/classes/Matrix.html#set
        // https://stackoverflow.com/questions/57175722/is-there-a-javascript-equivalent-to-numpy-linalg-pinv

        let m = new mlMatrix.Matrix( matrix ); // memory layout assumes array of ROWs
        m = m.transpose(); // transform to columns
        m = mlMatrix.inverse(m, true); // svd inverse

        let timeIndices = bsarray.slice();
        timeIndices.fill(0);
        
        let AUtimes = [];
        let AUvalues = [];

        let areAllLastTime = false;
        let currTime = 0;

        let bsoutput = new mlMatrix.Matrix( bsarray.length, 1 ); // column vector
        while( !areAllLastTime ){
            areAllLastTime = true;

            let nextTime = currTime;
            for( let t = 0; t < timeIndices.length; t++ ){
                const times = animBlendshapes[ bsarray[t] ].times;
                const values = animBlendshapes[ bsarray[t] ].values;
                
                let timeIdx = timeIndices[t];
                while( currTime >= times[timeIdx] && timeIdx < (times.length-1) ){
                    timeIdx++;
                }
                areAllLastTime &= timeIdx == (times.length-1);
                nextTime = Math.max( currTime, times[timeIdx]);

                timeIndices[t] = timeIdx;

                let f = timeIdx == 0 ? 1 : ( (currTime-times[timeIdx-1]) / (times[timeIdx]-times[timeIdx-1]) );
                let v = timeIdx == 0 ? values[timeIdx] : (values[timeIdx]*f + values[timeIdx-1] * (1-f));

                bsoutput.data[t][0] = v;
            }

            // infer AU values from blendshape values Ax=b
            AUvalues.push(m.mmul( bsoutput ));
            AUtimes.push( currTime );
            currTime = nextTime;
        }

        // build animation
        let resultTracks = [];
		for( let i = 0; i < svdMappedAUs.length; ++i ){
			let values = new Float32Array(AUtimes.length);

			for( let t = 0;  t < AUtimes.length; ++t){
				values[t] = AUvalues[t].data[i][0];
			}

			const tr = new THREE.NumberKeyframeTrack( svdMappedAUs[i], AUtimes.slice(), values);
			resultTracks.push(tr);
		}

        return new THREE.AnimationClip( "auAnimation", -1, resultTracks); // duration == -1 so it is automatically computed from the array of tracks
    }
}



BlendshapesManager.faceAreas =  [
    "Nose", 
    "Brow Right",
    "Brow Left",
    "Eye Right",
    "Eye Left",
    "Cheek Right",
    "Cheek Left",
    "Jaw",
    "Mouth"
]

export{ BlendshapesManager }