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

        // for (let idx = 0; idx < data.length; idx++) {
        //     let dt = data[idx].dt * 0.001;
        //     let weights = data[idx];

        //     if(times.length)
        //         times.push(times[idx-1] + dt);
        //     else
        //         times.push(dt);
                
        //     for(let i in weights)
        //     {
        //         var value = weights[i];
        //         let map = this.mapNames.mediapipeMap[i];

        //         if(map == null) 
        //         {
        //             if(!applyRotation) 
        //                 continue;

        //             let axis = i.split("Yaw");
        //             if(axis.length > 1)
        //             {
        //                 switch(axis[0]){
        //                     case "LeftEye":
        //                         if(!clipData["mixamorig_LeftEye"])
        //                         {
        //                             clipData["mixamorig_LeftEye"] = [];
        //                             clipData["mixamorig_LeftEye"].length = data.length;
        //                             clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                             clipData["mixamorig_LeftEye"][idx].y = value;
        //                     break;
        //                     case "RightEye":
        //                         if(!clipData["mixamorig_RightEye"])
        //                         {
        //                             clipData["mixamorig_RightEye"] = [];
        //                             clipData["mixamorig_RightEye"].length = data.length;
        //                             clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_RightEye"][idx].y = value;
        //                     break;
        //                     case "Head":
        //                         if(!clipData["mixamorig_Head"])
        //                         {
        //                             clipData["mixamorig_Head"] = [];
        //                             clipData["mixamorig_Head"].length = data.length;
        //                             clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_Head"][idx].y = value;
        //                     break;
        //                 }
        //                 continue;
        //             }
        //             axis = i.split("Pitch");
        //             if(axis.length > 1)
        //             {
        //                 switch(axis[0]){
        //                     case "LeftEye":
        //                         if(!clipData["mixamorig_LeftEye"])
        //                         {
        //                             clipData["mixamorig_LeftEye"] = [];
        //                             clipData["mixamorig_LeftEye"].length = data.length;
        //                             clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_LeftEye"][idx].x = value;
        //                     break;
        //                     case "RightEye":
        //                         if(!clipData["mixamorig_RightEye"])
        //                         {
        //                             clipData["mixamorig_RightEye"] = [];
        //                             clipData["mixamorig_RightEye"].length = data.length;
        //                             clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_RightEye"][idx].x = value;
        //                     break;
        //                     case "Head":
        //                         if(!clipData["mixamorig_Head"])
        //                         {
        //                             clipData["mixamorig_Head"] = [];
        //                             clipData["mixamorig_Head"].length = data.length;
        //                             clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_Head"][idx].x = value;
        //                     break;
        //                 }
        //                 continue;
        //             }
        //             axis = i.split("Roll");
        //             if(axis.length > 1)
        //             {
        //                 switch(axis[0]){
        //                     case "LeftEye":
        //                         if(!clipData["mixamorig_LeftEye"])
        //                         {
        //                             clipData["mixamorig_LeftEye"] = [];
        //                             clipData["mixamorig_LeftEye"].length = data.length;
        //                             clipData["mixamorig_LeftEye"] = clipData["mixamorig_LeftEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_LeftEye"][idx].z = value;
        //                     break;

        //                     case "RightEye":
        //                         if(!clipData["mixamorig_RightEye"])
        //                         {
        //                             clipData["mixamorig_RightEye"] = [];
        //                             clipData["mixamorig_RightEye"].length = data.length;
        //                             clipData["mixamorig_RightEye"] = clipData["mixamorig_RightEye"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_RightEye"][idx].z = -value;
        //                     break;

        //                     case "Head":
        //                         if(!clipData["mixamorig_Head"])
        //                         {
        //                             clipData["mixamorig_Head"] = [];
        //                             clipData["mixamorig_Head"].length = data.length;
        //                             clipData["mixamorig_Head"] = clipData["mixamorig_Head"].fill(null).map(() => new THREE.Euler( 0, 0, 0, 'XYZ' ));

        //                         }
        //                         clipData["mixamorig_Head"][idx].z = value;
        //                     break;
        //                 }
        //                 continue;
        //             }
        //             else
        //                 continue;
        //         }
        //         else if (typeof(map) == 'string'){
        //             if(!clipData[map])
        //             {
        //                 clipData[map] = [];
        //                 clipData[map].length = data.length;
        //                 clipData[map].fill(0);
        //             }
        //             if(map.includes("Blink"))
        //                 value*=0.75;
        //             clipData[map][idx] = Math.max(clipData[map][idx], value );
        //         }
        //         else if( typeof(map) == 'object'){
        //             for(let j = 0; j < map.length; j++){
        //                 if(!clipData[map[j]])
        //                 {
        //                     clipData[map[j]] = [];
        //                     clipData[map[j]].length = data.length;
        //                     clipData[map[j]].fill(0);
        //                 }
        //                 if(map[j].includes("Blink"))
        //                     value*=0.75;
        //                 clipData[map[j]][idx] = Math.max(clipData[map[j]][idx], value );; 
        //             }
        //         }
        //     }
        // }

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

    createBlendshapesAnimation( animation ) {

        const tracks = [];
        const allMorphTargetDictionary = {};       

        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            
           const { propertyIndex, nodeName } = THREE.PropertyBinding.parseTrackName( track.name );
           const newTrack = new THREE.NumberKeyframeTrack( propertyIndex, track.times, track.values);
           
           if(allMorphTargetDictionary[propertyIndex]) {
               allMorphTargetDictionary[propertyIndex].skinnedMeshes.push(nodeName);
               allMorphTargetDictionary[propertyIndex].tracksIds.push(i);
               continue;
            }
            else {
                allMorphTargetDictionary[propertyIndex] = { skinnedMeshes: [nodeName], tracksIds: [i] };
                newTrack.data = allMorphTargetDictionary[propertyIndex];
            }
            tracks.push(newTrack);
        }
        
        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;

        let bsAnimation = new THREE.AnimationClip( "bsAnimation", length, tracks);
        return bsAnimation;
    }

    // Convert THREEJS morph target animation into Mediapipe names format
    // createMediapipeAnimation(animation) {
    //     const auTracks = [];
    //     const trackNames = [];

    //     // Extract time and values of each track
    //     for (let i = 0; i < animation.tracks.length; i++) {
    //         const track = animation.tracks[i];
    //         const {propertyIndex, propertyName, nodeName} = THREE.PropertyBinding.parseTrackName( track.name );
    //         // Check that it's a morph target
    //         if (propertyName =='morphTargetInfluences') {
    //             if( nodeName.includes( "Body" )) {
    //                 animation.tracks[i].name = animation.tracks[i].name.replace("Body.", "BodyMesh.");
    //             }
    //             else {
    //                 continue;
    //             }

    //             const times = track.times;
    //             const values = track.values;

    //             // Search the AU mapped to this morph target
    //             for ( let actionUnit in this.mapNames ) {
    //                 const mappedMorphs = this.mapNames[actionUnit];
                    
    //                 // If the morph target is mapped to the AU, assign the weight
    //                 if ( Array.isArray(mappedMorphs) ) {
    //                     if ( mappedMorphs.includes(propertyIndex) ) {
                            
    //                         const newName = this.getFormattedTrackName(actionUnit);
    //                         if(!newName) {
    //                             continue;
    //                         }
    //                         const id = trackNames.indexOf( newName ) ;
    //                         if(id > -1) {
    //                             auTracks[id].data.blendshapes.push(propertyIndex);
    //                             continue;
    //                         }
    //                         trackNames.push(newName);
    //                         const newTrack = new THREE.NumberKeyframeTrack( newName, times, values );
    //                         newTrack.data = { blendshapes: [propertyIndex] };
    //                         auTracks.push( newTrack );
    //                         break;
    //                     }
    //                 } else if (mappedMorphs === propertyIndex) {

    //                     const newName = this.getFormattedTrackName(actionUnit);
    //                     if(!newName) {
    //                         continue;
    //                     }
    //                     const id = trackNames.indexOf( newName ) ;
    //                     if(id > -1) {
    //                         auTracks[id].data.blendshapes.push(propertyIndex);
    //                         continue;
    //                     }
    //                     trackNames.push(newName);
    //                     const newTrack = new THREE.NumberKeyframeTrack( newName, times, values );
    //                     newTrack.data = { blendshapes: [propertyIndex] };
    //                     auTracks.push( newTrack );
    //                     break;
    //                 }
    //             }
    //         }
    //     }

    //     const length = -1;

    //     return new THREE.AnimationClip( animation.name ?? "auAnimation", length, auTracks);
    // }

     // Convert THREEJS morph target animation into AU names format
    createAUAnimation(animation) {
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
                for ( let actionUnit in this.mapNames.characterMap ) {
                    const mappedMorphs = this.mapNames.characterMap[actionUnit];
                    
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

    createBlendshapesAnimationFromAU ( animation ) {

        const bsTracks = [];
        const done = {};
        const times = animation.tracks[0].times;
        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];
            for(let mesh in this.skinnedMeshes)
                {
                    let bs = this.mapNames.characterMap[track.id];
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
                                bsTracks.push( new THREE.NumberKeyframeTrack( trackName, times, track.values.map( v => v*bs[i][1] ) ) );
                                done[trackName] = bsTracks.length - 1;
                            }
                        }

                    }
                }
                const newName = this.getFormattedTrackName(track.id);
                if(!newName) {
                    continue;
                }
          
        }
        
        // use -1 to automatically calculate
        // the length from the array of tracks
        const length = -1;

        const bsAnimation = new THREE.AnimationClip( "threejsAnimation", length, bsTracks);
        return bsAnimation;
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